// 이미 올린 글의 링크를 현재 창에서 열리게 고친다. AI를 부르지 않으므로 비용이 0이다.
//
//   npm run links:fix -- 7253
//   npm run links:fix -- 7253 --dry-run
//
// 왜 필요한가
//   새 창으로 열리면 독자가 원래 글로 돌아오지 못하고, 전면 광고도 뜨지 않는다.
//   앞으로 만드는 글은 코드가 처음부터 현재 창으로 만들지만, 이미 올라간 글은
//   본문 안에 target="_blank"가 그대로 남아 있다.
//
// 무엇을 건드리지 않는가
//   - 글의 상태(발행/임시글). 이 파일은 status를 보내지 않는다.
//   - 제목·카테고리·태그·SEO 값.
//   - <a> 태그가 아닌 것(쿠팡 광고의 script·iframe 등). 제휴 코드는 그대로 둬야 동작한다.

import { wpFetch } from './client.mjs';
import { log } from '../utils/logger.mjs';
import { loadEnv } from '../utils/env.mjs';

/**
 * <a> 태그에서 새 창 관련 속성만 걷어낸다.
 *
 * - target="_blank" 제거
 * - rel에서 noopener/noreferrer 제거 (새 창을 띄울 때만 필요한 값들)
 * - nofollow는 남긴다 — 바깥 사이트로 나가는 링크에 필요하다
 * - rel이 비면 속성 자체를 지운다
 */
export function openInSameWindow(html) {
  return String(html || '').replace(/<a\s[^>]*>/gi, (tag) => {
    let out = tag.replace(/\s+target\s*=\s*(["'])\s*_blank\s*\1/gi, '');

    out = out.replace(/\s+rel\s*=\s*(["'])([^"']*)\1/gi, (m, q, value) => {
      const kept = value.split(/\s+/)
        .filter(Boolean)
        .filter((token) => !/^(noopener|noreferrer)$/i.test(token));
      return kept.length ? ` rel=${q}${kept.join(' ')}${q}` : '';
    });

    return out;
  });
}

/** 본문에 새 창으로 열리는 <a>가 몇 개인지 센다. */
export function countNewWindowLinks(html) {
  return (String(html || '').match(/<a\s[^>]*target\s*=\s*["']\s*_blank/gi) || []).length;
}

export async function fixPostLinks(postId, { apply = true } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });

  const before = post?.content?.raw ?? post?.content?.rendered ?? '';
  const after = openInSameWindow(before);

  const result = {
    id: postId,
    title: post?.title?.raw || post?.title?.rendered || '',
    status: post?.status,
    before: countNewWindowLinks(before),
    after: countNewWindowLinks(after),
    changed: false,
  };

  if (before === after) return result;

  if (apply) {
    // content만 보낸다. status를 보내지 않으므로 발행 상태가 그대로 유지된다.
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: after } });
  }
  result.changed = true;
  return result;
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  const apply = !process.argv.includes('--dry-run');

  if (!ids.length) {
    log.fail('고칠 글 번호를 적어주세요', new Error('예: npm run links:fix -- 7253'));
    process.exitCode = 1;
    return;
  }

  log.section(`🔗 링크를 현재 창에서 열리게 ${apply ? '' : '(미리보기 — 저장하지 않습니다)'}`);

  for (const id of ids) {
    try {
      const r = await fixPostLinks(id, { apply });
      log.step(`${id}: ${String(r.title).slice(0, 50)} [${r.status}]`);
      if (r.changed) {
        log.ok(`  새 창 링크 ${r.before}개 → ${r.after}개`);
        log.info('  글의 상태는 건드리지 않았습니다.');
      } else {
        log.info('  고칠 것이 없습니다.');
      }
    } catch (err) {
      log.fail(`  ${id} 실패`, err);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
