// 절기 계산 검산 (node scripts/check-solar-terms.mjs)
//
// 왜 필요한가 (2026-11-17 효성님):
//   "그게 안 맞으면 신뢰도가 매우 떨어진다"
//   "검산이 안 되면 안 띄운다가 아니라, 검산이 되게 해라"
//
// 그래서 숨기지 않고 **맞는지를 분 단위로 확인**한다.
//
//  [1] 공표된 분점·지점 시각과 **분까지** 같은가
//  [2] 열두 절이 1900~2100 전 구간에서 제 날짜 범위에 드는가
//  [3] 절기가 순서대로, 약 30일 간격으로 오는가
//  [4] 해를 넘는 자리에서도 이웃 절을 바로 찾는가
//  [5] 대운수가 1~10에 들고, 순행+역행이 서로 보완하는가
//  [6] ΔT 보정이 실제로 들어가 있는가 (빼면 틀리는 것을 보인다)

import fs from 'fs';

const src = fs.readFileSync(new URL('../solar-terms.js', import.meta.url), 'utf8');
globalThis.window = {};
// eslint-disable-next-line no-eval
eval(src);
const T = globalThis.window.MaumjaroSolarTerms;

let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++) : (fail++, console.log('  ✗', n, e ?? '')); };
const head = (s) => console.log(`\n${s}`);
const hhmm = (r) => `${r.m}/${r.d} ${String(Math.floor(r.hour)).padStart(2, '0')}:${String(Math.round((r.hour % 1) * 60)).padStart(2, '0')}`;
// 공표값은 초를 반올림한 분이다. 우리 값도 분으로 끊으면 초 단위에서 1분 어긋날 수
// 있으므로(13:30:38 vs 13:31), **순간끼리 분 단위 차이**로 비교한다.
const minutesApart = (r, want) => {
  const [md, hm] = want.split(' ');
  const [m, d] = md.split('/').map(Number);
  const [H, M] = hm.split(':').map(Number);
  const wantJD = T.toJD(r.y, m, d, H + M / 60);
  const gotJD = T.toJD(r.y, r.m, r.d, r.hour);
  return Math.abs(gotJD - wantJD) * 24 * 60;
};
const degOf = (ko) => (T.ALL_TERMS.find((t) => t.ko === ko) || {}).deg;

// ---------------------------------------------------------------
head('[1] 공표된 분점·지점 시각과 분까지 같은가 (한국 시각)');
// 널리 공표되어 있는 값이다. 자정에 바짝 붙은 해(2023 하지 23:58, 2025 동지 00:03)를
// 일부러 넣었다 — 몇 분만 틀려도 날짜가 하루 밀리는 자리라서다.
const KNOWN = [
  [2020, '춘분', '3/20 12:50'], [2020, '하지', '6/21 06:44'], [2020, '추분', '9/22 22:31'], [2020, '동지', '12/21 19:02'],
  [2021, '춘분', '3/20 18:37'], [2021, '하지', '6/21 12:32'], [2021, '추분', '9/23 04:21'], [2021, '동지', '12/22 00:59'],
  [2022, '춘분', '3/21 00:33'], [2022, '하지', '6/21 18:14'], [2022, '추분', '9/23 10:04'], [2022, '동지', '12/22 06:48'],
  [2023, '춘분', '3/21 06:24'], [2023, '하지', '6/21 23:58'], [2023, '추분', '9/23 15:50'], [2023, '동지', '12/22 12:27'],
  [2024, '춘분', '3/20 12:06'], [2024, '하지', '6/21 05:51'], [2024, '추분', '9/22 21:44'], [2024, '동지', '12/21 18:21'],
  [2025, '춘분', '3/20 18:01'], [2025, '하지', '6/21 11:42'], [2025, '추분', '9/23 03:19'], [2025, '동지', '12/22 00:03'],
  [2000, '춘분', '3/20 16:35'], [2000, '하지', '6/21 10:48'], [2000, '추분', '9/23 02:28'], [2000, '동지', '12/21 22:37'],
];
let off = 0; let worstOff = null; let maxGap = 0;
for (const [y, ko, want] of KNOWN) {
  const r = T.termOfYear(y, degOf(ko));
  if (!r) { off++; continue; }
  const gap = minutesApart(r, want);
  if (gap > maxGap) maxGap = gap;
  if (gap > 1.0) { off++; if (!worstOff) worstOff = `${y} ${ko}: 계산 ${hhmm(r)} / 공표 ${want} (${gap.toFixed(1)}분 차)`; }
}
ok(`분점·지점 ${KNOWN.length}건 전부 1분 안쪽 (최대 ${maxGap.toFixed(2)}분)`, off === 0,
  `어긋남 ${off}건, 예: ${worstOff}`);

