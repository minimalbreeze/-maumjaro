// 글자로 남은 마크다운 링크 고치기 검사.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 링크고치기, 링크만바뀌었나, MD링크 } from '../src/wordpress/fix-mdlinks.mjs';
import { ROOT } from '../src/utils/env.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[글자로 남은 마크다운 링크 고치기]');

const 목록 = [
  '<!-- wp:list -->',
  '<ul>',
  '<li><strong>배드민턴</strong> — [안세영 중계 보는 법](https://wiki.minimalbreeze.com/안세영-중계)</li>',
  '<li><strong>골프</strong> — [KPGA 공식 유튜브](https://www.youtube.com/@KPGATOUR)</li>',
  '</ul>',
  '<!-- /wp:list -->',
].join('\n');

check('마크다운 링크를 실제 링크로 바꾼다', () => {
  const r = 링크고치기(목록);
  assert.equal(r.센것, 2);
  assert.match(r.after, /<a href="https:\/\/wiki\.minimalbreeze\.com\/안세영-중계">안세영 중계 보는 법<\/a>/);
  assert.ok(!r.after.includes('['), '대괄호가 남았습니다');
});

check('우리 글에는 nofollow 를 붙이지 않고 바깥에는 붙인다', () => {
  const after = 링크고치기(목록).after;
  assert.ok(!/안세영-중계" rel="nofollow"/.test(after), '우리 글에 nofollow 가 붙었습니다');
  assert.match(after, /@KPGATOUR" rel="nofollow"/);
});

check('새 창으로 띄우지 않는다', () => {
  const after = 링크고치기(목록).after;
  assert.ok(!after.includes('target='), 'target 이 들어갔습니다');
  assert.ok(!after.includes('noopener'), 'target 이 없는데 noopener 가 들어갔습니다');
});

check('표 칸 안의 글자도 고친다 — 칸 구조는 그대로다', () => {
  const 표 = '<figure class="wp-block-table"><table><tbody><tr><td>[KPGA 공식 유튜브](https://www.youtube.com/@KPGATOUR)</td></tr></tbody></table></figure>';
  const r = 링크고치기(표);
  assert.equal(r.센것, 1);
  assert.match(r.after, /<td><a href="https:\/\/www\.youtube\.com\/@KPGATOUR" rel="nofollow">KPGA 공식 유튜브<\/a><\/td>/);
});

check('쿠팡 광고 코드는 건드리지 않는다', () => {
  const 광고 = '<!-- wp:html -->\n<script>new PartnersCoupang.G({"template":"[a](b)"});</script>\n<!-- /wp:html -->';
  assert.equal(링크고치기(광고), null, '광고 안을 바꿨습니다');
  const 섞인것 = `${목록}\n${광고}`;
  const r = 링크고치기(섞인것);
  assert.equal(r.센것, 2, '광고 안의 것까지 셌습니다');
  assert.ok(r.after.includes('"template":"[a](b)"'), '광고 코드가 바뀌었습니다');
  assert.equal(링크만바뀌었나(섞인것, r.after), true, '광고가 섞이면 검사가 어긋납니다');
});

check('고칠 링크가 없으면 null — 멀쩡한 글을 저장하지 않는다', () => {
  assert.equal(링크고치기('<p>이미 <a href="https://a.com/b">링크</a> 입니다</p>'), null);
  assert.equal(링크고치기(''), null);
});

check('두 번 돌려도 더 바뀌지 않는다', () => {
  const 한번 = 링크고치기(목록).after;
  assert.equal(링크고치기(한번), null, '두 번째에도 바꿀 것을 찾았습니다');
});

check('링크만 바뀌었는지 가린다', () => {
  const r = 링크고치기(목록);
  assert.equal(링크만바뀌었나(목록, r.after), true, '정상인데 막았습니다');
  const 망친것 = r.after.replace('배드민턴', '');
  assert.equal(링크만바뀌었나(목록, 망친것), false, '글자가 지워진 것을 못 잡았습니다');
});

check('본문만 보낸다 — 제목·주소·발행상태를 보내지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/fix-mdlinks.mjs'), 'utf8');
  const 보내는것 = [...src.matchAll(/body:\s*\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert.deepEqual(보내는것, ['content: res.after'], `본문 말고 다른 것을 보냅니다: ${보내는것.join(' / ')}`);
  assert.ok(!/slug/.test(src), '주소(슬러그)를 다룹니다');
  assert.ok(!/_fields:[^}]*status/.test(src), '발행상태를 읽습니다');
});

check('미리보기가 기본이다 — --apply 가 있어야 저장한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/fix-mdlinks.mjs'), 'utf8');
  assert.match(src, /const apply = args\.includes\('--apply'\)/);
  assert.match(src, /if \(!apply\) continue;/);
});

check('주소에 공백이 있으면 링크로 보지 않는다', () => {
  MD링크.lastIndex = 0;
  assert.equal(링크고치기('<p>[글자](주소 에 공백)</p>'), null);
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
