// 색인 진단이 사실을 정확히 세는지 검사.
//
// 2026-10-09 서치콘솔: 색인 8개 / "크롤링됨 - 현재 색인이 생성되지 않음" 148개.
// 무엇을 지울지 사람이 정하려면 세는 눈이 정확해야 한다. 잘못 묶으면 멀쩡한
// 글을 지우게 된다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 본문글자수, 제목낱말, 조사떼기, 닮은정도, 비슷한글묶기, 색인위험, 글유형, 보강1순위, 같은시설끼리 } from '../src/wordpress/index-audit.mjs';

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

check('보강 1순위는 시설·상금 중 얇은 글만, 두꺼운 것부터', () => {
  // 2026-10-19: 운영자가 "보강 1순위로 바로 간다" 고 해서 --보강만 을 만들었다.
  // 기준이 ⑤ 절과 --보강만 두 군데면 한쪽만 고쳐져 어긋난다. 한 함수로 둔다.
  const 글 = [
    { id: 1, title: '군위 파크골프장 이용료·예약 방법', 글자수: 1200 },
    { id: 2, title: '어스몬다민컵 우승 상금은 얼마', 글자수: 2900 },
    { id: 3, title: '2025 KBO 중계 경기일정 시간', 글자수: 1000 },
    { id: 4, title: '남서울CC 파3 이용료', 글자수: 5000 },
  ];
  const r = 보강1순위(글);
  assert.deepEqual(r.map((p) => p.id), [2, 1], '두꺼운 것부터가 아닙니다');
  assert.ok(!r.some((p) => p.id === 3), '중계 글이 섞였습니다 — 돈이 안 되는 유형이다');
  assert.ok(!r.some((p) => p.id === 4), '기준(3,000자)을 넘는 글이 섞였습니다');
});

check('보강 1순위가 빈 값·이상한 값에 던지지 않는다', () => {
  assert.deepEqual(보강1순위(null), []);
  assert.deepEqual(보강1순위([{ }, { title: null, 글자수: 10 }]), []);
});

check('--보강만 과 ⑤ 절이 같은 함수를 쓴다', () => {
  // 기준을 두 번 적으면 한쪽만 고쳐진다.
  const src = fs.readFileSync(new URL('../src/wordpress/index-audit.mjs', import.meta.url), 'utf8');
  const 센다 = (src.match(/\['시설', '상금'\]\.includes/g) || []).length;
  assert.equal(센다, 1, `보강 기준이 ${센다}군데에 적혀 있습니다 — 한 군데여야 합니다`);
});

// ── 같은 시설을 두 번 쓴 글 (2026-10-20) ──────────────────────
//
// 처음엔 "무리가 전부 시설 글이면 중복" 으로 갈랐다. **틀렸다.**
// 시설 글 제목은 전부 "○○ 파3 골프장 이용료·예약 방법 (주소)" 꼴이라
// 양식만으로 40편이 한 묶음이 되고, 그 가짜 묶음이 그대로 '할 일' 로
// 올라왔다. 남서울·수원CC·메이필드가 한 덩어리였다.
//
// 진짜 기준은 **시설 이름이 같은가** 하나다. 아래는 실제로 찾은 쌍이다.
const { 시설이름, 지명뿐인가 } = await import('../src/wordpress/facility-mix.mjs');

const 실제글 = [
  { id: 1714, date: '2025-08-19', 글자수: 2364, title: '대구CC 파3 골프장 이용료·예약 방법 (일연로 718-42)' },
  { id: 415, date: '2025-05-12', 글자수: 1169, title: '대구CC 파3 골프장 이용료·예약 방법' },
  { id: 1538, date: '2025-08-10', 글자수: 2878, title: '정읍 신태인파크골프장 이용료·예약 방법 (신용리 881)' },
  { id: 481, date: '2025-05-20', 글자수: 1993, title: '정읍 신태인파크골프장 이용료·예약 방법 (신용리 881)' },
  { id: 1505, date: '2025-08-07', 글자수: 3312, title: '화천 산천어 파크골프장 이용료·예약 방법 (춘화로 3061-17)' },
  { id: 1105, date: '2025-07-17', 글자수: 2874, title: '화천 산천어 파크골프장 이용료·예약 방법 (춘화로 3061-17)' },
  // 아래는 서로 다른 시설이다 — 제목 양식만 같다. 묶이면 안 된다.
  { id: 1619, date: '2025-08-13', 글자수: 2310, title: '남서울 CC 파3 골프장 이용료·예약 방법 (판교원로 82번길 51)' },
  { id: 1640, date: '2025-08-13', 글자수: 2131, title: '수원CC 파3 골프장 이용료·예약 방법 (중부대로 681)' },
  { id: 1631, date: '2025-08-13', 글자수: 2151, title: '서울 메이필드 호텔 파3 골프장 이용료·예약 방법 (방화대로 94)' },
];

