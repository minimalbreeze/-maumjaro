// 임시글을 발행한다. **사람이 글을 보고 지목했을 때만 쓴다.**
//
//   node src/wordpress/publish-post.mjs 16574 16577            무엇이 발행되는지 보여준다 (기본)
//   node src/wordpress/publish-post.mjs 16574 16577 --apply    실제로 발행한다
//
// 왜 이 도구가 있나 — 그리고 원칙을 어기는 게 아닌 이유
//   안전선에 "워드프레스에는 **임시글(draft)로만** 저장한다. 자동 발행하지
//   않는다" 가 있다. 그 말의 뜻은 **파이프라인이 글을 쓰고 바로 올리지
//   않는다**는 것이다 — 사람이 읽기 전에 세상에 나가는 길을 막는 것이고,
//   그 판단은 지금도 맞다. 글 쓰는 도구들은 그대로 `status: 'draft'` 만 보낸다.
//
//   이 도구는 반대쪽이다. 2026-11-09 효성님이 임시글 둘(16574·16577)을 두고
//   **"발행해"** 라고 했다. 사람이 글을 보고 번호를 지목한 발행은 자동
//   발행이 아니다. 그래서 길을 열되, **지목 없이는 아무것도 못 하게** 만들었다.
//
// 지키는 선
//   - **미리보기가 기본이다.** --apply 가 없으면 아무것도 보내지 않는다.
//   - **글 번호를 적어야 돈다.** `전체`·`all` 같은 길은 만들지 않았다.
//     한 번에 5편까지만 받는다 — 발행은 되돌릴 수 없고, 되돌릴 수 없는 일에
//     "전부" 를 주면 손이 미끄러지는 순간이 곧 사고다.
//   - **지금 임시글인 것만 발행한다.** 이미 발행된 글은 손대지 않는다
//     (2026-11-03 에 그 사이 발행된 글을 지우려 한 일이 있었다 — 허락은
//     그때의 사실 위에서 받은 것이다).
//   - **`status` 하나만 보낸다.** 제목·본문·슬러그·메타는 보내지 않는다.
//     주소가 바뀌면 색인이 끊긴다.
//   - **발행 전 글을 통째로 파일에 남긴다.** 되돌릴 때 쓴다.
//   - wiki 밖의 글은 건너뛴다.
//
// ⚠️ 발행한 뒤에 **글끼리 링크를 걸어야 한다.** 구글은 링크로 페이지를 찾으므로
//    (CLAUDE.md ② 절) 가리키는 글이 없으면 사이트맵에 있어도 안 찾는다.
//    발행 633편 중 구글이 아는 것이 156편뿐이었던 이유가 그것이다.
//    이 도구는 마지막에 그 안내를 찍는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wpFetch, wpConfig } from './client.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 한 번에 받는 글 수의 상한. 되돌릴 수 없는 일이라 좁게 둔다. */
export const 한번에최대 = 5;

/** 발행해도 되는 상태. `publish` 는 이미 나간 글이라 들어 있지 않다. */
export const 발행할수있는상태 = ['draft', 'pending', 'future'];

export function 발행할수있나(status) {
  return 발행할수있는상태.includes(String(status || ''));
}

/** 발행할 글의 현재 상태를 통째로 받는다(본문 포함). */
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

