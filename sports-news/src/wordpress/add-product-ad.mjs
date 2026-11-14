#!/usr/bin/env node
/**
 * 쿠팡 상품 광고를 **본문 안**에 넣는다 / 뺀다. (2026-11-14)
 *
 * ── 왜 ─────────────────────────────────────────────────────
 * 2026-11-14 에 운영자가 쿠팡 실적을 보여줬다. 숫자를 읽어 보니
 * **구매 19건이 전부 운영자 가족 구매**였다. 독자 구매는 아직 0 건이다.
 * 전환율 118% 는 그래서 나온 가짜 신호이고, 실제로 검증된 것은 없다.
 *
 * 지금 쿠팡 광고는 **하단 고정 바의 캐러셀 하나뿐**이고, 거기 도는 상품은
 * 글 내용과 아무 상관이 없다. 운영자가 상품 넷을 직접 골라 주면서
 * **"전부 범용성 있는 상품으로 고정하자"** 고 정했다(2026-11-14).
 *
 * ── 왜 하단 바가 아니라 본문인가 ────────────────────────────
 * 받은 태그가 **120×240** 이다. 지금 바의 캐러셀은 140 이라, 바에 넣으면
 * 고지문·여백까지 약 300px 이 된다. 모바일 세로가 640~740 이니
 * **화면의 40% 를 광고가 덮는다.** 운영자가 건 광고 원칙 3번
 * ("화면을 가로막지 않는다")에 정면으로 걸린다.
 *
 * 본문은 스크롤로 지나가는 자리라 240 이 문제가 되지 않는다. 그리고
 * **하단 바를 그대로 두면 바뀌는 것이 본문 하나뿐**이라, 다음에 클릭이
 * 오르면 그것이 본문 덕인지 바로 갈린다 (한 번에 하나만 바꾼다).
 *
 * ── 지키는 선 ───────────────────────────────────────────────
 *   - 쿠팡 iframe 은 **제휴사가 준 그대로** 쓴다. 숫자 하나 바꾸지 않는다.
 *     감싸는 상자와 고지문만 우리 것이다.
 *   - **고지문을 이 블록 자체에 단다.** 하단 바와 나눠 쓰지 않는다 —
 *     바에는 닫기 버튼이 있어서, 독자가 바를 닫으면 고지문이 같이 사라진다.
 *     그 화면에는 광고만 남고 고지가 없다(공정위 심사지침 위반).
 *   - 고지문은 **광고보다 앞에, 12px·#555**(흰 바탕 명암비 7.46). 하단 바와
 *     같은 기준이다.
 *   - 자리는 **「🔥 정리하면」 바로 앞**. 본문을 다 읽고 요약으로 넘어가는
 *     쉼표 자리라 읽기를 끊지 않는다. 없으면 해시태그 앞, 그것도 없으면 끝.
 *   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
 *   - 광고 말고 **나머지 본문이 글자 하나까지 같아야** 저장한다.
 *   - 이미 있으면 모양이 다를 때만 그 자리에서 갈아끼운다. 두 번 돌려도 하나다.
 *   - `--빼기` 로 되돌린다. 719편에 까는 일이라 걷어내는 길을 같이 둔다.
 *   - wiki 밖의 글은 건드리지 않는다.
 *
 * 미리보기가 기본이다. `--apply` 를 붙여야 저장한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { wpFetch, wpConfig } from './client.mjs';
import { log } from '../utils/logger.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { 발행글전부 } from './index-audit.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { ROOT } from '../utils/env.mjs';

/** 블록을 알아보는 표식. 우리가 붙인 id 다. */
export const 표식 = 'id="cppd"';

export function 광고HTML() {
  const p = path.join(ROOT, 'config/ad-coupang-products.html');
  return fs.readFileSync(p, 'utf8').trim();
}

export function 광고블록(html = 광고HTML()) {
  return `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`;
}

export function 광고있나(content) {
  return String(content || '').includes(표식);
}

/** 본문에 들어 있는 광고 덩어리. 넣기·빼기·갈아끼우기가 **함께** 쓴다. */
export const 광고덩어리 = /<!-- wp:html -->\s*<div id="cppd"[\s\S]*?<\/div>\s*<\/div>\s*<!-- \/wp:html -->\s*/g;

