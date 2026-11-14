#!/usr/bin/env node
/**
 * 글 중간 옛 쿠팡 블록 빼기 검사. (2026-11-14)
 *
 * 셋 다 wp:html 안의 쿠팡 코드라, 잘못 집으면 **하단 바나 블프 배너가
 * 통째로 날아간다.** 그걸 막는 것이 이 검사의 전부다.
 */
import {
  옛본문블록인가, 옛블록있나, 옛블록빼기, 그것만바뀌었나, 지킬표식,
} from '../src/wordpress/drop-body-ad.mjs';

let 통과 = 0;
let 실패 = 0;
function ok(이름, 참인가) {
  if (참인가) { 통과 += 1; console.log(`  ✅ ${이름}`); }
  else { 실패 += 1; console.log(`  ❌ ${이름}`); }
}

const 옛 = '<!-- wp:html -->\n<script src="https://ads-partners.coupang.com/g.js"></script>\n<script>\n    new PartnersCoupang.G({"id":872203,"template":"carousel"});\n</script>\n<br>"이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다"\n<iframe src="https://coupa.ng/ciwQYr" width="100%" height="44"></iframe>\n<!-- /wp:html -->';
const 바 = '<!-- wp:html -->\n<div id="cpst" style="position:fixed">\n<script src="https://ads-partners.coupang.com/g.js"></script>\n<script>new PartnersCoupang.G({});</script>\n</div>\n<!-- /wp:html -->';
const 블프 = '<!-- wp:html -->\n<div id="cppd">\n<a href="https://link.coupang.com/a/x"><img src="https://image14.coupangcdn.com/a.png"></a>\n</div>\n<!-- /wp:html -->';
const 관련 = '<!-- wp:html -->\n<aside class="maumjaro-related">같이 읽을 글</aside>\n<!-- /wp:html -->';
const 문단 = '<!-- wp:paragraph -->\n<p>가나다</p>\n<!-- /wp:paragraph -->';

console.log('\n[1] 셋을 가린다');
{
  ok('옛 본문 블록을 알아본다', 옛본문블록인가(옛));
  ok('하단 바는 건드리지 않는다', !옛본문블록인가(바));
  ok('블프 배너는 건드리지 않는다', !옛본문블록인가(블프));
  ok('쿠팡과 상관없는 wp:html 은 건드리지 않는다', !옛본문블록인가(관련));
  // 지킬 표식이 둘 다 적혀 있어야 한다. 하나라도 빠지면 그게 날아간다.
  ok('지킬 표식에 하단 바가 있다', 지킬표식.includes('id="cpst"'));
  ok('지킬 표식에 블프 배너가 있다', 지킬표식.includes('id="cppd"'));
}

console.log('\n[2] 빼기');
{
  const 글 = [문단, 옛, '<!-- wp:heading -->\n<h2>소제목</h2>\n<!-- /wp:heading -->', 블프, 바, 관련].join('\n\n');
  ok('옛 블록이 있다고 본다', 옛블록있나(글));
  const a = 옛블록빼기(글);
  ok('옛 블록이 사라진다', !옛블록있나(a));
  ok('쿠팡 캐러셀 스크립트가 본문에서 사라진다', !/<br>"이 포스팅은/.test(a));
  // ⚠️ 여기가 핵심이다. 하나라도 날아가면 광고가 통째로 사라진다.
  ok('하단 바가 남는다', a.includes('id="cpst"'));
  ok('블프 배너가 남는다', a.includes('id="cppd"'));
  ok('관련글 상자가 남는다', a.includes('maumjaro-related'));
  ok('본문 글자가 그대로다', 그것만바뀌었나(글, a));
  ok('소제목이 남는다', a.includes('<h2>소제목</h2>'));
  ok('두 번 돌려도 그대로다', 옛블록빼기(a) === null);
  ok('없는 글은 null', 옛블록빼기([문단, 바].join('\n\n')) === null);
  // 빈 줄이 셋 넘게 남지 않는다.
  ok('빠진 자리에 빈 줄이 쌓이지 않는다', !/\n{3,}/.test(a));
}

console.log('\n[3] 옛 블록이 여럿이어도');
{
  const 글 = [문단, 옛, 문단, 옛, 바].join('\n\n');
  const a = 옛블록빼기(글);
  ok('둘 다 빠진다', !옛블록있나(a));
  ok('하단 바는 남는다', a.includes('id="cpst"'));
}

console.log('\n[4] 하단 바만 있는 글은 건드리지 않는다');
{
  const 글 = [문단, 바, 블프].join('\n\n');
  ok('뺄 것이 없다고 본다', !옛블록있나(글));
  ok('null 을 돌려준다', 옛블록빼기(글) === null);
}

console.log(`\n  ${통과}개 통과${실패 ? ` · ${실패}개 실패` : ''}`);
if (실패) process.exit(1);
