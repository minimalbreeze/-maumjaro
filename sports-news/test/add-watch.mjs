// 이미 올린 글에 중계 배너를 넣는 경로 검사.
//
// 발행된 글의 본문을 고치는 도구라 "넣은 것 말고는 안 바뀌는가"를 가장 꼼꼼히 본다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startMockWordPress } from './mock-wordpress.mjs';
import {
  bannerSlot, applyBanner, bannerOnlyChange, alreadyHasBanner, findBanners, addWatchBanner, showBanner,
} from '../src/wordpress/add-watch.mjs';
import { pickWatchLinks, watchBannerHtml } from '../src/seo/watch-banner.mjs';
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

console.log('\n[이미 올린 글에 중계 배너 넣기]');

const H2 = (t) => `<!-- wp:heading -->\n<h2>${t}</h2>\n<!-- /wp:heading -->`;
const P = (t) => `<!-- wp:paragraph -->\n<p>${t}</p>\n<!-- /wp:paragraph -->`;
const 광고 = '<!-- wp:html -->\n<script src="https://ads-partners.coupang.com/g.js"></script>\n<!-- /wp:html -->';

const 본문 = [
  P('2026-27 KBL 정규리그가 10월 4일 개막했다.'),
  H2('🏀 개막 일정'),
  P('부산 KCC와 창원 LG가 먼저 붙는다.'),
  H2('📺 중계 어디서 보나'),
  P('tvN SPORTS가 중계한다.'),
  H2('📌 배경과 원리, 비슷한 사례 비교'),
  P('중계권은 3년 단위로 바뀐다.'),
].join('\n\n');

check('두 번째 소제목 앞을 고른다', () => {
  const at = bannerSlot(본문);
  assert.ok(at !== null);
  assert.ok(본문.slice(at).startsWith('<!-- wp:heading -->\n<h2>📺 중계'), 본문.slice(at, at + 60));
});

check('광고 바로 뒤 자리는 피한다', () => {
  // 광고와 배너가 맞붙으면 둘 다 광고로 보여서 아무것도 안 눌린다.
  const 광고가앞에 = 본문.replace(H2('📺 중계 어디서 보나'), `${광고}\n\n${H2('📺 중계 어디서 보나')}`);
  const at = bannerSlot(광고가앞에);
  assert.ok(광고가앞에.slice(at).startsWith('<!-- wp:heading -->\n<h2>📌 배경'), 광고가앞에.slice(at, at + 60));
});

check('h3는 자리 후보가 아니다', () => {
  const h3만 = [P('도입'), H2('하나'), '<!-- wp:heading {"level":3} -->\n<h3>작은 제목</h3>\n<!-- /wp:heading -->'].join('\n\n');
  assert.equal(bannerSlot(h3만), null);
});

check('소제목이 둘도 없으면 맨 끝에 붙인다', () => {
  const 짧은글 = [P('도입'), H2('하나')].join('\n\n');
  const r = applyBanner(짧은글, '<!-- wp:html -->\n📺 경기 보러가기\n<!-- /wp:html -->');
  assert.equal(r.한일, '추가');
  assert.ok(r.html.trimEnd().endsWith('<!-- /wp:html -->'), r.html.slice(-80));
  assert.ok(r.html.includes('<h2>하나</h2>'), '원래 내용이 사라졌습니다');
});

// ── 넣은 것 말고는 안 바뀌는가 ──────────────────────────────
const entry = pickWatchLinks('농구', { text: '2026-27 KBL 부산 KCC' });
const 배너 = watchBannerHtml(entry, { title: '2026-27 KBL 경기일정' });
const { html: 넣은본문, 한일 } = applyBanner(본문, 배너);

check('설정에서 KBL 중계처를 고른다', () => {
  assert.equal(entry.primary.url, 'https://tvnsports.cjenm.com/ko/');
  assert.ok(배너.includes('tvnsports.cjenm.com'), 배너.slice(0, 200));
});

check('배너가 들어간다', () => {
  assert.equal(한일, '추가');
  assert.ok(넣은본문.includes('tvnsports.cjenm.com'));
  assert.ok(넣은본문.includes('📺 경기 보러가기'));
});

check('배너는 현재 창에서 열린다', () => {
  // 새 창으로 띄우면 운영자의 전면 광고가 뜨지 않는다.
  assert.ok(!배너.includes('target='), 배너);
  assert.ok(배너.includes('rel="nofollow"'));
});

