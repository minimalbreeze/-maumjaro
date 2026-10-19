// 한 이미지에 alt 가 **둘 들어간 것**을 하나로 돌린다. AI를 부르지 않는다(0원).
//
//   node src/wordpress/dup-alt.mjs                 전체 훑어 미리보기
//   node src/wordpress/dup-alt.mjs 1650            글 지정 미리보기
//   node src/wordpress/dup-alt.mjs 1650 --apply    적용
//
// 왜 필요한가 (2026-10-19)
//   1650(서평택골프클럽 파3)에서 '용인 88CC' 가 여섯 번 나왔다. 본문은
//   깨끗했고, 전부 이미지 alt 안에 있었다.
//
//     <img src="…image-116.png" alt="용인 88CC 파3 골프장
//     용인 88CC 파3
//     용인 파3 골프장
//     … 88CC
//     용인 88CC"  class="wp-image-1653" style="…"
//       alt="서평택골프클럽 파3 골프장: 이용료 및 이용방법, 예약방법, 매력포인트"/>
//
//   alt 가 둘이다. **중복 속성은 앞의 것이 이긴다** — 브라우저와 구글이 읽는
//   것은 다른 골프장 이름을 여덟 줄 나열한 쪽이고, 맞는 alt 는 버려진다.
//   키워드 나열은 구글 스팸 정책에 걸리는 모양새라 그냥 둘 수 없다.
//
//   왜 이렇게 됐나: fix-alt.mjs 의 HAS_ALT 가 `(.*?)` 였다. `.` 은 줄바꿈을
//   못 넘으므로 **여러 줄로 적힌 alt 를 없는 것으로 보고** 태그 끝에 하나
//   더 붙였다. 같은 파일의 altOnlyChange 는 처음부터 `[\s\S]` 를 쓰고 있었다 —
//   한 파일 안에서 둘이 어긋나 있었고, 그 틈으로 났다.
//   (그 정규식과 "alt 가 둘이면 저장하지 않는다" 가드는 같이 고쳤다)
//
// 어떻게 고치나
//   **마지막 alt 만 남긴다.** fix-alt 가 제목에서 만든 alt 를 태그 끝에
//   붙였으므로, 마지막 것이 이 글의 제목에서 나온 맞는 설명이다.
//   미리보기가 남길 것과 버릴 것을 모두 찍으니 눈으로 확인하고 적용한다.
//
// 지키는 선
//   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
//   - 미리보기가 기본이다.
//   - 고치기 전 원본 본문을 파일로 남긴다.
//   - alt 말고 다른 글자가 바뀌면 저장하지 않는다(altOnlyChange).
//   - 고친 뒤 모든 이미지에 alt 가 하나씩인지 확인한다.
//   - wiki 밖의 글은 건드리지 않는다.

import { wpFetch, wpConfig } from './client.mjs';
import { saveContentBackup, altOnlyChange, alt하나씩인가 } from './fix-alt.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { 발행글전부 } from './index-audit.mjs';
import { 제목줄이기 } from './fix-alt.mjs';

