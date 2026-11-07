// 글 맨 앞 첫 문장을 **결론 한 줄**로 다시 쓴다. Haiku 를 부른다(웹검색 0회).
//
//   node src/wordpress/fix-lead.mjs --한번에 10          미리보기 10편
//   node src/wordpress/fix-lead.mjs 1650 --apply         글을 골라 적용
//   node src/wordpress/fix-lead.mjs --한번에 50 --apply  50편 적용
//
// 왜 필요한가 (2026-11-07 실측)
//   `ai-cite-scan` 이 708편을 세어 보니 **269편(38.0%)** 의 첫 문장에 대표
//   키워드가 없고, **103편** 이 아직 인사말·예고로 열고 있다.
//
//   그리고 ① 과 ③ 이 **같은 문장에서 만난다.** 인사말 54편을 떼 보니
//   ① 이 130 → 103 으로 27편만 줄었다. 남은 것이 이 꼴이기 때문이다.
//
//     (떼기 전) 안녕하세요, 골프 애호가 여러분! 오늘은 "수원CC 파3
//               골프장"을 소개할게요.
//     (떼고 나서) 오늘은 "수원CC 파3 골프장"을 소개할게요.
//
//   '오늘은 ○○를 소개할게요' 는 **결론이 아니라 예고**다. style-warp.md ①
//   절이 "인사말을 쓰지 않는다. 바로 이 글의 결론부터 쓴다. 이 요약이
//   검색결과 미리보기와 AI 답변에 그대로 인용되는 자리다"라고 못박았다.
//
//   그래서 이 도구는 첫 문장을 **키워드가 든 결론 한 줄**로 바꾼다.
//   ①(예고)·②(지시어로 시작)·③(키워드 없음)이 한 번에 풀린다.
//
// 비용 — 글을 새로 쓰는 것과 다르다
//   한 편 190~370원은 **웹검색이 붙은 사실 확인 + 전체 작성** 값이다
//   (sports-news/CLAUDE.md 비용 절). 이 도구는 웹검색 0회, Haiku,
//   입력은 그 글의 본문 앞부분뿐이고 출력은 한 문장이다. 끝나면 실측
//   사용량을 찍는다 — **추정값을 보고하지 않는다.**
//
// 지어내지 못하게 막는다 (이것이 이 도구의 중심이다)
//   1. 새 문장의 **숫자가 원문에 없으면 버린다.** 모델이 요금·날짜를
//      만들어 넣는 것을 이걸로 막는다.
//   2. 대표 키워드의 **낱말이 다 들어갔는지** 본다. 안 들어가면 버린다.
//   3. '안녕하세요'·'오늘은'·지시어로 시작하면 버린다 — 고치려던 것이다.
//   4. 120자를 넘으면 버린다. 리드가 길면 인용되지 않는다.
//   5. 버린 글은 **원래 문장을 그대로 둔다.** 못 고치는 것이 틀리게
//      고치는 것보다 낫다.

import { wpFetch, wpConfig } from './client.mjs';
import { 발행글전부 } from './index-audit.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { callForJson, usageSummary, MODELS } from '../ai/client.mjs';
import { 첫문단블록 } from './fix-greeting.mjs';
import { 글자만, 문장들, 첫문단, 키워드가첫문장에 } from './ai-cite-scan.mjs';

const SYSTEM = `당신은 한국어 블로그의 리드 문장을 다듬는 편집자입니다.

하는 일은 하나입니다 — 글의 **첫 문장**을 "이 글의 결론" 한 줄로 다시 씁니다.

반드시 지킬 것
- 주어진 자료에 **적혀 있는 사실만** 씁니다. 숫자·이름·날짜를 새로 만들지 않습니다.
- 주어진 대표 키워드가 문장 안에 **그 글자 그대로** 들어가야 합니다.
- "안녕하세요", "오늘은 ~를 소개할게요" 같은 인사말·예고로 쓰지 않습니다.
- "이곳은", "이 대회는", "그는" 처럼 앞을 받는 말로 시작하지 않습니다.
  이름과 숫자를 문장 안에 그대로 씁니다.
- 한 문장입니다. 120자 안으로 씁니다. 존댓말로 끝냅니다.
- 자료에 결론으로 쓸 사실이 없으면 빈 문자열을 돌려줍니다. 억지로 만들지 않습니다.`;

