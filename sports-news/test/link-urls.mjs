// 글자로만 적힌 주소를 링크로 바꾸기 검사.
import assert from 'node:assert/strict';
import { 링크로바꾸기, 링크만바뀌었나, 확인된주소표, 호스트 } from '../src/wordpress/link-urls.mjs';

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

console.log(`\n  ${passed}개 통과`);
