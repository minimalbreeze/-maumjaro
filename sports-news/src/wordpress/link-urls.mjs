// 본문에 **글자로만** 적힌 주소를 누를 수 있는 링크로 바꾼다. (2026-11-09)
//
//   node src/wordpress/link-urls.mjs 15766 15772
//   node src/wordpress/link-urls.mjs 15766 --apply
//
// 왜 필요한가
//   효성님: "URL 주소를 그대로 노출하면 무슨 소용인가. **배너로 만들어
//   누르면 넘어 갈 수 있게 해라.** 다른 글도 점검해라."
//
//   공식 홈페이지·스토어는 `official-links.json` 의 `byPost` 배너로 끝냈다.
//   그런데 `bare-urls` 로 세어 보니 **발행글 150편**에 글자로만 적힌 주소가
//   남아 있다. 배너 하나로는 안 되는 자리들이다 — 중계 허브의 채널 주소,
//   시설 글의 예약처, 스토어 글 본문의 주소 표.
//
//   두 가지가 겹쳐 나쁘다.
//   1. 독자가 주소를 손으로 옮겨 적어야 한다. 모바일에서는 사실상 못 간다
//   2. **링크가 아니라 글자라서 구글이 그 경로로 따라가지 않는다** (지시서 ② 절)
//
// ⚠️ 지우지 않는다. 바꾼다.
//   처음에 "스토어 글 본문의 코드 주소를 지운다"로 계획했는데, 두산
//   글(15766)을 열어 보니 그 주소 둘이 **표 안에 있고 그 표가 글의 주제**
//   였다("팀스토어는 두 곳입니다 — 어디로 들어가야 하나"). 지웠으면 글이
//   말하려던 것을 지운 것이 된다. 효성님이 한 말도 "없애라"가 아니었다.
//
// 무엇만 바꾸나 — **확인된 주소만**
//   `official-links.json` 의 `byPost` 에 사람이 적어 둔 주소, 그리고
//   `watch-links.json` 의 주소. 둘 다 **`_출처` 가 적혀 있어야** 들어간
//   값이다. 본문에 적힌 글자가 그 주소의 호스트와 맞을 때만 링크로 만든다.
//
//   **주소를 만들어내지 않는다.** 본문에 `samsunglionsmall.com` 이라고만
//   적혀 있어도, 설정에 그 호스트의 전체 주소가 없으면 건드리지 않는다.
//   `https://` 를 내가 붙여 넣는 순간 그것은 내가 만든 주소다.
//
// 건드리지 않는 것
//   - 이미 `<a href>` 안에 든 주소
//   - 쿠팡 광고 블록(`wp:html`) — 제휴사가 준 코드다
//   - 구조화 데이터(JSON-LD)·이미지 src
//   - **가짜 쇼핑몰을 가르려고 보여 주는 주소** (한화 글의 "주소창 도메인이
//     … 인지 확인하라"). `bare-urls` 의 `안내인가()` 를 그대로 쓴다
//
// 지키는 선
//   - `rel="nofollow"`, 현재 창. 판단은 `draft.mjs` 의 `링크()` 를 그대로
//     쓴다 — 두 벌로 만들면 한쪽만 고쳐져 정책이 갈린다
//   - 저장 전에 **링크 말고 다른 것이 바뀌지 않았는지** 코드로 확인한다
//   - 고치기 전 원본 본문을 파일로 남긴다
//   - wiki 밖의 글은 건드리지 않는다

import { wpFetch, wpConfig } from './client.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { 링크 } from './draft.mjs';
import { loadOfficialLinks } from '../seo/official-banner.mjs';
import { 셀자리만, 안내인가, 꼬리떼기 } from './bare-urls.mjs';
import { log } from '../utils/logger.mjs';

