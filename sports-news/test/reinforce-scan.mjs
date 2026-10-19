// 보강 1순위 글에 무엇이 모자란지 세는 도구 검사.
//
// 왜 이 도구가 있나 (2026-10-19)
//   보강 1순위는 "시설·상금 글 중 3,000자 미만" 62편이다. 글자수만 보고
//   돈을 쓰면 안 된다. sports-news/CLAUDE.md ②절이 구글 문서를 인용해
//   "콘텐츠 길이 자체는 순위 결정과 관련 없습니다" 를 못 박았고,
//   "없으면 그대로 둔다" 까지 적어 두었다.
//
//   그리고 실제로 1693 은 분량이 아니라 오류였다(리베라CC 요금이 먼저
//   나왔다). 1650 은 이미지 alt 가 남의 골프장 이름이었다. 둘 다 글을
//   늘려서 해결되는 문제가 아니다.
//
//   62편 × 190~370원 = 1만 2천~2만 3천원. 그 돈을 쓸 글과 0원으로 고칠
//   글과 그대로 둘 글을 먼저 가르는 것이 이 도구의 일이다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { 재어보기, 글자만, 찾는것, 상금이찾는것 } from '../src/wordpress/reinforce-scan.mjs';

const 검사 = [];
const check = (이름, fn) => 검사.push([이름, fn]);

const 시설제목 = '제일CC 파3 골프장 이용료·예약 방법 (태마당로 28)';
const 다있는본문 = [
  '<p>제일CC 파3 골프장은 9홀 주중 25,000원, 18홀 45,000원입니다.</p>',
  '<p>경기도 용인시 태마당로 28 에 있고, 전화는 031-400-2582 입니다.</p>',
  '<p>오전 6시부터 일몰까지 운영하며, 예약제가 아니라 현장 선착순입니다.</p>',
].join('');

check('태그를 걷어내고 글자만 남긴다', () => {
  assert.equal(글자만('<p>가  나</p><!-- c --><img alt="다"/>'), '가 나');
  for (const v of [undefined, null, '', 0]) assert.equal(글자만(v), '');
});

check('독자가 찾는 것이 다 있으면 짧아도 그대로 둔다', () => {
  // CLAUDE.md 가 두라고 한 쪽이다. 2,100자라도 요금·전화·주소·시간·예약이
  // 다 있으면 늘릴 거리가 없다.
  const r = 재어보기({ id: 1, title: 시설제목, 글자수: 2100, content: 다있는본문 });
  assert.equal(r.갈곳, '그대로', `없는 것: ${r.없는것.join(',')}`);
  assert.deepEqual(r.없는것, []);
  assert.equal(r.있는것.length, 찾는것.length);
});

check('사실이 모자라면 돈 드는 쪽으로 보낸다', () => {
  const r = 재어보기({
    id: 2, title: 시설제목, 글자수: 1200,
    content: '<p>제일CC 파3 골프장은 가성비가 좋아 인기가 많습니다. 추천합니다.</p>',
  });
  assert.equal(r.갈곳, '돈');
  assert.ok(r.없는것.includes('요금'), '요금이 없는데 못 찾습니다');
  assert.ok(r.없는것.includes('전화'));
});

check('"저렴합니다" 는 요금을 적은 것이 아니다 — 숫자가 있어야 센다', () => {
  const r = 재어보기({ id: 3, title: 시설제목, 글자수: 1000, content: '<p>이용료는 매우 저렴합니다.</p>' });
  assert.ok(r.없는것.includes('요금'), '숫자 없는 말을 요금으로 셉니다');
});

check('0원으로 고칠 것이 있으면 그것이 먼저다', () => {
  // 사실이 다 있어도, alt 가 둘이면 0원 고칠 것으로 보낸다. 돈 쓰기 전에
  // 공짜로 고칠 것을 먼저 치운다.
  const r = 재어보기({
    id: 4, title: 시설제목, 글자수: 2100,
    content: `${다있는본문}<img src="a.png" alt="용인 88CC 파3" class="x" alt="제일CC 파3 골프장"/>`,
  });
  assert.equal(r.갈곳, '0원');
  assert.match(r.고칠것.join(' '), /alt 가 둘인 이미지 1장/);
});