check('넣은 것 말고는 글자 하나 안 바뀐다', () => {
  assert.ok(bannerOnlyChange(본문, 넣은본문), '본문이 바뀌었습니다');
  for (const 조각 of ['2026-27 KBL 정규리그가 10월 4일 개막했다', '부산 KCC와 창원 LG', '📌 배경과 원리', '중계권은 3년 단위로']) {
    assert.ok(넣은본문.includes(조각), `사라졌습니다: ${조각}`);
  }
});

check('본문이 바뀌면 알아챈다', () => {
  // 이 검사가 마지막 방어선이다. 못 잡으면 발행된 글이 망가진다.
  assert.ok(!bannerOnlyChange(본문, 넣은본문.replace('부산 KCC와 창원 LG', '다른 팀')));
  assert.ok(!bannerOnlyChange(본문, 넣은본문.replace(H2('📌 배경과 원리, 비슷한 사례 비교'), '')));
  assert.ok(!bannerOnlyChange(본문, 넣은본문.replace(P('tvN SPORTS가 중계한다.'), '')));
});

check('배너가 있는지는 배너 블록으로 본다 — 주소로 보면 안 된다', () => {
  // 글 7690 이 실제로 이랬다. 본문 글자 안에 중계 주소가 링크로 적혀 있는데
  // 배너 블록은 없었다. 주소만 보고 '이미 있다'며 건너뛰어서 배너가 영영
  // 안 들어갔다. 운영자가 "베너가 빠졌어"라고 짚은 게 이것이다.
  const 주소만있는본문 = 본문.replace(
    P('tvN SPORTS가 중계한다.'),
    P('tvN SPORTS(<a href="https://tvnsports.cjenm.com/ko/" rel="nofollow">공식 사이트</a>)가 중계한다.'),
  );
  assert.ok(주소만있는본문.includes('https://tvnsports.cjenm.com/ko/'), '준비가 잘못됐습니다');
  assert.ok(!alreadyHasBanner(주소만있는본문, 'https://tvnsports.cjenm.com/ko/'), '주소만 보고 있습니다');
  assert.equal(findBanners(주소만있는본문).length, 0);

  assert.ok(alreadyHasBanner(넣은본문, 'https://tvnsports.cjenm.com/ko/'));
  assert.equal(findBanners(넣은본문).length, 1);
  assert.ok(!alreadyHasBanner(본문, 'https://tvnsports.cjenm.com/ko/'));
});

check('중계처가 바뀌면 있는 배너를 바꾼다', () => {
  // 중계권이 옮겨가는 일이 실제로 있다(2026-27 KBL → tvN SPORTS).
  // 그때 배너를 하나 더 넣으면 둘이 되어 어느 쪽이 맞는지 알 수 없다.
  const 옛배너본문 = 넣은본문.replace('https://tvnsports.cjenm.com/ko/', 'https://old.example.com/');
  const r = applyBanner(옛배너본문, 배너);
  assert.equal(r.한일, '교체');
  assert.equal(findBanners(r.html).length, 1, '배너가 둘이 됐습니다');
  assert.ok(r.html.includes('tvnsports.cjenm.com'));
  assert.ok(!r.html.includes('old.example.com'), '옛 배너가 남았습니다');
  assert.ok(bannerOnlyChange(옛배너본문, r.html), '배너 말고 다른 게 바뀌었습니다');
});

// ── 실제 경로 ──────────────────────────────────────────────
const wp = await startMockWordPress({
  posts: {
    7690: {
      status: 'publish', slug: 'kbl-일정', categories: [6], meta: {},
      title: { raw: '2026-27 KBL 경기일정·중계 어디서 보나 (10개 구단)' },
      content: { raw: 본문 },
    },
    7691: {
      status: 'publish', slug: '여농', categories: [6], meta: {},
      title: { raw: 'WKBL 개막 일정' },
      content: { raw: 본문.replace(/KBL/g, 'WKBL').replace('부산 KCC와 창원 LG', '청주 KB와 아산 우리은행') },
    },
    7692: {
      status: 'publish', slug: '바둑', categories: [8], meta: {},
      title: { raw: '바둑 대회 일정' },
      content: { raw: 본문 },
    },
  },
});
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

const siteCategories = [{ id: 6, name: '농구' }, { id: 8, name: '바둑' }];

await checkAsync('미리보기는 저장하지 않는다', async () => {
  const r = await addWatchBanner(7690, { apply: false, siteCategories });
  assert.ok(r.changed, r.skip);
  assert.equal(wp.state.updated.length, 0);
  assert.equal(r.backup, null);
});

