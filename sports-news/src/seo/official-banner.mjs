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
// 낱말 경계는 watch-banner 의 것과 같다 — 낱말횟수() 가 같은 정규식을 쓴다.
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

/** 그 말이 글에 낱말로 몇 번 나오나. 낱말로있나() 와 같은 경계를 쓴다. */
export function 낱말횟수(text, word) {
  const w = String(word || '').trim();
  if (!w) return 0;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, 'gi');
  return (String(text || '').match(re) || []).length;
}

/**
 * 글에 이름이 나오는 공식 사이트를 찾는다. 없으면 null.
 *
 * **가장 많이 나온 곳을 쓴다**(2026-10-18 고침). 예전에는 설정에 적힌 순서대로
 * 첫 번째로 걸린 곳을 썼는데, 골프 투어를 아홉 개 넣으면서 그게 무너졌다 —
 * 최혜진(LPGA) 글에 'KLPGA 출신'이라는 한마디가 들어 있고, 국내 KLPGA 대회
 * 글에는 'LPGA 진출'이 들어 있다. 순서로 고르면 둘 중 한쪽은 반드시 틀린
 * 배너가 붙는다. 그 글이 무엇에 관한 글인지는 **몇 번 나오는지**가 말해 준다.
 *
 * 횟수가 같으면 설정에 적힌 순서를 따른다 — 예전과 같은 결과다.
 */
export function pickOfficial(text, cfg = loadOfficialLinks()) {
  const 글 = String(text || '');
  if (!글.trim()) return null;
  let 고른것 = null; let 최다 = 0;
  for (const site of cfg.sites) {
    const 이름들 = [site.이름, ...(site.match || [])].filter(Boolean);
    const 횟수 = 이름들.reduce((n, w) => n + 낱말횟수(글, w), 0);
    if (횟수 > 최다) { 최다 = 횟수; 고른것 = site; }
  }
  return 고른것;
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
