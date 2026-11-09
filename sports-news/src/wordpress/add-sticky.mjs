#!/usr/bin/env node
/**
 * 쿠팡 하단 고정 바를 글에 넣는다 / 뺀다. (2026-11-07)
 *
 * ── 왜 ─────────────────────────────────────────────────────
 * 쿠팡 수익이 사실상 0 이었다. 운영자가 확인해 보니 그나마 잡힌 구매도
 * 거의 본인 집 구매였다. 글마다 쿠팡 블록이 **첫 문단 뒤 하나뿐**이라
 * 독자가 답을 읽고 나가는 지점에는 아무것도 없다.
 *
 * 운영자가 전면 팝업을 꺼냈지만 그쪽은 **구글이 순위를 깎는 것이 확인된
 * 방식**이다(모바일 검색 결과 직후 콘텐츠를 가리는 인터스티셜). 그래서
 * 화면을 가리지 않는 **하단 고정 바**로 간다 — 2026-11-07 운영자 선택.
 *
 * ── 지키는 선 ───────────────────────────────────────────────
 *   - 쿠팡 코드(iframe 위젯)는 **제휴사가 준 그대로** 쓴다. 숫자 하나
 *     바꾸지 않는다(지시서). 감싸는 상자와 닫기 버튼만 우리 것이다.
 *   - **닫기 버튼을 단다.** 한 번 닫으면 그 방문 동안 다시 뜨지 않는다.
 *   - 바 높이만큼 본문 아래 여백을 줘서 **마지막 줄을 덮지 않는다.**
 *   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
 *   - 바 말고 **나머지 본문이 글자 하나까지 같아야** 저장한다.
 *   - 이미 있으면 건너뛴다. 두 번 돌려도 하나다.
 *   - `--빼기` 로 되돌린다. 넣은 것을 지우는 길을 같이 둔다.
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

/** 바를 알아보는 표식. 우리가 붙인 id 다. */
export const 표식 = 'id="cpst"';

export function 바HTML() {
  const p = path.join(ROOT, 'config/ad-coupang-sticky.html');
  return fs.readFileSync(p, 'utf8').trim();
}

export function 바블록(html = 바HTML()) {
  return `<!-- wp:html -->\n${html}\n<!-- /wp:html -->`;
}

/** 본문에 바가 이미 있나. */
export function 바있나(content) {
  return String(content || '').includes(표식);
}

/** 본문에 들어 있는 바 덩어리를 찾는 정규식. 빼기와 갈아끼우기가 함께 쓴다. */
export const 바덩어리 = /<!-- wp:html -->\s*<div id="cpst"[\s\S]*?<\/script>\s*<!-- \/wp:html -->/g;

/**
 * 본문 끝에 바를 붙인 결과. **이미 있고 모양이 다르면 그 자리에서 바꾼다.**
 * 이미 있고 모양이 같으면 null (할 일이 없다).
 *
 * ⚠️ 2026-11-09 에 바꾸는 길이 없어서 막혔다.
 *
 *    `config/ad-coupang-sticky.html` 을 고쳐 **애드센스 광고를 덮지 않게**
 *    했는데(겹치면 우리 바를 숨긴다), 이 함수가 "이미 있으면 null" 이라
 *    **이미 발행된 글에는 옛 바가 그대로 남았다.** 고친 의미가 없는 상태다.
 *
 *    빼고 다시 넣는 2단계로 할 수도 있었다. 하지만 중간에 실패하면 그 글이
 *    **쿠팡 광고를 잃은 채로** 남는다. 한 번에 바꾸는 쪽이 안전하다 —
 *    배너 쪽(`applyBanner`)이 이미 그렇게 하고 있어 생각도 맞춰진다.
 *
 * 이렇게 두면 **앞으로 바를 고칠 때마다 '넣기' 를 다시 돌리면 퍼진다.**
 * 새 모드를 만들지 않는다 — 모드가 늘면 어느 것을 돌려야 할지 헷갈린다.
 */
export function 바넣기(content, html = 바HTML()) {
  const s = String(content || '');
  const 넣을것 = 바블록(html);
  if (바있나(s)) {
    const 있는것 = s.match(바덩어리);
    // 덩어리를 못 집으면 건드리지 않는다. 표식은 있는데 모양이 예상과
    // 다른 것이므로, 어림짐작으로 덮어쓰면 본문을 망친다.
    if (!있는것 || !있는것.length) return null;
    if (있는것.every((덩이) => 덩이 === 넣을것)) return null;
    return s.replace(바덩어리, 넣을것);
  }
  return `${s.trimEnd()}\n\n${넣을것}`;
}

