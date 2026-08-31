(() => {
  'use strict';

  const Core = window.MaumjaroCore;
  const Rx = window.MaumjaroRx; // prescriptions.js가 노출하는 기존 주사 인터랙션 재사용 창구
  const {
    STEM_KO, BRANCH_KO, GAN_ELEMENT, BRANCH_ELEMENT,
    DAILY_FORTUNE_SEED, WEEKLY_FORTUNE_SEED, MONTHLY_FORTUNE_SEED, TOJEONG_SEED,
    MIND_FORTUNE_SEED, SOCIAL_FORTUNE_SEED, WEALTH_FORTUNE_SEED, LOVE_FORTUNE_SEED, WORK_FORTUNE_SEED,
    TODAY_ONELINE_SEED, LUCKY_COLORS, LUCKY_ITEMS, AVOID_TODAY_SEED,
    MAUMUN_EMOTION_CATEGORY, FORTUNE_CATEGORY_LABELS, MAUMUN_INTERPRETATION,
    WEEKDAY_LABELS, MONTH_KEYWORDS, MONTHLY_MIND_FLOW_SEED, MONTHLY_PRESCRIPTION_SEED,
    FIRST_HALF_FORTUNE_SEED, SECOND_HALF_FORTUNE_SEED, YEARLY_PRESCRIPTION_SEED,
    MAUMUN_SHARE_TEXTS,
    AI_MAUMUN_KEYWORDS, AI_MAUMUN_OPENING_SEED, AI_MAUMUN_ADVICE_SEED, AI_MAUMUN_AFFIRMATION_SEED,
    AI_MAUMUN_WITTY_FALLBACK,
  } = window.MAUMJARO_FORTUNE_DATA;

  const {
    TAROT_MAJOR, TAROT_TOPICS, TAROT_VERDICT, TAROT_SHUFFLE_LINES, TAROT_SUMMARY_SEED, TAROT_BACK_SVG,
  } = window.MAUMJARO_TAROT_DATA;

  const FORTUNE_SEED_BY_CATEGORY = {
    mind: MIND_FORTUNE_SEED, social: SOCIAL_FORTUNE_SEED, wealth: WEALTH_FORTUNE_SEED,
    love: LOVE_FORTUNE_SEED, work: WORK_FORTUNE_SEED,
  };

  const viewFortune = document.getElementById('view-fortune');
  const fortuneContent = document.getElementById('fortune-content');

  const maumunRevealOverlay = document.getElementById('maumun-reveal-overlay');
  const maumunRevealEmoji = document.getElementById('maumun-reveal-emoji');
  const maumunRevealDiagnosis = document.getElementById('maumun-reveal-diagnosis');
  const maumunRevealInterpretation = document.getElementById('maumun-reveal-interpretation');
  const maumunRevealPrescription = document.getElementById('maumun-reveal-prescription');
  const maumunRevealDosage = document.getElementById('maumun-reveal-dosage');
  const maumunRevealClose = document.getElementById('maumun-reveal-close');
  const maumunRevealMakeBtn = document.getElementById('maumun-reveal-make-btn');

  function closeMaumunReveal() {
    maumunRevealOverlay.classList.remove('show');
  }
  // showMakeOwnBtn: 친구가 보낸 맘운을 확인한 직후에만 "나도 오늘의 맘운 보기" CTA를 노출한다.
  // 내 맘운을 볼 때(다시 보기/지난 맘운 등)는 이미 내가 보고 있는 화면이라 기본값 false로 숨긴다.
  // makeOwnLabel: 타로를 받고 온 사람에겐 "나도 타로 보기"가 더 자연스러우므로 문구만 바꿔 끼운다.
  // 이동 경로는 바꾸지 않는다 — 사주 프로필이 없는 새 사용자는 renderFortuneHome()이
  // 알아서 프로필 입력으로 보내주므로, 타로 화면으로 직행시키면 오히려 막힌다.
  function openMaumunReveal({ emoji, diagnosis, interpretation, prescription, dosage, color, showMakeOwnBtn, makeOwnLabel }) {
    document.body.style.setProperty('--dose-color', color || '#b779ef');
    maumunRevealEmoji.textContent = emoji;
    maumunRevealDiagnosis.textContent = diagnosis;
    maumunRevealInterpretation.textContent = interpretation;
    maumunRevealPrescription.textContent = prescription;
    maumunRevealDosage.textContent = dosage;
    maumunRevealMakeBtn.hidden = !showMakeOwnBtn;
    if (showMakeOwnBtn) maumunRevealMakeBtn.textContent = makeOwnLabel || '🔮 나도 오늘의 맘운 보기';
    maumunRevealOverlay.classList.add('show');
  }
  maumunRevealClose.addEventListener('click', closeMaumunReveal);
  maumunRevealMakeBtn.addEventListener('click', () => {
    closeMaumunReveal();
    const fortuneTabBtn = document.querySelector('.tab-btn[data-view="fortune"]');
    if (fortuneTabBtn) fortuneTabBtn.click(); // 탭 리스너가 renderFortuneHome()을 호출해 프로필 유무에 맞게 알아서 분기한다
  });
  maumunRevealOverlay.addEventListener('click', (e) => {
    if (e.target === maumunRevealOverlay) closeMaumunReveal();
  });

  // prescriptions.js의 completeGenericInjection/completeCustomReception과 동일한 정리 동작.
  // 주사 완료 콜백에서 이 3줄을 빼먹으면 방금 맞은 처방의 뱃지/색이 다음 방문까지 홈 화면에 그대로 남는다.
  function resetDoseVisuals() {
    const doseTagEl = document.getElementById('dose-tag');
    const doseCaptionEl = document.getElementById('dose-caption');
    const liquidEl = document.getElementById('liquid');
    if (doseTagEl) doseTagEl.hidden = true;
    if (doseCaptionEl) doseCaptionEl.hidden = true;
    if (liquidEl) liquidEl.style.fill = '';
  }

  const homeMaumunCard = document.getElementById('home-maumun-card');
  const homeMaumunOneline = document.getElementById('home-maumun-oneline');
  const homeMaumunSub = document.getElementById('home-maumun-sub');
  const homeMaumunBtn = document.getElementById('home-maumun-btn');

  // 4.3: 친구가 보낸 오늘의 운세 수신 카드 (custom-incoming-card와 동일한 클래스를 그대로 재사용)
  const friendMaumunIncomingCard = document.getElementById('friend-maumun-incoming-card');
  const friendMaumunIncomingTitle = document.getElementById('friend-maumun-incoming-title');
  const friendMaumunIncomingBtn = document.getElementById('friend-maumun-incoming-btn');

  // 친구가 보낸 타로 수신 카드 (위 운세 수신 카드와 같은 구조 — 종류만 구분한다)
  const friendTarotIncomingCard = document.getElementById('friend-tarot-incoming-card');
  const friendTarotIncomingTitle = document.getElementById('friend-tarot-incoming-title');
  const friendTarotIncomingBtn = document.getElementById('friend-tarot-incoming-btn');

  const SAJU_PROFILE_KEY = 'maumjaro:sajuProfile';
  const SAJU_CHART_KEY = 'maumjaro:sajuChart';
  const FORTUNE_CALC_VERSION = 1;
  const MAUMUN_LOG_KEY = 'maumjaro:maumunLog'; // 기존 감정/처방 기록 키와 완전 독립된 별도 구조

  // 사주 계산 라이브러리(lunar)는 첫 화면을 막지 않으려고 나중에 받는다.
  // 그래서 실제로 계산이 필요한 화면에 들어가기 직전에 준비가 끝났는지 확인한다.
  // 보통은 이미 받아져 있어 그 자리에서 바로 실행된다.
  function withLunar(fn) {
    if (typeof window.Solar === 'function' || typeof window.Solar === 'object') { fn(); return; }
    if (window.MaumjaroLib) { window.MaumjaroLib.lunar().then(fn); return; }
    fn(); // 로더가 없는 환경이면 그냥 시도한다
  }

  // 홈 탭으로 돌려보낸다. 탭 버튼을 실제로 클릭해서 app.js·prescriptions.js에 걸린
  // 기존 리스너들이 전부 함께 돌게 한다(뷰를 직접 숨겼다 켰다 하지 않는다).
  function goHomeTab() {
    const btn = document.querySelector('.tab-btn[data-view="home"]');
    if (btn) btn.click();
  }

  // GA4 전송은 game.js가 갖고 있다. 이 파일은 없을 수도 있다고 보고 항상 확인하고 부른다
  // (스크립트 순서가 바뀌거나 game.js가 빠져도 운세/타로가 죽지 않아야 한다).
  function trackEvent(name, params) {
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') G.track(name, params);
  }

  // 날짜 키는 반드시 "사용자의 로컬 날짜"여야 한다.
  // 예전에는 toISOString()(UTC)을 썼는데, 그러면 한국에서는 하루가 자정이 아니라
  // 오전 9시에 바뀐다. app.js는 처음부터 로컬 날짜(dateKey)를 써왔기 때문에 같은 앱 안에
  // "오늘"이 두 가지로 존재했고, 연속 출석을 세는 순간 이 차이가 바로 버그가 된다.
  function dateKeyOf(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function todayDateKey() {
    return dateKeyOf(new Date());
  }

  // ---------- UTC 날짜 키로 저장된 기존 기록을 로컬 날짜로 옮긴다 (1회만 실행) ----------
  // 각 기록에 ts(저장 시각)가 들어 있어서, 그 값으로 로컬 날짜를 정확히 다시 계산할 수 있다.
  const DATE_MIGRATION_KEY = 'maumjaro:dateMigration';
  const DATE_MIGRATION_VERSION = '1';

  function migrateDateKeysToLocal() {
    if (localStorage.getItem(DATE_MIGRATION_KEY) === DATE_MIGRATION_VERSION) return;
    try {
      // 키 상수(TAROT_LOG_KEY 등)는 파일 아래쪽에서 const로 선언돼 아직 초기화 전이므로,
      // 이 함수 안에서는 문자열을 직접 쓴다.
      // 맘운: { '날짜': entry }
      const maumun = JSON.parse(localStorage.getItem('maumjaro:maumunLog') || '{}');
      const nextMaumun = {};
      Object.keys(maumun).forEach((oldKey) => {
        const e = maumun[oldKey];
        if (!e || typeof e !== 'object') return;
        const key = e.ts ? dateKeyOf(new Date(e.ts)) : oldKey;
        // 같은 날로 겹치면 더 나중에 저장된 것을 남긴다
        if (!nextMaumun[key] || (e.ts || 0) >= (nextMaumun[key].ts || 0)) {
          nextMaumun[key] = { ...e, date: key };
        }
      });
      localStorage.setItem('maumjaro:maumunLog', JSON.stringify(nextMaumun));

      // 타로: { '날짜': { 주제키: entry } } — 주제별로 ts가 달라 각각 재계산한다
      const tarot = JSON.parse(localStorage.getItem('maumjaro:tarotLog') || '{}');
      const nextTarot = {};
      Object.keys(tarot).forEach((oldKey) => {
        const day = tarot[oldKey];
        if (!day || typeof day !== 'object') return;
        const entries = Array.isArray(day.cards) ? { today: day } : day; // 구 형식도 흡수
        Object.keys(entries).forEach((topicKey) => {
          const e = entries[topicKey];
          if (!e || typeof e !== 'object') return;
          const key = e.ts ? dateKeyOf(new Date(e.ts)) : oldKey;
          if (!nextTarot[key]) nextTarot[key] = {};
          const prev = nextTarot[key][topicKey];
          if (!prev || (e.ts || 0) >= (prev.ts || 0)) {
            nextTarot[key][topicKey] = { ...e, date: key };
          }
        });
      });
      localStorage.setItem('maumjaro:tarotLog', JSON.stringify(nextTarot));

      // 캡슐 뽑기 기록은 "오늘 뽑았는지"만 담아 과거 값이 의미 없다. 그냥 비운다
      // (최악의 경우 오늘 캡슐을 한 번 더 뽑게 되는 정도라 안전하다).
      localStorage.removeItem('maumjaro:gachaLog');

      localStorage.setItem(DATE_MIGRATION_KEY, DATE_MIGRATION_VERSION);
    } catch (e) {
      // 이관에 실패해도 앱은 계속 동작해야 한다. 다음 실행 때 다시 시도한다.
    }
  }
  // 아래 어떤 코드가 기록을 읽기 전에 먼저 끝나야 한다.
  migrateDateKeysToLocal();

  // ---------- 날짜별 맘운 기록 (날짜를 key로 하는 객체라 같은 날 재저장은 자동으로 덮어쓰기됨) ----------
  function loadMaumunLog() {
    try {
      const raw = localStorage.getItem(MAUMUN_LOG_KEY);
      const log = raw ? JSON.parse(raw) : {};
      return (log && typeof log === 'object') ? log : {};
    } catch (e) {
      return {};
    }
  }
  function saveMaumunLogEntry(entry) {
    const log = loadMaumunLog();
    log[entry.date] = entry;
    localStorage.setItem(MAUMUN_LOG_KEY, JSON.stringify(log));
  }
  function getTodayMaumunEntry() {
    return loadMaumunLog()[todayDateKey()] || null;
  }

  // ---------- 사주 프로필 저장/로드 (별도 키, 기존 4개 키와 완전 독립) ----------
  function loadSajuProfile() {
    try {
      const raw = localStorage.getItem(SAJU_PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function saveSajuProfile(profile) {
    localStorage.setItem(SAJU_PROFILE_KEY, JSON.stringify(profile));
  }
  function loadSajuChart() {
    try {
      const raw = localStorage.getItem(SAJU_CHART_KEY);
      const chart = raw ? JSON.parse(raw) : null;
      return (chart && chart.calcVersion === FORTUNE_CALC_VERSION) ? chart : null;
    } catch (e) {
      return null;
    }
  }
  function saveSajuChart(chart) {
    localStorage.setItem(SAJU_CHART_KEY, JSON.stringify(chart));
  }
  function getOrComputeSajuChart(profile) {
    let chart = loadSajuChart();
    if (chart) return chart;
    chart = calculateSaju(profile);
    saveSajuChart(chart);
    return chart;
  }

  // ---------- 사주팔자 계산 (lunar-javascript, 클라이언트 전용) ----------
  function calculateSaju(profile) {
    const [y, m, d] = profile.birthDate.split('-').map(Number);
    let hour = 12;
    let minute = 0; // 시간 모를 때 정오 placeholder. 년/월/일주는 시(hour)와 무관함을 검증함.
    if (!profile.timeUnknown && profile.birthTime) {
      const [h, mi] = profile.birthTime.split(':').map(Number);
      hour = h;
      minute = mi;
    }

    let solar;
    if (profile.calendarType === 'lunar') {
      const monthArg = profile.isLeapMonth ? -m : m; // 음수 month = 윤달 (실제 테스트로 확인함)
      const lunarBirth = Lunar.fromYmd(y, monthArg, d);
      const s = lunarBirth.getSolar();
      solar = Solar.fromYmdHms(s.getYear(), s.getMonth(), s.getDay(), hour, minute, 0);
    } else {
      solar = Solar.fromYmdHms(y, m, d, hour, minute, 0);
    }

    const ec = solar.getLunar().getEightChar();
    const pillars = {
      year: { gan: ec.getYearGan(), zhi: ec.getYearZhi() },
      month: { gan: ec.getMonthGan(), zhi: ec.getMonthZhi() },
      day: { gan: ec.getDayGan(), zhi: ec.getDayZhi() },
      // 시간을 모르면 시주는 절대 채우지 않는다 (정오 placeholder로 계산된 값을 노출하지 않기 위한 가드)
      time: profile.timeUnknown ? null : { gan: ec.getTimeGan(), zhi: ec.getTimeZhi() },
    };

    const dayMasterElement = GAN_ELEMENT[pillars.day.gan];
    const wuxingCount = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
    Object.values(pillars).forEach((p) => {
      if (!p) return;
      wuxingCount[GAN_ELEMENT[p.gan]]++;
      wuxingCount[BRANCH_ELEMENT[p.zhi]]++;
    });

    return {
      calcVersion: FORTUNE_CALC_VERSION,
      pillars,
      dayMasterElement,
      wuxingCount,
      timeUnknown: !!profile.timeUnknown,
      calculatedAt: Date.now(),
    };
  }

  // 오늘 날짜의 일간(日干) 오행 — 시간 정보 불필요, 항상 정확히 계산 가능
  function todayDayMasterElement() {
    const ec = Solar.fromDate(new Date()).getLunar().getEightChar();
    return GAN_ELEMENT[ec.getDayGan()];
  }

  function elementRelation(dayMaster, today) {
    const generates = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
    const controls = { 목: '토', 토: '수', 수: '화', 화: '금', 금: '목' };
    if (dayMaster === today) return 'same';
    if (generates[dayMaster] === today) return 'output';
    if (generates[today] === dayMaster) return 'resource';
    if (controls[dayMaster] === today) return 'wealth';
    return 'authority';
  }

  // 이번 주 월요일(정오 고정) 일진 오행 — 주간 운세의 기준
  function weekAnchorElement() {
    const d = new Date();
    const dow = d.getDay(); // 0=일
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff, 12, 0, 0);
    const ec = Solar.fromDate(monday).getLunar().getEightChar();
    return GAN_ELEMENT[ec.getDayGan()];
  }

  // 이번 달 월주 오행 — 월간 운세의 기준
  function monthAnchorElement() {
    const ec = Solar.fromDate(new Date()).getLunar().getEightChar();
    return GAN_ELEMENT[ec.getMonthGan()];
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // 4.1: 주/월 단위로 "그 주/그 달 내내 안 바뀌는" salt 키. 요일이 바뀌어도 같은 주면 같은 값을 낸다.
  function weekMondayDateKey() {
    const d = new Date();
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    return monday.toISOString().slice(0, 10);
  }
  function monthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function weeklyPickIndex(chart, salt, length) {
    return hashStr(`${chart.pillars.day.gan}${chart.pillars.day.zhi}:${weekMondayDateKey()}:${salt}`) % length;
  }
  function monthlyPickIndex(chart, salt, length) {
    return hashStr(`${chart.pillars.day.gan}${chart.pillars.day.zhi}:${monthKey()}:${salt}`) % length;
  }

  // 4.2: 연 단위로 "올해 내내 안 바뀌는" salt 키.
  function yearKey() {
    return String(new Date().getFullYear());
  }
  function yearlyPickIndex(chart, salt, length) {
    return hashStr(`${chart.pillars.day.gan}${chart.pillars.day.zhi}:${yearKey()}:${salt}`) % length;
  }

  // 올해 1월 1일(정오 고정) 월주 오행 — 상반기 운세의 기준
  function firstHalfAnchorElement() {
    const year = new Date().getFullYear();
    const jan1 = new Date(year, 0, 1, 12, 0, 0);
    const ec = Solar.fromDate(jan1).getLunar().getEightChar();
    return GAN_ELEMENT[ec.getMonthGan()];
  }
  // 올해 7월 1일(정오 고정) 월주 오행 — 하반기 운세의 기준
  function secondHalfAnchorElement() {
    const year = new Date().getFullYear();
    const jul1 = new Date(year, 6, 1, 12, 0, 0);
    const ec = Solar.fromDate(jul1).getLunar().getEightChar();
    return GAN_ELEMENT[ec.getMonthGan()];
  }

  // 오늘 기록된 감정(2.0의 rxRecords, category:'emotion')을 읽어온다 — prescriptions.js 파일은 무수정,
  // 같은 localStorage 키를 직접 읽기만 한다 (앱 전체가 이미 이 방식으로 파일 간 데이터를 공유함)
  function getTodayEmotionEntry() {
    try {
      const raw = localStorage.getItem('maumjaro:rxRecords');
      const list = raw ? JSON.parse(raw) : [];
      const todays = list.filter((r) => r.category === 'emotion' && Core.sameDay(new Date(r.ts), new Date()));
      if (!todays.length) return null;
      const latest = todays[todays.length - 1];
      const key = String(latest.prescriptionId || '').replace('emotion-', '');
      return Core.SYMPTOMS[key] ? { key, ...Core.SYMPTOMS[key] } : null;
    } catch (e) {
      return null;
    }
  }

  function pillarLine(p) {
    return p ? `${STEM_KO[p.gan]}${BRANCH_KO[p.zhi]} (${p.gan}${p.zhi})` : '—';
  }

  function pillarsBlockHtml(chart) {
    return `
      <div class="rx-custom-preview">
        <div class="rx-slip-row"><span class="rx-slip-key">연주</span><span class="rx-slip-value">${pillarLine(chart.pillars.year)}</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key">월주</span><span class="rx-slip-value">${pillarLine(chart.pillars.month)}</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key">일주</span><span class="rx-slip-value">${pillarLine(chart.pillars.day)}</span></div>
        ${chart.timeUnknown ? '' : `<div class="rx-slip-row"><span class="rx-slip-key">시주</span><span class="rx-slip-value">${pillarLine(chart.pillars.time)}</span></div>`}
      </div>`;
  }

  // ---------- 운세 탭 렌더 ----------
  // 홍보 링크(?start=tarot)로 들어왔을 때 한 번만 켜지는 표시.
  // 탭 전환은 withLunar를 거치는데, lunar가 아직 안 받아졌으면 renderFortuneHome이
  // 나중에 실행된다. 그래서 진입부에서 타로를 먼저 그려두면 뒤늦게 온 renderFortuneHome이
  // 그걸 프로필 폼으로 덮어써 버린다. 순서에 기대지 말고 여기서 분기한다.
  let promoTarotPending = false;

  function renderFortuneHome() {
    if (promoTarotPending) {
      promoTarotPending = false;
      renderTarotTopics(loadSajuProfile()); // 프로필 있으면 그대로, 없으면 null
      return;
    }
    const profile = loadSajuProfile();
    if (!profile) renderProfileForm();
    else renderFortuneHub(profile);
  }

  // ---------- 운세센터: 오늘/주간/월간/토정비결/맘운 그리드 (처방센터의 renderRxGrid 패턴 재사용) ----------
  function renderFortuneHub(profile) {
    const maumunDone = !!getTodayMaumunEntry();
    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <span class="rx-nav-title">🔮 운세센터</span>
        <button class="rx-friend-quick-btn" id="fortune-edit-profile-btn" type="button">✏️ 정보 수정</button>
      </div>
      <button class="rx-custom-cta" id="fortune-maumun-cta-btn" type="button">
        <span class="rx-custom-cta-emoji">🌞</span>
        <span class="rx-custom-cta-text">
          <span class="rx-custom-cta-title">오늘의 맘운</span>
          <span class="rx-custom-cta-sub">${maumunDone ? '오늘의 맘운, 다시 보기' : '마음과 운, 오늘의 처방으로'}</span>
        </span>
        <span class="rx-custom-cta-arrow">›</span>
      </button>
      <button class="rx-custom-cta" id="fortune-ai-cta-btn" type="button">
        <span class="rx-custom-cta-emoji">🤖</span>
        <span class="rx-custom-cta-text">
          <span class="rx-custom-cta-title">AI 맘운에게 물어보기</span>
          <span class="rx-custom-cta-sub">오늘 상황을 말하면 맞춤 답을 줘요</span>
        </span>
        <span class="rx-custom-cta-arrow">›</span>
      </button>
      <div class="rx-category-grid">
        <div class="rx-category-tile" data-fortune="daily">
          <span class="rx-category-emoji">🔮</span>
          <span class="rx-category-label">오늘의 운세</span>
          <span class="rx-category-count">매일 갱신</span>
        </div>
        <div class="rx-category-tile" data-fortune="weekly">
          <span class="rx-category-emoji">📅</span>
          <span class="rx-category-label">주간 운세</span>
          <span class="rx-category-count">이번 주</span>
        </div>
        <div class="rx-category-tile" data-fortune="monthly">
          <span class="rx-category-emoji">📆</span>
          <span class="rx-category-label">월간 운세</span>
          <span class="rx-category-count">이번 달</span>
        </div>
        <div class="rx-category-tile" data-fortune="tarot">
          <span class="rx-category-emoji">🎴</span>
          <span class="rx-category-label">타로</span>
          <span class="rx-category-count">${countTodayTarotDraws() ? `오늘 ${countTodayTarotDraws()}개` : '주제별 3장'}</span>
        </div>
        <div class="rx-category-tile" data-fortune="tojeong">
          <span class="rx-category-emoji">📜</span>
          <span class="rx-category-label">토정비결</span>
          <span class="rx-category-count">올해(간이판)</span>
        </div>
        <div class="rx-category-tile" data-fortune="maumun">
          <span class="rx-category-emoji">💞</span>
          <span class="rx-category-label">맘운 처방</span>
          <span class="rx-category-count">마음+운</span>
        </div>
      </div>
    `;

    document.getElementById('fortune-edit-profile-btn').addEventListener('click', () => {
      renderProfileForm(profile); // 기존 값을 채운 채로 수정 화면 진입 (재입력 아님)
    });
    document.getElementById('fortune-maumun-cta-btn').addEventListener('click', () => renderMaumun(profile));
    document.getElementById('fortune-ai-cta-btn').addEventListener('click', () => renderAiMaumun(profile));

    fortuneContent.querySelectorAll('.rx-category-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const type = tile.dataset.fortune;
        if (type === 'daily') renderFortuneDaily(profile);
        else if (type === 'weekly') renderFortuneWeekly(profile);
        else if (type === 'monthly') renderFortuneMonthly(profile);
        else if (type === 'tarot') renderTarotTopics(profile);
        else if (type === 'tojeong') renderFortuneTojeong(profile);
        else if (type === 'maumun') renderMaumun(profile);
      });
    });
  }

  function starsText(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  // 사주팔자(일주) + 오늘 날짜 + salt로 결정론적 인덱스를 뽑는다.
  // 같은 사람이 같은 날 다시 봐도 같은 결과, salt가 다르면 카테고리별로 다른 결과가 나온다.
  function dailyPickIndex(chart, salt, length) {
    const dateKey = new Date().toISOString().slice(0, 10);
    return hashStr(`${chart.pillars.day.gan}${chart.pillars.day.zhi}:${dateKey}:${salt}`) % length;
  }

  // 운세가 "즉석에서 뚝딱" 나오면 가벼워 보이니, 결과를 보여주기 전에 짧게 읽는 시늉을 한다.
  // 매번 딜레이가 미세하게 달라야 기계적으로 느껴지지 않는다.
  const MYSTICAL_LOADING_LINES = [
    '오늘의 기운을 읽는 중...',
    '사주와 오늘의 흐름을 맞춰보는 중...',
    '별자리와 마음을 함께 살피는 중...',
    '조용히 점괘를 살피는 중...',
  ];
  const AI_MAUMUN_LOADING_LINES = [
    '질문을 곱씹어 보는 중...',
    '사주와 오늘의 마음을 함께 짚어보는 중...',
    '오늘의 기운에 질문을 겹쳐보는 중...',
  ];
  // 결과가 나오기 전 대기 구간. 그냥 기다리게 두면 지루하므로 캡슐을 직접 열게 한다.
  //
  // 중요: 이건 "뽑기"가 아니라 "여는 연출"이다.
  //  - 운세 결과는 사주와 날짜로 이미 정해져 있어서, 어떤 캡슐을 골라도 내용이 같다.
  //  - 마음약을 주는 하루 한 번의 뽑기는 처방 완료 후 보상 상자 쪽에만 있다.
  // 두 개가 다 "뽑기"로 보이면 하루에 두 번 뽑는 것처럼 느껴지므로, 문구도 "열어보세요"로 둔다.
  const REVEAL_CAPSULE_COUNT = 5;

  // 캡슐 5개 중 하나를 고르는 방식이었는데, "어떤 걸 골라도 결과는 같다"는 안내를
  // 붙여야 할 만큼 고르는 의미가 없었다. 갓차 기계를 돌려 뽑는 연출로 바꾼다.
  //   손잡이 돌리기 → 돔 안 캡슐이 내려감 → 배출구로 떨어짐 → 커지며 열림 → 결과
  // 소리는 각 단계에 이미 만들어 둔 것을 붙인다(드르륵 / 낙하 / 신비로운 공개).
  const GACHA_BALL_COLORS = [
    ['#ff9166', '#ffc66b'], ['#b779ef', '#ff8fb3'], ['#4f86e8', '#7ec8e3'],
    ['#2f6f5e', '#8fd694'], ['#e0a83c', '#ffd166'], ['#ef6a5a', '#ffb37a'],
  ];

  function withMysticalReveal(profile, title, buildAndRender) {
    const loadingLine = MYSTICAL_LOADING_LINES[Math.floor(Math.random() * MYSTICAL_LOADING_LINES.length)];
    // 돔 안을 채울 캡슐들. 위치와 색을 흩어 놓아야 "가득 차 있다"는 느낌이 난다.
    const domeBalls = Array.from({ length: 11 }, (_, i) => {
      const c = GACHA_BALL_COLORS[i % GACHA_BALL_COLORS.length];
      const x = 18 + (i * 23) % 64;
      const y = 16 + Math.floor(i / 3) * 17 + (i % 2) * 5;
      return `<span class="gm-ball" style="left:${x}%;top:${y}%;background:linear-gradient(150deg,${c[0]},${c[1]});
        animation-delay:${(i * 0.17).toFixed(2)}s;"></span>`;
    }).join('');
    const pick = GACHA_BALL_COLORS[Math.floor(Math.random() * GACHA_BALL_COLORS.length)];

    // 뽑는 순간은 화면을 통째로 쓴다. 탭 안에 작게 들어가 있으면 "기계를 돌린다"는
    // 손맛이 안 산다. 결과는 기존처럼 fortuneContent에 그리므로 buildAndRender는 그대로다.
    const stage = document.createElement('div');
    stage.className = 'gacha-full';
    stage.innerHTML = `
      <button class="gacha-full-back" id="fortune-detail-back" type="button" aria-label="뒤로">‹</button>
      <div class="reveal-stage">
        <p class="gacha-full-title">${title}</p>
        <p class="reveal-guide" id="reveal-guide">손잡이를 돌려 오늘의 운을 뽑아보세요</p>

        <div class="gacha" id="gacha">
          <div class="gm-dome"><span class="gm-dome-shine"></span>${domeBalls}</div>
          <div class="gm-body">
            <span class="gm-knob-ring" aria-hidden="true"></span>
            <button class="gm-knob" id="gm-knob" type="button" aria-label="손잡이를 돌려 오늘의 운 뽑기">
              <span class="gm-knob-slot"></span>
            </button>
            <!-- 화면 위쪽 안내는 손잡이에서 160px 넘게 떨어져 있어 시선이 안 이어진다.
                 눌러야 할 것 바로 밑에 짧게 한 번 더 적는다. -->
            <span class="gm-label">👆 손잡이를 돌려주세요</span>
          </div>
          <div class="gm-exit"><span class="gm-exit-hole"></span></div>
          <!-- 배출구에서 굴러 나와 화면 가운데로 커지는 캡슐 -->
          <div class="gm-out" id="gm-out">
            <span class="gm-out-top" style="background:linear-gradient(160deg,${pick[0]},${pick[1]});"></span>
            <span class="gm-out-bottom"></span>
            <span class="gm-out-band"></span>
            <span class="gm-out-glow"></span>
          </div>
        </div>

        <p class="reveal-note">하루에 한 번, 오늘의 운이 담긴 캡슐이 나와요 🔮</p>
      </div>
    `;
    document.body.appendChild(stage);
    requestAnimationFrame(() => stage.classList.add('show'));

    // 오버레이를 걷어내는 일은 한 곳에서만 한다(두 번 불려도 안전하게).
    let closed = false;
    function closeStage() {
      if (closed) return;
      closed = true;
      stage.classList.remove('show');
      setTimeout(() => stage.remove(), 260);
    }

    document.getElementById('fortune-detail-back').addEventListener('click', () => {
      closeStage();
      renderFortuneHub(profile);
    });

    const gacha = document.getElementById('gacha');
    const knob = document.getElementById('gm-knob');
    const guide = document.getElementById('reveal-guide');
    let turning = false;

    knob.addEventListener('click', () => {
      if (turning) return;
      turning = true;
      knob.disabled = true;
      gacha.classList.add('is-turning');          // 손잡이 회전 + 돔 안 캡슐이 흔들림
      sfx('gachaCrank', 10);

      // 캡슐이 배출구로 떨어진다
      setTimeout(() => {
        gacha.classList.add('is-dropped');
        sfx('capsuleDrop');
        guide.textContent = loadingLine;
      }, 700);

      // 캡슐이 화면 가운데로 커지며 열린다
      setTimeout(() => {
        gacha.classList.add('is-opening');
        sfx('gachaReveal');
      }, 1500);

      // 캡슐이 다 열린 뒤 오버레이를 걷고 결과를 원래 자리에 그린다.
      setTimeout(() => { closeStage(); buildAndRender(); }, 2400);
    });
  }

  function categorySectionHtml(label, item, rxCategory) {
    return `
      <div class="rx-custom-preview" style="margin-bottom:10px;">
        <div class="rx-slip-row"><span class="rx-slip-key">${label}</span><span class="rx-slip-value">${starsText(item.stars)}</span></div>
        <p class="rx-slip-text">${item.quip}</p>
        <p class="rx-slip-text" style="color:var(--text-dim);font-size:12px;">💊 ${item.hint}</p>
        <button class="rx-friend-quick-btn fortune-goto-rx-btn" type="button" data-rxcat="${rxCategory}" style="margin-top:6px;">처방 후보 보러가기 ›</button>
      </div>`;
  }

  function renderFortuneDaily(profile) {
    // 캡슐 색을 정하려면 등급이 먼저 필요하므로, 결과 계산을 연출보다 앞으로 옮겼다.
    // (계산은 사주와 날짜만 쓰는 결정론이라 언제 계산하든 결과는 같다.)
    const chart = getOrComputeSajuChart(profile);
    const relation = elementRelation(chart.dayMasterElement, todayDayMasterElement());
    const seed = DAILY_FORTUNE_SEED.find((s) => s.relation === relation) || DAILY_FORTUNE_SEED[0];

    const mindItem = MIND_FORTUNE_SEED.items[dailyPickIndex(chart, 'mind', MIND_FORTUNE_SEED.items.length)];
    const socialItem = SOCIAL_FORTUNE_SEED.items[dailyPickIndex(chart, 'social', SOCIAL_FORTUNE_SEED.items.length)];
    const wealthItem = WEALTH_FORTUNE_SEED.items[dailyPickIndex(chart, 'wealth', WEALTH_FORTUNE_SEED.items.length)];
    const loveItem = LOVE_FORTUNE_SEED.items[dailyPickIndex(chart, 'love', LOVE_FORTUNE_SEED.items.length)];
    const workItem = WORK_FORTUNE_SEED.items[dailyPickIndex(chart, 'work', WORK_FORTUNE_SEED.items.length)];
    const oneLine = TODAY_ONELINE_SEED[dailyPickIndex(chart, 'oneline', TODAY_ONELINE_SEED.length)];
    const luckyColor = LUCKY_COLORS[dailyPickIndex(chart, 'color', LUCKY_COLORS.length)];
    const luckyNumber = dailyPickIndex(chart, 'number', 9) + 1;
    const luckyItem = LUCKY_ITEMS[dailyPickIndex(chart, 'item', LUCKY_ITEMS.length)];
    const avoidToday = AVOID_TODAY_SEED[dailyPickIndex(chart, 'avoid', AVOID_TODAY_SEED.length)];

    withMysticalReveal(profile, '🔮 오늘의 운세', () => {
      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">🔮 오늘의 운세</span>
        </div>
        <div class="rx-detail-card">
          <div class="rx-detail-emoji">${seed.emoji}</div>
          <div class="rx-detail-title">오늘의 전체운 · ${seed.title}</div>
          <div class="rx-detail-diagnosis">${seed.diagnosis}</div>
          <p class="rx-detail-symptom">${seed.advice}</p>
        </div>
        <p class="rx-custom-hint">💛 ${oneLine}</p>

        ${categorySectionHtml('마음운', mindItem, MIND_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('인간관계운', socialItem, SOCIAL_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('재물운', wealthItem, WEALTH_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('연애운', loveItem, LOVE_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('일/직장운', workItem, WORK_FORTUNE_SEED.rxCategory)}

        <div class="rx-custom-preview">
          <div class="rx-slip-row"><span class="rx-slip-key">행운의 색</span><span class="rx-slip-value">${luckyColor}</span></div>
          <div class="rx-slip-row"><span class="rx-slip-key">행운의 숫자</span><span class="rx-slip-value">${luckyNumber}</span></div>
          <div class="rx-slip-row"><span class="rx-slip-key">행운의 아이템</span><span class="rx-slip-value">${luckyItem}</span></div>
          <div class="rx-slip-row"><span class="rx-slip-key">오늘 피하면 좋은 것</span><span class="rx-slip-value">${avoidToday}</span></div>
        </div>

        ${pillarsBlockHtml(chart)}
      `;
      document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
      fortuneContent.querySelectorAll('.fortune-goto-rx-btn').forEach((btn) => {
        btn.addEventListener('click', () => Rx.goToRxCategory(btn.dataset.rxcat));
      });
    });
  }

  function renderFortuneWeekly(profile) {
    withMysticalReveal(profile, '📅 이번 주 전체 흐름', () => {
      // 4.1: 새 프로필 없이 기존 5개 카테고리 풀(마음/재물/연애/인간관계/일)을 "이번 주 월요일" 기준
      // 결정론적 시드로 재사용한다 — 요일이 바뀌어도 이번 주 안에서는 결과가 안 바뀐다.
      const chart = getOrComputeSajuChart(profile);

      const mindItem = MIND_FORTUNE_SEED.items[weeklyPickIndex(chart, 'mind', MIND_FORTUNE_SEED.items.length)];
      const wealthItem = WEALTH_FORTUNE_SEED.items[weeklyPickIndex(chart, 'wealth', WEALTH_FORTUNE_SEED.items.length)];
      const loveItem = LOVE_FORTUNE_SEED.items[weeklyPickIndex(chart, 'love', LOVE_FORTUNE_SEED.items.length)];
      const socialItem = SOCIAL_FORTUNE_SEED.items[weeklyPickIndex(chart, 'social', SOCIAL_FORTUNE_SEED.items.length)];
      const workItem = WORK_FORTUNE_SEED.items[weeklyPickIndex(chart, 'work', WORK_FORTUNE_SEED.items.length)];

      const luckyDayIdx = weeklyPickIndex(chart, 'luckyday', 7);
      let carefulDayIdx = weeklyPickIndex(chart, 'carefulday', 6);
      if (carefulDayIdx >= luckyDayIdx) carefulDayIdx += 1; // 행운의 날과 겹치지 않도록

      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">📅 이번 주 전체 흐름</span>
        </div>

        ${categorySectionHtml('마음', mindItem, MIND_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('재물', wealthItem, WEALTH_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('연애', loveItem, LOVE_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('인간관계', socialItem, SOCIAL_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('일', workItem, WORK_FORTUNE_SEED.rxCategory)}

        <div class="rx-custom-preview">
          <div class="rx-slip-row"><span class="rx-slip-key">🍀 행운의 날</span><span class="rx-slip-value">${WEEKDAY_LABELS[luckyDayIdx]}</span></div>
          <div class="rx-slip-row"><span class="rx-slip-key">⚠️ 조심할 날</span><span class="rx-slip-value">${WEEKDAY_LABELS[carefulDayIdx]}</span></div>
        </div>

        <button class="action-btn" id="fortune-goto-maumun-btn" type="button" style="width:100%;margin-top:6px;">그래서 오늘은? 💞</button>
      `;
      document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
      document.getElementById('fortune-goto-maumun-btn').addEventListener('click', () => renderMaumun(profile));
      fortuneContent.querySelectorAll('.fortune-goto-rx-btn').forEach((btn) => {
        btn.addEventListener('click', () => Rx.goToRxCategory(btn.dataset.rxcat));
      });
    });
  }

  function renderFortuneMonthly(profile) {
    withMysticalReveal(profile, '📆 이번 달 전체 흐름', () => {
      // 4.1: 전체운은 4.0-A에서 이미 만든 MONTHLY_FORTUNE_SEED(오행 관계 기반)를 그대로 재사용하고,
      // 나머지 카테고리는 월 단위 결정론적 시드로 기존 5개 풀 중 4개(재물/연애/직장/인간관계)를 재사용한다.
      // "마음"은 별점 대신 한 달 흐름을 서술하는 별도 콘텐츠(마음의 흐름)로 대체한다.
      const chart = getOrComputeSajuChart(profile);
      const relation = elementRelation(chart.dayMasterElement, monthAnchorElement());
      const overall = MONTHLY_FORTUNE_SEED.find((s) => s.relation === relation) || MONTHLY_FORTUNE_SEED[0];

      const wealthItem = WEALTH_FORTUNE_SEED.items[monthlyPickIndex(chart, 'wealth', WEALTH_FORTUNE_SEED.items.length)];
      const loveItem = LOVE_FORTUNE_SEED.items[monthlyPickIndex(chart, 'love', LOVE_FORTUNE_SEED.items.length)];
      const workItem = WORK_FORTUNE_SEED.items[monthlyPickIndex(chart, 'work', WORK_FORTUNE_SEED.items.length)];
      const socialItem = SOCIAL_FORTUNE_SEED.items[monthlyPickIndex(chart, 'social', SOCIAL_FORTUNE_SEED.items.length)];
      const mindFlow = MONTHLY_MIND_FLOW_SEED[monthlyPickIndex(chart, 'mindflow', MONTHLY_MIND_FLOW_SEED.length)];
      const keyword = MONTH_KEYWORDS[monthlyPickIndex(chart, 'keyword', MONTH_KEYWORDS.length)];
      const monthlyRx = MONTHLY_PRESCRIPTION_SEED[monthlyPickIndex(chart, 'rx', MONTHLY_PRESCRIPTION_SEED.length)];

      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">📆 이번 달 전체 흐름</span>
        </div>

        <div class="rx-detail-card">
          <div class="rx-detail-emoji">${overall.emoji}</div>
          <div class="rx-detail-title">이번 달 전체운 · ${overall.title}</div>
          <div class="rx-detail-diagnosis">${overall.diagnosis}</div>
          <p class="rx-detail-symptom">${overall.advice}</p>
        </div>

        ${categorySectionHtml('재물운', wealthItem, WEALTH_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('연애운', loveItem, LOVE_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('직장운', workItem, WORK_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('인간관계', socialItem, SOCIAL_FORTUNE_SEED.rxCategory)}

        <div class="rx-detail-card">
          <div class="rx-detail-title">🌊 마음의 흐름</div>
          <p class="rx-detail-symptom">${mindFlow}</p>
        </div>

        <div class="rx-custom-preview">
          <div class="rx-slip-row"><span class="rx-slip-key">이번 달 핵심 키워드</span><span class="rx-slip-value">${keyword}</span></div>
        </div>

        <div class="rx-detail-card">
          <div class="rx-detail-title">${monthlyRx.title}</div>
          <p class="rx-detail-symptom">${monthlyRx.advice}</p>
        </div>

        <button class="action-btn" id="fortune-goto-maumun-btn" type="button" style="width:100%;margin-top:6px;">그래서 오늘은? 💞</button>
      `;
      document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
      document.getElementById('fortune-goto-maumun-btn').addEventListener('click', () => renderMaumun(profile));
      fortuneContent.querySelectorAll('.fortune-goto-rx-btn').forEach((btn) => {
        btn.addEventListener('click', () => Rx.goToRxCategory(btn.dataset.rxcat));
      });
    });
  }

  function renderFortuneTojeong(profile) {
    withMysticalReveal(profile, '📜 토정비결', () => {
      // 4.2: 토정비결을 "올해 전체 흐름 한 장"에서 10개 섹션의 연간 가이드로 확장.
      // 전통 토정비결 산출식을 그대로 구현하지 않고, 기존 5개 카테고리 풀(재물/연애/인간관계/일/마음)과
      // 월간 키워드/처방 풀을 "올해" 단위 salt로 재사용해 새 콘텐츠 작성 부담 없이 톤을 통일한다.
      const chart = getOrComputeSajuChart(profile);

      const overall = TOJEONG_SEED[yearlyPickIndex(chart, 'tojeong-overall', TOJEONG_SEED.length)];

      const firstHalfRelation = elementRelation(chart.dayMasterElement, firstHalfAnchorElement());
      const firstHalf = FIRST_HALF_FORTUNE_SEED.find((s) => s.relation === firstHalfRelation) || FIRST_HALF_FORTUNE_SEED[0];

      const secondHalfRelation = elementRelation(chart.dayMasterElement, secondHalfAnchorElement());
      const secondHalf = SECOND_HALF_FORTUNE_SEED.find((s) => s.relation === secondHalfRelation) || SECOND_HALF_FORTUNE_SEED[0];

      const wealthItem = WEALTH_FORTUNE_SEED.items[yearlyPickIndex(chart, 'wealth', WEALTH_FORTUNE_SEED.items.length)];
      const loveItem = LOVE_FORTUNE_SEED.items[yearlyPickIndex(chart, 'love', LOVE_FORTUNE_SEED.items.length)];
      const socialItem = SOCIAL_FORTUNE_SEED.items[yearlyPickIndex(chart, 'social', SOCIAL_FORTUNE_SEED.items.length)];
      const workItem = WORK_FORTUNE_SEED.items[yearlyPickIndex(chart, 'work', WORK_FORTUNE_SEED.items.length)];
      const mindItem = MIND_FORTUNE_SEED.items[yearlyPickIndex(chart, 'mind', MIND_FORTUNE_SEED.items.length)];

      const keyword = MONTH_KEYWORDS[yearlyPickIndex(chart, 'keyword', MONTH_KEYWORDS.length)];
      const yearlyRx = YEARLY_PRESCRIPTION_SEED[yearlyPickIndex(chart, 'rx', YEARLY_PRESCRIPTION_SEED.length)];

      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">📜 토정비결</span>
        </div>
        <p class="rx-custom-hint">💛 전통 토정비결의 정식 산출식을 그대로 구현한 게 아니라, 앱 톤에 맞게 재해석한 간이 버전이에요</p>

        <div class="rx-detail-card">
          <div class="rx-detail-emoji">${overall.emoji}</div>
          <div class="rx-detail-title">올해의 전체 흐름 · ${overall.title}</div>
          <div class="rx-detail-diagnosis">${overall.summary}</div>
          <p class="rx-detail-symptom">${overall.detail}</p>
        </div>

        <div class="rx-detail-card">
          <div class="rx-detail-emoji">${firstHalf.emoji}</div>
          <div class="rx-detail-title">상반기 · ${firstHalf.title}</div>
          <div class="rx-detail-diagnosis">${firstHalf.diagnosis}</div>
          <p class="rx-detail-symptom">${firstHalf.advice}</p>
        </div>

        <div class="rx-detail-card">
          <div class="rx-detail-emoji">${secondHalf.emoji}</div>
          <div class="rx-detail-title">하반기 · ${secondHalf.title}</div>
          <div class="rx-detail-diagnosis">${secondHalf.diagnosis}</div>
          <p class="rx-detail-symptom">${secondHalf.advice}</p>
        </div>

        ${categorySectionHtml('재물', wealthItem, WEALTH_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('연애', loveItem, LOVE_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('인간관계', socialItem, SOCIAL_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('일', workItem, WORK_FORTUNE_SEED.rxCategory)}
        ${categorySectionHtml('마음', mindItem, MIND_FORTUNE_SEED.rxCategory)}

        <div class="rx-custom-preview">
          <div class="rx-slip-row"><span class="rx-slip-key">올해의 키워드</span><span class="rx-slip-value">${keyword}</span></div>
        </div>

        <div class="rx-detail-card">
          <div class="rx-detail-title">💊 올해의 맘운 처방</div>
          <p class="rx-detail-symptom">${yearlyRx.advice}</p>
        </div>

        <button class="action-btn" id="fortune-goto-maumun-btn" type="button" style="width:100%;margin-top:6px;">그래서 오늘은? 💞</button>
      `;
      document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
      document.getElementById('fortune-goto-maumun-btn').addEventListener('click', () => renderMaumun(profile));
      fortuneContent.querySelectorAll('.fortune-goto-rx-btn').forEach((btn) => {
        btn.addEventListener('click', () => Rx.goToRxCategory(btn.dataset.rxcat));
      });
    });
  }

  // ---------- 맘운: 오늘의 마음(2.0 감정 기록) + 오늘의 운을 합성 ----------
  function maumunEntryToReveal(entry) {
    return {
      emoji: entry.emotionEmoji,
      diagnosis: entry.diagnosis,
      interpretation: entry.interpretation,
      prescription: entry.prescription,
      dosage: entry.dosage,
      color: entry.emotionColor,
    };
  }

  // ---------- 4.3: 친구에게 오늘의 운세 보내기 (3.0 커스텀 처방전과 완전히 같은 URL 공유 구조 재사용) ----------
  // 서버 없이 URL에 압축 저장하는 방식 그대로: LZString + 쿼리 파라미터(?maumun=). ?custom=과 같은 패턴이되
  // 파라미터명을 분리해 딥링크 진입 시 어떤 종류의 공유인지 구분한다.
  // 공유 링크의 경로 부분. "…/index.html"은 "…/"와 같은 페이지를 가리키므로,
  // 카톡 등에 붙었을 때 링크가 조금이라도 짧아 보이게 끝의 index.html은 떼고 보낸다.
  function shareBasePath() {
    return location.pathname.replace(/index\.html$/, '');
  }

  function buildMaumunShareUrl(payload) {
    const json = JSON.stringify(payload);
    const encoded = window.LZString
      ? window.LZString.compressToEncodedURIComponent(json)
      : encodeURIComponent(json);
    return `${location.origin}${shareBasePath()}?maumun=${encoded}`;
  }
  function decodeMaumunPayload(raw) {
    if (!raw || !window.LZString) return null;
    try {
      const json = window.LZString.decompressFromEncodedURIComponent(raw);
      if (!json) return null;
      const payload = JSON.parse(json);
      if (!payload || typeof payload !== 'object' || !payload.d || !payload.rx) return null;
      return payload;
    } catch (e) {
      return null;
    }
  }
  function shareMaumunEntry(entry) {
    const myName = (localStorage.getItem('maumjaro:username') || '').trim();
    const payload = {
      d: entry.diagnosis, i: entry.interpretation, rx: entry.prescription, do: entry.dosage,
      e: entry.emotionEmoji, c: entry.emotionColor, fr: myName || undefined, ts: Date.now(),
    };
    const url = buildMaumunShareUrl(payload);
    // 운세를 보낸 사람에겐 운세 안내가 중복이므로, 타로와 마음 처방 쪽으로 유도한다.
    const text = `${MAUMUN_SHARE_TEXTS[Math.floor(Math.random() * MAUMUN_SHARE_TEXTS.length)]}\n\n🎴 타로 · 💉 마음 처방도 무료예요!`;
    Rx.shareOrCopy(text, url);
  }

  // 받는 사람 쪽엔 감정/사주 개념이 없으므로 맘운 기록(maumunLog)엔 절대 저장하지 않는다 —
  // 3.0의 ?custom= 수신자 플로우와 동일하게 "주사를 놓아야 내용이 공개"되는 구조만 재사용한다.
  function wireIncomingMaumunTrigger(payload) {
    friendMaumunIncomingTitle.textContent = payload.fr
      ? `${payload.fr}${nameSubjectParticle(payload.fr)} 보낸 운세`
      : '친구가 보낸 운세';
    friendMaumunIncomingCard.hidden = false;

    const syntheticP = {
      id: 'friend-maumun-incoming',
      category: 'maumun',
      title: payload.d,
      diagnosis: payload.d,
      emoji: payload.e || '🔮',
      color: payload.c || '#b779ef',
    };

    Rx.wireExternalTrigger(friendMaumunIncomingBtn, syntheticP, () => {
      resetDoseVisuals();
      Rx.showRxImageFade(syntheticP, () => {
        friendMaumunIncomingCard.hidden = true;
        openMaumunReveal({
          emoji: payload.e, diagnosis: payload.d, interpretation: payload.i,
          prescription: payload.rx, dosage: payload.do, color: payload.c,
          showMakeOwnBtn: true,
        });
        // onComplete를 직접 넘긴 흐름은 기본 완료 처리를 타지 않으므로 여기서 주사 상태를
        // 되돌려야 한다. 빠뜨리면 genericState가 'injecting'에 머물러 이후 주사가 전부 막힌다.
        Rx.resetGenericFlowState('확인하기');
      });
    });
  }

  // 이름 뒤에 붙는 주격 조사를 받침에 맞춰 고른다 ("효성이 본" / "민지가 본").
  // 한글 음절은 0xAC00부터 종성 28개 단위로 배열되므로, 나머지가 0이면 받침이 없다.
  function nameSubjectParticle(name) {
    const last = String(name || '').trim().slice(-1);
    if (!last) return '가';
    const code = last.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return '가'; // 한글이 아닌 이름은 기존대로 "가"
    return (code - 0xac00) % 28 === 0 ? '가' : '이';
  }

  // ---------- 친구에게 타로 결과 보내기 (?tarot=<LZString>) ----------
  // 예전엔 공유 링크가 그냥 홈 주소여서, 친구는 이미지만 보고 끝이라 앱으로 들어올 이유가 없었다.
  // 운세 공유(?maumun=)와 똑같은 구조로 결과를 URL에 실어, 받는 사람도 "주사를 놓아야 열리는"
  // 경험을 거쳐 자기 타로로 이어지게 한다(바이럴 루프: 내 타로 → 친구에게 주사 → 친구의 타로).
  // 카톡에 붙었을 때 링크가 길면 그것만으로 지저분해 보인다. 다행히 실어 보낼 값의
  // 가짓수가 아주 적어서(주제 6가지, 카드는 22장 × 정/역 = 44가지) 숫자 하나로 접을 수 있다.
  //   n = ((주제 * 44 + 카드1) * 44 + 카드2) * 44 + 카드3      카드 = id * 2 + 역방향
  // 최댓값이 511103이라 36진수로 네 글자면 충분하다 → ?t=aydb
  const TAROT_CARD_STATES = 44; // 22장 × 정방향/역방향

  function buildTarotShareUrl(topicKey, cards) {
    const ti = TAROT_TOPICS.findIndex((t) => t.key === topicKey);
    let n = ti < 0 ? 0 : ti;
    cards.forEach((c) => { n = n * TAROT_CARD_STATES + (c.card.id * 2 + (c.reversed ? 1 : 0)); });
    return `${location.origin}${shareBasePath()}?t=${n.toString(36)}`;
  }

  // 보낸 사람 이름은 링크에 넣지 않는다 — 카톡·문자 어디로 보내든 받는 쪽에 이미
  // 보낸 사람이 표시되므로 중복이고, 한글 이름은 퍼센트 인코딩되며 링크를 두 배로 늘린다.
  function parseTarotShareCode(code) {
    let n = parseInt(String(code || ''), 36);
    if (!Number.isFinite(n) || n < 0) return null;
    const nums = [];
    for (let i = 0; i < 3; i++) {
      nums.unshift(n % TAROT_CARD_STATES);
      n = Math.floor(n / TAROT_CARD_STATES);
    }
    const topic = TAROT_TOPICS[n];
    if (!topic) return null;
    return { t: topic.key, c: nums };
  }
  function decodeTarotPayload(raw) {
    if (!raw || !window.LZString) return null;
    try {
      const json = window.LZString.decompressFromEncodedURIComponent(raw);
      if (!json) return null;
      const p = JSON.parse(json);
      if (!p || typeof p !== 'object' || !Array.isArray(p.c) || !p.c.length) return null;
      if (!p.t && !p.vt) return null; // 주제 키(신형)도 판정 문구(구형)도 없으면 못 읽는 링크다
      return p;
    } catch (e) {
      return null;
    }
  }
  // 카드 한 장을 숫자 하나로 접는다: id * 2 + 역방향(0/1).
  // 이름·방향·판정은 전부 받는 쪽에서 되살리므로 링크에 실을 필요가 없다.
  // 구형 링크는 [id, 역방향] 쌍으로 실려 있어 둘 다 읽을 수 있게 둔다.
  function tarotPayloadCards(payload) {
    return payload.c
      .map((v) => {
        const id = Array.isArray(v) ? v[0] : (v >> 1);
        const reversed = Array.isArray(v) ? !!v[1] : !!(v & 1);
        const card = TAROT_MAJOR.find((c) => c.id === id);
        return card ? { card, reversed } : null;
      })
      .filter(Boolean);
  }

  function wireIncomingTarotTrigger(payload) {
    const cards = tarotPayloadCards(payload);
    if (!cards.length) return; // 카드를 하나도 못 살리면 조용히 무시하고 평소 홈을 보여준다

    // 별점·판정 제목·판정 문구는 카드와 주제만 있으면 tarotVerdictOf가 똑같이 다시 만든다
    // (같은 입력 → 같은 결과). 그래서 링크에는 주제 키와 카드만 싣는다.
    // 구형 링크(주제 키 없이 문구를 통째로 담던 방식)는 실려온 값을 그대로 쓴다.
    const topic = payload.t
      ? tarotTopicOf(payload.t)
      : { label: payload.tl || '오늘의', emoji: payload.te || '🎴' };
    const verdict = payload.t
      ? tarotVerdictOf(cards, topic)
      : { stars: payload.s || 3, title: payload.vt, line: payload.vl || '' };
    const topicLabel = topic.label;
    const topicEmoji = topic.emoji || '🎴';

    friendTarotIncomingTitle.textContent = payload.fr
      ? `${payload.fr}${nameSubjectParticle(payload.fr)} 본 ${topicLabel} 타로`
      : `친구가 본 ${topicLabel} 타로`;
    friendTarotIncomingCard.hidden = false;

    const syntheticP = {
      id: 'friend-tarot-incoming',
      category: 'maumun',
      title: verdict.title,
      diagnosis: verdict.title,
      emoji: topicEmoji,
      color: '#b779ef',
    };

    Rx.wireExternalTrigger(friendTarotIncomingBtn, syntheticP, () => {
      resetDoseVisuals();
      Rx.showRxImageFade(syntheticP, () => {
        friendTarotIncomingCard.hidden = true;
        openMaumunReveal({
          emoji: topicEmoji,
          diagnosis: `${topicLabel} 타로 · ${verdict.title}`,
          interpretation: cards.map((c) => `${c.card.name}(${tarotDirLabel(c.reversed)})`).join(' · '),
          prescription: verdict.line,
          dosage: starsText(verdict.stars),
          color: '#b779ef',
          showMakeOwnBtn: true, // "나도 보기" → 운세/타로 탭으로 이어진다
          makeOwnLabel: '🎴 나도 타로 보기',
        });
        Rx.resetGenericFlowState('확인하기');
      });
    });
  }

  function renderMaumun(profile) {
    // 오늘 이미 확인(주사 완료)했다면 새로 계산하지 않고 기록된 그대로 보여준다 —
    // 같은 날 여러 번 들어와도 오늘의 맘운이 계속 달라지지 않도록 하는 장치.
    const todayEntry = getTodayMaumunEntry();
    if (todayEntry) {
      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">🌞 오늘의 맘운</span>
        </div>
        <div class="rx-custom-preview">
          <div class="rx-slip-row"><span class="rx-slip-key">오늘의 ${todayEntry.categoryLabel}</span><span class="rx-slip-value">${starsText(todayEntry.stars)}</span></div>
        </div>
        <div class="today-rx-card" style="display:flex;">
          <div class="today-rx-emoji">${todayEntry.emotionEmoji}</div>
          <div class="today-rx-body">
            <div class="today-rx-eyebrow">오늘의 마음</div>
            <div class="today-rx-title">${todayEntry.emotionLabel}</div>
          </div>
        </div>
        <p class="rx-custom-hint">✅ 오늘의 맘운은 이미 확인했어요. 처방전은 언제든 다시 볼 수 있어요.</p>
        <button class="action-btn" id="fortune-maumun-reopen-btn" type="button" style="width:100%;">💊 처방전 다시 보기</button>
        <button class="rx-friend-quick-btn" id="fortune-maumun-share-btn" type="button" style="width:100%;margin-top:10px;">💌 친구에게 오늘의 운세 보내기</button>
        <button class="rx-friend-quick-btn" id="fortune-maumun-history-btn" type="button" style="width:100%;margin-top:10px;">📖 지난 맘운 보기</button>
      `;
      document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
      document.getElementById('fortune-maumun-reopen-btn').addEventListener('click', () => {
        openMaumunReveal(maumunEntryToReveal(todayEntry));
      });
      document.getElementById('fortune-maumun-share-btn').addEventListener('click', () => shareMaumunEntry(todayEntry));
      document.getElementById('fortune-maumun-history-btn').addEventListener('click', () => openHistoryCategory('maumun'));
      return;
    }

    const emotion = getTodayEmotionEntry();

    if (!emotion) {
      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">💞 맘운 처방</span>
        </div>
        <p class="rx-custom-hint">아직 오늘의 마음을 기록하지 않으셨어요. 홈에서 먼저 오늘의 감정을 처방받고 오면, 오늘의 운세와 합쳐서 맘운을 보여드릴게요</p>
        <button class="action-btn" id="fortune-goto-home-btn" type="button" style="width:100%;">💉 홈에서 마음 처방받기</button>
        <button class="rx-friend-quick-btn" id="fortune-maumun-history-btn" type="button" style="width:100%;margin-top:10px;">📖 지난 맘운 보기</button>
      `;
      document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
      document.getElementById('fortune-goto-home-btn').addEventListener('click', () => {
        document.querySelector('.tab-btn[data-view="home"]').click();
      });
      document.getElementById('fortune-maumun-history-btn').addEventListener('click', () => openHistoryCategory('maumun'));
      return;
    }

    // "운세가 감정을 해석하고 그 결과가 처방으로 이어지는" 구조: 감정에 매핑된 운세 카테고리를
    // 오늘의 운세(renderFortuneDaily)와 동일한 결정론적 시드로 골라, 감정×카테고리 티어로
    // 미리 써둔 해석/진단명/처방/복용법 매트릭스에서 오늘의 맘운을 뽑는다.
    // 캡슐 등급을 정하려면 이 계산이 연출보다 먼저 끝나 있어야 한다.
    const chart = getOrComputeSajuChart(profile);
    const categoryKey = MAUMUN_EMOTION_CATEGORY[emotion.key] || 'mind';
    const categorySeed = FORTUNE_SEED_BY_CATEGORY[categoryKey];
    const categoryItem = categorySeed.items[dailyPickIndex(chart, categoryKey, categorySeed.items.length)];
    const tier = categoryItem.stars <= 2 ? 'low' : categoryItem.stars === 3 ? 'mid' : 'high';
    const interp = (MAUMUN_INTERPRETATION[emotion.key] && MAUMUN_INTERPRETATION[emotion.key][tier])
      || MAUMUN_INTERPRETATION.stress.mid;

    withMysticalReveal(profile, '🌞 오늘의 맘운', () => {
      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">🌞 오늘의 맘운</span>
        </div>

        <div class="rx-custom-preview">
          <div class="rx-slip-row"><span class="rx-slip-key">오늘의 ${FORTUNE_CATEGORY_LABELS[categoryKey]}</span><span class="rx-slip-value">${starsText(categoryItem.stars)}</span></div>
          <p class="rx-slip-text">${categoryItem.quip}</p>
        </div>

        <div class="today-rx-card" style="display:flex;">
          <div class="today-rx-emoji">${emotion.emoji}</div>
          <div class="today-rx-body">
            <div class="today-rx-eyebrow">오늘의 마음</div>
            <div class="today-rx-title">${emotion.label}</div>
            <div class="today-rx-diagnosis">${emotion.caption}</div>
          </div>
        </div>

        <div class="tarot-gate-cards" style="margin:20px 0 22px;">
          <div class="tarot-card-back" style="--g:0">${TAROT_BACK_SVG}</div>
        </div>

        <p class="tarot-hint">이 둘을 합치면 오늘의 맘운이 나와요.<br /><strong>주사를 놓으면 해석과 처방이 열립니다</strong></p>
        <button class="action-btn" id="fortune-maumun-inject-btn" type="button" style="width:100%;">💉 주사 놓고 오늘의 맘운 열기</button>
        <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">팔을 눌러도 되고, 폰을 콕 찌르듯 움직여도 돼요</p>
      `;
      document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));

      // 사주 계산 엔진이 기존 주사 UI를 대체하지 않도록, 처방센터/커스텀 처방전과 동일한
      // startGenericPrepare/startGenericInject 인터랙션을 그대로 재사용한다 (prescriptions.js의 export).
      const syntheticP = {
        id: 'maumun-today',
        category: 'maumun',
        title: interp.diagnosis,
        diagnosis: interp.diagnosis,
        emoji: emotion.emoji,
        color: emotion.color || '#b779ef',
      };
      const injectBtn = document.getElementById('fortune-maumun-inject-btn');
      Rx.wireExternalTrigger(injectBtn, syntheticP, () => {
        resetDoseVisuals();
        // 직접 onComplete를 넘긴 흐름은 기본 완료 처리를 타지 않으므로 상태를 직접 되돌린다.
        // 이게 없으면 주사 상태가 'injecting'에 머물러 이후 모든 주사가 막혔다.
        Rx.resetGenericFlowState('처방받기');
        Rx.showRxImageFade(syntheticP, () => {
          const entry = {
            date: todayDateKey(),
            emotionKey: emotion.key,
            emotionLabel: emotion.label,
            emotionEmoji: emotion.emoji,
            emotionColor: emotion.color,
            categoryKey,
            categoryLabel: FORTUNE_CATEGORY_LABELS[categoryKey],
            stars: categoryItem.stars,
            diagnosis: interp.diagnosis,
            interpretation: interp.interpretation,
            prescription: interp.prescription,
            dosage: interp.dosage,
            injected: true,
            ts: Date.now(),
          };
          saveMaumunLogEntry(entry);
          renderHomeMaumunTeaser(); // 홈 카드도 바로 "오늘 완료" 상태로 갱신
          openMaumunReveal(maumunEntryToReveal(entry));
        });
      });
    });
  }

  // "지난 맘운" 전용 화면은 없앴다 — 기록 탭 → 운세와 같은 loadMaumunLog()를 읽는 중복이었고,
  // 기록 쪽이 일/월/년 뷰까지 되는 상위 호환이다. 항목을 눌러 처방전을 다시 여는 기능은
  // renderHistoryCategoryView의 onOpen으로 옮겨갔다.

  // ---------- 4.4: AI 맘운 (실제 LLM 호출 없이 사주 프로필+오늘의 운세+오늘의 감정+질문 키워드를
  // 조합해 미리 써둔 문장 풀에서 답변을 조립하는 "유사 AI") ----------
  // 매칭되는 키워드가 없으면 null을 돌려준다 — 호출부가 "질문을 못 알아들었다"는 사실 자체를
  // 알아야 위트있는 안내 문구를 붙일지 말지 판단할 수 있기 때문에, 여기서 'mind'로 조용히
  // 대체해버리지 않는다.
  function detectAiMaumunCategory(question) {
    const q = question.toLowerCase();
    const cats = Object.keys(AI_MAUMUN_KEYWORDS);
    for (let i = 0; i < cats.length; i++) {
      if (AI_MAUMUN_KEYWORDS[cats[i]].some((kw) => q.includes(kw))) return cats[i];
    }
    return null;
  }

  function buildAiMaumunAnswer(profile, emotion, question) {
    const chart = getOrComputeSajuChart(profile);
    const relation = elementRelation(chart.dayMasterElement, todayDayMasterElement());
    const opening = AI_MAUMUN_OPENING_SEED[relation];

    const matchedCategory = detectAiMaumunCategory(question);
    const category = matchedCategory || 'mind';
    const categorySeed = FORTUNE_SEED_BY_CATEGORY[category];
    const categoryItem = categorySeed.items[dailyPickIndex(chart, `ai-${category}`, categorySeed.items.length)];

    // 같은 질문을 같은 날 다시 물어보면 같은 답이 나오도록, 질문 텍스트까지 해시에 포함한다.
    const qIdx = (pool) => hashStr(`${chart.pillars.day.gan}${chart.pillars.day.zhi}:${todayDateKey()}:${question}`) % pool.length;
    const advice = AI_MAUMUN_ADVICE_SEED[category][qIdx(AI_MAUMUN_ADVICE_SEED[category])];
    const affirmation = AI_MAUMUN_AFFIRMATION_SEED[category][qIdx(AI_MAUMUN_AFFIRMATION_SEED[category])];
    // 질문이 뭘 묻는지 알아챘으면 그 답(advice)을 맨 앞으로, 못 알아챘으면(엉뚱한 질문) 위트있게
    // 인정하고 넘어가는 문구를 맨 앞으로 — 어느 쪽이든 "직접적인 답"이 가장 먼저 나오게 한다.
    const directAnswer = matchedCategory
      ? advice
      : AI_MAUMUN_WITTY_FALLBACK[qIdx(AI_MAUMUN_WITTY_FALLBACK)];

    return {
      directAnswer,
      opening,
      context: `오늘의 ${FORTUNE_CATEGORY_LABELS[category]}이 조금 예민하게 작용할 수 있어요. ${categoryItem.quip}`,
      emotionLine: `지금 마음엔 '${emotion.label}'도 자리하고 있으니, 너무 몰아붙이지 않아도 돼요.`,
      affirmation,
      rxCategory: categorySeed.rxCategory,
    };
  }

  // 4.6: Cloudflare Worker 등으로 배포한 DeepSeek 프록시의 URL. 배포 방법은 AI_PROXY_SETUP.md 참고.
  // 비워두면(기본값) 지금처럼 템플릿 기반 유사 AI로 동작한다 — API 키를 정적 사이트에 직접
  // 넣으면 공개 저장소에 노출되므로, 실제 AI를 쓰려면 반드시 이 프록시를 거쳐야 한다.
  const AI_MAUMUN_PROXY_URL = 'https://maumjaro-ai.mb5252-f00.workers.dev';

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function fetchAiMaumunFromProxy(profile, emotion, question) {
    const chart = getOrComputeSajuChart(profile);
    const relation = elementRelation(chart.dayMasterElement, todayDayMasterElement());
    const opening = AI_MAUMUN_OPENING_SEED[relation];
    // detectAiMaumunCategory는 키워드가 안 맞으면 null을 준다("타이거 우즈 나이" 같은 사실 질문).
    // 운세 힌트를 뽑을 때는 기본값으로 마음운을 쓰되, 매칭 여부는 프롬프트 톤을 정하는 데 쓴다.
    const matchedCategory = detectAiMaumunCategory(question);
    const category = matchedCategory || 'mind';
    const categorySeed = FORTUNE_SEED_BY_CATEGORY[category];
    const categoryItem = categorySeed.items[dailyPickIndex(chart, `ai-${category}`, categorySeed.items.length)];

    const now = new Date();
    const todayLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const systemPrompt = [
      '너는 "맘운자로"라는 한국 앱의 "AI 맘운" 캐릭터다.',
      '사용자의 사주(오행 관계), 오늘의 운세, 오늘 감정, 사용자의 질문을 종합해서 답한다.',
      '문체: 상냥한 존댓말, 따뜻하고 위로가 되는 톤. 무겁거나 불안을 조장하는 표현은 쓰지 않는다.',
      '실제 의학적·심리학적 진단명은 절대 쓰지 않는다.',
      '가장 중요한 원칙: 질문에 대한 직접적인 답변을 맨 처음 문장으로 먼저 제시한다. 오늘의 흐름이나 운세 설명으로 답을 미루지 않는다.',
      // 사실 질문 대응: 아는 건 정확히, 모르는 건 솔직히. 지어내면 앱 신뢰도가 무너진다.
      '질문이 인물·날짜·상식 같은 사실 확인이면 아는 범위에서 정확하게 답한다. 나이를 물으면 아래에 주어진 오늘 날짜를 기준으로 계산한다.',
      '확실하지 않은 사실은 지어내지 말고 "정확히는 모르겠어요"라고 솔직히 말한 뒤 위트로 넘어간다.',
      '날씨, 오늘의 뉴스, 주가, 경기 결과처럼 실시간 정보는 알 수 없다. 이런 질문에는 모른다고 짧게 인정하고 위트있게 받아친 뒤 오늘의 운 이야기로 넘어간다.',
      '질문이 이상하거나 엉뚱하거나 운세와 관련 없어 보여도 당황하지 말고, 센스있고 위트있게 받아치면서 자연스럽게 위로로 이어간다. 질문을 무시하거나 "답할 수 없다"고 말하지 않는다.',
      '답변은 다음 순서를 지키되 항목 번호나 제목은 쓰지 않는다: 질문에 대한 직접적인 답 한두 문장(위트 포함 가능) → 오늘 전체 흐름 한 문장 → "💉 오늘의 처방:" 뒤에 짧은 확언 한 문장(따옴표로 감싸기).',
      // 길게 답하면 아래 처방/주사 흐름이 화면 밖으로 밀린다.
      '문단 사이는 줄바꿈 두 번으로 구분한다. 문단은 최대 3개, 전체 180자 이내로 짧게 답한다. 장황한 설명이나 목록은 절대 쓰지 않는다.',
    ].join(' ');

    const userPrompt = [
      `오늘 날짜: ${todayLabel}`,
      `오늘의 전체 기운: ${opening}`,
      `오늘 해당하는 운 카테고리(${FORTUNE_CATEGORY_LABELS[category]}) 힌트: ${categoryItem.quip}`,
      `오늘의 감정: ${emotion.label}`,
      `질문: ${question}`,
    ].join('\n');

    return fetch(AI_MAUMUN_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userPrompt }),
    })
      .then((r) => { if (!r.ok) throw new Error('proxy error'); return r.json(); })
      .then((data) => {
        if (!data || !data.answer) throw new Error('empty answer');
        return { text: data.answer, rxCategory: categorySeed.rxCategory };
      });
  }

  function renderAiMaumunRawAnswer(text, rxCategory) {
    const answerEl = document.getElementById('ai-maumun-answer');
    const paragraphs = text.trim().split(/\n{2,}/)
      .map((p) => `<p class="rx-detail-symptom" style="margin-top:10px;">${escapeHtml(p)}</p>`).join('');
    answerEl.innerHTML = `
      <div class="rx-detail-card" style="margin-top:16px;">
        ${paragraphs}
        <button class="rx-friend-quick-btn ai-maumun-goto-rx-btn" type="button" style="margin-top:10px;">처방 후보 보러가기 ›</button>
      </div>`;
    answerEl.querySelector('.ai-maumun-goto-rx-btn').addEventListener('click', () => Rx.goToRxCategory(rxCategory));
    answerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderAiMaumunAnswer(answer) {
    const answerEl = document.getElementById('ai-maumun-answer');
    answerEl.innerHTML = `
      <div class="rx-detail-card" style="margin-top:16px;">
        <p class="rx-detail-symptom" style="font-weight:700;">${answer.directAnswer}</p>
        <p class="rx-detail-symptom" style="margin-top:10px;">${answer.opening}</p>
        <p class="rx-detail-symptom" style="margin-top:10px;">${answer.context}</p>
        <p class="rx-detail-symptom" style="margin-top:10px;">${answer.emotionLine}</p>
        <div class="rx-custom-preview" style="margin-top:14px;">
          <div class="rx-slip-row"><span class="rx-slip-key">💉 오늘의 처방</span></div>
          <p class="rx-slip-text">'${answer.affirmation}'</p>
        </div>
        <button class="rx-friend-quick-btn ai-maumun-goto-rx-btn" type="button" style="margin-top:10px;">처방 후보 보러가기 ›</button>
      </div>`;
    document.getElementById('ai-maumun-answer').querySelector('.ai-maumun-goto-rx-btn')
      .addEventListener('click', () => Rx.goToRxCategory(answer.rxCategory));
    answerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderAiMaumun(profile) {
    const emotion = getTodayEmotionEntry();
    if (!emotion) {
      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">🤖 AI 맘운</span>
        </div>
        <p class="rx-custom-hint">아직 오늘의 마음을 기록하지 않으셨어요. 홈에서 먼저 오늘의 감정을 처방받고 오면, AI 맘운이 사주+운세+감정을 합쳐서 답해드릴게요</p>
        <button class="action-btn" id="fortune-goto-home-btn" type="button" style="width:100%;">💉 홈에서 마음 처방받기</button>
      `;
      document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
      document.getElementById('fortune-goto-home-btn').addEventListener('click', () => {
        document.querySelector('.tab-btn[data-view="home"]').click();
      });
      return;
    }

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
        <span class="rx-nav-title">🤖 AI 맘운</span>
      </div>
      <p class="rx-custom-hint">💛 오늘 상황이나 궁금한 걸 편하게 적어보세요. 사주 프로필 + 오늘의 운세 + 지금 마음을 합쳐서 답해드릴게요</p>
      <textarea id="ai-maumun-input" class="rx-custom-input" style="width:100%;min-height:80px;resize:vertical;" maxlength="60" placeholder="예: 오늘 회사에서 발표가 있는데 괜찮을까?"></textarea>
      <span class="rx-custom-counter" id="ai-maumun-count">0/60</span>
      <button class="action-btn" id="ai-maumun-submit-btn" type="button" style="width:100%;margin-top:10px;">🔮 AI 맘운에게 물어보기</button>
      <div id="ai-maumun-answer"></div>
    `;
    document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));

    const input = document.getElementById('ai-maumun-input');
    const count = document.getElementById('ai-maumun-count');
    input.addEventListener('input', () => {
      count.textContent = `${input.value.length}/60`;
    });

    const submitBtn = document.getElementById('ai-maumun-submit-btn');
    submitBtn.addEventListener('click', () => {
      const question = input.value.trim();
      if (!question) {
        Core.showToast('궁금한 걸 먼저 적어주세요');
        return;
      }
      const answerEl = document.getElementById('ai-maumun-answer');
      const loadingLine = AI_MAUMUN_LOADING_LINES[Math.floor(Math.random() * AI_MAUMUN_LOADING_LINES.length)];
      submitBtn.disabled = true;
      answerEl.innerHTML = `
        <div class="fortune-loading" style="padding:50px 20px;">
          <div class="fortune-loading-orb">🔮</div>
          <p class="fortune-loading-text">${loadingLine}</p>
        </div>`;
      answerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

      function fallBackToTemplate() {
        const answer = buildAiMaumunAnswer(profile, emotion, question);
        renderAiMaumunAnswer(answer);
        submitBtn.disabled = false;
      }

      if (AI_MAUMUN_PROXY_URL) {
        fetchAiMaumunFromProxy(profile, emotion, question)
          .then(({ text, rxCategory }) => {
            renderAiMaumunRawAnswer(text, rxCategory);
            submitBtn.disabled = false;
          })
          .catch(fallBackToTemplate); // 프록시가 아직 없거나 응답에 실패해도 앱이 멈추지 않는다
      } else {
        setTimeout(fallBackToTemplate, 1600 + Math.floor(Math.random() * 900));
      }
    });
  }

  // existingProfile이 있으면 "수정 모드"로, 기존 값을 그대로 채워서 보여준다.
  // ---------- 4.9: 타로 (메이저 아르카나 22장 / 3장 스프레드) ----------
  // 브랜드 원칙: 타로는 독립된 목적지가 아니다. 3장 스프레드의 자리를 앱의 핵심 흐름
  // (마음 → 운 → 처방)에 그대로 대응시키고, 마지막은 반드시 주사로 끝난다.
  // 하단 탭을 새로 만들지 않고 운세센터 타일 하나로만 진입한다.
  const TAROT_LOG_KEY = 'maumjaro:tarotLog';
  const TAROT_FAN_COUNT = 9; // 부채꼴에 펼칠 카드 수

  // 저장 구조: log[날짜][주제] = entry. 주제마다 하루 한 번씩 볼 수 있다.
  // 주제 선택이 없던 시절의 기록(log[날짜]에 cards가 바로 있던 형태)은 'today' 주제로 읽어준다.
  function loadTarotLog() {
    try {
      const raw = localStorage.getItem(TAROT_LOG_KEY);
      const log = raw ? JSON.parse(raw) : {};
      return (log && typeof log === 'object') ? log : {};
    } catch (e) {
      return {};
    }
  }
  function normalizeTarotDay(day) {
    if (!day || typeof day !== 'object') return {};
    return Array.isArray(day.cards) ? { today: day } : day; // 구 형식 마이그레이션
  }
  function saveTarotDraw(entry) {
    const log = loadTarotLog();
    const day = normalizeTarotDay(log[entry.date]);
    day[entry.topic || 'today'] = entry;
    log[entry.date] = day;
    localStorage.setItem(TAROT_LOG_KEY, JSON.stringify(log));
  }
  function getTarotDraw(topicKey) {
    const day = normalizeTarotDay(loadTarotLog()[todayDateKey()]);
    const entry = day[topicKey];
    // 카드 데이터가 바뀌어 id를 못 찾는 경우까지 대비한다.
    if (!entry || !Array.isArray(entry.cards) || entry.cards.length !== 3) return null;
    return entry.cards.every((c) => tarotCardOf(c.id)) ? entry : null;
  }
  function countTodayTarotDraws() {
    return Object.keys(normalizeTarotDay(loadTarotLog()[todayDateKey()])).length;
  }
  function tarotTopicOf(key) {
    return TAROT_TOPICS.find((t) => t.key === key) || TAROT_TOPICS[TAROT_TOPICS.length - 1];
  }

  // ---------- 종합 결과 ----------
  // 정방향 +1, 역방향 -1을 더해 -3~+3 점수를 내고 다섯 단계로 읽는다.
  function tarotVerdictOf(cards, topic) {
    const score = cards.reduce((sum, c) => sum + (c.reversed ? -1 : 1), 0);
    const level = TAROT_VERDICT.find((v) => score >= v.min) || TAROT_VERDICT[TAROT_VERDICT.length - 1];
    return {
      score,
      stars: level.stars,
      title: level.title,
      line: level.line.replace('{topic}', topic.label),
    };
  }

  // ---------- 종합 결과에 따른 자동 처방 ----------
  // 주제에 맞는 처방센터 카테고리에서 실제 처방 하나를 골라준다(사용자가 고르지 않아도 되게).
  // 같은 날 같은 주제면 늘 같은 처방이 나오도록 날짜+카드로 결정한다.
  function pickTarotPrescription(cards, topic, adviceCard) {
    const catId = topic.rxCategory || adviceCard.card.rxCategory;
    const seed = (window.MAUMJARO_RX_DATA && window.MAUMJARO_RX_DATA.PRESCRIPTIONS_SEED) || [];
    const pool = seed.filter((p) => p.category === catId);
    if (!pool.length) return null;
    const key = `${todayDateKey()}-${topic.key}-${cards.map((c) => c.card.id).join('-')}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 100000;
    return pool[h % pool.length];
  }

  function tarotCardOf(id) {
    return TAROT_MAJOR.find((c) => c.id === id) || null;
  }
  function tarotSideOf(card, reversed) {
    return reversed ? card.rev : card.up;
  }
  function tarotDirLabel(reversed) {
    return reversed ? '역방향' : '정방향';
  }
  // 실제 타로 카드처럼 상단에 로마숫자를 넣는다 (0은 관례대로 0으로 표기)
  function tarotRoman(n) {
    if (n === 0) return '0';
    const table = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let rest = n;
    let out = '';
    table.forEach(([v, s]) => {
      while (rest >= v) { out += s; rest -= v; }
    });
    return out;
  }

  // 카드 앞면 마크업. 작은 카드(결과 화면)와 큰 카드(전체화면 공개)가 같은 구조를 쓰도록
  // 한 곳에서 만든다 — 크기는 CSS로만 달라진다(디자인이 갈라지지 않게).
  function tarotFaceHtml(c, opts) {
    const o = opts || {};
    const style = o.delay ? ` style="animation-delay:${o.delay}s;"` : '';
    // 실제 도판(퍼블릭 도메인 1909년 원본)이 있는 카드는 그 그림을 카드 전체로 쓴다.
    // 도판 안에 이미 로마숫자와 카드 이름이 그려져 있으므로 우리 텍스트는 겹쳐 넣지 않고,
    // 도판에 없는 정/역방향만 작은 배지로 얹는다.
    if (c.card.img) {
      // 방향 표시는 카드 위에 얹지 않는다 — 도판 하단에 인쇄된 카드 이름을 가리기 때문.
      // 결과 화면에서는 카드 아래 캡션으로, 전체화면에서는 이미 키워드 줄에 표시된다.
      return `
        <div class="tarot-face has-img${c.reversed ? ' reversed' : ''}"${style}>
          <img class="tarot-face-img" src="${c.card.img}" alt="${c.card.name} 카드" decoding="async" />
        </div>`;
    }
    return `
      <div class="tarot-face${c.reversed ? ' reversed' : ''}"${style}>
        <div class="tarot-face-frame">
          <div class="tarot-face-num">${tarotRoman(c.card.id)}</div>
          <div class="tarot-face-art"><span class="tarot-face-emoji">${c.card.emoji}</span></div>
          <div class="tarot-face-label">
            <div class="tarot-face-name">${c.card.name}</div>
            <span class="tarot-face-dir">${tarotDirLabel(c.reversed)}</span>
          </div>
        </div>
      </div>`;
  }

  // ---------- 카드 한 장을 전체화면으로 보여준다 ----------
  // mode 'sequence': 뽑은 3장을 한 장씩 넘겨 보며 긴장감을 만든 뒤 결과로 넘어간다.
  // mode 'single'  : 결과 화면에서 특정 카드를 다시 크게 볼 때.
  const tarotCardOverlay = document.getElementById('tarot-card-overlay');
  const tarotCardStep = document.getElementById('tarot-card-step');
  const tarotCardPos = document.getElementById('tarot-card-pos');
  const tarotCardStage = document.getElementById('tarot-card-stage');
  const tarotCardKey = document.getElementById('tarot-card-key');
  const tarotCardLine = document.getElementById('tarot-card-line');
  const tarotCardNextBtn = document.getElementById('tarot-card-next');
  let tarotCardOnNext = null;

  function paintTarotCardModal(c, index, total, nextLabel, topic) {
    const pos = topic.positions[index];
    tarotCardStep.textContent = total > 1 ? `${topic.emoji} ${topic.label} · ${index + 1} / ${total}` : `${topic.emoji} ${topic.label}`;
    tarotCardPos.textContent = `${pos.emoji} ${pos.label}`;
    // innerHTML을 다시 넣어야 뒤집히는 애니메이션이 매번 재생된다.
    tarotCardStage.innerHTML = tarotFaceHtml(c);
    tarotCardKey.textContent = `${c.card.name} · ${tarotDirLabel(c.reversed)} · ${c.side.keyword}`;
    tarotCardLine.textContent = c.side.line;
    tarotCardNextBtn.textContent = nextLabel;
    // 결과가 드러나는 순간은 요란하면 안 된다. 노이즈 없는 화음만 부드럽게 올린다.
    sfx('cardReveal');
  }

  function closeTarotCardOverlay() {
    tarotCardOverlay.classList.remove('show');
    tarotCardOnNext = null;
  }

  tarotCardNextBtn.addEventListener('click', () => {
    const fn = tarotCardOnNext;
    if (typeof fn === 'function') fn();
    else closeTarotCardOverlay();
  });

  // 3장을 순서대로 한 장씩 공개하고, 다 넘기면 onFinish로 결과 화면으로 간다.
  function revealTarotCardsOneByOne(cards, topic, onFinish) {
    let i = 0;
    const step = () => {
      if (i >= cards.length) {
        closeTarotCardOverlay();
        tarotSound('playHealingChime'); // 세 장을 다 본 뒤 마무리 소리
        onFinish();
        return;
      }
      const isLast = i === cards.length - 1;
      paintTarotCardModal(cards[i], i, cards.length, isLast ? '🔮 종합 결과 보기' : '다음 카드 ›', topic);
      i += 1;
      tarotCardOnNext = step;
    };
    tarotCardOverlay.classList.add('show');
    step();
  }

  function openTarotCardSingle(cards, index, topic) {
    tarotCardOverlay.classList.add('show');
    paintTarotCardModal(cards[index], index, 1, '닫기', topic);
    tarotCardOnNext = closeTarotCardOverlay;
  }

  // ---------- 타로 AI 리딩: 3장을 하나의 이야기로 엮는다 ----------
  // 카드별 고정 문구를 나열하는 것과 달리, 세 장의 관계 + 오늘 감정 + 오늘의 기운을 묶어
  // 한 편의 리딩으로 읽어준다. 결과는 그날의 뽑기 기록에 캐시해서, 다시 들어와도 같은
  // 리딩이 보이고 API도 하루 한 번만 부른다.
  function fetchTarotReading(profile, cards, topic, verdict) {
    const chart = getOrComputeSajuChart(profile);
    const relation = elementRelation(chart.dayMasterElement, todayDayMasterElement());
    const opening = AI_MAUMUN_OPENING_SEED[relation];
    const emotion = getTodayEmotionEntry();
    const now = new Date();
    const todayLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const systemPrompt = [
      '너는 "맘운자로"라는 한국 앱의 타로 리더다.',
      '사용자가 물어본 주제에 대해서만 답한다. 주제와 상관없는 이야기로 넘어가지 않는다.',
      '뽑힌 세 장을 각각 따로 설명하지 말고, 세 장이 이어지는 하나의 이야기로 읽어준다.',
      '주어진 종합 결과(점수)와 어긋나는 해석을 하지 않는다. 점수가 낮으면 억지로 긍정하지 않고 쉬어가라는 쪽으로 읽는다.',
      '문체: 상냥한 존댓말. 신비롭지만 겁주지 않는다. 불안을 조장하는 표현은 쓰지 않는다.',
      '실제 의학적·심리학적 진단명은 절대 쓰지 않는다.',
      '카드 이름과 정/역방향은 이미 화면에 보이므로 나열하지 말고, 의미만 엮어 말한다.',
      '운세는 정해진 미래가 아니라 오늘을 살아가는 참고라는 태도를 유지한다. 단정하거나 겁주지 않는다.',
      // 글자 수만 지시하면 잘 안 지켜서, 문장 수와 문장 길이까지 함께 못박는다.
      '형식을 엄격히 지켜라: (1) 오늘의 흐름을 두 문장으로. 한 문장은 40자를 넘기지 않는다.',
      '(2) 줄바꿈 두 번. (3) "💉 오늘의 처방:" 뒤에 따옴표로 감싼 한 문장.',
      '전체 150자를 절대 넘기지 않는다. 수식어를 덧붙이지 말고 짧게 끊어라. 항목 번호나 제목은 쓰지 않는다.',
    ].join(' ');

    const cardLines = cards.map((c, i) => `${topic.positions[i].label}: ${c.card.name}(${tarotDirLabel(c.reversed)}, ${c.side.keyword})`).join('\n');
    const userPrompt = [
      `오늘 날짜: ${todayLabel}`,
      `물어본 주제: ${topic.label} — ${topic.question}`,
      `종합 결과: ${verdict.title} (5점 중 ${verdict.stars}점)`,
      `오늘의 전체 기운: ${opening}`,
      emotion ? `오늘 기록한 감정: ${emotion.label}` : '오늘 감정은 아직 기록하지 않았다',
      '뽑힌 카드:',
      cardLines,
    ].join('\n');

    return fetch(AI_MAUMUN_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userPrompt }),
    })
      .then((r) => { if (!r.ok) throw new Error('proxy error'); return r.json(); })
      .then((data) => {
        if (!data || !data.answer) throw new Error('empty answer');
        return String(data.answer).trim();
      });
  }

  function renderTarotReadingText(text) {
    const el = document.getElementById('tarot-ai-reading');
    if (!el) return;
    const paragraphs = text.split(/\n{2,}/)
      .map((p) => `<p class="tarot-read-line" style="margin-top:8px;">${escapeHtml(p)}</p>`).join('');
    el.innerHTML = `
      <div class="tarot-ai-card">
        <div class="tarot-ai-title">🔮 세 장을 엮은 오늘의 리딩</div>
        ${paragraphs}
      </div>`;
  }

  // 리딩을 붙인다. 캐시가 있으면 그걸 쓰고, 없으면 한 번만 불러와 저장한다.
  // 프록시가 없거나 실패하면 이 블록만 조용히 비워둔다 — 카드별 해석은 그대로 남아 있다.
  function wireTarotReading(profile, entry, cards, topic, verdict) {
    const el = document.getElementById('tarot-ai-reading');
    if (!el) return;
    if (entry.reading) {
      renderTarotReadingText(entry.reading);
      return;
    }
    if (!AI_MAUMUN_PROXY_URL) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <div class="tarot-ai-card">
        <div class="fortune-loading" style="padding:14px 0;">
          <div class="fortune-loading-orb">🔮</div>
          <p class="fortune-loading-text">세 장을 이어 읽고 있어요…</p>
        </div>
      </div>`;
    fetchTarotReading(profile, cards, topic, verdict)
      .then((text) => {
        // 저장 시점에 최신 기록을 다시 읽어 리딩만 덧붙인다(주사 여부 등이 덮이지 않게).
        const latest = getTarotDraw(entry.topic) || entry;
        saveTarotDraw({ ...latest, reading: text });
        renderTarotReadingText(text);
      })
      .catch(() => {
        el.innerHTML = `
          <div class="tarot-ai-card">
            <p class="tarot-read-line" style="color:var(--text-dim);">리딩을 불러오지 못했어요.</p>
            <button class="rx-friend-quick-btn" id="tarot-reading-retry" type="button" style="margin-top:8px;">다시 시도</button>
          </div>`;
        const retry = document.getElementById('tarot-reading-retry');
        if (retry) retry.addEventListener('click', () => wireTarotReading(profile, entry, cards, topic, verdict));
      });
  }

  // ---------- 공유 이미지 미리 만들기 ----------
  // iOS는 navigator.share()를 "사용자가 누른 직후"에만 열어준다(제스처 권한).
  // 그런데 타로 캡처에는 실제 카드 도판 3장(각 200KB)이 들어가서 html2canvas가 몇 초씩
  // 걸리고, 그 사이 제스처 권한이 만료돼 공유 시트가 아예 뜨지 않는다. 그러면 await가
  // 끝나지 않아 버튼이 "준비 중..."에 멈춘 채로 남는다(= 친구에게 전송이 안 되는 증상).
  // 처방전 공유가 멀쩡한 이유도 같다 — 그쪽 캡처엔 무거운 도판이 없어 제때 끝난다.
  // 그래서 결과 화면이 뜨는 즉시 백그라운드로 이미지를 만들어 두고, 버튼을 누르는
  // 순간에는 기다리지 않고 곧바로 공유 시트를 연다.
  let tarotShareBlob = null;
  let tarotShareBlobJob = null;

  function withTimeout(promise, ms) {
    // 거부가 아니라 null로 "시간 초과"를 알린다 — 어떤 경우에도 버튼이 멈추지 않게 한다.
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
  }

  // 카드 등장 애니메이션이 실제로 끝날 때까지 기다린다.
  // getAnimations()가 있으면 정확히 기다리고, 없으면 애니메이션 총 길이
  // (지연 최대 0.9s + 재생 0.55s)에 여유를 둔 시간만큼 기다린다.
  // 어느 쪽이든 상한을 둬서, 애니메이션이 끝나지 않아도 공유가 막히지 않게 한다.
  function waitForTarotRevealAnimations(node) {
    const capped = new Promise((resolve) => setTimeout(resolve, 1800));
    const faces = [...node.querySelectorAll('.tarot-face')];
    if (!faces.length || typeof faces[0].getAnimations !== 'function') return capped;
    const finished = Promise.all(
      faces.flatMap((f) => f.getAnimations().map((a) => a.finished.catch(() => {})))
    );
    return Promise.race([finished, capped]);
  }

  async function buildTarotShareBlob() {
    const node = document.getElementById('tarot-share-capture');
    if (!node) return null;
    // 캡처 라이브러리는 나중에 받으므로 여기서 준비를 기다린다.
    if (typeof window.html2canvas !== 'function' && window.MaumjaroLib) {
      await window.MaumjaroLib.html2canvas();
    }
    if (typeof window.html2canvas !== 'function') return null;
    // html2canvas는 화면 밖 클론을 그리므로, 원본 이미지의 디코딩이 끝난 뒤에 시작해야 안전하다.
    await Promise.all([...node.querySelectorAll('img')].map((im) => (
      im.decode ? im.decode().catch(() => {}) : Promise.resolve()
    )));
    // 카드 등장 애니메이션(tarot-flip)이 끝나기를 기다린다. 이게 핵심이다 —
    // html2canvas는 클론을 그리기 전에 "원본" 요소의 기하 정보를 읽는데, 회전(rotateY) 중에
    // 재면 폭이 찌그러진 값이 잡혀 카드가 세로로 눌린 조각으로 찍힌다. onclone은 클론의
    // 인라인 스타일만 고칠 뿐, 이미 측정된 기하는 되돌리지 못한다.
    await waitForTarotRevealAnimations(node);

    // 라이브 화면에서 실제 크기를 재둔다(애니메이션이 끝난 뒤라 이제 정확한 값이다).
    const liveFaces = [...node.querySelectorAll('.tarot-face')].map((el) => el.getBoundingClientRect());
    const liveImgs = [...node.querySelectorAll('.tarot-face-img')].map((el) => el.getBoundingClientRect());

    const canvas = await window.html2canvas(node, {
      backgroundColor: '#fdf2f4',
      scale: 2,
      imageTimeout: 8000, // 기본 15초는 너무 길다. 못 그리면 빨리 포기하고 텍스트로 보낸다
      onclone: (doc) => {
        // 클론에서는 애니메이션이 처음부터 다시 재생되므로 끝난 상태로 고정한다.
        // transform은 .tarot-face에만 지운다 — 역방향 카드의 rotate(180deg)는
        // .tarot-face-img에 걸려 있어 그대로 살아야 한다.
        [...doc.querySelectorAll('.tarot-face')].forEach((f, i) => {
          f.style.animation = 'none';
          f.style.opacity = '1';
          f.style.transform = 'none';
          const r = liveFaces[i];
          if (r && r.width) {
            f.style.width = `${Math.round(r.width)}px`;
            f.style.height = `${Math.round(r.height)}px`;
          }
        });
        // 카드 그림 높이는 aspect-ratio로 잡혀 있는데 html2canvas는 이 속성을 모른다.
        // 실제 픽셀 크기를 박아넣어 어느 브라우저에서든 같은 비율로 찍히게 한다.
        [...doc.querySelectorAll('.tarot-face-img')].forEach((im, i) => {
          const r = liveImgs[i];
          if (!r || !r.width) return;
          im.style.aspectRatio = 'auto';
          im.style.width = `${Math.round(r.width)}px`;
          im.style.height = `${Math.round(r.height)}px`;
        });
      },
    });
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  function startTarotShareImage() {
    tarotShareBlob = null;
    tarotShareBlobJob = buildTarotShareBlob()
      .then((b) => { tarotShareBlob = b; return b; })
      .catch(() => null);
  }

  // 여기서 await를 하지 않고 promise를 그대로 돌려주는 게 핵심이다.
  // navigator.share()가 클릭 핸들러 안에서 "동기적으로" 불려야 iOS가 제스처로 인정한다.
  function shareTarotBlobNow(blob, text, url) {
    const file = new File([blob], '맘운자로_타로.png', { type: 'image/png' });
    if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return null;
    return navigator.share({ files: [file], text: `${text}\n${url}`, title: '오늘의 타로' });
  }

  // 공유: 3장을 이미지로 만들어 보낸다. html2canvas가 없거나 실패하면 텍스트+링크로 폴백한다.
  // (처방전 공유와 같은 방식 — 새로 구현하지 않고 기존 패턴을 따른다)
  async function shareTarotDraw(entry, cards, btn, topic, verdict) {
    const names = cards.map((c) => `${c.card.name}(${tarotDirLabel(c.reversed)})`).join(' · ');
    // 주제와 별점을 앞에 세워 "무슨 타로를 봤는지"가 한눈에 보이게 한다(클릭률에 직접 영향).
    // 타로를 공유하는 사람에겐 타로 안내가 의미 없으므로, 운세와 마음 처방 쪽으로 유도한다.
    const text = [
      `🎴 ${topic.label} 타로 봤는데 ${starsText(verdict.stars)} 나왔어`,
      names,
      '',
      '🔮 오늘의 운세 · 💉 마음 처방도 무료예요!',
    ].join('\n');
    // 결과를 URL에 실어 보낸다 — 친구가 링크를 열면 "친구가 보낸 타로"가 뜨고,
    // 주사를 놓아야 열리는 흐름을 거쳐 자기 타로로 이어진다(그냥 홈 주소를 보내면 유입이 끊긴다).
    // 링크에는 주제와 카드만 싣는다. 별점·판정 제목·판정 문구는 받는 쪽에서
    // tarotVerdictOf가 똑같이 계산해내므로 실어 보낼 이유가 없다(링크가 길어질 뿐이다).
    const url = buildTarotShareUrl(topic.key, cards);

    // 이미 준비된 이미지가 있으면 기다리지 않고 곧바로 공유 시트를 연다.
    // 버튼 라벨도 바꾸지 않는다 — 여기서 멈출 일이 없어야 정상이다.
    if (tarotShareBlob) {
      const sharing = shareTarotBlobNow(tarotShareBlob, text, url);
      if (sharing) {
        try {
          await sharing;
        } catch (e) {
          if (!e || e.name !== 'AbortError') Rx.shareOrCopy(text, url);
        }
        return;
      }
    }

    if (typeof window.html2canvas !== 'function' || !document.getElementById('tarot-share-capture')) {
      Rx.shareOrCopy(text, url);
      return;
    }

    // 아직 이미지가 준비되기 전이거나 파일 공유를 못 쓰는 환경.
    // 기다리되 상한을 둬서, 어떤 경우에도 버튼이 "준비 중..."에 갇히지 않게 한다.
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '준비 중...';
    try {
      const blob = await withTimeout(tarotShareBlobJob || buildTarotShareBlob(), 12000);
      if (!blob) {
        Core.showToast('이미지 준비가 늦어져서 텍스트로 보낼게요');
        Rx.shareOrCopy(text, url);
        return;
      }
      tarotShareBlob = blob;
      const sharing = shareTarotBlobNow(blob, text, url);
      if (sharing) {
        await sharing;
        return;
      }
      // 파일 공유 미지원: 이미지 저장 + 텍스트는 클립보드로
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = '맘운자로_타로.png';
      a.href = objUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        Core.showToast('이미지 저장 + 링크 복사 완료 🎴');
      } catch (e) {
        Core.showToast('타로 이미지를 저장했어요 🎴');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      Core.showToast('이미지 준비에 실패했어요. 텍스트로 보낼게요');
      Rx.shareOrCopy(text, url);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // 부채꼴에 올릴 카드들을 미리 정한다. 사용자가 고른 자리의 카드가 그대로 자기 카드가 된다
  // (뽑은 뒤에 몰래 다른 카드를 배정하지 않는다 — 직접 골랐다는 감각이 타로의 핵심).
  function buildTarotFan() {
    const pool = TAROT_MAJOR.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, TAROT_FAN_COUNT).map((c) => ({ id: c.id, reversed: Math.random() < 0.5 }));
  }

  // 사운드는 부가 연출이므로, 실패해도 화면 전환 같은 본 흐름을 막아선 안 된다.
  // (playPrepareSound는 durationMs가 필수라 인자를 빼면 예외가 난다 — 그 경우에도 조용히 넘긴다.)
  function tarotSound(name) {
    try {
      if (typeof Core[name] === 'function') Core[name]();
    } catch (e) {
      /* 소리는 없어도 된다 */
    }
  }

  // 카드·갓차 전용 효과음(sfx.js). 없어도 화면 흐름은 그대로 굴러가야 한다.
  function sfx(name, arg) {
    try {
      const S = window.MaumjaroSfx;
      if (S && typeof S[name] === 'function') S[name](arg);
    } catch (e) { /* 소리는 없어도 된다 */ }
  }

  // ---------- 카드를 쓸어서 섞기 ----------
  // 처음엔 폰 흔들기(devicemotion)로 만들었지만, iOS에는 "흔들어서 입력 되돌리기"라는
  // OS 기본 기능이 있어 흔들 때마다 시스템 팝업("입력 실행 취소")이 떴다. 웹에서 이 기능을
  // 끌 방법이 없으므로 흔들기를 걷어내고, 실제 카드를 섞는 동작에 더 가까운 좌우 쓸기로 바꿨다.
  // (주사 놓기의 폰 찌르기 모션은 app.js 소유라 그대로 두었다 — 그쪽은 텍스트 입력과 무관하다.)
  function wireTarotSwipeShuffle(el, onShuffle) {
    let startX = null;
    let fired = false;
    const SWIPE_PX = 46;

    const down = (e) => {
      startX = (e.touches ? e.touches[0].clientX : e.clientX);
      fired = false;
    };
    const move = (e) => {
      if (startX === null || fired) return;
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      if (Math.abs(x - startX) >= SWIPE_PX) {
        fired = true;
        onShuffle();
      }
    };
    const up = () => { startX = null; };

    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', up);
    el.addEventListener('mousedown', down);
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
  }

  // ---------- 0단계: 무엇을 볼지 고르기 ----------
  function renderTarotTopics(profile) {
    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="tarot-back" type="button">‹</button>
        <span class="rx-nav-title">🎴 타로</span>
      </div>
      <p class="tarot-hint">무엇이 궁금한지 골라주세요</p>
      <div class="rx-category-grid">
        ${TAROT_TOPICS.map((t) => {
          const done = !!getTarotDraw(t.key);
          return `
          <div class="rx-category-tile${done ? ' empty' : ''}" data-topic="${t.key}">
            <span class="rx-category-emoji">${t.emoji}</span>
            <span class="rx-category-label">${t.label}</span>
            <span class="rx-category-count">${done ? '오늘 봤어요' : '3장 뽑기'}</span>
          </div>`;
        }).join('')}
      </div>
      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">주제마다 하루에 한 번씩 볼 수 있어요</p>
    `;
    // 사주 프로필 없이 바로 들어온 경우(공유 링크 ?start=tarot, 폼의 "타로 먼저 보기")에는
    // 돌아갈 운세센터가 없다. 그럴 땐 홈으로 보낸다 — 빈 폼으로 되돌리면 막다른 길이 된다.
    document.getElementById('tarot-back').addEventListener('click', () => {
      if (profile) renderFortuneHub(profile);
      else goHomeTab();
    });
    fortuneContent.querySelectorAll('.rx-category-tile[data-topic]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const topic = tarotTopicOf(tile.dataset.topic);
        const existing = getTarotDraw(topic.key);
        // 카드를 골랐지만 아직 주사를 놓지 않았으면 게이트로 돌려보낸다(공개를 건너뛸 수 없게).
        // revealed 필드가 없던 기존 기록은 이미 본 것으로 취급한다.
        if (existing && existing.revealed === false) renderTarotGate(profile, topic, existing);
        else if (existing) renderTarotResult(profile, existing);
        else renderTarotShuffle(profile, topic);
      });
    });
  }

  // ---------- 1단계: 셔플 ----------
  function renderTarotShuffle(profile, topic) {
    let shuffles = 0;
    const NEEDED = 3;

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="tarot-back" type="button">‹</button>
        <span class="rx-nav-title">${topic.emoji} ${topic.label} 타로</span>
      </div>
      <p class="tarot-hint" id="tarot-hint">${topic.question}<br />${TAROT_SHUFFLE_LINES[0]}</p>
      <div class="tarot-deck" id="tarot-deck">
        <div class="tarot-deck-inner">
          ${[0, 1, 2, 3, 4].map((i) => `<div class="tarot-card-back tarot-card-big" style="--r:${(i - 2) * 2.2}deg;transform:rotate(${(i - 2) * 2.2}deg);">${TAROT_BACK_SVG}</div>`).join('')}
        </div>
      </div>
      <p class="tarot-count" id="tarot-count">섞기 ${shuffles} / ${NEEDED}</p>
      <button class="action-btn" id="tarot-shuffle-btn" type="button" style="width:100%;">🔀 카드 섞기</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">카드를 좌우로 쓸어도 섞여요</p>
    `;

    const deck = document.getElementById('tarot-deck');
    const hint = document.getElementById('tarot-hint');
    const countEl = document.getElementById('tarot-count');

    document.getElementById('tarot-back').addEventListener('click', () => renderTarotTopics(profile));

    function doShuffle() {
      if (shuffles >= NEEDED) return;
      shuffles += 1;
      countEl.textContent = `섞기 ${shuffles} / ${NEEDED}`;
      hint.textContent = TAROT_SHUFFLE_LINES[Math.min(shuffles, TAROT_SHUFFLE_LINES.length - 1)];
      deck.classList.remove('shuffling');
      void deck.offsetWidth; // 애니메이션 재시작을 위한 강제 리플로우
      deck.classList.add('shuffling');
      // 예전에는 주사 누르는 소리(playInjectPress)를 네 번 겹쳐 셔플을 흉내 냈는데,
      // 그건 음정이 있는 톤이라 카드가 아니라 알림음처럼 들렸다.
      // sfx.js가 노이즈로 만든 진짜 사각거림을 쓴다.
      sfx('cardShuffle');
      if (shuffles >= NEEDED) {
        setTimeout(() => renderTarotFan(profile, topic), 520);
      }
    }

    document.getElementById('tarot-shuffle-btn').addEventListener('click', doShuffle);
    wireTarotSwipeShuffle(deck, doShuffle);
  }

  // ---------- 2단계: 부채꼴에서 3장 직접 뽑기 ----------
  function renderTarotFan(profile, topic) {
    const fan = buildTarotFan();
    const picked = [];

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="tarot-back" type="button">‹</button>
        <span class="rx-nav-title">${topic.emoji} ${topic.label} 타로</span>
      </div>
      <p class="tarot-hint">마음이 가는 카드를 <strong>3장</strong> 골라주세요</p>
      <div class="tarot-fan" id="tarot-fan">
        ${fan.map((_, i) => `<button class="tarot-card-back" type="button" data-i="${i}" style="--i:${i};" aria-label="${i + 1}번째 카드">${TAROT_BACK_SVG}</button>`).join('')}
      </div>
      <p class="tarot-count" id="tarot-count">0 / 3 선택</p>
      <button class="action-btn" id="tarot-open-btn" type="button" style="width:100%;" disabled>카드를 3장 골라주세요</button>
    `;

    document.getElementById('tarot-back').addEventListener('click', () => renderTarotTopics(profile));

    const countEl = document.getElementById('tarot-count');
    const openBtn = document.getElementById('tarot-open-btn');

    document.getElementById('tarot-fan').querySelectorAll('.tarot-card-back').forEach((el) => {
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i);
        const at = picked.indexOf(i);
        if (at >= 0) {
          picked.splice(at, 1);
          el.classList.remove('picked');
        } else {
          if (picked.length >= 3) return;
          picked.push(i);
          el.classList.add('picked');
          sfx('cardDraw'); // 부채꼴에서 한 장 뽑아 드는 소리
        }
        countEl.textContent = `${picked.length} / 3 선택`;
        openBtn.disabled = picked.length !== 3;
        openBtn.textContent = picked.length === 3 ? '🔮 카드 열어보기' : '카드를 3장 골라주세요';
      });
    });

    openBtn.addEventListener('click', () => {
      if (picked.length !== 3) return;
      const entry = {
        date: todayDateKey(),
        topic: topic.key,
        cards: picked.map((i) => fan[i]),
        revealed: false, // 주사를 놓아야 공개된다
        injected: false,
        summary: TAROT_SUMMARY_SEED[Math.floor(Math.random() * TAROT_SUMMARY_SEED.length)],
        ts: Date.now(),
      };
      // 고른 순간 카드를 고정한다(다시 들어와도 같은 카드).
      saveTarotDraw(entry);
      renderTarotGate(profile, topic, entry);
    });
  }

  // ---------- 2.5단계: 주사를 놓아야 카드가 열린다 ----------
  // 기존 "카드 열어보기" 버튼을 주사로 교체한 화면. 탭 횟수는 그대로라 마찰은 늘지 않고,
  // 주사가 "결과를 여는 행위"가 되어 브랜드의 핵심 인터랙션이 앞으로 나온다.
  function renderTarotGate(profile, topic, entry) {
    const cards = entry.cards.map((c) => {
      const card = tarotCardOf(c.id);
      return { card, reversed: c.reversed, side: tarotSideOf(card, c.reversed) };
    });

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="tarot-back" type="button">‹</button>
        <span class="rx-nav-title">${topic.emoji} ${topic.label} 타로</span>
      </div>
      <p class="tarot-hint">카드 3장을 골랐어요.<br /><strong>주사를 놓으면 카드가 열립니다</strong></p>
      <div class="tarot-gate-cards">
        ${[0, 1, 2].map((i) => `<div class="tarot-card-back" style="--g:${i}">${TAROT_BACK_SVG}</div>`).join('')}
      </div>
      <button class="action-btn" id="tarot-open-btn" type="button" style="width:100%;">💉 주사 놓고 카드 열기</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">팔을 눌러도 되고, 폰을 콕 찌르듯 움직여도 돼요</p>
    `;

    document.getElementById('tarot-back').addEventListener('click', () => renderTarotTopics(profile));

    const syntheticP = {
      id: 'tarot-reveal',
      category: 'tarot',
      title: `${topic.label} 타로`,
      diagnosis: '카드를 여는 중',
      emoji: '🎴',
      color: '#b779ef',
    };
    const openBtn = document.getElementById('tarot-open-btn');
    Rx.wireExternalTrigger(openBtn, syntheticP, () => {
      resetDoseVisuals();
      Rx.resetGenericFlowState('💉 주사 놓고 카드 열기');
      Rx.showRxImageFade(syntheticP, () => {
        // 주사는 홈 탭에서 놓이므로, 공개 전에 운세 탭으로 돌아온다.
        const fortuneTabBtn = document.querySelector('.tab-btn[data-view="fortune"]');
        if (fortuneTabBtn) fortuneTabBtn.click();
        // 이 주사가 곧 오늘의 처방이다(결과 화면에서 또 놓지 않는다).
        const opened = { ...(getTarotDraw(entry.topic) || entry), revealed: true, injected: true };
        saveTarotDraw(opened);
        revealTarotCardsOneByOne(cards, topic, () => renderTarotResult(profile, opened));
      });
    });
  }

  // ---------- 3단계: 공개 + 해석 + 처방 → 주사 ----------
  function renderTarotResult(profile, entry) {
    const cards = entry.cards.map((c) => {
      const card = tarotCardOf(c.id);
      return { card, reversed: c.reversed, side: tarotSideOf(card, c.reversed) };
    });
    const advice = cards[2]; // 세 번째 자리 = 무엇을 할까 → 처방으로 이어진다
    const topic = tarotTopicOf(entry.topic);
    const verdict = tarotVerdictOf(cards, topic);
    // 종합 결과에 맞춰 실제 처방을 자동으로 골라준다(사용자가 따로 고르지 않아도 되게).
    const autoRx = pickTarotPrescription(cards, topic, advice);

    const facesHtml = cards.map((c, i) => `
      <div class="tarot-face-wrap tappable" data-card-i="${i}">
        <div class="tarot-face-pos">${topic.positions[i].emoji} ${topic.positions[i].label}</div>
        ${tarotFaceHtml(c, { delay: i * 0.45 })}
        ${c.card.img ? `<div class="tarot-face-under">${c.card.name} · ${tarotDirLabel(c.reversed)}</div>` : ''}
      </div>`).join('');

    const readHtml = cards.map((c, i) => `
      <div class="tarot-read-card">
        <span class="tarot-read-emoji">${c.card.emoji}</span>
        <div class="tarot-read-body">
          <div class="tarot-read-pos">${topic.positions[i].emoji} ${topic.positions[i].label}</div>
          <div class="tarot-read-title">${c.card.name} · ${tarotDirLabel(c.reversed)} · ${c.side.keyword}</div>
          <p class="tarot-read-line">${c.side.line}</p>
        </div>
      </div>`).join('');

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="tarot-back" type="button">‹</button>
        <span class="rx-nav-title">${topic.emoji} ${topic.label} 타로</span>
      </div>
      <div class="tarot-share-capture" id="tarot-share-capture">
        <div class="tarot-share-title">${topic.emoji} ${topic.label} 타로</div>
        <div class="tarot-reveal-row">${facesHtml}</div>
        <div class="tarot-verdict">
          <div class="tarot-verdict-stars">${starsText(verdict.stars)}</div>
          <div class="tarot-verdict-title">${verdict.title}</div>
          <p class="tarot-verdict-line">${verdict.line}</p>
        </div>
        <div class="tarot-share-foot">맘운자로 · maumjaro.minimalbreeze.com</div>
      </div>
      <p class="tarot-reveal-hint">카드를 누르면 크게 다시 볼 수 있어요</p>
      <div id="tarot-ai-reading"></div>
      ${readHtml}
      <div class="rx-custom-preview" style="margin-top:12px;">
        <div class="rx-slip-row">
          <span class="rx-slip-key">자동 처방</span>
          <span class="rx-slip-value">${autoRx ? `${autoRx.emoji} ${autoRx.title}` : `${advice.card.name} · ${advice.side.keyword}`}</span>
        </div>
        <p class="rx-slip-text">${autoRx ? autoRx.diagnosis : advice.side.line}</p>
        <p class="rx-slip-text" style="color:var(--text-dim);font-size:12px;">종합 결과에 맞춰 자동으로 처방됐어요. 주사는 카드를 열 때 이미 맞았어요 💉</p>
        <button class="rx-friend-quick-btn" id="tarot-goto-rx-btn" type="button" style="margin-top:6px;">다른 처방도 보기 ›</button>
      </div>
      <button class="action-btn" id="tarot-slip-btn" type="button" style="width:100%;margin-top:12px;">📝 처방전 보기</button>
      <button class="rx-slip-photo-btn" id="tarot-share-btn" type="button" style="margin-top:9px;">🎴 타로 결과 공유하기</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">${topic.label} 타로는 오늘 이걸로 고정돼요. 다른 주제는 지금 바로 볼 수 있어요</p>
    `;

    document.getElementById('tarot-back').addEventListener('click', () => renderTarotTopics(profile));
    document.getElementById('tarot-goto-rx-btn').addEventListener('click', () => Rx.goToRxCategory(topic.rxCategory || advice.card.rxCategory));
    // 작은 카드를 눌러 그 카드만 다시 전체화면으로 본다
    fortuneContent.querySelectorAll('.tarot-face-wrap.tappable').forEach((el) => {
      el.addEventListener('click', () => openTarotCardSingle(cards, Number(el.dataset.cardI), topic));
    });
    wireTarotReading(profile, entry, cards, topic, verdict);
    const shareBtn = document.getElementById('tarot-share-btn');
    shareBtn.addEventListener('click', () => shareTarotDraw(entry, cards, shareBtn, topic, verdict));
    // 사용자가 결과를 읽는 동안 공유 이미지를 미리 만들어 둔다.
    // 그래야 공유 버튼을 눌렀을 때 기다림 없이 바로 공유 시트가 열린다(iOS 제스처 유지).
    startTarotShareImage();

    // 주사는 카드를 열 때(게이트) 이미 놓았으므로 여기서 또 놓지 않는다.
    // 처방전은 주사 없이 바로 열어볼 수 있게 한다.
    const slipEmoji = autoRx ? autoRx.emoji : advice.card.emoji;
    document.getElementById('tarot-slip-btn').addEventListener('click', () => {
      openMaumunReveal({
        emoji: slipEmoji,
        diagnosis: `${topic.label} · ${verdict.title}`,
        // 카드 문구들은 마침표 없이 끝나므로, 이어 붙일 때 마침표를 넣어야 문장이 자연스럽다.
        interpretation: `${verdict.line}. ${advice.side.line}`,
        prescription: autoRx ? autoRx.prescription : advice.side.line,
        dosage: autoRx ? autoRx.title : `${advice.card.name} ${tarotDirLabel(advice.reversed)}`,
        color: (autoRx && autoRx.color) || '#b779ef',
        showMakeOwnBtn: false,
      });
    });
  }

  // ---------- 4.8: 맘운 프로필 백업/복구 ----------
  // 브라우저 저장소는 사파리의 저장소 자동 정리(7일 미접속)나 기기 변경으로 비워질 수 있다.
  // 서버가 없는 정적 사이트라 자동 동기화는 불가능하므로, 사용자가 직접 보관했다가
  // 되살릴 수 있는 코드를 제공한다. 커스텀 처방전과 동일하게 LZString을 재사용한다.
  function buildProfileBackupCode(profile) {
    const json = JSON.stringify(profile);
    return window.LZString ? window.LZString.compressToEncodedURIComponent(json) : '';
  }
  function parseProfileBackupCode(code) {
    if (!code || !window.LZString) return null;
    try {
      const json = window.LZString.decompressFromEncodedURIComponent(code.trim());
      if (!json) return null;
      const p = JSON.parse(json);
      // 최소한 생년월일이 있어야 사주 계산이 가능하다. 형식이 어긋나면 조용히 거절한다.
      if (!p || typeof p !== 'object' || typeof p.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate)) return null;
      return p;
    } catch (e) {
      return null;
    }
  }

  function renderProfileForm(existingProfile) {
    const isEdit = !!existingProfile;
    const defaultName = (existingProfile && existingProfile.name)
      || (localStorage.getItem('maumjaro:username') || '').trim()
      || '';
    const todayStr = new Date().toISOString().slice(0, 10);

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        ${isEdit ? '<button class="rx-back-btn" id="fortune-form-back" type="button">‹</button>' : ''}
        <span class="rx-nav-title">💫 나만의 맘운 프로필</span>
      </div>
      <p class="rx-custom-hint">오늘의 맘운을 보기 전에, 나만의 운세 기준을 만들어 주세요</p>
      <p class="rx-custom-hint">💛 한 번만 입력하면 계속 재사용돼요. 이 정보는 이 기기에만 저장되고 외부로 전송되지 않아요</p>

      <div class="rx-custom-field">
        <label class="rx-slip-key" for="fortune-name">이름 또는 닉네임</label>
        <input type="text" id="fortune-name" class="rx-custom-input" maxlength="12" placeholder="예: 민지" value="${defaultName}" />
      </div>

      <div class="segmented" id="fortune-calendar-toggle">
        <button class="seg-btn${existingProfile && existingProfile.calendarType === 'lunar' ? '' : ' active'}" data-val="solar" type="button">양력</button>
        <button class="seg-btn${existingProfile && existingProfile.calendarType === 'lunar' ? ' active' : ''}" data-val="lunar" type="button">음력</button>
      </div>

      <div class="rx-custom-field" id="fortune-leap-field" style="display:${existingProfile && existingProfile.calendarType === 'lunar' ? 'flex' : 'none'};">
        <div class="sound-row">
          <span>윤달이에요</span>
          <button id="fortune-leap-toggle" class="toggle-btn" type="button" aria-pressed="${existingProfile ? String(!!existingProfile.isLeapMonth) : 'false'}">${existingProfile && existingProfile.isLeapMonth ? '✅ 켜짐' : '⭕ 꺼짐'}</button>
        </div>
      </div>

      <div class="rx-custom-field">
        <label class="rx-slip-key" for="fortune-birthdate">생년월일</label>
        <input type="date" id="fortune-birthdate" class="rx-custom-input" min="1900-01-01" max="${todayStr}" value="${existingProfile ? existingProfile.birthDate : ''}" />
      </div>

      <div class="rx-custom-field">
        <label class="rx-slip-key" for="fortune-birthtime">태어난 시간</label>
        <input type="time" id="fortune-birthtime" class="rx-custom-input" value="${existingProfile && existingProfile.birthTime ? existingProfile.birthTime : ''}" ${existingProfile && existingProfile.timeUnknown ? 'disabled' : ''} />
      </div>
      <div class="sound-row">
        <span>태어난 시간을 몰라요</span>
        <button id="fortune-time-unknown-toggle" class="toggle-btn" type="button" aria-pressed="${existingProfile ? String(!!existingProfile.timeUnknown) : 'false'}">${existingProfile && existingProfile.timeUnknown ? '✅ 켜짐' : '⭕ 꺼짐'}</button>
      </div>

      <div class="segmented" id="fortune-gender-toggle" style="margin-top:14px;">
        <button class="seg-btn${existingProfile && existingProfile.gender === 'male' ? '' : ' active'}" data-val="female" type="button">여성</button>
        <button class="seg-btn${existingProfile && existingProfile.gender === 'male' ? ' active' : ''}" data-val="male" type="button">남성</button>
      </div>

      <button class="action-btn" id="fortune-profile-submit" type="button" style="width:100%;margin-top:16px;">💫 ${isEdit ? '맘운 프로필 저장하기' : '맘운 프로필 완성하기'}</button>
      ${isEdit ? '' : `
      <button class="rx-slip-photo-btn" id="fortune-skip-to-tarot" type="button" style="width:100%;margin-top:10px;">🎴 생년월일 없이 타로만 먼저 볼래요</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:6px;">타로는 사주 정보가 필요 없어요</p>`}

      <div style="margin-top:24px;">
        <span class="rx-slip-key" style="display:block;margin-bottom:6px;">🔐 백업 &amp; 복구</span>
        <p class="rx-custom-hint" style="margin:0 0 8px;">기기를 바꾸거나 브라우저 기록이 지워져도, 이 코드만 있으면 그대로 되살릴 수 있어요</p>
        <input type="text" id="fortune-backup-input" class="rx-custom-input" style="width:100%;" placeholder="복구하려면 백업 코드를 붙여넣으세요" />
        <div class="rx-friend-attach-row" style="margin-top:8px;">
          ${isEdit ? '<button id="fortune-backup-copy" class="rx-slip-photo-btn" type="button">📋 내 코드 복사</button>' : ''}
          <button id="fortune-backup-restore" class="rx-slip-photo-btn" type="button">♻️ 코드로 복구</button>
        </div>
      </div>
    `;

    let calendarType = (existingProfile && existingProfile.calendarType) || 'solar';
    let isLeapMonth = !!(existingProfile && existingProfile.isLeapMonth);
    let timeUnknown = !!(existingProfile && existingProfile.timeUnknown);
    let gender = (existingProfile && existingProfile.gender) || 'female';

    const calendarToggle = document.getElementById('fortune-calendar-toggle');
    const leapField = document.getElementById('fortune-leap-field');
    const leapToggle = document.getElementById('fortune-leap-toggle');
    const timeUnknownToggle = document.getElementById('fortune-time-unknown-toggle');
    const birthTimeInput = document.getElementById('fortune-birthtime');
    const genderToggle = document.getElementById('fortune-gender-toggle');
    const nameInput = document.getElementById('fortune-name');

    if (isEdit) {
      document.getElementById('fortune-form-back').addEventListener('click', () => renderFortuneHub(existingProfile));
    } else {
      // 타로는 사주 데이터를 한 번도 읽지 않는다. 필요 없는 폼 뒤에 가둬 둘 이유가 없어서
      // 프로필 없이 바로 들어갈 수 있는 길을 연다(profile 자리에 null을 넘긴다).
      document.getElementById('fortune-skip-to-tarot').addEventListener('click', () => {
        trackEvent('tarot_opened_without_profile', { source: 'profile_form' });
        renderTarotTopics(null);
      });
    }

    calendarToggle.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarType = btn.dataset.val;
        calendarToggle.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
        leapField.style.display = calendarType === 'lunar' ? 'flex' : 'none';
      });
    });

    leapToggle.addEventListener('click', () => {
      isLeapMonth = !isLeapMonth;
      leapToggle.textContent = isLeapMonth ? '✅ 켜짐' : '⭕ 꺼짐';
      leapToggle.setAttribute('aria-pressed', String(isLeapMonth));
    });

    timeUnknownToggle.addEventListener('click', () => {
      timeUnknown = !timeUnknown;
      timeUnknownToggle.textContent = timeUnknown ? '✅ 켜짐' : '⭕ 꺼짐';
      timeUnknownToggle.setAttribute('aria-pressed', String(timeUnknown));
      birthTimeInput.disabled = timeUnknown;
    });

    genderToggle.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        gender = btn.dataset.val;
        genderToggle.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    document.getElementById('fortune-profile-submit').addEventListener('click', () => {
      const birthDate = document.getElementById('fortune-birthdate').value;
      if (!birthDate) {
        Core.showToast('생년월일을 입력해주세요');
        return;
      }
      if (birthDate > todayStr) {
        Core.showToast('생년월일이 오늘보다 미래예요. 다시 확인해주세요');
        return;
      }
      if (birthDate < '1900-01-01') {
        Core.showToast('1900년 이후 날짜로 입력해주세요');
        return;
      }
      const birthTime = birthTimeInput.value || null;
      if (!timeUnknown && !birthTime) {
        Core.showToast('태어난 시간을 입력하거나 "모름"을 선택해주세요');
        return;
      }
      const profile = {
        name: nameInput.value.trim() || null,
        calendarType,
        birthDate,
        isLeapMonth: calendarType === 'lunar' ? isLeapMonth : false,
        birthTime: timeUnknown ? null : birthTime,
        timeUnknown,
        gender,
        savedAt: Date.now(),
      };
      saveSajuProfile(profile);
      localStorage.removeItem(SAJU_CHART_KEY); // 프로필이 바뀌면 이전 계산 캐시는 무효화하고 다시 계산한다
      renderFortuneHub(profile);
      renderHomeMaumunTeaser(); // 방금 만든/수정한 프로필을 홈 카드에도 바로 반영
    });

    // ---------- 백업 코드 복사 / 복구 ----------
    const backupInput = document.getElementById('fortune-backup-input');
    const backupCopyBtn = document.getElementById('fortune-backup-copy');

    if (backupCopyBtn) {
      backupCopyBtn.addEventListener('click', async () => {
        const code = buildProfileBackupCode(existingProfile);
        if (!code) {
          Core.showToast('백업 코드를 만들지 못했어요');
          return;
        }
        try {
          await navigator.clipboard.writeText(code);
          Core.showToast('백업 코드를 복사했어요. 메모장에 붙여넣어 보관하세요 🔐');
        } catch (e) {
          // 클립보드 권한이 없는 환경에서는 입력칸에 넣어 직접 복사하도록 한다.
          backupInput.value = code;
          backupInput.select();
          Core.showToast('입력칸의 코드를 길게 눌러 복사해주세요');
        }
      });
    }

    document.getElementById('fortune-backup-restore').addEventListener('click', () => {
      const restored = parseProfileBackupCode(backupInput.value);
      if (!restored) {
        Core.showToast('백업 코드를 다시 확인해주세요');
        return;
      }
      saveSajuProfile(restored);
      localStorage.removeItem(SAJU_CHART_KEY); // 복구한 프로필 기준으로 다시 계산
      Core.showToast('맘운 프로필을 되살렸어요 ✨');
      renderFortuneHub(restored);
      renderHomeMaumunTeaser();
    });
  }

  // ---------- 홈 화면 "🌞 오늘의 맘운" 티저 카드 ----------
  // 사주 프로필이 있을 때만 노출한다. 없는 사용자의 홈 화면은 기존 그대로 유지된다.
  // 홈 카드는 세 가지 상태를 가진다: 프로필 없음(숨김) / 오늘 아직 미확인(안내) / 오늘 확인 완료(기록 요약).
  // "오늘 확인 완료" 상태는 매번 새로 계산하지 않고 기록된 그대로 보여줘 반복 방문해도 내용이 안 바뀐다.
  function renderHomeMaumunTeaser() {
    const profile = loadSajuProfile();
    if (!profile) {
      homeMaumunCard.hidden = true;
      return;
    }
    const todayEntry = getTodayMaumunEntry();
    if (todayEntry) {
      homeMaumunOneline.textContent = `${todayEntry.diagnosis} 처방 완료`;
      homeMaumunSub.textContent = `${todayEntry.emotionEmoji} ${todayEntry.emotionLabel} · 🔮 ${todayEntry.categoryLabel} ${starsText(todayEntry.stars)}`;
      homeMaumunBtn.textContent = '다시 보기';
      homeMaumunBtn.onclick = () => {
        openMaumunReveal(maumunEntryToReveal(todayEntry));
      };
    } else {
      homeMaumunOneline.textContent = '아직 오늘의 맘운을 확인하지 않았어요.';
      homeMaumunSub.textContent = '탭해서 오늘의 맘운을 만나보세요';
      homeMaumunBtn.textContent = '확인하기';
      homeMaumunBtn.onclick = () => {
        const fortuneTabBtn = document.querySelector('.tab-btn[data-view="fortune"]');
        if (fortuneTabBtn) fortuneTabBtn.click();
        withLunar(() => renderMaumun(profile)); // 탭 이동 직후라 아직 로딩 중일 수 있다
      };
    }
    homeMaumunCard.hidden = false;
  }
  renderHomeMaumunTeaser();

  // ---------- 설정에서 맘운 프로필 등록/수정 진입점 (app.js의 설정 모달을 열고 닫는 로직은 무수정,
  // 이 버튼 클릭만 새로 감지해서 운세 탭으로 이동시킨다) ----------
  const settingsFortuneProfileBtn = document.getElementById('settings-fortune-profile-btn');
  const settingsOverlayEl = document.getElementById('settings-overlay');
  if (settingsFortuneProfileBtn) {
    settingsFortuneProfileBtn.addEventListener('click', () => {
      if (settingsOverlayEl) settingsOverlayEl.classList.remove('show');
      const fortuneTabBtn = document.querySelector('.tab-btn[data-view="fortune"]');
      if (fortuneTabBtn) fortuneTabBtn.click();
      renderProfileForm(loadSajuProfile());
    });
  }

  // ---------- 4.7: 기록 탭을 개인처방/친구처방/운세 카테고리별 일/월/년 보기로 재구조화 ----------
  // app.js의 기존 달력(#segmented + #history-content, 개인처방 전용)은 전혀 건드리지 않고
  // 그대로 재사용한다 — "개인처방" 카테고리를 고르면 그 두 요소를 보여주기만 하고, 그 외
  // 카테고리("친구처방"/"운세")를 고르면 fortune.js가 같은 클래스로 새로 그린 화면을 보여준다.
  // rxRecords/friendSentRecords는 prescriptions.js가 소유한 키를 그대로 읽는다(기존 패턴과 동일).
  const historyNativeSegmented = document.getElementById('segmented');
  const historyNativeContent = document.getElementById('history-content');
  const historyCustomArea = document.getElementById('history-unified-feed');
  const HISTORY_DOW = ['일', '월', '화', '수', '목', '금', '토']; // app.js의 DOW와 동일(일요일=0 기준, new Date().getDay()와 정렬 맞춤)

  function loadFriendSentItems() {
    try {
      const list = JSON.parse(localStorage.getItem('maumjaro:friendSentRecords') || '[]');
      return list.map((r) => ({ ts: r.ts, emoji: r.emoji || '💌', title: r.title || '처방', sub: `${r.recipient || '친구'}에게 보냄` }));
    } catch (e) {
      return [];
    }
  }
  // 타로는 log[날짜][주제] 구조라 평탄화해서 항목 목록으로 바꾼다.
  // 주제가 없던 구형 기록도 normalizeTarotDay가 'today'로 읽어주므로 함께 나온다.
  function loadTarotItems() {
    const log = loadTarotLog();
    const out = [];
    Object.keys(log).forEach((date) => {
      const day = normalizeTarotDay(log[date]);
      Object.keys(day).forEach((topicKey) => {
        const e = day[topicKey];
        if (!e || !Array.isArray(e.cards) || e.cards.length !== 3) return;
        const cards = e.cards.map((c) => tarotCardOf(c.id)).filter(Boolean);
        if (cards.length !== 3) return; // 카드 데이터가 바뀌어 못 찾으면 건너뛴다
        const topic = tarotTopicOf(e.topic || topicKey);
        const verdict = tarotVerdictOf(e.cards, topic);
        out.push({
          ts: e.ts,
          emoji: topic.emoji,
          title: `${topic.label} 타로`,
          sub: `${starsText(verdict.stars)} · ${cards.map((c) => c.name).join(' · ')}`,
        });
      });
    });
    return out;
  }
  // 마음약 기록. 컬렉션은 약마다 처음 얻은 시각(firstAt)을 갖고 있어서,
  // 그 날짜로 "이 날 이 약을 새로 얻었다"는 기록을 만든다.
  // 데이터는 game.js가 관리하므로 여기서는 export된 것만 읽는다.
  function loadMedicineItems() {
    const G = window.MaumjaroGame;
    if (!G || typeof G.getCollection !== 'function') return [];
    return G.getCollection()
      .filter((m) => m.owned && m.firstAt)
      .map((m) => ({
        ts: m.firstAt,
        emoji: m.icon,
        title: m.name,
        sub: `${G.rarityOf(m.rarity).label}${m.count > 1 ? ` · 보유 ${m.count}개` : ''}`,
        openKey: m.id, // 눌러서 마음약국 열기
      }));
  }

  function loadMaumunItems() {
    return Object.values(loadMaumunLog()).map((e) => ({
      ts: e.ts, emoji: e.emotionEmoji, title: `${e.diagnosis} 처방`, sub: `🔮 ${e.categoryLabel} ${starsText(e.stars)}`,
      openKey: e.date, // 눌러서 그날 처방전을 다시 열기 위한 키
    }));
  }

  function historyDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function historyFormatTime(d) {
    const h = d.getHours();
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ap = h < 12 ? '오전' : '오후';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${ap} ${h12}:${mi}`;
  }
  function historyFormatDayLabel(d) {
    const now = new Date();
    // 작년 이전 기록은 연도를 붙인다. 안 붙이면 "7월 12일" 아래 "7월 17일"이 오는
    // 것처럼 순서가 뒤집힌 것처럼 보인다(실제로는 연도가 달라서 맞는 순서다).
    const md = `${d.getFullYear() !== now.getFullYear() ? `${d.getFullYear()}년 ` : ''}${d.getMonth() + 1}월 ${d.getDate()}일`;
    return Core.sameDay(d, now) ? `오늘 · ${md}` : md;
  }
  function historyBuildBarChart(items, compact) {
    const max = Math.max(1, ...items.map((it) => it.count));
    const bars = items.map((it) => {
      const h = it.count === 0 ? 3 : Math.max(6, Math.round((it.count / max) * (compact ? 100 : 140)));
      return `
        <div class="year-bar-col${it.count === 0 ? ' zero' : ''}${it.highlight ? ' highlight' : ''}">
          <span class="year-bar-count">${it.count > 0 ? it.count : ''}</span>
          <div class="year-bar" style="height:${h}px"></div>
          <span class="year-bar-label">${it.label}</span>
        </div>`;
    }).join('');
    return `<div class="year-bars${compact ? ' compact' : ''}">${bars}</div>`;
  }
  function historyItemCardHtml(it) {
    // openKey가 있는 항목은 눌러서 그날의 처방전을 다시 열 수 있다(운세 기록).
    const openAttr = it.openKey ? ` data-open="${it.openKey}"` : '';
    return `
      <div class="rx-list-card${it.openKey ? ' tappable' : ''}"${openAttr}>
        <span class="rx-list-emoji">${it.emoji}</span>
        <div class="rx-list-body">
          <div class="rx-list-title-row"><span class="rx-list-title">${it.title}</span></div>
          <div class="rx-list-desc">${it.sub} · ${historyFormatTime(it.date)}</div>
        </div>
      </div>`;
  }

  // 개인처방(기존 app.js 달력)을 뺀 나머지 카테고리(친구처방/운세)를 위한 일/월/년 렌더러.
  // app.js의 renderDayView/renderMonthView/renderYearView와 같은 CSS 클래스를 그대로 재사용해
  // 시각적으로 완전히 통일된 화면을 별도 구현으로 만든다(app.js 자체는 무수정).
  function renderHistoryCategoryView(profile, navTitle, loadItemsFn, onOpen) {
    let period = 'day';
    let monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let yearCursor = new Date().getFullYear();
    let selectedDayKey = null;

    // 항목을 눌러 그날 기록을 다시 여는 동작. draw()가 내용을 통째로 다시 그리므로
    // 카드마다 붙이지 않고 컨테이너에 위임한다. addEventListener가 아니라 onclick 대입이라
    // 여러 번 호출돼도 핸들러가 중복 등록되지 않고, onOpen이 없는 카테고리에서는 아무 일도 안 한다.
    historyCustomArea.onclick = (ev) => {
      const card = ev.target.closest('[data-open]');
      if (card && onOpen) onOpen(card.dataset.open);
    };

    function draw() {
      const items = loadItemsFn().map((it) => ({ ...it, date: new Date(it.ts) }));
      historyCustomArea.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="history-cat-back" type="button">‹</button>
          <span class="rx-nav-title">${navTitle}</span>
        </div>
        <div class="segmented" id="history-cat-seg">
          <button class="seg-btn${period === 'day' ? ' active' : ''}" data-period="day">일</button>
          <button class="seg-btn${period === 'month' ? ' active' : ''}" data-period="month">월</button>
          <button class="seg-btn${period === 'year' ? ' active' : ''}" data-period="year">년</button>
        </div>
        <div id="history-cat-body"></div>
      `;
      document.getElementById('history-cat-back').addEventListener('click', () => renderHistoryHub(profile));
      document.getElementById('history-cat-seg').querySelectorAll('.seg-btn').forEach((btn) => {
        btn.addEventListener('click', () => { period = btn.dataset.period; draw(); });
      });

      const body = document.getElementById('history-cat-body');
      if (period === 'day') drawDay(body, items);
      else if (period === 'month') drawMonth(body, items);
      else drawYear(body, items);
    }

    function drawDay(body, items) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const last14 = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        last14.push(d);
      }
      const countMap = new Map();
      items.forEach((it) => {
        const k = historyDateKey(it.date);
        countMap.set(k, (countMap.get(k) || 0) + 1);
      });
      const chartItems = last14.map((d) => ({
        label: String(d.getDate()), count: countMap.get(historyDateKey(d)) || 0, highlight: Core.sameDay(d, today),
      }));
      const chartTotal = chartItems.reduce((a, b) => a + b.count, 0);
      const chartHtml = `<div class="chart-section"><div class="chart-title">최근 14일 <strong>${chartTotal}</strong>번</div>${historyBuildBarChart(chartItems)}</div>`;

      if (items.length === 0) {
        body.innerHTML = `${chartHtml}<p class="empty-msg">아직 기록이 없어요.</p>`;
        return;
      }
      const groups = new Map();
      items.forEach((it) => {
        const k = historyDateKey(it.date);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      });
      const keys = Array.from(groups.keys()).sort().reverse();
      const groupsHtml = keys.map((k) => {
        const list = groups.get(k).sort((a, b) => b.date - a.date);
        return `
          <div class="day-group">
            <div class="day-group-head">
              <span class="date">${historyFormatDayLabel(list[0].date)}</span>
              <span class="count">${list.length}회</span>
            </div>
            ${list.map(historyItemCardHtml).join('')}
          </div>`;
      }).join('');
      body.innerHTML = chartHtml + groupsHtml;
    }

    function drawMonth(body, items) {
      const y = monthCursor.getFullYear();
      const m = monthCursor.getMonth();
      const firstDow = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const countByDate = new Map();
      items.forEach((it) => {
        if (it.date.getFullYear() === y && it.date.getMonth() === m) {
          const k = historyDateKey(it.date);
          countByDate.set(k, (countByDate.get(k) || 0) + 1);
        }
      });
      const monthTotal = Array.from(countByDate.values()).reduce((a, b) => a + b, 0);
      const dowHtml = HISTORY_DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('');
      let cellsHtml = '';
      for (let i = 0; i < firstDow; i++) cellsHtml += '<div class="cal-cell blank"></div>';
      const today = new Date();
      const chartItems = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const cellDate = new Date(y, m, day);
        const key = historyDateKey(cellDate);
        const cnt = countByDate.get(key) || 0;
        const isToday = Core.sameDay(cellDate, today);
        cellsHtml += `<div class="cal-cell${cnt > 0 ? ' has-record' : ''}${isToday ? ' today' : ''}" data-key="${key}">
            <span>${day}</span>
            ${cnt > 0 ? '<span class="badge"></span>' : ''}
          </div>`;
        const showLabel = day === 1 || day === daysInMonth || day % 5 === 0;
        chartItems.push({ label: showLabel ? String(day) : '', count: cnt, highlight: isToday });
      }
      body.innerHTML = `
        <div class="period-nav">
          <button id="history-cat-month-prev">‹</button>
          <span class="period-label">${y}년 ${m + 1}월</span>
          <button id="history-cat-month-next">›</button>
        </div>
        <div class="period-total">이번 달 <strong>${monthTotal}</strong>번</div>
        <div class="chart-section">${historyBuildBarChart(chartItems, true)}</div>
        <div class="calendar-grid">${dowHtml}${cellsHtml}</div>
        <div id="history-cat-day-detail"></div>
      `;
      document.getElementById('history-cat-month-prev').addEventListener('click', () => {
        monthCursor = new Date(y, m - 1, 1);
        draw();
      });
      document.getElementById('history-cat-month-next').addEventListener('click', () => {
        monthCursor = new Date(y, m + 1, 1);
        draw();
      });
      body.querySelectorAll('.cal-cell.has-record').forEach((cell) => {
        cell.addEventListener('click', () => {
          selectedDayKey = cell.dataset.key;
          drawDayDetail(items);
        });
      });
      if (selectedDayKey && countByDate.has(selectedDayKey)) drawDayDetail(items);
    }

    function drawDayDetail(items) {
      const slot = document.getElementById('history-cat-day-detail');
      if (!slot) return;
      const list = items.filter((it) => historyDateKey(it.date) === selectedDayKey).sort((a, b) => a.date - b.date);
      if (list.length === 0) { slot.innerHTML = ''; return; }
      slot.innerHTML = `<div class="day-group">${list.map(historyItemCardHtml).join('')}</div>`;
    }

    function drawYear(body, items) {
      const y = yearCursor;
      const counts = new Array(12).fill(0);
      items.forEach((it) => { if (it.date.getFullYear() === y) counts[it.date.getMonth()]++; });
      const total = counts.reduce((a, b) => a + b, 0);
      const chartItems = counts.map((c, i) => ({ label: `${i + 1}월`, count: c }));
      body.innerHTML = `
        <div class="period-nav">
          <button id="history-cat-year-prev">‹</button>
          <span class="period-label">${y}년</span>
          <button id="history-cat-year-next">›</button>
        </div>
        <div class="period-total">올해 총 <strong>${total}</strong>번</div>
        ${historyBuildBarChart(chartItems)}
      `;
      document.getElementById('history-cat-year-prev').addEventListener('click', () => { yearCursor = y - 1; draw(); });
      document.getElementById('history-cat-year-next').addEventListener('click', () => { yearCursor = y + 1; draw(); });
    }

    draw();
  }

  // 지난 기록 열람은 전부 기록 탭 한 곳으로만 모은다.
  // (운세센터에 따로 있던 "지난 맘운"은 기록 → 운세와 같은 loadMaumunLog()를 읽는 중복이었다.
  //  기록 쪽은 일/월/년 뷰까지 되는 상위 호환이라 그쪽을 남기고 이 함수로 연결한다.)
  function openHistoryCategory(cat) {
    const tabBtn = document.querySelector('.tab-btn[data-view="history"]');
    if (tabBtn) tabBtn.click(); // 이 클릭이 renderHistoryHub를 동기적으로 실행해 타일을 만든다
    const tile = historyCustomArea && historyCustomArea.querySelector(`.rx-category-tile[data-cat="${cat}"]`);
    if (tile) tile.click();
  }

  // ---------- 기록 탭 진입점: 개인처방/친구처방/운세 3개 카테고리 중 선택 ----------
  function renderHistoryHub(profile) {
    if (historyNativeSegmented) historyNativeSegmented.hidden = true;
    if (historyNativeContent) historyNativeContent.hidden = true;
    if (!historyCustomArea) return;
    historyCustomArea.hidden = false;
    // 마음약 타일만 "몇 종 모았는지"를 바로 보여준다 — 컬렉션은 그게 핵심 정보다.
    const medItems = loadMedicineItems();
    const medTotal = (window.MaumjaroGame && typeof window.MaumjaroGame.getCollection === 'function')
      ? window.MaumjaroGame.getCollection().length : 0;
    const medSub = medTotal ? `${medItems.length}/${medTotal}종` : '일/월/년';
    historyCustomArea.innerHTML = `
      <div class="rx-nav-header">
        <span class="rx-nav-title">📋 기록</span>
      </div>
      <div class="rx-category-grid">
        <div class="rx-category-tile" data-cat="personal">
          <span class="rx-category-emoji">💉</span>
          <span class="rx-category-label">개인 처방</span>
          <span class="rx-category-count">일/월/년</span>
        </div>
        <div class="rx-category-tile" data-cat="friend">
          <span class="rx-category-emoji">💌</span>
          <span class="rx-category-label">친구처방</span>
          <span class="rx-category-count">일/월/년</span>
        </div>
        <div class="rx-category-tile" data-cat="maumun">
          <span class="rx-category-emoji">🔮</span>
          <span class="rx-category-label">운세</span>
          <span class="rx-category-count">일/월/년</span>
        </div>
        <div class="rx-category-tile" data-cat="tarot">
          <span class="rx-category-emoji">🎴</span>
          <span class="rx-category-label">타로</span>
          <span class="rx-category-count">일/월/년</span>
        </div>
        <div class="rx-category-tile" data-cat="medicine">
          <span class="rx-category-emoji">💊</span>
          <span class="rx-category-label">마음약</span>
          <span class="rx-category-count">${medSub}</span>
        </div>
      </div>
    `;
    historyCustomArea.querySelectorAll('.rx-category-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const cat = tile.dataset.cat;
        if (cat === 'personal') {
          // 개인처방은 app.js가 이미 만들어둔 달력을 그대로 다시 보여준다 — 새로 구현하지 않는다.
          historyCustomArea.hidden = true;
          if (historyNativeSegmented) historyNativeSegmented.hidden = false;
          if (historyNativeContent) historyNativeContent.hidden = false;
          renderHistoryPersonalBackWiring(profile);
          return;
        }
        historyCustomArea.hidden = false;
        if (cat === 'friend') renderHistoryCategoryView(profile, '💌 친구처방 기록', loadFriendSentItems);
        else if (cat === 'tarot') renderHistoryCategoryView(profile, '🎴 타로 기록', loadTarotItems);
        // 마음약은 "언제 무엇을 처음 얻었는지"가 기록이다. 항목을 누르면 마음약국이 열린다.
        else if (cat === 'medicine') {
          const G = window.MaumjaroGame;
          if (G && typeof G.track === 'function') G.track('collection_progress_clicked', { source: 'history' });
          renderHistoryCategoryView(profile, '💊 마음약 기록', loadMedicineItems, () => {
            if (G && typeof G.openPharmacy === 'function') G.openPharmacy();
          });
        }
        // 운세 기록은 항목을 누르면 그날의 맘운 처방전을 다시 열어준다
        // (운세센터에 따로 있던 "지난 맘운" 화면의 기능을 여기로 옮겨온 것).
        else renderHistoryCategoryView(profile, '🔮 운세 기록', loadMaumunItems, (date) => {
          const entry = loadMaumunLog()[date];
          if (entry) openMaumunReveal(maumunEntryToReveal(entry));
        });
      });
    });
  }

  // 개인처방 달력(app.js 소유)을 보여주는 동안, 뒤로가기로 카테고리 선택으로 돌아갈 수 있도록
  // 작은 뒤로가기 바를 그 위에 하나 추가한다. app.js의 #history-content 내부는 건드리지 않는다.
  function renderHistoryPersonalBackWiring(profile) {
    let backBar = document.getElementById('history-personal-back-bar');
    if (!backBar) {
      backBar = document.createElement('div');
      backBar.id = 'history-personal-back-bar';
      backBar.className = 'rx-nav-header';
      backBar.innerHTML = '<button class="rx-back-btn" id="history-personal-back-btn" type="button">‹</button><span class="rx-nav-title">💉 개인 처방 기록</span>';
      historyNativeSegmented.parentNode.insertBefore(backBar, historyNativeSegmented);
    }
    backBar.hidden = false;
    document.getElementById('history-personal-back-btn').onclick = () => {
      backBar.hidden = true;
      renderHistoryHub(profile);
    };
  }

  // ---------- 탭 전환 시 운세 탭 노출 + 기록 탭 진입점 렌더 (기존 tab-btn 리스너들 옆에 독립 리스너로 추가) ----------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      viewFortune.hidden = view !== 'fortune';
      // 운세 화면은 사주 계산이 필요하므로 lunar 준비를 확인하고 그린다
      // (보통은 이미 받아져 있어 그 자리에서 바로 실행된다).
      if (view === 'fortune') withLunar(renderFortuneHome);
      if (view === 'history') renderHistoryHub(loadSajuProfile());
      else {
        const backBar = document.getElementById('history-personal-back-bar');
        if (backBar) backBar.hidden = true;
      }
    });
  });

  // ---------- 4.3: 친구가 보낸 운세 딥링크 진입 처리 (?maumun=<LZString>) ----------
  // prescriptions.js의 ?custom= 처리와 완전히 같은 원칙: 손상된 링크는 조용히 무시하고 평소처럼 홈이 보인다.
  (function handleFriendMaumunDeepLink() {
    const raw = new URLSearchParams(location.search).get('maumun');
    if (!raw) return;
    const payload = decodeMaumunPayload(raw);
    if (!payload) return;
    wireIncomingMaumunTrigger(payload);
  })();

  // ---------- 홍보 링크 착지 처리 (?start=tarot) ----------
  // 블로그·SNS에서 "무료 타로"를 보고 들어온 사람을 곧장 타로 주제 선택으로 보낸다.
  // 운세로 보내지 않는 이유: 오늘의 운세는 사주 일간이 필요해서 첫 화면이 생년월일 폼이 되고,
  // 처음 온 사람에겐 그게 벽이다. 타로는 사주 데이터를 안 쓰므로 입력 없이 바로 시작된다.
  // 타로 결과는 원래 주사를 놓아야 열리므로(renderTarotGate), 이 경로도 결국 주사로 이어진다.
  //
  // 파라미터가 없으면 아무 일도 일어나지 않는다 — 직접 방문·즐겨찾기는 기존대로 홈이 첫 화면이다.
  (function handlePromoLanding() {
    const start = new URLSearchParams(location.search).get('start');
    if (start !== 'tarot') return;
    // 친구 공유 딥링크(?custom=, ?maumun=, ?t=)가 함께 있으면 그쪽이 우선이다.
    // 친구가 보낸 걸 보러 온 사람을 홍보용 타로 화면으로 가로채면 안 된다.
    const q = new URLSearchParams(location.search);
    if (q.get('custom') || q.get('maumun') || q.get('t') || q.get('tarot')) return;

    const fortuneTabBtn = document.querySelector('.tab-btn[data-view="fortune"]');
    if (!fortuneTabBtn) return;
    promoTarotPending = true;  // renderFortuneHome이 이 표시를 보고 타로를 그린다
    trackEvent('promo_landing_tarot', { source: 'query_param' });
    fortuneTabBtn.click();     // 탭 상태·뷰 전환은 기존 리스너에 맡긴다
  })();

  // ---------- 친구가 보낸 타로 딥링크 진입 처리 ----------
  // 지금 쓰는 형식은 짧은 코드(?t=aydb). 이미 카톡으로 나간 예전 링크(?tarot=<LZString>)도
  // 계속 열려야 하므로 둘 다 읽는다.
  // 위 ?maumun= 처리와 같은 원칙: 손상된 링크는 조용히 무시하고 평소처럼 홈이 보인다.
  (function handleFriendTarotDeepLink() {
    const q = new URLSearchParams(location.search);
    const short = q.get('t');
    const payload = short ? parseTarotShareCode(short) : decodeTarotPayload(q.get('tarot'));
    if (!payload) return;
    wireIncomingTarotTrigger(payload);
  })();

  // AI 프록시 주소는 이 파일이 원본이다. heal-ai.js가 같은 주소를 또 적어두면
  // 나중에 프록시를 옮길 때 한쪽만 고쳐져 조용히 어긋난다. 여기서만 노출한다.
  window.MaumjaroFortune = { AI_PROXY_URL: AI_MAUMUN_PROXY_URL };
})();
