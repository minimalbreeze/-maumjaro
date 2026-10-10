// 글끼리 서로 링크를 건다. 본문 끝에 "같이 읽을 글" 블록을 붙인다.
//
//   node src/wordpress/internal-links.mjs            바뀔 내용만 보여준다 (기본)
//   node src/wordpress/internal-links.mjs --apply    실제로 넣는다
//
// 왜 필요한가 (구글 문서가 직접 말한다)
//   "Google은 주로 이미 크롤링한 다른 페이지의 링크를 통해 페이지를 찾습니다."
//   "사이트맵을 제출할 수도 있습니다. 하지만 이것이 필수는 아니며..."
//     — 검색엔진 최적화(SEO) 기본 가이드
//
//   2026-10-10 기준 발행 633편인데 서치콘솔이 아는 페이지는 156편뿐이다.
//   477편(75%)은 구글이 존재를 모른다. 사이트맵에는 다 들어 있다(post-sitemap
//   1~4). 그런데도 모른다는 건, 그 글들을 가리키는 링크가 어디에도 없다는 뜻에
//   가깝다. 633편이 전부 고아 페이지다.
//
// 구글 문서를 따른 설계
//   - 앵커 텍스트는 **대상 글의 제목**을 그대로 쓴다. "여기", "관련 글" 같은
//     말을 쓰지 않는다 ("적절한 앵커 텍스트를 사용하면 사용자와 검색엔진이
//     링크된 페이지를 방문하기 전에 어떤 내용인지 쉽게 이해할 수 있습니다").
//   - 내부 링크에는 nofollow 를 붙이지 않는다. 그건 신뢰할 수 없는 **외부**
//     링크에 쓰는 것이다. 우리 글끼리는 맹목적으로 연결되길 바라는 게 맞다.
//   - target 을 쓰지 않는다 (리포 규칙).
//
// 지키는 선
//   - 본문 끝에만 붙인다. 기존 본문을 고치지 않는다.
//   - 표식을 남겨 몇 번 돌려도 하나만 생긴다. 지우기도 쉽다.
//   - 구글 색인에서 뺀 글(maumjaro_google_noindex)로는 링크하지 않는다.
//     거기로 보내봐야 구글이 안 올린다. 살아 있는 글끼리 이어야 한다.
//   - wiki 밖의 글은 건드리지 않는다.
//   - 미리보기가 기본이다.

import { 발행글전부, 글유형, 제목낱말 } from './index-audit.mjs';
import { wpFetch, wpConfig } from './client.mjs';
import { 손대도되는글인가, FLAG_KEY } from './noindex.mjs';
import { saveBackup } from './noindex.mjs';

export const LINK_SIGN = '🔗 같이 읽을 글';

/** 이 글에 이미 블록이 있나. */
export function 이미있나(html) {
  return String(html || '').includes(LINK_SIGN);
}

