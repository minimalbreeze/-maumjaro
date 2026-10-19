// 안내를 여러 쌍에 한 번에 넣는 경로 검사.
//
// 왜 필요한가 (2026-10-19)
//   add-notice.mjs 는 한 번에 한 곳만 가리킨다(--to 가 하나다). 겹치는 글을
//   정리하려면 쌍마다 가리킬 곳이 달라서, 222쌍이면 깃허브 액션을 222번
//   돌려야 한다. 그래서 목록 파일을 받아 한 번에 도는 경로를 만들었다.
//
//   안전선은 add-notice 의 것을 **그대로 재사용한다.** 여기서 새로 만들지
//   않는다 — 두 벌이 되면 한쪽만 고쳐 놓고 다른 쪽이 깨진다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 목록읽기 } from '../src/wordpress/notice-batch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[안내 여러 쌍에 넣기]');

check('탭으로 나눈 줄을 쌍으로 읽는다', () => {
  const { 쌍 } = 목록읽기('3664\t3707\t이 대회는 끝났습니다. 결과는 여기로');
  assert.equal(쌍.length, 1);
  assert.deepEqual(쌍[0], { 옛글: 3664, 새글: 3707, 문구: '이 대회는 끝났습니다. 결과는 여기로' });
});

check('주석과 빈 줄을 건너뛴다', () => {
  const { 쌍, 나쁜줄 } = 목록읽기('# 머리말\n\n481\t1538\t더 자세한 글\n\n# 끝');
  assert.equal(쌍.length, 1);
  assert.equal(나쁜줄.length, 0, `주석을 나쁜 줄로 셌습니다: ${JSON.stringify(나쁜줄)}`);
});

check('빈 칸을 0 으로 읽지 않는다', () => {
  // **검사에서 잡은 버그다.** Number('') 는 0 이고 0 은 정수라
  // Number.isInteger 만 보면 그냥 통과한다. 글 번호에 0 은 없다.
  const { 쌍, 나쁜줄 } = 목록읽기('9\t\t문구는 있음\n0\t10\t영번\n7\t8\t');
  assert.equal(쌍.length, 0, `통과시키면 안 되는 줄이 ${쌍.length}개 통과했습니다`);
  assert.equal(나쁜줄.length, 3);
});

check('자기 자신을 가리키는 줄을 막는다', () => {
  const { 쌍, 나쁜줄 } = 목록읽기('5\t5\t자기 자신');
  assert.equal(쌍.length, 0);
  assert.match(나쁜줄[0].줄, /자기 자신/);
});

check('문구에 탭이 들어가도 잃지 않는다', () => {
  const { 쌍 } = 목록읽기('1\t2\t앞\t뒤');
  assert.equal(쌍.length, 1);
  assert.equal(쌍[0].문구, '앞\t뒤');
});

check('나쁜 줄은 줄 번호와 함께 남긴다', () => {
  // 222줄짜리 목록에서 어디가 틀렸는지 못 찾으면 쓸모가 없다.
  const { 나쁜줄 } = 목록읽기('1\t2\t좋음\n이건 탭이 없다');
  assert.equal(나쁜줄.length, 1);
  assert.equal(나쁜줄[0].줄번호, 2);
});

check('안전선을 새로 만들지 않고 add-notice 것을 쓴다', () => {
  // 두 벌이 되면 한쪽만 고쳐 놓고 다른 쪽이 깨진다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/notice-batch.mjs'), 'utf8');
  assert.match(src, /from '\.\/add-notice\.mjs'/, 'add-notice 를 쓰지 않습니다');
  assert.match(src, /addNoticeToPost/, '안내를 넣는 함수를 재사용하지 않습니다');
  assert.ok(!/wpFetch\(/.test(src), '워드프레스를 직접 부릅니다 — add-notice 를 거쳐야 합니다');
});

check('발행 안 된 글은 가리키지 않는다', () => {
  // 독자가 못 보는 곳으로 보내면 안 된다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/notice-batch.mjs'), 'utf8');
  assert.match(src, /status !== 'publish'/, '발행 상태를 보지 않습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
