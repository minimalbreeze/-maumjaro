#!/usr/bin/env node
/**
 * 본문 쿠팡 블록 아래에 여백을 준다. (2026-11-07)
 *
 * ── 왜 ─────────────────────────────────────────────────────
 * 운영자: "쿠팡 광고는 좋은데 광고랑 글 사이에 간격이 좀 있으면 좋겠다.
 * 간격이 없이 너무 붙어 있으니 글을 읽는 게 너무 안 좋은 것 같다."
 *
 * 실제로 쿠팡 검색창(44px) 바로 다음 줄에 소제목이 붙는다. 광고와 본문이
 * 한 덩어리로 보여서 어디까지가 광고인지 모른다.
 *
 * ── 왜 단순 치환으로 못 하나 ────────────────────────────────
 * 쿠팡 검색창 iframe 은 **본문과 하단 고정 바 양쪽에 똑같은 꼴로** 있다.
 * 문자열로 잡으면 하단 바까지 두꺼워진다. 그래서 **블록 단위로** 찾는다 —
 * `findCoupang` 이 쿠팡 덩어리를 집어내고, 그중 하단 바(`id="cpst"`)는
 * 건너뛴다.
 *
 * ── 지키는 선 ───────────────────────────────────────────────
 *   - 쿠팡 코드는 건드리지 않는다. **뒤에 빈 칸을 붙일 뿐이다.**
 *   - 워드프레스 기본 스페이서 블록을 쓴다 (테마가 바뀌어도 남는다)
 *   - 이미 있으면 건너뛴다. 두 번 돌려도 하나다
 *   - `--빼기` 로 되돌린다
 *   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다
 *   - 여백 말고 **글자가 하나라도 달라지면** 저장하지 않는다
 *   - wiki 밖의 글은 건드리지 않는다
 *
 * 미리보기가 기본이다. `--apply` 를 붙여야 저장한다.
 */
import { wpFetch, wpConfig } from './client.mjs';
import { log } from '../utils/logger.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { findCoupang } from './move-coupang.mjs';
import { 발행글전부 } from './index-audit.mjs';

/** 우리가 붙이는 여백. 워드프레스 스페이서 블록 그대로다. */
export const 여백높이 = 28;
export const 여백블록 = [
  `<!-- wp:spacer {"height":"${여백높이}px"} -->`,
  `<div style="height:${여백높이}px" aria-hidden="true" class="wp-block-spacer"></div>`,
  '<!-- /wp:spacer -->',
].join('\n');

/** 하단 고정 바는 건드리지 않는다 — 그쪽은 제 여백을 스스로 준다. */
function 하단바인가(덩어리) {
  return String(덩어리 || '').includes('id="cpst"');
}

/**
 * 본문 쿠팡 블록 뒤에 여백을 붙인 결과. 붙일 데가 없으면 null.
 */
export function 여백넣기(content) {
  const s = String(content || '');
  const 찾은것 = findCoupang(s);
  if (!찾은것 || 하단바인가(찾은것.블록)) return null;
  const 끝 = 찾은것.end;
  // 바로 뒤가 이미 우리 여백이면 그만둔다.
  if (s.slice(끝, 끝 + 200).includes('wp-block-spacer')) return null;
  return `${s.slice(0, 끝)}\n\n${여백블록}${s.slice(끝)}`;
}

/** 여백을 들어낸 결과. 없으면 null. */
export function 여백빼기(content) {
  const s = String(content || '');
  const 찾은것 = findCoupang(s);
  if (!찾은것 || 하단바인가(찾은것.블록)) return null;
  const 뒤 = s.slice(찾은것.end);
  const m = /^\s*<!-- wp:spacer[\s\S]*?<!-- \/wp:spacer -->/.exec(뒤);
  if (!m) return null;
  return s.slice(0, 찾은것.end) + 뒤.slice(m[0].length);
}

/** 여백 말고 다른 것이 바뀌지 않았는지. */
export function 여백만바뀌었나(before, after) {
  return 글자만(before) === 글자만(after);
}

function 글자만(html) {
  return String(html || '')
    .replace(/<!-- wp:spacer[\s\S]*?<!-- \/wp:spacer -->/g, ' ')
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

  log.section(`${빼기 ? '🧹 쿠팡 블록 아래 여백을 뺍니다' : '↕️ 쿠팡 블록 아래에 여백을 줍니다'}${apply ? '' : ' (미리보기 · 저장하지 않습니다)'}`);

  if (전체) {
    const 글 = await 발행글전부();
    ids = 글.map((p) => p.id);
    log.info(`발행 ${ids.length}편을 돕니다`);
  }
  if (!ids.length) {
    log.warn('글 번호를 적어주세요. 예: 11953   (전부 하려면 --전체)');
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
    if (!손대도되는글인가(post?.link, base)) continue;
    const content = post.content?.raw ?? '';
    const after = 빼기 ? 여백빼기(content) : 여백넣기(content);
    const 제목 = String(post.title?.raw || '').slice(0, 36);
    if (after === null) continue;
    if (!여백만바뀌었나(content, after)) {
      log.warn(`[${id}] 여백 말고 다른 것이 바뀝니다 — 저장하지 않습니다`);
      process.exitCode = 1;
      continue;
    }
    log.info(`   [${id}] ${빼기 ? '여백을 뺍니다' : '여백을 줍니다'} — ${제목}`);
    센것 += 1;
    if (!apply) continue;
    await saveContentBackup(post);
    await wpFetch(`/wp/v2/posts/${id}`, { method: 'POST', body: { content: after } });
  }

  log.info(센것
    ? (apply ? `${센것}편을 고쳤습니다. 주소는 그대로입니다.` : `${센것}편이 바뀝니다. 실제로 적용하려면 --apply 를 붙이세요.`)
    : '바뀔 글이 없습니다.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
