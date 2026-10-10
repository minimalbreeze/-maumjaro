// 발행된 글 전체를 훑어 "구글이 색인하지 않을 만한 이유"를 찾는다. 읽기만 한다.
//
// 왜 필요한가
//   2026-10-09 서치콘솔: 색인 생성됨 8개, "크롤링됨 - 현재 색인이 생성되지 않음"
//   148개. 95%다. 그리고 7월 11일부터 9월 26일까지 거의 변하지 않았다.
//
//   이 상태는 오류가 아니다. 구글이 글을 다 읽고 "검색결과에 올릴 만하지 않다"고
//   판단한 것이다. 사이트맵 재제출이나 색인 요청으로는 풀리지 않는다.
//
//   그런데 148개 중 어느 것이 왜 그런지는 서치콘솔이 알려주지 않는다. 추측으로
//   손대면 멀쩡한 글까지 건드린다. 그래서 먼저 센다.
//
// 무엇을 보는가 (전부 우리가 직접 셀 수 있는 것만)
//   - 같은 사건을 다룬 글이 둘 이상인가 (7769·7777 이 그랬다)
//   - 본문이 채점 기준(공백 제외 3,000자)에 못 미치는가
//   - 제목이 서로 너무 닮았는가
//
// 무엇을 하지 않는가
//   글을 고치거나 지우지 않는다. 숫자만 센다. 무엇을 지울지는 사람이 정한다.

import { wpFetch } from './client.mjs';

/** 본문에서 태그·스크립트를 걷어내고 공백 제외 글자수를 센다. 채점표와 같은 기준이다. */
export function 본문글자수(html) {
  const 글 = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return 글.replace(/\s+/g, '').length;
}

// 제목에서 걷어낼 말들. 어느 글에나 들어가서 "닮았다"를 잘못 만든다.
const 흔한말 = new Set([
  '정리', '총정리', '완벽', '알아보기', '보기', '확인', '방법', '얼마', '언제', '어디',
  '무엇', '누가', '왜', '어떻게', '이유', '전망', '분석', '소식', '현재', '오늘', '올해',
  '경기', '대회', '선수', '기록', '결과', '일정', '순위', '그리고', '하지만', '위한',
]);

// 낱말 끝에 붙은 조사를 뗀다.
//
// "30승"과 "30승과"가 다른 말로 잡혀서 같은 사건을 다룬 두 글이 안 묶였다.
// 리포는 전에도 같은 문제를 겪었다 — 글 7769 에서 조사 붙은 구절이 대표
// 키워드로 잡혀 SEO 점수가 66점으로 떨어졌고, seo/rankmath.mjs 의
// 조사앞까지() 가 그걸 막는다. 여기서도 같은 이유로 뗀다.
//
// 세 글자 미만은 건드리지 않는다. "상금"의 금, "경기"의 기처럼 낱말의
// 일부를 조사로 오인하면 엉뚱한 말이 된다.
const 조사 = /(으로|에서|에게|까지|부터|과|와|은|는|이|가|을|를|의|에|도|만|로)$/;
export function 조사떼기(word) {
  const w = String(word || '');
  if (w.length < 3) return w;
  const 떼낸것 = w.replace(조사, '');
  // 떼고 나서 두 글자 미만이 되면 원래 말이 조사가 아니었다는 뜻이다.
  return 떼낸것.length >= 2 ? 떼낸것 : w;
}

/**
 * 제목에서 비교에 쓸 낱말만 뽑는다.
 *
 * 이모지·괄호·날짜·기호를 걷어내고 두 글자 이상 낱말만 남긴다. 한 글자는 쓰지
 * 않는다 — 리포 지시서가 "한국어 점수표에 한 글자 패턴을 쓰지 않는다"고 못박았다
 * ('김채영'의 채, '화성시'의 화가 걸렸던 사고가 있었다).
 */
export function 제목낱말(title) {
  const 글 = String(title || '')
    // 이모지와 기호
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    // 괄호 안 (보통 날짜나 보조 질문이라 본체가 아니다)
    .replace(/[(（\[][^)）\]]*[)）\]]/g, ' ')
    // 날짜. 회차(제3회/제4회)는 남긴다 — 그게 대회의 신원이다.
    // 걷어내면 "제3회 란커배"와 "제4회 란커배"가 같은 글로 묶인다.
    .replace(/\d+년|\d+월|\d+일/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ');
  return [...new Set(
    글.split(/\s+/)
      .map((w) => 조사떼기(w.trim()))
      .filter((w) => w.length >= 2 && !흔한말.has(w))
  )];
}

/** 두 제목이 얼마나 닮았는지 (0~1). 공통 낱말 / 합친 낱말. */
export function 닮은정도(a, b) {
  const A = new Set(제목낱말(a));
  const B = new Set(제목낱말(b));
  if (!A.size || !B.size) return 0;
  let 공통 = 0;
  for (const w of A) if (B.has(w)) 공통 += 1;
  return 공통 / (A.size + B.size - 공통);
}

