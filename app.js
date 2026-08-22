(() => {
  'use strict';

  const LS_KEY = 'maumjaro:records';
  const NAME_KEY = 'maumjaro:username';
  const SOUND_KEY = 'maumjaro:soundOn';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  const app = document.getElementById('app');
  const actionBtn = document.getElementById('action-btn');
  const statusText = document.getElementById('status-text');
  const todayCountEl = document.getElementById('today-count');
  const monthCountEl = document.getElementById('month-count');
  const toastEl = document.getElementById('toast');

  const plungerRod = document.getElementById('plunger-rod');
  const plungerHead = document.getElementById('plunger-head');
  const liquid = document.getElementById('liquid');
  const droplet = document.getElementById('droplet');

  const healingOverlay = document.getElementById('healing-overlay');
  const healingParticles = document.getElementById('healing-particles');
  const healingText = document.getElementById('healing-text');

  const tabBtns = document.querySelectorAll('.tab-btn');
  const viewHome = document.getElementById('view-home');
  const viewHistory = document.getElementById('view-history');
  const segBtns = document.querySelectorAll('.seg-btn');
  const historyContent = document.getElementById('history-content');
  const syringeSvg = document.getElementById('syringe-svg');
  const tagline = document.getElementById('tagline');

  const settingsBtn = document.getElementById('settings-btn');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsCloseBtn = document.getElementById('settings-close-btn');
  const nameInput = document.getElementById('name-input');
  const nameSaveBtn = document.getElementById('name-save-btn');
  const soundToggleBtn = document.getElementById('sound-toggle');

  const symptomOverlay = document.getElementById('symptom-overlay');
  const symptomChips = document.querySelectorAll('.symptom-chip');
  const dosePreview = document.getElementById('dose-preview');
  const dosePreviewBadge = document.getElementById('dose-preview-badge');
  const dosePreviewCaption = document.getElementById('dose-preview-caption');
  const symptomConfirmBtn = document.getElementById('symptom-confirm-btn');
  const doseTag = document.getElementById('dose-tag');
  const doseTagMg = document.getElementById('dose-tag-mg');
  const doseTagLabel = document.getElementById('dose-tag-label');
  const doseCaption = document.getElementById('dose-caption');
  const armTarget = document.getElementById('arm-target');

  // ---------- geometry constants (mirrors index.html svg, needle-up layout) ----------
  const HEAD_Y_IDLE = 104;   // plunger head resting near the needle end (empty)
  const HEAD_Y_READY = 246;  // plunger head pulled back near the flange (full)
  const HEAD_H = 16;
  const LIQUID_TOP = 106;    // fixed, just below the needle hub
  const ROD_BOTTOM = 336;    // fixed flange position

  const SYMPTOMS = {
    stress: {
      emoji: '😣', label: '스트레스', mg: '3mg', color: '#ffb37a',
      caption: '가볍게 눌린 마음, 살짝 풀어드릴게요',
      messages: [
        '잠깐 멈추고 숨을 골라도 괜찮아요',
        '오늘 하루의 긴장, 여기 내려놓고 가요',
        '너무 애쓰지 않아도 돼요',
        '잘 버텨온 하루, 이제 좀 쉬어도 돼요',
      ],
    },
    anxiety: {
      emoji: '😰', label: '불안', mg: '5.5mg', color: '#ff9166',
      caption: '두근거리는 마음을 다독여드릴게요',
      messages: [
        '불안한 마음, 잠시 내려놔도 괜찮아요',
        '지금 이 순간은 안전해요',
        '걱정이 전부 사실이 되진 않아요',
        '천천히, 한 호흡씩이면 충분해요',
      ],
    },
    depression: {
      emoji: '😔', label: '우울', mg: '8mg', color: '#9aa8e0',
      caption: '가라앉은 마음에 온기를 더해드릴게요',
      messages: [
        '지금 느끼는 감정도 다 괜찮은 거예요',
        '어두운 날도 결국 지나가요',
        '당신은 혼자가 아니에요',
        '오늘 견뎌낸 것만으로 충분해요',
      ],
    },
    lethargy: {
      emoji: '😪', label: '무기력', mg: '10.5mg', color: '#ff8fb3',
      caption: '멈춰버린 마음에 작은 시동을 걸어드릴게요',
      messages: [
        '아무것도 안 해도 괜찮은 날이에요',
        '작은 움직임 하나로 충분해요',
        '당신의 속도대로 가도 돼요',
        '쉬는 것도 필요한 노력이에요',
      ],
    },
    loneliness: {
      emoji: '🥺', label: '외로움', mg: '13mg', color: '#b79aef',
      caption: '혼자라는 마음 곁에 살짝 앉아드릴게요',
      messages: [
        '여기, 당신 곁에 있어요',
        '혼자가 아니라는 걸 기억해요',
        '마음을 나눌 준비가 될 때까지 기다릴게요',
        '오늘 하루도 함께 버텼어요',
      ],
    },
    anger: {
      emoji: '😤', label: '분노', mg: '15.5mg', color: '#ef6a5a',
      caption: '끓어오른 마음을 가라앉혀드릴게요',
      messages: [
        '화가 나는 것도 자연스러운 감정이에요',
        '잠시 숨을 고르면 마음이 편해져요',
        '그 감정, 인정해줘도 괜찮아요',
        '오늘의 화, 여기 내려놓고 가요',
      ],
    },
    // 위로가 필요한 날만이 아니라 기쁘거나 평범한 날도 처방받을 수 있도록 추가한 긍정/일상 감정 3종.
    joy: {
      emoji: '😊', label: '기쁨', mg: '2mg', color: '#ffd166',
      caption: '좋은 기분, 오늘 더 오래 느끼게 해드릴게요',
      messages: [
        '이 좋은 기분, 오늘 하루 쭉 이어가요',
        '기쁜 마음은 아낄 필요 없어요',
        '웃을 수 있을 때 실컷 웃어도 돼요',
        '오늘의 행복, 마음껏 누려요',
      ],
    },
    ordinary: {
      emoji: '😌', label: '평범', mg: '1mg', color: '#a8d8b9',
      caption: '평범한 하루에 작은 의미를 더해드릴게요',
      messages: [
        '특별하지 않아도 충분히 좋은 하루예요',
        '평범한 하루도 소중한 하루예요',
        '무탈하게 흘러가는 것도 행운이에요',
        '오늘 하루, 있는 그대로 좋아요',
      ],
    },
    excitement: {
      emoji: '🤩', label: '설렘', mg: '4mg', color: '#7ec8e3',
      caption: '설레는 마음을 더 두근거리게 해드릴게요',
      messages: [
        '설레는 마음, 오늘 하루 잘 간직해요',
        '기대되는 일이 있다는 건 좋은 신호예요',
        '두근거림을 편하게 즐겨도 돼요',
        '오늘의 설렘, 내일로도 이어지길 바라요',
      ],
    },
    // 감정의 폭을 더 다양하게 — 부정/긍정/일상 감정을 골고루 9종 추가.
    hurt: {
      emoji: '😞', label: '서운함', mg: '6mg', color: '#e0a8c9',
      caption: '서운한 마음을 가만히 안아드릴게요',
      messages: [
        '서운한 마음, 굳이 참지 않아도 돼요',
        '말하지 않아도 그 마음 알아줄게요',
        '서운함도 소중한 감정이에요',
        '오늘의 서운함, 여기 내려놓고 가요',
      ],
    },
    jealousy: {
      emoji: '😒', label: '질투', mg: '7mg', color: '#d4a373',
      caption: '비교하는 마음을 잠시 내려놓게 해드릴게요',
      messages: [
        '질투하는 마음도 자연스러운 감정이에요',
        '비교하지 않아도 당신은 충분해요',
        '그 마음, 부끄러워하지 않아도 돼요',
        '오늘만큼은 나에게 집중해도 좋아요',
      ],
    },
    nervous: {
      emoji: '😬', label: '긴장', mg: '5mg', color: '#e07a5f',
      caption: '긴장한 마음을 살짝 풀어드릴게요',
      messages: [
        '긴장되는 것도 잘하고 싶다는 증거예요',
        '떨려도 괜찮아요, 준비한 대로만 하면 돼요',
        '숨 한 번 크게 쉬면 한결 편해져요',
        '긴장한 당신, 이미 충분히 잘하고 있어요',
      ],
    },
    exhausted: {
      emoji: '🥱', label: '지침', mg: '11mg', color: '#adb5bd',
      caption: '다 써버린 에너지를 조금 채워드릴게요',
      messages: [
        '지친 오늘, 억지로 힘내지 않아도 돼요',
        '쉬어가는 것도 잘하고 있는 거예요',
        '오늘만큼은 아무것도 안 해도 괜찮아요',
        '지친 마음, 여기서 잠깐 내려놓고 가요',
      ],
    },
    gratitude: {
      emoji: '🙏', label: '감사', mg: '2.5mg', color: '#e9c46a',
      caption: '감사한 마음을 더 오래 간직하게 해드릴게요',
      messages: [
        '감사한 마음, 더 자주 느껴도 좋아요',
        '오늘의 고마움, 마음에 오래 담아둬요',
        '작은 감사도 큰 힘이 돼요',
        '고마운 마음을 표현해도 좋은 날이에요',
      ],
    },
    proud: {
      emoji: '😎', label: '뿌듯함', mg: '3mg', color: '#84a98c',
      caption: '오늘 해낸 나를 마음껏 칭찬해드릴게요',
      messages: [
        '오늘 해낸 당신, 스스로 칭찬해줘요',
        '뿌듯함은 아껴둘 필요 없어요',
        '작은 성취도 충분히 자랑할 만해요',
        '오늘의 뿌듯함, 마음껏 누려요',
      ],
    },
    comfort: {
      emoji: '🧘', label: '편안함', mg: '1.5mg', color: '#a3c4bc',
      caption: '편안한 마음을 더 오래 느끼게 해드릴게요',
      messages: [
        '편안한 지금 이 순간을 충분히 누려요',
        '아무 일 없어도 좋은 게 평온함이에요',
        '편안함을 굳이 설명하지 않아도 돼요',
        '오늘의 여유, 오래 이어가요',
      ],
    },
    longing: {
      emoji: '🌙', label: '그리움', mg: '9mg', color: '#8e7dbe',
      caption: '그리운 마음을 잠시 함께 느껴드릴게요',
      messages: [
        '그리운 마음, 억지로 지우지 않아도 돼요',
        '보고 싶은 마음도 사랑의 한 형태예요',
        '그리움은 소중했던 시간의 증거예요',
        '오늘의 그리움, 잠시 느껴도 괜찮아요',
      ],
    },
    affection: {
      emoji: '🥰', label: '사랑', mg: '3.5mg', color: '#ff6fa8',
      caption: '사랑하는 마음을 더 깊게 느끼게 해드릴게요',
      messages: [
        '사랑하는 마음, 표현해도 좋은 날이에요',
        '그 마음, 소중히 간직해도 돼요',
        '사랑은 아낄수록 줄어들지 않아요',
        '오늘도 사랑하는 마음으로 하루를 채워요',
      ],
    },
    // 새 감정은 이 아래(끝)에만 추가한다. 감정 목록을 펼쳤을 때 4열 격자가
    // 빈 칸 없이 떨어지도록 개수를 4의 배수로 맞춘다(현재 20개).
    // index.html의 증상 선택 칩도 같이 추가해야 두 화면이 어긋나지 않는다.
    stuffy: {
      emoji: '😖', label: '답답함', mg: '12mg', color: '#9c8aa8',
      caption: '가슴에 얹힌 답답함, 조금 내려드릴게요',
      messages: [
        '막힌 것 같아도 길은 있어요',
        '한숨 크게 한 번 쉬어도 괜찮아요',
        '지금 안 풀려도 나중에 풀려요',
        '가슴에 얹힌 것, 여기 내려놓고 가요',
      ],
    },
    relief: {
      emoji: '🎈', label: '홀가분', mg: '1.8mg', color: '#8fd0c4',
      caption: '가벼워진 마음을 그대로 담아드릴게요',
      messages: [
        '내려놓길 잘했어요',
        '이 가벼움, 오래 가져가도 좋아요',
        '오늘은 아무것도 안 해도 되는 날이에요',
        '홀가분한 마음, 충분히 누려도 돼요',
      ],
    },
  };
  let lastHealingMessage = null;

  // ---------- motion-based injection ("찌르기" gesture via accelerometer) ----------
  const MOTION_THRESHOLD = 28; // m/s^2 of jerk to count as a "stab"
  const MOTION_COOLDOWN_MS = 1500;
  let motionListenerAttached = false;
  let lastMotionTriggerTime = 0;

  function motionMagnitude(x, y, z) {
    return Math.sqrt((x || 0) ** 2 + (y || 0) ** 2 + (z || 0) ** 2);
  }

  function handleDeviceMotion(e) {
    if (localStorage.getItem('maumjaro:motionOn') === 'off') return;
    if (state !== 'ready') return;
    const acc = (e.acceleration && e.acceleration.x !== null) ? e.acceleration : e.accelerationIncludingGravity;
    if (!acc || acc.x === null || acc.x === undefined) return;
    const mag = motionMagnitude(acc.x, acc.y, acc.z);
    const now = performance.now();
    if (mag > MOTION_THRESHOLD && now - lastMotionTriggerTime > MOTION_COOLDOWN_MS) {
      lastMotionTriggerTime = now;
      if (navigator.vibrate) navigator.vibrate(40);
      startInject();
    }
  }

  function enableMotionListener() {
    if (motionListenerAttached) return;
    motionListenerAttached = true;
    window.addEventListener('devicemotion', handleDeviceMotion);
  }

  function requestMotionPermission() {
    const DME = window.DeviceMotionEvent;
    if (!DME) return;
    if (typeof DME.requestPermission === 'function') {
      DME.requestPermission().then((result) => {
        if (result === 'granted') enableMotionListener();
      }).catch(() => {});
    } else {
      enableMotionListener();
    }
  }

  function pickHealingMessage(symptomKey) {
    const pool = (SYMPTOMS[symptomKey] && SYMPTOMS[symptomKey].messages) || [];
    if (pool.length === 0) return '오늘도 스스로를 잘 돌봤어요';
    if (pool.length === 1) return pool[0];
    let msg;
    do {
      msg = pool[Math.floor(Math.random() * pool.length)];
    } while (msg === lastHealingMessage);
    lastHealingMessage = msg;
    return msg;
  }

  // ---------- state ----------
  let state = 'idle'; // idle | preparing | ready | injecting
  let selectedSymptom = null; // confirmed symptom key for the current dose
  let pendingSymptom = null;  // symptom key highlighted in the picker, not yet confirmed
  let currentView = 'home';
  let currentPeriod = 'day';
  let monthCursor = startOfMonth(new Date());
  let yearCursor = new Date().getFullYear();
  let selectedDayKey = null;

  // ---------- storage ----------
  function loadRecords() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecord(ts) {
    const records = loadRecords();
    records.push(ts);
    localStorage.setItem(LS_KEY, JSON.stringify(records));
    return records;
  }

  // ---------- date helpers ----------
  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function sameDay(a, b) { return dateKey(a) === dateKey(b); }

  function formatDayLabel(d) {
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    if (sameDay(d, today)) return `오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일`;
    if (sameDay(d, yest)) return `어제 · ${d.getMonth() + 1}월 ${d.getDate()}일`;
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
  }
  function formatTime(d) {
    let h = d.getHours();
    const ampm = h < 12 ? '오전' : '오후';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${ampm} ${h12}:${m}`;
  }

  // ---------- animation ----------
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeInCubic(t) { return t * t * t; }

  function tween(duration, easingFn, onUpdate, onDone) {
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      onUpdate(easingFn(t));
      if (t < 1) {
        requestAnimationFrame(frame);
      } else if (onDone) {
        onDone();
      }
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

  function popBounce() {
    syringeSvg.classList.remove('bounce-pop');
    void syringeSvg.offsetWidth;
    syringeSvg.classList.add('bounce-pop');
  }

  // initialize visuals to idle
  setSyringeByHeadY(HEAD_Y_IDLE);

  // ---------- sound (synthesized, no external files) ----------
  let audioCtx = null;
  let soundOn = localStorage.getItem(SOUND_KEY) !== 'off';

  function getAudioCtx() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function tone(freq, startTime, duration, opts) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const { type = 'sine', gain = 0.12, attack = 0.02, release = 0.12 } = opts || {};
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gain, startTime + attack);
    g.gain.linearRampToValueAtTime(gain * 0.7, Math.max(startTime + attack, startTime + duration - release));
    g.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  function sweepTone(freqFrom, freqTo, startTime, duration, opts) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const { type = 'sine', gain = 0.07 } = opts || {};
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, startTime);
    osc.frequency.linearRampToValueAtTime(freqTo, startTime + duration);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gain, startTime + 0.18);
    g.gain.linearRampToValueAtTime(gain, Math.max(startTime + 0.18, startTime + duration - 0.25));
    g.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  function playPrepareSound(durationMs) {
    if (!soundOn) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    sweepTone(280, 620, now, dur, { gain: 0.06 });
    const blips = 4;
    for (let i = 0; i < blips; i++) {
      const t = now + 0.15 + Math.random() * Math.max(0.1, dur - 0.3);
      tone(650 + Math.random() * 350, t, 0.14, { gain: 0.045, attack: 0.01, release: 0.09 });
    }
  }

  function playReadyChime() {
    if (!soundOn) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    tone(880, now, 0.18, { gain: 0.08 });
    tone(1318.5, now + 0.12, 0.24, { gain: 0.07 });
  }

  function playInjectPress() {
    if (!soundOn) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    tone(190, ctx.currentTime, 0.12, { type: 'triangle', gain: 0.09, attack: 0.005, release: 0.06 });
  }

  function playHealingChime() {
    if (!soundOn) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(f, now + i * 0.14, 0.55, { gain: 0.055, attack: 0.02, release: 0.4 }));
  }

  function startPrepare() {
    if (state !== 'idle' || !selectedSymptom) return;
    state = 'preparing';
    app.classList.remove('state-ready');
    app.classList.add('state-preparing');
    actionBtn.disabled = true;
    actionBtn.textContent = '준비 중...';
    statusText.textContent = '마음에 담을 처방을 준비하고 있어요';
    popBounce();
    const PREPARE_MS = 1300;
    playPrepareSound(PREPARE_MS);

    tween(PREPARE_MS, easeInOutCubic, (t) => {
      const headY = HEAD_Y_IDLE + (HEAD_Y_READY - HEAD_Y_IDLE) * t;
      setSyringeByHeadY(headY);
    }, () => {
      state = 'ready';
      app.classList.remove('state-preparing');
      app.classList.add('state-ready');
      actionBtn.disabled = false;
      actionBtn.textContent = '주사하기';
      actionBtn.classList.add('ready-state');
      statusText.textContent = '준비되었어요. 폰을 콕 찌르듯 움직이거나 눌러주세요';
      armTarget.hidden = false;
      playReadyChime();
    });
  }

  function startInject() {
    if (state !== 'ready') return;
    state = 'injecting';
    app.classList.remove('state-ready');
    app.classList.add('state-injecting');
    actionBtn.disabled = true;
    actionBtn.textContent = '주사 중...';
    actionBtn.classList.remove('ready-state');
    statusText.textContent = '마음에 천천히 전달되고 있어요';
    armTarget.hidden = true;
    popBounce();
    playInjectPress();

    let dropletTriggered = false;

    tween(1100, easeInCubic, (t) => {
      const headY = HEAD_Y_READY + (HEAD_Y_IDLE - HEAD_Y_READY) * t;
      setSyringeByHeadY(headY);
      if (t > 0.75 && !dropletTriggered) {
        dropletTriggered = true;
        droplet.setAttribute('r', 4.5);
        droplet.style.opacity = '1';
      }
    }, () => {
      app.classList.remove('state-injecting');
      setTimeout(() => {
        droplet.setAttribute('r', 0);
        droplet.style.opacity = '0';
      }, 250);
      completeInjection();
    });
  }

  function completeInjection() {
    const now = Date.now();
    saveRecord(now);
    document.dispatchEvent(new CustomEvent('maumjaro:emotion-injected', { detail: { key: selectedSymptom, ts: now } }));

    const symptom = SYMPTOMS[selectedSymptom];
    const msg = pickHealingMessage(selectedSymptom);
    healingText.innerHTML = msg.replace(/ /g, '&nbsp;');
    if (symptom) {
      healingText.innerHTML += `<span class="healing-subtext">${symptom.emoji} ${symptom.label} ${symptom.mg} 처방 완료</span>`;
    }
    spawnParticles();
    healingOverlay.classList.add('show');
    playHealingChime();

    setTimeout(() => {
      healingOverlay.classList.remove('show');
      healingParticles.innerHTML = '';
    }, 3700);

    state = 'idle';
    actionBtn.disabled = false;
    // 평상시 문구는 이 버튼이 무엇을 하는 버튼인지 그 자체로 알려줘야 한다.
    // ("준비하기"만 보면 처음 온 사람은 무엇을 준비하는지 알 수 없다.)
    // 진행 중 문구(준비 중.../주사하기/주사 중...)는 그대로 둔다.
    actionBtn.textContent = '오늘의 처방 받기 💉';
    doseTag.hidden = true;
    doseCaption.hidden = true;
    selectedSymptom = null;

    refreshSummary();
    const rec = loadRecords();
    const todayCount = rec.filter((t) => sameDay(new Date(t), new Date())).length;
    showToast(`오늘 ${todayCount}번째 마음 주사를 맞았어요`);

    setTimeout(() => {
      if (state === 'idle') statusText.textContent = '오늘도 스스로를 잘 돌봤어요';
    }, 600);
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

  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  actionBtn.addEventListener('click', () => {
    if (state === 'idle') openSymptomPicker();
    else if (state === 'ready') startInject();
  });

  armTarget.addEventListener('click', () => {
    if (state === 'ready') startInject();
  });

  // ---------- symptom picker ----------
  function openSymptomPicker() {
    pendingSymptom = null;
    symptomChips.forEach((chip) => chip.classList.remove('selected'));
    dosePreview.hidden = true;
    symptomConfirmBtn.disabled = true;
    symptomOverlay.classList.add('show');
  }
  function closeSymptomPicker() {
    symptomOverlay.classList.remove('show');
  }

  symptomChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.symptom;
      const symptom = SYMPTOMS[key];
      if (!symptom) return;
      pendingSymptom = key;
      symptomChips.forEach((c) => c.classList.toggle('selected', c === chip));
      document.body.style.setProperty('--dose-color', symptom.color);
      dosePreviewBadge.textContent = symptom.mg;
      dosePreviewCaption.textContent = symptom.caption;
      dosePreview.hidden = false;
      symptomConfirmBtn.disabled = false;
    });
  });

  symptomOverlay.addEventListener('click', (e) => {
    if (e.target === symptomOverlay) closeSymptomPicker();
  });

  symptomConfirmBtn.addEventListener('click', () => {
    if (!pendingSymptom) return;
    requestMotionPermission();
    selectedSymptom = pendingSymptom;
    const symptom = SYMPTOMS[selectedSymptom];
    doseTagMg.textContent = symptom.mg;
    doseTagLabel.textContent = `${symptom.label} 처방`;
    doseCaption.textContent = symptom.caption;
    doseTag.hidden = false;
    doseCaption.hidden = false;
    closeSymptomPicker();
    startPrepare();
  });

  // ---------- summary ----------
  function refreshSummary() {
    const records = loadRecords().map((t) => new Date(t));
    const now = new Date();
    const todayCount = records.filter((d) => sameDay(d, now)).length;
    const monthCount = records.filter((d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()).length;
    todayCountEl.textContent = todayCount;
    monthCountEl.textContent = monthCount;
    if (state === 'idle') {
      statusText.textContent = todayCount > 0 ? '오늘 마음 주사를 맞았어요' : '오늘 마음 주사를 맞기 전이에요';
    }
  }

  // ---------- name & settings ----------
  function loadName() {
    return (localStorage.getItem(NAME_KEY) || '').trim();
  }

  function updateGreeting() {
    const name = loadName();
    tagline.textContent = name ? `${name}님, 마음에 놓는 오늘의 처방` : '마음에 놓는 오늘의 처방';
  }

  function openSettings() {
    nameInput.value = loadName();
    settingsOverlay.classList.add('show');
  }
  function closeSettings() {
    settingsOverlay.classList.remove('show');
  }

  settingsBtn.addEventListener('click', openSettings);
  settingsCloseBtn.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  nameSaveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim().slice(0, 12);
    localStorage.setItem(NAME_KEY, name);
    updateGreeting();
    showToast(name ? `${name}님, 반가워요` : '이름이 지워졌어요');
    closeSettings();
  });

  function updateSoundToggleUI() {
    soundToggleBtn.textContent = soundOn ? '🔊 켜짐' : '🔇 꺼짐';
    soundToggleBtn.setAttribute('aria-pressed', String(soundOn));
  }
  soundToggleBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
    updateSoundToggleUI();
    if (soundOn) playReadyChime();
  });

  // ---------- tabs ----------
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === currentView) return;
      currentView = view;
      tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
      viewHome.hidden = view !== 'home';
      viewHistory.hidden = view !== 'history';
      if (view === 'history') renderHistory();
    });
  });

  segBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentPeriod = btn.dataset.period;
      segBtns.forEach((b) => b.classList.toggle('active', b === btn));
      renderHistory();
    });
  });

  // ---------- history rendering ----------
  function renderHistory() {
    const records = loadRecords().map((t) => new Date(t));
    if (currentPeriod === 'day') renderDayView(records);
    else if (currentPeriod === 'month') renderMonthView(records);
    else renderYearView(records);
  }

  function buildBarChart(items, opts) {
    const compact = opts && opts.compact;
    const max = Math.max(1, ...items.map((it) => it.count));
    const barsHtml = items.map((it) => {
      const h = it.count === 0 ? 3 : Math.max(6, Math.round((it.count / max) * (compact ? 100 : 140)));
      return `
        <div class="year-bar-col${it.count === 0 ? ' zero' : ''}${it.highlight ? ' highlight' : ''}">
          <span class="year-bar-count">${it.count > 0 ? it.count : ''}</span>
          <div class="year-bar" style="height:${h}px"></div>
          <span class="year-bar-label">${it.label}</span>
        </div>`;
    }).join('');
    return `<div class="year-bars${compact ? ' compact' : ''}">${barsHtml}</div>`;
  }

  function renderDayView(records) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last14 = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last14.push(d);
    }
    const countMap = new Map();
    records.forEach((d) => {
      const k = dateKey(d);
      countMap.set(k, (countMap.get(k) || 0) + 1);
    });
    const chartItems = last14.map((d) => ({
      label: String(d.getDate()),
      count: countMap.get(dateKey(d)) || 0,
      highlight: sameDay(d, today),
    }));
    const chartTotal = chartItems.reduce((a, b) => a + b.count, 0);
    const chartHtml = `
      <div class="chart-section">
        <div class="chart-title">최근 14일 <strong>${chartTotal}</strong>번</div>
        ${buildBarChart(chartItems)}
      </div>`;

    if (records.length === 0) {
      historyContent.innerHTML = chartHtml + '<p class="empty-msg">아직 기록이 없어요.<br/>첫 마음 주사를 놓아보세요.</p>';
      return;
    }
    const groups = new Map();
    records.forEach((d) => {
      const key = dateKey(d);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    const keys = Array.from(groups.keys()).sort().reverse();
    let html = '';
    keys.forEach((key) => {
      const list = groups.get(key).sort((a, b) => a - b);
      const label = formatDayLabel(list[0]);
      const chips = list.map((d) => `<span class="time-chip">${formatTime(d)}</span>`).join('');
      html += `
        <div class="day-group">
          <div class="day-group-head">
            <span class="date">${label}</span>
            <span class="count">${list.length}회</span>
          </div>
          <div class="time-chips">${chips}</div>
        </div>`;
    });
    historyContent.innerHTML = chartHtml + html;
  }

  function renderMonthView(records) {
    const y = monthCursor.getFullYear();
    const m = monthCursor.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const countByDate = new Map();
    records.forEach((d) => {
      if (d.getFullYear() === y && d.getMonth() === m) {
        const k = dateKey(d);
        countByDate.set(k, (countByDate.get(k) || 0) + 1);
      }
    });
    const monthTotal = Array.from(countByDate.values()).reduce((a, b) => a + b, 0);

    let dowHtml = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('');
    let cellsHtml = '';
    for (let i = 0; i < firstDow; i++) cellsHtml += '<div class="cal-cell blank"></div>';
    const today = new Date();
    const chartItems = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(y, m, day);
      const key = dateKey(cellDate);
      const cnt = countByDate.get(key) || 0;
      const isToday = sameDay(cellDate, today);
      cellsHtml += `<div class="cal-cell${cnt > 0 ? ' has-record' : ''}${isToday ? ' today' : ''}" data-key="${key}">
          <span>${day}</span>
          ${cnt > 0 ? '<span class="badge"></span>' : ''}
        </div>`;
      const showLabel = day === 1 || day === daysInMonth || day % 5 === 0;
      chartItems.push({ label: showLabel ? String(day) : '', count: cnt, highlight: isToday });
    }

    historyContent.innerHTML = `
      <div class="period-nav">
        <button id="month-prev">‹</button>
        <span class="period-label">${y}년 ${m + 1}월</span>
        <button id="month-next">›</button>
      </div>
      <div class="period-total">이번 달 <strong>${monthTotal}</strong>번</div>
      <div class="chart-section">${buildBarChart(chartItems, { compact: true })}</div>
      <div class="calendar-grid">${dowHtml}${cellsHtml}</div>
      <div id="day-detail-slot"></div>
    `;

    document.getElementById('month-prev').addEventListener('click', () => {
      monthCursor = new Date(y, m - 1, 1);
      renderMonthView(records);
    });
    document.getElementById('month-next').addEventListener('click', () => {
      monthCursor = new Date(y, m + 1, 1);
      renderMonthView(records);
    });

    historyContent.querySelectorAll('.cal-cell.has-record').forEach((cell) => {
      cell.addEventListener('click', () => {
        selectedDayKey = cell.dataset.key;
        renderDayDetail(records, selectedDayKey);
      });
    });

    if (selectedDayKey && countByDate.has(selectedDayKey)) {
      renderDayDetail(records, selectedDayKey);
    }
  }

  function renderDayDetail(records, key) {
    const slot = document.getElementById('day-detail-slot');
    if (!slot) return;
    const list = records.filter((d) => dateKey(d) === key).sort((a, b) => a - b);
    if (list.length === 0) { slot.innerHTML = ''; return; }
    const label = formatDayLabel(list[0]);
    const chips = list.map((d) => `<span class="time-chip">${formatTime(d)}</span>`).join('');
    slot.innerHTML = `
      <div class="day-detail">
        <div class="date">${label} · ${list.length}회</div>
        <div class="time-chips">${chips}</div>
      </div>`;
  }

  function renderYearView(records) {
    const y = yearCursor;
    const counts = new Array(12).fill(0);
    records.forEach((d) => {
      if (d.getFullYear() === y) counts[d.getMonth()]++;
    });
    const total = counts.reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...counts);

    let barsHtml = '';
    for (let i = 0; i < 12; i++) {
      const c = counts[i];
      const h = c === 0 ? 3 : Math.max(6, Math.round((c / max) * 140));
      barsHtml += `
        <div class="year-bar-col${c === 0 ? ' zero' : ''}">
          <span class="year-bar-count">${c > 0 ? c : ''}</span>
          <div class="year-bar" style="height:${h}px"></div>
          <span class="year-bar-label">${i + 1}월</span>
        </div>`;
    }

    historyContent.innerHTML = `
      <div class="period-nav">
        <button id="year-prev">‹</button>
        <span class="period-label">${y}년</span>
        <button id="year-next">›</button>
      </div>
      <div class="period-total">올해 총 <strong>${total}</strong>번</div>
      <div class="year-bars">${barsHtml}</div>
    `;

    document.getElementById('year-prev').addEventListener('click', () => {
      yearCursor = y - 1;
      renderYearView(records);
    });
    document.getElementById('year-next').addEventListener('click', () => {
      yearCursor = y + 1;
      renderYearView(records);
    });
  }

  // ---------- init ----------
  updateGreeting();
  updateSoundToggleUI();
  refreshSummary();

  // ---------- export for prescriptions.js (처방 시스템 확장, additive only) ----------
  window.MaumjaroCore = {
    SYMPTOMS,
    loadRecords,
    sameDay,
    showToast,
    requestMotionPermission,
    refreshSummary,
    playPrepareSound,
    playReadyChime,
    playInjectPress,
    playHealingChime,
    launchEmotionFlow(key) {
      const symptom = SYMPTOMS[key];
      if (!symptom || state !== 'idle') return;
      selectedSymptom = key;
      doseTagMg.textContent = symptom.mg;
      doseTagLabel.textContent = `${symptom.label} 처방`;
      doseCaption.textContent = symptom.caption;
      doseTag.hidden = false;
      doseCaption.hidden = false;
      startPrepare();
    },
  };
})();
