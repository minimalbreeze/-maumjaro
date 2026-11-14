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
  광고HTML, 광고블록, 광고있나, 광고넣기, 광고빼기, 광고만바뀌었나, 넣을자리, 꼬리앞, 표식,
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
  // ⚠️ 광고가 들어오는 모양이 둘이다(2026-11-14).
  //    (가) 상품 태그 — 쿠팡이 iframe 을 통째로 준다. 손대지 않는다.
  //    (나) 이벤트 프로모션 — 쿠팡이 HTML 태그를 주지 않고 **단축 URL 과
  //         배너 이미지 주소만** 준다. 그래서 a + img 는 우리가 조립한다.
  //    어느 쪽이든 **주소는 전부 쿠팡 것이어야** 한다. 그게 이 절의 요점이다.
  const iframes = html.match(/<iframe[^>]*>/g) || [];
  const 링크 = html.match(/<a [^>]*href="[^"]+"[^>]*>/g) || [];
  ok('쿠팡 광고 요소가 하나 이상 있다', iframes.length + 링크.length >= 1);
  ok('모든 iframe 이 쿠팡 주소다', iframes.every((t) => /coupa\.ng|coupang\.com/.test(t)));
  ok('모든 링크가 쿠팡 주소다', 링크.every((t) => /coupa\.ng|coupang\.com/.test(t)));
  const imgs = html.match(/<img [^>]*src="[^"]+"[^>]*>/g) || [];
  ok('모든 이미지가 쿠팡 주소다', imgs.every((t) => /coupangcdn\.com|coupang\.com/.test(t)));
  // 추적이 이 속성에 걸린다. 지우면 수수료가 우리에게 안 붙는다.
  ok('추적 속성(referrerpolicy)이 모든 광고 요소에 있다',
    [...iframes, ...링크].every((t) => t.includes('referrerpolicy="unsafe-url"')));
  // 쿠팡이 통째로 준 iframe 은 크기도 그대로 둔다. 변형은 제휴 코드 수정이다.
  ok('iframe 의 width·height 가 쿠팡이 준 그대로다',
    iframes.every((t) => /width="\d+"/.test(t) && /height="\d+"/.test(t)));
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
    // 광고가 iframe 일 수도 a 일 수도 있다. **먼저 나오는 쪽**과 견준다.
    const 광고자리 = [html.indexOf('<iframe'), html.indexOf('<a ')].filter((i) => i >= 0);
    ok('광고 요소를 찾았다', 광고자리.length >= 1);
    ok('고지문이 광고보다 앞에 있다', html.indexOf('쿠팡 파트너스') < Math.min(...광고자리));
  }
  // ⚠️ 하단 바와 고지문을 나눠 쓰지 않는다. 바에는 닫기 버튼이 있어서,
  //    닫으면 고지문이 같이 사라지고 본문 광고만 남는다.
  ok('이 블록이 고지문을 스스로 가진다', html.includes('쿠팡 파트너스 활동의 일환으로'));
}

