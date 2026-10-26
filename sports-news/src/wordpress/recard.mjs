#!/usr/bin/env node
// 이미 올라간 글의 **텍스트 카드 이미지만** 다시 만들어 갈아끼운다.
//
//   node src/wordpress/recard.mjs 11265
//   node src/wordpress/recard.mjs 11265 --apply
//
// AI를 부르지 않는다. 카드는 글의 제목과 소제목으로만 그린다. 0원이다.
//
// 왜 필요한가 — 2026-10-26 에 당한 일
//   워크플로의 '한글 폰트 설치' 단계가 apt 가 매달려 5분 타임아웃에 걸렸다.
//   `continue-on-error: true` 와 `|| echo` 때문에 단계는 **성공으로 찍혔고**,
//   폰트 없이 그려진 카드가 글 11265 에 통째로 두부(□)로 올라갔다.
//   한글 자리마다 유니코드 코드포인트 상자가 그려진 그림이다.
//   그 상태로 발행까지 됐다.
//
//   글을 다시 쓸 일이 아니다. 본문은 멀쩡하고 **그림만 다시 구우면 된다.**
//   그래서 글은 건드리지 않고 이미지 자리만 바꾼다.
//
// 지키는 선
//   - 미리보기가 기본이다.
//   - **한글 폰트가 없으면 아무것도 하지 않는다.** 같은 사고를 두 번 내지 않는다.
//   - 본문에서 바뀌는 것은 `<img>` 의 src 뿐이다. 소제목·문단·광고·배너는
//     글자 하나도 건드리지 않는다. 보내기 전에 그것을 확인한다.
//   - 제목·슬러그·발행상태는 보내지 않는다.
//   - 고치기 전 원본 본문을 파일로 남긴다.
//   - wiki 밖의 글은 건드리지 않는다.

import { wpFetch, wpConfig } from './client.mjs';
import { saveContentBackup, 가까운소제목 } from './fix-alt.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { renderCard, 한글폰트있나 } from '../images/textcard.mjs';
import { uploadMedia, safeFileName } from '../images/upload.mjs';
import { log } from '../utils/logger.mjs';

/** 본문의 `<img ... src="...">` 를 앞에서부터 찾는다. */
export function 이미지자리들(html) {
  const out = [];
  const re = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    out.push({ 전체: m[0], src: m[1], 시작: m.index, 끝: m.index + m[0].length });
  }
  return out;
}

/**
 * 이미지마다 무슨 글자로 카드를 그릴지 정한다.
 *
 * 첫 이미지는 대표 이미지라 **글 제목**을 쓴다. 그 뒤 이미지는 자기보다
 * 앞에 있는 소제목 중 **가장 가까운 것**을 쓴다 — 넣을 때 embed 가 그렇게
 * 놓았기 때문이다. 앞에 소제목이 없으면 제목으로 떨어진다.
 *
 * 소제목을 찾는 일은 fix-alt 의 `가까운소제목` 을 그대로 쓴다. 같은 일을
 * 두 벌로 만들면 둘이 어긋난다 — alt 를 채울 때와 카드를 구울 때 서로 다른
 * 소제목을 골라 버리면 그림과 설명이 따로 논다.
 */
export function 카드글자정하기(html, 제목) {
  return 이미지자리들(html).map((img, i) => {
    if (i === 0) return { ...img, 글자: 제목, 자리: 'hero' };
    const 소제목 = 가까운소제목(html, img.시작);
    return { ...img, 글자: 소제목 || 제목, 자리: 'section' };
  });
}

/** src 하나만 바꾼다. 태그의 나머지(alt·class)는 그대로 둔다. */
export function src바꾸기(html, 옛주소, 새주소) {
  return String(html).split(`src="${옛주소}"`).join(`src="${새주소}"`);
}

/** src 말고 다른 것이 바뀌지 않았는지 본다. */
export function src만바뀌었나(전, 후) {
  const 지우기 = (s) => String(s).replace(/\bsrc="[^"]*"/g, 'src="…"');
  return 지우기(전) === 지우기(후);
}

