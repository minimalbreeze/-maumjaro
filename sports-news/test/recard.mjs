// 카드 이미지 다시 굽기 검사.
//
// 2026-10-26: 폰트 없이 그려진 두부(□) 카드가 글 11265 에 올라가 발행됐다.
// 이 도구는 **본문을 건드리지 않고 그림만** 갈아끼우는 것이 전부라,
// "src 말고 아무것도 안 바뀐다"를 가장 꼼꼼히 본다.

import assert from 'node:assert/strict';
import { 이미지자리들, 카드글자정하기, src바꾸기, src만바뀌었나 } from '../src/wordpress/recard.mjs';
import { 한글들었나, 한글폰트있나, renderCard, 폰트검사다시 } from '../src/images/textcard.mjs';

let 통과 = 0;
let 실패 = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); 통과 += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); 실패 += 1; }
}

console.log('\n[카드 다시 굽기]');

const 본문 = [
  '<!-- wp:paragraph --><p>첫 문단</p><!-- /wp:paragraph -->',
  '<figure class="wp-block-image size-large"><a href="https://x/"><img src="https://wp/a.png" alt="대표"/></a></figure>',
  '<!-- wp:heading --><h2>📌 설치비 차이가 생기는 원리</h2><!-- /wp:heading -->',
  '<figure class="wp-block-image size-large"><a href="https://x/"><img src="https://wp/b.png" alt="둘째"/></a></figure>',
].join('\n');

check('본문에서 이미지 자리를 순서대로 찾는다', () => {
  const r = 이미지자리들(본문);
  assert.equal(r.length, 2);
  assert.equal(r[0].src, 'https://wp/a.png');
  assert.equal(r[1].src, 'https://wp/b.png');
});

check('첫 이미지는 글 제목, 그 뒤는 가장 가까운 앞 소제목을 쓴다', () => {
  const r = 카드글자정하기(본문, '스크린파크골프 창업비용');
  assert.equal(r[0].자리, 'hero');
  assert.equal(r[0].글자, '스크린파크골프 창업비용');
  assert.equal(r[1].자리, 'section');
  assert.equal(r[1].글자, '설치비 차이가 생기는 원리', '소제목 앞 이모지는 빠져야 한다');
});

check('앞에 소제목이 없으면 제목으로 떨어진다', () => {
  const r = 카드글자정하기('<figure><img src="x.png"/></figure><figure><img src="y.png"/></figure>', '제목');
  assert.equal(r[1].글자, '제목');
});

check('src 하나만 바꾼다 — alt 와 class 는 그대로다', () => {
  const 후 = src바꾸기(본문, 'https://wp/b.png', 'https://wp/새것.png');
  assert.ok(후.includes('src="https://wp/새것.png"'));
  assert.ok(후.includes('alt="둘째"'), 'alt 가 살아 있어야 한다');
  assert.ok(후.includes('class="wp-block-image size-large"'));
  assert.ok(후.includes('src="https://wp/a.png"'), '안 고른 이미지는 그대로다');
});

check('src 말고 다른 것이 바뀌면 잡아낸다', () => {
  assert.equal(src만바뀌었나(본문, src바꾸기(본문, 'https://wp/a.png', 'z.png')), true);
  assert.equal(src만바뀌었나(본문, 본문.replace('첫 문단', '바뀐 문단')), false, '문단이 바뀌면 막아야 한다');
  assert.equal(src만바뀌었나(본문, 본문.replace('alt="대표"', 'alt="딴것"')), false, 'alt 가 바뀌면 막아야 한다');
  assert.equal(src만바뀌었나(본문, `${본문}<p>덧붙임</p>`), false, '뭔가 덧붙으면 막아야 한다');
});

console.log('\n[한글 폰트 가드]');

check('한글이 들어 있는지 가른다', () => {
  assert.equal(한글들었나('리디아 고 통산 상금'), true);
  assert.equal(한글들었나('ㄱㄴㄷ'), true, '자모만 있어도 한글이다');
  assert.equal(한글들었나('LPGA 2026 Tour'), false);
  assert.equal(한글들었나(''), false);
  assert.equal(한글들었나(null), false);
});

