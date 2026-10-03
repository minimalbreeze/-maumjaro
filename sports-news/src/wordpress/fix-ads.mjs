// 이미 올린 글의 광고를 글 카테고리에 맞는 것으로 바꾼다. AI를 부르지 않는다(0원).
//
//   npm run ads:fix -- --dry-run      무엇이 어떻게 바뀌는지 미리보기
//   npm run ads:fix -- --limit=50     50개만 바꾸기
//
// 왜 필요한가
//   카테고리 맞춤 광고는 **새로 쓰는 글에만** 들어간다. 그런데 트래픽은 이미
//   발행한 수백 편에서 나온다. 새 글이 색인되려면 몇 주 걸리니, 기존 글을
//   그대로 두면 광고 작업이 효과를 내지 못한다.
//
// 안전장치 (발행된 글의 본문을 고치기 때문에)
//   - 쿠팡 광고 블록만 바꾼다. 그 밖의 글자는 하나도 건드리지 않는다.
//     저장 전에 adOnlyChange() 로 확인하고, 아니면 보내지 않는다.
//   - 카테고리에 맞는 링크가 없는 글은 건너뛴다. 멀쩡한 광고를 지우지 않는다.
//   - 고치기 전 원본 본문을 파일로 남긴다.
//   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
//   - --limit 으로 나눠서 한다.

import { wpFetch } from './client.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { categoryIndex } from '../news/variety.mjs';
import { pickAd, categoryAdHtml, loadAdConfig } from '../images/ad-category.mjs';
import { loadEnv } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

/**
 * 쿠팡 파트너스 광고가 든 wp:html 블록.
 *
 * 글을 저장할 때 adHtml() 이 광고를 wp:html 블록으로 감싼다. 그 블록을 통째로
 * 찾아 바꾼다. 블록 단위로 바꿔야 스크립트·iframe·고지문이 한꺼번에 깔끔히
 * 교체된다.
 */
const HTML_BLOCK = /<!--\s*wp:html\s*-->([\s\S]*?)<!--\s*\/wp:html\s*-->/gi;

/** 이 블록이 쿠팡 광고인지. 다른 용도의 wp:html 블록을 건드리면 안 된다. */
export function isCoupangAd(inner) {
  const t = String(inner || '');
  return /ads-partners\.coupang\.com|PartnersCoupang|coupa\.ng|link\.coupang\.com/.test(t)
    || /쿠팡\s*파트너스/.test(t);
}

/** 글 본문에 쿠팡 광고 블록이 몇 개 있는지. */
export function countAdBlocks(html) {
  let n = 0;
  for (const m of String(html || '').matchAll(HTML_BLOCK)) if (isCoupangAd(m[1])) n++;
  return n;
}

/**
 * 광고 블록을 새 광고로 바꾼다.
 *
 * 광고가 여러 개면 전부 바꾼다. 쿠팡이 아닌 wp:html 블록은 그대로 둔다.
 */
export function replaceAds(html, newAdInner) {
  let 바꿈 = 0;
  const out = String(html || '').replace(HTML_BLOCK, (whole, inner) => {
    if (!isCoupangAd(inner)) return whole;
    바꿈++;
    return `<!-- wp:html -->\n${newAdInner.trim()}\n<!-- /wp:html -->`;
  });
  return { html: out, 바꿈 };
}

/**
 * 바뀐 것이 광고 블록뿐인지 확인한다.
 *
 * 본문을 고치는 도구라 이 검사가 핵심이다. 양쪽에서 쿠팡 광고 블록을 통째로
 * 지운 뒤 비교해서, 그 밖의 글자가 하나라도 달라지면 저장하지 않는다.
 */
export function adOnlyChange(before, after) {
  const 벗기기 = (s) => String(s)
    .replace(HTML_BLOCK, (whole, inner) => (isCoupangAd(inner) ? '' : whole))
    .replace(/\s+/g, ' ')
    .trim();
  return 벗기기(before) === 벗기기(after);
}

