// 첫 문장을 결론 한 줄로 다시 쓰기 검사.
import assert from 'node:assert/strict';
import { 숫자들, 버릴이유, 리드바꾼것 } from '../src/wordpress/fix-lead.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[첫 문장을 결론 한 줄로]');

const 원문 = '수원CC 파3 골프장은 경기도 용인시에 있습니다. 9홀이고 주중 이용료는 25000원입니다. 예약은 전화로만 받습니다.';

check('지어낸 숫자가 들어오면 버린다 — 이 도구의 중심', () => {
  const 이유 = 버릴이유({ lead: '수원CC 파3 골프장 주중 이용료는 38000원입니다.', 키워드: '수원CC 파3', 원문 });
  assert.ok(이유 && 이유.includes('38000'), `이유: ${이유}`);
});

check('원문에 있는 숫자는 통과한다', () => {
  assert.equal(버릴이유({ lead: '수원CC 파3 골프장 주중 이용료는 25000원이고 9홀입니다.', 키워드: '수원CC 파3', 원문 }), null);
});

check('대표 키워드 낱말이 빠지면 버린다', () => {
  // 지시어로 시작하지 않는 문장을 써서, 키워드 검사가 걸리는지만 본다.
  const 이유 = 버릴이유({ lead: '골프장 주중 이용료는 25000원입니다.', 키워드: '수원CC 파3', 원문 });
  assert.ok(이유 && 이유.includes('빠졌'), `이유: ${이유}`);
  // 낱말이 흩어져 있어도 다 있으면 통과한다.
  assert.equal(버릴이유({ lead: '수원CC 골프장의 파3 코스는 9홀입니다.', 키워드: '수원CC 파3', 원문 }), null);
});

check('인사말·예고로 시작하면 버린다 — 고치려던 것이다', () => {
  for (const s of ['안녕하세요, 수원CC 파3 골프장입니다.', '오늘은 수원CC 파3 골프장을 소개할게요.']) {
    const 이유 = 버릴이유({ lead: s, 키워드: '수원CC 파3', 원문 });
    assert.ok(이유 && 이유.includes('예고'), `${s} → ${이유}`);
  }
});

check('앞을 받는 말로 시작하면 버린다', () => {
  const 이유 = 버릴이유({ lead: '이곳 수원CC 파3 골프장은 9홀입니다.', 키워드: '수원CC 파3', 원문 });
  assert.ok(이유 && 이유.includes('받는 말'), `이유: ${이유}`);
});

check('120자를 넘으면 버린다', () => {
  const 긴것 = `수원CC 파3 골프장은 ${'가'.repeat(130)}입니다.`;
  const 이유 = 버릴이유({ lead: 긴것, 키워드: '수원CC 파3', 원문 });
  assert.ok(이유 && 이유.includes('깁니다'), `이유: ${이유}`);
});

check('두 문장이면 버린다', () => {
  const 이유 = 버릴이유({ lead: '수원CC 파3 골프장은 9홀입니다. 이용료는 25000원입니다.', 키워드: '수원CC 파3', 원문 });
  assert.ok(이유 && 이유.includes('한 문장'), `이유: ${이유}`);
});

check('모델이 빈 문자열을 주면 버린다 — 억지로 만들지 않은 것이다', () => {
  const 이유 = 버릴이유({ lead: '', 키워드: '수원CC 파3', 원문 });
  assert.ok(이유 && 이유.includes('쓸 사실이 없다'), `이유: ${이유}`);
});

check('숫자를 뽑을 때 쉼표가 든 수도 하나로 센다', () => {
  assert.deepEqual(숫자들('이용료는 25,000원이고 9홀입니다.'), ['25,000', '9']);
});

check('첫 문장만 바꾸고 나머지 문장은 그대로 둔다', () => {
  const 글 = '<!-- wp:paragraph -->\n<p>오늘은 수원CC 파3 골프장을 소개할게요. 이용료를 정리했습니다.</p>\n<!-- /wp:paragraph -->';
  const r = 리드바꾼것(글, '수원CC 파3 골프장은 9홀이고 주중 이용료는 25000원입니다.');
  assert.equal(r.전, '오늘은 수원CC 파3 골프장을 소개할게요.');
  assert.ok(r.html.includes('<p>수원CC 파3 골프장은 9홀이고 주중 이용료는 25000원입니다. 이용료를 정리했습니다.</p>'));
});

check('p 태그 속성을 다시 쓰지 않는다', () => {
  const 글 = '<!-- wp:paragraph -->\n<p class="x">오늘은 소개할게요. 뒤 문장입니다.</p>\n<!-- /wp:paragraph -->';
  assert.ok(리드바꾼것(글, '새 리드입니다.').html.includes('<p class="x">새 리드입니다.'));
});

check('첫 문장이 유일한 문장이어도 바꿀 수 있다', () => {
  const 글 = '<!-- wp:paragraph -->\n<p>오늘은 수원CC 파3 골프장을 소개할게요.</p>\n<!-- /wp:paragraph -->';
  const r = 리드바꾼것(글, '수원CC 파3 골프장은 9홀입니다.');
  assert.ok(r.html.includes('<p>수원CC 파3 골프장은 9홀입니다.</p>'));
});

console.log(`\n  ${passed}개 통과`);
