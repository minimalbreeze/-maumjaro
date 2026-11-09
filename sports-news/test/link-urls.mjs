// 글자로만 적힌 주소를 링크로 바꾸기 검사.
import assert from 'node:assert/strict';
import {
  링크로바꾸기, 링크만바뀌었나, 확인된주소표, 호스트, 주소맞추기, 우리글주소표, 태그안인가, 경로있나,
} from '../src/wordpress/link-urls.mjs';
import { 예시인가 } from '../src/wordpress/bare-urls.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[글자로만 적힌 주소를 링크로]');

const 표 = new Map([
  ['ktwizstore.co.kr', 'https://www.ktwizstore.co.kr/'],
  ['doosanbearswefan.shop', 'https://doosanbearswefan.shop/'],
]);

check('코드로 적힌 주소를 링크로 바꾼다 — 효성님이 지적한 그 꼴', () => {
  const r = 링크로바꾸기('<p>주소: <code>ktwizstore.co.kr</code></p>', 표);
  assert.deepEqual(r.바꾼것.map((b) => b.글자), ['ktwizstore.co.kr']);
  assert.ok(r.html.includes('<a href="https://www.ktwizstore.co.kr/" rel="nofollow">ktwizstore.co.kr</a>'), r.html);
});

// ⚠️ 바깥으로 나가는 링크는 nofollow, 그리고 **현재 창**이다. 새 창으로
//    띄우면 독자가 원래 글로 돌아오는 길을 잃는다(지시서).
check('새 창으로 띄우지 않는다', () => {
  const r = 링크로바꾸기('<p><code>ktwizstore.co.kr</code></p>', 표);
  assert.ok(!r.html.includes('target='), r.html);
});

// ⚠️ 주소를 만들어내지 않는다. `https://` 를 내가 붙이는 순간 내가 만든
//    주소가 된다. 설정에 없으면 글자로 그대로 둔다.
check('설정에 없는 호스트는 건드리지 않는다 — 주소를 만들지 않는다', () => {
  const 본문 = '<p><code>알수없는곳.com</code></p>';
  const r = 링크로바꾸기(본문, 표);
  assert.deepEqual(r.바꾼것, []);
  assert.equal(r.html, 본문);
});

// ⚠️ 한화 글의 "주소창 도메인이 … 인지 확인하라"는 **보여 주는 것이 목적**이다.
check('가짜 사이트를 가르려고 보여 주는 주소는 그대로 둔다', () => {
  const 본문 = '<p>가짜 주의 — 주소창 도메인이 <code>doosanbearswefan.shop</code> 인지 확인하세요.</p>';
  const r = 링크로바꾸기(본문, 표);
  assert.deepEqual(r.바꾼것, []);
  assert.equal(r.html, 본문);
});

check('이미 링크인 주소는 두 번 감싸지 않는다', () => {
  const 본문 = '<p><a href="https://www.ktwizstore.co.kr/">ktwizstore.co.kr</a></p>';
  const r = 링크로바꾸기(본문, 표);
  assert.deepEqual(r.바꾼것, []);
});

check('쿠팡 광고 블록은 건드리지 않는다 — 제휴사가 준 코드다', () => {
  const 본문 = '<!-- wp:html -->\n<code>ktwizstore.co.kr</code>\n<!-- /wp:html -->';
  const r = 링크로바꾸기(본문, 표);
  assert.deepEqual(r.바꾼것, []);
});

check('코드 글꼴은 그대로 두고 그 안을 링크로 감싼다', () => {
  const r = 링크로바꾸기('<p><code>ktwizstore.co.kr</code></p>', 표);
  assert.ok(/<code><a /.test(r.html), r.html);
  assert.ok(r.html.includes('</a></code>'), r.html);
});

check('링크 말고 다른 것이 바뀌면 걸러낸다', () => {
  assert.ok(링크만바뀌었나('<p>글 <code>x</code></p>', '<p>글 <code><a href="u">x</a></code></p>'));
  assert.ok(!링크만바뀌었나('<p>글</p>', '<p>다른 글</p>'));
});

