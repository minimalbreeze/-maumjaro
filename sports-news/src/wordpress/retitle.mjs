// 이미 발행한 글의 제목과 메타 설명만 고친다.
//
//   npm run posts:find -- "파3 예약"            글 찾기 (0원)
//   npm run posts:retitle -- 1234 --dry-run     바뀔 내용 미리보기
//   npm run posts:retitle -- 1234 --title="..." --desc="..."
//
// 왜 필요한가
//   검색결과에 이미 떠 있는데 제목이 안 끌려서 그냥 지나치는 글들이 있다.
//   "db 대만 화이트 완파 결승 진출"은 387번 노출되고 클릭 4번이다(CTR 1%).
//   글을 새로 쓸 필요 없이 제목만 고치면 되는 자리다. AI를 부르지 않는다.
//
// 안전장치 (발행된 글을 건드리기 때문에)
//   1. 고치기 전에 원본을 파일로 남긴다. 되돌릴 수 있어야 한다.
//   2. --dry-run으로 무엇이 어떻게 바뀌는지 먼저 보여준다.
//   3. 슬러그(주소)는 절대 바꾸지 않는다. 바꾸면 기존 링크와 순위를 잃는다.
//   4. 상태(발행/임시글)도 보내지 않는다. 발행된 글은 발행된 채로 남는다.
//   5. 본문도 건드리지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { wpFetch } from './client.mjs';
import { loadEnv, ROOT } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

/** 검색어로 글을 찾는다. 제목·슬러그·현재 SEO 값을 함께 보여준다. */
export async function findPosts(query, { perPage = 10 } = {}) {
  const { data } = await wpFetch('/wp/v2/posts', {
    query: { search: query, per_page: perPage, context: 'edit', status: 'publish,draft' },
  });
  return (Array.isArray(data) ? data : []).map((p) => ({
    id: p.id,
    status: p.status,
    title: p.title?.raw || p.title?.rendered || '',
    slug: decodeURIComponent(p.slug || ''),
    link: p.link || '',
    seoTitle: p.meta?.rank_math_title || '',
    description: p.meta?.rank_math_description || '',
    focusKeyword: p.meta?.rank_math_focus_keyword || '',
    excerpt: (p.excerpt?.raw || '').slice(0, 120),
  }));
}

/** 되돌릴 수 있도록 원본을 남긴다. 이 파일이 없으면 고치지 않는다. */
export function saveBackup(post) {
  const dir = path.join(ROOT, 'out', 'backup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `post-${post.id}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(post, null, 2) + '\n', 'utf8');
  return file;
}

/**
 * 제목·SEO 제목·메타 설명만 바꾼다.
 * 슬러그·상태·본문은 보내지 않는다.
 */
export async function retitlePost(id, { title, seoTitle, description, focusKeyword } = {}, { apply = true } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${id}`, { query: { context: 'edit' } });

  const before = {
    id,
    status: post?.status,
    title: post?.title?.raw || post?.title?.rendered || '',
    slug: decodeURIComponent(post?.slug || ''),
    seoTitle: post?.meta?.rank_math_title || '',
    description: post?.meta?.rank_math_description || '',
    focusKeyword: post?.meta?.rank_math_focus_keyword || '',
  };

  const payload = {};
  const meta = {};
  if (title && title !== before.title) payload.title = title;
  if (seoTitle && seoTitle !== before.seoTitle) meta.rank_math_title = seoTitle;
  if (description && description !== before.description) meta.rank_math_description = description;
  if (focusKeyword && focusKeyword !== before.focusKeyword) meta.rank_math_focus_keyword = focusKeyword;
  if (Object.keys(meta).length) payload.meta = meta;

  const result = { before, after: { title, seoTitle, description, focusKeyword }, changed: false, backup: null };
  if (!Object.keys(payload).length) return result;

  if (apply) {
    result.backup = saveBackup(before);   // 보내기 전에 남긴다
    await wpFetch(`/wp/v2/posts/${id}`, { method: 'POST', body: payload });
  }
  result.changed = true;
  result.sent = Object.keys(payload);
  return result;
}

/** 백업 파일로 되돌린다. */
export async function restoreFromBackup(file) {
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  await wpFetch(`/wp/v2/posts/${saved.id}`, {
    method: 'POST',
    body: {
      title: saved.title,
      meta: {
        rank_math_title: saved.seoTitle,
        rank_math_description: saved.description,
        rank_math_focus_keyword: saved.focusKeyword,
      },
    },
  });
  return saved;
}

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).replace(/^["']|["']$/g, '') : '';
}

async function main() {
  const mode = process.argv[2];

  if (mode === 'find') {
    const q = process.argv.slice(3).filter((a) => !a.startsWith('--')).join(' ');
    if (!q) { log.fail('찾을 말을 적어주세요', new Error('예: npm run posts:find -- 파3 예약')); process.exitCode = 1; return; }
    log.section(`🔎 "${q}" 로 글 찾기`);
    const rows = await findPosts(q);
    if (!rows.length) { log.warn('찾지 못했습니다.'); return; }
    for (const r of rows) {
      log.raw('');
      log.info(`[${r.id}] ${r.status} · ${r.title}`);
      log.info(`      주소: ${r.slug}`);
      log.info(`      SEO 제목: ${r.seoTitle || '(비어 있음)'}`);
      log.info(`      메타 설명: ${r.description || '(비어 있음)'}`);
      log.info(`      대표 키워드: ${r.focusKeyword || '(비어 있음)'}`);
    }
    return;
  }

  const id = Number(process.argv[3]);
  if (!Number.isInteger(id)) {
    log.fail('글 번호를 적어주세요', new Error('예: npm run posts:retitle -- 1234 --title="..."'));
    process.exitCode = 1;
    return;
  }
  const apply = !process.argv.includes('--dry-run');
  const r = await retitlePost(id, {
    title: arg('title'), seoTitle: arg('seo'), description: arg('desc'), focusKeyword: arg('kw'),
  }, { apply });

  log.section(`✏️  ${id}번 글 제목·설명 고치기 ${apply ? '' : '(미리보기 — 저장하지 않습니다)'}`);
  log.info(`상태: ${r.before.status} (건드리지 않습니다)`);
  log.info(`주소: ${r.before.slug} (건드리지 않습니다)`);
  log.raw('');
  if (!r.changed) { log.info('바뀔 내용이 없습니다.'); return; }
  for (const [label, k] of [['제목', 'title'], ['SEO 제목', 'seoTitle'], ['메타 설명', 'description'], ['대표 키워드', 'focusKeyword']]) {
    if (!r.after[k] || r.after[k] === r.before[k]) continue;
    log.info(`${label}`);
    log.info(`  전: ${r.before[k] || '(비어 있음)'}`);
    log.ok(`  후: ${r.after[k]}`);
  }
  if (r.backup) log.info(`\n원본 보관: ${path.relative(ROOT, r.backup)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
