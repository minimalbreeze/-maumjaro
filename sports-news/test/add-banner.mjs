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
import { OFFICIAL_MARK, officialBannerFor } from '../src/seo/official-banner.mjs';

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

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
