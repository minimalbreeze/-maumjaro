// 워드프레스 임시글 저장.
//
// 상태는 DRAFT_STATUS 상수 하나로 고정되어 있고, 바깥에서 인자로 바꿀 수 없다.
// 저장 직후 워드프레스가 돌려준 status가 draft가 아니면 즉시 오류를 낸다.

import { wpFetch } from './client.mjs';
import { faqSchemaBlock } from '../seo/faq-schema.mjs';

const DRAFT_STATUS = 'draft';

// 목록 표시. '-'와 '*'는 반드시 공백이 뒤따라야 한다.
const BULLET = /^(?:[-*]\s+|[✅✔•]\s*)/;

/**
 * 마크다운 본문을 워드프레스 블록 에디터가 알아듣는 HTML로 바꾼다.
 * 클래식 에디터에서도 그대로 보이도록 표준 태그만 쓴다.
 */
export function markdownToBlocks(md, { images = [], adHtml: ad = '', watchHtml: watch = '', appHtml: app = '' } = {}) {
  const out = [];
  const blocks = md.replace(/\r/g, '').split(/\n{2,}/);

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    // 이미지·광고 자리표시자를 실제 블록으로 바꾼다.
    // 이미지를 못 올렸으면 자리표시자만 조용히 사라진다 — 글은 그대로 나간다.
    const imgMark = /^<!--IMG:(\d+)-->$/.exec(block);
    if (imgMark) {
      const img = images[Number(imgMark[1])];
      if (img?.html) out.push(img.html);
      continue;
    }
    if (block === '<!--AD-->') {
      if (ad) out.push(ad);
      continue;
    }
    // 중계 배너. 설정에 링크가 없는 종목이면 자리표시자만 조용히 사라진다.
    if (block === '<!--WATCH-->') {
      if (watch) out.push(watch);
      continue;
    }
    // 앱 다운로드 배너. 설정에 주소가 없으면 자리표시자만 조용히 사라진다 —
    // 없는 주소를 '다운로드'라고 걸지 않는다.
    if (block === '<!--APP-->') {
      if (app) out.push(app);
      continue;
    }

    // 소제목 — `##` 부터 `######` 까지 한 자리에서 다룬다. (2026-11-09)
    //
    // 전에는 h2·h3 만 알았다. `#### 소제목` 은 **글자 그대로** 문단으로
    // 나갔고(`<p>#### 소제목</p>`), 쓰는 초안이 없어서 드러나지 않았다.
    //
    // h4 가 필요해진 이유 — **절 안의 소제목이 형제가 되면 다음에 못 고친다.**
    // 5762(KBO 허브)의 한국시리즈 블록이 그랬다. h3 하나 아래에 `###` 로
    // 소제목을 더 적었더니 h3 **넷이 나란히** 생겼고, `update-section` 은
    // 같은 레벨 소제목 앞까지를 한 절로 보기 때문에 첫 h3 를 갈아끼워도
    // 나머지 셋이 옛 내용으로 남는다. 경기가 끝난 뒤 소제목에 "KT 1승 3패"
    // 가 그렇게 남아 있었다.
    //
    // h5·h6 까지 함께 받는 것은 **같은 종류의 새어나감을 막으려고**다.
    // 하나만 더하면 그다음 단계에서 또 글자가 새어 나간다.
    //
    // `#` 하나(h1)는 일부러 받지 않는다. 글 제목이 h1 이라 본문에 또
    // 있으면 안 된다. 받지 않으면 문단으로 나가 눈에 바로 띈다.
    //
    // ⚠️ h2 에는 `{"level":2}` 를 적지 않는다. 워드프레스 기본값이라
    //    예전에 저장된 글과 **글자 하나까지 같아야** 하는 자리가 있다
    //    (배너·섹션 도구가 "배너 말고 바뀐 게 없는지" 를 그렇게 본다).
    const h = /^(#{2,6})\s+(.+)$/.exec(block);
    if (h) {
      const level = h[1].length;
      const 속성 = level === 2 ? '' : ` {"level":${level}}`;
      out.push(`<!-- wp:heading${속성} -->\n<h${level}>${inline(h[2])}</h${level}>\n<!-- /wp:heading -->`);
      continue;
    }

    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

    // 표. 두 번째 줄이 |---|---| 꼴이면 표로 본다.
    //
    // 2026-11-05 에 더했다. 그전에는 표를 모르는 채로 지나가서
    // `<p>| | 주소 |<br>|---|---|<br>…` 가 그대로 독자에게 나갔다
    // (글 11866 에서 발견). 마크다운 초안에 표를 쓰는 것이 이미 관행이라
    // 변환기 쪽을 맞추는 것이 맞다.
    if (lines.length >= 2 && 표인가(lines)) {
      out.push(표블록(lines));
      continue;
    }

    // ✅ 나 - 로 시작하는 줄이 이어지면 목록으로 만든다.
    // '-'/'*'는 뒤에 공백이 있어야 한다 — 그러지 않으면 '**굵게**'로 시작하는 줄이
    // 목록으로 오인되어 굵은 표시가 깨진다.
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

/** 두 번째 줄이 |---|---| 꼴이고 모든 줄이 | 로 시작하면 표다. */
function 표인가(lines) {
  if (!lines.every((l) => l.startsWith('|'))) return false;
  return /^\|[\s:|-]+\|$/.test(lines[1]) && lines[1].includes('-');
}

function 표칸(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function 표블록(lines) {
  const head = 표칸(lines[0]).map((c) => `<th>${inline(c)}</th>`).join('');
  const body = lines
    .slice(2)
    .map((l) => `<tr>${표칸(l).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('');
  const thead = `<thead><tr>${head}</tr></thead>`;
  const tbody = body ? `<tbody>${body}</tbody>` : '';
  return `<!-- wp:table -->\n<figure class="wp-block-table"><table>${thead}${tbody}</table></figure>\n<!-- /wp:table -->`;
}

/**
 * 마크다운 링크를 실제 링크로 바꾼다.
 *
 * 현재 창에서 연다 — `target="_blank"` 를 쓰지 않는다(지시서). 그래서
 * `rel="noopener"` 도 필요 없다. 바깥으로 나가는 링크에만 nofollow 를 남긴다.
 */
export function 링크(text, url) {
  const 우리것 = /^(https?:\/\/)?(wiki|maumjaro)\.minimalbreeze\.com/.test(url) || url.startsWith('/');
  return `<a href="${url}"${우리것 ? '' : ' rel="nofollow"'}>${text}</a>`;
}

function inline(s) {
  return escapeHtml(s)
    // 인라인 코드가 먼저다 — 코드 안의 * 나 [ 가 다른 표시로 읽히지 않게 한다.
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, text, url) => 링크(text, url))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 같은 글이 이미 있는지 가린다. **막을 것과 알려만 줄 것을 나눈다.**
 *
 * 2026-11-09 에 효성님이 잡았다 — **"같은 글을 2번 적었다".**
 * APBC 글이 16561 과 16574 로 두 벌, FA 글도 두 벌 올라가 있었다.
 * 효성님이 한 벌을 발행하고 다른 한 벌을 휴지통에 넣어 치웠다.
 *
 * `saveDraft` 가 **이미 같은 글이 있는지 묻지 않고** 무조건 새로 만들던 탓이다.
 * 같은 초안 파일을 두 번 올리면 글이 두 벌 생긴다. 사람이 "아까 올렸던가"를
 * 기억해서 막는 단계는 언젠가 빠진다 — 쿠팡 하단 바 때와 같은 모양이다.
 *
 * ⚠️ 덮어쓰지 않는다. 겹치면 **멈추고 번호를 알려준다.** 덮어쓰기는 발행된
 *    글을 건드릴 수 있고, 어느 쪽을 남길지는 사람이 정할 일이다.
 */
export function 겹친글가리기(목록) {
  const 막을것 = [];
  const 알릴것 = [];
  for (const p of 목록 || []) {
    const 글 = {
      id: p?.id,
      status: p?.status || '',
      title: p?.title?.raw || p?.title?.rendered || '',
    };
    if (!글.id) continue;
    // 휴지통은 막지 않는다 — 치우고 다시 쓰는 흐름이 있다. 다만 워드프레스가
    // 그 슬러그를 붙잡고 있어 새 글에 `-2` 가 붙으므로 알려는 준다.
    if (글.status === 'trash') 알릴것.push(글);
    else 막을것.push(글);
  }
  return { 막을것, 알릴것 };
}

/** 같은 슬러그의 글을 모두 받는다(발행·임시글·휴지통까지). */
export async function 같은슬러그글(slug) {
  const s = String(slug || '').trim();
  if (!s) return [];
  try {
    const { data } = await wpFetch('/wp/v2/posts', {
      query: {
        slug: s,
        status: 'publish,draft,pending,future,private,trash',
        context: 'edit',
        per_page: 20,
      },
      timeoutMs: 30000,
    });
    return Array.isArray(data) ? data : [];
  } catch {
    // ⚠️ 못 물어봤다고 저장을 막지 않는다. 겹침 확인은 **덤**이고, 이것 때문에
    //    글을 못 올리면 원래 하려던 일이 멈춘다.
    return [];
  }
}

/**
 * 임시글로 저장한다.
 * seoFields는 wp:check가 "REST로 쓸 수 있다"고 확인한 키만 들어온다.
 * 확인되지 않은 meta key는 여기까지 오지 않는다.
 */
export async function saveDraft({ title, body, categoryId, tagIds, seo, seoFields, images = [], adHtml = '', watchHtml = '', appHtml = '', stickyHtml = '', featuredMediaId = null }) {
  // 본문에 자주 묻는 질문이 있으면 구조화 데이터를 끝에 붙인다.
  // 본문에 실제로 적힌 질문과 답만 들어간다 — 없는 내용을 만들어 붙이지 않는다.
  // 같은 슬러그의 글이 이미 있으면 **멈춘다.** 두 벌이 올라가면 구글이
  // 어느 쪽도 색인하지 않는다(7769·7777 이 그랬다).
  if (seo?.slug) {
    const { 막을것, 알릴것 } = 겹친글가리기(await 같은슬러그글(seo.slug));
    for (const g of 알릴것) {
      console.log(`⚠️  같은 주소(${seo.slug})의 글이 휴지통에 있습니다 — [${g.id}] ${g.title}`);
      console.log('    워드프레스가 그 주소를 붙잡고 있어 새 글 주소에 -2 가 붙을 수 있습니다.');
    }
    if (막을것.length) {
      const 줄 = 막을것.map((g) => `[${g.id}] ${g.status} · ${g.title}`).join('\n  ');
      throw new Error(
        `같은 주소(${seo.slug})의 글이 이미 있습니다. 두 벌을 올리지 않으려고 멈췄습니다.\n  ${줄}\n`
        + '  고칠 글이면 그 번호로 섹션·제목 모드를 쓰고, 정말 새 글이면 초안의 슬러그를 바꾸세요.',
      );
    }
  }

  const schema = faqSchemaBlock(body);

  const payload = {
    title,
    // stickyHtml(쿠팡 하단 고정 바)은 **맨 끝**에 붙인다. 구조화 데이터보다
    // 뒤여야 한다 — 그 사이에 끼면 JSON-LD 와 본문 사이가 벌어진다.
    //
    // 2026-11-08 에 더했다. 그전에는 파일로 올린 새 글에 바가 **안 들어갔고**,
    // 나중에 add-sticky 를 따로 돌려야 했다. 구단 스토어 글 9편이 그렇게
    // 발행돼 광고가 본문 하나뿐이었다(효성님이 화면으로 잡았다). 사람이
    // 기억해서 돌리는 단계는 언젠가 빠진다.
    content: markdownToBlocks(body, { images, adHtml, watchHtml, appHtml })
      + (schema ? `\n\n${schema}` : '')
      + (stickyHtml ? `\n\n${stickyHtml}` : ''),
    status: DRAFT_STATUS,
    categories: categoryId ? [categoryId] : [],
    tags: tagIds || [],
    excerpt: seo?.metaDescription || '',
  };
  if (seo?.slug) payload.slug = seo.slug;
  if (featuredMediaId) payload.featured_media = featuredMediaId;

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
    faqSchema: Boolean(schema),
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
