// 분류(카테고리) 아카이브의 설명을 채운다. AI를 부르지 않는다(0원).
//
//   node src/wordpress/category-desc.mjs --dry-run    무엇이 비어 있는지 미리보기
//   node src/wordpress/category-desc.mjs --limit=20   20개만 채우기
//
// 왜 필요한가
//   네이버 서치어드바이저가 https://wiki.minimalbreeze.com/category/야구 를
//   "<meta name="description"> 설명 누락"으로 집어냈다(2026-10-24).
//
//   기존 fill-meta.mjs 는 **글(post)** 의 rank_math_description 을 채운다.
//   분류 아카이브는 글이 아니라 **분류(term)** 라서 그 도구가 영영 닿지 않는다.
//   그래서 따로 만든다.
//
// 어디를 고치나 — 분류의 `description` 필드다
//   Rank Math 의 분류 아카이브 설명은 기본값이 `%term_description%` 이라,
//   분류 설명을 채우면 <meta name="description"> 이 생긴다. 분류 설명은
//   워드프레스 REST 의 표준 필드(/wp/v2/categories/<id> 의 description)라
//   추가 플러그인 설정 없이 쓸 수 있다.
//
//   Rank Math 의 분류용 메타(rank_math_description term meta)를 직접 쓰는 길도
//   있지만, 그 메타가 REST 에 열려 있는지는 사이트 설정에 달렸다. **확인 못 한
//   것에 기대는 설계를 하지 않는다**(sports-news/CLAUDE.md). 표준 필드부터 채우고,
//   그래도 네이버가 같은 말을 하면 그때 다른 길을 본다.
//
// 안전장치
//   - **비어 있는 설명에만 넣는다.** 이미 적혀 있으면 한 글자도 건드리지 않는다.
//   - 글이 0편인 분류는 건너뛴다. 보여줄 글이 없는 아카이브다.
//   - 이름(name)·슬러그(slug)·부모(parent)를 보내지 않는다. 주소가 바뀌면
//     네이버 색인이 끊긴다.
//   - 고치기 전 원래 값을 파일로 남긴다.
//
// 설명에 무엇을 쓰나
//   분류 이름, 실제 글 수, 그 분류의 최근 글 제목만 쓴다. 전부 사이트에서
//   읽어온 값이다. "다양한 정보를 다룹니다" 같은 지어낸 말을 넣지 않는다.
//   분류 설명은 테마에 따라 **사람에게도 보이는 자리**라 읽을 만해야 한다.

import fs from 'node:fs';
import path from 'node:path';
import { wpFetch, wpFetchAll } from './client.mjs';
import { ROOT, loadEnv } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

/** 메타 설명이 길면 검색결과에서 잘린다. 이 선 안에서 만든다. */
export const MAX_LEN = 155;

