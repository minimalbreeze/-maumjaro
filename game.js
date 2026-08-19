// 맘운자로 게임 레이어 엔진 (출석 / 연속출석 / 마음약 / XP / 컬렉션)
//
// 설계 원칙
//  1) app.js는 건드리지 않는다. app.js가 이미 쏘고 있는 'maumjaro:emotion-injected'
//     커스텀 이벤트를 구독해서 출석을 붙인다.
//  2) 별도의 출석 버튼을 만들지 않는다. "그날 첫 처방 완료 = 그날 출석"이다.
//  3) 보상 지급은 멱등이다. 새로고침·뒤로가기·중복 클릭·여러 탭에서 동시에 실행돼도
//     그날 보상은 한 번만, 그리고 항상 같은 결과가 나온다(아래 '멱등' 주석 참고).
//  4) 기존 localStorage 키는 읽지도 쓰지도 않는다. 이 파일은 자기 키 하나만 쓴다.
(() => {
  'use strict';

  const G = window.MAUMJARO_GAME_DATA;
  if (!G) return; // 데이터가 없으면 게임 레이어 전체를 조용히 비활성화한다
  const { RARITIES, MEDICINES, LEVEL_TITLES, LEVEL_CURVE, STREAK_REWARDS, GAME_CONFIG } = G;

  const STATE_KEY = 'maumjaro:gameState';
  const STATE_VERSION = 1;

  // ---------- 날짜 (app.js의 dateKey와 같은 로컬 기준) ----------
  function dateKeyOf(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function todayKey() { return dateKeyOf(new Date()); }
  function shiftDays(key, delta) {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return dateKeyOf(dt);
  }
  function daysBetween(fromKey, toKey) {
    const [y1, m1, d1] = fromKey.split('-').map(Number);
    const [y2, m2, d2] = toKey.split('-').map(Number);
    const a = new Date(y1, m1 - 1, d1);
    const b = new Date(y2, m2 - 1, d2);
    return Math.round((b - a) / 86400000);
  }

  // ---------- 상태 ----------
  function defaultState() {
    return {
      v: STATE_VERSION,
      salt: Math.random().toString(36).slice(2, 10), // 사용자마다 다른 뽑기 결과를 만들기 위한 씨앗
      lastCheckInDate: null,
      currentStreak: 0,
      longestStreak: 0,
      totalCheckIns: 0,
      xp: 0,
      collection: {},        // { medId: { count, firstAt, lastAt } }
      vacationTickets: 0,
      awards: {},            // { 'daily:2026-08-19': true } — 멱등 키
    };
  }

  // 주의: salt는 "처음 읽는 순간 저장해서 고정"해야 한다.
  // defaultState()는 부를 때마다 새 salt를 만들기 때문에, 저장하지 않고 돌려주면
  // claimDailyReward()가 안전을 위해 loadState()를 여러 번 부르는 사이에 씨앗이 바뀌어
  // 뽑기 결과가 흔들린다(= 멱등성이 깨진다).
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) {
        const fresh = defaultState();
        saveState(fresh);
        return fresh;
      }
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object') {
        const fresh = defaultState();
        saveState(fresh);
        return fresh;
      }
      const merged = { ...defaultState(), ...s, collection: s.collection || {}, awards: s.awards || {} };
      if (!merged.salt) { merged.salt = defaultState().salt; saveState(merged); }
      return merged;
    } catch (e) {
      const fresh = defaultState();
      saveState(fresh);
      return fresh;
    }
  }

  function saveState(s) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(s));
      return true;
    } catch (e) {
      return false; // 저장 실패(용량 초과 등)해도 앱은 계속 돌아야 한다
    }
  }

  // ---------- 씨앗 기반 난수 ----------
  // 멱등의 핵심: 같은 (salt, 날짜)면 항상 같은 마음약이 나온다.
  // 그래서 두 탭에서 동시에 처방이 끝나도 서로 다른 보상이 생기지 않는다.
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 희귀도 / 마음약 ----------
  function rarityOf(key) { return RARITIES.find((r) => r.key === key) || RARITIES[0]; }
  function rarityOrder(key) { return rarityOf(key).order; }
  function medicineOf(id) { return MEDICINES.find((m) => m.id === id) || null; }

  // 오늘 받을 수 있는 마음약 후보. 시즌 한정(limited)은 기간이 지나면 빠진다(PHASE 3 대비).
  function availableMedicines(now) {
    const t = now ? now.getTime() : Date.now();
    return MEDICINES.filter((m) => {
      if (!m.limited) return true;
      if (m.availableFrom && t < new Date(m.availableFrom).getTime()) return false;
      if (m.availableUntil && t > new Date(m.availableUntil).getTime()) return false;
      return true;
    });
  }

  function pickRarity(rand, minRarityKey) {
    const min = minRarityKey ? rarityOrder(minRarityKey) : 0;
    const pool = RARITIES.filter((r) => r.order >= min);
    const total = pool.reduce((a, r) => a + r.weight, 0);
    if (total <= 0) return pool[pool.length - 1].key;
    let x = rand() * total;
    for (const r of pool) {
      x -= r.weight;
      if (x <= 0) return r.key;
    }
    return pool[pool.length - 1].key;
  }

  // 이미 가진 것도 다시 나올 수 있다(중복은 개수로 쌓인다).
  // 다만 아직 못 얻은 게 있으면 그쪽에 살짝 무게를 준다 — 컬렉션이 채워지는 맛을 위해.
  function pickMedicine(rand, rarityKey, collection, now) {
    const pool = availableMedicines(now).filter((m) => m.rarity === rarityKey);
    if (!pool.length) return availableMedicines(now)[0] || MEDICINES[0];
    const fresh = pool.filter((m) => !collection[m.id]);
    const useFresh = fresh.length > 0 && rand() < 0.7;
    const target = useFresh ? fresh : pool;
    return target[Math.floor(rand() * target.length)];
  }

  // ---------- 레벨 ----------
  function xpToNext(level) { return LEVEL_CURVE.base + (level - 1) * LEVEL_CURVE.step; }
  function levelFromXp(xp) {
    let level = 1;
    let remain = Math.max(0, xp);
    while (remain >= xpToNext(level) && level < 999) {
      remain -= xpToNext(level);
      level += 1;
    }
    return { level, into: remain, need: xpToNext(level) };
  }
  function titleForLevel(level) {
    let title = LEVEL_TITLES[0].title;
    LEVEL_TITLES.forEach((t) => { if (level >= t.level) title = t.title; });
    return title;
  }

  // ---------- 연속 출석 ----------
  function streakRewardFor(days) {
    return STREAK_REWARDS.find((r) => r.days === days) || null;
  }
  function nextStreakReward(days) {
    return STREAK_REWARDS.find((r) => r.days > days) || null;
  }

  // 오늘 출석을 반영한 새 연속일수. 저장은 하지 않는다(미리보기에도 쓴다).
  function computeStreak(s, today) {
    if (!s.lastCheckInDate) return 1;
    const gap = daysBetween(s.lastCheckInDate, today);
    if (gap <= 0) return s.currentStreak || 1; // 오늘 이미 출석함
    if (gap === 1) return (s.currentStreak || 0) + 1;
    // 하루를 건너뛰었을 때 마음휴가권으로 연속을 지킨다(PHASE 2에서 UI로 노출).
    if (gap === 2 && (s.vacationTickets || 0) > 0) return (s.currentStreak || 0) + 1;
    return 1;
  }

  // ---------- 오늘 보상 미리보기 (아직 지급 전) ----------
  function previewToday() {
    const s = loadState();
    const today = todayKey();
    const claimed = !!s.awards[`daily:${today}`];
    const streak = claimed ? (s.currentStreak || 1) : computeStreak(s, today);
    const lv = levelFromXp(s.xp);
    return {
      claimed,
      streak,
      longestStreak: s.longestStreak || 0,
      totalCheckIns: s.totalCheckIns || 0,
      milestone: streakRewardFor(streak),
      nextMilestone: nextStreakReward(streak),
      level: lv.level,
      levelTitle: titleForLevel(lv.level),
      xp: s.xp,
      xpInto: lv.into,
      xpNeed: lv.need,
      collectedCount: Object.keys(s.collection).length,
      totalMedicines: MEDICINES.length,
      vacationTickets: s.vacationTickets || 0,
    };
  }

  // ---------- 보상 지급 (멱등) ----------
  // 같은 날 두 번째 호출부터는 null을 돌려준다 = 중복 지급 없음.
  // 지급 내용 자체도 (salt, 날짜)로 결정되므로, 여러 탭이 동시에 들어와도 결과가 갈리지 않는다.
  function claimDailyReward() {
    const today = todayKey();
    const awardId = `daily:${today}`;

    // 쓰기 직전에 다시 읽어 최신 상태를 본다(다른 탭이 먼저 지급했을 수 있다).
    let s = loadState();
    if (s.awards[awardId]) return null;

    const streak = computeStreak(s, today);
    const milestone = streakRewardFor(streak);
    const rand = mulberry32(hashStr(`${s.salt}|${today}`));

    const rarityKey = pickRarity(rand, milestone && milestone.minRarity);
    const med = pickMedicine(rand, rarityKey, s.collection, new Date());

    // 연속이 끊겼는데 휴가권으로 살린 경우 티켓을 하나 쓴다
    const gap = s.lastCheckInDate ? daysBetween(s.lastCheckInDate, today) : 1;
    const usedVacation = gap === 2 && (s.vacationTickets || 0) > 0;

    const gainedXp = GAME_CONFIG.dailyBaseXp
      + (GAME_CONFIG.rarityBonusXp[med.rarity] || 0)
      + (milestone ? milestone.bonusXp || 0 : 0);

    const beforeLevel = levelFromXp(s.xp).level;

    // ---- 상태 갱신 ----
    s = loadState(); // 한 번 더 최신화
    if (s.awards[awardId]) return null; // 그 사이 다른 탭이 지급했다면 여기서 멈춘다

    const prev = s.collection[med.id];
    s.collection[med.id] = {
      count: (prev ? prev.count : 0) + 1,
      firstAt: prev ? prev.firstAt : Date.now(),
      lastAt: Date.now(),
    };
    s.xp += gainedXp;
    s.lastCheckInDate = today;
    s.currentStreak = streak;
    s.longestStreak = Math.max(s.longestStreak || 0, streak);
    s.totalCheckIns = (s.totalCheckIns || 0) + 1;
    if (usedVacation) s.vacationTickets = Math.max(0, (s.vacationTickets || 0) - 1);
    if (milestone && milestone.vacationTickets) {
      s.vacationTickets = (s.vacationTickets || 0) + milestone.vacationTickets;
    }
    s.awards[awardId] = true;
    saveState(s);

    const afterLevel = levelFromXp(s.xp).level;

    return {
      medicine: med,
      rarity: rarityOf(med.rarity),
      isNew: !prev,
      count: s.collection[med.id].count,
      gainedXp,
      streak,
      milestone,
      usedVacation,
      leveledUp: afterLevel > beforeLevel,
      level: afterLevel,
      levelTitle: titleForLevel(afterLevel),
    };
  }

  // ---------- 컬렉션 조회 ----------
  function getCollection() {
    const s = loadState();
    return MEDICINES.map((m) => {
      const owned = s.collection[m.id];
      return { ...m, owned: !!owned, count: owned ? owned.count : 0, firstAt: owned ? owned.firstAt : null };
    });
  }

  // ---------- Analytics ----------
  // GA4가 붙어 있으면 이벤트를 보내고, 없으면 아무 일도 하지 않는다.
  // 감정의 자유서술 내용 등 민감한 값은 절대 보내지 않는다(감정 '키'만 보낸다).
  function track(name, params) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
    } catch (e) { /* 측정 실패가 기능을 막지 않는다 */ }
  }

  // ---------- 홈: 오늘 기분 고르기 ----------
  // 처음 온 사람이 3초 안에 무엇을 할지 알 수 있도록, 감정 선택을 홈 맨 위로 꺼낸다.
  // 기존 감정 모달(#symptom-overlay)은 그대로 두고 여기서는 app.js가 이미 export해둔
  // launchEmotionFlow(key)만 부른다 — 그래서 app.js를 한 줄도 고치지 않는다.
  // 18종을 다 늘어놓으면 화면이 넘치므로 대표 8개만 먼저 보이고 나머지는 접어둔다(삭제 아님).
  const FEATURED_EMOTIONS = ['stress', 'exhausted', 'depression', 'loneliness',
    'anger', 'joy', 'excitement', 'ordinary'];

  const emotionSection = document.getElementById('home-emotion');
  let emotionsExpanded = false;

  function chipHtml(key, sym) {
    return `<button class="home-emo" type="button" data-emo="${key}">
      <span class="home-emo-icon">${sym.emoji}</span>
      <span class="home-emo-label">${sym.label}</span>
    </button>`;
  }

  function renderEmotionPicker() {
    if (!emotionSection) return;
    const Core = window.MaumjaroCore;
    const S = Core && Core.SYMPTOMS;
    if (!S || typeof Core.launchEmotionFlow !== 'function') return; // 훅이 없으면 조용히 비활성

    const featured = FEATURED_EMOTIONS.filter((k) => S[k]);
    const rest = Object.keys(S).filter((k) => !featured.includes(k));
    const shown = emotionsExpanded ? featured.concat(rest) : featured;

    emotionSection.innerHTML = `
      <h2 class="home-emo-title">오늘 기분 어때?</h2>
      <p class="home-emo-sub">오늘 마음 상태를 골라봐 💉</p>
      <div class="home-emo-grid">${shown.map((k) => chipHtml(k, S[k])).join('')}</div>
      <button class="home-emo-more" id="home-emo-more" type="button">
        ${emotionsExpanded ? '접기' : `다른 감정 보기 (${rest.length})`}
      </button>
    `;
    emotionSection.hidden = false;

    emotionSection.querySelectorAll('.home-emo').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.emo;
        track('emotion_selected', { emotion: key });
        track('prescription_started', { source: 'home' });
        Core.launchEmotionFlow(key); // 여기서부터는 기존 주사 흐름 그대로
      });
    });
    document.getElementById('home-emo-more').addEventListener('click', () => {
      emotionsExpanded = !emotionsExpanded;
      renderEmotionPicker();
    });
  }

  // ---------- 홈 패널 ----------
  const panel = document.getElementById('game-panel');

  function renderPanel() {
    if (!panel) return;
    const p = previewToday();
    const pct = Math.round((p.collectedCount / p.totalMedicines) * 100);
    const xpPct = Math.round((p.xpInto / p.xpNeed) * 100);

    const 다음보상 = p.nextMilestone
      ? `<p class="game-next">🎁 ${p.nextMilestone.days - p.streak}일 뒤 <strong>${p.nextMilestone.days}일 달성</strong> · ${p.nextMilestone.label}</p>`
      : '';
    const 오늘줄 = p.claimed
      ? '<span class="game-today done">✅ 오늘 마음약을 받았어요</span>'
      : '<span class="game-today">💊 오늘 처방하면 마음약 1개</span>';

    panel.innerHTML = `
      <div class="game-row">
        <div class="game-streak">
          <span class="game-streak-num">🔥 ${p.streak}</span>
          <span class="game-streak-label">일 연속</span>
        </div>
        <div class="game-side">
          ${오늘줄}
          <div class="game-lv">Lv.${p.level} ${p.levelTitle}</div>
          <div class="game-bar"><span style="width:${xpPct}%"></span></div>
        </div>
      </div>
      ${다음보상}
      <button class="game-pharmacy-btn" id="game-pharmacy-btn" type="button">
        💊 내 마음약국 <strong>${p.collectedCount}/${p.totalMedicines}</strong>
        <span class="game-pharmacy-pct">${pct}%</span>
      </button>
    `;
    panel.hidden = false;
    const btn = document.getElementById('game-pharmacy-btn');
    if (btn) btn.addEventListener('click', () => openPharmacy());
  }

  // ---------- 보상 개봉 ----------
  const rewardOverlay = document.getElementById('reward-overlay');
  const rewardStage = document.getElementById('reward-stage');
  const rewardResult = document.getElementById('reward-result');
  const rewardBox = document.getElementById('reward-box');
  const rewardCount = document.getElementById('reward-count');
  const rewardGuide = document.getElementById('reward-guide');
  const rewardEyebrow = document.getElementById('reward-eyebrow');
  const rewardSkip = document.getElementById('reward-skip');
  const rewardClose = document.getElementById('reward-close');
  const rewardShareBtn = document.getElementById('reward-share-btn');

  let taps = 0;
  let opening = false;
  let pendingReward = null;

  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 미지원이면 무시 */ }
  }
  function sound(name) {
    try {
      const C = window.MaumjaroCore;
      if (C && typeof C[name] === 'function') C[name]();
    } catch (e) { /* 소리는 없어도 된다 */ }
  }

  function openRewardFlow(result) {
    if (!rewardOverlay || !result) return;
    pendingReward = result;
    taps = 0;
    opening = false;
    rewardStage.hidden = false;
    rewardResult.hidden = true;
    rewardBox.className = 'reward-box';
    rewardCount.textContent = `0 / ${GAME_CONFIG.openTapCount}`;
    rewardGuide.textContent = '톡톡 두드려 열어보세요!';
    rewardEyebrow.textContent = result.milestone
      ? `🔥 ${result.streak}일 연속 달성! ${result.milestone.label}`
      : '🎁 오늘의 마음약이 도착했어요';
    rewardOverlay.hidden = false;
    track('reward_open_started', { streak: result.streak, level: result.level });
  }

  function tapBox() {
    if (opening || !pendingReward) return;
    taps += 1;
    rewardBox.classList.add(`tap-${Math.min(taps, GAME_CONFIG.openTapCount)}`);
    rewardCount.textContent = `${Math.min(taps, GAME_CONFIG.openTapCount)} / ${GAME_CONFIG.openTapCount}`;
    buzz(12);
    sound('playInjectPress');
    if (taps >= GAME_CONFIG.openTapCount) revealReward();
  }

  function revealReward() {
    if (opening || !pendingReward) return;
    opening = true;
    rewardBox.classList.add('is-open');
    sound('playReadyChime');
    const r = pendingReward;
    if (r.rarity.order >= 3) { buzz([18, 40, 28]); }
    setTimeout(() => showRewardResult(r), 620);
  }

  function showRewardResult(r) {
    rewardStage.hidden = true;
    rewardResult.hidden = false;
    const rarityEl = document.getElementById('reward-rarity');
    rarityEl.textContent = r.rarity.label;
    rarityEl.style.color = r.rarity.color;
    rarityEl.style.background = r.rarity.tint;
    document.getElementById('reward-icon').textContent = r.medicine.icon;
    document.getElementById('reward-name').textContent = r.medicine.name;
    document.getElementById('reward-desc').textContent = r.medicine.description;

    const parts = [];
    parts.push(r.isNew ? '<span class="reward-new">NEW</span>' : `보유 ×${r.count}`);
    parts.push(`+${r.gainedXp} XP`);
    if (r.leveledUp) parts.push(`🎉 Lv.${r.level} ${r.levelTitle}`);
    if (r.usedVacation) parts.push('🛡️ 마음휴가권 사용');
    document.getElementById('reward-meta').innerHTML = parts.join(' · ');

    const shareable = r.rarity.order >= rarityOrder(GAME_CONFIG.shareMinRarity);
    rewardShareBtn.hidden = !shareable;

    sound('playHealingChime');
    renderPanel();
    track('reward_open_completed', { rarity: r.rarity.key, medicine_id: r.medicine.id, streak: r.streak });
    track('medicine_obtained', { rarity: r.rarity.key, medicine_id: r.medicine.id, is_new: r.isNew ? 1 : 0 });
    if (shareable) track('rare_medicine_obtained', { rarity: r.rarity.key, medicine_id: r.medicine.id });
    if (r.milestone) track('streak_milestone', { streak_days: r.streak });
  }

  function closeReward() {
    if (rewardOverlay) rewardOverlay.hidden = true;
    pendingReward = null;
  }

  if (rewardBox) rewardBox.addEventListener('click', tapBox);
  if (rewardSkip) rewardSkip.addEventListener('click', revealReward);
  if (rewardClose) rewardClose.addEventListener('click', closeReward);
  if (rewardShareBtn) {
    rewardShareBtn.addEventListener('click', () => {
      const r = pendingReward;
      if (!r) return;
      const text = `오늘 나 이거 뽑음ㅋㅋ\n${r.rarity.label} 💊 ${r.medicine.name}\n"${r.medicine.description}"\n\n너도 오늘의 마음약 뽑아봐 →`;
      const url = `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
      track('reward_shared', { rarity: r.rarity.key, medicine_id: r.medicine.id });
      try {
        const Rx = window.MaumjaroRx;
        if (Rx && typeof Rx.shareOrCopy === 'function') Rx.shareOrCopy(text, url);
        else if (navigator.share) navigator.share({ text: `${text}\n${url}` });
      } catch (e) { /* 공유 실패는 조용히 넘어간다 */ }
    });
  }

  // ---------- 내 마음약국 ----------
  const pharmacyOverlay = document.getElementById('pharmacy-overlay');
  let pharmacyFilter = 'all';

  function openPharmacy() {
    if (!pharmacyOverlay) return;
    pharmacyOverlay.hidden = false;
    renderPharmacy();
    track('collection_viewed', {});
  }
  function renderPharmacy() {
    const list = getCollection();
    const owned = list.filter((m) => m.owned).length;
    document.getElementById('pharmacy-progress').innerHTML =
      `보유 마음약 <strong>${owned}</strong> / ${list.length}`;

    const filters = [{ key: 'all', label: '전체' }].concat(
      G.MED_CATEGORIES.map((c) => ({ key: c.key, label: `${c.emoji} ${c.label}` }))
    );
    document.getElementById('pharmacy-filters').innerHTML = filters.map((f) => `
      <button class="pharmacy-filter${pharmacyFilter === f.key ? ' active' : ''}" data-f="${f.key}" type="button">${f.label}</button>
    `).join('');

    const shown = pharmacyFilter === 'all' ? list : list.filter((m) => m.category === pharmacyFilter);
    document.getElementById('pharmacy-grid').innerHTML = shown.map((m) => {
      const r = rarityOf(m.rarity);
      if (!m.owned) {
        return `<div class="med-card locked">
          <div class="med-icon">🔒</div>
          <div class="med-name">???</div>
          <div class="med-hint">${m.hint}</div>
        </div>`;
      }
      return `<div class="med-card" style="--r:${r.color};background:${r.tint};">
        <div class="med-rarity" style="color:${r.color};">${r.label}</div>
        <div class="med-icon">${m.icon}</div>
        <div class="med-name">${m.name}</div>
        <div class="med-hint">${m.description}</div>
        ${m.count > 1 ? `<div class="med-count">×${m.count}</div>` : ''}
      </div>`;
    }).join('');

    document.getElementById('pharmacy-filters').querySelectorAll('.pharmacy-filter').forEach((b) => {
      b.addEventListener('click', () => { pharmacyFilter = b.dataset.f; renderPharmacy(); });
    });
  }
  const pharmacyCloseBtn = document.getElementById('pharmacy-close');
  if (pharmacyCloseBtn) pharmacyCloseBtn.addEventListener('click', () => { pharmacyOverlay.hidden = true; });

  // ---------- 처방 완료 → 출석 ----------
  // 별도의 출석 버튼은 만들지 않는다. 그날 첫 처방이 끝나는 순간이 곧 출석이다.
  // app.js의 감정 처방은 완료 후 치유 오버레이를 3.7초 보여주므로, 그 뒤에 보상을 연다.
  function onPrescriptionCompleted(delayMs) {
    setTimeout(() => {
      const result = claimDailyReward();
      if (!result) { renderPanel(); return; } // 오늘 이미 받았으면 조용히 지나간다
      track('daily_checkin_completed', { streak_days: result.streak, level: result.level });
      openRewardFlow(result);
    }, delayMs);
  }

  document.addEventListener('maumjaro:emotion-injected', (e) => {
    track('prescription_completed', { source: 'emotion', emotion: (e.detail && e.detail.key) || '' });
    onPrescriptionCompleted(3900);
  });
  document.addEventListener('maumjaro:rx-injected', (e) => {
    track('prescription_completed', { source: (e.detail && e.detail.category) || 'rx' });
    onPrescriptionCompleted(1200);
  });

  // ---------- 현재 카테고리 표시 ----------
  // .active 토글은 app.js가 이미 하고 있으므로(app.js는 무수정), 여기서는 그 변화를
  // 지켜보다가 접근성 속성만 맞춰준다. 버튼 클릭이 아니라 클래스 변화를 보기 때문에
  // 코드가 프로그램적으로 탭을 옮기는 경우(친구 처방 수신, "나도 타로 보기" 등)도 모두 잡힌다.
  //
  // 이 앱은 URL 라우팅이 없다. 대신 화면 전환이 전부 .tab-btn 클릭 한 곳을 지나가므로
  // ACTIVE와 실제 보이는 화면은 구조적으로 어긋날 수 없다.
  const TAB_CATEGORY = {
    home: 'prescription',        // 마음처방(핵심 루프) + 친구가 보낸 처방/운세/타로 수신
    rx: 'prescription_center',   // 처방센터 · 커스텀 처방전 · 친구에게 보내기
    fortune: 'fortune',          // 오늘의 운세 · 타로 · 토정비결 · 맘운 · AI맘운
    history: 'record',
  };
  let lastCategory = null;

  function syncActiveNav(fireEvent) {
    const btns = document.querySelectorAll('.tab-btn');
    let current = null;
    btns.forEach((b) => {
      const on = b.classList.contains('active');
      // 색으로만 알리지 않는다 — 보조기기에는 aria-current로 현재 위치를 알린다.
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
      if (on) current = TAB_CATEGORY[b.dataset.view] || b.dataset.view;
    });
    if (current && current !== lastCategory) {
      if (fireEvent && lastCategory) {
        track('navigation_category_selected', { category: current, previous_category: lastCategory });
      }
      lastCategory = current;
    }
  }

  const tabbar = document.querySelector('.tabbar');
  if (tabbar) {
    syncActiveNav(false); // 첫 진입 상태를 맞춰두고, 그때는 이벤트를 보내지 않는다
    new MutationObserver(() => syncActiveNav(true))
      .observe(tabbar, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // ---------- 나머지 이벤트 (app.js를 고치지 않고 위임 리스너로 붙인다) ----------
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const chip = t.closest('.symptom-chip');
    if (chip) {
      // 감정 '키'만 보낸다. 자유서술이나 개인 정보는 절대 보내지 않는다.
      track('emotion_selected', { emotion: chip.dataset.key || chip.dataset.symptom || '' });
      return;
    }
    if (t.closest('#symptom-confirm-btn, #prepare-btn')) { track('prescription_started', { source: 'emotion' }); return; }
    if (t.closest('#today-rx-btn')) { track('prescription_started', { source: 'today_card' }); return; }
    if (t.closest('#rx-friend-share-btn')) { track('friend_prescription_shared', {}); return; }
    if (t.closest('#tarot-share-btn')) { track('reward_shared', { source: 'tarot' }); }
  }, true);

  // 친구가 보낸 링크로 들어온 경우
  (function trackInviteOpen() {
    const q = new URLSearchParams(location.search);
    const kind = q.get('custom') ? 'custom' : q.get('maumun') ? 'maumun' : (q.get('t') || q.get('tarot')) ? 'tarot' : '';
    if (kind) track('friend_invite_opened', { source: kind });
  })();

  renderEmotionPicker();
  renderPanel();

  window.MaumjaroGame = {
    track,
    renderPanel,
    openPharmacy,
    previewToday,
    claimDailyReward,
    getCollection,
    getState: loadState,
    rarityOf,
    medicineOf,
    levelFromXp,
    titleForLevel,
    // 테스트·디버그용(개발 중 상태를 되돌릴 때만 쓴다)
    _reset() { localStorage.removeItem(STATE_KEY); },
  };
})();
