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
import { 셀자리만, 안내문맥인가, 예시문맥인가, 꼬리떼기 } from './bare-urls.mjs';
import { log } from '../utils/logger.mjs';
import { 발행글전부 } from './index-audit.mjs';

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

/**
 * **그 자리**의 앞뒤를 보고 건드리면 안 되는 문맥인지 가린다.
 *
 * ⚠️ 2026-11-09 에 이것 때문에 한화 글(15783)의 안전 안내 문장까지
 *    링크가 됐다. 전에는 이렇게 짰다.
 *
 *      안내인가(셀수있는, 셀수있는.indexOf(글자))
 *
 *    `indexOf` 는 **첫 번째 자리**만 돌려준다. 한화 글에는 같은 주소가
 *    여섯 번 나오는데, 첫 자리가 안내 문장이 아니면 **나머지 다섯이
 *    전부 통과**한다. 전수 점검에서 "안전 안내로 건너뛴 주소 0개" 가
 *    찍혀서 알았다 — 숫자를 안 봤으면 그냥 끝냈을 자리다.
 *
 *    이번 건의 결과는 나쁘지 않았다(그 주소가 가리키는 곳이 맞는 가게다).
 *    그래도 고치는 이유는, 롯데 글처럼 **예시로 든 주소가 그 글에 두 번
 *    나오면** 같은 버그가 엉뚱한 가게로 보내기 때문이다.
 *
 * 그래서 지금 치환하는 **그 자리**를 기준으로 앞뒤 창을 떠서 본다.
 * 태그를 걷어낸 글자로 보되, 창 안에서 주소의 자리를 다시 찾는다.
 */
export function 건드리면안되는자리인가(html, 자리, 글자) {
  const 본문 = String(html);
  // **앞·뒤를 따로 떠서** 넘긴다. 자리를 다시 찾지 않으므로 같은 주소가
  // 여러 번 나와도 헷갈리지 않는다 — 그게 이 버그의 뿌리였다.
  const 앞 = 본문.slice(Math.max(0, 자리 - 240), 자리).replace(/<[^>]*>/g, ' ');
  const 뒤통째 = 본문.slice(자리).replace(/<[^>]*>/g, ' ');
  const 주소자리 = 뒤통째.indexOf(글자);
  const 주소뒤 = 주소자리 >= 0 ? 뒤통째.slice(주소자리 + 글자.length) : 뒤통째;
  return 안내문맥인가(앞) || 예시문맥인가(주소뒤);
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
  html = html.replace(/<(code|kbd)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (전체, 태그, 속성, 속, m_index) => {
    const 글자 = 꼬리떼기(속.replace(/<[^>]*>/g, '').trim());
    if (!글자 || !주소꼴(글자)) return 전체;
    const h = 호스트(글자);
    const url = h && 표.get(h);
    if (!url) return 전체;
    // 안내 문맥(가짜 사이트 가르기)이나 **예시로 든 주소**면 건드리지 않는다.
    // ⚠️ `indexOf` 로 첫 자리만 보면 같은 주소가 여러 번 나오는 글에서
    //    나머지가 전부 통과한다(한화 글에서 실제로 그랬다). 지금 이 자리를 본다.
    if (건드리면안되는자리인가(원본, m_index, 글자)) return 전체;
    바꾼것.push({ 글자, url });
    // 코드 모양은 그대로 두고 **그 안을** 링크로 감싼다 — 주소라는 표시가
    // 코드 글꼴이라, 걷어내면 글이 달라 보인다.
    return `<${태그}${속성}>${링크(글자, url)}</${태그}>`;
  });

  // ── ② 태그 밖에 **글자로** 적힌 주소 (2026-11-09) ────────────────
  //
  // 전수 점검에서 걸린 150편 중 **대부분이 이쪽**이다. 구단 스토어 글은
  // 주소를 `<code>` 로 적어서 ① 이 잡지만, 중계 허브·시설 글은 문장 안에
  // 그냥 적혀 있다(`https://kovo.co.kr/`, `www.jinju.go.kr`).
  //
  // 처음에는 "조사가 붙은 한국어에서 경계를 잘못 잡을 위험" 때문에 미뤘다.
  // 다시 보니 그 걱정이 과했다 — `kovo.co.kr에서` 는 호스트 뒤에 `에서` 가
  // 붙은 꼴이고, 경계 검사(`(?![\w.-])`)가 `에` 를 호스트의 일부로 보지
  // 않으므로 `kovo.co.kr` 만 감싸고 `에서` 는 밖에 남는다. 그게 맞는 결과다.
  //
  // ⚠️ **①이 만든 링크를 다시 감싸지 않으려고 한 번 더 비켜 둔다.**
  //    ① 은 `<code>` 안에 `<a>` 를 만든다. 그 `<a>` 는 새로 생긴 것이라
  //    처음 비켜 두기에 안 들어갔다. 다시 비켜 두지 않으면 같은 주소를
  //    두 번 감싸 `<a><a>…</a></a>` 가 된다.
  const { out: 비켜둔것2, 보관: 보관2 } = 지켜야할자리빼기(지켜야할자리되돌리기(html, 보관));
  let html2 = 비켜둔것2;

  const 감싸기 = (전체, 글자, 자리) => {
    const 깎은것 = 꼬리떼기(글자);
    const h = 호스트(깎은것);
    const url = h && 표.get(h);
    if (!url) return null;
    if (건드리면안되는자리인가(html2, 자리, 깎은것)) return null;
    바꾼것.push({ 글자: 깎은것, url });
    // 꼬리로 떼어낸 부호는 링크 밖에 그대로 남긴다.
    return 링크(깎은것, url) + 전체.slice(깎은것.length);
  };

  // http(s):// 로 시작하는 주소
  html2 = html2.replace(/https?:\/\/[^\s<>()"'\][]+/gi, (m, 자리) => 감싸기(m, m, 자리) ?? m);

  // 스킴 없는 도메인 꼴. **설정에 있는 호스트만** 노린다 — 아무 도메인꼴을
  // 긁으면 "3.5" 나 파일 이름까지 먹는다.
  for (const h of 표.keys()) {
    const 안전 = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w./@-])(?:www\\.)?${안전}(?:/\\S*)?`, 'gi');
    html2 = html2.replace(re, (m, 자리) => 감싸기(m, m, 자리) ?? m);
  }

  return { html: 지켜야할자리되돌리기(html2, 보관2), 바꾼것 };
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
  // 전체는 **--전체 를 분명히 적었을 때만** 돈다. 700편을 실수로 건드리지
  // 않는다 (add-sticky 와 같은 생각).
  const 전체 = args.includes('--전체');
  let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const base = wpConfig().base;

  log.section(`🔗 글자로만 적힌 주소를 링크로 바꿉니다${apply ? '' : ' (미리보기 — 저장하지 않습니다)'}`);
  log.info(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);
  if (전체) {
    // 점검에서 걸린 150편을 번호로 적을 수 없다. 발행글 전체를 돌면서
    // **바꿀 것이 있는 글만** 건드린다 — 없으면 "바꿀 주소가 없습니다" 로
    // 넘어가므로 전체를 도는 것이 위험을 늘리지 않는다.
    const 글 = await 발행글전부();
    ids = 글.map((p) => p.id);
    log.info(`   발행 ${ids.length}편을 돕니다`);
  }

  if (!ids.length) {
    log.warn('글 번호를 적어주세요. 예: 15766 15772   (전부 하려면 --전체)');
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
