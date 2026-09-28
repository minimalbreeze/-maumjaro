// 이미지를 워드프레스 미디어 라이브러리에 올린다.
//
// REST /wp/v2/media는 JSON이 아니라 파일 본문을 그대로 받는다.
// 파일 이름은 Content-Disposition 헤더로 넘긴다.

import { wpConfig, WordPressError } from '../wordpress/client.mjs';
import { withRetry } from '../utils/retry.mjs';

/** 한글 제목을 파일 이름으로 쓸 수 있게 바꾼다. 워드프레스가 한글 파일명을 싫어하는 경우가 있다. */
export function safeFileName(seed, ext = 'png') {
  const base = String(seed)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const stamp = Date.now().toString(36);
  return `${base || 'image'}-${stamp}.${ext}`;
}

export async function uploadMedia({ buffer, fileName, alt, caption = '', timeoutMs = 60000 }) {
  const cfg = wpConfig();

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
