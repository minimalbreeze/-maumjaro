#!/usr/bin/env node
// 파이프라인 전체 실행.
//
//   npm run news -- --dry-run                    저장 없이 결과만 확인
//   npm run news -- --topic="JLPGA" --dry-run    한 종목만
//   npm run news -- --topic="JLPGA" --draft      워드프레스에 임시글 저장
//
// 안전 규칙: --draft 플래그가 없으면 저장 단계 자체가 실행되지 않는다.
// 기본값은 "저장 안 함"이다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, env } from './utils/env.mjs';
import { log, logHeader } from './utils/logger.mjs';
import { settleAll } from './utils/retry.mjs';

import { fetchFeed, parseFeed, buildQueryUrl, filterRecent, dedupeItems } from './news/fetch-rss.mjs';
import { clusterArticles, splitBySourceCount } from './news/normalize.mjs';
import { rankClusters } from './news/rank.mjs';

import { findRelatedPosts, judgeDuplication, VERDICT_LABEL } from './duplicate/check.mjs';
import { loadSiteCategories, resolveCategory, resolveTagIds } from './wordpress/taxonomy.mjs';
import { saveDraft } from './wordpress/draft.mjs';

import { verifyCluster, hasEnoughFacts } from './ai/analyze.mjs';
import { writeArticle, lintArticle } from './ai/write.mjs';
import { generateSeo } from './ai/seo.mjs';

/* ── CLI ────────────────────────────────────────────────── */

function parseArgs(argv) {
  const args = { topics: [], draft: false, dryRun: false, limit: null };
  for (const a of argv) {
    let m;
    if ((m = /^--topic=(.+)$/.exec(a))) args.topics.push(m[1].replace(/^["']|["']$/g, ''));
    else if ((m = /^--limit=(\d+)$/.exec(a))) args.limit = Number(m[1]);
    else if (a === '--draft') args.draft = true;
    else if (a === '--dry-run' || a === '--dryrun') args.dryRun = true;
  }
  // --draft를 명시하지 않으면 무조건 dry-run이다.
  if (!args.draft) args.dryRun = true;
  return args;
}

function loadTopics(filter) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'topics.json'), 'utf8'));
  let topics = cfg.topics.filter((t) => t.enabled !== false);
  if (filter.length) {
    const want = filter.map((f) => f.toLowerCase());
    topics = cfg.topics.filter((t) => want.includes(t.name.toLowerCase()));
    if (!topics.length) throw new Error(`topics.json에 없는 종목입니다: ${filter.join(', ')}`);
  }
  return { cfg, topics };
}

