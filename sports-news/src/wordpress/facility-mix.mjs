// 시설 글에 **다른 시설 이름이 섞여 있는지** 찾는다. 읽기만 한다(0원).
//
// 왜 만들었나 (2026-10-19)
//   보강 1순위 글을 열어 보다가 1693(제일CC 파3)에서 이걸 봤다.
//
//     "리베라CC 파3 이용료는 본 코스(비회원 평일 210,000원~ …)보다 훨씬
//      저렴해 … 제일CC 파3 골프장의 이용료는 …"
//     "티켓을 받으제일CC 파3 골프장의 이용방법은 …"
//     "대기 시간은 약 30분~1시간 발제일CC 파3 골프장은 …"
//
//   제일CC 글인데 **리베라CC 요금(21만/28만원)이 먼저 나온다.** 그리고
//   문장이 중간에서 잘린 채 이어붙었다("받으제일CC", "발제일CC").
//   독자가 요금을 보러 왔다가 다른 골프장 요금을 먼저 읽는다 — 분량을
//   늘리는 것보다 이걸 고치는 쪽이 먼저다.
//
//   파3 글 24편이 같은 시기에 같은 틀로 찍혀서, 한 편에서 났으면 여럿에서
//   났을 가능성이 높다. 그래서 눈으로 찾지 않고 기계로 센다.
//
// 이 도구는 **세기만 한다.** 무엇을 고칠지는 사람이 정한다 —
// index-audit 과 같은 자리다.

import { 발행글전부, 글유형 } from './index-audit.mjs';
import { 주제만 } from '../seo/topic-text.mjs';
import { wpFetch } from './client.mjs';

/** 제목 뒤쪽의 시설 유형어. 고유 부분만 남기려고 떼어낸다. */
const 유형어 = ['파크골프장', '골프클럽', '골프랜드', '골프장', '파3', '연습장'];

/**
 * 제목에서 **그 시설의 고유 이름**만 뽑는다.
 *
 *   '제일CC 파3 골프장 이용료·예약 방법 (태마당로 28)'  → '제일CC'
 *   '남양주 비전힐스 파3 골프장 이용료·…'                → '남양주 비전힐스'
 *   '양평 파크골프장 이용료·예약 방법 (병산리 465-1)'     → '양평'
 *
 * CC 는 떼지 않는다 — 제일CC 와 리베라CC 를 가르는 것이 바로 그 부분이다.
 */
export function 시설이름(title) {
  let t = String(title || '');
  const 괄호 = t.indexOf('(');
  if (괄호 > 0) t = t.slice(0, 괄호);
  // '이용료' 부터 뒤는 전부 설명이다.
  t = t.split(/이용료|이용 ?방법|예약/)[0];
  for (const w of 유형어) t = t.split(w).join(' ');
  return t.replace(/\s+/g, ' ').trim();
}

/** 제목 괄호 안의 주소. 같은 주소면 같은 시설이라 섞여도 사고가 아니다. */
export function 시설주소(title) {
  const m = /\(([^)]*)\)\s*$/.exec(String(title || ''));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

/** 낱말 경계로 센다. watch-banner 의 것과 같은 규칙이다. */
function 횟수(글, 말) {
  const esc = String(말).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (String(글).match(new RegExp(esc, 'g')) || []).length;
}

/**
 * 시설명 바로 앞 글자가 **한글 음절**이면 문장이 잘린 채 이어붙은 것이다.
 *
 *   '티켓을 받으제일CC'  → 앞 글자 '으'  → 잘림
 *   '오늘은 제일CC'      → 앞 글자 ' '   → 정상
 */
export function 붙어있나(글, 이름) {
  return 잘린자리(글, 이름).length > 0;
}

/**
 * 잘린 자리를 **주변 글자와 함께** 돌려준다.
 *
 * 참/거짓만 주면 사람이 글을 열어 봐야 한다. 두 글자 지명은 우연히 걸릴
 * 수도 있어서(지명+지명), 눈으로 1초에 가릴 수 있게 앞뒤를 같이 보여준다.
 */
export function 잘린자리(글, 이름, { 앞뒤 = 14, 최대 = 3 } = {}) {
  const esc = String(이름 || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc) return [];
  const re = new RegExp(`[가-힣]${esc}`, 'g');
  const 본문 = String(글 || '');
  const 모음 = [];
  for (const m of 본문.matchAll(re)) {
    const i = m.index;
    모음.push(본문.slice(Math.max(0, i - 앞뒤), i + m[0].length + 앞뒤).replace(/\s+/g, ' '));
    if (모음.length >= 최대) break;
  }
  return 모음;
}

/**
 * 글 하나에서 **자기 것이 아닌** 시설 이름을 찾는다.
 *
 * @param {object} 글      {id, title, content}
 * @param {Array}  다른것  [{이름, 주소}] — 다른 시설 글들의 이름
 */
/**
 * 그 이름이 **행정 지명 한 덩어리뿐**인가.
 *
 * 2026-10-19 첫 실행에서 36편이 걸렸는데 29편이 이것 때문이었다. '서울
 * 파크골프장'(1500) 글이 있어서 이름표에 `서울` 이 들어갔고, 수도권 글은
 * 전부 "서울에서 40분" 같은 문장을 갖고 있어 다 걸렸다. 여주·구미·양평·
 * 가평도 같다 — **지명은 다른 시설 글 본문에 자연히 나온다.**
 *
 * 두 글자이고 가르는 말이 없으면 지명으로 본다. 리베라CC·용인 88CC·
 * 천안 유관순·여주 영재처럼 가르는 부분이 있는 이름은 그대로 센다.
 */
