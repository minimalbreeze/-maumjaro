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

/** 이 글에 붙일 중계 링크를 고른다. 없으면 null — 배너를 넣지 않는다. */
export function pickWatchLinks(category, { config = loadWatchLinks() } = {}) {
  const entry = config.byCategory?.[category];
  if (!entry?.primary?.url) return null;
  return entry;
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 배너 HTML을 만든다.
 * 워드프레스 블록 에디터에서도 그대로 보이도록 인라인 스타일만 쓴다
 * (테마 CSS에 기대면 테마를 바꿀 때 깨진다).
 */
export function watchBannerHtml(entry, { title = '' } = {}) {
  if (!entry?.primary?.url) return '';

  const p = entry.primary;
  const extras = (entry.secondary || [])
    .filter((s) => s?.url && s?.text)
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener nofollow"
        style="color:#6b2d8f;font-weight:600;text-decoration:underline;">${esc(s.text)}</a>`)
    .join(' · ');

  return `<!-- wp:html -->
<div style="margin:32px 0;padding:22px 20px;border-radius:16px;background:linear-gradient(135deg,#b779ef,#ff8fb3);text-align:center;">
  <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;margin-bottom:6px;">📺 경기 보러가기</div>
  ${title ? `<div style="color:#ffffff;font-size:17px;font-weight:700;margin-bottom:14px;">${esc(title)}</div>` : ''}
  <a href="${esc(p.url)}" target="_blank" rel="noopener nofollow"
     style="display:inline-block;padding:13px 28px;border-radius:999px;background:#ffffff;color:#6b2d8f;font-size:17px;font-weight:800;text-decoration:none;">
    ${esc(p.text)} →
  </a>
  ${p.hint ? `<div style="color:#ffffff;font-size:13px;opacity:0.92;margin-top:10px;">${esc(p.hint)}</div>` : ''}
</div>
${extras ? `<p style="text-align:center;font-size:14px;margin-top:-16px;margin-bottom:28px;">${extras}</p>` : ''}
<!-- /wp:html -->`;
}
