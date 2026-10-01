// 메타 설명이 비어 있는 글을 찾아 본문에서 뽑아 채운다. AI를 부르지 않는다(0원).
//
//   npm run meta:fill -- --dry-run          몇 개가 비었는지, 무엇으로 채울지 미리보기
//   npm run meta:fill -- --limit=50         50개만 채우기
//
// 왜 필요한가
//   Rank Math를 나중에 설치해서, 그 전에 쓴 글은 메타 설명이 비어 있다.
//   비어 있으면 검색엔진이 본문 아무 데나 잘라서 보여준다. 노출은 되는데
//   클릭이 안 되는 큰 이유다. 실측에서 387번 노출에 클릭 4번인 글이 있었다.
//
// 안전장치 (발행된 글을 건드리기 때문에)
//   - 이미 설명이 있는 글은 건드리지 않는다. 덮어쓰지 않는다.
//   - 제목·슬러그·상태·본문을 보내지 않는다. meta 하나만 보낸다.
//   - 고치기 전에 원본을 파일로 남긴다.
//   - --limit으로 조금씩 나눠서 한다. 한 번에 수백 개를 밀지 않는다.

import { wpFetch } from './client.mjs';
import { htmlToText } from './fix-seo.mjs';
import { saveBackup } from './retitle.mjs';
import { loadEnv } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

/**
 * 본문에서 메타 설명을 뽑는다.
 *
 * 첫 문단이 보통 글의 요약이다. 문장 중간에서 자르지 않도록 마침표까지만 쓴다.
 * 대표 키워드가 있으면 앞쪽에 들어가 있는지 확인하고, 없으면 앞에 붙인다.
 */
export function describeFrom(content, { title = '', focusKeyword = '', max = 155 } = {}) {
  const text = htmlToText(content)
    .replace(/^\s*[📊📌✨🌟🎯👀❓🔥📺]\s*/u, '')
    .trim();
  if (!text) return '';

  // 문장 단위로 모으다가 길이를 넘기기 직전에 멈춘다.
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of sentences) {
    if (!s.trim()) continue;
    if (out && (out + ' ' + s).length > max) break;
    out = out ? `${out} ${s}` : s;
    // 검색결과에 보이는 길이는 120~155자다. 너무 짧으면 자리를 낭비한다.
    if (out.length >= max * 0.85) break;
  }
  if (!out) out = text.slice(0, max);

  // 키워드가 설명 안에 없으면 앞에 붙인다. 검색결과에서 굵게 표시되는 부분이다.
  const kw = String(focusKeyword || '').trim();
  if (kw && !out.includes(kw)) {
    const 붙임 = `${kw} 정보입니다. ${out}`;
    out = 붙임.length <= max + 20 ? 붙임 : out;
  }

  if (out.length > max) {
    const cut = out.slice(0, max);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '));
    out = (stop > max * 0.6 ? cut.slice(0, stop) : cut).trim();
  }
  return out.trim();
}

/** 발행된 글을 훑어 메타 설명이 빈 것만 모은다. */
export async function findEmptyDescriptions({ maxPages = 30, perPage = 50 } = {}) {
  const empty = [];
  let scanned = 0;

  for (let page = 1; page <= maxPages; page++) {
    const { data, headers } = await wpFetch('/wp/v2/posts', {
      query: { per_page: perPage, page, context: 'edit', status: 'publish', orderby: 'date', order: 'desc' },
    });
    if (!Array.isArray(data) || !data.length) break;
    scanned += data.length;

    for (const p of data) {
      if (String(p.meta?.rank_math_description || '').trim()) continue;   // 이미 있으면 건드리지 않는다
      empty.push({
        id: p.id,
        title: p.title?.raw || p.title?.rendered || '',
        slug: decodeURIComponent(p.slug || ''),
        status: p.status,
        focusKeyword: p.meta?.rank_math_focus_keyword || '',
        seoTitle: p.meta?.rank_math_title || '',
        description: '',
        content: p.content?.raw || p.content?.rendered || '',
      });
    }

    const totalPages = Number(headers.get('x-wp-totalpages') || 1);
    if (page >= totalPages) break;
  }
  return { empty, scanned };
}

/** 한 글의 메타 설명을 채운다. meta 하나만 보낸다. */
export async function fillOne(post, { apply = true } = {}) {
  const description = describeFrom(post.content, { title: post.title, focusKeyword: post.focusKeyword });
  if (!description) return { id: post.id, title: post.title, description: '', changed: false };

  let backup = null;
  if (apply) {
    backup = saveBackup({
      id: post.id, status: post.status, title: post.title, slug: post.slug,
      seoTitle: post.seoTitle, description: '', focusKeyword: post.focusKeyword,
    });
    await wpFetch(`/wp/v2/posts/${post.id}`, {
      method: 'POST',
      body: { meta: { rank_math_description: description } },
    });
  }
  return { id: post.id, title: post.title, description, changed: true, backup };
}

async function main() {
  const apply = !process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;

  log.section(`📝 메타 설명 채우기 ${apply ? `(최대 ${limit}개)` : '(미리보기 — 저장하지 않습니다)'}`);

  const { empty, scanned } = await findEmptyDescriptions();
  log.info(`발행된 글 ${scanned}개 중 메타 설명이 빈 글 ${empty.length}개`);
  if (!empty.length) { log.ok('채울 것이 없습니다.'); return; }

  const 대상 = empty.slice(0, apply ? limit : 5);
  log.raw('');

  let 채움 = 0;
  for (const post of 대상) {
    try {
      const r = await fillOne(post, { apply });
      if (!r.changed) { log.warn(`[${post.id}] 본문에서 뽑을 내용이 없습니다 — ${post.title.slice(0, 40)}`); continue; }
      채움++;
      log.info(`[${r.id}] ${r.title.slice(0, 44)}`);
      log.ok(`      → ${r.description}`);
    } catch (err) {
      log.fail(`[${post.id}] 실패`, err);
    }
  }

  log.raw('');
  if (apply) {
    log.ok(`${채움}개 채웠습니다. 남은 글 ${Math.max(0, empty.length - 채움)}개`);
    if (empty.length > 채움) log.info('  다시 돌리면 이어서 채웁니다.');
  } else {
    log.info(`미리보기입니다. 실제로는 ${empty.length}개가 대상입니다.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
