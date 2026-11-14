#!/usr/bin/env node
/**
 * 본문 쿠팡 상품 광고 검사. (2026-11-14)
 *
 * 719편 본문에 광고를 까는 일이라, 눈으로 보고 넘어갈 수 없는 것들을
 * 숫자로 박아 둔다. 특히 **고지문**은 운영자가 "위반은 절대 안 된다"고
 * 못박은 자리다(2026-11-10).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  광고HTML, 광고블록, 광고있나, 광고넣기, 광고빼기, 광고만바뀌었나, 넣을자리, 표식,
} from '../src/wordpress/add-product-ad.mjs';
import { ROOT } from '../src/utils/env.mjs';

let 통과 = 0;
let 실패 = 0;
function ok(이름, 참인가) {
  if (참인가) { 통과 += 1; console.log(`  ✅ ${이름}`); }
  else { 실패 += 1; console.log(`  ❌ ${이름}`); }
}

/** 흰 바탕(#fff) 위 명암비. WCAG 상대휘도. */
function 명암비(hex) {
  const n = hex.replace('#', '');
  const v = n.length === 3 ? n.split('').map((c) => c + c) : n.match(/../g);
  const [r, g, b] = v.map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05);
}

const html = 광고HTML();

console.log('\n[1] 쿠팡 코드를 건드리지 않는다');
{
  const 설정 = fs.readFileSync(path.join(ROOT, 'config/ad-coupang-products.html'), 'utf8');
  const iframes = 설정.match(/<iframe[^>]*>/g) || [];
  ok('쿠팡 iframe 이 하나 이상 있다', iframes.length >= 1);
  ok('모든 iframe 이 쿠팡 주소다', iframes.every((t) => /coupa\.ng|coupang\.com/.test(t)));
  ok('referrerpolicy 를 지웠거나 바꾸지 않았다', iframes.every((t) => t.includes('referrerpolicy="unsafe-url"')));
  // 쿠팡이 준 width/height 를 우리가 줄이지 않는다. 변형은 제휴 코드 수정이다.
  ok('width·height 가 쿠팡이 준 그대로 남아 있다', iframes.every((t) => /width="\d+"/.test(t) && /height="\d+"/.test(t)));
}

