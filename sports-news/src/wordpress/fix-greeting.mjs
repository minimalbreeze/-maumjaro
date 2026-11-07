// 글 맨 앞 인사말 한 문장을 걷어낸다. AI를 부르지 않는다(0원).
//
//   node src/wordpress/fix-greeting.mjs              미리보기 (전체)
//   node src/wordpress/fix-greeting.mjs 1650 1662    글을 골라
//   node src/wordpress/fix-greeting.mjs --apply ...  실제 적용
//
// 왜 필요한가 (2026-11-07 실측)
//   `ai-cite-scan` 이 706편을 세어 보니 130편(18.4%)이 인사말로 열고 있었다.
//   config/style-warp.md ① 절이 이걸 막아 뒀다 — "인사말을 쓰지 않는다.
//   바로 이 글의 결론부터 쓴다. 이 요약이 검색결과 미리보기와 AI 답변에
//   그대로 인용되는 자리다."
//
//   ⚠️ 어제는 7편으로 나왔다. `첫문단()` 이 플러그인 블록 머리를 글로
//   읽고 있어서 **진짜 첫 문단을 못 봤다.** 그 버그를 고치니 130편이 됐다.
//   나빠진 것이 아니라 안 보이던 것이 드러난 것이다.
//
// 실제 문단을 보고 정한 것 — **첫 문장만 뗀다**
//   130편이 거의 같은 틀이었다.
//
//     1. 안녕하세요, 골프 애호가 여러분!
//     2. 오늘은 "수원CC 파3 골프장"을 소개할게요.
//     3. "수원CC 파3 이용료"나 "수원CC 파3 예약방법"으로 검색하시는 …
//
//   1번은 순수한 소음이고, **2번에 주제와 대표 키워드가 들어 있다.**
//   그래서 1번만 떼면 2번이 리드가 되고 잃는 정보가 없다. ③(대표 키워드가
//   첫 문장에)에도 같이 도움이 된다.
//
//   2번까지 떼지 않는다. 3번은 "이곳은" 처럼 앞을 받는 말로 시작하는 경우가
//   많아서, 그것을 리드로 올리면 ②(첫 문장을 떼어 읽어도 통하게)를 깬다.
//
// 떼는 기준을 좁게 잡는다
//   **'안녕하세요'·'반갑습니다' 로 시작하는 문장만** 뗀다. `ai-cite-scan` 의
//   인사말 판정에는 '오늘은'·'여러분' 도 들어 있는데, "오늘은 ○○를
//   소개할게요" 는 **주제를 말하는 문장**이라 떼면 글이 뜬금없이 시작한다.
//   세는 기준과 고치는 기준을 일부러 다르게 둔다.
//
//   그리고 그 문장이 **문단의 유일한 문장이면 떼지 않는다.** 빈 문단이 남는다.

import { wpFetch, wpConfig } from './client.mjs';
import { 발행글전부 } from './index-audit.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { saveContentBackup } from './fix-alt.mjs';

/** 인사말 문장. 좁게 잡는다 — 이 둘로 시작할 때만 뗀다. */
export const 인사말시작 = /^\s*(안녕하세요|반갑습니다)/;

/** 글의 본문 문단 블록 중 **첫 번째**를 찾는다. 광고·배너·이미지는 건너뛴다. */
export function 첫문단블록(content) {
  const s = String(content || '');
  const re = /<!--\s*wp:paragraph[^>]*-->([\s\S]*?)<!--\s*\/wp:paragraph\s*-->/g;
  let m;
  while ((m = re.exec(s))) {
    const 속 = m[1];
    if (/coupang|cpst|adsbygoogle|<a\s|<img\s/i.test(속)) continue;
    const 글자 = 속.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (글자.length < 10) continue;
    return { 전체: m[0], 속, 시작: m.index, 끝: m.index + m[0].length };
  }
  return null;
}

/**
 * 문단 속에서 인사말 한 문장을 뗀 결과. 뗄 것이 없으면 null.
 *
 * `<p>` 안의 글자만 손댄다 — 태그를 다시 쓰지 않는다.
 */
