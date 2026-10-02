// 같은 종목만 연달아 쓰지 않게 한다.
//
// 왜 필요한가
//   점수표(rank.mjs의 실전_유입)는 네이버 실측 CTR 그대로다. 틀리지 않았다.
//   그런데 그 결과로 매일 같은 종목이 1위가 됐다. 파크골프장 개장 기사에는
//   '개장'(+7) '가는 길'(+14) '이용료'(+16) '예약방법'(+18)이 자연히 다 들어가
//   구조적으로 상위를 먹는다. 반면 "안세영 아시안게임 우승"은 상금도 이용방법도
//   없어서 이 가점을 거의 못 받는다.
//
//   실제로 7264·7268·7272 세 편이 연달아 파크골프였다.
//
//   점수표를 깎지는 않는다. 실측을 부정하는 일이 된다. 대신 "최근에 이미 쓴
//   종목"에만 감점을 준다. 그러면 좋은 글감은 여전히 좋은 글감이고, 하루에
//   한 편씩 쓸 때 종목이 자연히 돌아간다.
//
// 조회가 실패하면 감점 없이 그대로 간다 — 다양성 때문에 글을 못 쓰게 되면 안 된다.

import { wpFetch } from '../wordpress/client.mjs';
import { env } from '../utils/env.mjs';

/** 최근 글 몇 편까지 거슬러 보는지. 켜진 종목이 9개라 6편이면 한 바퀴의 2/3다. */
export const LOOKBACK = 6;

/**
 * 같은 카테고리가 최근 몇 편에 들어 있는지에 따른 감점.
 *
 * 누진으로 둔다. 한 번 썼다고 크게 막을 일은 아니지만, 세 번 연속은 막아야 한다.
 */
export function varietyPenalty(category, recent) {
  if (!category || !Array.isArray(recent) || !recent.length) return { weight: 0, reasons: [] };

  const 같은것 = recent.filter((r) => r === category);
  if (!같은것.length) return { weight: 0, reasons: [] };

  const n = 같은것.length;
  const 기본 = n >= 3 ? -30 : n === 2 ? -18 : -8;
  const reasons = [`최근 ${recent.length}편 중 ${n}편이 ${category}`];

  // 바로 직전 글과 같은 종목이면 더 깎는다. 이어서 같은 걸 읽는 느낌이 제일 나쁘다.
  const 직전 = recent[0] === category ? -6 : 0;
  if (직전) reasons.push('직전 글과 같은 종목');

  return { weight: 기본 + 직전, reasons };
}

/**
 * 최근에 만든 글의 카테고리를 최신순으로 돌려준다.
 *
 * 임시글도 센다. 임시글로 쌓아두고 나중에 발행하는 흐름이라, 발행된 것만 보면
 * 방금 만든 파크골프 임시글 세 편이 안 보인다.
 */
export async function recentCategories({ limit = LOOKBACK, categoryNameById } = {}) {
  if (env('VARIETY_PENALTY', 'on') === 'off') return null;

  const { data } = await wpFetch('/wp/v2/posts', {
    query: {
      per_page: limit, page: 1, status: 'publish,draft',
      orderby: 'date', order: 'desc', context: 'edit', _fields: 'id,categories,date,title',
    },
  });
  if (!Array.isArray(data)) return null;

  const 이름 = categoryNameById instanceof Map ? categoryNameById : new Map();
  return data.map((p) => {
    const id = Array.isArray(p.categories) ? p.categories[0] : null;
    return 이름.get(id) || (id != null ? String(id) : '');
  }).filter(Boolean);
}

/** 사이트 카테고리 목록을 id→이름 Map으로 바꾼다. */
export function categoryIndex(siteCategories) {
  const m = new Map();
  for (const c of siteCategories || []) {
    if (c && c.id != null) m.set(c.id, c.name || String(c.id));
  }
  return m;
}
