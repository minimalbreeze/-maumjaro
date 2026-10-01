// 이미 올린 글의 링크를 현재 창에서 열리게 고치는 경로 검사.
//
// 가장 중요한 것: 글의 상태(발행/임시글)를 건드리지 않는다.
// 발행된 글을 고치다 임시글로 되돌리면 독자가 보던 글이 사라진다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockWordPress } from './mock-wordpress.mjs';
import { openInSameWindow, countNewWindowLinks, fixPostLinks } from '../src/wordpress/fix-links.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[링크를 현재 창에서 열리게]');

check('target="_blank"를 걷어낸다', () => {
  const out = openInSameWindow('<a href="https://x.test" target="_blank">가기</a>');
  assert.equal(out, '<a href="https://x.test">가기</a>');
});

check('따옴표가 홑따옴표여도 걷어낸다', () => {
  assert.ok(!/target/.test(openInSameWindow("<a href='/a' target='_blank'>x</a>")));
});

check('noopener·noreferrer는 같이 지운다', () => {
  // 새 창을 띄울 때만 쓰는 값이라 target이 없으면 의미가 없다.
  const out = openInSameWindow('<a href="/a" target="_blank" rel="noopener noreferrer">x</a>');
  assert.ok(!/rel=/.test(out), out);
});

check('nofollow는 남긴다', () => {
  // 바깥 사이트로 나가는 링크에는 필요하다.
  const out = openInSameWindow('<a href="https://x.test" target="_blank" rel="noopener nofollow">x</a>');
  assert.ok(/rel="nofollow"/.test(out), out);
  assert.ok(!/noopener/.test(out), out);
});

check('target이 없는 링크는 그대로 둔다', () => {
  const html = '<a href="/a" rel="nofollow">x</a>';
  assert.equal(openInSameWindow(html), html);
});

check('a 태그가 아닌 것은 건드리지 않는다', () => {
  // 쿠팡 광고의 script·iframe은 제휴사 코드 그대로여야 동작한다.
  const ad = '<iframe src="https://coupa.ng/ciwQYr" width="100%"></iframe>'
    + '<script src="https://ads-partners.coupang.com/g.js"></script>';
  assert.equal(openInSameWindow(ad), ad);
});

check('링크 글자 안의 target이라는 말은 건드리지 않는다', () => {
  const html = '<p>target="_blank"가 무엇인지 설명합니다</p>';
  assert.equal(openInSameWindow(html), html);
});

check('새 창 링크 개수를 센다', () => {
  assert.equal(countNewWindowLinks('<a target="_blank"></a><a target="_blank"></a><a></a>'), 2);
  assert.equal(countNewWindowLinks('<a></a>'), 0);
});

// ── 워드프레스에 실제로 저장하는 경로 ───────────────────────
const 본문 = [
  '<!-- wp:paragraph --><p>핵심 요약입니다.</p><!-- /wp:paragraph -->',
  '<!-- wp:image --><figure><a href="https://maumjaro.minimalbreeze.com/" target="_blank" rel="noopener"><img src="/a.png" alt="대체"/></a></figure><!-- /wp:image -->',
  '<!-- wp:html --><a href="https://www.youtube.com/@WKBL_official/streams" target="_blank" rel="noopener nofollow">생중계</a><!-- /wp:html -->',
  '<!-- wp:html --><iframe src="https://coupa.ng/ciwQYr"></iframe><!-- /wp:html -->',
].join('\n\n');

const wp = await startMockWordPress({
  posts: {
    7253: { status: 'publish', title: { raw: '2026 KB국민은행 박신자컵' }, content: { raw: 본문 } },
    7260: { status: 'draft', title: { raw: '고칠 것 없는 글' }, content: { raw: '<p><a href="/a">이미 현재 창</a></p>' } },
  },
});

process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

const r = await fixPostLinks(7253);

check('새 창 링크를 찾아 고친다', () => {
  assert.equal(r.before, 2, JSON.stringify(r));
  assert.equal(r.after, 0);
  assert.ok(r.changed);
});

check('발행 상태를 건드리지 않는다', () => {
  // 발행된 글을 고치다 임시글로 되돌리면 독자가 보던 글이 사라진다.
  const patch = wp.state.updated.find((u) => u.id === 7253);
  assert.ok(patch, '저장 요청이 없습니다');
  assert.equal(patch.status, undefined, 'status를 보냈습니다');
  assert.equal(r.status, 'publish', '원래 상태를 잘못 읽었습니다');
});

check('제목·슬러그·SEO 값을 건드리지 않는다', () => {
  const patch = wp.state.updated.find((u) => u.id === 7253);
  assert.equal(patch.title, undefined);
  assert.equal(patch.slug, undefined);
  assert.equal(patch.meta, undefined);
  assert.deepEqual(Object.keys(patch).sort(), ['content', 'id']);
});

check('쿠팡 광고는 그대로 남는다', () => {
  const patch = wp.state.updated.find((u) => u.id === 7253);
  assert.ok(patch.content.includes('<iframe src="https://coupa.ng/ciwQYr"></iframe>'), '광고가 바뀌었습니다');
});

check('본문의 다른 내용은 그대로다', () => {
  const patch = wp.state.updated.find((u) => u.id === 7253);
  assert.ok(patch.content.includes('핵심 요약입니다.'));
  assert.ok(patch.content.includes('youtube.com/@WKBL_official/streams'));
  assert.ok(patch.content.includes('alt="대체"'));
});

const 그대로 = await fixPostLinks(7260);
check('고칠 것이 없으면 저장하지 않는다', () => {
  assert.equal(그대로.changed, false);
  assert.ok(!wp.state.updated.some((u) => u.id === 7260), '건드리지 말아야 합니다');
});

const 미리보기 = await fixPostLinks(7253, { apply: false });
check('미리보기는 저장하지 않는다', () => {
  assert.equal(미리보기.changed, false, '이미 고쳐진 글이라 바뀔 것이 없어야 합니다');
  assert.equal(wp.state.updated.filter((u) => u.id === 7253).length, 1);
});

check('.env 없이도 도는 진입점이다', () => {
  const src = fs.readFileSync(path.join(HERE, '..', 'src', 'wordpress', 'fix-links.mjs'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  assert.ok(!/process\.loadEnvFile/.test(code), 'loadEnv()를 쓰세요');
});

wp.server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