console.log('\n[2] 고지문 — 공정위 심사지침');
{
  const 고지 = html.match(/<div style="([^"]*)">([^<]*쿠팡 파트너스[^<]*)<\/div>/);
  ok('고지문이 있다', !!고지);
  if (고지) {
    const style = 고지[1];
    const 글 = 고지[2];
    ok('문구가 쿠팡이 요구한 그대로다', 글.includes('이 포스팅은 쿠팡 파트너스 활동의 일환으로') && 글.includes('수수료를 제공받습니다'));
    const px = Number((style.match(/font-size:(\d+)px/) || [])[1] || 0);
    ok(`글자가 12px 이상이다 (지금 ${px}px)`, px >= 12);
    const color = (style.match(/color:(#[0-9a-fA-F]{3,6})/) || [])[1] || '#000';
    const 비 = 명암비(color);
    ok(`명암비가 4.5 이상이다 (지금 ${비.toFixed(2)})`, 비 >= 4.5);
    // 광고보다 **앞**에 있어야 한다. 뒤에 있으면 다 보고 나서야 광고인 줄 안다.
    ok('고지문이 광고보다 앞에 있다', html.indexOf('쿠팡 파트너스') < html.indexOf('<iframe'));
  }
  // ⚠️ 하단 바와 고지문을 나눠 쓰지 않는다. 바에는 닫기 버튼이 있어서,
  //    닫으면 고지문이 같이 사라지고 본문 광고만 남는다.
  ok('이 블록이 고지문을 스스로 가진다', html.includes('쿠팡 파트너스 활동의 일환으로'));
}

console.log('\n[3] 본문과 섞이지 않는다');
{
  ok('위아래로 여백을 둔다', /margin:\d\dpx 0/.test(html));
  ok('본문과 가르는 선이 있다', html.includes('border-top') && html.includes('border-bottom'));
  // 모바일(360px)에서 120×4 는 한 줄에 안 들어간다. 접혀야 한다.
  ok('좁은 화면에서 접힌다 (flex-wrap)', html.includes('flex-wrap:wrap'));
  ok('화면을 고정으로 덮지 않는다', !html.includes('position:fixed'));
}

console.log('\n[4] 넣는 자리');
{
  const 본문 = '<!-- wp:paragraph -->\n<p>가나다</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading -->\n<h2>🔥 정리하면</h2>\n<!-- /wp:heading -->';
  ok('「정리하면」이 있으면 그 앞', 넣을자리(본문).이름 === '정리하면 앞');
  const 해시 = '<!-- wp:paragraph -->\n<p>가나다</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>#야구 #KBO</p>\n<!-- /wp:paragraph -->';
  ok('없으면 해시태그 앞', 넣을자리(해시).이름 === '해시태그 앞');
  ok('둘 다 없으면 본문 끝', 넣을자리('<p>가나다</p>').이름 === '본문 끝');
  const a = 광고넣기(본문);
  ok('정말 「정리하면」 앞에 들어간다', a.indexOf(표식) < a.indexOf('🔥 정리하면'));
  ok('해시태그보다 앞에 들어간다', 광고넣기(해시).indexOf(표식) < 광고넣기(해시).indexOf('#야구'));
}

console.log('\n[5] 넣기·빼기');
{
  const 본문 = '<!-- wp:paragraph -->\n<p>가나다</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:heading -->\n<h2>🔥 정리하면</h2>\n<!-- /wp:heading -->';
  const a = 광고넣기(본문);
  ok('넣으면 표식이 생긴다', 광고있나(a));
  ok('두 번 돌려도 하나다', 광고넣기(a) === null);
  ok('빼면 원래대로다', 광고빼기(a).trim() === 본문.trim());
  ok('없는 것을 빼면 null', 광고빼기(본문) === null);
  ok('광고 말고 본문이 그대로다', 광고만바뀌었나(본문, a));
  // 상품을 바꾸면 **그 자리에서** 갈아끼운다. 자리를 옮기지 않는다.
  const 다른상품 = html.replace('cqXZ8r', 'ZZZZZZ');
  const b = 광고넣기(a, 다른상품);
  ok('상품이 바뀌면 갈아끼운다', b !== null && b.includes('ZZZZZZ'));
  ok('갈아끼워도 하나뿐이다', (b.match(/id="cppd"/g) || []).length === 1);
  ok('갈아끼워도 자리가 그대로다', b.indexOf(표식) < b.indexOf('🔥 정리하면'));
  ok('갈아끼워도 본문이 그대로다', 광고만바뀌었나(본문, b));
}

console.log('\n[6] 워드프레스 블록');
{
  const 블록 = 광고블록();
  ok('wp:html 로 감싼다', 블록.startsWith('<!-- wp:html -->') && 블록.endsWith('<!-- /wp:html -->'));
  ok('표식이 들어 있다', 블록.includes(표식));
}

console.log('\n[7] 하단 바와 섞이지 않는다');
{
  // 표식이 같으면 한쪽 도구가 다른 쪽 광고를 집어 간다.
  const 바 = fs.readFileSync(path.join(ROOT, 'config/ad-coupang-sticky.html'), 'utf8');
  ok('하단 바와 표식이 다르다', !바.includes(표식));
  const 바본문 = '<!-- wp:html -->\n' + 바.trim() + '\n<!-- /wp:html -->';
  ok('하단 바가 있는 글에서도 광고가 없다고 본다', !광고있나(바본문));
  const 섞인것 = 광고넣기(바본문);
  ok('하단 바를 건드리지 않고 넣는다', 섞인것.includes('id="cpst"') && 섞인것.includes(표식));
  ok('빼도 하단 바는 남는다', 광고빼기(섞인것).includes('id="cpst"'));
}

console.log(`\n  ${통과}개 통과${실패 ? ` · ${실패}개 실패` : ''}`);
if (실패) process.exit(1);
