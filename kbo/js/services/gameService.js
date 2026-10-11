/* 경기 서비스.
   가장 중요한 규칙: 날씨로 경기 취소를 추론하지 않는다(지시서 13번).
   status가 없거나 모르면 'unknown'이고, 화면은 공식 발표 링크를 함께 보여준다. */
(function () {
  function ymd(d) {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  async function all() { return (await window.KboData.games()).games || []; }

  async function statusCodes() { return (await window.KboData.games()).statusCodes; }

  function statusOf(game, codes) {
    const key = (game && game.status) || 'unknown';
    return codes[key] || codes.unknown;
  }

  async function todays() {
    const today = ymd(new Date());
    return (await all()).filter((g) => g.date === today);
  }

  async function forStadium(stadiumId, limit) {
    const today = ymd(new Date());
    const list = (await all())
      .filter((g) => g.stadiumId === stadiumId && g.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return limit ? list.slice(0, limit) : list;
  }

  async function nextAt(stadiumId) {
    return (await forStadium(stadiumId, 1))[0] || null;
  }

  window.KboGames = { all, todays, forStadium, nextAt, statusCodes, statusOf, ymd };
})();
