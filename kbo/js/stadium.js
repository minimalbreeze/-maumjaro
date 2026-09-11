/* 구장 화면 — 지도가 곧 제품이다.
   URL: stadium.html?id=gwangju[&zone=k9][&prefs=focus,cheer]
   공유 링크를 열면 같은 구역 시트가 그대로 열려야 한다(지시서 34·74번). */
(function () {
  const R = window.KboRender;
  const CFG = window.KBO_CONFIG;
  const q = new URLSearchParams(location.search);

  let stadium = null, mapData = null, seatData = { sections: [], seatTypes: [] }, controller = null;
  let openedZone = null;   // 시트가 지금 보여주는 구역 (버튼 위임에서 쓴다)

  const sheet = () => document.getElementById('sheet');
  const body = () => document.getElementById('sheet-body');

  function openSheet(html, zone) {
    openedZone = zone || null;
    body().innerHTML = html;
    sheet().dataset.open = 'true';
    sheet().scrollTop = 0;
  }
  function closeSheet() {
    sheet().dataset.open = 'false';
    const u = new URL(location.href);
    u.searchParams.delete('zone');
    history.replaceState(null, '', u.toString());
  }

  const CONFIDENCE = {
    verified:     { badge: '✅ 확인됨',            cls: 'badge-ok' },
    corroborated: { badge: '🟡 확인 중',           cls: 'badge-warn' },
    unplaced:     { badge: '⚪ 위치 미확인',        cls: '' }
  };

  /* ---------- 구역 시트 ---------- */
  function openZone(zone) {
    const key = zone.verified ? 'verified' : (zone.confidence || 'unplaced');
    const c = CONFIDENCE[key];
    const section = seatData.sections.find((s) => s.section === zone.id || s.zoneId === zone.id);

    let html = '<h2>' + R.esc(zone.name) + '</h2>' +
      '<p><span class="badge ' + c.cls + '">' + R.esc(c.badge) + '</span></p>';

    if (!zone.verified) {
      const why = (zone.why || '').trim();
      html += '<p class="disclaimer">' + (why ? R.esc(why.replace(/[.]?$/, '.')) + ' ' : '') +
        '공식 좌석도로 확인한 뒤 정확한 블록 번호와 경계를 반영합니다.</p>';
    }

    // 평가 — 있으면 별점, 없으면 준비 중
    html += '<h3 style="margin-top:16px">좌석 평가</h3>';
    if (section) {
      html += '<ul class="scores">' + seatData.scoreFields.map((f) =>
        '<li><span>' + f.emoji + ' ' + R.esc(f.label) + '</span><span>' +
        R.stars(section[f.key]) + '</span></li>').join('') + '</ul>';
      if (section.description) html += '<p>' + R.esc(section.description) + '</p>';
    } else {
      html += R.emptyBox('이 구역의 평가가 아직 없습니다.');
    }
    html += '<p class="disclaimer">' + R.esc(CFG.scoreDisclaimer) + '</p>';

    // 시야
    html += '<h3 style="margin-top:16px">👀 이 자리에서 보기</h3>';
    if (section && section.viewImage) {
      html += '<img src="' + R.esc(section.viewImage) + '" alt="' + R.esc(zone.name) +
        ' 시야 사진" loading="lazy" style="width:100%;border-radius:12px" />';
      if (section.viewSource) html += '<p class="meta">촬영: ' + R.esc(section.viewSource) + '</p>';
    } else {
      html += R.emptyBox('현재 시야 자료 준비 중') +
        '<p class="meta">실제 촬영본만 씁니다. 생성 이미지를 실제 시야처럼 보여주지 않습니다.</p>';
    }

    // 가격
    html += '<h3 style="margin-top:16px">💰 가격</h3>';
    html += (section && section.price)
      ? '<p><b>' + R.textOr(section.price) + '</b></p>'
      : R.emptyBox('최신 가격 확인 필요');

    html += '<div class="sheet-actions">' +
      '<button class="btn btn-ghost" type="button" data-act="share">🔗 이 자리 공유</button>' +
      '<button class="btn btn-primary" type="button" data-act="report">📍 정보 제보</button>' +
      '</div>';

    openSheet(html, zone);

    const u = new URL(location.href);
    u.searchParams.set('zone', zone.id);
    history.replaceState(null, '', u.toString());

    openedZone = zone;
    window.KboAnalytics.track('seat_view', { stadium: stadium.id, zone: zone.id });
  }

  /* ---------- 제보 ----------
     불꽃축제 지도는 사용자 제보와 집단 검증으로 데이터를 채웠다.
     그 방식을 쓰려면 쓰기 가능한 백엔드가 필요하므로, 먼저 접수 창구만 연다.
     config.reportUrl이 비어 있으면 아직 준비 중이라고 정직하게 말한다. */
  function openReport(zone) {
    let html = '<h2>📍 정보 제보</h2>';
    if (zone) html += '<p class="meta">' + R.esc(zone.name) + '</p>';
    if (CFG.reportUrl) {
      html += '<p>이 구역의 시야 사진, 실제 가격, 앉아본 후기를 보내주시면 지도에 반영합니다.</p>' +
        '<p><a class="btn btn-primary btn-block" href="' + R.esc(CFG.reportUrl) +
        '" target="_blank" rel="noopener">제보하러 가기 ›</a></p>';
    } else {
      html += R.emptyBox('제보 창구 준비 중입니다.');
      html += '<p class="meta">제보받은 정보는 공식 정보와 구분해 "사용자 제보"로 표시하고, ' +
        '여러 명이 확인한 뒤에 "확인됨"으로 올립니다.</p>';
    }
    openSheet(html);
  }

  /* ---------- 오늘의 직관(경기 + 날씨 + 구장 정보) ---------- */
  async function openBriefing() {
    openSheet('<h2>오늘의 직관</h2><div class="empty">불러오는 중…</div>');
    const officialLink = '<a href="' + R.esc(CFG.officialStatusUrl) +
      '" target="_blank" rel="noopener">공식 일정·경기 상태 확인하기 ›</a>';

    let html = '<h2>오늘의 직관</h2>';

    // 경기 — 날씨로 취소를 추론하지 않는다.
    let game = null;
    try {
      const [g, codes] = await Promise.all([
        window.KboGames.nextAt(stadium.id), window.KboGames.statusCodes()
      ]);
      game = g;
      html += '<h3>⚾ 경기</h3>';
      if (game) {
        const st = window.KboGames.statusOf(game, codes);
        html += '<p><b>' + R.textOr(game.awayName) + ' vs ' + R.textOr(game.homeName) + '</b><br>' +
          R.textOr(game.date) + ' ' + R.textOr(game.time) + '</p>' +
          '<p><span class="badge">' + R.esc(st.emoji) + ' ' + R.esc(st.label) + '</span></p>';
      } else {
        html += R.emptyBox('등록된 경기 정보가 아직 없습니다.');
      }
      html += '<p class="meta">' + officialLink + '</p>';
    } catch (e) {
      html += '<h3>⚾ 경기</h3>' + R.emptyBox('경기 정보를 불러오지 못했습니다.');
    }

    // 날씨
    html += '<h3 style="margin-top:18px">🌤️ 직관 날씨</h3>';
    try {
      const w = await window.KboWeather.forStadium(stadium);
      const gameAt = game && game.date && game.time ? game.date + 'T' + game.time : null;
      const near = window.KboWeather.aroundGameTime(w, gameAt);
      const hours = near.length ? near : w.hourly.slice(0, 6);
      html += '<div class="weather-now"><span class="emoji">' + R.esc(w.emoji) + '</span>' +
        '<div><div class="temp">' + R.textOr(w.temperature, '℃') + '</div>' +
        '<div class="cond">' + R.esc(w.condition) + ' · 체감 ' + R.textOr(w.feelsLike, '℃') +
        ' · 바람 ' + R.textOr(w.wind, 'm/s') + '</div></div></div>' +
        '<div class="index-score">' + R.esc(w.index.emoji) + ' <b>직관지수 ' + w.index.score +
        '</b> <span class="cond">' + R.esc(w.index.line) + '</span></div>' +
        '<p class="meta" style="margin:12px 0 0">' +
          R.esc(near.length ? '경기 시간 전후 예보' : '앞으로의 예보') + '</p>' +
        '<div class="hourly">' + hours.map((h) =>
          '<div><div class="h">' + R.esc(String(h.time).slice(11, 16)) + '</div>' +
          '<div class="t">' + R.textOr(h.temperature != null ? Math.round(h.temperature) : null, '℃') + '</div>' +
          '<div class="p">💧' + R.textOr(h.rainProbability, '%') + '</div></div>').join('') + '</div>' +
        '<p class="disclaimer">' + R.esc(CFG.weatherDisclaimer) + '</p>';
      window.KboAnalytics.track('weather_view', { stadium: stadium.id });
    } catch (e) {
      html += R.emptyBox('현재 날씨 정보를 불러오지 못했습니다.');
    }

    // 구장 안의 것들
    const blocks = [
      ['🍗 먹거리', await safe(() => window.KboData.foods(stadium.id)), 'food_view', (x) => x.storeName],
      ['🧢 굿즈샵', await safe(() => window.KboData.shops(stadium.id)), 'shop_view', (x) => x.name],
      ['🚻 편의시설', await safe(() => window.KboData.facilities(stadium.id)), 'facility_view', (x) => x.name]
    ];
    blocks.forEach(([title, items, ev, pick]) => {
      html += '<h3 style="margin-top:18px">' + title + '</h3>';
      html += (items && items.length)
        ? '<ul class="scores">' + items.map((x) =>
            '<li><span>' + R.textOr(pick(x)) + '</span><span>' + R.textOr(x.location) + '</span></li>').join('') + '</ul>'
        : R.emptyBox('정보 준비 중');
      if (items && items.length) window.KboAnalytics.track(ev, { stadium: stadium.id });
    });

    // 교통
    const t = await safe(() => window.KboData.transport(stadium.id));
    html += '<h3 style="margin-top:18px">🚇 교통</h3><ul class="scores">' +
      [['지하철', t && t.subway], ['버스', t && t.bus],
       ['주차', t && t.parking && t.parking.verified ? t.parking.spaces + '대' : null],
       ['출입구', t && t.entrance]]
        .map((r) => '<li><span>' + r[0] + '</span><span>' + R.textOr(r[1]) + '</span></li>').join('') +
      '</ul><p class="meta">검증되지 않은 정보는 표시하지 않습니다.</p>';

    // 구장 기본정보
    html += '<h3 style="margin-top:18px">🏟️ 구장 정보</h3><ul class="scores">' +
      [['주소', stadium.address], ['개장', stadium.openedYear],
       ['좌석 수', stadium.verified.capacity ? stadium.capacity : null]]
        .map((r) => '<li><span>' + r[0] + '</span><span>' + R.textOr(r[1]) + '</span></li>').join('') +
      '</ul>' + R.meta(stadium.updatedAt, stadium.sources);

    // 예매 — 확인된 링크가 있을 때만 버튼이 산다.
    html += '<div class="sheet-actions">';
    html += (stadium.ticket && stadium.ticket.url)
      ? '<a class="btn btn-primary" href="' + R.esc(stadium.ticket.url) +
        '" target="_blank" rel="noopener" data-ticket="1">🎟️ 예매하기</a>'
      : '<button class="btn btn-ghost" type="button" disabled>공식 예매 정보 준비 중</button>';
    html += '</div>';

    openSheet(html);
    const tk = body().querySelector('[data-ticket]');
    if (tk) tk.addEventListener('click', () =>
      window.KboAnalytics.track('ticket_click', { stadium: stadium.id }));
  }

  async function safe(fn) { try { return await fn(); } catch (e) { return null; } }

  /* ---------- 헤더 날씨 칩 ---------- */
  async function fillWeatherChip() {
    const chip = document.getElementById('wx-chip');
    try {
      const w = await window.KboWeather.forStadium(stadium);
      chip.textContent = w.emoji + ' ' + (w.temperature != null ? w.temperature + '℃' : '') +
        ' · 직관지수 ' + w.index.score;
    } catch (e) {
      chip.textContent = '오늘의 직관 ›';
    }
  }

  (async function init() {
    const id = q.get('id');
    stadium = await safe(() => window.KboData.stadium(id));

    if (!stadium) {
      document.getElementById('stadium-name').textContent = '구장을 찾을 수 없습니다';
      openSheet('<h2>구장을 찾을 수 없습니다</h2>' +
        R.emptyBox('구장 정보를 불러오지 못했습니다.') +
        '<p><a class="btn btn-block" href="./">홈으로</a></p>');
      return;
    }

    document.title = stadium.name + ' 좌석 지도 | 시야·평가·가격 — KBO 명당지도';
    document.getElementById('stadium-name').textContent = stadium.name;
    window.KboAnalytics.track('stadium_view', { stadium: stadium.id });

    seatData = (await safe(() => window.KboData.seats(stadium.id))) || seatData;
    mapData = await safe(() => window.KboData.load('map/' + stadium.id + '.json'));

    const host = document.getElementById('seat-map');
    if (mapData) {
      controller = window.KboSeatMap.render(host, mapData, {
        onZone: openZone,
        onFacility: (f) => openSheet('<h2>' + R.esc(f.name) + '</h2>' +
          '<p>' + R.textOr(f.location) + '</p>')
      });
      // 개략도라는 사실은 범례 안에 둔다 — 화면 위에 떠다니는 글이 하나 줄고,
      // 신뢰도 설명과 같은 자리에 있어야 뜻이 통한다.
      if (mapData.schematic) {
        const note = document.createElement('div');
        note.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid #e7ecf4;color:#5d6a85';
        note.textContent = '등급 배치 개략도입니다.';
        document.getElementById('legend').appendChild(note);
      }
    } else {
      host.innerHTML = '<div style="color:#cdd8ea;display:grid;place-items:center;height:100%;padding:24px;text-align:center">' +
        '좌석 지도 준비 중입니다.</div>';
    }

    document.getElementById('sheet-close').addEventListener('click', closeSheet);

    // 시트 안 버튼은 위임으로 한 번만 연결한다.
    // (시트를 열 때마다 붙이면 리스너가 쌓여 공유가 여러 번 실행된다)
    body().addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || !openedZone) return;
      if (b.dataset.act === 'share') {
        window.KboShare.share(CFG.shareCopy.seat(stadium.name, openedZone.name), location.href);
        window.KboAnalytics.track('seat_share', { stadium: stadium.id, zone: openedZone.id });
      } else {
        openReport(openedZone);
      }
    });
    document.getElementById('reset-btn').addEventListener('click', () => controller && controller.reset());
    document.getElementById('report-btn').addEventListener('click', () => openReport(null));
    document.getElementById('wx-chip').addEventListener('click', openBriefing);

    fillWeatherChip();

    // 공유 링크로 들어온 경우 그 구역을 바로 연다.
    const z = q.get('zone');
    if (z && mapData) {
      const zone = mapData.zones.find((x) => x.id === z);
      if (zone) openZone(zone);
    }
  })();
})();