console.log('\n[3] 본문과 섞이지 않는다');
{
  ok('위아래로 여백을 둔다', /margin:\d\dpx 0/.test(html));
  ok('본문과 가르는 선이 있다', html.includes('border-top') && html.includes('border-bottom'));
  // 광고가 여럿이면 모바일(360px)에서 한 줄에 안 들어간다 — 접혀야 한다.
  // 하나짜리 배너는 접을 것이 없으므로 요구하지 않는다.
  const 광고수 = (html.match(/<iframe/g) || []).length + (html.match(/<a /g) || []).length;
  if (광고수 > 1) ok('광고가 여럿이면 좁은 화면에서 접힌다 (flex-wrap)', html.includes('flex-wrap:wrap'));
  else ok('광고가 하나라 가로가 넘치지 않는다', /max-width:\d+px/.test(html) || html.includes('width:100%'));
  // 어느 모양이든 본문 폭을 넘지 않아야 한다.
  ok('이미지가 본문 폭을 넘지 않는다',
    !html.includes('<img') || /max-width:[^;"]+/.test(html));
  ok('화면을 고정으로 덮지 않는다', !html.includes('position:fixed'));
}

console.log('\n[4] 넣는 자리');
{
  // ⚠️ 2026-11-14 에 여기서 틀렸다. 「🔥 정리하면」과 해시태그만 보다가
  //    전체 미리보기에서 449편이 '본문 끝' 으로 떨어졌고, 그 자리는
  //    하단 고정 바와 「같이 읽을 글」 상자보다도 **뒤**였다. 그 둘은
  //    본문 뒤에 wp:html 로 붙어 있다. 아래가 그 재발을 막는다.
  const 바 = '<!-- wp:html -->\n<div id="cpst">바</div>\n<!-- /wp:html -->';
  const 관련 = '<!-- wp:html -->\n<aside>같이 읽을 글</aside>\n<!-- /wp:html -->';
  const 문단 = '<!-- wp:paragraph -->\n<p>가나다</p>\n<!-- /wp:paragraph -->';
  const FAQ = '<!-- wp:heading -->\n<h2>❓ 자주 묻는 질문</h2>\n<!-- /wp:heading -->';
  const FAQ민 = '<!-- wp:heading -->\n<h2>자주 묻는 질문</h2>\n<!-- /wp:heading -->';
  const 정리 = '<!-- wp:heading -->\n<h2>🔥 정리하면</h2>\n<!-- /wp:heading -->';
  const 해시블록 = '<!-- wp:paragraph -->\n<p>#야구 #KBO</p>\n<!-- /wp:paragraph -->';

  ok('「자주 묻는 질문」이 가장 앞선다', 넣을자리([문단, FAQ, 정리].join('\n\n')).이름 === '자주 묻는 질문 앞');
  ok('이모지가 없어도 찾는다', 넣을자리([문단, FAQ민].join('\n\n')).이름 === '자주 묻는 질문 앞');
  ok('FAQ 가 없으면 「정리하면」 앞', 넣을자리([문단, 정리].join('\n\n')).이름 === '정리하면 앞');
  ok('둘 다 없으면 해시태그 앞', 넣을자리([문단, 해시블록].join('\n\n')).이름 === '해시태그 앞');
  ok('앵커가 다 없으면 하단 바 앞', 넣을자리([문단, 바, 관련].join('\n\n')).이름 === '하단 바 앞');
  ok('wp:html 도 없으면 본문 끝', 넣을자리(문단).이름 === '본문 끝');

  // **실제로 그 앞에 들어가는가.** 이름만 맞고 자리가 틀리면 소용없다.
  const 기존글 = [문단, FAQ, 정리, 바, 관련].join('\n\n');
  const a = 광고넣기(기존글);
  ok('FAQ 보다 앞에 들어간다', a.indexOf(표식) < a.indexOf('자주 묻는 질문'));
  ok('하단 바보다 앞에 들어간다', a.indexOf(표식) < a.indexOf('id="cpst"'));
  ok('「같이 읽을 글」보다 앞에 들어간다', a.indexOf(표식) < a.indexOf('같이 읽을 글'));

  // 앵커가 하나도 없는 글에서도 꼬리 블록 뒤로 가면 안 된다.
  const 앵커없음 = [문단, 바, 관련].join('\n\n');
  const b = 광고넣기(앵커없음);
  ok('앵커가 없어도 하단 바보다 앞이다', b.indexOf(표식) < b.indexOf('id="cpst"'));
  ok('앵커가 없어도 「같이 읽을 글」보다 앞이다', b.indexOf(표식) < b.indexOf('같이 읽을 글'));
  ok('앵커가 없어도 본문보다는 뒤다', b.indexOf(표식) > b.indexOf('가나다'));
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
  //
  // ⚠️ 설정에 **지금 들어 있는 상품 코드**로 변형을 만들지 않는다(2026-11-14).
  //    처음엔 'cqXZ8r' 을 바꿔 썼는데, 블랙프라이데이 배너로 갈아끼우자
  //    그 문자열이 사라져 변형이 원본과 같아졌고 검사가 조용히 뜻을 잃었다.
  //    margin 은 바로 위 [3] 이 "두 자리 px" 로 보장하므로 안전하다.
  const 다른상품 = html.replace(/margin:(\d\d)px 0/, (m, n) => `margin:${Number(n) + 1}px 0`);
  ok('변형이 원본과 다르다 (검사 자체가 뜻을 갖는가)', 다른상품 !== html);
  const b = 광고넣기(a, 다른상품);
  ok('상품이 바뀌면 갈아끼운다', b !== null && b.includes(다른상품));
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
