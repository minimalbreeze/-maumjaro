// 글 카테고리에 맞는 쿠팡 파트너스 광고를 고른다.
//
// 왜 필요한가
//   지금까지는 일반 캐러셀 하나만 썼다. 글 주제와 무관한 상품이 돌아간다 —
//   파크골프 글에 주방용품이 뜨는 식이다. 방금 읽은 내용과 관련된 물건이
//   보여야 클릭이 난다.
//
// 링크가 없는 카테고리는 기존 캐러셀을 그대로 쓴다. 링크를 바꾸려면
// config/ad-by-category.json 의 url 만 고치면 된다. 코드는 안 건드려도 된다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../utils/env.mjs';

/** 쿠팡 파트너스 고지문. 법적으로 필요하므로 어떤 광고든 함께 나간다. */
export const 고지문 = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다';

export function loadAdConfig() {
  const f = path.join(ROOT, 'config', 'ad-by-category.json');
  try {
    if (!fs.existsSync(f)) return { categories: {} };
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return { categories: j.categories || {} };
  } catch {
    return { categories: {} };
  }
}

/**
 * 이 카테고리에 쓸 광고를 고른다.
 *
 * url 이 비어 있으면 (아직 링크를 안 만든 종목) 못 고른 것으로 친다 —
 * 부르는 쪽이 기존 캐러셀로 넘어간다.
 */
export function pickAd(category, config = loadAdConfig()) {
  const key = String(category || '').trim();
  if (!key) return null;

  const hit = config.categories?.[key];
  if (!hit || !String(hit.url || '').trim()) return null;

  return { category: key, url: hit.url.trim(), label: String(hit.label || '').trim() };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 카테고리 광고 HTML.
 *
 * - 현재 창에서 연다. target="_blank" 를 쓰지 않는다(운영자 방침).
 * - rel 에 sponsored 와 nofollow 를 함께 둔다. 광고 링크는 sponsored 가 맞고,
 *   구글이 그걸로 광고임을 안다. 안 붙이면 링크 조작으로 볼 수 있다.
 * - 광고 앞 한 줄(label)을 둔다. 광고가 뜬금없이 나오면 그냥 넘기지만,
 *   "그래서 뭘 사야 하나"가 바로 앞에 적혀 있으면 광고가 답처럼 보인다.
 */
export function categoryAdHtml(ad) {
  if (!ad?.url) return '';
  const label = ad.label ? `<p>${escapeHtml(ad.label)}</p>\n` : '';
  return `${label}<p><a href="${escapeHtml(ad.url)}" rel="nofollow sponsored">${escapeHtml(ad.category)} 용품 보러가기 ›</a></p>
<p><small>${escapeHtml(고지문)}</small></p>`;
}

/**
 * 이 글에 넣을 광고 조각을 돌려준다.
 *
 * 카테고리 링크가 있으면 그것, 없으면 기존 캐러셀(fallback).
 * 둘 다 없으면 빈 문자열 — 광고 없이 글이 나간다.
 */
export function adSnippetFor(category, { fallback = '', config } = {}) {
  const ad = pickAd(category, config || loadAdConfig());
  if (ad) return { snippet: categoryAdHtml(ad), matched: true, url: ad.url, category: ad.category };
  return { snippet: String(fallback || '').trim(), matched: false, url: '', category: '' };
}
