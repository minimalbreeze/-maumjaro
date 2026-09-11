/* data/*.json을 읽고 메모리에 캐시한다.
   같은 파일을 화면 이동마다 다시 받지 않는다(지시서 48번). */
(function () {
  const cache = {};
  const cfg = window.KBO_CONFIG;

  async function load(file) {
    if (cache[file]) return cache[file];
    cache[file] = fetch(cfg.dataDir + file)
      .then((r) => {
        if (!r.ok) throw new Error(file + ' ' + r.status);
        return r.json();
      })
      .catch((e) => {
        delete cache[file];                        // 실패는 캐시하지 않는다(다음에 다시 시도)
        throw e;
      });
    return cache[file];
  }

  async function stadiums() { return (await load('stadiums.json')).stadiums; }

  async function stadium(id) {
    return (await stadiums()).find((s) => s.id === id) || null;
  }

  async function teams() { return (await load('teams.json')).teams; }

  async function team(id) { return (await teams()).find((t) => t.id === id) || null; }

  async function seats(stadiumId) {
    const d = await load('seats.json');
    const s = d.stadiums[stadiumId];
    return {
      scoreFields: d.scoreFields,
      seatTypes: (s && s.seatTypes) || [],
      sections: (s && s.sections) || []
    };
  }

  async function byStadium(file, stadiumId) {
    const d = await load(file);
    return (d.stadiums && d.stadiums[stadiumId]) || null;
  }

  window.KboData = {
    load, stadiums, stadium, teams, team, seats,
    foods:      (id) => byStadium('foods.json', id),
    shops:      (id) => byStadium('shops.json', id),
    facilities: (id) => byStadium('facilities.json', id),
    transport:  (id) => byStadium('transport.json', id),
    games:      () => load('games.json')
  };
})();
