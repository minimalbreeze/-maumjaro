// 같은 사건을 다룬 기사끼리 묶는다.
//
// 왜 필요한가: 지시서 [5]가 "기사 하나만 보고 쓰지 않는다"를 요구한다.
// 출처가 2개 이상 모인 묶음만 글감 후보가 되고, 하나뿐인 묶음은 버린다.
// 그래야 "한 매체의 단독 보도를 사실처럼 받아쓰는" 사고를 막는다.

const PARTICLES = /(은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|까지|부터|에게|한테|께서)$/;
const STOPWORDS = new Set([
  '기자','오늘','내일','어제','속보','단독','종합','영상','사진','인터뷰','현장',
  '한국','우리','대한','것으로','대해','위해','통해','밝혔다','전했다','나섰다',
]);

/** 한국어 제목을 비교 가능한 토큰 집합으로 바꾼다. 조사와 상투어를 떼어낸다. */
export function tokenize(text = '') {
  return new Set(
    text
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((w) => w.replace(PARTICLES, ''))
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
      .map((w) => w.toLowerCase())
  );
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * 단일 연결(single-linkage) 군집화.
 * 기사 수가 종목당 수십 건이라 O(n²)로 충분하다.
 */
export function clusterArticles(items, { threshold = 0.34 } = {}) {
  const toks = items.map((it) => tokenize(`${it.title} ${it.summary || ''}`));
  const parent = items.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (jaccard(toks[i], toks[j]) >= threshold) union(i, j);
    }
  }

  const groups = new Map();
  items.forEach((it, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(it);
  });

  return [...groups.values()].map(toCluster);
}

function toCluster(articles) {
  const sorted = [...articles].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const sources = [...new Set(sorted.map((a) => a.source).filter(Boolean))];
  return {
    // 가장 최신 기사의 제목을 묶음의 대표 이름으로 삼는다.
    label: sorted[0].title,
    articles: sorted,
    sources,
    sourceCount: sources.length,
    articleCount: sorted.length,
    latestAt: sorted.find((a) => a.publishedAt)?.publishedAt || null,
    hasUndated: sorted.some((a) => a.dateUnknown),
  };
}

/** 출처가 부족한 묶음을 걸러낸다. 걸러진 것도 로그용으로 함께 돌려준다. */
export function splitBySourceCount(clusters, minSources) {
  const enough = [];
  const thin = [];
  for (const c of clusters) (c.sourceCount >= minSources ? enough : thin).push(c);
  return { enough, thin };
}
