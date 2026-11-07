// 자주 묻는 질문 절이 없는 글에 그 절을 만들어 넣는다. Haiku 를 부른다(웹검색 0회).
//
//   node src/wordpress/add-faq.mjs --한번에 10          미리보기 10편
//   node src/wordpress/add-faq.mjs 1650 --apply         글을 골라 적용
//
// 왜 필요한가 (2026-11-07 실측)
//   708편 중 **631편(89.1%)** 에 자주 묻는 질문 절이 없다. style-warp.md ⑨
//   절이 "이 섹션은 AI 가 인용하기 가장 좋은 형태이고, 질문형 검색어를 잡는
//   자리"라고 적어 뒀는데, 사이트의 거의 전부가 그 자리를 비워 두고 있다.
//
//   ⑤(질문이 4개 이상)는 4편뿐이다. **있는 글은 제대로 넣었고 문제는
//   "아예 없다"는 쪽**이다.
//
// 가장 큰 위험은 비용이 아니라 **똑같은 질문 631벌**이다
//   볼링 글 13편의 제목이 전부 "… 총정리!" 로 같아서 검색엔진이 개별 글을
//   못 고르고 카테고리 페이지를 띄웠다. 631편에 같은 질문을 복사해 넣으면
//   같은 일이 더 큰 규모로 난다. 그래서 질문을 **그 글의 사실에서** 뽑고,
//   앞서 만든 질문 묶음과 겹치면 **버린다.**
//
// 지어내지 못하게 막는다
//   1. 답의 **숫자가 본문에 없으면 버린다.** 날짜·요금·기록을 만들어
//      넣는 것을 이걸로 막는다.
//   2. 질문 4~5개가 아니면 버린다(style-warp ⑨ 가 정한 수).
//   3. 질문 중 하나에는 대표 키워드 낱말이 들어가야 한다.
//   4. 앞선 글과 질문 묶음이 같으면 버린다.
//   5. 모델이 빈 목록을 주면 버린다 — 쓸 사실이 없다고 한 것이다.
//   6. 버린 글은 **그대로 둔다.** 못 넣는 것이 틀리게 넣는 것보다 낫다.
//
// 본문과 구조화 데이터가 어긋나지 않게
//   질문·답을 마크다운으로 한 번만 만들고, 본문 블록은 markdownToBlocks 로,
//   JSON-LD 는 faqSchemaBlock 으로 **같은 글자에서** 만든다. 두 벌로 쓰지
//   않는다 — 다르면 구글이 스팸으로 본다(지시서).

import { wpFetch, wpConfig } from './client.mjs';
import { 발행글전부 } from './index-audit.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { callForJson, usageSummary, MODELS } from '../ai/client.mjs';
import { faqSchemaBlock } from '../seo/faq-schema.mjs';
import { markdownToBlocks } from './draft.mjs';
import { 글자만, 질문절 } from './ai-cite-scan.mjs';
import { 숫자들 } from './fix-lead.mjs';
import { 숫자옵션, 글번호들 } from './args.mjs';

const SYSTEM = `당신은 한국어 블로그의 "자주 묻는 질문" 절을 만드는 편집자입니다.

반드시 지킬 것
- **주어진 본문에 적혀 있는 사실만** 답으로 씁니다. 숫자·날짜·이름·금액을
  새로 만들지 않습니다. 본문에 없으면 그 질문을 아예 넣지 않습니다.
- 질문은 사람이 검색창에 칠 법한 말로 씁니다. 대회명·시설명·선수명을
  질문 안에 그대로 넣습니다.
- 답은 **첫 문장에서 곧바로 답합니다.** 뜸 들이지 않습니다.
  ("언제 열리나요?" → "2026년 10월 3일부터 5일까지 열립니다.")
- 답은 1~3문장, 존댓말입니다.
- 질문 4~5개를 만듭니다. 본문에 답할 수 있는 것이 4개가 안 되면
  **빈 목록을 돌려줍니다.** 억지로 채우지 않습니다.
- 이 글에만 해당하는 질문을 씁니다. 어느 글에나 쓸 수 있는 일반적인
  질문("이 대회는 재미있나요?")은 쓰지 않습니다.`;

const SCHEMA = {
  type: 'object',
  properties: {
    faqs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string', description: '질문. 물음표로 끝냅니다.' },
          a: { type: 'string', description: '답. 첫 문장에서 곧바로 답합니다.' },
        },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
    why: { type: 'string', description: '본문의 어느 대목을 썼는지 한 줄.' },
  },
  required: ['faqs', 'why'],
  additionalProperties: false,
};