/** 태그를 걷어내고 사람이 읽는 글자만 남긴다. */
function 글자만(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 제목 끝의 괄호 설명을 떼어 짧게 만든다. 설명 안에 넣을 것이라 짧아야 한다. */
export function 제목짧게(title) {
  return 글자만(title).replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim();
}

/** 이미 설명이 들어 있나. 공백뿐이면 비어 있는 것으로 본다. */
export function 비었나(description) {
  return 글자만(description).length === 0;
}

/**
 * 분류 하나의 설명 문장을 만든다.
 *
 * 들어가는 것은 전부 사이트에서 읽어온 값이다 — 분류 이름, 글 수, 최근 글 제목.
 * 제목을 하나도 못 넣을 만큼 길면 제목 없이 첫 문장만 남긴다.
 */
export function 설명만들기(name, count, 최근제목 = []) {
  const 머리 = `${name} 관련 글 ${count}편을 모은 분류입니다.`;
  const 쓸것 = [];
  for (const t of 최근제목) {
    const 짧게 = 제목짧게(t);
    if (!짧게) continue;
    const 후보 = [...쓸것, 짧게];
    const 꼬리 = `최근 글은 ${후보.map((x) => `‘${x}’`).join(', ')}입니다.`;
    if (`${머리} ${꼬리}`.length > MAX_LEN) break;
    쓸것.push(짧게);
  }
  if (!쓸것.length) return 머리;
  return `${머리} 최근 글은 ${쓸것.map((x) => `‘${x}’`).join(', ')}입니다.`;
}

/** 설명이 비어 있는 분류를 찾는다. */
export async function 빈분류찾기() {
  const cats = await wpFetchAll('/wp/v2/categories', { hide_empty: false });
  const 대상 = [];
  const 글없음 = [];
  for (const c of cats) {
    if (!비었나(c.description)) continue;
    if (!c.count) { 글없음.push({ id: c.id, name: c.name, slug: c.slug }); continue; }
    대상.push({ id: c.id, name: c.name, slug: c.slug, count: c.count });
  }
  대상.sort((a, b) => b.count - a.count);
  return { 대상, 글없음, scanned: cats.length };
}

/** 그 분류의 최근 글 제목 몇 개. */
async function 최근글제목(categoryId, 개수 = 3) {
  try {
    const { data } = await wpFetch('/wp/v2/posts', {
      query: {
        categories: categoryId, per_page: 개수, status: 'publish',
        orderby: 'date', order: 'desc', _fields: 'title',
      },
    });
    return (Array.isArray(data) ? data : []).map((p) => p?.title?.rendered || '').filter(Boolean);
  } catch {
    return [];
  }
}

function 백업하기(rows) {
  if (!rows.length) return '';
  const dir = path.join(ROOT, 'out', '백업');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `category-desc-${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify(rows, null, 2));
  return f;
}

/** 분류 하나를 채운다. 설명 외의 어떤 값도 보내지 않는다. */
export async function 하나채우기(cat, { apply = false } = {}) {
  const 제목들 = await 최근글제목(cat.id);
  const description = 설명만들기(cat.name, cat.count, 제목들);
  if (!apply) return { ...cat, description, changed: false };

  // 보내는 것은 description 하나뿐이다. 이름·슬러그를 같이 보내면
  // 주소가 바뀔 수 있고, 주소가 바뀌면 색인이 끊긴다.
  await wpFetch(`/wp/v2/categories/${cat.id}`, { method: 'POST', body: { description } });
  return { ...cat, description, changed: true };
}

async function main() {
  const apply = !process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 20;

  log.section(`🗂 분류 설명 채우기 ${apply ? `(최대 ${limit}개)` : '(미리보기 — 저장하지 않습니다)'}`);

  const { 대상, 글없음, scanned } = await 빈분류찾기();
  log.info(`분류 ${scanned}개 훑음 — 설명이 빈 분류 ${대상.length}개`);
  if (글없음.length) {
    log.info(`글이 0편이라 건너뛴 분류 ${글없음.length}개: ${글없음.map((c) => c.name).join(', ')}`);
  }
  if (!대상.length) { log.ok('채울 것이 없습니다.'); return; }

  const 할것 = apply ? 대상.slice(0, limit) : 대상;
  log.raw('');

  const 백업 = [];
  let 고침 = 0;
  for (const cat of 할것) {
    try {
      const r = await 하나채우기(cat, { apply });
      백업.push({ id: cat.id, name: cat.name, slug: cat.slug, 이전설명: '' });
      if (r.changed) 고침++;
      log.info(`[${cat.id}] ${cat.name} (글 ${cat.count}편)`);
      log.ok(`      ${r.description}`);
    } catch (err) {
      log.fail(`[${cat.id}] ${cat.name} 실패`, err);
    }
  }

  log.raw('');
  if (apply) {
    const f = 백업하기(백업);
    log.ok(`${고침}개 분류의 설명을 채웠습니다. 남은 분류 ${Math.max(0, 대상.length - 고침)}개`);
    if (f) log.info(`  이전 값: ${path.relative(ROOT, f)} (전부 빈 값이었습니다)`);
    if (대상.length > 고침) log.info('  다시 돌리면 이어서 합니다.');
  } else {
    log.info(`미리보기입니다. 실제로는 분류 ${대상.length}개가 대상입니다.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
