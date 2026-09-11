/* 구장 상세 — 이 서비스의 핵심 화면.
   URL: stadium.html?id=gwangju[&tab=seats][&section=...][&prefs=focus,cheer]
   공유 링크가 그대로 같은 화면을 열어야 한다(지시서 34·74번). */
(function () {
  const R = window.KboRender;
  const CFG = window.KBO_CONFIG;
  const q = new URLSearchParams(location.search);

  const TABS = [
    { id: 'seats',      label: '⭐ 명당' },
    { id: 'view',       label: '👀 시야' },
    { id: 'food',       label: '🍗 먹거리' },
    { id: 'shop',       label: '🧢 굿즈' },
    { id: 'facility',   label: '🚻 편의시설' },
    { id: 'transport',  label: '🚇 교통' }
  ];

  let stadium = null;
  let seatData = { seatTypes: [], sections: [], scoreFields: [] };
  let activeTab = TABS.some((t) => t.id === q.get('tab')) ? q.get('tab') : 'seats';

  /* 주소를 바꿔도 화면을 다시 그리지 않는다 — 공유·뒤로가기용으로만 쓴다. */
  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set('id', stadium.id);
    u.searchParams.set('tab', activeTab);
    history.replaceState(null, '', u.toString());
  }

  /* ---------- 오늘/다음 경기 + 경기 상태 ---------- */
  async function renderGame() {
    const el = document.getElementById('game-box');
    try {
      const [game, codes] = await Promise.all([
        window.KboGames.nextAt(stadium.id),
        window.KboGames.statusCodes()
      ]);
      const officialLink = '<a href="' + R.esc(CFG.officialStatusUrl) +
        '" target="_blank" rel="noopener">공식 일정·경기 상태 확인하기 ›</a>';

      if (!game) {
        el.innerHTML = '<div class="card"><h2>오늘 경기</h2>' +
          R.emptyBox('등록된 경기 정보가 아직 없습니다.') +
          '<p class="meta">' + officialLink + '</p></div>';
        return;
      }
      const st = window.KboGames.statusOf(game, codes);
      el.innerHTML = '<div class="card">' +
        '<h2>' + R.esc(game.date === window.KboGames.ymd(new Date()) ? '오늘 경기' : '다음 경기') + '</h2>' +
        '<div class="teams" style="font-size:18px;font-weight:800">' +
          R.textOr(game.awayName) + ' vs ' + R.textOr(game.homeName) + '</div>' +
        '<div class="where">' + R.textOr(game.date) + ' ' + R.textOr(game.time) + '</div>' +
        '<div style="margin-top:10px"><span class="badge">' + R.esc(st.emoji) + ' ' + R.esc(st.label) + '</span></div>' +
        '<p class="meta">' + officialLink + '</p>' +
      '</div>';
      window.KboAnalytics.track('game_view', { stadium: stadium.id });
    } catch (e) {
      el.innerHTML = '<div class="card">' + R.emptyBox('경기 정보를 불러오지 못했습니다.') + '</div>';
    }
  }

  /* ---------- 날씨 + 직관지수 ----------
     날씨와 경기 취소는 완전히 분리한다. 여기서는 절대 취소를 단정하지 않는다. */
  async function renderWeather() {
    const el = document.getElementById('weather-box');
    el.innerHTML = '<div class="card"><h2>🌤️ 오늘의 직관 날씨</h2>' +
      '<div class="empty">날씨를 불러오는 중…</div></div>';
    try {
      const w = await window.KboWeather.forStadium(stadium);
      // 경기 시간이 있으면 그 앞뒤 2시간을 보여준다(지시서 11번).
      // 없으면 앞으로의 6시간으로 대체한다.
      let game = null;
      try { game = await window.KboGames.nextAt(stadium.id); } catch (e) {}
      const gameAt = game && game.date && game.time ? game.date + 'T' + game.time : null;
      const near = window.KboWeather.aroundGameTime(w, gameAt);
      const hours = near.length ? near : w.hourly.slice(0, 6);
      const hoursTitle = near.length ? '경기 시간 전후 예보' : '앞으로의 예보';

      const approx = stadium.coordinates && stadium.coordinates.precision === 'approximate'
        ? '<p class="meta">구장 좌표가 아직 공식 확인 전이라 인근 지역 예보일 수 있습니다.</p>' : '';

      el.innerHTML = '<div class="card">' +
        '<h2>🌤️ 오늘의 직관 날씨</h2>' +
        '<div class="weather-now">' +
          '<span class="emoji">' + R.esc(w.emoji) + '</span>' +
          '<div><div class="temp">' + R.textOr(w.temperature, '℃') + '</div>' +
          '<div class="cond">' + R.esc(w.condition) +
            ' · 체감 ' + R.textOr(w.feelsLike, '℃') +
            ' · 습도 ' + R.textOr(w.humidity, '%') +
            ' · 바람 ' + R.textOr(w.wind, 'm/s') + '</div></div>' +
        '</div>' +
        '<div class="index-score">' + R.esc(w.index.emoji) +
          ' <b>직관지수 ' + w.index.score + '</b> <span class="cond">' + R.esc(w.index.line) + '</span></div>' +
        '<p class="meta" style="margin:14px 0 0">' + R.esc(hoursTitle) + '</p>' +
        '<div class="hourly">' + hours.map((h) =>
          '<div><div class="h">' + R.esc(String(h.time).slice(11, 16)) + '</div>' +
          '<div class="t">' + R.textOr(h.temperature != null ? Math.round(h.temperature) : null, '℃') + '</div>' +
          '<div class="p">💧' + R.textOr(h.rainProbability, '%') + '</div></div>'
        ).join('') + '</div>' +
        '<p class="disclaimer">' + R.esc(CFG.weatherDisclaimer) + '</p>' +
        approx +
      '</div>';
      window.KboAnalytics.track('weather_view', { stadium: stadium.id });
    } catch (e) {
      el.innerHTML = '<div class="card"><h2>🌤️ 오늘의 직관 날씨</h2>' +
        R.emptyBox('현재 날씨 정보를 불러오지 못했습니다.') + '</div>';
    }
  }

  /* ---------- 탭 ---------- */
  function renderTabs() {
    const el = document.getElementById('tabs');
    el.innerHTML = TABS.map((t) =>
      '<button role="tab" type="button" data-tab="' + t.id + '" aria-selected="' +
      (t.id === activeTab) + '">' + t.label + '</button>'
    ).join('');
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tab]');
      if (!b) return;
      activeTab = b.dataset.tab;
      el.querySelectorAll('[data-tab]').forEach((x) =>
        x.setAttribute('aria-selected', String(x.dataset.tab === activeTab)));
      syncUrl();
      renderPanel();
    });

    // 각 탭 하단의 "다음 단계" 버튼도 같은 탭 전환을 쓴다.
    document.getElementById('panel').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-goto]');
      if (!b) return;
      const target = el.querySelector('[data-tab="' + b.dataset.goto + '"]');
      if (target) target.click();
    });
  }

  /* 모든 탭은 흐름의 다음 단계로 이어지는 안내를 갖는다(지시서 5번 흐름). */
  function nextStep(text, tab) {
    return '<p style="margin-top:14px"><button class="btn btn-ghost" type="button" ' +
      'data-goto="' + R.esc(tab) + '">' + R.esc(text) + ' \u203a</button></p>';
  }

  function renderSeats() {
    const prefs = (q.get('prefs') || '').split(',').filter(Boolean);
    let html = '<div class="card"><h2>⭐ 명당지도</h2>';

    if (!seatData.sections.length) {
      html += R.emptyBox('좌석 배치도와 구역별 평가가 아직 준비되지 않았습니다.');
      if (seatData.seatTypes.length) {
        html += '<h3 style="margin-top:16px">좌석 등급</h3><div class="chips">' +
          seatData.seatTypes.map((t) =>
            '<span class="chip" aria-disabled="true">' + R.esc(t.name) + '</span>').join('') +
          '</div><p class="meta">등급 이름만 확인되었습니다. 블록 배치·가격·평가는 공식 좌석도 확인 후 등록됩니다.</p>';
      }
    } else {
      const ranked = prefs.length ? window.KboRecommend.rank(seatData.sections, prefs) : [];
      if (ranked.length) {
        html += '<h3>🎯 선택하신 취향 기준 추천</h3>';
        html += ranked.map((r, i) =>
          '<div class="rank"><span class="medal">' + ['🥇', '🥈', '🥉'][i] + '</span>' +
          '<div><b>' + R.esc(r.section.seatName || r.section.section) + '</b>' +
          ' <span class="badge">명당 점수 ' + r.score + '</span></div></div>').join('');
      }
      html += '<ul class="scores">' + seatData.sections.map((s) =>
        '<li><span>' + R.esc(s.seatName || s.section) + '</span>' +
        '<span>' + R.stars(s.viewScore) + '</span></li>').join('') + '</ul>';
    }
    html += '<p class="disclaimer">' + R.esc(CFG.scoreDisclaimer) + '</p>';
    html += nextStep('👀 이 자리에서 보기', 'view');
    html += '</div>';
    window.KboAnalytics.track('seat_view', { stadium: stadium.id });
    return html;
  }

  function renderView() {
    return '<div class="card"><h2>👀 좌석 시야</h2>' +
      R.emptyBox('현재 시야 자료 준비 중입니다.') +
      '<p class="meta">실제 관중이 찍은 사진만 사용합니다. 생성된 이미지를 실제 시야처럼 보여주지 않습니다.</p>' +
      nextStep('🍗 뭐 먹지?', 'food') + '</div>';
  }

  function listCard(title, items, emptyMsg, nextLabel, nextTab, renderItem) {
    let html = '<div class="card"><h2>' + R.esc(title) + '</h2>';
    html += (items && items.length)
      ? items.map(renderItem).join('')
      : R.emptyBox(emptyMsg);
    html += nextStep(nextLabel, nextTab) + '</div>';
    return html;
  }

  async function renderPanel() {
    const el = document.getElementById('panel');
    if (activeTab === 'seats') { el.innerHTML = renderSeats(); return; }
    if (activeTab === 'view')  { el.innerHTML = renderView(); return; }

    if (activeTab === 'food') {
      const items = await window.KboData.foods(stadium.id);
      window.KboAnalytics.track('food_view', { stadium: stadium.id });
      el.innerHTML = listCard('🍗 먹거리', items, '먹거리 정보 준비 중입니다.', '🧢 굿즈 어디 있지?', 'shop',
        (f) => '<div class="rank"><b>' + R.textOr(f.storeName) + '</b> · ' + R.textOr(f.location) + '</div>');
      return;
    }
    if (activeTab === 'shop') {
      const items = await window.KboData.shops(stadium.id);
      window.KboAnalytics.track('shop_view', { stadium: stadium.id });
      el.innerHTML = listCard('🧢 굿즈샵', items, '굿즈샵 정보 준비 중입니다.', '🚻 화장실 어디지?', 'facility',
        (s) => '<div class="rank"><b>' + R.textOr(s.name) + '</b> · ' + R.textOr(s.location) + '</div>');
      return;
    }
    if (activeTab === 'facility') {
      const items = await window.KboData.facilities(stadium.id);
      window.KboAnalytics.track('facility_view', { stadium: stadium.id });
      el.innerHTML = listCard('🚻 편의시설', items, '편의시설 정보 준비 중입니다.', '🚇 어떻게 가지?', 'transport',
        (f) => '<div class="rank"><b>' + R.textOr(f.name) + '</b> · ' + R.textOr(f.location) + '</div>');
      return;
    }
    if (activeTab === 'transport') {
      const t = await window.KboData.transport(stadium.id);
      window.KboAnalytics.track('transport_view', { stadium: stadium.id });
      const rows = [
        ['🚇 지하철', t && t.subway],
        ['🚌 버스', t && t.bus],
        ['🅿️ 주차', t && t.parking && t.parking.verified ? t.parking.spaces + '대' : null],
        ['🚶 출입구', t && t.entrance]
      ];
      el.innerHTML = '<div class="card"><h2>🚇 교통</h2><ul class="scores">' +
        rows.map((r) => '<li><span>' + R.esc(r[0]) + '</span><span>' + R.textOr(r[1]) + '</span></li>').join('') +
        '</ul><p class="meta">검증되지 않은 정보는 표시하지 않습니다.</p>' +
        nextStep('⭐ 명당 다시 보기', 'seats') + '</div>';
      return;
    }
  }

  /* ---------- 예매 · 공유 ---------- */
  function wireCta() {
    const ticket = document.getElementById('ticket-btn');
    const t = stadium.ticket;
    if (t && t.url) {
      ticket.href = t.url;
      ticket.target = '_blank';
      ticket.rel = 'noopener';
      ticket.textContent = '🎟️ ' + (t.official ? '공식 ' : '') + '예매하기';
      ticket.addEventListener('click', () =>
        window.KboAnalytics.track('ticket_click', { stadium: stadium.id }));
    } else {
      ticket.removeAttribute('href');
      ticket.setAttribute('aria-disabled', 'true');
      ticket.classList.add('btn-ghost');
      ticket.classList.remove('btn-primary');
      ticket.textContent = '공식 예매 정보 준비 중';
    }

    document.getElementById('share-btn').addEventListener('click', () => {
      const text = CFG.shareCopy.stadium(stadium.name);
      window.KboShare.share(text, window.KboShare.currentUrl({ tab: activeTab }));
      window.KboAnalytics.track('seat_share', { stadium: stadium.id, tab: activeTab });
    });
  }

  function renderMeta() {
    document.getElementById('stadium-meta').innerHTML =
      '<div class="card"><h2>구장 정보</h2><ul class="scores">' +
      [['주소', stadium.address], ['개장', stadium.openedYear],
       ['좌석 수', stadium.verified.capacity ? stadium.capacity : null]]
        .map((r) => '<li><span>' + r[0] + '</span><span>' + R.textOr(r[1]) + '</span></li>').join('') +
      '</ul>' + R.meta(stadium.updatedAt, stadium.sources) + '</div>';
  }

  (async function init() {
    const id = q.get('id');
    try {
      stadium = await window.KboData.stadium(id);
    } catch (e) { stadium = null; }

    if (!stadium) {
      document.getElementById('stadium-name').textContent = '구장을 찾을 수 없습니다';
      document.getElementById('panel').innerHTML =
        R.emptyBox('구장 정보를 불러오지 못했습니다.') +
        '<p style="text-align:center"><a class="btn" href="./">홈으로</a></p>';
      return;
    }

    document.title = stadium.name + ' 좌석 명당 | 시야·날씨·예매·먹거리 — KBO 명당지도';
    document.getElementById('stadium-name').textContent = stadium.name;
    window.KboAnalytics.track('stadium_view', { stadium: stadium.id });

    try { seatData = await window.KboData.seats(stadium.id); } catch (e) {}

    syncUrl();
    renderTabs();
    renderPanel();
    renderMeta();
    wireCta();
    renderGame();
    renderWeather();
  })();
})();
