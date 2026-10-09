// 색인 진단이 사실을 정확히 세는지 검사.
//
// 2026-10-09 서치콘솔: 색인 8개 / "크롤링됨 - 현재 색인이 생성되지 않음" 148개.
// 무엇을 지울지 사람이 정하려면 세는 눈이 정확해야 한다. 잘못 묶으면 멀쩡한
// 글을 지우게 된다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 본문글자수, 제목낱말, 조사떼기, 닮은정도, 비슷한글묶기, 색인위험, 글유형 } from '../src/wordpress/index-audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[색인 진단 — 읽기만 함]');

// ── 글자수 ─────────────────────────────────────────────────
check('태그와 스크립트를 글자수에서 뺀다', () => {
  const html = '<p>가나다</p><script>var x = "긴 스크립트 내용";</script><style>.a{color:red}</style>';
  assert.equal(본문글자수(html), 3);
});

check('공백을 세지 않는다 (채점표와 같은 기준)', () => {
  assert.equal(본문글자수('<p>가 나\n다  라</p>'), 4);
});

check('주석 안의 글자를 세지 않는다', () => {
  // 구텐베르크 블록은 <!-- wp:html --> 주석을 쓴다. 그게 분량으로 잡히면 안 된다.
  assert.equal(본문글자수('<!-- wp:paragraph 아주 긴 주석 -->가나'), 2);
});

// ── 제목 낱말 ──────────────────────────────────────────────
check('이모지·괄호·날짜를 걷어낸다', () => {
  const 낱말 = 제목낱말('🏌️ 신지애 통산 상금 131억 (2026년 10월 9일)');
  assert.ok(낱말.includes('신지애'), '선수 이름이 빠졌습니다');
  assert.ok(!낱말.some((w) => /2026|10|9/.test(w)), '날짜가 남았습니다');
});

check('한 글자 낱말을 쓰지 않는다', () => {
  // 리포 지시서: 한국어 점수표에 한 글자 패턴을 쓰지 않는다.
  // '김채영'의 채, '화성시'의 화가 엉뚱하게 걸렸던 사고가 있었다.
  assert.ok(제목낱말('김 채 영 선수').every((w) => w.length >= 2));
});

check('어느 글에나 들어가는 말은 빼고 센다', () => {
  const 낱말 = 제목낱말('KBO 일정 정리 총정리 알아보기');
  assert.ok(낱말.includes('KBO'));
  assert.ok(!낱말.includes('정리'), '흔한 말이 남았습니다');
});

// ── 닮은 정도 ──────────────────────────────────────────────
check('같은 사건을 두 번 쓴 글을 닮았다고 본다', () => {
  // 7769·7777 의 실제 사례. 구글이 둘 다 색인하지 않았다.
  const a = '신지애 통산 30승 달성, 일본여자오픈 연장 끝에 영구시드 확보';
  const b = '신지애 일본여자오픈 우승, 통산 30승과 영구시드 연장 승부';
  assert.ok(닮은정도(a, b) >= 0.35, `닮은정도가 낮습니다: ${닮은정도(a, b)}`);
});

check('조사가 붙어도 같은 말로 센다', () => {
  // "30승"과 "30승과"를 다른 말로 세면 위 중복 사례가 0.42 로 떨어져 안 묶였다.
  assert.equal(조사떼기('30승과'), '30승');
  assert.equal(조사떼기('영구시드를'), '영구시드');
  // 두 글자 이하는 건드리지 않는다. '상금'의 금을 조사로 오인하면 안 된다.
  assert.equal(조사떼기('상금'), '상금');
  assert.equal(조사떼기('경기'), '경기');
});

check('같은 대회의 다른 회차도 한 번 보라고 묶는다', () => {
  // 회차가 다르지만 각도가 같으면 같은 검색어를 두고 서로 경쟁한다.
  // 지우라는 뜻이 아니라 사람이 보라는 뜻이다 — 출력에 제목이 그대로 찍힌다.
  const a = '제3회 취저우 란커배 세계바둑오픈 우승상금';
  const b = '제4회 취저우 란커배 세계바둑오픈 우승상금';
  assert.ok(닮은정도(a, b) >= 0.35);
  // 그래도 회차는 낱말로 남아 있어야 한다. 걷어내면 완전히 같은 글이 된다.
  assert.ok(제목낱말(a).includes('제3회'));
  assert.ok(닮은정도(a, b) < 1, '회차 차이를 전혀 못 봅니다');
});

check('같은 선수의 다른 사건은 닮았다고 하지 않는다', () => {
  const a = '신지애 통산 상금 131억원, 2위와의 격차는 얼마나 되나';
  const b = '윤이나 LPGA 퀄리파잉 시리즈 최종전 출전 확정';
  assert.ok(닮은정도(a, b) < 0.5);
});

check('제목이 비면 0을 돌려준다 (나누기 오류 없이)', () => {
  assert.equal(닮은정도('', '무엇이든'), 0);
  assert.equal(닮은정도('', ''), 0);
});

