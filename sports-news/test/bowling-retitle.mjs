// 볼링 글 제목 다시 맞추기 검사.
import assert from 'node:assert/strict';
import {
  볼링글인가, 앞부분, 장소찾기, 패턴찾기, 기간찾기, 인원찾기, 괄호만들기, 다듬을거리,
} from '../src/wordpress/bowling-retitle.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[볼링 글 제목 다시 맞추기]');

check('카테고리로 볼링 글을 고른다', () => {
  assert.equal(볼링글인가({ title: '2026 KPBA 퍼펙트코리아컵', slug: 'a', categories: [7] }, [7]), true);
  assert.equal(볼링글인가({ title: '2026 KPBA 퍼펙트코리아컵', slug: 'a', categories: [9] }, [7]), false);
});

check('카테고리를 못 찾으면 제목·슬러그의 볼링을 본다', () => {
  assert.equal(볼링글인가({ title: '아산 이충무공컵 프로볼링대회', slug: 'b', categories: [] }, []), true);
  assert.equal(볼링글인가({ title: '2026 KBO 한국시리즈', slug: 'c', categories: [] }, []), false);
});

check('괄호 앞은 그대로 둔다 — 연도·대회명·개막!이 거기 있다', () => {
  assert.equal(앞부분('2026 인카금융 슈퍼볼링 국제오픈 개막! (대회 개요, 중계 총정리!)'),
    '2026 인카금융 슈퍼볼링 국제오픈 개막!');
  assert.equal(앞부분('2026 KPBA 퍼펙트코리아컵'), '2026 KPBA 퍼펙트코리아컵');
  // 괄호 바로 앞의 쉼표는 걷어낸다.
  assert.equal(앞부분('2026 아산 이충무공컵, (대회 개요)'), '2026 아산 이충무공컵');
});

check('볼링장 이름을 찾는다', () => {
  assert.equal(장소찾기('<p>대회는 아산 이순신볼링장에서 열립니다.</p>'), '이순신볼링장');
  assert.equal(장소찾기('<p>장소는 안성 스타볼링센터입니다.</p>'), '스타볼링센터');
  assert.equal(장소찾기('<p>장소는 아직 미정입니다.</p>'), '');
});

check('패턴은 피트가 적혀 있고 패턴이라는 말이 있을 때만', () => {
  assert.equal(패턴찾기('<p>이번 대회 오일 패턴은 41피트로 길게 깔립니다.</p>'), '41피트 패턴');
  // 피트만 있고 패턴이라는 말이 없으면 쓰지 않는다 — 다른 길이일 수 있다.
  assert.equal(패턴찾기('<p>레인 길이는 60피트입니다.</p>'), '');
});

check('기간을 찾는다', () => {
  assert.equal(기간찾기('<p>11월 3일~11월 8일 열립니다.</p>'), '11월 3~8일');
  assert.equal(기간찾기('<p>11월 3일부터 8일까지 열립니다.</p>'), '11월 3~8일');
  assert.equal(기간찾기('<p>12월 1일 개막합니다.</p>'), '12월 1일');
  // 달이 다르면 양쪽 달을 다 적는다.
  assert.equal(기간찾기('<p>12월 28일~1월 3일 열립니다.</p>'), '12월 28일~1월 3일');
  assert.equal(기간찾기('<p>날짜는 미정입니다.</p>'), '');
});

check('출전 인원을 찾는다', () => {
  assert.equal(인원찾기('<p>남녀 프로 128명이 출전합니다.</p>'), '128명 출전');
  assert.equal(인원찾기('<p>많은 선수가 출전합니다.</p>'), '');
});

check('괄호는 많아도 두 가지만 담는다', () => {
  const 본문 = '<p>아산 이순신볼링장에서 11월 3일~11월 8일 열리며 총상금은 1억원입니다. 오일 패턴은 41피트입니다.</p>';
  assert.equal(괄호만들기(본문), '이순신볼링장, 11월 3~8일');
});

check('본문에서 쓸 것을 못 찾으면 건너뛴다 — 지어내지 않는다', () => {
  assert.equal(괄호만들기('<p>좋은 경기가 기대됩니다.</p>'), '');
  assert.equal(다듬을거리({ title: '2026 KPBA 퍼펙트코리아컵 (중계 총정리!)', content: '<p>기대됩니다.</p>' }), null);
});

check('총정리 괄호를 본문에서 찾은 말로 바꾼다', () => {
  const r = 다듬을거리({
    title: '2026 KPBA 퍼펙트코리아컵 (중계, 대회 개요, 패턴 특징, 관전 포인트 총정리!)',
    content: '<p>아산 이순신볼링장에서 11월 3일부터 8일까지 열립니다.</p>',
  });
  assert.equal(r.title, '2026 KPBA 퍼펙트코리아컵 (이순신볼링장, 11월 3~8일)');
});

check('제목이 70자를 넘으면 자르지 말고 건너뛴다', () => {
  const 긴제목 = `2026 ${'가'.repeat(60)}컵 (총정리!)`;
  assert.equal(다듬을거리({ 제목: 1, title: 긴제목, content: '<p>이순신볼링장에서 11월 3일 열립니다.</p>' }), null);
});

console.log(`\n  ${passed}개 통과`);
