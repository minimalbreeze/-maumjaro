// 중계 글의 제목을 "상금" 각도로 다시 맞춘다. AI를 부르지 않는다(0원).
//
//   node src/wordpress/broadcast-retitle.mjs            미리보기
//   node src/wordpress/broadcast-retitle.mjs --apply    실제 적용
//
// 왜 필요한가 (2026-10-24 전수 조사)
//   발행 655편의 유형별 분포가 이랬다.
//
//     중계 360편(55%) · 기타 156편 · 시설 57편 · 결과 32편 · 상금 30편 · 일정 20편
//
//   리포 실측(config/search-demand.md)은 이렇게 말한다.
//     시설+이용방법  CTR  7.91%
//     대회+상금      CTR 18.70%   ← 유입 1위
//     끝난 대회 결과 CTR  0.41%
//   그리고 sports-news/CLAUDE.md 에 "중계·일정 글 357편이 전부 죽어 있다"가
//   이미 적혀 있다. 이번 조사가 그 숫자를 다시 확인했다.
//
//   **글은 655편인데 돈을 벌어오는 유형은 87편(13%)뿐이다.**
//   중계 글의 본문에는 상금이 적혀 있는 경우가 많다. 제목만 중계를 앞에
//   두고 있을 뿐이다. 그래서 글을 다시 쓰지 않고 **제목과 대표 키워드만**
//   상금 쪽으로 돌린다. 본문을 고치지 않으니 0원이고, 되돌릴 수 있다.
//
// 지키는 것
//   - **본문에 실제로 적힌 금액만** 제목에 쓴다. 금액을 못 찾으면 건너뛴다.
//     "확인되지 않은 것을 사실처럼 쓰지 않는다"가 분량·점수보다 위다.
//   - **라벨을 바꾸지 않는다.** 본문이 '총상금'이라 적었으면 제목도 총상금이다.
//     총상금을 우승상금이라 쓰면 제목이 거짓말이 된다.
//   - **슬러그를 보내지 않는다.** retitlePost 가 제목과 Rank Math 값만 보낸다.
//     주소가 바뀌면 네이버 색인이 끊긴다.
//   - 괄호 안에 날짜·시각이 든 제목은 **손대지 않는다.** 그 정보를 잃는다.
//   - 대표 키워드는 **본문에 그대로 나오는 말**일 때만 바꾼다. Rank Math 가
//     있는 그대로 찾기 때문에 본문에 없는 구절을 잡으면 0회가 된다.
//   - 10-30 메타 실험 중인 글은 건너뛴다.
//
// 메타 설명은 건드리지 않는다
//   여기서 함께 바꾸면 한 번에 너무 많은 것이 움직여 무엇이 효과를 냈는지
//   알 수 없다. 제목·키워드를 적용한 뒤 `잘못 채운 메타 설명 고치기`
//   (fill-meta --repair, 0원) 를 돌리면 새 키워드에 맞춰 다시 쓰인다.

import { 발행글전부, 글유형 } from './index-audit.mjs';
import { retitlePost } from './retitle.mjs';
import { wpConfig, wpFetch } from './client.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { 실험중인가 } from './facility-retitle.mjs';

