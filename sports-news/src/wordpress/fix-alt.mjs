// 이미지에 alt 설명을 채운다. AI를 부르지 않는다(0원).
//
//   npm run alt:fix -- --dry-run     어떤 글의 어떤 이미지가 비었는지 미리보기
//   npm run alt:fix -- --limit=20    20개 글만 고치기
//
// 왜 필요한가
//   네이버 서치어드바이저가 "<img> 요소에 Alt 속성이 없거나 설명이 없습니다"로
//   9개 페이지를 집어냈다. alt는 두 가지에 쓰인다.
//     ① 검색엔진이 이미지가 무엇인지 아는 유일한 단서다. 이미지 검색 유입이 여기서 난다.
//     ② 화면을 못 보는 사람이 글을 읽을 때 이 글을 대신 듣는다.
//
// 이 도구는 지금까지의 도구와 다르게 **본문(content)을 고친다.** 그래서 안전장치를
// 더 뒀다.
//   - alt가 없거나 빈 <img>에만 넣는다. 이미 설명이 있으면 건드리지 않는다.
//   - <img> 태그 말고는 글자 하나 바꾸지 않는다. 저장 전에 그걸 검사한다.
//   - 고치기 전에 원본 본문을 파일로 남긴다.
//   - --limit 으로 나눠서 한다.

import fs from 'node:fs';
import path from 'node:path';
import { wpFetch } from './client.mjs';
import { ROOT, loadEnv } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

