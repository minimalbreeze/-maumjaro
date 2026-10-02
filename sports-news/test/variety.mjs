// 종목 다양성 감점 검사.
//
// 실제로 7264·7268·7272 세 편이 연달아 파크골프였다. 그 상황을 그대로 재현해서
// 다음 글이 파크골프가 아닌 쪽으로 넘어가는지 본다.

import assert from 'node:assert/strict';
import { varietyPenalty, categoryIndex, recentCategories } from '../src/news/variety.mjs';
import { scoreCluster } from '../src/news/rank.mjs';
import { startMockWordPress } from './mock-wordpress.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[종목 다양성]');

check('최근에 안 쓴 종목은 감점이 없다', () => {
  assert.equal(varietyPenalty('배드민턴', ['파크골프', '파크골프', '골프']).weight, 0);
});

check('최근 목록이 비면 감점이 없다', () => {
  // 첫 글이거나 조회가 실패한 경우다. 감점으로 글을 막지 않는다.
  assert.equal(varietyPenalty('파크골프', []).weight, 0);
  assert.equal(varietyPenalty('파크골프', null).weight, 0);
});

check('한 번 썼으면 조금, 세 번 썼으면 많이 깎는다', () => {
  const 한번 = varietyPenalty('골프', ['바둑', '골프', '야구']).weight;
  const 두번 = varietyPenalty('골프', ['바둑', '골프', '골프']).weight;
  const 세번 = varietyPenalty('골프', ['골프', '골프', '골프']).weight;
  assert.ok(한번 < 0 && 두번 < 한번 && 세번 < 두번, `${한번} / ${두번} / ${세번}`);
});

check('직전 글과 같은 종목이면 더 깎는다', () => {
  // 이어서 같은 걸 읽는 느낌이 제일 나쁘다.
  const 직전 = varietyPenalty('골프', ['골프', '바둑', '야구']).weight;
  const 세번째전 = varietyPenalty('골프', ['바둑', '야구', '골프']).weight;
  assert.ok(직전 < 세번째전, `직전 ${직전} / 세번째전 ${세번째전}`);
});

// ── 실제 상황 재현 ─────────────────────────────────────────
// 실행 #34에서 나온 실제 점수: 파크골프 38점, 배드민턴(안세영) 36점.
// 파크골프를 세 편 연달아 쓴 뒤라면 배드민턴이 올라와야 한다.

const 묶음 = (label) => ({ label, articles: [{ summary: '' }], latestAt: new Date().toISOString() });

check('파크골프 3연속 뒤에는 다른 종목이 1위가 된다', () => {
  // 실행 #34의 실제 점수를 쓴다: 파크골프 38점, 배드민턴(안세영) 36점. 차이 2점.
  // 감점이 그 차이를 뒤집을 만큼 큰지 본다.
  const recent = ['파크골프', '파크골프', '파크골프'];
  const 파크 = 38 + varietyPenalty('파크골프', recent).weight;
  const 배드 = 36 + varietyPenalty('배드민턴', recent).weight;
  assert.ok(배드 > 파크, `아직 파크골프가 이깁니다 — ${파크} vs ${배드}`);
});

check('한 편만 썼어도 2점 차이는 뒤집힌다', () => {
  // 실측 점수차가 2~3점으로 촘촘하다. 한 번 썼을 때의 감점으로도 넘어가야
  // 매일 종목이 돌아간다.
  const recent = ['파크골프', '바둑', '야구'];
  assert.ok(36 + varietyPenalty('배드민턴', recent).weight
          > 38 + varietyPenalty('파크골프', recent).weight);
});

check('감점이 실제 점수에 반영된다', () => {
  const 묶 = 묶음('파크골프장 개장 이용료 예약방법 가는 길');
  const topic = { name: '파크골프', category: '파크골프' };
  const 그냥 = scoreCluster(묶, topic).score;
  const 깎임 = scoreCluster(묶, topic, { recentCategories: ['파크골프', '파크골프', '파크골프'] }).score;
  assert.ok(깎임 < 그냥 - 30, `${그냥} → ${깎임}`);
});

check('감점 이유가 점수 근거에 남는다', () => {
  const r = scoreCluster(묶음('파크골프장 개장'), { name: '파크골프', category: '파크골프' },
    { recentCategories: ['파크골프', '파크골프'] });
  assert.ok(r.reasons.some((x) => x.includes('파크골프')), r.reasons.join(' / '));
});

check('골프 투어 네 개는 한 카테고리로 묶인다', () => {
  // KLPGA·JLPGA·LPGA·PGA 가 모두 category=골프다. 골프만 연달아 쓰는 것도 막아야 한다.
  assert.ok(varietyPenalty('골프', ['골프', '골프']).weight < 0);
});

// ── 워드프레스 조회 ────────────────────────────────────────
check('카테고리 id→이름 표를 만든다', () => {
  const m = categoryIndex([{ id: 7, name: '파크골프' }, { id: 9, name: '바둑' }]);
  assert.equal(m.get(7), '파크골프');
  assert.equal(m.get(9), '바둑');
});

const wp = await startMockWordPress({
  posts: {
    7272: { status: 'draft', title: { raw: '영등포 파크골프장' }, categories: [7], content: { raw: '<p>본문</p>' }, meta: {} },
    7268: { status: 'draft', title: { raw: '경주 알천파크골프장' }, categories: [7], content: { raw: '<p>본문</p>' }, meta: {} },
    7264: { status: 'publish', title: { raw: '충주 단월파크골프장' }, categories: [7], content: { raw: '<p>본문</p>' }, meta: {} },
    7253: { status: 'publish', title: { raw: '박신자컵' }, categories: [11], content: { raw: '<p>본문</p>' }, meta: {} },
  },
});
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

await checkAsync('최근 글의 종목을 최신순으로 읽는다', async () => {
  const cats = await recentCategories({
    limit: 6, categoryNameById: categoryIndex([{ id: 7, name: '파크골프' }, { id: 11, name: '농구' }]),
  });
  assert.deepEqual(cats, ['파크골프', '파크골프', '파크골프', '농구'], JSON.stringify(cats));
});

await checkAsync('임시글도 센다', async () => {
  // 임시글로 쌓아두고 나중에 발행하는 흐름이다. 발행된 것만 보면 방금 만든
  // 파크골프 임시글 두 편이 안 보여서 또 파크골프를 쓴다.
  const cats = await recentCategories({
    limit: 6, categoryNameById: categoryIndex([{ id: 7, name: '파크골프' }]),
  });
  assert.equal(cats.filter((c) => c === '파크골프').length, 3, JSON.stringify(cats));
});

await checkAsync('VARIETY_PENALTY=off 면 조회하지 않는다', async () => {
  process.env.VARIETY_PENALTY = 'off';
  assert.equal(await recentCategories({}), null);
  delete process.env.VARIETY_PENALTY;
});

wp.server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
