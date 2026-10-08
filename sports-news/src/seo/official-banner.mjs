// 구단·협회 공식 홈페이지로 가는 배너.
//
// 원칙은 watch-banner·app-banner 와 같다: **주소를 만들어내지 않는다.**
//   config/official-links.json 에 사람이 확인해 적어둔 주소만 쓴다.
//   비어 있거나 모양이 이상하면 배너를 아예 넣지 않는다.
//
// 공식 사이트에서 특히 조심할 것: 팬 사이트·위키·커뮤니티 주소를 '공식'이라고
// 걸면 깨진 링크보다 나쁘다. 그래서 설정에 확인방법까지 적게 해 두었다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../utils/env.mjs';
import { 낱말로있나 } from './watch-banner.mjs';
import { 배너카드 } from './banner-card.mjs';

export const OFFICIAL_MARK = '🏟️ 공식 홈페이지';

let cache = null;
export function loadOfficialLinks() {
  if (cache) return cache;
  const file = path.join(ROOT, 'config', 'official-links.json');
  try {
    cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { sites: [] };
  } catch {
    cache = { sites: [] };
  }
  if (!Array.isArray(cache.sites)) cache.sites = [];
  return cache;
}

/**
 * 공식 홈페이지로 쓸 만한 주소인가.
 *
 * 모양만 본다. 그 페이지가 실제로 열리는지는 확인하지 못한다 — 이 컨테이너는
 * 바깥 주소 대부분이 막혀 있다. 대신 사람이 설정에 잘못 붙여넣는 것들
 * (http, 위키·나무위키·커뮤니티, 검색 결과 주소)은 여기서 걸러낸다.
 */
export function 공식주소인가(url) {
  const u = String(url || '').trim();
  if (!/^https:\/\/[^/\s]+\.[a-z]{2,}(\/|$)/i.test(u)) return false;
  // 팬 사이트·백과사전을 '공식'이라고 걸지 않는다.
  if (/(namu\.wiki|wikipedia\.org|fandom\.com|blog\.naver|cafe\.naver|tistory\.com)/i.test(u)) return false;
  // 검색 결과 주소도 공식 페이지가 아니다.
  if (/[?&](q|query|search|keyword)=/i.test(u)) return false;
  return true;
}

/** 글에 이름이 나오는 공식 사이트를 찾는다. 없으면 null. */
export function pickOfficial(text, cfg = loadOfficialLinks()) {
  const 글 = String(text || '');
  if (!글.trim()) return null;
  for (const site of cfg.sites) {
    const 이름들 = [site.이름, ...(site.match || [])].filter(Boolean);
    if (이름들.some((n) => 낱말로있나(글, n))) return site;
  }
  return null;
}

/** 배너 HTML. 주소가 없거나 모양이 이상하면 빈 글. */
export function officialBannerHtml(site) {
  if (!site?.url || !공식주소인가(site.url)) return '';
  const 이름 = site.이름 || '공식 홈페이지';
  return 배너카드({
    표식: OFFICIAL_MARK,
    이름,
    cta: site.cta || `${이름} 가기`,
    url: site.url,
    hint: site.hint || '',
  });
}

/** 글에 맞는 공식 홈페이지 배너. 설정에 없으면 빈 글. */
export function officialBannerFor(text) {
  return officialBannerHtml(pickOfficial(text));
}

/** 설정에 있는데 주소가 없거나 모양이 이상한 것들 — 로그로 알려주기 위한 것. */
export function 주소없는사이트(cfg = loadOfficialLinks()) {
  return cfg.sites.filter((s) => !공식주소인가(s.url)).map((s) => s.이름);
}
