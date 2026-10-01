// 검색 수요 신호 — "관심은 올라오는데 아직 경쟁은 덜한" 글감을 가려낸다.
//
// 솔직히 밝혀둘 것: 우리는 구글 트렌드나 네이버 데이터랩에 접근하지 못한다.
// 그래서 "검색량"을 직접 알 수는 없다. 대신 이미 긁어온 기사 목록만으로
// 계산할 수 있는 대리 신호 두 가지를 쓴다. 지어낸 숫자보다 낫다.
//
//  1) 상승(burst): 최근 24시간 기사 수가 그 앞 기간의 하루 평균보다 많은가.
//     언론이 갑자기 몰려 쓰기 시작했다면 사람들도 그때 찾기 시작한다.
//
//  2) 경쟁(crowding): 몇 개 매체가 이미 다뤘는가.
//     20개 매체가 쓴 사건은 검색결과를 언론사가 다 가져간다. 개인 블로그가
//     비집고 들어갈 자리가 없다. 반대로 1곳만 쓴 건 교차 확인이 안 된다.
//     2~4곳이 우리가 노릴 구간이다.

/** 기사들의 발행 시각 분포에서 상승 신호를 뽑는다. */
export function burstSignal(articles, { now = Date.now(), windowHours = 168 } = {}) {
  const times = articles
    .map((a) => (a.publishedAt ? new Date(a.publishedAt).getTime() : NaN))
    .filter((t) => Number.isFinite(t) && now - t <= windowHours * 3600000);

  if (times.length < 2) return { recent: times.length, baseline: 0, ratio: 0, rising: false };

  const DAY = 24 * 3600000;
  const recent = times.filter((t) => now - t <= DAY).length;
  const older = times.length - recent;
  // 앞 기간의 하루 평균. 최소 1일로 나눠 0으로 나누는 것을 막는다.
  const olderDays = Math.max(1, (windowHours - 24) / 24);
  const baseline = older / olderDays;

  const ratio = baseline > 0 ? recent / baseline : (recent >= 2 ? 3 : 0);
  return { recent, baseline: Number(baseline.toFixed(2)), ratio: Number(ratio.toFixed(2)), rising: ratio >= 1.5 && recent >= 2 };
}

/**
 * 매체 수로 경쟁 밀도를 본다.
 *
 * 'sweet'  : 2~4곳 — 교차 확인은 되는데 아직 검색결과가 비어 있다
 * 'crowded': 5곳 이상 — 언론사가 상위를 다 가져간다
 * 'thin'   : 1곳 — 사실 확인이 안 된다 (이미 앞 단계에서 걸러진다)
 */
export function crowding(sourceCount) {
  if (sourceCount >= 8) return { level: 'crowded', weight: -10, label: `매체 ${sourceCount}곳 — 경쟁 심함` };
  if (sourceCount >= 5) return { level: 'crowded', weight: -4, label: `매체 ${sourceCount}곳 — 경쟁 있음` };
  if (sourceCount >= 2) return { level: 'sweet', weight: 8, label: `매체 ${sourceCount}곳 — 경쟁 덜함` };
  return { level: 'thin', weight: -6, label: '매체 1곳 — 교차 확인 불가' };
}

/** 한 글감의 수요 신호를 한 번에 계산한다. */
export function demandSignals(cluster, { now = Date.now(), windowHours = 168 } = {}) {
  const burst = burstSignal(cluster.articles || [], { now, windowHours });
  const crowd = crowding(cluster.sourceCount || 0);

  const weight = crowd.weight + (burst.rising ? 10 : 0);
  const reasons = [crowd.label];
  if (burst.rising) reasons.push(`최근 24시간 ${burst.recent}건 — 관심 상승(평소의 ${burst.ratio}배)`);

  return { burst, crowd, weight, reasons };
}
