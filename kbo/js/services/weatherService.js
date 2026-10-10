/* 날씨 서비스 — UI가 특정 API에 종속되지 않게 한 겹 감싼다(지시서 46번).
   provider를 바꿔도 normalize()가 돌려주는 모양은 그대로다. */
(function () {
  const cfg = window.KBO_CONFIG.weather;
  const CACHE_KEY = 'kbo:weather:';

  // Open-Meteo weather_code → 사람이 읽는 상태
  const CODE = {
    0: ['맑음', '☀️'], 1: ['대체로 맑음', '🌤️'], 2: ['구름 조금', '⛅'], 3: ['흐림', '☁️'],
    45: ['안개', '🌫️'], 48: ['안개', '🌫️'],
    51: ['이슬비', '🌦️'], 53: ['이슬비', '🌦️'], 55: ['이슬비', '🌦️'],
    61: ['비', '🌧️'], 63: ['비', '🌧️'], 65: ['강한 비', '🌧️'],
    71: ['눈', '🌨️'], 73: ['눈', '🌨️'], 75: ['많은 눈', '🌨️'],
    80: ['소나기', '🌦️'], 81: ['소나기', '🌦️'], 82: ['강한 소나기', '🌧️'],
    95: ['천둥번개', '⛈️'], 96: ['천둥번개', '⛈️'], 99: ['천둥번개', '⛈️']
  };
  const describe = (c) => CODE[c] || ['정보 없음', '❓'];

  /* 직관지수 — 이 서비스가 자체적으로 계산하는 참고 지표다.
     공식 경기 취소 확률이 아니며, 화면에서 반드시 그렇게 표기한다(지시서 12번). */
  function comfortIndex(w) {
    let score = 100;
    const reasons = [];
    const rain = w.rainProbability;
    if (rain != null) {
      if (rain >= 70)      { score -= 45; reasons.push('비 올 가능성이 높아요'); }
      else if (rain >= 40) { score -= 25; reasons.push('경기 전후 비 예보가 있어요'); }
      else if (rain >= 20) { score -= 10; reasons.push('약한 비 가능성이 있어요'); }
    }
    const t = w.feelsLike != null ? w.feelsLike : w.temperature;
    if (t != null) {
      if (t >= 33)      { score -= 25; reasons.push('더위에 주의하세요'); }
      else if (t >= 30) { score -= 12; reasons.push('다소 더워요'); }
      else if (t <= 5)  { score -= 20; reasons.push('많이 추워요'); }
      else if (t <= 12) { score -= 10; reasons.push('쌀쌀해요'); }
    }
    if (w.wind != null && w.wind >= 8) { score -= 10; reasons.push('바람이 강해요'); }
    score = Math.max(0, Math.min(100, Math.round(score)));

    let emoji = '☀️', line = '직관하기 좋은 날이에요.';
    if (score < 55)      { emoji = '🌧️'; line = reasons[0] ? reasons[0] + '.' : '직관 조건이 좋지 않아요.'; }
    else if (score < 75) { emoji = '⛅'; line = reasons[0] ? reasons[0] + '.' : '무난한 편이에요.'; }
    return { score, emoji, line, reasons };
  }

  function normalize(raw) {
    const cur = raw.current || {};
    const h = raw.hourly || {};
    const hourly = (h.time || []).map((t, i) => ({
      time: t,
      temperature: h.temperature_2m ? h.temperature_2m[i] : null,
      rainProbability: h.precipitation_probability ? h.precipitation_probability[i] : null,
      rainAmount: h.precipitation ? h.precipitation[i] : null,
      code: h.weather_code ? h.weather_code[i] : null
    }));
    const nowIdx = hourly.findIndex((x) => new Date(x.time) >= new Date());
    const next = nowIdx >= 0 ? hourly[nowIdx] : null;

    const w = {
      temperature: cur.temperature_2m != null ? Math.round(cur.temperature_2m) : null,
      feelsLike: cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : null,
      humidity: cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null,
      wind: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m * 10) / 10 : null,
      rainAmount: cur.precipitation != null ? cur.precipitation : null,
      rainProbability: next ? next.rainProbability : null,
      code: cur.weather_code != null ? cur.weather_code : null,
      hourly,
      observedAt: new Date().toISOString(),
      // 아직 연결하지 않은 항목. 값을 지어내지 않고 null로 둔다(지시서 50번).
      uv: null, airQuality: null, weatherAlert: null
    };
    const d = describe(w.code);
    w.condition = d[0];
    w.emoji = d[1];
    w.index = comfortIndex(w);
    return w;
  }

  /* 경기 시간 앞뒤의 시간대별 예보만 잘라 돌려준다(지시서 11번). */
  function aroundGameTime(weather, isoDateTime, before, after) {
    if (!weather || !isoDateTime) return [];
    const t = new Date(isoDateTime).getTime();
    const from = t - (before == null ? 2 : before) * 3600e3;
    const to = t + (after == null ? 2 : after) * 3600e3;
    return weather.hourly.filter((h) => {
      const x = new Date(h.time).getTime();
      return x >= from && x <= to;
    });
  }

  async function forStadium(stadium) {
    if (!stadium || !stadium.coordinates) throw new Error('구장 좌표 없음');
    const { lat, lng } = stadium.coordinates;
    const key = CACHE_KEY + stadium.id;

    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (hit && Date.now() - hit.at < cfg.cacheMinutes * 60e3) return hit.data;
    } catch (e) { /* 캐시를 못 읽어도 그냥 새로 받는다 */ }

    const qs = new URLSearchParams({
      latitude: lat, longitude: lng,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code',
      timezone: 'Asia/Seoul', forecast_days: '2'
    });
    const base = cfg.weatherProxyUrl || cfg.endpoint;
    const res = await fetch(base + '?' + qs.toString());
    if (!res.ok) throw new Error('weather ' + res.status);
    const data = normalize(await res.json());

    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch (e) {}
    return data;
  }

  window.KboWeather = { forStadium, aroundGameTime, comfortIndex, describe, normalize };
})();
