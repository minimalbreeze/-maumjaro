// 이미 올린 글에 배너를 넣는 경로 검사.
//
// 2026-10-08: KBO 규약 글(7801)을 다 쓴 뒤에 운영자가 "KBO 공식 홈페이지
// 배너를 넣어 달라"고 했다. 설정만 고쳐서는 이미 저장된 글이 안 바뀐다.
// 이 경로가 없으면 배너 하나 때문에 300원짜리 글을 다시 써야 한다.
//
// 가장 중요한 검사: **배너 말고는 본문이 바뀌지 않는다.** 이미 올린 글을
// 건드리는 일이라, 본문이 틀어지면 되돌리기 어렵다.

import assert from 'node:assert/strict';
import { pickBanner } from '../src/wordpress/add-banner.mjs';
import { applyBanner, bannerOnlyChange, findBanners, bannerSlot, BANNER_SIGN } from '../src/wordpress/add-watch.mjs';
import { APP_MARK } from '../src/seo/app-banner.mjs';
import { OFFICIAL_MARK, officialBannerFor, 공식배너빼는글인가, 공식배너뺀이유 } from '../src/seo/official-banner.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[이미 올린 글에 배너 넣기]');

const 본문 = `<!-- wp:paragraph --><p>머리말입니다.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2>첫 소제목</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>내용 한 줄.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2>두 번째 소제목</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>내용 두 줄.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2>세 번째 소제목</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>마무리.</p><!-- /wp:paragraph -->`;

// ── 어떤 배너를 고르는가 ───────────────────────────────────
check('KBO 글에 KBO 공식 배너를 고른다', () => {
  const b = pickBanner('KBO 참가활동기간 1월 25일로 변경\nKBO 는 이사회에서 규약 개정안을 확정했다.');
  assert.ok(b, '배너를 못 골랐습니다');
  assert.equal(b.종류, '공식 홈페이지');
  assert.ok(b.url.includes('koreabaseball.com'), `주소가 다릅니다: ${b.url}`);
  // 하이픈 하나 차이로 전혀 다른 단체다. 대한야구소프트볼협회(KBSA).
  assert.ok(!b.url.includes('korea-baseball.com'), 'KBSA 주소가 들어갔습니다');
  assert.equal(b.sign, OFFICIAL_MARK);
});

check('앱 글에는 앱 배너가 먼저다', () => {
  // 운영자가 만든 앱 글에 구단 링크를 걸 일은 없다.
  const b = pickBanner('페이드캠으로 찍어봤다\nKBO 경기도 찍었다.');
  assert.equal(b?.종류, '앱');
  assert.equal(b.sign, APP_MARK);
});

check('맞는 곳이 없으면 고르지 않는다', () => {
  assert.equal(pickBanner('신지애 통산 상금 1위, 131억 원 격차'), null);
  assert.equal(pickBanner(''), null);
});

// ── 본문을 건드리지 않는다 ─────────────────────────────────
const 배너 = officialBannerFor('KBO 이사회');

check('배너 말고는 본문이 한 글자도 안 바뀐다', () => {
  // 이미 올린 글을 건드리는 일이다. 이게 깨지면 글이 망가진다.
  const { html, 한일 } = applyBanner(본문, 배너, OFFICIAL_MARK);
  assert.equal(한일, '추가');
  assert.ok(bannerOnlyChange(본문, html, OFFICIAL_MARK), '본문이 바뀌었습니다');
  assert.ok(html.includes('koreabaseball.com'), '배너가 안 들어갔습니다');
});

check('두 번 넣어도 배너가 둘이 되지 않는다', () => {
  const 한번 = applyBanner(본문, 배너, OFFICIAL_MARK).html;
  const 두번 = applyBanner(한번, 배너, OFFICIAL_MARK).html;
  assert.equal(findBanners(두번, OFFICIAL_MARK).length, 1, '배너가 둘이 됐습니다');
  assert.equal(한번, 두번, '두 번째에 내용이 바뀌었습니다');
});

check('주소가 바뀌면 그 블록만 갈아끼운다', () => {
  const 한번 = applyBanner(본문, 배너, OFFICIAL_MARK).html;
  const 새배너 = 배너.replace('https://www.koreabaseball.com/', 'https://tigers.co.kr/');
  const { html, 한일 } = applyBanner(한번, 새배너, OFFICIAL_MARK);
  assert.equal(한일, '교체');
  assert.equal(findBanners(html, OFFICIAL_MARK).length, 1, '배너가 둘이 됐습니다');
  assert.ok(html.includes('tigers.co.kr'), '새 주소가 안 들어갔습니다');
  assert.ok(!html.includes('koreabaseball.com'), '옛 주소가 남았습니다');
});

