// 경기를 바로 보러 갈 수 있는 배너.
//
// 원칙: 주소를 만들어내지 않는다.
//   config/watch-links.json에 사람이 확인해 적어둔 주소만 쓴다. 설정에 없는
//   카테고리는 배너를 아예 넣지 않는다. 없는 링크를 배너로 거는 것은 독자를
//   속이는 일이고, 깨진 링크는 검색 순위에도 나쁘다.
//
// 스타일은 맘운자로 브랜드 색(보라~핑크 CTA 그라디언트)을 그대로 쓴다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../utils/env.mjs';

export const WATCH_MARK = '<!--WATCH-->';

/**
 * 배너 머리글의 기본값. 이 글귀가 "중계 배너임"을 알아보는 표시이기도 하다.
 * 이미 올린 글 수백 편에 이 글귀로 박혀 있으므로 바꾸지 않는다.
 */
export const DEFAULT_WATCH_LABEL = '📺 경기 보러가기';

/**
 * 그 항목이 쓸 머리글.
 *
 * 2026-10-13: 불꽃축제 글에 다시보기 배너를 달면서 필요해졌다. 축제는 경기가
 * 아니라 "경기 보러가기"가 틀린 말이 된다. 설정에 `라벨` 을 적은 항목만
 * 그 글귀를 쓰고, 안 적은 항목은 예전 그대로다 — 기존 글은 하나도 안 바뀐다.
 */
export function watchLabel(entry) {
  const v = String(entry?.라벨 || '').trim();
  return v || DEFAULT_WATCH_LABEL;
}

/**
 * 설정에 있는 모든 머리글. 이미 올린 글에서 배너를 찾을 때 이걸 다 본다.
 *
 * 하나만 보면 안 된다. 어떤 글에 기본 글귀로 배너가 들어가 있는데 나중에 그
 * 카테고리에 `라벨` 이 생기면, 새 글귀로만 찾다가 못 찾고 배너를 하나 더
 * 넣게 된다.
 */
export function allWatchLabels(config = loadWatchLinks()) {
  const out = new Set([DEFAULT_WATCH_LABEL]);
  for (const entry of Object.values(config?.byCategory || {})) {
    out.add(watchLabel(entry));
    for (const m of entry?.match || []) out.add(watchLabel(m));
  }
  return [...out];
}

let cache = null;
export function loadWatchLinks() {
  if (cache) return cache;
  const file = path.join(ROOT, 'config', 'watch-links.json');
  try {
    cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { byCategory: {} };
  } catch {
    cache = { byCategory: {} };
  }
  return cache;
}

/**
 * 그 말이 낱말로 들어 있는지. 글자 포함(includes)으로는 안 된다.
 *
 * 'KBL'이 'WKBL' 안에 들어 있다. 포함으로 보면 여자농구(WKBL) 글이 남자농구
 * 항목에 걸려서 tvN SPORTS 배너가 붙는다 — 독자가 눌러도 그 경기가 없다.
 * 검사가 실제로 이걸 잡았다.
 *
 * 앞뒤가 영문·숫자면 낱말이 아닌 것으로 본다. 한글은 조사가 붙으므로
 * ('KBL이', '창원 LG가') 막지 않는다.
 */
export function 낱말로있나(text, word) {
  const w = String(word || '').trim();
  if (!w) return false;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, 'i').test(String(text || ''));
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
 * 이 글에 붙일 중계 링크를 고른다. 없으면 null — 배너를 넣지 않는다.
 *
 * 카테고리만 보면 안 된다. '농구'에는 KBL(남자)과 WKBL(여자)이 같이 들어 있고
 * 중계처가 서로 다르다. 카테고리만 보고 고르면 KBL 글에 여자농구 중계 배너가
 * 붙는다 — 독자가 눌러도 그 경기가 없다.
 *
 * 그래서 match 를 먼저 본다. 글 제목·본문에 그 말이 있으면 그 항목을 쓰고,
 * 없으면 카테고리 기본값으로 돌아간다.
 */
