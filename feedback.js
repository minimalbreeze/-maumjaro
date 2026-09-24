// 개발자에게 한마디 — 사용자가 남긴 말을 운영자 폰으로 바로 보낸다.
//
// 왜 만들었나 (2026-09)
//   GA4로는 "몇 명이 들어와서 몇 초 있다 나갔다"까지만 보인다. 하루 활성 4명,
//   주사 완주 22% 같은 숫자는 무엇을 고쳐야 하는지 한 마디도 알려주지 않는다.
//   이 규모에서는 통계보다 한 사람의 문장 하나가 정보량이 훨씬 크다.
//   "앱이 별로인가" 하는 불안은 데이터가 없어서 생기는 것이지, 데이터가 나빠서
//   생기는 게 아니다. 그래서 말을 받을 창구를 만든다.
//
// 설계 원칙
//  - 실패해도 사용자가 쓴 글을 잃지 않는다. 전송이 안 되면 기기에 보관(outbox)했다가
//    다음에 앱을 열 때 자동으로 다시 보낸다. 폰은 지하철에서도 열린다.
//  - 서버 주소(Worker)가 없으면 설정에 항목 자체를 띄우지 않는다.
//    눌렀는데 아무 데도 안 가는 버튼이 제일 나쁘다.
//  - 보내는 정보는 화면에 적어둔 것이 전부다. 몰래 붙여 보내지 않는다.
//  - 끝나면 핵심 경험(주사)으로 돌려보낸다 — 정보만 보여주고 끝나는 화면을 만들지 않는다.
(() => {
  'use strict';

  const OUTBOX_KEY = 'maumjaro:feedbackOutbox';
  const LAST_SENT_KEY = 'maumjaro:feedbackLastAt';
  const MAX_LEN = 500;
  const MAX_CONTACT = 60;
  const MAX_OUTBOX = 20;
  const COOLDOWN_MS = 20000;   // 연타로 같은 글이 여러 번 날아가는 걸 막는다
  const TIMEOUT_MS = 8000;

  function endpoint() {
    // 주소는 fortune.js가 하나만 갖고 있다. 여기서 또 적으면 둘이 어긋난다.
    const F = window.MaumjaroFortune;
    const base = (F && F.AI_PROXY_URL) || '';
    return base ? base.replace(/\/+$/, '') + '/feedback' : '';
  }

  function track(name, params) {
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') G.track(name, params);
  }

  function loadOutbox() {
    try {
      const v = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function saveOutbox(list) {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-MAX_OUTBOX))); } catch (e) { /* 저장 실패는 무시 */ }
  }

  // 화면에 "함께 전달돼요"라고 적어둔 것과 정확히 같아야 한다. 여기에 뭘 더 넣으려면
  // 안내 문구도 같이 고친다.
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

  async function post(item) {
    const url = endpoint();
    if (!url) return false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.text, contact: item.contact || '', at: item.at, meta: item.meta || {} }),
        signal: ctrl.signal,
      });
      return res.ok;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  // 보관해둔 글을 조용히 다시 보낸다. 하나라도 실패하면 거기서 멈춘다 —
  // 서버가 죽어 있는데 20개를 연달아 두드릴 이유가 없다.
  async function flush() {
    if (!endpoint()) return;
    let box = loadOutbox();
    if (!box.length) return;
    const left = [];
    let stop = false;
    for (const item of box) {
      if (stop) { left.push(item); continue; }
      const ok = await post(item);
      if (!ok) { stop = true; left.push(item); }
    }
    saveOutbox(left);
    if (left.length < box.length) track('feedback_flushed', { sent: box.length - left.length });
  }

  function queue(item) {
    const box = loadOutbox();
    box.push(item);
    saveOutbox(box);
  }

  function open(from) {
    const ov = document.getElementById('feedback-overlay');
    if (!ov) return;
    const form = document.getElementById('feedback-form');
    const done = document.getElementById('feedback-done');
    const ta = document.getElementById('feedback-text');
    const contact = document.getElementById('feedback-contact');
    const count = document.getElementById('feedback-count');
    const sendBtn = document.getElementById('feedback-send-btn');
    const status = document.getElementById('feedback-status');

    form.hidden = false;
    done.hidden = true;
    status.textContent = '';
    status.hidden = true;
    sendBtn.disabled = !ta.value.trim();
    count.textContent = `${ta.value.length}/${MAX_LEN}`;

    ov.classList.add('show');
    setTimeout(() => ta.focus(), 260);
    track('feedback_opened', { from: from || 'settings' });
  }

  function close() {
    const ov = document.getElementById('feedback-overlay');
    if (ov) ov.classList.remove('show');
  }

  function wire() {
    const ov = document.getElementById('feedback-overlay');
    const row = document.getElementById('settings-feedback-row');
    if (!ov) return;

    const histBlock = document.getElementById('history-feedback');

    // 보낼 곳이 없으면 입구를 만들지 않는다.
    if (!endpoint()) {
      if (row) row.hidden = true;
      if (histBlock) histBlock.hidden = true;
      return;
    }
    if (row) row.hidden = false;
    if (histBlock) histBlock.hidden = false;

    const histBtn = document.getElementById('history-feedback-btn');
    if (histBtn) histBtn.addEventListener('click', () => open('history'));

    const openBtn = document.getElementById('settings-feedback-btn');
    const ta = document.getElementById('feedback-text');
    const contact = document.getElementById('feedback-contact');
    const count = document.getElementById('feedback-count');
    const sendBtn = document.getElementById('feedback-send-btn');
    const status = document.getElementById('feedback-status');
    const form = document.getElementById('feedback-form');
    const done = document.getElementById('feedback-done');

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        const s = document.getElementById('settings-overlay');
        if (s) s.classList.remove('show');
        setTimeout(() => open('settings'), 220);
      });
    }

    ta.addEventListener('input', () => {
      if (ta.value.length > MAX_LEN) ta.value = ta.value.slice(0, MAX_LEN);
      count.textContent = `${ta.value.length}/${MAX_LEN}`;
      sendBtn.disabled = !ta.value.trim();
    });

    async function send() {
      const text = ta.value.trim();
      if (!text) return;

      const last = Number(localStorage.getItem(LAST_SENT_KEY) || 0);
      if (Date.now() - last < COOLDOWN_MS) {
        status.hidden = false;
        status.textContent = '방금 보내주셨어요. 잠시 뒤에 한 번 더 보내주세요.';
        return;
      }

      sendBtn.disabled = true;
      sendBtn.textContent = '보내는 중…';
      status.hidden = true;

      const item = {
        at: new Date().toISOString(),
        text,
        contact: (contact.value || '').trim().slice(0, MAX_CONTACT),
        meta: meta(),
      };
      const ok = await post(item);
      if (!ok) queue(item);

      try { localStorage.setItem(LAST_SENT_KEY, String(Date.now())); } catch (e) { /* 무시 */ }
      track(ok ? 'feedback_sent' : 'feedback_queued', {
        length: text.length,
        has_contact: item.contact ? 1 : 0,
      });

      ta.value = '';
      contact.value = '';
      count.textContent = `0/${MAX_LEN}`;
      sendBtn.textContent = '보내기 💌';

      // 실패해도 글은 기기에 남아 있다. 그 사실을 숨기지 않고 그대로 말한다.
      document.getElementById('feedback-done-sub').textContent = ok
        ? '읽고 하나하나 반영할게요. 답장이 필요하면 남겨주신 곳으로 연락드려요.'
        : '지금은 연결이 안 돼서 폰에 보관해뒀어요. 다음에 앱을 열 때 자동으로 다시 보낼게요.';
      form.hidden = true;
      done.hidden = false;
    }

    sendBtn.addEventListener('click', send);
    document.getElementById('feedback-close-btn').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    // 끝났으면 다시 오늘의 맘운으로. 여기가 최종 목적지가 되면 안 된다.
    document.getElementById('feedback-back-btn').addEventListener('click', () => {
      close();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    flush();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.MaumjaroFeedback = { open, close, flush, pending: () => loadOutbox().length };
})();