// ── 다른 배너와 붙지 않는다 ────────────────────────────────
check('중계 배너 바로 뒤에 붙이지 않는다', () => {
  // 카드가 연달아 붙으면 둘 다 광고로 보여 아무것도 안 눌린다.
  const 중계있는글 = 본문.replace(
    '<!-- wp:heading --><h2>두 번째 소제목</h2><!-- /wp:heading -->',
    `<!-- wp:html --><div>${BANNER_SIGN} 중계</div><!-- /wp:html -->\n\n<!-- wp:heading --><h2>두 번째 소제목</h2><!-- /wp:heading -->`,
  );
  const 자리 = bannerSlot(중계있는글);
  const 중계끝 = 중계있는글.indexOf('<!-- /wp:html -->') + '<!-- /wp:html -->'.length;
  assert.notEqual(자리, null, '자리를 못 잡았습니다');
  assert.ok(중계있는글.slice(중계끝, 자리).trim() !== '' || 자리 < 중계끝,
    '중계 배너 바로 뒤에 붙었습니다');
});

check('소제목이 둘도 없으면 글 끝에 붙인다', () => {
  const 짧은글 = '<!-- wp:paragraph --><p>한 문단뿐.</p><!-- /wp:paragraph -->';
  assert.equal(bannerSlot(짧은글), null);
  const { html, 한일 } = applyBanner(짧은글, 배너, OFFICIAL_MARK);
  assert.equal(한일, '추가');
  assert.ok(html.indexOf('koreabaseball.com') > html.indexOf('한 문단뿐'), '글 끝이 아닙니다');
});

// ── 안전 ───────────────────────────────────────────────────
check('본문이 바뀌면 저장하지 않는다', () => {
  // bannerOnlyChange 가 마지막 방어선이다. 이게 false 면 코드가 던진다.
  const 망가진것 = applyBanner(본문, 배너, OFFICIAL_MARK).html.replace('마무리', '다른 말');
  assert.equal(bannerOnlyChange(본문, 망가진것, OFFICIAL_MARK), false,
    '본문이 바뀌었는데 "배너만 바뀜"으로 통과했습니다');
});

check('빈 배너는 아무것도 하지 않는다', () => {
  const { html, 한일 } = applyBanner(본문, '', OFFICIAL_MARK);
  assert.equal(한일, null);
  assert.equal(html, 본문);
});

// ── 운영자가 빼라고 한 글 (2026-11-03) ─────────────────────
// 조명우 3쿠션 월드컵 글(11797)에 PBA 배너가 붙었다. 본문에 "국내 프로당구
// (PBA)"가 한 번 나와서다. 같은 당구지만 UMB 월드컵과 PBA 는 다른 대회다.
check('빼는글에 적힌 글은 숫자로도 글자로도 알아본다', () => {
  assert.equal(공식배너빼는글인가(11797), true);
  assert.equal(공식배너빼는글인가('11797'), true, '문자열 번호를 못 알아봅니다');
  assert.equal(공식배너빼는글인가(7801), false, '엉뚱한 글이 걸렸습니다');
  assert.equal(공식배너빼는글인가(null), false, '번호가 없으면 빼지 않습니다');
});

check('왜 뺐는지를 설정에서 그대로 꺼내 온다', () => {
  // 번호만 남으면 나중에 이유를 잃는다. 보고에 그대로 찍는다.
  assert.match(공식배너뺀이유(11797), /PBA/);
  assert.equal(공식배너뺀이유(7801), '');
});

check('뺀 자리에 빈 줄이 셋 넘게 남지 않는다', () => {
  // add-banner 가 쓰는 것과 같은 식이다. removeWatchBanner 와 맞춰 둔다.
  const 한번 = applyBanner(본문, 배너, OFFICIAL_MARK).html;
  const 있는것 = findBanners(한번, OFFICIAL_MARK);
  assert.equal(있는것.length, 1);
  let html = 한번;
  for (const x of [...있는것].reverse()) html = html.slice(0, x.start) + html.slice(x.end);
  html = html.replace(/\n{3,}/g, '\n\n');
  assert.equal(findBanners(html, OFFICIAL_MARK).length, 0, '배너가 안 빠졌습니다');
  assert.ok(!/\n{3,}/.test(html), '빈 줄이 셋 넘게 남았습니다');
  assert.ok(bannerOnlyChange(한번, html, OFFICIAL_MARK), '배너 말고 다른 것이 바뀌었습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
