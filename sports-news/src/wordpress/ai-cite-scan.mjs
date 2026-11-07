// "AI가 가져가기 좋은 글" 기준이 실제로 지켜지고 있는지 센다. 읽기만 한다(0원).
//
//   node src/wordpress/ai-cite-scan.mjs            전부
//   node src/wordpress/ai-cite-scan.mjs --보기 20   어긴 글을 20편까지 보여준다
//
// 왜 필요한가 (2026-11-07 운영자 질문)
//   "우리가 원한 AI가 잘 가져가는 글의 기준은 잘 돌아가고 있는가?"
//
//   기준은 sports-news/CLAUDE.md 3절과 config/style-warp.md ①⑨절에 적혀
//   있다. 그런데 **지켜지는지를 한 번도 재지 않았다.** 706편 중 몇 편이
//   어기는지 모르면 "돌아간다"는 말은 느낌이지 답이 아니다.
//
//   그래서 **기계로 셀 수 있는 것만** 센다. 아래 여섯 가지다.
//
//     ① 인사말로 열지 않는다            (style-warp ①)
//     ② 첫 문장이 대명사·지시어로 시작하지 않는다 (떼어 읽어도 통해야 한다)
//     ③ 대표 키워드가 첫 문장 안에 있다
//     ④ 자주 묻는 질문 섹션이 있다
//     ⑤ 질문이 4개 이상이다
//     ⑥ 읽는 시점에 따라 달라지는 말을 쓰지 않는다 ("지난주", "내년")
//
// 못 재는 것은 재지 않는다
//   "독자적인 정보", "출처 밝히기", "실사 이미지", "저자 정보" 넷은
//   writing-playbook.md 가 우리의 약점으로 꼽은 것이지만 사람이 읽어야
//   판단된다. 숫자로 꾸며내지 않는다.
//
//   그리고 **이 점수가 올라도 AI 인용이 보장되지 않는다.** CLAUDE.md 가
//   못 박아 둔 것이고 OpenAI 공식 안내도 같은 말을 한다. 여기서 재는 것은
//   "우리가 정한 규칙을 우리가 지키는가" 하나뿐이다.

import { wpFetch } from './client.mjs';
import { 발행글전부 } from './index-audit.mjs';

