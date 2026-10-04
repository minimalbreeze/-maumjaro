// 이미 올린 글에 중계 배너를 넣는다. AI를 부르지 않는다(0원).
//
//   npm run watch:add -- 7690 --dry-run    무엇이 들어가는지 먼저 본다
//   npm run watch:add -- 7690              실제로 넣는다
//
// 왜 필요한가
//   배너는 글을 만들 때 본문에 함께 들어간다. 그런데 글을 쓴 뒤에 중계처가
//   바뀌거나(2026-27 KBL이 tvN SPORTS로 옮겨진 것처럼), 배너가 어떤 이유로든
//   본문에서 빠진 채 발행되는 일이 있다. 그럴 때 글을 다시 쓸 수는 없다 —
//   이미 색인된 글이다. 본문에 배너 한 블록만 넣는다.
//
// 주소를 만들어내지 않는다
//   config/watch-links.json 에 사람이 확인해 적어둔 주소만 쓴다. 글의
//   카테고리·내용에 맞는 항목이 없으면 아무것도 넣지 않고 그 이유를 말한다.
//
// 안전장치 (발행된 글의 본문을 고치기 때문에)
//   - 넣기만 한다. 원래 있던 글자는 하나도 지우거나 바꾸지 않는다.
//     저장 전에 insertOnlyChange() 로 확인하고, 아니면 보내지 않는다.
//   - 같은 중계 주소가 이미 본문에 있으면 넣지 않는다(두 번 돌려도 안전하다).
//   - 고치기 전 원본 본문을 파일로 남긴다.
//   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.

import { wpFetch } from './client.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { categoryIndex } from '../news/variety.mjs';
import { pickWatchLinks, watchBannerHtml } from '../seo/watch-banner.mjs';
import { loadEnv } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

/** 2단계 소제목 블록의 시작 위치들. {"level":3} 이 붙은 것은 h3 이므로 뺀다. */
const H2_BLOCK = /<!--\s*wp:heading\s*-->/gi;

/** 쿠팡 광고가 든 wp:html 블록. 배너를 광고 바로 옆에 붙이지 않으려고 본다. */
const AD_BLOCK = /<!--\s*wp:html\s*-->([\s\S]*?)<!--\s*\/wp:html\s*-->/gi;

/**
 * 배너를 넣을 자리를 고른다.
 *
 * 글을 만들 때와 같은 규칙이다(images/embed.mjs 의 planPlacements):
 * 두 번째 소제목 앞. 개요를 읽고 "그래서 어디서 보지?"가 떠오르는 자리다.
 * 글 끝에 두면 거기까지 안 내려간 사람이 못 본다.
 *
 * 광고 블록과 맞붙으면 다음 소제목으로 미룬다 — 광고와 배너가 붙어 있으면
 * 둘 다 광고로 보여서 아무것도 안 눌린다.
 *
 * 소제목이 둘도 없으면 null. 그때는 글 맨 끝에 붙인다.
 */
export function bannerSlot(html) {
  const body = String(html || '');
  const heads = [...body.matchAll(H2_BLOCK)].map((m) => m.index);
  if (heads.length < 2) return null;

  const 광고끝 = [...body.matchAll(AD_BLOCK)]
    .filter((m) => /coupang|쿠팡/i.test(m[1]))
    .map((m) => m.index + m[0].length);

  for (const at of heads.slice(1)) {
    // 바로 앞이 광고면(사이에 다른 블록이 없으면) 이 자리는 건너뛴다.
    const 붙었나 = 광고끝.some((end) => end <= at && body.slice(end, at).trim() === '');
    if (!붙었나) return at;
  }
  return heads[1];
}

/** 이 글에 이 배너가 이미 있는지. 같은 주소가 보이면 있는 것으로 본다. */
export function alreadyHasBanner(html, url) {
  if (!url) return false;
  return String(html || '').includes(url);
}