/** 블록을 걷어낸다. 다시 넣을 때 쓰고, 지울 때도 쓴다. */
export function 블록걷어내기(html) {
  const 글 = String(html || '');
  const at = 글.indexOf(`<!-- wp:html -->\n<aside class="maumjaro-related"`);
  if (at < 0) return 글;
  const 끝표식 = '<!-- /wp:html -->';
  const end = 글.indexOf(끝표식, at);
  if (end < 0) return 글;
  return (글.slice(0, at) + 글.slice(end + 끝표식.length)).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 두 글이 얼마나 가까운가.
 *
 * 같은 종목·같은 성격의 글끼리 이어야 사람이 실제로 따라간다. 아무 글이나
 * 이으면 링크가 아니라 소음이다.
 *
 * **처음 판은 이 경고를 스스로 어겼다 (2026-10-10, 미리보기에서 잡음).**
 * 같은 "유형"이면 그것만으로 2점을 줬더니 유형이 '기타'·'일정'인 글들이
 * 종목과 무관하게 다 이어졌다.
 *
 *   [7789] 아이폰 사진첩 정리  →  근로장려금 / KBO 관중 / 하이트진로 챔피언십
 *   [7793] 전국당구대회 일정   →  골프 대회 4개
 *
 * 그래서 **실제로 겹치는 것이 있어야** 잇는다. 둘 중 하나다 —
 * 제목 낱말이 겹치거나(같은 선수·대회·시설), 카테고리가 같거나(같은 종목).
 * 유형은 그 위에 얹는 가점으로만 쓴다.
 *
 * 점수를 안 주는 쪽을 택한 결과로 **링크를 하나도 못 받는 글이 생긴다.**
 * 그게 맞다. 엉뚱한 링크를 받는 것보다 안 받는 것이 낫다 — 독자에게도,
 * 구글이 보는 신호에도.
 */
export function 같은종목인가(a, b) {
  const A = Array.isArray(a.categories) ? a.categories : [];
  const B = Array.isArray(b.categories) ? b.categories : [];
  if (!A.length || !B.length) return false;
  return A.some((c) => B.includes(c));
}

/**
 * 겹쳐도 "같은 주제"라는 뜻이 아닌 낱말.
 *
 * 실측 사고 (2026-10-10): 아이폰 사진첩 글과 근로장려금 글이 이어졌다.
 * 겹친 낱말이 **"말고"** 하나였다. 조사·꾸밈말·흔한 수식어는 어떤 제목에나
 * 들어 있어서, 하나만 겹쳐도 통과하는 기준에서는 가짜 겹침을 만든다.
 *
 * `index-audit.mjs` 의 `제목낱말`·`닮은정도` 는 건드리지 않는다 — 중복 판정의
 * 기준값(0.55 / 0.13)이 실측으로 잡혀 있어서 낱말 목록을 바꾸면 그 숫자가
 * 전부 흔들린다. 링크를 걸 때만 여기서 한 번 더 걸러낸다.
 */
const 뜻없는낱말 = new Set([
  '말고', '하는', '하기', '주는', '받는', '보는', '되는', '있는', '없는', '같은',
  '최대', '최소', '최고', '최초', '모두', '전부', '정리', '총정리', '방법', '소식',
  '지금', '오늘', '내일', '어제', '올해', '작년', '내년', '이번', '다음', '지난',
  '그리고', '하지만', '다시', '함께', '바로', '아직', '벌써', '이제', '정말',
  '어디', '언제', '얼마', '무엇', '누가', '어떻게', '어떤', '왜냐',
  '추천', '비교', '안내', '확인', '공개', '발표', '시작', '종료', '예정',
]);

/**
 * 연도·숫자·회차만으로는 같은 주제가 아니다.
 *
 * 실측 사고 (2026-10-10): 전국당구대회 글과 KLPGA 골프 글이 이어졌다.
 * 겹친 낱말이 **"2026"** 하나였다. 그 해에 나온 글은 다 "2026"을 달고 있다.
 * 회차("제16회")도 같다 — 다른 대회의 같은 회차가 겹쳐 봐야 뜻이 없다.
 */
const 주제가아닌꼴 = /^(?:\d+(?:년|월|일|회|차|주|호|위|승|점|만원|억)?|제\d+회|\d+R|[0-9.,]+)$/;

export function 겹치는낱말수(a, b) {
  const 걸러내기 = (ws) => ws.filter((w) => !뜻없는낱말.has(w) && !주제가아닌꼴.test(w));
  const A = new Set(걸러내기(제목낱말(a.title)));
  let n = 0;
  for (const w of 걸러내기(제목낱말(b.title))) if (A.has(w)) n += 1;
  return n;
}

export function 가까운정도(a, b) {
  if (a.id === b.id) return -1;
  const 낱말 = 겹치는낱말수(a, b);
  const 같은종목 = 같은종목인가(a, b);
  // 겹치는 것이 아무것도 없으면 잇지 않는다. 0 은 이어줄글이 걸러낸다.
  if (!낱말 && !같은종목) return 0;
  let 점수 = 낱말 * 2;
  if (같은종목) 점수 += 3;
  if (글유형(a.title) === 글유형(b.title)) 점수 += 1;
  return 점수;
}

/**
 * 한 글에 이어 줄 글들을 고른다.
 *
 * 구글 색인에서 뺀 글은 후보에서 뺀다 — 거기로 보내봐야 올라가지 않는다.
 * 가까운 것부터, 모자라면 같은 유형에서 최근 글로 채운다.
 */
export function 이어줄글(post, 모든글, { 개수 = 4 } = {}) {
  const 후보 = 모든글
    .filter((p) => p.id !== post.id && !p.색인제외)
    .map((p) => ({ p, 점수: 가까운정도(post, p) }))
    .filter((x) => x.점수 > 0)
    .sort((a, b) => (b.점수 - a.점수) || (b.p.date < a.p.date ? -1 : 1))
    .slice(0, 개수)
    .map((x) => x.p);
  return 후보;
}

const 벗기기 = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 블록 HTML. 앵커 텍스트는 대상 글의 제목을 그대로 쓴다.
 *
 * 색은 리포 팔레트(딥틸 #1f5c50)를 쓴다. 화면마다 새 색을 만들지 않는다.
 */
export function 블록만들기(글들) {
  if (!글들.length) return '';
  const 줄 = 글들.map((p) =>
    `    <li style="margin:.4em 0"><a href="${벗기기(p.link)}" style="color:#1f5c50">${벗기기(p.title)}</a></li>`
  ).join('\n');
  return `<!-- wp:html -->
<aside class="maumjaro-related" style="margin:2em 0;padding:1.1em 1.3em;border-left:4px solid #2f6f5e;background:#f5faf8;border-radius:8px">
  <p style="margin:0 0 .6em;font-weight:700;color:#1f5c50">${LINK_SIGN}</p>
  <ul style="margin:0;padding-left:1.1em">
${줄}
  </ul>
</aside>
<!-- /wp:html -->`;
}

/** 본문 끝에 블록을 붙인다. 이미 있으면 갈아 끼운다. */
export function 붙이기(html, 블록) {
  const 본문 = 블록걷어내기(html);
  if (!블록) return 본문;
  return `${본문}\n\n${블록}`;
}

/**
 * 새로 만든 글 한 편에 "같이 읽을 글" 블록을 붙인다.
 *
 * 왜 작성 직후에 하나 — 구글은 링크로 페이지를 찾는다. 글을 쓸 때마다
 * 손으로 거는 것을 잊으면 또 고아 페이지가 쌓인다. 633편이 그렇게 쌓였다.
 * 그래서 **작성 파이프라인 안에서** 건다. AI 를 부르지 않으니 0원이다.
 *
 * 들어오는 링크(기존 글 → 새 글)는 여기서 걸지 않는다. 새 글은 아직
 * 임시글이라 그쪽으로 보내면 독자가 빈 주소를 만난다. 발행한 뒤
 * `글끼리 링크 걸기 --apply` 를 돌리면 양방향이 맞춰진다.
 *
 * 후보를 두 단계로 고르는 이유: 색인 제외 여부는 글마다 REST 를 한 번씩
 * 불러야 안다. 633편을 다 부르면 한 편 저장에 몇 분이 걸린다. 그래서
 * 제목으로 먼저 가까운 12편을 고르고, 그 12편만 확인한 뒤 4편을 쓴다.
 */
export async function 새글에붙이기(postId, { title, 개수 = 4 } = {}) {
  const base = wpConfig().base;
  const 모든글 = await 발행글전부();
  const 나 = { id: Number(postId), title: String(title || '') };

  const 넓게 = 이어줄글(나, 모든글, { 개수: Math.max(개수 * 3, 12) });
  for (const p of 넓게) {
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${p.id}`, {
        query: { context: 'edit', _fields: 'meta' },
      });
      p.색인제외 = data?.meta?.[FLAG_KEY] === '1';
    } catch {
      p.색인제외 = false;   // 모르면 살아 있는 것으로 본다
    }
  }
  const 이어줄 = 이어줄글(나, 넓게, { 개수 });
  if (!이어줄.length) return { 붙임: 0, 이어줄: [] };

  const { data } = await wpFetch(`/wp/v2/posts/${postId}`, {
    query: { context: 'edit', _fields: 'content,link' },
  });
  // 임시글은 link 가 비어 있을 수 있다. 그때는 우리 사이트의 글로 본다
  // (방금 이 도구가 WORDPRESS_URL 에 저장한 글이다).
  const 내주소 = data?.link || '';
  if (내주소 && !손대도되는글인가(내주소, base)) return { 붙임: 0, 이어줄: [], 건너뜀: '다른 사이트' };

  const before = data?.content?.raw || '';
  const after = 붙이기(before, 블록만들기(이어줄));
  if (after === before) return { 붙임: 0, 이어줄 };
  if (!블록만바뀌었나(before, after)) return { 붙임: 0, 이어줄, 건너뜀: '본문이 함께 바뀜' };

  await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: after } });
  return { 붙임: 이어줄.length, 이어줄 };
}

/** 블록 말고 아무것도 안 바뀌었나. 보내기 전 마지막 확인. */
export function 블록만바뀌었나(before, after) {
  return 블록걷어내기(before).trim() === 블록걷어내기(after).trim();
}

async function main() {
  const 적용 = process.argv.includes('--apply');
  const base = wpConfig().base;

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🔗 글끼리 링크 걸기 ${적용 ? '(실제 적용)' : '(미리보기 · 비용 0원)'}`);
  console.log(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);
  console.log('────────────────────────────────────────────────────────');

  const 글 = await 발행글전부();
  console.log(`\n발행 ${글.length}편`);

  // 구글 색인에서 뺀 글을 표시한다. 링크 대상에서 빼기 위해서다.
  // 한 번에 받을 수 없으므로 글마다 메타를 본다 — 미리보기에서도 정확해야 한다.
  let 제외수 = 0;
  for (const p of 글) {
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${p.id}`, {
        query: { context: 'edit', _fields: 'meta' },
      });
      p.색인제외 = data?.meta?.[FLAG_KEY] === '1';
      if (p.색인제외) 제외수 += 1;
    } catch {
      p.색인제외 = false;   // 모르면 살아 있는 것으로 본다
    }
  }
  console.log(`   구글 색인에서 뺀 글 ${제외수}편 — 링크 대상에서 제외합니다`);

  const 받을글 = 글.filter((p) => !p.색인제외);
  console.log(`   링크를 받을 수 있는 글 ${받을글.length}편`);

  let 바뀔것 = 0;
  const 할일 = [];
  for (const p of 글) {
    const 이어줄 = 이어줄글(p, 받을글);
    if (!이어줄.length) continue;
    할일.push({ post: p, 이어줄 });
    바뀔것 += 1;
  }
  console.log(`   블록을 넣을 글 ${바뀔것}편`);

  for (const { post, 이어줄 } of 할일.slice(0, 5)) {
    console.log(`\n   [${post.id}] ${post.title}`);
    for (const t of 이어줄) console.log(`      → ${t.title}`);
  }
  if (할일.length > 5) console.log(`\n   … 그 밖에 ${할일.length - 5}편 (같은 방식)`);

  if (!적용) {
    console.log('\n실제로 넣으려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ 본문 끝에 블록만 붙입니다. 기존 본문은 고치지 않습니다.\n');
    return;
  }

  const 백업 = saveBackup(할일.map(({ post }) => ({ id: post.id, title: post.title })));
  console.log(`\n대상 목록을 남겼습니다: ${백업}`);

  let 성공 = 0;
  for (const { post, 이어줄 } of 할일) {
    if (!손대도되는글인가(post.link, base)) {
      console.log(`   ⏭  ${post.id} 다른 사이트의 글이라 건너뜁니다`);
      continue;
    }
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${post.id}`, {
        query: { context: 'edit', _fields: 'content' },
      });
      const before = data?.content?.raw || '';
      const after = 붙이기(before, 블록만들기(이어줄));
      if (after === before) { console.log(`   ⏭  ${post.id} 바뀔 것이 없습니다`); continue; }
      if (!블록만바뀌었나(before, after)) {
        console.log(`   ❌ ${post.id} 블록 말고 다른 곳이 바뀝니다 — 건너뜁니다`);
        process.exitCode = 1;
        continue;
      }
      await wpFetch(`/wp/v2/posts/${post.id}`, { method: 'POST', body: { content: after } });
      성공 += 1;
      console.log(`   ✅ ${post.id} ${이어줄.length}개 링크 — ${post.title.slice(0, 36)}`);
    } catch (err) {
      console.log(`   ❌ ${post.id} 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${성공}편에 "같이 읽을 글" 블록을 넣었습니다.`);
  console.log('되돌리려면 본문에서 그 블록을 지우면 됩니다 (표식: ' + LINK_SIGN + ').\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