/**
 * 넣을 자리를 고르는 앵커들. **본문이 끝나는 지점**을 찾는 것이 목표다.
 *
 * ⚠️ 2026-11-14 에 한 번 틀렸다. 처음에는 「🔥 정리하면」과 해시태그만
 *    봤는데, 그 둘은 **새로 쓴 글에만** 있다. 전체 미리보기를 돌리니
 *    449편이 '본문 끝' 으로 떨어졌고, 그 자리는 하단 고정 바와
 *    「같이 읽을 글」 블록보다도 **뒤**였다. 글의 끝의 끝이라 눌릴 리가
 *    없다. 기존 글을 열어 보고 공통 앵커를 찾아 고친 것이 아래다.
 */
/** 「자주 묻는 질문」 소제목. 이모지가 붙기도 한다. 가장 흔한 앵커다. */
const 자주묻는질문 = /<!-- wp:heading -->\s*<h2>[^<]{0,4}\s*자주 묻는 질문/;
/** 「🔥 정리하면」 소제목. 새로 쓴 글에 있다. */
const 정리하면 = /<!-- wp:heading -->\s*<h2>🔥 정리하면<\/h2>/;
/** 해시태그 문단. */
const 해시태그 = /<!-- wp:paragraph -->\s*<p>#[^<]/;
/** 본문 뒤에 붙는 wp:html 덩어리 하나(하단 바·관련글 상자 등). */
const 꼬리덩이 = /<!-- wp:html -->[\s\S]*?<!-- \/wp:html -->\s*$/;

/**
 * 본문이 실제로 끝나는 지점. 끝에서부터 wp:html 덩어리를 걷어낸 자리다.
 *
 * 하단 고정 바와 「같이 읽을 글」 상자가 본문 뒤에 wp:html 로 붙어 있어서,
 * 그냥 '맨 끝' 에 넣으면 광고가 그것들 **뒤**로 간다.
 */
export function 꼬리앞(content) {
  let cur = String(content || '').trimEnd();
  for (;;) {
    const m = cur.match(꼬리덩이);
    if (!m) break;
    cur = cur.slice(0, m.index).trimEnd();
  }
  return cur.length;
}

/**
 * 어디에 넣을지 고른 결과. 사람이 읽을 이름도 같이 돌려준다.
 *
 * 「자주 묻는 질문」을 가장 앞에 둔다 — 본문을 다 읽고 부가 정보로
 * 넘어가는 자리라, 읽기를 끊지 않으면서도 끝의 끝이 아니다.
 */
export function 넣을자리(content) {
  const s = String(content || '');
  let m = s.match(자주묻는질문);
  if (m) return { at: m.index, 이름: '자주 묻는 질문 앞' };
  m = s.match(정리하면);
  if (m) return { at: m.index, 이름: '정리하면 앞' };
  m = s.match(해시태그);
  if (m) return { at: m.index, 이름: '해시태그 앞' };
  const 꼬리 = 꼬리앞(s);
  if (꼬리 < s.trimEnd().length) return { at: 꼬리, 이름: '하단 바 앞' };
  return { at: s.trimEnd().length, 이름: '본문 끝' };
}

/**
 * 광고를 넣은 결과. 이미 있고 모양이 같으면 null (할 일이 없다).
 * 이미 있고 모양이 다르면 **그 자리에서** 갈아끼운다 — 자리를 옮기지 않는다.
 * 상품을 바꿀 때 '넣기' 를 다시 돌리면 퍼지게 하려는 것이다.
 */
export function 광고넣기(content, html = 광고HTML()) {
  const s = String(content || '');
  const 넣을것 = 광고블록(html);
  if (광고있나(s)) {
    const 있는것 = s.match(광고덩어리);
    // 덩어리를 못 집으면 건드리지 않는다. 표식은 있는데 모양이 예상과
    // 달라서, 어림짐작으로 덮어쓰면 본문을 망친다.
    if (!있는것 || !있는것.length) return null;
    if (있는것.every((덩이) => 덩이.trim() === 넣을것)) return null;
    return s.replace(광고덩어리, `${넣을것}\n\n`);
  }
  const { at } = 넣을자리(s);
  const 앞 = s.slice(0, at).trimEnd();
  const 뒤 = s.slice(at).trimStart();
  return 뒤 ? `${앞}\n\n${넣을것}\n\n${뒤}` : `${앞}\n\n${넣을것}`;
}

