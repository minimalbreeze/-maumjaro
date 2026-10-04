// 이미 올린 글에 중계 배너를 넣는다. AI를 부르지 않는다(0원).
//
//   npm run watch:add -- 7690 --show       지금 상태만 본다 (고치지 않는다)
//   npm run watch:add -- 7690 --show --html  배너 HTML을 그대로 찍는다
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
//     저장 전에 bannerOnlyChange() 로 확인하고, 아니면 보내지 않는다.
//   - 중계처가 바뀐 글은 이미 있는 배너 블록만 새 것으로 바꾼다.
//   - 본문이 글자 하나까지 같아지면 보내지 않는다(두 번 돌려도 안전하다).
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

/**
 * 배너임을 알아보는 표시. watchBannerHtml() 이 항상 넣는 글귀다.
 *
 * 주소로 알아보면 안 된다. 글 7690 이 그 경우였다 — 본문 글자 안에 중계
 * 주소가 링크로 적혀 있는데 배너 블록은 없었다. 주소만 보고 "이미 있다"고
 * 건너뛰어서 배너가 영영 안 들어갔다.
 */
const BANNER_SIGN = '📺 경기 보러가기';

/** 본문에 든 배너 블록들. wp:html 블록 중 위 표시가 든 것만. */
export function findBanners(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<!--\s*wp:html\s*-->([\s\S]*?)<!--\s*\/wp:html\s*-->/gi)) {
    if (!m[1].includes(BANNER_SIGN)) continue;
    const url = /href="([^"]+)"/.exec(m[1])?.[1] || '';
    out.push({ start: m.index, end: m.index + m[0].length, url, block: m[0] });
  }
  return out;
}

/** 이 글에 이 배너가 이미 있는지. 배너 블록이 같은 주소를 가리킬 때만 '있다'. */
export function alreadyHasBanner(html, url) {
  if (!url) return false;
  return findBanners(html).some((b) => b.url === url);
}

/**
 * 배너를 넣거나, 이미 있는 배너를 새 것으로 바꾼다.
 *
 * - 배너가 없으면 bannerSlot() 자리에 한 블록 넣는다.
 * - 배너가 있는데 주소가 다르면(중계처가 바뀐 경우) 그 블록만 바꾼다.
 *   자리는 그대로 둔다 — 원래 자리가 글 흐름에 맞게 잡혀 있다.
 */
export function applyBanner(html, banner) {
  const body = String(html || '');
  const block = String(banner || '').trim();
  if (!block) return { html: body, 한일: null };

  const 있는것 = findBanners(body);
  if (있는것.length) {
    let out = body;
    for (const b of [...있는것].reverse()) out = out.slice(0, b.start) + block + out.slice(b.end);
    return { html: out, 한일: '교체' };
  }

  const at = bannerSlot(body);
  if (at === null) return { html: `${body.trimEnd()}\n\n${block}`, 한일: '추가' };
  return { html: `${body.slice(0, at)}${block}\n\n${body.slice(at)}`, 한일: '추가' };
}

/**
 * 배너 말고는 바뀐 게 없는지 확인한다.
 *
 * 저장 전 마지막 방어선이다. 양쪽에서 배너 블록을 통째로 빼고 공백을 고른 뒤
 * 글자 하나까지 같아야 한다. 넣은 경우에도 바꾼 경우에도 같은 방법으로 본다.
 */