check('같은 시설을 두 번 쓴 것만 센다 — 제목 양식이 같은 것은 세지 않는다', () => {
  const 결과 = 같은시설끼리(실제글, 시설이름, 지명뿐인가);
  const 이름들 = 결과.map((x) => x.이름).sort();
  assert.deepEqual(이름들, ['대구CC', '정읍 신태인', '화천 산천어'],
    `남서울·수원CC·메이필드가 섞였거나 빠졌습니다: ${이름들.join(', ')}`);
});

check('띄어쓰기가 달라도 같은 시설로 본다 — 서평택이 그랬다', () => {
  const 서평택 = [
    { id: 1650, 글자수: 2702, title: '서평택골프클럽 파3 골프장 이용료·예약 방법 (포승향남로 218-10)' },
    { id: 379, 글자수: 1730, title: '서평택 골프클럽 파3 이용료·예약 방법 (포승향남로 218-10)' },
  ];
  const 결과 = 같은시설끼리(서평택, 시설이름, 지명뿐인가);
  assert.equal(결과.length, 1, '띄어쓰기 차이로 다른 시설이 됐습니다');
  assert.equal(결과[0].무리.length, 2);
});

check('긴 글이 앞에 온다 — 남길 쪽을 먼저 보여준다', () => {
  const 결과 = 같은시설끼리(실제글, 시설이름, 지명뿐인가);
  for (const { 이름, 무리 } of 결과) {
    for (let i = 1; i < 무리.length; i += 1) {
      assert.ok(무리[i - 1].글자수 >= 무리[i].글자수, `${이름} 의 순서가 뒤집혔습니다`);
    }
  }
  const 대구 = 결과.find((x) => x.이름 === '대구CC');
  assert.equal(대구.무리[0].id, 1714, '긴 글(1714)이 앞에 없습니다');
});

check('지명만 남는 이름은 세지 않는다 — 같은 지명의 다른 시설이 묶인다', () => {
  const 여주 = [
    { id: 1100, 글자수: 2585, title: '여주 파크골프장 이용료·예약 방법 (여주, 오학, 점동 3개 골프장)' },
    { id: 9999, 글자수: 2000, title: '여주 파크골프장 이용료·예약 방법 (다른 곳)' },
  ];
  // '여주' 는 지명뿐이라 세지 않는다.
  assert.deepEqual(같은시설끼리(여주, 시설이름, 지명뿐인가), []);
});

check('시설 글이 아닌 것은 세지 않는다', () => {
  const 중계 = [
    { id: 1, 글자수: 100, title: 'KPGA 현대해상 최경주 인비테이셔널 2025 중계 경기일정 시간' },
    { id: 2, 글자수: 100, title: 'KPGA 현대해상 최경주 인비테이셔널 2025 결과 다시보기' },
  ];
  assert.deepEqual(같은시설끼리(중계, 시설이름, 지명뿐인가), []);
});

check('빈 값·이상한 값에 던지지 않는다', () => {
  assert.deepEqual(같은시설끼리(null, 시설이름, 지명뿐인가), []);
  assert.deepEqual(같은시설끼리([{}, { title: null }], 시설이름, 지명뿐인가), []);
});

check('할 일(②)이 맨 뒤에 온다 — tail -60 에서 밀려나지 않게', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/index-audit.mjs', import.meta.url), 'utf8');
  const 닮은자리 = src.indexOf('[① 제목이 닮은 글]');
  const 중복자리 = src.indexOf('[② 같은 시설을 두 번 쓴 글]');
  assert.ok(닮은자리 > -1 && 중복자리 > -1, '찍는 자리를 못 찾았습니다');
  assert.ok(닮은자리 < 중복자리, '②가 ①보다 앞에 있습니다');
  // ②는 자르지 않는다 — 할 일이라 전부 보여야 한다.
  assert.ok(!/자르기\(같은시설/.test(src), '②를 자르고 있습니다');
});

check('top-level await 로 main 을 돌리지 않는다 — 순환 import 가 멈춰 선다', () => {
  // main() 안에서 facility-mix.mjs 를 동적으로 부르는데, 그 파일이 다시
  // 이 파일을 import 한다. top-level await 로 main 을 기다리면 둘이 서로를
  // 기다려 죽는다(2026-10-20, exit 13 · unsettled top-level await).
  const src = fs.readFileSync(new URL('../src/wordpress/index-audit.mjs', import.meta.url), 'utf8');
  assert.ok(!/^if \(import\.meta\.url === .+\) await main\(\);/m.test(src),
    'top-level await 로 main 을 돌립니다 — 순환 import 로 멈춰 섭니다');
  assert.match(src, /main\(\)\.catch\(/, 'main 의 실패를 받지 않습니다');
  // 순환의 반대쪽도 그대로여야 이 검사가 뜻을 가진다.
  const mix = fs.readFileSync(new URL('../src/wordpress/facility-mix.mjs', import.meta.url), 'utf8');
  assert.match(mix, /from '\.\/index-audit\.mjs'/, '순환이 사라졌다면 이 검사를 다시 보세요');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