/** 질문 묶음을 비교할 열쇠. 질문만 보고 답은 보지 않는다. */
export function 묶음열쇠(faqs) {
  return (faqs || []).map((f) => String(f.q || '').replace(/\s+/g, '').replace(/[?？]/g, '')).sort().join('|');
}

/** 받아도 되나. 되면 null, 안 되면 버리는 이유. */
export function 버릴이유({ faqs, 키워드, 본문글, 이미쓴열쇠 = new Set() }) {
  const 목록 = Array.isArray(faqs) ? faqs : [];
  if (!목록.length) return '모델이 답할 사실이 없다고 했습니다';
  if (목록.length < 4 || 목록.length > 5) return `질문이 ${목록.length}개입니다 (4~5개여야 합니다)`;
  for (const f of 목록) {
    const q = String(f.q || '').trim();
    const a = String(f.a || '').trim();
    if (q.length < 6 || !/[?？]$/.test(q)) return `질문 꼴이 아닙니다: "${q}"`;
    // 6자로 둔다. "9홀입니다." 는 짧지만 **옳은 답**이라 버릴 것이 아니다.
    // 2026-11-07 에 10자로 뒀더니 그 답 하나 때문에 묶음 전체가 버려졌다.
    // 진짜 방패는 아래 숫자 검사다.
    if (a.length < 6) return `답이 너무 짧습니다: "${q}"`;
    // 지어낸 숫자를 막는다 — 답의 숫자가 본문에 다 있어야 한다.
    const 본문숫자 = new Set(숫자들(본문글));
    const 새숫자 = 숫자들(a).filter((n) => !본문숫자.has(n));
    if (새숫자.length) return `본문에 없는 숫자 ${새숫자.join(', ')} ("${q}")`;
  }
  const 낱말 = String(키워드 || '').split(/\s+/).filter(Boolean);
  if (낱말.length && !목록.some((f) => 낱말.every((w) => String(f.q).includes(w)))) {
    return `질문 어디에도 대표 키워드 "${키워드}"가 없습니다`;
  }
  if (이미쓴열쇠.has(묶음열쇠(목록))) return '앞선 글과 질문 묶음이 같습니다';
  return null;
}

/** 질문·답을 마크다운 한 벌로 만든다. 본문과 JSON-LD 가 여기서 갈린다. */
export function 마크다운(faqs) {
  const 줄 = ['## ❓ 자주 묻는 질문', ''];
  for (const f of faqs) {
    줄.push(`**Q. ${String(f.q).trim()}**`, '', String(f.a).trim(), '');
  }
  return 줄.join('\n').trimEnd();
}

/** 마지막 소제목 **앞에** 넣는다 — ⑨ 가 ⑩ 보다 앞이라는 양식에 맞춘다. */
export function 넣은것(content, md) {
  const s = String(content || '');
  const 본문블록 = markdownToBlocks(md);
  const 스키마 = faqSchemaBlock(md);
  const 덩어리 = 스키마 ? `${본문블록}\n\n${스키마}` : 본문블록;

  const re = /<!--\s*wp:heading[\s\S]*?<!--\s*\/wp:heading\s*-->/g;
  let 마지막 = null; let m;
  while ((m = re.exec(s))) 마지막 = m;
  if (!마지막) return `${s.trimEnd()}\n\n${덩어리}\n`;
  return `${s.slice(0, 마지막.index).trimEnd()}\n\n${덩어리}\n\n${s.slice(마지막.index)}`;
}

/** 모델에게 질문·답을 받는다. */
export async function 질문받기({ title, 키워드, 본문글 }) {
  const r = await callForJson({
    system: SYSTEM,
    prompt: `제목: ${title}
대표 키워드: ${키워드}

본문 (여기 적힌 사실만 쓰세요):
${본문글.slice(0, 7000)}

이 글의 "자주 묻는 질문" 4~5개를 make_faq 도구로 만들어주세요.
질문 하나에는 대표 키워드 "${키워드}"가 그대로 들어가야 합니다.
본문에 답할 수 있는 것이 4개가 안 되면 빈 목록을 돌려주세요.`,
    toolName: 'make_faq',
    description: '블로그 글의 자주 묻는 질문을 본문 사실로만 만듭니다.',
    schema: SCHEMA,
    maxTokens: 4000,
    effort: 'medium',
  });
  return { faqs: Array.isArray(r?.faqs) ? r.faqs : [], why: String(r?.why || '').trim() };
}

