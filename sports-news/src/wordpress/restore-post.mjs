#!/usr/bin/env node
/**
 * 휴지통에 보낸 글을 되살린다. (2026-11-15)
 *
 *   node src/wordpress/restore-post.mjs 23640            무엇이 되살아나는지 본다
 *   node src/wordpress/restore-post.mjs 23640 --apply    실제로 되살린다
 *
 * ── 왜 ─────────────────────────────────────────────────────
 * delete-post.mjs 는 **휴지통으로만** 보낸다(영구 삭제 길을 일부러 안 만들었다).
 * 그런데 되돌리는 길이 코드에 없어서, 운영자가 판단을 바꾸면 워드프레스
 * 관리자 화면을 직접 열어야 했다. 2026-11-15 에 실제로 그 일이 났다 —
 * 노시환 중복 글을 1번(합치고 삭제)으로 처리한 뒤 2번(각도를 갈라 둘 다
 * 남김)으로 바꿨다. 보내는 길이 있으면 되돌리는 길도 있어야 한다.
 *
 * ── 휴지통이 바꿔 놓는 것 ───────────────────────────────────
 * 워드프레스는 글을 휴지통에 넣을 때 **슬러그 끝에 `__trashed` 를 붙인다.**
 * 상태만 되돌리면 주소가 `…__trashed` 로 남아 링크가 전부 깨진다.
 * 그래서 이 도구는 **상태와 슬러그를 함께** 되돌린다.
 *
 * ── 지키는 선 ───────────────────────────────────────────────
 *   - **미리보기가 기본이다.** --apply 가 없으면 아무것도 보내지 않는다.
 *   - **임시글(draft)로 되살린다.** 발행은 사람이 한다 — 되살리는 것과
 *     다시 내보내는 것은 다른 결정이다.
 *   - **휴지통에 있는 글만** 건드린다. 다른 상태면 멈춘다.
 *   - wiki 밖의 글은 건드리지 않는다.
 *   - 본문·제목은 손대지 않는다. 상태와 슬러그만 보낸다.
 */
import { wpFetch, wpConfig } from './client.mjs';
import { log } from '../utils/logger.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

/** 휴지통이 붙인 꼬리를 뗀 슬러그. 꼬리가 없으면 그대로. */
export function 꼬리뗀슬러그(slug) {
  return String(slug || '').replace(/__trashed$/, '');
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  log.section(`♻️ 휴지통에서 되살립니다${apply ? '' : ' (미리보기 · 저장하지 않습니다)'}`);

  if (!ids.length) {
    log.warn('글 번호를 적어주세요. 예: 23640');
    process.exitCode = 1;
    return;
  }

  const base = wpConfig().base;
  let 센것 = 0;
  for (const id of ids) {
    let post;
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${id}`, {
        query: { context: 'edit', status: 'trash,draft,publish,pending,private', _fields: 'id,link,title,slug,status' },
      });
      post = data;
    } catch (err) {
      log.warn(`${id} 를 열지 못했습니다 — ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    const 제목 = String(post?.title?.raw || '').slice(0, 50);
    if (post?.status !== 'trash') {
      log.warn(`[${id}] 휴지통에 있지 않습니다 (지금 ${post?.status}) — 건너뜁니다`);
      continue;
    }
    // link 는 휴지통 글이라 비어 있을 수 있다. 그때는 사이트 주소로 판단한다.
    const 주소 = post?.link || `${base}/?p=${id}`;
    if (!손대도되는글인가(주소, base)) {
      log.warn(`${id} 는 wiki 밖의 글입니다 — 건너뜁니다`);
      continue;
    }
    const 새슬러그 = 꼬리뗀슬러그(post.slug);
    log.info(`   [${id}] ${제목}`);
    log.info(`      상태  : trash → draft`);
    if (새슬러그 !== post.slug) log.info(`      주소  : ${post.slug} → ${새슬러그}`);
    else log.info(`      주소  : ${post.slug} (그대로)`);
    센것 += 1;
    if (!apply) continue;
    await wpFetch(`/wp/v2/posts/${id}`, {
      method: 'POST',
      body: { status: 'draft', slug: 새슬러그 },
    });
  }

  if (!센것) {
    log.info('되살릴 글이 없습니다.');
    return;
  }
  log.info(apply
    ? `${센것}편을 임시글로 되살렸습니다. 발행은 사람이 합니다.`
    : `${센것}편이 되살아납니다. 실제로 하려면 --apply 를 붙이세요.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
