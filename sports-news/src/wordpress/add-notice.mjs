// 이미 올린 글 맨 위에 "올해 글로 가는 안내 한 줄"을 넣는다. AI를 부르지
// 않으므로 0원이다. 설계 배경은 add-notice.jsonc.md 에 적어 두었다.
//
// 왜 필요한가
//   시즌·연도가 바뀌면 작년 글과 올해 글이 같은 검색어로 경쟁한다. 작년 글은
//   이미 색인이 붙어 노출을 받는데, 들어온 사람이 찾는 건 올해 날짜다.
//   날짜가 안 맞으면 그냥 나간다 — 노출은 받고 클릭은 버리는 상태다.
//   작년 글을 지우면 그 순위를 통째로 버리게 되므로, 지우지 않고 맨 위에
//   올해 글로 가는 한 줄을 넣어 들어온 사람을 흘려보낸다.
//
//   2026-10-13 에 2878(2025 서울세계불꽃축제)에서 같은 모양을 봤다. 제목에서
//   연도만 떼면 주소(2025-서울세계불꽃축제)와 본문은 작년 그대로라 미스매치가
//   더 커진다. 이 도구가 그 대신 쓰는 경로다.
//
// 안전선 (add-banner.mjs 와 같다)
//   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
//   - 안내 블록 말고 다른 글자가 바뀌면 저장하지 않는다.
//   - 두 번 돌려도 안내가 둘이 되지 않는다. 같은 모양이면 보내지도 않는다.
//   - 고치기 전 원본 본문을 파일로 남긴다.
//   - 링크는 현재 창에서 연다(target 을 쓰지 않는다). 내 블로그 안으로 가는
//     링크라 nofollow 를 붙이지 않는다.

import { wpFetch } from './client.mjs';
// 백업은 이미 있는 것을 쓴다. 되돌리는 방법이 두 벌이면 한쪽만 고쳐진다.
import { saveContentBackup } from './fix-alt.mjs';

/** 안내 블록을 찾아내는 표식. 사람 눈에는 안 보이고 코드만 읽는다. */
export const NOTICE_MARK = 'maumjaro:notice';

const 열기 = `<!-- ${NOTICE_MARK} -->`;
const 닫기 = `<!-- /${NOTICE_MARK} -->`;

/** HTML 로 들어가면 안 되는 글자를 막는다. 안내 문구는 운영자가 손으로 적는다. */
function 안전하게(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 넣을 안내 블록 하나를 만든다.
 *
 * 워드프레스 블록 주석(`<!-- wp:paragraph -->`)으로 감싼다 — 블록 편집기가
 * 모르는 HTML 을 "클래식 블록"으로 떨어뜨리면 나중에 손으로 고치기 어렵다.
 */
export function noticeHtml({ text, url }) {
  const t = String(text ?? '').trim();
  const u = String(url ?? '').trim();
  if (!t || !u) return '';
  // 바깥 사이트로 보내는 안내가 아니다. 내 블로그 안의 올해 글로 보낸다.
  if (!/^https?:\/\//i.test(u)) return '';
  return [
    열기,
    '<!-- wp:paragraph -->',
    `<p>📅 <a href="${안전하게(u)}">${안전하게(t)}</a> ›</p>`,
    '<!-- /wp:paragraph -->',
    닫기,
  ].join('\n');
}

/** 지금 본문에 들어 있는 안내 블록을 통째로 집어낸다. 없으면 null. */
export function findNotice(html) {
  const s = String(html ?? '');
  const a = s.indexOf(열기);
  if (a < 0) return null;
  const b = s.indexOf(닫기, a);
  if (b < 0) return null;
  const 블록 = s.slice(a, b + 닫기.length);
  const m = /href="([^"]*)"/.exec(블록);
  return { 블록, start: a, end: b + 닫기.length, url: m ? m[1] : '' };
}

/** 안내 블록을 뺀 나머지 본문. "안내 말고 안 바뀌었나" 를 이것으로 본다. */
export function withoutNotice(html) {
  const found = findNotice(html);
  if (!found) return String(html ?? '');
  const s = String(html);
  // 블록을 빼면 그 자리에 빈 줄이 남는다. 앞뒤 줄바꿈까지 같이 떼서
  // 넣기 전/후의 나머지 본문이 글자 하나까지 같아지게 만든다.
  return (s.slice(0, found.start) + s.slice(found.end)).replace(/^\s+/, '');
}

/**
 * 본문 맨 위에 안내를 놓는다. 이미 안내가 있으면 그 자리를 갈아낀다 —
 * 문구나 주소가 바뀔 때 두 줄이 되지 않게 한다.
 */
