// 앱 다운로드 배너 검사.
//
// 이 파일이 지키는 것은 하나다: **주소를 만들어내지 않는다.**
//
// 2026-10-05 에 효성님이 "페이드캠 앱스토어 바로가기 배너를 넣어 글을 써 달라"고
// 했다. 주소를 찾아보니 애플 도메인이 네트워크 정책에 막혀 확인이 안 되고,
// 웹검색에는 같은 이름의 **다른 개발사 앱**(중국 FadeCam, 빈티지 필터 카메라)이
// 나왔다. 그 주소를 '다운로드'라고 걸면 독자가 남의 앱을 받는다 — 깨진 링크보다
// 나쁘다. 그래서 주소가 없으면 배너가 아예 안 나가야 한다.

import assert from 'node:assert/strict';
import {
  loadAppLinks, pickApp, appBannerHtml, appBannerFor, 앱스토어주소인가, 주소없는앱, APP_MARK,
} from '../src/seo/app-banner.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[앱 다운로드 배너]');

const 페이드캠 = {
  이름: '페이드캠',
  match: ['페이드캠', 'FadeCam'],
  url: 'https://apps.apple.com/kr/app/fadecam/id1234567890',
  cta: '앱스토어에서 페이드캠 받기',
  hint: '아이폰 전용 · 앱스토어로 이동합니다',
};

// ── 주소가 없으면 배너가 없다 ──────────────────────────────
check('주소가 비어 있으면 배너를 넣지 않는다', () => {
  assert.equal(appBannerHtml({ ...페이드캠, url: '' }), '');
  assert.equal(appBannerHtml({ ...페이드캠, url: undefined }), '');
  assert.equal(appBannerHtml(null), '');
  assert.equal(appBannerHtml({}), '');
});

check('앱 상세 페이지가 아닌 주소는 거른다', () => {
  // 사람이 설정에 잘못 붙여넣는 것들. 눌러도 그 앱이 안 나온다.
  for (const 나쁜주소 of [
    'https://apps.apple.com/kr/search?term=페이드캠',
    'https://apps.apple.com/kr/developer/minimalbreeze/id123',
    'http://apps.apple.com/kr/app/fadecam/id1234567890',
    'https://play.google.com/store/apps/details?id=com.x',
    'https://apps.apple.com/kr/app/fadecam',
    'apps.apple.com/kr/app/fadecam/id123',
  ]) {
    assert.equal(앱스토어주소인가(나쁜주소), false, `통과해버림: ${나쁜주소}`);
    assert.equal(appBannerHtml({ ...페이드캠, url: 나쁜주소 }), '', `배너가 나감: ${나쁜주소}`);
  }
});

check('제대로 된 앱 주소는 받는다', () => {
  assert.equal(앱스토어주소인가('https://apps.apple.com/kr/app/fadecam/id1234567890'), true);
  assert.equal(앱스토어주소인가('https://apps.apple.com/us/app/some-app-name/id6736679275?l=ko'), true);
});

// ── 배너 모양 ──────────────────────────────────────────────
check('배너에 앱 이름과 주소가 그대로 들어간다', () => {
  const html = appBannerHtml(페이드캠);
  assert.ok(html.includes('페이드캠'), '앱 이름이 없습니다');
  assert.ok(html.includes(페이드캠.url), '주소가 없습니다');
  assert.ok(html.includes(APP_MARK), '표식이 없습니다');
  assert.match(html, /^<!-- wp:html -->/, '구텐베르크 블록이 아닙니다');
  assert.match(html, /<!-- \/wp:html -->$/, '블록이 닫히지 않았습니다');
});

check('링크를 현재 창에서 연다', () => {
  // 새 창으로 띄우면 독자가 원래 글로 돌아오는 길을 잃는다 (리포 지시서).
  const html = appBannerHtml(페이드캠);
  assert.ok(!html.includes('target='), 'target 이 있습니다');
  assert.ok(!html.includes('noopener'), 'target 이 없으면 noopener 도 필요 없습니다');
  assert.ok(html.includes('rel="nofollow"'), '바깥 링크에 nofollow 가 없습니다');
});

check('브랜드 색을 그대로 쓴다', () => {
  // 새 화면마다 새 팔레트를 만들지 않는다 (리포 지시서).
  const html = appBannerHtml(페이드캠);
  assert.ok(html.includes('#b779ef') && html.includes('#ff8fb3'), 'CTA 그라디언트가 아닙니다');
});

check('따옴표가 든 값이 HTML을 깨지 않는다', () => {
  const html = appBannerHtml({ ...페이드캠, 이름: '페이드캠 "레트로"', cta: '<b>받기</b>' });
  assert.ok(!html.includes('<b>받기</b>'), '태그가 그대로 들어갔습니다');
  assert.ok(html.includes('&quot;') || html.includes('&lt;'), '이스케이프가 안 됩니다');
});

// ── 글에서 앱 찾기 ─────────────────────────────────────────
check('글에 이름이 있는 앱을 찾는다', () => {
  const cfg = { apps: [페이드캠] };
  assert.equal(pickApp('페이드캠으로 찍어봤다', cfg)?.이름, '페이드캠');
  assert.equal(pickApp('FadeCam 사용기', cfg)?.이름, '페이드캠');
  // 조사가 붙어도 찾는다.
  assert.equal(pickApp('페이드캠이 좋다', cfg)?.이름, '페이드캠');
});

check('이름이 없는 글에는 배너를 넣지 않는다', () => {
  const cfg = { apps: [페이드캠] };
  assert.equal(pickApp('신지애 통산 상금 1위', cfg), null);
  assert.equal(pickApp('', cfg), null);
  assert.equal(pickApp('   ', cfg), null);
});

// ── 설정 파일 ──────────────────────────────────────────────
check('설정 파일을 읽을 수 있다', () => {
  const cfg = loadAppLinks();
  assert.ok(Array.isArray(cfg.apps), 'apps 가 배열이 아닙니다');
  assert.ok(cfg.apps.length, '앱 목록이 비었습니다');
  for (const a of cfg.apps) {
    assert.ok(a.이름, '이름이 없는 항목이 있습니다');
    // 주소가 적혀 있다면 반드시 앱 상세 페이지여야 한다.
    if (a.url) assert.ok(앱스토어주소인가(a.url), `${a.이름}: 앱 상세 주소가 아닙니다 — ${a.url}`);
    // 주소를 비워 뒀다면 왜 비었는지 적혀 있어야 한다.
    if (!a.url) assert.ok(a._url이비어있는이유, `${a.이름}: 주소가 비었는데 이유가 없습니다`);
  }
});

check('주소 없는 앱을 알려준다', () => {
  // 조용히 배너를 빼면 운영자가 왜 안 나오는지 모른다.
  assert.deepEqual(주소없는앱({ apps: [{ ...페이드캠, url: '' }] }), ['페이드캠']);
  assert.deepEqual(주소없는앱({ apps: [페이드캠] }), []);
});

check('지금 페이드캠 주소는 비어 있다', () => {
  // 확인하지 못한 주소를 넣지 않았다는 기록. 운영자가 주소를 넣으면 이 검사를
  // 지운다 — 그때는 배너가 실제로 나가야 맞다.
  assert.ok(주소없는앱().includes('페이드캠'),
    '페이드캠 주소가 채워졌습니다. 이 검사를 지우고 배너가 나가는지 확인하세요.');
  assert.equal(appBannerFor('페이드캠 사용기'), '', '주소가 없는데 배너가 나갔습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
