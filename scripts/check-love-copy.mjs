#!/usr/bin/env node
// 연애센터 문구 검사 — love-data.js / love.js 가 선을 넘지 않았는지 본다
//
// 왜 테스트로 막는가:
// 로또 페이지에 "분석해서 뽑았다"를 쓰지 않는 것과 같은 이유다. 호감지수는
// 사용자가 본 것을 더한 셈일 뿐인데, 문구 한 줄이 "상대 마음을 알아낸다"로
// 읽히면 그 순간 없는 근거를 판 것이 된다. 연애는 사람이 실제로 다치는
// 영역이라, 말로만 "조심하자"고 두지 않고 검사로 묶어 둔다.
//
// 실행:  node scripts/check-love-copy.mjs
//
// 검사하는 것 (사용자에게 보이는 문구만 — 주석은 벗겨내고 본다)
//   1. 근거 암시 금지 — 심리학·연구·과학·AI 분석 같은 말
//   2. 단정 금지 — "좋아합니다", "확실", "틀림없" 같은 말
//   3. 부추김 금지 — "지금 바로 고백", "무조건" 같은 말
//   4. 고지 문구가 실제로 코드에 있는지
//   5. 반대 신호(negative) 그룹이 남아 있는지 — 점수만 올라가는 설계 방지
//   6. 모든 rxId가 prescriptions-data.js에 실재하는지
//   7. 모든 구간(band)과 고민(topic)에 네 각도·행동·금지가 다 채워졌는지

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const bad = (msg) => { console.error('  ✗', msg); fail += 1; };
const good = (msg) => console.log('  ✓', msg);

// 주석을 벗긴다. 규칙을 적어 둔 주석 자체가 금지어를 품고 있으므로,
// 주석까지 검사하면 자기 설명 때문에 늘 실패한다.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const dataSrc = readFileSync(join(ROOT, 'love-data.js'), 'utf8');
const uiSrc = readFileSync(join(ROOT, 'love.js'), 'utf8');
const copy = stripComments(dataSrc) + '\n' + stripComments(uiSrc);

console.log('[1] 근거를 지어내지 않는다');
const FAKE_EVIDENCE = ['심리학', '연구에 따르면', '연구 결과', '과학적', '과학적으로',
  'AI가 분석', 'AI 분석', '빅데이터', '통계적으로', '검증된', '적중률'];
let hit = FAKE_EVIDENCE.filter((w) => copy.includes(w));
if (hit.length) bad(`근거 암시 표현: ${hit.join(', ')}`);
else good(`근거 암시 표현 0건 (${FAKE_EVIDENCE.length}개 패턴 검사)`);

console.log('[2] 상대 마음을 단정하지 않는다');
const ASSERTIVE = ['좋아합니다', '좋아해요', '마음이 있습니다', '확실합니다', '확실해요',
  '틀림없', '분명히 당신을', '백퍼', '100% '];
hit = ASSERTIVE.filter((w) => copy.includes(w));
if (hit.length) bad(`단정 표현: ${hit.join(', ')}`);
else good(`단정 표현 0건 (${ASSERTIVE.length}개 패턴 검사)`);

console.log('[3] 부추기지 않는다');
const PUSHY = ['지금 바로 고백', '무조건 고백', '당장 연락', '밀어붙', '매달리',
  '포기하지 말고 계속', '꼭 성공'];
hit = PUSHY.filter((w) => copy.includes(w));
if (hit.length) bad(`부추기는 표현: ${hit.join(', ')}`);
else good(`부추기는 표현 0건 (${PUSHY.length}개 패턴 검사)`);

console.log('[4] 고지 문구가 코드에 있다');
if (!uiSrc.includes('점이 아니라 셈')) bad('"점이 아니라 셈" 고지가 love.js에 없다');
else good('"점이 아니라 셈" 고지 존재');
if (!uiSrc.includes('사람마다 다른 뜻')) bad('"같은 행동도 사람마다 다른 뜻" 고지가 없다');
else good('"사람마다 다른 뜻" 고지 존재');
// 고지는 허브·체크리스트·결과 세 화면에 다 들어가야 한다.
const discUses = (uiSrc.match(/\$\{DISCLAIMER\}/g) || []).length;
if (discUses < 3) bad(`고지 문구가 ${discUses}군데만 쓰였다 (허브·체크리스트·결과 3군데여야 한다)`);
else good(`고지 문구 ${discUses}군데에 삽입`);
// 거절도 결과로 인정하는 문장이 한 군데는 있어야 한다.
if (!dataSrc.includes('거절도 답')) bad('"거절도 답이다"에 해당하는 문장이 없다');
else good('거절을 결과로 인정하는 문장 존재');

console.log('[5] 데이터 구조');
// love-data.js를 그대로 실행해 읽는다(브라우저 전역 하나만 흉내 낸다).
global.window = {};
await import(new URL('../love-data.js', import.meta.url).href);
const D = global.window.MaumjaroLoveData;
if (!D) { bad('window.MaumjaroLoveData가 없다'); process.exit(1); }

