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

import { fetchFeed, parseFeed, buildQueryUrl, filterRecent, dedupeItems, applyQuerySuffix } from './news/fetch-rss.mjs';
import { clusterArticles, splitBySourceCount } from './news/normalize.mjs';
import { rankClusters } from './news/rank.mjs';

import { findRelatedPosts, judgeDuplication, VERDICT_LABEL } from './duplicate/check.mjs';
import { loadSiteCategories, resolveCategory, resolveTagIds } from './wordpress/taxonomy.mjs';
import { saveDraft } from './wordpress/draft.mjs';

import { createHeroImage, createSectionImage, hasAiImage } from './images/provider.mjs';
import { uploadMedia, safeFileName } from './images/upload.mjs';
import { planPlacements, insertMarks, imageHtml, adHtml } from './images/embed.mjs';
import { verifyCluster, hasEnoughFacts } from './ai/analyze.mjs';
import { writeArticle, lintArticle } from './ai/write.mjs';
import { generateSeo } from './ai/seo.mjs';
import { checkRankMath } from './seo/rankmath.mjs';
import { usageSummary } from './ai/client.mjs';

/* ── CLI ────────────────────────────────────────────────── */

export function parseArgs(argv) {
  const args = { topics: [], draft: false, dryRun: false, limit: null };
  for (const a of argv) {
    let m;
    if ((m = /^--topic=(.+)$/.exec(a))) args.topics.push(m[1].replace(/^["']|["']$/g, ''));
    else if ((m = /^--limit=(\d+)$/.exec(a))) args.limit = Number(m[1]);
    else if ((m = /^--fixture=(.+)$/.exec(a))) args.fixture = m[1].replace(/^["']|["']$/g, '');
    else if (a === '--draft') args.draft = true;
    else if (a === '--dry-run' || a === '--dryrun') args.dryRun = true;
  }
  // 사양 [16]의 DRY_RUN=true 도 지원한다. 환경변수로 켜면 --draft가 있어도 저장하지 않는다.
  if (/^(1|true|yes)$/i.test(process.env.DRY_RUN || '')) {
    args.dryRun = true;
    args.draft = false;
    args.dryRunReason = 'DRY_RUN 환경변수';
  }
  // --draft를 명시하지 않으면 무조건 dry-run이다.
  if (!args.draft) {
    args.dryRun = true;
    args.dryRunReason ??= '--draft 플래그 없음';
  }
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

/** 쿠팡 파트너스 광고. config/ad-coupang.html을 고치면 바뀐다. 파일을 지우면 광고가 빠진다. */
const AD_SNIPPET = (() => {
  const f = path.join(ROOT, 'config', 'ad-coupang.html');
  try { return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : ''; } catch { return ''; }
})();

const todayKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/* ── 1단계: 수집 ─────────────────────────────────────────── */

async function collectTopic(topic, cfg, { fixture } = {}) {
  const { hoursWindow, maxItemsPerQuery, minSources, maxCandidatesPerTopic } = cfg.defaults;
  const raw = [];

  // --fixture: 뉴스를 네트워크 대신 파일에서 읽는다.
  // 뉴스 수집이 막혀 있을 때 이후 단계(사실확인·작성·저장)를 점검하는 용도다.
  if (fixture) {
    const items = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    const forTopic = Array.isArray(items)
      ? items.filter((it) => !it.topic || it.topic === topic.name)
      : (items[topic.name] || []);
    raw.push(...forTopic);
    log.info(`  샘플 파일에서 ${forTopic.length}건 (네트워크를 쓰지 않습니다)`);
  }

  // 검색 피드를 위에서부터 시도한다. 한 곳이 막혀도(구글뉴스 403 등) 다음 곳으로 넘어간다.
  // 소스가 하나뿐이면 그 한 곳이 막히는 순간 시스템 전체가 멈춘다.
  const searchFeeds = fixture ? [] : (cfg.feeds?.searchFeeds || []);
  for (const feed of searchFeeds) {
    const results = await settleAll(topic.queries, async (q) => {
      // 구글뉴스 검색은 관련도순이라 기간 제한을 걸지 않으면 몇 달 전 기사까지 섞여 온다.
      const scoped = applyQuerySuffix(q, feed.querySuffix, hoursWindow);
      const xml = await fetchFeed(buildQueryUrl(feed.url, scoped));
      return parseFeed(xml, { sourceLabel: '' }).slice(0, maxItemsPerQuery);
    });

    const got = [];
    let failed = 0;
    for (const r of results) {
      if (r.ok) got.push(...r.value);
      else failed++;
    }

    if (got.length) {
      raw.push(...got);
      log.info(`  ${feed.name}: ${got.length}건${failed ? ` (검색어 ${failed}개 실패)` : ''}`);
      if (cfg.defaults.stopAfterFirstWorkingFeed) break;
    } else {
      log.warn(`  ${feed.name}: 수집 실패 — 다음 소스로 넘어갑니다`);
    }
  }

  // 종목별 고정 피드(언론사 섹션 등). 검색 피드와 함께 쓰고, 중복은 뒤에서 걸러진다.
  for (const feed of fixture ? [] : (topic.staticFeeds || [])) {
    try {
      const xml = await fetchFeed(typeof feed === 'string' ? feed : feed.url);
      const items = parseFeed(xml, { sourceLabel: feed.name || '' }).slice(0, maxItemsPerQuery);
      raw.push(...items);
      log.info(`  ${feed.name || '고정 피드'}: ${items.length}건`);
    } catch (err) {
      log.warn(`  고정 피드 실패: ${err.message}`);
    }
  }

  if (!raw.length) {
    log.warn('  모든 뉴스 소스에서 수집하지 못했습니다.');
    log.info('    → 네트워크 차단이거나 피드 주소가 바뀐 경우입니다. config/topics.json의 feeds를 확인하세요.');
  }

  if (!raw.length) return { clusters: [], stats: { raw: 0, fresh: 0, clusters: 0, thin: 0 } };

  const deduped = dedupeItems(raw);
  const { fresh, undated, stale } = filterRecent(deduped, hoursWindow);
  const clusters = clusterArticles(fresh);
  const { enough, thin } = splitBySourceCount(clusters, minSources);
  const ranked = rankClusters(enough, topic).slice(0, maxCandidatesPerTopic);

  return {
    clusters: ranked,
    stats: {
      raw: raw.length, deduped: deduped.length, fresh: fresh.length,
      undated: undated.length, stale: stale.length,
      clusters: clusters.length, thin: thin.length, hoursWindow,
    },
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
  // C는 "새 글 대신 기존 글을 고치는 게 맞다"는 판정이다. 그래서 워드프레스에는
  // 저장하지 않는다 — 저장하면 결국 비슷한 글이 두 개가 된다.
  // 대신 참고용 원고를 파일로 만들어 둔다. 기존 글을 손볼 때 재료로 쓰시면 된다.
  let localOnly = false;
  if (dup.verdict === 'C') {
    result.updateCandidate = dup.updateCandidate;
    localOnly = true;
    log.warn(`  ⇒ 기존 글 업데이트 후보: ${dup.updateCandidate?.title}`);
    log.info(`     ${dup.updateCandidate?.link || ''}`);
    log.info('     워드프레스에 새 글을 만들지 않습니다. 참고용 원고만 파일로 남깁니다.');
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

  // 2-3. SEO 키워드를 먼저 잡는다.
  // 글을 다 쓴 뒤에 키워드를 정하면 본문에 그 말이 없어 검색에 안 걸린다.
  // 사실 확인 결과만으로 키워드를 먼저 정하고, 그 말을 넣어 쓰게 한다.
  const provisionalKeyword = guessKeyword(cluster, verification);

  // 2-4. 본문 작성
  log.step('  워프양식으로 작성 중');
  const article = await writeArticle({ cluster, verification, today, focusKeyword: provisionalKeyword });
  const lint = lintArticle(article);
  result.article = article;
  result.lint = lint;
  log.info(`    제목: ${article.title}`);
  log.info(`    본문 ${article.body.length}자 · 소제목 ${lint.headings.length}개`);
  if (!lint.ok) for (const i of lint.issues) log.warn(`    양식 확인 필요: ${i}`);

  // 2-5. SEO
  log.step('  SEO 생성 중');
  const seo = await generateSeo({ title: article.title, body: article.body, topic: cluster.topic, category: cluster.category });
  result.seo = seo;
  log.info(`    SEO 제목: ${seo.seoTitle}`);
  log.info(`    대표 키워드: ${seo.focusKeyword} · 슬러그: ${seo.slug}`);
  log.info(`    태그(${seo.tags.length}): ${seo.tags.join(', ')}`);

  // 2-6. 이미지 — 대표 이미지 1장 + 본문 카드 1장
  const media = await attachImages({ article, seo, cluster, dryRun: dryRun || localOnly });
  result.images = media.summary;

  // SEO 항목 점검. 실제 점수는 Rank Math가 매기지만, 우리가 지킬 수 있는
  // 항목이 빠졌으면 여기서 미리 알려준다.
  const seoCheck = checkRankMath({
    title: article.title, seoTitle: seo.seoTitle, body: article.body,
    metaDescription: seo.metaDescription, focusKeyword: seo.focusKeyword, slug: seo.slug,
    imageCount: media.summary.length || (dryRun || localOnly ? 2 : 0),
    imageAlts: media.summary.map((i) => i.alt),
  });
  result.seoCheck = seoCheck;
  log.info(`    SEO 항목 ${seoCheck.score}점 (${seoCheck.items.length - seoCheck.missing.length}/${seoCheck.items.length})`);
  for (const m of seoCheck.missing) log.warn(`      빠짐: ${m.label} — ${m.fix}`);

  // 2-7. 카테고리
  const cat = siteCategories.length
    ? resolveCategory(cluster.category, siteCategories)
    : { id: null, name: cluster.category, matched: 'no-site-data' };
  result.category = cat;
  log.info(`    카테고리: ${cat.name || cluster.category} (${cat.matched})`);
  if (cat.matched === 'fallback') log.warn(`    "${cluster.category}" 카테고리가 없어 "${cat.name}"로 넣습니다.`);

  // 2-8. 저장
  if (dryRun || localOnly) {
    const file = writeDryRunFile(result);
    result.savedTo = file;
    result.localOnly = localOnly;
    log.ok(`  ${localOnly ? '참고용 원고' : '초안 파일'} 저장: ${path.relative(process.cwd(), file)}`);
    // 미리보기는 결과를 눈으로 보려고 돌리는 것이다. 파일을 따로 받지 않아도
    // 바로 읽을 수 있게 글 전문을 그대로 찍는다.
    printArticle(result);
    return result;
  }

  log.step('  워드프레스 임시글 저장 중');
  const tagIds = await resolveTagIds(seo.tags);
  const saved = await saveDraft({
    title: article.title,
    body: media.body,
    categoryId: cat.id,
    tagIds,
    seo,
    seoFields,
    images: media.blocks,
    adHtml: media.ad,
    featuredMediaId: media.featuredId,
  });
  result.wordpress = saved;
  log.ok(`  임시글 저장 완료 (ID ${saved.id}, 상태 ${saved.status})`);
  if (saved.adminUrl) log.info(`    편집: ${saved.adminUrl}`);

  if (saved.savedMeta.length) {
    log.info(`    SEO 필드 저장됨: ${saved.savedMeta.join(', ')}`);
  } else {
    // Rank Math가 REST 쓰기를 열어두지 않은 경우가 기본이다.
    // 파일을 열어 찾게 하지 말고, 붙여넣을 값을 여기 바로 띄운다.
    printSeoToCopy(seo);
  }

  const file = writeDryRunFile(result);
  log.info(`    사본: ${path.relative(process.cwd(), file)}`);
  return result;
}

/**
 * 글을 쓰기 전에 대표 검색 키워드를 정한다.
 *
 * 순서가 중요하다. 글을 먼저 쓰고 키워드를 나중에 정하면, 정작 본문에 그 말이
 * 없어서 검색에 안 걸린다. 확인된 사실 중 대회명을 우선으로 잡는다.
 */
function guessKeyword(cluster, verification) {
  const byField = (name) => verification.confirmed?.find((c) => c.field.includes(name))?.value;
  const raw = byField('대회명') || byField('대회') || cluster.label;
  return String(raw).replace(/\s+/g, ' ').trim().split(/[(\[|—·]/)[0].trim().slice(0, 30);
}

/** 미리보기에서 글 전문을 로그에 찍는다. */
function printArticle(result) {
  const seo = result.seo || {};
  log.raw('');
  log.raw('━'.repeat(60));
  log.raw(`📄 ${result.article?.title || ''}`);
  log.raw('━'.repeat(60));
  log.raw(`카테고리: ${result.category?.name || '-'}`);
  log.raw(`태그: ${(seo.tags || []).join(', ')}`);
  log.raw(`SEO 제목: ${seo.seoTitle || '-'}`);
  log.raw(`메타 설명: ${seo.metaDescription || '-'}`);
  log.raw(`대표 키워드: ${seo.focusKeyword || '-'}`);
  log.raw(`슬러그: ${seo.slug || '-'}`);
  if (result.images?.length) {
    log.raw(`이미지: ${result.images.map((i) => `${i.role}(${i.note})`).join(', ')}`);
  }
  log.raw('─'.repeat(60));
  log.raw(result.article?.body || '');
  log.raw('━'.repeat(60));
  log.raw('');
}

/**
 * 이미지를 만들어 올리고, 본문에 들어갈 자리를 잡는다.
 *
 * 이미지는 글의 부속물이다. 만들기에 실패하든 올리기에 실패하든
 * 글 자체는 그대로 나가야 한다. 그래서 모든 실패를 안에서 삼키고
 * 무엇이 안 됐는지만 로그에 남긴다.
 */
async function attachImages({ article, seo, cluster, dryRun }) {
  const plan = planPlacements(article.body, { sectionImages: 1, withAd: Boolean(AD_SNIPPET) });
  const body = insertMarks(article.body, plan);
  const out = { body, blocks: [], ad: AD_SNIPPET ? adHtml(AD_SNIPPET) : '', featuredId: null, summary: [] };

  const wanted = [
    { role: 'hero', make: () => createHeroImage({
        title: article.title, topic: cluster.topic, focusKeyword: seo.focusKeyword,
        onFallback: (why) => log.warn(`    AI 이미지 생성 실패 — 텍스트 카드로 대체합니다: ${why}`),
      }) },
    ...plan.sections.map((h) => ({ role: 'section', make: () => createSectionImage({
        heading: h.text, topic: cluster.topic, focusKeyword: seo.focusKeyword,
      }) })),
  ];

  log.step(`  이미지 ${wanted.length}장 준비 중${hasAiImage() ? ' (AI 생성)' : ' (텍스트 카드)'}`);

  for (const [i, w] of wanted.entries()) {
    let img;
    try {
      img = await w.make();
    } catch (err) {
      log.warn(`    ${w.role} 이미지를 만들지 못했습니다: ${err.message}`);
      out.blocks.push(null);
      continue;
    }

    if (dryRun) {
      // 저장하지 않는 실행에서는 워드프레스에 올리지 않는다. 파일로만 남긴다.
      out.blocks.push(null);
      out.summary.push({ role: w.role, kind: img.kind, note: img.note, alt: img.alt, bytes: img.buffer.length });
      log.info(`    ${w.role}: ${img.note} (${Math.round(img.buffer.length / 1024)}KB) — 미리보기라 업로드하지 않습니다`);
      continue;
    }

    try {
      const up = await uploadMedia({
        buffer: img.buffer,
        fileName: safeFileName(`${cluster.topic}-${seo.slug || article.title}`),
        alt: img.alt,
      });
      out.blocks.push({ html: imageHtml({ url: up.url, alt: img.alt }) });
      if (i === 0) out.featuredId = up.id;
      out.summary.push({ role: w.role, kind: img.kind, note: img.note, alt: img.alt, url: up.url });
      log.info(`    ${w.role}: ${img.note} → 업로드 완료 (미디어 ID ${up.id})`);
    } catch (err) {
      out.blocks.push(null);
      log.warn(`    ${w.role} 이미지 업로드 실패 — 글은 이미지 없이 저장합니다: ${err.message}`);
    }
  }

  return out;
}

/**
 * 워드프레스에 SEO 값을 못 넣은 경우, 손으로 붙여넣을 값을 화면에 띄운다.
 * 파일을 열어 찾게 만들면 결국 안 하게 된다.
 */
function printSeoToCopy(seo) {
  log.raw('');
  log.raw('    ┌─ Rank Math에 붙여넣을 값 ────────────────────────');
  log.raw(`    │ SEO 제목   : ${seo.seoTitle}`);
  log.raw(`    │ 설명       : ${seo.metaDescription}`);
  log.raw(`    │ 대표 키워드 : ${seo.focusKeyword}`);
  log.raw('    └──────────────────────────────────────────────────');
  log.raw('      편집 화면 아래 Rank Math 칸에 넣으시면 됩니다.');
  log.raw('');
}

/**
 * "글감 후보가 없습니다"만 보면 손을 쓸 수 없다.
 * 어느 단계에서 다 빠졌는지에 따라 고칠 곳이 다르므로 그것까지 알려준다.
 */
function explainNoCandidates(stats, cfg) {
  if (!stats.raw) {
    log.info('  → 뉴스를 한 건도 못 가져왔습니다. 네트워크나 피드 주소 문제입니다.');
    return;
  }
  if (!stats.fresh) {
    log.info(`  → 가져온 ${stats.deduped}건이 모두 ${stats.hoursWindow}시간보다 오래됐습니다.`);
    log.info('     config/topics.json의 defaults.hoursWindow를 늘리거나, 검색어를 바꿔보세요.');
    return;
  }
  if (stats.thin && !stats.clusters) return;
  if (stats.thin) {
    log.info(`  → 최근 기사 ${stats.fresh}건이 있지만, 같은 사건을 ${cfg.defaults.minSources}곳 이상이`);
    log.info('     함께 다룬 경우가 없습니다. 한 매체 단독 보도만으로는 글을 만들지 않습니다.');
    log.info('     검색어를 더 넓히거나(예: "바둑" 단독), hoursWindow를 늘려보세요.');
  }
}

function writeDryRunFile(result) {
  const dir = path.join(ROOT, 'out', todayKST());
  fs.mkdirSync(dir, { recursive: true });
  const base = `${result.topic}-${slugish(result.article?.title || result.label)}`.slice(0, 80);

  const seo = result.seo || {};
  const md = [
    `# ${result.article?.title || '(제목 없음)'}`,
    '',
    '## 📋 워드프레스에 넣을 값',
    '',
    `**카테고리**: ${result.category?.name || '-'}`,
    `**태그**: ${(seo.tags || []).join(', ')}`,
    `**슬러그**: ${seo.slug || '-'}`,
    '',
    '### Rank Math 칸에 붙여넣기',
    '',
    `**SEO 제목**`,
    '```',
    seo.seoTitle || '-',
    '```',
    '',
    `**설명**`,
    '```',
    seo.metaDescription || '-',
    '```',
    '',
    `**대표 키워드**`,
    '```',
    seo.focusKeyword || '-',
    '```',
    '',
    '### 처리 기록',
    '',
    `- 종목: ${result.topic}`,
    `- 중복 판정: ${result.duplicate?.verdict} — ${result.duplicate?.reason}`,
    result.updateCandidate ? `- 고칠 기존 글: ${result.updateCandidate.title} ${result.updateCandidate.link || ''}` : null,
    `- 상태: ${result.wordpress ? `워드프레스 임시글 ID ${result.wordpress.id}` : '파일만 생성 (워드프레스 저장 안 함)'}`,
    result.wordpress?.adminUrl ? `- 편집 링크: ${result.wordpress.adminUrl}` : null,
    '',
    '---',
    '',
    '## ✍️ 본문',
    '',
    result.article?.body || '',
  ].filter((l) => l !== null).join('\n');

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

  logHeader(
    args.dryRun
      ? `🧪 DRY RUN — 워드프레스에 저장하지 않습니다 (${args.dryRunReason})`
      : '💾 임시글 저장 모드 (status=draft)',
    topics.map((t) => t.name)
  );

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
      const { clusters, stats } = await collectTopic(topic, cfg, { fixture: args.fixture });
      log.info(`수집 ${stats.raw}건 → 중복 제거 후 ${stats.deduped ?? 0}건`);
      log.info(`  최근 ${stats.hoursWindow}시간 이내 ${stats.fresh ?? 0}건 · 그보다 오래됨 ${stats.stale ?? 0}건 · 날짜미상 ${stats.undated ?? 0}건`);
      log.info(`  묶음 ${stats.clusters}개 (출처 ${cfg.defaults.minSources}곳 미만이라 제외된 묶음 ${stats.thin}개)`);

      if (!clusters.length) {
        log.warn('글감 후보가 없습니다. 다음 종목으로 넘어갑니다.');
        explainNoCandidates(stats, cfg);
        perTopic.push({ topic: topic.name, candidates: 0, results: [] });
        continue;
      }

      const take = args.limit ?? Number(env('CANDIDATES_PER_TOPIC', '1'));
      log.info(`후보 ${clusters.length}개 중 ${take}개 목표`);
      clusters.slice(0, 5).forEach((c, i) => log.info(`  ${i + 1}. [${c.score}점] ${c.label.slice(0, 46)}`));

      // 1순위 글감이 중복이거나 사실 근거가 부족하면 그대로 끝내지 않고
      // 다음 후보로 내려간다. 예전에는 1순위가 걸리면 그 종목은 빈손이었다.
      // 다만 후보를 무한정 훑으면 사실확인 비용이 계속 붙으므로, 건너뛴 만큼만
      // 몇 번 더 시도한다.
      const maxExtra = Number(env('MAX_EXTRA_CANDIDATES', '2'));
      const results = [];
      let produced = 0;
      let extra = 0;

      for (const cluster of clusters) {
        if (produced >= take) break;
        if (extra > maxExtra) {
          log.warn(`  다음 후보 시도를 ${maxExtra}번까지만 합니다. 여기서 멈춥니다.`);
          break;
        }

        log.raw('');
        log.step(`처리: ${cluster.label.slice(0, 50)}`);
        let r;
        try {
          r = await processCluster(cluster, { ...args, siteCategories, seoFields, today, wpAvailable });
        } catch (err) {
          // 한 건이 실패해도 다음 건으로 계속한다.
          log.fail('  이 글감 처리 실패', err);
          r = { topic: topic.name, label: cluster.label, error: err.message };
        }
        results.push(r);

        if (r.skipped || r.error) {
          extra++;
          if (extra <= maxExtra && produced < take) log.info('  다음 후보로 넘어갑니다.');
        } else {
          produced++;
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

/**
 * 이번 실행에 얼마나 썼는지 보여준다.
 *
 * 비용이 보이지 않으면 어디를 줄여야 할지 알 수 없다. 단계마다 모델이 다르므로
 * 모델별로 나눠 보여준다. 요금표는 config/pricing.json에 있고 바뀌면 거기를 고친다.
 */
function printUsage() {
  const rows = usageSummary();
  if (!rows.length) return;

  let pricing = null;
  try {
    pricing = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'pricing.json'), 'utf8'));
  } catch { /* 요금표가 없으면 토큰만 보여준다 */ }

  log.raw('');
  log.raw('💰 이번 실행에 쓴 양');
  let usd = 0;
  let searches = 0;
  for (const r of rows) {
    const rate = pricing?.models?.[r.model];
    let line = `   ${r.model}: 호출 ${r.calls}회 · 입력 ${fmt(r.input)} · 출력 ${fmt(r.output)}`;
    if (r.cacheRead) line += ` · 캐시재사용 ${fmt(r.cacheRead)}`;
    if (r.searches) line += ` · 웹검색 ${r.searches}회`;
    searches += r.searches;
    if (rate) {
      const cost = (r.input / 1e6) * rate.input + (r.output / 1e6) * rate.output;
      usd += cost;
      line += `  ≈ $${cost.toFixed(3)}`;
    }
    log.raw(line);
  }
  if (usd > 0) {
    const krw = Math.round(usd * (pricing?.usdToKrw || 1400));
    log.raw(`   합계 ≈ $${usd.toFixed(3)} (약 ${krw.toLocaleString('ko-KR')}원)${searches ? ` + 웹검색 ${searches}회 별도` : ''}`);
    log.raw('   * 토큰 요금만 계산한 값입니다. 웹검색은 별도 과금이라 횟수만 표시합니다.');
  }
}

const fmt = (n) => n.toLocaleString('ko-KR');

function printSummary(perTopic, args) {
  log.section('📋 실행 요약');
  let saved = 0, skipped = 0, failed = 0, updateCandidates = 0;

  for (const t of perTopic) {
    if (t.error) { log.error(`${t.topic}: ${t.error}`); failed++; continue; }
    if (!t.results.length) { log.info(`${t.topic}: 글감 없음`); continue; }
    for (const r of t.results) {
      if (r.error) { log.error(`${t.topic}: 실패 — ${r.error}`); failed++; }
      else if (r.skipped) { log.warn(`${t.topic}: 건너뜀 — ${r.skipped}`); skipped++; }
      else if (r.wordpress) { log.ok(`${t.topic}: 임시글 저장 (ID ${r.wordpress.id}) — ${r.article.title}`); saved++; }
      else if (r.localOnly) {
        log.warn(`${t.topic}: 기존 글 업데이트 후보 — ${r.article?.title}`);
        log.info(`   고칠 글: ${r.updateCandidate?.title} ${r.updateCandidate?.link || ''}`);
        log.info(`   참고 원고: ${r.savedTo ? path.relative(process.cwd(), r.savedTo) : '-'}`);
        updateCandidates++;
      }
      else { log.ok(`${t.topic}: 초안 생성 — ${r.article?.title}`); saved++; }
    }
  }

  log.raw('');
  log.info(`생성 ${saved}건 · 업데이트 후보 ${updateCandidates}건 · 건너뜀 ${skipped}건 · 실패 ${failed}건`);
  printUsage();
  if (args.dryRun) {
    log.raw('');
    log.info('🧪 DRY RUN이었습니다. 워드프레스에는 아무것도 저장되지 않았습니다.');
    log.info('   결과물은 sports-news/out/ 폴더에 있습니다.');
    log.info('   실제 임시글로 저장하려면: npm run news -- --topic="종목명" --draft');
  }
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) main().catch((err) => {
  log.fail('실행 실패', err);
  if (err.code === 'ENV_MISSING') {
    log.info('sports-news/.env 파일을 만들고 .env.example의 항목을 채워주세요.');
  }
  process.exitCode = 1;
});
