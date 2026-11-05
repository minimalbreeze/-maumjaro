#!/usr/bin/env node
/**
 * 깨진 마크다운 표를 표 블록으로 바꾼다. (2026-11-05)
 *
 * ── 왜 생겼나 ──────────────────────────────────────────────
 * `markdownToBlocks` 가 표를 몰랐다. 그래서 초안에 쓴
 *
 *     | 항목 | 값 |
 *     |---|---|
 *     | 무게 | 80g |
 *
 * 가 문단 하나로 뭉쳐 `<p>| 항목 | 값 |<br>|---|---|<br>…</p>` 로 나갔다.
 * 독자가 보는 화면에 파이프와 하이픈이 그대로 찍힌다.
 *
 * 변환기는 같은 날 고쳤다(표·링크·인라인 코드). **그래도 이미 나간 글은
 * 안 바뀐다.** 이 도구가 그것들을 고친다.
 *
 * ── 무엇을 하나 ────────────────────────────────────────────
 * 본문에서 `|---|` 가 든 문단만 찾아 표 블록으로 바꾼다.
 *
 * 셀 안의 글자는 **건드리지 않는다.** 이미 `<strong>` 같은 태그로 변환된
 * 상태라 다시 inline 처리를 하면 태그가 깨진다. 칸을 나누고 감싸기만 한다.
 *
 * 저장 전에 **표 말고 다른 것이 바뀌지 않았는지** 코드로 확인한다.
 * 글자(태그·구분자를 걷어낸 것)가 하나라도 달라지면 그 글은 저장하지 않는다.
 *
 * 미리보기가 기본이다. `--apply` 를 붙여야 저장한다.
 */
import { wpFetch, wpConfig } from './client.mjs';
import { log } from '../utils/logger.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

/** 문단 안에 마크다운 표 구분선이 있으면 그 문단을 집는다. */
const 표문단 = /<!-- wp:paragraph -->\s*<p>([\s\S]*?)<\/p>\s*<!-- \/wp:paragraph -->/g;

/** `|---|---|` 꼴인가. 콜론 정렬도 받는다. */
export function 구분선인가(line) {
  return /^\|[\s:|-]+\|$/.test(line) && line.includes('-');
}

export function 칸나누기(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * `<br>` 로 이어 붙은 줄들이 표인가.
 * 두 줄 이상이고, 모두 `|` 로 시작하고, 두 번째 줄이 구분선이어야 한다.
 */
export function 표인가(lines) {
  if (lines.length < 2) return false;
  if (!lines.every((l) => l.startsWith('|'))) return false;
  return 구분선인가(lines[1]);
}

/** 셀 글자는 그대로 두고 표 블록으로 감싸기만 한다. */
export function 표블록만들기(lines) {
  const head = 칸나누기(lines[0]).map((c) => `<th>${c}</th>`).join('');
  const body = lines
    .slice(2)
    .map((l) => `<tr>${칸나누기(l).map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('');
  const tbody = body ? `<tbody>${body}</tbody>` : '';
  return `<!-- wp:table -->\n<figure class="wp-block-table"><table><thead><tr>${head}</tr></thead>${tbody}</table></figure>\n<!-- /wp:table -->`;
}

/**
 * 본문의 깨진 표를 전부 고친다.
 * 바꾼 것이 없으면 null 을 돌려준다 — 멀쩡한 글을 저장하지 않는다.
 */
export function 표고치기(content) {
  let 센것 = 0;
  const after = String(content || '').replace(표문단, (whole, inner) => {
    if (!inner.includes('|---') && !/\|[\s:|-]*-[\s:|-]*\|/.test(inner)) return whole;
    const lines = inner.split(/<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean);
    if (!표인가(lines)) return whole;
    센것 += 1;
    return 표블록만들기(lines);
  });
  if (!센것) return null;
  return { after, 센것 };
}

/**
 * 표 말고 다른 것이 바뀌지 않았는지 본다.
 * 태그와 표 구분자(`|`, `-`)를 걷어낸 글자가 같아야 한다.
 */
export function 표만바뀌었나(before, after) {
  return 글자만(before) === 글자만(after);
}

function 글자만(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[|\-:]/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  log.section(`🧱 깨진 마크다운 표를 표 블록으로 바꿉니다${apply ? '' : ' (미리보기 · 저장하지 않습니다)'}`);

  if (!ids.length) {
    log.warn('고칠 글 번호를 적어주세요. 예: 11861 11849');
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
    // wiki 밖의 글은 건드리지 않는다. 주소를 읽을 수 없어도 건너뛴다.
    if (!손대도되는글인가(post?.link, base)) {
      log.warn(`${id} 는 wiki 밖의 글입니다 — 건너뜁니다`);
      continue;
    }
    const content = post.content?.raw ?? '';
    const res = 표고치기(content);
    if (!res) {
      log.info(`[${id}] 고칠 표가 없습니다 — ${String(post.title?.raw || '').slice(0, 40)}`);
      continue;
    }
    if (!표만바뀌었나(content, res.after)) {
      log.warn(`[${id}] 표 말고 다른 내용이 바뀝니다 — 저장하지 않습니다`);
      process.exitCode = 1;
      continue;
    }
    고친글 += 1;
    log.info(`[${id}] 표 ${res.센것}개 — ${String(post.title?.raw || '').slice(0, 40)}`);
    if (apply) {
      // 본문만 보낸다. 제목·주소(슬러그)·발행상태는 보내지 않는다 —
      // 주소가 바뀌면 네이버가 들고 있는 주소가 깨진다.
      await wpFetch(`/wp/v2/posts/${id}`, { method: 'POST', body: { content: res.after } });
      log.ok(`   저장 완료`);
    }
  }

  log.raw('');
  if (apply) log.raw(`${고친글}편의 표를 고쳤습니다. 주소는 그대로입니다.`);
  else log.raw(`${고친글}편에서 표를 찾았습니다. 실제로 고치려면 --apply 를 붙이세요.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
