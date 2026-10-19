// 글을 휴지통으로 보내는 도구 검사.
//
// 이 도구는 **글을 없앤다.** 다른 도구와 달리 잘못 돌면 되돌리는 데 사람 손이
// 든다. 그래서 검사도 "그런 코드가 있는가"가 아니라 **그렇게 동작하는가**로
// 짠다 — 2026-10-19 에 fix-glued 의 호스트 가드가 모양만 맞고 동작은 틀려
// 1693 미리보기가 통째로 0편이 된 적이 있다(#217).
//
// 지켜야 할 선 네 가지
//   ① 영구 삭제 길이 아예 없을 것 (force 를 쓰지 않는다)
//   ② 백업이 삭제보다 먼저일 것
//   ③ 미리보기가 기본일 것
//   ④ 가리키는 링크를 세되, 인코딩된 슬러그도 셀 것

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { 가리키나 } from '../src/wordpress/delete-post.mjs';

const 검사 = [];
const check = (이름, fn) => 검사.push([이름, fn]);

const src = fs.readFileSync(new URL('../src/wordpress/delete-post.mjs', import.meta.url), 'utf8');

// 1625 의 실제 슬러그와, 379 의 '같이 읽을 글' 상자에 실제로 들어 있던 모양
const 슬러그 = '서평택-파3-골프장';
const 인코딩된링크 =
  '<li><a href="https://wiki.minimalbreeze.com/%ec%84%9c%ed%8f%89%ed%83%9d-%ed%8c%8c3-%ea%b3%a8%ed%94%84%ec%9e%a5">서평택 파3 골프장</a></li>';
const 한글링크 = '<p><a href="https://wiki.minimalbreeze.com/서평택-파3-골프장">서평택</a></p>';

check('① 퍼센트 인코딩된 슬러그를 센다 — wiki 의 상자가 이 모양이다', () => {
  assert.equal(가리키나(인코딩된링크, 슬러그), true);
});

check('① 한글 그대로 적힌 슬러그도 센다', () => {
  assert.equal(가리키나(한글링크, 슬러그), true);
});

check('② 다른 글은 세지 않는다', () => {
  const 남 = '<p><a href="https://wiki.minimalbreeze.com/남서울-cc-파3-골프장">남서울</a></p>';
  assert.equal(가리키나(남, 슬러그), false);
});

check('③ 슬러그가 더 긴 슬러그의 꼬리일 때는 세지 않는다', () => {
  // '서평택-파3' 를 찾는데 '서평택-파3-골프장' 이 있으면 걸리면 안 된다.
  const 더긴것 = '<a href="https://wiki.minimalbreeze.com/서평택-파3-골프장">긴 쪽</a>';
  assert.equal(가리키나(더긴것, '서평택-파3'), false, '경계를 안 봅니다');
});

check('③ 주소가 그 슬러그로 끝나도 센다', () => {
  const 끝 = '<a href="https://wiki.minimalbreeze.com/서평택-파3">끝</a>';
  assert.equal(가리키나(끝, '서평택-파3'), true);
});

check('④ 빈 슬러그로는 아무것도 세지 않는다 — 전부 걸리면 재앙이다', () => {
  assert.equal(가리키나(인코딩된링크, ''), false);
  assert.equal(가리키나(인코딩된링크, null), false);
  assert.equal(가리키나(인코딩된링크, '/'), false);
});

check('영구 삭제 길이 아예 없다 — 코드에 force 가 없다', () => {
  // 주석에는 "force 를 쓰지 않는다"고 적혀 있다. 주석을 걷어내고 본다 —
  // 안 걷어내면 설명을 적었다는 이유로 검사가 실패한다.
  const 코드만 = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((줄) => 줄.replace(/\/\/.*$/, ''))
    .join('\n');
  assert.ok(!/force/i.test(코드만), 'force 가 코드에 있습니다. 휴지통으로만 보내야 합니다');
});

