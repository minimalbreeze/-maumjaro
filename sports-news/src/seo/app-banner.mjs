// 운영자가 만든 앱의 다운로드 배너.
//
// 원칙은 watch-banner.mjs 와 같다: **주소를 만들어내지 않는다.**
//   config/app-links.json 에 사람이 확인해 적어둔 주소만 쓴다. 비어 있으면
//   배너를 아예 넣지 않는다.
//
// 이게 왜 특히 중요한가: 2026-10-05 에 페이드캠 글을 쓰려고 앱스토어 주소를
// 찾았더니, 검색에 같은 이름의 **다른 개발사 앱**(중국 FadeCam, 빈티지 필터
// 카메라)이 나왔다. 그 주소를 '다운로드'라고 걸면 독자가 남의 앱을 받는다.
// 깨진 링크보다 나쁘다.
//
// 스타일은 맘운자로 브랜드 색(보라~핑크 CTA 그라디언트)을 그대로 쓴다.
// 링크는 현재 창에서 연다. target="_blank" 를 쓰지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../utils/env.mjs';
import { 낱말로있나 } from './watch-banner.mjs';

export const APP_MARK = '📱 앱 받으러 가기';

let cache = null;
export function loadAppLinks() {
  if (cache) return cache;
  const file = path.join(ROOT, 'config', 'app-links.json');
  try {
    cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { apps: [] };
  } catch {
    cache = { apps: [] };
  }
  if (!Array.isArray(cache.apps)) cache.apps = [];
  return cache;
}

/** 글 제목·본문에 이름이 들어 있는 앱을 찾는다. 없으면 null. */
export function pickApp(text, cfg = loadAppLinks()) {
  const 글 = String(text || '');
  if (!글.trim()) return null;
  for (const app of cfg.apps) {
    const 이름들 = [app.이름, ...(app.match || [])].filter(Boolean);
    if (이름들.some((n) => 낱말로있나(글, n))) return app;
  }
  return null;
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 앱스토어 주소가 그럴듯한 모양인지 본다.
 *
 * 모양만 보는 것이고 그 앱이 실제로 있는지는 확인하지 못한다 — 애플 도메인이
 * 막혀 있다. 그래도 사람이 설정에 잘못 붙여넣은 것(검색 페이지 주소, 개발자
 * 페이지 주소, http)은 여기서 걸러낸다.
 */
export function 앱스토어주소인가(url) {
  const u = String(url || '').trim();
  if (!u) return false;
  // id 뒤에 숫자가 오는 앱 상세 페이지만 받는다. /search, /developer 는 앱이 아니다.
  return /^https:\/\/apps\.apple\.com\/[a-z]{2}\/app\/[^/]+\/id\d+/.test(u);
}

/**
 * 배너 HTML을 만든다.
 *
 * 워드프레스 블록 에디터에서도 그대로 보이도록 인라인 스타일만 쓴다.
 * 앱 이름은 카드 안에 쓴다 — 중계 배너와 다른 점이다. 중계 배너는 "무엇의
 * 중계인지"가 글 제목에 이미 있지만, 앱 배너는 글 어디에서나 나올 수 있고
 * 독자가 "무슨 앱을 받는 건지" 한눈에 알아야 누른다.
 */
export function appBannerHtml(app) {
  if (!app?.url || !앱스토어주소인가(app.url)) return '';

  const 이름 = app.이름 || '앱';
  const cta = app.cta || `앱스토어에서 ${이름} 받기`;

  return `<!-- wp:html -->
<div style="margin:32px 0;padding:22px 20px;border-radius:16px;background:linear-gradient(135deg,#b779ef,#ff8fb3);text-align:center;">
  <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;margin-bottom:6px;">${esc(APP_MARK)}</div>
  <div style="color:#ffffff;font-size:20px;font-weight:800;margin-bottom:12px;">${esc(이름)}</div>
  <a href="${esc(app.url)}" rel="nofollow"
     style="display:inline-block;padding:13px 28px;border-radius:999px;background:#ffffff;color:#6b2d8f;font-size:17px;font-weight:800;text-decoration:none;">
    ${esc(cta)} →
  </a>
  ${app.hint ? `<div style="color:#ffffff;font-size:13px;opacity:0.92;margin-top:10px;">${esc(app.hint)}</div>` : ''}
</div>
<!-- /wp:html -->`;
}

/** 글에 맞는 앱 배너. 설정에 주소가 없으면 빈 글을 돌려준다. */
export function appBannerFor(text) {
  return appBannerHtml(pickApp(text));
}

/** 설정에 적혀 있는데 주소가 비어 있는 앱들 — 로그로 알려주기 위한 것. */
export function 주소없는앱(cfg = loadAppLinks()) {
  return cfg.apps.filter((a) => !앱스토어주소인가(a.url)).map((a) => a.이름);
}
