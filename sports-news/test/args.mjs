// 명령줄 인자 읽기 검사. 2026-11-07 에 '--한번에 10' 의 10 을 글 번호로
// 집어가 10번 글을 고치려 한 일을 막는다.
import assert from 'node:assert/strict';
import { 숫자옵션, 글번호들 } from '../src/wordpress/args.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[명령줄 인자 읽기]');

check('숫자 옵션 값을 글 번호로 세지 않는다 — 이번 일의 핵심', () => {
  assert.deepEqual(글번호들(['--한번에', '10'], ['--한번에']), []);
  assert.deepEqual(글번호들(['--한번에', '10', '9247'], ['--한번에']), ['9247']);
  assert.deepEqual(글번호들(['9247', '--한번에', '10'], ['--한번에']), ['9247']);
});

check('옵션을 안 적으면 글 번호를 다 고른다', () => {
  assert.deepEqual(글번호들(['9247', '1650'], ['--한번에']), ['9247', '1650']);
});

check('옵션 이름을 안 넘기면 옛 동작 그대로다 — 그래서 반드시 넘겨야 한다', () => {
  assert.deepEqual(글번호들(['--한번에', '10'], []), ['10']);
});

check('--apply 같은 글자 옵션은 글 번호가 아니다', () => {
  assert.deepEqual(글번호들(['--apply', '9247', '--한번에', '5'], ['--한번에']), ['9247']);
});

check('숫자옵션이 값을 읽는다', () => {
  assert.equal(숫자옵션(['--한번에', '25'], '--한번에', 10), 25);
  assert.equal(숫자옵션(['--한번에'], '--한번에', 10), 10, '값이 없으면 기본값');
  assert.equal(숫자옵션([], '--한번에', 10), 10);
  assert.equal(숫자옵션(['--한번에', '0'], '--한번에', 10), 10, '0 은 받지 않는다');
  assert.equal(숫자옵션(['--한번에', 'abc'], '--한번에', 10), 10, '숫자가 아니면 기본값');
});

console.log(`\n  ${passed}개 통과`);
