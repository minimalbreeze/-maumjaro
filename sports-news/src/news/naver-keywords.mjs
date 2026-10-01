// 네이버 검색광고 키워드도구 — 진짜 월간 검색수를 가져온다.
//
// 왜 이걸 붙였나
//   그동안 "관심이 올라오는 주제"를 기사 쏠림으로 추정했다. 대리 신호라 틀릴 수
//   있다. 이 API는 추정이 아니라 네이버가 집계한 실제 월간 검색수를 준다.
//   네이버 회원이면 키를 무료로 발급받는다.
//
// 인증
//   OAuth 토큰이 아니라 요청마다 서명을 만들어 보낸다.
//   서명 = Base64( HMAC-SHA256( secret, `${timestamp}.${method}.${path}` ) )
//
// 없으면 없는 대로 돈다
//   키가 없으면 null을 돌려주고, 파이프라인은 기존 대리 신호로 간다.
//   이 기능 때문에 글 생성이 멈추는 일은 없어야 한다.

import crypto from 'node:crypto';
import { env } from '../utils/env.mjs';
import { withRetry } from '../utils/retry.mjs';

const BASE = 'https://api.searchad.naver.com';
const PATH = '/keywordstool';

/** 키가 다 있을 때만 설정을 돌려준다. 하나라도 없으면 null. */
export function naverAdConfig() {
  const apiKey = env('NAVER_AD_API_KEY', '');
  const secret = env('NAVER_AD_SECRET', '');
  const customerId = env('NAVER_AD_CUSTOMER_ID', '');
  if (!apiKey || !secret || !customerId) return null;
  return { apiKey, secret, customerId };
}

export function hasNaverKeywords() {
  return Boolean(naverAdConfig());
}

