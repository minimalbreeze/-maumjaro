// 맘운자로 AI 맘운 — DeepSeek 프록시 (Cloudflare Worker)
//
// 이 파일은 GitHub Pages에 배포되는 정적 사이트의 일부가 아니다.
// Cloudflare Worker로 별도 배포해서, DeepSeek API 키를 서버 쪽에만 두고
// 클라이언트(fortune.js)는 이 Worker의 URL만 호출하도록 하기 위한 프록시다.
// 배포 방법은 AI_PROXY_SETUP.md 참고.
//
// 경로가 다섯이다.
//   POST /               → DeepSeek 프록시 (기존 동작, 그대로)
//   POST /feedback       → "개발자에게 한마디" 한 줄 쓰기
//   POST /feedback/edit  → 본인이 쓴 글 고치기
//   POST /feedback/delete→ 본인이 쓴 글 지우기
//   GET  /feedback?thread= → 그 대화의 말풍선 전부 (앱이 답장을 가져갈 때)
//   GET  /admin?key=     → 운영자 화면. 여기가 알림을 대신한다 — 운영자가 직접 들어와
//                          쌓인 한마디를 보고 답한다. 그래서 설정이 덜 된 것도 여기서 알려준다.
//   POST /admin/reply    → 운영자가 그 화면에서 답장을 쓴다.
//   POST /admin/delete   → 운영자가 자기 답글을 지운다
//   POST /admin/purge    → 대화 하나를 통째로 없앤다(테스트 흔적 정리·악용 대응)
// 기존 클라이언트는 전부 루트로 호출하므로 이 분기 때문에 깨지는 것은 없다.
// 자세한 설정은 FEEDBACK_SETUP.md 참고.

// 실제로 배포된 GitHub Pages 주소로 정확히 맞춰야 한다(마지막 슬래시 없이).
// CORS를 이 origin으로만 열어서, 다른 사이트가 브라우저에서 이 Worker를
// 직접 호출하는 걸 막는다(완벽한 보안은 아니지만 기본적인 오남용 방지책).
const ALLOWED_ORIGIN = 'https://maumjaro.minimalbreeze.com';

