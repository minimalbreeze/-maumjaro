// 본문에 이미지와 광고를 끼워 넣는다.
//
// 본문은 마크다운이고, 최종적으로 워드프레스 블록 HTML로 변환된다.
// 여기서는 변환 전 마크다운 단계에 자리표시자를 넣고, 변환 시 HTML로 바꾼다.

export const IMAGE_MARK = (i) => `<!--IMG:${i}-->`;
export const AD_MARK = '<!--AD-->';

import { WATCH_MARK } from '../seo/watch-banner.mjs';
export { WATCH_MARK };

/** 맘운자로로 링크를 건 이미지 HTML. 사용자 요청. */
export function imageHtml({ url, alt, link = 'https://maumjaro.minimalbreeze.com/' }) {
  const a = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!-- wp:image {"linkDestination":"custom"} -->
<figure class="wp-block-image size-large"><a href="${a(link)}" target="_blank" rel="noopener"><img src="${a(url)}" alt="${a(alt)}"/></a></figure>
<!-- /wp:image -->`;
}

/**
 * 쿠팡 파트너스 광고 블록.
 * 스크립트가 살아 있어야 하므로 wp:html 블록으로 넣는다.
 * 고지 문구는 법적으로 필요하므로 항상 함께 넣는다.
 */
export function adHtml(snippet) {
  return `<!-- wp:html -->
${snippet.trim()}
<!-- /wp:html -->`;
}

/**
 * 소제목(## ...) 위치를 찾아 이미지·광고 자리를 잡는다.
 *
 * - 대표 이미지는 글 맨 위 (첫 문단 뒤)
 * - 중계 배너는 두 번째 소제목 앞 — 개요를 읽고 "그래서 어디서 보지?"가
 *   떠오르는 자리다. 글 끝에 두면 거기까지 안 내려간 사람이 못 본다.
 * - 본문 카드는 중간 소제목 앞
 * - 광고는 글 한가운데 소제목 앞 — "자연스럽게 보이도록"
 */
export function planPlacements(body, { sectionImages = 1, withAd = true, withWatch = false } = {}) {
  const lines = body.split('\n');
  const headings = [];
  lines.forEach((l, i) => { if (/^##\s+/.test(l)) headings.push({ index: i, text: l }); });

  const plan = { heroAfterLine: null, sections: [], adBeforeLine: null, watchBeforeLine: null, headings };

  // 대표 이미지: 첫 소제목 바로 앞(= 도입부 뒤)
  plan.heroAfterLine = headings.length ? headings[0].index : 0;

  // 광고: 가운데 소제목 앞. 너무 위/아래면 어색하다.
  if (withAd && headings.length >= 3) {
    plan.adBeforeLine = headings[Math.floor(headings.length / 2)].index;
  }

  // 중계 배너: 두 번째 소제목 앞. 광고와 같은 자리에 겹치지 않게 한다.
  if (withWatch && headings.length >= 2) {
    const candidate = headings[1].index;
    plan.watchBeforeLine = candidate === plan.adBeforeLine ? (headings[2]?.index ?? null) : candidate;
  }

  // 본문 카드: 광고·배너와 겹치지 않는 소제목 앞
  const used = new Set([plan.heroAfterLine, plan.adBeforeLine, plan.watchBeforeLine]);
  for (const h of headings.slice(1)) {
    if (plan.sections.length >= sectionImages) break;
    if (used.has(h.index)) continue;
    plan.sections.push(h);
    used.add(h.index);
  }
  return plan;
}

/** 계획대로 자리표시자를 끼워 넣은 본문을 돌려준다. */
export function insertMarks(body, plan) {
  const lines = body.split('\n');
  const inserts = new Map();
  const add = (idx, text) => {
    if (!inserts.has(idx)) inserts.set(idx, []);
    inserts.get(idx).push(text);
  };

  if (plan.heroAfterLine !== null) add(plan.heroAfterLine, IMAGE_MARK(0));
  if (plan.adBeforeLine !== null) add(plan.adBeforeLine, AD_MARK);
  if (plan.watchBeforeLine !== null) add(plan.watchBeforeLine, WATCH_MARK);
  plan.sections.forEach((h, i) => add(h.index, IMAGE_MARK(i + 1)));

  const out = [];
  lines.forEach((l, i) => {
    for (const mark of inserts.get(i) || []) { out.push(mark); out.push(''); }
    out.push(l);
  });
  return out.join('\n');
}
