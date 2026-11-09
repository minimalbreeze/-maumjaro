// 같은 글을 두 번 올리지 않는다.
//
// 2026-11-09 효성님: **"같은 글을 2번 적었다"** — APBC 글이 16561·16574 로,
// FA 글도 두 벌 올라가 있었다. `saveDraft` 가 이미 같은 글이 있는지 묻지
// 않고 무조건 새로 만들던 탓이다.
import assert from 'node:assert/strict';
import { 겹친글가리기 } from '../src/wordpress/draft.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[같은 글 두 번 올리지 않기]');

check('발행된 글이 있으면 막는다', () => {
  const r = 겹친글가리기([{ id: 16561, status: 'publish', title: { raw: 'APBC' } }]);
  assert.equal(r.막을것.length, 1);
  assert.equal(r.막을것[0].id, 16561);
  assert.deepEqual(r.알릴것, []);
});

check('임시글이 있어도 막는다 — 두 벌이 되는 건 마찬가지다', () => {
  const r = 겹친글가리기([{ id: 16574, status: 'draft', title: { raw: 'APBC' } }]);
  assert.equal(r.막을것.length, 1);
});

check('검토대기·예약·비공개도 막는다', () => {
  for (const st of ['pending', 'future', 'private']) {
    const r = 겹친글가리기([{ id: 1, status: st, title: { raw: 'ㄱ' } }]);
    assert.equal(r.막을것.length, 1, `${st} 를 막지 않았습니다`);
  }
});

// ⚠️ 휴지통은 막지 않는다 — 치우고 다시 쓰는 흐름이 있다. 다만 워드프레스가
//    그 슬러그를 붙잡고 있어 새 글에 `-2` 가 붙으므로 알려는 준다.
check('휴지통은 막지 않고 알려만 준다', () => {
  const r = 겹친글가리기([{ id: 16574, status: 'trash', title: { raw: 'APBC' } }]);
  assert.deepEqual(r.막을것, []);
  assert.equal(r.알릴것.length, 1);
  assert.equal(r.알릴것[0].id, 16574);
});

check('겹치는 글이 없으면 둘 다 비어 있다', () => {
  const r = 겹친글가리기([]);
  assert.deepEqual(r.막을것, []);
  assert.deepEqual(r.알릴것, []);
});

check('목록이 없거나 번호가 없는 항목은 무시한다', () => {
  assert.deepEqual(겹친글가리기(null).막을것, []);
  assert.deepEqual(겹친글가리기([{ status: 'publish' }]).막을것, []);
});

check('rendered 제목만 있어도 읽는다', () => {
  const r = 겹친글가리기([{ id: 7, status: 'publish', title: { rendered: '제목' } }]);
  assert.equal(r.막을것[0].title, '제목');
});

check('한 번에 발행본과 휴지통본이 같이 와도 갈라낸다', () => {
  const r = 겹친글가리기([
    { id: 16561, status: 'publish', title: { raw: 'A' } },
    { id: 16574, status: 'trash', title: { raw: 'A' } },
  ]);
  assert.deepEqual(r.막을것.map((g) => g.id), [16561]);
  assert.deepEqual(r.알릴것.map((g) => g.id), [16574]);
});

console.log(`\n  ${passed}개 통과`);
