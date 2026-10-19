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
export function 중복alt푼것(content) {
  const 고친것 = [];
  const html = String(content || '').replace(IMG, (tag) => {
    const 값 = alt값들(tag);
    if (값.length < 2) return tag;
    const 남길값 = 값[값.length - 1];
    // alt 를 모두 떼고, 마지막 값 하나를 태그 끝에 다시 붙인다.
    const 벗긴것 = tag.replace(ALT, '');
    const 새태그 = 벗긴것.replace(/\s*(\/?)>$/, ` alt="${남길값}"$1>`);
    고친것.push({ 전: tag, 남긴것: 남길값, 버린것: 값.slice(0, -1) });
    return 새태그;
  });
  return { html, 고친것 };
}

/**
 * 남길 alt 가 **이 글 제목에서 나온 것**인지 본다.
 *
 * "마지막 alt 를 남긴다"는 규칙은 fix-alt 가 제목에서 만든 alt 를 태그 끝에
 * 붙였다는 전제에 기댄다. 349편 835장에 손대기 전에 그 전제가 349편 전부에서
 * 참인지 세야 한다 — 네 편 보고 835장을 고칠 수는 없다.
 *
 * fix-alt 의 altFor() 는 `제목줄이기(title)` 로 시작하는 alt 를 만든다.
 * 그걸로 시작하지 않으면 전제가 깨진 글이다.
 */
export function 제목에서나왔나(alt, title) {
  const 머리 = 제목줄이기(title);
  if (!머리) return false;
  return String(alt || '').trim().startsWith(머리);
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

  const { html, 고친것 } = 중복alt푼것(content);
  if (!고친것.length) return { ...결과, skip: 'alt 가 둘인 이미지가 없습니다' };

  // 전제가 깨진 자리를 센다. 하나라도 있으면 그 글은 손으로 본다.
  const 어긋난것 = 고친것.filter((c) => !제목에서나왔나(c.남긴것, title));
  if (어긋난것.length) {
    return { ...결과, 고친것, 어긋난것, skip: `남길 alt 가 제목에서 나온 것이 아닙니다 (${어긋난것.length}장) — 손으로 봅니다` };
  }
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
  let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🖼 한 이미지의 alt 둘을 하나로 (${apply ? '실제 적용' : '미리보기'} · 비용 0원)`);
  console.log('────────────────────────────────────────────────────────');

  if (!ids.length) {
    // 글 번호를 안 주면 전체를 훑는다. 몇 편이 깨졌는지 세는 것이 먼저다.
    const 글 = await 발행글전부();
    console.log(`\n발행된 글 ${글.length}편을 훑습니다`);
    ids = 글.map((p) => p.id);
    if (apply) {
      console.log('\n전체 적용은 막아 두었습니다 — 미리보기로 몇 편인지 먼저 세고, 글 번호를 적어 적용하세요.\n');
      process.exitCode = 1;
      return;
    }
  }

  let 바뀐글 = 0;
  let 바뀐이미지 = 0;
  const 어긋난글 = [];
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
        for (const c of r.어긋난것.slice(0, 2)) console.log(`            남길 alt: ${한줄로(c.남긴것).slice(0, 80)}`);
        continue;
      }
      // 멀쩡한 글은 한 줄씩 찍지 않는다 — 600줄이 된다.
      if (ids.length <= 20) console.log(`\n   ${r.id}  ${String(r.title).slice(0, 46)}\n        ⏭️  ${r.skip}`);
      continue;
    }
    바뀐글 += 1;
    바뀐이미지 += r.고친것.length;
    console.log(`\n   ${r.id}  ${String(r.title).slice(0, 46)}`);
    console.log(`        alt 가 둘인 이미지 ${r.고친것.length}장`);
    r.고친것.forEach((c, i) => {
      console.log(`        [${i + 1}] ✅ 남길 alt: ${한줄로(c.남긴것).slice(0, 90)}`);
      for (const b of c.버린것) console.log(`        [${i + 1}] ❌ 버릴 alt: ${한줄로(b).slice(0, 90)}`);
    });
    if (r.backup) console.log(`        💾 원본 보관: ${r.backup}`);
  }

  console.log(`\n${apply ? '적용했습니다' : '미리보기입니다 — 적용하려면 글 번호와 --apply 를 붙입니다'}.`);
  if (어긋난글.length) {
    console.log(`\n⚠️ 남길 alt 가 제목에서 나오지 않은 글 ${어긋난글.length}편은 건너뛰었습니다 — 손으로 봅니다`);
    console.log(`   ${어긋난글.map((r) => r.id).join(' ')}`);
  }
  console.log(`\n▶ 글 ${바뀐글}편의 이미지 ${바뀐이미지}장에서 alt 가 둘입니다${apply ? ' — 하나로 돌렸습니다' : ''}`);
  console.log(`   전제가 깨진 글 ${어긋난글.length}편\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (await import('../utils/env.mjs')).loadEnv();
  await main();
}