export function 지명뿐인가(이름) {
  const t = String(이름 || '').trim();
  if (!t) return true;
  if (/[A-Za-z0-9]/.test(t)) return false;        // 리베라CC · 용인 88CC
  if (/\s/.test(t)) return false;                 // 천안 유관순 · 여주 영재
  return [...t].length <= 2;                       // 서울 · 여주 · 구미 · 양평
}

/** 여러 곳을 소개하는 묶음 글인가. 다른 이름이 나오는 것이 본업이다. */
export function 묶음글인가(title) {
  return /추천|비교|모음|정리|어디/.test(String(title || ''));
}

export function 섞인것(글, 다른것 = []) {
  const 내이름 = 시설이름(글?.title);
  const 내주소 = 시설주소(글?.title);
  // 꼬리("함께 읽으면 좋은 글" 등)를 걷어낸 본문만 본다. 거기에는 다른 글
  // 제목이 **당연히** 있어서, 안 걷으면 전부 걸린다.
  const 본문 = 주제만(글?.content || '');

  const 찾은것 = [];
  for (const d of 다른것) {
    if (!d?.이름 || d.이름 === 내이름) continue;
    // 지명 한 덩어리는 다른 시설 글에 자연히 나온다 — 세면 전부 걸린다.
    if (지명뿐인가(d.이름)) continue;
    // 주소가 같으면 같은 장소다 — 서평택 / 서평택골프클럽처럼 글이 둘인 경우.
    if (내주소 && d.주소 && 내주소 === d.주소) continue;
    // 내 이름이 상대 이름을 품으면(서평택 ⊂ 서평택골프클럽) 가르지 못한다.
    if (내이름 && (d.이름.includes(내이름) || 내이름.includes(d.이름))) continue;
    const n = 횟수(본문, d.이름);
    if (n > 0) 찾은것.push({ 이름: d.이름, 횟수: n });
  }
  찾은것.sort((a, b) => b.횟수 - a.횟수);
  const 자른곳 = 내이름 ? 잘린자리(본문, 내이름) : [];
  return { 내이름, 내주소, 섞인이름: 찾은것, 잘렸나: 자른곳.length > 0, 잘린자리: 자른곳 };
}

async function main() {
  console.log('\n────────────────────────────────────────────────────────');
  console.log('🧪 시설 글에 다른 시설 이름이 섞였는지 센다 (읽기만 함 · 0원)');
  console.log('────────────────────────────────────────────────────────');

  const 글 = await 발행글전부();
  const 시설글 = 글.filter((p) => 글유형(p.title) === '시설');
  console.log(`\n발행된 글 ${글.length}편 · 그중 시설 글 ${시설글.length}편`);

  // 같은 시설에 글이 둘인 경우가 있어 이름으로 묶는다. 안 묶으면
  // "여주 영재×1, 여주 영재×1" 처럼 같은 이름이 두 번 찍힌다.
  const 이름표 = [...new Map(
    시설글
      .map((p) => ({ 이름: 시설이름(p.title), 주소: 시설주소(p.title) }))
      .filter((x) => x.이름 && !지명뿐인가(x.이름))
      .map((x) => [x.이름, x]),
  ).values()];
  console.log(`가를 수 있는 시설 이름 ${이름표.length}개 (지명 한 덩어리는 제외했습니다)`);

  const 걸린것 = [];
  const 묶음 = [];
  for (const p of 시설글) {
    if (묶음글인가(p.title)) { 묶음.push(p); continue; }
    const { data } = await wpFetch(`/wp/v2/posts/${p.id}`, { query: { context: 'edit' } });
    const content = data?.content?.raw ?? data?.content?.rendered ?? '';
    const r = 섞인것({ id: p.id, title: p.title, content }, 이름표);
    if (r.섞인이름.length || r.잘렸나) 걸린것.push({ ...p, ...r });
  }

  console.log(`\n[다른 시설 이름이 섞였거나 문장이 잘린 글] ${걸린것.length}편\n`);
  for (const p of 걸린것) {
    const 섞임 = p.섞인이름.map((x) => `${x.이름}×${x.횟수}`).join(', ');
    console.log(`   ${p.id}  ${p.글자수.toLocaleString().padStart(6)}자  ${String(p.title).slice(0, 44)}`);
    console.log(`        내 시설: ${p.내이름}`);
    if (섞임) console.log(`        섞인 이름: ${섞임}`);
    // 잘린 자리는 주변 글자를 같이 찍는다 — 글을 열지 않고 가릴 수 있게.
    for (const 조각 of p.잘린자리 || []) console.log(`        ⚠️ 잘린 자리: …${조각}…`);
  }

  if (묶음.length) {
    console.log(`\n[여러 곳을 소개하는 묶음 글] ${묶음.length}편 — 다른 이름이 나오는 것이 본업이라 세지 않았습니다`);
    for (const p of 묶음) console.log(`   ${p.id}  ${String(p.title).slice(0, 50)}`);
  }

  console.log('\n이 도구는 세기만 합니다. 무엇을 고칠지는 사람이 정합니다.');
  console.log(`\n▶ 시설 글 ${시설글.length}편 중 ${걸린것.length}편에 다른 시설 이름이 섞였거나 문장이 잘렸습니다\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (await import('../utils/env.mjs')).loadEnv();
  await main();
}