/** 배너 한 블록을 끼운 본문을 돌려준다. */
export function insertBanner(html, banner) {
  const body = String(html || '');
  const block = String(banner || '').trim();
  if (!block) return { html: body, 넣음: 0 };

  const at = bannerSlot(body);
  if (at === null) return { html: `${body.trimEnd()}\n\n${block}`, 넣음: 1 };
  return { html: `${body.slice(0, at)}${block}\n\n${body.slice(at)}`, 넣음: 1 };
}

/**
 * 넣은 것 말고는 바뀐 게 없는지 확인한다.
 *
 * 저장 전 마지막 방어선이다. 끼운 블록을 after 에서 한 번 빼고 공백을 고른 뒤
 * before 와 글자 하나까지 같아야 한다.
 */
export function insertOnlyChange(before, after, banner) {
  const 평평하게 = (s) => String(s).replace(/\s+/g, ' ').trim();
  const 뺀것 = 평평하게(after).replace(평평하게(banner), '');
  return 평평하게(뺀것) === 평평하게(before);
}

/** 글 하나를 본다. 넣을 수 있으면 넣는다. content 하나만 보낸다. */
export async function addWatchBanner(postId, { apply = true, siteCategories = [] } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const content = post?.content?.raw ?? post?.content?.rendered ?? '';
  const title = post?.title?.raw || post?.title?.rendered || '';
  const catId = Array.isArray(post?.categories) ? post.categories[0] : null;
  const category = categoryIndex(siteCategories).get(catId) || '';

  const base = {
    id: postId, title, status: post?.status, category, changed: false, backup: null,
  };

  const entry = pickWatchLinks(category, { text: `${title}\n${content}` });
  if (!entry) {
    return { ...base, skip: `'${category || '분류 없음'}' 카테고리는 config/watch-links.json 에 중계 링크가 없습니다` };
  }
  const url = entry.primary.url;
  if (alreadyHasBanner(content, url)) {
    return { ...base, url, skip: '이미 같은 중계 주소가 본문에 있습니다' };
  }

  // 제목의 괄호 앞까지만 배너에 쓴다 — 글 만들 때와 같은 규칙이다.
  const banner = watchBannerHtml(entry, { title: title.split('(')[0].trim() });
  const { html, 넣음 } = insertBanner(content, banner);
  if (!넣음) return { ...base, url, skip: '배너 HTML이 비었습니다' };

  if (!insertOnlyChange(content, html, banner)) {
    throw new Error('배너 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = null;
  if (apply) {
    backup = saveContentBackup({ id: postId, status: post?.status, title: post?.title, slug: post?.slug, content: post?.content });
    await wpFetch(`/wp/v2/posts/${postId}`, {
      method: 'POST',
      body: { content: html },
      timeoutMs: 45000,
    });
  }
  return { ...base, url, text: entry.primary.text, changed: true, backup, banner };
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const apply = !process.argv.includes('--dry-run');
  if (!ids.length) {
    log.fail('글 번호를 적어주세요', new Error('예: npm run watch:add -- 7690 --dry-run'));
    process.exitCode = 1;
    return;
  }

  log.section(`📺 중계 배너 넣기 ${apply ? '' : '(미리보기 — 저장하지 않습니다)'}`);

  const { data: cats } = await wpFetch('/wp/v2/categories', { query: { per_page: 100 } });
  const siteCategories = Array.isArray(cats) ? cats : [];

  for (const id of ids) {
    try {
      const r = await addWatchBanner(id, { apply, siteCategories });
      log.info(`[${r.id}] ${r.title.slice(0, 45)} — ${r.category || '분류 없음'} (${r.status})`);
      if (r.skip) { log.warn(`      건너뜀: ${r.skip}`); continue; }
      log.ok(`      ${r.text} → ${r.url}`);
      if (apply) log.ok(`      넣었습니다. 원본 본문: ${r.backup}`);
      else log.info('      미리보기입니다. --dry-run 을 빼면 실제로 넣습니다.');
    } catch (err) {
      log.fail(`[${id}] 실패`, err);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
