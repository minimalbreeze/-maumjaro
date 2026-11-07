// "AI가 가져가기 좋은 글" 기준 점검 검사.
import assert from 'node:assert/strict';
import {
  첫문단, 문장들, 인사말로열었나, 받는말로시작하나, 키워드가첫문장에,
  질문절, 흔들리는표현, 재기, 글속날짜, 흔들린문장들,
} from '../src/wordpress/ai-cite-scan.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[AI 인용 기준 점검]');

const 쿠팡 = '<!-- wp:html -->\n<script src="https://ads-partners.coupang.com/g.js"></script>\n<!-- /wp:html -->';

check('첫 문단을 찾을 때 광고 블록은 건너뛴다', () => {
  const 글 = `${쿠팡}\n\n<!-- wp:paragraph -->\n<p>충암고가 11월 1일 목동야구장에서 우승했습니다. 상대는 덕수고였습니다.</p>\n<!-- /wp:paragraph -->`;
  assert.ok(첫문단(글).startsWith('충암고가'));
});

check('문장으로 쪼갠다', () => {
  assert.deepEqual(문장들('가가 했다. 나나 했다.'), ['가가 했다.', '나나 했다.']);
});

check('인사말로 연 글을 집어낸다', () => {
  assert.equal(인사말로열었나('<p>안녕하세요, 오늘은 볼링 대회를 소개합니다.</p>'), true);
  assert.equal(인사말로열었나('<p>충암고가 11월 1일 우승했습니다.</p>'), false);
});

check('첫 문장이 앞을 받는 말로 시작하면 집어낸다', () => {
  assert.equal(받는말로시작하나('<p>이 대회는 11월 1일 열립니다.</p>'), true);
  assert.equal(받는말로시작하나('<p>이번 대회는 11월 1일 열립니다.</p>'), true);
  assert.equal(받는말로시작하나('<p>이마트 노브랜드배는 11월 1일 열립니다.</p>'), false);
});

check('대표 키워드가 첫 문장에 있는지 본다', () => {
  const 글 = '<p>이마트 노브랜드배 챔피언십은 11월 1일 열립니다. 장소는 목동야구장입니다.</p>';
  assert.equal(키워드가첫문장에({ focusKeyword: '이마트 노브랜드배', content: 글 }), true);
  assert.equal(키워드가첫문장에({ focusKeyword: '목동야구장', content: 글 }), false);
  // 키워드 자체가 없으면 셈에서 뺀다 — 못 본 것과 어긴 것을 섞지 않는다.
  assert.equal(키워드가첫문장에({ focusKeyword: '', content: 글 }), null);
});

check('자주 묻는 질문 절과 질문 수를 센다', () => {
  const 글 = '<h2>❓ 자주 묻는 질문</h2><p><strong>Q. 언제인가요?</strong></p><p>11월 1일입니다.</p><p><strong>Q. 어디인가요?</strong></p><p>목동야구장입니다.</p>';
  assert.deepEqual(질문절(글), { 있나: true, 질문수: 2 });
  assert.deepEqual(질문절('<p>그냥 글입니다.</p>'), { 있나: false, 질문수: 0 });
});

check('읽는 시점에 흔들리는 말을 센다', () => {
  const r = 흔들리는표현('<p>지난주 경기에서 이겼고 이번 주에도 나섭니다. 올해는 좋습니다.</p>');
  assert.equal(r.센것, 2);
  // '올해'는 따로 센다 — 바로 잘못으로 보지 않는다.
  assert.equal(r.느슨한것, 1);
});

check('규칙을 다 지킨 글은 어긴 것이 없다', () => {
  const 글 = [
    '<!-- wp:paragraph -->',
    '<p>이마트 노브랜드배 챔피언십 고교부는 2026년 11월 1일 충암고의 우승으로 끝났습니다. 결승 상대는 덕수고였고 점수는 3-2였습니다.</p>',
    '<!-- /wp:paragraph -->',
    '<h2>❓ 자주 묻는 질문</h2>',
    '<p><strong>Q. 1?</strong></p><p><strong>Q. 2?</strong></p><p><strong>Q. 3?</strong></p><p><strong>Q. 4?</strong></p>',
  ].join('\n');
  const r = 재기({ focusKeyword: '이마트 노브랜드배', content: 글 });
  assert.deepEqual(r.어긴것, []);
});

check('어긴 항목을 이름으로 돌려준다', () => {
  const r = 재기({ focusKeyword: '볼링', content: '<p>안녕하세요, 지난주 대회를 소개합니다.</p>' });
  assert.ok(r.어긴것.includes('인사말로 열었다'));
  assert.ok(r.어긴것.includes('자주 묻는 질문 절이 없다'));
  assert.ok(r.어긴것.some((x) => x.startsWith('읽는 시점에 흔들리는 말')));
});

check('글 안에 적힌 날짜를 모은다 — 바꿀 날짜가 있는지 보려고', () => {
  const r = 글속날짜('<p>2026년 11월 1일 결승이 열렸고 10월 30일 준결승이 있었습니다.</p>');
  assert.ok(r.includes('2026-11-1'));
  assert.ok(r.includes('10월 30일'));
  assert.deepEqual(글속날짜('<p>날짜가 없는 글입니다.</p>'), []);
});

check('흔들리는 말이 든 문장만 뽑는다 — 여러 번 불러도 같은 결과', () => {
  const 글 = '<p>지난주 경기에서 이겼습니다. 11월 1일 결승이 열립니다. 이번 주에도 나섭니다.</p>';
  const 한번 = 흔들린문장들(글);
  assert.equal(한번.length, 2);
  // 정규식에 /g 가 붙어 있어 lastIndex 가 남으면 두 번째 호출이 틀린다.
  assert.deepEqual(흔들린문장들(글), 한번);
});

console.log(`\n  ${passed}개 통과`);
