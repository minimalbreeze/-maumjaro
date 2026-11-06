#!/usr/bin/env node
/**
 * 글자로 남은 마크다운 링크를 실제 링크로 바꾼다. (2026-11-06)
 *
 * ── 왜 생겼나 ──────────────────────────────────────────────
 * `markdownToBlocks` 의 inline 처리가 **링크를 몰랐던 때**가 있었다.
 * 그때 쓴 글에는
 *
 *     [안세영 중계 보는 법](https://wiki.minimalbreeze.com/안세영-중계)
 *
 * 가 글자 그대로 남아 있다. 독자가 보는 화면에 대괄호와 주소가 찍히고,
 * **누를 수 있는 링크가 아니라서 글끼리 이어지지도 않는다** — 구글이
 * 페이지를 찾는 경로가 거기서 끊긴다(지시서 ② 절).
 *
 * 변환기는 2026-11-05 에 고쳤다. 이 도구는 **이미 나간 글**을 고친다.
 * `fix-tables.mjs` 와 같은 꼴이다.
 *
 * ── 무엇을 하나 ────────────────────────────────────────────
 * 본문에서 `[글자](주소)` 꼴만 찾아 `<a href=…>글자</a>` 로 바꾼다.
 * 주소가 우리 도메인이나 상대주소면 nofollow 를 붙이지 않는다 — 판단은
 * 초안 변환기의 `링크()` 를 그대로 쓴다. 두 벌로 만들면 둘이 어긋난다.
 *
 * 건드리지 않는 것
 *   - 이미 `<a ...>` 인 링크
 *   - 쿠팡 광고 블록(`wp:html`) — 제휴사가 준 코드다
 *   - 표 칸 안이라도 **글자만** 바꾼다. 칸 구조는 그대로다
 *
 * 저장 전에 **링크 말고 다른 것이 바뀌지 않았는지** 코드로 확인한다.
 * 기대하는 결과를 따로 계산해 맞춰 본다. 하나라도 다르면 저장하지 않는다.
 *
 * 미리보기가 기본이다. `--apply` 를 붙여야 저장한다.
 */
import { wpFetch, wpConfig } from './client.mjs';
import { log } from '../utils/logger.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { 링크 } from './draft.mjs';

/** 글자로 남은 마크다운 링크. 주소에 공백은 없다. */
export const MD링크 = /\[([^\]\n[]+)\]\((\S+?)\)/g;

/** 광고·스크립트 블록. 여기 안은 건드리지 않는다. */
const 손대지않는블록 = /<!-- wp:html -->[\s\S]*?<!-- \/wp:html -->|<script[\s\S]*?<\/script>/g;

/**
 * 본문의 마크다운 링크를 실제 링크로 바꾼 결과. 바꿀 것이 없으면 null.
 */
export function 링크고치기(content) {
  const s = String(content || '');
  let 센것 = 0;
  const { 가린것, 보관 } = 가리기(s);
  const 바꾼것 = 가린것.replace(MD링크, (whole, text, url) => {
    센것 += 1;
    return 링크(text, url);
  });
  if (!센것) return null;
  const after = 되돌리기(바꾼것, 보관);
  return { after, 센것 };
}

/** 광고 블록을 자리표시자로 빼 둔다. 바꾸기와 검사가 **같은 자를 쓴다.** */
function 가리기(s) {
  const 보관 = [];
  const 가린것 = String(s || '').replace(손대지않는블록, (m) => {
    보관.push(m);
    return `\u0000AD${보관.length - 1}\u0000`;
  });
  return { 가린것, 보관 };
}

function 되돌리기(s, 보관) {
  return s.replace(/\u0000AD(\d+)\u0000/g, (_, i) => 보관[Number(i)]);
}

/**
 * 링크 말고 다른 것이 바뀌지 않았는지.
 *
 * 글자 비교만으로는 못 가린다 — 마크다운 기호가 사라지는 것이 정상이라
 * 글자가 달라지기 때문이다. 그래서 **기대값을 따로 계산한다**: 원본에서
 * `[글자](주소)` 를 `글자` 로만 바꾼 것과, 바뀐 본문의 글자가 같아야 한다.
 *
 * 광고 블록은 양쪽에서 **같은 방식으로 가린 뒤** 비교한다. 가리지 않으면
 * 광고 코드 안의 `[a](b)` 를 기대값만 바꿔 버려 늘 어긋난다.
 */
export function 링크만바뀌었나(before, after) {
  const 기대 = 글자만(가리기(before).가린것.replace(MD링크, '$1'));
  return 기대 === 글자만(가리기(after).가린것);
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
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  log.section(`🔗 글자로 남은 마크다운 링크를 실제 링크로 바꿉니다${apply ? '' : ' (미리보기 · 저장하지 않습니다)'}`);

  if (!ids.length) {
    log.warn('고칠 글 번호를 적어주세요. 예: 11637 11640');
    process.exitCode = 1;
    return;
  }

  const base = wpConfig().base;
  let 고친글 = 0;
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
    const res = 링크고치기(content);
    if (!res) {
      log.info(`[${id}] 고칠 링크가 없습니다 — ${String(post.title?.raw || '').slice(0, 40)}`);
      continue;
    }
    if (!링크만바뀌었나(content, res.after)) {
      log.warn(`[${id}] 링크 말고 다른 내용이 바뀝니다 — 저장하지 않습니다`);
      process.exitCode = 1;
      continue;
    }
    log.info(`   [${id}] 링크 ${res.센것}개 — ${String(post.title?.raw || '').slice(0, 40)}`);
    고친글 += 1;
    if (!apply) continue;
    const { saveContentBackup } = await import('./fix-alt.mjs');
    await saveContentBackup(post);
    await wpFetch(`/wp/v2/posts/${id}`, { method: 'POST', body: { content: res.after } });
  }

  if (!고친글) {
    log.info('고칠 링크가 없습니다.');
    return;
  }
  log.info(apply
    ? `${고친글}편의 링크를 고쳤습니다. 주소는 그대로입니다.`
    : `${고친글}편에서 링크를 찾았습니다. 실제로 고치려면 --apply 를 붙이세요.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