// ---------------------------------------------------------------
head('[2] 열두 절이 1900~2100 전 구간에서 제 날짜 범위에 드는가');
// 절기 날짜는 윤년 주기(±0.75일)와 달력 보정으로 해마다 움직인다. 그래서 "정확히
// 며칠"이 아니라 **널리 알려진 날짜에서 ±2일 안**인지를 본다. 알고리즘이 틀리면
// 이보다 훨씬 크게 벗어나므로 이 폭으로도 충분히 걸러진다.
const CANON = {
  입춘: [2, 4], 경칩: [3, 6], 청명: [4, 5], 입하: [5, 6],
  망종: [6, 6], 소서: [7, 7], 입추: [8, 8], 백로: [9, 8],
  한로: [10, 8], 입동: [11, 7], 대설: [12, 7], 소한: [1, 6],
};
let outOfRange = 0; let worst = null; let maxDrift = 0;
for (let y = 1900; y <= 2100; y++) {
  for (const t of T.MAJOR_TERMS) {
    const r = T.termOfYear(y, t.deg);
    if (!r) { outOfRange++; if (!worst) worst = `${y} ${t.ko} null`; continue; }
    const [cm, cd] = CANON[t.ko];
    if (r.m !== cm) { outOfRange++; if (!worst) worst = `${y} ${t.ko} → ${r.m}/${r.d} (달이 다름)`; continue; }
    const drift = Math.abs(r.d - cd);
    if (drift > maxDrift) maxDrift = drift;
    if (drift > 2) { outOfRange++; if (!worst) worst = `${y} ${t.ko} → ${r.m}/${r.d} (기준 ${cm}/${cd})`; }
  }
}
ok(`1900~2100 × 12절 = ${201 * 12}건 전부 ±2일 안 (최대 ${maxDrift}일)`, outOfRange === 0,
  `벗어남 ${outOfRange}건, 예: ${worst}`);

// ---------------------------------------------------------------
head('[3] 절기가 순서대로, 약 30일 간격으로 오는가');
let orderBad = 0; let gapSample = null;
for (let y = 1950; y <= 2050; y++) {
  const jds = T.MAJOR_TERMS.map((t) => (T.termOfYear(y, t.deg) || {}).jd).filter((x) => x != null);
  const sorted = jds.slice().sort((a, b) => a - b);
  if (sorted.length !== 12) { orderBad++; continue; }
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (!(gap > 28 && gap < 33)) { orderBad++; if (!gapSample) gapSample = `${y} 간격 ${gap.toFixed(2)}일`; }
  }
}
ok('1950~2050 절기 순서·간격 정상', orderBad === 0, `이상 ${orderBad}건, 예: ${gapSample}`);

// ---------------------------------------------------------------
head('[4] 해를 넘는 자리에서도 이웃 절을 찾는가');
{
  const jd = T.toJD(2026, 11, 17, 12) - 9 / 24;
  const { prev, next } = T.neighborMajorTerms(jd);
  ok('2026-11-17 지난 절 = 입동', prev && prev.ko === '입동', prev && `${prev.ko} ${prev.m}/${prev.d}`);
  ok('2026-11-17 다음 절 = 대설', next && next.ko === '대설', next && `${next.ko} ${next.m}/${next.d}`);
}
{
  const jd = T.toJD(2026, 1, 3, 12) - 9 / 24;
  const { prev, next } = T.neighborMajorTerms(jd);
  ok('1/3 지난 절 = 전해 대설', prev && prev.ko === '대설' && prev.y === 2025, prev && `${prev.y} ${prev.ko}`);
  ok('1/3 다음 절 = 소한', next && next.ko === '소한' && next.y === 2026, next && `${next.y} ${next.ko}`);
}
{
  const jd = T.toJD(2026, 12, 30, 12) - 9 / 24;
  const { prev, next } = T.neighborMajorTerms(jd);
  ok('12/30 지난 절 = 대설', prev && prev.ko === '대설', prev && `${prev.y} ${prev.ko}`);
  ok('12/30 다음 절 = 다음해 소한', next && next.ko === '소한' && next.y === 2027, next && `${next.y} ${next.ko}`);
}