/**
 * 서로 닮은 글끼리 묶는다.
 *
 * 기준값 0.35 는 실측으로 잡았다. 7769·7777(같은 사건을 두 번 쓴 실제 사례)이
 * 0.44 로 묶이고, 같은 선수의 다른 사건(통산 상금 vs 통산 30승)은 0.13 으로
 * 묶이지 않는다. 사이가 넓어서 어림잡은 값이 아니다. 테스트가 그 선을 지킨다.
 */
export function 비슷한글묶기(posts, 기준 = 0.35) {
  const 묶음 = [];
  const 쓴것 = new Set();
  for (let i = 0; i < posts.length; i += 1) {
    if (쓴것.has(i)) continue;
    const 같은무리 = [posts[i]];
    쓴것.add(i);
    for (let j = i + 1; j < posts.length; j += 1) {
      if (쓴것.has(j)) continue;
      if (닮은정도(posts[i].title, posts[j].title) >= 기준) {
        같은무리.push(posts[j]);
        쓴것.add(j);
      }
    }
    if (같은무리.length > 1) 묶음.push(같은무리);
  }
  return 묶음.sort((a, b) => b.length - a.length);
}

// 글의 유형. 리포 실측(config/search-demand.md · config/revenue.md)이 어느
// 유형이 돈이 되는지 이미 말해 주고 있는데, 그게 글 목록과 이어져 있지 않았다.
//
//   1위 유입: "대회명 + 상금" (어스몬다민컵우승상금 134클릭·CTR 18.7%)
//   CTR 10~25%: "시설명 + 이용방법/예약/복장/가격/가는 길"
//   운영자 확인: 광고 클릭이 나는 글은 남서울CC 파3 (시설 글)
//
// 반대로 "중계·시청방법·다시보기"는 대회가 끝나면 검색이 사라진다.
// 유형별로 몇 편이고 얼마나 얇은지를 알면, 어디를 두껍게 할지 추측 없이 정한다.
//
// 두 글자 이상 낱말로만 가린다 — 한 글자 패턴은 쓰지 않는다(리포 지시서).
const 유형규칙 = [
  // '주차'는 앞에 숫자가 오면 주차장이 아니라 "3주차"(몇 번째 주)다.
  // 실제로 "VNL 여자배구대표팀 3주차 경기 중계"가 시설 글로 잡혔다.
  // 리포 지시서가 경고한 그 사고(한 글자·부분 일치가 엉뚱한 말을 먹는 것)와 같다.
  ['시설', /이용료|예약|파크골프장|골프장|파3|가는 ?길|(?<!\d)주차장?(?!기)|요금표|이용 ?방법/],
  ['상금', /상금|연봉|몸값|계약금|누적상금|배당/],
  ['중계', /중계|시청|다시보기|생중계|하이라이트/],
  ['일정', /일정|대진|출전|참가 ?선수|명단/],
  ['결과', /우승|준우승|결승|승리|패배|순위|성적/],
];

/** 제목으로 글의 유형을 가린다. 먼저 걸리는 것이 이긴다 — 돈 되는 쪽이 앞이다. */
export function 글유형(title) {
  const t = String(title || '');
  for (const [이름, 규칙] of 유형규칙) if (규칙.test(t)) return 이름;
  return '기타';
}

/** 글 하나가 색인에서 밀릴 만한 이유를 모은다. 확실한 것만 적는다. */
export function 색인위험(post, { 최소글자수 = 3000 } = {}) {
  const 이유 = [];
  if (post.글자수 < 최소글자수) {
    이유.push(`본문 ${post.글자수.toLocaleString()}자 (기준 ${최소글자수.toLocaleString()}자)`);
  }
  if (!post.description) 이유.push('메타 설명 비어 있음');
  if (!post.focusKeyword) 이유.push('대표 키워드 비어 있음');
  return 이유;
}

/** 발행된 글을 전부 받아온다. 한 번에 100개씩, 끝까지. */
export async function 발행글전부({ perPage = 100, max = 2000 } = {}) {
  const 모음 = [];
  for (let page = 1; 모음.length < max; page += 1) {
    const { data } = await wpFetch('/wp/v2/posts', {
      query: {
        per_page: perPage, page, status: 'publish', context: 'edit',
        orderby: 'date', order: 'desc',
      },
      timeoutMs: 40000,
    });
    const 목록 = Array.isArray(data) ? data : [];
    if (!목록.length) break;
    for (const p of 목록) {
      모음.push({
        id: p.id,
        date: (p.date || '').slice(0, 10),
        title: p.title?.raw || p.title?.rendered || '',
        slug: decodeURIComponent(p.slug || ''),
        link: p.link || '',
        글자수: 본문글자수(p.content?.raw || p.content?.rendered || ''),
        description: p.meta?.rank_math_description || '',
        focusKeyword: p.meta?.rank_math_focus_keyword || '',
        // 카테고리는 글끼리 링크를 걸 때 "같은 종목인가"를 보는 데 쓴다.
        // 제목 낱말만으로는 종목이 같은지 알 수 없다 — 당구 글과 골프 글이
        // 둘 다 '일정' 유형이라는 이유로 이어진 적이 있다.
        categories: Array.isArray(p.categories) ? p.categories : [],
      });
    }
    if (목록.length < perPage) break;
  }
  return 모음;
}

