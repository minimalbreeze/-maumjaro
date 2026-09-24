// 맘운자로 AI 맘운 — DeepSeek 프록시 (Cloudflare Worker)
//
// 이 파일은 GitHub Pages에 배포되는 정적 사이트의 일부가 아니다.
// Cloudflare Worker로 별도 배포해서, DeepSeek API 키를 서버 쪽에만 두고
// 클라이언트(fortune.js)는 이 Worker의 URL만 호출하도록 하기 위한 프록시다.
// 배포 방법은 AI_PROXY_SETUP.md 참고.
//
// 경로가 다섯이다.
//   POST /               → DeepSeek 프록시 (기존 동작, 그대로)
//   POST /feedback       → "개발자에게 한마디" 한 줄 쓰기. 운영자 카톡으로 즉시 간다.
//   GET  /feedback?thread= → 그 대화의 말풍선 전부 (앱이 답장을 가져갈 때)
//   GET  /admin?key=     → 운영자 화면. 카톡에 온 링크를 누르면 여기가 열린다.
//   POST /admin/reply    → 운영자가 그 화면에서 답장을 쓴다.
// 기존 클라이언트는 전부 루트로 호출하므로 이 분기 때문에 깨지는 것은 없다.
// 자세한 설정은 FEEDBACK_SETUP.md 참고.

// 실제로 배포된 GitHub Pages 주소로 정확히 맞춰야 한다(마지막 슬래시 없이).
// CORS를 이 origin으로만 열어서, 다른 사이트가 브라우저에서 이 Worker를
// 직접 호출하는 걸 막는다(완벽한 보안은 아니지만 기본적인 오남용 방지책).
const ALLOWED_ORIGIN = 'https://maumjaro.minimalbreeze.com';

