// 네이버 데이터랩 검색어트렌드 — 어떤 주제의 관심이 올라오고 있는지.
//
// 왜 이걸 쓰나
//   원래는 검색광고 키워드도구(월간 검색수)를 붙이려 했는데, 네이버가 광고
//   계정 생성을 막는 경우가 있다. 데이터랩은 광고 계정도 사업자등록도 필요
//   없다. 네이버 개발자센터에서 앱 하나만 등록하면 된다.
//
// 무엇이 다른가 (중요)
//   검색광고: "월 8,100회" — 절대 검색수
//   데이터랩: "0~100 상대지수" — 요청에 넣은 키워드들 사이의 상대 크기와 추이
//
//   그래서 "월 몇 회인가"는 알 수 없다. 대신 "어느 쪽이 더 크고, 올라오는
//   중인가"는 알 수 있다. 글감을 고르는 데는 이것으로 충분하다.
//   상대지수를 검색수인 척 쓰면 판단이 틀어진다 — 섞지 않는다.

import { env } from '../utils/env.mjs';
import { withRetry } from '../utils/retry.mjs';

const ENDPOINT = 'https://openapi.naver.com/v1/datalab/search';

export function naverTrendConfig() {
  const clientId = env('NAVER_CLIENT_ID', '');
  const clientSecret = env('NAVER_CLIENT_SECRET', '');
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function hasNaverTrend() {
  return Boolean(naverTrendConfig());
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * 최근 구간과 그 앞 구간의 평균을 비교해 상승 여부를 본다.
 * @param {Array<{period:string, ratio:number}>} data 날짜순
 */
export function risingFrom(data, { recentDays = 7 } = {}) {
  const points = (data || []).filter((p) => Number.isFinite(p.ratio));
  if (points.length < 4) return { recent: 0, earlier: 0, ratio: 0, rising: false };

  const recentPoints = points.slice(-recentDays);
  const earlierPoints = points.slice(0, -recentDays);
  if (!earlierPoints.length) return { recent: 0, earlier: 0, ratio: 0, rising: false };

  const avg = (xs) => xs.reduce((s, p) => s + p.ratio, 0) / xs.length;
  const recent = avg(recentPoints);
  const earlier = avg(earlierPoints);
  const ratio = earlier > 0 ? recent / earlier : (recent > 0 ? 3 : 0);

  return {
    recent: Number(recent.toFixed(1)),
    earlier: Number(earlier.toFixed(1)),
    ratio: Number(ratio.toFixed(2)),
    rising: ratio >= 1.3 && recent >= 5,
  };
}

/**
 * 키워드 최대 5개의 검색 추이를 한 번에 가져온다.
 * 한 번의 요청 안에서만 상대 비교가 성립한다 — 다른 요청의 숫자와 비교하면 안 된다.
 * @returns {Promise<Map<string, object>|null>} 키가 없으면 null
 */
export async function fetchTrends(keywords, { days = 30, timeoutMs = 15000, now = Date.now() } = {}) {
  const cfg = naverTrendConfig();
  if (!cfg) return null;

  const wanted = [...new Set(keywords.map((k) => String(k).trim()).filter(Boolean))].slice(0, 5);
  if (!wanted.length) return new Map();

  const body = {
    startDate: ymd(now - days * 86400000),
    endDate: ymd(now - 86400000),   // 어제까지. 오늘은 집계가 덜 됐다.
    timeUnit: 'date',
    keywordGroups: wanted.map((k) => ({ groupName: k, keywords: [k] })),
  };

  const { data } = await withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': cfg.clientId,
          'X-Naver-Client-Secret': cfg.clientSecret,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(trendError(res.status, text));
      return { data: JSON.parse(text) };
    } finally {
      clearTimeout(timer);
    }
  }, { tries: 2, base: 1500, label: '네이버 데이터랩' });

  const out = new Map();
  for (const row of data?.results || []) {
    const points = row.data || [];
    const peak = points.reduce((m, p) => Math.max(m, p.ratio || 0), 0);
    out.set(String(row.title || '').trim(), {
      keyword: String(row.title || '').trim(),
      peak: Number(peak.toFixed(1)),
      ...risingFrom(points),
    });
  }
  return out;
}

function trendError(status, text) {
  const body = String(text || '').slice(0, 160);
  if (status === 401) return '데이터랩 인증 실패(401). NAVER_CLIENT_ID·NAVER_CLIENT_SECRET을 확인하세요';
  if (status === 403) {
    return '데이터랩 권한 없음(403). 개발자센터에서 그 앱에 "데이터랩(검색어트렌드)" API를 추가했는지 확인하세요';
  }
  if (status === 429) return '데이터랩 호출이 너무 잦습니다(429). 잠시 뒤 다시 시도하세요';
  return `데이터랩 오류(${status}) ${body}`;
}

/** 추이를 점수로 바꾼다. 상대지수라 절대 검색수처럼 쓰지 않는다. */
export function trendWeight(t) {
  if (!t) return 0;
  let w = 0;
  if (t.rising) w += 14;                       // 관심이 올라오는 중
  if (t.peak >= 60) w += 4;                    // 이 묶음 안에서 큰 편
  else if (t.peak > 0 && t.peak < 5) w -= 6;   // 아무도 안 찾는다
  return w;
}

/**
 * 상위 후보들에 검색 추이를 붙인다.
 * 한 번에 5개까지만 비교할 수 있으므로 상위 몇 개만 본다.
 * 실패해도 글 생성은 멈추지 않는다.
 */
export async function attachTrend(clusters, { limit = 5, onError, keywordOf } = {}) {
  if (!hasNaverTrend() || !clusters.length) return clusters;

  const top = clusters.slice(0, limit);
  const keywords = top.map((c) => keywordOf(c.label)).filter(Boolean);
  if (!keywords.length) return clusters;

  let trends;
  try {
    trends = await fetchTrends(keywords);
  } catch (err) {
    onError?.(err.message);
    return clusters;
  }
  if (!trends) return clusters;

  for (const c of top) {
    const kw = keywordOf(c.label);
    const hit = trends.get(kw);
    if (hit) c.trend = hit;
  }
  return clusters;
}
