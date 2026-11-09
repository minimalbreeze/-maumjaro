// 글자로만 적힌 주소를 링크로 바꾸기 검사.
import assert from 'node:assert/strict';
import { 링크로바꾸기, 링크만바뀌었나, 확인된주소표, 호스트 } from '../src/wordpress/link-urls.mjs';
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

check('설정에 없는 호스트는 문장 안에서도 그대로 둔다', () => {
  const 본문 = '<p>https://sooplive.com/x 에서 봅니다</p>';
  const r = 링크로바꾸기(본문, 표2);
  assert.deepEqual(r.바꾼것, []);
  assert.equal(r.html, 본문);
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

console.log(`\n  ${passed}개 통과`);
