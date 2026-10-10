/* 홈 화면. 첫 화면의 질문은 하나다 — "오늘 어디서 야구하지 / 어디에 앉을까?" */
(function () {
  const R = window.KboRender;
  const PREF_KEY = 'kbo:prefs';
  let stadiums = [];
  let selected = [];

  /* ---------- 오늘 경기 ---------- */
  async function renderTodayGames() {
    const el = document.getElementById('today-games');
    try {
      const [games, codes] = await Promise.all([
        window.KboGames.todays(),
        window.KboGames.statusCodes()
      ]);
      if (!games.length) {
        el.innerHTML = R.emptyBox('오늘 경기 정보가 아직 등록되지 않았습니다.') +
          '<p class="meta"><a href="' + R.esc(window.KBO_CONFIG.officialStatusUrl) +
          '" target="_blank" rel="noopener">KBO 공식 일정에서 확인하기 ›</a></p>';
        return;
      }
      el.innerHTML = games.map((g) => {
        const st = window.KboGames.statusOf(g, codes);
        const stadium = stadiums.find((s) => s.id === g.stadiumId);
        return '<div class="card game-card">' +
          '<div style="flex:1">' +
            '<div class="teams">' + R.textOr(g.awayName) + ' vs ' + R.textOr(g.homeName) + '</div>' +
            '<div class="where">' + R.textOr(stadium && stadium.name) + ' · ' + R.textOr(g.time) + '</div>' +
            '<div style="margin-top:8px"><span class="badge">' + R.esc(st.emoji) + ' ' + R.esc(st.label) + '</span></div>' +
          '</div>' +
          '<a class="btn" href="stadium.html?id=' + encodeURIComponent(g.stadiumId) + '">경기 보기</a>' +
        '</div>';
      }).join('');
    } catch (e) {
      el.innerHTML = R.emptyBox('경기 정보를 불러오지 못했습니다.');
    }
  }

  /* ---------- 구장 목록 ---------- */
  function renderStadiums() {
    const el = document.getElementById('stadium-list');
    if (!stadiums.length) { el.innerHTML = R.emptyBox('구장 정보를 불러오지 못했습니다.'); return; }
    el.innerHTML = stadiums.map((s) =>
      '<a class="chip" href="stadium.html?id=' + encodeURIComponent(s.id) + '">' +
      R.esc(s.shortName || s.name) + '</a>'
    ).join('');
  }

  /* ---------- 취향 선택 ---------- */
  function renderPrefs() {
    const el = document.getElementById('pref-chips');
    el.innerHTML = window.KboRecommend.PREFS.map((p) =>
      '<button class="chip" type="button" data-pref="' + p.id + '" aria-pressed="false">' +
      p.emoji + ' ' + R.esc(p.label) + '</button>'
    ).join('');
    el.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-pref]');
      if (!btn) return;
      const id = btn.dataset.pref;
      const on = selected.includes(id);
      selected = on ? selected.filter((x) => x !== id) : selected.concat(id);
      btn.setAttribute('aria-pressed', String(!on));
      save();
      updateCta();
    });
  }

  function save() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(selected)); } catch (e) {}
  }
  function restore() {
    try { selected = JSON.parse(localStorage.getItem(PREF_KEY) || '[]') || []; } catch (e) { selected = []; }
    selected.forEach((id) => {
      const b = document.querySelector('[data-pref="' + id + '"]');
      if (b) b.setAttribute('aria-pressed', 'true');
    });
  }

  /* 선택만 하고 끝나지 않게, 항상 구장 화면으로 이어준다. */
  function updateCta() {
    const cta = document.getElementById('home-cta');
    const link = document.getElementById('home-cta-link');
    const hint = document.getElementById('pref-hint');
    if (!selected.length) {
      cta.hidden = true;
      hint.textContent = '선택하면 구장별 추천 좌석을 바로 보여드려요.';
      return;
    }
    const target = stadiums[0];
    if (!target) { cta.hidden = true; return; }
    const labels = selected
      .map((id) => (window.KboRecommend.PREFS.find((p) => p.id === id) || {}).label)
      .filter(Boolean).join(' · ');
    hint.textContent = labels + ' 기준으로 추천합니다.';
    link.href = 'stadium.html?id=' + encodeURIComponent(target.id) +
                '&tab=seats&prefs=' + encodeURIComponent(selected.join(','));
    link.textContent = (target.shortName || target.name) + ' 명당 보러가기 ›';
    cta.hidden = false;
    window.KboAnalytics.track('seat_recommend', { prefs: selected.join(',') });
  }

  (async function init() {
    try { stadiums = await window.KboData.stadiums(); } catch (e) { stadiums = []; }
    renderStadiums();
    renderPrefs();
    restore();
    updateCta();
    renderTodayGames();
  })();
})();
