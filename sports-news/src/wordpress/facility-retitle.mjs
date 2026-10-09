// 시설 글의 제목과 SEO 값을 검색되는 형태로 다시 맞춘다. 본문은 건드리지 않는다.
//
//   node src/wordpress/facility-retitle.mjs            바뀔 내용만 보여준다 (기본)
//   node src/wordpress/facility-retitle.mjs --apply    실제로 고친다
//
// 왜 필요한가
//   발행 633편 중 시설 글이 63편인데, 제목이 전부 같은 틀이다.
//
//     송백지구 파크골프장: 이용료 및 이용방법, 예약방법, 매력포인트(송백리 663)
//     청주 미호강 파크골프장: 이용료 및 이용방법, 예약방법, 매력포인트(미호로 99)
//
//   리포 실측(config/search-demand.md)은 사람이 "시설명 + 시설종류"로 찾는다고
//   말한다("남서울cc 파3" 월 90회). 그런데 지금 제목은 그 뒤에 검색어가 아닌
//   말("매력포인트")과 번지 주소를 길게 달고 있어 대표 키워드가 묻힌다.
//
// 정직하게 밝혀둘 것
//   **이것만으로 색인이 살아난다는 보장은 없다.** 63편이 같은 틀이라는 사실은
//   제목을 다듬어도 그대로다. 글이 서로 달라지려면 본문에 그 시설만의 정보
//   (요금표·전화번호·운영시간)가 들어가야 하고, 그건 우리가 지어낼 수 없다.
//   이 도구는 "검색어가 제목 앞에 오게" 하는 데까지만 한다.
//
// 지키는 선
//   - 본문·슬러그·발행상태를 보내지 않는다. 제목과 SEO 칸만 쓴다.
//     (슬러그를 바꾸면 기존 링크와 순위를 잃는다 — retitle.mjs 와 같은 규칙)
//   - 고치기 전에 원래 값을 파일로 남긴다.
//   - 새 정보를 지어내지 않는다. 지금 제목에 있는 말만 다시 배열한다.
//   - 미리보기가 기본이다.

import { 발행글전부, 글유형 } from './index-audit.mjs';
import { retitlePost } from './retitle.mjs';
import { wpConfig } from './client.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

// 제목 꼬리에 붙은, 아무도 검색하지 않는 말들.
const 군더더기 = /(?:[:：]\s*)?(?:이용료\s*및\s*)?이용\s*방법|예약\s*방법|매력\s*포인트|총정리|안내|완벽\s*가이드/g;

/**
 * 괄호 안이 주소처럼 생겼나.
 *
 * 이 검사가 없으면 모음 글이 망가진다. 실제로 이렇게 나왔다:
 *   "서울 근교 파3 골프장 추천: ...(동호, 파인힐, 한강파3, 일산파3 4개 골프장)"
 *   → "서울 근교 파3 골프장 추천 이용료·예약 방법 (동호, 파인힐, ...)"
 * 괄호 안은 주소가 아니라 골프장 목록이었다. 쉼표로 나열된 긴 말은 주소가 아니다.
 */
export function 주소처럼생겼나(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 25) return false;
  if (t.includes(',')) return false;                 // 나열은 주소가 아니다
  // 번지·도로명에 쓰이는 말 + 숫자가 함께 있어야 주소로 본다.
  return /(리|로|길|동|가|읍|면)\s*\d/.test(t) || /\d+-\d+$/.test(t) || /\d+번지/.test(t);
}

// 시설 하나가 아니라 여러 곳을 묶은 글. 제목 틀이 달라서 손대지 않는다.
const 모음글 = /추천|모음|비교|베스트|총정리|순위|리스트/;

// 이 도구가 붙이는 꼬리. 다시 돌릴 때 떼어내려고 한 곳에 둔다.
const 꼬리표 = '이용료·예약 방법';
const 꼬리 = /\s*이용료·예약 방법\s*$/;

/**
 * 제목을 시설명 / 주소로 가른다.
 *
 * 지금 제목은 "<시설명>: <군더더기>(<주소>)" 모양이다. 괄호 안이 주소이고,
 * 콜론 앞이 시설명이다. 모양이 다르면 건드리지 않는 쪽이다.
 */
