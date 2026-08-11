(() => {
  'use strict';

  const Core = window.MaumjaroCore;
  const { RX_CATEGORIES, PRESCRIPTIONS_SEED } = window.MAUMJARO_RX_DATA;

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

  // ---------- DOM refs ----------
  const appEl = document.getElementById('app');
  const actionBtn = document.getElementById('action-btn');
  const syringeSvg = document.getElementById('syringe-svg');
  const plungerRod = document.getElementById('plunger-rod');
  const plungerHead = document.getElementById('plunger-head');
  const liquid = document.getElementById('liquid');
  const droplet = document.getElementById('droplet');
  const healingOverlay = document.getElementById('healing-overlay');
  const healingParticles = document.getElementById('healing-particles');
  const healingText = document.getElementById('healing-text');

  const todayRxCard = document.getElementById('today-rx-card');
  const todayRxEmoji = document.getElementById('today-rx-emoji');
  const todayRxTitle = document.getElementById('today-rx-title');
  const todayRxDiagnosis = document.getElementById('today-rx-diagnosis');
  const todayRxBtn = document.getElementById('today-rx-btn');

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

  function spawnParticles() {
    healingParticles.innerHTML = '';
    const count = 16;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 160;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 40;
      p.style.setProperty('--dx', `${dx}px`);
      p.style.setProperty('--dy', `${dy}px`);
      p.style.left = `calc(50% + ${(Math.random() - 0.5) * 40}px)`;
      p.style.animationDelay = `${Math.random() * 0.4}s`;
      healingParticles.appendChild(p);
    }
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

    healingText.innerHTML = `${p.emoji} ${p.title}<span class="healing-subtext">${p.prescription}</span>`;
    spawnParticles();
    healingOverlay.classList.add('show');
    setTimeout(() => {
      healingOverlay.classList.remove('show');
      healingParticles.innerHTML = '';
    }, 3700);

    Core.showToast(`오늘의 처방 "${p.title}" 완료`);

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
