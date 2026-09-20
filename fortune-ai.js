// 맘운자로 — 오늘의 운세 AI 풀이 (fortune-ai.js)
//
// 오늘의 운세는 사주(일간 오행)와 날짜로 결정론적으로 뽑힌다. 재고를 늘리고 가방
// 방식으로 바꿔서 "어제와 같은 글"은 없어졌지만, 결국 미리 써둔 문장 중 하나다.
// 여기서는 그 결과들을 한데 엮어 "오늘 왜 이런 흐름인지"를 그날 그 사람에게 맞춰
// 한 문단으로 풀어 붙인다.
//
// 뽑는 일은 여전히 AI가 하지 않는다. 고르는 쪽이 결정론이어야
//   - 같은 날 다시 들어와도 같은 운세가 나오고,
//   - 프록시가 죽어도 화면이 멀쩡하다.
// AI는 이미 정해진 결과를 설명하는 역할만 맡는다(rx-ai.js와 같은 원칙).
//
// 규칙:
//  - 실패하면 아무것도 안 붙이고 조용히 끝낸다.
//  - 하루에 한 번만 호출하고 localStorage에 캐시한다(비용 상한).
//  - fortune.js는 건드리지 않는다 — 화면이 그려진 걸 DOM으로 알아채고 붙인다.
(() => {
  'use strict';

  const CACHE_KEY = 'maumjaro:fortuneAiCache';
  const LINE_ID = 'fortune-daily-ai';
  const TIMEOUT_MS = 5000;

  function proxyUrl() {
    return (window.MaumjaroFortune && window.MaumjaroFortune.AI_PROXY_URL) || '';
  }

  // fortune.js의 dateKeyOf와 같은 규칙(로컬 날짜). UTC를 쓰면 한국에서 하루가
  // 자정이 아니라 오전 9시에 바뀌어 운세 본문과 캐시가 어긋난다.
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function saveCache(obj) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) { /* 저장 실패는 무시 */ }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- 화면에서 오늘의 결과를 읽어온다 ----------
  // fortune.js가 그린 것을 그대로 읽는다. 여기서 다시 계산하면 두 곳이 어긋날 수 있다.
  function readScreen(root) {
    const q = (sel) => {
      const el = root.querySelector(sel);
      return el ? el.textContent.trim() : '';
    };
    const title = q('.rx-detail-title');
    if (!/오늘의 전체운/.test(title)) return null;

    const cats = [...root.querySelectorAll('.rx-custom-preview')].map((box) => {
      const key = box.querySelector('.rx-slip-key');
      const val = box.querySelector('.rx-slip-value');
      const quip = box.querySelector('.rx-slip-text');
      if (!key || !val) return null;
      return {
        label: key.textContent.trim(),
        stars: val.textContent.trim(),
        quip: quip ? quip.textContent.trim() : '',
      };
    }).filter(Boolean);

    return {
      title: title.replace(/^오늘의 전체운\s*·\s*/, ''),
      diagnosis: q('.rx-detail-diagnosis'),
      advice: q('.rx-detail-symptom'),
      cats,
    };
  }

  function render(root, text) {
    const anchor = root.querySelector('.rx-detail-card');
    if (!anchor) return;
    let line = document.getElementById(LINE_ID);
    if (!line) {
      line = document.createElement('p');
      line.id = LINE_ID;
      line.className = 'today-rx-ai';
      anchor.insertAdjacentElement('afterend', line);
    }
    line.innerHTML = `<span class="today-rx-ai-tag">AI 풀이</span>${escapeHtml(text)}`;
  }

  function buildPrompt(chart, screen) {
    const bits = [];
    if (chart && chart.dayMasterElement) bits.push(`사주 일간 오행: ${chart.dayMasterElement}`);
    if (chart && chart.pillars && chart.pillars.day) {
      bits.push(`일주: ${chart.pillars.day.gan}${chart.pillars.day.zhi}`);
    }
    // 사주가 없으면 "사람에 맞춘 풀이"가 성립하지 않는다 — 붙이지 않는다.
    if (!bits.length) return null;

    const systemPrompt = [
      '너는 한국 앱 "맘운자로"의 오늘의 운세 해설자다.',
      '이미 정해진 오늘의 운세 결과를 읽고, 그 사람에게 오늘이 어떤 하루인지 풀어준다.',
      '문체: 상냥한 존댓말, 담백하고 다정한 톤. 두세 문장, 전체 120자 이내.',
      '따옴표와 이모지는 쓰지 않는다. 항목을 나열하지 말고 하나의 흐름으로 이어서 말한다.',
      '주어진 결과와 어긋나는 말은 하지 않는다. 별점이 낮은 항목을 좋게 포장하지 않는다.',
      '의학적·심리학적 진단명은 쓰지 않는다. 불안을 조장하거나 겁을 주지 않는다.',
      '돈·건강·합격 같은 것을 단정해서 예언하지 않는다. 오늘의 결을 말하고 작은 행동 하나를 권한다.',
      '"요즘 상태"가 주어지고 자연스럽게 어울릴 때만 그 결을 반영한다. 억지로 넣지 않는다.',
    ].join('\n');

    const catLines = screen.cats
      .map((c) => `- ${c.label} ${c.stars}: ${c.quip}`)
      .join('\n');

    const ctx = window.MaumjaroAiContext ? window.MaumjaroAiContext.contextBlock() : '';
    const userPrompt = [
      `오늘 날짜: ${todayKey()}`,
      bits.join(' / '),
      `오늘의 전체운: ${screen.title} (${screen.diagnosis})`,
      screen.advice ? `조언: ${screen.advice}` : '',
      catLines ? `세부 운세:\n${catLines}` : '',
      ctx ? `요즘 상태:\n${ctx}` : '',
      '위 결과를 엮어 오늘 하루를 두세 문장으로 풀어줘.',
    ].filter(Boolean).join('\n');

    return { systemPrompt, userPrompt };
  }

  function sanitize(raw) {
    if (typeof raw !== 'string') return '';
    let s = raw.replace(/\r/g, '').trim();
    s = s.replace(/^["'「『]|["'」』]$/g, '');
    s = s.replace(/\s*\n+\s*/g, ' ').trim();
    // 너무 길면 화면을 밀어낸다. 모델이 길게 쓴 날은 미리 써둔 문장만 남긴다.
    if (!s || s.length > 200) return '';
    return s;
  }

  let running = false;

  function run(root) {
    if (running) return;
    const screen = readScreen(root);
    if (!screen) return;

    const chart = readJson('maumjaro:sajuChart');
    if (!chart) return;

    // 같은 날 같은 전체운이면 캐시를 그대로 쓴다(하루 한 번만 호출).
    const cacheId = `${todayKey()}|${screen.title}`;
    const cache = readJson(CACHE_KEY);
    if (cache && cache.id === cacheId && cache.text) { render(root, cache.text); return; }

    const url = proxyUrl();
    if (!url) return;
    const prompt = buildPrompt(chart, screen);
    if (!prompt) return;

    running = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 두세 문장이면 충분하다. 온도는 조금 올려 매일 같은 결로 읽히지 않게 한다.
      body: JSON.stringify(Object.assign({ maxTokens: 260, temperature: 0.95 }, prompt)),
      signal: ctrl.signal,
    })
      .then((r) => { if (!r.ok) throw new Error('proxy error'); return r.json(); })
      .then((data) => {
        clearTimeout(timer);
        running = false;
        const text = sanitize(data && data.answer);
        if (!text) return;
        saveCache({ id: cacheId, text });
        render(root, text);
      })
      .catch(() => { clearTimeout(timer); running = false; /* 실패하면 그냥 없던 일로 */ });
  }

  // 운세 상세는 가챠 연출이 끝난 뒤 fortune-content 안에 그려진다. 언제 끝날지
  // 모르므로 컨테이너를 지켜보다가 전체운 카드가 나타나면 붙인다.
  function watch() {
    const root = document.getElementById('fortune-content');
    if (!root) return;
    run(root);
    const obs = new MutationObserver(() => {
      // 화면이 다시 그려지면 이전에 붙인 문단은 함께 지워진다 — 다시 붙인다.
      if (!document.getElementById(LINE_ID)) run(root);
    });
    obs.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