check('다른 시설 이름이 섞인 것도 0원 쪽이다', () => {
  const r = 재어보기({
    id: 5, title: 시설제목, 글자수: 2500,
    content: `${다있는본문}<p>리베라CC 파3 이용료는 210,000원입니다.</p>`,
  }, { 다른이름: [{ 이름: '리베라CC', 주소: '중리길 183' }] });
  assert.equal(r.갈곳, '0원');
  assert.match(r.고칠것.join(' '), /리베라CC×1/);
});

check('상금 글은 찾는 것이 다르다 — 액수·연도·순위', () => {
  const 제목 = '2025 어스몬다민컵 우승 상금 총정리';
  const r = 재어보기({
    id: 6, title: 제목, 글자수: 1500,
    content: '<p>2025년 어스몬다민컵 우승 상금은 2억원이고, 준우승은 1억원입니다.</p>',
  });
  assert.equal(r.유형, '상금');
  assert.deepEqual(r.없는것, [], `없는 것: ${r.없는것.join(',')}`);
  assert.equal(r.있는것.length, 상금이찾는것.length);
  // 시설 기준(전화·주소)으로 재면 상금 글은 억울하게 걸린다.
  assert.ok(!r.없는것.includes('전화'), '상금 글에 전화번호를 요구합니다');
});

check('상금 글에서 숫자가 없으면 걸린다', () => {
  const r = 재어보기({
    id: 7, title: '2025 어스몬다민컵 우승 상금 총정리', 글자수: 800,
    content: '<p>상금이 많은 대회로 알려져 있습니다.</p>',
  });
  assert.ok(r.없는것.includes('상금액'));
  assert.equal(r.갈곳, '돈');
});

check('상금 글에서는 섞인 시설 이름을 보지 않는다', () => {
  // 시설 이름 규칙을 상금 글에 대면 대회명이 시설로 잡힌다.
  const r = 재어보기({
    id: 8, title: '2025 어스몬다민컵 우승 상금 총정리', 글자수: 1500,
    content: '<p>2025년 상금 2억원. 우승자는 리베라CC 에서 열린 대회에서도 우승했습니다.</p>',
  }, { 다른이름: [{ 이름: '리베라CC', 주소: 'x' }] });
  assert.deepEqual(r.고칠것, [], '상금 글에 시설 규칙을 댔습니다');
});

check('이미지 수를 센다', () => {
  const r = 재어보기({ id: 9, title: 시설제목, 글자수: 2100, content: `${다있는본문}<img src="a.png" alt="가"/><img src="b.png" alt="나"/>` });
  assert.equal(r.이미지수, 2);
});

check('빈 값·없는 값에도 던지지 않는다', () => {
  for (const v of [undefined, null, {}]) {
    const r = 재어보기(v);
    assert.equal(typeof r.갈곳, 'string');
    assert.ok(Array.isArray(r.없는것));
  }
});

check('이 도구는 읽기만 한다 — 저장하는 길이 없다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/reinforce-scan.mjs', import.meta.url), 'utf8');
  assert.ok(!/method:\s*'POST'/.test(src), 'POST 가 들어 있습니다');
  assert.ok(!/body:\s*\{/.test(src), '본문을 보내는 곳이 있습니다');
});

check('기준을 한 군데서만 정한다 — 보강1순위를 다시 만들지 않는다', () => {
  // 같은 기준이 두 곳에 있으면 둘이 어긋난다. index-audit 것을 쓴다.
  const src = fs.readFileSync(new URL('../src/wordpress/reinforce-scan.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*보강1순위[^}]*\} from '\.\/index-audit\.mjs'/);
  assert.ok(!/\['시설', '상금'\]\.includes/.test(src), '기준을 두 번 적었습니다');
});

export default async function run() {
  console.log('\n[보강 1순위에 무엇이 모자란가]');
  let 실패 = 0;
  for (const [이름, fn] of 검사) {
    try { await fn(); console.log(`  ✅ ${이름}`); } catch (e) { 실패 += 1; console.log(`  ❌ ${이름}\n     ${e.message}`); }
  }
  if (실패) { console.log(`\n❌ ${실패}개 실패`); process.exitCode = 1; } else console.log(`\n✅ ${검사.length}개 항목 통과`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