check('표에 같은 호스트가 둘이면 짧은 주소를 쓴다', () => {
  const cfg = {
    byPost: { 1: { url: 'https://a.co.kr/deep/path' }, 2: { url: 'https://a.co.kr/' } },
    sites: [],
  };
  assert.equal(확인된주소표(cfg).get('a.co.kr'), 'https://a.co.kr/');
});

check('호스트() 가 www 를 떼고 소문자로 맞춘다', () => {
  assert.equal(호스트('https://WWW.Example.CO.KR/x'), 'example.co.kr');
  assert.equal(호스트('example.co.kr'), 'example.co.kr');
  assert.equal(호스트('말이안되는값'), null);
});

check('실제 설정에서 주소표를 만들 수 있고 비어 있지 않다', () => {
  const 표실제 = 확인된주소표();
  assert.ok(표실제.size > 0, '확인된 주소가 0곳입니다');
  for (const [h, url] of 표실제) {
    assert.ok(/^https:\/\//.test(url), `${h} 의 주소가 https 가 아닙니다: ${url}`);
  }
});

// ⚠️ 미리보기에서 잡힌 실제 자리다. 롯데 굿즈 글(15787)에 이 줄이 있다.
//      - 전용 주소가 따로 있거나 (`ktwizstore.co.kr` 같은 꼴)
//    **KT 스토어를 예시로** 든 것이고, 링크로 만들면 롯데 굿즈를 찾는
//    사람을 KT 로 보낸다. 눌러서 엉뚱한 가게에 도착하는 것은 깨진 링크보다
//    나쁘다 — 글을 못 믿게 된다.
check('예시로 든 주소는 링크로 만들지 않는다 (롯데 글의 KT 주소)', () => {
  const 본문 = '<li>전용 주소가 따로 있거나 (<code>ktwizstore.co.kr</code> 같은 꼴)</li>';
  const r = 링크로바꾸기(본문, 표);
  assert.deepEqual(r.바꾼것, []);
  assert.equal(r.html, 본문);
});

check('같은 주소가 목적지로 쓰인 글에서는 링크로 만든다', () => {
  const r = 링크로바꾸기('<p>주소: <code>ktwizstore.co.kr</code></p>', 표);
  assert.deepEqual(r.바꾼것.map((b) => b.글자), ['ktwizstore.co.kr']);
});

check('예시 표시가 다음 문장에 있으면 가리지 않는다', () => {
  // 뒤쪽을 보되 문장 끝을 넘지 않는다. 넘으면 다른 문장의 말이다.
  assert.equal(예시인가('a.co.kr 입니다. 저것도 같은 꼴', 0, 8), false);
  assert.equal(예시인가('a.co.kr 같은 꼴입니다', 0, 7), true);
});

// ── ② 태그 밖에 글자로 적힌 주소 (2026-11-09) ──────────────────────
//
// 전수 점검에서 걸린 150편 중 **대부분이 이쪽**이다. 구단 스토어 글은
// 주소를 코드로 적어서 ①이 잡지만, 중계 허브·시설 글은 문장 안에 그냥
// 적혀 있다.
const 표2 = new Map([
  ['kovo.co.kr', 'https://www.kovo.co.kr/'],
  ['ktwizstore.co.kr', 'https://www.ktwizstore.co.kr/'],
]);

check('문장 안의 http 주소를 링크로 바꾼다', () => {
  const r = 링크로바꾸기('<p>순위는 https://kovo.co.kr/ 에서 봅니다</p>', 표2);
  assert.deepEqual(r.바꾼것.map((b) => b.글자), ['https://kovo.co.kr/']);
  assert.ok(r.html.includes('rel="nofollow"'), r.html);
});

// ⚠️ 이게 미뤘던 이유였다. 다시 보니 경계 검사가 조사를 호스트의 일부로
//    보지 않아 `에서` 가 링크 밖에 그대로 남는다. 그게 맞는 결과다.
check('조사가 붙어 있어도 호스트만 감싼다 (kovo.co.kr에서)', () => {
  const r = 링크로바꾸기('<p>kovo.co.kr에서 확인하세요</p>', 표2);
  assert.deepEqual(r.바꾼것.map((b) => b.글자), ['kovo.co.kr']);
  assert.ok(r.html.includes('</a>에서 확인하세요'), r.html);
});

check('www 가 붙은 꼴도 잡는다', () => {
  const r = 링크로바꾸기('<p>www.kovo.co.kr 입니다</p>', 표2);
  assert.deepEqual(r.바꾼것.map((b) => b.글자), ['www.kovo.co.kr']);
});

// ⚠️ ① 이 `<code>` 안에 만든 `<a>` 를 ② 가 다시 감싸면 `<a><a>` 가 된다.
//    그래서 ② 전에 한 번 더 비켜 둔다. 이 검사가 그것을 지킨다.
check('코드와 맨글자가 섞여도 같은 주소를 두 번 감싸지 않는다', () => {
  const 본문 = '<p><code>ktwizstore.co.kr</code> 과 https://kovo.co.kr/</p>';
  const r = 링크로바꾸기(본문, 표2);
  assert.equal(r.바꾼것.length, 2);
  assert.ok(!/<a[^>]*>[^<]*<a/.test(r.html), `이중으로 감쌌습니다: ${r.html}`);
  assert.ok(링크만바뀌었나(본문, r.html));
});

check('문장 안의 주소도 쿠팡 블록 안이면 건드리지 않는다', () => {
  const r = 링크로바꾸기('<!-- wp:html --><p>kovo.co.kr</p><!-- /wp:html -->', 표2);
  assert.deepEqual(r.바꾼것, []);
});

check('문장 안의 주소도 예시로 든 것이면 건드리지 않는다', () => {
  const r = 링크로바꾸기('<p>kovo.co.kr 같은 꼴</p>', 표2);
  assert.deepEqual(r.바꾼것, []);
});

// ⚠️ 2026-11-09 에 뒤집힌 검사다. 전에는 "설정에 없으면 그대로 둔다" 였다.
//    선을 다시 그었다 — 막아야 할 것은 **내가 주소를 만드는 것**이고, 글에
//    전체로 적힌 주소를 href 로 옮기는 것은 그에 해당하지 않는다. 호스트만
//    적힌 자리는 여전히 그대로 둔다(바로 아래 검사).
check('설정에 없어도 문장 안의 전체 주소는 링크로 만든다 (전에는 그대로 뒀다)', () => {
  const r = 링크로바꾸기('<p>https://sooplive.com/x 에서 봅니다</p>', 표2);
  assert.equal(r.바꾼것.length, 1, JSON.stringify(r.바꾼것));
  assert.ok(r.html.includes('<a href="https://sooplive.com/x" rel="nofollow">'), r.html);
});

// ⚠️ 아무 도메인꼴을 긁으면 평균자책점·승률까지 먹는다. 설정에 있는
//    호스트만 노리므로 숫자는 애초에 후보가 아니다.
check('숫자를 주소로 잡지 않는다', () => {
  const 본문 = '<p>평균 3.52 와 승률 0.667 입니다</p>';
  const r = 링크로바꾸기(본문, 표2);
  assert.deepEqual(r.바꾼것, []);
  assert.equal(r.html, 본문);
});

check('꼬리 부호는 링크 밖에 남는다', () => {
  const r = 링크로바꾸기('<p>(kovo.co.kr) 참고</p>', 표2);
  assert.deepEqual(r.바꾼것.map((b) => b.글자), ['kovo.co.kr']);
  assert.ok(r.html.includes('</a>) 참고'), r.html);
});

check('KOVO 가 실제 설정에 들어 있다', () => {
  const 표실제 = 확인된주소표();
  assert.equal(표실제.get('kovo.co.kr'), 'https://www.kovo.co.kr/');
});

// ── 같은 주소가 여러 번 나와도 자리마다 판정한다 (2026-11-09) ─────────
//
// ⚠️ 전수 점검 재확인에서 **"안전 안내로 건너뛴 주소 0개"** 가 찍혀서 알았다.
//    한화 글(15783)의 "주소창 도메인이 … 인지 확인하라" 문장까지 링크가 됐다.
//
//    원인은 `안내인가(본문, 본문.indexOf(글자))` 였다. `indexOf` 는
//    **첫 자리**만 돌려주고, 그 자리의 문맥으로 나머지 전부를 판정한다.
//    한화 글에 같은 주소가 여섯 번 나와서 다섯이 통과했다.
//
//    이번 건의 결과는 나쁘지 않았다 — 그 주소가 가리키는 곳이 맞는 가게다.
//    고치는 이유는 롯데 글처럼 **예시로 든 주소가 두 번 나오면** 같은
//    버그가 독자를 엉뚱한 가게로 보내기 때문이다.
//
//    숫자를 안 봤으면 그냥 끝냈을 자리다.
check('같은 주소가 세 번 나오면 안내 문장의 하나만 건너뛴다', () => {
  const 표3 = new Map([['hanwhaeagles.co.kr', 'https://www.hanwhaeagles.co.kr/SH/PCSH01.do']]);
  const 본문 = '<p>주소: <code>hanwhaeagles.co.kr</code></p>'
    + '<p>가짜 쇼핑몰 주의 — 주소창 도메인이 <code>hanwhaeagles.co.kr</code> 인지 확인하세요.</p>'
    + '<p>또 <code>hanwhaeagles.co.kr</code> 입니다</p>';
  const r = 링크로바꾸기(본문, 표3);
  assert.equal(r.바꾼것.length, 2, '안내 문장의 주소까지 바꿨습니다');
  assert.ok(r.html.includes('<code>hanwhaeagles.co.kr</code> 인지'), '안내 문장이 글자로 남지 않았습니다');
});

check('예시로 든 주소가 두 번 나오면 둘 다 건너뛴다', () => {
  const r = 링크로바꾸기(
    '<p>(<code>ktwizstore.co.kr</code> 같은 꼴)</p><p>또 (<code>ktwizstore.co.kr</code> 같은 꼴)</p>',
    표2,
  );
  assert.deepEqual(r.바꾼것, []);
});

check('문장 안의 주소도 안내 문맥이면 건너뛴다', () => {
  const 표3 = new Map([['hanwhaeagles.co.kr', 'https://www.hanwhaeagles.co.kr/SH/PCSH01.do']]);
  const r = 링크로바꾸기('<p>주소창 도메인이 hanwhaeagles.co.kr 인지 확인</p>', 표3);
  assert.deepEqual(r.바꾼것, []);
});

// ── 우리 사이트 안의 주소 (2026-11-09) ──────────────────────────────
//
// 전수 점검에서 글자로 남은 주소 330곳 중 **우리 도메인이 57곳**이었다.
// 가장 값이 큰 자리다 — 우리 글끼리 잇는 링크는 구글이 페이지를 찾는
// 경로이고(지시서 ② 절), 발행 633편 중 구글이 아는 것이 156편뿐이었던
// 이유가 거기였다.

const 우리글 = 우리글주소표([
  { link: 'https://wiki.minimalbreeze.com/2026-kbo-프로야구/' },
  { link: 'https://wiki.minimalbreeze.com/안세영-중계/' },
]);

check('우리 글 주소에는 nofollow 를 붙이지 않는다 — 붙이면 구글이 안 따라간다', () => {
  const r = 링크로바꾸기(
    '<p>자세한 일정은 https://wiki.minimalbreeze.com/2026-kbo-프로야구/ 에 있습니다.</p>',
    표, { 우리글 },
  );
  assert.equal(r.바꾼것.length, 1, JSON.stringify(r.바꾼것));
  assert.ok(r.html.includes('<a href="https://wiki.minimalbreeze.com/2026-kbo-프로야구/">'), r.html);
  assert.ok(!r.html.includes('nofollow'), 'nofollow 가 붙었습니다');
});

check('꼬리 슬래시가 없어도 같은 글로 본다', () => {
  const r = 링크로바꾸기(
    '<p>→ https://wiki.minimalbreeze.com/안세영-중계 참고</p>', 표, { 우리글 },
  );
  assert.equal(r.바꾼것.length, 1, JSON.stringify(r.바꾼것));
});

// ⚠️ 한글 슬러그는 워드프레스가 퍼센트 인코딩으로 돌려주고 본문에는 한글로
//    적혀 있다. 그냥 글자로 비교하면 실재하는 글을 못 알아본다.
check('퍼센트 인코딩된 주소와 한글로 적힌 주소를 같은 글로 본다', () => {
  const 표2 = 우리글주소표([{ link: 'https://wiki.minimalbreeze.com/%EC%95%88%EC%84%B8%EC%98%81-%EC%A4%91%EA%B3%84/' }]);
  assert.equal(주소맞추기('https://wiki.minimalbreeze.com/안세영-중계/'), 'wiki.minimalbreeze.com/안세영-중계/');
  const r = 링크로바꾸기('<p>https://wiki.minimalbreeze.com/안세영-중계/</p>', new Map(), { 우리글: 표2 });
  assert.equal(r.바꾼것.length, 1, JSON.stringify(r.바꾼것));
});

// ⚠️ 여기가 "주소를 만들어내지 않는다" 의 내부 판이다. 외부는 설정에 사람이
//    적어 둔 주소만 쓰고, 내부는 **실제로 발행된 글인지** 목록과 대조한다.
check('발행 목록에 없는 우리 호스트 주소는 건드리지 않는다 — 404 로 보내지 않는다', () => {
  const r = 링크로바꾸기(
    '<p>https://wiki.minimalbreeze.com/없는글-주소/</p>', 표, { 우리글 },
  );
  assert.deepEqual(r.바꾼것, []);
  assert.ok(!r.html.includes('<a '), r.html);
});

// 홈은 글 목록에 없지만 **실재하는 페이지**다. 404 로 보내지 않는다.
check('사이트 홈 주소는 링크로 만든다 — 실재하는 페이지다', () => {
  const r = 링크로바꾸기('<p>https://wiki.minimalbreeze.com/</p>', 표, { 우리글 });
  assert.equal(r.바꾼것.length, 1, JSON.stringify(r.바꾼것));
  assert.ok(!r.html.includes('nofollow'), r.html);
});

// ⚠️ 전체 주소 폴백이 우리 호스트까지 덮으면 **없는 글로 보낸다.** 외부와
//    달리 우리 글은 실재하는지 확인할 수 있으므로 기준을 느슨하게 하지 않는다.
check('우리 호스트의 없는 글 주소는 전체로 적혀 있어도 링크하지 않는다', () => {
  const r = 링크로바꾸기('<p>https://wiki.minimalbreeze.com/없는글-주소/</p>', 표, { 우리글 });
  assert.deepEqual(r.바꾼것, []);
});

check('자기 자신으로 가는 링크는 걸지 않는다 — 눌러도 같은 자리다', () => {
  const r = 링크로바꾸기(
    '<p>이 글 주소: https://wiki.minimalbreeze.com/안세영-중계/</p>',
    표, { 우리글, 내주소: 'https://wiki.minimalbreeze.com/안세영-중계/' },
  );
  assert.deepEqual(r.바꾼것, []);
});

check('우리 주소가 코드 태그 안에 있어도 내부 링크로 만든다', () => {
  const r = 링크로바꾸기(
    '<p><code>wiki.minimalbreeze.com/안세영-중계/</code></p>', 표, { 우리글 },
  );
  assert.equal(r.바꾼것.length, 1, JSON.stringify(r.바꾼것));
  assert.ok(!r.html.includes('nofollow'), r.html);
});

check('우리 주소도 안내·예시 문맥이면 건너뛴다', () => {
  const r = 링크로바꾸기(
    '<p>주소창 도메인이 wiki.minimalbreeze.com/안세영-중계/ 인지 확인하세요</p>',
    표, { 우리글 },
  );
  assert.deepEqual(r.바꾼것, []);
});

check('우리글표를 안 넘기면 전과 똑같이 돈다 — 기존 호출부를 깨지 않는다', () => {
  const r = 링크로바꾸기('<p><code>ktwizstore.co.kr</code></p>', 표);
  assert.equal(r.바꾼것.length, 1);
  assert.ok(r.html.includes('rel="nofollow"'), r.html);
});

// ── 설정에 없어도 본문에 전체 주소로 적혀 있으면 쓴다 (2026-11-09) ──────
//
// 글자로 남은 330곳 중 **273곳이 설정에 없는 호스트**다. 호스트만 적힌
// 자리에 `https://` 를 붙이는 것은 내가 주소를 만드는 일이지만, 글에 이미
// 전체로 적힌 주소를 href 로 옮기는 것은 그렇지 않다.

check('설정에 없어도 본문에 전체 주소로 적혀 있으면 링크로 만든다', () => {
  const r = 링크로바꾸기('<p>영상: https://www.youtube.com/@kovolove 에서 봅니다.</p>', new Map());
  assert.equal(r.바꾼것.length, 1, JSON.stringify(r.바꾼것));
  assert.ok(r.html.includes('<a href="https://www.youtube.com/@kovolove" rel="nofollow">'), r.html);
});

// ⚠️ 여기가 선이다. 호스트만 적힌 자리에 스킴을 붙이지 않는다.
check('호스트만 적혀 있고 설정에 없으면 여전히 글자로 남긴다', () => {
  const r = 링크로바꾸기('<p>kpga7330.com 에서 봅니다.</p>', new Map());
  assert.deepEqual(r.바꾼것, []);
});

check('설정에 있으면 본문 주소보다 설정 주소가 앞선다 — 사람이 고른 것이 먼저다', () => {
  const 표4 = new Map([['hanwhaeagles.co.kr', 'https://www.hanwhaeagles.co.kr/SH/PCSH01.do']]);
  const r = 링크로바꾸기('<p>보기: https://www.hanwhaeagles.co.kr/ 입니다.</p>', 표4);
  assert.equal(r.바꾼것[0].url, 'https://www.hanwhaeagles.co.kr/SH/PCSH01.do');
});

// ⚠️ 이것이 전체 주소 폴백을 넣으면서 같이 막아야 했던 자리다. 막지 않으면
//    본문 사진이 전부 깨진다 — `링크만바뀌었나` 가 저장을 멈추므로 사이트가
//    상하지는 않지만, 그러면 아무 글도 못 고친다.
check('img src 안의 주소는 건드리지 않는다 — 감싸면 사진이 깨진다', () => {
  const 본문 = '<figure><img src="https://wiki.minimalbreeze.com/wp-content/uploads/a.jpg" alt="x"></figure>';
  const r = 링크로바꾸기(본문, new Map());
  assert.deepEqual(r.바꾼것, []);
  assert.equal(r.html, 본문);
});

check('태그 속성 안의 주소는 어떤 속성이든 건드리지 않는다', () => {
  const 본문 = '<p><span data-url="https://www.kovo.co.kr/">배구</span></p>';
  const r = 링크로바꾸기(본문, new Map());
  assert.equal(r.html, 본문);
});

check('태그안인가 — 열린 태그 안쪽과 본문을 가린다', () => {
  const s = '<img src="https://a.com/b.jpg"> 그리고 https://c.com/d';
  assert.equal(태그안인가(s, s.indexOf('https://a.com')), true);
  assert.equal(태그안인가(s, s.indexOf('https://c.com')), false);
});

check('사진과 본문 주소가 한 글에 있으면 본문만 링크로 만든다', () => {
  const 본문 = '<img src="https://wiki.minimalbreeze.com/wp-content/uploads/a.jpg">'
    + '<p>중계는 https://www.kovo.co.kr/ 에서 봅니다.</p>';
  const r = 링크로바꾸기(본문, new Map());
  assert.equal(r.바꾼것.length, 1, JSON.stringify(r.바꾼것));
  assert.ok(r.html.includes('uploads/a.jpg">'), '사진 주소가 바뀌었습니다');
});

// ⚠️ 15783 에서 실제로 난 일이다. 안내 문장 **앞에 링크가 있으면** 그 링크가
//    자리표시자로 비켜 두어지면서 길이가 바뀌고, 원본 기준으로 창을 뜨면
//    앞 240자가 어긋나 "주소창의 도메인이" 를 놓친다. 손으로 글자로 되돌려
//    둔 자리를 도구가 다시 링크하려 했다.
check('안내 문장 앞에 링크가 많아도 안내로 알아본다 — 자리표시자가 길이를 바꾼다', () => {
  const 표5 = new Map([['hanwhaeagles.co.kr', 'https://www.hanwhaeagles.co.kr/SH/PCSH01.do']]);
  const 앞 = Array.from({ length: 6 }, (_, i) => `<p><a href="https://example.com/${i}" rel="nofollow">아주 긴 링크 글자입니다 ${i}</a></p>`).join('');
  const r = 링크로바꾸기(
    `${앞}<p>정식 판매처인지 알 수 없어 주소를 적지 않았습니다. 주소창의 도메인이 <code>hanwhaeagles.co.kr</code> 인지 확인하시는 편이 안전합니다.</p>`,
    표5,
  );
  assert.deepEqual(r.바꾼것, [], '안내 문장의 주소를 링크로 만들었습니다');
});

// ── 본문에 경로가 적혀 있으면 설정 주소를 쓰지 않는다 (2026-11-09) ──────
//
// 미리보기가 둘을 잡았다. 적용했으면 독자가 엉뚱한 곳으로 갔다.
//
//   koreabaseball.com/Schedule/Schedule.aspx  →  https://www.koreabaseball.com/
//   lpga.or.jp/en/                            →  https://www.lpga.or.jp/
//
// 주석에 "호스트만 적힌 자리에 깊은 경로로 보내면 안 된다"고 적어 두고
// **반대 방향**을 안 막은 자리다.

check('경로있나 — 루트만 있으면 없는 것으로 본다', () => {
  assert.equal(경로있나('koreabaseball.com'), false);
  assert.equal(경로있나('kovo.co.kr/'), false);
  assert.equal(경로있나('https://www.kovo.co.kr/'), false);
  assert.equal(경로있나('koreabaseball.com/Schedule/Schedule.aspx'), true);
  assert.equal(경로있나('lpga.or.jp/en/'), true);
  assert.equal(경로있나('a.com/?x=1'), true);
});

check('스킴 없이 경로만 적힌 자리는 건드리지 않는다 — https 를 내가 붙이는 꼴이다', () => {
  const 표6 = new Map([['koreabaseball.com', 'https://www.koreabaseball.com/']]);
  const r = 링크로바꾸기('<p>일정은 koreabaseball.com/Schedule/Schedule.aspx 에서</p>', 표6);
  assert.deepEqual(r.바꾼것, []);
});

check('전체 주소로 경로까지 적혀 있으면 그 경로로 간다 — 설정 루트로 덮지 않는다', () => {
  const 표6 = new Map([['lpga.or.jp', 'https://www.lpga.or.jp/']]);
  const r = 링크로바꾸기('<p>영어판은 https://lpga.or.jp/en/ 입니다</p>', 표6);
  assert.equal(r.바꾼것.length, 1, JSON.stringify(r.바꾼것));
  assert.equal(r.바꾼것[0].url, 'https://lpga.or.jp/en/');
});

// ⚠️ 호스트만 적힌 자리에서는 설정의 **깊은 주소**가 맞다. 사람이 고른 것이다.
check('호스트만 적힌 자리는 설정의 깊은 주소로 보낸다', () => {
  const 표7 = new Map([['hanwhaeagles.co.kr', 'https://www.hanwhaeagles.co.kr/SH/PCSH01.do']]);
  const r = 링크로바꾸기('<p>구단 샵: <code>hanwhaeagles.co.kr</code></p>', 표7);
  assert.equal(r.바꾼것[0].url, 'https://www.hanwhaeagles.co.kr/SH/PCSH01.do');
});

console.log(`\n  ${passed}개 통과`);