/** 주소에서 호스트만. 못 읽으면 null. */
export function 호스트(url) {
  const s = String(url || '').trim();
  // ⚠️ new URL 은 한글을 퓨니코드로 바꿔 통과시킨다. '말이안되는값' 이
  //    'xn--639ak7ji7akylp3pk7c' 가 되어 주소처럼 보였다(검사가 잡았다).
  //    그래서 **ASCII 이고 점이 있는 것**만 주소로 본다.
  if (!/^[\x21-\x7e]+$/.test(s)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const h = u.host.replace(/^www\./, '').toLowerCase();
    if (!h.includes('.') || /^xn--/.test(h)) return null;
    return h;
  } catch { return null; }
}

/**
 * 사람이 확인해 적어 둔 주소들을 호스트 → 전체주소 표로 모은다.
 *
 * 한 호스트에 주소가 둘 이상이면 **더 짧은 것**(대개 루트)을 쓴다.
 * 본문에 호스트만 적혀 있을 때 깊은 경로로 보내면 엉뚱한 자리로 간다.
 */
export function 확인된주소표(cfg = loadOfficialLinks()) {
  const 표 = new Map();
  const 넣기 = (url) => {
    if (!url || typeof url !== 'string') return;
    const h = 호스트(url);
    if (!h) return;
    const 전 = 표.get(h);
    if (!전 || url.length < 전.length) 표.set(h, url);
  };
  for (const it of Object.values((cfg && cfg.byPost) || {})) 넣기(it && it.url);
  for (const s of (cfg && cfg.sites) || []) 넣기(s && s.url);
  return 표;
}

