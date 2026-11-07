// 볼링 글의 제목 괄호를 대회마다 다르게 고친다. AI를 부르지 않는다(0원).
//
//   node src/wordpress/bowling-retitle.mjs            미리보기
//   node src/wordpress/bowling-retitle.mjs --apply    실제 적용
//
// 왜 필요한가 (2026-11-07 운영자 지적)
//   `wiki.minimalbreeze.com/category/스포츠/볼링` **카테고리 페이지**가
//   개별 글보다 노출이 많았다. 제목을 보면 이유가 보인다.
//
//     2026 KPBA 퍼펙트코리아컵 (중계, 대회 개요, 패턴 특징, 관전 포인트 총정리!)
//     2026 아산 이충무공컵 프로볼링대회 (대회 개요, 출전 선수, 관전 포인트, 중계 정보 총정리!)
//     2026 인카금융 슈퍼볼링 국제오픈 개막! (대회 개요, 출전 선수, 관전 포인트, 중계 정보 총정리!)
//
//   **대회 이름만 다르고 괄호 안이 같다.** 검색엔진이 개별 글 하나를 고르지
//   못하면 묶음을 대표하는 카테고리 페이지를 띄운다. 그래서 괄호 안을
//   대회마다 다른 말로 바꾼다.
//
// 지키는 것
//   - **본문에 실제로 적힌 것만** 괄호에 쓴다. 못 찾으면 건너뛴다.
//     "확인되지 않은 것을 사실처럼 쓰지 않는다"가 분량·점수보다 위다.
//   - **괄호 앞은 손대지 않는다.** 연도·회차·대회명·"개막!"이 거기 있다.
//     깎아내려다 대회명을 망친 전례가 있다(broadcast-retitle.mjs 주석).
//   - **슬러그를 보내지 않는다.** retitlePost 가 제목만 보낸다.
//   - 새 제목이 다른 글과 같아지면 건너뛴다. 중복을 만들면 둘 다 죽는다.
//   - 10-30 메타 실험 중인 글은 건너뛴다.
//   - 메타 설명·대표 키워드는 건드리지 않는다. 한 번에 하나만 움직인다.

import { 발행글전부 } from './index-audit.mjs';
import { retitlePost } from './retitle.mjs';
import { wpConfig, wpFetch } from './client.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { 실험중인가 } from './facility-retitle.mjs';
import { 글자만, 상금찾기, 연도뽑기 } from './broadcast-retitle.mjs';

/** 볼링 글인가. 카테고리를 먼저 보고, 없으면 제목·슬러그의 '볼링'을 본다. */
export function 볼링글인가(post, 볼링카테고리 = []) {
  const cats = Array.isArray(post.categories) ? post.categories : [];
  if (볼링카테고리.length && cats.some((c) => 볼링카테고리.includes(c))) return true;
  return /볼링/.test(`${post.title} ${post.slug}`);
}

/** 괄호 앞까지. 연도·회차·대회명·"개막!"이 여기 있다 — 손대지 않는다. */
export function 앞부분(title) {
  const t = String(title || '');
  const i = t.indexOf('(');
  return (i < 0 ? t : t.slice(0, i)).trim().replace(/[,·]\s*$/, '');
}

/**
 * 열리는 곳. "○○볼링장 / ○○볼링센터 / ○○ 볼링경기장" 꼴만 받는다.
 * 앞에 붙은 조사·수식어가 따라오지 않도록 길이를 좁게 잡는다.
 */
