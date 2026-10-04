// 이미 올린 글의 링크를 현재 창에서 열리게 고치는 경로 검사.
//
// 가장 중요한 것: 글의 상태(발행/임시글)를 건드리지 않는다.
// 발행된 글을 고치다 임시글로 되돌리면 독자가 보던 글이 사라진다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockWordPress } from './mock-wordpress.mjs';
import {
  openInSameWindow, countNewWindowLinks, countFixable, linkOnlyChange,
  fixPostLinks, findNewWindowPosts,
} from '../src/wordpress/fix-links.mjs';
import { ROOT } from '../src/utils/env.mjs';

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

// ── 쿠팡 광고 보호 ─────────────────────────────────────────
const 쿠팡블록 = [
  '<!-- wp:html -->',
  '<script src="https://ads-partners.coupang.com/g.js"></script>',
  '<a href="https://link.coupang.com/a/xyz" target="_blank" rel="nofollow sponsored">용품 보러가기</a>',
  '<!-- /wp:html -->',
].join('\n');

check('쿠팡 광고 블록 안의 링크는 건드리지 않는다', () => {
  // 제휴사가 준 코드다. 우리가 손대면 광고가 동작하지 않을 수 있다.
  // 전수로 돌리는 도구라 이 보호가 없으면 수백 편의 광고를 한 번에 망친다.
  const out = openInSameWindow(쿠팡블록);
  assert.equal(out, 쿠팡블록, out);
});

check('쿠팡이 아닌 wp:html 블록은 고친다', () => {
  const 내블록 = '<!-- wp:html -->\n<a href="https://x.test" target="_blank">내 링크</a>\n<!-- /wp:html -->';
  assert.ok(!/target/.test(openInSameWindow(내블록)), openInSameWindow(내블록));
});

check('광고 안의 링크는 고칠 개수로 세지 않는다', () => {
  // 세는 기준과 고치는 기준이 다르면 "고쳤는데 아직 남아 있다"로 보인다.
  assert.equal(countNewWindowLinks(쿠팡블록), 1);
  assert.equal(countFixable(쿠팡블록), 0);
  assert.equal(countFixable(쿠팡블록 + '\n<a href="/a" target="_blank">내 링크</a>'), 1);
});

check('광고와 내 링크가 섞여 있어도 광고만 남는다', () => {
  const 섞임 = 쿠팡블록 + '\n<p><a href="https://y.test" target="_blank" rel="noopener">내 링크</a></p>';
  const out = openInSameWindow(섞임);
  assert.ok(out.includes('link.coupang.com/a/xyz" target="_blank"'), '광고가 바뀌었습니다');
  assert.ok(/<a href="https:\/\/y\.test">/.test(out), out);
});

check('링크 속성 말고 다른 게 바뀌면 알아챈다', () => {
  // 저장 전 마지막 방어선이다. 못 잡으면 발행된 글이 망가진다.
  const before = '<p>첫 문단</p><a href="/a" target="_blank" rel="noopener nofollow">x</a><p>끝 문단</p>';
  assert.ok(linkOnlyChange(before, openInSameWindow(before)));
  assert.ok(!linkOnlyChange(before, openInSameWindow(before).replace('첫 문단', '다른 문단')));
  assert.ok(!linkOnlyChange(before, openInSameWindow(before).replace('<p>끝 문단</p>', '')));
  assert.ok(!linkOnlyChange(before, openInSameWindow(before).replace('href="/a"', 'href="/b"')));
});

// ── 전수 훑기 ──────────────────────────────────────────────
const wp2 = await startMockWordPress({
  posts: {
    1: { status: 'publish', slug: 'a', title: { raw: '새 창 링크가 있는 글' }, categories: [3],
         content: { raw: '<p><a href="https://x.test" target="_blank" rel="noopener">가기</a></p>' } },
    2: { status: 'draft', slug: 'b', title: { raw: '임시글도 센다' }, categories: [3],
         content: { raw: '<p><a href="/b" target="_blank">가기</a></p>' } },
    3: { status: 'publish', slug: 'c', title: { raw: '깨끗한 글' }, categories: [3],
         content: { raw: '<p><a href="/c">가기</a></p>' } },
    4: { status: 'publish', slug: 'd', title: { raw: '광고 안에만 있는 글' }, categories: [3],
         content: { raw: 쿠팡블록 } },
  },
});
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp2.port}`;
const 훑음 = await findNewWindowPosts();

check('본문에 새 창 링크가 박힌 글만 고른다', () => {
  assert.deepEqual(훑음.대상.map((p) => p.id).sort(), [1, 2], JSON.stringify(훑음.대상.map((p) => p.id)));
});

check('임시글도 훑는다', () => {
  // 임시글로 쌓아두고 나중에 발행하는 흐름이라 발행된 것만 보면 놓친다.
  assert.ok(훑음.대상.some((p) => p.status === 'draft'));
});

check('광고 안에만 있는 글은 대상이 아니고, 따로 센다', () => {
  assert.ok(!훑음.대상.some((p) => p.id === 4));
  assert.equal(훑음.광고만, 1);
});

await (async () => {
  const r = await fixPostLinks(1);
  check('전수로 고친 글은 원본 본문을 남긴다', () => {
    assert.ok(r.changed);
    assert.ok(r.backup && fs.existsSync(r.backup), String(r.backup));
    const saved = JSON.parse(fs.readFileSync(r.backup, 'utf8'));
    assert.ok(saved.content.raw.includes('target="_blank"'), '원본이 아니라 고친 뒤를 남겼습니다');
  });
  check('전수로 고칠 때도 content만 보낸다', () => {
    const patch = wp2.state.updated.find((u) => u.id === 1);
    assert.deepEqual(Object.keys(patch).sort(), ['content', 'id']);
  });
})();

fs.rmSync(path.join(ROOT, 'out', 'backup-content'), { recursive: true, force: true });
wp2.server.close();

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
