// 맘운자로 AI 맘운 — DeepSeek 프록시 (Cloudflare Worker)
//
// 이 파일은 GitHub Pages에 배포되는 정적 사이트의 일부가 아니다.
// Cloudflare Worker로 별도 배포해서, DeepSeek API 키를 서버 쪽에만 두고
// 클라이언트(fortune.js)는 이 Worker의 URL만 호출하도록 하기 위한 프록시다.
// 배포 방법은 AI_PROXY_SETUP.md 참고.
//
// 경로가 두 개다.
//   POST /          → DeepSeek 프록시 (기존 동작, 그대로)
//   POST /feedback  → "개발자에게 한마디"를 운영자에게 전달 (FEEDBACK_SETUP.md)
// 기존 클라이언트는 전부 루트로 호출하므로 이 분기 때문에 깨지는 것은 없다.

// 실제로 배포된 GitHub Pages 주소로 정확히 맞춰야 한다(마지막 슬래시 없이).
// CORS를 이 origin으로만 열어서, 다른 사이트가 브라우저에서 이 Worker를
// 직접 호출하는 걸 막는다(완벽한 보안은 아니지만 기본적인 오남용 방지책).
const ALLOWED_ORIGIN = 'https://maumjaro.minimalbreeze.com';

function corsHeaders(origin) {
  const allow = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // CORS 헤더는 브라우저만 지키는 규칙이라, curl 같은 직접 호출은 전혀 막지 못한다.
    // 그래서 서버에서도 Origin을 직접 검사해 우리 앱에서 온 요청만 통과시킨다.
    // (헤더는 위조할 수 있으므로 완벽한 차단은 아니다 — 실질적인 상한은 DeepSeek 잔액을
    //  적게 유지하는 것이다. 이 검사는 주소를 알아낸 사람의 손쉬운 무단 사용을 막는 용도.)
    if (origin !== ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: 'forbidden origin' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method not allowed' }), {
        status: 405,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'invalid json' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // 경로 분기. 마지막 슬래시는 무시한다(/feedback 과 /feedback/ 를 같게 본다).
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (path === '/feedback') {
      return handleFeedback(body, env, headers);
    }

    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 4000) : '';
    // 심각한 고민은 길게 적힌다. 1500자에서 끊으면 질문 끝(정작 중요한 부분)이 잘린 채
    // 답이 나가므로 늘렸다. 상한 자체는 남겨둔다 — 없으면 과금이 요청 하나로 터진다.
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt.slice(0, 4000) : '';

    // 길이를 호출하는 쪽이 정하게 한다. 스레드 문구는 짧아야 하고(320), AI 맘운은
    // 길게 답해야 한다(1400). 한 값으로 묶어두면 둘 중 하나가 반드시 망가진다.
    // 다만 값을 그대로 믿지는 않는다 — 주소를 알아낸 사람이 100000을 보내면 과금이 터진다.
    function clamp(v, lo, hi, dflt) {
      const n = Number(v);
      if (!Number.isFinite(n)) return dflt;
      return Math.min(hi, Math.max(lo, Math.round(n)));
    }
    const maxTokens = clamp(body.maxTokens, 64, 1400, 320);
    const temperature = clamp(body.temperature * 100, 0, 150, 80) / 100;
    if (!userPrompt) {
      return new Response(JSON.stringify({ error: 'userPrompt required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    let dsRes;
    try {
      dsRes = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          // 실제 길이 조절은 시스템 프롬프트에서 하고, 여기는 안전장치 겸 비용 상한이다.
          // 호출한 쪽이 보낸 값은 위에서 이미 범위 안으로 깎았다.
          max_tokens: maxTokens,
          temperature,
        }),
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'upstream fetch failed' }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (!dsRes.ok) {
      return new Response(JSON.stringify({ error: `upstream status ${dsRes.status}` }), {
        status: 502,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const data = await dsRes.json();
    const answer = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';

    return new Response(JSON.stringify({ answer }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  },
};

// ── 개발자에게 한마디 ───────────────────────────────────────────────
//
// 받은 글을 운영자에게 밀어준다. 채널은 "설정된 것만" 쓴다 —
//   KAKAO_REST_API_KEY + KAKAO_REFRESH_TOKEN → 카카오톡 "나에게 보내기"
//   FEEDBACK_WEBHOOK_URL                      → 아무 웹훅(디스코드·슬랙·Make 등)
//   FEEDBACK_KV (KV 바인딩)                   → 항상 함께 저장(보험)
// 하나도 설정 안 했으면 500을 돌려준다. 그래야 앱이 글을 폰에 보관해뒀다가
// 나중에 다시 보낸다 — 조용히 "성공"이라고 답해서 글을 증발시키면 안 된다.
async function handleFeedback(body, env, headers) {
  const json = (obj, status) => new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, 100) : '';
  const at = typeof body.at === 'string' ? body.at.slice(0, 40) : new Date().toISOString();
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  if (!text) return json({ error: 'text required' }, 400);

  const metaLine = [
    meta.uses != null ? `주사 ${meta.uses}회` : '',
    meta.days != null ? `${meta.days}일` : '',
    meta.standalone ? '홈화면앱' : '브라우저',
    typeof meta.screen === 'string' ? String(meta.screen).slice(0, 20) : '',
  ].filter(Boolean).join(' · ');

  const message = [
    '💬 맘운자로 한마디',
    '',
    text,
    '',
    contact ? `↩︎ 답장: ${contact}` : '↩︎ 답장받을 곳 없음',
    metaLine,
  ].join('\n').slice(0, 900);

  const record = { at, text, contact, meta, ua: typeof meta.ua === 'string' ? meta.ua : '' };
  const results = [];

  // 보험 먼저. 전달이 실패해도 글 자체는 남아야 한다.
  if (env.FEEDBACK_KV) {
    try {
      await env.FEEDBACK_KV.put(`fb:${at}:${Math.random().toString(36).slice(2, 8)}`, JSON.stringify(record));
      results.push('kv');
    } catch (e) { /* KV가 죽어도 아래 채널은 시도한다 */ }
  }

  if (env.FEEDBACK_WEBHOOK_URL) {
    try {
      // content는 디스코드, text는 슬랙이 읽는 키다. Make 같은 곳은 통째로 받는다.
      const res = await fetch(env.FEEDBACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, text: message, feedback: record }),
      });
      if (res.ok) results.push('webhook');
    } catch (e) { /* 다음 채널로 */ }
  }

  if (env.KAKAO_REST_API_KEY && (env.KAKAO_REFRESH_TOKEN || env.FEEDBACK_KV)) {
    try {
      if (await sendKakaoMemo(message, env)) results.push('kakao');
    } catch (e) { /* 카카오가 막혀도 나머지 결과로 판정한다 */ }
  }

  if (!results.length) return json({ error: 'no delivery channel configured' }, 500);
  return json({ ok: true, via: results });
}

// 카카오톡 "나에게 보내기".
//
// 리프레시 토큰은 쓸 때마다 만료가 미뤄지지만, 남은 기간이 1개월 아래로 떨어지면
// 카카오가 새 리프레시 토큰을 같이 내려준다. Worker는 자기 Secret을 실행 중에 못 고치므로,
// KV가 있으면 거기에 갈아 끼운다(KV 값이 Secret보다 우선). KV가 없으면 60일 넘게
// 한마디가 한 건도 안 들어온 경우 토큰이 만료돼 재발급이 필요하다.
async function sendKakaoMemo(message, env) {
  const KV_KEY = 'kakao:refresh_token';
  let refresh = env.KAKAO_REFRESH_TOKEN || '';
  if (env.FEEDBACK_KV) {
    const stored = await env.FEEDBACK_KV.get(KV_KEY);
    if (stored) refresh = stored;
  }
  if (!refresh) return false;

  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.KAKAO_REST_API_KEY,
      refresh_token: refresh,
      ...(env.KAKAO_CLIENT_SECRET ? { client_secret: env.KAKAO_CLIENT_SECRET } : {}),
    }),
  });
  if (!tokenRes.ok) return false;
  const token = await tokenRes.json();
  if (!token || !token.access_token) return false;
  if (token.refresh_token && env.FEEDBACK_KV) {
    try { await env.FEEDBACK_KV.put(KV_KEY, token.refresh_token); } catch (e) { /* 다음 기회에 */ }
  }

  const memoRes = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      template_object: JSON.stringify({
        object_type: 'text',
        text: message,
        link: { web_url: ALLOWED_ORIGIN, mobile_web_url: ALLOWED_ORIGIN },
        button_title: '맘운자로 열기',
      }),
    }),
  });
  return memoRes.ok;
}