export function 장소찾기(content) {
  const m = 글자만(content).match(/([가-힣A-Za-z0-9]{2,10}\s?볼링(?:장|센터|경기장))/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

/** 레인 오일 패턴 길이. "41피트" 처럼 본문에 적혀 있을 때만. */
export function 패턴찾기(content) {
  const 글 = 글자만(content);
  const m = 글.match(/(\d{2}(?:\.\d)?)\s?피트/);
  if (m && /패턴/.test(글)) return `${m[1]}피트 패턴`;
  return '';
}

/** 대회 기간. "11월 3일~11월 8일" / "11월 3일부터 8일까지" 를 받는다. */
export function 기간찾기(content) {
  const 글 = 글자만(content);
  let m = 글.match(/(\d{1,2})월\s?(\d{1,2})일\s?(?:~|-|–|부터)\s?(?:(\d{1,2})월\s?)?(\d{1,2})일/);
  if (m) {
    const 끝월 = m[3] || m[1];
    return 끝월 === m[1] ? `${m[1]}월 ${m[2]}~${m[4]}일` : `${m[1]}월 ${m[2]}일~${끝월}월 ${m[4]}일`;
  }
  m = 글.match(/(\d{1,2})월\s?(\d{1,2})일/);
  return m ? `${m[1]}월 ${m[2]}일` : '';
}

/** 출전 인원. "128명이 출전" 처럼 사람 수가 적혀 있을 때만. */
export function 인원찾기(content) {
  const m = 글자만(content).match(/(\d{2,3})\s?명(?:의)?\s?(?:선수|프로)?\s?(?:가|이|들이)?\s?(?:출전|참가|나선|겨룬)/);
  return m ? `${m[1]}명 출전` : '';
}

/**
 * 괄호 안을 만든다. 본문에서 찾은 것만, 많아도 두 가지.
 *
 * 순서가 곧 우선순위다 — 사람이 대회 이름과 함께 검색하는 것이
 * 장소·날짜이고, 상금·패턴은 그다음이다.
 */
export function 괄호만들기(content) {
  const 상금 = 상금찾기(content);
  const 조각 = [
    장소찾기(content),
    기간찾기(content),
    상금 ? `${상금.라벨} ${상금.금액}` : '',
    패턴찾기(content),
    인원찾기(content),
  ].filter(Boolean);
  return 조각.slice(0, 2).join(', ');
}

/** 바꿀 값이 있는 글인가. 없으면 null. */
export function 다듬을거리(post) {
  const 머리 = 앞부분(post.title);
  if (머리.length < 4) return null;
  const 괄호 = 괄호만들기(post.content);
  if (!괄호) return null;
  const title = `${머리} (${괄호})`;
  if (title === post.title) return null;
  if (title.length > 70) return null;
  return { title };
}

async function main() {
  const 적용 = process.argv.includes('--apply');
  const base = wpConfig().base;

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🎳 볼링 글 괄호를 대회마다 다르게 ${적용 ? '(실제 적용)' : '(미리보기 · 비용 0원)'}`);
  console.log(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);
  console.log('────────────────────────────────────────────────────────');

  // 볼링 카테고리 번호를 먼저 찾는다. 제목에 '볼링'이 없는 글이 많다.
  let 볼링카테고리 = [];
  try {
    const { data } = await wpFetch('/wp/v2/categories', { query: { search: '볼링', per_page: 20 } });
    볼링카테고리 = (Array.isArray(data) ? data : []).map((c) => c.id);
  } catch { /* 못 찾으면 제목·슬러그로만 고른다 */ }

  const 글 = await 발행글전부();
  const 볼링 = 글.filter((p) => 볼링글인가(p, 볼링카테고리));
  console.log(`\n발행 ${글.length}편 · 볼링 글 ${볼링.length}편 (카테고리 ${볼링카테고리.join(', ') || '못 찾음'})`);
  console.log('본문을 읽어 장소·기간·상금·패턴이 적혀 있는지 봅니다 — 적혀 있는 글만 손댑니다.');

  const 본문붙임 = [];
  for (const p of 볼링) {
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${p.id}`, { query: { context: 'edit' } });
      본문붙임.push({ ...p, content: data?.content?.raw ?? data?.content?.rendered ?? '' });
    } catch {
      본문붙임.push({ ...p, content: '' });
    }
  }

  const 전부 = 본문붙임.map((p) => ({ post: p, 바꿀값: 다듬을거리(p) }));
  const 못만듦 = 전부.filter((x) => !x.바꿀값);
  let 후보 = 전부.filter((x) => x.바꿀값 && !실험중인가(x.post.id));

  // 새 제목이 서로 같아지면 둘 다 뺀다. 중복 제목을 만들지 않는다.
  const 셈 = new Map();
  for (const x of 후보) 셈.set(x.바꿀값.title, (셈.get(x.바꿀값.title) || 0) + 1);
  const 기존제목 = new Set(글.map((p) => p.title));
  const 겹침 = 후보.filter((x) => 셈.get(x.바꿀값.title) > 1 || 기존제목.has(x.바꿀값.title));
  후보 = 후보.filter((x) => 셈.get(x.바꿀값.title) === 1 && !기존제목.has(x.바꿀값.title));

  console.log(`\n   본문에서 쓸 것을 못 찾아 건너뜀 ${못만듦.length}편`);
  if (겹침.length) console.log(`   새 제목이 다른 글과 같아져 건너뜀 ${겹침.length}편: ${겹침.map((x) => x.post.id).join(', ')}`);
  console.log(`   ▶ 바꿀 글 ${후보.length}편`);

  for (const { post } of 못만듦.slice(0, 15)) {
    console.log(`     ⏭  [${post.id}] ${post.title}`);
  }
  if (!후보.length) { console.log('\n   손볼 제목이 없습니다.\n'); return; }

  for (const { post, 바꿀값 } of 후보) {
    console.log(`\n   [${post.id}] ${post.date} · ${연도뽑기(post.title) || '연도 없음'}`);
    console.log(`     전: ${post.title}`);
    console.log(`     후: ${바꿀값.title}`);
  }

  if (!적용) {
    console.log('\n실제로 고치려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ 본문·주소(슬러그)·대표 키워드·메타 설명은 건드리지 않습니다. 제목만 바뀝니다.\n');
    return;
  }

  let 성공 = 0;
  for (const { post, 바꿀값 } of 후보) {
    if (!손대도되는글인가(post.link, base)) {
      console.log(`   ⏭  ${post.id} 다른 사이트의 글이라 건너뜁니다`);
      continue;
    }
    try {
      const r = await retitlePost(post.id, 바꿀값, { apply: true });
      if (r.changed) { 성공 += 1; console.log(`   ✅ ${post.id} ${바꿀값.title}`); }
      else console.log(`   ⏭  ${post.id} 바뀔 것이 없습니다`);
    } catch (err) {
      console.log(`   ❌ ${post.id} 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${성공}편의 제목을 고쳤습니다. 원래 값은 out/backup/ 에 있습니다.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
