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
import { recentCategories, categoryIndex } from './news/variety.mjs';

import { findRelatedPosts, judgeDuplication, VERDICT_LABEL } from './duplicate/check.mjs';
import { loadSiteCategories, resolveCategory, resolveTagIds } from './wordpress/taxonomy.mjs';
import { saveDraft } from './wordpress/draft.mjs';

import { createHeroImage, createSectionImage, hasAiImage } from './images/provider.mjs';
import { uploadMedia, safeFileName } from './images/upload.mjs';
import { planPlacements, insertMarks, imageHtml, adHtml } from './images/embed.mjs';
import { verifyCluster, hasEnoughFacts } from './ai/analyze.mjs';
import { writeArticle, lintArticle } from './ai/write.mjs';
import { generateSeo } from './ai/seo.mjs';
import { classifySubject, subjectAsTopic } from './ai/classify.mjs';
import { attachSearchVolume, hasNaverKeywords, searchKeywordFor } from './news/naver-keywords.mjs';
import { attachTrend, hasNaverTrend } from './news/naver-trend.mjs';
import { checkRankMath, chooseFocusKeyword, buildSlug } from './seo/rankmath.mjs';
import { pickWatchLinks, watchBannerHtml } from './seo/watch-banner.mjs';
import { checkFlow } from './seo/flow.mjs';
import { usageSummary } from './ai/client.mjs';

/* ── CLI ────────────────────────────────────────────────── */

