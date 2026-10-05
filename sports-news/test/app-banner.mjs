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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadAppLinks, pickApp, appBannerHtml, appBannerFor, 앱스토어주소인가, 주소없는앱,
  APP_MARK, APP_PLACEHOLDER,
} from '../src/seo/app-banner.mjs';
import { planPlacements, insertMarks } from '../src/images/embed.mjs';
import { markdownToBlocks } from '../src/wordpress/draft.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

check('페이드캠 배너가 실제 주소로 나간다', () => {
  // 2026-10-05 에 효성님(개발자 본인)이 주소를 줬다. 코드가 확인한 것이 아니라
  // 개발자가 준 것이고, 그게 가장 확실한 출처다 — 애플 도메인은 막혀 있다.
  // 앱 ID 가 바뀌면 여기서 걸린다. 다른 개발사의 동명 앱(id6736679275)으로
  // 잘못 바뀌는 일을 막는 자리다.
  assert.deepEqual(주소없는앱(), [], '주소가 빈 앱이 있습니다');
  const html = appBannerFor('페이드캠으로 찍어봤다');
  assert.ok(html, '배너가 나가지 않았습니다');
  assert.ok(html.includes('id6818920687'), `앱 ID 가 다릅니다: ${html.slice(0, 300)}`);
  assert.ok(!html.includes('id6736679275'), '다른 개발사의 동명 앱 주소가 들어 있습니다');
  assert.ok(html.includes('페이드캠'), '앱 이름이 없습니다');
});

check('스포츠 글에는 앱 배너가 붙지 않는다', () => {
  // 앱 설정이 채워진 뒤에도 평소 글은 그대로여야 한다.
  assert.equal(appBannerFor('신지애 통산 상금 1위, 131억 원 격차는 왜 벌어졌나'), '');
  assert.equal(appBannerFor('윤이나 LPGA 2026시즌 성적'), '');
});

// ── 본문에 실제로 들어가는가 ───────────────────────────────
// 배너를 만들어 놓고 본문에 꽂지 않으면 아무 일도 안 일어난다.
const 본문 = `도입부 문장입니다.

## 첫 소제목

내용 한 줄.

## 두 번째 소제목

내용 두 줄.

## 세 번째 소제목

마무리.`;

check('앱 배너 자리를 소제목 앞에 잡는다', () => {
  const plan = planPlacements(본문, { withAd: false, withWatch: false, withApp: true });
  assert.notEqual(plan.appBeforeLine, null, '자리를 안 잡았습니다');
  const 끼운것 = insertMarks(본문, plan);
  assert.ok(끼운것.includes(APP_PLACEHOLDER), '자리표시자가 본문에 없습니다');
  // 받으러 가는 버튼이라 글 아래쪽보다 위쪽이 낫다.
  const 줄 = 끼운것.split('\n');
  assert.ok(줄.indexOf(APP_PLACEHOLDER) < 줄.length / 2, '배너가 글 아래쪽에 있습니다');
});

check('앱이 없으면 자리도 안 잡는다', () => {
  const plan = planPlacements(본문, { withAd: false, withWatch: false, withApp: false });
  assert.equal(plan.appBeforeLine, null);
  assert.ok(!insertMarks(본문, plan).includes(APP_PLACEHOLDER));
});

check('중계 배너와 같은 자리에 겹치지 않는다', () => {
  // 둘 다 들어가면 카드가 붙어 나온다.
  const plan = planPlacements(본문, { withAd: true, withWatch: true, withApp: true });
  for (const [a, b] of [['appBeforeLine', 'watchBeforeLine'], ['appBeforeLine', 'adBeforeLine']]) {
    if (plan[a] !== null && plan[b] !== null) {
      assert.notEqual(plan[a], plan[b], `${a} 와 ${b} 가 같은 줄입니다`);
    }
  }
});

check('자리표시자가 실제 배너로 바뀐다', () => {
  const html = appBannerHtml(페이드캠);
  const 블록 = markdownToBlocks(`본문.\n\n${APP_PLACEHOLDER}\n\n## 소제목`, { appHtml: html });
  assert.ok(블록.includes(페이드캠.url), '배너가 들어가지 않았습니다');
  assert.ok(!블록.includes(APP_PLACEHOLDER), '자리표시자가 그대로 남았습니다');
});

check('배너가 없으면 자리표시자가 조용히 사라진다', () => {
  // 없는 주소를 '다운로드'라고 걸지 않는다. 대신 글은 그대로 나가야 한다.
  const 블록 = markdownToBlocks(`본문.\n\n${APP_PLACEHOLDER}\n\n## 소제목`, { appHtml: '' });
  assert.ok(!블록.includes(APP_PLACEHOLDER), '자리표시자가 독자에게 보입니다');
  assert.ok(블록.includes('소제목'), '글이 사라졌습니다');
});

check('main 이 앱 배너를 저장까지 넘긴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main.mjs'), 'utf8');
  assert.match(src, /pickApp\(/, '앱을 찾지 않습니다');
  assert.match(src, /withApp: Boolean\(appHtml\)/, '자리 계획에 안 넘깁니다');
  assert.match(src, /appHtml: media\.app/, 'saveDraft 에 안 넘깁니다');
  // 주소가 없을 때 조용히 빠지지 않고 알려준다.
  assert.match(src, /설정에 주소가 없어 넣지 않습니다/, '왜 안 나오는지 알려주지 않습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
