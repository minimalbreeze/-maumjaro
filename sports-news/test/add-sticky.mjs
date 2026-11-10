// 쿠팡 하단 고정 바 넣기/빼기 검사.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 바넣기, 바빼기, 바있나, 바만바뀌었나, 바HTML, 바블록, 표식 } from '../src/wordpress/add-sticky.mjs';
import { ROOT } from '../src/utils/env.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[쿠팡 하단 고정 바]');

const 본문 = [
  '<!-- wp:paragraph -->',
  '<p>첫 문단입니다.</p>',
  '<!-- /wp:paragraph -->',
  '',
  '<!-- wp:heading -->',
  '<h2>소제목</h2>',
  '<!-- /wp:heading -->',
].join('\n');

check('본문 끝에 바를 넣는다', () => {
  const r = 바넣기(본문);
  assert.ok(바있나(r), '바가 없습니다');
  assert.ok(r.startsWith(본문.trimEnd()), '기존 본문이 앞에 그대로 있지 않습니다');
  assert.match(r, /<!-- wp:html -->[\s\S]*<!-- \/wp:html -->$/, 'wp:html 블록으로 감싸지 않았습니다');
});

check('두 번 넣지 않는다', () => {
  const 한번 = 바넣기(본문);
  assert.equal(바넣기(한번), null, '두 번 넣었습니다');
});

check('빼면 원래 본문으로 돌아온다', () => {
  const 한번 = 바넣기(본문);
  assert.equal(바빼기(한번), 본문.trimEnd(), '되돌리지 못했습니다');
  assert.equal(바빼기(본문), null, '없는데 뺐습니다');
});

check('바 말고 다른 것이 바뀌면 잡는다', () => {
  const 한번 = 바넣기(본문);
  assert.equal(바만바뀌었나(본문, 한번), true, '정상인데 막았습니다');
  const 망친것 = 한번.replace('첫 문단입니다.', '');
  assert.equal(바만바뀌었나(본문, 망친것), false, '본문이 지워진 것을 못 잡았습니다');
});

check('쿠팡 코드를 제휴사가 준 그대로 쓴다', () => {
  const html = 바HTML();
  const 원본 = fs.readFileSync(path.join(ROOT, 'config/ad-coupang.html'), 'utf8');
  const 주소 = /src="(https:\/\/coupa\.ng\/[A-Za-z0-9]+)"/.exec(원본);
  assert.ok(주소, '원본에서 쿠팡 위젯 주소를 찾지 못했습니다');
  assert.ok(html.includes(주소[1]), `쿠팡 위젯 주소가 다릅니다: ${주소[1]}`);
  assert.match(html, /width="100%"\s+height="44"/, '쿠팡이 준 크기를 바꿨습니다');
});

check('고지문이 바 안에 있다', () => {
  assert.match(바HTML(), /쿠팡 파트너스 활동의 일환으로/, '파트너스 고지문이 없습니다');
});

check('닫기 버튼이 있고 그 방문 동안 기억한다', () => {
  const html = 바HTML();
  assert.match(html, /id="cpst-x"/, '닫기 버튼이 없습니다');
  assert.match(html, /sessionStorage/, '닫은 것을 기억하지 않습니다');
  assert.match(html, /try\s*\{[\s\S]*sessionStorage[\s\S]*catch/, 'sessionStorage 가 막혀도 견디게 감싸지 않았습니다');
});

// ── 닫기 버튼이 쿠팡 위젯에 덮이지 않는다 (2026-11-10) ────────────────
//
// 운영자: "쿠팡 광고 아래 배너에 에러가 있다. 오른쪽 위 X가 안 눌린다."
//
// 원인은 **쌓임 순서**였다. 닫기 버튼이 바의 첫 자식이고 쿠팡 캐러셀 iframe 이
// 그 뒤에 왔다. 버튼은 top:-13px 라 아래 절반이 캐러셀과 겹치는데, 위젯이
// 제 iframe 에 z-index 를 얹으면 그 절반이 통째로 가려진다. 보이기는 보이니
// 눌렀다고 생각하는데 클릭은 광고가 먹는다.
//
// 브라우저로 재 봤다(390x844, 캐러셀 자리에 z-index:99999 iframe 을 둠).
//   예전: 가운데 cpst-x · 아래쪽 **캐러셀**   ← 절반이 안 눌린다
//   지금: 위·가운데·아래 전부 cpst-x
//
// 그래서 셋을 바꿨고, 아래 검사가 셋을 지킨다.
//   1. 쿠팡 코드를 `#cpst-in` 으로 감싸 **쌓임 문맥을 따로 만든다**(z-index:0)
//   2. 닫기 버튼을 **맨 마지막 자식**으로 옮기고 z-index 를 최대로 준다
//   3. click 만이 아니라 pointerdown 도 받는다
//
// ⚠️ 쿠팡 코드 자체는 한 글자도 안 바꿨다. 감싸는 상자와 닫기 버튼만 우리 것이다.
// --갱신만 은 바를 이미 가진 글만 고친다. 바 모양을 바꿀 때 필요한 것은
// 교체뿐인데, --전체 는 교체와 신규 설치를 같이 한다(2026-11-09 "719편 전체
// 배포는 하지 않는다").
check('--갱신만 손잡이가 있다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/add-sticky.mjs', import.meta.url), 'utf8');
  assert.match(src, /--갱신만/, '--갱신만 손잡이가 없습니다');
  assert.match(src, /갱신만 && !빼기 && !바있나\(content\)/, '--갱신만 이 바 없는 글을 건너뛰지 않습니다');
});

