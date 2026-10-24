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
const 금액꼴 = String.raw`[0-9][0-9,]*\s*억(?:\s*[0-9][0-9,]*\s*(?:천만|만))?|[0-9][0-9,]*\s*(?:천만|만)|[0-9][0-9,]*`;

/**
 * 돈의 단위. **환율로 바꾸지 않는다.**
 *
 * 운영자가 2026-10-24 에 "원화로 환산해 넣는 게 낫지 않나"고 물었고,
 * 이렇게 답했다 — 환율은 매일 바뀌는데 제목은 한 번 쓰면 그대로 남는다.
 * 오늘 환율로 "약 900억원"을 박아두면 반년 뒤에는 틀린 숫자가 된다.
 * 이 컨테이너는 바깥 네트워크가 막혀 있어 실시간 환율을 가져오지도 못하고,
 * 고정 환율을 코드에 박으면 그날부터 썩는다.
 *
 * 그리고 사람은 금액으로 검색하지 않는다 — 검색어는 "윔블던 상금"이지
 * "1200억"이 아니다. 환산의 검색 이득은 없고 틀릴 위험만 남는다.
 *
 * 그래서 **본문에 적힌 단위를 그대로 제목에 쓴다.** 원화 환산이 필요하면
 * 본문에 환율 기준일과 함께 적는다. 본문은 고치기 쉽고 제목은 어렵다.
 */
const 단위 = String.raw`원|달러|파운드|유로|엔|위안`;

/**
 * 본문에서 상금 라벨과 금액을 찾는다.
 *
 * 라벨을 그대로 돌려준다 — 총상금을 우승상금으로 바꿔 쓰지 않기 위해서다.
 * 더 구체적인 라벨(총상금·우승상금)을 먼저 본다.
 *
 * **단위를 반드시 요구한다**(2026-10-24, 테스트가 잡았다). 처음에는 '원'을
 * 선택으로 두었더니 "총상금은 5000만 파운드"에서 5000만을 떼어 "5000만원"을
 * 만들었다. 파운드를 원으로 바꿔 쓴 것이고, 제목에 들어가는 금액이라 더 나쁘다.
 * 지금은 원·달러·파운드·유로·엔·위안을 받고 **단위를 그대로 돌려준다.**
 * '상금 1억'처럼 단위가 없는 글은 건너뛴다 — 지어내느니 건너뛰는 쪽이 맞다.
 */
export function 상금찾기(content) {
  const 글 = 글자만(content);
  const 순서 = [
    ['총상금', /총\s?상금(?:은|이|는)?\s*(?:총\s*)?(MONEY)\s*(UNIT)/],
    ['우승상금', /우승\s?상금(?:은|이|는)?\s*(?:총\s*)?(MONEY)\s*(UNIT)/],
    ['상금', /상금(?:은|이|는)?\s*(?:총\s*)?(MONEY)\s*(UNIT)/],
  ];
  for (const [라벨, 틀] of 순서) {
    const re = new RegExp(틀.source.replace('MONEY', 금액꼴).replace('UNIT', 단위));
    const m = re.exec(글);
    // 단위를 붙일 때 숫자와 띄우지 않는다 — "1억4천만원", "5000만 파운드"처럼
    // 한글 단위는 붙이고 외화는 띄우는 것이 읽기 편하다.
    if (m) {
      const 수 = m[1].replace(/\s+/g, '');
      const 단 = m[2];
      return { 라벨, 금액: 단 === '원' ? `${수}${단}` : `${수} ${단}` };
    }
  }
  return null;
}

/**
 * 제목 맨 앞의 연도. 없으면 빈 값.
 *
 * **연도를 빼지 않는다**(2026-10-24, 운영자가 "빼는 게 어떨까" 물었다).
 * 같은 대회가 매년 열리므로 연도를 빼면 2025·2026 글의 제목이 거의 같아진다.
 * CLAUDE.md 에 그 전례가 있다 — "7769·7777 이 그렇게 겹쳤고, 구글이 둘 다
 * 색인하지 않았다". 지금 구글이 156편을 거부하고 있는 사이트에서 제목 중복을
 * 만들면 둘 다 죽는다. 상금 액수도 해마다 달라서 연도가 없으면 제목이
 * 부정확해진다.
 *
 * "작년 글에 올해 사람이 들어온다"는 걱정은 `올해 글 안내 넣기`(0원)로 푼다.
 * 제목에서 풀 문제가 아니다.
 *
 * 글이 올라온 날짜에서 연도를 가져오지 않는다 — 대회 연도와 다를 수 있다.
 * 제목에 적혀 있을 때만 쓴다.
 */
