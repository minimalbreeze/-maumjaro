// 시설 글에 "다른 시설 이름이 섞여 있는지" 세는 도구 검사.
//
// 2026-10-19: 보강 1순위 글 1693(제일CC 파3)을 열어 보니 리베라CC 요금
// (비회원 평일 210,000원)이 제일CC 요금보다 **먼저** 나왔다. 게다가 문장이
// 중간에서 잘린 채 이어붙어 있었다("티켓을 받으제일CC", "발제일CC").
// 파3 글 24편이 같은 시기에 같은 틀로 찍혔으니 한 편에서 났으면 여럿에서
// 났을 가능성이 높다. 그래서 눈으로 찾지 않고 기계로 센다.
//
// 이 검사가 지키는 것은 두 가지다.
//   ① 실제 사고(1693)를 잡아낸다
//   ② 사고가 아닌 것을 사고라 하지 않는다 — 꼬리말 아래의 다른 글 제목,
//      같은 주소의 다른 글, 이름이 서로를 품는 글

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { 시설이름, 시설주소, 붙어있나, 섞인것 } from '../src/wordpress/facility-mix.mjs';

const 검사 = [];
const check = (이름, fn) => 검사.push([이름, fn]);

check('제목에서 시설 고유 이름만 뽑는다', () => {
  assert.equal(시설이름('제일CC 파3 골프장 이용료·예약 방법 (태마당로 28)'), '제일CC');
  assert.equal(시설이름('남양주 비전힐스 파3 골프장 이용료·예약 방법'), '남양주 비전힐스');
  assert.equal(시설이름('양평 파크골프장 이용료·예약 방법 (병산리 465-1)'), '양평');
});

check('CC 는 떼지 않는다 — 제일CC 와 리베라CC 를 가르는 것이 그 부분이다', () => {
  assert.equal(시설이름('리베라CC 파3 골프장 이용료'), '리베라CC');
  assert.notEqual(시설이름('제일CC 파3 골프장 이용료'), 시설이름('리베라CC 파3 골프장 이용료'));
});

check('괄호 안 주소를 읽는다', () => {
  assert.equal(시설주소('제일CC 파3 골프장 이용료·예약 방법 (태마당로 28)'), '태마당로 28');
  assert.equal(시설주소('이름만 있는 글'), '');
});

check('문장이 잘린 채 이어붙은 자리를 찾는다', () => {
  assert.equal(붙어있나('티켓을 받으제일CC 파3 골프장의 이용방법은', '제일CC'), true);
  assert.equal(붙어있나('대기 시간은 약 30분~1시간 발제일CC 파3 골프장은', '제일CC'), true);
  assert.equal(붙어있나('오늘은 제일CC 파3 골프장에 다녀왔습니다', '제일CC'), false);
  assert.equal(붙어있나('<p>제일CC 파3 골프장</p>', '제일CC'), false);
});

check('실제 사고(1693)를 잡아낸다', () => {
  const 글 = {
    id: 1693,
    title: '제일CC 파3 골프장 이용료·예약 방법 (태마당로 28)',
    content: [
      '<p>제일CC 파3 골프장은 9홀 주중 25,000원입니다.</p>',
      '<p>리베라CC 파3 이용료는 본 코스(비회원 평일 210,000원)보다 훨씬 저렴해 제일CC 파3 골프장의 이용료는</p>',
      '<p>티켓을 받으제일CC 파3 골프장의 이용방법은</p>',
    ].join(''),
  };
  const r = 섞인것(글, [
    { 이름: '제일CC', 주소: '태마당로 28' },
    { 이름: '리베라CC', 주소: '복정리 70' },
  ]);
  assert.equal(r.내이름, '제일CC');
  assert.deepEqual(r.섞인이름, [{ 이름: '리베라CC', 횟수: 1 }]);
  assert.equal(r.잘렸나, true, '잘린 문장을 못 찾았습니다');
});

check('깨끗한 글은 걸리지 않는다', () => {
  const 글 = {
    title: '제일CC 파3 골프장 이용료·예약 방법 (태마당로 28)',
    content: '<p>제일CC 파3 골프장은 9홀 주중 25,000원, 18홀 45,000원입니다.</p>',
  };
  const r = 섞인것(글, [{ 이름: '리베라CC', 주소: '복정리 70' }]);
  assert.deepEqual(r.섞인이름, []);
  assert.equal(r.잘렸나, false);
});

