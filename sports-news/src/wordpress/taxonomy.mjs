// 카테고리 선택과 태그 처리.
//
// 지시서 [11]: 기존 카테고리를 우선 사용하고, 임의로 계속 만들지 않는다.
// 그래서 이 파일은 카테고리를 절대 새로 만들지 않는다. 매칭에 실패하면
// 가장 넓은 상위 카테고리로 떨어뜨리고 로그에 남긴다.
//
// 태그는 다르다. 태그는 원래 글마다 새로 생기는 것이 정상이므로 없으면 만든다.
// 다만 개수를 [12]의 5~10개로 제한한다.

import { wpFetch, wpFetchAll } from './client.mjs';

/** topics.json의 category 이름을 실제 워드프레스 카테고리 ID로 바꾼다. */
export function resolveCategory(categoryName, siteCategories, { fallbackNames = ['스포츠', '골프'] } = {}) {
  const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  const target = norm(categoryName);

  const exact = siteCategories.find((c) => norm(c.name) === target);
  if (exact) return { id: exact.id, name: exact.name, matched: 'exact' };

  const partial = siteCategories.find((c) => norm(c.name).includes(target) || target.includes(norm(c.name)));
  if (partial) return { id: partial.id, name: partial.name, matched: 'partial' };

  for (const fb of fallbackNames) {
    const hit = siteCategories.find((c) => norm(c.name) === norm(fb));
    if (hit) return { id: hit.id, name: hit.name, matched: 'fallback', requested: categoryName };
  }

  return { id: null, name: null, matched: 'none', requested: categoryName };
}

const MAX_TAGS = 10;
const MIN_TAGS = 5;

export function normalizeTags(tags) {
  const cleaned = [];
  const seen = new Set();
  for (const raw of tags || []) {
    // '#'은 [12]에 따라 제거한다.
    const t = String(raw).replace(/^#+/, '').trim();
    if (!t || t.length > 30) continue;
    const key = t.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(t);
    if (cleaned.length >= MAX_TAGS) break;
  }
  return cleaned;
}

/** 태그 이름 목록을 ID 목록으로 바꾼다. 없는 태그는 새로 만든다. */
export async function resolveTagIds(tagNames) {
  const ids = [];
  for (const name of tagNames) {
    try {
      const { data: found } = await wpFetch('/wp/v2/tags', { query: { search: name, per_page: 20 } });
      const exact = (found || []).find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (exact) { ids.push(exact.id); continue; }
      const { data: created } = await wpFetch('/wp/v2/tags', { method: 'POST', body: { name } });
      if (created?.id) ids.push(created.id);
    } catch (err) {
      // 태그 하나가 실패해도 글 저장은 계속한다. 태그는 글의 핵심이 아니다.
      if (err.code === 'term_exists' && err.data?.term_id) ids.push(err.data.term_id);
    }
  }
  return ids;
}

export async function loadSiteCategories() {
  const cats = await wpFetchAll('/wp/v2/categories', { hide_empty: false });
  return cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, parent: c.parent, count: c.count }));
}

export { MAX_TAGS, MIN_TAGS };
