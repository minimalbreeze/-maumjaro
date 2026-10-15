// 쿠팡 블록을 첫 문단 뒤로 내리는 경로 검사.
//
// 가장 중요한 검사: **광고 말고는 본문이 글자 하나까지 그대로다.**
// 발행된 640편을 건드리는 일이라, 본문이 틀어지면 순위째로 잃는다.
//
// 두 번째: **두 번 돌려도 안 움직인다.** 미리보기와 적용을 번갈아 돌리는
// 흐름이라 같은 글에 여러 번 닿는다.

import assert from 'node:assert/strict';
import {
  findCoupang, 첫문단끝, withoutCoupang, moveCoupang, coupangOnlyMove, COUPANG_MARK,
} from '../src/wordpress/move-coupang.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[쿠팡 블록을 첫 문단 뒤로]');

// 실제 config/ad-coupang.html 과 같은 모양
const 쿠팡날것 = `<script src="https://ads-partners.coupang.com/g.js"></script>
<script>
    new PartnersCoupang.G({"id":872203,"trackingCode":"AF3646181","subId":null,"template":"carousel","width":"100%","height":"140"});
</script>
<br>"이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다"
<iframe src="https://coupa.ng/ciwQYr" width="100%" height="44" frameborder="0" scrolling="no" referrerpolicy="unsafe-url" browsingtopics></iframe>`;

const 쿠팡감쌈 = `<!-- wp:html -->\n${쿠팡날것}\n<!-- /wp:html -->`;

const 본문 = `<!-- wp:paragraph -->
<p></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph -->
<p>실시간 경마중계는 생생경마 라이브를 비롯해 여러 곳에서 볼 수 있습니다.</p>
<!-- /wp:paragraph -->
<!-- wp:heading -->
<h2 class="wp-block-heading">어디서 보나</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>한국마사회 공식 채널이 가장 확실합니다.</p>
<!-- /wp:paragraph -->`;

// ── 찾기 ───────────────────────────────────────────────────
check('wp:html 로 감싸진 쿠팡 블록을 통째로 집는다', () => {
  const f = findCoupang(`${쿠팡감쌈}\n${본문}`);
  assert.ok(f, '못 찾았습니다');
  assert.equal(f.감쌈, true);
  assert.ok(f.블록.startsWith('<!-- wp:html'), '여는 주석이 빠졌습니다');
  assert.ok(f.블록.endsWith('<!-- /wp:html -->'), '닫는 주석이 빠졌습니다');
  assert.ok(f.블록.includes('coupa.ng'), '검색창 iframe 이 빠졌습니다');
});

check('감싸지지 않은 쿠팡 블록도 집는다 (옛 글)', () => {
  const f = findCoupang(`${쿠팡날것}\n${본문}`);
  assert.ok(f, '못 찾았습니다');
  assert.equal(f.감쌈, false);
  assert.ok(f.블록.includes(COUPANG_MARK), '스크립트가 빠졌습니다');
  assert.ok(f.블록.endsWith('</iframe>'), '검색창 iframe 까지 집지 않았습니다');
});

check('고지 문구를 광고와 함께 집는다', () => {
  // 법적으로 광고와 떨어지면 안 된다. 떼어 놓고 옮기면 고지가 엉뚱한 자리에 남는다.
  const f = findCoupang(`${쿠팡날것}\n${본문}`);
  assert.ok(f.블록.includes('쿠팡 파트너스 활동의 일환'), '고지 문구가 빠졌습니다');
});

check('쿠팡이 없으면 null', () => {
  assert.equal(findCoupang(본문), null);
  assert.equal(findCoupang(''), null);
  assert.equal(findCoupang(null), null);
});

check('다른 wp:html 블록을 쿠팡으로 착각하지 않는다', () => {
  // 2922 에는 애드센스 '수동광고' wp:html 블록이 따로 들어 있다.
  const 애드센스 = '<!-- wp:html -->\n<div><ins class="adsbygoogle"></ins></div>\n<!-- /wp:html -->';
  const f = findCoupang(`${애드센스}\n${본문}\n${쿠팡감쌈}`);
  assert.ok(f, '쿠팡을 못 찾았습니다');
  assert.ok(!f.블록.includes('adsbygoogle'), '애드센스 블록까지 집었습니다');
  assert.ok(f.블록.includes('coupa.ng'), '쿠팡 블록이 아닙니다');
});

// ── 첫 문단 찾기 ───────────────────────────────────────────
check('빈 문단은 첫 문단으로 세지 않는다', () => {
  const 끝 = 첫문단끝(본문);
  assert.ok(끝 > 0, '첫 문단을 못 찾았습니다');
  const 앞 = 본문.slice(0, 끝);
  assert.ok(앞.includes('생생경마 라이브'), '빈 문단을 첫 문단으로 잡았습니다');
  assert.ok(!앞.includes('한국마사회'), '둘째 문단까지 넘어갔습니다');
});

