// 이미 올린 글의 링크를 현재 창에서 열리게 고친다. AI를 부르지 않으므로 비용이 0이다.
//
//   npm run links:fix -- 7253                글 번호를 적어 한 편만
//   npm run links:fix -- --all --dry-run      발행·임시글 전부 훑어 미리보기
//   npm run links:fix -- --all --limit=100    앞 100편을 실제로 고치기
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
import { saveContentBackup } from './fix-alt.mjs';
import { log } from '../utils/logger.mjs';
import { loadEnv } from '../utils/env.mjs';

/** wp:html 블록. 쿠팡 광고 블록을 가려내는 데 쓴다. */
const HTML_BLOCK = /<!--\s*wp:html\s*-->([\s\S]*?)<!--\s*\/wp:html\s*-->/gi;
const 쿠팡광고인가 = (inner) => /ads-partners\.coupang\.com|PartnersCoupang|coupa\.ng|link\.coupang\.com/i.test(inner)
  || /쿠팡\s*파트너스/.test(inner);

/**
 * 쿠팡 광고 블록을 빼놓고 고친 뒤 그대로 되돌린다.
 *
 * 쿠팡 파트너스 광고는 제휴사가 준 코드를 그대로 써야 한다. 그 안의 <a>에
 * target이 있어도 우리가 손대면 광고가 동작하지 않을 수 있다. 전수로 돌리는
 * 도구라 이 보호가 없으면 수백 편의 광고를 한 번에 망칠 수 있다.
 */
function 광고를빼고(html, fn) {
  const 보관 = [];
  const 가린 = String(html || '').replace(HTML_BLOCK, (whole, inner) => {
    if (!쿠팡광고인가(inner)) return whole;
    보관.push(whole);
    return `<!--COUPANG-AD-${보관.length - 1}-->`;
  });
  return fn(가린).replace(/<!--COUPANG-AD-(\d+)-->/g, (m, i) => 보관[Number(i)] ?? m);
}

/**
 * <a> 태그에서 새 창 관련 속성만 걷어낸다.
 *
 * - target="_blank" 제거
 * - rel에서 noopener/noreferrer 제거 (새 창을 띄울 때만 필요한 값들)
 * - nofollow는 남긴다 — 바깥 사이트로 나가는 링크에 필요하다
 * - rel이 비면 속성 자체를 지운다
 */
