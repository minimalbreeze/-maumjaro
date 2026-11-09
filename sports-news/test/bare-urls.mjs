// 누를 수 없는 주소 세기 검사.
import assert from 'node:assert/strict';
import { 맨주소찾기, 셀자리만, 안내인가, 안내문맥, 꼬리떼기 } from '../src/wordpress/bare-urls.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[누를 수 없는 주소 세기]');

check('코드로 적힌 주소를 잡는다 — 효성님이 지적한 바로 그 꼴', () => {
  const r = 맨주소찾기('<p>주소: <code>ktwizstore.co.kr</code></p>');
  assert.deepEqual(r.코드, ['ktwizstore.co.kr']);
});

check('눌러지는 링크는 세지 않는다', () => {
  const r = 맨주소찾기('<p><a href="https://www.ktwizstore.co.kr/" rel="nofollow">KT 위즈 스토어</a></p>');
  assert.equal(r.코드.length + r.맨글자.length + r.도메인.length, 0);
});

check('쿠팡 광고 블록은 세지 않는다 — 제휴사가 준 코드다', () => {
  const r = 맨주소찾기('<!-- wp:html -->\n<script src="https://ads-partners.coupang.com/g.js"></script>\n<!-- /wp:html -->');
  assert.equal(r.코드.length + r.맨글자.length + r.도메인.length, 0);
});

check('구조화 데이터(JSON-LD) 안의 주소는 세지 않는다', () => {
  const r = 맨주소찾기('<script type="application/ld+json">{"url":"https://wiki.minimalbreeze.com/x"}</script>');
  assert.equal(r.맨글자.length, 0);
});

check('이미지 src 는 세지 않는다', () => {
  const r = 맨주소찾기('<img src="https://wiki.minimalbreeze.com/wp-content/a.png" alt="x">');
  assert.equal(r.맨글자.length + r.도메인.length, 0);
});

check('맨글자 http 주소를 잡는다', () => {
  const r = 맨주소찾기('<p>https://store.ncdinos.com 으로 가세요</p>');
  assert.deepEqual(r.맨글자, ['https://store.ncdinos.com']);
});

check('스킴 없는 도메인도 잡는다 — 스킴이 없으면 더 못 누른다', () => {
  const r = 맨주소찾기('<p>samsunglionsmall.com 에서 팝니다</p>');
  assert.deepEqual(r.도메인, ['samsunglionsmall.com']);
});

check('같은 주소를 코드와 도메인으로 두 번 세지 않는다', () => {
  const r = 맨주소찾기('<p>주소: <code>store.ssglanders.com</code></p>');
  assert.deepEqual(r.코드, ['store.ssglanders.com']);
  assert.equal(r.도메인.length, 0);
});

check('안전 안내로 보여 주는 주소는 건너뛴다 — 한화 글의 그 문장', () => {
  const r = 맨주소찾기('<p>가짜 쇼핑몰을 가려내려면 주소창 도메인이 hanwhaeagles.co.kr 인지 확인하세요.</p>');
  assert.equal(r.도메인.length, 0);
  assert.equal(r.안내로건너뜀, 1);
});

// ⚠️ 이 검사가 처음 판을 잡았다. 앞 120자를 통째로 보던 때는 옆 문장의
//    "인지 확인하세요"가 다음 문장의 주소까지 가려서, 점검 도구가 "깨끗하다"고
//    거짓 보고했다. 점검 도구는 **놓치는 쪽으로 틀리면 안 된다.**
check('안내 문장 다음 문장의 주소는 가려지지 않는다', () => {
  const r = 맨주소찾기(
    '<p>주소창 도메인이 hanwhaeagles.co.kr 인지 확인하세요.</p>'
    + '<p>https://store.ncdinos.com 으로 가세요</p>',
  );
  assert.deepEqual(r.맨글자, ['https://store.ncdinos.com']);
  assert.equal(r.안내로건너뜀, 1);
});

check('숫자나 소수점을 주소로 잡지 않는다', () => {
  const r = 맨주소찾기('<p>평균자책점 3.52, 승률 0.667, 타율 .273 입니다.</p>');
  assert.equal(r.코드.length + r.맨글자.length + r.도메인.length, 0);
});

check('코드 안의 주소 아닌 것은 세지 않는다', () => {
  const r = 맨주소찾기('<p><code>rank_math_focus_keyword</code> 와 <code>OPS 0.900</code></p>');
  assert.equal(r.코드.length, 0);
});

check('셀자리만() 이 눌러지는 링크의 글자까지 뺀다', () => {
  const 남은 = 셀자리만('<a href="https://x.co.kr">store.ncdinos.com</a>');
  assert.ok(!남은.includes('ncdinos'));
});

check('안내문맥 목록이 비어 있지 않다', () => {
  assert.ok(안내문맥.length >= 5);
  assert.ok(안내문맥.includes('주소창'));
});

check('안내인가() 는 문장 끝에서 끊는다', () => {
  assert.equal(안내인가('주소창 도메인이 맞는지 확인하세요. 그리고 ', 30), false);
  assert.equal(안내인가('주소창 도메인이 ', 10), true);
});

// ⚠️ 첫 실행 보고에 `youtube.com/pbatour):` 가 찍혔다. 보고가 틀린 주소를
//    말하면 사람이 그걸 찾으러 가서 못 찾는다 — 점검 도구에서는 숫자만큼
//    **찍히는 주소가 맞는 것**도 중요하다.
check('주소 뒤에 딸려온 문장 부호를 뗀다', () => {
  const r = 맨주소찾기('<p>(유튜브 youtube.com/pbatour): 보세요</p>');
  assert.deepEqual(r.도메인, ['youtube.com/pbatour']);
});

check('꼬리떼기() 가 괄호·콜론·따옴표를 뗀다', () => {
  assert.equal(꼬리떼기('store.ncdinos.com):'), 'store.ncdinos.com');
  assert.equal(꼬리떼기('https://kovo.co.kr/,'), 'https://kovo.co.kr/');
  assert.equal(꼬리떼기('lpga.com'), 'lpga.com');
});

check('주소 가운데의 점·슬래시는 지킨다', () => {
  assert.equal(꼬리떼기('https://a.co.kr/b/c?d=1'), 'https://a.co.kr/b/c?d=1');
});

console.log(`\n  ${passed}개 통과`);
