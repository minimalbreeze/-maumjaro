// 글감 우선순위 점수.
//
// 지시서 [21]: "1회성 내용은 지양, 오래 검색되고 이슈가 될 만한 내용."
// 그래서 '앞으로 벌어질 일'(대회 프리뷰·일정·출전명단)에 가점을 주고,
// '이미 끝나고 소비된 일'(단일 경기 결과·이적설·잡담)에 감점을 준다.
//
// 여기에 검색 수요 신호를 더한다(demand.mjs): "관심은 올라오는데 아직 경쟁은
// 덜한" 글감을 위로 올린다. 예전에는 매체가 많이 다룰수록 가점을 줬는데, 그건
// 경쟁이 가장 센 글감을 1순위로 고르는 셈이었다. 20개 매체가 쓴 사건은 검색결과를
// 언론사가 다 가져간다. 개인 블로그가 비집고 들어갈 자리는 그 반대편에 있다.
//
// 여기서 최종 결정을 하지는 않는다. 점수는 Claude에게 넘길 후보의 순서를 정할 뿐이고,
// 실제 채택 여부는 중복 검사와 사실 확인 단계를 거쳐 결정된다.

import { demandSignals } from './demand.mjs';
import { varietyPenalty } from './variety.mjs';

/**
 * 실제로 클릭을 만드는 검색어 꼴.
 *
 * 추측이 아니라 네이버 서치어드바이저 실측치다(2026-10-01, 최근 90일).
 * config/search-demand.md에 원본을 적어뒀다. 두 덩어리로 갈린다.
 *
 * ① 대회명 + 상금 — 압도적 1위
 *      어스몬다민컵우승상금   134클릭 / 715노출 / CTR 18.7%
 *      변형 10개를 합치면 약 181클릭. 전체 유입의 가장 큰 몫이다.
 *      사람들은 "누가 이겼나"보다 "얼마 받았나"를 훨씬 많이 찾는다.
 *
 * ② 시설명 + 행동 — 꾸준한 2위
 *      남서울 파3 이용방법     38클릭 / 277노출 / CTR 13.7%
 *      서평택 파3 예약방법      6클릭 /  33노출 / CTR 18.2%
 *      안산 제일cc 파3 복장     3클릭 /  13노출 / CTR 23.1%
 *
 * CTR이 10~65%다. 뉴스성 검색어와 비교가 안 된다. 경쟁이 거의 없다는 뜻이고,
 * 한 번 올라가면 계속 들어온다. 그래서 이런 글감에 가장 큰 가점을 준다.
 */
const 실전_유입 = [
  // ① 돈 이야기 — 실측 1위
  { re: /(상금|우승\s?상금|총상금|부상|시상금)/, w: 22, why: '상금 — 실측 유입 1위' },
  { re: /(가격|요금|이용료|참가비|회비|할인)/, w: 16, why: '가격·요금' },

  // ② 시설 이용 안내
  { re: /(이용\s?방법|이용안내|이용 시간|운영\s?시간)/, w: 18, why: '이용방법' },
  { re: /(예약\s?방법|예약제|사전예약|예약 안내)/, w: 18, why: '예약방법' },
  { re: /(복장|드레스\s?코드|복장규정)/, w: 16, why: '복장 — CTR 20% 넘는 꼴' },
  { re: /(가는\s?길|가는법|주차|오시는\s?길|네비|위치)/, w: 14, why: '찾아가는 길' },

  // ③ 보는 방법·입문
  { re: /(중계|보는\s?법|시청\s?방법|생중계|어디서 보)/, w: 14, why: '중계·시청 방법' },
  { re: /(초보|입문|처음|준비물|클럽\s?조합|고르는|규정)/, w: 12, why: '입문자 질문' },
];

const LONG_TERM = [
  { re: /(개막|D-\d|프리뷰|미리보기|앞두고|출사표)/, w: 12, why: '대회 프리뷰' },
  { re: /(일정|스케줄|중계|편성|생중계|시청)/, w: 10, why: '일정·중계 정보' },
  { re: /(출전|엔트리|참가자|명단|조편성|대진)/, w: 10, why: '출전·대진' },
  { re: /(랭킹|순위|상금|포인트|대상|레이스)/, w: 8, why: '랭킹·상금' },
  { re: /(코스|구장|경기장|개장|공략)/, w: 7, why: '코스·경기장' },
  { re: /(디펜딩|타이틀 ?방어|2연패|연패 도전|3연패)/, w: 8, why: '타이틀 방어 스토리' },
  { re: /(시즌|올해|연간|통산|기록|최다|최연소)/, w: 6, why: '시즌 흐름·기록' },
  { re: /(규칙|룰|제도|개정|바뀐)/, w: 6, why: '규칙·제도' },
  { re: /(복귀|부상|재활|공백)/, w: 5, why: '선수 상태' },
];

