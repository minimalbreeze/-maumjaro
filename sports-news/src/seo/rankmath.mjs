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
 * 공백과 하이픈을 없애고 비교한다 — 슬러그는 공백이 하이픈으로 바뀌므로
 * 그대로 비교하면 "KBO 신인 드래프트"가 "kbo-신인-드래프트" 안에 없다고 나온다.
 */
const KEY_IN = (text, kw) => {
  if (!kw) return false;
  const norm = (s) => String(s).toLowerCase().replace(/[\s\-_]+/g, '');
  return norm(text).includes(norm(kw));
};

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
    { id: 'length', label: `본문이 충분히 길다 (${textOnly.length}자)`, ok: textOnly.length >= 1500, weight: 3,
      fix: '본문을 1,500자 이상으로 늘리세요' },
    { id: 'headings', label: `소제목이 충분하다 (${headings.length}개)`, ok: headings.length >= 4, weight: 2,
      fix: '소제목을 4개 이상 두세요' },
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
