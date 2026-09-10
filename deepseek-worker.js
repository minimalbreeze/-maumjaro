// 맘운자로 AI 맘운 — DeepSeek 프록시 (Cloudflare Worker)
//
// 이 파일은 GitHub Pages에 배포되는 정적 사이트의 일부가 아니다.
// Cloudflare Worker로 별도 배포해서, DeepSeek API 키를 서버 쪽에만 두고
// 클라이언트(fortune.js)는 이 Worker의 URL만 호출하도록 하기 위한 프록시다.
// 배포 방법은 AI_PROXY_SETUP.md 참고.

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