const negGroups = D.LOVE_SIGNAL_GROUPS.filter((g) => g.negative);
if (!negGroups.length) bad('반대 신호 그룹이 없다 — 체크할수록 점수만 오르는 설계는 금지다');
else good(`반대 신호 그룹 ${negGroups.length}개 / 항목 ${negGroups.reduce((s, g) => s + g.items.length, 0)}개`);

const negItems = negGroups.flatMap((g) => g.items);
if (negItems.some((it) => it.w >= 0)) bad('반대 신호에 0 이상 가중치가 있다');
else good('반대 신호 가중치 전부 음수');

const posItems = D.LOVE_SIGNAL_GROUPS.filter((g) => !g.negative).flatMap((g) => g.items);
if (posItems.some((it) => it.w <= 0)) bad('긍정 신호에 0 이하 가중치가 있다');
else good(`긍정 신호 ${posItems.length}개 · 가중치 합 ${D.LOVE_SIGNAL_MAX}`);

const ids = [...posItems, ...negItems].map((it) => it.id);
if (new Set(ids).size !== ids.length) bad('신호 id가 겹친다');
else good(`신호 id ${ids.length}개 전부 고유`);

// 점수가 0~100을 벗어나지 않는지 — 전부 체크한 경우와 반대만 체크한 경우
const score = (set) => {
  let raw = 0;
  D.LOVE_SIGNAL_GROUPS.forEach((g) => g.items.forEach((it) => { if (set.has(it.id)) raw += it.w; }));
  return Math.max(0, Math.min(100, Math.round((raw / D.LOVE_SIGNAL_MAX) * 100)));
};
const all = score(new Set(ids));
const onlyNeg = score(new Set(negItems.map((it) => it.id)));
const onlyPos = score(new Set(posItems.map((it) => it.id)));
if (onlyPos !== 100) bad(`긍정 전부 체크했을 때 100이 아니다: ${onlyPos}`);
else good('긍정 전부 체크 = 100');
if (onlyNeg !== 0) bad(`반대만 체크했을 때 0이 아니다: ${onlyNeg}`);
else good('반대만 체크 = 0');
if (all < 0 || all > 100) bad(`전부 체크했을 때 범위를 벗어난다: ${all}`);
else good(`전부 체크 = ${all} (0~100 안)`);

// 구간이 0~100을 빈틈없이 덮는지
const covered = new Set();
for (let s = 0; s <= 100; s += 1) {
  const b = D.LOVE_BANDS.find((x) => s >= x.min);
  if (!b) { bad(`${s}점에 맞는 구간이 없다`); break; }
  covered.add(b.min);
}
if (covered.size !== D.LOVE_BANDS.length) bad(`구간 ${D.LOVE_BANDS.length}개 중 ${covered.size}개만 닿는다 — 죽은 구간이 있다`);
else good(`구간 ${D.LOVE_BANDS.length}개 전부 닿는다`);

console.log('[6] 처방으로 끝난다 (브랜드 원칙 3)');
const rxSrc = readFileSync(join(ROOT, 'prescriptions-data.js'), 'utf8');
const rxIds = new Set([...rxSrc.matchAll(/id: '([a-z0-9-]+)', category:/g)].map((m) => m[1]));
const usedRx = [...D.LOVE_BANDS.map((b) => b.rxId), ...D.LOVE_TOPICS.map((t) => t.rxId)];
const missing = usedRx.filter((r) => !rxIds.has(r));
if (missing.length) bad(`없는 처방을 가리킨다: ${missing.join(', ')}`);
else good(`rxId ${usedRx.length}개 전부 prescriptions-data.js에 실재`);
if (usedRx.some((r) => !r)) bad('rxId가 빈 항목이 있다 — 처방 없이 끝나는 화면이 생긴다');

console.log('[7] 빈칸 없음');
D.LOVE_BANDS.forEach((b) => {
  ['emoji', 'title', 'line', 'doIt', 'dont', 'rxId'].forEach((k) => {
    if (!b[k]) bad(`구간 ${b.min}: ${k}가 비었다`);
  });
  if (typeof b.min !== 'number') bad(`구간에 min이 없다: ${b.title}`);
});
D.LOVE_TOPICS.forEach((t) => {
  ['id', 'emoji', 'label', 'sub', 'now', 'them', 'doIt', 'dont', 'rxId'].forEach((k) => {
    if (!t[k]) bad(`고민 ${t.id || '(id없음)'}: ${k}가 비었다`);
  });
});
const topicIds = D.LOVE_TOPICS.map((t) => t.id);
if (new Set(topicIds).size !== topicIds.length) bad('고민 id가 겹친다');
if (!fail) good(`구간 ${D.LOVE_BANDS.length}개 · 고민 ${D.LOVE_TOPICS.length}개 전부 채워짐`);

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
