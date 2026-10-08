// Rank Math 점수 항목 점검.
//
// Rank Math는 대표 키워드가 어디에 들어가 있는지를 보고 점수를 매긴다.
// 우리가 모든 항목을 통제할 수는 없지만(플러그인이 실제로 계산하므로),
// 글을 쓸 때 지킬 수 있는 항목은 미리 맞춰두고 무엇이 빠졌는지 알려준다.
//
// 주의: 여기서 나오는 점수는 Rank Math의 실제 점수가 아니라 "우리가 통제할 수
// 있는 항목을 얼마나 지켰는지"다. 실제 점수는 플러그인이 매긴다.

/**
 * 키워드가 들어 있는지 본다.
 *
 * 공백·하이픈·구두점을 없애고 비교한다. 이유가 둘 있다.
 *  - 슬러그는 공백이 하이픈으로 바뀐다. 그대로 비교하면 "KBO 신인 드래프트"가
 *    "kbo-신인-드래프트" 안에 없다고 나온다.
 *  - 제목에는 쉼표가 끼어든다. "피트 알론소, 양대 리그 타점왕"은 사람 눈에는
 *    키워드가 들어 있지만, 쉼표 하나 때문에 없다고 판정된 적이 있다.
 */
const KEY_IN = (text, kw) => {
  if (!kw) return false;
  const norm = (s) => String(s).toLowerCase().replace(/[\s\-_,.·‧、，'"'"「」()[\]!?]+/gu, '');
  return norm(text).includes(norm(kw));
};

/**
 * 키워드 밀도를 Rank Math와 같은 방식으로 센다.
 *
 * Rank Math는 본문을 공백으로 끊어 단어 수를 세고, 대표 키워드가 몇 번
 * 나오는지로 밀도를 계산한다. 권장 구간은 1~2.5%다. 1.25% 아래면 "키워드가
 * 부족하다"고 점수를 깎고, 2.5%를 넘으면 반대로 남용으로 본다.
 *
 * 마크다운 기호와 소제목 표시는 빼고 센다 — 사람이 읽는 글이 기준이다.
 */
export function keywordDensity(body, keyword) {
  const text = String(body || '')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>|]/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const words = text.split(/\s+/).filter(Boolean).length;
  const kw = String(keyword || '').trim();
  if (!kw || !words) return { words, count: 0, density: 0 };

  // 정규식 특수문자를 막고, 키워드 안의 공백은 공백 한 칸 이상으로 본다.
  const pattern = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const count = (text.match(new RegExp(pattern, 'gi')) || []).length;
  return { words, count, density: (count / words) * 100 };
}

/**
 * 목표 분량에서 대표 키워드를 몇 번 써야 1.25%가 되는지 알려준다.
 *
 * 기준은 분량 상한(5,500자)으로 잡는다. 3,500자로 잡았더니 실제로 4,159자짜리
 * 글이 나와 밀도가 1.07%에 그쳤다. 글이 길어질수록 같은 횟수로는 밀도가 떨어지므로
 * 가장 긴 경우를 기준으로 잡아야 어느 길이로 나와도 1.25% 아래로 떨어지지 않는다.
 * 짧게 나와도 2.5%를 넘지 않는 선이다.
 */
export function targetKeywordCount(targetChars = 5500) {
  // 한국어는 공백 기준 한 단어가 대략 3.5자다.
  const words = Math.round(targetChars / 3.5);
  return Math.min(20, Math.max(8, Math.ceil(words * 0.0125)));
}

/**
 * 조사가 붙은 낱말인지. 키워드 후보에서 걸러내려고 쓴다.
 *
 * 왜 필요한가: 글 7769 에서 대표 키워드가 "신지애가 일본여자오픈 골프선수권대회"로
 * 잡혔다. 본문에 그대로 나오는 구절을 자동으로 찾다가 조사 '가'가 붙은 말을
 * 집은 것이다. 사람은 "신지애가"로 검색하지 않는다. 슬러그까지 그걸로 들어갔고
 * 제목과 어긋나서 SEO 점수가 66점으로 떨어졌다.
 *
 * 조사를 떼지 않고 **버린다**. 떼는 건 위험하다 — "국가"에서 '가'를 떼면 "국"이
 * 된다. 받침 없는 2자 이상 한글 낱말 뒤에 붙은 조사만 조심스럽게 본다.
 */
const 조사 = /(?:은|는|이|가|을|를|에|의|와|과|도|만|로|으로|에서|에게|부터|까지|보다|처럼|라며|이라며|라고|이라고|했다|한다|이다)$/;
export function 조사붙은낱말인가(word) {
  const w = String(word || '').trim();
  // 한글 낱말만 본다. 영문·숫자는 조사가 붙지 않는다(KBO, LPGA, 3R).
  if (!/^[가-힣]{3,}$/.test(w)) return false;
  if (!조사.test(w)) return false;
  // 조사를 뗀 뒤에도 2자 이상 남아야 조사로 본다. "국가"→"국"은 조사가 아니다.
  const 뗀뒤 = w.replace(조사, '');
  return 뗀뒤.length >= 2;
}

/** 후보 구절에서 조사가 붙은 낱말이 나오면 그 앞까지만 쓴다. 없으면 빈 문자열. */
export function 조사앞까지(phrase) {
  const words = String(phrase || '').trim().split(/\s+/).filter(Boolean);
  const kept = [];
  for (const w of words) {
    if (조사붙은낱말인가(w)) break;
    kept.push(w);
  }
  return kept.join(' ');
}

/**
 * @param {object} a
 * @param {string} a.title     블로그 제목
 * @param {string} a.seoTitle  SEO 제목
 * @param {string} a.body      본문(마크다운)
 * @param {string} a.metaDescription
 * @param {string} a.focusKeyword
 * @param {string} a.slug
 * @param {number} a.imageCount
 * @param {string[]} a.imageAlts
 */
export function checkRankMath(a) {
  const kw = a.focusKeyword || '';
  const body = a.body || '';
  const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  // 첫 문단 = 소제목 이전의 본문
  const firstChunk = body.split(/^##\s+/m)[0] || '';
  const textOnly = body.replace(/^#+\s+/gm, '').replace(/\s+/g, '');
  const dens = keywordDensity(body, kw);
  const hasFaq = /^##\s*[^\n]*(자주 묻는|Q&A|궁금)/m.test(body) || /\*\*Q\./.test(body);

  const items = [
    { id: 'kw-set', label: '대표 키워드가 정해져 있다', ok: Boolean(kw), weight: 3,
      fix: 'Rank Math의 대표 키워드 칸을 채워야 점수가 매겨집니다 (비어 있으면 N/A)' },
    { id: 'kw-seotitle', label: 'SEO 제목에 키워드', ok: KEY_IN(a.seoTitle, kw), weight: 3,
      fix: 'SEO 제목 앞쪽에 대표 키워드를 넣으세요' },
    { id: 'kw-title', label: '글 제목에 키워드', ok: KEY_IN(a.title, kw), weight: 2,
      fix: '글 제목에 대표 키워드를 넣으세요' },
    { id: 'kw-meta', label: '메타 설명에 키워드', ok: KEY_IN(a.metaDescription, kw), weight: 2,
      fix: '메타 설명에 대표 키워드를 넣으세요' },
    { id: 'kw-slug', label: '슬러그에 키워드', ok: KEY_IN(decodeURIComponent(a.slug || ''), kw), weight: 2,
      fix: '주소(슬러그)에 대표 키워드를 넣으세요' },
    { id: 'kw-first', label: '첫 문단에 키워드', ok: KEY_IN(firstChunk, kw), weight: 3,
      fix: '도입부 첫 문단 안에 대표 키워드가 나오게 쓰세요' },
    { id: 'kw-heading', label: '소제목에 키워드', ok: headings.some((h) => KEY_IN(h, kw)), weight: 2,
      fix: '소제목 중 하나에 대표 키워드를 넣으세요' },
    { id: 'kw-alt', label: '이미지 alt에 키워드', ok: (a.imageAlts || []).some((t) => KEY_IN(t, kw)), weight: 2,
      fix: '이미지 대체텍스트에 대표 키워드를 넣으세요' },
    { id: 'kw-density', label: `키워드 밀도 ${dens.density.toFixed(2)}% (${dens.count}회 / ${dens.words}단어)`,
      ok: dens.density >= 1.25 && dens.density <= 2.5, weight: 3,
      fix: dens.density > 2.5
        ? '대표 키워드가 너무 자주 나옵니다. 2.5% 아래로 줄이세요'
        : `대표 키워드를 ${Math.max(0, Math.ceil(dens.words * 0.0125) - dens.count)}회 더 넣어 1.25% 이상으로 올리세요` },
    { id: 'length', label: `본문이 충분히 길다 (${textOnly.length}자)`, ok: textOnly.length >= 3000, weight: 3,
      fix: '본문을 3,000자 이상으로 늘리세요' },
    { id: 'headings', label: `소제목이 충분하다 (${headings.length}개)`, ok: headings.length >= 6, weight: 2,
      fix: '소제목을 6개 이상 두세요' },
    { id: 'faq', label: '자주 묻는 질문 섹션이 있다', ok: hasFaq, weight: 2,
      fix: '질문형 검색어와 AI 인용을 잡으려면 Q&A 섹션을 두세요' },
    { id: 'image', label: `이미지가 있다 (${a.imageCount || 0}장)`, ok: (a.imageCount || 0) >= 1, weight: 2,
      fix: '이미지를 최소 1장 넣으세요' },
    { id: 'link-in', label: '내부 링크가 있다', ok: /maumjaro\.minimalbreeze\.com|wiki\.minimalbreeze\.com/.test(body) || (a.imageCount || 0) >= 1, weight: 1,
      fix: '내 사이트의 다른 글로 가는 링크를 하나 넣으세요' },
  ];

  const total = items.reduce((s, i) => s + i.weight, 0);
  const got = items.filter((i) => i.ok).reduce((s, i) => s + i.weight, 0);
  return {
    items,
    score: Math.round((got / total) * 100),
    missing: items.filter((i) => !i.ok),
  };
}

/**
 * 슬러그를 만든다.
 *
 * 기존 글이 한글 슬러그를 쓰고 있고(예: 야구-타율-3할), Rank Math도 슬러그에
 * 대표 키워드가 들어가야 점수를 준다. 영문으로 강제 변환하면 둘 다 잃는다.
 */
export function buildSlug({ focusKeyword, title, fallback = '' }) {
  const src = String(focusKeyword || title || fallback).trim();
  const s = src
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')   // 한글·영문·숫자만 남긴다
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '');
  return s || `${String(fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
}

/**
 * 본문에 실제로 들어 있는 대표 키워드를 고른다.
 *
 * 왜 필요한가 (실제로 당한 일)
 *   본문은 A라는 키워드를 염두에 두고 썼는데, SEO 단계가 본문을 읽고 제 나름대로
 *   더 긴 B("피트 알론소 양대 리그 타점왕")를 골랐다. B는 본문에 그 형태로 단 한 번도
 *   나오지 않는 말이라 키워드 밀도가 0.00%가 됐다. Rank Math는 대표 키워드를
 *   "있는 그대로" 찾기 때문에, 본문에 없는 말을 대표 키워드로 정하면 점수가 0이다.
 *
 * 그래서 후보들을 실제 본문에 대고 세어 보고 가장 나은 것을 고른다.
 * 긴 후보는 앞에서부터 잘라 짧은 형태도 후보에 넣는다 — 긴 구절은 통째로
 * 반복되지 않지만 그 앞머리(사람 이름, 대회명)는 반복되기 때문이다.
 *
 * 다만 너무 짧게 잘라내면 안 된다. 실제로 "경주 알천파크골프장 야간개장"이
 * 일반명사 "파크골프"로 떨어진 적이 있다. 밀도는 올라가지만 전국 수백 개
 * 블로그와 싸우는 말이라 1페이지에 갈 수 없다.
 *
 * 실측 데이터(config/search-demand.md)가 이걸 뒷받침한다. 클릭이 나는 건
 * "남서울 파3 이용방법", "어스몬다민컵우승상금" 같은 구체적인 말이다.
 * 그래서 일반명사 한 낱말짜리에는 감점을 준다.
 */
/** 너무 흔해서 단독으로는 상위 노출이 어려운 말. 감점 대상이다. */
const 일반명사 = /^(파크골프|골프|야구|축구|농구|배구|바둑|당구|볼링|배드민턴|테니스|스포츠|경기|대회|선수|리그|시즌|우승|기록)$/;

/**
 * 키워드 후보에서 검색어가 될 수 없는 껍데기를 벗긴다.
 *
 * 실측 사고: 제목에 작은따옴표가 있는 기사에서 대표 키워드가
 * \`'2026 우리할매떡볶이 어린이\` 로 저장됐다. 따옴표로 시작하는 말을 검색창에
 * 치는 사람은 없다.
 *
 * 왜 걸러지지 않았나 — 밀도를 셀 때(KEY_IN)는 구두점을 무시하고 센다. 그래서
 * 따옴표가 붙은 후보도 밀도 1.26%로 멀쩡해 보였고, 권장 구간(1.25~2.5%)에
 * 들어 1순위가 됐다. 세는 쪽은 따옴표를 무시하는데 저장하는 쪽은 붙여서 저장한
 * 것이다. 세는 기준과 저장하는 값을 같게 만든다.
 */
export function 키워드정리(v) {
  return String(v || '')
    .replace(/\s+/g, ' ')
    // 앞뒤의 따옴표·괄호·가운뎃점 따위를 벗긴다. 낱말 사이의 것은 건드리지 않는다.
    .replace(/^[\s'"‘’“”(){}\[\]<>·,.!?:;~\-—–]+/, '')
    .replace(/[\s'"‘’“”(){}\[\]<>·,.!?:;~\-—–]+$/, '')
    // 안쪽에 따옴표나 괄호가 남았으면 거기서 끊는다. 검색어에 들어갈 기호가 아니다.
    // (하이픈·점은 "3-1", "No.1" 처럼 낱말에 쓰이므로 건드리지 않는다.)
    .replace(/['"‘’“”(){}\[\]<>].*$/, '')
    .trim();
}

export function chooseFocusKeyword(body, candidates = []) {
  const seen = new Set();
  const pool = [];

  for (const c of candidates) {
    // 조사가 붙은 낱말이 섞인 후보는 그 앞까지만 쓴다. 사람이 검색하는 말이 아니다.
    const kw = 조사앞까지(키워드정리(c));
    if (!kw) continue;
    const words = kw.split(' ');
    // 원래 형태부터 두 낱말까지 앞에서부터 줄여가며 후보로 넣는다.
    for (let n = words.length; n >= Math.min(2, words.length); n--) {
      const form = 키워드정리(words.slice(0, n).join(' '));
      if (form.length < 2 || seen.has(form)) continue;
      seen.add(form);
      pool.push(form);
    }
  }
  if (!pool.length) return { keyword: '', density: 0, candidates: [] };

  const scored = pool
    .map((kw) => ({ keyword: kw, 일반: 일반명사.test(kw), ...keywordDensity(body, kw) }))
    .sort((a, b) => {
      // 일반명사는 밀도가 아무리 높아도 뒤로 민다. 1페이지에 갈 수 없는 말이다.
      if (a.일반 !== b.일반) return a.일반 ? 1 : -1;
      // 1.25~2.5% 안에 드는 것이 최우선. 그중에서는 긴 쪽(더 구체적인 쪽)을 쓴다.
      const inRange = (x) => x.density >= 1.25 && x.density <= 2.5;
      if (inRange(a) !== inRange(b)) return inRange(a) ? -1 : 1;
      if (inRange(a) && inRange(b)) return b.keyword.length - a.keyword.length;
      // 아무도 범위에 못 들면 밀도가 높은 쪽.
      return b.density - a.density;
    });

  return { ...scored[0], candidates: scored };
}