export function 인사말뗀문단(속) {
  const m = String(속 || '').match(/(<p[^>]*>)([\s\S]*?)(<\/p>)/);
  if (!m) return null;
  const [, 열기, 안, 닫기] = m;
  if (!인사말시작.test(안)) return null;
  // 첫 문장 끝까지 자른다. 마침표·물음표·느낌표 중 먼저 오는 것.
  const 끝 = 안.search(/[.!?]/);
  if (끝 < 0) return null;
  const 남은것 = 안.slice(끝 + 1).replace(/^\s+/, '');
  // 문단에 남는 글자가 없으면 떼지 않는다 — 빈 문단을 만들지 않는다.
  if (남은것.replace(/<[^>]+>/g, '').trim().length < 10) return null;
  return {
    뗀문장: 안.slice(0, 끝 + 1).replace(/<[^>]+>/g, '').trim(),
    새속: String(속).replace(m[0], `${열기}${남은것}${닫기}`),
  };
}

/** 본문을 고친다. 뗄 것이 없으면 null. */
export function 고친것(content) {
  const 블록 = 첫문단블록(content);
  if (!블록) return null;
  const r = 인사말뗀문단(블록.속);
  if (!r) return null;
  const s = String(content);
  const 새블록 = 블록.전체.replace(블록.속, r.새속);
  return { html: s.slice(0, 블록.시작) + 새블록 + s.slice(블록.끝), 뗀문장: r.뗀문장 };
}

/**
 * 첫 문단의 인사말 한 문장 말고 다른 것이 바뀌지 않았나.
 *
 * 기대값을 계산해 견준다 — 글자 수로 세면 태그 길이에 묻힌다.
 */
export function 인사말만뗐나(before, after) {
  const r = 고친것(before);
  return !!r && r.html === String(after || '');
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

  const r = 고친것(content);
  if (!r) return { ...결과, skip: '첫 문단에 뗄 인사말이 없습니다' };
  if (!인사말만뗐나(content, r.html)) {
    throw new Error('인사말 말고 다른 것이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = '';
  if (apply) {
    backup = saveContentBackup({ id: postId, status: data?.status, title, slug: data?.slug, content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: r.html } });
  }
  return { ...결과, 뗀문장: r.뗀문장, backup, applied: apply };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  let ids = args.filter((a) => /^\d+$/.test(a));

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🙇 글 맨 앞 인사말 걷어내기 ${apply ? '(실제 적용)' : '(미리보기 · 비용 0원)'}`);
  console.log(`   대상 사이트: ${new URL(wpConfig().base).host}  ← 여기 글만 손댑니다`);
  console.log('────────────────────────────────────────────────────────');
  console.log("\n※ **첫 문장만** 뗍니다. '오늘은 ○○를 소개할게요' 는 주제를 말하는");
  console.log('  문장이라 그대로 두고, 그것이 리드가 됩니다.');

  if (!ids.length) {
    const 글 = await 발행글전부();
    ids = 글.map((p) => String(p.id));
    console.log(`\n발행 ${ids.length}편을 봅니다…`);
  }

  let 바뀔글 = 0; let 건너뜀 = 0;
  for (const id of ids) {
    let r;
    try { r = await 한편(id, { apply }); }
    catch (err) { console.log(`   ❌ ${id} ${err.message}`); process.exitCode = 1; continue; }
    if (r.skip) { 건너뜀 += 1; continue; }
    바뀔글 += 1;
    console.log(`\n   [${r.id}] ${r.title.slice(0, 55)}`);
    console.log(`     뗀다: "${r.뗀문장}"`);
    if (r.backup) console.log(`     💾 원본 보관: ${r.backup}`);
    if (r.applied) console.log('     ✅ 저장했습니다');
  }

  console.log(`\n   ▶ ${apply ? '고친' : '바뀔'} 글 ${바뀔글}편 · 뗄 것이 없어 건너뛴 글 ${건너뜀}편`);
  if (!apply) {
    console.log('\n실제로 고치려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ 제목·주소(슬러그)·발행상태는 보내지 않습니다. 본문만 바뀝니다.\n');
  } else {
    console.log('\n원래 본문은 out/backup-content/ 에 있습니다.\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
