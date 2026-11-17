// 절기(節氣) 계산 — 태양 황경이 15°씩 넘어가는 순간을 직접 구한다.
//
// 왜 직접 짰나 (2026-11-17).
// 대운 시작 나이(대운수)는 태어난 때에서 가장 가까운 절(節)까지의 날수를 3으로 나눈
// 값이다. 그래서 절기 시각이 필요한데, 처음엔 "절기 표가 lunar 라이브러리 안에만
// 있고 그 CDN이 막혀 있어 못 돌려봤다"고 적었다. 효성님이 두 번 짚었다 —
//
//   "사주명식을 못 읽는다고? 그런 게 어디 있어 읽어라"
//   "그게 안 맞으면 신뢰도가 매우 떨어진다"
//   "검산이 안 되면 안 띄운다가 아니라, 검산이 되게 해라"
//
// 셋 다 맞는 말이었다. 절기는 **천문 계산**이지 누가 적어둔 표가 아니다.
// 태양의 겉보기 황경이 315°가 되는 순간이 입춘이고, 거기서 30°마다 다음 절이다.
//
// ⚠️ 처음에 Meeus 저정밀 해(25장)로 짰더니 **6~10분이 틀렸다.** 하루가 갈리는
//    해가 생긴다(2023 하지는 실제 23:58 KST인데 00:04로 나와 날짜가 밀렸다).
//    원인이 둘이었다 —
//      1. **ΔT 보정이 아예 없었다.** 천문 공식은 역학시(TT)를 쓰는데 세계시(UT)를
//         그대로 넣고 있었다. 지금 ΔT는 약 69초다.
//      2. 저정밀 급수의 한계가 약 0.01°(=약 15분)다.
//    그래서 **VSOP87D 지구 황경 급수**(1초각 수준)와 **ΔT 다항식**(Espenak–Meeus)을
//    넣었다. 지금은 공표값과 **1분 안쪽**으로 맞는다.
//
// ⚠️ **검산이 통과해야 쓴다.** `scripts/check-solar-terms.mjs` 가 공표된
//    분점·지점 시각과 분 단위로 맞춰보고, 1900~2100 전 구간에서 열두 절이
//    제 날짜 범위에 드는지, 순서와 간격이 맞는지, 대운수가 1~10에 드는지를 본다.
// ⚠️ 시각은 **한국 표준시(UTC+9)** 로 돌려준다. 사주가 쓰는 값이 그것이다.
(() => {
  'use strict';

  const RAD = Math.PI / 180;
  const KST = 9 / 24;

  // ---------- 율리우스일 ----------
  function toJD(y, m, d, hourFloat) {
    let yy = y; let mm = m;
    if (mm <= 2) { yy -= 1; mm += 12; }
    const A = Math.floor(yy / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1))
      + d + B - 1524.5 + (hourFloat || 0) / 24;
  }

  function fromJD(jd) {
    const z = Math.floor(jd + 0.5);
    const f = jd + 0.5 - z;
    let a = z;
    if (z >= 2299161) {
      const alpha = Math.floor((z - 1867216.25) / 36524.25);
      a = z + 1 + alpha - Math.floor(alpha / 4);
    }
    const b = a + 1524;
    const c = Math.floor((b - 122.1) / 365.25);
    const dd = Math.floor(365.25 * c);
    const e = Math.floor((b - dd) / 30.6001);
    const day = b - dd - Math.floor(30.6001 * e) + f;
    const month = e < 14 ? e - 1 : e - 13;
    const year = month > 2 ? c - 4716 : c - 4715;
    const dayInt = Math.floor(day);
    return { y: year, m: month, d: dayInt, hour: (day - dayInt) * 24 };
  }

  // ---------- ΔT (TT - UT), 초 ----------
  // Espenak & Meeus 다항식. 1900~2150을 덮는다.
  // 없으면 1~2분이 틀어지고, 그 때문에 날짜가 하루 밀리는 해가 생긴다.
  function deltaT(year) {
    let t;
    if (year < 1900) { t = year - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174; }
    if (year < 1920) { t = year - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
    if (year < 1941) { t = year - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t ** 3; }
    if (year < 1961) { t = year - 1950; return 29.07 + 0.407 * t - t * t / 233 + t ** 3 / 2547; }
    if (year < 1986) { t = year - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718; }
    if (year < 2005) { t = year - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
    if (year < 2050) { t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
    if (year < 2150) { return -20 + 32 * ((year - 1820) / 100) ** 2 - 0.5628 * (2150 - year); }
    t = (year - 1820) / 100; return -20 + 32 * t * t;
  }

  // ---------- VSOP87D 지구 황경 (A, B, C) ----------
  // 항은 A*cos(B + C*τ), τ = J2000 기준 율리우스 천년(TT).
  // 1초각 수준까지 남긴 절단본이다.
  const EARTH_L = [
    // L0
    [[175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517],
      [3497, 2.7441, 5753.3849], [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715],
      [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097], [1324, 0.7425, 11506.7698],
      [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
      [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694],
      [753, 2.533, 5507.553], [505, 4.583, 18849.228], [492, 4.205, 775.523],
      [357, 2.92, 0.067], [317, 5.849, 11790.629], [284, 1.899, 796.298],
      [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314],
      [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299],
      [132, 3.411, 2942.463], [126, 1.083, 20.775], [115, 0.645, 0.98],
      [103, 0.636, 4694.003], [102, 0.976, 15720.839], [102, 4.267, 7.114],
      [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69],
      [85, 1.3, 6275.96], [85, 3.67, 71430.7], [80, 1.81, 17260.15],
      [79, 3.04, 12036.46], [75, 1.76, 5088.63], [74, 3.5, 3154.69],
      [74, 4.68, 801.82], [70, 0.83, 9437.76], [62, 3.98, 8827.39],
      [61, 1.82, 7084.9], [57, 2.78, 6286.6], [56, 4.39, 14143.5],
      [56, 3.47, 6279.55], [52, 0.19, 12139.55], [52, 1.33, 1748.02],
      [51, 0.28, 5856.48], [49, 0.49, 1194.45], [41, 5.37, 8429.24],
      [41, 2.4, 19651.05], [39, 6.17, 10447.39], [37, 6.04, 10213.29],
      [37, 2.57, 1059.38], [36, 1.71, 2352.87], [36, 1.78, 6812.77],
      [33, 0.59, 17789.85], [30, 0.44, 83996.85], [30, 2.74, 1349.87],
      [25, 3.16, 4690.48]],
    // L1
    [[628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517],
      [425, 1.59, 3.523], [119, 5.796, 26.298], [109, 2.966, 1577.344],
      [93, 2.59, 18849.23], [72, 1.14, 529.69], [68, 1.87, 398.15],
      [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42],
      [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11],
      [21, 5.34, 0.98], [19, 1.85, 5486.78], [19, 4.97, 213.3],
      [17, 2.99, 6275.96], [16, 0.03, 2544.31], [16, 1.43, 2146.17],
      [15, 1.21, 10977.08], [12, 2.83, 1748.02], [12, 3.26, 5088.63],
      [12, 5.27, 1194.45], [12, 2.08, 4694], [11, 0.77, 553.57],
      [10, 1.3, 6286.6], [10, 4.24, 1349.87], [9, 2.7, 242.73],
      [9, 5.64, 951.72], [8, 5.3, 2352.87], [6, 2.65, 9437.76], [6, 4.67, 4690.48]],
    // L2
    [[52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152],
      [27, 0.05, 3.52], [16, 5.19, 26.3], [16, 3.68, 155.42],
      [10, 0.76, 18849.23], [9, 2.06, 77713.77], [7, 0.83, 775.52],
      [5, 4.66, 1577.34], [4, 1.03, 7.11], [4, 3.44, 5573.14],
      [3, 5.14, 796.3], [3, 6.05, 5507.55], [3, 1.19, 242.73],
      [3, 6.12, 529.69], [3, 0.31, 398.15], [3, 2.28, 553.57],
      [2, 4.38, 5223.69], [2, 3.75, 0.98]],
    // L3
    [[289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15], [3, 5.2, 155.42],
      [1, 4.72, 3.52], [1, 5.3, 18849.23], [1, 5.97, 242.73]],
    // L4
    [[114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15]],
    // L5
    [[1, 3.14, 0]],
  ];

  // 지구–태양 거리 R (AU). 광행차 보정에 쓴다.
  const EARTH_R = [
    [[100013989, 0, 0], [1670700, 3.0984635, 6283.07585], [13956, 3.05525, 12566.1517],
      [3084, 5.1985, 77713.7715], [1628, 1.1739, 5753.3849], [1576, 2.8469, 7860.4194],
      [925, 5.453, 11506.77], [542, 4.564, 3930.21], [472, 3.661, 5884.927],
      [346, 0.964, 5507.553], [329, 5.9, 5223.694], [307, 0.299, 5573.143],
      [243, 4.273, 11790.629], [212, 5.847, 1577.344], [186, 5.022, 10977.079],
      [175, 3.012, 18849.228], [110, 5.055, 5486.778], [98, 0.89, 6069.78],
      [86, 5.69, 15720.84], [86, 1.27, 161000.69], [65, 0.27, 17260.15],
      [63, 0.92, 529.69], [57, 2.01, 83996.85], [56, 5.24, 71430.7],
      [49, 3.25, 2544.31], [47, 2.58, 775.52], [45, 5.54, 9437.76],
      [43, 6.01, 6275.96], [39, 5.36, 4694], [38, 2.39, 8827.39],
      [37, 0.83, 19651.05], [37, 4.9, 12139.55], [36, 1.67, 12036.46],
      [35, 1.84, 2942.46], [33, 0.24, 7084.9], [32, 0.18, 5088.63],
      [32, 1.78, 398.15], [28, 1.21, 6286.6], [28, 1.9, 6279.55], [26, 4.59, 10447.39]],
    [[103019, 1.10749, 6283.07585], [1721, 1.0644, 12566.1517], [702, 3.142, 0],
      [32, 1.02, 18849.23], [31, 2.84, 5507.55], [25, 1.32, 5223.69],
      [18, 1.42, 1577.34], [10, 5.91, 10977.08], [9, 1.42, 6275.96], [9, 0.27, 5486.78]],
    [[4359, 5.7846, 6283.0758], [124, 5.579, 12566.152], [12, 3.14, 0],
      [9, 3.63, 77713.77], [6, 1.87, 5573.14], [3, 5.47, 18849.23]],
    [[145, 4.273, 6283.076], [7, 3.92, 12566.15]],
    [[4, 2.56, 6283.08]],
  ];

  function vsopSum(series, tau) {
    let total = 0;
    for (let i = series.length - 1; i >= 0; i--) {
      let s = 0;
      for (const [A, B, C] of series[i]) s += A * Math.cos(B + C * tau);
      total = total * tau + s;
    }
    return total / 1e8;
  }

  const norm360 = (x) => ((x % 360) + 360) % 360;

  // ---------- 태양의 겉보기 황경 (도) ----------
  // 인자는 **역학시(TT) 기준 율리우스일**이다.
  function apparentSolarLongitude(jdTT) {
    const tau = (jdTT - 2451545.0) / 365250.0;
    const L = vsopSum(EARTH_L, tau);            // 지구 황경 (라디안)
    const R = vsopSum(EARTH_R, tau);            // 거리 (AU)
    // 지구에서 본 태양 = 지구 황경 + 180°
    let theta = norm360(L / RAD + 180);

    // VSOP87 → FK5 보정
    const T = (jdTT - 2451545.0) / 36525.0;
    const lambdaP = theta - 1.397 * T - 0.00031 * T * T;
    theta += (-0.09033 / 3600);
    // (위도 항은 황경 보정에 0.03916*(cos-sin)*tanβ 로 들어가는데, 태양의 β가
    //  1초각 미만이라 여기서는 무시해도 1초각 안쪽이다.)
    void lambdaP;

    // 장동(황경) — Meeus 22장 주요항
    const omega = (125.04452 - 1934.136261 * T + 0.0020708 * T * T + T ** 3 / 450000) * RAD;
    const Lsun = (280.4665 + 36000.7698 * T) * RAD;
    const Lmoon = (218.3165 + 481267.8813 * T) * RAD;
    const dPsiArcsec = -17.20 * Math.sin(omega) - 1.32 * Math.sin(2 * Lsun)
      - 0.23 * Math.sin(2 * Lmoon) + 0.21 * Math.sin(2 * omega);

    // 광행차
    const aberrationArcsec = -20.4898 / R;

    return norm360(theta + (dPsiArcsec + aberrationArcsec) / 3600);
  }

  // UT 기준 율리우스일을 넣으면 ΔT를 더해 TT로 바꿔 계산한다.
  function apparentSolarLongitudeUT(jdUT) {
    const { y } = fromJD(jdUT);
    return apparentSolarLongitude(jdUT + deltaT(y) / 86400);
  }

  // ---------- 황경이 target 이 되는 순간 (UT 기준 JD) ----------
  function diffTo(jdUT, target) {
    let d = apparentSolarLongitudeUT(jdUT) - target;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  // 하루씩 365번 훑으면 한 번 구하는 데 수백 번 계산이 든다. 화면 한 장에 절기를
  // 36개 구하므로 그대로 두면 폰에서 눈에 띄게 멈칫한다(테스트가 2분을 넘겨 알았다).
  // 태양은 하루에 약 0.9856도를 가므로, **남은 각도로 날짜를 먼저 어림잡고**
  // 그 둘레만 훑는다. 계산 횟수가 1/20 로 준다.
  const DEG_PER_DAY = 360 / 365.2422;

  function solveLongitude(startJD, target) {
    // 1) 시작점에서 target 까지 남은 각도로 건너뛸 날수를 어림한다.
    // ⚠️ 남은 각도를 **앞으로만** 접으면 안 된다. 어림한 자리가 목표를 조금
    //    지나쳤을 때 gap 이 359.x 가 되어 **거의 한 바퀴(1년)를 더 건너뛴다.**
    //    실제로 그래서 2023 하지가 2024 하지로 나왔다. ±180 으로 접어
    //    지나쳤으면 뒤로 조금 물러나게 한다.
    let guess = startJD;
    // 첫 걸음만 앞으로 간다 — startJD 는 "여기서부터 처음 오는 것"을 찾는 자리라
    // 뒤로 물러나면 지난해 것을 집는다.
    let gap0 = target - apparentSolarLongitudeUT(guess);
    while (gap0 < 0) gap0 += 360;
    while (gap0 >= 360) gap0 -= 360;
    guess += gap0 / DEG_PER_DAY;
    // 그다음은 가까운 쪽으로 다듬는다.
    for (let i = 0; i < 3; i++) {
      let gap = target - apparentSolarLongitudeUT(guess);
      while (gap > 180) gap -= 360;
      while (gap <= -180) gap += 360;
      if (Math.abs(gap) < 0.2) break;
      guess += gap / DEG_PER_DAY;
    }
    // 2) 어림한 자리 앞뒤로만 하루 단위로 훑어 구간을 잡는다.
    let lo = guess - 3;
    let dLo = diffTo(lo, target);
    for (let i = 1; i <= 8; i++) {
      const hi = lo + 1;
      const dHi = diffTo(hi, target);
      if (dLo < 0 && dHi >= 0) {
        let a = lo; let b = hi;
        for (let k = 0; k < 50; k++) {
          const mid = (a + b) / 2;
          if (diffTo(mid, target) < 0) a = mid; else b = mid;
        }
        return (a + b) / 2;
      }
      lo = hi; dLo = dHi;
    }
    // 3) 어림이 빗나간 드문 경우에만 예전처럼 한 해를 훑는다.
    lo = startJD;
    dLo = diffTo(lo, target);
    for (let i = 1; i <= 400; i++) {
      const hi = startJD + i;
      const dHi = diffTo(hi, target);
      if (dLo < 0 && dHi >= 0) {
        let a = lo; let b = hi;
        for (let k = 0; k < 50; k++) {
          const mid = (a + b) / 2;
          if (diffTo(mid, target) < 0) a = mid; else b = mid;
        }
        return (a + b) / 2;
      }
      lo = hi; dLo = dHi;
    }
    return null;
  }

  // ---------- 열두 절(節) ----------
  // 사주의 달을 가르는 것은 24절기 중 '절' 열두 개다('중기'는 달 안쪽에 온다).
  const MAJOR_TERMS = [
    { ko: '입춘', deg: 315 }, { ko: '경칩', deg: 345 }, { ko: '청명', deg: 15 },
    { ko: '입하', deg: 45 }, { ko: '망종', deg: 75 }, { ko: '소서', deg: 105 },
    { ko: '입추', deg: 135 }, { ko: '백로', deg: 165 }, { ko: '한로', deg: 195 },
    { ko: '입동', deg: 225 }, { ko: '대설', deg: 255 }, { ko: '소한', deg: 285 },
  ];

  const ALL_TERMS = [
    { ko: '소한', deg: 285 }, { ko: '대한', deg: 300 }, { ko: '입춘', deg: 315 }, { ko: '우수', deg: 330 },
    { ko: '경칩', deg: 345 }, { ko: '춘분', deg: 0 }, { ko: '청명', deg: 15 }, { ko: '곡우', deg: 30 },
    { ko: '입하', deg: 45 }, { ko: '소만', deg: 60 }, { ko: '망종', deg: 75 }, { ko: '하지', deg: 90 },
    { ko: '소서', deg: 105 }, { ko: '대서', deg: 120 }, { ko: '입추', deg: 135 }, { ko: '처서', deg: 150 },
    { ko: '백로', deg: 165 }, { ko: '추분', deg: 180 }, { ko: '한로', deg: 195 }, { ko: '상강', deg: 210 },
    { ko: '입동', deg: 225 }, { ko: '소설', deg: 240 }, { ko: '대설', deg: 255 }, { ko: '동지', deg: 270 },
  ];

  // 같은 해·같은 절기를 여러 번 묻는다(이웃 절 찾기가 3년 × 12절을 본다).
  // 한 번 구한 것은 들고 있는다 — 같은 입력이면 늘 같은 값이라 캐시가 안전하다.
  const termCache = new Map();

  // 어떤 해의 특정 절기 순간. 결과의 y/m/d/hour 는 **한국 시각**이다.
  function termOfYear(year, deg) {
    const key = `${year}:${deg}`;
    if (termCache.has(key)) return termCache.get(key);
    const r = computeTermOfYear(year, deg);
    termCache.set(key, r);
    return r;
  }

  function computeTermOfYear(year, deg) {
    const start = toJD(year, 1, 1, 0) - 2;
    const jd = solveLongitude(start, deg);
    if (jd == null) return null;
    const kst = fromJD(jd + KST);
    if (kst.y !== year) {
      const jd2 = solveLongitude(jd + 1, deg);
      if (jd2 == null) return Object.assign(kst, { jd, deg });
      const kst2 = fromJD(jd2 + KST);
      return kst2.y === year ? Object.assign(kst2, { jd: jd2, deg }) : Object.assign(kst, { jd, deg });
    }
    return Object.assign(kst, { jd, deg });
  }

  // 어느 순간(UT 기준 JD)의 지난 절 / 다음 절.
  function neighborMajorTerms(jdUT) {
    const kst = fromJD(jdUT + KST);
    const list = [];
    for (const y of [kst.y - 1, kst.y, kst.y + 1]) {
      for (const t of MAJOR_TERMS) {
        const r = termOfYear(y, t.deg);
        if (r) list.push({ ko: t.ko, jd: r.jd, y: r.y, m: r.m, d: r.d, hour: r.hour });
      }
    }
    list.sort((a, b) => a.jd - b.jd);
    let prev = null; let next = null;
    for (const t of list) {
      if (t.jd <= jdUT) prev = t;
      else { next = t; break; }
    }
    return { prev, next };
  }

  // ---------- 대운수 ----------
  // 순행이면 태어난 때부터 **다음 절**까지, 역행이면 **지난 절**까지의 날수를
  // 3으로 나눈다(3일 = 1년). 반올림하고, 1~10 안에 든다.
  // birth 는 **한국 시각** {y, m, d, hour}.
  function daeunStartAge(birth, forward) {
    if (!birth || !birth.y) return null;
    const hour = birth.hour == null ? 12 : birth.hour;
    const jdUT = toJD(birth.y, birth.m, birth.d, hour) - KST;
    const { prev, next } = neighborMajorTerms(jdUT);
    const edge = forward ? next : prev;
    if (!edge) return null;
    const days = Math.abs(edge.jd - jdUT);
    const age = Math.round(days / 3);
    if (!Number.isFinite(age)) return null;
    return Math.min(10, Math.max(1, age));
  }

  // 대운수를 낸 근거까지 같이 돌려준다. 화면이 "무슨 절까지 며칠"을 말할 수 있게.
  function daeunStartDetail(birth, forward) {
    if (!birth || !birth.y) return null;
    const hour = birth.hour == null ? 12 : birth.hour;
    const jdUT = toJD(birth.y, birth.m, birth.d, hour) - KST;
    const { prev, next } = neighborMajorTerms(jdUT);
    const edge = forward ? next : prev;
    if (!edge) return null;
    const days = Math.abs(edge.jd - jdUT);
    return {
      age: Math.min(10, Math.max(1, Math.round(days / 3))),
      termKo: edge.ko,
      termY: edge.y, termM: edge.m, termD: edge.d,
      days: Math.round(days * 10) / 10,
      forward: !!forward,
    };
  }

  window.MaumjaroSolarTerms = {
    toJD, fromJD, deltaT,
    apparentSolarLongitude, apparentSolarLongitudeUT, solveLongitude,
    termOfYear, neighborMajorTerms, daeunStartAge, daeunStartDetail,
    MAJOR_TERMS, ALL_TERMS,
  };
})();
