// 본문 맨 앞에 박힌 쿠팡 블록을 **첫 문단 뒤로** 내린다. AI를 부르지 않으므로 0원이다.
//
//   node src/wordpress/move-coupang.mjs 2922            (미리보기)
//   node src/wordpress/move-coupang.mjs 2922 --apply    (적용)
//   node src/wordpress/move-coupang.mjs --all           (발행글 전체 미리보기)
//
// 왜 필요한가
//   2026-10-15 에 운영자가 실제 모바일 화면을 캡처해 줬다. 글을 열면 첫 화면이
//   이렇다.
//
//     제목 → 쿠팡 캐러셀(140px) → 고지문 → 쿠팡 검색창(44px) → 애드센스 자리
//     → (여기서야 본문 첫 줄)
//
//   **첫 화면에 본문이 한 줄도 없다.** 남서울 파3 글은 CTR 11.6% 로 어렵게
//   26명을 데려왔는데, 그 26명이 광고만 보고 나간다.
//
//   지금 코드(images/embed.mjs 의 planPlacements)는 쿠팡을 **가운데 소제목
//   앞**에 넣는다. 그런데 이미 올라간 글들은 옛 방식으로 맨 앞에 박혀 있어서
//   코드만 고쳐서는 바뀌지 않는다. 그래서 이 도구가 따로 있다.
//
//   첫 문단 뒤로 내리는 이유: 첫 문단이 "이 글이 무엇인지"를 말해 준다.
//   읽을 값어치를 먼저 보여주고 그다음에 광고를 만나게 한다. 광고를 빼지
//   않는다 — 자리만 옮긴다.
//
// 지키는 선
//   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
//   - **쿠팡 블록을 뺀 나머지 본문이 글자 하나까지 같아야** 저장한다.
//   - 쿠팡 블록이 이미 첫 문단 뒤에 있으면 건너뛴다. 두 번 돌려도 안전하다.
//   - 고치기 전 원본 본문을 파일로 남긴다.
//   - wiki 밖의 글은 건드리지 않는다.

import { wpFetch, wpConfig } from './client.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

/** 쿠팡 블록임을 알아보는 표식. 파트너스 스크립트 주소가 가장 확실하다. */
export const COUPANG_MARK = 'ads-partners.coupang.com';

/**
 * 본문에서 쿠팡 블록을 통째로 집어낸다. 없으면 null.
 *
 * 두 가지 모양을 다 받는다.
 *   ① `<!-- wp:html ... -->` 로 감싸진 것 (지금 코드가 만드는 모양)
 *   ② 감싸지지 않고 날것으로 들어간 것 (옛 글)
 *
 * ② 는 끝을 알기 어려우므로 **쿠팡 iframe 까지**를 블록으로 본다.
 * 고지 문구는 법적으로 광고와 함께 있어야 하므로 반드시 같이 옮긴다.
 */
export function findCoupang(html) {
  const s = String(html ?? '');
  const at = s.indexOf(COUPANG_MARK);
  if (at < 0) return null;

  // ① wp:html 로 감싸져 있나. 쿠팡 표식 **앞쪽**에서 가장 가까운 여는 주석을 찾는다.
  const 여는자리 = s.lastIndexOf('<!-- wp:html', at);
  if (여는자리 >= 0) {
    const 닫는끝 = s.indexOf('<!-- /wp:html -->', at);
    // 여는 주석과 쿠팡 사이에 다른 블록이 끼어 있으면 그 wp:html 은 쿠팡 것이 아니다.
    const 사이 = s.slice(여는자리, at);
    if (닫는끝 >= 0 && !사이.includes('<!-- /wp:html -->')) {
      const end = 닫는끝 + '<!-- /wp:html -->'.length;
      return { 블록: s.slice(여는자리, end), start: 여는자리, end, 감쌈: true };
    }
  }

  // ② 날것. 스크립트 시작부터 쿠팡 iframe 끝까지.
  const start = s.lastIndexOf('<script', at);
  const 시작 = start >= 0 ? start : at;
  const iframe자리 = s.indexOf('coupa.ng', 시작);
  if (iframe자리 >= 0) {
    const end = s.indexOf('</iframe>', iframe자리);
    if (end >= 0) {
      const 끝 = end + '</iframe>'.length;
      return { 블록: s.slice(시작, 끝), start: 시작, end: 끝, 감쌈: false };
    }
  }
  return null;
}

/**
 * 첫 문단이 끝나는 자리를 돌려준다. 없으면 -1.
 *
 * 빈 문단(`<p></p>`)은 세지 않는다 — 이 블로그 글에는 간격용 빈 문단이 많다.
 * 빈 문단을 첫 문단으로 잡으면 광고가 제자리에 머문다.
 */
export function 첫문단끝(html) {
  const s = String(html ?? '');
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const 속 = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!속) continue;                       // 빈 문단은 건너뛴다
    // 문단을 감싼 블록 주석까지 넘어간 자리를 돌려준다.
    const 닫는주석 = s.indexOf('<!-- /wp:paragraph -->', m.index + m[0].length);
    if (닫는주석 >= 0 && 닫는주석 - (m.index + m[0].length) < 40) {
      return 닫는주석 + '<!-- /wp:paragraph -->'.length;
    }
    return m.index + m[0].length;
  }
  return -1;
}

/**
 * 쿠팡 블록을 뺀 나머지 본문. "광고 말고 안 바뀌었나" 를 이것으로 본다.
 *
 * 줄바꿈 개수와 줄 끝 공백만 고른다. 광고를 들어내면 그 자리의 빈 줄이
 * 달라지는데, 워드프레스 블록 HTML 에서 빈 줄 개수는 화면에 아무 영향이
 * 없다. **글자는 하나도 건드리지 않는다** — 그래야 본문이 바뀐 것을 잡는다.
 */
