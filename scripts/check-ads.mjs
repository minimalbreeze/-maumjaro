#!/usr/bin/env node
// 광고 검사 — 넣지 말아야 할 곳에 안 들어갔는지, 정책을 지켰는지 본다
//
// 왜 테스트로 막는가:
// 2026-11-10 운영자 지시 "광고 정책 위반은 절대 안 된다. 꼭! 지켜라".
// 수익보다 위에 둔다 — 광고 하나 더 넣어 버는 돈보다 계정이 막히는 쪽이 훨씬 비싸다.
// 그리고 "감정 페이지에는 안 넣는다"는 눈으로 지킬 수 없다. 페이지가 220장이고
// 템플릿 한 줄만 바뀌어도 28장에 한꺼번에 들어간다.
//
// 실행:  node scripts/check-ads.mjs   (build-pages.mjs 를 먼저 돌릴 것)
//
// 검사하는 것
//   1. 앱(`index.html`)에 광고가 없는가 — 루트 지시서의 절대선
//   2. 감정 28장에 광고가 없는가 — 2026-11-16 효성님 승인
//   3. 나머지 페이지에 정확히 2개(본문·맨 아래)인가
//   4. 고지문이 **광고보다 앞**에 있는가
//   5. 고지문이 12px 이상이고 명암비 4.5 이상인가
//   6. subId 가 비어 있지 않은가 — 측정 없이 붙이면 어디가 돈이 됐는지 모른다
//   7. 전면 팝업·하단 고정바가 없는가
//
// ⚠️ 2026-11-19 부터 광고는 **꺼져 있다**(효성님 실업급여 신청). 꺼져 있으면
//    검사가 뒤집힌다 — "정확히 2개" 대신 "한 장도 없다"를 본다. 스위치는
//    `scripts/build-pages.mjs` 의 `ADS_ON` 이고, 이 검사는 그 값을 읽어서
//    어느 쪽을 봐야 하는지 스스로 정한다. 스위치만 켜고 빌드를 안 하면
//    (또는 그 반대면) 여기서 걸린다.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const bad = (m) => { console.error('  ✗', m); fail += 1; };
const good = (m) => console.log('  ✓', m);

const AD = 'ads-partners.coupang.com';

// 광고 스위치를 빌드 스크립트에서 그대로 읽는다. 두 군데에 적어 두면 갈린다.
const buildSrc = readFileSync(join(ROOT, 'scripts/build-pages.mjs'), 'utf8');
const m = buildSrc.match(/^const ADS_ON = (true|false);/m);
if (!m) { console.error('  ✗ build-pages.mjs 에서 ADS_ON 을 못 찾았다'); process.exit(1); }
const ADS_ON = m[1] === 'true';
console.log(`광고 스위치: ${ADS_ON ? 'ON' : 'OFF'}`);

// 생성된 페이지를 모은다(sitemap 기준이라 앱·초안과 섞이지 않는다)
const sm = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...sm.matchAll(/<loc>https:\/\/maumjaro\.minimalbreeze\.com(.*?)<\/loc>/g)].map((m) => m[1]);
const pages = urls
  .map((u) => ({ url: u, file: join(ROOT, u.replace(/^\/|\/$/g, ''), 'index.html') }))
  .filter((p) => p.url !== '/' && existsSync(p.file));

console.log(`[0] 생성 페이지 ${pages.length}장`);
if (pages.length < 200) bad(`페이지가 ${pages.length}장뿐이다 — build-pages.mjs 를 먼저 돌려라`);
else good(`${pages.length}장`);

console.log('[1] 앱 안에는 광고가 없다 (절대선)');
const app = readFileSync(join(ROOT, 'index.html'), 'utf8');
if (app.includes(AD) || /coupang/i.test(app)) bad('index.html 에 쿠팡 코드가 있다 — 앱 안에는 광고를 넣지 않는다');
else good('index.html 깨끗');
// 앱이 읽는 JS 에도 없어야 한다
for (const f of readdirSync(ROOT).filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  if (/coupang/i.test(src)) bad(`${f} 에 쿠팡 코드가 있다`);
}
if (!fail) good('앱 JS 도 깨끗');

