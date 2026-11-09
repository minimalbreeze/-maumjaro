// 본문에 **누를 수 없는 주소**가 적힌 글을 센다. 아무것도 고치지 않는다.
//
//   node src/wordpress/bare-urls.mjs
//   node src/wordpress/bare-urls.mjs --limit=20
//
// 왜 필요한가
//   2026-11-08 효성님: "야구 각 구단 스토어 글에 URL 주소만 있고, 눌러서
//   스토어로 넘어가는 배너는 없다. … **URL 주소를 그대로 노출하면 무슨
//   소용인가.** 배너로 만들어 누르면 넘어갈 수 있게 해라. **다른 글도
//   점검해라.**"
//
//   구단 스토어 글 10편은 `official-links.json` 의 `byPost` 로 배너를 달아
//   고쳤다. 그런데 "다른 글도"가 남았다 — 같은 꼴이 몇 편에 더 있는지
//   **세어 본 적이 없다.** 그래서 이 도구를 만든다.
//
//   왜 나쁜가. 두 가지가 겹친다.
//   1. 독자가 주소를 손으로 옮겨 적어야 한다. 모바일에서는 사실상 못 간다.
//   2. **링크가 아니라 글자라서 구글이 그 경로로 따라가지 않는다.** 구글은
//      주로 다른 페이지의 링크로 페이지를 찾는다(지시서 ② 절). 우리 글을
//      가리키는 주소가 글자로 남아 있으면 그 길이 끊긴 것이다.
//
// 무엇을 세나 — 세 가지 꼴
//   `코드`    <code>·<kbd> 안에 적힌 주소.  예: 주소: <code>ktwizstore.co.kr</code>
//   `맨글자`  태그 밖에 그냥 적힌 http(s):// 주소
//   `도메인`  태그 밖의 `something.co.kr` 꼴 (스킴이 없어 더 못 누른다)
//
// 세지 않는 것 (일부러 남긴 것들)
//   - 이미 `<a href=…>` 안에 든 주소. 그건 눌러진다
//   - 쿠팡 광고 블록(`wp:html`) — 제휴사가 준 코드다. 손대지 않는다
//   - **안전 안내로 주소를 보여 주는 문장.** 한화 글의 "주소창 도메인이
//     hanwhaeagles.co.kr 인지 확인하라"가 그것이다. 가짜 쇼핑몰을 가르려고
//     주소를 **보여 주는 것이 목적**이라 노출이 옳다. 그런 문장은
//     `안내문맥` 으로 가려내고, 가려낸 수를 따로 찍는다 — 숨기지 않는다
//   - 이미지·스크립트 주소(src/srcset), 구조화 데이터(JSON-LD) 안의 주소
//
// 지키는 선
//   - **읽기만 한다.** POST 를 보내는 길이 이 파일에 없다
//   - wiki 밖의 글은 세지 않는다
//   - 센 것을 글 번호와 함께 찍는다. 고치는 것은 사람이 글마다 판단한다 —
//     배너로 바꿀 것, 링크로 바꿀 것, 그대로 둘 것이 섞여 있다

import { wpFetch, wpConfig } from './client.mjs';
import { 본문과함께 } from './broken-links.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

/** 주소가 들어가도 노출이 옳은 문맥. 이 말이 주소 앞 120자 안에 있으면 센다. */
export const 안내문맥 = [
  '주소창', '도메인이', '가짜', '사칭', '피싱', '정식 주소', '공식 주소인지',
  '맞는지 확인', '인지 확인',
];

/**
 * 주소를 **예시로 든** 자리인가. 주소 뒤쪽을 본다.
 *
 * ⚠️ 2026-11-09 링크화 미리보기에서 잡혔다. 롯데 글(15787)에 이 줄이 있다.
 *
 *     - 전용 주소가 따로 있거나 (`ktwizstore.co.kr` 같은 꼴)
 *
 *    롯데 굿즈 글인데 **KT 스토어 주소를 예시로** 든 것이다. 링크로 만들면
 *    롯데 굿즈를 찾는 사람을 KT 로 보낸다. 깨진 링크보다 나쁘다 — 눌러서
 *    엉뚱한 가게에 도착하면 글을 못 믿게 된다.
 *
 * 한화 글의 안전 안내(`안내문맥`)와 같은 종류인데 **표시가 주소 뒤에** 온다.
 * 그래서 앞만 보는 `안내인가()` 로는 못 걸렀다. 뒤쪽 30자를 따로 본다.
 */
