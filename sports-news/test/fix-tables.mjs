/**
 * 깨진 마크다운 표 고치기 — 테스트
 *
 * 2026-11-05. markdownToBlocks 가 표를 몰라서 발행된 글 네 편에
 * `<p>| 항목 | 값 |<br>|---|---|…</p>` 가 그대로 나갔다. 변환기는 고쳤지만
 * 이미 나간 글은 이 도구가 고친다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  표고치기,
  표만바뀌었나,
  표인가,
  칸나누기,
  구분선인가,
  표블록만들기,
} from '../src/wordpress/fix-tables.mjs';

let 통과 = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    통과 += 1;
  } catch (err) {
    console.log(`  ❌ ${name} — ${err.message}`);
    process.exitCode = 1;
  }
}

const 문단 = (inner) => `<!-- wp:paragraph -->\n<p>${inner}</p>\n<!-- /wp:paragraph -->`;

console.log('\n[깨진 표 고치기]');

check('구분선을 알아본다', () => {
  assert.ok(구분선인가('|---|---|'));
  assert.ok(구분선인가('| --- | :---: |'));
  assert.ok(!구분선인가('| 경기 | 44 |'));
  assert.ok(!구분선인가('|   |   |'), '하이픈이 없으면 구분선이 아닙니다');
});

check('칸을 나눈다', () => {
  assert.deepEqual(칸나누기('| 경기 | 44경기 |'), ['경기', '44경기']);
  assert.deepEqual(칸나누기('| | 주소 |'), ['', '주소']);
});

check('표인지 가린다', () => {
  assert.ok(표인가(['| a | b |', '|---|---|', '| 1 | 2 |']));
  assert.ok(!표인가(['| a | b |', '| 1 | 2 |']), '구분선이 없으면 표가 아닙니다');
  assert.ok(!표인가(['| a | b |']), '한 줄짜리는 표가 아닙니다');
  assert.ok(!표인가(['그냥 글', '|---|---|']), '파이프로 시작하지 않으면 표가 아닙니다');
});

check('깨진 표를 표 블록으로 바꾼다', () => {
  const before = 문단('| 항목 | 값 |<br>|---|---|<br>| 무게 | 80g |');
  const res = 표고치기(before);
  assert.equal(res.센것, 1);
  assert.ok(res.after.includes('<!-- wp:table -->'));
  assert.ok(res.after.includes('<th>항목</th>') && res.after.includes('<td>80g</td>'));
  assert.ok(!res.after.includes('|---|'), '구분선이 남았습니다');
  assert.ok(!res.after.includes('<br>'), '<br> 가 남았습니다');
});

check('셀 안의 태그를 건드리지 않는다', () => {
  const before = 문단('| 경기 | 값 |<br>|---|---|<br>| 경기 | <strong>44경기</strong> |');
  const res = 표고치기(before);
  assert.ok(res.after.includes('<td><strong>44경기</strong></td>'), '이미 변환된 태그가 깨졌습니다');
  assert.ok(!res.after.includes('&lt;strong&gt;'), '태그를 다시 이스케이프했습니다');
});

check('머리칸이 비어 있어도 고친다', () => {
  const res = 표고치기(문단('| | 2026시즌 |<br>|---|---|<br>| 경기 | 44 |'));
  assert.ok(res.after.includes('<th></th>'));
});

check('세 칸짜리 표도 고친다', () => {
  const res = 표고치기(문단('| 가 | 나 | 다 |<br>|---|---|---|<br>| 1 | 2 | 3 |'));
  assert.ok(res.after.includes('<td>3</td>'));
});

check('한 글에 든 표를 모두 고친다', () => {
  const before = `${문단('| a | b |<br>|---|---|<br>| 1 | 2 |')}\n\n${문단('보통 문단')}\n\n${문단('| c | d |<br>|---|---|<br>| 3 | 4 |')}`;
  const res = 표고치기(before);
  assert.equal(res.센것, 2);
  assert.ok(res.after.includes('<p>보통 문단</p>'), '멀쩡한 문단이 사라졌습니다');
});

check('고칠 표가 없으면 null — 멀쩡한 글을 저장하지 않는다', () => {
  assert.equal(표고치기(문단('그냥 문단입니다')), null);
  assert.equal(표고치기('<!-- wp:table -->\n<table><tr><td>이미 표</td></tr></table>\n<!-- /wp:table -->'), null);
});

check('파이프가 있어도 표가 아니면 두 번 손대지 않는다', () => {
  assert.equal(표고치기(문단('값이 | 로 나뉩니다')), null);
});

check('두 번 돌려도 더 바뀌지 않는다', () => {
  const before = 문단('| a | b |<br>|---|---|<br>| 1 | 2 |');
  const 한번 = 표고치기(before).after;
  assert.equal(표고치기(한번), null, '이미 고친 글을 또 고칩니다');
});

check('표만 바뀌었는지 가린다', () => {
  const before = 문단('| a | b |<br>|---|---|<br>| 1 | 2 |');
  const res = 표고치기(before);
  assert.ok(표만바뀌었나(before, res.after));
  assert.ok(!표만바뀌었나(before, res.after + '<p>몰래 더한 글</p>'), '글이 늘었는데 통과했습니다');
  assert.ok(!표만바뀌었나(before, '<!-- wp:table --><table></table><!-- /wp:table -->'), '글이 사라졌는데 통과했습니다');
});

check('표 블록이 워드프레스 문법을 지킨다', () => {
  const html = 표블록만들기(['| a |', '|---|', '| 1 |']);
  assert.ok(html.startsWith('<!-- wp:table -->'));
  assert.ok(html.endsWith('<!-- /wp:table -->'));
  assert.ok(html.includes('<figure class="wp-block-table">'));
});

check('머리만 있고 몸이 없는 표도 깨지지 않는다', () => {
  const res = 표고치기(문단('| a | b |<br>|---|---|'));
  assert.ok(res.after.includes('<th>a</th>'));
  assert.ok(!res.after.includes('<tbody>'), '빈 tbody 를 만들지 않습니다');
});

check('본문만 보낸다 — 제목·주소·발행상태를 보내지 않는다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/fix-tables.mjs', import.meta.url), 'utf8');
  assert.ok(/body:\s*\{\s*content:/.test(src), 'content 말고 다른 것을 보냅니다');
  assert.ok(!/slug:/.test(src), '슬러그를 보냅니다 — 주소가 바뀌면 색인이 끊깁니다');
  assert.ok(!/status:/.test(src), '발행상태를 보냅니다');
});

check('미리보기가 기본이다 — --apply 가 있어야 저장한다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/fix-tables.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes("includes('--apply')"), '--apply 판정이 없습니다');
  assert.ok(/if \(apply\)/.test(src), '미리보기에서도 저장합니다');
});

console.log(`\n✅ ${통과}개 항목 통과\n`);