check('지우기 전에 백업한다 — 백업이 DELETE 보다 먼저다', () => {
  const 백업자리 = src.indexOf('백업하기(글)');
  const 지우는자리 = src.indexOf("method: 'DELETE'");
  assert.ok(백업자리 > -1, '백업을 부르지 않습니다');
  assert.ok(지우는자리 > -1, 'DELETE 를 보내지 않습니다');
  assert.ok(백업자리 < 지우는자리, '백업이 삭제보다 뒤입니다 — 되돌릴 것이 없습니다');
});

check('미리보기가 기본이다 — --apply 가 없으면 DELETE 앞에서 멈춘다', () => {
  const 멈추는자리 = src.indexOf('if (!apply)');
  const 지우는자리 = src.indexOf("method: 'DELETE'");
  assert.ok(멈추는자리 > -1, '--apply 를 보지 않습니다');
  assert.ok(멈추는자리 < 지우는자리, '미리보기 관문이 삭제보다 뒤입니다');
});

check('wiki 밖의 글은 건드리지 않는다 — base 를 넘겨서 본다', () => {
  assert.match(src, /손대도되는글인가\(글\.link,\s*base\)/, '호스트 확인에 우리 사이트 주소를 넘기지 않습니다');
  assert.match(src, /wpConfig\(\)/, 'wpConfig 를 부르지 않습니다');
});

check('호스트 가드가 실제로 막는다 (#217 과 같은 사고를 되풀이하지 않는다)', async () => {
  const { 손대도되는글인가 } = await import('../src/wordpress/noindex.mjs');
  const base = 'https://wiki.minimalbreeze.com';
  assert.equal(손대도되는글인가('https://wiki.minimalbreeze.com/서평택-파3-골프장', base), true);
  assert.equal(손대도되는글인가('https://in.minimalbreeze.com/무엇이든', base), false, '수익 사이트를 통과시킵니다');
  assert.equal(손대도되는글인가(undefined, base), false);
});

check('글 번호를 하나만 받는다 — 여럿을 한 번에 지우지 않는다', () => {
  assert.match(src, /번호들\.length !== 1/, '글 번호를 하나로 제한하지 않습니다');
});

check('이미 휴지통이면 아무것도 하지 않는다', () => {
  assert.match(src, /status === 'trash'/, '이미 지운 글을 다시 지우려 듭니다');
});

check('지운 뒤 상태가 trash 인지 확인한다', () => {
  assert.match(src, /된상태 !== 'trash'/, '지워졌는지 확인하지 않습니다');
});

check('검사가 이 도구를 불러도 main 이 돌지 않는다 — 파일 이름이 같다', () => {
  // test/delete-post.mjs 와 src/wordpress/delete-post.mjs 는 이름이 같다.
  // endsWith 로 가드를 걸면 검사를 돌릴 때 main() 이 함께 돌아 exit 1 이 된다.
  // 2026-10-19 에 실제로 그래서 워크플로가 통째로 실패했다.
  assert.ok(!/argv\[1\]\.endsWith/.test(src), 'endsWith 가드는 이름이 같은 검사 파일에 걸립니다');
  assert.match(src, /import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`/, '경로 전체를 비교하지 않습니다');
  // 그리고 실제로: 여기까지 왔다는 것은 import 가 exitCode 를 건드리지 않았다는 뜻이다.
  assert.notEqual(process.exitCode, 1, 'import 만으로 exitCode 가 1 이 됐습니다');
});

export default async function run() {
  console.log('\n[글 휴지통으로 보내기]');
  let 실패 = 0;
  for (const [이름, fn] of 검사) {
    try { await fn(); console.log(`  ✅ ${이름}`); } catch (e) { 실패 += 1; console.log(`  ❌ ${이름}\n     ${e.message}`); }
  }
  if (실패) { console.log(`\n❌ ${실패}개 실패`); process.exitCode = 1; } else console.log(`\n✅ ${검사.length}개 항목 통과`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