// ---------------------------------------------------------------
head('[5] 대운수');
{
  // 1990-05-05 06:30 은 1990 입하 직전이다. 순행이면 다음 절까지 하루 남짓.
  const ipha = T.termOfYear(1990, 45);
  const d = T.daeunStartDetail({ y: 1990, m: 5, d: 5, hour: 6.5 }, true);
  ok(`1990-05-05 순행 → 다음 절이 입하(${ipha.m}/${ipha.d})`, d && d.termKo === '입하', d && d.termKo);
  ok('순행 대운수 = 1', d && d.age === 1, d && `${d.age} (${d.days}일)`);
}
{
  const d = T.daeunStartDetail({ y: 1990, m: 5, d: 5, hour: 6.5 }, false);
  ok('1990-05-05 역행 → 지난 절이 청명', d && d.termKo === '청명', d && d.termKo);
  ok('역행 대운수 = 10', d && d.age === 10, d && `${d.age} (${d.days}일)`);
}
{
  let bad = 0; let sample = null;
  for (let y = 1930; y <= 2026; y += 7) {
    for (let m = 1; m <= 12; m++) {
      for (const d of [2, 11, 19, 27]) {
        const f = T.daeunStartAge({ y, m, d, hour: 12 }, true);
        const b = T.daeunStartAge({ y, m, d, hour: 12 }, false);
        if (f == null || b == null) { bad++; if (!sample) sample = `${y}-${m}-${d} null`; continue; }
        if (f < 1 || f > 10 || b < 1 || b > 10) { bad++; if (!sample) sample = `${y}-${m}-${d} ${f}/${b}`; }
        if (f + b < 9 || f + b > 11) { bad++; if (!sample) sample = `${y}-${m}-${d} 합 ${f + b}`; }
      }
    }
  }
  ok('표본 전부 1~10 이고 순행+역행 ≈ 10', bad === 0, `이상 ${bad}건, 예: ${sample}`);
}

// ---------------------------------------------------------------
head('[6] ΔT 보정이 실제로 들어가 있는가');
// 빠뜨렸다가 틀렸던 자리다. 지금 값이 맞는지, 그리고 빼면 어긋나는지를 같이 본다.
{
  const dt2023 = T.deltaT(2023);
  ok('2023 ΔT 가 60~80초', dt2023 > 60 && dt2023 < 80, `${dt2023.toFixed(1)}초`);
  const dt1950 = T.deltaT(1950);
  ok('1950 ΔT 가 25~35초', dt1950 > 25 && dt1950 < 35, `${dt1950.toFixed(1)}초`);
  // 같은 순간을 TT 로 보느냐 UT 로 보느냐로 황경이 달라야 한다. 안 달라지면
  // 보정이 코드에 안 들어간 것이다(처음에 그래서 틀렸다).
  const jd = T.toJD(2023, 6, 21, 15);
  const asTT = T.apparentSolarLongitude(jd);
  const asUT = T.apparentSolarLongitudeUT(jd);
  const arcsec = Math.abs(asUT - asTT) * 3600;
  // ΔT 69초 동안 태양은 약 2.8초각을 움직인다(하루 3548초각).
  ok('TT 와 UT 의 황경이 ΔT 만큼 다르다', arcsec > 2 && arcsec < 4, `${arcsec.toFixed(2)}초각`);
  ok('2023 하지가 6/21 23:58', hhmm(T.termOfYear(2023, 90)) === '6/21 23:58', hhmm(T.termOfYear(2023, 90)));
}

// ---------------------------------------------------------------
console.log(`\n${fail === 0 ? '전부 통과' : `${fail}건 실패`} (통과 ${pass})`);
process.exit(fail ? 1 : 0);