export function applyNotice(html, block) {
  const s = String(html ?? '');
  if (!block) return { html: s, 한일: null };
  const found = findNotice(s);
  if (found) {
    return { html: s.slice(0, found.start) + block + s.slice(found.end), 한일: '갈아끼움' };
  }
  return { html: `${block}\n\n${s}`, 한일: '넣음' };
}

/** 안내 블록 말고는 본문이 그대로인지 본다. 저장 전 마지막 방어선이다. */
export function noticeOnlyChange(before, after) {
  return withoutNotice(before).trim() === withoutNotice(after).trim();
}

/**
 * 글 하나에 안내를 넣는다.
 *
 * apply 가 false 면 무엇이 바뀌는지만 알려주고 저장하지 않는다(미리보기).
 */
/**
 * 안내가 가리킬 글의 실제 주소를 워드프레스에서 받아온다.
 *
 * 주소를 손으로 적으면 오타 하나에 독자가 404 를 본다. 글 번호를 주면
 * 워드프레스가 돌려주는 link 를 그대로 쓴다 — 코드가 주소를 만들어내지 않는다.
 * 문구를 안 적었으면 그 글의 제목을 그대로 쓴다.
 */
export async function 가리킬곳(toId) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${toId}`, { query: { context: 'edit' } });
  const url = post?.link || '';
  const title = post?.title?.raw || post?.title?.rendered || '';
  if (!url) throw new Error(`${toId}번 글의 주소를 받지 못했습니다`);
  return { url, title, status: post?.status };
}

export async function addNoticeToPost(postId, { text, url, apply = false } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const content = post?.content?.raw ?? post?.content?.rendered ?? '';
  const title = post?.title?.raw || post?.title?.rendered || '';
  const base = { id: postId, title, status: post?.status, changed: false, backup: null };

  const block = noticeHtml({ text, url });
  if (!block) {
    return { ...base, skip: '안내 문구(--text)와 주소(--url)가 둘 다 있어야 하고, 주소는 http(s) 로 시작해야 합니다' };
  }

  const { html, 한일 } = applyNotice(content, block);
  // 글자 하나까지 같으면 보내지 않는다. 두 번 돌려도 안전하다.
  if (html === content) {
    return { ...base, text, url, skip: '같은 안내가 이미 지금 모양으로 들어 있습니다' };
  }
  if (!noticeOnlyChange(content, html)) {
    throw new Error('안내 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = null;
  if (apply) {
    backup = saveContentBackup({ id: postId, status: post?.status, title: post?.title, slug: post?.slug, content: post?.content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: html }, timeoutMs: 45000 });
  }
  return { ...base, text, url, 한일, changed: true, backup, 미리보기: !apply };
}

function 값(args, 이름) {
  const p = `--${이름}=`;
  const hit = args.find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : '';
}

async function main() {
  const args = process.argv.slice(2);
  // 적용은 명시해야 한다. 아무 플래그 없이 돌리면 미리보기다.
  const apply = args.includes('--apply') && !args.includes('--dry-run');
  let text = 값(args, 'text');
  let url = 값(args, 'url');
  const to = 값(args, 'to');

  // --to=글번호 를 주면 그 글의 실제 주소를 워드프레스에서 받아 쓴다.
  if (to) {
    const 대상 = await 가리킬곳(to);
    url = 대상.url;
    if (!text) text = `${대상.title} 보러가기`;
    console.log(`\n→ 가리킬 글 [${to}] ${대상.status} · ${대상.title}`);
    console.log(`   ${url}`);
    if (대상.status !== 'publish') {
      console.log('   ⚠️ 발행된 글이 아닙니다. 독자가 못 봅니다 — 발행 뒤에 다시 돌리세요.');
    }
  }
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  if (!ids.length) {
    console.error('글 번호를 적어주세요. 예: node src/wordpress/add-notice.mjs 481 --to=1538 --apply');
    process.exit(1);
  }

  for (const id of ids) {
    try {
      const r = await addNoticeToPost(id, { text, url, apply });
      console.log(`\n[${r.id}] ${r.status} · ${r.title}`);
      if (r.skip) { console.log(`   건너뜀 — ${r.skip}`); continue; }
      console.log(`   안내 ${r.한일}: 📅 ${r.text} › → ${r.url}`);
      console.log(r.미리보기 ? '   (미리보기입니다. 저장하지 않았습니다 — 적용하려면 --apply)' : `   저장 완료. 원본 백업: ${r.backup}`);
    } catch (err) {
      console.error(`\n[${id}] 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