const IMG = /<img\b[^>]*>/gi;
const ALT = /\s*\balt\s*=\s*(["'])([\s\S]*?)\1/gi;

/** 한 줄로 눌러서 보여준다. 여러 줄 alt 는 로그를 망친다. */
export const 한줄로 = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** 태그 안의 alt 값들을 나온 순서로 모은다. */
export function alt값들(tag) {
  return [...String(tag || '').matchAll(ALT)].map((m) => m[2]);
}

/**
 * alt 가 둘 이상인 <img> 에서 **마지막 하나만** 남긴다.
 *
 * @returns {{html: string, 고친것: Array<{전: string, 남긴것: string, 버린것: string[]}>}}
 */
export function 중복alt푼것(content, title = '') {
  const 고친것 = [];
  const 못가른것 = [];
  const html = String(content || '').replace(IMG, (tag) => {
    const 값 = alt값들(tag);
    if (값.length < 2) return tag;
    const 고름 = 남길것골라(값, title);
    if (!고름) { 못가른것.push(값); return tag; }
    // alt 를 모두 떼고, 고른 값 하나를 태그 끝에 다시 붙인다.
    const 벗긴것 = tag.replace(ALT, '');
    const 새태그 = 벗긴것.replace(/\s*(\/?)>$/, ` alt="${고름.남길것}"$1>`);
    고친것.push({ 전: tag, 후: 새태그, 남긴것: 고름.남길것, 버린것: 고름.버릴것, 근거: 고름.근거 });
    return 새태그;
  });
  return { html, 고친것, 못가른것 };
}

/**
 * 제목의 **첫 낱말**. 시설 이름이나 선수 이름이 여기 온다.
 *
 * 글 전체를 견주면 안 된다 — 제목을 나중에 고친 글이 많다. 1650 은 지금
 * '서평택골프클럽 파3 골프장 이용료·예약 방법' 인데 alt 는 옛 제목에서 나온
 * '서평택골프클럽 파3 골프장: 이용료 및 이용방법, …' 이다. 같은 시설이고
 * 맞는 alt 인데 글자가 안 맞는다. 바뀌지 않는 것은 앞의 이름이다.
 */
export function 제목머리(title) {
  const t = 제목줄이기(title).trim();
  const 머리 = t.split(/\s+/)[0] || '';
  return [...머리].length >= 2 ? 머리 : '';
}

/**
 * 남길 alt 를 고른 것이 맞나.
 *
 * 두 가지를 함께 본다.
 *   ① 남길 alt 가 제목의 첫 낱말로 시작한다 — 이 글의 설명이다
 *   ② 버릴 alt 는 그 낱말로 시작하지 **않는다** — 둘 다 그렇게 시작하면
 *      어느 쪽이 이 글의 것인지 기계가 가를 수 없다
 *
 * ②가 없으면 '서울 파크골프장' 처럼 머리가 흔한 글에서 엉뚱한 쪽을 남길 수
 * 있다. 가를 수 없는 글은 손으로 본다 — 835장을 눈 감고 고치지 않는다.
 */
/**
 * **여러 줄인가.** 이것이 버그의 메커니즘 그대로다.
 *
 * fix-alt 의 HAS_ALT 가 `(.*?)` 였고 `.` 은 줄바꿈을 못 넘는다. 그래서
 * **여러 줄로 적힌 alt 만** 없는 것으로 보고 하나 더 붙였다. 그리고
 * altFor() 가 만드는 alt 는 제목 한 줄이라 줄바꿈이 없다.
 *
 * 따라서 이 사고로 깨진 태그는 언제나 "여러 줄(옛것) + 한 줄(붙인 것)" 이다.
 * 추측이 아니라 기계적 사실이고, 그래서 제목 글자를 견주는 것보다 세다 —
 * 제목을 나중에 고친 글에도 그대로 통한다.
 */
export function 여러줄인가(alt) {
  return /[\r\n]/.test(String(alt || ''));
}

/**
 * 남길 alt 를 고른다. 못 고르면 null 이다.
 *
 *   ① 여러 줄이 버릴 것, 한 줄이 남길 것 — 버그의 메커니즘 그대로다.
 *      한 줄짜리가 **정확히 하나**일 때만 쓴다.
 *   ② ①로 안 갈리면 제목 첫 낱말로 가른다(남길것이맞나).
 *
 * 둘 다 안 되면 손으로 본다.
 */
export function 남길것골라(값들 = [], title = '') {
  const 값 = (Array.isArray(값들) ? 값들 : []).filter((v) => String(v || '').trim());
  if (값.length < 2) return null;

  const 한줄 = 값.filter((v) => !여러줄인가(v));
  const 여러줄 = 값.filter(여러줄인가);
  if (한줄.length === 1 && 여러줄.length === 값.length - 1) {
    return { 남길것: 한줄[0], 버릴것: 여러줄, 근거: '버릴 것은 여러 줄, 남길 것은 한 줄' };
  }

  const 마지막 = 값[값.length - 1];
  if (남길것이맞나(마지막, 값.slice(0, -1), title)) {
    return { 남길것: 마지막, 버릴것: 값.slice(0, -1), 근거: '제목 첫 낱말로 갈랐다' };
  }
  return null;
}

export function 남길것이맞나(남길, 버릴 = [], title = '') {
  const 머리 = 제목머리(title);
  if (!머리) return false;
  const 시작하나 = (v) => String(v || '').trim().startsWith(머리);
  if (!시작하나(남길)) return false;
  return !버릴.some(시작하나);
}

/** 글 하나를 고친다. */
export async function fixOne(postId, { apply = false } = {}) {
  const { data } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const title = data?.title?.raw ?? data?.title?.rendered ?? '';
  const content = data?.content?.raw ?? data?.content?.rendered ?? '';
  const 결과 = { id: postId, title };

  if (!손대도되는글인가(data?.link, wpConfig().base)) {
    return { ...결과, skip: 'wiki 밖의 글입니다 — 건드리지 않습니다' };
  }

  const { html, 고친것, 못가른것 } = 중복alt푼것(content, title);
  // 한 장이라도 못 가르면 그 글은 손으로 본다. 반만 고치면 어느 장이
  // 고쳐졌는지 나중에 알 수 없다.
  if (못가른것.length) {
    return {
      ...결과, 고친것, 어긋난것: 못가른것,
      skip: `남길 alt 를 기계가 가를 수 없습니다 (${못가른것.length}장) — 손으로 봅니다`,
    };
  }
  if (!고친것.length) return { ...결과, skip: 'alt 가 둘인 이미지가 없습니다' };
  if (!alt하나씩인가(html)) throw new Error('고친 뒤에도 alt 가 둘입니다 — 저장하지 않습니다');
  if (!altOnlyChange(content, html)) {
    throw new Error('alt 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = '';
  if (apply) {
    backup = saveContentBackup({ id: postId, status: data?.status, title, slug: data?.slug, content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: html } });
  }
  return { ...결과, 고친것, backup, applied: apply };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  // 번호를 적지 않고 전체를 고치는 길. 막아 두었던 자리를 여는 대신,
  // **글마다 하는 남길것이맞나 확인을 통과한 것만** 고친다 — 실제 안전장치는
  // 번호를 적었는지가 아니라 그 확인이다. 통과 못 한 글은 건너뛰고 번호를 찍는다.
  const 전부 = args.includes('--전부');
  let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🖼 한 이미지의 alt 둘을 하나로 (${apply ? '실제 적용' : '미리보기'} · 비용 0원)`);
  console.log('────────────────────────────────────────────────────────');

  if (!ids.length) {
    // 글 번호를 안 주면 전체를 훑는다. 몇 편이 깨졌는지 세는 것이 먼저다.
    const 글 = await 발행글전부();
    console.log(`\n발행된 글 ${글.length}편을 훑습니다`);
    ids = 글.map((p) => p.id);
    if (apply && !전부) {
      console.log('\n번호 없는 전체 적용은 막아 두었습니다 — 미리보기로 먼저 세고, 글 번호를 적거나 --전부 를 붙이세요.\n');
      process.exitCode = 1;
      return;
    }
  }

  let 바뀐이미지 = 0;
  const 어긋난글 = [];
  const 고친글 = [];
  for (const id of ids) {
    let r;
    try {
      r = await fixOne(id, { apply });
    } catch (e) {
      console.log(`\n   ${id}  ❌ ${e.message}`);
      process.exitCode = 1;
      continue;
    }
    if (r.skip) {
      // 전제가 깨진 글은 전체 훑기에서도 반드시 보여준다.
      if (r.어긋난것) {
        어긋난글.push(r);
        console.log(`\n   ${r.id}  ${String(r.title).slice(0, 46)}\n        ⚠️  ${r.skip}`);
        for (const 값 of r.어긋난것.slice(0, 2)) console.log(`            고르지 못한 alt: ${값.map((v) => 한줄로(v).slice(0, 44)).join(' | ')}`);
        continue;
      }
      // 멀쩡한 글은 한 줄씩 찍지 않는다 — 600줄이 된다.
      if (ids.length <= 20) console.log(`\n   ${r.id}  ${String(r.title).slice(0, 46)}\n        ⏭️  ${r.skip}`);
      continue;
    }
    고친글.push(r.id);
    바뀐이미지 += r.고친것.length;
    console.log(`\n   ${r.id}  ${String(r.title).slice(0, 46)}`);
    console.log(`        alt 가 둘인 이미지 ${r.고친것.length}장`);
    r.고친것.forEach((c, i) => {
      console.log(`        [${i + 1}] ✅ 남길 alt: ${한줄로(c.남긴것).slice(0, 90)}  (${c.근거})`);
      for (const b of c.버린것) console.log(`        [${i + 1}] ❌ 버릴 alt: ${한줄로(b).slice(0, 90)}`);
    });
    if (r.backup) console.log(`        💾 원본 보관: ${r.backup}`);
  }

  console.log(`\n${apply ? '적용했습니다' : '미리보기입니다 — 적용하려면 글 번호와 --apply 를 붙입니다'}.`);
  if (어긋난글.length) {
    console.log(`\n⚠️ 남길 alt 를 기계가 가를 수 없는 글 ${어긋난글.length}편은 건너뛰었습니다 — 손으로 봅니다`);
    console.log(`   ${어긋난글.map((r) => r.id).join(' ')}`);
  }
  if (apply && 고친글.length) {
    console.log(`\n고친 글 ${고친글.length}편: ${고친글.join(' ')}`);
  }
  console.log(`\n▶ 글 ${고친글.length}편의 이미지 ${바뀐이미지}장에서 alt 가 둘입니다${apply ? ' — 하나로 돌렸습니다' : ''}`);
  console.log(`   전제가 깨진 글 ${어긋난글.length}편\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (await import('../utils/env.mjs')).loadEnv();
  await main();
}
