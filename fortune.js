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
    TAROT_MAJOR, TAROT_POSITIONS, TAROT_SHUFFLE_LINES, TAROT_SUMMARY_SEED, TAROT_BACK_SVG,
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
  function openMaumunReveal({ emoji, diagnosis, interpretation, prescription, dosage, color, showMakeOwnBtn }) {
    document.body.style.setProperty('--dose-color', color || '#b779ef');
    maumunRevealEmoji.textContent = emoji;
    maumunRevealDiagnosis.textContent = diagnosis;
    maumunRevealInterpretation.textContent = interpretation;
    maumunRevealPrescription.textContent = prescription;
    maumunRevealDosage.textContent = dosage;
    maumunRevealMakeBtn.hidden = !showMakeOwnBtn;
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

  const SAJU_PROFILE_KEY = 'maumjaro:sajuProfile';
  const SAJU_CHART_KEY = 'maumjaro:sajuChart';
  const FORTUNE_CALC_VERSION = 1;
  const MAUMUN_LOG_KEY = 'maumjaro:maumunLog'; // 기존 감정/처방 기록 키와 완전 독립된 별도 구조

  function todayDateKey() {
    return new Date().toISOString().slice(0, 10);
  }
  function formatMaumunDate(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return `${m}월 ${d}일`;
  }

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
  function renderFortuneHome() {
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
          <span class="rx-category-count">${getTodayTarotDraw() ? '오늘 뽑음' : '3장 뽑기'}</span>
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
        <div class="rx-category-tile" data-fortune="maumun-history">
          <span class="rx-category-emoji">📖</span>
          <span class="rx-category-label">지난 맘운</span>
          <span class="rx-category-count">${Object.keys(loadMaumunLog()).length}일 기록</span>
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
        else if (type === 'tarot') renderTarotEntry(profile);
        else if (type === 'tojeong') renderFortuneTojeong(profile);
        else if (type === 'maumun') renderMaumun(profile);
        else if (type === 'maumun-history') renderMaumunHistory(profile);
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
  function withMysticalReveal(profile, title, buildAndRender) {
    const loadingLine = MYSTICAL_LOADING_LINES[Math.floor(Math.random() * MYSTICAL_LOADING_LINES.length)];
    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
        <span class="rx-nav-title">${title}</span>
      </div>
      <div class="fortune-loading">
        <div class="fortune-loading-orb">🔮</div>
        <p class="fortune-loading-text">${loadingLine}</p>
      </div>
    `;
    document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
    setTimeout(buildAndRender, 1400 + Math.floor(Math.random() * 900));
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
    withMysticalReveal(profile, '🔮 오늘의 운세', () => {
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
  function buildMaumunShareUrl(payload) {
    const json = JSON.stringify(payload);
    const encoded = window.LZString
      ? window.LZString.compressToEncodedURIComponent(json)
      : encodeURIComponent(json);
    return `${location.origin}${location.pathname}?maumun=${encoded}`;
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
    const text = MAUMUN_SHARE_TEXTS[Math.floor(Math.random() * MAUMUN_SHARE_TEXTS.length)];
    Rx.shareOrCopy(text, url);
  }

  // 받는 사람 쪽엔 감정/사주 개념이 없으므로 맘운 기록(maumunLog)엔 절대 저장하지 않는다 —
  // 3.0의 ?custom= 수신자 플로우와 동일하게 "주사를 놓아야 내용이 공개"되는 구조만 재사용한다.
  function wireIncomingMaumunTrigger(payload) {
    friendMaumunIncomingTitle.textContent = payload.fr ? `${payload.fr}가 보낸 운세` : '친구가 보낸 운세';
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
      document.getElementById('fortune-maumun-history-btn').addEventListener('click', () => renderMaumunHistory(profile));
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
      document.getElementById('fortune-maumun-history-btn').addEventListener('click', () => renderMaumunHistory(profile));
      return;
    }

    withMysticalReveal(profile, '🌞 오늘의 맘운', () => {
      // "운세가 감정을 해석하고 그 결과가 처방으로 이어지는" 구조: 감정에 매핑된 운세 카테고리를
      // 오늘의 운세(renderFortuneDaily)와 동일한 결정론적 시드로 골라, 감정×카테고리 티어로
      // 미리 써둔 해석/진단명/처방/복용법 매트릭스에서 오늘의 맘운을 뽑는다.
      const chart = getOrComputeSajuChart(profile);
      const categoryKey = MAUMUN_EMOTION_CATEGORY[emotion.key] || 'mind';
      const categorySeed = FORTUNE_SEED_BY_CATEGORY[categoryKey];
      const categoryItem = categorySeed.items[dailyPickIndex(chart, categoryKey, categorySeed.items.length)];
      const tier = categoryItem.stars <= 2 ? 'low' : categoryItem.stars === 3 ? 'mid' : 'high';
      const interp = (MAUMUN_INTERPRETATION[emotion.key] && MAUMUN_INTERPRETATION[emotion.key][tier])
        || MAUMUN_INTERPRETATION.stress.mid;

      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">🌞 오늘의 맘운</span>
        </div>

        <div class="rx-custom-preview">
          <div class="rx-slip-row"><span class="rx-slip-key">오늘의 ${FORTUNE_CATEGORY_LABELS[categoryKey]}</span><span class="rx-slip-value">${starsText(categoryItem.stars)}</span></div>
        </div>

        <div class="today-rx-card" style="display:flex;">
          <div class="today-rx-emoji">${emotion.emoji}</div>
          <div class="today-rx-body">
            <div class="today-rx-eyebrow">오늘의 마음</div>
            <div class="today-rx-title">${emotion.label}</div>
            <div class="today-rx-diagnosis">${emotion.caption}</div>
          </div>
        </div>

        <div class="rx-detail-card">
          <div class="rx-detail-title">오늘의 해석</div>
          <p class="rx-detail-symptom">${interp.interpretation}</p>
        </div>

        <div class="rx-custom-preview">
          <div class="rx-slip-row"><span class="rx-slip-key">💊 오늘의 맘운 처방</span><span class="rx-slip-value">${interp.diagnosis}</span></div>
        </div>

        <p class="rx-custom-hint">주사를 놓으면 처방과 복용법이 담긴 맘운 처방전을 확인할 수 있어요</p>
        <button class="action-btn" id="fortune-maumun-inject-btn" type="button" style="width:100%;">💉 맘운 처방받기</button>
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

  // ---------- 지난 맘운: 날짜별 기록을 카드로 보여준다 ----------
  function renderMaumunHistory(profile) {
    const log = loadMaumunLog();
    const entries = Object.values(log).sort((a, b) => b.date.localeCompare(a.date));
    const cardsHtml = entries.length
      ? entries.map((e) => `
        <div class="rx-list-card" data-date="${e.date}">
          <span class="rx-list-emoji">${e.emotionEmoji}</span>
          <div class="rx-list-body">
            <div class="rx-list-title-row">
              <span class="rx-list-title">${formatMaumunDate(e.date)}</span>
            </div>
            <div class="rx-list-desc">${e.emotionEmoji} ${e.emotionLabel} · 🔮 ${e.categoryLabel} ${starsText(e.stars)}</div>
            <div class="rx-list-desc">💉 ${e.diagnosis} 처방</div>
          </div>
        </div>`).join('')
      : '<p class="rx-empty-msg">아직 지난 맘운 기록이 없어요</p>';

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
        <span class="rx-nav-title">📖 지난 맘운</span>
      </div>
      ${cardsHtml}
    `;
    document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
    fortuneContent.querySelectorAll('.rx-list-card').forEach((card) => {
      card.addEventListener('click', () => {
        const entry = log[card.dataset.date];
        if (entry) openMaumunReveal(maumunEntryToReveal(entry));
      });
    });
  }

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

  function loadTarotLog() {
    try {
      const raw = localStorage.getItem(TAROT_LOG_KEY);
      const log = raw ? JSON.parse(raw) : {};
      return (log && typeof log === 'object') ? log : {};
    } catch (e) {
      return {};
    }
  }
  function saveTarotDraw(entry) {
    const log = loadTarotLog();
    log[entry.date] = entry;
    localStorage.setItem(TAROT_LOG_KEY, JSON.stringify(log));
  }
  function getTodayTarotDraw() {
    const entry = loadTarotLog()[todayDateKey()];
    // 카드 데이터가 바뀌어 id를 못 찾는 경우까지 대비한다.
    if (!entry || !Array.isArray(entry.cards) || entry.cards.length !== 3) return null;
    return entry.cards.every((c) => tarotCardOf(c.id)) ? entry : null;
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

  // 공유: 3장을 이미지로 만들어 보낸다. html2canvas가 없거나 실패하면 텍스트+링크로 폴백한다.
  // (처방전 공유와 같은 방식 — 새로 구현하지 않고 기존 패턴을 따른다)
  async function shareTarotDraw(entry, cards, btn) {
    const names = cards.map((c) => `${c.card.name}(${tarotDirLabel(c.reversed)})`).join(' · ');
    const text = `🎴 오늘의 타로\n${names}\n\n${entry.summary}`;
    const url = `${location.origin}${location.pathname}`;
    const node = document.getElementById('tarot-share-capture');

    if (typeof window.html2canvas !== 'function' || !node) {
      Rx.shareOrCopy(text, url);
      return;
    }

    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '준비 중...';
    try {
      const canvas = await window.html2canvas(node, { backgroundColor: '#fdf2f4', scale: 2 });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('toBlob failed');
      const file = new File([blob], '맘운자로_타로.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text}\n${url}`, title: '오늘의 타로' });
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

  // ---------- 1단계: 셔플 ----------
  function renderTarotShuffle(profile) {
    let shuffles = 0;
    const NEEDED = 3;

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="tarot-back" type="button">‹</button>
        <span class="rx-nav-title">🎴 오늘의 타로</span>
      </div>
      <p class="tarot-hint" id="tarot-hint">${TAROT_SHUFFLE_LINES[0]}</p>
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

    document.getElementById('tarot-back').addEventListener('click', () => renderFortuneHub(profile));

    function doShuffle() {
      if (shuffles >= NEEDED) return;
      shuffles += 1;
      countEl.textContent = `섞기 ${shuffles} / ${NEEDED}`;
      hint.textContent = TAROT_SHUFFLE_LINES[Math.min(shuffles, TAROT_SHUFFLE_LINES.length - 1)];
      deck.classList.remove('shuffling');
      void deck.offsetWidth; // 애니메이션 재시작을 위한 강제 리플로우
      deck.classList.add('shuffling');
      tarotSound('playInjectPress'); // 카드 넘기는 짧은 소리
      if (shuffles >= NEEDED) {
        setTimeout(() => renderTarotFan(profile), 520);
      }
    }

    document.getElementById('tarot-shuffle-btn').addEventListener('click', doShuffle);
    wireTarotSwipeShuffle(deck, doShuffle);
  }

  // ---------- 2단계: 부채꼴에서 3장 직접 뽑기 ----------
  function renderTarotFan(profile) {
    const fan = buildTarotFan();
    const picked = [];

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="tarot-back" type="button">‹</button>
        <span class="rx-nav-title">🎴 오늘의 타로</span>
      </div>
      <p class="tarot-hint">마음이 가는 카드를 <strong>3장</strong> 골라주세요</p>
      <div class="tarot-fan" id="tarot-fan">
        ${fan.map((_, i) => `<button class="tarot-card-back" type="button" data-i="${i}" style="--i:${i};" aria-label="${i + 1}번째 카드">${TAROT_BACK_SVG}</button>`).join('')}
      </div>
      <p class="tarot-count" id="tarot-count">0 / 3 선택</p>
      <button class="action-btn" id="tarot-open-btn" type="button" style="width:100%;" disabled>카드를 3장 골라주세요</button>
    `;

    document.getElementById('tarot-back').addEventListener('click', () => renderFortuneHub(profile));

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
          tarotSound('playInjectPress');
        }
        countEl.textContent = `${picked.length} / 3 선택`;
        openBtn.disabled = picked.length !== 3;
        openBtn.textContent = picked.length === 3 ? '🔮 카드 열어보기' : '카드를 3장 골라주세요';
      });
    });

    openBtn.addEventListener('click', () => {
      if (picked.length !== 3) return;
      const cards = picked.map((i) => fan[i]);
      const entry = {
        date: todayDateKey(),
        cards,
        injected: false,
        summary: TAROT_SUMMARY_SEED[Math.floor(Math.random() * TAROT_SUMMARY_SEED.length)],
        ts: Date.now(),
      };
      // 주사를 놓지 않아도 오늘 뽑은 카드는 고정되어야 한다(다시 들어와도 같은 카드).
      saveTarotDraw(entry);
      renderTarotResult(profile, entry);
    });
  }

  // ---------- 3단계: 공개 + 해석 + 처방 → 주사 ----------
  function renderTarotResult(profile, entry) {
    const cards = entry.cards.map((c) => {
      const card = tarotCardOf(c.id);
      return { card, reversed: c.reversed, side: tarotSideOf(card, c.reversed) };
    });
    const advice = cards[2]; // 세 번째 자리 = 오늘의 처방 방향

    const facesHtml = cards.map((c, i) => `
      <div class="tarot-face-wrap">
        <div class="tarot-face-pos">${TAROT_POSITIONS[i].emoji} ${TAROT_POSITIONS[i].label}</div>
        <div class="tarot-face${c.reversed ? ' reversed' : ''}" style="animation-delay:${i * 0.45}s;">
          <div class="tarot-face-frame">
            <div class="tarot-face-num">${tarotRoman(c.card.id)}</div>
            <div class="tarot-face-art"><span class="tarot-face-emoji">${c.card.emoji}</span></div>
            <div class="tarot-face-label">
              <div class="tarot-face-name">${c.card.name}</div>
              <span class="tarot-face-dir">${tarotDirLabel(c.reversed)}</span>
            </div>
          </div>
        </div>
      </div>`).join('');

    const readHtml = cards.map((c, i) => `
      <div class="tarot-read-card">
        <span class="tarot-read-emoji">${c.card.emoji}</span>
        <div class="tarot-read-body">
          <div class="tarot-read-pos">${TAROT_POSITIONS[i].emoji} ${TAROT_POSITIONS[i].label}</div>
          <div class="tarot-read-title">${c.card.name} · ${tarotDirLabel(c.reversed)} · ${c.side.keyword}</div>
          <p class="tarot-read-line">${c.side.line}</p>
        </div>
      </div>`).join('');

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="tarot-back" type="button">‹</button>
        <span class="rx-nav-title">🎴 오늘의 타로</span>
      </div>
      <div class="tarot-share-capture" id="tarot-share-capture">
        <div class="tarot-share-title">🎴 오늘의 타로</div>
        <div class="tarot-reveal-row">${facesHtml}</div>
        <p class="tarot-hint" style="margin-bottom:0;">${entry.summary}</p>
        <div class="tarot-share-foot">맘운자로 · maumjaro.minimalbreeze.com</div>
      </div>
      ${readHtml}
      <div class="rx-custom-preview" style="margin-top:12px;">
        <div class="rx-slip-row">
          <span class="rx-slip-key">오늘의 처방</span>
          <span class="rx-slip-value">${advice.card.name} · ${advice.side.keyword}</span>
        </div>
        <p class="rx-slip-text">${advice.side.line}</p>
        <button class="rx-friend-quick-btn" id="tarot-goto-rx-btn" type="button" style="margin-top:6px;">처방 후보 보러가기 ›</button>
      </div>
      <button class="action-btn" id="tarot-inject-btn" type="button" style="width:100%;margin-top:12px;">💉 이 처방으로 주사 놓기</button>
      <button class="rx-slip-photo-btn" id="tarot-share-btn" type="button" style="margin-top:9px;">🎴 타로 결과 공유하기</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">오늘 뽑은 카드는 그대로 저장돼요. 새로 뽑는 건 내일부터예요</p>
    `;

    document.getElementById('tarot-back').addEventListener('click', () => renderFortuneHub(profile));
    document.getElementById('tarot-goto-rx-btn').addEventListener('click', () => Rx.goToRxCategory(advice.card.rxCategory));
    const shareBtn = document.getElementById('tarot-share-btn');
    shareBtn.addEventListener('click', () => shareTarotDraw(entry, cards, shareBtn));

    // 기존 주사 인터랙션을 그대로 재사용한다(새로 구현하지 않는다).
    const syntheticP = {
      id: 'tarot-today',
      category: 'tarot',
      title: `${advice.card.name} 처방`,
      diagnosis: `${advice.card.name} · ${advice.side.keyword}`,
      emoji: advice.card.emoji,
      color: '#b779ef',
    };
    const injectBtn = document.getElementById('tarot-inject-btn');
    Rx.wireExternalTrigger(injectBtn, syntheticP, () => {
      resetDoseVisuals();
      Rx.showRxImageFade(syntheticP, () => {
        saveTarotDraw({ ...entry, injected: true });
        openMaumunReveal({
          emoji: advice.card.emoji,
          diagnosis: `${advice.card.name} 처방`,
          // 카드 문구들은 마침표 없이 끝나므로, 이어 붙일 때 마침표를 넣어야 문장이 자연스럽다.
          interpretation: `${cards[0].side.line}. ${cards[1].side.line}`,
          prescription: advice.side.line,
          dosage: `${advice.card.name} ${tarotDirLabel(advice.reversed)} · ${advice.side.keyword}`,
          color: '#b779ef',
          showMakeOwnBtn: false,
        });
      });
    });
  }

  // 타로 진입점: 오늘 이미 뽑았으면 같은 카드를 다시 보여주고, 아니면 셔플부터 시작한다.
  function renderTarotEntry(profile) {
    const today = getTodayTarotDraw();
    if (today) renderTarotResult(profile, today);
    else renderTarotShuffle(profile);
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
        renderMaumun(profile);
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
  function loadMaumunItems() {
    return Object.values(loadMaumunLog()).map((e) => ({
      ts: e.ts, emoji: e.emotionEmoji, title: `${e.diagnosis} 처방`, sub: `🔮 ${e.categoryLabel} ${starsText(e.stars)}`,
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
    return Core.sameDay(d, new Date()) ? `오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getMonth() + 1}월 ${d.getDate()}일`;
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
    return `
      <div class="rx-list-card">
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
  function renderHistoryCategoryView(profile, navTitle, loadItemsFn) {
    let period = 'day';
    let monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let yearCursor = new Date().getFullYear();
    let selectedDayKey = null;

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

  // ---------- 기록 탭 진입점: 개인처방/친구처방/운세 3개 카테고리 중 선택 ----------
  function renderHistoryHub(profile) {
    if (historyNativeSegmented) historyNativeSegmented.hidden = true;
    if (historyNativeContent) historyNativeContent.hidden = true;
    if (!historyCustomArea) return;
    historyCustomArea.hidden = false;
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
        else renderHistoryCategoryView(profile, '🔮 운세 기록', loadMaumunItems);
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
      if (view === 'fortune') renderFortuneHome();
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
})();
