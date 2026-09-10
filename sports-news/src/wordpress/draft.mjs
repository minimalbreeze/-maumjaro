// 워드프레스 임시글 저장.
//
// 상태는 DRAFT_STATUS 상수 하나로 고정되어 있고, 바깥에서 인자로 바꿀 수 없다.
// 저장 직후 워드프레스가 돌려준 status가 draft가 아니면 즉시 오류를 낸다.

import { wpFetch } from './client.mjs';

const DRAFT_STATUS = 'draft';

// 목록 표시. '-'와 '*'는 반드시 공백이 뒤따라야 한다.
const BULLET = /^(?:[-*]\s+|[✅✔•]\s*)/;

/**
 * 마크다운 본문을 워드프레스 블록 에디터가 알아듣는 HTML로 바꾼다.
 * 클래식 에디터에서도 그대로 보이도록 표준 태그만 쓴다.
 */
export function markdownToBlocks(md) {
  const out = [];
  const blocks = md.replace(/\r/g, '').split(/\n{2,}/);

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    const h2 = /^##\s+(.+)$/.exec(block);
    if (h2) {
      out.push(`<!-- wp:heading -->\n<h2>${inline(h2[1])}</h2>\n<!-- /wp:heading -->`);
      continue;
    }
    const h3 = /^###\s+(.+)$/.exec(block);
    if (h3) {
      out.push(`<!-- wp:heading {"level":3} -->\n<h3>${inline(h3[1])}</h3>\n<!-- /wp:heading -->`);
      continue;
    }

    // ✅ 나 - 로 시작하는 줄이 이어지면 목록으로 만든다.
    // '-'/'*'는 뒤에 공백이 있어야 한다 — 그러지 않으면 '**굵게**'로 시작하는 줄이
    // 목록으로 오인되어 굵은 표시가 깨진다.
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1 && lines.every((l) => BULLET.test(l))) {
      const items = lines.map((l) => `<li>${inline(l.replace(BULLET, ''))}</li>`).join('\n');
      out.push(`<!-- wp:list -->\n<ul>\n${items}\n</ul>\n<!-- /wp:list -->`);
      continue;
    }

    const html = lines.map(inline).join('<br>');
    out.push(`<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`);
  }
  return out.join('\n\n');
}

function inline(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 임시글로 저장한다.
 * seoFields는 wp:check가 "REST로 쓸 수 있다"고 확인한 키만 들어온다.
 * 확인되지 않은 meta key는 여기까지 오지 않는다.
 */
export async function saveDraft({ title, body, categoryId, tagIds, seo, seoFields }) {
  const payload = {
    title,
    content: markdownToBlocks(body),
    status: DRAFT_STATUS,
    categories: categoryId ? [categoryId] : [],
    tags: tagIds || [],
    excerpt: seo?.metaDescription || '',
  };
  if (seo?.slug) payload.slug = seo.slug;

  const meta = buildSeoMeta(seo, seoFields);
  if (Object.keys(meta).length) payload.meta = meta;

  const { data } = await wpFetch('/wp/v2/posts', { method: 'POST', body: payload });

  if (data?.status !== DRAFT_STATUS) {
    // 방어선: 어떤 이유로든 draft가 아니면 바로 알린다.
    throw new Error(`저장된 글의 상태가 draft가 아닙니다 (실제: ${data?.status}). 글 ID ${data?.id}를 확인하세요.`);
  }

  return {
    id: data.id,
    status: data.status,
    editUrl: data.link ? data.link.replace(/\/$/, '') : '',
    adminUrl: adminEditUrl(data),
    savedMeta: Object.keys(meta),
  };
}

function buildSeoMeta(seo, seoFields) {
  const meta = {};
  if (!seo || !seoFields?.writable?.length) return meta;
  const w = new Set(seoFields.writable);

  if (w.has('rank_math_title')) meta.rank_math_title = seo.seoTitle;
  if (w.has('rank_math_description')) meta.rank_math_description = seo.metaDescription;
  if (w.has('rank_math_focus_keyword')) meta.rank_math_focus_keyword = seo.focusKeyword;

  if (w.has('_yoast_wpseo_title')) meta._yoast_wpseo_title = seo.seoTitle;
  if (w.has('_yoast_wpseo_metadesc')) meta._yoast_wpseo_metadesc = seo.metaDescription;
  if (w.has('_yoast_wpseo_focuskw')) meta._yoast_wpseo_focuskw = seo.focusKeyword;

  return meta;
}

function adminEditUrl(post) {
  try {
    const origin = new URL(post.link).origin;
    return `${origin}/wp-admin/post.php?post=${post.id}&action=edit`;
  } catch {
    return '';
  }
}

export { DRAFT_STATUS };