export const 예시표시 = ['같은 꼴', '같은 식', '같은 모양', '같은 경우', '꼴로', '식으로', '처럼'];

export function 예시인가(본문, 자리, 길이) {
  const 뒤 = 본문.slice(자리 + 길이, 자리 + 길이 + 30);
  // 문장 끝을 넘어가면 다른 문장의 말이다.
  const 끊을자리 = 뒤.search(/[.?!\n]/);
  const 볼것 = 끊을자리 >= 0 ? 뒤.slice(0, 끊을자리) : 뒤;
  return 예시표시.some((말) => 볼것.includes(말));
}

/** 끝이 이것이면 주소로 본다. 너무 넓히면 "3.5" 같은 숫자를 먹는다. */
const 도메인끝 = [
  'co.kr', 'or.kr', 'go.kr', 'ne.kr', 're.kr', 'pe.kr', 'kr',
  'com', 'net', 'org', 'shop', 'store', 'io', 'tv', 'me', 'app',
];

/**
 * 쿠팡 광고 블록과 구조화 데이터를 통째로 뺀다.
 *
 * 둘 다 **우리가 쓴 문장이 아니다.** 쿠팡은 제휴사 코드이고 JSON-LD 는
 * 기계가 읽는 자리다. 여기 든 주소를 세면 숫자를 믿을 수 없게 된다.
 */
export function 셀자리만(html) {
  return String(html || '')
    // 쿠팡 등 raw HTML 블록
    .replace(/<!--\s*wp:html\s*-->[\s\S]*?<!--\s*\/wp:html\s*-->/g, ' ')
    // JSON-LD
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    // 이미 눌러지는 링크 — 여는 태그부터 닫는 태그까지
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' ')
    // 속성에 든 주소 (img src, srcset 등)
    .replace(/<(?!\/?(?:code|kbd)\b)[a-z][^>]*>/gi, ' ');
}

/**
 * 주소 뒤에 딸려온 문장 부호를 뗀다.
 *
 * ⚠️ 2026-11-09 첫 실행에서 `youtube.com/pbatour):` · `tv.kakao.com/pba):`
 *    가 그대로 찍혔다. 본문이 "(유튜브 youtube.com/pbatour)" 꼴이라 닫는
 *    괄호와 콜론이 주소에 붙은 것이다. **보고가 틀린 주소를 말하면 사람이
 *    그걸 찾으러 가서 못 찾는다.** `:` `;` 따옴표까지 뗀다.
 */
export function 꼬리떼기(s) {
  return String(s).replace(/[.,·:;)\]}"'’”]+$/, '');
}

/**
 * 주소 **바로 앞 문장**을 보고 안전 안내인지 가린다.
 *
 * ⚠️ 처음에는 앞 120자를 통째로 봤다가 **옆 문장이 주소를 가렸다.** 한화 글의
 *    "주소창 도메인이 … 인지 확인하세요." 다음 문장에 적힌 다른 주소까지
 *    안내로 보고 건너뛰었다. 넓게 보면 놓치는 쪽으로 틀린다 — 점검 도구가
 *    "깨끗하다"고 거짓 보고하는 꼴이라 가장 나쁜 방향이다.
 *    그래서 문장 끝(. ? ! 。 줄바꿈)에서 끊고, 거기서도 80자까지만 본다.
 */
export function 안내인가(본문, 자리) {
  let 앞 = 본문.slice(Math.max(0, 자리 - 80), 자리);
  const 끊을자리 = Math.max(앞.lastIndexOf('.'), 앞.lastIndexOf('?'), 앞.lastIndexOf('!'),
    앞.lastIndexOf('。'), 앞.lastIndexOf('\n'));
  if (끊을자리 >= 0) 앞 = 앞.slice(끊을자리 + 1);
  return 안내문맥.some((말) => 앞.includes(말));
}

/**
 * 한 글에서 누를 수 없는 주소를 찾는다.
 *
 * 돌려주는 모양: { 코드: [...], 맨글자: [...], 도메인: [...], 안내로건너뜀: n }
 */
