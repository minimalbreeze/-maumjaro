(() => {
  'use strict';

  const Core = window.MaumjaroCore;
  const {
    STEM_KO, BRANCH_KO, GAN_ELEMENT, BRANCH_ELEMENT,
    DAILY_FORTUNE_SEED, WEEKLY_FORTUNE_SEED, MONTHLY_FORTUNE_SEED, TOJEONG_SEED, MAUMUN_CONNECTOR,
  } = window.MAUMJARO_FORTUNE_DATA;

  const viewFortune = document.getElementById('view-fortune');
  const fortuneContent = document.getElementById('fortune-content');

  const SAJU_PROFILE_KEY = 'maumjaro:sajuProfile';
  const SAJU_CHART_KEY = 'maumjaro:sajuChart';
  const FORTUNE_CALC_VERSION = 1;

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
    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <span class="rx-nav-title">🔮 운세센터</span>
        <button class="rx-friend-quick-btn" id="fortune-edit-profile-btn" type="button">✏️ 정보 수정</button>
      </div>
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
          <span class="rx-category-emoji">🗓️</span>
          <span class="rx-category-label">월간 운세</span>
          <span class="rx-category-count">이번 달</span>
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
      localStorage.removeItem(SAJU_PROFILE_KEY);
      localStorage.removeItem(SAJU_CHART_KEY);
      renderProfileForm();
    });

    fortuneContent.querySelectorAll('.rx-category-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const type = tile.dataset.fortune;
        if (type === 'daily') renderFortuneDaily(profile);
        else if (type === 'weekly') renderFortuneWeekly(profile);
        else if (type === 'monthly') renderFortuneMonthly(profile);
        else if (type === 'tojeong') renderFortuneTojeong(profile);
        else if (type === 'maumun') renderMaumun(profile);
      });
    });
  }

  function renderFortuneDaily(profile) {
    const chart = getOrComputeSajuChart(profile);
    const relation = elementRelation(chart.dayMasterElement, todayDayMasterElement());
    const seed = DAILY_FORTUNE_SEED.find((s) => s.relation === relation) || DAILY_FORTUNE_SEED[0];
    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
        <span class="rx-nav-title">🔮 오늘의 운세</span>
      </div>
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${seed.emoji}</div>
        <div class="rx-detail-title">${seed.title}</div>
        <div class="rx-detail-diagnosis">${seed.diagnosis}</div>
        <p class="rx-detail-symptom">${seed.advice}</p>
      </div>
      <p class="rx-custom-hint">⚠️ ${seed.caution}</p>
      ${pillarsBlockHtml(chart)}
    `;
    document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
  }

  function renderFortuneWeekly(profile) {
    const chart = getOrComputeSajuChart(profile);
    const relation = elementRelation(chart.dayMasterElement, weekAnchorElement());
    const seed = WEEKLY_FORTUNE_SEED.find((s) => s.relation === relation) || WEEKLY_FORTUNE_SEED[0];
    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
        <span class="rx-nav-title">📅 주간 운세</span>
      </div>
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${seed.emoji}</div>
        <div class="rx-detail-title">${seed.title}</div>
        <div class="rx-detail-diagnosis">${seed.diagnosis}</div>
        <p class="rx-detail-symptom">${seed.advice}</p>
      </div>
      <p class="rx-custom-hint">⚠️ ${seed.caution}</p>
    `;
    document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
  }

  function renderFortuneMonthly(profile) {
    const chart = getOrComputeSajuChart(profile);
    const relation = elementRelation(chart.dayMasterElement, monthAnchorElement());
    const seed = MONTHLY_FORTUNE_SEED.find((s) => s.relation === relation) || MONTHLY_FORTUNE_SEED[0];
    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
        <span class="rx-nav-title">🗓️ 월간 운세</span>
      </div>
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${seed.emoji}</div>
        <div class="rx-detail-title">${seed.title}</div>
        <div class="rx-detail-diagnosis">${seed.diagnosis}</div>
        <p class="rx-detail-symptom">${seed.advice}</p>
      </div>
      <p class="rx-custom-hint">⚠️ ${seed.caution}</p>
    `;
    document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
  }

  function renderFortuneTojeong(profile) {
    const chart = getOrComputeSajuChart(profile);
    const year = new Date().getFullYear();
    const idx = hashStr(`${chart.pillars.day.gan}${chart.pillars.day.zhi}:${year}`) % TOJEONG_SEED.length;
    const t = TOJEONG_SEED[idx];
    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
        <span class="rx-nav-title">📜 토정비결</span>
      </div>
      <p class="rx-custom-hint">💛 전통 토정비결의 정식 산출식을 그대로 구현한 게 아니라, 앱 톤에 맞게 재해석한 간이 버전이에요</p>
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${t.emoji}</div>
        <div class="rx-detail-title">${t.title}</div>
        <div class="rx-detail-diagnosis">${t.summary}</div>
        <p class="rx-detail-symptom">${t.detail}</p>
      </div>
    `;
    document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
  }

  // ---------- 맘운: 오늘의 마음(2.0 감정 기록) + 오늘의 운을 합성 ----------
  function renderMaumun(profile) {
    const emotion = getTodayEmotionEntry();

    if (!emotion) {
      fortuneContent.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
          <span class="rx-nav-title">💞 맘운 처방</span>
        </div>
        <p class="rx-custom-hint">아직 오늘의 마음을 기록하지 않으셨어요. 홈에서 먼저 오늘의 감정을 처방받고 오면, 오늘의 운세와 합쳐서 맘운을 보여드릴게요</p>
        <button class="action-btn" id="fortune-goto-home-btn" type="button" style="width:100%;">💉 홈에서 마음 처방받기</button>
      `;
      document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
      document.getElementById('fortune-goto-home-btn').addEventListener('click', () => {
        document.querySelector('.tab-btn[data-view="home"]').click();
      });
      return;
    }

    const chart = getOrComputeSajuChart(profile);
    const relation = elementRelation(chart.dayMasterElement, todayDayMasterElement());
    const fortuneSeed = DAILY_FORTUNE_SEED.find((s) => s.relation === relation) || DAILY_FORTUNE_SEED[0];
    const connector = MAUMUN_CONNECTOR[relation];

    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="fortune-detail-back" type="button">‹</button>
        <span class="rx-nav-title">💞 오늘의 맘운</span>
      </div>
      <div class="today-rx-card" style="display:flex;">
        <div class="today-rx-emoji">${emotion.emoji}</div>
        <div class="today-rx-body">
          <div class="today-rx-eyebrow">오늘의 마음</div>
          <div class="today-rx-title">${emotion.label} · ${emotion.mg}</div>
          <div class="today-rx-diagnosis">${emotion.caption}</div>
        </div>
      </div>
      <div class="today-rx-card" style="display:flex;">
        <div class="today-rx-emoji">${fortuneSeed.emoji}</div>
        <div class="today-rx-body">
          <div class="today-rx-eyebrow">오늘의 운</div>
          <div class="today-rx-title">${fortuneSeed.title}</div>
          <div class="today-rx-diagnosis">${fortuneSeed.diagnosis}</div>
        </div>
      </div>
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">💞</div>
        <div class="rx-detail-title">오늘의 맘운 처방</div>
        <p class="rx-detail-symptom">${connector}</p>
      </div>
    `;
    document.getElementById('fortune-detail-back').addEventListener('click', () => renderFortuneHub(profile));
  }

  function renderProfileForm() {
    fortuneContent.innerHTML = `
      <div class="rx-nav-header">
        <span class="rx-nav-title">🔮 사주 정보 입력</span>
      </div>
      <p class="rx-custom-hint">💛 한 번만 입력하면 계속 재사용돼요. 이 정보는 이 기기에만 저장되고 외부로 전송되지 않아요</p>

      <div class="segmented" id="fortune-calendar-toggle">
        <button class="seg-btn active" data-val="solar" type="button">양력</button>
        <button class="seg-btn" data-val="lunar" type="button">음력</button>
      </div>

      <div class="rx-custom-field" id="fortune-leap-field" style="display:none;">
        <div class="sound-row">
          <span>윤달이에요</span>
          <button id="fortune-leap-toggle" class="toggle-btn" type="button" aria-pressed="false">⭕ 꺼짐</button>
        </div>
      </div>

      <div class="rx-custom-field">
        <label class="rx-slip-key" for="fortune-birthdate">생년월일</label>
        <input type="date" id="fortune-birthdate" class="rx-custom-input" />
      </div>

      <div class="rx-custom-field">
        <label class="rx-slip-key" for="fortune-birthtime">태어난 시간</label>
        <input type="time" id="fortune-birthtime" class="rx-custom-input" />
      </div>
      <div class="sound-row">
        <span>태어난 시간을 몰라요</span>
        <button id="fortune-time-unknown-toggle" class="toggle-btn" type="button" aria-pressed="false">⭕ 꺼짐</button>
      </div>

      <div class="segmented" id="fortune-gender-toggle" style="margin-top:14px;">
        <button class="seg-btn active" data-val="female" type="button">여성</button>
        <button class="seg-btn" data-val="male" type="button">남성</button>
      </div>

      <button class="action-btn" id="fortune-profile-submit" type="button" style="width:100%;margin-top:16px;">🔮 운세 보기</button>
    `;

    let calendarType = 'solar';
    let isLeapMonth = false;
    let timeUnknown = false;
    let gender = 'female';

    const calendarToggle = document.getElementById('fortune-calendar-toggle');
    const leapField = document.getElementById('fortune-leap-field');
    const leapToggle = document.getElementById('fortune-leap-toggle');
    const timeUnknownToggle = document.getElementById('fortune-time-unknown-toggle');
    const birthTimeInput = document.getElementById('fortune-birthtime');
    const genderToggle = document.getElementById('fortune-gender-toggle');

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
      const birthTime = birthTimeInput.value || null;
      if (!timeUnknown && !birthTime) {
        Core.showToast('태어난 시간을 입력하거나 "모름"을 선택해주세요');
        return;
      }
      const profile = {
        name: (localStorage.getItem('maumjaro:username') || '').trim() || null,
        calendarType,
        birthDate,
        isLeapMonth: calendarType === 'lunar' ? isLeapMonth : false,
        birthTime: timeUnknown ? null : birthTime,
        timeUnknown,
        gender,
        savedAt: Date.now(),
      };
      saveSajuProfile(profile);
      localStorage.removeItem(SAJU_CHART_KEY); // 새 프로필이면 이전 캐시 무효화
      renderFortuneHub(profile);
    });
  }

  // ---------- 탭 전환 시 운세 탭 노출 (기존 tab-btn 리스너들 옆에 세 번째 리스너로 추가) ----------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      viewFortune.hidden = view !== 'fortune';
      if (view === 'fortune') renderFortuneHome();
    });
  });
})();
