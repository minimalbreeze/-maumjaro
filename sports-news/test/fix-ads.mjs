// 이미 올린 글의 광고 교체 검사.
//
// 본문을 고치는 도구라 "광고 말고는 안 바뀌는가"를 가장 꼼꼼히 본다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startMockWordPress } from './mock-wordpress.mjs';
import {
  isCoupangAd, countAdBlocks, replaceAds, adOnlyChange, findAdPosts, fixOne,
} from '../src/wordpress/fix-ads.mjs';
import { ROOT } from '../src/utils/env.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[이미 올린 글의 광고 교체]');

const 캐러셀 = `<!-- wp:html -->
<script src="https://ads-partners.coupang.com/g.js"></script>
<script>new PartnersCoupang.G({"id":872203,"template":"carousel"});</script>
<br>"이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다"
<iframe src="https://coupa.ng/ciwQYr"></iframe>
<!-- /wp:html -->`;

const 본문 = [
  '<!-- wp:paragraph --><p>첫 문단입니다.</p><!-- /wp:paragraph -->',
  '<h2>📊 기록과 데이터</h2>',
  캐러셀,
  '<!-- wp:paragraph --><p>광고 뒤 문단입니다.</p><!-- /wp:paragraph -->',
  '<script type="application/ld+json">{"@type":"FAQPage"}</script>',
].join('\n');

check('쿠팡 광고 블록을 알아본다', () => {
  assert.ok(isCoupangAd('<script src="https://ads-partners.coupang.com/g.js"></script>'));
  assert.ok(isCoupangAd('<a href="https://link.coupang.com/a/x">용품</a>'));
  assert.ok(isCoupangAd('쿠팡 파트너스 활동의 일환으로'));
});

check('쿠팡이 아닌 wp:html 블록은 건드리지 않는다', () => {
  // 다른 용도로 쓴 블록을 광고로 오인하면 글이 망가진다.
  assert.ok(!isCoupangAd('<div class="내가 만든 표">내용</div>'));
  assert.ok(!isCoupangAd('<iframe src="https://youtube.com/embed/x"></iframe>'));
});

check('광고 개수를 센다', () => {
  assert.equal(countAdBlocks(본문), 1);
  assert.equal(countAdBlocks('<p>광고 없는 글</p>'), 0);
  assert.equal(countAdBlocks(본문 + '\n' + 캐러셀), 2);
});

// ── 교체 ───────────────────────────────────────────────────
const 새광고 = '<p>파크골프 입문이라면</p>\n<p><a href="https://link.coupang.com/a/test" rel="nofollow sponsored">파크골프 용품 보러가기 ›</a></p>';
const { html: 바뀐본문, 바꿈 } = replaceAds(본문, 새광고);

check('광고를 새 것으로 바꾼다', () => {
  assert.equal(바꿈, 1);
  assert.ok(바뀐본문.includes('link.coupang.com/a/test'), 바뀐본문);
  assert.ok(!바뀐본문.includes('PartnersCoupang'), '옛 캐러셀이 남았습니다');
});

check('광고 말고는 글자 하나 안 바뀐다', () => {
  assert.ok(adOnlyChange(본문, 바뀐본문), '본문이 바뀌었습니다');
  assert.ok(바뀐본문.includes('첫 문단입니다'), '앞 문단이 사라졌습니다');
  assert.ok(바뀐본문.includes('광고 뒤 문단입니다'), '뒤 문단이 사라졌습니다');
  assert.ok(바뀐본문.includes('📊 기록과 데이터'), '소제목이 사라졌습니다');
  assert.ok(바뀐본문.includes('FAQPage'), '구조화 데이터가 사라졌습니다');
});

check('본문이 바뀌면 알아챈다', () => {
  // 이 검사가 마지막 방어선이다. 못 잡으면 발행된 글이 망가진다.
  assert.ok(!adOnlyChange(본문, 바뀐본문.replace('첫 문단입니다', '다른 문단입니다')));
  assert.ok(!adOnlyChange(본문, 바뀐본문.replace('<h2>📊 기록과 데이터</h2>', '')));
});

check('광고가 여러 개면 전부 바꾼다', () => {
  const 둘 = 본문 + '\n' + 캐러셀;
  const r = replaceAds(둘, 새광고);
  assert.equal(r.바꿈, 2);
  assert.ok(!r.html.includes('PartnersCoupang'), r.html.slice(0, 300));
});

check('쿠팡이 아닌 블록은 그대로 남는다', () => {
  const 섞임 = 본문 + '\n<!-- wp:html -->\n<div>내 표</div>\n<!-- /wp:html -->';
  const r = replaceAds(섞임, 새광고);
  assert.equal(r.바꿈, 1);
  assert.ok(r.html.includes('<div>내 표</div>'), '내 블록이 사라졌습니다');
});

check('광고가 없으면 아무것도 안 바꾼다', () => {
  const r = replaceAds('<p>광고 없는 글</p>', 새광고);
  assert.equal(r.바꿈, 0);
  assert.equal(r.html, '<p>광고 없는 글</p>');
});

// ── 실제 경로 ──────────────────────────────────────────────
const wp = await startMockWordPress({
  posts: {
    100: {
      status: 'publish', slug: '파크골프-글', title: { raw: '충주 단월파크골프장' },
      categories: [7], content: { raw: 본문 }, meta: {},
    },
    101: {
      status: 'publish', slug: '바둑-글', title: { raw: '바둑 대회' },
      categories: [9], content: { raw: 본문 }, meta: {},
    },
    102: {
      status: 'publish', slug: '광고없는-글', title: { raw: '광고 없는 글' },
      categories: [7], content: { raw: '<p>본문만</p>' }, meta: {},
    },
  },
});
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

const siteCategories = [{ id: 7, name: '파크골프' }, { id: 9, name: '바둑' }];
const { 대상, 링크없는카테고리 } = await findAdPosts({ siteCategories });

check('맞춤 링크가 있는 글만 고른다', () => {
  assert.deepEqual(대상.map((p) => p.id), [100], JSON.stringify(대상.map((p) => p.id)));
});

check('링크 없는 종목은 건너뛰고 이유를 남긴다', () => {
  // 바둑은 링크가 없다. 멀쩡한 캐러셀을 지우면 안 된다.
  assert.ok(링크없는카테고리.has('바둑'), [...링크없는카테고리.keys()].join(','));
});

check('광고 없는 글은 대상이 아니다', () => {
  assert.ok(!대상.some((p) => p.id === 102));
});

const r = await fixOne(대상[0]);
const patch = () => wp.state.updated.find((u) => u.id === 100);

check('본문을 저장한다', () => {
  assert.ok(r.changed);
  assert.ok(patch().content.includes('link.coupang.com'), patch().content.slice(0, 200));
});

check('content 말고 아무것도 보내지 않는다', () => {
  assert.deepEqual(Object.keys(patch()).sort(), ['content', 'id']);
});

check('고치기 전에 원본 본문을 남긴다', () => {
  assert.ok(r.backup && fs.existsSync(r.backup), r.backup);
  const saved = JSON.parse(fs.readFileSync(r.backup, 'utf8'));
  assert.ok(saved.content.includes('PartnersCoupang'), '원본 광고가 안 남았습니다');
});

await checkAsync('미리보기는 저장하지 않는다', async () => {
  const before = wp.state.updated.length;
  const 미리 = await fixOne(대상[0], { apply: false });
  assert.ok(미리.changed);
  assert.equal(wp.state.updated.length, before);
  assert.equal(미리.backup, null);
});

fs.rmSync(path.join(ROOT, 'out', 'backup-content'), { recursive: true, force: true });
wp.server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
