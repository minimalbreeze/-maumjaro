// 읽는 시점에 따라 달라지는 말을 걷어낸다. AI를 부르지 않는다(0원).
//
//   node src/wordpress/fix-drift.mjs              미리보기 (전체)
//   node src/wordpress/fix-drift.mjs 5748 5794    글을 골라 미리보기
//   node src/wordpress/fix-drift.mjs --apply ...  실제 적용
//
// 왜 필요한가 (2026-11-07 실측)
//   `ai-cite-scan` 이 706편을 세어 보니 "지난주", "이번 주" 같은 말이
//   191편에 들어 있었다. sports-news/CLAUDE.md 3절이 이걸 막아 뒀다 —
//   "'지난주', '내년'처럼 읽는 시점에 따라 달라지는 말 대신 고정된
//   날짜를 쓴다." AI 가 문장을 떼어 인용하면 한 달 뒤에 틀린 말이 된다.
//
// **날짜를 지어내지 않는다** — 이것이 이 도구의 중심이다
//   처음에는 "지난주"를 날짜로 바꾸려 했다. 그런데 글이 올라온 날과
//   사건이 일어난 날은 다르고, 발행일에서 역산하면 틀린 날짜가 된다.
//   틀린 날짜는 흔들리는 말보다 나쁘다.
//
//   실제 문장을 보니 길이 있었다. 대부분이 이런 꼴이다.
//
//     "지난주 포티넷 파운더스컵에서 우승한 김효주가 …"
//     "지난주 휴스턴 오픈은 건너뛰고 이 대회에 집중했습니다"
//
//   **대회 이름이 이미 문장 안에 있다.** '지난주'만 떼면 뜻이 그대로
//   남고 시점에 흔들리지 않는다. 날짜를 보탤 필요가 없다.
//
//   '이번 주'는 떼면 문장이 헐거워져서 '이번 대회'로 바꾼다. 대회 주간을
//   가리키는 말이라 뜻이 같고, 읽는 시점과 무관해진다.
//
// 손대지 않는 것
//   - **'지난해'·'작년'·'올해'·'내년'.** 어느 해인지 글이 말해주지 않으면
//     연도를 넣는 것은 지어내는 일이다. 안세영 글(9247)의 "지난해 77전
//     73승 4패"가 그 경우다 — 2025년인지 2024년인지 글에 없다.
//   - **'다음 주'.** 떼면 "다음 주 오거스타에서" 가 "오거스타에서" 가 되어
//     순서 정보를 잃는다. 바꿀 말이 없으면 그대로 둔다.
//   - **'지난 시즌'.** 라벨로 쓰이는 자리가 있어("지난 시즌: 1승 추가")
//     떼면 문장이 깨진다.

import { wpFetch, wpConfig } from './client.mjs';
import { 발행글전부 } from './index-audit.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
// 본문 백업은 fix-alt 의 것을 그대로 쓴다. 두 벌로 두면 어긋난다.
import { saveContentBackup } from './fix-alt.mjs';

/**
 * 바꿀 말. **표에 적힌 것만** 바꾼다.
 *
 * 뒤에 공백을 요구하는 항목은 "그 말 다음에 다른 말이 이어질 때만"
 * 떼겠다는 뜻이다. "지난주에는" 처럼 조사가 붙은 꼴은 떼면 문장이
 * 깨지므로 건드리지 않는다.
 */
export const 바꿀말 = [
  { 전: '지난주 ', 후: '', 왜: '대회 이름이 문장에 이미 있다' },
  { 전: '지난 주 ', 후: '', 왜: '대회 이름이 문장에 이미 있다' },
  { 전: '지난달 ', 후: '', 왜: '어느 달인지 글이 말하지 않는다' },
  { 전: '지난 달 ', 후: '', 왜: '어느 달인지 글이 말하지 않는다' },
  { 전: '이번 주', 후: '이번 대회', 왜: '대회 주간을 가리키는 말이다' },
  { 전: '이번주', 후: '이번 대회', 왜: '대회 주간을 가리키는 말이다' },
  { 전: '최근 들어 ', 후: '', 왜: '언제부터인지 글이 말하지 않는다' },
  { 전: '얼마 전 ', 후: '', 왜: '언제인지 글이 말하지 않는다' },
  { 전: '며칠 전 ', 후: '', 왜: '언제인지 글이 말하지 않는다' },
  { 전: '조만간 ', 후: '', 왜: '언제인지 글이 말하지 않는다' },
];

/** 본문을 고친다. 무엇을 몇 번 바꿨는지 함께 돌려준다. */
export function 고친것(content) {
  let html = String(content || '');
  const 기록 = [];
  for (const { 전, 후, 왜 } of 바꿀말) {
    const 수 = html.split(전).length - 1;
    if (!수) continue;
    html = html.split(전).join(후);
    기록.push({ 전, 후, 수, 왜 });
  }
  return { html, 기록 };
}