function corsHeaders(origin) {
  const allow = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    // 마지막 슬래시는 무시한다(/feedback 과 /feedback/ 를 같게 본다).
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // 운영자 화면은 카톡에 온 링크를 눌러서 연다 — 브라우저 주소창으로 들어오므로
    // Origin 헤더가 아예 없다. 그래서 아래 origin 검사보다 앞에 둔다.
    // 대신 ADMIN_KEY를 모르면 아무것도 못 본다.
    if (path === '/admin' || path === '/admin/reply') {
      return handleAdmin(request, url, env);
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

    // 앱이 답장을 가져가는 길. 대화 ID를 아는 것 자체가 열쇠다.
    if (path === '/feedback' && request.method === 'GET') {
      return handleThreadGet(url, env, headers);
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

    if (path === '/feedback') {
      return handleFeedback(body, env, headers, url.origin);
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


// ══════════════════════════════════════════════════════════════════
// 개발자에게 한마디 — 끊기지 않는 1:1 대화
//
// 저장은 Cloudflare KV(FEEDBACK_KV) 하나로 끝낸다. 대화 하나가 키 하나다.
//   thread:<tid> → { id, createdAt, updatedAt, meta, messages: [...] }
// KV의 list()는 값을 안 주지만 metadata는 준다. 그래서 운영자 화면 목록에
// 필요한 것(마지막 시각·미리보기·답장 차례인지)만 metadata에 같이 넣어둔다 —
// 대화가 100개여도 목록 한 번에 KV 읽기가 1회다.
//
// 대화 ID(tid)는 앱이 만든 128비트 난수다. 로그인이 없으므로 이 ID를 아는 것
// 자체가 열쇠다. 그래서 형식을 엄격히 검사하고, 추측 가능한 값은 받지 않는다.
// ══════════════════════════════════════════════════════════════════

const MAX_MESSAGES = 60;      // 대화 하나에 남기는 말풍선 수
const MAX_TEXT = 1000;
const TID_RE = /^[a-f0-9]{24,64}$/;

function jsonRes(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function threadKey(tid) { return `thread:${tid}`; }

function metaFor(thread) {
  const last = thread.messages[thread.messages.length - 1];
  return {
    updatedAt: thread.updatedAt,
    preview: last ? String(last.text).slice(0, 60) : '',
    // 마지막 말이 사용자 것이면 운영자가 답할 차례다. 목록에서 이것만 보면 된다.
    waiting: last && last.from === 'user' ? 1 : 0,
  };
}

async function readThread(env, tid) {
  const raw = await env.FEEDBACK_KV.get(threadKey(tid));
  if (!raw) return null;
  try {
    const t = JSON.parse(raw);
    if (!t || !Array.isArray(t.messages)) return null;
    return t;
  } catch (e) { return null; }
}

async function writeThread(env, thread) {
  thread.messages = thread.messages.slice(-MAX_MESSAGES);
  await env.FEEDBACK_KV.put(threadKey(thread.id), JSON.stringify(thread), { metadata: metaFor(thread) });
}

// ── 앱: 한 줄 쓰기 ────────────────────────────────────────────────
async function handleFeedback(body, env, headers, selfOrigin) {
  const tid = typeof body.thread === 'string' ? body.thread : '';
  if (!TID_RE.test(tid)) return jsonRes({ error: 'bad thread' }, 400, headers);

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  if (!text) return jsonRes({ error: 'text required' }, 400, headers);

  const at = typeof body.at === 'string' ? body.at.slice(0, 40) : new Date().toISOString();
  const id = typeof body.id === 'string' ? body.id.slice(0, 64) : `${tid.slice(0, 8)}-${Date.now().toString(36)}`;
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};

  // 저장할 데가 없으면 성공이라고 답하지 않는다. 앱이 글을 폰에 보관했다가
  // 나중에 다시 보내야 하기 때문이다. 조용히 "받았다" 하고 버리는 게 제일 나쁘다.
  if (!env.FEEDBACK_KV) return jsonRes({ error: 'storage not configured' }, 500, headers);

  const now = new Date().toISOString();
  const thread = (await readThread(env, tid)) || { id: tid, createdAt: now, messages: [] };
  thread.meta = meta;                 // 기기 정보는 늘 최신 것만 둔다
  thread.updatedAt = now;
  // 재전송으로 같은 글이 두 번 들어와도 한 번만 남는다.
  if (!thread.messages.some((m) => m.id === id)) {
    thread.messages.push({ id, at, from: 'user', text });
  }
  await writeThread(env, thread);

  // 카톡은 보내다 실패해도 저장은 이미 끝났다. 앱에 실패라고 답하면 같은 글이
  // 또 들어온다 — 알림이 늦는 것보다 글이 겹치는 쪽이 나쁘다.
  const turn = thread.messages.filter((m) => m.from === 'user').length;
  const notified = await notifyOwner({ text, meta, tid, turn }, env, selfOrigin);
  return jsonRes({ ok: true, notified }, 200, headers);
}

// ── 앱: 대화 가져가기 ─────────────────────────────────────────────
async function handleThreadGet(url, env, headers) {
  const tid = url.searchParams.get('thread') || '';
  if (!TID_RE.test(tid)) return jsonRes({ error: 'bad thread' }, 400, headers);
  if (!env.FEEDBACK_KV) return jsonRes({ messages: [] }, 200, headers);
  const thread = await readThread(env, tid);
  // 없는 대화도 빈 목록으로 답한다 — 있는지 없는지를 알려주지 않기 위해서다.
  const messages = thread ? thread.messages.map((m) => ({ id: m.id, at: m.at, from: m.from, text: m.text })) : [];
  return jsonRes({ messages }, 200, headers);
}

// ── 운영자에게 알리기 ─────────────────────────────────────────────
async function notifyOwner(info, env, selfOrigin) {
  const via = [];
  const head = info.turn > 1 ? `💬 맘운자로 한마디 (${info.turn}번째)` : '💬 맘운자로 한마디 (새 대화)';
  const m = info.meta || {};
  const metaLine = [
    m.uses != null ? `주사 ${m.uses}회` : '',
    m.days != null ? `${m.days}일` : '',
    m.standalone ? '홈화면앱' : '브라우저',
  ].filter(Boolean).join(' · ');
  const replyUrl = env.ADMIN_KEY
    ? `${selfOrigin}/admin?key=${encodeURIComponent(env.ADMIN_KEY)}#t-${info.tid}`
    : ALLOWED_ORIGIN;

  if (env.KAKAO_REST_API_KEY) {
    try { if (await sendKakaoMemo(head, info.text, metaLine, replyUrl, env)) via.push('kakao'); }
    catch (e) { /* 다음 채널로 */ }
  }
  if (env.FEEDBACK_WEBHOOK_URL) {
    try {
      const full = `${head}\n\n${info.text}\n\n${metaLine}\n${replyUrl}`;
      // content는 디스코드, text는 슬랙이 읽는 키다. Make 같은 곳은 통째로 받는다.
      const res = await fetch(env.FEEDBACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: full, text: full, feedback: info, reply_url: replyUrl }),
      });
      if (res.ok) via.push('webhook');
    } catch (e) { /* 저장은 이미 끝났다 */ }
  }
  return via;
}

// 카카오톡 "나에게 보내기".
//
// 기본 텍스트 템플릿의 text는 200자가 상한이라, 넘으면 API가 통째로 거절한다.
// 그래서 본문을 잘라 넣고, 답장 링크는 text가 아니라 버튼(link)으로 붙인다.
//
// 리프레시 토큰은 쓸 때마다 만료가 미뤄지지만, 남은 기간이 1개월 아래로 떨어지면
// 카카오가 새 리프레시 토큰을 같이 내려준다. Worker는 자기 Secret을 실행 중에 못 고치므로
// KV에 갈아 끼운다(KV 값이 Secret보다 우선). 그래서 60일 넘게 한마디가 없어도 안 끊긴다.
async function sendKakaoMemo(head, text, metaLine, replyUrl, env) {
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

  // 200자에 맞춰 본문부터 줄인다. 머리말과 꼬리말은 짧으므로 남는 만큼을 본문에 준다.
  const tail = metaLine ? `\n\n${metaLine}` : '';
  const room = 200 - head.length - tail.length - 2;
  const bodyText = text.length > room ? `${text.slice(0, Math.max(0, room - 1))}…` : text;

  const memoRes = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      template_object: JSON.stringify({
        object_type: 'text',
        text: `${head}\n\n${bodyText}${tail}`,
        link: { web_url: replyUrl, mobile_web_url: replyUrl },
        button_title: '답장하기',
      }),
    }),
  });
  return memoRes.ok;
}