/** 태그를 걷어내고 사람이 읽는 글자만 남긴다. */
export function 글자만(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 금액 꼴. 한국어 돈 표기를 넓게 받되, 숫자가 없으면 받지 않는다.
 *   1억 4천만원 · 1억4천만 원 · 10억 원 · 1,280만원 · 3000만원 · 5억
 */
const 금액꼴 = String.raw`[0-9][0-9,]*\s*억(?:\s*[0-9][0-9,]*\s*(?:천만|만))?|[0-9][0-9,]*\s*(?:천만|만)`;

/**
 * 본문에서 상금 라벨과 금액을 찾는다.
 *
 * 라벨을 그대로 돌려준다 — 총상금을 우승상금으로 바꿔 쓰지 않기 위해서다.
 * 더 구체적인 라벨(총상금·우승상금)을 먼저 본다.
 *
 * **'원'을 반드시 요구한다**(2026-10-24, 테스트가 잡았다). 원을 선택으로
 * 두었더니 "총상금은 5000만 파운드"에서 5000만을 떼어 "5000만원"을 만들었다.
 * 파운드를 원으로 바꿔 쓴 것이다. 제목에 들어가는 금액이라 더 나쁘다.
 * '상금 1억'처럼 원을 안 쓴 글은 건너뛴다 — 지어내느니 건너뛰는 쪽이 맞다.
 */
export function 상금찾기(content) {
  const 글 = 글자만(content);
  const 순서 = [
    ['총상금', /총\s?상금(?:은|이|는)?\s*(?:총\s*)?(MONEY)\s*원/],
    ['우승상금', /우승\s?상금(?:은|이|는)?\s*(?:총\s*)?(MONEY)\s*원/],
    ['상금', /상금(?:은|이|는)?\s*(?:총\s*)?(MONEY)\s*원/],
  ];
  for (const [라벨, 틀] of 순서) {
    const re = new RegExp(틀.source.replace('MONEY', 금액꼴));
    const m = re.exec(글);
    if (m) return { 라벨, 금액: `${m[1].replace(/\s+/g, '')}원` };
  }
  return null;
}

/** 중계와 관련된 말. 제목에서 떼어 대회명만 남길 때 쓴다. */
const 중계말 = /생중계|다시\s?보기|하이라이트|중계\s?(?:방송|일정|정보)?|시청\s?(?:방법|하는\s?법)?/g;

/**
 * 떼고 나면 남는 군더더기. 조사와 꼬리말이다.
 *
 * 한 번만 떼면 모자란다(2026-10-24 테스트에서 걸렸다).
 *   "2026 호주 오픈 테니스 대회 총정리!"  ← 느낌표가 막아 '총정리'가 안 떨어졌다
 *   "2026 윔블던 테니스대회 , 대회 개요"  ← 중계를 뗀 자리에 쉼표가 남았다
 * 그래서 아래 다듬기()는 **변화가 없을 때까지 돌린다.**
 */
const 꼬리군더더기 = /\s*(?:보는\s?법|보는법|어디서|어디에서|총정리|정리|안내|완벽\s?분석|분석|대회\s?개요|개요|정보|방법)$/;

/** 끝에 붙은 문장부호와 이음표. */
const 꼬리부호 = /[\s,·、\/!?.\-–—:：]+$/;

/** 꼬리에서 뗄 것이 없을 때까지 뗀다. */
function 다듬기(s) {
  let 앞 = '';
  let 글 = String(s || '').trim();
  while (글 && 글 !== 앞) {
    앞 = 글;
    글 = 글.replace(꼬리부호, '').replace(꼬리군더더기, '').trim();
  }
  return 글;
}

/**
 * 제목에서 대회명만 남긴다. 괄호와 중계 관련 말을 뗀다.
 *
 * 괄호 안에 날짜·시각이 들어 있으면 **빈 값을 돌려준다** — 그 제목은
 * 손대지 않는다는 뜻이다. 날짜는 한 번 지우면 돌아오지 않는다.
 */
export function 대회명뽑기(title) {
  const 글 = String(title || '').trim();
  const 괄호 = 글.match(/[(（]([^)）]*)[)）]\s*$/);
  const 괄호속 = 괄호 ? 괄호[1] : '';
  if (/\d+\s*월|\d+\s*일|\d+\s*시/.test(괄호속)) return '';

  let 본체 = 괄호 ? 글.slice(0, 괄호.index) : 글;
  본체 = 본체.split(/[:：]/)[0];
  중계말.lastIndex = 0;
  본체 = 본체.replace(중계말, ' ');
  // 중계라는 말을 뗀 자리에 쉼표가 홀로 남는다 — "윔블던 테니스대회 , 대회 개요".
  본체 = 본체.replace(/\s+([,·、])/g, '$1').replace(/\s+/g, ' ').trim();
  본체 = 다듬기(본체);
  // 너무 짧으면 대회명이라 볼 수 없다. 떼다가 망가진 것이다.
  if (본체.length < 4) return '';
  // 조사로 끝나면 문장 조각이다.
  if (/(?:의|을|를|이|가|은|는|에|와|과)$/.test(본체)) return '';
  return 본체;
}

/**
 * 대표 키워드를 고른다.
 *
 * **본문에 그대로 나오는 말만 쓴다.** Rank Math 는 있는 그대로 찾는다.
 * 둘 다 본문에 없으면 빈 값을 돌려주고, 그러면 키워드를 보내지 않는다.
 */
export function 대표키워드(대회명, content) {
  const 글 = 글자만(content);
  const 긴것 = `${대회명} 상금`;
  if (글.includes(긴것)) return 긴것;
  if (글.includes(대회명)) return 대회명;
  return '';
}