check('폰트를 못 찾으면 한글 카드를 그리지 않는다', async () => {
  // fc-list 가 아무것도 못 찾는 상황을 흉내 낸다.
  // 실제로 이것이 리디아 고 글(11265)에서 일어난 일이다.
  폰트검사다시();
  const 원래 = process.env.PATH;
  const 빈곳 = new URL('./fixtures-nofont', import.meta.url).pathname;
  process.env.PATH = `${빈곳}:${원래}`;
  try {
    assert.equal(한글폰트있나(), false, '빈 fc-list 는 "폰트 없음"으로 읽혀야 한다');
  } finally {
    process.env.PATH = 원래;
    폰트검사다시();
  }
});

check('fc-list 가 아예 없는 기계에서는 막지 않는다', () => {
  // 확인할 방법이 없는데 카드를 막아 버리면 멀쩡한 곳에서 이미지를 잃는다.
  폰트검사다시();
  const 원래 = process.env.PATH;
  process.env.PATH = '/nonexistent-bin';
  try {
    assert.equal(한글폰트있나(), true);
  } finally {
    process.env.PATH = 원래;
    폰트검사다시();
  }
});

// ── 끝단 검사 ───────────────────────────────────────────────────
//
// 2026-10-26: 위의 순수 함수들은 다 통과했는데 실제로 돌리니 두 군데서
// 터졌다. `wpConfig().url`(없는 필드)과 `손대도되는글인가(post)`(인자가
// 둘인데 하나만 줬다)다. 둘 다 **내가 돌려 보지 않은 경로**였다.
// 그래서 가짜 워드프레스를 세워 끝까지 돌려 본다.

import { startMockWordPress } from './mock-wordpress.mjs';
import { recard } from '../src/wordpress/recard.mjs';

const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); 통과 += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); 실패 += 1; }
};

console.log('\n[가짜 워드프레스에 끝까지 돌려보기]');

const wp = await startMockWordPress({
  posts: {
    11265: {
      status: 'publish', slug: '리디아-고-통산-상금',
      title: { raw: '리디아 고 통산 상금, 소렌스탐 기록까지 22만3228달러 남았다' },
      content: { raw: 본문 }, meta: {},
    },
  },
});
// 손대도되는글인가() 는 글의 공개 주소 호스트를 본다. 포트는 서버가 뜬
// 뒤에야 알 수 있으므로 여기서 채운다.
wp.state.posts[11265].link = `http://127.0.0.1:${wp.port}/?p=11265`;
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

await checkAsync('미리보기는 아무것도 저장하지 않는다', async () => {
  await recard([11265], { apply: false });
  assert.equal(wp.state.updated.length, 0);
  assert.equal(wp.state.media.length, 0);
});

await checkAsync('실제 적용은 이미지를 올리고 src만 바꾼다', async () => {
  await recard([11265], { apply: true });
  assert.equal(wp.state.media.length, 2, '카드 두 장을 올려야 한다');
  const patch = wp.state.updated.find((u) => u.id === 11265);
  assert.ok(patch, '글을 저장해야 한다');
  assert.ok(patch.content, 'content 를 보내야 한다');
  assert.equal(patch.title, undefined, '제목은 보내지 않는다');
  assert.equal(patch.slug, undefined, '슬러그는 보내지 않는다');
  assert.equal(patch.status, undefined, '발행상태는 보내지 않는다');
  assert.ok(patch.featured_media, '대표 이미지를 지정해야 한다');
  assert.ok(src만바뀌었나(본문, patch.content), 'src 말고 다른 것이 바뀌면 안 된다');
  assert.ok(patch.content.includes('alt="대표"') && patch.content.includes('alt="둘째"'), 'alt 는 그대로다');
});

wp.server.close();

console.log(실패 ? `\n❌ 실패한 항목이 있습니다 (${실패}개)` : `\n✅ ${통과}개 항목 통과`);
if (실패) process.exitCode = 1;
