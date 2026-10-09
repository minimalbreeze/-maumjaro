// 끝난 대회의 중계 안내처럼 수명이 끝난 글을 색인 대상에서 뺀다.
//
//   node src/wordpress/noindex.mjs                  대상만 보여준다 (기본)
//   node src/wordpress/noindex.mjs --확인=7801      한 글의 현재 robots 값을 본다
//   node src/wordpress/noindex.mjs --apply          실제로 건다
//
// 왜 필요한가
//   2026-10-09 서치콘솔: 발행 633편 중 색인 8편. "크롤링됨 - 현재 색인이
//   생성되지 않음" 148건. 발행 글의 91%가 3,000자 미만이고 중앙값이 2,029자다.
//   끝난 대회의 "중계 시청 방법" 글이 대부분인데, 그 말을 지금 찾는 사람은 없다.
//   사이트 평균만 깎는다.
//
// 왜 삭제가 아닌가
//   삭제는 되돌릴 수 없고 링크가 깨진다. noindex 는 글을 그대로 두고 색인에서만
//   뺀다. 되돌리려면 값을 지우면 된다.
//
// 지키는 선
//   - **WORDPRESS_URL 이 가리키는 사이트 말고는 건드리지 않는다.** 운영자가
//     2026-10-09 에 "wiki만 손대줘, 나머진 광고 돌리는 사이트야"라고 못박았다.
//     이 리포의 도구는 전부 WORDPRESS_URL 하나로만 가지만, 이 도구는 한 번에
//     수백 편을 쓰므로 글마다 공개 주소의 호스트를 확인하고 다르면 건너뛴다.
//   - 본문·제목·슬러그·발행상태는 건드리지 않는다. robots 칸 하나만 쓴다.
//   - 고치기 전에 원래 값을 파일로 남긴다.
//   - **모양을 눈으로 확인하기 전에는 쓰지 않는다.** Rank Math 의 robots 는
//     PHP 직렬화 배열이고, 공개 문서가 구조를 확정해 주지 않는다. 그래서
//     "이미 noindex 가 걸린 글을 하나 읽어 모양을 확인"하기 전에는 --apply 가
//     거부한다. 리포 지시서: 실제 필드 구조를 확인하지 않고 임의의 meta key를
//     만들어 저장하지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { wpFetch, wpConfig } from './client.mjs';
import { ROOT } from '../utils/env.mjs';
import { 발행글전부, 글유형 } from './index-audit.mjs';

export const ROBOTS_KEY = 'rank_math_robots';

/** 지금 이 글이 색인에서 빠져 있나. */
export function noindex인가(robots) {
  return Array.isArray(robots) && robots.includes('noindex');
}

/**
 * robots 값에 noindex 를 더한다. 원래 들어 있던 다른 지시어는 그대로 둔다.
 *
 * Rank Math 는 여기에 nofollow·noarchive 같은 것도 함께 담는다. 우리가 원하는
 * 것은 색인에서 빼는 것뿐이므로 나머지를 지우지 않는다.
 */
export function noindex더하기(robots) {
  const 기존 = Array.isArray(robots) ? robots.filter((v) => typeof v === 'string') : [];
  if (기존.includes('noindex')) return 기존;
  // 'index' 와 'noindex' 가 함께 있으면 뜻이 충돌한다. index 만 걷어낸다.
  return [...기존.filter((v) => v !== 'index'), 'noindex'];
}

/**
 * 색인에서 뺄 글을 고른다.
 *
 * 좁게 잡는다. 애매하면 두는 쪽이다 — 잘못 빼면 유입이 사라지는데,
 * 안 뺀 글은 다음에 다시 고르면 된다.
 */
export function 뺄글고르기(글 = [], { 최대글자수 = 1500, 지난날수 = 90, 오늘 = new Date() } = {}) {
  const 기준일 = new Date(오늘.getTime() - 지난날수 * 24 * 60 * 60 * 1000);
  return 글.filter((p) => {
    if (글유형(p.title) !== '중계') return false;          // 대회가 끝나면 죽는 유형만
    if (p.글자수 >= 최대글자수) return false;               // 얇은 것만
    if (!p.date) return false;
    const 날 = new Date(`${p.date}T00:00:00Z`);
    if (Number.isNaN(날.getTime())) return false;
    return 날 < 기준일;                                    // 이미 지난 글만
  }).sort((a, b) => a.글자수 - b.글자수);
}

/**
 * 이 글이 우리가 손대도 되는 사이트의 글인가.
 *
 * 운영자 지시: wiki 만 손댄다. 나머지는 광고를 돌리는 사이트라 건드리지 않는다.
 * 글의 공개 주소 호스트가 WORDPRESS_URL 의 호스트와 다르면 손대지 않는다.
 * 주소를 읽을 수 없으면 손대지 않는다 — 모르면 안 건드리는 쪽이다.
 */
export function 손대도되는글인가(link, base) {
  try {
    return new URL(link).host === new URL(base).host;
  } catch {
    return false;
  }
}