const SCHEMA = {
  type: 'object',
  properties: {
    lead: { type: 'string', description: '새 첫 문장. 쓸 사실이 없으면 빈 문자열.' },
    why: { type: 'string', description: '어느 사실을 썼는지 한 줄.' },
  },
  required: ['lead', 'why'],
  additionalProperties: false,
};

/** 숫자 덩어리. 새 문장의 숫자가 원문에 있는지 보는 데 쓴다. */
export function 숫자들(글) {
  return (String(글 || '').match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[,.]$/, ''));
}

const 지시어시작 = /^(이것은|이는|그는|그녀는|이번|이\s|그\s|해당|여기|이곳|위\s)/;
const 예고시작 = /^(안녕하세요|반갑습니다|오늘은|자,|여러분)/;

/**
 * 새 리드를 받아도 되나. 되면 null, 안 되면 **버리는 이유**.
 *
 * 이유를 글자로 돌려주는 이유: 미리보기에서 "왜 건너뛰었나"가 보여야
 * 모델 지시를 고칠 수 있다.
 */
export function 버릴이유({ lead, 키워드, 원문 }) {
  const s = String(lead || '').trim();
  if (!s) return '모델이 쓸 사실이 없다고 했습니다';
  if (s.length > 120) return `${s.length}자로 너무 깁니다`;
  if (문장들(s).length > 1) return '한 문장이 아닙니다';
  if (예고시작.test(s)) return '인사말·예고로 시작합니다';
  if (지시어시작.test(s)) return '앞을 받는 말로 시작합니다';
  const 낱말 = String(키워드 || '').split(/\s+/).filter(Boolean);
  const 빠진것 = 낱말.filter((w) => !s.includes(w));
  if (빠진것.length) return `대표 키워드의 "${빠진것.join(' ')}"가 빠졌습니다`;
  // 지어낸 숫자를 막는다 — 새 문장의 숫자가 원문에 다 있어야 한다.
  const 원문숫자 = new Set(숫자들(원문));
  const 새숫자 = 숫자들(s).filter((n) => !원문숫자.has(n));
  if (새숫자.length) return `원문에 없는 숫자 ${새숫자.join(', ')} 가 들어 있습니다`;
  return null;
}

/** 첫 문단의 **첫 문장만** 새 문장으로 바꾼다. */
export function 리드바꾼것(content, 새리드) {
  const 블록 = 첫문단블록(content);
  if (!블록) return null;
  const m = 블록.속.match(/(<p[^>]*>)([\s\S]*?)(<\/p>)/);
  if (!m) return null;
  const [, 열기, 안, 닫기] = m;
  const 끝 = 안.search(/[.!?]/);
  if (끝 < 0) return null;
  const 남은것 = 안.slice(끝 + 1).replace(/^\s+/, '');
  const 새안 = 남은것 ? `${새리드} ${남은것}` : 새리드;
  const 새속 = 블록.속.replace(m[0], `${열기}${새안}${닫기}`);
  const s = String(content);
  return {
    html: s.slice(0, 블록.시작) + 블록.전체.replace(블록.속, 새속) + s.slice(블록.끝),
    전: 안.slice(0, 끝 + 1).replace(/<[^>]+>/g, '').trim(),
  };
}

/** 모델에게 새 리드를 받는다. */
export async function 새리드받기({ title, 키워드, 첫문단글, 본문글 }) {
  const r = await callForJson({
    system: SYSTEM,
    prompt: `제목: ${title}
대표 키워드: ${키워드}

지금 첫 문단:
${첫문단글}

이 글에 적혀 있는 내용 (여기 있는 사실만 쓰세요):
${본문글.slice(0, 2500)}

이 글의 **첫 문장**을 결론 한 줄로 다시 써서 rewrite_lead 도구로 돌려주세요.
대표 키워드 "${키워드}"가 글자 그대로 들어가야 합니다.`,
    toolName: 'rewrite_lead',
    description: '블로그 글의 첫 문장을 결론 한 줄로 다시 씁니다.',
    schema: SCHEMA,
    maxTokens: 2000,
    effort: 'medium',
  });
  return { lead: String(r?.lead || '').trim(), why: String(r?.why || '').trim() };
}

