// 카테고리 바꾸기 도구 검사.
//
// 이 도구가 지켜야 할 것은 셋이다 — 없는 카테고리를 만들지 않는 것,
// 번호를 안 적으면 아무것도 안 하는 것, 그리고 `categories` 말고는
// 아무것도 안 보내는 것(주소가 바뀌면 색인이 끊긴다).
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 분류이름뽑기, 한번에최대 } from '../src/wordpress/set-category.mjs';

const 여기 = path.dirname(fileURLToPath(import.meta.url));
const 소스 = fs.readFileSync(path.join(여기, '..', 'src', 'wordpress', 'set-category.mjs'), 'utf8');

const 검사 = [];
function 본다(이름, fn) { 검사.push([이름, fn]); }

본다('--분류= 에서 이름을 꺼낸다', () => {
  assert.equal(분류이름뽑기(['23969', '--분류=생활정보', '--apply']), '생활정보');
  assert.equal(분류이름뽑기(['--분류=  야구  ']), '야구');
});

본다('분류를 안 주면 빈 문자열이다', () => {
  assert.equal(분류이름뽑기(['23969', '--apply']), '');
});

본다('한 번에 받는 수에 상한이 있다', () => {
  assert.ok(한번에최대 > 0 && 한번에최대 <= 50);
});

본다('새 카테고리를 만들지 않는다 — POST /categories 가 없다', () => {
  assert.ok(!/categories['"]?\s*,\s*\{\s*method:\s*'POST'/.test(소스));
  assert.ok(소스.includes('새로 만들지 않습니다'));
});

본다('글에 보내는 것은 categories 하나뿐이다', () => {
  const 보냄 = [...소스.matchAll(/body:\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(보냄.length >= 1, 'POST 하는 자리가 있어야 한다');
  for (const b of 보냄) {
    assert.ok(b.includes('categories'), 'categories 를 보내야 한다');
    for (const 금지 of ['title', 'content', 'slug', 'status', 'meta']) {
      assert.ok(!b.includes(금지), `${금지} 를 보내면 안 된다`);
    }
  }
});

본다('미리보기가 기본이다 — --apply 가 있어야 보낸다', () => {
  assert.ok(소스.includes("args.includes('--apply')"));
  assert.ok(/if \(!apply\)/.test(소스));
});

본다('wiki 밖의 글은 건너뛴다', () => {
  assert.ok(소스.includes('손대도되는글인가'));
});

본다('되돌릴 번호를 찍어 준다', () => {
  assert.ok(소스.includes('되돌릴 때 쓸 번호'));
});

let 통과 = 0;
console.log('\n[카테고리 바꾸기]');
for (const [이름, fn] of 검사) {
  try { fn(); console.log(`  ✅ ${이름}`); 통과 += 1; }
  catch (err) { console.log(`  ❌ ${이름}\n     ${err.message}`); process.exitCode = 1; }
}
console.log(`\n${통과}개 항목 통과`);
