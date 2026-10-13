// 글 하나의 본문을 읽기 좋게 찍는다. **아무것도 고치지 않는다.** 0원이다.
//
//   node src/wordpress/show-post.mjs 8559
//   node src/wordpress/show-post.mjs 8559 --찾기=힐리어드
//
// 왜 필요한가
//   2026-10-13 에 글 8559 의 기록이 틀린 것을 발견했다(어제 캡처가 정규시즌
//   마지막 1경기 전 시점이었다). 고치려면 본문에 그 숫자가 **정확히 어떤
//   문장으로** 적혀 있는지 알아야 한다. 찾아 바꾸기는 글자가 하나라도 다르면
//   안 걸린다.
//
//   그런데 본문을 보는 길이 없었다. '글 찾기'는 제목·주소·SEO 값까지만 보여
//   주고, 오타 도구는 표에 적힌 것만 본다. 그래서 사실을 고칠 때마다 막혔다.
//
// 지키는 선
//   - **읽기만 한다.** POST 를 보내지 않는다.
//   - wiki 밖의 글은 보지 않는다(다른 서브도메인은 건드리지 않는다는 안전선).
//   - 워드프레스 블록 주석은 걷어내고 사람이 읽는 글만 찍는다. 다만 찾아
//     바꾸기에 쓸 것이므로 **글자는 그대로 둔다** — 따옴표·공백을 다듬지 않는다.

import { wpFetch } from './client.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

/**
 * 블록 주석과 태그를 걷어내고 문단별로 나눈다.
 *
 * 글자를 다듬지 않는다. 여기서 본 문장을 그대로 오타 표에 옮겨 적을 수 있어야
 * 하기 때문이다. HTML 엔티티만 되돌린다 — 본문에 실제로 들어 있는 글자는
 * 엔티티가 아니라 그 글자다.
 */
export function 문단으로(html) {
  return String(html || '')
    // 워드프레스 블록 주석은 통째로 뺀다.
    .replace(/<!--[\s\S]*?-->/g, '\n')
    // 줄바꿈이 되는 태그는 줄바꿈으로.
    .replace(/<\/(p|h[1-6]|li|div|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // 나머지 태그는 지운다.
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 글 하나를 읽어 문단 목록으로 돌려준다. 고치지 않는다. */
export async function 본문읽기(postId) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  if (!손대도되는글인가(post)) {
    return { id: postId, skip: 'wiki 밖의 글입니다 — 보지 않습니다' };
  }
  const content = post?.content?.raw ?? post?.content?.rendered ?? '';
  return {
    id: postId,
    title: post?.title?.raw || post?.title?.rendered || '',
    status: post?.status,
    slug: post?.slug,
    문단: 문단으로(content),
    글자수: 문단으로(content).join('').replace(/\s/g, '').length,
  };
}

function 값(args, 이름) {
  const p = `--${이름}=`;
  const hit = args.find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : '';
}

async function main() {
  const args = process.argv.slice(2);
  const 찾기 = 값(args, '찾기');
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  if (!ids.length) {
    console.error('글 번호를 적어주세요. 예: node src/wordpress/show-post.mjs 8559 --찾기=힐리어드');
    process.exit(1);
  }

  for (const id of ids) {
    try {
      const r = await 본문읽기(id);
      console.log(`\n────────────────────────────────────────────────────────`);
      if (r.skip) { console.log(`[${id}] 건너뜀 — ${r.skip}`); continue; }
      console.log(`[${r.id}] ${r.status} · ${r.title}`);
      console.log(`주소: ${r.slug} · 본문 ${r.글자수.toLocaleString()}자(공백 제외) · 문단 ${r.문단.length}개`);
      if (찾기) console.log(`'${찾기}' 가 든 문단만 찍습니다`);
      console.log(`────────────────────────────────────────────────────────`);
      const 볼것 = 찾기 ? r.문단.filter((p) => p.includes(찾기)) : r.문단;
      if (!볼것.length) {
        console.log(`   '${찾기}' 가 든 문단이 없습니다.`);
        continue;
      }
      볼것.forEach((p, i) => console.log(`${String(i + 1).padStart(3)} | ${p}`));
    } catch (err) {
      console.error(`\n[${id}] 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