/** 되돌릴 수 있도록 글 전체를 남긴다. */
export function 백업하기(글) {
  const dir = path.join(ROOT, 'out', 'backup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `before-publish-${글?.id}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(글, null, 2) + '\n', 'utf8');
  return file;
}

/**
 * 발행 전에 눈으로 봐야 할 것들. **막지는 않고 찍는다.**
 *
 * 빈 메타 설명이나 빈 대표 키워드는 글이 나간 뒤에도 고칠 수 있지만
 * (`메타 설명 채우기` 모드), 나가기 전에 아는 게 싸다.
 */
export function 발행전점검(글) {
  const 할말 = [];
  const m = 글?.meta || {};
  if (!String(글?.title || '').trim()) 할말.push('제목이 비어 있습니다');
  if (!String(글?.content || '').trim()) 할말.push('본문이 비어 있습니다');
  if (!String(m.rank_math_description || '').trim()) 할말.push('메타 설명이 비어 있습니다');
  if (!String(m.rank_math_focus_keyword || '').trim()) 할말.push('대표 키워드가 비어 있습니다');
  if (m.maumjaro_google_noindex === '1') 할말.push('구글 색인 제외 깃발이 켜져 있습니다');
  return 할말;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const 번호들 = [...new Set(args.filter((a) => /^\d+$/.test(a)).map(Number))];

  console.log('');
  console.log(`📰 임시글을 발행합니다${apply ? '' : ' (미리보기 — 아무것도 바꾸지 않습니다)'}`);

  if (!번호들.length) {
    console.error('발행할 글 번호를 적어주세요. 예: node src/wordpress/publish-post.mjs 16574 16577');
    console.error('※ 번호를 지목하지 않으면 아무것도 하지 않습니다. 전체 발행하는 길은 없습니다.');
    process.exitCode = 1;
    return;
  }
  if (번호들.length > 한번에최대) {
    console.error(`한 번에 ${한번에최대}편까지만 받습니다 (받은 것: ${번호들.length}편).`);
    console.error('발행은 되돌릴 수 없습니다. 나누어 돌려주세요.');
    process.exitCode = 1;
    return;
  }

  const { base } = wpConfig();
  console.log(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);

  const 발행한것 = [];
  for (const 번호 of 번호들) {
    let 글;
    try {
      글 = await 글받기(번호);
    } catch (err) {
      console.error(`[${번호}] 받지 못했습니다 — ${err?.message || err}`);
      process.exitCode = 1;
      continue;
    }
    if (!글.id) {
      console.error(`[${번호}] 글을 찾지 못했습니다.`);
      process.exitCode = 1;
      continue;
    }
    if (!손대도되는글인가(글.link, base)) {
      console.log(`[${번호}] 건너뜀 — wiki 밖의 글입니다`);
      continue;
    }

    console.log('');
    console.log('────────────────────────────────────────────────────────');
    console.log(`[${글.id}] ${글.status} · ${글.title}`);
    console.log(`주소: ${글.link || `(${글.slug})`}`);
    console.log(`본문 ${글.content.length.toLocaleString()}자(태그 포함)`);
    const m = 글.meta || {};
    if (m.rank_math_focus_keyword) console.log(`대표 키워드: ${m.rank_math_focus_keyword}`);
    if (m.rank_math_description) console.log(`메타 설명: ${String(m.rank_math_description).slice(0, 90)}`);
    console.log('────────────────────────────────────────────────────────');

    if (!발행할수있나(글.status)) {
      console.log(`⏭  이미 ${글.status} 입니다. 아무것도 하지 않았습니다.`);
      continue;
    }

    const 할말 = 발행전점검(글);
    for (const s of 할말) console.log(`⚠️  ${s}`);

    if (!apply) {
      console.log('→ 발행 대상입니다. 실제로 발행하려면 --apply 를 붙이세요.');
      continue;
    }

    const 백업 = 백업하기(글);
    console.log(`   백업: ${백업}`);

    // status 하나만 보낸다. 제목·본문·슬러그·메타는 보내지 않는다.
    const { data } = await wpFetch(`/wp/v2/posts/${번호}`, {
      method: 'POST',
      body: { status: 'publish' },
      timeoutMs: 45000,
    });
    const 된상태 = data?.status || '';
    if (된상태 !== 'publish') {
      console.error(`⚠️  응답의 상태가 publish 가 아닙니다: ${된상태 || '(없음)'}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`✅ 발행했습니다 — ${data?.link || 글.link}`);
    발행한것.push({ id: 번호, link: data?.link || 글.link });
  }

  if (apply && 발행한것.length) {
    console.log('');
    console.log(`📌 ${발행한것.length}편을 발행했습니다. 다음에 할 것:`);
    console.log('   1) **글끼리 링크 걸기** — 구글은 링크로 페이지를 찾습니다.');
    console.log('      가리키는 글이 없으면 사이트맵에 있어도 안 찾습니다(CLAUDE.md ② 절).');
    console.log('   2) 네이버 수집 요청 — 주소를 `네이버수집요청.md` 에 더해 두세요.');
    for (const g of 발행한것) console.log(`      ${g.link}`);
  }
}

const 직접실행 = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (직접실행) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exitCode = 1;
  });
}