/** 새 제목. 본문에서 찾은 라벨과 금액을 그대로 쓴다. */
export function 새제목(대회명, 상금) {
  return `${대회명} ${상금.라벨} (${상금.금액}, 중계는 어디서 보나?)`;
}

/** 바꿀 값이 있는 글인가. 없으면 null. */
export function 다듬을거리(post) {
  const 상금 = 상금찾기(post.content);
  if (!상금) return null;
  const 대회명 = 대회명뽑기(post.title);
  if (!대회명) return null;
  const title = 새제목(대회명, 상금);
  if (title === post.title) return null;
  // 제목이 너무 길면 검색결과에서 잘린다. 자르지 말고 건너뛴다.
  if (title.length > 70) return null;
  const focusKeyword = 대표키워드(대회명, post.content);
  return focusKeyword ? { title, focusKeyword } : { title };
}

async function main() {
  const 적용 = process.argv.includes('--apply');
  const base = wpConfig().base;

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`💰 중계 글 제목을 상금 각도로 ${적용 ? '(실제 적용)' : '(미리보기 · 비용 0원)'}`);
  console.log(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);
  console.log('────────────────────────────────────────────────────────');

  const 글 = await 발행글전부();
  const 중계 = 글.filter((p) => 글유형(p.title) === '중계');
  console.log(`\n발행 ${글.length}편 · 중계 글 ${중계.length}편`);
  console.log('본문을 읽어 상금이 적혀 있는지 봅니다 — 적혀 있는 글만 손댑니다.');

  const 본문붙임 = [];
  for (const p of 중계) {
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${p.id}`, { query: { context: 'edit' } });
      본문붙임.push({ ...p, content: data?.content?.raw ?? data?.content?.rendered ?? '' });
    } catch {
      본문붙임.push({ ...p, content: '' });
    }
  }

  const 전부 = 본문붙임.map((p) => ({ post: p, 바꿀값: 다듬을거리(p) }));
  const 금액없음 = 전부.filter((x) => !x.바꿀값 && !상금찾기(x.post.content)).length;
  const 제목못품 = 전부.filter((x) => !x.바꿀값 && 상금찾기(x.post.content)).length;
  const 후보 = 전부.filter((x) => x.바꿀값);
  const 실험제외 = 후보.filter((x) => 실험중인가(x.post.id));
  const 대상 = 후보.filter((x) => !실험중인가(x.post.id));

  console.log(`\n   본문에 상금이 없어 건너뜀 ${금액없음}편`);
  console.log(`   상금은 있으나 제목을 안전하게 못 만들어 건너뜀 ${제목못품}편 (괄호에 날짜가 있거나 대회명이 깨짐)`);
  if (실험제외.length) {
    console.log(`   10-30 메타 실험 중이라 건너뜀 ${실험제외.length}편: ${실험제외.map((x) => x.post.id).join(', ')}`);
  }
  console.log(`   ▶ 바꿀 글 ${대상.length}편`);
  if (!대상.length) { console.log('\n   손볼 제목이 없습니다.\n'); return; }

  for (const { post, 바꿀값 } of 대상.slice(0, 30)) {
    console.log(`\n   [${post.id}] ${post.date}`);
    console.log(`     전: ${post.title}`);
    console.log(`     후: ${바꿀값.title}`);
    console.log(`     대표 키워드: ${post.focusKeyword || '(없음)'} → ${바꿀값.focusKeyword || '(그대로 둠 — 본문에 없는 말이라)'}`);
  }
  if (대상.length > 30) console.log(`\n   … 그 밖에 ${대상.length - 30}편`);

  if (!적용) {
    console.log('\n실제로 고치려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ 본문과 주소(슬러그)는 건드리지 않습니다. 제목과 대표 키워드만 바뀝니다.');
    console.log(`\n▶ 바꿀 글 ${대상.length}편 · 상금 없어 건너뜀 ${금액없음}편 · 제목 못 만들어 건너뜀 ${제목못품}편\n`);
    return;
  }

  let 성공 = 0;
  for (const { post, 바꿀값 } of 대상) {
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
  console.log(`\n${성공}편의 제목을 상금 각도로 바꿨습니다. 원래 값은 out/backup/ 에 있습니다.`);
  console.log('※ 메타 설명은 그대로입니다. 이어서 `잘못 채운 메타 설명 고치기`(0원)를 돌리면');
  console.log('  새 대표 키워드에 맞춰 설명이 다시 쓰입니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