check('꼬리말 아래의 다른 글 제목은 세지 않는다', () => {
  // 여기에 다른 골프장 이름이 있는 것은 **정상**이다. 안 걷어내면 전부 걸린다.
  const 글 = {
    title: '제일CC 파3 골프장 이용료 (태마당로 28)',
    content: '<p>제일CC 요금입니다.</p><h2>함께 읽으면 좋은 글</h2><p>리베라CC 파3 골프장 이용료</p>',
  };
  const r = 섞인것(글, [{ 이름: '리베라CC', 주소: '복정리 70' }]);
  assert.deepEqual(r.섞인이름, [], '꼬리말 아래 제목이 사고로 잡혔습니다');
});

check('🔗 같이 읽을 글 아래도 세지 않는다', () => {
  const 글 = {
    title: '제일CC 파3 골프장 이용료 (태마당로 28)',
    content: '<p>제일CC 요금입니다.</p><h2>🔗 같이 읽을 글</h2><p>리베라CC 파3 골프장 이용료</p>',
  };
  assert.deepEqual(섞인것(글, [{ 이름: '리베라CC', 주소: '복정리 70' }]).섞인이름, []);
});

check('주소가 같으면 같은 장소라 사고가 아니다', () => {
  const 글 = {
    title: '서평택 파크골프장 이용료 (현덕면 72)',
    content: '<p>서평택골프클럽 에서도 같은 코스를 씁니다.</p>',
  };
  assert.deepEqual(섞인것(글, [{ 이름: '서평택골프클럽', 주소: '현덕면 72' }]).섞인이름, []);
});

check('이름이 서로를 품으면 가르지 못하므로 세지 않는다', () => {
  const 글 = { title: '양평 파크골프장 이용료 (병산리 465-1)', content: '<p>양평 하이힐 파크골프장도 있습니다.</p>' };
  assert.deepEqual(섞인것(글, [{ 이름: '양평 하이힐', 주소: '다른곳' }]).섞인이름, []);
});

check('자기 이름은 섞인 것으로 세지 않는다', () => {
  const 글 = { title: '제일CC 파3 골프장 이용료', content: '<p>제일CC 제일CC 제일CC</p>' };
  assert.deepEqual(섞인것(글, [{ 이름: '제일CC', 주소: '' }]).섞인이름, []);
});

check('여러 개가 섞였으면 많이 나온 것부터 보여준다', () => {
  const 글 = {
    title: '제일CC 파3 골프장 이용료',
    content: '<p>리베라CC 리베라CC 리베라CC 비전힐스</p>',
  };
  const r = 섞인것(글, [{ 이름: '리베라CC', 주소: 'a' }, { 이름: '비전힐스', 주소: 'b' }]);
  assert.deepEqual(r.섞인이름, [{ 이름: '리베라CC', 횟수: 3 }, { 이름: '비전힐스', 횟수: 1 }]);
});

check('빈 값·없는 값에도 던지지 않는다', () => {
  for (const v of [undefined, null, '', 0]) {
    assert.equal(typeof 시설이름(v), 'string');
    assert.equal(typeof 시설주소(v), 'string');
  }
  const r = 섞인것(undefined, undefined);
  assert.deepEqual(r.섞인이름, []);
  assert.equal(r.잘렸나, false);
});

check('이 도구는 읽기만 한다 — 저장하는 길이 없다', () => {
  // 세는 도구다. 고칠지 말지는 사람이 정한다(index-audit 과 같은 자리).
  const src = fs.readFileSync(new URL('../src/wordpress/facility-mix.mjs', import.meta.url), 'utf8');
  assert.ok(!/method:\s*'POST'/.test(src), 'POST 가 들어 있습니다');
  assert.ok(!/body:\s*\{/.test(src), '본문을 보내는 곳이 있습니다');
});

export default async function run() {
  console.log('\n[시설 글 섞인 이름 찾기]');
  let 실패 = 0;
  for (const [이름, fn] of 검사) {
    try { await fn(); console.log(`  ✅ ${이름}`); } catch (e) { 실패 += 1; console.log(`  ❌ ${이름}\n     ${e.message}`); }
  }
  if (실패) { console.log(`\n❌ ${실패}개 실패`); process.exitCode = 1; } else console.log(`\n✅ ${검사.length}개 항목 통과`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