const SHORT_LIVED = [
  { re: /(속보|긴급|충격|경악|발칵|난리)/, w: -10, why: '자극성 속보' },
  { re: /(시구|팬미팅|예능|SNS|인스타|화보|근황)/, w: -9, why: '비경기 화제' },
  { re: /(오늘의? 경기 결과|어제 경기|하이라이트|한줄평)/, w: -8, why: '단발 경기 결과' },
  { re: /(루머|설|~할 듯|가능성 제기|관측)/, w: -6, why: '확인 안 된 추측' },
];

/**
 * 색인되기 전에 끝나 버리는 글감.
 *
 * 구글 색인은 보통 3~14일 걸린다. 그런데 "3R 유해란 단독 선두"는 하루 뒤면
 * 끝난 이야기다. 색인이 되어 검색결과에 뜨기 시작할 무렵에는 이미 대회가
 * 끝나 있어서 그 말을 찾는 사람이 없다. **방문자가 생기기 시작할 시점에 글이
 * 이미 죽어 있다.**
 *
 * 실제로 글 7685가 그렇게 나왔다. 운영자가 바로 짚었다.
 *
 * 위에 있는 SHORT_LIVED와는 다른 축이다. 저쪽은 "가볍고 자극적인 글감"을 막고,
 * 이쪽은 "유통기한이 색인 기간보다 짧은 글감"을 막는다. '메이저'·'우승 경쟁'
 * 같은 말로 가점을 두둑이 받는 글감도 여기 걸릴 수 있다.
 *
 * 대회 자체(일정·중계·출전명단)는 막지 않는다. 그건 대회 내내 검색된다.
 * 막는 것은 "지금 이 순간의 중간 상황"뿐이다.
 */
const 색인전_소멸 = [
  { re: /(\d\s?R\b|\d\s?라운드\s*(?:째|만에)?\s*(?:순위|선두|경쟁|진행)|중간\s?순위|리더보드)/,
    w: -20, why: '대회 중간 순위 — 색인될 쯤엔 끝나 있다' },
  { re: /(단독\s?선두|공동\s?선두|선두\s?경쟁|추격전|역전\s?우승\s?경쟁)/,
    w: -18, why: '지금 이 순간의 순위 — 하루면 바뀐다' },
  { re: /(\d회\s?말|\d회\s?초|\d이닝|전반전|후반전|\d세트째|연장\s?승부|승부치기)/,
    w: -18, why: '경기 진행 중 상황' },
  { re: /(오늘\s?경기|금일\s?경기|이번\s?주\s?경기|내일\s?경기)/,
    w: -12, why: '읽는 날이 지나면 뜻이 달라진다' },
];

export function scoreCluster(cluster, topic, { recentCategories = null } = {}) {
  const text = `${cluster.label} ${cluster.articles.map((a) => a.summary || '').join(' ')}`;
  let score = 0;
  const reasons = [];

  for (const { re, w, why } of 실전_유입) if (re.test(text)) { score += w; reasons.push(`+${w} ${why}`); }
  for (const { re, w, why } of LONG_TERM) if (re.test(text)) { score += w; reasons.push(`+${w} ${why}`); }
  for (const { re, w, why } of SHORT_LIVED) if (re.test(text)) { score += w; reasons.push(`${w} ${why}`); }
  for (const { re, w, why } of 색인전_소멸) if (re.test(text)) { score += w; reasons.push(`${w} ${why}`); }

  // topics.json의 longTermHints — 종목별로 사장님이 직접 지정한 가점 키워드
  for (const hint of topic.longTermHints || []) {
    if (text.includes(hint)) { score += 5; reasons.push(`+5 ${hint}`); }
  }

  // 검색 수요 신호: 관심은 올라오는데 경쟁은 덜한 쪽에 가점.
  const demand = demandSignals(cluster);
  score += demand.weight;
  for (const r of demand.reasons) reasons.push(`${demand.weight >= 0 ? '+' : ''}${demand.weight} ${r}`);

  // 같은 종목만 연달아 쓰지 않게 감점. 점수표는 그대로 두고 여기서만 조절한다.
  const variety = varietyPenalty(topic.category, recentCategories);
  if (variety.weight) {
    score += variety.weight;
    for (const r of variety.reasons) reasons.push(`${variety.weight} ${r}`);
  }

  // 최신일수록 가점. 날짜를 모르는 건은 최신성을 주장할 수 없으므로 감점.
  if (cluster.latestAt) {
    const hours = (Date.now() - new Date(cluster.latestAt).getTime()) / 3600000;
    const fresh = hours <= 12 ? 8 : hours <= 24 ? 5 : hours <= 48 ? 2 : 0;
    if (fresh) { score += fresh; reasons.push(`+${fresh} ${Math.round(hours)}시간 전`); }
  } else {
    score -= 5;
    reasons.push('-5 발행일 미상');
  }

  return { ...cluster, topic: topic.name, category: topic.category, score, reasons, demand };
}

export { 실전_유입, 색인전_소멸 };

export function rankClusters(clusters, topic, opts = {}) {
  return clusters.map((c) => scoreCluster(c, topic, opts)).sort((a, b) => b.score - a.score);
}