// ---- 광고가 꺼져 있을 때: 한 장도 없어야 한다 ----
if (!ADS_ON) {
  console.log('[2] 어느 페이지에도 광고가 없다 (스위치 OFF)');
  let hit = 0;
  for (const p of pages) {
    const h = readFileSync(p.file, 'utf8');
    if (h.includes(AD) || /coupang/i.test(h)) { bad(`${p.url} 에 아직 쿠팡 코드가 있다 — 다시 빌드해라`); hit += 1; }
  }
  if (!hit) good(`${pages.length}장 전부 쿠팡 코드 0건`);

  console.log('[3] 제휴 고지문도 남아 있지 않다');
  let note = 0;
  for (const p of pages) {
    if (readFileSync(p.file, 'utf8').includes('쿠팡 파트너스 활동의 일환')) { bad(`${p.url} 에 제휴 고지문이 남아 있다`); note += 1; }
  }
  if (!note) good('고지문 0건');

  console.log('[4] 다시 켤 수 있게 코드는 남아 있다');
  if (!/PartnersCoupang\.G/.test(buildSrc)) bad('build-pages.mjs 에서 광고 코드가 사라졌다 — 지우지 말고 스위치로 끈다');
  else good('ADS_ON = true 한 줄로 되돌릴 수 있다');

  console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과 (광고 OFF)');
  process.exit(fail ? 1 : 0);
}

console.log('[2] 감정 페이지에는 광고가 없다');
const emo = pages.filter((p) => p.url.startsWith('/emotion/'));
if (!emo.length) bad('감정 페이지를 못 찾았다');
let emoHit = 0;
for (const p of emo) {
  if (readFileSync(p.file, 'utf8').includes(AD)) { bad(`${p.url} 에 광고가 있다`); emoHit += 1; }
}
if (!emoHit) good(`감정 ${emo.length}장 전부 광고 0건`);

console.log('[3] 나머지는 정확히 2개');
const rest = pages.filter((p) => !p.url.startsWith('/emotion/'));
const counts = new Map();
for (const p of rest) {
  const html = readFileSync(p.file, 'utf8');
  const n = (html.match(new RegExp(AD.replace(/\./g, '\\.'), 'g')) || []).length;
  counts.set(n, (counts.get(n) || 0) + 1);
  if (n !== 2) bad(`${p.url}: 광고 ${n}개 (2개여야 한다)`);
}
if ([...counts.keys()].every((k) => k === 2)) good(`${rest.length}장 전부 2개 (본문·맨 아래)`);

console.log('[4~7] 정책');
const sample = rest[0];
const html = readFileSync(sample.file, 'utf8');

// 4. 고지문이 광고보다 앞
const noteIdx = html.indexOf('쿠팡 파트너스 활동의 일환');
const adIdx = html.indexOf(AD);
if (noteIdx < 0) bad('제휴 고지문이 없다');
else if (noteIdx > adIdx) bad('고지문이 광고보다 뒤에 있다');
else good('고지문이 광고보다 앞');

// 5. 크기·명암비
const css = (html.match(/\.ad-note\{([^}]*)\}/) || [])[1] || '';
const size = Number((css.match(/font-size:\s*([\d.]+)px/) || [])[1] || 0);
if (size < 12) bad(`고지문이 ${size}px — 12px 이상이어야 한다`);
else good(`고지문 ${size}px`);

const fg = (css.match(/color:\s*(#[0-9a-f]{6})/i) || [])[1];
const bg = (html.match(/--bg:\s*(#[0-9a-f]{6})/i) || [])[1];
function lum(h) {
  const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
if (!fg || !bg) bad(`색을 읽지 못했다 (fg=${fg} bg=${bg})`);
else {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  const ratio = (a + 0.05) / (b + 0.05);
  if (ratio < 4.5) bad(`고지문 명암비 ${ratio.toFixed(2)} — 4.5 이상이어야 한다 (${fg} on ${bg})`);
  else good(`고지문 명암비 ${ratio.toFixed(2)} (${fg} on ${bg})`);
}

// 6. subId
const subs = new Set();
for (const p of rest) {
  const h = readFileSync(p.file, 'utf8');
  for (const m of h.matchAll(/"subId":"([^"]*)"/g)) {
    if (!m[1]) { bad(`${p.url}: subId 가 비었다 — 어디서 난 수익인지 못 잰다`); }
    subs.add(m[1]);
  }
}
if (!subs.has('')) good(`subId ${subs.size}종 (${[...subs].sort().join(' · ')})`);

// 7. 전면 팝업·고정바 없음
for (const p of rest.slice(0, 20)) {
  const h = readFileSync(p.file, 'utf8');
  if (/position:\s*fixed/.test(h)) bad(`${p.url}: 고정 요소가 있다 — 하단 고정바를 쓰지 않는다`);
  if (/interstitial|전면\s*광고/.test(h)) bad(`${p.url}: 전면 광고 흔적`);
}
if (!fail) good('전면 팝업·고정바 없음');

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
