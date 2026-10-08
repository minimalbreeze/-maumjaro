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

  const 글 = String(text || '');
  for (const m of entry.match || []) {
    if (!m?.primary?.url) continue;
    if ((m.keywords || []).some((w) => 낱말로있나(글, w))) return m;
  }

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
 * 잃는다. target이 없으니 noopener도 필요 없다. 바깥 링크이므로 nofollow는 남긴다.
 */
export function watchBannerHtml(entry) {
  if (!entry?.primary?.url) return '';

  const p = entry.primary;
  const extras = (entry.secondary || [])
    .filter((s) => s?.url && s?.text)
    .map((s) => `<a href="${esc(s.url)}" rel="nofollow"
        style="color:#6b2d8f;font-weight:600;text-decoration:underline;">${esc(s.text)}</a>`)
    .join(' · ');

  // 다시보기는 생중계와 주소가 다르다. 끝난 경기 글에는 이쪽이 더 맞다.
  // vod 가 설정에 없으면 버튼을 넣지 않는다 — 주소를 만들어내지 않는다.
  // 생중계와 주소가 같으면 버튼을 넣지 않는다. 같은 곳으로 가는 버튼이 둘이면
  // 독자가 "다시보기"를 눌렀는데 생중계 첫 화면이 나온다 — 속이는 것에 가깝다.
  const v = entry.vod?.url && entry.vod.url !== p.url ? entry.vod : null;
  const 다시보기 = v?.url && v?.text
    ? `
  <a href="${esc(v.url)}" rel="nofollow"
     style="display:inline-block;margin-left:8px;padding:13px 28px;border-radius:999px;background:rgba(255,255,255,0.22);color:#ffffff;font-size:17px;font-weight:800;text-decoration:none;border:2px solid #ffffff;">
    ▶ ${esc(v.text)}
  </a>`
    : '';

  return `<!-- wp:html -->
<div style="margin:32px 0;padding:22px 20px;border-radius:16px;background:linear-gradient(135deg,#b779ef,#ff8fb3);text-align:center;">
  <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;margin-bottom:6px;">📺 경기 보러가기</div>
  <a href="${esc(p.url)}" rel="nofollow"
     style="display:inline-block;padding:13px 28px;border-radius:999px;background:#ffffff;color:#6b2d8f;font-size:17px;font-weight:800;text-decoration:none;">
    ${esc(p.text)} →
  </a>${다시보기}
  ${p.hint ? `<div style="color:#ffffff;font-size:13px;opacity:0.92;margin-top:10px;">${esc(p.hint)}</div>` : ''}
  ${v?.hint ? `<div style="color:#ffffff;font-size:13px;opacity:0.92;margin-top:6px;">${esc(v.hint)}</div>` : ''}
</div>
${extras ? `<p style="text-align:center;font-size:14px;margin-top:-16px;margin-bottom:28px;">${extras}</p>` : ''}
<!-- /wp:html -->`;
}