// ── 닫기 버튼이 광고와 **아예 겹치지 않는다** (2026-11-10, 두 번째 손질) ──
//
// 운영자: "어떤 글들은 닫기 버튼을 처음 누르면 광고로 넘어가고, 돌아와 다시
//          누르면 닫히던데 이런 건 문제 안 되나?"
//
// 문제가 맞다. 닫기 자리에서 광고가 열리면 그 클릭은 독자가 원해서 누른 것이
// 아니다 — 애드센스 광고 게재위치 정책이 막는 '실수 클릭 유도'가 바로 이것이고,
// 독자 입장에서도 나가려다 끌려가는 경험이다.
//
// 앞서 쌓임 순서로 풀었지만 그건 **브라우저가 그 규칙을 지켜 준다는 전제**가
// 깔린 해법이다. 전제를 없앤다 — 버튼을 바 바깥 위로 완전히 빼서 광고 영역과
// 겹치는 픽셀이 한 개도 없게 한다. 겹치지 않으면 누가 위에 그려지든 상관없다.
//
// 브라우저로 쟀다(폰 390x844 · PC 1280x800, 캐러셀 자리에 z-index:99999 iframe):
//   캐러셀과 겹치나: false · 위·가운데·아래 전부 cpst-x · 눌러서 닫힘
check('닫기 버튼이 광고 영역과 한 픽셀도 겹치지 않는다', () => {
  const html = 바HTML();
  const m = html.match(/id="cpst-x"[\s\S]*?top:(-?\d+)px[\s\S]*?height:(\d+)px/);
  assert.ok(m, '닫기 버튼의 top/height 를 읽지 못했습니다');
  const 아래끝 = Number(m[1]) + Number(m[2]);
  // top 은 #cpst 의 테두리 상자 기준이다. 아래끝이 0 이하면 바 안쪽(=광고)과
  // 겹치는 자리가 없다.
  assert.ok(아래끝 <= 0,
    `닫기 버튼 아래쪽 ${아래끝}px 가 바 안쪽(광고 영역)과 겹칩니다. top + height 가 0 이하여야 합니다`);
});

// 버튼이 바 위로 솟은 만큼 본문 여백도 더 줘야 마지막 줄을 안 덮는다.
// 겹침 검사도 그 자리를 포함해서 재야 버튼이 구글 광고를 덮지 않는다.
check('솟은 높이를 여백과 겹침 검사가 함께 쓴다', () => {
  const html = 바HTML();
  assert.match(html, /var 솟은높이 = \d+;/, '솟은높이 를 두지 않았습니다');
  assert.match(html, /bar\.offsetHeight \+ 솟은높이/, '본문 여백이 솟은 높이를 더하지 않습니다');
  assert.match(html, /top: r\.top - 솟은높이/, '겹침 검사가 솟은 자리를 보지 않습니다');
});

