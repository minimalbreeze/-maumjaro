(() => {
  'use strict';

  const Core = window.MaumjaroCore;
  const { RX_CATEGORIES, PRESCRIPTIONS_SEED } = window.MAUMJARO_RX_DATA;

  // ---------- DOM refs (다른 모든 코드보다 먼저 선언 — TDZ 방지) ----------
  const appEl = document.getElementById('app');
  const actionBtn = document.getElementById('action-btn');
  const syringeSvg = document.getElementById('syringe-svg');
  const plungerRod = document.getElementById('plunger-rod');
  const plungerHead = document.getElementById('plunger-head');
  const liquid = document.getElementById('liquid');
  const droplet = document.getElementById('droplet');

  const todayRxCard = document.getElementById('today-rx-card');
  const todayRxEmoji = document.getElementById('today-rx-emoji');
  const todayRxTitle = document.getElementById('today-rx-title');
  const todayRxDiagnosis = document.getElementById('today-rx-diagnosis');
  const todayRxBtn = document.getElementById('today-rx-btn');

  const rxResultOverlay = document.getElementById('rx-result-overlay');
  const rxResultEmoji = document.getElementById('rx-result-emoji');
  const rxResultTitle = document.getElementById('rx-result-title');
  const rxResultDiagnosis = document.getElementById('rx-result-diagnosis');
  const rxStat1Label = document.getElementById('rx-stat1-label');
  const rxStat1Fill = document.getElementById('rx-stat1-fill');
  const rxStat1Value = document.getElementById('rx-stat1-value');
  const rxStat2Label = document.getElementById('rx-stat2-label');
  const rxStat2Fill = document.getElementById('rx-stat2-fill');
  const rxStat2Value = document.getElementById('rx-stat2-value');
  const rxResultSideeffect = document.getElementById('rx-result-sideeffect');
  const rxCtaSlip = document.getElementById('rx-cta-slip');
  const rxCtaFriend = document.getElementById('rx-cta-friend');
  const rxCtaAnother = document.getElementById('rx-cta-another');

  const RX_LS_KEY = 'maumjaro:rxRecords';
  const RX_SCHEMA_KEY = 'maumjaro:rxSchemaVersion';
  if (!localStorage.getItem(RX_SCHEMA_KEY)) localStorage.setItem(RX_SCHEMA_KEY, '1');

  // ---------- rx record storage (separate key, never touches maumjaro:records) ----------
  function loadRxRecords() {
    try {
      const raw = localStorage.getItem(RX_LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function recordRx({ prescriptionId, category, ts }) {
    const list = loadRxRecords();
    list.push({ id: `rx_${ts}_${Math.random().toString(36).slice(2, 8)}`, prescriptionId, category, ts });
    localStorage.setItem(RX_LS_KEY, JSON.stringify(list));
  }
  // 감정 처방은 app.js가 기존 방식대로 completeInjection()에서 처리하고,
  // 완료 시 이 이벤트만 추가로 쏴준다 (app.js 로직 자체는 무변경).
  document.addEventListener('maumjaro:emotion-injected', (e) => {
    const { key, ts } = e.detail || {};
    if (!key) return;
    recordRx({ prescriptionId: `emotion-${key}`, category: 'emotion', ts });
  });

  // ---------- emotion -> Prescription 어댑터 (SYMPTOMS 원본은 건드리지 않음) ----------
  function buildEmotionPrescriptions() {
    return Object.entries(Core.SYMPTOMS).map(([key, s]) => ({
      id: `emotion-${key}`,
      category: 'emotion',
      title: `${s.label} 처방`,
      diagnosis: `${s.label} ${s.mg}`,
      symptom: s.caption,
      prescription: s.messages[0],
      sideEffect: '개인차가 있을 수 있어요',
      warning: '실제 의약품이 아닙니다',
      emoji: s.emoji,
      color: s.color,
      rarity: 'common',
      shareText: `오늘 ${s.label} 처방 받았어요 ${s.emoji}`,
      isPremium: false,
      _legacyKey: key,
    }));
  }

  const ALL_PRESCRIPTIONS = [...buildEmotionPrescriptions(), ...PRESCRIPTIONS_SEED];

  function getCategoryMeta(id) {
    return RX_CATEGORIES.find((c) => c.id === id) || null;
  }

  // ---------- 처방 결과 화면: 카테고리별 스탯 문구 + id 기반 결정론적 % ----------
  const STAT_TEMPLATES = {
    emotion: ['마음 안정도', '오늘 하루 컨디션'],
    work: ['업무 의욕', '퇴근까지 생존 확률'],
    love: ['마음 진정도', '오늘의 평온함'],
    money: ['지출 자제력', '통장 회복력'],
    food: ['식욕 만족도', '참을성 게이지'],
    daily: ['움직일 힘', '오늘 하루 완주율'],
    travel: ['탈출 욕구 해소도', '설렘 지수'],
    default: ['회복도', '오늘의 컨디션'],
  };
  function statPercent(id, salt) {
    return 40 + (hashStr(`${id}:${salt}`) % 41); // 40~80%
  }

  // ---------- 처방 결과 화면 렌더 ----------
  function showResultScreen(p) {
    const [stat1Label, stat2Label] = STAT_TEMPLATES[p.category] || STAT_TEMPLATES.default;
    const stat1 = statPercent(p.id, 1);
    const stat2 = statPercent(p.id, 2);

    rxResultEmoji.textContent = p.emoji;
    rxResultTitle.textContent = p.title;
    rxResultDiagnosis.textContent = p.diagnosis;
    rxStat1Label.textContent = stat1Label;
    rxStat1Value.textContent = `${stat1}%`;
    rxStat2Label.textContent = stat2Label;
    rxStat2Value.textContent = `${stat2}%`;
    rxResultSideeffect.textContent = `오늘의 부작용: ${p.sideEffect}`;

    rxResultOverlay.classList.add('show');
    // 바 애니메이션을 위해 한 프레임 뒤에 width를 채운다 (0% -> 실제값 트랜지션)
    rxStat1Fill.style.width = '0%';
    rxStat2Fill.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rxStat1Fill.style.width = `${stat1}%`;
        rxStat2Fill.style.width = `${stat2}%`;
      });
    });

    rxCtaSlip.onclick = () => Core.showToast('처방전 발급 기능은 곧 추가돼요 📝');
    rxCtaFriend.onclick = () => Core.showToast('친구에게 처방하기는 곧 추가돼요 💌');
    rxCtaAnother.onclick = () => Core.showToast('다른 처방 뽑기는 곧 추가돼요 🎰');
  }
  function closeResultScreen() {
    rxResultOverlay.classList.remove('show');
  }
  rxResultOverlay.addEventListener('click', (e) => {
    if (e.target === rxResultOverlay) closeResultScreen();
  });

  // ---------- 오늘의 처방: 날짜 시드 결정론적 선택 ----------
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
  function pickTodaysPrescription() {
    const idx = hashStr(todayKey()) % ALL_PRESCRIPTIONS.length;
    return ALL_PRESCRIPTIONS[idx];
  }

  // ---------- syringe geometry (index.html의 SVG와 동일한 값, app.js와 독립적으로 유지) ----------
  const HEAD_Y_IDLE = 104;
  const HEAD_Y_READY = 246;
  const HEAD_H = 16;
  const LIQUID_TOP = 106;
  const ROD_BOTTOM = 336;

  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeInCubic(t) { return t * t * t; }

  function tween(duration, easingFn, onUpdate, onDone) {
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      onUpdate(easingFn(t));
      if (t < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  function setSyringeByHeadY(headY) {
    const liquidHeight = Math.max(0, headY - LIQUID_TOP);
    plungerHead.setAttribute('y', headY);
    liquid.setAttribute('y', LIQUID_TOP);
    liquid.setAttribute('height', liquidHeight);
    plungerRod.setAttribute('y', headY + HEAD_H);
    plungerRod.setAttribute('height', Math.max(0, ROD_BOTTOM - (headY + HEAD_H)));
  }

  // ---------- 다른 플로우와의 상호 배제 ----------
  function appHasOtherFlowActive() {
    return appEl.classList.contains('state-preparing')
      || appEl.classList.contains('state-ready')
      || appEl.classList.contains('state-injecting');
  }

  let genericState = 'idle'; // idle | preparing | ready | injecting
  let currentGeneric = null;

  new MutationObserver(() => {
    todayRxBtn.disabled = genericState !== 'idle' || appHasOtherFlowActive();
  }).observe(appEl, { attributes: true, attributeFilter: ['class'] });

  // ---------- 일반(비감정) 처방 실행 ----------
  function startGenericPrepare(prescription) {
    if (genericState !== 'idle' || appHasOtherFlowActive()) return;
    currentGeneric = prescription;
    genericState = 'preparing';
    actionBtn.disabled = true;
    todayRxBtn.disabled = true;
    todayRxBtn.textContent = '준비 중...';
    appEl.classList.add('state-preparing');

    tween(1300, easeInOutCubic, (t) => {
      setSyringeByHeadY(HEAD_Y_IDLE + (HEAD_Y_READY - HEAD_Y_IDLE) * t);
    }, () => {
      genericState = 'ready';
      appEl.classList.remove('state-preparing');
      appEl.classList.add('state-ready');
      todayRxBtn.disabled = false;
      todayRxBtn.textContent = '주사 놓기';
    });
  }

  function startGenericInject() {
    if (genericState !== 'ready') return;
    genericState = 'injecting';
    appEl.classList.remove('state-ready');
    appEl.classList.add('state-injecting');
    todayRxBtn.disabled = true;
    todayRxBtn.textContent = '주사 중...';

    let dropletTriggered = false;
    tween(1100, easeInCubic, (t) => {
      setSyringeByHeadY(HEAD_Y_READY + (HEAD_Y_IDLE - HEAD_Y_READY) * t);
      if (t > 0.75 && !dropletTriggered) {
        dropletTriggered = true;
        droplet.setAttribute('r', 4.5);
        droplet.style.opacity = '1';
      }
    }, () => {
      appEl.classList.remove('state-injecting');
      setTimeout(() => {
        droplet.setAttribute('r', 0);
        droplet.style.opacity = '0';
      }, 250);
      completeGenericInjection();
    });
  }

  function completeGenericInjection() {
    const p = currentGeneric;
    const now = Date.now();
    recordRx({ prescriptionId: p.id, category: p.category, ts: now });

    showResultScreen(p);

    genericState = 'idle';
    currentGeneric = null;
    actionBtn.disabled = false;
    todayRxBtn.disabled = appHasOtherFlowActive();
    todayRxBtn.textContent = '처방받기';
  }

  // ---------- 일반 처방용 모션 제스처 (app.js의 감정 플로우와 독립적인 리스너) ----------
  const GENERIC_MOTION_THRESHOLD = 28;
  const GENERIC_MOTION_COOLDOWN_MS = 1500;
  let lastGenericMotionTs = 0;
  window.addEventListener('devicemotion', (e) => {
    if (genericState !== 'ready') return;
    const acc = (e.acceleration && e.acceleration.x !== null) ? e.acceleration : e.accelerationIncludingGravity;
    if (!acc || acc.x === null || acc.x === undefined) return;
    const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
    const now = performance.now();
    if (mag > GENERIC_MOTION_THRESHOLD && now - lastGenericMotionTs > GENERIC_MOTION_COOLDOWN_MS) {
      lastGenericMotionTs = now;
      if (navigator.vibrate) navigator.vibrate(40);
      startGenericInject();
    }
  });

  // ---------- 오늘의 처방 카드 렌더 + 버튼 동작 ----------
  function renderTodayCard() {
    const p = pickTodaysPrescription();
    todayRxEmoji.textContent = p.emoji;
    todayRxTitle.textContent = p.title;
    todayRxDiagnosis.textContent = p.diagnosis;
    todayRxCard.hidden = false;

    todayRxBtn.onclick = () => {
      if (genericState !== 'idle' || appHasOtherFlowActive()) {
        Core.showToast('지금 다른 처방이 진행 중이에요');
        return;
      }
      Core.requestMotionPermission();
      if (p.category === 'emotion') {
        Core.launchEmotionFlow(p._legacyKey);
      } else {
        if (todayRxBtn.textContent === '주사 놓기') {
          startGenericInject();
        } else {
          startGenericPrepare(p);
        }
      }
    };
  }

  renderTodayCard();
})();
