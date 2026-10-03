// 뉴스 없이 공식 자료로 글감을 조사하는 경로 검사.
//
// 왜 만들었나: 운영자 실측에서 CTR이 가장 높은 글감이 뉴스에 없는 정보였다.
//
//   남서울 파3 이용방법  CTR 13.7%
//   서평택 파3 예약방법  CTR 18.2%
//   안산 제일cc 파3 복장 CTR 23.1%
//
// 요금·예약·주차는 스포츠 뉴스에 안 나온다. 그래서 "KBL 티켓 예매 방법" 주제를
// 지정해도 근거 부족으로 글을 못 썼다. 가장 잘 되는 글감을 구조적으로 못 쓰고
// 있었다.

import assert from 'node:assert/strict';
import { 출처등급, subjectAsCluster } from '../src/ai/research.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[뉴스 없이 공식 자료 조사]');

check('주제를 뒤 단계가 쓰는 묶음 모양으로 바꾼다', () => {
  const c = subjectAsCluster('남서울 파3 이용방법과 요금', { topic: '골프', category: '골프' });
  assert.equal(c.label, '남서울 파3 이용방법과 요금');
  assert.equal(c.category, '골프');
  assert.deepEqual(c.articles, [], '뉴스가 없어야 합니다');
  assert.equal(c.sourceCount, 0);
});

check('기사가 없다는 것이 조사모드의 표시가 된다', () => {
  // main.mjs 가 `research && !cluster.articles.length` 로 갈림길을 정한다.
  // 기사가 하나라도 있으면 평소대로 사실확인으로 간다.
  assert.equal(subjectAsCluster('주제').articles.length, 0);
});

// ── 출처 등급 ──────────────────────────────────────────────
// 블로그도 본다. 실제 이용 후기에만 있는 정보가 있다. 다만 단독 근거로는 안 쓴다.

check('공식 출처를 1순위로 명시한다', () => {
  assert.ok(/관공서|지자체|go\.kr/.test(출처등급), '관공서가 1순위에 없습니다');
  assert.ok(/협회|연맹|or\.kr/.test(출처등급), '협회가 1순위에 없습니다');
});

check('블로그를 버리지 않는다', () => {
  // 운영자가 "블로그, 관공서, 협회 등 검색 가능한 모든 자료"를 쓰라고 했다.
  assert.ok(/블로그|카페|커뮤니티/.test(출처등급), '블로그가 출처 목록에 없습니다');
  assert.ok(/후기/.test(출처등급), '후기에서 얻을 것이 있다는 안내가 없습니다');
});

check('블로그를 단독 근거로 쓰지 못하게 막는다', () => {
  // 블로그 하나만 보고 요금을 단정하면 틀린 정보가 그대로 옮겨 붙는다.
  assert.ok(/단독 근거로 쓰지 마세요|단독 근거로는/.test(출처등급), 출처등급.slice(0, 200));
});

check('틀리면 헛걸음하는 항목은 공식 확인을 요구한다', () => {
  // 요금·예약·운영시간·주소를 블로그만 보고 쓰면 독자가 헛걸음한다.
  for (const 항목 of ['요금', '예약', '운영 시간', '주소', '연락처', '상금']) {
    assert.ok(출처등급.includes(항목), `"${항목}"이 공식 확인 목록에 없습니다`);
  }
  assert.ok(/1순위에서 확인되어야만/.test(출처등급), 출처등급);
});

check('못 찾으면 지어내지 말라고 한다', () => {
  assert.ok(/지어내지 마세요/.test(출처등급));
  assert.ok(/unverified/.test(출처등급), '못 찾은 것을 어디에 넣을지 안 알려줍니다');
});

// ── 조사 순서 ──────────────────────────────────────────────
check('독자가 실제로 찾는 것부터 조사한다', async () => {
  // 실측 데이터 순서(요금·예약·복장·가는 길)가 조사 지시에도 반영돼야 한다.
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../src/ai/research.mjs', import.meta.url), 'utf8'));
  const 지시 = src.slice(src.indexOf('독자가 실제로 궁금해하는'), src.indexOf('숫자는 출처와 함께'));
  for (const 항목 of ['요금', '예약 방법', '운영 시간', '주차', '상금']) {
    assert.ok(지시.includes(항목), `조사 지시에 "${항목}"이 없습니다`);
  }
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
