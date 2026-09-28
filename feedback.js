// 개발자에게 한마디 — 끊기지 않고 이어지는 1:1 대화
//
// 왜 만들었나 (2026-09)
//   GA4로는 "몇 명이 들어와서 몇 초 있다 나갔다"까지만 보인다. 하루 활성 4명,
//   주사 완주 22% 같은 숫자는 무엇을 고쳐야 하는지 한 마디도 알려주지 않는다.
//   이 규모에서는 통계보다 한 사람의 문장 하나가 정보량이 훨씬 크다.
//
// 왜 "보내고 끝"이 아니라 대화인가
//   한 번 보내고 끝나는 건의함은 두 번째 글이 안 온다 — 보낸 사람 입장에서
//   허공에 대고 말한 것과 구분이 안 되기 때문이다. 답이 돌아오는 걸 본 사람만
//   다음 말을 한다. 그래서 SNS 댓글처럼 계속 이어지게 만든다.
//   운영자가 운영자 화면(/admin)에서 답하면 여기 말풍선으로 붙는다.
//   따로 알림을 보내지 않기로 했으므로(운영자가 직접 들어와서 본다), 반대로
//   "답장이 왔다"를 사용자에게 알리는 쪽은 이 파일이 확실히 해야 한다 —
//   빨간 점과 토스트가 그 역할이다.
//
// 설계 원칙
//  - 누구인지 묻지 않는다. 기기마다 임의의 대화 ID 하나를 만들어 쓴다.
//    이메일·연락처를 받지 않는다 — 답은 이 화면 안에서만 한다.
//  - 대화 ID는 추측할 수 없는 난수다. 이 ID를 아는 것 자체가 열쇠이므로
//    로그인 없이도 남의 대화를 볼 수 없다.
//  - 실패해도 사용자가 쓴 글을 잃지 않는다. 전송이 안 되면 기기에 보관했다가
//    다음에 앱을 열 때 자동으로 다시 보낸다. 폰은 지하철에서도 열린다.
//  - 내가 쓴 말은 서버와 무관하게 항상 화면에 남는다(로컬 사본).
//  - 내가 쓴 말은 내가 고치고 지울 수 있다. 개발자 답장은 앱에서 건드리지 않는다.
//    지운 자리는 "지운 메시지"로 남긴다 — 이미 답까지 받은 말이 흔적 없이
//    사라지면 대화가 앞뒤로 안 맞는다. 운영자가 이미 읽었을 수도 있으므로
//    "없앴다"고 말하지 않는다.
//  - 서버 주소가 없으면 입구 자체를 띄우지 않는다.
//  - 끝나면 핵심 경험(주사)으로 돌려보낸다 — 정보만 보여주고 끝나는 화면을 만들지 않는다.
(() => {
  'use strict';

  // 답글을 다는 쪽의 이름. "개발자"로 못 박아두면 다른 사람이 답할 때 거짓말이 된다.
  // 브랜드 이름으로 두면 누가 답하든 맞는 말이 된다. 바꾸려면 여기 한 줄만 고친다.
  const REPLIER = '맘운자로';

  const TID_KEY = 'maumjaro:feedbackThreadId';
  const THREAD_KEY = 'maumjaro:feedbackThread';   // { messages: [], seenAt: '' }
  const OUTBOX_KEY = 'maumjaro:feedbackOutbox';
  const MAX_LEN = 500;
  const MAX_KEEP = 60;         // 기기에 남기는 말풍선 수
  const MAX_OUTBOX = 20;
  const COOLDOWN_MS = 5000;    // 대화니까 짧게. 연타로 같은 글이 겹치는 것만 막는다.
  const TIMEOUT_MS = 8000;
  const POLL_MS = 15000;       // 대화창을 열어둔 동안에만 돈다

  let lastSentAt = 0;
  let pollTimer = null;
  let editingId = null;   // 지금 고치고 있는 글
  let confirmFor = null;  // "정말 지울까요?" 를 띄운 글

  function base() {
    // 주소는 fortune.js가 하나만 갖고 있다. 여기서 또 적으면 둘이 어긋난다.
    const F = window.MaumjaroFortune;
    const u = (F && F.AI_PROXY_URL) || '';
    return u ? u.replace(/\/+$/, '') : '';
  }

  function track(name, params) {
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') G.track(name, params);
  }

  // 기기마다 하나. 한 번 만들면 안 바꾼다 — 바꾸면 그동안의 대화가 끊긴다.
  function threadId() {
    try {
      let t = localStorage.getItem(TID_KEY);
      if (t && /^[a-f0-9]{24,64}$/.test(t)) return t;
      const a = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(a);
      t = [...a].map((n) => n.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(TID_KEY, t);
      return t;
    } catch (e) {
      // localStorage가 막힌 브라우저(사생활 보호 모드 등). 이번 세션 동안만 쓴다.
      if (!threadId._mem) threadId._mem = String(Date.now()).padStart(24, '0').slice(0, 24) + '0000';
      return threadId._mem;
    }
  }

  function loadThread() {
    try {
      const t = JSON.parse(localStorage.getItem(THREAD_KEY) || '{}');
      return { messages: Array.isArray(t.messages) ? t.messages : [], seenAt: t.seenAt || '' };
    } catch (e) { return { messages: [], seenAt: '' }; }
  }
  function saveThread(t) {
    try {
      localStorage.setItem(THREAD_KEY, JSON.stringify({
        messages: t.messages.slice(-MAX_KEEP),
        seenAt: t.seenAt || '',
      }));
    } catch (e) { /* 저장 실패는 무시 */ }
  }

  // 같은 말풍선이 두 번 붙지 않도록 id로 합친다. 서버에 올라간 내 글은
  // 로컬 사본과 id가 같으므로 자연스럽게 하나로 겹쳐진다.
  function merge(local, incoming) {
    const byId = new Map();
    [...local, ...incoming].forEach((m) => {
      if (m && m.id && typeof m.text === 'string') byId.set(m.id, m);
    });
    return [...byId.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  function loadOutbox() {
    try {
      const v = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function saveOutbox(list) {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-MAX_OUTBOX))); } catch (e) { /* 무시 */ }
  }

  // 화면에 "함께 전달돼요"라고 적어둔 것과 정확히 같아야 한다. 여기에 뭘 더 넣으려면
  // 안내 문구(.feedback-note)도 같이 고친다.
  function meta() {
    let uses = 0;
    let days = 0;
    try {
      const C = window.MaumjaroCore;
      const recs = C && typeof C.loadRecords === 'function' ? C.loadRecords() : [];
      if (Array.isArray(recs)) {
        // app.js의 기록은 타임스탬프(숫자) 배열이다. 객체가 아니다.
        uses = recs.length;
        days = new Set(recs.map((ts) => {
          const d = new Date(ts);
          return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        }).filter(Boolean)).size;
      }
    } catch (e) { /* 기록을 못 읽어도 보내는 건 되어야 한다 */ }
    return {
      uses,
      days,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      ua: String(navigator.userAgent || '').slice(0, 180),
      standalone: window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? 1 : 0,
    };
  }

  async function call(path, opts) {
    const url = base();
    if (!url) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url + path, { ...opts, signal: ctrl.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function postMessage(item) {
    return call('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread: threadId(),
        id: item.id,
        text: item.text,
        at: item.at,
        meta: item.meta || {},
      }),
    });
  }

  function amend(op, payload) {
    return call(`/feedback/${op}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thread: threadId(), ...payload }),
    });
  }

  function isPending(id) {
    return loadOutbox().some((m) => m.id === id);
  }

  // 서버에서 대화를 받아와 로컬과 합친다. 새로 온 답장 수를 돌려준다.
  async function sync() {
    if (!base()) return 0;
    const data = await call(`/feedback?thread=${encodeURIComponent(threadId())}`, { method: 'GET' });
    if (!data || !Array.isArray(data.messages)) return 0;
    const t = loadThread();
    const before = new Set(t.messages.map((m) => m.id));
    t.messages = merge(t.messages, data.messages);
    saveThread(t);
    return t.messages.filter((m) => m.from === 'dev' && !before.has(m.id)).length;
  }

  function unreadCount() {
    const t = loadThread();
    return t.messages.filter((m) => m.from === 'dev' && String(m.at) > String(t.seenAt || '')).length;
  }

  function markRead() {
    const t = loadThread();
    const devs = t.messages.filter((m) => m.from === 'dev');
    if (devs.length) t.seenAt = devs[devs.length - 1].at;
    saveThread(t);
    paintBadges();
  }

  // 답장이 와 있다는 걸 알리는 빨간 점. 설정 버튼과 기록 탭 입구 두 곳에 붙인다.
  function paintBadges() {
    const n = unreadCount();
    document.querySelectorAll('.fb-badge').forEach((el) => { el.hidden = n === 0; });
    const hint = document.getElementById('history-feedback-text');
    if (hint) {
      hint.textContent = n
        ? `${REPLIER} 답장이 ${n}개 도착했어요`
        : '쓰면서 불편한 곳, 있었으면 하는 기능 있으셨나요?';
    }
  }

  // 보관해둔 글을 조용히 다시 보낸다. 하나라도 실패하면 거기서 멈춘다 —
  // 서버가 죽어 있는데 20개를 연달아 두드릴 이유가 없다.
  async function flush() {
    if (!base()) return;
    const box = loadOutbox();
    if (!box.length) return;
    const left = [];
    let stop = false;
    for (const item of box) {
      if (stop) { left.push(item); continue; }
      const ok = await postMessage(item);
      if (!ok) { stop = true; left.push(item); }
    }
    saveOutbox(left);
    if (left.length < box.length) track('feedback_flushed', { sent: box.length - left.length });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function when(at) {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  }

  // 스레드처럼 그린다 — 말풍선이 아니라 피드.
  //   동그란 프로필 · 굵은 이름 · 오른쪽에 시간 · 그 아래 글 · 그 아래 작은 동작줄.
  // 카톡식 말풍선에서 바꾼 이유: 이건 둘이 주고받는 대화지만 화면은 게시판에 가깝다.
  // 좌우로 갈라 놓으면 글이 길어질수록 읽기 어렵고, 한 사람이 여러 줄을 쓰면 더 그렇다.
  function render() {
    const box = document.getElementById('feedback-thread');
    const empty = document.getElementById('feedback-empty');
    if (!box) return;
    const t = loadThread();
    const pending = new Set(loadOutbox().map((m) => m.id));
    empty.hidden = t.messages.length > 0;
    box.innerHTML = t.messages.map((m) => {
      const mine = m.from !== 'dev';
      const gone = !!m.deleted;
      // 고치고 지울 수 있는 건 내 글뿐이다. 이미 지운 글은 다시 건드리지 않는다.
      const editable = mine && !gone;
      const marks = [
        when(m.at),
        m.editedAt ? '수정됨' : '',
        mine && pending.has(m.id) ? '보내는 중' : '',
      ].filter(Boolean).join(' · ');

      let acts = '';
      if (editable && confirmFor === m.id) {
        acts = `<div class="fb-acts">정말 지울까요?
          <button type="button" data-act="del-yes">지우기</button>
          <button type="button" data-act="cancel">취소</button></div>`;
      } else if (editable) {
        acts = `<div class="fb-acts">
          <button type="button" data-act="edit">수정</button>
          <button type="button" data-act="del">삭제</button></div>`;
      }

      return `<article class="fb-post ${mine ? 'mine' : 'dev'}${editingId === m.id ? ' editing' : ''}" data-id="${esc(m.id)}">
        <span class="fb-ava ${mine ? 'me' : 'dev'}" aria-hidden="true">${mine ? '🙂' : '💉'}</span>
        <div class="fb-col">
          <div class="fb-line">
            <span class="fb-name">${mine ? '나' : REPLIER}</span>
            <span class="fb-time">${marks}</span>
          </div>
          ${gone
            ? '<p class="fb-text gone">지운 글이에요</p>'
            : `<p class="fb-text">${esc(m.text).replace(/\n/g, '<br>')}</p>`}
          ${acts}
        </div>
      </article>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  async function refresh() {
    const got = await sync();
    render();
    if (document.getElementById('feedback-overlay').classList.contains('show')) markRead();
    else paintBadges();
    return got;
  }

  function open(from) {
    const ov = document.getElementById('feedback-overlay');
    if (!ov) return;
    const ta = document.getElementById('feedback-text');
    const status = document.getElementById('feedback-status');
    status.textContent = '';
    status.hidden = true;
    stopEditing();

    render();
    ov.classList.add('show');
    markRead();
    setTimeout(() => ta.focus(), 260);
    track('feedback_opened', { from: from || 'settings', messages: loadThread().messages.length });

    refresh();
    clearInterval(pollTimer);
    pollTimer = setInterval(refresh, POLL_MS);
  }

  function close() {
    const ov = document.getElementById('feedback-overlay');
    if (ov) ov.classList.remove('show');
    confirmFor = null;
    stopEditing();
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // 고치는 동안에는 아래 입력칸이 그 말풍선의 입력칸이 된다.
  // 칸을 하나 더 만들지 않는 이유: 폰에서는 키보드가 화면 절반을 덮어서,
  // 말풍선 자리에 칸이 생기면 그 칸이 키보드 밑으로 들어가 버린다.
  function startEditing(id, text) {
    const ta = document.getElementById('feedback-text');
    const bar = document.getElementById('feedback-editing');
    const send = document.getElementById('feedback-send-btn');
    editingId = id;
    confirmFor = null;
    ta.value = text;
    document.getElementById('feedback-count').textContent = `${text.length}/${MAX_LEN}`;
    send.textContent = '수정';
    send.disabled = !text.trim();
    if (bar) bar.hidden = false;
    render();
    ta.focus();
    ta.setSelectionRange(text.length, text.length);
  }

  function stopEditing(clearText) {
    const ta = document.getElementById('feedback-text');
    const bar = document.getElementById('feedback-editing');
    const send = document.getElementById('feedback-send-btn');
    editingId = null;
    if (bar) bar.hidden = true;
    if (send) send.textContent = '보내기';
    if (clearText && ta) {
      ta.value = '';
      document.getElementById('feedback-count').textContent = `0/${MAX_LEN}`;
    }
    if (send && ta) send.disabled = !ta.value.trim();
  }

  function say(msg) {
    const status = document.getElementById('feedback-status');
    if (!status) return;
    status.hidden = !msg;
    status.textContent = msg || '';
  }

  async function saveEdit(id, text) {
    const t = loadThread();
    const msg = t.messages.find((m) => m.id === id);
    if (!msg) return;
    if (text === msg.text) { stopEditing(true); render(); return; }

    // 아직 서버에 못 올라간 글이면 보관함 쪽만 고치면 된다. 서버는 나중에
    // 고쳐진 내용으로 받게 된다.
    if (isPending(id)) {
      saveOutbox(loadOutbox().map((m) => (m.id === id ? { ...m, text } : m)));
      msg.text = text;
      saveThread(t);
      stopEditing(true);
      render();
      flush();
      return;
    }

    const ok = await amend('edit', { id, text });
    if (!ok) { say('지금은 연결이 안 돼서 고치지 못했어요. 잠시 뒤 다시 해주세요.'); return; }
    msg.text = text;
    msg.editedAt = new Date().toISOString();
    saveThread(t);
    stopEditing(true);
    say('');
    track('feedback_edited', { length: text.length });
    render();
  }

  async function doDelete(id) {
    const t = loadThread();
    const msg = t.messages.find((m) => m.id === id);
    if (!msg) return;

    // 아직 안 보낸 글은 흔적을 남길 이유가 없다 — 통째로 뺀다.
    if (isPending(id)) {
      saveOutbox(loadOutbox().filter((m) => m.id !== id));
      t.messages = t.messages.filter((m) => m.id !== id);
      saveThread(t);
      confirmFor = null;
      render();
      return;
    }

    const ok = await amend('delete', { id });
    if (!ok) { say('지금은 연결이 안 돼서 지우지 못했어요. 잠시 뒤 다시 해주세요.'); return; }
    msg.text = '';
    msg.deleted = 1;
    delete msg.editedAt;
    saveThread(t);
    confirmFor = null;
    if (editingId === id) stopEditing(true);
    say('');
    track('feedback_deleted', {});
    render();
  }

  function wire() {
    const ov = document.getElementById('feedback-overlay');
    const row = document.getElementById('settings-feedback-row');
    const histBlock = document.getElementById('history-feedback');
    if (!ov) return;

    // 보낼 곳이 없으면 입구를 만들지 않는다.
    if (!base()) {
      if (row) row.hidden = true;
      if (histBlock) histBlock.hidden = true;
      return;
    }
    if (row) row.hidden = false;
    if (histBlock) histBlock.hidden = false;

    const openBtn = document.getElementById('settings-feedback-btn');
    const histBtn = document.getElementById('history-feedback-btn');
    const ta = document.getElementById('feedback-text');
    const count = document.getElementById('feedback-count');
    const sendBtn = document.getElementById('feedback-send-btn');
    const status = document.getElementById('feedback-status');

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const s = document.getElementById('settings-overlay');
        if (s) s.classList.remove('show');
        setTimeout(() => open('settings'), 220);
      });
    }
    if (histBtn) histBtn.addEventListener('click', () => open('history'));

    ta.addEventListener('input', () => {
      if (ta.value.length > MAX_LEN) ta.value = ta.value.slice(0, MAX_LEN);
      count.textContent = `${ta.value.length}/${MAX_LEN}`;
      sendBtn.disabled = !ta.value.trim();
    });

    async function send() {
      const text = ta.value.trim();
      if (!text) return;
      // 고치는 중이면 새 글이 아니라 그 말풍선을 바꾼다.
      if (editingId) { await saveEdit(editingId, text); return; }
      if (Date.now() - lastSentAt < COOLDOWN_MS) {
        status.hidden = false;
        status.textContent = '조금만 천천히 보내주세요.';
        return;
      }
      lastSentAt = Date.now();

      const item = {
        id: `${threadId().slice(0, 8)}-${Date.now().toString(36)}`,
        at: new Date().toISOString(),
        from: 'user',
        text,
        meta: meta(),
      };

      // 내 말은 먼저 화면에 붙인다. 전송 결과와 무관하게 남는다.
      const t = loadThread();
      t.messages = merge(t.messages, [{ id: item.id, at: item.at, from: 'user', text }]);
      saveThread(t);
      ta.value = '';
      count.textContent = `0/${MAX_LEN}`;
      sendBtn.disabled = true;
      status.hidden = true;

      const box = loadOutbox();
      box.push(item);
      saveOutbox(box);
      render();

      const ok = await postMessage(item);
      if (ok) {
        saveOutbox(loadOutbox().filter((m) => m.id !== item.id));
      } else {
        status.hidden = false;
        status.textContent = '지금은 연결이 안 돼서 폰에 보관해뒀어요. 다음에 앱을 열 때 자동으로 다시 보낼게요.';
      }
      track(ok ? 'feedback_sent' : 'feedback_queued', {
        length: text.length,
        turn: t.messages.filter((m) => m.from === 'user').length,
      });
      render();
    }

    // 말풍선은 다시 그려지므로 개별 버튼에 붙이지 않고 목록에서 한 번만 받는다.
    document.getElementById('feedback-thread').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const wrap = btn.closest('.fb-post');
      if (!wrap) return;
      const id = wrap.dataset.id;
      const act = btn.dataset.act;
      if (act === 'cancel') { confirmFor = null; render(); return; }
      if (act === 'del') { confirmFor = id; render(); return; }
      if (act === 'del-yes') { doDelete(id); return; }
      if (act === 'edit') {
        const m = loadThread().messages.find((x) => x.id === id);
        if (m) startEditing(id, m.text);
      }
    });

    const cancelEdit = document.getElementById('feedback-edit-cancel');
    if (cancelEdit) cancelEdit.addEventListener('click', () => { stopEditing(true); say(''); render(); });

    sendBtn.addEventListener('click', send);
    // 데스크톱에서는 Enter로 보내고 Shift+Enter로 줄바꿈한다. 폰은 줄바꿈이 기본이다.
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
        e.preventDefault();
        send();
      }
    });

    document.getElementById('feedback-close-btn').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    // 끝났으면 다시 오늘의 맘운으로. 여기가 최종 목적지가 되면 안 된다.
    document.getElementById('feedback-back-btn').addEventListener('click', () => {
      close();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 앱을 열거나 다시 앞으로 가져왔을 때 답장이 와 있는지 본다.
    // 대화창이 닫혀 있으면 빨간 점만 켜고, 새 답장이 있으면 한 번만 알려준다.
    async function checkQuietly() {
      await flush();
      const got = await sync();
      paintBadges();
      if (got > 0 && !ov.classList.contains('show')) {
        const C = window.MaumjaroCore;
        if (C && typeof C.showToast === 'function') C.showToast(`${REPLIER} 답장이 도착했어요 💬`);
        track('feedback_reply_received', { count: got });
      }
    }
    paintBadges();
    checkQuietly();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !ov.classList.contains('show')) checkQuietly();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.MaumjaroFeedback = { open, close, refresh, unread: unreadCount, pending: () => loadOutbox().length };
})();