export function parseArgs(argv) {
  const args = { topics: [], draft: false, dryRun: false, limit: null };
  for (const a of argv) {
    let m;
    if ((m = /^--topic=(.+)$/.exec(a))) args.topics.push(m[1].replace(/^["']|["']$/g, ''));
    else if ((m = /^--limit=(\d+)$/.exec(a))) args.limit = Number(m[1]);
    else if ((m = /^--fixture=(.+)$/.exec(a))) args.fixture = m[1].replace(/^["']|["']$/g, '');
    // --subject: 종목 목록을 훑지 않고, 적어 준 주제 하나만 쓴다.
    // 매일 전 종목을 도는 것보다 훨씬 싸다.
    else if ((m = /^--subject=([\s\S]+)$/.exec(a))) args.subject = m[1].replace(/^["']|["']$/g, '').trim();
    // --best=N: 전 종목의 글감을 한 자리에 모아 점수로 줄 세운 뒤 상위 N개만 쓴다.
    // 뉴스 수집은 공짜고 돈이 드는 건 사실확인·작성이라, 넓게 보고 좁게 쓰는 게 이득이다.
    else if ((m = /^--best=(\d+)$/.exec(a))) args.best = Number(m[1]);
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

async function collectTopic(topic, cfg, { fixture, recentCats = null } = {}) {
  const { hoursWindow, maxItemsPerQuery, minSources, maxCandidatesPerTopic } = cfg.defaults;
  const raw = [];

  // --fixture: 뉴스를 네트워크 대신 파일에서 읽는다.
  // 뉴스 수집이 막혀 있을 때 이후 단계(사실확인·작성·저장)를 점검하는 용도다.
  if (fixture) {
    const items = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    // 주제를 직접 지정한 경우(adHoc)에는 종목 이름으로 거르지 않는다.
    // 그 이름은 사용자가 적어 준 문장이지 샘플 파일의 종목 이름이 아니다.
    const forTopic = Array.isArray(items)
      ? items.filter((it) => topic.adHoc || !it.topic || it.topic === topic.name)
      : (items[topic.name] || Object.values(items).flat());
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
  const ranked = rankClusters(enough, topic, { recentCategories: recentCats }).slice(0, maxCandidatesPerTopic);

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
  const seo = await generateSeo({
    title: article.title, body: article.body,
    topic: cluster.topic, category: cluster.category,
    provisionalKeyword,
  });

  // 대표 키워드가 본문에 실제로 들어 있는지 확인한다.
  //
  // SEO 단계가 본문을 읽고 제 나름의 긴 구절을 고르면, 그 말이 본문에 그대로는
  // 한 번도 나오지 않아 키워드 밀도가 0%가 된다. Rank Math는 대표 키워드를
  // 있는 그대로 찾으므로 그러면 점수가 0이다. 실제로 그렇게 나온 적이 있다.
  const picked = chooseFocusKeyword(article.body, [seo.focusKeyword, provisionalKeyword, cluster.topic]);
  if (picked.keyword && picked.keyword !== seo.focusKeyword) {
    log.warn(`    대표 키워드를 "${seo.focusKeyword}" → "${picked.keyword}"로 바꿉니다`);
    log.info(`      원래 키워드는 본문에 ${keywordCountOf(picked, seo.focusKeyword)}회 나옵니다 (밀도 0에 가까우면 점수가 0이 됩니다)`);
    seo.focusKeyword = picked.keyword;
    seo.slug = buildSlug({ focusKeyword: picked.keyword, title: article.title, fallback: cluster.topic });
  }

  result.seo = seo;
  log.info(`    SEO 제목: ${seo.seoTitle}`);
  log.info(`    대표 키워드: ${seo.focusKeyword} (본문 ${picked.density.toFixed(2)}%) · 슬러그: ${seo.slug}`);
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

  // 흐름 점검: 몇 달 뒤에도 검색되는 글의 구조를 갖췄는가.
  const flow = checkFlow({ title: article.title, body: article.body, demand: cluster.demand });
  result.flow = flow;
  log.info(`    흐름 ${flow.score}점`);
  for (const i of flow.items) {
    const mark = i.ok === null ? '—' : i.ok ? '✅' : '❌';
    log.info(`      ${mark} ${i.step} ${i.label}`);
  }
  for (const m of flow.missing) log.warn(`      ${m.step} 보완: ${m.fix}`);

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
    watchHtml: media.watch,
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
/** 바뀌기 전 키워드가 본문에 몇 번 나왔는지 — 왜 바꿨는지 보여주려고 쓴다. */
function keywordCountOf(picked, keyword) {
  return picked.candidates?.find((c) => c.keyword === keyword)?.count ?? 0;
}

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
  // 중계 링크가 설정에 있는 종목만 배너를 넣는다. 없으면 자리도 잡지 않는다.
  const watch = pickWatchLinks(cluster.category);
  const plan = planPlacements(article.body, {
    sectionImages: 1,
    withAd: Boolean(AD_SNIPPET),
    withWatch: Boolean(watch),
  });
  const body = insertMarks(article.body, plan);
  const out = {
    body, blocks: [], ad: AD_SNIPPET ? adHtml(AD_SNIPPET) : '',
    watch: watch ? watchBannerHtml(watch, { title: article.title.split('(')[0].trim() }) : '',
    featuredId: null, summary: [],
  };
  if (watch) log.info(`    중계 배너: ${watch.primary.url}`);

  // 카드에 찍을 라벨은 짧아야 한다. 주제를 직접 지정하면 cluster.topic이
  // 사용자가 적어 준 긴 문장이라(예: "피트 알론소 볼티모어 오리올스 …")
  // 카드 라벨로는 못 쓴다. 카테고리("야구")를 쓴다 — 짧고, 같은 카테고리끼리
  // 색이 같아져서 시리즈처럼 보인다.
  const cardLabel = cluster.category || cluster.topic;

  const wanted = [
    { role: 'hero', make: () => createHeroImage({
        title: article.title, topic: cluster.topic, label: cardLabel, focusKeyword: seo.focusKeyword,
        onFallback: (why) => log.warn(`    AI 이미지 생성 실패 — 텍스트 카드로 대체합니다: ${why}`),
      }) },
    ...plan.sections.map((h) => ({ role: 'section', make: () => createSectionImage({
        heading: h.text, topic: cluster.topic, label: cardLabel, focusKeyword: seo.focusKeyword,
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
  // --subject를 쓰면 종목 목록은 읽기만 하고 실제로 돌지는 않는다.
  const { cfg, topics: configuredTopics } = loadTopics(args.subject ? [] : args.topics);
  let topics = configuredTopics;
  const today = todayKST();

  logHeader(
    args.dryRun
      ? `🧪 DRY RUN — 워드프레스에 저장하지 않습니다 (${args.dryRunReason})`
      : '💾 임시글 저장 모드 (status=draft)',
    args.subject ? [args.subject] : topics.map((t) => t.name)
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

  // 주제를 직접 지정했으면 여기서 카테고리를 정하고 임시 종목을 만든다.
  // 카테고리 목록을 먼저 읽어야 하므로 워드프레스 연결 뒤에 한다.
  if (args.subject) {
    const names = (siteCategories.length ? siteCategories : (cfg.knownCategories?.list || []))
      .map((c) => c.name).filter(Boolean);
    log.step(`주제 분류 중: "${args.subject}"`);
    const classified = await classifySubject(args.subject, names);
    log.info(`  카테고리: ${classified.category} — ${classified.reason}`);
    log.info(`  검색어: ${classified.queries.join(', ')}`);
    topics = [subjectAsTopic(args.subject, classified)];
    args.limit ??= 1;
  }

  // 최근에 쓴 종목은 점수를 깎는다. 같은 종목만 연달아 나오는 걸 막는다.
  // 조회가 실패해도 그냥 간다 — 다양성 때문에 글을 못 쓰게 되면 안 된다.
  let recentCats = null;
  if (wpAvailable) {
    try {
      recentCats = await recentCategories({ categoryNameById: categoryIndex(siteCategories) });
      if (recentCats?.length) {
        log.info(`최근 글 종목: ${recentCats.join(' → ')} (같은 종목은 점수를 깎습니다)`);
      }
    } catch (err) {
      log.warn(`최근 글 조회 실패 — 종목 다양성 감점 없이 진행합니다 (${err.message})`);
    }
  }

  // --best: 종목을 가로질러 가장 좋은 글감만 고른다.
  if (args.best) {
    const perTopic = await writeBestAcrossTopics({
      topics, cfg, args, siteCategories, seoFields, today, wpAvailable, recentCats,
    });
    printSummary(perTopic, args);
    return;
  }

  const perTopic = [];
  for (const topic of topics) {
    log.section(`📰 ${topic.name}`);
    try {
      const { clusters, stats } = await collectTopic(topic, cfg, { fixture: args.fixture, recentCats });
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

      // 상위 후보에 네이버 신호를 붙이고 다시 줄 세운다.
      // 둘 다 없으면 그냥 지나간다 — 기사 쏠림 대리 신호로 간다.
      const 붙임 = [];
      if (hasNaverTrend()) {
        await attachTrend(clusters, {
          limit: 5, keywordOf: searchKeywordFor,
          onError: (why) => log.warn(`  검색 추이 조회 실패 — 대리 신호로 진행합니다: ${why}`),
        });
        붙임.push('데이터랩 추이');
      }
      if (hasNaverKeywords()) {
        await attachSearchVolume(clusters, {
          limit: 5,
          onError: (why) => log.warn(`  검색수 조회 실패 — 대리 신호로 진행합니다: ${why}`),
        });
        붙임.push('검색수');
      }
      if (붙임.length) {
        const 재채점 = rankClusters(clusters, topic, { recentCategories: recentCats });
        clusters.splice(0, clusters.length, ...재채점);
      }

      log.info(`후보 ${clusters.length}개 중 ${take}개 목표${붙임.length ? ` (${붙임.join(' + ')} 반영)` : ''}`);
      clusters.slice(0, 5).forEach((c, i) => {
        const 조각 = [];
        if (c.trend) 조각.push(`"${c.trend.keyword}" ${c.trend.rising ? `상승 ${c.trend.ratio}배` : '평탄'}/지수 ${c.trend.peak}`);
        if (c.searchVolume) 조각.push(`월 ${c.searchVolume.total.toLocaleString('ko-KR')}회/경쟁 ${c.searchVolume.competition || '미상'}`);
        log.info(`  ${i + 1}. [${c.score}점] ${c.label.slice(0, 40)}${조각.length ? ` · ${조각.join(' · ')}` : ''}`);
      });

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
 * 종목을 가로질러 가장 좋은 글감만 쓴다.
 *
 * 왜 이렇게 하나
 *   뉴스 수집은 RSS라 공짜다. 돈이 드는 건 사실확인과 작성이다. 그래서 전
 *   종목을 넓게 훑어 후보를 한 자리에 모아 놓고, 그중 점수가 가장 높은 것
 *   몇 개만 쓴다. 비용은 그 몇 개 값 그대로인데 고르는 눈은 훨씬 넓어진다.
 *
 *   종목별로 1편씩 쓰면 "야구에 좋은 글감이 없는 날에도 야구 글을 쓰는" 일이
 *   생긴다. 이쪽은 그날 가장 좋은 것만 고른다.
 */
async function writeBestAcrossTopics({ topics, cfg, args, siteCategories, seoFields, today, wpAvailable, recentCats = null }) {
  log.section('🔎 전 종목에서 글감 찾기');

  const pool = [];
  for (const topic of topics) {
    try {
      const { clusters, stats } = await collectTopic(topic, cfg, { fixture: args.fixture, recentCats });
      log.info(`${topic.name}: 수집 ${stats.raw}건 → 후보 ${clusters.length}개`);
      pool.push(...clusters);
    } catch (err) {
      log.warn(`${topic.name}: 수집 실패 — 건너뜁니다 (${err.message})`);
    }
  }

  if (!pool.length) {
    log.warn('모든 종목에서 글감을 찾지 못했습니다.');
    return [];
  }

  // 네이버 신호는 상위 후보에만 붙인다. 한 번에 5개까지만 물어볼 수 있다.
  pool.sort((a, b) => b.score - a.score);
  const 붙임 = [];
  if (hasNaverTrend()) {
    await attachTrend(pool, {
      limit: 5, keywordOf: searchKeywordFor,
      onError: (why) => log.warn(`  검색 추이 조회 실패 — 대리 신호로 진행합니다: ${why}`),
    });
    붙임.push('데이터랩 추이');
  }
  if (hasNaverKeywords()) {
    await attachSearchVolume(pool, {
      limit: 5,
      onError: (why) => log.warn(`  검색수 조회 실패 — 대리 신호로 진행합니다: ${why}`),
    });
    붙임.push('검색수');
  }
  // 신호를 붙였으면 다시 채점한다. 글감마다 종목이 다르므로 제 종목으로 채점한다.
  const byName = new Map(topics.map((t) => [t.name, t]));
  if (붙임.length) {
    for (const c of pool) {
      const t = byName.get(c.topic);
      if (t) Object.assign(c, rankClusters([c], t, { recentCategories: recentCats })[0]);
    }
    pool.sort((a, b) => b.score - a.score);
  }

  log.raw('');
  log.info(`후보 ${pool.length}개 중 ${args.best}개 선정${붙임.length ? ` (${붙임.join(' + ')} 반영)` : ''}`);
  pool.slice(0, 8).forEach((c, i) => {
    const 조각 = [];
    if (c.trend) 조각.push(`${c.trend.rising ? `상승 ${c.trend.ratio}배` : '평탄'}/지수 ${c.trend.peak}`);
    if (c.searchVolume) 조각.push(`월 ${c.searchVolume.total.toLocaleString('ko-KR')}회`);
    log.info(`  ${i + 1}. [${c.score}점] ${c.topic} — ${c.label.slice(0, 36)}${조각.length ? ` · ${조각.join(' · ')}` : ''}`);
  });

  const maxExtra = Number(env('MAX_EXTRA_CANDIDATES', '2'));
  const results = [];
  let produced = 0;
  let extra = 0;

  for (const cluster of pool) {
    if (produced >= args.best) break;
    if (extra > maxExtra) {
      log.warn(`  다음 후보 시도를 ${maxExtra}번까지만 합니다. 여기서 멈춥니다.`);
      break;
    }

    log.raw('');
    log.step(`처리: [${cluster.topic}] ${cluster.label.slice(0, 44)}`);
    let r;
    try {
      r = await processCluster(cluster, { ...args, siteCategories, seoFields, today, wpAvailable });
    } catch (err) {
      log.fail('  이 글감 처리 실패', err);
      r = { topic: cluster.topic, label: cluster.label, error: err.message };
    }
    results.push(r);

    if (r.skipped || r.error) {
      extra++;
      if (extra <= maxExtra && produced < args.best) log.info('  다음 후보로 넘어갑니다.');
    } else {
      produced++;
    }
  }

  return [{ topic: '전 종목', candidates: pool.length, results }];
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