export async function recard(ids, { apply = false } = {}) {
  const { base } = wpConfig();
  log.section(`🖼️ 카드 이미지를 다시 굽습니다${apply ? '' : ' (미리보기 — 저장하지 않습니다)'}`);
  log.info(`대상 사이트: ${base.replace(/^https?:\/\//, '')}  ← 여기 글만 손댑니다`);

  // 폰트가 없다고 여기서 통째로 멈추지는 않는다. 막는 일은 renderCard 가
  // **카드마다** 한다 — 한글이 든 카드만 막고 영문 카드는 그대로 굽는다.
  // 여기서는 한 번만 일러 둔다. 그래야 실패가 여러 줄 나와도 이유가 보인다.
  if (!한글폰트있나()) {
    log.warn('한글 폰트가 없습니다 — 한글이 든 카드는 건너뜁니다 (두부(□)를 올리지 않습니다)');
  }

  let 고친글 = 0;
  for (const id of ids) {
    const { data: post } = await wpFetch(`/wp/v2/posts/${id}`, { query: { context: 'edit' } });
    if (!손대도되는글인가(post?.link, base)) {
      log.warn(`   ⏭  ${id} 이 사이트 글이 아닙니다 — 건너뜁니다`);
      continue;
    }
    const 본문 = post?.content?.raw || '';
    const 할것 = 카드글자정하기(본문, post?.title?.raw || '');
    if (!할것.length) {
      log.info(`   ⏭  ${id} 바꿀 이미지가 없습니다`);
      continue;
    }

    log.info(`\n   [${id}] ${(post?.title?.raw || '').slice(0, 50)}`);
    let 새본문 = 본문;
    let 대표 = null;
    let 바꾼수 = 0;

    for (const [i, 것] of 할것.entries()) {
      log.info(`      ${것.자리} ← "${것.글자.slice(0, 40)}"`);
      if (!apply) { 바꾼수 += 1; continue; }
      try {
        const buffer = await renderCard({
          title: 것.글자,
          label: 것.자리 === 'hero' ? '' : '',
          kind: 것.자리,
          seed: String(post?.slug || id),
        });
        const up = await uploadMedia({
          buffer,
          fileName: safeFileName(`recard-${id}-${i}`),
          alt: '',
        });
        새본문 = src바꾸기(새본문, 것.src, up.url);
        if (i === 0) 대표 = up.id;
        바꾼수 += 1;
        log.ok(`      올렸습니다 (미디어 ID ${up.id})`);
      } catch (err) {
        log.warn(`      실패 — ${err.message}`);
      }
    }

    if (!apply) { 고친글 += 1; continue; }
    if (!바꾼수 || 새본문 === 본문) { log.warn(`   ${id} 바뀐 것이 없습니다`); continue; }
    if (!src만바뀌었나(본문, 새본문)) {
      log.warn(`   ❌ ${id} src 말고 다른 것이 바뀝니다 — 건너뜁니다`);
      process.exitCode = 1;
      continue;
    }

    const 백업 = saveContentBackup(post);
    const body = { content: 새본문 };
    if (대표) body.featured_media = 대표;
    await wpFetch(`/wp/v2/posts/${id}`, { method: 'POST', body });
    고친글 += 1;
    log.ok(`   ✅ ${id} 이미지 ${바꾼수}장을 갈아끼웠습니다`);
    log.info(`      원본 백업: ${백업}`);
  }

  log.info(`\n${고친글}편${apply ? '의 카드를 다시 구웠습니다' : ' 바뀔 예정입니다'}.`);
  if (!apply) log.info('실제로 바꾸려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
  log.info('※ 본문에서 바뀌는 것은 <img> 의 src 뿐입니다. 제목·주소·발행상태는 보내지 않습니다.');
}

async function main() {
  const args = process.argv.slice(2);
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
  if (!ids.length) {
    log.fail('글 번호를 적어주세요', new Error('예: node src/wordpress/recard.mjs 11265'));
    process.exitCode = 1;
    return;
  }
  await recard(ids, { apply: args.includes('--apply') });
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