// ── 묶기 ───────────────────────────────────────────────────
check('닮은 글만 묶고 혼자인 글은 묶지 않는다', () => {
  const 글 = [
    { id: 1, title: '신지애 통산 30승 일본여자오픈 영구시드' },
    { id: 2, title: '신지애 일본여자오픈 통산 30승 영구시드 확보' },
    { id: 3, title: 'KBO 참가활동기간 1월 25일로 변경' },
  ];
  const 묶음 = 비슷한글묶기(글);
  assert.equal(묶음.length, 1);
  assert.equal(묶음[0].length, 2);
  assert.ok(묶음[0].every((p) => p.id !== 3), '다른 글이 섞였습니다');
});

check('한 글이 두 묶음에 들어가지 않는다', () => {
  const 글 = [
    { id: 1, title: '란커배 우승상금 대국규칙 역대우승자' },
    { id: 2, title: '란커배 우승상금 역대우승자 대국규칙' },
    { id: 3, title: '란커배 대국규칙 우승상금 역대우승자' },
  ];
  const 묶음 = 비슷한글묶기(글);
  const 전체 = 묶음.flat().map((p) => p.id);
  assert.equal(new Set(전체).size, 전체.length, '같은 글이 두 번 들어갔습니다');
});

check('묶음을 큰 것부터 돌려준다', () => {
  const 글 = [
    { id: 1, title: '가가가 나나나 다다다' },
    { id: 2, title: '가가가 나나나 다다다' },
    { id: 3, title: '라라라 마마마 바바바' },
    { id: 4, title: '라라라 마마마 바바바' },
    { id: 5, title: '라라라 마마마 바바바' },
  ];
  const 묶음 = 비슷한글묶기(글);
  assert.ok(묶음[0].length >= 묶음[1].length);
});

// ── 위험 신호 ──────────────────────────────────────────────
check('짧은 글과 빈 SEO 필드를 짚는다', () => {
  const 이유 = 색인위험({ 글자수: 1200, description: '', focusKeyword: '' });
  assert.equal(이유.length, 3);
  assert.ok(이유.some((r) => /1,200자/.test(r)));
});

check('기준을 넘긴 글에는 이유를 달지 않는다', () => {
  assert.deepEqual(색인위험({ 글자수: 4000, description: '설명', focusKeyword: '키워드' }), []);
});

// ── 유형 ───────────────────────────────────────────────────
// 리포 실측(config/search-demand.md · config/revenue.md)이 어느 유형이 돈이
// 되는지 말해 준다. 그 분류가 틀리면 엉뚱한 글을 보강하게 된다.
check('돈이 되는 유형을 실측대로 가린다', () => {
  // CTR 10~25% · 운영자가 광고 클릭을 확인한 유형
  assert.equal(글유형('남서울CC 파3 골프장: 이용료 및 예약 방법 안내'), '시설');
  assert.equal(글유형('정읍 신태인파크골프장: 이용료 및 예약 방법 안내'), '시설');
  // 유입 1위 유형
  assert.equal(글유형('어스몬다민컵 우승상금과 역대 상금 순위'), '상금');
});

check('대회가 끝나면 죽는 유형을 따로 센다', () => {
  assert.equal(글유형('2025 VNL 여자배구대표팀 3주차 경기 중계 및 일정'), '중계');
  assert.equal(글유형('KPGA 골프존 오픈 2025 결과 다시보기'), '중계');
});

check('"3주차"를 주차장으로 읽지 않는다', () => {
  // 실제로 걸렸던 사고. 숫자가 앞에 오면 몇 번째 주라는 뜻이다.
  assert.notEqual(글유형('VNL 3주차 경기 중계'), '시설');
  // 진짜 주차 안내는 여전히 시설로 잡아야 한다.
  assert.equal(글유형('남서울CC 가는 길과 주차 안내'), '시설');
  assert.equal(글유형('파크골프장 주차장 이용 안내'), '시설');
});

check('돈 되는 유형이 중계보다 먼저 걸린다', () => {
  // 제목에 둘 다 들어 있으면 보강 대상으로 잡혀야 한다. 중계로 가면 놓친다.
  assert.equal(글유형('남서울CC 파3 이용료·예약 방법과 중계 시청 안내'), '시설');
});

check('가릴 수 없으면 기타로 둔다 (지어내지 않는다)', () => {
  assert.equal(글유형('미니멀리즘 스윙: 골프의 심장을 전하는 철학'), '기타');
  assert.equal(글유형(''), '기타');
});

// ── 안전 ───────────────────────────────────────────────────
check('글을 고치거나 지우는 코드가 들어 있지 않다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/index-audit.mjs'), 'utf8');
  assert.ok(!/method:\s*['"]POST['"]/.test(src), 'POST 로 무언가를 저장합니다');
  assert.ok(!/method:\s*['"](PUT|PATCH|DELETE)['"]/.test(src), '쓰기 요청이 들어 있습니다');
  assert.match(src, /읽기만 한다/, '읽기 전용이라는 설명이 없습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
