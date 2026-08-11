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

  const rxSlipOverlay = document.getElementById('rx-slip-overlay');
  const rxSlipPatient = document.getElementById('rx-slip-patient');
  const rxSlipDiagnosis = document.getElementById('rx-slip-diagnosis');
  const rxSlipPrescription = document.getElementById('rx-slip-prescription');
  const rxSlipWarning = document.getElementById('rx-slip-warning');
  const rxSlipDate = document.getElementById('rx-slip-date');
  const rxSlipContent = document.getElementById('rx-slip-content');
  const rxSlipSaveBtn = document.getElementById('rx-slip-save');
  const rxSlipCloseBtn = document.getElementById('rx-slip-close');

  const rxFriendOverlay = document.getElementById('rx-friend-overlay');
  const rxFriendGrid = document.getElementById('rx-friend-grid');
  const rxFriendResult = document.getElementById('rx-friend-result');
  const rxFriendShareText = document.getElementById('rx-friend-share-text');
  const rxFriendLink = document.getElementById('rx-friend-link');
  const rxFriendCloseBtn = document.getElementById('rx-friend-close');
  const rxFriendShareBtn = document.getElementById('rx-friend-share-btn');

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
  function showResultScreen(p, ts) {
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

    rxCtaSlip.onclick = () => {
      closeResultScreen();
      showSlipScreen(p, ts);
    };
    rxCtaFriend.onclick = () => {
      closeResultScreen();
      openFriendPicker();
    };
    rxCtaAnother.onclick = () => {
      closeResultScreen();
      runRandomPrescription();
    };
  }
  function closeResultScreen() {
    rxResultOverlay.classList.remove('show');
  }
  rxResultOverlay.addEventListener('click', (e) => {
    if (e.target === rxResultOverlay) closeResultScreen();
  });

  // ---------- 처방전 (공유 슬립) ----------
  function formatSlipDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }
  function getPatientName() {
    const name = (localStorage.getItem('maumjaro:username') || '').trim();
    return name ? `${name}님` : '오늘의 나';
  }
  function showSlipScreen(p, ts) {
    rxSlipPatient.textContent = getPatientName();
    rxSlipDiagnosis.textContent = p.diagnosis;
    rxSlipPrescription.textContent = p.prescription;
    rxSlipWarning.textContent = p.warning;
    rxSlipDate.textContent = formatSlipDate(ts || Date.now());
    rxSlipOverlay.classList.add('show');
  }
  function closeSlipScreen() {
    rxSlipOverlay.classList.remove('show');
  }
  rxSlipOverlay.addEventListener('click', (e) => {
    if (e.target === rxSlipOverlay) closeSlipScreen();
  });
  rxSlipCloseBtn.addEventListener('click', closeSlipScreen);

  function saveSlipAsImage() {
    if (typeof window.html2canvas !== 'function') {
      Core.showToast('이미지 저장을 사용할 수 없어요. 화면을 캡처해주세요');
      return;
    }
    rxSlipSaveBtn.disabled = true;
    const originalLabel = rxSlipSaveBtn.textContent;
    rxSlipSaveBtn.textContent = '저장 중...';
    window.html2canvas(rxSlipContent, { backgroundColor: '#fffdf9', scale: 2 }).then((canvas) => {
      const link = document.createElement('a');
      link.download = `맘운자로_처방전_${formatSlipDate(Date.now())}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      Core.showToast('처방전 이미지를 저장했어요 🖼️');
    }).catch(() => {
      Core.showToast('이미지 저장에 실패했어요. 화면을 캡처해주세요');
    }).finally(() => {
      rxSlipSaveBtn.disabled = false;
      rxSlipSaveBtn.textContent = originalLabel;
    });
  }
  rxSlipSaveBtn.addEventListener('click', saveSlipAsImage);

  // ---------- 친구에게 처방하기 ----------
  function buildShareUrl(prescriptionId) {
    return `${location.origin}${location.pathname}?rx=${encodeURIComponent(prescriptionId)}`;
  }
  function pickRandomFromCategory(catId) {
    const pool = catId === 'random' ? ALL_PRESCRIPTIONS : ALL_PRESCRIPTIONS.filter((p) => p.category === catId);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---------- 공유(Web Share API 우선, 실패 시 클립보드 폴백) ----------
  let pickedShareText = '';
  let pickedShareUrl = '';
  async function shareOrCopy(text, url) {
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // 사용자가 공유 시트를 취소함
        // 그 외 실패는 클립보드 폴백으로 계속 진행
      }
    }
    const fullText = `${text}\n${url}`;
    try {
      await navigator.clipboard.writeText(fullText);
      Core.showToast('링크를 복사했어요 📋');
    } catch (e) {
      Core.showToast('복사에 실패했어요. 직접 선택해서 복사해주세요');
    }
  }
  rxFriendShareBtn.addEventListener('click', () => shareOrCopy(pickedShareText, pickedShareUrl));

  function openFriendPicker() {
    rxFriendResult.hidden = true;
    const chipCats = RX_CATEGORIES.filter((c) => c.id === 'random' || rxCategoryCount(c.id) > 0);
    rxFriendGrid.innerHTML = chipCats.map((c) => `
      <button class="rx-friend-chip" type="button" data-cat="${c.id}">
        <span class="emoji">${c.emoji}</span>
        <span>${c.label}</span>
      </button>`).join('');
    rxFriendGrid.querySelectorAll('.rx-friend-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const p = pickRandomFromCategory(chip.dataset.cat);
        if (!p) { Core.showToast('처방을 찾지 못했어요'); return; }
        pickedShareText = p.shareText;
        pickedShareUrl = buildShareUrl(p.id);
        rxFriendShareText.textContent = pickedShareText;
        rxFriendLink.textContent = pickedShareUrl;
        rxFriendResult.hidden = false;
      });
    });
    rxFriendOverlay.classList.add('show');
  }
  function closeFriendPicker() {
    rxFriendOverlay.classList.remove('show');
  }
  rxFriendOverlay.addEventListener('click', (e) => {
    if (e.target === rxFriendOverlay) closeFriendPicker();
  });
  rxFriendCloseBtn.addEventListener('click', closeFriendPicker);

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
  // null = 어떤 버튼도 "일반 처방 플로우"를 소유하고 있지 않음(감정 플로우 중이거나 완전 유휴).
  // 일반 플로우를 시작시킨 버튼만 이 값을 가지며, 그 버튼의 disabled/텍스트는
  // startGenericPrepare/Inject/complete가 직접 관리한다(관찰자와의 레이스 방지).
  let activeTriggerBtn = null;

  // "activeTriggerBtn이 아닌" 트리거 버튼만 동기화한다.
  function syncOtherTriggerButtons() {
    const blocked = genericState !== 'idle' || appHasOtherFlowActive();
    if (todayRxBtn !== activeTriggerBtn) todayRxBtn.disabled = blocked;
    const detailBtn = document.getElementById('rx-detail-action-btn');
    if (detailBtn && detailBtn !== activeTriggerBtn) detailBtn.disabled = blocked;
  }
  new MutationObserver(syncOtherTriggerButtons).observe(appEl, { attributes: true, attributeFilter: ['class'] });

  // ---------- 일반(비감정) 처방 실행 ----------
  function startGenericPrepare(prescription, triggerBtn) {
    if (genericState !== 'idle' || appHasOtherFlowActive()) return;
    activeTriggerBtn = triggerBtn || todayRxBtn;
    currentGeneric = prescription;
    genericState = 'preparing';
    actionBtn.disabled = true;
    activeTriggerBtn.disabled = true;
    activeTriggerBtn.textContent = '준비 중...';
    appEl.classList.add('rx-preparing');
    syncOtherTriggerButtons();

    tween(1300, easeInOutCubic, (t) => {
      setSyringeByHeadY(HEAD_Y_IDLE + (HEAD_Y_READY - HEAD_Y_IDLE) * t);
    }, () => {
      genericState = 'ready';
      appEl.classList.remove('rx-preparing');
      appEl.classList.add('rx-ready');
      activeTriggerBtn.disabled = false;
      activeTriggerBtn.textContent = '주사 놓기';
    });
  }

  function startGenericInject() {
    if (genericState !== 'ready') return;
    genericState = 'injecting';
    appEl.classList.remove('rx-ready');
    appEl.classList.add('rx-injecting');
    activeTriggerBtn.disabled = true;
    activeTriggerBtn.textContent = '주사 중...';

    let dropletTriggered = false;
    tween(1100, easeInCubic, (t) => {
      setSyringeByHeadY(HEAD_Y_READY + (HEAD_Y_IDLE - HEAD_Y_READY) * t);
      if (t > 0.75 && !dropletTriggered) {
        dropletTriggered = true;
        droplet.setAttribute('r', 4.5);
        droplet.style.opacity = '1';
      }
    }, () => {
      appEl.classList.remove('rx-injecting');
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

    showResultScreen(p, now);

    genericState = 'idle';
    currentGeneric = null;
    actionBtn.disabled = false;
    activeTriggerBtn.disabled = appHasOtherFlowActive();
    activeTriggerBtn.textContent = '처방받기';
    activeTriggerBtn = null;
    syncOtherTriggerButtons();
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

  // ---------- 트리거 버튼 공용 배선 (오늘의 카드 / 처방센터 상세에서 공유) ----------
  function wireGenericTrigger(btnEl, p) {
    btnEl.onclick = () => {
      // 이 버튼이 이미 자기 자신의 "준비 완료" 상태를 소유하고 있으면
      // 아래의 "다른 처방 진행 중" 가드보다 먼저 주사를 놓는다.
      if (p.category !== 'emotion' && activeTriggerBtn === btnEl && genericState === 'ready') {
        startGenericInject();
        return;
      }
      if (genericState !== 'idle' || appHasOtherFlowActive()) {
        Core.showToast('지금 다른 처방이 진행 중이에요');
        return;
      }
      Core.requestMotionPermission();
      if (p.category === 'emotion') {
        Core.launchEmotionFlow(p._legacyKey);
      } else {
        startGenericPrepare(p, btnEl);
      }
    };
  }

  // ---------- 오늘의 처방 카드 렌더 ----------
  function renderTodayCard() {
    const p = pickTodaysPrescription();
    todayRxEmoji.textContent = p.emoji;
    todayRxTitle.textContent = p.title;
    todayRxDiagnosis.textContent = p.diagnosis;
    todayRxCard.hidden = false;
    wireGenericTrigger(todayRxBtn, p);
  }

  renderTodayCard();

  // ---------- 처방센터 ----------
  const viewRx = document.getElementById('view-rx');
  const rxCenterContent = document.getElementById('rx-center-content');
  const RARITY_LABEL = { common: '흔함', rare: '레어', epic: '에픽' };

  function rxCategoryCount(catId) {
    return ALL_PRESCRIPTIONS.filter((p) => p.category === catId).length;
  }

  function renderRxGrid() {
    const tiles = RX_CATEGORIES.map((c) => {
      if (c.id === 'random') {
        return `
          <div class="rx-category-tile" data-cat="random">
            <span class="rx-category-emoji">${c.emoji}</span>
            <span class="rx-category-label">${c.label}</span>
            <span class="rx-category-count">탭해서 뽑기</span>
          </div>`;
      }
      const count = rxCategoryCount(c.id);
      return `
        <div class="rx-category-tile${count === 0 ? ' empty' : ''}" data-cat="${c.id}">
          <span class="rx-category-emoji">${c.emoji}</span>
          <span class="rx-category-label">${c.label}</span>
          <span class="rx-category-count">${count > 0 ? `${count}개` : '곧 추가돼요'}</span>
        </div>`;
    }).join('');
    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <span class="rx-nav-title">🏥 처방센터</span>
      </div>
      <div class="rx-category-grid">${tiles}</div>`;

    rxCenterContent.querySelectorAll('.rx-category-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const catId = tile.dataset.cat;
        if (catId === 'random') {
          runRandomPrescription();
          return;
        }
        if (rxCategoryCount(catId) === 0) {
          Core.showToast('이 카테고리는 곧 추가돼요 🚧');
          return;
        }
        renderRxList(catId);
      });
    });
  }

  function renderRxList(catId) {
    const meta = getCategoryMeta(catId);
    const items = ALL_PRESCRIPTIONS.filter((p) => p.category === catId);
    const cards = items.map((p) => `
      <div class="rx-list-card" data-id="${p.id}">
        <span class="rx-list-emoji">${p.emoji}</span>
        <div class="rx-list-body">
          <div class="rx-list-title-row">
            <span class="rx-list-title">${p.title}</span>
            <span class="rx-rarity-badge rx-rarity-${p.rarity}">${RARITY_LABEL[p.rarity] || p.rarity}</span>
          </div>
          <div class="rx-list-desc">${p.diagnosis}</div>
        </div>
      </div>`).join('');
    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="rx-list-back" type="button">‹</button>
        <span class="rx-nav-title">${meta ? `${meta.emoji} ${meta.label}` : '처방 목록'}</span>
      </div>
      ${cards || '<p class="rx-empty-msg">아직 처방이 없어요</p>'}`;

    document.getElementById('rx-list-back').addEventListener('click', renderRxGrid);
    rxCenterContent.querySelectorAll('.rx-list-card').forEach((card) => {
      card.addEventListener('click', () => renderRxDetail(card.dataset.id, catId));
    });
  }

  function renderRxDetail(prescriptionId, fromCatId, opts) {
    const p = ALL_PRESCRIPTIONS.find((x) => x.id === prescriptionId);
    if (!p) { renderRxGrid(); return; }
    const fromRandom = !!(opts && opts.fromRandom);
    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="rx-detail-back" type="button">‹</button>
        <span class="rx-nav-title">${p.title}</span>
      </div>
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${p.emoji}</div>
        <div class="rx-detail-title">${p.title}</div>
        <div class="rx-detail-diagnosis">${p.diagnosis}</div>
        <p class="rx-detail-symptom">${p.symptom}</p>
        <button class="action-btn rx-detail-action-btn" id="rx-detail-action-btn" type="button">처방받기</button>
      </div>`;

    document.getElementById('rx-detail-back').addEventListener('click', () => {
      if (fromRandom) renderRxGrid();
      else renderRxList(fromCatId);
    });
    const detailBtn = document.getElementById('rx-detail-action-btn');
    wireGenericTrigger(detailBtn, p);
    syncOtherTriggerButtons();
  }

  // ---------- 랜덤 처방 (슬롯머신) ----------
  function renderRxRandomSpin() {
    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="rx-random-back" type="button">‹</button>
        <span class="rx-nav-title">🎰 오늘의 랜덤 처방</span>
      </div>
      <div class="rx-random-spin">
        <div class="rx-random-spin-emoji">🎲</div>
        <p class="rx-random-spin-text">오늘 당신에게 필요한 것은...</p>
      </div>`;
    document.getElementById('rx-random-back').addEventListener('click', renderRxGrid);
  }

  let lastRandomAttemptTs = 0;
  function runRandomPrescription() {
    const now = performance.now();
    if (now - lastRandomAttemptTs < 1500) return; // 연타 방지
    lastRandomAttemptTs = now;
    if (!ALL_PRESCRIPTIONS.length) {
      Core.showToast('처방 데이터를 불러오지 못했어요');
      return;
    }

    const rxTabBtn = document.querySelector('.tab-btn[data-view="rx"]');
    if (rxTabBtn) rxTabBtn.click();
    renderRxRandomSpin();

    setTimeout(() => {
      const idx = Math.floor(Math.random() * ALL_PRESCRIPTIONS.length);
      const p = ALL_PRESCRIPTIONS[idx];
      if (!p) return;
      renderRxDetail(p.id, p.category, { fromRandom: true });
    }, 1100);
  }

  // ---------- 탭 전환 시 처방센터 뷰 노출 (app.js의 기존 탭 리스너는 무변경, 별도 리스너 추가) ----------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      viewRx.hidden = view !== 'rx';
      if (view === 'rx') renderRxGrid();
    });
  });

  // ---------- 공유 딥링크 진입 처리 (?rx=<id>) ----------
  // 잘못되었거나 없는 id는 조용히 무시하고 평소처럼 홈이 보인다. 실행 기록은 남기지 않는다.
  try {
    const sharedId = new URLSearchParams(location.search).get('rx');
    if (sharedId) {
      const shared = ALL_PRESCRIPTIONS.find((p) => p.id === sharedId);
      if (shared) {
        const rxTabBtn = document.querySelector('.tab-btn[data-view="rx"]');
        if (rxTabBtn) rxTabBtn.click();
        renderRxDetail(shared.id, shared.category, { fromRandom: true });
      }
    }
  } catch (e) {
    // 잘못된 URL 형식이어도 앱은 정상적으로 계속 동작해야 한다.
  }
})();