/**
 * 표에 적힌 말 말고 다른 것이 바뀌지 않았나.
 *
 * 기대값을 계산해서 견준다 — 글자 수로 세면 '이번 주'→'이번 대회' 처럼
 * 길이가 늘어나는 항목에서 어긋난다.
 */
export function 표에적힌것만바뀌었나(before, after) {
  let 기대 = String(before || '');
  for (const { 전, 후 } of 바꿀말) 기대 = 기대.split(전).join(후);
  return 기대 === String(after || '');
}

/**
 * 구조화 데이터(JSON-LD)가 여전히 읽히나.
 *
 * 안세영 글(9247)처럼 본문 문장이 FAQPage 안에 그대로 복사된 글이 있다.
 * 같은 치환이면 JSON 은 유효하게 남지만, 확인하지 않고 700편을 보내지는
 * 않는다. 하나라도 깨지면 그 글은 저장하지 않는다.
 */
export function JSON이살아있나(html) {
  const 덩어리 = String(html || '').matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of 덩어리) {
    try { JSON.parse(m[1].trim()); } catch { return false; }
  }
  return true;
}

/** 글 하나를 고친다. */
export async function 한편(postId, { apply = false } = {}) {
  const { data } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const title = data?.title?.raw ?? data?.title?.rendered ?? '';
  const content = data?.content?.raw ?? data?.content?.rendered ?? '';
  const 결과 = { id: postId, title };

  if (!손대도되는글인가(data?.link, wpConfig().base)) {
    return { ...결과, skip: 'wiki 밖의 글입니다 — 건드리지 않습니다' };
  }

  const { html, 기록 } = 고친것(content);
  if (!기록.length) return { ...결과, skip: '바꿀 말이 없습니다' };
  if (!표에적힌것만바뀌었나(content, html)) {
    throw new Error('표에 적힌 것 말고 다른 것이 바뀌었습니다 — 저장하지 않습니다');
  }
  if (!JSON이살아있나(html)) {
    return { ...결과, 기록, skip: '구조화 데이터가 깨집니다 — 저장하지 않습니다' };
  }

  let backup = '';
  if (apply) {
    backup = saveContentBackup({ id: postId, status: data?.status, title, slug: data?.slug, content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: html } });
  }
  return { ...결과, 기록, backup, applied: apply };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const 고른글 = args.filter((a) => /^\d+$/.test(a));

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🕒 읽는 시점에 흔들리는 말 걷어내기 ${apply ? '(실제 적용)' : '(미리보기 · 비용 0원)'}`);
  console.log(`   대상 사이트: ${new URL(wpConfig().base).host}  ← 여기 글만 손댑니다`);
  console.log('────────────────────────────────────────────────────────');
  console.log('\n※ 날짜를 지어내지 않습니다. 떼도 뜻이 남는 말만 걷어냅니다.');
  console.log("※ '지난해'·'올해'·'내년'·'다음 주'는 손대지 않습니다 — 바꿀 근거가 없습니다.");

  let ids = 고른글;
  if (!ids.length) {
    const 글 = await 발행글전부();
    ids = 글.map((p) => String(p.id));
    console.log(`\n발행 ${ids.length}편을 봅니다…`);
  }

  let 바뀔글 = 0; let 총곳 = 0; const 건너뜀 = [];
  for (const id of ids) {
    let r;
    try { r = await 한편(id, { apply }); }
    catch (err) { console.log(`   ❌ ${id} ${err.message}`); process.exitCode = 1; continue; }
    if (r.skip) { 건너뜀.push(`${id} ${r.skip}`); continue; }
    바뀔글 += 1;
    총곳 += r.기록.reduce((n, x) => n + x.수, 0);
    console.log(`\n   [${r.id}] ${r.title.slice(0, 55)}`);
    for (const x of r.기록) {
      const 보임 = x.후 === '' ? '(뗀다)' : `"${x.후}"`;
      console.log(`     "${x.전.trim()}" → ${보임}  ${x.수}곳 · ${x.왜}`);
    }
    if (r.backup) console.log(`     💾 원본 보관: ${r.backup}`);
    if (r.applied) console.log('     ✅ 저장했습니다');
  }

  const 깨짐 = 건너뜀.filter((s) => s.includes('구조화 데이터'));
  console.log(`\n   ▶ ${apply ? '고친' : '바뀔'} 글 ${바뀔글}편 · 모두 ${총곳}곳`);
  if (깨짐.length) console.log(`   ⚠️  구조화 데이터가 깨져 건너뛴 글 ${깨짐.length}편: ${깨짐.join(' / ')}`);

  if (!apply) {
    console.log('\n실제로 고치려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ 제목·주소(슬러그)·발행상태는 보내지 않습니다. 본문만 바뀝니다.\n');
  } else {
    console.log('\n원래 본문은 out/backup-content/ 에 있습니다.\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