export function pickWatchLinks(category, { config = loadWatchLinks(), text = '' } = {}) {
  const entry = config.byCategory?.[category];
  if (!entry) return null;

  // **가장 많이 나온 항목을 쓴다**(2026-10-18 고침). 예전에는 설정에 적힌
  // 순서대로 첫 번째로 걸린 항목을 썼는데, 골프에 투어를 여덟 개 넣으면서
  // 그게 무너졌다 — 임성재 마카오 오픈 글은 아시안투어를 여덟 번 쓰고 'PGA
  // 투어'를 두 번 쓰는데, 순서로 고르니 PGA TOUR 중계가 붙었다. 독자가
  // 눌러도 그 경기가 없다. 그 글이 무슨 대회 글인지는 몇 번 나오는지가
  // 말해 준다. 횟수가 같으면 설정에 적힌 순서를 따른다 — 예전과 같다.
  const 글 = String(text || '');
  let 고른것 = null; let 최다 = 0;
  for (const m of entry.match || []) {
    if (!m?.primary?.url) continue;
    const 횟수 = (m.keywords || []).reduce((n, w) => n + 낱말횟수(글, w), 0);
    if (횟수 > 최다) { 최다 = 횟수; 고른것 = m; }
  }
  // **제외어가 더 많이 나오면 배너를 붙이지 않는다**(2026-10-19 추가).
  // 중계 배너를 359편에 한꺼번에 돌리면서 드러났다 — GTOUR·WGTOUR
  // 스크린골프 글(626)에 KLPGA 유튜브가 붙었다. KLPGA 채널에는 KLPGA
  // 경기만 올라오니 독자가 눌러도 그 경기가 없다. 스크린골프 중계 주소는
  // 운영자가 아직 주지 않았고, **없는 주소를 코드가 만들지 않는다.**
  // 그래서 "틀리게 붙이는 것보다 안 붙이는 쪽"을 고른다.
  //
  // 위의 "가장 많이 나온 것이 이긴다"와 같은 저울을 쓴다. 제외어가 한 번
  // 스쳤다고 배너를 버리지는 않는다 — 'LPGA·KLPGA·JLPGA 시청 가이드' 글이
  // 스크린골프를 한 줄 언급했다고 중계를 잃으면 그게 더 손해다.
  // 같은 횟수면 제외가 이긴다: 어느 쪽인지 모르면 안 붙이는 쪽이다.
  const 제외횟수 = (entry.제외 || []).reduce((n, w) => n + 낱말횟수(글, w), 0);
  if (제외횟수 && 제외횟수 >= 최다) return null;

  if (고른것) return 고른것;

  if (!entry.primary?.url) return null;
  return entry;
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 배너 HTML을 만든다.
 *
 * 워드프레스 블록 에디터에서도 그대로 보이도록 인라인 스타일만 쓴다
 * (테마 CSS에 기대면 테마를 바꿀 때 깨진다).
 *
 * 글 제목을 배너 안에 다시 쓰지 않는다. 예전에는 썼는데, 글 제목이 길면
 * ('2026-27 KBL 경기일정과 중계 어디서 보나') 카드 안에서 두세 줄로 접혀
 * 어색했고, 바로 그 글을 읽는 중이라 같은 말이 두 번 나오는 셈이었다.
 * 무엇의 중계인지는 CTA 글귀와 hint 가 이미 말해 준다.
 *
 * 링크는 현재 창에서 연다. 새 창으로 띄우면 독자가 원래 글로 돌아오는 길을
 * 잃는다. target이 없으니 noopener도 필요 없다. 바깥 링크에만 nofollow 를 남긴다 — 내 블로그 안으로 가는 링크에는 안 붙인다.
 */
/**
 * 내 블로그 안으로 가는 링크인가.
 *
 * 2026-10-19: 야구 중계는 티빙·쿠팡플레이·네이버로 쪼개져 있고 유료다.
 * 바깥으로 보내면 독자가 거기서 또 헤맨다. 그래서 운영자가 내부 안내 글
 * (5762 '2026 KBO 프로야구')로 보내기로 정했다.
 *
 * 내부 링크에는 **nofollow 를 붙이지 않는다.** 그건 "이 링크를 신뢰하지
 * 않는다"는 뜻이라, 내 글에 붙이면 내가 내 글을 깎는다. add-notice.mjs 가
 * 같은 이유로 안 붙인다.
 */
export function 내부주소인가(url, base = process.env.WORDPRESS_URL || '') {
  try {
    return new URL(String(url)).host === new URL(String(base)).host;
  } catch {
    return false;
  }
}

/** 링크에 붙일 rel. 내부면 없음(빈 글), 바깥이면 nofollow 를 남긴다. */
export function relFor(url, base) {
  return 내부주소인가(url, base) ? '' : ' rel="nofollow"';
}

export function watchBannerHtml(entry) {
  if (!entry?.primary?.url) return '';

  const p = entry.primary;
  const extras = (entry.secondary || [])
    .filter((s) => s?.url && s?.text)
    .map((s) => `<a href="${esc(s.url)}"${relFor(s.url)}
        style="color:#6b2d8f;font-weight:600;text-decoration:underline;">${esc(s.text)}</a>`)
    .join(' · ');

  // 다시보기는 생중계와 주소가 다르다. 끝난 경기 글에는 이쪽이 더 맞다.
  // vod 가 설정에 없으면 버튼을 넣지 않는다 — 주소를 만들어내지 않는다.
  // 생중계와 주소가 같으면 버튼을 넣지 않는다. 같은 곳으로 가는 버튼이 둘이면
  // 독자가 "다시보기"를 눌렀는데 생중계 첫 화면이 나온다 — 속이는 것에 가깝다.
  const v = entry.vod?.url && entry.vod.url !== p.url ? entry.vod : null;
  const 다시보기 = v?.url && v?.text
    ? `
  <a href="${esc(v.url)}"${relFor(v.url)}
     style="display:inline-block;margin-left:8px;padding:13px 28px;border-radius:999px;background:rgba(255,255,255,0.22);color:#ffffff;font-size:17px;font-weight:800;text-decoration:none;border:2px solid #ffffff;">
    ▶ ${esc(v.text)}
  </a>`
    : '';

  return `<!-- wp:html -->
<div style="margin:32px 0;padding:22px 20px;border-radius:16px;background:linear-gradient(135deg,#b779ef,#ff8fb3);text-align:center;">
  <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;margin-bottom:6px;">${esc(watchLabel(entry))}</div>
  <a href="${esc(p.url)}"${relFor(p.url)}
     style="display:inline-block;padding:13px 28px;border-radius:999px;background:#ffffff;color:#6b2d8f;font-size:17px;font-weight:800;text-decoration:none;">
    ${esc(p.text)} →
  </a>${다시보기}
  ${p.hint ? `<div style="color:#ffffff;font-size:13px;opacity:0.92;margin-top:10px;">${esc(p.hint)}</div>` : ''}
  ${v?.hint ? `<div style="color:#ffffff;font-size:13px;opacity:0.92;margin-top:6px;">${esc(v.hint)}</div>` : ''}
</div>
${extras ? `<p style="text-align:center;font-size:14px;margin-top:-16px;margin-bottom:28px;">${extras}</p>` : ''}
<!-- /wp:html -->`;
}