export function bannerOnlyChange(before, after) {
  const 벗기기 = (s) => {
    let out = String(s);
    for (const b of [...findBanners(out)].reverse()) out = out.slice(0, b.start) + out.slice(b.end);
    return out.replace(/\s+/g, ' ').trim();
  };
  return 벗기기(before) === 벗기기(after);
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

  const banner = watchBannerHtml(entry);
  const { html, 한일 } = applyBanner(content, banner);
  if (!한일) return { ...base, url, skip: '배너 HTML이 비었습니다' };

  // 글자 하나까지 같으면 보내지 않는다. 이게 멱등성을 지킨다 — 두 번 돌려도
  // 배너가 둘이 되지 않고, 쓸데없는 저장도 일어나지 않는다.
  // 주소만 보고 건너뛰지 않는 이유: 배너 모양을 손봤을 때(글 제목 반복을
  // 걷어낸 것처럼) 주소는 그대로여도 이미 올린 글을 새 모양으로 바꿔야 한다.
  if (html === content) {
    return { ...base, url, skip: '배너가 이미 지금 모양으로 들어 있습니다' };
  }

  if (!bannerOnlyChange(content, html)) {
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
  return {
    ...base, url, text: entry.primary.text, 한일, changed: true, backup, banner,
    // 미리보기에서 본문 상태를 그대로 보여준다. "주소는 본문에 있는데 배너는
    // 없다"를 눈으로 가릴 수 있어야 한다.
    진단: `배너 블록 ${findBanners(content).length}개 · 본문에 ${url} ${(content.split(url).length - 1)}번`,
  };
}

/**
 * 글 하나의 배너 상태를 그대로 찍는다. 아무것도 고치지 않는다.
 *
 * 왜 따로 있나: "본문에는 배너가 있는데 화면에는 안 보인다"가 실제로 있었다.
 * 저장된 본문(raw)과 워드프레스가 그려 주는 본문(rendered)을 나란히 봐야
 * 어느 쪽에서 사라지는지 알 수 있다. 추측으로 고치면 안 된다.
 */
export async function showBanner(postId, { siteCategories = [] } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const raw = post?.content?.raw ?? '';
  const rendered = post?.content?.rendered ?? '';
  const catId = Array.isArray(post?.categories) ? post.categories[0] : null;

  const 센다 = (s, w) => (w ? s.split(w).length - 1 : 0);
  const banners = findBanners(raw);
  const url = banners[0]?.url || '';

  return {
    id: postId,
    title: post?.title?.raw || '',
    status: post?.status,
    link: post?.link || '',
    category: categoryIndex(siteCategories).get(catId) || '',
    raw: { 글자수: raw.length, 배너블록: banners.length, 표시: 센다(raw, BANNER_SIGN), 주소: url ? 센다(raw, url) : 0 },
    rendered: { 글자수: rendered.length, 표시: 센다(rendered, BANNER_SIGN), 주소: url ? 센다(rendered, url) : 0 },
    url,
    // 숫자만 세면 "들어는 있는데 모양이 이상하다"를 못 본다. 실제 덩어리를 그대로 돌려준다.
    블록: banners[0]?.block || '',
    // 화면에 그려진 쪽에서 배너 자리만 떼어 본다.
    화면조각: (() => {
      const at = rendered.indexOf(BANNER_SIGN);
      if (at < 0) return '';
      return rendered.slice(Math.max(0, at - 300), at + 900);
    })(),
    앞뒤: banners.length ? raw.slice(Math.max(0, banners[0].start - 160), banners[0].start) : '',
  };
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const show = process.argv.includes('--show');
  const html = process.argv.includes('--html');
  const apply = !process.argv.includes('--dry-run') && !show;
  if (!ids.length) {
    log.fail('글 번호를 적어주세요', new Error('예: npm run watch:add -- 7690 --dry-run'));
    process.exitCode = 1;
    return;
  }

  log.section(show ? '📺 중계 배너 상태 보기 (고치지 않습니다)' : `📺 중계 배너 넣기 ${apply ? '' : '(미리보기 — 저장하지 않습니다)'}`);

  const { data: cats } = await wpFetch('/wp/v2/categories', { query: { per_page: 100 } });
  const siteCategories = Array.isArray(cats) ? cats : [];

  if (show) {
    for (const id of ids) {
      const r = await showBanner(id, { siteCategories });
      log.info(`[${r.id}] ${r.title.slice(0, 45)} — ${r.category || '분류 없음'} (${r.status})`);
      log.raw(`      저장된 본문: ${r.raw.글자수}자 · 배너 블록 ${r.raw.배너블록}개 · '경기 보러가기' ${r.raw.표시}번 · 주소 ${r.raw.주소}번`);
      log.raw(`      화면 본문:   ${r.rendered.글자수}자 · '경기 보러가기' ${r.rendered.표시}번 · 주소 ${r.rendered.주소}번`);
      if (r.url) log.raw(`      배너 주소: ${r.url}`);
      if (r.raw.배너블록 && !r.rendered.표시) {
        log.warn('      본문에는 배너가 있는데 화면 본문에는 없습니다 — 워드프레스가 그리면서 지웁니다');
      }
      if (r.앞뒤) log.raw(`      배너 앞: …${r.앞뒤.replace(/\s+/g, ' ').slice(-120)}`);
      if (r.블록) {
        // 글자만 떼어 보면 같은 말이 두 번 나오는 것 같은 어색함이 바로 보인다.
        const 글자 = r.블록.replace(/<[^>]*>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/\s+/g, ' ').trim();
        log.raw(`      배너에 적힌 말: ${글자}`);
      }
      if (html && r.블록) { log.raw('      ── 저장된 배너 HTML ──'); log.raw(r.블록); }
      if (html && r.화면조각) { log.raw('      ── 화면에 그려진 배너 자리 ──'); log.raw(r.화면조각); }
      if (r.link) log.raw(`      ${r.link}`);
    }
    return;
  }

  for (const id of ids) {
    try {
      const r = await addWatchBanner(id, { apply, siteCategories });
      log.info(`[${r.id}] ${r.title.slice(0, 45)} — ${r.category || '분류 없음'} (${r.status})`);
      if (r.skip) { log.warn(`      건너뜀: ${r.skip}`); continue; }
      log.raw(`      ${r.진단}`);
      log.ok(`      ${r.한일}: ${r.text} → ${r.url}`);
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