/** 광고를 들어낸 결과. 없으면 null. */
export function 광고빼기(content) {
  const s = String(content || '');
  if (!광고있나(s)) return null;
  const after = s.replace(광고덩어리, '').trimEnd();
  if (광고있나(after)) return null;
  return after;
}

/** 광고 말고 다른 것이 바뀌지 않았는지. */
export function 광고만바뀌었나(before, after) {
  return 글자만(광고빼기(after) ?? after) === 글자만(광고빼기(before) ?? before);
}

function 글자만(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const 빼기 = args.includes('--빼기');
  const 전체 = args.includes('--전체');
  // 광고를 **이미 가진 글만** 고친다. 상품을 바꿀 때 쓴다.
  const 갱신만 = args.includes('--갱신만');
  let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  log.section(`${빼기 ? '🧹 본문 쿠팡 상품 광고를 뺍니다' : '🛒 본문에 쿠팡 상품 광고를 넣습니다'}${apply ? '' : ' (미리보기 · 저장하지 않습니다)'}`);

  if (전체) {
    const 글 = await 발행글전부();
    ids = 글.map((p) => p.id);
    log.info(`발행 ${ids.length}편을 돕니다`);
  }

  if (!ids.length) {
    log.warn('글 번호를 적어주세요. 예: 20556 20559   (전부 하려면 --전체)');
    process.exitCode = 1;
    return;
  }

  const base = wpConfig().base;
  const html = 빼기 ? '' : 광고HTML();
  let 센것 = 0;
  let 넣은것 = 0;
  let 바꾼것 = 0;
  let 뺀것 = 0;
  for (const id of ids) {
    let post;
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${id}`, {
        query: { context: 'edit', _fields: 'id,link,title,content' },
      });
      post = data;
    } catch (err) {
      log.warn(`${id} 를 열지 못했습니다 — ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    if (!손대도되는글인가(post?.link, base)) {
      log.warn(`${id} 는 wiki 밖의 글입니다 — 건너뜁니다`);
      continue;
    }
    const content = post.content?.raw ?? '';
    if (갱신만 && !빼기 && !광고있나(content)) continue;
    const after = 빼기 ? 광고빼기(content) : 광고넣기(content, html);
    const 제목 = String(post.title?.raw || '').slice(0, 40);
    if (after === null) {
      log.info(`[${id}] ${빼기 ? '뺄 광고가 없습니다' : '이미 있습니다'} — ${제목}`);
      continue;
    }
    if (!광고만바뀌었나(content, after)) {
      log.warn(`[${id}] 광고 말고 다른 내용이 바뀝니다 — 저장하지 않습니다`);
      process.exitCode = 1;
      continue;
    }
    // 추가·교체·빼기를 가려서 찍는다. 합만 보면 **새로 까는 것인지
    // 갈아끼우는 것인지** 알 수 없고, 그 판단을 못 하면 미리보기가 쓸모없다.
    const 한일 = 빼기
      ? '뺍니다'
      : (광고있나(content) ? '바꿉니다 (옛 상품 → 새 상품)' : `새로 넣습니다 — ${넣을자리(content).이름}`);
    log.info(`   [${id}] 광고를 ${한일} — ${제목}`);
    if (빼기) 뺀것 += 1;
    else if (광고있나(content)) 바꾼것 += 1;
    else 넣은것 += 1;
    센것 += 1;
    if (!apply) continue;
    await saveContentBackup(post);
    await wpFetch(`/wp/v2/posts/${id}`, { method: 'POST', body: { content: after } });
  }

  if (!센것) {
    log.info('바뀔 글이 없습니다.');
    return;
  }
  const 쪼갠것 = 빼기
    ? `빼기 ${뺀것}편`
    : `옛 상품 교체 ${바꾼것}편 · 새로 넣기 ${넣은것}편`;
  log.info(apply
    ? `${센것}편을 고쳤습니다 (${쪼갠것}). 주소는 그대로입니다.`
    : `${센것}편이 바뀝니다 (${쪼갠것}). 실제로 적용하려면 --apply 를 붙이세요.`);
  if (!빼기) log.info('되돌리려면 같은 모드에 --빼기 를 붙입니다.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
