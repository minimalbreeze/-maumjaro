// 주사 직후 문구를 AI로 매번 다르게 띄운다.
//
// app.js는 건드리지 않는다. app.js가 completeInjection()에서 이미 쏘고 있는
// 'maumjaro:emotion-injected' 이벤트만 듣고, 화면에 이미 그려진 #healing-text를
// 나중에 바꿔치기한다.
//
// 설계 원칙
//  - 기본 문구가 먼저 뜨고, AI 답이 도착하면 그때 갈아끼운다. 그래서 네트워크가
//    느리거나 죽어도 사용자는 아무 이상을 못 느낀다(빈 화면·로딩 스피너 없음).
//  - 오버레이는 3.7초 뒤 닫힌다. 그 안에 안 오면 조용히 포기한다.
//  - 같은 감정은 하루에 한 번만 호출한다. DeepSeek 잔액이 곧 상한이라
//    주사할 때마다 부르면 금방 소진된다.
(() => {
  'use strict';

  const HEAL_OVERLAY_MS = 3700;   // app.js가 오버레이를 닫는 시각
  const REQUEST_TIMEOUT_MS = 3200; // 그보다 조금 짧게 끊는다
  const CACHE_KEY = 'maumjaro:healAiCache';

  const healingText = document.getElementById('healing-text');
  const healingOverlay = document.getElementById('healing-overlay');
  if (!healingText || !healingOverlay) return;

  function proxyUrl() {
    // URL은 fortune.js가 갖고 있다. 여기서 또 적어두면 둘이 어긋난다.
    const F = window.MaumjaroFortune;
    return (F && F.AI_PROXY_URL) || '';
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // 캐시는 "오늘 이 감정으로 받은 문구" 하나만 남긴다. 날짜가 바뀌면 통째로 버린다.
  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return c && c.date === todayKey() ? c : { date: todayKey(), byEmotion: {} };
    } catch (e) {
      return { date: todayKey(), byEmotion: {} };
    }
  }
  function saveCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* 저장 실패는 무시 */ }
  }

  function timeBand() {
    const h = new Date().getHours();
    if (h < 6) return '새벽';
    if (h < 12) return '아침';
    if (h < 18) return '낮';
    if (h < 22) return '저녁';
    return '밤';
  }

  function buildPrompts(label, count) {
    const systemPrompt = [
      '너는 한국 앱 "맘운자로"에서 마음에 주사를 놓은 직후에 뜨는 한 문장을 쓴다.',
      '문체: 다정한 존댓말. 예: "너무 애쓰지 않아도 돼요", "잘 버텨온 하루, 이제 좀 쉬어도 돼요".',
      '규칙: 정확히 한 문장. 35자 이내. 따옴표·이모지·줄바꿈·마침표 없이 문장만 쓴다.',
      '위로하되 가르치려 들지 않는다. 조언·해결책·질문을 하지 않는다.',
      '의학적·심리학적 진단명은 절대 쓰지 않는다.',
      '"당신"이라는 단어는 쓰지 않는다.',
    ].join(' ');
    const userPrompt = [
      `지금 시간대: ${timeBand()}`,
      `방금 처방한 감정: ${label}`,
      count > 1 ? `오늘 ${count}번째 주사입니다` : '오늘 첫 주사입니다',
    ].join('\n');
    return { systemPrompt, userPrompt };
  }

  // 모델이 지시를 어겨도 화면이 깨지지 않게 여기서 한 번 더 다듬는다.
  function sanitize(raw) {
    if (typeof raw !== 'string') return '';
    let s = raw.replace(/\s+/g, ' ').trim();
    s = s.replace(/^["'「『]|["'」』]$/g, '');
    s = s.split(/(?<=[.!?])\s/)[0];           // 여러 문장이 오면 첫 문장만
    s = s.replace(/[.]+$/, '').trim();
    if (s.length > 40) return '';              // 너무 길면 기본 문구를 그대로 둔다
    if (!s) return '';
    return s;
  }

  function applyText(text) {
    // 모델이 만든 문자열을 그대로 innerHTML에 넣지 않는다. 먼저 이스케이프한 뒤
    // 공백만 &nbsp;로 바꾼다(app.js가 줄바꿈을 막으려고 쓰는 방식과 동일).
    const div = document.createElement('div');
    div.textContent = text;
    const safe = div.innerHTML.replace(/ /g, '&nbsp;');

    // app.js가 넣어둔 부제(😣 스트레스 3mg 처방 완료)는 살리고 첫 줄만 바꾼다.
    const sub = healingText.querySelector('.healing-subtext');
    healingText.innerHTML = safe;
    if (sub) healingText.appendChild(sub);
  }

  function fetchLine(label, count) {
    const url = proxyUrl();
    if (!url) return Promise.reject(new Error('no proxy'));
    const { systemPrompt, userPrompt } = buildPrompts(label, count);

    // AbortController로 직접 끊는다. 오버레이가 닫힌 뒤 도착하는 응답은 쓸모가 없다.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userPrompt }),
      signal: ac.signal,
    })
      .then((r) => { if (!r.ok) throw new Error('proxy error'); return r.json(); })
      .then((d) => {
        const line = sanitize(d && d.answer);
        if (!line) throw new Error('empty');
        return line;
      })
      .finally(() => clearTimeout(timer));
  }

  document.addEventListener('maumjaro:emotion-injected', (ev) => {
    const key = ev && ev.detail && ev.detail.key;
    if (!key) return;

    const Core = window.MaumjaroCore;
    const sym = Core && Core.SYMPTOMS && Core.SYMPTOMS[key];
    const label = (sym && sym.label) || '마음';

    // 이 주사에 해당하는 오버레이가 닫히면 더 이상 손대지 않는다.
    const openedAt = Date.now();
    const stillShowing = () => healingOverlay.classList.contains('show')
      && Date.now() - openedAt < HEAL_OVERLAY_MS;

    const cache = loadCache();
    const hit = cache.byEmotion[key];
    if (hit) {
      // 이미 받아둔 문구가 있으면 네트워크를 타지 않는다.
      setTimeout(() => { if (stillShowing()) applyText(hit); }, 60);
      return;
    }

    const count = (cache.counts && cache.counts[key] ? cache.counts[key] : 0) + 1;
    cache.counts = cache.counts || {};
    cache.counts[key] = count;
    saveCache(cache);

    fetchLine(label, count)
      .then((line) => {
        const c = loadCache();
        c.byEmotion[key] = line;
        saveCache(c);
        if (stillShowing()) applyText(line);
        if (window.MaumjaroGame && typeof window.MaumjaroGame.track === 'function') {
          window.MaumjaroGame.track('heal_ai_line_shown', { emotion: key });
        }
      })
      .catch(() => { /* 기본 문구가 이미 떠 있다. 아무것도 하지 않는다. */ });
  });
})();
