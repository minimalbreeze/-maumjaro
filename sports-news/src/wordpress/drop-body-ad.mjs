#!/usr/bin/env node
/**
 * 글 중간의 **옛 쿠팡 블록**을 뺀다. (2026-11-14)
 *
 * ── 왜 ─────────────────────────────────────────────────────
 * 운영자가 짚었다 — "블프가 들어가면 글 중간에 광고는 제외해야 하는 거
 * 아냐? 하단 광고랑 중복이 되는 것 같다."
 *
 * 맞다. 한 글에 쿠팡 광고가 셋이었다.
 *
 *   1. 글 중간  — 캐러셀 + 검색창  (config/ad-coupang.html, 글 만들 때 들어감)
 *   2. FAQ 앞   — 블랙프라이데이 배너 (add-product-ad.mjs)
 *   3. 하단 고정 바 — 캐러셀 + 검색창 (add-sticky.mjs)
 *
 * **1과 3은 내용이 똑같다.** 같은 캐러셀이 한 화면에 두 번 나온다. 중복은
 * 클릭을 늘리지 않고 광고 밀도만 올려 애드센스 쪽을 위험하게 만든다.
 * 그래서 1을 뺀다. 하단 바는 늘 떠 있어 노출이 더 많고, 본문 자리는
 * 블프 배너가 가진다.
 *
 * ── 셋을 어떻게 가르나 ──────────────────────────────────────
 * 셋 다 `wp:html` 블록이고 셋 다 쿠팡 코드를 담는다. 그래서 **표식으로**
 * 가른다 — 하단 바는 `id="cpst"`, 블프 배너는 `id="cppd"` 를 가지고,
 * 옛 본문 블록은 **아무 id 도 없이** 쿠팡 스크립트로 바로 시작한다.
 *
 * ⚠️ 표식이 없는 쿠팡 블록만 뺀다. 둘 중 하나라도 들어 있으면 건너뛴다.
 *    잘못 집으면 하단 바나 블프 배너가 통째로 날아간다.
 *
 * ── 지키는 선 ───────────────────────────────────────────────
 *   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
 *   - 그 블록 말고 **나머지 본문이 글자 하나까지 같아야** 저장한다.
 *   - 저장 전에 원본을 백업한다(saveContentBackup).
 *   - wiki 밖의 글은 건드리지 않는다.
 *
 * 미리보기가 기본이다. `--apply` 를 붙여야 저장한다.
 *
 * ⚠️ 되돌리려면 백업 파일을 쓴다. 이 도구에 '다시 넣기' 는 없다 —
 *    중복을 없애려고 만든 것이라 되넣을 이유가 없고, 자리를 기억하지
 *    않으므로 되넣으면 엉뚱한 곳에 들어간다.
 */
import { wpFetch, wpConfig } from './client.mjs';
import { log } from '../utils/logger.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { 발행글전부 } from './index-audit.mjs';
import { saveContentBackup } from './fix-alt.mjs';

/** 건드리면 안 되는 블록의 표식. 하단 바와 블프 배너다. */
export const 지킬표식 = ['id="cpst"', 'id="cppd"'];

/** 쿠팡 코드를 담은 wp:html 덩어리 전부. */
const HTML덩어리 = /<!-- wp:html -->[\s\S]*?<!-- \/wp:html -->/g;

/** 그 덩어리가 **옛 본문 블록**인가. 표식이 없고 쿠팡 코드가 있는 것. */
export function 옛본문블록인가(덩이) {
  const s = String(덩이 || '');
  if (지킬표식.some((표식) => s.includes(표식))) return false;
  return s.includes('ads-partners.coupang.com') || s.includes('PartnersCoupang');
}

/** 본문에 옛 블록이 있나. */
export function 옛블록있나(content) {
  return (String(content || '').match(HTML덩어리) || []).some(옛본문블록인가);
}

/** 옛 블록을 들어낸 결과. 없으면 null. */
export function 옛블록빼기(content) {
  const s = String(content || '');
  if (!옛블록있나(s)) return null;
  const after = s.replace(HTML덩어리, (덩이) => (옛본문블록인가(덩이) ? '' : 덩이))
    // 블록이 빠진 자리에 빈 줄이 셋 넘게 남지 않게 한다.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (옛블록있나(after)) return null;
  return after;
}

/** 그 블록 말고 다른 것이 바뀌지 않았는지. */
export function 그것만바뀌었나(before, after) {
  return 글자만(옛블록빼기(after) ?? after) === 글자만(옛블록빼기(before) ?? before);
}

function 글자만(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const 전체 = args.includes('--전체');
  let ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  log.section(`🧹 글 중간의 옛 쿠팡 블록을 뺍니다${apply ? '' : ' (미리보기 · 저장하지 않습니다)'}`);

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
  let 센것 = 0;
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
    const after = 옛블록빼기(content);
    const 제목 = String(post.title?.raw || '').slice(0, 40);
    if (after === null) {
      log.info(`[${id}] 뺄 블록이 없습니다 — ${제목}`);
      continue;
    }
    if (!그것만바뀌었나(content, after)) {
      log.warn(`[${id}] 그 블록 말고 다른 내용이 바뀝니다 — 저장하지 않습니다`);
      process.exitCode = 1;
      continue;
    }
    // 지켜야 할 것이 그대로 남았는지 **한 번 더** 본다. 이 도구가 잘못
    // 집으면 하단 바나 블프 배너가 통째로 날아간다.
    for (const 표식 of 지킬표식) {
      if (content.includes(표식) && !after.includes(표식)) {
        log.warn(`[${id}] ${표식} 가 사라집니다 — 저장하지 않습니다`);
        process.exitCode = 1;
        continue;
      }
    }
    log.info(`   [${id}] 옛 쿠팡 블록을 뺍니다 — ${제목}`);
    센것 += 1;
    if (!apply) continue;
    await saveContentBackup(post);
    await wpFetch(`/wp/v2/posts/${id}`, { method: 'POST', body: { content: after } });
  }

  if (!센것) {
    log.info('뺄 블록이 있는 글이 없습니다.');
    return;
  }
  log.info(apply
    ? `${센것}편에서 뺐습니다. 주소는 그대로입니다. 되돌리려면 백업 파일을 씁니다.`
    : `${센것}편이 바뀝니다. 실제로 적용하려면 --apply 를 붙이세요.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