export function 맨주소찾기(html) {
  const 본문 = 셀자리만(html);
  const 코드 = [];
  const 맨글자 = [];
  const 도메인 = [];
  let 안내로건너뜀 = 0;

  // ① <code>·<kbd> 안
  for (const m of 본문.matchAll(/<(code|kbd)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const 속 = m[2].replace(/<[^>]*>/g, '').trim();
    if (!속) continue;
    const 주소꼴 = /^(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.test(속)
      && 도메인끝.some((끝) => 속.replace(/^https?:\/\//, '').split('/')[0].endsWith(`.${끝}`) || 속.replace(/^https?:\/\//, '').split('/')[0] === 끝);
    if (!주소꼴) continue;
    if (안내인가(본문, m.index)) { 안내로건너뜀 += 1; continue; }
    코드.push(속);
  }

  // 코드 태그를 지운 뒤 태그 밖을 본다 — 같은 주소를 두 번 세지 않는다.
  const 밖 = 본문.replace(/<(code|kbd)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');

  // ② http(s):// 로 시작하는 맨 주소
  for (const m of 밖.matchAll(/https?:\/\/[^\s<>()"'\][]+/gi)) {
    if (안내인가(밖, m.index)) { 안내로건너뜀 += 1; continue; }
    맨글자.push(꼬리떼기(m[0]));
  }

  // ③ 스킴 없는 도메인 꼴
  const 끝묶음 = 도메인끝.join('|');
  const 도메인꼴 = new RegExp(`(?<![\\w./@-])([a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${끝묶음}))(?![\\w.-])(/\\S*)?`, 'gi');
  for (const m of 밖.matchAll(도메인꼴)) {
    if (안내인가(밖, m.index)) { 안내로건너뜀 += 1; continue; }
    도메인.push(꼬리떼기(m[1] + (m[2] || '')));
  }

  return {
    코드: [...new Set(코드)],
    맨글자: [...new Set(맨글자)],
    도메인: [...new Set(도메인)],
    안내로건너뜀,
  };
}

async function main() {
  const base = wpConfig().base;
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 40;

  console.log('\n────────────────────────────────────────────────────────');
  console.log('🔗 누를 수 없는 주소가 적힌 글 세기 (고치지 않음 · 비용 0원)');
  console.log(`   대상 사이트: ${new URL(base).host}`);
  console.log('────────────────────────────────────────────────────────');

  const 글 = await 본문과함께();
  const 밖의글 = 글.filter((p) => !손대도되는글인가(p.link, base));
  const 대상 = 글.filter((p) => 손대도되는글인가(p.link, base));
  console.log(`\n발행글 ${글.length}편 중 wiki 글 ${대상.length}편을 봅니다.`);
  if (밖의글.length) console.log(`   (wiki 밖 ${밖의글.length}편은 건너뜁니다)`);

  const 걸린것 = [];
  let 안내합 = 0;
  for (const p of 대상) {
    const r = 맨주소찾기(p.content);
    안내합 += r.안내로건너뜀;
    const 합 = r.코드.length + r.맨글자.length + r.도메인.length;
    if (합) 걸린것.push({ ...p, ...r, 합 });
  }
  걸린것.sort((a, b) => b.합 - a.합);

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`걸린 글: ${걸린것.length}편 / 주소 ${걸린것.reduce((s, x) => s + x.합, 0)}개`);
  console.log(`안전 안내로 보고 건너뛴 주소: ${안내합}개`);
  console.log('────────────────────────────────────────────────────────\n');

  for (const x of 걸린것.slice(0, limit)) {
    console.log(`[${x.id}] ${x.title}`);
    if (x.코드.length) console.log(`   코드로 적힌 주소 ${x.코드.length}개: ${x.코드.slice(0, 5).join(' , ')}`);
    if (x.맨글자.length) console.log(`   맨글자 주소 ${x.맨글자.length}개: ${x.맨글자.slice(0, 5).join(' , ')}`);
    if (x.도메인.length) console.log(`   스킴 없는 도메인 ${x.도메인.length}개: ${x.도메인.slice(0, 5).join(' , ')}`);
    console.log(`   ${x.link}`);
    console.log('');
  }
  if (걸린것.length > limit) console.log(`… 그리고 ${걸린것.length - limit}편 더 (--limit= 로 늘리세요)\n`);

  console.log('고치는 길 셋 — 글마다 사람이 고릅니다.');
  console.log('  1. 공식 홈페이지·스토어라면 official-links.json 의 byPost 에 못박아 배너로');
  console.log('  2. 우리 글을 가리키는 주소라면 링크로 (글끼리 링크가 구글이 찾는 길입니다)');
  console.log('  3. 가짜 사이트를 가르려고 보여 주는 주소라면 그대로 둡니다\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err?.message || err); process.exit(1); });
}
