// 카테고리 맞춤 광고 검사.
//
// 왜: 지금까지 일반 캐러셀 하나만 써서 글 주제와 무관한 상품이 돌았다.
// 파크골프 글에 주방용품이 뜨면 아무도 안 누른다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pickAd, categoryAdHtml, adSnippetFor, loadAdConfig, 고지문 } from '../src/images/ad-category.mjs';
import { checkOne } from '../src/images/check-ads.mjs';
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

console.log('\n[카테고리 맞춤 광고]');

const cfg = {
  categories: {
    파크골프: { url: 'https://link.coupang.com/a/test1', label: '채부터 고민될 텐데' },
    야구: { url: '', label: '야구 용품' },
  },
};

check('카테고리에 맞는 링크를 고른다', () => {
  const ad = pickAd('파크골프', cfg);
  assert.equal(ad.url, 'https://link.coupang.com/a/test1');
  assert.equal(ad.label, '채부터 고민될 텐데');
});

check('링크가 비어 있으면 못 고른 것으로 친다', () => {
  // 아직 링크를 안 만든 종목이다. 부르는 쪽이 기존 캐러셀로 넘어가야 한다.
  assert.equal(pickAd('야구', cfg), null);
});

check('없는 카테고리는 못 고른 것으로 친다', () => {
  assert.equal(pickAd('수영', cfg), null);
  assert.equal(pickAd('', cfg), null);
  assert.equal(pickAd(null, cfg), null);
});

check('링크가 없으면 기존 캐러셀로 넘어간다', () => {
  const r = adSnippetFor('야구', { fallback: '<script>캐러셀</script>', config: cfg });
  assert.equal(r.matched, false);
  assert.ok(r.snippet.includes('캐러셀'), r.snippet);
});

check('링크가 있으면 맞춤 광고를 쓴다', () => {
  const r = adSnippetFor('파크골프', { fallback: '<script>캐러셀</script>', config: cfg });
  assert.equal(r.matched, true);
  assert.ok(!r.snippet.includes('캐러셀'), '캐러셀이 같이 들어갔습니다');
  assert.ok(r.snippet.includes('test1'), r.snippet);
});

check('캐러셀도 없으면 광고 없이 간다', () => {
  const r = adSnippetFor('수영', { fallback: '', config: cfg });
  assert.equal(r.snippet, '');
});

// ── 광고 HTML ──────────────────────────────────────────────
const html = categoryAdHtml(pickAd('파크골프', cfg));

check('현재 창에서 열린다', () => {
  // 운영자 방침: target="_blank" 를 쓰지 않는다. 전면 광고가 뜨려면 현재 창이어야 한다.
  assert.ok(!/target=/.test(html), html);
});

check('광고 링크임을 구글에 알린다', () => {
  // sponsored 를 안 붙이면 구글이 링크 조작으로 볼 수 있다.
  assert.ok(/rel="[^"]*sponsored/.test(html), html);
  assert.ok(/rel="[^"]*nofollow/.test(html), html);
});

check('고지문이 항상 들어간다', () => {
  // 법적으로 필요하다. 빠뜨리면 안 된다.
  assert.ok(html.includes(고지문), html);
});

check('광고 앞 한 줄이 들어간다', () => {
  // 광고가 뜬금없이 나오면 그냥 넘긴다. 앞에 맥락이 있어야 답처럼 보인다.
  assert.ok(html.includes('채부터 고민될 텐데'), html);
});

check('따옴표가 든 값이 태그를 깨지 않는다', () => {
  const h = categoryAdHtml({ category: '야구', url: 'https://x/a?b="c', label: '그는 "최고"였다' });
  assert.ok(h.includes('&quot;'), h);
  // href 값 안에 날것의 따옴표가 남아 있으면 태그가 거기서 끊긴다.
  const href = /href="([^"]*)"/.exec(h)[1];
  assert.ok(!href.includes('"'), `href 가 끊깁니다: ${href}`);
  assert.ok(href.includes('&quot;'), href);
});

// ── 실제 설정 파일 ─────────────────────────────────────────
const 실제 = loadAdConfig();

check('실제 설정 파일을 읽을 수 있다', () => {
  assert.ok(Object.keys(실제.categories).length > 0, '카테고리가 비었습니다');
});

check('실제 링크가 쿠팡 주소다', () => {
  // 엉뚱한 주소가 들어가면 광고가 아니라 그냥 바깥 링크가 된다.
  for (const [cat, v] of Object.entries(실제.categories)) {
    const url = String(v.url || '');
    if (!url) continue;
    assert.ok(/^https:\/\/(link\.coupang\.com|coupa\.ng)\//.test(url), `${cat}: ${url}`);
  }
});

check('설정의 카테고리 이름에 오타가 없다', () => {
  // 설정의 키가 실제 카테고리 이름과 한 글자라도 다르면 광고가 영영 안 붙는다.
  // 그런데 조용히 기존 캐러셀로 넘어가서 눈치채기 어렵다.
  //
  // 반대 방향(모든 종목에 링크가 있어야 한다)으로는 보지 않는다. 링크가 없는
  // 종목은 기존 캐러셀을 쓰면 되고, 그게 운영자가 정한 방식이다.
  const topics = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'topics.json'), 'utf8'));
  const list = Array.isArray(topics) ? topics : (topics.topics || []);
  const 아는이름 = new Set(list.map((t) => t.category).filter(Boolean));
  const 모르는이름 = Object.keys(실제.categories).filter((c) => !아는이름.has(c));
  assert.equal(모르는이름.length, 0,
    `topics.json 에 없는 카테고리: ${모르는이름.join(', ')} — 오타이거나 종목이 빠졌습니다`);
});

// ── 죽은 링크 점검 ─────────────────────────────────────────
await checkAsync('없는 주소는 죽은 것으로 본다', async () => {
  const r = await checkOne('https://link.coupang.com/a/__없는링크__', { timeoutMs: 8000 });
  // 네트워크가 막힌 환경에서는 null(확인 못 함)이 나온다. 그것도 정상 동작이다.
  assert.ok(r.ok === false || r.ok === null, JSON.stringify(r));
  assert.ok(r.why, '왜 그런지 알려주지 않습니다');
});

check('확인 못 한 것을 죽었다고 단정하지 않는다', () => {
  // 쿠팡이 자동 접속을 막으면 403이 온다. 그걸 "죽었다"고 하면 멀쩡한 링크를
  // 갈아 끼우게 된다. ok: null 로 따로 둔다.
  // (checkOne 의 분기를 코드로 확인 — 403은 false 가 아니라 null 이어야 한다)
  const src = fs.readFileSync(path.join(ROOT, 'src', 'images', 'check-ads.mjs'), 'utf8');
  assert.ok(/ok: null[\s\S]*차단일 수 있습니다/.test(src), '403을 죽음으로 처리하고 있습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
