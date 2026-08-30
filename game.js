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
      checkInDays: [],       // 출석한 날짜들('YYYY-MM-DD'). 기록 탭 달력에 쓴다
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
      const merged = { ...defaultState(), ...s, collection: s.collection || {}, awards: s.awards || {},
        checkInDays: Array.isArray(s.checkInDays) ? s.checkInDays : [] };
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

  // 지금 이 시점에 시즌 한정 마음약을 얻을 수 있는지.
  // 요일(weekday)·월(months)·기간(availableFrom~Until) 중 지정된 조건만 검사한다.
  function inSeason(m, now) {
    if (!m.limited) return true;
    const d = now || new Date();
    if (typeof m.weekday === 'number' && d.getDay() !== m.weekday) return false;
    if (Array.isArray(m.months) && !m.months.includes(d.getMonth() + 1)) return false;
    if (m.availableFrom && d.getTime() < new Date(m.availableFrom).getTime()) return false;
    if (m.availableUntil && d.getTime() > new Date(m.availableUntil).getTime()) return false;
    return true;
  }
  function availableMedicines(now) {
    return MEDICINES.filter((m) => inSeason(m, now));
  }

  // 같은 약을 여러 번 얻었을 때의 등급. 중복이 꽝으로 느껴지지 않게 하는 장치다.
  function duplicateTierOf(count) {
    const tiers = GAME_CONFIG.duplicateTiers || [];
    let hit = null;
    tiers.forEach((t) => { if (count >= t.count) hit = t; });
    return hit;
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
    if (!s.checkInDays.includes(today)) s.checkInDays.push(today);
    // 달력은 최근 것만 보여주므로 무한정 쌓지 않는다(약 1년치).
    if (s.checkInDays.length > 400) s.checkInDays = s.checkInDays.slice(-400);
    if (usedVacation) s.vacationTickets = Math.max(0, (s.vacationTickets || 0) - 1);
    if (milestone && milestone.vacationTickets) {
      s.vacationTickets = (s.vacationTickets || 0) + milestone.vacationTickets;
    }
    s.awards[awardId] = true;
    saveState(s);

    const afterLevel = levelFromXp(s.xp).level;
    const count = s.collection[med.id].count;

    return {
      medicine: med,
      rarity: rarityOf(med.rarity),
      isNew: !prev,
      count,
      dupTier: duplicateTierOf(count),
      gainedXp,
      streak,
      milestone,
      usedVacation,
      vacationTickets: s.vacationTickets || 0,
      // 보너스 박스는 같은 씨앗을 쓰되 다른 문자열을 섞어, 재실행해도 결과가 같게 한다
      bonus: GAME_CONFIG.bonusBoxEnabled
        && mulberry32(hashStr(`${s.salt}|bonus|${today}`))() < GAME_CONFIG.bonusBoxChance,
      leveledUp: afterLevel > beforeLevel,
      level: afterLevel,
      levelTitle: titleForLevel(afterLevel),
    };
  }

  // 보너스 박스 수령(별도 멱등 키). 오늘 한 번만.
  function claimBonusBox() {
    const today = todayKey();
    const awardId = `bonus:${today}`;
    const s = loadState();
    if (s.awards[awardId]) return null;
    s.xp += GAME_CONFIG.bonusBoxXp;
    s.vacationTickets = (s.vacationTickets || 0) + 1;
    s.awards[awardId] = true;
    saveState(s);
    return { xp: GAME_CONFIG.bonusBoxXp, vacationTickets: s.vacationTickets };
  }

  // ---------- 컬렉션 조회 ----------
  function getCollection() {
    const s = loadState();
    const now = new Date();
    return MEDICINES.map((m) => {
      const owned = s.collection[m.id];
      return {
        ...m,
        owned: !!owned,
        count: owned ? owned.count : 0,
        firstAt: owned ? owned.firstAt : null,
        available: inSeason(m, now), // 시즌이 지나면 새로 얻을 수 없다(이미 얻은 건 그대로 남는다)
        dupTier: owned ? duplicateTierOf(owned.count) : null,
      };
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
  // 대표 4개만 먼저 보이고 나머지 14개는 접어둔다(삭제 아님).
  // 선택지가 많으면 고르는 것 자체가 일이 되어 첫 행동이 늦어진다. 가장 자주 고를 만한
  // 넷(부정 둘 · 긍정 하나 · 중립 하나)만 남겨 3초 안에 손이 나가게 한다.
  // 접었을 때 홈에 보이는 감정. 가장 많이 고를 4개만 한 줄로 둔다.
  // 여기를 늘리면 줄이 늘어난 만큼 주사기가 작아진다 — 주사기가 이 앱의 얼굴이므로
  // 접힌 상태는 반드시 한 줄(4개)로 유지한다. 나머지는 "다른 감정 보기"에서 본다.
  const FEATURED_EMOTIONS = ['stress', 'exhausted', 'joy', 'ordinary'];

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
      <h2 class="home-emo-title">오늘 기분 어때? 💉</h2>
      <div class="home-emo-grid">${shown.map((k) => chipHtml(k, S[k])).join('')}</div>
      <button class="home-emo-more" id="home-emo-more" type="button">
        ${emotionsExpanded ? '접기' : `다른 감정 보기 (${rest.length})`}
      </button>
    `;
    emotionSection.hidden = false;

    emotionSection.querySelectorAll('.home-emo').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.emo;
        track('home_primary_cta_clicked', { emotion: key }); // 홈의 첫 행동이 무엇인지 본다
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

  // ---------- 홈 상단 한 줄 티저 ----------
  // 첫 화면에서 "지금 며칠째인지 + 오늘 뭘 받는지"만 알려준다.
  // 전체 게임 패널(레벨·컬렉션 등)은 CTA 아래에 그대로 둬서, 상단이 RPG처럼 보이지 않게 한다.
  const teaser = document.getElementById('home-teaser');
  const firstGuide = document.getElementById('first-guide');

  function renderTeaser() {
    if (!teaser) return;
    const p = previewToday();
    if (p.claimed) {
      const 다음 = p.nextMilestone
        ? `내일 오면 🔥 ${p.streak + 1}일`
        : `내일 오면 🔥 ${p.streak + 1}일`;
      teaser.className = 'home-teaser done';
      teaser.innerHTML = `✅ 오늘 마음처방 완료 <span class="t-sep">·</span> ${다음}`;
    } else if (p.totalCheckIns === 0) {
      teaser.className = 'home-teaser';
      teaser.innerHTML = '🎁 오늘 첫 마음약을 받을 수 있어요';
    } else {
      // 오늘 처방하면 몇 일째가 되고 무엇이 확정인지 미리 알려준다
      const 예정 = streakRewardFor(p.streak);
      const 보상문구 = 예정 ? `<strong>${예정.label}</strong>` : '마음약 1개';
      teaser.className = 'home-teaser';
      teaser.innerHTML = `🔥 ${p.streak - 1}일 연속 <span class="t-sep">·</span> 오늘 처방하면 ${보상문구}`;
    }
    teaser.hidden = false;
    track('reward_tease_viewed', { claimed: p.claimed ? 1 : 0, streak: p.streak });

    // 처음 온 사람에게만 흐름을 한 줄로 알려준다(팝업 튜토리얼은 만들지 않는다)
    if (firstGuide) {
      if (p.totalCheckIns === 0) {
        firstGuide.innerHTML = '<b>①</b> 기분 고르기 → <b>②</b> 마음처방 → <b>③</b> 상자 열고 마음약 받기';
        firstGuide.hidden = false;
      } else {
        firstGuide.hidden = true;
      }
    }
  }

  // ---------- 홈 마음약국 진행률 (CTA 바로 아래) ----------
  // 접힘선 아래에 있으면 "모을 게 남았다"는 감각이 첫 화면에서 전달되지 않는다.
  const homeCollection = document.getElementById('home-collection');

  function renderHomeCollection() {
    if (!homeCollection) return;
    const p = previewToday();
    const pct = Math.round((p.collectedCount / p.totalMedicines) * 100);

    // 아직 한 알도 없는 사람에게는 이 카드를 아예 보여주지 않는다.
    // "0/46 · 0% · 🔒..."가 첫인사가 되면 시작하기도 전에 못 모은 것부터 보게 된다.
    // 첫 마음약을 받는 순간부터 진행률이 의미를 갖는다.
    if (p.collectedCount === 0) {
      homeCollection.hidden = true;
      return;
    }

    // 잠긴 약 힌트도 여기서 보여준다(게임 패널에 있던 중복 카드는 없앴다).
    homeCollection.innerHTML = `
      <span class="hc-top">💊 내 마음약국
        <strong>${p.collectedCount}/${p.totalMedicines}</strong>
        <span class="hc-pct">${pct}%</span></span>
      <span class="hc-bar"><i style="width:${pct}%"></i></span>
      ${lockedTeaseHtml()}
    `;
    homeCollection.hidden = false;
  }
  if (homeCollection) {
    homeCollection.addEventListener('click', () => {
      track('reward_preview_clicked', {});
      track('collection_progress_clicked', { source: 'home' });
      openPharmacy();
    });
  }

  // ---------- 도착한 처방 접이식 줄 ----------
  // 카드가 2개 이상이면 홈 최상단을 다 먹으므로 한 줄로 접는다.
  // 1개일 때는 중요한 알림이라 그대로 펼쳐 둔다(탭을 하나 더 요구하면 확인율이 떨어진다).
  const incomingIds = ['custom-incoming-card', 'friend-maumun-incoming-card', 'friend-tarot-incoming-card'];
  const incomingStack = document.getElementById('incoming-stack');
  const incomingSummary = document.getElementById('incoming-summary');
  let incomingExpanded = false;

  function syncIncoming() {
    if (!incomingStack || !incomingSummary) return;
    const visible = incomingIds
      .map((id) => document.getElementById(id))
      .filter((el) => el && !el.hidden);
    if (visible.length >= 2 && !incomingExpanded) {
      incomingStack.style.display = 'none';
      incomingSummary.innerHTML = `💌 도착한 처방 <strong>${visible.length}개</strong><span class="is-arrow">펼치기 ›</span>`;
      incomingSummary.hidden = false;
    } else {
      incomingStack.style.display = '';
      incomingSummary.hidden = true;
    }
  }
  if (incomingSummary) {
    incomingSummary.addEventListener('click', () => {
      incomingExpanded = true;
      syncIncoming();
      track('incoming_expanded', {});
    });
  }
  if (incomingStack) {
    new MutationObserver(syncIncoming)
      .observe(incomingStack, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    syncIncoming();
  }

  // ---------- 홈 패널 ----------
  const panel = document.getElementById('game-panel');

  // 아직 못 얻은 마음약을 두 개만 살짝 보여준다.
  // "남은 게 있다"는 감각이 있어야 모으고 싶어진다(전부 나열하면 부담스럽다).
  function lockedTeaseHtml() {
    const locked = getCollection().filter((m) => !m.owned && m.available);
    if (!locked.length) return '';
    const pick = locked.slice(0, 2);
    return `<span class="gp-locked">${pick.map((m) => `🔒 ${m.hint}`).join(' · ')}</span>`;
  }

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
      ${p.vacationTickets > 0
        ? `<p class="game-vacation">🛡️ 마음휴가권 ×${p.vacationTickets} · 하루 빠져도 연속이 지켜져요</p>`
        : ''}
      <button class="game-report-btn" id="game-report-btn" type="button">📊 이번 달의 나 보기</button>
    `;
    panel.hidden = false;
    const rep = document.getElementById('game-report-btn');
    if (rep) rep.addEventListener('click', () => openMonthlyReport());
  }

  // ---------- 기록 탭: 게임 진행 현황 ----------
  // "내가 얼마나 해왔는지"가 눈에 보여야 계속할 이유가 생긴다.
  // 최근 4주 출석 달력 + 연속/최고/누적 + 레벨 + 컬렉션을 한 화면에 모은다.
  function renderHistoryGamePanel() {
    const el = document.getElementById('history-game-panel');
    if (!el) return;
    const p = previewToday();
    const s = loadState();
    const done = new Set(s.checkInDays || []);

    // 오늘을 마지막 칸으로 두고 4주(28일)를 그린다
    const cells = [];
    for (let i = 27; i >= 0; i--) {
      const key = shiftDays(todayKey(), -i);
      cells.push({ key, on: done.has(key), today: i === 0, day: Number(key.slice(-2)) });
    }
    const xpPct = Math.round((p.xpInto / p.xpNeed) * 100);
    const colPct = Math.round((p.collectedCount / p.totalMedicines) * 100);

    el.innerHTML = `
      <div class="hg-head">
        <span class="hg-streak">🔥 ${p.streak}일 연속</span>
        <span class="hg-sub">최고 ${p.longestStreak}일 · 누적 ${p.totalCheckIns}일</span>
      </div>
      <div class="hg-cal">${cells.map((c) => `
        <span class="hg-cell${c.on ? ' on' : ''}${c.today ? ' today' : ''}" title="${c.key}">${c.day}</span>
      `).join('')}</div>
      <div class="hg-row">
        <span class="hg-label">Lv.${p.level} ${p.levelTitle}</span>
        <span class="hg-bar"><i style="width:${xpPct}%"></i></span>
        <span class="hg-val">${p.xpInto}/${p.xpNeed}</span>
      </div>
      <div class="hg-row">
        <span class="hg-label">💊 마음약국</span>
        <span class="hg-bar"><i class="col" style="width:${colPct}%"></i></span>
        <span class="hg-val">${p.collectedCount}/${p.totalMedicines}</span>
      </div>
      ${p.vacationTickets > 0 ? `<p class="hg-note">🛡️ 마음휴가권 ×${p.vacationTickets}</p>` : ''}
      ${p.nextMilestone ? `<p class="hg-note">🎁 ${p.nextMilestone.days - p.streak}일 뒤 ${p.nextMilestone.days}일 달성 · ${p.nextMilestone.label}</p>` : ''}
    `;
    el.hidden = false;
    // 마음약국으로 들어가는 입구는 기록 탭의 '마음약' 카테고리 타일 하나로 통일한다.
    // 여기 진행바는 같은 숫자를 두 번 보여주지 않도록 표시 전용으로 둔다.
  }

  // ---------- 월간 감정 리포트 ----------
  // 감정 종류는 app.js가 쓰는 rxRecords의 prescriptionId('emotion-joy' 형태)에 들어 있다.
  // 이 파일은 그 키를 읽기만 하고 쓰지 않는다.
  function monthlyReport() {
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    let rx = [];
    try { rx = JSON.parse(localStorage.getItem('maumjaro:rxRecords') || '[]'); } catch (e) { rx = []; }
    const Core = window.MaumjaroCore;
    const S = (Core && Core.SYMPTOMS) || {};

    const thisMonth = rx.filter((r) => {
      const d = new Date(r.ts);
      return d.getFullYear() === y && d.getMonth() === mo;
    });
    const counts = {};
    thisMonth.forEach((r) => {
      if (r.category !== 'emotion') return;
      const key = String(r.prescriptionId || '').replace(/^emotion-/, '');
      if (!S[key]) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const top = Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 3)
      .map((k) => ({ key: k, label: S[k].label, emoji: S[k].emoji, n: counts[k],
        pct: total ? Math.round((counts[k] / total) * 100) : 0 }));

    const s = loadState();
    const newThisMonth = Object.keys(s.collection).filter((id) => {
      const d = new Date(s.collection[id].firstAt || 0);
      return d.getFullYear() === y && d.getMonth() === mo;
    }).length;

    return { month: mo + 1, total: thisMonth.length, emotionTotal: total, top,
      longestStreak: s.longestStreak || 0, newMedicines: newThisMonth };
  }

  function openMonthlyReport() {
    const r = monthlyReport();
    const ov = document.getElementById('report-overlay');
    if (!ov) return;
    const 요약 = r.total === 0
      ? '이번 달 기록이 아직 없어요. 오늘 첫 처방을 남겨보세요.'
      : r.total >= 20 ? '이번 달도 꽤 잘 버텼어요.'
      : r.total >= 10 ? '꾸준히 마음을 챙기고 있어요.'
      : '조금씩 쌓이고 있어요.';
    document.getElementById('report-body').innerHTML = `
      <div class="report-title">${r.month}월의 나</div>
      ${r.top.length ? `
        <div class="report-sec">가장 많이 고른 감정</div>
        ${r.top.map((t) => `
          <div class="report-row">
            <span>${t.emoji} ${t.label}</span>
            <span class="report-bar"><i style="width:${t.pct}%"></i></span>
            <strong>${t.pct}%</strong>
          </div>`).join('')}
      ` : ''}
      <div class="report-stats">
        <div><strong>${r.total}</strong><span>이번 달 처방</span></div>
        <div><strong>${r.longestStreak}</strong><span>최장 연속</span></div>
        <div><strong>${r.newMedicines}</strong><span>새 마음약</span></div>
      </div>
      <p class="report-quote">“${요약}”</p>
    `;
    ov.hidden = false;
    track('monthly_report_viewed', { total: r.total });
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

  // 캡슐 계열 효과음(sfx.js). 없어도 개봉 흐름은 그대로 굴러가야 한다.
  function sfx(name, arg) {
    try {
      const S = window.MaumjaroSfx;
      if (S && typeof S[name] === 'function') S[name](arg);
    } catch (e) { /* 소리는 없어도 된다 */ }
  }

  function openRewardFlow(result) {
    if (!rewardOverlay || !result) return;
    pendingReward = result;
    taps = 0;
    opening = false;
    rewardStage.hidden = false;
    rewardResult.hidden = true;
    // 3·7·14·30일은 상자부터 다르게 보여준다(평소와 같은 화면이면 달성감이 없다).
    rewardBox.className = 'reward-box' + (result.milestone ? ' is-special' : '');
    rewardCount.textContent = `0 / ${GAME_CONFIG.openTapCount}`;
    rewardGuide.textContent = '톡톡 두드려 열어보세요!';
    rewardEyebrow.textContent = result.milestone
      ? `🔥 ${result.streak}일 연속 달성! ${result.milestone.label}`
      : '🎁 오늘의 마음약이 도착했어요';
    rewardOverlay.hidden = false;
    // 두드리는 동안 공유 이미지를 미리 만들어 둔다(캡처가 4초쯤 걸리기 때문)
    if (result.rarity.order >= rarityOrder(GAME_CONFIG.shareMinRarity)) buildShareImage(result);
    track('reward_open_started', { streak: result.streak, level: result.level });
  }

  function tapBox() {
    if (opening || !pendingReward) return;
    taps += 1;
    rewardBox.classList.add(`tap-${Math.min(taps, GAME_CONFIG.openTapCount)}`);
    rewardCount.textContent = `${Math.min(taps, GAME_CONFIG.openTapCount)} / ${GAME_CONFIG.openTapCount}`;
    buzz(12);
    // 두드릴수록 금이 깊어지는 소리(단계를 넘겨 세기를 키운다).
    // 예전엔 주사 누르는 톤이라 "두드린다"는 느낌이 없었다.
    sfx('capsuleTap', taps);
    if (taps >= GAME_CONFIG.openTapCount) revealReward();
  }

  function revealReward() {
    if (opening || !pendingReward) return;
    opening = true;
    const r = pendingReward;
    // 등급이 올라갈수록 퍼짐이 커진다(길이는 모두 짧게 유지)
    rewardBox.classList.add('is-open', `burst-${r.rarity.key}`);
    sfx('capsuleCrack');          // 캡슐이 쩍 갈라지는 소리
    sound('playReadyChime');      // 그 위에 보상 획득 여운을 겹친다
    buzz(r.rarity.order >= 3 ? [18, 40, 28] : 26);
    // LEGENDARY만 화면 전체가 한 번 번쩍인다
    if (r.rarity.key === 'legendary') {
      const flash = document.createElement('div');
      flash.className = 'reward-flash';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 900);
    }
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
    if (r.isNew) parts.push('<span class="reward-new">NEW</span>');
    else if (r.dupTier) parts.push(`<span class="reward-dup" style="color:${r.dupTier.color};border-color:${r.dupTier.color};">${r.dupTier.label} ×${r.count}</span>`);
    else parts.push(`보유 ×${r.count}`);
    parts.push(`+${r.gainedXp} XP`);
    if (r.leveledUp) parts.push(`🎉 Lv.${r.level} ${r.levelTitle}`);
    if (r.usedVacation) parts.push('🛡️ 마음휴가권 사용');
    if (r.medicine.limited) parts.push(`✨ ${r.medicine.season} 한정`);
    document.getElementById('reward-meta').innerHTML = parts.join(' · ');

    // 보너스 박스: 낮은 확률로 한 번 더. 오늘 한 번만 지급된다.
    const bonusEl = document.getElementById('reward-bonus');
    if (r.bonus) {
      const got = claimBonusBox();
      if (got) {
        bonusEl.innerHTML = `🎁 <strong>BONUS BOX!</strong> +${got.xp} XP · 🛡️ 마음휴가권 ×1`;
        bonusEl.hidden = false;
        track('bonus_box_opened', { streak: r.streak });
      } else { bonusEl.hidden = true; }
    } else { bonusEl.hidden = true; }

    const shareable = r.rarity.order >= rarityOrder(GAME_CONFIG.shareMinRarity);
    rewardShareBtn.hidden = !shareable; // 이미지는 상자를 열 때 이미 만들기 시작했다
    // 등급에 맞는 문구로 바꾼다(데이터에서 온다)
    if (shareable) rewardShareBtn.textContent = r.rarity.shareLabel || '📤 자랑하기';
    const copyBtn = document.getElementById('reward-copy-btn');
    if (copyBtn) copyBtn.hidden = !shareable; // 메인 CTA 하나 + 보조 하나만 둔다

    sound('playHealingChime');
    renderPanel();
    renderTeaser(); // 보상을 받은 뒤 상단 줄도 "오늘 완료"로 바뀌어야 한다
    renderHomeCollection(); // 방금 얻은 마음약이 진행률에 바로 반영되게
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
  // 공유 이미지를 미리 만들어 둔다(타로 공유와 같은 이유).
  // iOS는 navigator.share()가 "사용자가 누른 직후"에만 열리므로, 버튼을 누른 뒤에
  // 캡처를 시작하면 그 사이 제스처 권한이 만료돼 공유 시트가 뜨지 않는다.
  let shareBlob = null;
  // 상자를 열기 시작할 때 미리 찍는다. 사용자가 다섯 번 두드리고 결과를 읽는 동안
  // 캡처가 끝나 있어야, 공유 버튼을 눌렀을 때 기다림 없이 바로 공유 시트가 열린다
  // (iOS는 사용자가 누른 직후에만 공유 시트를 열어준다).
  async function buildShareImage(r) {
    shareBlob = null;
    const node = document.getElementById('med-share-capture');
    if (!node || !r) return;
    // 캡처 라이브러리는 첫 화면을 막지 않으려고 나중에 받는다. 여기서 준비를 기다린다.
    if (typeof window.html2canvas !== 'function' && window.MaumjaroLib) {
      await window.MaumjaroLib.html2canvas();
    }
    if (typeof window.html2canvas !== 'function') return;
    const rar = r.rarity;
    node.style.setProperty('--rar', rar.color);
    document.getElementById('med-share-rarity').textContent = rar.label;
    document.getElementById('med-share-rarity').style.color = rar.color;
    document.getElementById('med-share-icon').textContent = r.medicine.icon;
    document.getElementById('med-share-name').textContent = r.medicine.name;
    document.getElementById('med-share-desc').textContent = r.medicine.description;
    window.html2canvas(node, { backgroundColor: '#fffaf3', scale: 2, imageTimeout: 6000 })
      .then((c) => new Promise((res) => c.toBlob(res, 'image/png')))
      .then((b) => { shareBlob = b; })
      .catch(() => { shareBlob = null; });
  }

  function shareText(r) {
    // 첫 줄은 등급에 맞춘다. NORMAL까지 공유를 열면서 흔한 약에도 "나 이거 뽑음ㅋㅋ"이
    // 나가는데, 버튼 문구("💌 친구에게 보내기")와 톤이 어긋난다.
    const opener = r.rarity.order >= rarityOrder('rare')
      ? '오늘 나 이거 뽑음ㅋㅋ'
      : '오늘 내 마음약 이거 나왔어';
    // 설명에 이미 따옴표가 들어 있는 약이 있어서, 바깥에 또 감싸면 ""처럼 겹쳐 보인다.
    return [
      opener,
      `${r.rarity.label} ${r.medicine.icon} ${r.medicine.name}`,
      r.medicine.description,
      '',
      '너도 오늘의 마음약 뽑아봐 →',
    ].join('\n');
  }

  if (rewardShareBtn) {
    rewardShareBtn.addEventListener('click', async () => {
      const r = pendingReward;
      if (!r) return;
      const text = shareText(r);
      const url = `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
      // 링크는 반드시 text 안에 넣는다. navigator.share의 url 필드로 따로 넘기면
      // 카카오톡이 텍스트만 가져가고 링크를 버려서, 친구가 들어올 방법이 사라진다.
      const full = `${text}\n${url}`;
      track('reward_shared', { rarity: r.rarity.key, medicine_id: r.medicine.id });

      try {
        if (shareBlob && navigator.canShare) {
          const file = new File([shareBlob], '맘운자로_마음약.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: full, title: '오늘의 마음약' });
            return;
          }
        }
        if (navigator.share) { await navigator.share({ text: full }); return; }
        await navigator.clipboard.writeText(full);
        const C = window.MaumjaroCore;
        if (C && C.showToast) C.showToast('공유 문구를 복사했어요 📋');
      } catch (e) {
        if (e && e.name === 'AbortError') return; // 사용자가 공유 시트를 닫음
        try {
          await navigator.clipboard.writeText(full);
          const C = window.MaumjaroCore;
          if (C && C.showToast) C.showToast('공유 문구를 복사했어요 📋');
        } catch (e2) { /* 여기까지 실패하면 조용히 넘어간다 */ }
      }
    });
  }

  const copyOnlyBtn = document.getElementById('reward-copy-btn');
  if (copyOnlyBtn) {
    copyOnlyBtn.addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
      try {
        await navigator.clipboard.writeText(url);
        const C = window.MaumjaroCore;
        if (C && C.showToast) C.showToast('링크를 복사했어요 📋');
        track('reward_shared', { method: 'copy' });
      } catch (e) { /* 복사 실패는 조용히 넘어간다 */ }
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
        // 시즌이 지난 한정판은 "지금은 못 얻는다"는 걸 알려준다(그냥 잠금과 다르다).
        return `<div class="med-card locked${m.limited && !m.available ? ' out-season' : ''}">
          <div class="med-icon">${m.limited && !m.available ? '⏳' : '🔒'}</div>
          <div class="med-name">???</div>
          <div class="med-hint">${m.hint}</div>
        </div>`;
      }
      const tier = m.dupTier;
      return `<div class="med-card" style="--r:${r.color};background:${r.tint};">
        <div class="med-rarity" style="color:${r.color};">${r.label}</div>
        <div class="med-icon">${m.icon}</div>
        <div class="med-name">${m.name}</div>
        <div class="med-hint">${m.description}</div>
        ${m.limited ? `<div class="med-season">✨ ${m.season} 한정</div>` : ''}
        ${m.count > 1 ? `<div class="med-count"${tier ? ` style="color:${tier.color};"` : ''}>×${m.count}</div>` : ''}
        ${tier ? `<div class="med-tier" style="color:${tier.color};border-color:${tier.color};">${tier.label}</div>` : ''}
      </div>`;
    }).join('');

    document.getElementById('pharmacy-filters').querySelectorAll('.pharmacy-filter').forEach((b) => {
      b.addEventListener('click', () => { pharmacyFilter = b.dataset.f; renderPharmacy(); });
    });
  }
  const reportCloseBtn = document.getElementById('report-close');
  if (reportCloseBtn) reportCloseBtn.addEventListener('click', () => {
    document.getElementById('report-overlay').hidden = true;
  });
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
    // 기록 탭에 들어올 때마다 진행 현황을 새로 그린다
    const hg = document.getElementById('history-game-panel');
    if (hg) {
      if (current === 'record') renderHistoryGamePanel();
      else hg.hidden = true;
    }
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

  // 친구가 보낸 링크로 들어온 경우.
  // 처음 온 사람에게는 "너도 오늘의 마음약을 받을 수 있다"는 것을 바로 알려준다 —
  // 친구 것만 구경하고 나가면 바이럴 루프가 거기서 끊긴다.
  (function handleInviteArrival() {
    const q = new URLSearchParams(location.search);
    const kind = q.get('custom') ? 'custom' : q.get('maumun') ? 'maumun' : (q.get('t') || q.get('tarot')) ? 'tarot' : '';
    if (!kind) return;
    track('friend_invite_opened', { source: kind });

    const s = loadState();
    const 처음온사람 = !s.lastCheckInDate && Object.keys(s.collection).length === 0;
    if (!처음온사람 || !emotionSection) return;

    const banner = document.createElement('div');
    banner.className = 'invite-welcome';
    banner.innerHTML = `
      <strong>친구가 보낸 처방이 도착했어요 💌</strong>
      <span>확인하고 나면, 오늘의 마음약도 하나 받을 수 있어요</span>
    `;
    emotionSection.parentNode.insertBefore(banner, emotionSection);
  })();

  renderEmotionPicker();
  renderTeaser();
  renderHomeCollection();
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
