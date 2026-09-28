// 같은 사건을 다룬 기사끼리 묶는다.
//
// 왜 필요한가: 지시서 [5]가 "기사 하나만 보고 쓰지 않는다"를 요구한다.
// 출처가 2개 이상 모인 묶음만 글감 후보가 되고, 하나뿐인 묶음은 버린다.
// 그래야 "한 매체의 단독 보도를 사실처럼 받아쓰는" 사고를 막는다.

// 조사 목록. 긴 것부터 적어야 "에서"가 "서"보다 먼저 잡힌다.
const PARTICLES = /(에서|께서|에게|한테|으로|이나|라도|처럼|보다|밖에|조차|마저|부터|까지|은|는|이|가|을|를|의|에|와|과|도|만|서|로|나)$/;
const STOPWORDS = new Set([
  '기자','오늘','내일','어제','속보','단독','종합','영상','사진','인터뷰','현장',
  '한국','우리','대한','것으로','대해','위해','통해','밝혔다','전했다','나섰다',
]);

/** 한국어 제목을 비교 가능한 토큰 집합으로 바꾼다. 조사와 상투어를 떼어낸다. */
export function tokenize(text = '') {
  const out = new Set();
  for (const rawWord of text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    for (const form of wordForms(rawWord)) {
      if (form.length >= 2 && !STOPWORDS.has(form)) out.add(form.toLowerCase());
    }
  }
  return out;
}

/**
 * 한 단어에서 원형과 조사를 뗀 형태를 모두 돌려준다.
 *
 * 조사를 떼기만 하면 고유명사가 깨진다. "신진서"의 끝 글자 서는 조사가 아니라
 * 이름의 일부인데, 규칙만으로는 구분할 방법이 없다. 이름이 "신진"으로 잘리면
 * 이 토큰으로 워드프레스를 검색하는 중복 검사까지 같이 망가진다.
 *
 * 그래서 고르지 않고 둘 다 남긴다. "8강서"는 {8강서, 8강}이 되어 "8강"과 만나고,
 * "신진서"는 {신진서, 신진}이 되어 원래 이름을 잃지 않는다.
 */
export function wordForms(word) {
  const forms = [word];
  const stripped = word.replace(PARTICLES, '');
  if (stripped !== word && stripped.length >= 2) forms.push(stripped);
  return forms;
}

/** 검색어·태그처럼 사람이 읽는 곳에는 원형만 쓴다. */
export function mainTokens(text = '') {
  return new Set(
    text
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
      .map((w) => w.toLowerCase())
  );
}

export function sharedCount(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
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
/**
 * 같은 사건을 다룬 기사끼리 묶는다.
 *
 * 제목만 비교한다. 요약은 일부러 뺀다 — 매체마다 요약 문구가 제각각이라,
 * 요약을 섞으면 같은 사건을 다룬 기사끼리도 유사도가 오히려 떨어진다.
 * (실측: 같은 사건 3건이 제목만 비교하면 0.40~0.50, 요약을 섞으면 0.22~0.31.
 *  임계값 0.34 기준으로 전자는 묶이고 후자는 전부 흩어진다.)
 *
 * 사건의 정체는 제목이 갖고 있다. 요약은 그 다음 단계에서 재료로만 쓴다.
 */
export function clusterArticles(items, { threshold = 0.34, minSharedTokens = 2 } = {}) {
  const toks = items.map((it) => tokenize(it.title));
  const parent = items.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      // 유사도만 보면 짧은 제목 둘이 단어 하나 겹쳐도 묶인다.
      // 실제로 같은 사건이라면 고유명사가 최소 둘은 겹친다.
      if (jaccard(toks[i], toks[j]) >= threshold && sharedCount(toks[i], toks[j]) >= minSharedTokens) {
        union(i, j);
      }
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
