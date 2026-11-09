#!/usr/bin/env node
// 행복의 기원 7장 문구 검사 — 책에 없는 말을 책의 말처럼 쓰지 않았는지 본다
//
// 왜 테스트로 막는가:
// 로또에 "분석해서 뽑았다"를 안 쓰고, 호감지수에 "상대가 당신을 좋아합니다"를 안
// 쓰는 것과 같은 선이다. 남의 책을 소개하는 글에서 가장 쉽게 넘는 선이
// **확인하지 않은 것을 확인한 것처럼 적는 것**이다. 쪽수 하나, 퍼센트 하나를
// 지어 넣으면 글 전체가 못 믿을 것이 된다. 한 번 발행하면 되돌리기 어렵다.
//
// 실행:  node scripts/check-happiness-copy.mjs   (build-pages.mjs 를 먼저 돌릴 것)
//
// 검사하는 것 (생성된 happiness/**/index.html 의 본문)
//   1. 쪽수 인용 금지 — "123쪽", "p.45" 같은 것. 확인한 적이 없다.
//   2. 통계·실험 수치 금지 — "%", "N배", "연구 결과 ...명" 같은 것.
//   3. 직접 인용 금지 — 따옴표로 묶은 문장을 책의 원문처럼 제시하는 것.
//      (확인된 6장 제목 "행복은 아이스크림이다"만 허용한다)
//   4. 효과 약속 금지 — "읽으면 행복해진다", "보장" 같은 것.
//   5. 장마다 출처 고지가 들어 있는지 — 어디까지가 책이고 어디부터가 우리 읽기인지.
//   6. 장마다 앱으로 끝나는지(브랜드 원칙 3).
//   7. 유사도 — 7장이 서로 너무 닮지 않았는지. 띠 행운번호 13장이 중앙 81.9%라
//      색인이 늦었다. 여기는 50%를 넘으면 실패로 본다.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = join(ROOT, 'happiness');
let fail = 0;
const bad = (m) => { console.error('  ✗', m); fail += 1; };
const good = (m) => console.log('  ✓', m);

if (!existsSync(BASE)) {
  console.error('happiness/ 가 없다. 먼저 node scripts/build-pages.mjs 를 돌려라.');
  process.exit(1);
}

// happiness/index.html 과 happiness/*/index.html 을 모은다
const files = [];
if (existsSync(join(BASE, 'index.html'))) files.push(['/happiness/', join(BASE, 'index.html')]);
for (const d of readdirSync(BASE, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const f = join(BASE, d.name, 'index.html');
  if (existsSync(f)) files.push([`/happiness/${d.name}/`, f]);
}

function bodyText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const docs = files.map(([url, f]) => [url, bodyText(readFileSync(f, 'utf8')), readFileSync(f, 'utf8')]);
console.log(`[0] ${docs.length}장을 읽었다`);
if (docs.length !== 7) bad(`7장이어야 하는데 ${docs.length}장이다`);
else good('7장');

console.log('[1] 쪽수를 지어내지 않는다');
for (const [url, t] of docs) {
  const m = t.match(/\d+\s*쪽|p\.\s*\d+|페이지\s*\d+/);
  if (m) bad(`${url}: 쪽수 인용 "${m[0]}"`);
}
if (!fail) good('쪽수 인용 0건');

console.log('[2] 통계·실험 수치를 지어내지 않는다');
let statHit = 0;
for (const [url, t] of docs) {
  // 책의 연구 결과인 척하는 수치만 잡는다. 우리 글의 "1분", "30초", "7장" 같은
  // 분량·시간 표기는 우리 것이라 괜찮다.
  for (const re of [/\d+(\.\d+)?\s*%/g, /\d+\s*배\s*(더|나|높|많)/g, /(연구|실험|조사)[^.]{0,30}\d+\s*(명|%|배)/g]) {
    const m = t.match(re);
    if (m) { bad(`${url}: 수치 "${m[0]}"`); statHit += 1; }
  }
}
if (!statHit) good('통계·실험 수치 0건');

console.log('[3] 원문을 인용한 것처럼 쓰지 않는다');
// 확인된 것: 6장 제목. 그 밖에 따옴표로 묶인 문장을 "책은 ...라고 말한다" 식으로
// 제시하면 원문 인용으로 읽힌다.
const ALLOWED_QUOTE = '행복은 아이스크림이다';
let quoteHit = 0;
for (const [url, t] of docs) {
  const m = t.match(/(책|저자|서은국)[^.]{0,20}"([^"]{6,})"[^.]{0,12}(라고|라는|이라고)/g);
  if (!m) continue;
  for (const q of m) {
    if (q.includes(ALLOWED_QUOTE)) continue;
    bad(`${url}: 원문 인용처럼 읽히는 문장 ${q.slice(0, 60)}`);
    quoteHit += 1;
  }
}
if (!quoteHit) good(`원문 인용 0건 (확인된 "${ALLOWED_QUOTE}"만 허용)`);

console.log('[4] 효과를 약속하지 않는다');
const PROMISE = ['읽으면 행복해', '행복해집니다', '보장합니다', '반드시 행복', '행복을 보장',
  '확실히 좋아집니다', '치료', '완치'];
let pHit = 0;
for (const [url, t] of docs) {
  for (const w of PROMISE) if (t.includes(w)) { bad(`${url}: 효과 약속 "${w}"`); pHit += 1; }
}
if (!pHit) good(`효과 약속 0건 (${PROMISE.length}개 패턴 검사)`);

console.log('[5] 장마다 출처를 밝힌다');
for (const [url, t] of docs) {
  if (!t.includes('서은국') || !t.includes('행복의 기원')) bad(`${url}: 책 이름·저자가 없다`);
  if (!t.includes('원문 인용이 아니라 요약')) bad(`${url}: "원문 인용이 아니라 요약" 고지가 없다`);
  if (!t.includes('21세기북스')) bad(`${url}: 출판사·연도 표기가 없다`);
}
if (!fail) good('7장 전부 출처·고지 포함');

console.log('[6] 장마다 앱으로 끝난다 (브랜드 원칙 3)');
for (const [url, t, raw] of docs) {
  if (!t.includes('맘운자로에서 해보기')) bad(`${url}: 앱 CTA가 없다`);
  if (!raw.includes('href="/"')) bad(`${url}: 앱으로 가는 링크가 없다`);
}
if (!fail) good('7장 전부 앱 CTA로 끝난다');

console.log('[7] 서로 너무 닮지 않았다');
// 간단한 유사도: 두 글의 2-그램 집합 자카드. 정확한 값보다 "비슷한 묶음"을 잡는 게 목적이다.
function grams(s) {
  const g = new Set();
  for (let i = 0; i < s.length - 1; i += 1) g.add(s.slice(i, i + 2));
  return g;
}
const gs = docs.map(([url, t]) => [url, grams(t)]);
let worst = 0; let worstPair = '';
for (let i = 0; i < gs.length; i += 1) {
  for (let j = i + 1; j < gs.length; j += 1) {
    const [ua, a] = gs[i]; const [ub, b] = gs[j];
    let inter = 0;
    for (const x of a) if (b.has(x)) inter += 1;
    const r = inter / (a.size + b.size - inter);
    if (r > worst) { worst = r; worstPair = `${ua} vs ${ub}`; }
  }
}
const pct = (worst * 100).toFixed(1);
if (worst > 0.5) bad(`가장 닮은 두 장이 ${pct}% — 템플릿으로 찍힌 것 같다 (${worstPair})`);
else good(`최대 ${pct}% (${worstPair})`);

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
