// 글 하나를 휴지통으로 보낸다. **사람이 고른 중복 글을 정리할 때만 쓴다.**
//
//   node src/wordpress/delete-post.mjs 1625            무엇이 지워지는지 보여준다 (기본)
//   node src/wordpress/delete-post.mjs 1625 --apply    실제로 휴지통에 넣는다
//
// 왜 이 도구가 있나
//   noindex.mjs 머리말에 "왜 삭제가 아닌가 — 삭제는 되돌릴 수 없고 링크가
//   깨진다"고 적어 두었다. 그 판단은 **수명이 끝난 글 수백 편**을 자동으로
//   고르는 자리의 이야기이고 지금도 맞다. 이 도구는 다른 자리에 쓴다 —
//   같은 시설을 다룬 글이 둘이라 구글이 어느 쪽도 올리지 않는, **사람이
//   어느 쪽을 남길지 고른** 경우다. 2026-10-19 운영자가 1625 를 지우라고
//   했다(1650 과 29문단 구조가 같은 사실상 복제본이었다).
//
// 지키는 선
//   - **미리보기가 기본이다.** --apply 가 없으면 아무것도 보내지 않는다.
//   - **휴지통으로만 보낸다.** force=true(영구 삭제)를 쓰지 않는다. 워드프레스
//     휴지통에서 되돌릴 수 있다. 이 도구에 영구 삭제 길은 만들지 않았다.
//   - **지우기 전에 본문 전체를 파일로 남긴다.** 휴지통을 비워도 글이 남는다.
//   - **지우기 전에 그 글을 가리키는 다른 글을 센다.** 지우면 그 링크들이
//     깨진 링크가 된다 — 구글은 링크로 페이지를 찾으므로(sports-news/CLAUDE.md
//     ② 절) 깨진 채로 두면 안 된다. 몇 편이 걸리는지 번호까지 찍는다.
//   - wiki 밖의 글은 건드리지 않는다.
//   - 글 번호를 적지 않으면 아무것도 하지 않는다. 한 번에 한 편만 받는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wpFetch, wpConfig } from './client.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 글 본문에 그 슬러그로 가는 링크가 들어 있는가.
 *
 * 슬러그는 글에 따라 한글 그대로 적히기도 하고 퍼센트 인코딩으로 적히기도
 * 한다(실제로 wiki 의 '같이 읽을 글' 상자는 인코딩된 쪽이다). 둘 다 본다 —
 * 한쪽만 보면 세다가 놓치고, 놓친 만큼 깨진 링크가 남는다.
 *
 * 앞에 `/` 를 붙여 찾는다. 슬러그가 다른 긴 슬러그의 꼬리인 경우를 피하려는
 * 것이다. 뒤는 `/` 나 따옴표로 끝나므로 경계도 함께 본다.
 *
 * ⚠️ 대소문자를 맞춰 놓고 본다. encodeURIComponent 는 `%EC%84%9C` 처럼 대문자로
 *    만드는데 워드프레스가 본문에 적어 둔 것은 `%ec%84%9c` 로 소문자다. 그대로
 *    비교하면 **한 편도 못 찾고 "가리키는 글 없음" 으로 끝난다** — 깨진 링크를
 *    통째로 지나치는 길이라, 검사가 이걸 먼저 잡게 해 두었다.
 */
export function 가리키나(html, slug) {
  const 본문 = String(html || '');
  const 날것 = String(slug || '').replace(/^\/+|\/+$/g, '');
  if (!날것) return false;

  const 후보 = new Set([날것]);
  try { 후보.add(encodeURIComponent(날것)); } catch { /* 그대로 둔다 */ }
  try { 후보.add(decodeURIComponent(날것)); } catch { /* 그대로 둔다 */ }

  const 낮춘본문 = 본문.toLowerCase();
  for (const s of 후보) {
    if (!s) continue;
    const 낮춘 = s.toLowerCase();
    let i = 낮춘본문.indexOf(`/${낮춘}`);
    while (i !== -1) {
      const 다음 = 낮춘본문[i + 1 + 낮춘.length];
      // 경계: 끝이거나, 다음 글자가 주소를 끝내는 글자여야 한다.
      if (다음 === undefined || '/"\'?#&> '.includes(다음)) return true;
      i = 낮춘본문.indexOf(`/${낮춘}`, i + 1);
    }
  }
  return false;
}

/** 지울 글의 현재 상태를 통째로 받는다(본문 포함). */
export async function 글받기(postId) {
  const { data } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  return {
    id: data?.id,
    status: data?.status || '',
    link: data?.link || '',
    slug: decodeURIComponent(data?.slug || ''),
    title: data?.title?.raw || data?.title?.rendered || '',
    content: data?.content?.raw || data?.content?.rendered || '',
    meta: data?.meta || {},
    categories: Array.isArray(data?.categories) ? data.categories : [],
    date: data?.date || '',
  };
}

