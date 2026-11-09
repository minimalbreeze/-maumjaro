// 임시글 발행 검사.
//
// 이 도구는 **되돌릴 수 없는 일**을 한다. 그래서 "하는 것"보다
// **"안 하는 것"** 을 더 많이 검사한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  발행할수있나, 발행할수있는상태, 한번에최대, 발행전점검, 백업하기,
} from '../src/wordpress/publish-post.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[임시글 발행]');

// ⚠️ 2026-11-03 에 그 사이 발행된 글을 지우려 한 일이 있었다. 허락은 그때의
//    사실 위에서 받은 것이고, 상태는 실행 직전에 다시 본다.
check('이미 발행된 글은 발행 대상이 아니다', () => {
  assert.equal(발행할수있나('publish'), false);
});

check('임시글·검토대기·예약은 발행할 수 있다', () => {
  assert.equal(발행할수있나('draft'), true);
  assert.equal(발행할수있나('pending'), true);
  assert.equal(발행할수있나('future'), true);
});

check('휴지통·비공개·빈 상태는 발행하지 않는다', () => {
  for (const s of ['trash', 'private', 'auto-draft', '', null, undefined]) {
    assert.equal(발행할수있나(s), false, `${s} 를 발행 대상으로 봤습니다`);
  }
});

// ⚠️ 되돌릴 수 없는 일에 "전부" 를 주지 않는다. 상한이 있어야 손이 미끄러진
//    순간이 사고가 되지 않는다.
check('한 번에 받는 글 수에 상한이 있다', () => {
  assert.ok(Number.isInteger(한번에최대), '상한이 정수가 아닙니다');
  assert.ok(한번에최대 >= 1 && 한번에최대 <= 10, `상한이 ${한번에최대} 입니다 — 1~10 이어야 합니다`);
});

check('publish 는 발행 가능 목록에 없다', () => {
  assert.ok(!발행할수있는상태.includes('publish'));
});

check('발행 전 점검 — 빈 메타 설명과 빈 키워드를 찍는다', () => {
  const 할말 = 발행전점검({ title: '제목', content: '<p>본문</p>', meta: {} });
  assert.ok(할말.some((s) => s.includes('메타 설명')), JSON.stringify(할말));
  assert.ok(할말.some((s) => s.includes('대표 키워드')), JSON.stringify(할말));
});

check('발행 전 점검 — 빈 제목·빈 본문을 찍는다', () => {
  const 할말 = 발행전점검({ title: '  ', content: '', meta: {} });
  assert.ok(할말.some((s) => s.includes('제목')), JSON.stringify(할말));
  assert.ok(할말.some((s) => s.includes('본문')), JSON.stringify(할말));
});

// ⚠️ 구글 색인에서 뺀 글을 발행하면 아무도 못 찾는다. 막지는 않지만 찍는다.
check('발행 전 점검 — 구글 색인 제외 깃발을 찍는다', () => {
  const 할말 = 발행전점검({
    title: 'ㄱ', content: 'ㄴ',
    meta: { rank_math_description: 'ㄷ', rank_math_focus_keyword: 'ㄹ', maumjaro_google_noindex: '1' },
  });
  assert.deepEqual(할말, ['구글 색인 제외 깃발이 켜져 있습니다']);
});

check('발행 전 점검 — 다 채워져 있으면 할 말이 없다', () => {
  const 할말 = 발행전점검({
    title: 'ㄱ', content: 'ㄴ',
    meta: { rank_math_description: 'ㄷ', rank_math_focus_keyword: 'ㄹ' },
  });
  assert.deepEqual(할말, []);
});

check('발행 전 백업 파일이 실제로 만들어진다', () => {
  const f = 백업하기({ id: 999999, status: 'draft', title: 'ㄱ', content: 'ㄴ' });

  assert.ok(fs.existsSync(f), `${f} 가 없습니다`);
  const 읽은것 = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(읽은것.id, 999999);
  fs.unlinkSync(f);
});

console.log(`\n  ${passed}개 통과`);
