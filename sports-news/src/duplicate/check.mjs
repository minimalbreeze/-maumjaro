// 기존 워드프레스 글과의 중복 검사.
//
// 지시서 [7]의 3분류를 그대로 구현한다.
//   A = 새로운 사건/중요한 업데이트 → 새 글 작성 가능
//   B = 기존 글의 단순 반복        → 새 글 작성하지 않음
//   C = 기존 글 업데이트가 더 적절   → 업데이트 후보로 표시
//
// 판단은 두 단계다. 여기(코드)에서는 제목 유사도로 기계적으로 후보를 좁히고,
// 애매한 구간은 ai/analyze.mjs가 실제 내용을 보고 결정한다.
// 코드만으로 B를 확정하면 "같은 대회의 다음 라운드 소식"까지 막아버린다.

import { wpFetch } from '../wordpress/client.mjs';
import { tokenize, jaccard } from '../news/normalize.mjs';

// 이 값들은 경험적으로 정한 선이다. README에 조정 방법을 적어둔다.
const NEAR_DUPLICATE = 0.75; // 이 이상이면 사실상 같은 글
const RELATED = 0.35;        // 이 이상이면 같은 주제를 다룬 글

/** 클러스터에서 워드프레스 검색에 쓸 핵심어를 뽑는다. */
export function searchTermsFor(cluster) {
  const tokens = [...tokenize(cluster.label)];
  // 대회명·선수명 같은 고유명사는 대체로 길다. 긴 토큰 우선.
  const ranked = tokens.sort((a, b) => b.length - a.length).slice(0, 4);
  const terms = new Set(ranked);
  if (cluster.topic) terms.add(cluster.topic);
  return [...terms];
}

export async function findRelatedPosts(cluster, { perTerm = 10 } = {}) {
  const terms = searchTermsFor(cluster);
  const found = new Map();

  for (const term of terms) {
    try {
      const { data } = await wpFetch('/wp/v2/posts', {
        query: {
          search: term,
          per_page: perTerm,
          orderby: 'date',
          order: 'desc',
          status: 'publish,draft,future,pending',
          _fields: 'id,title,link,date,modified,status,categories',
        },
      });
      for (const p of data || []) {
        if (!found.has(p.id)) {
          found.set(p.id, {
            id: p.id,
            title: stripHtml(p.title?.rendered || ''),
            link: p.link,
            date: p.date,
            modified: p.modified,
            status: p.status,
          });
        }
      }
    } catch (err) {
      // 검색어 하나가 실패해도 나머지로 계속 검사한다.
      if (err.status === 401 || err.status === 403) throw err;
    }
  }
  return [...found.values()];
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&').trim();
}

/** 유사도를 계산해 A/B/C 판정과 근거를 만든다. */
export function judgeDuplication(cluster, relatedPosts) {
  const newTokens = tokenize(cluster.label);
  const scored = relatedPosts
    .map((p) => ({ ...p, similarity: jaccard(newTokens, tokenize(p.title)) }))
    .sort((a, b) => b.similarity - a.similarity);

  const top = scored[0];
  const ageDays = top?.date ? (Date.now() - new Date(top.date).getTime()) / 86400000 : null;

  if (!top || top.similarity < RELATED) {
    return {
      verdict: 'A',
      confidence: 'high',
      reason: '비슷한 기존 글을 찾지 못했습니다.',
      related: scored.slice(0, 3),
      needsAiJudgement: false,
    };
  }

  if (top.similarity >= NEAR_DUPLICATE) {
    // 아주 비슷한데 기존 글이 오래됐다면, 새 글보다 업데이트가 맞다.
    if (ageDays !== null && ageDays > 30) {
      return {
        verdict: 'C',
        confidence: 'medium',
        reason: `제목 유사도 ${pct(top.similarity)}인 글이 ${Math.round(ageDays)}일 전에 있습니다. 새 글보다 기존 글 업데이트가 적절합니다.`,
        related: scored.slice(0, 3),
        updateCandidate: top,
        needsAiJudgement: false,
      };
    }
    return {
      verdict: 'B',
      confidence: 'high',
      reason: `제목 유사도 ${pct(top.similarity)}인 최근 글이 이미 있습니다 (${top.title}).`,
      related: scored.slice(0, 3),
      needsAiJudgement: false,
    };
  }

  // 0.35 ~ 0.75 구간 — 같은 대회지만 새 소식일 수 있다. 여기는 AI가 판단한다.
  return {
    verdict: 'A',
    confidence: 'low',
    reason: `유사도 ${pct(top.similarity)}인 관련 글이 있습니다. 새로운 내용인지 AI 판단이 필요합니다.`,
    related: scored.slice(0, 3),
    needsAiJudgement: true,
  };
}

const pct = (n) => `${Math.round(n * 100)}%`;

export const VERDICT_LABEL = {
  A: '새 글 작성 가능',
  B: '중복 가능성 높음 — 작성 안 함',
  C: '기존 글 업데이트 후보',
};

export { NEAR_DUPLICATE, RELATED };
