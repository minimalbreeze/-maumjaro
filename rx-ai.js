// 맘운자로 — 오늘의 처방 AI 해설 (rx-ai.js)
//
// 오늘의 처방은 이제 사람마다 다르게 뽑힌다(prescriptions.js의 personalSalt).
// 여기서는 그 처방이 "왜 오늘 나한테 왔는지"를 사주·별자리·띠·오늘의 운세를 묶어
// 한 줄로 설명해 붙인다. 처방 자체를 AI가 고르지는 않는다 — 고르는 건 결정론적이어야
// 같은 날 다시 들어와도 같은 처방이 나오고, 프록시가 죽어도 앱이 멀쩡하다.
//
// 규칙:
//  - 실패하면 아무것도 안 붙이고 조용히 끝낸다(heal-ai.js와 같은 원칙).
//  - 하루에 한 번만 호출하고 localStorage에 캐시한다(비용 상한).
//  - app.js / prescriptions.js는 건드리지 않는다.
(() => {
  'use strict';

  const CACHE_KEY = 'maumjaro:rxAiCache';
  const CARD_ID = 'today-rx-card';
  const TIMEOUT_MS = 4000;

  function proxyUrl() {
    return (window.MaumjaroFortune && window.MaumjaroFortune.AI_PROXY_URL) || '';
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }

  function loadCache() { return readJson(CACHE_KEY) || {}; }
  function saveCache(obj) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) { /* 저장 실패는 무시 */ }
  }

  // 별자리 판정은 zodiac-data.js의 경계표를 그대로 쓴다(두 군데서 다르게 계산하면 어긋난다).
  function zodiacOf(profile) {
    const Z = window.MAUMJARO_ZODIAC_DATA;
    if (!Z || !profile || !profile.birthDate) return null;
    const parts = profile.birthDate.split('-').map(Number);
    const m = parts[1];
    const d = parts[2];
    let key = 'capricorn';
    Z.ZODIAC_CUTOFFS.forEach((c) => {
      if (m > c[0] || (m === c[0] && d >= c[1])) key = c[2];
    });
    return Z.ZODIAC_SIGNS.find((s) => s.key === key) || null;
  }

  function animalOf(chart) {
    const Z = window.MAUMJARO_ZODIAC_DATA;
    if (!Z || !chart || !chart.pillars || !chart.pillars.year) return null;
    return Z.CHINESE_ZODIAC.find((z) => z.zhi === chart.pillars.year.zhi) || null;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function render(text) {
    const card = document.getElementById(CARD_ID);
    if (!card || card.hidden) return;
    let line = document.getElementById('today-rx-ai');
    if (!line) {
      line = document.createElement('p');
      line.id = 'today-rx-ai';
      line.className = 'today-rx-ai';
      card.insertAdjacentElement('afterend', line);
    }
    line.innerHTML = `<span class="today-rx-ai-tag">AI 풀이</span>${escapeHtml(text)}`;
  }

  function buildPrompt(profile, chart, rxTitle, rxDiagnosis) {
    const sign = zodiacOf(profile);
    const animal = animalOf(chart);
    const bits = [];
    if (sign) bits.push(`별자리: ${sign.name}(${sign.trait})`);
    if (animal) bits.push(`띠: ${animal.name}(${animal.trait})`);
    if (chart && chart.dayMasterElement) bits.push(`사주 일간 오행: ${chart.dayMasterElement}`);
    if (!bits.length) return null;

    const systemPrompt = [
      '너는 한국 앱 "맘운자로"의 처방 해설자다.',
      '사용자의 별자리·띠·사주 오행과 오늘 뽑힌 "마음 처방"을 엮어 한 문장으로 풀어준다.',
      '문체: 상냥한 존댓말, 가볍고 다정한 톤. 45자 이내 한 문장. 따옴표나 이모지는 쓰지 않는다.',
      '의학적·심리학적 진단명은 쓰지 않는다. 불안을 조장하지 않는다.',
      '"오늘 당신에게 이 처방이 온 이유"를 말하듯 쓴다.',
    ].join('\n');

    const userPrompt = [
      `오늘 날짜: ${todayKey()}`,
      bits.join(' / '),
      `오늘 뽑힌 처방: ${rxTitle} (${rxDiagnosis})`,
      '위 정보를 엮어 한 문장으로 설명해줘.',
    ].join('\n');

    return { systemPrompt, userPrompt };
  }

  function run() {
    const card = document.getElementById(CARD_ID);
    if (!card || card.hidden) return;
    const rxTitle = (document.getElementById('today-rx-title') || {}).textContent || '';
    const rxDiagnosis = (document.getElementById('today-rx-diagnosis') || {}).textContent || '';
    if (!rxTitle) return;

    const profile = readJson('maumjaro:sajuProfile');
    const chart = readJson('maumjaro:sajuChart');
    // 프로필이 없으면 풀이할 재료가 없다 — 조용히 아무것도 안 붙인다.
    if (!profile) return;

    // 같은 날 같은 처방이면 캐시를 그대로 쓴다(하루 한 번만 호출).
    const cacheId = `${todayKey()}|${rxTitle}`;
    const cache = loadCache();
    if (cache.id === cacheId && cache.text) { render(cache.text); return; }

    const url = proxyUrl();
    if (!url) return;
    const prompt = buildPrompt(profile, chart, rxTitle, rxDiagnosis);
    if (!prompt) return;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt),
      signal: ctrl.signal,
    })
      .then((r) => { if (!r.ok) throw new Error('proxy error'); return r.json(); })
      .then((data) => {
        clearTimeout(timer);
        const text = data && data.answer ? String(data.answer).trim().replace(/^["'"']|["'"']$/g, '') : '';
        if (!text) return;
        saveCache({ id: cacheId, text });
        render(text);
      })
      .catch(() => { clearTimeout(timer); /* 실패하면 그냥 없던 일로 */ });
  }

  // 카드는 prescriptions.js가 채운 뒤 hidden을 푼다. 언제 끝날지 모르니 잠깐 지켜본다.
  function watch() {
    const card = document.getElementById(CARD_ID);
    if (!card) return;
    if (!card.hidden) { run(); return; }
    const obs = new MutationObserver(() => {
      if (!card.hidden) { obs.disconnect(); run(); }
    });
    obs.observe(card, { attributes: true, attributeFilter: ['hidden'] });
    setTimeout(() => obs.disconnect(), 8000); // 안 뜨면 그냥 포기한다
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