check('닫기 버튼이 쿠팡 영역보다 위에 그려진다', () => {
  const html = 바HTML();
  assert.match(html, /id="cpst-in"[^>]*z-index:0/, '쿠팡 영역을 z-index:0 상자로 감싸지 않았습니다');
  const 안쪽끝 = html.indexOf('</div>', html.indexOf('id="cpst-in"'));
  const 버튼 = html.indexOf('id="cpst-x"');
  assert.ok(안쪽끝 > 0 && 버튼 > 안쪽끝, '닫기 버튼이 쿠팡 영역보다 앞에 있습니다 (뒤에 와야 위에 그려집니다)');
  const m = html.match(/id="cpst-x"[\s\S]*?z-index:(\d+)/);
  assert.ok(m && Number(m[1]) >= 2147483647, '닫기 버튼 z-index 가 최대가 아닙니다');
});

check('닫기는 click 과 pointerdown 을 모두 받는다', () => {
  const html = 바HTML();
  assert.match(html, /addEventListener\('pointerdown'/, 'pointerdown 을 받지 않습니다');
  assert.match(html, /addEventListener\('click'/, 'click 을 받지 않습니다');
});

check('본문 마지막 줄을 덮지 않게 여백을 준다', () => {
  assert.match(바HTML(), /paddingBottom/, '아래 여백을 주지 않습니다');
});

check('화면을 가리는 전면 팝업이 아니다', () => {
  const html = 바HTML();
  assert.match(html, /position:fixed[^"]*bottom:0/, '하단 고정이 아닙니다');
  assert.ok(!/height:100%|inset:0|width:100vw|height:100vh/.test(html), '화면을 덮는 크기입니다 — 구글이 순위를 깎는 인터스티셜이 됩니다');
});

check('본문만 보낸다 — 제목·주소·발행상태를 보내지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/add-sticky.mjs'), 'utf8');
  const 보내는것 = [...src.matchAll(/body:\s*\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert.deepEqual(보내는것, ['content: after'], `본문 말고 다른 것을 보냅니다: ${보내는것.join(' / ')}`);
  assert.ok(!/slug/.test(src), '주소(슬러그)를 다룹니다');
});

check('미리보기가 기본이다 — --apply 가 있어야 저장한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/add-sticky.mjs'), 'utf8');
  assert.match(src, /const apply = args\.includes\('--apply'\)/);
  assert.match(src, /if \(!apply\) continue;/);
  assert.match(src, /--빼기/, '되돌리는 길이 없습니다');
});

check('전체는 --전체 를 적었을 때만 돈다', () => {
  // 700편을 실수로 건드리지 않는다. 글 번호가 기본이고 전체는 명시해야 한다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/add-sticky.mjs'), 'utf8');
  assert.match(src, /const 전체 = args\.includes\('--전체'\)/, '--전체 플래그가 없습니다');
  assert.match(src, /if \(전체\)[\s\S]{0,200}발행글전부\(\)/, '--전체 일 때만 전부를 받아오지 않습니다');
});

check('표식이 넣기·빼기·검사에서 같은 것을 가리킨다', () => {
  assert.ok(바HTML().includes(표식), `바 HTML 에 표식이 없습니다: ${표식}`);
});

// ── 구글 광고를 덮지 않는다 (2026-11-09) ────────────────────────────
//
// 효성님: "구글 기준과 애드센스 기준을 어기면 안 된다."
//
// 이 바는 position:fixed; bottom:0; z-index:9999 다. 아래 여백은 **글
// 마지막 줄**만 지키고, 스크롤 중에 본문 광고가 바 뒤로 지나가면 덮인다.
// 5762 본문에 adsbygoogle 이 실제로 들어 있어 가정이 아니다.
check('하단 바가 구글 광고와 겹치는지 재는 코드를 들고 있다', () => {
  const h = 바HTML();
  assert.ok(h.includes('adsbygoogle'), '구글 광고를 찾는 코드가 없습니다');
  assert.ok(h.includes('googlesyndication'), '앵커 광고 iframe 을 찾는 코드가 없습니다');
  assert.ok(h.includes('getBoundingClientRect'), '겹침을 재는 코드가 없습니다');
});

check('겹치면 숨기는 쪽이 우리 바다 — 애드센스를 가리지 않는다', () => {
  const h = 바HTML();
  assert.ok(/visibility\s*=\s*겹친다\s*\?\s*'hidden'/.test(h), h.slice(0, 200));
});

