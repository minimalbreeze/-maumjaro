// 글감 우선순위 점수.
//
// 지시서 [21]: "1회성 내용은 지양, 오래 검색되고 이슈가 될 만한 내용."
// 그래서 '앞으로 벌어질 일'(대회 프리뷰·일정·출전명단)에 가점을 주고,
// '이미 끝나고 소비된 일'(단일 경기 결과·이적설·잡담)에 감점을 준다.
//
// 여기서 최종 결정을 하지는 않는다. 점수는 Claude에게 넘길 후보의 순서를 정할 뿐이고,
// 실제 채택 여부는 중복 검사와 사실 확인 단계를 거쳐 결정된다.

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

export function scoreCluster(cluster, topic) {
  const text = `${cluster.label} ${cluster.articles.map((a) => a.summary || '').join(' ')}`;
  let score = 0;
  const reasons = [];

  for (const { re, w, why } of LONG_TERM) if (re.test(text)) { score += w; reasons.push(`+${w} ${why}`); }
  for (const { re, w, why } of SHORT_LIVED) if (re.test(text)) { score += w; reasons.push(`${w} ${why}`); }

  // topics.json의 longTermHints — 종목별로 사장님이 직접 지정한 가점 키워드
  for (const hint of topic.longTermHints || []) {
    if (text.includes(hint)) { score += 5; reasons.push(`+5 ${hint}`); }
  }

  // 여러 매체가 함께 다룬 사건일수록 확인 가능한 사실이 많다.
  const srcBonus = Math.min(cluster.sourceCount, 5) * 4;
  score += srcBonus;
  reasons.push(`+${srcBonus} 출처 ${cluster.sourceCount}곳`);

  // 최신일수록 가점. 날짜를 모르는 건은 최신성을 주장할 수 없으므로 감점.
  if (cluster.latestAt) {
    const hours = (Date.now() - new Date(cluster.latestAt).getTime()) / 3600000;
    const fresh = hours <= 12 ? 8 : hours <= 24 ? 5 : hours <= 48 ? 2 : 0;
    if (fresh) { score += fresh; reasons.push(`+${fresh} ${Math.round(hours)}시간 전`); }
  } else {
    score -= 5;
    reasons.push('-5 발행일 미상');
  }

  return { ...cluster, topic: topic.name, category: topic.category, score, reasons };
}

export function rankClusters(clusters, topic) {
  return clusters.map((c) => scoreCluster(c, topic)).sort((a, b) => b.score - a.score);
}