/** 지울 글을 가리키는 발행 글들을 찾는다. 자기 자신은 세지 않는다. */
export async function 가리키는글찾기(slug, 지울번호, { perPage = 100, maxPages = 20 } = {}) {
  const 걸린것 = [];
  const 지울id = Number(지울번호);
  for (let page = 1; page <= maxPages; page += 1) {
    const { data } = await wpFetch('/wp/v2/posts', {
      query: { per_page: perPage, page, status: 'publish', context: 'edit' },
      timeoutMs: 40000,
    });
    const 목록 = Array.isArray(data) ? data : [];
    if (!목록.length) break;
    for (const p of 목록) {
      if (Number(p.id) === 지울id) continue;
      const html = p.content?.raw || p.content?.rendered || '';
      if (가리키나(html, slug)) {
        걸린것.push({
          id: p.id,
          title: p.title?.raw || p.title?.rendered || '',
        });
      }
    }
    if (목록.length < perPage) break;
  }
  return 걸린것;
}

/** 되돌릴 수 있도록 글 전체를 남긴다. 이 파일이 없으면 지우지 않는다. */
export function 백업하기(글) {
  const dir = path.join(ROOT, 'out', 'backup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `deleted-${글?.id}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(글, null, 2) + '\n', 'utf8');
  return file;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const 번호들 = args.filter((a) => /^\d+$/.test(a)).map(Number);

  if (번호들.length !== 1) {
    console.error('지울 글 번호를 하나만 적어주세요. 예: node src/wordpress/delete-post.mjs 1625');
    process.exitCode = 1;
    return;
  }
  const 번호 = 번호들[0];

  const 글 = await 글받기(번호);
  if (!글.id) {
    console.error(`글 ${번호} 을(를) 찾지 못했습니다.`);
    process.exitCode = 1;
    return;
  }

  const { base } = wpConfig();
  if (!손대도되는글인가(글.link, base)) {
    console.error(`글 ${번호} 은(는) 이 사이트의 글이 아닙니다. 건너뜁니다.`);
    process.exitCode = 1;
    return;
  }

  if (글.status === 'trash') {
    console.log(`글 ${번호} 은(는) 이미 휴지통에 있습니다. 아무것도 하지 않았습니다.`);
    return;
  }

  const 가리키는글 = await 가리키는글찾기(글.slug, 번호);

  console.log('');
  console.log('────────────────────────────────────────────────────────');
  console.log(`[${글.id}] ${글.status} · ${글.title}`);
  console.log(`주소: ${글.slug}`);
  console.log(`본문 ${글.content.length.toLocaleString()}자(태그 포함) · 발행 ${(글.date || '').slice(0, 10)}`);
  console.log('────────────────────────────────────────────────────────');

  if (가리키는글.length) {
    console.log('');
    console.log(`⚠️  이 글을 가리키는 발행 글 ${가리키는글.length}편 — 지우면 깨진 링크가 됩니다`);
    for (const g of 가리키는글) console.log(`   [${g.id}] ${g.title}`);
    console.log('');
    console.log('   구글은 링크로 페이지를 찾습니다. 지운 뒤 이 링크들을 남길 글로');
    console.log('   돌려놓거나 빼야 합니다 (글끼리 링크 다시 맞추기).');
  } else {
    console.log('');
    console.log('이 글을 가리키는 발행 글은 없습니다.');
  }

  if (!apply) {
    console.log('');
    console.log('실제로 지우려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ 휴지통으로만 보냅니다. 영구 삭제하지 않습니다.');
    return;
  }

  const 백업 = 백업하기(글);
  console.log('');
  console.log(`백업: ${백업}`);

  // force 를 주지 않는다 → 워드프레스가 휴지통으로 보낸다.
  const { data } = await wpFetch(`/wp/v2/posts/${번호}`, { method: 'DELETE' });
  const 된상태 = data?.status || data?.post?.status || '';

  if (된상태 !== 'trash') {
    console.error(`⚠️  응답의 상태가 trash 가 아닙니다: ${된상태 || '(없음)'}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ ${번호} 을(를) 휴지통으로 보냈습니다. 워드프레스에서 되돌릴 수 있습니다.`);
  if (가리키는글.length) {
    console.log(`⚠️  깨진 링크 ${가리키는글.length}편이 남아 있습니다 — 위 목록을 정리하세요.`);
  }
}

// ⚠️ endsWith('delete-post.mjs') 로 보면 안 된다 — 검사 파일 이름이
//    test/delete-post.mjs 로 **같아서**, 검사를 돌릴 때 이 main() 이 함께
//    돌고 "글 번호를 적어주세요" 로 exit 1 을 만든다(2026-10-19 에 그래서
//    워크플로가 통째로 실패했다). 경로 전체를 비교한다.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exitCode = 1;
  });
}