let 저장;
await checkAsync('본문에 배너를 넣어 저장한다', async () => {
  const r = await addWatchBanner(7690, { apply: true, siteCategories });
  assert.ok(r.changed, r.skip);
  assert.equal(r.url, 'https://tvnsports.cjenm.com/ko/');
  저장 = wp.state.updated.find((u) => u.id === 7690);
  assert.ok(저장.content.includes('tvnsports.cjenm.com'), 저장.content.slice(0, 200));
});

check('content 말고 아무것도 보내지 않는다', () => {
  // status를 함께 보내면 발행 상태가 바뀔 수 있다.
  assert.deepEqual(Object.keys(저장).sort(), ['content', 'id']);
});

await checkAsync('고치기 전에 원본 본문을 남긴다', async () => {
  const dir = path.join(ROOT, 'out', 'backup-content');
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('7690-'));
  assert.ok(files.length, '원본 파일이 없습니다');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
  assert.ok(!saved.content.raw.includes('tvnsports'), '배너가 들어간 뒤의 본문을 남겼습니다');
});

await checkAsync('두 번 돌려도 배너가 둘이 되지 않는다', async () => {
  const r = await addWatchBanner(7690, { apply: true, siteCategories });
  assert.ok(!r.changed);
  assert.match(r.skip, /이미 지금 모양/);
  const 글 = wp.state.posts[7690].content.raw;
  assert.equal((글.match(/tvnsports\.cjenm\.com/g) || []).length, 1, 글);
});

await checkAsync('여자농구 글에는 여농티비를 넣는다', async () => {
  // '농구' 한 카테고리에 KBL과 WKBL이 같이 있다. 중계처가 다르다.
  const r = await addWatchBanner(7691, { apply: false, siteCategories });
  assert.ok(r.changed, r.skip);
  assert.match(r.url, /WKBL_official/);
});

await checkAsync('설정에 링크가 없는 종목은 건너뛴다', async () => {
  // 주소를 만들어내지 않는다. 없는 링크를 배너로 거는 것은 독자를 속이는 일이다.
  const before = wp.state.updated.length;
  const r = await addWatchBanner(7692, { apply: true, siteCategories });
  assert.ok(!r.changed);
  assert.match(r.skip, /중계 링크가 없습니다/);
  assert.equal(wp.state.updated.length, before);
});

await checkAsync('배너 모양이 바뀌면 이미 올린 글도 새 모양으로 바꾼다', async () => {
  // 주소만 보고 건너뛰면 모양을 손본 뒤 기존 글이 옛 모양으로 남는다.
  // 실제로 글 제목 반복을 걷어낼 때 이 문제가 났다.
  const 옛모양 = wp.state.posts[7690].content.raw.replace(
    '📺 경기 보러가기',
    '📺 경기 보러가기</div><div>2026-27 KBL 경기일정과 중계 어디서 보나',
  );
  wp.state.posts[7690].content = { raw: 옛모양 };
  const r = await addWatchBanner(7690, { apply: true, siteCategories });
  assert.ok(r.changed, r.skip);
  assert.equal(r.한일, '교체');
  const 글 = wp.state.posts[7690].content.raw;
  assert.ok(!글.includes('2026-27 KBL 경기일정과 중계 어디서 보나'), '옛 모양이 남았습니다');
  assert.equal(findBanners(글).length, 1, '배너가 둘이 됐습니다');
});

await checkAsync('상태 보기는 저장된 본문과 화면 본문을 함께 센다', async () => {
  // "본문에는 배너가 있는데 화면에는 안 보인다"를 가리려면 둘을 나란히 봐야 한다.
  const r = await showBanner(7690, { siteCategories });
  assert.equal(r.raw.배너블록, 1, JSON.stringify(r.raw));
  assert.equal(r.url, 'https://tvnsports.cjenm.com/ko/');
  assert.ok(r.raw.표시 >= 1);
});

await checkAsync('상태 보기는 아무것도 저장하지 않는다', async () => {
  const before = wp.state.updated.length;
  await showBanner(7690, { siteCategories });
  assert.equal(wp.state.updated.length, before);
});

await checkAsync('글 번호를 안 적으면 안내하고 멈춘다', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  await assert.rejects(
    () => run(process.execPath, [path.join(ROOT, 'src', 'wordpress', 'add-watch.mjs')], { env: { ...process.env } }),
    (err) => {
      assert.match(`${err.stdout}${err.stderr}`, /글 번호를 적어주세요/);
      return true;
    },
  );
});

fs.rmSync(path.join(ROOT, 'out', 'backup-content'), { recursive: true, force: true });
wp.server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