export function openInSameWindow(html) {
  return 광고를빼고(html, (안전한본문) => 안전한본문.replace(/<a\s[^>]*>/gi, (tag) => {
    let out = tag.replace(/\s+target\s*=\s*(["'])\s*_blank\s*\1/gi, '');

    out = out.replace(/\s+rel\s*=\s*(["'])([^"']*)\1/gi, (m, q, value) => {
      const kept = value.split(/\s+/)
        .filter(Boolean)
        .filter((token) => !/^(noopener|noreferrer)$/i.test(token));
      return kept.length ? ` rel=${q}${kept.join(' ')}${q}` : '';
    });

    return out;
  }));
}

/** 본문에 새 창으로 열리는 <a>가 몇 개인지 센다. */
export function countNewWindowLinks(html) {
  return (String(html || '').match(/<a\s[^>]*target\s*=\s*["']\s*_blank/gi) || []).length;
}

/**
 * 우리가 고칠 수 있는 새 창 링크가 몇 개인지. 쿠팡 광고 안의 것은 세지 않는다.
 * 세는 것과 고치는 것의 기준이 다르면 "고쳤는데 아직 남아 있다"로 보인다.
 */
export function countFixable(html) {
  let n = 0;
  광고를빼고(html, (안전한본문) => { n = countNewWindowLinks(안전한본문); return 안전한본문; });
  return n;
}

/**
 * 바뀐 것이 링크의 target·rel뿐인지 확인한다.
 *
 * 저장 전 마지막 방어선이다. 양쪽에서 <a>의 target·rel을 통째로 지운 뒤
 * 글자 하나까지 같아야 한다.
 */
export function linkOnlyChange(before, after) {
  const 벗기기 = (s) => String(s)
    .replace(/<a\s[^>]*>/gi, (t) => t
      .replace(/\s+target\s*=\s*(["'])[\s\S]*?\1/gi, '')
      .replace(/\s+rel\s*=\s*(["'])[\s\S]*?\1/gi, ''))
    .replace(/\s+/g, ' ')
    .trim();
  return 벗기기(before) === 벗기기(after);
}

/**
 * 발행·임시글을 전부 훑어 본문에 새 창 링크가 박힌 글을 모은다.
 *
 * 왜 전수가 필요한가: 글 번호를 하나씩 적는 방식으로는 623편을 훑을 수 없다.
 * 어느 글에 target이 박혀 있는지 운영자도 모른다.
 */
export async function findNewWindowPosts({ maxPages = 40, perPage = 50 } = {}) {
  const 대상 = [];
  let scanned = 0;
  let 광고만 = 0;

  for (let page = 1; page <= maxPages; page++) {
    const { data, headers } = await wpFetch('/wp/v2/posts', {
      query: {
        per_page: perPage, page, context: 'edit', status: 'publish,draft',
        orderby: 'date', order: 'desc',
      },
    });
    if (!Array.isArray(data) || !data.length) break;
    scanned += data.length;

    for (const p of data) {
      const content = p.content?.raw ?? p.content?.rendered ?? '';
      const 고칠것 = countFixable(content);
      if (!고칠것) {
        // 쿠팡 광고 안에만 있는 경우. 일부러 건드리지 않는다.
        if (countNewWindowLinks(content)) 광고만++;
        continue;
      }
      대상.push({
        id: p.id,
        title: p.title?.raw || p.title?.rendered || '',
        slug: decodeURIComponent(p.slug || ''),
        status: p.status,
        content,
        개수: 고칠것,
      });
    }

    const totalPages = Number(headers.get('x-wp-totalpages') || 1);
    if (page >= totalPages) break;
  }
  return { 대상, scanned, 광고만 };
}

/**
 * 본문에는 없는데 화면에 그려진 쪽에는 새 창 링크가 있는지.
 *
 * 왜 보나: 사이트 쪽에서 출력할 때 외부 링크마다 target="_blank" 를 끼워 넣는
 * 설정이 있다(Rank Math 의 '외부 링크를 새 창에서 열기' 같은 것). 그러면 이
 * 도구가 본문을 깨끗이 고쳐도 화면에서는 여전히 새 창으로 열린다 — 독자가
 * 글로 돌아올 길을 잃고 전면 광고도 뜨지 않는다. 실제로 글 7690 이 그랬다.
 *
 * 본문을 고쳐서 될 일이 아니므로 고치지 않고 알린다. 워드프레스 설정에서
 * 꺼야 한다.
 */
export function 사이트가새창을붙이나(post) {
  const raw = post?.content?.raw ?? '';
  const rendered = post?.content?.rendered ?? '';
  if (!rendered) return false;
  return countNewWindowLinks(rendered) > 0 && countNewWindowLinks(openInSameWindow(raw)) === 0;
}

export async function fixPostLinks(postId, { apply = true } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });

  const before = post?.content?.raw ?? post?.content?.rendered ?? '';
  const after = openInSameWindow(before);

  const result = {
    id: postId,
    title: post?.title?.raw || post?.title?.rendered || '',
    status: post?.status,
    before: countFixable(before),
    after: countFixable(after),
    changed: false,
    backup: null,
    // 본문을 고쳐도 화면에서는 새 창으로 열리는 경우. 사이트 설정 문제다.
    사이트가붙임: 사이트가새창을붙이나(post),
  };

  if (before === after) return result;

  // 저장 전 마지막 방어선. 링크 속성 말고 다른 게 바뀌었으면 보내지 않는다.
  if (!linkOnlyChange(before, after)) {
    throw new Error('링크 속성 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  if (apply) {
    // 고치기 전 원본 본문을 파일로 남긴다. 전수로 돌리는 도구라 되돌릴 길이 있어야 한다.
    result.backup = saveContentBackup({
      id: postId, status: post?.status, title: post?.title, slug: post?.slug, content: post?.content,
    });
    // content만 보낸다. status를 보내지 않으므로 발행 상태가 그대로 유지된다.
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: after }, timeoutMs: 45000 });
  }
  result.changed = true;
  return result;
}

async function 전수(apply, limit) {
  log.section(`🔗 모든 글의 링크를 현재 창에서 열리게 ${apply ? `(최대 ${limit}편)` : '(미리보기 — 저장하지 않습니다)'}`);

  const { 대상, scanned, 광고만 } = await findNewWindowPosts();
  log.info(`글 ${scanned}편 훑음 — 본문에 새 창 링크가 박힌 글 ${대상.length}편`);
  if (광고만) log.info(`  쿠팡 광고 안에만 있는 글 ${광고만}편은 건드리지 않습니다 (제휴사 코드).`);

  if (!대상.length) {
    log.raw('');
    log.ok('본문에 박힌 새 창 링크는 없습니다.');
    log.warn('그래도 화면에서 새 창으로 열린다면 사이트가 출력할 때 붙이는 것입니다.');
    log.raw('   Rank Math → 일반 설정 → 링크 → "외부 링크를 새 창에서 열기"를 끄세요.');
    return;
  }

  const 할것 = apply ? 대상.slice(0, limit) : 대상.slice(0, 15);
  log.raw('');
  if (!apply) log.info(`아래는 ${대상.length}편 중 앞 ${할것.length}편입니다.`);

  let 고침 = 0;
  for (const post of 할것) {
    try {
      const r = await fixPostLinks(post.id, { apply });
      if (!r.changed) continue;
      고침++;
      log.info(`[${r.id}] ${String(r.title).slice(0, 40)} [${r.status}] — 새 창 링크 ${r.before}개 → ${r.after}개`);
    } catch (err) {
      log.fail(`[${post.id}] 실패`, err);
      process.exitCode = 1;
    }
  }

  log.raw('');
  if (apply) {
    log.ok(`${고침}편을 고쳤습니다. 남은 글 ${Math.max(0, 대상.length - 고침)}편`);
    if (대상.length > 고침) log.info('  다시 돌리면 이어서 합니다.');
  } else {
    log.info(`미리보기입니다. 실제로는 ${대상.length}편이 대상입니다.`);
  }
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  const apply = !process.argv.includes('--dry-run');
  const all = process.argv.includes('--all');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 100;

  if (all) return 전수(apply, limit);

  if (!ids.length) {
    log.fail('고칠 글 번호를 적어주세요', new Error('예: npm run links:fix -- 7253 (전부 훑으려면 --all)'));
    process.exitCode = 1;
    return;
  }

  log.section(`🔗 링크를 현재 창에서 열리게 ${apply ? '' : '(미리보기 — 저장하지 않습니다)'}`);

  for (const id of ids) {
    try {
      const r = await fixPostLinks(id, { apply });
      log.step(`${id}: ${String(r.title).slice(0, 50)} [${r.status}]`);
      if (r.사이트가붙임) {
        log.warn('  본문은 깨끗한데 화면에서는 새 창으로 열립니다 — 사이트가 출력할 때 붙입니다.');
        log.raw('     Rank Math → 일반 설정 → 링크 → "외부 링크를 새 창에서 열기"를 끄세요.');
        log.raw('     본문을 고쳐서 될 일이 아닙니다.');
      }
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
