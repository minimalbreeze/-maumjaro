// 워드프레스 REST API 클라이언트.
//
// 인증은 애플리케이션 비밀번호 + Basic. 비밀번호는 이 파일 밖으로 절대 나가지 않는다
// (에러 메시지에도 URL에도 넣지 않는다).

import { env, requireEnv } from '../utils/env.mjs';
import { withRetry } from '../utils/retry.mjs';

export class WordPressError extends Error {
  constructor(message, { status, code, endpoint } = {}) {
    super(message);
    this.name = 'WordPressError';
    this.status = status;
    this.code = code;
    this.endpoint = endpoint;
  }
}

export function wpConfig() {
  requireEnv(['WORDPRESS_URL', 'WORDPRESS_USERNAME', 'WORDPRESS_APP_PASSWORD']);
  const base = env('WORDPRESS_URL').replace(/\/+$/, '');
  return {
    base,
    api: `${base}/wp-json`,
    // 앱 비밀번호는 워드프레스가 4자리씩 띄어서 보여준다. 붙여 넣은 그대로 받아
    // 공백만 제거한다 — 사용자가 형식을 신경 쓰지 않아도 되게.
    auth: 'Basic ' + Buffer.from(
      `${env('WORDPRESS_USERNAME')}:${env('WORDPRESS_APP_PASSWORD').replace(/\s+/g, '')}`
    ).toString('base64'),
  };
}

export async function wpFetch(pathOrUrl, { method = 'GET', body, query, timeoutMs = 20000 } = {}) {
  const cfg = wpConfig();
  const url = new URL(pathOrUrl.startsWith('http') ? pathOrUrl : `${cfg.api}${pathOrUrl}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  return withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          authorization: cfg.auth,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });

      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* HTML 에러 페이지인 경우 */ }

      if (!res.ok) {
        throw new WordPressError(
          wpErrorMessage(res.status, json, text),
          { status: res.status, code: json?.code, endpoint: url.pathname }
        );
      }
      return { data: json, headers: res.headers };
    } finally {
      clearTimeout(timer);
    }
  }, { tries: 3, label: `워드프레스 ${method} ${url.pathname}` });
}

/**
 * 오류 메시지를 만든다.
 *
 * 중요: 워드프레스가 낸 오류인지부터 가린다. 401/403은 방화벽·보안 플러그인·
 * 호스팅 WAF·회사 프록시도 낸다. 그걸 전부 "계정 권한 문제"라고 안내하면
 * 사용자가 멀쩡한 계정을 붙잡고 헤매게 된다.
 *
 * 워드프레스 REST API는 오류도 JSON({code, message})으로 돌려준다.
 * JSON이 아니면 워드프레스까지 요청이 닿지도 않았다는 뜻이다.
 */
function wpErrorMessage(status, json, rawText = '') {
  const detail = json?.message ? ` — ${json.message}` : '';
  const fromWordPress = Boolean(json?.code || json?.message);

  if (!fromWordPress) {
    const hint = describeNonWordPressBody(rawText);
    return `워드프레스가 아닌 곳에서 ${status} 응답이 왔습니다. 요청이 워드프레스까지 닿지 못했습니다.${hint}
   확인 순서: ① WORDPRESS_URL이 맞는지 ② 보안 플러그인(Wordfence 등)이 REST API를 막고 있는지 ③ 호스팅 방화벽 ④ 회사·공용 네트워크 차단`;
  }

  if (status === 401) return `인증 실패(401). 사용자명 또는 애플리케이션 비밀번호를 확인하세요${detail}
   아이디에 이메일을 넣으셨다면 로그인 아이디(사용자명)로 바꿔보세요.`;
  if (status === 403) return `권한 없음(403). 이 계정에 글 작성 권한이 있는지 확인하세요${detail}`;
  if (status === 404) return `경로를 찾을 수 없음(404). WORDPRESS_URL이 맞는지, REST API가 켜져 있는지 확인하세요${detail}`;
  return `워드프레스 오류(${status})${detail}`;
}

/** 응답 본문이 무엇인지 한 줄로 알려준다 — 어디서 막혔는지 짐작하는 단서가 된다. */
function describeNonWordPressBody(rawText) {
  const t = String(rawText || '').trim();
  if (!t) return ' (응답 본문 없음)';
  if (/allowlist|egress|not in allow/i.test(t)) return ' (네트워크 정책이 이 주소를 막았습니다)';
  if (/cloudflare|attention required/i.test(t)) return ' (Cloudflare가 차단했습니다)';
  if (/wordfence|blocked by/i.test(t)) return ' (보안 플러그인이 차단했습니다)';
  if (/^</.test(t)) return ' (HTML 페이지가 왔습니다 — 보통 차단 안내 화면입니다)';
  return ` (응답: ${t.slice(0, 80)})`;
}

/** 페이지네이션을 따라가며 전부 가져온다 (카테고리·태그 목록용). */
export async function wpFetchAll(path, query = {}, { maxPages = 20 } = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data, headers } = await wpFetch(path, { query: { ...query, per_page: 100, page } });
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    const totalPages = Number(headers.get('x-wp-totalpages') || 1);
    if (page >= totalPages) break;
  }
  return all;
}