// ── 운영자 화면 ───────────────────────────────────────────────────
//
// 카톡에 온 "답장하기" 버튼이 여기로 온다. 폰에서 열리므로 한 화면에 다 넣는다.
// 열쇠(ADMIN_KEY)가 주소에 들어가지만, 그 주소는 운영자 본인 카톡에만 있다.
function adminEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function handleAdmin(request, url, env) {
  const html = (body, status) => new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>맘운자로 한마디</title>
<style>
:root{--bg:#fff8f3;--card:#fff;--line:rgba(255,150,175,0.28);--text:#6b4657;--dim:#9c6b7d;--a:#ff9166;--b:#ffc66b}
*{box-sizing:border-box}
body{margin:0;padding:16px calc(16px + env(safe-area-inset-right)) calc(28px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));
background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
h1{font-size:17px;margin:0 0 4px}
.top{color:var(--dim);font-size:12px;margin:0 0 18px}
.t{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:14px}
.t.waiting{border-color:var(--a);box-shadow:0 4px 18px rgba(255,145,102,.18)}
.hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:11px;color:var(--dim);margin-bottom:10px}
.tag{color:#fff;background:linear-gradient(135deg,var(--a),var(--b));border-radius:999px;padding:2px 9px;font-weight:700;white-space:nowrap}
.msgs{display:flex;flex-direction:column;gap:9px;margin-bottom:12px}
.m{max-width:86%;padding:9px 12px;border-radius:15px;font-size:13.5px;white-space:pre-wrap;word-break:break-word}
.m.user{align-self:flex-start;background:#f4ecf3;border-bottom-left-radius:5px}
.m.dev{align-self:flex-end;color:#fff;background:linear-gradient(135deg,var(--a),var(--b));border-bottom-right-radius:5px}
.w{font-size:10px;color:var(--dim);margin-top:3px}
form{display:flex;gap:7px;align-items:flex-end}
textarea{flex:1;min-width:0;resize:vertical;min-height:46px;border:1px solid var(--line);border-radius:12px;padding:9px 11px;font:inherit;font-size:13.5px;color:var(--text)}
button{flex-shrink:0;height:44px;border:0;border-radius:999px;padding:0 18px;color:#fff;font-weight:700;font-size:13px;background:linear-gradient(135deg,var(--a),var(--b))}
.meta{font-size:10.5px;color:var(--dim);margin:9px 0 0;word-break:break-all}
.empty{color:var(--dim);text-align:center;padding:40px 0}
</style></head><body>${body}</body></html>`,
    { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

  if (!env.ADMIN_KEY) return html('<p class="empty">ADMIN_KEY가 설정되지 않았습니다.<br>FEEDBACK_SETUP.md를 확인하세요.</p>', 503);
  if (!env.FEEDBACK_KV) return html('<p class="empty">FEEDBACK_KV 바인딩이 없습니다.<br>FEEDBACK_SETUP.md를 확인하세요.</p>', 503);

  // 답장 쓰기. 폼은 일반 form POST라 자바스크립트가 없어도 된다.
  if (url.pathname.replace(/\/+$/, '') === '/admin/reply') {
    if (request.method !== 'POST') return html('<p class="empty">잘못된 요청입니다.</p>', 405);
    const form = await request.formData();
    if (form.get('key') !== env.ADMIN_KEY) return html('<p class="empty">열쇠가 맞지 않습니다.</p>', 403);
    const tid = String(form.get('thread') || '');
    const text = String(form.get('text') || '').trim().slice(0, MAX_TEXT);
    if (!TID_RE.test(tid) || !text) return html('<p class="empty">보낼 내용이 없습니다.</p>', 400);

    const thread = await readThread(env, tid);
    if (!thread) return html('<p class="empty">없는 대화입니다.</p>', 404);
    const now = new Date().toISOString();
    thread.messages.push({ id: `dev-${Date.now().toString(36)}`, at: now, from: 'dev', text });
    thread.updatedAt = now;
    await writeThread(env, thread);
    // 보낸 뒤 목록으로 돌아가고, 방금 답한 대화로 바로 내려간다.
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin?key=${encodeURIComponent(env.ADMIN_KEY)}#t-${tid}`, 'Cache-Control': 'no-store' },
    });
  }

  if (url.searchParams.get('key') !== env.ADMIN_KEY) return html('<p class="empty">열쇠가 맞지 않습니다.</p>', 403);

  const list = await env.FEEDBACK_KV.list({ prefix: 'thread:', limit: 200 });
  const rows = list.keys
    .map((k) => ({ tid: k.name.slice('thread:'.length), md: k.metadata || {} }))
    .sort((a, b) => String(b.md.updatedAt || '').localeCompare(String(a.md.updatedAt || '')));

  if (!rows.length) return html('<h1>맘운자로 한마디</h1><p class="empty">아직 온 말이 없습니다.</p>');

  // 목록은 metadata만으로 정렬하고, 본문은 최근 12개만 펼친다.
  // 대화가 수백 개로 늘어도 KV 읽기가 12회를 넘지 않는다.
  const open = rows.slice(0, 12);
  const bodies = await Promise.all(open.map((r) => readThread(env, r.tid)));

  const waiting = rows.filter((r) => r.md.waiting).length;
  const cards = open.map((r, i) => {
    const t = bodies[i];
    if (!t) return '';
    const m = t.meta || {};
    const msgs = t.messages.map((x) => {
      const d = new Date(x.at);
      const w = Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `<div><div class="m ${x.from === 'dev' ? 'dev' : 'user'}">${adminEsc(x.text)}</div><div class="w">${w}</div></div>`;
    }).join('');
    const metaLine = [
      m.uses != null ? `주사 ${m.uses}회` : '',
      m.days != null ? `${m.days}일` : '',
      m.standalone ? '홈화면앱' : '브라우저',
      m.screen || '',
      m.ua || '',
    ].filter(Boolean).join(' · ');
    return `<div class="t ${r.md.waiting ? 'waiting' : ''}" id="t-${adminEsc(r.tid)}">
      <div class="hd"><span>${adminEsc(r.tid.slice(0, 8))}</span>${r.md.waiting ? '<span class="tag">답장 차례</span>' : '<span>답장함</span>'}</div>
      <div class="msgs">${msgs}</div>
      <form method="POST" action="/admin/reply">
        <input type="hidden" name="key" value="${adminEsc(env.ADMIN_KEY)}">
        <input type="hidden" name="thread" value="${adminEsc(r.tid)}">
        <textarea name="text" rows="2" maxlength="1000" placeholder="답장을 쓰면 그 사람 앱에 바로 붙어요" required></textarea>
        <button type="submit">보내기</button>
      </form>
      <p class="meta">${adminEsc(metaLine)}</p>
    </div>`;
  }).join('');

  return html(`<h1>맘운자로 한마디</h1>
<p class="top">대화 ${rows.length}개 · 답장 차례 ${waiting}개${rows.length > open.length ? ` · 최근 ${open.length}개만 펼침` : ''}</p>
${cards}`);
}