/** 바를 들어낸 결과. 없으면 null. */
export function 바빼기(content) {
  const s = String(content || '');
  if (!바있나(s)) return null;
  // wp:html 로 감싼 덩어리째 들어낸다. 정규식은 넣기와 **같은 것**을 쓴다 —
  // 두 벌을 두면 한쪽만 고쳐져 넣기와 빼기가 어긋난다.
  const after = s.replace(바덩어리, '').trimEnd();
  if (바있나(after)) return null;
  return after;
}

/** 바 말고 다른 것이 바뀌지 않았는지. */
export function 바만바뀌었나(before, after) {
  return 글자만(바빼기(after) ?? after) === 글자만(바빼기(before) ?? before);
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
  let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  log.section(`${빼기 ? '🧹 쿠팡 하단 고정 바를 뺍니다' : '📌 쿠팡 하단 고정 바를 넣습니다'}${apply ? '' : ' (미리보기 · 저장하지 않습니다)'}`);

  // 발행 글 전부를 도는 길. 글 번호를 적는 쪽이 기본이고, 전체는
  // **--전체 를 분명히 적었을 때만** 돈다. 700편을 실수로 건드리지 않는다.
  if (전체) {
    const 글 = await 발행글전부();
    ids = 글.map((p) => p.id);
    log.info(`발행 ${ids.length}편을 돕니다`);
  }

  if (!ids.length) {
    log.warn('글 번호를 적어주세요. 예: 11953 11909   (전부 하려면 --전체)');
    process.exitCode = 1;
    return;
  }

  const base = wpConfig().base;
  const html = 빼기 ? '' : 바HTML();
  let 센것 = 0;
  // 추가·교체·빼기를 따로 센다. 합만 보면 무엇이 일어나는지 모른다.
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
    const after = 빼기 ? 바빼기(content) : 바넣기(content, html);
    const 제목 = String(post.title?.raw || '').slice(0, 40);
    if (after === null) {
      log.info(`[${id}] ${빼기 ? '뺄 바가 없습니다' : '이미 있습니다'} — ${제목}`);
      continue;
    }
    if (!바만바뀌었나(content, after)) {
      log.warn(`[${id}] 바 말고 다른 내용이 바뀝니다 — 저장하지 않습니다`);
      process.exitCode = 1;
      continue;
    }
    // ⚠️ **추가와 교체를 가려서 찍는다.** (2026-11-09)
    //
    //    전에는 둘 다 "바를 넣습니다" 였다. 그래서 전체 미리보기에 "719편이
    //    바뀝니다 — 바를 넣습니다" 라고 찍혔고, 나는 그것을 **사이트 전체에
    //    광고를 새로 깔는 것**으로 읽고 멈췄다. 사실은 717편이 이미 바를
    //    가지고 있었고(빼기 미리보기로 확인), 719 는 **교체 717 + 추가 2**
    //    였다. 내가 하려던 바로 그 일이었는데 한 번을 더 돌려야 알았다.
    //
    //    미리보기는 사람이 "밀어도 되나" 를 가리는 자리다. 2편 추가와
    //    719편 배포가 같은 글자로 찍히면 그 판단을 할 수 없다.
    const 한일 = 빼기 ? '뺍니다' : (바있나(content) ? '바꿉니다 (옛 바 → 새 바)' : '새로 넣습니다');
    log.info(`   [${id}] 바를 ${한일} — ${제목}`);
    if (빼기) 뺀것 += 1;
    else if (바있나(content)) 바꾼것 += 1;
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
  // 합과 함께 **무엇이 몇 편인지** 적는다. 이 줄이 없어서 한 번 헷갈렸다.
  const 쪼갠것 = 빼기
    ? `빼기 ${뺀것}편`
    : `옛 바 교체 ${바꾼것}편 · 새로 넣기 ${넣은것}편`;
  log.info(apply
    ? `${센것}편을 고쳤습니다 (${쪼갠것}). 주소는 그대로입니다.`
    : `${센것}편이 바뀝니다 (${쪼갠것}). 실제로 적용하려면 --apply 를 붙이세요.`);
  if (!빼기) log.info('되돌리려면 같은 모드에 --빼기 를 붙입니다.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
