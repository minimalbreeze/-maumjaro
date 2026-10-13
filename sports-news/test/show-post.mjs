// 글 본문 보기 검사. 읽기 전용 도구라 가장 중요한 건 **글자를 다듬지 않는 것**이다.
// 여기서 본 문장을 그대로 오타 표에 옮겨 적어 찾아 바꾸기에 쓰기 때문에,
// 따옴표나 공백이 바뀌면 표가 글을 못 찾는다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
import { 문단으로 } from '../src/wordpress/show-post.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[글 본문 보기]');

const 본문 = `<!-- wp:paragraph --><p>힐리어드는 141경기에서 타율 0.306을 쳤다.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2>홈런 공동 1위</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>44홈런으로 김도영과 공동 1위다.</p><!-- /wp:paragraph -->`;

check('블록 주석과 태그를 걷어낸다', () => {
  const p = 문단으로(본문);
  assert.ok(!p.join('').includes('wp:paragraph'), '블록 주석이 남았습니다');
  assert.ok(!p.join('').includes('<'), '태그가 남았습니다');
});

check('문단으로 나눈다', () => {
  const p = 문단으로(본문);
  assert.equal(p.length, 3, `문단 수가 다릅니다: ${p.length}`);
  assert.equal(p[0], '힐리어드는 141경기에서 타율 0.306을 쳤다.');
  assert.equal(p[1], '홈런 공동 1위');
  assert.equal(p[2], '44홈런으로 김도영과 공동 1위다.');
});

check('글자를 다듬지 않는다 — 찾아 바꾸기에 그대로 쓸 수 있다', () => {
  // 숫자·소수점·조사가 하나도 바뀌면 안 된다.
  const p = 문단으로(본문);
  assert.ok(p[0].includes('141경기'), '숫자가 바뀌었습니다');
  assert.ok(p[0].includes('0.306'), '소수점이 바뀌었습니다');
});

check('HTML 엔티티는 실제 글자로 되돌린다', () => {
  const p = 문단으로('<p>KT&nbsp;위즈 &amp; 김도영 &quot;45홈런&quot;</p>');
  assert.equal(p[0], 'KT 위즈 & 김도영 "45홈런"');
});

check('빈 문단은 버린다', () => {
  const p = 문단으로('<p></p><p>  </p><p>내용</p>');
  assert.deepEqual(p, ['내용']);
});

check('빈 본문이어도 던지지 않는다', () => {
  assert.deepEqual(문단으로(''), []);
  assert.deepEqual(문단으로(null), []);
  assert.deepEqual(문단으로(undefined), []);
});


// ── 2026-10-13: 처음 판이 여기서 틀렸다 ───────────────────
// 손대도되는글인가 는 (글의 공개 주소, 기준 사이트 주소) 를 받는데 글 객체를
// 넘겼다. 그래서 멀쩡한 wiki 글이 전부 "밖의 글"로 판정돼 하나도 못 봤다.

check('손대도되는글인가를 주소 두 개로 부른다', () => {
  const src = fs.readFileSync(path.join(HERE, '../src/wordpress/show-post.mjs'), 'utf8');
  assert.match(src, /손대도되는글인가\(post\?\.link, wpConfig\(\)\.base\)/, '주소 두 개로 부르지 않습니다');
  assert.ok(!/손대도되는글인가\(post\)/.test(src), '글 객체를 넘기고 있습니다');
});

console.log(`\n  ${passed}개 통과`);