/** alt 속성이 아예 없거나 빈 <img> 태그. */
const IMG = /<img\b[^>]*>/gi;
const HAS_ALT = /\balt\s*=\s*(["'])(.*?)\1/i;

/** 소제목. alt를 만들 때 "이 이미지가 어느 대목의 그림인지"를 여기서 가져온다. */
const HEADING = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

/** 태그를 걷어내고 사람이 읽는 글자만 남긴다. */
function 글자만(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 제목에서 괄호 안 군더더기를 떼어 짧게 만든다. alt는 125자 안이 좋다. */
export function 제목줄이기(title, max = 60) {
  let t = 글자만(title).replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim();
}

/**
 * 이미지 앞에 나온 가장 가까운 소제목을 찾는다.
 *
 * 글 제목만 쓰면 한 글의 이미지 세 장이 전부 같은 alt를 갖게 된다. 그건
 * 검색엔진이 중복으로 본다. 어느 대목의 그림인지가 들어가야 서로 달라진다.
 */
export function 가까운소제목(html, imgIndex) {
  const 앞 = String(html || '').slice(0, imgIndex);
  let last = '';
  for (const m of 앞.matchAll(HEADING)) {
    const t = 글자만(m[2]);
    if (t) last = t;
  }
  // 소제목 앞의 이모지는 뺀다 — 읽어주는 기계가 "슬쩍 웃는 얼굴"이라고 읽는다.
  return last.replace(/^[\p{Extended_Pictographic}\p{So}️‍\s]+/u, '').trim();
}

/** 이 이미지의 alt로 쓸 설명을 만든다. */
export function altFor({ title, heading, n = 0 }) {
  const 짧은제목 = 제목줄이기(title);
  const 소제목 = 제목줄이기(heading || '', 50);

  // 소제목이 제목과 거의 같으면 두 번 쓰지 않는다.
  const 겹침 = 소제목 && 짧은제목.includes(소제목);
  const base = 소제목 && !겹침 ? `${짧은제목} - ${소제목}` : 짧은제목;

  // 그래도 같은 alt가 나오는 경우(소제목이 없는 글)는 번호로 가른다.
  const alt = n > 0 && !소제목 ? `${base} (${n + 1})` : base;
  return alt.slice(0, 125);
}

/** HTML 안의 alt 없는 img에 설명을 넣는다. img 태그 말고는 건드리지 않는다. */
export function fillAlts(html, title) {
  const src = String(html || '');
  let 채움 = 0;
  let 빈것 = 0;

  const out = src.replace(IMG, (tag, offset) => {
    const m = HAS_ALT.exec(tag);
    if (m && m[2].trim()) return tag;          // 이미 설명이 있다 — 건드리지 않는다
    빈것++;

    const alt = altFor({
      title,
      heading: 가까운소제목(src, offset),
      n: 채움,
    }).replace(/"/g, '&quot;');

    채움++;
    // alt=""가 있으면 그 안을 채우고, 없으면 태그 끝에 붙인다.
    if (m) return tag.replace(HAS_ALT, `alt="${alt}"`);
    return tag.replace(/\s*(\/?)>$/, ` alt="${alt}"$1>`);
  });

  return { html: out, 채움, 빈것 };
}

/**
 * 바뀐 것이 alt 뿐인지 확인한다.
 *
 * 본문을 고치는 도구라 이 검사가 핵심이다. 양쪽에서 alt 속성을 전부 지운 뒤
 * 비교해서, 그 밖의 글자가 하나라도 달라지면 저장하지 않는다.
 */
export function altOnlyChange(before, after) {
  // alt 속성을 통째로 **지운** 뒤 비교한다. 빈 값으로 바꾸기만 하면 안 된다 —
  // 원래 alt가 아예 없던 태그와 alt=""가 생긴 태그가 서로 달라 보여서,
  // 멀쩡한 수정을 "본문이 바뀌었다"고 막아버린다(실제로 걸렸다).
  const 벗기기 = (s) => String(s)
    .replace(IMG, (t) => t.replace(/\s*\balt\s*=\s*(["'])[\s\S]*?\1/gi, ''))
    // 속성을 뗀 자리에 남는 공백 차이는 무시한다.
    .replace(/\s+/g, ' ');
  return 벗기기(before) === 벗기기(after);
}

/** 발행·임시글을 훑어 alt가 빈 이미지를 가진 글을 모은다. */
export async function findMissingAlt({ maxPages = 30, perPage = 50 } = {}) {
  const 대상 = [];
  let scanned = 0;
  let 이미지없음 = 0;

  for (let page = 1; page <= maxPages; page++) {
    const { data, headers } = await wpFetch('/wp/v2/posts', {
      query: {
        per_page: perPage, page, context: 'edit', status: 'publish,draft',
        orderby: 'date', order: 'desc',
      },
    });
    if (!Array.isArray(data) || !data.length) break;
    scanned += data.length;

    for (const p of data) {
      const content = p.content?.raw || p.content?.rendered || '';
      const title = p.title?.raw || p.title?.rendered || '';
      const { 빈것 } = fillAlts(content, title);
      if (!빈것) { 이미지없음++; continue; }
      대상.push({
        id: p.id, title, status: p.status,
        slug: decodeURIComponent(p.slug || ''),
        content, 빈것,
      });
    }

    const totalPages = Number(headers.get('x-wp-totalpages') || 1);
    if (page >= totalPages) break;
  }
  return { 대상, scanned, 이미지없음 };
}

/** 고치기 전 원본 본문을 파일로 남긴다. */
export function saveContentBackup(post) {
  const dir = path.join(ROOT, 'out', 'backup-content');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${post.id}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({
    id: post.id, status: post.status, title: post.title,
    slug: post.slug, content: post.content,
  }, null, 2), 'utf8');
  return file;
}

/** 한 글의 alt를 채운다. content 하나만 보낸다. */
export async function fixOne(post, { apply = true } = {}) {
  const { html, 채움 } = fillAlts(post.content, post.title);
  if (!채움) return { id: post.id, title: post.title, 채움: 0, changed: false };

  // 저장 전 마지막 방어선. alt 말고 다른 게 바뀌었으면 보내지 않는다.
  if (!altOnlyChange(post.content, html)) {
    throw new Error('alt 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = null;
  if (apply) {
    backup = saveContentBackup(post);
    await wpFetch(`/wp/v2/posts/${post.id}`, {
      method: 'POST',
      body: { content: html },
      timeoutMs: 45000,
    });
  }

  // 미리보기에서 무엇이 들어가는지 보여주려고 넣은 alt를 뽑아 돌려준다.
  const alts = [...html.matchAll(IMG)]
    .map((m) => HAS_ALT.exec(m[0])?.[2] || '')
    .filter(Boolean);

  return { id: post.id, title: post.title, 채움, changed: true, backup, alts };
}

async function main() {
  const apply = !process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 20;

  log.section(`🖼 이미지 설명(alt) 채우기 ${apply ? `(최대 ${limit}개 글)` : '(미리보기 — 저장하지 않습니다)'}`);

  const { 대상, scanned, 이미지없음 } = await findMissingAlt();
  const 빈이미지 = 대상.reduce((s, p) => s + p.빈것, 0);
  log.info(`글 ${scanned}개 훑음 — alt가 빈 이미지가 있는 글 ${대상.length}개 (이미지 ${빈이미지}장)`);
  if (!대상.length) { log.ok('채울 것이 없습니다.'); return; }

  const 할것 = apply ? 대상.slice(0, limit) : 대상;
  log.raw('');

  let 고침 = 0;
  for (const post of 할것) {
    try {
      const r = await fixOne(post, { apply });
      if (!r.changed) continue;
      고침++;
      log.info(`[${r.id}] ${r.title.slice(0, 44)} — 이미지 ${r.채움}장`);
      for (const a of r.alts.slice(0, 3)) log.ok(`      alt: ${a}`);
    } catch (err) {
      log.fail(`[${post.id}] 실패`, err);
    }
  }

  log.raw('');
  if (apply) {
    log.ok(`${고침}개 글의 이미지 설명을 채웠습니다. 남은 글 ${Math.max(0, 대상.length - 고침)}개`);
    if (대상.length > 고침) log.info('  다시 돌리면 이어서 합니다.');
  } else {
    log.info(`미리보기입니다. 실제로는 글 ${대상.length}개 · 이미지 ${빈이미지}장이 대상입니다.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