// 이 Worker는 손으로 붙여넣어 배포한다. 그래서 "지금 올라가 있는 게 어느 코드인지"를
// 알 방법이 없었고, 기능이 안 보일 때 붙여넣기가 잘못된 건지 다른 문제인지 구분이 안 됐다.
// 운영자 화면 맨 아래에 이 값을 찍는다. 코드를 고칠 때마다 날짜를 올린다.
const BUILD = '2026-09-24 · 답글 삭제 포함';

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
    if (path === '/admin' || path.startsWith('/admin/')) {
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
      return handleFeedback(body, env, headers);
    }
    // 고치기·지우기는 쓴 사람만 할 수 있어야 한다. 로그인이 없으므로 대화 ID가
    // 곧 신분증이다 — 그 ID를 아는 기기만 그 대화의 글을 건드릴 수 있고,
    // from이 'user'인 말풍선만 대상으로 삼는다(개발자 답장은 앱에서 못 건드린다).
    if (path === '/feedback/edit' || path === '/feedback/delete') {
      return handleAmend(path.endsWith('/edit') ? 'edit' : 'delete', body, env, headers);
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
  // 지운 말풍선은 셈에서 뺀다 — 마지막 글을 지웠는데 "답장 차례"로 남아 있으면
  // 운영자가 빈 말풍선에 대고 답을 쓰게 된다.
  const live = thread.messages.filter((m) => !m.deleted);
  const last = live[live.length - 1];
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
async function handleFeedback(body, env, headers) {
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

  // 알림은 보내지 않는다. 운영자가 /admin 을 직접 열어서 본다 —
  // 그래서 그 화면이 "답장 차례"를 눈에 띄게 세어 보여주는 게 중요하다.
  return jsonRes({ ok: true }, 200, headers);
}

// ── 앱: 대화 가져가기 ─────────────────────────────────────────────
async function handleThreadGet(url, env, headers) {
  const tid = url.searchParams.get('thread') || '';
  if (!TID_RE.test(tid)) return jsonRes({ error: 'bad thread' }, 400, headers);
  if (!env.FEEDBACK_KV) return jsonRes({ messages: [] }, 200, headers);
  const thread = await readThread(env, tid);
  // 없는 대화도 빈 목록으로 답한다 — 있는지 없는지를 알려주지 않기 위해서다.
  const messages = thread ? thread.messages.map((m) => ({
    id: m.id, at: m.at, from: m.from, text: m.text,
    ...(m.editedAt ? { editedAt: m.editedAt } : {}),
    ...(m.deleted ? { deleted: 1 } : {}),
  })) : [];
  return jsonRes({ messages }, 200, headers);
}

// ── 앱: 본인이 쓴 글 고치기 / 지우기 ──────────────────────────────
//
// 지우면 KV에서 본문을 실제로 없앤다. 다만 말풍선 자리는 "지운 메시지"로 남긴다 —
// 운영자가 이미 읽고 답까지 한 말이 흔적 없이 사라지면 대화가 앞뒤로 안 맞는다.
//
// 이미 나간 카톡 알림은 되돌릴 수 없다. 그래서 앱도 그렇게 알린다(없앴다고 말하지 않는다).
async function handleAmend(op, body, env, headers) {
  const tid = typeof body.thread === 'string' ? body.thread : '';
  const id = typeof body.id === 'string' ? body.id.slice(0, 64) : '';
  if (!TID_RE.test(tid) || !id) return jsonRes({ error: 'bad request' }, 400, headers);
  if (!env.FEEDBACK_KV) return jsonRes({ error: 'storage not configured' }, 500, headers);

  const thread = await readThread(env, tid);
  if (!thread) return jsonRes({ error: 'not found' }, 404, headers);

  const msg = thread.messages.find((m) => m.id === id);
  // 개발자 답장과 이미 지운 글은 건드릴 수 없다.
  if (!msg || msg.from !== 'user' || msg.deleted) return jsonRes({ error: 'not editable' }, 403, headers);

  const now = new Date().toISOString();

  if (op === 'delete') {
    msg.text = '';
    msg.deleted = 1;
    delete msg.editedAt;
  } else {
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
    if (!text) return jsonRes({ error: 'text required' }, 400, headers);
    if (text === msg.text) return jsonRes({ ok: true, unchanged: 1 }, 200, headers);
    msg.text = text;
    msg.editedAt = now;
  }

  // 고친 글은 목록에서 위로 올라온다(updatedAt). 운영자가 옛 내용을 보고 엉뚱한
  // 답을 하는 걸 막아주는 건 그것과 말풍선의 "수정됨" 표시다.
  thread.updatedAt = now;
  await writeThread(env, thread);
  return jsonRes({ ok: true }, 200, headers);
}

// ── 운영자 화면 ───────────────────────────────────────────────────
//
// 알림을 따로 보내지 않기로 했으므로(운영자가 직접 들어와서 본다) 이 화면이
// 창구 전부다. 폰에서 즐겨찾기로 열리므로 한 화면에 다 넣고, 답할 차례가 몇 개인지
// 제목(탭)에까지 띄운다.
function adminEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 쓰기 작업을 마치면 목록으로 돌려보낸다(303). 그래야 새로고침해도 같은 글이 또
// 올라가지 않는다. tid를 주면 그 대화 자리로 바로 내려간다.
function backToAdmin(env, tid) {
  const hash = tid ? `#t-${tid}` : '';
  return new Response(null, {
    status: 303,
    headers: { Location: `/admin?key=${encodeURIComponent(env.ADMIN_KEY)}${hash}`, 'Cache-Control': 'no-store' },
  });
}

async function handleAdmin(request, url, env) {
  // 알림이 없으니 탭 제목이 알림 역할을 한다. 즐겨찾기/홈 화면에 걸어두면
  // 열지 않아도 "(2)"가 보인다.
  const html = (body, status, waiting) => new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>${waiting ? `(${waiting}) ` : ''}맘운자로 한마디</title>
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
.m.gone{color:var(--dim);font-style:italic;background:transparent;border:1px dashed var(--line)}
.m.dev{align-self:flex-end;color:#fff;background:linear-gradient(135deg,var(--a),var(--b));border-bottom-right-radius:5px}
.w{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--dim);margin-top:3px}
.row{display:flex;flex-direction:column}
.row.right{align-items:flex-end}
.mini{display:inline}
.link{height:auto;padding:0;background:none;color:var(--dim);font-size:10px;font-weight:600;text-decoration:underline;text-underline-offset:2px}
.link:hover{color:var(--text)}
.link.danger{color:#c0392b}
.purge{justify-content:flex-end;margin-top:10px}
form{display:flex;gap:7px;align-items:flex-end}
textarea{flex:1;min-width:0;resize:vertical;min-height:46px;border:1px solid var(--line);border-radius:12px;padding:9px 11px;font:inherit;font-size:13.5px;color:var(--text)}
button{flex-shrink:0;height:44px;border:0;border-radius:999px;padding:0 18px;color:#fff;font-weight:700;font-size:13px;background:linear-gradient(135deg,var(--a),var(--b))}
.meta{font-size:10.5px;color:var(--dim);margin:9px 0 0;word-break:break-all}
.empty{color:var(--dim);text-align:center;padding:40px 0}
.build{text-align:center;font-size:10px;color:var(--dim);margin:18px 0 0}
.setup{background:#fff;border:1px solid var(--a);border-radius:14px;padding:14px 16px;margin-bottom:16px}
.setup h2{font-size:14px;margin:0 0 8px}
.setup ul{margin:0;padding-left:18px}
.setup li{margin-bottom:5px;font-size:12.5px}
.setup code{background:#f4ecf3;border-radius:5px;padding:1px 5px;font-size:11.5px}
.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 18px}
.bar .top{margin:0}
.refresh{height:32px;padding:0 14px;font-size:12px}
</style></head><body>${body}
<script>
// 되돌릴 수 없는 삭제는 한 번 묻는다. data-confirm이 붙은 폼에만 걸린다.
document.addEventListener('submit', function (e) {
  var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
  if (msg && !confirm(msg)) e.preventDefault();
});
// 답장을 쓰다 말고 새로고침되면 쓰던 글이 날아간다. 빈 칸일 때만 갱신한다.
setInterval(function () {
  var typing = [].some.call(document.querySelectorAll('textarea'), function (t) { return t.value.trim(); });
  if (!typing && document.visibilityState === 'visible') location.reload();
}, 60000);
</script></body></html>`,
    { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

  // 설정이 덜 된 채로 열면 "왜 아무것도 없지?"가 된다. 무엇이 빠졌고 어디서
  // 고치는지를 이 화면이 직접 말해준다 — 알림이 없으니 물어볼 데도 여기뿐이다.
  const missing = [];
  if (!env.ADMIN_KEY) missing.push('<code>ADMIN_KEY</code> — Worker → Settings → Variables and Secrets → Add (Secret으로 저장)');
  if (!env.FEEDBACK_KV) missing.push('<code>FEEDBACK_KV</code> — KV namespace를 만들고 Worker → Settings → Bindings 에서 이 이름으로 연결');
  if (missing.length) {
    return html(`<h1>맘운자로 한마디</h1>
<div class="setup"><h2>설정이 아직 끝나지 않았어요</h2><ul>${missing.map((x) => `<li>${x}</li>`).join('')}</ul></div>
<p class="empty">자세한 순서는 저장소의 FEEDBACK_SETUP.md에 있어요.<br>그 전까지 사용자가 쓴 글은 각자 폰에 보관되고, 설정이 끝나면 자동으로 들어옵니다.</p>`, 503);
  }

  const adminPath = url.pathname.replace(/\/+$/, '');

  // 답장 쓰기. 폼은 일반 form POST라 자바스크립트가 없어도 된다.
  if (adminPath === '/admin/reply') {
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
    return backToAdmin(env, tid);
  }

  // 운영자가 자기 답글을 지운다. 사용자 쪽과 같은 규칙으로 자리는 "지운 메시지"로
  // 남긴다 — 상대가 이미 읽었을 수 있는데 흔적 없이 사라지면 대화가 앞뒤로 안 맞는다.
  if (adminPath === '/admin/delete') {
    if (request.method !== 'POST') return html('<p class="empty">잘못된 요청입니다.</p>', 405);
    const form = await request.formData();
    if (form.get('key') !== env.ADMIN_KEY) return html('<p class="empty">열쇠가 맞지 않습니다.</p>', 403);
    const tid = String(form.get('thread') || '');
    const id = String(form.get('id') || '');
    if (!TID_RE.test(tid) || !id) return html('<p class="empty">잘못된 요청입니다.</p>', 400);

    const thread = await readThread(env, tid);
    if (!thread) return html('<p class="empty">없는 대화입니다.</p>', 404);
    const msg = thread.messages.find((m) => m.id === id);
    // 운영자는 자기 답글만 지운다. 사용자가 쓴 글은 그 사람 것이라 건드리지 않는다
    // (대화 전체를 없애야 할 때는 아래 purge를 쓴다).
    if (!msg || msg.from !== 'dev' || msg.deleted) return html('<p class="empty">지울 수 없는 글입니다.</p>', 403);
    msg.text = '';
    msg.deleted = 1;
    delete msg.editedAt;
    thread.updatedAt = new Date().toISOString();
    await writeThread(env, thread);
    return backToAdmin(env, tid);
  }

  // 대화 하나를 통째로 없앤다. 테스트하고 남은 흔적을 치우거나, 욕설·스팸이 들어왔을 때 쓴다.
  if (adminPath === '/admin/purge') {
    if (request.method !== 'POST') return html('<p class="empty">잘못된 요청입니다.</p>', 405);
    const form = await request.formData();
    if (form.get('key') !== env.ADMIN_KEY) return html('<p class="empty">열쇠가 맞지 않습니다.</p>', 403);
    const tid = String(form.get('thread') || '');
    if (!TID_RE.test(tid)) return html('<p class="empty">잘못된 요청입니다.</p>', 400);
    await env.FEEDBACK_KV.delete(threadKey(tid));
    return backToAdmin(env, '');
  }

  if (url.searchParams.get('key') !== env.ADMIN_KEY) return html('<p class="empty">열쇠가 맞지 않습니다.</p>', 403);

  const list = await env.FEEDBACK_KV.list({ prefix: 'thread:', limit: 200 });
  const rows = list.keys
    .map((k) => ({ tid: k.name.slice('thread:'.length), md: k.metadata || {} }))
    .sort((a, b) => String(b.md.updatedAt || '').localeCompare(String(a.md.updatedAt || '')));

  if (!rows.length) return html(`<h1>맘운자로 한마디</h1><p class="empty">아직 온 말이 없습니다.</p><p class="build">${adminEsc(BUILD)}</p>`, 200, 0);

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
      // 지운 글은 본문이 KV에 없다. 자리만 남겨서 대화의 앞뒤가 맞게 한다.
      const cls = x.deleted ? 'user gone' : (x.from === 'dev' ? 'dev' : 'user');
      const bubble = x.deleted ? '지운 메시지' : adminEsc(x.text);
      // 내가 쓴 답글에만 지우기를 단다. 사용자 글은 그 사람 것이라 여기서 안 건드린다
      // (대화 전체를 없애야 할 때는 카드 아래의 "대화 전체 삭제"를 쓴다).
      const del = (x.from === 'dev' && !x.deleted)
        ? `<form method="POST" action="/admin/delete" class="mini">
             <input type="hidden" name="key" value="${adminEsc(env.ADMIN_KEY)}">
             <input type="hidden" name="thread" value="${adminEsc(t.id)}">
             <input type="hidden" name="id" value="${adminEsc(x.id)}">
             <button type="submit" class="link">지우기</button>
           </form>`
        : '';
      return `<div class="row ${x.from === 'dev' ? 'right' : ''}"><div class="m ${cls}">${bubble}</div><div class="w">${w}${x.editedAt ? ' · 수정됨' : ''}${del}</div></div>`;
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
      <form method="POST" action="/admin/purge" class="purge" data-confirm="이 대화를 통째로 지울까요? 되돌릴 수 없습니다.">
        <input type="hidden" name="key" value="${adminEsc(env.ADMIN_KEY)}">
        <input type="hidden" name="thread" value="${adminEsc(r.tid)}">
        <button type="submit" class="link danger">대화 전체 삭제</button>
      </form>
    </div>`;
  }).join('');

  return html(`<h1>맘운자로 한마디</h1>
<div class="bar">
  <p class="top">대화 ${rows.length}개 · <strong>답장 차례 ${waiting}개</strong>${rows.length > open.length ? ` · 최근 ${open.length}개만 펼침` : ''}</p>
  <form method="GET" action="/admin"><input type="hidden" name="key" value="${adminEsc(env.ADMIN_KEY)}"><button class="refresh" type="submit">새로고침</button></form>
</div>
${cards}
<p class="build">${adminEsc(BUILD)}</p>`, 200, waiting);
}