/** 글 하나. */
export async function 한편(postId, { apply = false } = {}) {
  const { data } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const title = data?.title?.raw ?? data?.title?.rendered ?? '';
  const content = data?.content?.raw ?? data?.content?.rendered ?? '';
  const 키워드 = String(data?.meta?.rank_math_focus_keyword || '').trim();
  const 결과 = { id: postId, title };

  if (!손대도되는글인가(data?.link, wpConfig().base)) return { ...결과, skip: 'wiki 밖의 글입니다' };
  if (키워드.length < 2) return { ...결과, skip: '대표 키워드가 없습니다' };
  if (키워드가첫문장에({ focusKeyword: 키워드, content }) !== false) {
    return { ...결과, skip: '첫 문장에 이미 키워드가 있습니다' };
  }

  const 첫문단글 = 첫문단(content);
  const 본문글 = 글자만(content);
  const { lead, why } = await 새리드받기({ title, 키워드, 첫문단글, 본문글 });
  const 이유 = 버릴이유({ lead, 키워드, 원문: 본문글 });
  if (이유) return { ...결과, 키워드, lead, skip: 이유 };

  const r = 리드바꾼것(content, lead);
  if (!r) return { ...결과, skip: '첫 문단을 찾지 못했습니다' };

  let backup = '';
  if (apply) {
    backup = saveContentBackup({ id: postId, status: data?.status, title, slug: data?.slug, content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: r.html } });
  }
  return { ...결과, 키워드, 전: r.전, 후: lead, why, backup, applied: apply };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const 한번에 = (() => {
    const i = args.indexOf('--한번에');
    const n = i >= 0 ? Number(args[i + 1]) : 10;
    return Number.isFinite(n) && n > 0 ? n : 10;
  })();
  let ids = args.filter((a) => /^\d+$/.test(a));

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`✍️  첫 문장을 결론 한 줄로 ${apply ? '(실제 적용)' : '(미리보기)'}`);
  console.log(`   대상 사이트: ${new URL(wpConfig().base).host}  ← 여기 글만 손댑니다`);
  console.log(`   모델: ${MODELS.seo} · 웹검색 0회`);
  console.log('────────────────────────────────────────────────────────');
  console.log('\n※ 원문에 없는 숫자가 들어오면 버립니다. 못 고치는 것이 틀리게');
  console.log('  고치는 것보다 낫습니다.');

  if (!ids.length) {
    const 글 = await 발행글전부();
    const 후보 = 글.filter((p) => String(p.focusKeyword || '').trim().length >= 2);
    ids = 후보.map((p) => String(p.id)).slice(0, 한번에);
    console.log(`\n발행 ${글.length}편 중 대표 키워드가 있는 ${후보.length}편 · 이번에 ${ids.length}편만 봅니다`);
  }

  let 바뀔글 = 0; const 버린것 = [];
  for (const id of ids) {
    let r;
    try { r = await 한편(id, { apply }); }
    catch (err) { console.log(`   ❌ ${id} ${err.message}`); process.exitCode = 1; continue; }
    if (r.skip) {
      if (!/이미 키워드가 있습니다|대표 키워드가 없습니다|wiki 밖/.test(r.skip)) {
        버린것.push(`${r.id} — ${r.skip}${r.lead ? ` (받은 문장: "${r.lead}")` : ''}`);
      }
      continue;
    }
    바뀔글 += 1;
    console.log(`\n   [${r.id}] ${r.title.slice(0, 50)}`);
    console.log(`     키워드: ${r.키워드}`);
    console.log(`     전: ${r.전}`);
    console.log(`     후: ${r.후}`);
    console.log(`     근거: ${r.why}`);
    if (r.backup) console.log(`     💾 원본 보관: ${r.backup}`);
    if (r.applied) console.log('     ✅ 저장했습니다');
  }

  if (버린것.length) {
    console.log(`\n   ⚠️  받았지만 버린 글 ${버린것.length}편 (원래 문장을 그대로 뒀습니다):`);
    for (const one of 버린것) console.log(`     · ${one}`);
  }

  console.log(`\n   ▶ ${apply ? '고친' : '바뀔'} 글 ${바뀔글}편`);
  console.log('\n   실제 사용량 (추정이 아닙니다):');
  for (const u of usageSummary()) {
    console.log(`     ${u.model} · 호출 ${u.calls}회 · 입력 ${u.input.toLocaleString()} · 출력 ${u.output.toLocaleString()} · 웹검색 ${u.searches}회`);
  }
  if (!apply) console.log('\n실제로 고치려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.\n');
  else console.log('\n원래 본문은 out/backup-content/ 에 있습니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
