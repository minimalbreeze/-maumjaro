// 글 흐름 점검 검사.
//
// 운영자가 정한 흐름이 실제로 검사되는지 본다. 지시서에 적어두기만 하면
// 지켜지지 않는다 — 이 파일이 그 약속을 코드로 붙잡아 둔다.

import assert from 'node:assert/strict';
import { checkFlow } from '../src/seo/flow.mjs';
import { burstSignal, crowding, demandSignals } from '../src/news/demand.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[① 검색 수요 신호]');

const now = Date.UTC(2026, 9, 1, 12);
const 시간전 = (h) => new Date(now - h * 3600000).toISOString();

check('최근 기사가 몰리면 상승으로 본다', () => {
  const b = burstSignal(
    [시간전(2), 시간전(4), 시간전(8), 시간전(120)].map((t) => ({ publishedAt: t })),
    { now },
  );
  assert.ok(b.rising, JSON.stringify(b));
  assert.equal(b.recent, 3);
});

check('고르게 퍼져 있으면 상승이 아니다', () => {
  const b = burstSignal(
    [시간전(10), 시간전(40), 시간전(70), 시간전(100), 시간전(130)].map((t) => ({ publishedAt: t })),
    { now },
  );
  assert.ok(!b.rising, JSON.stringify(b));
});

check('기사가 하나뿐이면 상승을 주장하지 않는다', () => {
  assert.ok(!burstSignal([{ publishedAt: 시간전(1) }], { now }).rising);
});

check('날짜 없는 기사는 세지 않는다', () => {
  const b = burstSignal([{ publishedAt: null }, { publishedAt: undefined }], { now });
  assert.equal(b.recent, 0);
  assert.ok(!b.rising);
});

check('매체가 많으면 경쟁이 심하다고 본다', () => {
  // 예전에는 매체가 많을수록 가점이었다. 그건 경쟁이 가장 센 글감을
  // 1순위로 고르는 셈이었다.
  assert.ok(crowding(12).weight < 0, JSON.stringify(crowding(12)));
  assert.equal(crowding(12).level, 'crowded');
});

check('2~4곳이 노릴 구간이다', () => {
  for (const n of [2, 3, 4]) {
    assert.equal(crowding(n).level, 'sweet', `${n}곳`);
    assert.ok(crowding(n).weight > 0);
  }
});

check('1곳뿐이면 교차 확인이 안 돼 감점한다', () => {
  assert.ok(crowding(1).weight < 0);
  assert.equal(crowding(1).level, 'thin');
});

check('경쟁 덜함 + 상승이 가장 높은 가점을 받는다', () => {
  const 글감 = (sourceCount, times) => ({ sourceCount, articles: times.map((t) => ({ publishedAt: 시간전(t) })) });
  const 좋음 = demandSignals(글감(3, [2, 5, 9, 130]), { now });
  const 나쁨 = demandSignals(글감(12, [30, 60, 90, 120]), { now });
  assert.ok(좋음.weight > 나쁨.weight, `${좋음.weight} vs ${나쁨.weight}`);
  assert.ok(좋음.weight > 0 && 나쁨.weight < 0);
});

console.log('\n[②~⑥ 글의 흐름]');

const 좋은글 = {
  title: '2026 박신자컵 (언제 열리나? 금메달 11명 전원 출격)',
  body: [
    '2026 KB국민은행 박신자컵이 10월 3일부터 11일까지 청주체육관에서 열립니다. 아시안게임 금메달 11명이 전원 출전합니다.',
    '## ✨ 개요', '**일정**: 10월 3~11일',
    '## 📊 기록과 데이터',
    '허예은은 평균 7.2개 어시스트로 1위입니다. 이소희는 경기당 3.0개 3점슛으로 2위입니다. 한국은 75-70으로 일본을 이겼습니다. 12년 만의 금메달입니다.',
    '## 📌 배경과 원리',
    '박신자컵은 2015년 창설됐습니다. 규칙상 정규시즌 전에 열리는 컵대회이고, 역대 대회와 비교하면 참가 규모가 다릅니다.',
    '## 🔥 누가 웃을까',
    '다음은 10월 10일 4강전입니다. 우리은행과 신한은행은 정규시즌 개막전에서 다시 만납니다. 함께 지켜봐 주시기 바랍니다.',
  ].join('\n\n'),
  demand: { weight: 18, reasons: ['매체 3곳 — 경쟁 덜함'] },
};

check('흐름을 다 갖춘 글은 100점이다', () => {
  const r = checkFlow(좋은글);
  assert.equal(r.score, 100, r.missing.map((m) => `${m.step} ${m.label}`).join(', '));
});

check('② 제목에 질문이 없으면 짚어낸다', () => {
  const r = checkFlow({ ...좋은글, title: '2026 박신자컵 개막' });
  assert.ok(r.missing.some((m) => m.id === 'title-q'), r.missing.map((m) => m.id).join(','));
});

check('③ 인사말로 시작하면 짚어낸다', () => {
  const r = checkFlow({ ...좋은글, body: `안녕하세요, 농구 팬 여러분!\n\n${좋은글.body}` });
  assert.ok(r.missing.some((m) => m.id === 'lead-answer'), r.missing.map((m) => m.id).join(','));
});

check('④ 숫자가 없으면 짚어낸다', () => {
  const body = '대회가 열립니다. 좋은 선수들이 많이 나옵니다.\n\n## ✨ 개요\n\n재미있을 것입니다.';
  const r = checkFlow({ ...좋은글, body });
  assert.ok(r.missing.some((m) => m.id === 'data'), r.missing.map((m) => m.id).join(','));
});

check('⑤ 뉴스만 있고 개념 확장이 없으면 짚어낸다', () => {
  const body = [
    '대회가 10월 3일 열립니다. 11명이 나옵니다. 10개 팀 143명이 참가합니다. 상금은 3억원입니다.',
    '## ✨ 개요', '**일정**: 10월 3일 · 10개 팀 · 143명 · 3억원 · 5경기 · 2위 · 7.2개 · 3.0개',
    '## 🔥 끝', '10월 10일에 또 만납니다. 지켜봐 주시기 바랍니다. 좋은 경기가 될 것입니다.',
  ].join('\n\n');
  const r = checkFlow({ ...좋은글, body });
  assert.ok(r.missing.some((m) => m.id === 'evergreen'), r.missing.map((m) => m.id).join(','));
});

check('⑥ 응원 한 줄로 끝나면 짚어낸다', () => {
  const body = `${좋은글.body.split('## 🔥')[0]}## 🔥 끝\n\n응원합니다.`;
  const r = checkFlow({ ...좋은글, body });
  assert.ok(r.missing.some((m) => m.id === 'next-search'), r.missing.map((m) => m.id).join(','));
});

check('① 글감 신호가 없으면 점수에서 빼고 센다', () => {
  // 본문만 보고는 글감이 좋았는지 알 수 없다. 모른다고 점수를 깎지 않는다.
  const r = checkFlow({ ...좋은글, demand: null });
  const 신호 = r.items.find((i) => i.id === 'demand');
  assert.equal(신호.ok, null);
  assert.equal(r.score, 100, '모르는 항목 때문에 점수가 깎였습니다');
});

check('경쟁이 심한 글감은 ①에서 걸린다', () => {
  const r = checkFlow({ ...좋은글, demand: { weight: -10, reasons: ['매체 12곳 — 경쟁 심함'] } });
  assert.ok(r.missing.some((m) => m.id === 'demand'), r.missing.map((m) => m.id).join(','));
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