export function 제목분해(title) {
  const 글 = String(title || '').trim();
  const 괄호 = 글.match(/[(（]([^)）]*)[)）]\s*$/);
  const 괄호속 = 괄호 ? 괄호[1].trim() : '';
  const 주소 = 주소처럼생겼나(괄호속) ? 괄호속 : '';
  // 주소가 아닌 괄호는 떼지 않는다 — 떼면 뜻이 사라진다.
  const 괄호뺀것 = 주소 ? 글.slice(0, 괄호.index).trim() : 글;
  // 우리가 붙인 꼬리는 떼고 센다. 안 떼면 두 번 돌렸을 때 꼬리가 두 번 붙는다
  //   "송백지구 파크골프장 이용료·예약 방법 이용료·예약 방법 (송백리 663)"
  // 테스트가 이걸 잡았다. 몇 번 돌려도 결과가 같아야 한다.
  const 시설명 = 괄호뺀것.split(/[:：]/)[0].replace(꼬리, '').trim();
  return { 시설명, 주소 };
}

/**
 * 시설명을 대표 키워드로 쓴다.
 *
 * 실측: 사람은 "시설명 + 시설종류"로 찾는다. 조사가 붙은 말이나 긴 구절은
 * 키워드가 아니다(리포가 글 7769 에서 겪은 문제).
 */
export function 대표키워드(시설명) {
  return String(시설명 || '').replace(/\s+/g, ' ').trim();
}

/**
 * 새 제목을 만든다. 없는 말을 더하지 않는다.
 *
 * "<시설명> 이용료·예약 방법 (<주소>)" — 검색어를 맨 앞에 두고, 검색되지
 * 않는 말을 덜어낸다. 주소는 그 시설을 다른 시설과 구분해 주므로 남긴다.
 */
export function 새제목(title) {
  // 시설 안내 틀인 글만 손댄다. 같은 시설을 다룬 뉴스 글에 "이용료·예약 방법"을
  // 붙이면 제목이 거짓말이 된다. 실제로 이렇게 나왔다:
  //   "충주 단월파크골프장, 1억 4천만 원 공사 마치고 재개장 (언제부터 칠 수 있나?)"
  //   → "... 재개장 (언제부터 칠 수 있나?) 이용료·예약 방법"
  군더더기.lastIndex = 0;
  if (!군더더기.test(title)) { 군더더기.lastIndex = 0; return ''; }
  군더더기.lastIndex = 0;

  const { 시설명, 주소 } = 제목분해(title);
  if (!시설명) return '';
  // 여러 시설을 묶은 글은 틀이 달라서 손대지 않는다.
  if (모음글.test(title)) return '';
  const 본체 = `${시설명} ${꼬리표}`;
  return 주소 ? `${본체} (${주소})` : 본체;
}

/** 바꿀 값이 있는 글인가. 이미 정리돼 있으면 건드리지 않는다. */
export function 다듬을거리(post) {
  // 새제목() 이 시설 안내 틀·모음글 여부를 이미 가린다. 빈 값이면 손대지 않는다.
  const 제목 = 새제목(post.title);
  if (!제목 || 제목 === post.title) return null;
  const { 시설명 } = 제목분해(post.title);
  return { title: 제목, focusKeyword: 대표키워드(시설명) };
}

async function main() {
  const 적용 = process.argv.includes('--apply');
  const base = wpConfig().base;

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🏷  시설 글 제목 다시 맞추기 ${적용 ? '(실제 적용)' : '(미리보기 · 비용 0원)'}`);
  console.log(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);
  console.log('────────────────────────────────────────────────────────');

  const 글 = await 발행글전부();
  const 시설 = 글.filter((p) => 글유형(p.title) === '시설');
  const 대상 = 시설.map((p) => ({ post: p, 바꿀값: 다듬을거리(p) })).filter((x) => x.바꿀값);

  console.log(`\n발행 ${글.length}편 · 시설 글 ${시설.length}편 · 다듬을 것 ${대상.length}편`);
  if (!대상.length) { console.log('\n   손볼 제목이 없습니다.\n'); return; }

  for (const { post, 바꿀값 } of 대상.slice(0, 40)) {
    console.log(`\n   [${post.id}] ${post.date}`);
    console.log(`     전: ${post.title}`);
    console.log(`     후: ${바꿀값.title}`);
    console.log(`     대표 키워드: ${post.focusKeyword || '(없음)'} → ${바꿀값.focusKeyword}`);
  }
  if (대상.length > 40) console.log(`\n   … 그 밖에 ${대상.length - 40}편`);

  if (!적용) {
    console.log('\n실제로 고치려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ 본문은 건드리지 않습니다. 제목과 대표 키워드만 바뀝니다.\n');
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
  console.log(`\n${성공}편의 제목을 다시 맞췄습니다. 원래 값은 out/backup/ 에 있습니다.`);
  console.log('※ 이것만으로 색인이 살아난다는 보장은 없습니다. 본문에 그 시설만의');
  console.log('  정보(요금표·전화번호·운영시간)가 들어가야 글이 서로 달라집니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