/** 태그를 걷어내고 사람이 읽는 글자만 남긴다. */
export const 글자만 = (html) => String(html || '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

/** 첫 문단. 쿠팡 광고·배너 블록은 글이 아니므로 건너뛴다. */
export function 첫문단(content) {
  const 덩어리 = String(content || '').split(/<!--\s*\/?wp:/);
  for (const d of 덩어리) {
    if (/coupang|cpst|adsbygoogle|wp-block-buttons|wp-block-image/i.test(d)) continue;
    const 글 = 글자만(d.replace(/^paragraph[^>]*-->/, ''));
    if (글.length >= 20) return 글;
  }
  return 글자만(content).slice(0, 300);
}

/** 문장으로 쪼갠다. 마침표·물음표·느낌표 뒤에서 끊는다. */
export function 문장들(글) {
  return String(글 || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/** ① 인사말로 열었나. */
const 인사말 = /^(안녕하세요|반갑습니다|여러분|오늘은|자,|스포츠\s?팬)/;
export function 인사말로열었나(content) {
  return 인사말.test(첫문단(content));
}

/**
 * ② 첫 문장이 앞을 받는 말로 시작하나.
 *
 * 떼어 읽어도 뜻이 통해야 한다는 규칙이다. 글의 첫 문장이 "이 대회는"으로
 * 시작하면 그 문장만 인용됐을 때 무슨 대회인지 알 수 없다.
 */
const 받는말 = /^(이것은|이는|그는|그녀는|이번|이\s|그\s|해당|위\s?|올해의\s)/;
export function 받는말로시작하나(content) {
  const 첫 = 문장들(첫문단(content))[0] || '';
  return 받는말.test(첫);
}

/** ③ 대표 키워드가 첫 문장 안에 있나. 키워드가 없는 글은 셈에서 뺀다. */
export function 키워드가첫문장에(post) {
  const kw = String(post.focusKeyword || '').trim();
  if (kw.length < 2) return null;
  const 첫 = 문장들(첫문단(post.content))[0] || '';
  return 첫.includes(kw);
}

/** ④⑤ 자주 묻는 질문. 소제목과 질문 개수를 센다. */
export function 질문절(content) {
  const 글 = 글자만(content);
  const 있나 = /자주\s?묻는\s?질문/.test(글) || /❓/.test(String(content || ''));
  const 질문수 = (글.match(/Q\s?\.\s?/g) || []).length;
  return { 있나, 질문수 };
}

/**
 * ⑥ 읽는 시점에 따라 달라지는 말.
 *
 * "지난주 경기에서"는 글이 올라온 주에만 맞는 말이다. 한 달 뒤에 AI가
 * 그 문장을 인용하면 틀린 말이 된다. 고정된 날짜를 쓰라는 규칙이다.
 *
 * '올해'·'내년'은 연도 글에서 제목과 함께 쓰면 뜻이 통하는 경우가 있어
 * **따로 센다**(참고용). 센 것을 바로 잘못으로 보지 않는다.
 */
const 흔들리는말 = /지난\s?(주|달|해)|이번\s?주|다음\s?주|며칠\s?전|조만간|최근\s?들어|얼마\s?전/g;
const 느슨한말 = /올해|내년|작년|지난해/g;
export function 흔들리는표현(content) {
  const 글 = 글자만(content);
  return {
    센것: (글.match(흔들리는말) || []).length,
    느슨한것: (글.match(느슨한말) || []).length,
  };
}

/**
 * 글 안에 적힌 **고정된 날짜**를 모은다.
 *
 * "지난주"를 날짜로 바꾸려면 그 날짜가 글 안에 있어야 한다. 없으면
 * 바꿀 수 없다 — 발행일에서 역산해 지어내지 않는다. 글이 올라온 날과
 * 사건이 일어난 날은 다르고, 틀린 날짜는 흔들리는 말보다 나쁘다.
 */
export function 글속날짜(content) {
  const 글 = 글자만(content);
  const 모음 = new Set();
  for (const m of 글.matchAll(/((?:19|20)\d{2})년\s?(\d{1,2})월\s?(\d{1,2})일/g)) 모음.add(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of 글.matchAll(/(?<!\d)(\d{1,2})월\s?(\d{1,2})일/g)) 모음.add(`${m[1]}월 ${m[2]}일`);
  return [...모음];
}

/** 흔들리는 말이 든 문장만 뽑는다. 고치기 전에 눈으로 보려고. */
export function 흔들린문장들(content) {
  return 문장들(글자만(content)).filter((s) => { 흔들리는말.lastIndex = 0; return 흔들리는말.test(s); }).map((s) => s.trim());
}

/** 글 한 편을 재서 어긴 항목을 돌려준다. */
export function 재기(post) {
  const 질문 = 질문절(post.content);
  const 흔들림 = 흔들리는표현(post.content);
  const 키워드 = 키워드가첫문장에(post);
  const 어긴것 = [];
  if (인사말로열었나(post.content)) 어긴것.push('인사말로 열었다');
  if (받는말로시작하나(post.content)) 어긴것.push('첫 문장이 앞을 받는 말로 시작한다');
  if (키워드 === false) 어긴것.push('대표 키워드가 첫 문장에 없다');
  if (!질문.있나) 어긴것.push('자주 묻는 질문 절이 없다');
  else if (질문.질문수 < 4) 어긴것.push(`질문이 ${질문.질문수}개뿐이다`);
  if (흔들림.센것) 어긴것.push(`읽는 시점에 흔들리는 말 ${흔들림.센것}곳`);
  return { 어긴것, 질문, 흔들림, 키워드 };
}

async function 문장보기(ids) {
  console.log('\n────────────────────────────────────────────────────────');
  console.log('🔎 읽는 시점에 흔들리는 문장을 그대로 보여줍니다 (읽기만 · 비용 0원)');
  console.log('────────────────────────────────────────────────────────');
  for (const id of ids) {
    let data;
    try { ({ data } = await wpFetch(`/wp/v2/posts/${id}`, { query: { context: 'edit' } })); }
    catch (err) { console.log(`\n   ❌ ${id} 못 읽었습니다 — ${err.message}`); continue; }
    const content = data?.content?.raw ?? data?.content?.rendered ?? '';
    const 제목 = data?.title?.raw || data?.title?.rendered || '';
    const 문장 = 흔들린문장들(content);
    console.log(`\n   [${id}] ${제목}`);
    console.log(`     글 안에 적힌 날짜: ${글속날짜(content).join(' · ') || '없음'}`);
    console.log(`     흔들린 문장 ${문장.length}개:`);
    for (const one of 문장) console.log(`       · ${one}`);
  }
  console.log('\n아무것도 바꾸지 않았습니다.\n');
}

async function main() {
  const 문장자리 = process.argv.indexOf('--문장');
  if (문장자리 >= 0) {
    const ids = String(process.argv[문장자리 + 1] || '').split(/[\s,]+/).filter(Boolean);
    if (!ids.length) { console.log('글 번호를 적어주세요'); return; }
    await 문장보기(ids);
    return;
  }
  const 보기수 = (() => {
    const i = process.argv.indexOf('--보기');
    const n = i >= 0 ? Number(process.argv[i + 1]) : 15;
    return Number.isFinite(n) && n > 0 ? n : 15;
  })();

  console.log('\n────────────────────────────────────────────────────────');
  console.log('🤖 "AI가 가져가기 좋은 글" 기준을 지키는지 셉니다 (읽기만 · 비용 0원)');
  console.log('────────────────────────────────────────────────────────');
  console.log('\n※ 이 숫자가 올라도 AI 인용이 보장되지는 않습니다. 재는 것은');
  console.log('  "우리가 정한 규칙을 우리가 지키는가" 하나뿐입니다.');

  const 목록 = await 발행글전부();
  console.log(`\n발행 ${목록.length}편의 본문을 읽습니다…`);

  const 셈 = {
    인사말: 0, 받는말: 0, 키워드없음: 0, 키워드모름: 0,
    질문절없음: 0, 질문부족: 0, 흔들림: 0, 느슨함: 0, 완벽: 0,
  };
  const 흔들린곳 = [];
  const 나쁜글 = [];

  for (const p of 목록) {
    let content = '';
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${p.id}`, { query: { context: 'edit' } });
      content = data?.content?.raw ?? data?.content?.rendered ?? '';
    } catch { /* 못 읽은 글은 세지 않는다 */ continue; }
    const post = { ...p, content };
    const r = 재기(post);

    if (인사말로열었나(content)) 셈.인사말 += 1;
    if (받는말로시작하나(content)) 셈.받는말 += 1;
    if (r.키워드 === false) 셈.키워드없음 += 1;
    if (r.키워드 === null) 셈.키워드모름 += 1;
    if (!r.질문.있나) 셈.질문절없음 += 1;
    else if (r.질문.질문수 < 4) 셈.질문부족 += 1;
    if (r.흔들림.센것) { 셈.흔들림 += 1; 흔들린곳.push({ post, 수: r.흔들림.센것 }); }
    if (r.흔들림.느슨한것) 셈.느슨함 += 1;
    if (!r.어긴것.length) 셈.완벽 += 1;
    else 나쁜글.push({ post, 어긴것: r.어긴것 });
  }

  const 읽은수 = 셈.완벽 + 나쁜글.length;
  const 몫 = (n) => (읽은수 ? `${((n / 읽은수) * 100).toFixed(1)}%` : '—');

  console.log(`\n읽은 글 ${읽은수}편`);
  console.log('\n   항목                                      어긴 글');
  console.log('   ────────────────────────────────────────────────────');
  console.log(`   ① 인사말로 열지 않는다                   ${String(셈.인사말).padStart(4)}편  ${몫(셈.인사말)}`);
  console.log(`   ② 첫 문장을 앞 받는 말로 시작하지 않는다 ${String(셈.받는말).padStart(4)}편  ${몫(셈.받는말)}`);
  console.log(`   ③ 대표 키워드가 첫 문장에 있다           ${String(셈.키워드없음).padStart(4)}편  ${몫(셈.키워드없음)}`);
  console.log(`      (대표 키워드 자체가 없어 못 센 글       ${String(셈.키워드모름).padStart(4)}편)`);
  console.log(`   ④ 자주 묻는 질문 절이 있다               ${String(셈.질문절없음).padStart(4)}편  ${몫(셈.질문절없음)}`);
  console.log(`   ⑤ 질문이 4개 이상이다                    ${String(셈.질문부족).padStart(4)}편  ${몫(셈.질문부족)}`);
  console.log(`   ⑥ 읽는 시점에 흔들리는 말을 쓰지 않는다  ${String(셈.흔들림).padStart(4)}편  ${몫(셈.흔들림)}`);
  console.log(`      (참고 — '올해·내년·작년'이 든 글        ${String(셈.느슨함).padStart(4)}편)`);
  console.log(`\n   ▶ 여섯 항목을 모두 지킨 글 ${셈.완벽}편 (${몫(셈.완벽)})`);

  if (흔들린곳.length) {
    console.log('\n   읽는 시점에 흔들리는 말이 가장 많은 글 (0원으로 고칠 자리):');
    for (const { post, 수 } of 흔들린곳.sort((a, b) => b.수 - a.수).slice(0, 10)) {
      console.log(`     [${post.id}] ${수}곳 · ${post.title.slice(0, 50)}`);
    }
  }

  if (나쁜글.length) {
    console.log(`\n   어긴 글 ${나쁜글.length}편 중 ${Math.min(보기수, 나쁜글.length)}편:`);
    for (const { post, 어긴것 } of 나쁜글.slice(0, 보기수)) {
      console.log(`\n     [${post.id}] ${post.title.slice(0, 50)}`);
      for (const 하나 of 어긴것) console.log(`        · ${하나}`);
    }
  }
  console.log('\n아무것도 바꾸지 않았습니다. 무엇을 고칠지는 사람이 정합니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
