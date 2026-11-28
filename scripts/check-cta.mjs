#!/usr/bin/env node
// 앱 유입 계측 검사 — 검색 페이지에서 앱으로 가는 길에 꼬리표가 붙어 있는가
//
// 왜 테스트로 막는가 (2026-11-28).
// 계측은 **조용히 깨진다.** 광고가 빠지면 화면에서 보이지만, data-cta 속성 하나가
// 사라지면 아무 일도 안 일어난 것처럼 보이고 한 달 뒤 리포트가 비었을 때 안다.
// 그때는 그 한 달치가 영영 없다.
//
// 배경: 2026-11-27 기준 네이버 30일 클릭 560 인데 앱 활성이 안 늘었다. 그런데
// **몇 명이 앱까지 넘어오는지 아무도 재고 있지 않았다.** 효성님 "클릭 이벤트
// 붙여줘"로 붙인 것이고, 한 달 뒤 이 숫자로 "유입이 앱과 안 맞는다"는 진단이
// 맞는지 갈린다.
//
// 실행:  node scripts/check-cta.mjs   (build-pages.mjs 를 먼저 돌릴 것)
//
// 검사하는 것
//   1. 모든 생성 페이지에 앱으로 가는 큰 CTA 가 있는가 (원칙 3 — 주사로 연결)
//   2. 그 CTA 에 data-cta(묶음)·data-spot(자리)이 붙어 있는가
//   3. href 에 ?from= 이 붙어 있는가 — 이벤트가 유실돼도 도착은 잡히게
//   4. 묶음 이름이 주소와 맞는가 (/emotion/ 이 emotion 으로 가는지 등)
//   5. 클릭을 세는 스크립트가 페이지에 있는가
//   6. ?from= 이 앱이 이미 쓰는 쿼리 키와 안 겹치는가 — 겹치면 동작이 바뀐다

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const bad = (m) => { console.error('  ✗', m); fail += 1; };
const good = (m) => console.log('  ✓', m);

const sm = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
const urls = [...sm.matchAll(/<loc>https:\/\/maumjaro\.minimalbreeze\.com(.*?)<\/loc>/g)].map((m) => m[1]);
const pages = urls
  .map((u) => ({ url: u, file: join(ROOT, u.replace(/^\/|\/$/g, ''), 'index.html') }))
  .filter((p) => p.url !== '/' && existsSync(p.file));

console.log(`[0] 생성 페이지 ${pages.length}장`);
if (pages.length < 200) bad(`${pages.length}장뿐이다 — build-pages.mjs 를 먼저 돌려라`);
else good(`${pages.length}장`);

// 주소 → 묶음. build-pages.mjs 의 pageKind 와 같아야 한다.
function expectKind(u) {
  if (/^\/animal\/year\//.test(u)) return 'year';
  if (/^\/animal\/[a-z]+\/lucky\//.test(u)) return 'lucky';
  if (/^\/animal\//.test(u)) return 'animal';
  if (/^\/zodiac\//.test(u)) return 'zodiac';
  if (/^\/tarot\//.test(u)) return 'tarot';
  if (/^\/mbti\//.test(u)) return 'mbti';
  if (/^\/match\//.test(u)) return 'match';
  if (/^\/happiness\//.test(u)) return 'happy';
  if (/^\/emotion\//.test(u)) return 'emotion';
  return 'etc';
}

console.log('[1~4] 앱으로 가는 길에 꼬리표가 붙어 있다');
const kinds = new Map();
let noCta = 0, noTag = 0, noFrom = 0, wrong = 0;
for (const p of pages) {
  const h = readFileSync(p.file, 'utf8');
  const m = h.match(/<a class="cta" href="\/\?from=([a-z]+)" data-cta="([a-z]+)" data-spot="main">/);
  if (!h.includes('class="cta"')) { bad(`${p.url}: 앱 CTA 가 없다 — 정보만 보여주고 끝나는 화면을 만들지 않는다`); noCta += 1; continue; }
  if (!m) { bad(`${p.url}: CTA 에 계측 꼬리표가 없다`); noTag += 1; continue; }
  const want = expectKind(p.url);
  if (m[1] !== want || m[2] !== want) { bad(`${p.url}: 묶음이 ${m[2]}/${m[1]} 인데 ${want} 여야 한다`); wrong += 1; }
  if (!/<a href="\/\?from=[a-z]+f" data-cta="[a-z]+" data-spot="footer">/.test(h)) { bad(`${p.url}: 푸터 링크에 꼬리표가 없다`); noFrom += 1; }
  kinds.set(want, (kinds.get(want) || 0) + 1);
}
if (!noCta && !noTag && !noFrom && !wrong) {
  good(`${pages.length}장 전부 CTA 2곳(본문 끝·푸터)에 꼬리표가 붙었다`);
  good(`묶음 ${kinds.size}종 — ${[...kinds].sort().map(([k, n]) => `${k} ${n}장`).join(' · ')}`);
}

console.log('[5] 클릭을 세는 스크립트가 있다');
const one = readFileSync(pages[0].file, 'utf8');
if (!one.includes('app_cta_click')) bad('클릭 이벤트 코드가 페이지에 없다');
else if (!one.includes("closest('a[data-cta]')")) bad('클릭을 잡는 선택자가 없다');
else good('app_cta_click 전송 코드 확인');
// 재는 것 때문에 링크가 막히면 안 된다
if (/preventDefault\(\)/.test(one.slice(one.indexOf('app_cta_click') - 1200, one.indexOf('app_cta_click') + 800))) {
  bad('계측 코드가 링크를 막고 있다 — 사람을 기다리게 하지 않는다');
} else good('링크를 막지 않는다');

console.log('[6] ?from= 이 앱의 기존 쿼리 키와 안 겹친다');
// 겹치면 계측을 붙인 것만으로 앱 동작이 바뀐다. 가장 조용히 터지는 자리다.
const appFiles = ['index.html', 'app.js', 'fortune.js', 'onboarding.js', 'share.js', 'love.js'];
const used = new Set();
for (const f of appFiles) {
  const fp = join(ROOT, f);
  if (!existsSync(fp)) continue;
  const src = readFileSync(fp, 'utf8');
  for (const m of src.matchAll(/\.get\(['"]([a-zA-Z0-9_]+)['"]\)/g)) used.add(m[1]);
  for (const m of src.matchAll(/\[\?&\]\(?([a-zA-Z0-9_|]+)\)?=/g)) m[1].split('|').forEach((k) => used.add(k));
}
if (used.has('from')) bad(`앱이 이미 'from' 을 읽고 있다 — 다른 이름을 써라 (쓰는 키: ${[...used].sort().join(', ')})`);
else good(`안 겹친다 (앱이 쓰는 키: ${[...used].sort().join(', ')})`);

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