/** 코드 태그 안의 글자가 주소 꼴인가. */
function 주소꼴(글자) {
  return /^(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.test(글자);
}

/**
 * 본문에서 글자로만 적힌 주소를 링크로 바꾼다.
 *
 * 돌려주는 모양: { html, 바꾼것: [{ 글자, url }] }
 */
/**
 * 손대면 안 되는 자리를 자리표시자로 빼놓는다.
 *
 * ⚠️ 검사가 잡은 버그다. 처음에는 `셀자리만()` 을 안내 판정에만 쓰고
 *    치환은 **원본 전체**에 돌렸다. 그래서 쿠팡 광고 블록
 *    (`wp:html`) 안의 `<code>` 까지 바꿨다 — **제휴사가 준 코드를
 *    건드리는 것**이고 지시서가 못박아 둔 자리다.
 *
 * 자리표시자로 빼놓고 치환한 뒤 되돌린다. 걷어내는 게 아니라 **비켜
 * 두는 것**이라, 되돌리면 글자 하나까지 그대로다.
 */
export function 지켜야할자리빼기(html) {
  const 보관 = [];
  const 패턴 = [
    /<!--\s*wp:html\s*-->[\s\S]*?<!--\s*\/wp:html\s*-->/g,
    /<script[\s\S]*?<\/script>/gi,
    /<a\b[^>]*>[\s\S]*?<\/a>/gi,
  ];
  let out = String(html || '');
  for (const re of 패턴) {
    out = out.replace(re, (m) => {
      보관.push(m);
      return `\u0000지킴${보관.length - 1}\u0000`;
    });
  }
  return { out, 보관 };
}

/** 빼놓은 자리를 되돌린다. */
export function 지켜야할자리되돌리기(html, 보관) {
  return String(html).replace(/\u0000지킴(\d+)\u0000/g, (_, i) => 보관[Number(i)]);
}

export function 링크로바꾸기(content, 표 = 확인된주소표()) {
  const 원본 = String(content || '');
  const 바꾼것 = [];
  // 어디를 건드려도 되는지는 bare-urls 와 **같은 기준**으로 가린다.
  const 셀수있는 = 셀자리만(원본);

  // 쿠팡 광고·스크립트·이미 걸린 링크는 비켜 둔다.
  const { out: 비켜둔것, 보관 } = 지켜야할자리빼기(원본);
  let html = 비켜둔것;

  // ① <code>·<kbd> 안의 주소
  html = html.replace(/<(code|kbd)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (전체, 태그, 속성, 속) => {
    const 글자 = 꼬리떼기(속.replace(/<[^>]*>/g, '').trim());
    if (!글자 || !주소꼴(글자)) return 전체;
    const h = 호스트(글자);
    const url = h && 표.get(h);
    if (!url) return 전체;
    // 안내 문맥이면 건드리지 않는다.
    const 자리 = 셀수있는.indexOf(글자);
    if (자리 >= 0 && 안내인가(셀수있는, 자리)) return 전체;
    바꾼것.push({ 글자, url });
    // 코드 모양은 그대로 두고 **그 안을** 링크로 감싼다 — 주소라는 표시가
    // 코드 글꼴이라, 걷어내면 글이 달라 보인다.
    return `<${태그}${속성}>${링크(글자, url)}</${태그}>`;
  });

  return { html: 지켜야할자리되돌리기(html, 보관), 바꾼것 };
}

/** 링크 말고 다른 것이 바뀌지 않았나. 태그를 걷어낸 글자가 같아야 한다. */
export function 링크만바뀌었나(before, after) {
  const 글자만 = (s) => String(s)
    .replace(/<a\b[^>]*>/gi, '').replace(/<\/a>/gi, '')
    .replace(/\s+/g, ' ').trim();
  return 글자만(before) === 글자만(after);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const base = wpConfig().base;

  log.section(`🔗 글자로만 적힌 주소를 링크로 바꿉니다${apply ? '' : ' (미리보기 — 저장하지 않습니다)'}`);
  log.info(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);
  if (!ids.length) {
    log.warn('글 번호를 적어주세요. 예: 15766 15772');
    process.exitCode = 1;
    return;
  }

  const 표 = 확인된주소표();
  log.info(`   확인된 주소 ${표.size}곳을 씁니다 (설정에 사람이 적고 _출처를 남긴 것만)`);

  let 바꾼글 = 0;
  for (const id of ids) {
    try {
      const { data: post } = await wpFetch(`/wp/v2/posts/${id}`, { query: { context: 'edit' } });
      if (!손대도되는글인가(post?.link || '', base)) {
        log.info(`[${id}] 건너뜀 — wiki 밖의 글입니다`);
        continue;
      }
      const content = post?.content?.raw ?? '';
      const 제목 = String(post?.title?.raw || '').slice(0, 44);
      const { html, 바꾼것 } = 링크로바꾸기(content, 표);
      if (!바꾼것.length) {
        log.info(`[${id}] 바꿀 주소가 없습니다 — ${제목}`);
        continue;
      }
      if (!링크만바뀌었나(content, html)) {
        log.warn(`[${id}] 링크 말고 다른 내용이 바뀝니다 — 저장하지 않습니다`);
        process.exitCode = 1;
        continue;
      }
      log.info(`[${id}] ${post?.status} · ${제목}`);
      for (const b of 바꾼것) log.info(`   ${b.글자}  →  ${b.url}`);
      if (apply) {
        const backup = saveContentBackup({
          id, status: post?.status, title: post?.title, slug: post?.slug, content: post?.content,
        });
        await wpFetch(`/wp/v2/posts/${id}`, { method: 'POST', body: { content: html }, timeoutMs: 45000 });
        log.info(`   저장 완료. 원본 백업: ${backup}`);
      }
      바꾼글 += 1;
    } catch (err) {
      log.warn(`[${id}] 실패 — ${err?.message || err}`);
      process.exitCode = 1;
    }
  }
  log.info(`\n바꿀 글 ${바꾼글}편${apply ? ' (저장했습니다)' : ' — 실제로 바꾸려면 --apply'}`);
  log.info('※ 설정에 없는 호스트는 건드리지 않습니다. 주소를 만들어내지 않습니다.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err?.message || err); process.exit(1); });
}