/** 글 하나. */
export async function 한편(postId, { apply = false, 이미쓴열쇠 = new Set() } = {}) {
  const { data } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const title = data?.title?.raw ?? data?.title?.rendered ?? '';
  const content = data?.content?.raw ?? data?.content?.rendered ?? '';
  const 키워드 = String(data?.meta?.rank_math_focus_keyword || '').trim();
  const 결과 = { id: postId, title };

  if (!손대도되는글인가(data?.link, wpConfig().base)) return { ...결과, skip: 'wiki 밖의 글입니다' };
  if (질문절(content).있나) return { ...결과, skip: '자주 묻는 질문 절이 이미 있습니다' };

  const 본문글 = 글자만(content);
  const { faqs, why } = await 질문받기({ title, 키워드, 본문글 });
  const 이유 = 버릴이유({ faqs, 키워드, 본문글, 이미쓴열쇠 });
  if (이유) return { ...결과, faqs, skip: 이유 };

  const md = 마크다운(faqs);
  const html = 넣은것(content, md);

  let backup = '';
  if (apply) {
    backup = saveContentBackup({ id: postId, status: data?.status, title, slug: data?.slug, content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: html } });
  }
  return { ...결과, 키워드, faqs, why, 열쇠: 묶음열쇠(faqs), backup, applied: apply };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  // ⚠️ 글 번호를 고를 때 '--한번에' 의 값을 빼야 한다. 안 빼면 그 숫자를
  // 글 번호로 집어간다 — 2026-11-07 에 10번 글을 고치려 해서 404 가 났다.
  const 한번에 = 숫자옵션(args, '--한번에', 10);
  let ids = 글번호들(args, ['--한번에']);

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`❓ 자주 묻는 질문 절 넣기 ${apply ? '(실제 적용)' : '(미리보기)'}`);
  console.log(`   대상 사이트: ${new URL(wpConfig().base).host}  ← 여기 글만 손댑니다`);
  console.log(`   모델: ${MODELS.seo} · 웹검색 0회`);
  console.log('────────────────────────────────────────────────────────');
  console.log('\n※ 답의 숫자가 본문에 없으면 버립니다. 앞선 글과 질문 묶음이');
  console.log('  같으면 그것도 버립니다 — 똑같은 질문을 복사해 넣지 않습니다.');

  // ⚠️ 앞에서부터 N편을 고르면 안 된다 — 최근 글은 질문 절이 있어서 전부
  // 건너뛴다(fix-lead 에서 그렇게 0편이 나왔다). 넣어야 할 글을 N편 모을
  // 때까지 훑는다. 읽기는 0원이고 모델은 넣을 글에만 부른다.
  let 훑은수 = 0;
  if (!ids.length) {
    const 글 = await 발행글전부();
    ids = 글.map((p) => String(p.id));
    console.log(`\n발행 ${글.length}편을 훑어 넣을 글 ${한번에}편을 모읍니다 (읽기는 0원)`);
  }

  const 이미쓴열쇠 = new Set();
  let 넣을글 = 0; const 버린것 = [];
  for (const id of ids) {
    if (넣을글 + 버린것.length >= 한번에) break;
    훑은수 += 1;
    let r;
    try { r = await 한편(id, { apply, 이미쓴열쇠 }); }
    catch (err) { console.log(`   ❌ ${id} ${err.message}`); process.exitCode = 1; continue; }
    if (r.skip) {
      if (!/이미 있습니다|wiki 밖/.test(r.skip)) 버린것.push(`${r.id} — ${r.skip}`);
      continue;
    }
    이미쓴열쇠.add(r.열쇠);
    넣을글 += 1;
    console.log(`\n   [${r.id}] ${r.title.slice(0, 50)}`);
    console.log(`     키워드: ${r.키워드} · 근거: ${r.why}`);
    for (const f of r.faqs) {
      console.log(`     Q. ${f.q}`);
      console.log(`        ${String(f.a).slice(0, 110)}`);
    }
    if (r.backup) console.log(`     💾 원본 보관: ${r.backup}`);
    if (r.applied) console.log('     ✅ 저장했습니다');
  }

  if (버린것.length) {
    console.log(`\n   ⚠️  버린 글 ${버린것.length}편 (그대로 뒀습니다):`);
    for (const one of 버린것) console.log(`     · ${one}`);
  }

  console.log(`\n   ▶ ${apply ? '넣은' : '넣을'} 글 ${넣을글}편 · 훑은 글 ${훑은수}편`);
  console.log('\n   실제 사용량 (추정이 아닙니다):');
  for (const u of usageSummary()) {
    console.log(`     ${u.model} · 호출 ${u.calls}회 · 입력 ${u.input.toLocaleString()} · 출력 ${u.output.toLocaleString()} · 웹검색 ${u.searches}회`);
  }
  if (!apply) console.log('\n실제로 넣으려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.\n');
  else console.log('\n원래 본문은 out/backup-content/ 에 있습니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
