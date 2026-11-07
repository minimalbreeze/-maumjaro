// 쿠팡 블록 아래 여백 주기 검사.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 여백넣기, 여백빼기, 여백만바뀌었나, 여백블록 } from '../src/wordpress/space-ad.mjs';
import { ROOT } from '../src/utils/env.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[쿠팡 블록 아래 여백]');

const 쿠팡 = [
  '<!-- wp:html -->',
  '<script src="https://ads-partners.coupang.com/g.js"></script>',
  '<iframe src="https://coupa.ng/ciwQYr" width="100%" height="44"></iframe>',
  '<!-- /wp:html -->',
].join('\n');
const 하단바 = [
  '<!-- wp:html -->',
  '<div id="cpst"><script src="https://ads-partners.coupang.com/g.js"></script>',
  '<iframe src="https://coupa.ng/ciwQYr" width="100%" height="44"></iframe></div>',
  '<!-- /wp:html -->',
].join('\n');
const 본문 = `<!-- wp:paragraph -->\n<p>앞 문단</p>\n<!-- /wp:paragraph -->\n\n${쿠팡}\n\n<!-- wp:heading -->\n<h2>소제목</h2>\n<!-- /wp:heading -->`;

check('쿠팡 블록 뒤에 여백을 넣는다', () => {
  const r = 여백넣기(본문);
  assert.ok(r, '여백을 넣지 못했습니다');
  assert.match(r, /wp-block-spacer/, '스페이서 블록이 없습니다');
  const i = r.indexOf('<!-- /wp:html -->');
  const j = r.indexOf('wp:spacer');
  assert.ok(j > i, '여백이 쿠팡 블록 뒤가 아닙니다');
});

check('워드프레스 기본 스페이서 블록을 쓴다', () => {
  // 테마가 바뀌어도 남는 표준 블록이어야 한다.
  assert.match(여백블록, /^<!-- wp:spacer \{"height":"\d+px"\} -->/);
  assert.match(여백블록, /class="wp-block-spacer"/);
  assert.match(여백블록, /<!-- \/wp:spacer -->$/);
});

check('하단 고정 바는 건드리지 않는다', () => {
  // 바는 제 여백을 스스로 준다. 여기에 또 주면 바가 두꺼워진다.
  assert.equal(여백넣기(하단바), null, '하단 바에 여백을 넣었습니다');
});

check('본문과 하단 바가 같이 있어도 본문 것만 잡는다', () => {
  const 둘다 = `${본문}\n\n${하단바}`;
  const r = 여백넣기(둘다);
  assert.ok(r, '여백을 넣지 못했습니다');
  assert.ok(r.indexOf('wp-block-spacer') < r.indexOf('id="cpst"'), '하단 바 쪽에 넣었습니다');
});

check('두 번 넣지 않는다', () => {
  const 한번 = 여백넣기(본문);
  assert.equal(여백넣기(한번), null, '두 번 넣었습니다');
});

check('빼면 원래대로 돌아온다', () => {
  const 한번 = 여백넣기(본문);
  assert.equal(여백빼기(한번), 본문, '되돌리지 못했습니다');
  assert.equal(여백빼기(본문), null, '없는데 뺐습니다');
});

check('여백 말고 다른 것이 바뀌면 잡는다', () => {
  const 한번 = 여백넣기(본문);
  assert.equal(여백만바뀌었나(본문, 한번), true, '정상인데 막았습니다');
  const 망친것 = 한번.replace('앞 문단', '');
  assert.equal(여백만바뀌었나(본문, 망친것), false, '본문이 지워진 것을 못 잡았습니다');
});

check('쿠팡 코드를 건드리지 않는다', () => {
  const r = 여백넣기(본문);
  assert.ok(r.includes('https://ads-partners.coupang.com/g.js'), '쿠팡 스크립트가 바뀌었습니다');
  assert.ok(r.includes('https://coupa.ng/ciwQYr'), '쿠팡 위젯 주소가 바뀌었습니다');
});

check('쿠팡이 없는 글은 그냥 둔다', () => {
  assert.equal(여백넣기('<!-- wp:paragraph -->\n<p>광고 없는 글</p>\n<!-- /wp:paragraph -->'), null);
});

check('본문만 보낸다 — 제목·주소·발행상태를 보내지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/space-ad.mjs'), 'utf8');
  const 보내는것 = [...src.matchAll(/body:\s*\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert.deepEqual(보내는것, ['content: after'], `본문 말고 다른 것을 보냅니다: ${보내는것.join(' / ')}`);
  assert.ok(!/slug/.test(src), '주소(슬러그)를 다룹니다');
});

check('미리보기가 기본이고 되돌리는 길이 있다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/space-ad.mjs'), 'utf8');
  assert.match(src, /const apply = args\.includes\('--apply'\)/);
  assert.match(src, /if \(!apply\) continue;/);
  assert.match(src, /--빼기/);
  assert.match(src, /const 전체 = args\.includes\('--전체'\)/, '전체는 명시해야 돈다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