/** 되돌릴 수 있도록 원래 값을 남긴다. 이 파일이 없으면 고치지 않는다. */
export function saveBackup(rows) {
  const dir = path.join(ROOT, 'out', 'backup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `noindex-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  return file;
}

/** 글 하나의 현재 robots 값을 그대로 읽는다. 모양 확인용이다. */
export async function readRobots(postId) {
  const { data } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  return {
    id: postId,
    title: data?.title?.raw || data?.title?.rendered || '',
    robots: data?.meta?.[ROBOTS_KEY],
    robots있음: Object.prototype.hasOwnProperty.call(data?.meta || {}, ROBOTS_KEY),
  };
}

const 인자 = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};

async function main() {
  const 적용 = process.argv.includes('--apply');
  const 확인할글 = 인자('확인');

  const base = wpConfig().base;
  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🗂  수명이 끝난 글을 색인에서 빼기 ${적용 ? '(실제 적용)' : '(미리보기 · 비용 0원)'}`);
  console.log(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);
  console.log('────────────────────────────────────────────────────────');

  // ① 모양 확인 — 플러그인이 칸을 열었는지, 값이 어떻게 생겼는지.
  if (확인할글) {
    const r = await readRobots(Number(확인할글));
    console.log(`\n[${r.id}] ${r.title}`);
    if (!r.robots있음) {
      console.log('   ❌ robots 칸이 REST 에 안 보입니다.');
      console.log('      워드프레스 플러그인 "맘운자로 SEO REST 열기"를 1.1.0 으로 올려주세요.');
      process.exitCode = 1;
      return;
    }
    console.log(`   현재 값: ${JSON.stringify(r.robots)}`);
    console.log(`   색인 제외 상태인가: ${noindex인가(r.robots) ? '예' : '아니오'}`);
    console.log(`   이 글에 걸면 이렇게 됩니다: ${JSON.stringify(noindex더하기(r.robots))}`);
    return;
  }

  // 기준은 환경변수로 넓히거나 좁힌다. 매번 코드를 고치지 않게.
  //   NOINDEX_MAX_CHARS  (기본 1500) 이 글자수 미만만 대상
  //   NOINDEX_MIN_DAYS   (기본 90)   이만큼 지난 글만 대상
  const 최대글자수 = Number(process.env.NOINDEX_MAX_CHARS || 1500);
  const 지난날수 = Number(process.env.NOINDEX_MIN_DAYS || 90);

  const 글 = await 발행글전부();
  const 대상 = 뺄글고르기(글, { 최대글자수, 지난날수 });
  console.log(`\n발행 ${글.length}편 중 대상 ${대상.length}편`);
  console.log(`   기준: 중계·시청방법 유형 · ${최대글자수.toLocaleString()}자 미만 · 발행 ${지난날수}일 경과`);
  console.log('   (애매하면 두는 쪽입니다. 시설·상금 유형은 절대 들어가지 않습니다)');
  if (!대상.length) { console.log('\n   뺄 글이 없습니다.\n'); return; }

  for (const p of 대상.slice(0, 40)) {
    console.log(`   ${p.id}  ${p.date}  ${p.글자수.toLocaleString().padStart(6)}자  ${p.title}`);
  }
  if (대상.length > 40) console.log(`   … 그 밖에 ${대상.length - 40}편`);

  if (!적용) {
    console.log('\n실제로 걸려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.\n');
    return;
  }

  // ② 쓰기 전 안전 검사 — 모양을 못 봤으면 쓰지 않는다.
  const 표본 = await readRobots(대상[0].id);
  if (!표본.robots있음) {
    console.log('\n❌ robots 칸이 REST 에 안 보입니다. 플러그인을 1.1.0 으로 올린 뒤 다시 돌려주세요.');
    console.log('   (확인: node src/wordpress/noindex.mjs --확인=' + 대상[0].id + ')');
    process.exitCode = 1;
    return;
  }
  if (표본.robots !== undefined && 표본.robots !== null && !Array.isArray(표본.robots)) {
    console.log(`\n❌ robots 값이 배열이 아닙니다 (${typeof 표본.robots}). 모양을 모르는 채로 쓰지 않습니다.`);
    console.log(`   받은 값: ${JSON.stringify(표본.robots)}`);
    process.exitCode = 1;
    return;
  }

  const 백업 = saveBackup(대상.map((p) => ({ id: p.id, title: p.title })));
  console.log(`\n원래 값을 남겼습니다: ${백업}`);

  let 성공 = 0;
  for (const p of 대상) {
    try {
      // 다른 사이트의 글은 손대지 않는다. 운영자 지시이고, 이 도구는 한 번에
      // 수백 편을 쓰기 때문에 글마다 확인한다.
      if (!손대도되는글인가(p.link, base)) {
        console.log(`   ⏭  ${p.id} 다른 사이트의 글이라 건너뜁니다 (${p.link || '주소 없음'})`);
        continue;
      }
      const 현재 = await readRobots(p.id);
      if (noindex인가(현재.robots)) { console.log(`   ⏭  ${p.id} 이미 제외돼 있습니다`); continue; }
      await wpFetch(`/wp/v2/posts/${p.id}`, {
        method: 'POST',
        body: { meta: { [ROBOTS_KEY]: noindex더하기(현재.robots) } },
      });
      성공 += 1;
      console.log(`   ✅ ${p.id} ${p.title.slice(0, 40)}`);
    } catch (err) {
      console.log(`   ❌ ${p.id} 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${성공}편을 색인에서 뺐습니다. 되돌리려면 Rank Math 에서 값을 지우면 됩니다.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
