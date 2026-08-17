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

    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 2000) : '';
    const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt.slice(0, 1500) : '';
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
          // 답변이 길어지면 처방/주사 흐름을 가려버리므로 짧게 끊는다.
          // 실제 길이 조절은 시스템 프롬프트에서 하고, 여기는 안전장치 겸 비용 상한이다.
          max_tokens: 320,
          temperature: 0.8,
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