async function main() {
  console.log('\n────────────────────────────────────────────────────────');
  console.log('🔎 색인이 안 되는 이유를 센다 (읽기만 함 · 비용 0원)');
  console.log('────────────────────────────────────────────────────────');

  const 글 = await 발행글전부();
  console.log(`\n발행된 글 ${글.length}편`);
  if (!글.length) return;

  // ① 같은 사건을 두 번 쓴 것 — 7769·7777 이 그랬고, 구글이 둘 다 색인하지 않았다.
  const 묶음 = 비슷한글묶기(글);
  const 겹친글수 = 묶음.reduce((n, m) => n + m.length, 0);
  console.log(`\n[① 서로 닮은 글] ${묶음.length}묶음 · ${겹친글수}편`);
  if (!묶음.length) {
    console.log('   없습니다.');
  } else {
    for (const 무리 of 묶음.slice(0, 25)) {
      console.log('');
      for (const p of 무리) {
        console.log(`   ${p.id}  ${p.date}  ${p.글자수.toLocaleString()}자  ${p.title}`);
      }
    }
    if (묶음.length > 25) console.log(`\n   … 그 밖에 ${묶음.length - 25}묶음`);
  }

  // ② 분량 — 채점표와 같은 기준으로 센다.
  const 짧은글 = 글.filter((p) => p.글자수 < 3000).sort((a, b) => a.글자수 - b.글자수);
  console.log(`\n[② 본문이 3,000자(공백 제외)에 못 미치는 글] ${짧은글.length}편 / ${글.length}편`);
  for (const p of 짧은글.slice(0, 20)) {
    console.log(`   ${p.id}  ${p.date}  ${p.글자수.toLocaleString()}자  ${p.title}`);
  }
  if (짧은글.length > 20) console.log(`   … 그 밖에 ${짧은글.length - 20}편`);

  // ③ SEO 필드가 빈 글
  const 빈메타 = 글.filter((p) => !p.description);
  const 빈키워드 = 글.filter((p) => !p.focusKeyword);
  console.log(`\n[③ 비어 있는 SEO 필드] 메타 설명 ${빈메타.length}편 · 대표 키워드 ${빈키워드.length}편`);

  // ④ 유형별 — 어디를 두껍게 할지 정하는 자리.
  //    리포 실측이 "시설 > 상금" 순으로 돈이 된다고 말한다. 그 유형의 글이
  //    얇으면 그게 제일 아까운 자리다.
  const 유형별 = new Map();
  for (const p of 글) {
    const t = 글유형(p.title);
    if (!유형별.has(t)) 유형별.set(t, []);
    유형별.get(t).push(p);
  }
  console.log('\n[④ 유형별 — 리포 실측상 시설·상금이 돈이 된다]');
  const 중앙 = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] || 0;
  for (const [이름, 목록] of [...유형별].sort((a, b) => b[1].length - a[1].length)) {
    const 얇은것 = 목록.filter((p) => p.글자수 < 3000).length;
    console.log(`   ${이름.padEnd(4)} ${String(목록.length).padStart(4)}편 · 중앙값 ${중앙(목록.map((p) => p.글자수)).toLocaleString().padStart(6)}자 · 3,000자 미만 ${얇은것}편`);
  }

  // 돈 되는 유형 중 얇은 글 — 보강 1순위다.
  const 보강후보 = 글
    .filter((p) => ['시설', '상금'].includes(글유형(p.title)) && p.글자수 < 3000)
    .sort((a, b) => b.글자수 - a.글자수);
  console.log(`\n[⑤ 보강 1순위 — 돈 되는 유형인데 얇은 글] ${보강후보.length}편`);
  console.log('   (두꺼운 것부터 — 조금만 보태면 기준을 넘는 글이다)');
  for (const p of 보강후보.slice(0, 25)) {
    console.log(`   ${p.id}  ${p.date}  ${p.글자수.toLocaleString().padStart(6)}자  ${p.title}`);
  }
  if (보강후보.length > 25) console.log(`   … 그 밖에 ${보강후보.length - 25}편`);

  // ⑥ 분량 분포 — 전체 그림을 한 줄로.
  const 정렬 = [...글].map((p) => p.글자수).sort((a, b) => a - b);
  const 중앙값 = 정렬[Math.floor(정렬.length / 2)] || 0;
  const 평균 = Math.round(정렬.reduce((s, n) => s + n, 0) / (정렬.length || 1));
  console.log(`\n[⑥ 분량] 중앙값 ${중앙값.toLocaleString()}자 · 평균 ${평균.toLocaleString()}자 · 가장 짧은 글 ${(정렬[0] || 0).toLocaleString()}자`);

  console.log('\n이 도구는 숫자만 셉니다. 무엇을 지우고 무엇을 살릴지는 사람이 정합니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