function loadSiteReport() {
  const file = path.join(ROOT, 'config', 'site.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const todayKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/* ── 1단계: 수집 ─────────────────────────────────────────── */

async function collectTopic(topic, cfg) {
  const { hoursWindow, maxItemsPerQuery, minSources, maxCandidatesPerTopic } = cfg.defaults;
  const template = cfg.feeds.googleNewsKo;

  const raw = [];
  const results = await settleAll(topic.queries, async (q) => {
    const xml = await fetchFeed(buildQueryUrl(template, q));
    return parseFeed(xml).slice(0, maxItemsPerQuery);
  });

  for (const r of results) {
    if (r.ok) raw.push(...r.value);
    else log.warn(`  "${r.item}" 검색 실패: ${r.error.message}`);
  }

  if (!raw.length) return { clusters: [], stats: { raw: 0, fresh: 0, clusters: 0, thin: 0 } };

  const deduped = dedupeItems(raw);
  const { fresh, undated } = filterRecent(deduped, hoursWindow);
  const clusters = clusterArticles(fresh);
  const { enough, thin } = splitBySourceCount(clusters, minSources);
  const ranked = rankClusters(enough, topic).slice(0, maxCandidatesPerTopic);

  return {
    clusters: ranked,
    stats: { raw: raw.length, deduped: deduped.length, fresh: fresh.length, undated: undated.length, clusters: clusters.length, thin: thin.length },
  };
}

/* ── 2단계: 한 건 처리 ───────────────────────────────────── */

async function processCluster(cluster, ctx) {
  const { dryRun, siteCategories, seoFields, today } = ctx;
  const result = { topic: cluster.topic, label: cluster.label, score: cluster.score };

  // 2-1. 중복 검사
  let related = [];
  if (ctx.wpAvailable) {
    try {
      related = await findRelatedPosts(cluster);
    } catch (err) {
      log.warn(`  중복 검사 건너뜀: ${err.message}`);
    }
  }
  const dup = judgeDuplication(cluster, related);
  result.duplicate = dup;
  log.info(`  중복 판정: ${dup.verdict} — ${VERDICT_LABEL[dup.verdict]}`);
  log.info(`    ${dup.reason}`);

  if (dup.verdict === 'B') {
    result.skipped = '중복 가능성 높음';
    log.warn('  ⇒ 중복 가능성 높음. 글을 만들지 않습니다.');
    return result;
  }
  if (dup.verdict === 'C') {
    result.updateCandidate = dup.updateCandidate;
    log.warn(`  ⇒ 기존 글 업데이트 후보입니다: ${dup.updateCandidate?.title}`);
    log.info('     새 글 대신 기존 글을 손보시는 편이 좋습니다. 계속 진행합니다(초안만 생성).');
  }

  // 2-2. 사실 확인 (웹검색)
  log.step('  사실 확인 중 (웹검색)');
  const verification = await verifyCluster(cluster, { relatedPosts: dup.related, today });
  result.verification = verification;
  log.info(`    확인된 사실 ${verification.confirmed.length}건 / 미확인 ${verification.unverified.length}건 / 출처상이 ${verification.conflicting.length}건`);
  log.info(`    사건 상태: ${verification.eventStatus} · 웹검색 ${verification.searched.length}건 참조`);

  if (verification.isDuplicateOfExisting) {
    result.skipped = `AI 중복 판정: ${verification.duplicateReason}`;
    log.warn(`  ⇒ AI가 기존 글과 중복이라고 판단했습니다: ${verification.duplicateReason}`);
    return result;
  }
  if (!verification.worthWriting || !hasEnoughFacts(verification)) {
    result.skipped = `사실 근거 부족: ${verification.worthWritingReason}`;
    log.warn(`  ⇒ 확인된 사실이 부족합니다: ${verification.worthWritingReason}`);
    return result;
  }

  // 2-3. 본문 작성
  log.step('  워프양식으로 작성 중');
  const article = await writeArticle({ cluster, verification, today });
  const lint = lintArticle(article);
  result.article = article;
  result.lint = lint;
  log.info(`    제목: ${article.title}`);
  log.info(`    본문 ${article.body.length}자 · 소제목 ${lint.headings.length}개`);
  if (!lint.ok) for (const i of lint.issues) log.warn(`    양식 확인 필요: ${i}`);

  // 2-4. SEO
  log.step('  SEO 생성 중');
  const seo = await generateSeo({ title: article.title, body: article.body, topic: cluster.topic, category: cluster.category });
  result.seo = seo;
  log.info(`    SEO 제목: ${seo.seoTitle}`);
  log.info(`    태그(${seo.tags.length}): ${seo.tags.join(', ')}`);

  // 2-5. 카테고리
  const cat = siteCategories.length
    ? resolveCategory(cluster.category, siteCategories)
    : { id: null, name: cluster.category, matched: 'no-site-data' };
  result.category = cat;
  log.info(`    카테고리: ${cat.name || cluster.category} (${cat.matched})`);
  if (cat.matched === 'fallback') log.warn(`    "${cluster.category}" 카테고리가 없어 "${cat.name}"로 넣습니다.`);

  // 2-6. 저장
  if (dryRun) {
    const file = writeDryRunFile(result);
    result.savedTo = file;
    log.ok(`  초안 파일 저장: ${path.relative(process.cwd(), file)}`);
    return result;
  }

  log.step('  워드프레스 임시글 저장 중');
  const tagIds = await resolveTagIds(seo.tags);
  const saved = await saveDraft({
    title: article.title,
    body: article.body,
    categoryId: cat.id,
    tagIds,
    seo,
    seoFields,
  });
  result.wordpress = saved;
  log.ok(`  임시글 저장 완료 (ID ${saved.id}, 상태 ${saved.status})`);
  if (saved.adminUrl) log.info(`    편집: ${saved.adminUrl}`);
  if (saved.savedMeta.length) log.info(`    SEO 필드 저장: ${saved.savedMeta.join(', ')}`);
  else log.info('    SEO 제목/설명은 워드프레스에 저장하지 않았습니다 (아래 파일 참고).');
  const file = writeDryRunFile(result);
  log.info(`    사본: ${path.relative(process.cwd(), file)}`);
  return result;
}

function writeDryRunFile(result) {
  const dir = path.join(ROOT, 'out', todayKST());
  fs.mkdirSync(dir, { recursive: true });
  const base = `${result.topic}-${slugish(result.article?.title || result.label)}`.slice(0, 80);

  const md = [
    `# ${result.article?.title || '(제목 없음)'}`,
    '',
    `- 종목: ${result.topic}`,
    `- 카테고리: ${result.category?.name || '-'}`,
    `- 태그: ${(result.seo?.tags || []).join(', ')}`,
    `- SEO 제목: ${result.seo?.seoTitle || '-'}`,
    `- 메타 설명: ${result.seo?.metaDescription || '-'}`,
    `- 대표 키워드: ${result.seo?.focusKeyword || '-'}`,
    `- 슬러그: ${result.seo?.slug || '-'}`,
    `- 중복 판정: ${result.duplicate?.verdict} (${result.duplicate?.reason})`,
    `- 상태: ${result.wordpress ? `워드프레스 임시글 ID ${result.wordpress.id}` : '파일만 생성 (워드프레스 저장 안 함)'}`,
    '',
    '---',
    '',
    result.article?.body || '',
  ].join('\n');

  fs.writeFileSync(path.join(dir, `${base}.md`), md);
  fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify(result, null, 2));
  return path.join(dir, `${base}.md`);
}

const slugish = (s) => String(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50);

/* ── 실행 ───────────────────────────────────────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { cfg, topics } = loadTopics(args.topics);
  const today = todayKST();

  logHeader(args.dryRun ? '🧪 DRY RUN — 워드프레스에 저장하지 않습니다' : '💾 임시글 저장 모드 (status=draft)', topics.map((t) => t.name));

  // 워드프레스 연결은 선택이다. 없으면 중복 검사와 카테고리 매칭만 건너뛴다.
  let siteCategories = [];
  let wpAvailable = false;
  const siteReport = loadSiteReport();
  const seoFields = siteReport?.seoFields || { writable: [] };

  try {
    siteCategories = await loadSiteCategories();
    wpAvailable = true;
    log.ok(`워드프레스 연결됨 · 카테고리 ${siteCategories.length}개`);
  } catch (err) {
    if (!args.dryRun) throw err;
    log.warn(`워드프레스에 연결하지 못했습니다: ${err.message}`);
    log.info('  → 중복 검사와 카테고리 매칭을 건너뛰고 계속합니다.');
    if (siteReport?.categories) {
      siteCategories = siteReport.categories;
      log.info(`  → config/site.json의 카테고리 ${siteCategories.length}개를 대신 씁니다.`);
    }
  }

  const perTopic = [];
  for (const topic of topics) {
    log.section(`📰 ${topic.name}`);
    try {
      const { clusters, stats } = await collectTopic(topic, cfg);
      log.info(`수집 ${stats.raw}건 → 중복제거 ${stats.deduped ?? 0}건 → 최근 ${stats.fresh ?? 0}건 → 묶음 ${stats.clusters}개 (출처부족 ${stats.thin}개 제외)`);

      if (!clusters.length) {
        log.warn('글감 후보가 없습니다. 다음 종목으로 넘어갑니다.');
        perTopic.push({ topic: topic.name, candidates: 0, results: [] });
        continue;
      }

      const take = args.limit ?? Number(env('CANDIDATES_PER_TOPIC', '1'));
      const picked = clusters.slice(0, take);
      log.info(`후보 ${clusters.length}개 중 상위 ${picked.length}개 처리`);
      clusters.slice(0, 5).forEach((c, i) => log.info(`  ${i + 1}. [${c.score}점] ${c.label.slice(0, 46)}`));

      const results = [];
      for (const cluster of picked) {
        log.raw('');
        log.step(`처리: ${cluster.label.slice(0, 50)}`);
        try {
          results.push(await processCluster(cluster, { ...args, siteCategories, seoFields, today, wpAvailable }));
        } catch (err) {
          // 한 건이 실패해도 다음 건으로 계속한다.
          log.fail('  이 글감 처리 실패', err);
          results.push({ topic: topic.name, label: cluster.label, error: err.message });
        }
      }
      perTopic.push({ topic: topic.name, candidates: clusters.length, results });
    } catch (err) {
      log.fail(`${topic.name} 처리 실패`, err);
      perTopic.push({ topic: topic.name, error: err.message, results: [] });
    }
  }

  printSummary(perTopic, args);
}

function printSummary(perTopic, args) {
  log.section('📋 실행 요약');
  let saved = 0, skipped = 0, failed = 0;

  for (const t of perTopic) {
    if (t.error) { log.error(`${t.topic}: ${t.error}`); failed++; continue; }
    if (!t.results.length) { log.info(`${t.topic}: 글감 없음`); continue; }
    for (const r of t.results) {
      if (r.error) { log.error(`${t.topic}: 실패 — ${r.error}`); failed++; }
      else if (r.skipped) { log.warn(`${t.topic}: 건너뜀 — ${r.skipped}`); skipped++; }
      else if (r.wordpress) { log.ok(`${t.topic}: 임시글 저장 (ID ${r.wordpress.id}) — ${r.article.title}`); saved++; }
      else { log.ok(`${t.topic}: 초안 생성 — ${r.article?.title}`); saved++; }
    }
  }

  log.raw('');
  log.info(`생성 ${saved}건 · 건너뜀 ${skipped}건 · 실패 ${failed}건`);
  if (args.dryRun) {
    log.raw('');
    log.info('🧪 DRY RUN이었습니다. 워드프레스에는 아무것도 저장되지 않았습니다.');
    log.info('   결과물은 sports-news/out/ 폴더에 있습니다.');
    log.info('   실제 임시글로 저장하려면: npm run news -- --topic="종목명" --draft');
  }
}

main().catch((err) => {
  log.fail('실행 실패', err);
  if (err.code === 'ENV_MISSING') {
    log.info('sports-news/.env 파일을 만들고 .env.example의 항목을 채워주세요.');
  }
  process.exitCode = 1;
});
