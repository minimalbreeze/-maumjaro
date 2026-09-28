// 이미 만들어 둔 임시글의 대표 키워드를 고친다. AI를 부르지 않으므로 비용이 0이다.
//
//   npm run seo:fix -- 7246 7241
//
// 왜 필요한가
//   SEO 단계가 본문에 한 번도 나오지 않는 긴 구절을 대표 키워드로 고른 적이 있다.
//   Rank Math는 대표 키워드를 있는 그대로 찾기 때문에, 본문에 없는 말을 넣으면
//   키워드 밀도가 0%가 되고 점수도 0이 된다. 글은 멀쩡한데 점수만 깎인다.
//
//   본문은 그대로 두고 대표 키워드만 본문에 실제로 있는 말로 바꾼다.

import { wpFetch } from './client.mjs';
import { chooseFocusKeyword, keywordDensity, buildSlug } from '../seo/rankmath.mjs';
import { log } from '../utils/logger.mjs';
import { loadEnv } from '../utils/env.mjs';

/** 워드프레스 블록 HTML에서 사람이 읽는 글만 남긴다. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 제목에서 대표 키워드 후보를 뽑는다. 괄호 앞의 앞머리가 보통 핵심이다. */
export function keywordCandidates({ title, currentKeyword }) {
  const head = String(title || '').split('(')[0];
  const out = [currentKeyword];

  // 쉼표·따옴표로 끊어 각 조각을 후보로 삼는다.
  for (const piece of String(title || '').split(/[(),'"'"「」·]/)) {
    const t = piece.replace(/\s+/g, ' ').trim();
    if (t.length >= 2) out.push(t);
  }
  out.push(head.replace(/\s+/g, ' ').trim());
  return out.filter(Boolean);
}

export async function fixPostSeo(postId, { apply = true } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });

  const title = post?.title?.raw || post?.title?.rendered || '';
  const body = htmlToText(post?.content?.raw || post?.content?.rendered || '');
  const current = post?.meta?.rank_math_focus_keyword || '';

  const before = keywordDensity(body, current);
  const picked = chooseFocusKeyword(body, keywordCandidates({ title, currentKeyword: current }));

  const result = {
    id: postId,
    title,
    status: post?.status,
    before: { keyword: current, density: before.density, count: before.count },
    after: { keyword: picked.keyword, density: picked.density, count: picked.count },
    changed: false,
  };

  if (!picked.keyword || picked.keyword === current) return result;
  // 지금 것이 이미 권장 구간 안이면 건드리지 않는다.
  if (before.density >= 1.25 && before.density <= 2.5) return result;
  if (picked.density <= before.density) return result;

  if (apply) {
    await wpFetch(`/wp/v2/posts/${postId}`, {
      method: 'POST',
      body: {
        meta: { rank_math_focus_keyword: picked.keyword },
        slug: buildSlug({ focusKeyword: picked.keyword, title, fallback: '' }),
      },
    });
  }
  result.changed = true;
  return result;
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  const apply = !process.argv.includes('--dry-run');

  if (!ids.length) {
    log.fail('고칠 글 번호를 적어주세요', new Error('예: npm run seo:fix -- 7246'));
    process.exitCode = 1;
    return;
  }

  log.section(`🔧 임시글 SEO 손보기 ${apply ? '' : '(미리보기 — 저장하지 않습니다)'}`);

  for (const id of ids) {
    try {
      const r = await fixPostSeo(id, { apply });
      log.step(`${id}: ${String(r.title).slice(0, 50)}`);
      if (r.changed) {
        log.ok(`  대표 키워드 "${r.before.keyword}" (${r.before.density.toFixed(2)}%, ${r.before.count}회)`);
        log.ok(`            → "${r.after.keyword}" (${r.after.density.toFixed(2)}%, ${r.after.count}회)`);
      } else {
        log.info(`  그대로 둡니다 — "${r.before.keyword}" ${r.before.density.toFixed(2)}%`);
      }
    } catch (err) {
      log.fail(`  ${id} 실패`, err);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // .env 로딩은 loadEnv() 한 곳에만 맡긴다. 노드의 환경파일 로더를 직접 부르면
  // .env가 없는 곳(GitHub Actions처럼 비밀값이 환경변수로 들어오는 곳)에서
  // ENOENT로 죽는다. 실제로 그렇게 0초 만에 실패했다.
  loadEnv();
  await main();
}