export function 줄바꿈정리(s) {
  return String(s ?? '').replace(/[ \t]*\n[ \t\n]*/g, '\n').trim();
}

export function withoutCoupang(html) {
  const found = findCoupang(html);
  if (!found) return 줄바꿈정리(html);
  const s = String(html);
  return 줄바꿈정리(s.slice(0, found.start) + s.slice(found.end));
}

/**
 * 쿠팡 블록을 첫 문단 뒤로 옮긴 본문을 돌려준다.
 *
 * 한일: '내림' / null(안 옮김). 이미 첫 문단 뒤면 건드리지 않는다.
 */
export function moveCoupang(html) {
  const s = String(html ?? '');
  const found = findCoupang(s);
  if (!found) return { html: s, 한일: null, 이유: '쿠팡 블록이 없습니다' };

  const 문단끝 = 첫문단끝(s);
  if (문단끝 < 0) return { html: s, 한일: null, 이유: '본문에 문단이 없습니다' };

  // 이미 첫 문단 뒤에 있으면 그대로 둔다.
  if (found.start >= 문단끝) return { html: s, 한일: null, 이유: '이미 첫 문단 뒤에 있습니다' };

  // 광고를 뺀 본문을 만들고, 그 안에서 첫 문단 끝을 다시 찾아 거기에 끼운다.
  // (광고를 빼면 글자 위치가 밀리므로 원래 좌표를 그대로 쓰면 안 된다.)
  const 나머지 = s.slice(0, found.start) + s.slice(found.end);
  const 새문단끝 = 첫문단끝(나머지);
  if (새문단끝 < 0) return { html: s, 한일: null, 이유: '광고를 뺀 뒤 문단을 찾지 못했습니다' };

  const 결과 = `${나머지.slice(0, 새문단끝)}\n\n${found.블록}\n${나머지.slice(새문단끝)}`
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { html: 결과, 한일: '내림', 이유: '' };
}

/** 쿠팡 블록 말고는 본문이 그대로인지 본다. 보내기 전 마지막 방어선이다. */
export function coupangOnlyMove(before, after) {
  return withoutCoupang(before) === withoutCoupang(after);
}

/** 글 하나의 쿠팡 블록을 내린다. apply 가 false 면 저장하지 않는다. */
export async function moveCoupangInPost(postId, { apply = false } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const title = post?.title?.raw || post?.title?.rendered || '';
  const base = { id: postId, title, status: post?.status, changed: false, backup: null };

  if (!손대도되는글인가(post?.link, wpConfig().base)) {
    return { ...base, skip: `wiki 밖의 글입니다 (${post?.link || '주소 없음'})` };
  }

  const content = post?.content?.raw ?? post?.content?.rendered ?? '';
  const { html, 한일, 이유 } = moveCoupang(content);
  if (!한일) return { ...base, skip: 이유 };
  if (html === content) return { ...base, skip: '바뀌는 것이 없습니다' };

  if (!coupangOnlyMove(content, html)) {
    throw new Error('쿠팡 블록 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = null;
  if (apply) {
    backup = saveContentBackup({ id: postId, status: post?.status, title: post?.title, slug: post?.slug, content: post?.content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: html }, timeoutMs: 45000 });
  }
  return { ...base, 한일, changed: true, backup, 미리보기: !apply };
}

async function 발행글전부() {
  const 글 = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await wpFetch('/wp/v2/posts', {
      query: { status: 'publish', per_page: 100, page, _fields: 'id,title,link' },
    });
    if (!Array.isArray(data) || !data.length) break;
    글.push(...data);
    if (data.length < 100) break;
  }
  return 글;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply') && !args.includes('--dry-run');
  const 전부 = args.includes('--all');
  let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`🧺 쿠팡 블록을 첫 문단 뒤로 내립니다${apply ? '' : ' (미리보기 — 저장하지 않습니다)'}`);
  console.log(`   대상 사이트: ${wpConfig().base.replace(/^https?:\/\//, '')}  ← 여기 글만 손댑니다`);
  console.log(`────────────────────────────────────────────────────────`);

  if (전부) {
    const 글 = await 발행글전부();
    console.log(`\n발행 ${글.length}편을 훑습니다\n`);
    ids = 글.map((p) => p.id);
  }
  if (!ids.length) {
    console.error('글 번호를 적거나 --all 을 쓰세요. 예: node src/wordpress/move-coupang.mjs 2922');
    process.exit(1);
  }

  let 바꿀것 = 0; let 저장 = 0; let 그대로 = 0;
  for (const id of ids) {
    try {
      const r = await moveCoupangInPost(id, { apply });
      if (r.skip) { 그대로 += 1; if (!전부) console.log(`[${id}] 건너뜀 — ${r.skip}`); continue; }
      바꿀것 += 1;
      console.log(`${apply ? '✅' : '  '} [${r.id}] ${r.title.slice(0, 40)}`);
      if (apply) { 저장 += 1; console.log(`      원본 백업: ${r.backup}`); }
    } catch (err) {
      console.log(`❌ [${id}] ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\n내릴 글 ${바꿀것}편 · 그대로 둘 글 ${그대로}편`);
  if (!apply) console.log('실제로 옮기려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
  console.log('※ 광고를 빼지 않습니다. 자리만 옮깁니다. 본문 글자는 하나도 바뀌지 않습니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