/** 서명을 만든다. 형식: {timestamp}.{method}.{path} */
export function makeSignature({ timestamp, method, path, secret }) {
  return crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${method}.${path}`)
    .digest('base64');
}

/**
 * 검색수를 숫자로 바꾼다.
 * 네이버는 검색수가 적으면 숫자 대신 "< 10" 문자열을 준다. 그걸 그대로 쓰면
 * NaN이 되어 정렬이 깨진다. 10 미만이라는 뜻이므로 5로 센다.
 */
export function toCount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const t = String(value ?? '').trim();
  if (!t) return 0;
  if (/^<\s*10$/.test(t)) return 5;
  const n = Number(t.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** 경쟁 정도를 점수로. 낮을수록 개인 블로그가 비집고 들어갈 자리가 있다. */
export function competitionWeight(compIdx) {
  return { 낮음: 10, 중간: 2, 높음: -8 }[String(compIdx || '').trim()] ?? 0;
}

/**
 * 키워드 최대 5개의 월간 검색수를 가져온다.
 * @returns {Promise<Map<string, object>|null>} 키가 없으면 null
 */
export async function fetchKeywordStats(keywords, { timeoutMs = 15000 } = {}) {
  const cfg = naverAdConfig();
  if (!cfg) return null;

  const wanted = [...new Set(keywords.map((k) => String(k).trim()).filter(Boolean))].slice(0, 5);
  if (!wanted.length) return new Map();

  // 힌트 키워드는 공백을 빼고 보낸다. 공백이 있으면 결과가 비는 경우가 있다.
  const url = new URL(BASE + PATH);
  url.searchParams.set('hintKeywords', wanted.map((k) => k.replace(/\s+/g, '')).join(','));
  url.searchParams.set('showDetail', '1');

  const { data } = await withRetry(async () => {
    const timestamp = Date.now().toString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': cfg.apiKey,
          'X-Customer': cfg.customerId,
          'X-Signature': makeSignature({ timestamp, method: 'GET', path: PATH, secret: cfg.secret }),
          accept: 'application/json',
        },
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(naverError(res.status, text));
      return { data: JSON.parse(text) };
    } finally {
      clearTimeout(timer);
    }
  }, { tries: 2, base: 1500, label: '네이버 키워드도구' });

  const out = new Map();
  for (const row of data?.keywordList || []) {
    const pc = toCount(row.monthlyPcQcCnt);
    const mobile = toCount(row.monthlyMobileQcCnt);
    out.set(String(row.relKeyword || '').trim(), {
      keyword: String(row.relKeyword || '').trim(),
      pc,
      mobile,
      total: pc + mobile,
      competition: row.compIdx || '',
    });
  }
  return out;
}

/** 오류 문구를 사람이 고칠 수 있게 바꾼다. 키 값 자체는 절대 담지 않는다. */
function naverError(status, text) {
  const body = String(text || '').slice(0, 200);
  if (status === 401) {
    return '네이버 검색광고 인증 실패(401). API 키·비밀키·CUSTOMER_ID를 확인하세요';
  }
  if (status === 403) {
    return '네이버 검색광고 권한 없음(403). 발급한 키에 "키워드도구" 권한이 있는지 확인하세요';
  }
  if (status === 429) {
    return '네이버 검색광고 호출이 너무 잦습니다(429). 잠시 뒤 다시 시도하세요';
  }
  return `네이버 검색광고 오류(${status}) ${body}`;
}

/** 흔해서 검색어가 되지 못하는 말들 — 이걸로 검색수를 물어봐야 의미가 없다. */
const 흔한말 = /^(경기|대회|선수|우승|출전|시즌|오늘|내일|관련|소식|기록|한국|대표팀|출격|확정|개막)$/;

/** 대회 이름에 붙는 꼬리들. 이게 붙은 낱말은 거의 확실히 검색어다. */
const 대회꼬리 = /(컵|배|리그|오픈|챔피언십|시리즈|선수권|마스터스|클래식)$/;

/** 용언 어미. "버렸을까", "확정됐다" 같은 말은 아무도 검색하지 않는다. */
const 용언꼬리 = /(까|다|요|네|죠|지|음|함|했|됐|한다|된다|하다|이다)$/;

/**
 * 글감 제목에서 검색수를 물어볼 키워드를 하나 고른다.
 *
 * 가장 긴 낱말을 집으면 "버렸을까" 같은 서술어가 뽑힌다. 그래서 점수를 매긴다:
 * 대회 이름 꼴에 가점, 서술어 꼴에 감점, 그다음이 길이다.
 */
export function searchKeywordFor(label) {
  const words = String(label || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    // 숫자만 있거나 "106년", "8강"처럼 숫자+단위인 말은 검색어가 아니다.
    .filter((w) => w.length >= 2 && !흔한말.test(w) && !/^\d+(년|회|호|명|개|위|점|차|주|월|일|승|패|강|호선)?$/.test(w));
  if (!words.length) return '';

  const 점수 = (w) => {
    let n = w.length;
    if (대회꼬리.test(w)) n += 6;
    if (용언꼬리.test(w)) n -= 8;
    if (/^[A-Za-z]+$/.test(w)) n -= 1;   // 약어(AG 등)는 단독 검색어가 되기 어렵다
    return n;
  };

  return words.slice().sort((a, b) => 점수(b) - 점수(a))[0];
}

/**
 * 상위 후보들에 실제 검색수를 붙인다.
 * 한 번에 5개까지만 물어볼 수 있으므로 상위 몇 개만 본다 — 어차피 그중에서 고른다.
 * 실패해도 글 생성은 멈추지 않는다. 신호가 없으면 대리 신호로 간다.
 */
export async function attachSearchVolume(clusters, { limit = 5, onError } = {}) {
  if (!hasNaverKeywords() || !clusters.length) return clusters;

  const top = clusters.slice(0, limit);
  const keywords = top.map((c) => searchKeywordFor(c.label)).filter(Boolean);
  if (!keywords.length) return clusters;

  let stats;
  try {
    stats = await fetchKeywordStats(keywords);
  } catch (err) {
    onError?.(err.message);
    return clusters;
  }
  if (!stats) return clusters;

  for (const c of top) {
    const kw = searchKeywordFor(c.label);
    // 네이버는 공백을 뺀 형태로 돌려주므로 둘 다 찾아본다.
    const hit = stats.get(kw) || stats.get(kw.replace(/\s+/g, ''));
    if (hit) c.searchVolume = hit;
  }
  return clusters;
}