export function 연도뽑기(title) {
  const m = String(title || '').match(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/);
  return m ? m[1] : '';
}

/**
 * 대회명을 고른다 — **기존 대표 키워드를 쓴다.**
 *
 * 처음에는 제목에서 중계 관련 말을 깎아내 대회명을 만들었다. 2026-10-24
 * 미리보기에서 80편 대부분이 망가졌다.
 *
 *   "2026 PGA 발레로 텍사스 오픈, 김시우·김주형 운명의 티샷 총상금 (920만 달러…)"
 *   "2025 BWF 호주오픈, 대회 개요, 핵심 관전 포인트, 역사적 기록 예측 상금 (…)"
 *
 * 실제 제목은 "대회명, 부제! 부제" 꼴이라 쉼표·느낌표 뒤가 그대로 따라왔다.
 *
 * 그런데 같은 로그에 답이 함께 찍혀 있었다 — 그 글들의 **대표 키워드가 이미
 * 깨끗했다**(발레로 텍사스 오픈 · 마스터스 · BWF 호주오픈 · 소니오픈).
 * 이미 정제된 값을 두고 제목을 깎아낼 이유가 없다.
 *
 * 본문에 그대로 나오는지 확인한다. Rank Math 는 있는 그대로 찾으므로,
 * 본문에 없는 말이면 제목에 써도 그 글의 키워드가 되지 못한다.
 */
export function 대회명고르기(post) {
  const kw = String(post.focusKeyword || '').replace(/\s+/g, ' ').trim();
  if (kw.length < 2) return '';
  if (!글자만(post.content).includes(kw)) return '';
  return kw;
}

/** 새 제목. 본문에서 찾은 라벨과 금액을 그대로 쓴다. */
export function 새제목(연도, 대회명, 상금) {
  // 대표 키워드가 이미 연도로 시작하면 두 번 붙이지 않는다.
  const 머리 = 연도 && !대회명.startsWith(연도) ? `${연도} ${대회명}` : 대회명;
  return `${머리} ${상금.라벨} (${상금.금액}, 중계는 어디서 보나?)`;
}

/**
 * 바꿀 값이 있는 글인가. 없으면 null.
 *
 * 대표 키워드는 건드리지 않는다. 이미 정확한 값이고, 새 제목 안에 그대로
 * 들어가므로 Rank Math 의 "제목에 키워드" 검사도 통과한다. 한 번에 여러 값을
 * 움직이면 무엇이 효과를 냈는지 알 수 없다.
 */
export function 다듬을거리(post) {
  const 상금 = 상금찾기(post.content);
  if (!상금) return null;
  const 대회명 = 대회명고르기(post);
  if (!대회명) return null;
  const title = 새제목(연도뽑기(post.title), 대회명, 상금);
  if (title === post.title) return null;
  // 제목이 너무 길면 검색결과에서 잘린다. 자르지 말고 건너뛴다.
  if (title.length > 70) return null;
  return { title };
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
  console.log(`   상금은 있으나 대표 키워드가 없거나 본문에 없어 건너뜀 ${제목못품}편`);
  if (실험제외.length) {
    console.log(`   10-30 메타 실험 중이라 건너뜀 ${실험제외.length}편: ${실험제외.map((x) => x.post.id).join(', ')}`);
  }
  console.log(`   ▶ 바꿀 글 ${대상.length}편`);
  if (!대상.length) { console.log('\n   손볼 제목이 없습니다.\n'); return; }

  for (const { post, 바꿀값 } of 대상.slice(0, 30)) {
    console.log(`\n   [${post.id}] ${post.date}`);
    console.log(`     전: ${post.title}`);
    console.log(`     후: ${바꿀값.title}`);
    console.log(`     대표 키워드: ${post.focusKeyword} (그대로 둡니다)`);
  }
  if (대상.length > 30) console.log(`\n   … 그 밖에 ${대상.length - 30}편`);

  if (!적용) {
    console.log('\n실제로 고치려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ 본문·주소(슬러그)·대표 키워드는 건드리지 않습니다. 제목만 바뀝니다.');
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
