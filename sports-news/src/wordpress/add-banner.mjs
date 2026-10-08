// 이미 올린 글에 앱·공식 홈페이지 배너를 넣는다. AI를 부르지 않으므로 0원이다.
//
// 왜 필요한가
//   2026-10-08 에 KBO 규약 글(7801)을 다 쓴 뒤에 운영자가 "KBO 공식 홈페이지
//   배너를 넣어 달라"고 했다. 설정만 고쳐서는 이미 저장된 글이 바뀌지 않는다.
//   이 경로가 없으면 배너 하나 때문에 300원짜리 글을 통째로 다시 써야 한다.
//
// 중계 배너를 넣는 add-watch.mjs 와 같은 뼈대를 쓴다. 자리 찾기·교체·
// "배너 말고 안 바뀌었나" 확인은 거기 함수를 그대로 부른다 — 두 벌로 두면
// 한쪽만 고쳤을 때 갈라진다.

import { wpFetch } from './client.mjs';
import { applyBanner, bannerOnlyChange, findBanners } from './add-watch.mjs';
// 백업은 이미 있는 것을 쓴다. 되돌리는 방법이 두 벌이면 한쪽만 고쳐진다.
import { saveContentBackup } from './fix-alt.mjs';
import { pickApp, appBannerHtml, APP_MARK } from '../seo/app-banner.mjs';
import { pickOfficial, officialBannerHtml, OFFICIAL_MARK } from '../seo/official-banner.mjs';

/**
 * 글에 맞는 배너를 고른다. 앱이 먼저다 — 운영자가 만든 앱 글에 구단 링크를
 * 걸 일은 없다. main.mjs 와 같은 순서를 쓴다.
 */
export function pickBanner(text) {
  const app = pickApp(text);
  if (app) {
    const html = appBannerHtml(app);
    return html ? { 종류: '앱', 이름: app.이름, url: app.url, html, sign: APP_MARK } : null;
  }
  const site = pickOfficial(text);
  if (site) {
    const html = officialBannerHtml(site);
    return html ? { 종류: '공식 홈페이지', 이름: site.이름, url: site.url, html, sign: OFFICIAL_MARK } : null;
  }
  return null;
}

/**
 * 글 하나에 배너를 넣는다.
 *
 * apply 가 false 면 무엇이 바뀌는지만 알려주고 저장하지 않는다(미리보기).
 * 본문에서 바뀐 것이 배너뿐인지 확인한 뒤에만 저장한다.
 */
export async function addBannerToPost(postId, { apply = false } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const content = post?.content?.raw ?? post?.content?.rendered ?? '';
  const title = post?.title?.raw || post?.title?.rendered || '';
  const base = { id: postId, title, status: post?.status, changed: false, backup: null };

  const banner = pickBanner(`${title}\n${content}`);
  if (!banner) {
    return { ...base, skip: '이 글에 맞는 앱·공식 홈페이지가 설정에 없습니다 (config/app-links.json, config/official-links.json)' };
  }

  const { html, 한일 } = applyBanner(content, banner.html, banner.sign);
  if (!한일) return { ...base, ...banner, skip: '배너 HTML 이 비었습니다' };

  // 글자 하나까지 같으면 보내지 않는다. 두 번 돌려도 배너가 둘이 되지 않는다.
  if (html === content) {
    return { ...base, ...banner, skip: '배너가 이미 지금 모양으로 들어 있습니다' };
  }
  if (!bannerOnlyChange(content, html, banner.sign)) {
    throw new Error('배너 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = null;
  if (apply) {
    backup = saveContentBackup({ id: postId, status: post?.status, title: post?.title, slug: post?.slug, content: post?.content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: html }, timeoutMs: 45000 });
  }
  return { ...base, ...banner, 한일, changed: true, backup, 미리보기: !apply };
}

/** 지금 그 글에 어떤 배너가 들어 있는지만 본다. 고치지 않는다. */
export async function showBanners(postId) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const content = post?.content?.raw ?? post?.content?.rendered ?? '';
  const title = post?.title?.raw || post?.title?.rendered || '';
  const 있는것 = [];
  for (const sign of [APP_MARK, OFFICIAL_MARK]) {
    for (const b of findBanners(content, sign)) 있는것.push({ sign, url: b.url });
  }
  return { id: postId, title, status: post?.status, 있는것, 넣을것: pickBanner(`${title}\n${content}`) };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const show = args.includes('--show');
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  if (!ids.length) {
    console.error('글 번호를 적어주세요. 예: node src/wordpress/add-banner.mjs 7801 --apply');
    process.exit(1);
  }

  for (const id of ids) {
    try {
      if (show) {
        const r = await showBanners(id);
        console.log(`\n[${r.id}] ${r.status} · ${r.title}`);
        console.log(`   들어 있는 배너: ${r.있는것.length ? r.있는것.map((b) => `${b.sign} → ${b.url}`).join(', ') : '없음'}`);
        console.log(`   넣을 수 있는 것: ${r.넣을것 ? `${r.넣을것.종류} — ${r.넣을것.이름} → ${r.넣을것.url}` : '없음'}`);
        continue;
      }
      const r = await addBannerToPost(id, { apply });
      console.log(`\n[${r.id}] ${r.status} · ${r.title}`);
      if (r.skip) { console.log(`   건너뜀 — ${r.skip}`); continue; }
      console.log(`   ${r.종류} 배너 ${r.한일}: ${r.이름} → ${r.url}`);
      console.log(r.미리보기 ? '   (미리보기입니다. 저장하지 않았습니다 — 적용하려면 --apply)' : `   저장 완료. 원본 백업: ${r.backup}`);
    } catch (err) {
      console.error(`\n[${id}] 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
