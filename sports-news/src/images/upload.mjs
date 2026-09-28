// 이미지를 워드프레스 미디어 라이브러리에 올린다.
//
// REST /wp/v2/media는 JSON이 아니라 파일 본문을 그대로 받는다.
// 파일 이름은 Content-Disposition 헤더로 넘긴다.

import { wpConfig, WordPressError } from '../wordpress/client.mjs';
import { withRetry } from '../utils/retry.mjs';

/**
 * 업로드할 파일 이름을 만든다. 반드시 ASCII만 남긴다.
 *
 * 파일 이름은 Content-Disposition 헤더로 넘어가는데, HTTP 헤더는 ASCII만
 * 담을 수 있다. 한글이 한 글자라도 섞이면 요청을 만드는 단계에서 터진다.
 *   Cannot convert argument to a ByteString ... value of 50556
 *
 * 그래서 한글은 버리고, 대신 원본에서 뽑은 짧은 해시를 붙여 이름이 겹치지
 * 않게 한다. 사람이 읽을 이름은 alt 텍스트와 캡션이 담당하므로 파일 이름이
 * 한글일 필요는 없다.
 */
export function safeFileName(seed, ext = 'png') {
  const src = String(seed);
  const ascii = src
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
    .replace(/-$/, '');

  // 한글만 있는 제목이면 ascii가 비거나 너무 짧아진다. 해시로 구분한다.
  let h = 0;
  for (const ch of src) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tag = h.toString(36).slice(0, 6);
  const stamp = Date.now().toString(36);

  const base = ascii.length >= 3 ? `${ascii}-${tag}` : `sports-${tag}`;
  return `${base}-${stamp}.${ext}`;
}

/** 파일 이름이 헤더에 담길 수 있는지 확인한다. */
export function isHeaderSafe(name) {
  return /^[\x20-\x7E]*$/.test(name) && !/["\\]/.test(name);
}

export async function uploadMedia({ buffer, fileName, alt, caption = '', timeoutMs = 60000 }) {
  const cfg = wpConfig();

  // 헤더에 못 담는 이름이 흘러들어오면 여기서 안전한 이름으로 바꾼다.
  // 이름 때문에 이미지를 통째로 잃는 것보다 낫다.
  if (!isHeaderSafe(fileName)) fileName = safeFileName(fileName);

  const { data } = await withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${cfg.api}/wp/v2/media`, {
        method: 'POST',
        headers: {
          authorization: cfg.auth,
          'content-type': 'image/png',
          'content-disposition': `attachment; filename="${fileName}"`,
          accept: 'application/json',
        },
        body: buffer,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* HTML 에러 페이지 */ }
      if (!res.ok) {
        throw new WordPressError(
          json?.message
            ? `이미지 업로드 실패(${res.status}) — ${json.message}`
            : `이미지 업로드 실패(${res.status}). 미디어 업로드 권한이나 보안 플러그인을 확인하세요.`,
          { status: res.status, code: json?.code, endpoint: '/wp/v2/media' }
        );
      }
      return { data: json };
    } finally {
      clearTimeout(timer);
    }
  }, { tries: 2, base: 2000, label: '이미지 업로드' });

  // alt는 업로드 응답에 실리지 않으므로 따로 넣는다. Rank Math 점수에 반영된다.
  if (alt || caption) {
    try {
      const { wpFetch } = await import('../wordpress/client.mjs');
      await wpFetch(`/wp/v2/media/${data.id}`, {
        method: 'POST',
        body: { alt_text: alt || '', caption: caption || '' },
      });
    } catch {
      // alt를 못 넣어도 이미지 자체는 올라갔으므로 계속 간다.
    }
  }

  return { id: data.id, url: data.source_url, fileName };
}