/** 발행·임시글을 훑어 광고를 바꿀 수 있는 글을 모은다. */
export async function findAdPosts({ maxPages = 30, perPage = 50, siteCategories = [] } = {}) {
  const config = loadAdConfig();
  const 이름 = categoryIndex(siteCategories);
  const 대상 = [];
  let scanned = 0;
  let 광고없음 = 0;
  const 링크없는카테고리 = new Map();

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
      const content = p.content?.raw || p.content?.rendered || '';
      if (!countAdBlocks(content)) { 광고없음++; continue; }

      const catId = Array.isArray(p.categories) ? p.categories[0] : null;
      const category = 이름.get(catId) || '';
      const ad = pickAd(category, config);
      if (!ad) {
        // 맞는 링크가 없는 종목이다. 멀쩡한 캐러셀을 지우지 않는다.
        링크없는카테고리.set(category || '(분류 없음)', (링크없는카테고리.get(category || '(분류 없음)') || 0) + 1);
        continue;
      }

      대상.push({
        id: p.id,
        title: p.title?.raw || p.title?.rendered || '',
        slug: decodeURIComponent(p.slug || ''),
        status: p.status,
        category, ad, content,
        광고수: countAdBlocks(content),
      });
    }

    const totalPages = Number(headers.get('x-wp-totalpages') || 1);
    if (page >= totalPages) break;
  }
  return { 대상, scanned, 광고없음, 링크없는카테고리 };
}

/** 한 글의 광고를 바꾼다. content 하나만 보낸다. */
export async function fixOne(post, { apply = true } = {}) {
  const 새광고 = categoryAdHtml(post.ad);
  const { html, 바꿈 } = replaceAds(post.content, 새광고);
  if (!바꿈) return { id: post.id, title: post.title, 바꿈: 0, changed: false };

  // 저장 전 마지막 방어선.
  if (!adOnlyChange(post.content, html)) {
    throw new Error('광고 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = null;
  if (apply) {
    backup = saveContentBackup(post);
    await wpFetch(`/wp/v2/posts/${post.id}`, {
      method: 'POST',
      body: { content: html },
      timeoutMs: 45000,
    });
  }
  return { id: post.id, title: post.title, category: post.category, 바꿈, changed: true, backup, url: post.ad.url };
}

async function main() {
  const apply = !process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;

  log.section(`📢 이미 올린 글의 광고를 카테고리에 맞춘다 ${apply ? `(최대 ${limit}개)` : '(미리보기 — 저장하지 않습니다)'}`);

  // 카테고리 id→이름을 알아야 글의 종목을 안다.
  const { data: cats } = await wpFetch('/wp/v2/categories', { query: { per_page: 100 } });
  const siteCategories = Array.isArray(cats) ? cats : [];

  const { 대상, scanned, 광고없음, 링크없는카테고리 } = await findAdPosts({ siteCategories });
  log.info(`글 ${scanned}개 훑음 — 광고를 바꿀 수 있는 글 ${대상.length}개 (광고 없는 글 ${광고없음}개)`);

  if (링크없는카테고리.size) {
    log.raw('');
    log.warn('맞춤 링크가 없어 건너뛴 종목 (기존 광고를 그대로 둡니다):');
    for (const [c, n] of [...링크없는카테고리].sort((a, b) => b[1] - a[1])) {
      log.raw(`     ${c}: ${n}개 글`);
    }
  }
  if (!대상.length) { log.raw(''); log.ok('바꿀 것이 없습니다.'); return; }

  const 할것 = apply ? 대상.slice(0, limit) : 대상.slice(0, 12);
  log.raw('');
  if (!apply) log.info(`아래는 ${대상.length}개 중 앞 ${할것.length}개입니다.`);

  let 고침 = 0;
  for (const post of 할것) {
    try {
      const r = await fixOne(post, { apply });
      if (!r.changed) continue;
      고침++;
      log.info(`[${r.id}] ${r.title.slice(0, 40)} — ${r.category} 광고 ${r.바꿈}개`);
      log.ok(`      → ${r.url}`);
    } catch (err) {
      log.fail(`[${post.id}] 실패`, err);
    }
  }

  log.raw('');
  if (apply) {
    log.ok(`${고침}개 글의 광고를 바꿨습니다. 남은 글 ${Math.max(0, 대상.length - 고침)}개`);
    if (대상.length > 고침) log.info('  다시 돌리면 이어서 합니다.');
  } else {
    log.info(`미리보기입니다. 실제로는 글 ${대상.length}개가 대상입니다.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