// ⚠️ 재는 코드가 틀렸을 때 **모든 글에서 쿠팡 광고가 사라지는** 쪽이 더 나쁘다.
//    그래서 try/catch 로 감싸고, 실패하면 지금까지의 동작(바가 보임)을 둔다.
check('재는 데 실패하면 바를 그대로 둔다 (fails open)', () => {
  const h = 바HTML();
  const i = h.indexOf('function 겹침확인');
  assert.ok(i > 0, '겹침확인 함수가 없습니다');
  const 몸 = h.slice(i, i + 1200);
  assert.ok(몸.includes('try {') && 몸.includes('catch (e) {}'), '겹침확인이 try/catch 로 감싸여 있지 않습니다');
});

// ⚠️ 제휴사가 준 코드는 글자 하나도 바꾸지 않는다. 손대면 광고가 동작하지
//    않을 수 있고, 지시서가 못박아 둔 자리다.
check('제휴사가 준 쿠팡 코드가 글자 하나까지 그대로다', () => {
  const h = 바HTML();
  assert.ok(h.includes('<script src="https://ads-partners.coupang.com/g.js"></script>'), 'g.js 호출이 바뀌었습니다');
  assert.ok(h.includes('new PartnersCoupang.G({"id":872203,"trackingCode":"AF3646181","subId":null,"template":"carousel","width":"100%","height":"140"});'), 'PartnersCoupang.G 호출이 바뀌었습니다');
});

// 제휴 공개는 FTC·공정위 기준이기도 하고 애드센스가 요구하는 투명성이기도 하다.
check('제휴 공개 문구가 그대로 있다', () => {
  assert.ok(바HTML().includes('쿠팡 파트너스 활동의 일환으로'), '제휴 공개 문구가 사라졌습니다');
});

// ── 옛 바를 한 번에 새 것으로 바꾼다 (2026-11-09) ──────────────────
//
// ⚠️ 이 검사가 생긴 이유. 바를 고쳐 애드센스 광고를 덮지 않게 했는데,
//    바넣기() 가 "이미 있으면 null" 이라 **이미 발행된 글에는 옛 바가
//    그대로 남았다.** 고친 의미가 없는 상태였다.
//
//    빼고 다시 넣는 2단계는 중간에 실패하면 그 글이 **쿠팡 광고를 잃은
//    채로** 남는다. 그래서 한 번에 바꾼다.
const 옛바 = 바블록('<div id="cpst" style="position:fixed;bottom:0">옛것<script>x</script>');

check('모양이 다른 바가 있으면 그 자리에서 바꾼다', () => {
  const before = '<p>글 한 줄</p>\n\n' + 옛바;
  const after = 바넣기(before);
  assert.ok(after, '바꾸지 않았습니다');
  assert.ok(!after.includes('옛것'), '옛 바가 남았습니다');
  assert.ok(after.includes('겹침확인'), '새 바가 안 들어갔습니다');
  assert.ok(after.includes('<p>글 한 줄</p>'), '본문이 사라졌습니다');
});

check('바꿀 때도 바 말고 다른 것이 바뀌지 않는다', () => {
  const before = '<p>글 한 줄</p>\n\n' + 옛바;
  assert.ok(바만바뀌었나(before, 바넣기(before)));
});

check('모양이 같으면 아무것도 하지 않는다 (두 번 돌려도 안전)', () => {
  const 한번 = 바넣기('<p>글</p>');
  assert.equal(바넣기(한번), null);
});

check('바가 없으면 그대로 붙인다 (예전 동작을 잃지 않았다)', () => {
  const after = 바넣기('<p>글만</p>');
  assert.ok(after.includes('id="cpst"'));
  assert.ok(after.includes('<p>글만</p>'));
});

// ⚠️ 표식은 있는데 덩어리를 못 집는 글은 **건드리지 않는다.** 어림짐작으로
//    덮어쓰면 본문을 망친다. 그런 글은 사람이 본다.
check('표식만 있고 덩어리 모양이 다르면 건드리지 않는다', () => {
  assert.equal(바넣기('<p>글</p> <span id="cpst"></span>'), null);
});

check('넣기와 빼기가 같은 정규식을 쓴다 — 두 벌을 두지 않는다', () => {
  const after = 바넣기('<p>글</p>');
  assert.equal(바빼기(after), '<p>글</p>');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