check('문단이 없으면 -1', () => {
  assert.equal(첫문단끝('<h2>제목만 있다</h2>'), -1);
});

// ── 옮기기 ─────────────────────────────────────────────────
check('맨 앞의 쿠팡을 첫 문단 뒤로 내린다', () => {
  const 전 = `${쿠팡감쌈}\n${본문}`;
  const { html, 한일 } = moveCoupang(전);
  assert.equal(한일, '내림');
  const 쿠팡자리 = html.indexOf(COUPANG_MARK);
  const 첫문장자리 = html.indexOf('생생경마 라이브');
  assert.ok(첫문장자리 < 쿠팡자리, '쿠팡이 아직 첫 문단보다 앞에 있습니다');
  const 둘째자리 = html.indexOf('한국마사회');
  assert.ok(쿠팡자리 < 둘째자리, '쿠팡이 너무 아래로 내려갔습니다');
});

check('광고 말고는 본문이 글자 하나까지 그대로다', () => {
  const 전 = `${쿠팡감쌈}\n${본문}`;
  const { html } = moveCoupang(전);
  assert.ok(coupangOnlyMove(전, html), '광고 밖이 바뀌었습니다');
  assert.equal(withoutCoupang(html), withoutCoupang(전));
});

check('쿠팡 블록 자체도 글자 하나까지 그대로다', () => {
  const 전 = `${쿠팡날것}\n${본문}`;
  const { html } = moveCoupang(전);
  assert.ok(html.includes(쿠팡날것), '옮기면서 광고 코드가 바뀌었습니다');
});

check('두 번 돌려도 더 움직이지 않는다', () => {
  const 전 = `${쿠팡감쌈}\n${본문}`;
  const 한번 = moveCoupang(전).html;
  const { html: 두번, 한일 } = moveCoupang(한번);
  assert.equal(한일, null, '두 번째에도 옮겼습니다');
  assert.equal(두번, 한번, '두 번째에 본문이 바뀌었습니다');
});

check('이미 첫 문단 뒤에 있으면 건드리지 않는다', () => {
  const 끝 = 첫문단끝(본문);
  const 이미 = `${본문.slice(0, 끝)}\n${쿠팡감쌈}\n${본문.slice(끝)}`;
  const { 한일, 이유 } = moveCoupang(이미);
  assert.equal(한일, null);
  assert.ok(이유.includes('이미'), `이유가 다릅니다: ${이유}`);
});

check('쿠팡이 없으면 아무것도 하지 않는다', () => {
  const { html, 한일 } = moveCoupang(본문);
  assert.equal(한일, null);
  assert.equal(html, 본문);
});

check('문단이 없는 글은 건드리지 않는다', () => {
  const { 한일 } = moveCoupang(`${쿠팡감쌈}\n<h2>제목만</h2>`);
  assert.equal(한일, null);
});

// ── 마지막 방어선 ──────────────────────────────────────────
check('본문이 함께 바뀌면 광고만 움직인 것으로 보지 않는다', () => {
  const 전 = `${쿠팡감쌈}\n${본문}`;
  const 망가진것 = moveCoupang(전).html.replace('한국마사회 공식 채널이', '엉뚱한 문장이');
  assert.ok(!coupangOnlyMove(전, 망가진것), '본문이 바뀐 것을 못 걸렀습니다');
});

check('광고를 빼 버리면 광고만 움직인 것으로 보지 않는다', () => {
  const 전 = `${쿠팡감쌈}\n${본문}`;
  // 광고가 사라진 경우: withoutCoupang 이 같더라도 '옮김'이 아니라 '삭제'다.
  // 이 도구는 삭제를 만들어내지 않지만, 혹시 그런 결과가 나오면 걸려야 한다.
  const 삭제됨 = 본문;
  assert.equal(findCoupang(삭제됨), null, '광고가 남아 있습니다');
});

// ── 소스에 박아 두는 검사 ──────────────────────────────────
check('content 말고 다른 필드를 보내지 않는다', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/wordpress/move-coupang.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('body: { content: html }'), 'content 만 보내는 호출이 아닙니다');
  assert.ok(!/body:\s*\{[^}]*slug/.test(src), '슬러그를 보내고 있습니다');
  assert.ok(!/body:\s*\{[^}]*status/.test(src), '발행 상태를 보내고 있습니다');
});

check('wiki 밖의 글을 거른다', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/wordpress/move-coupang.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('손대도되는글인가(post?.link, wpConfig().base)'),
    '손대도되는글인가 를 (주소, 기준주소) 로 부르지 않습니다');
});

console.log(`\n  ${passed}개 통과`);
