// 페이스북 자동 홍보 — 게시 문구 생성기
//
// 문구를 여기에 하드코딩하지 않고 game-data.js의 마음약 46종에서 만들어 낸다.
// 마음약을 늘리면 홍보 문구도 자동으로 늘어나고, 이름·설명을 고치면 여기도 따라온다.
// (문구를 따로 베껴 두면 반드시 원본과 어긋난다.)
//
// 상태 파일이 없다. 날짜만으로 오늘 올릴 약이 정해지므로, 실행이 한 번 실패하거나
// 두 번 돌아도 같은 날이면 같은 결과가 나온다(카톡/게임 레이어에서 쓰던 방식과 동일).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_URL = 'https://maumjaro.minimalbreeze.com/';

// game-data.js는 브라우저용 IIFE라 import가 안 된다. window 껍데기를 하나 만들어
// 그 위에서 실행시켜 데이터만 꺼내 온다. 우리 리포의 파일만 대상으로 하며,
// 외부에서 받아온 코드를 실행하지는 않는다.
export async function loadGameData() {
  const src = await readFile(join(HERE, '..', 'game-data.js'), 'utf8');
  const fakeWindow = {};
  new Function('window', src)(fakeWindow);
  const data = fakeWindow.MAUMJARO_GAME_DATA;
  if (!data || !Array.isArray(data.MEDICINES) || data.MEDICINES.length === 0) {
    throw new Error('game-data.js에서 MEDICINES를 읽지 못했습니다.');
  }
  return data;
}

// game.js와 같은 시드 난수. 같은 시드면 어디서 돌려도 같은 순서가 나온다.
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seed) {
  const rnd = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// GitHub Actions는 UTC로 돈다. "오늘"은 언제나 한국 날짜여야 하므로 직접 환산한다.
export function seoulToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: y, month: m, day: d,
    weekday: WD[get('weekday')],
    key: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    // 1970-01-01부터 며칠째인지. 로테이션의 기준값.
    epochDay: Math.floor(Date.UTC(y, m - 1, d) / 86400000),
  };
}

// 시즌 한정 약(월요일한정·크리스마스한정 등)은 제철이 아닐 때 올리면 어색하다.
// 7월에 크리스마스 약을 홍보하지 않도록 여기서 거른다.
export function isInSeason(med, today) {
  if (!med.limited) return true;
  if (typeof med.weekday === 'number') return today.weekday === med.weekday;
  if (Array.isArray(med.months)) return med.months.includes(today.month);
  return true;
}

// 오늘 올릴 약 고르기.
//
// 상시 판매 40종을 기본 로테이션으로 돌리고, 시즌 한정 6종은 제철인 날에만 끼워 넣는다.
// 처음에는 "제철이 아니면 다음 약으로 건너뛰기"로 짰는데, 그러면 오늘 건너뛰면서
// 내일 나올 약을 미리 당겨 써서 같은 약이 이틀 연속 올라갔다(2년 시뮬레이션에서 76회).
// 그래서 두 그룹을 아예 분리했다.
function pickBase(pool, epochDay) {
  const n = pool.length;
  const cycleOrder = (c) => seededShuffle(pool, c + 1);
  const idx = ((epochDay % n) + n) % n;
  const order = cycleOrder(Math.floor(epochDay / n));
  const pick = order[idx];
  // 주기가 바뀌면 순서를 다시 섞기 때문에, 지난 주기의 마지막 약과
  // 새 주기의 첫 약이 우연히 같을 수 있다. 그때만 한 칸 옆으로 비킨다.
  if (idx === 0) {
    const prevLast = cycleOrder(Math.floor(epochDay / n) - 1)[n - 1];
    if (prevLast.id === pick.id) return order[1];
  }
  return pick;
}

export function pickMedicine(medicines, today) {
  const base = medicines.filter((m) => !m.limited);
  const seasonal = medicines.filter((m) => m.limited && isInSeason(m, today));

  // 제철 한정 약은 9일에 한 번 돌아오는 자리에만 넣는다.
  // ⓐ 매번 앞세우면 월요일마다 같은 약이 나와 고장 난 봇처럼 보이고,
  // ⓑ 자리를 9일 간격으로 띄우면 한정 약이 연달아 나오는 일이 원천적으로 없다.
  // 한정 약과 상시 약은 서로 다른 목록이라, 이 둘 사이의 연속 중복도 생기지 않는다.
  //
  // ⚠️ 간격은 7의 배수를 쓰면 안 된다. epochDay % 7 은 언제나 같은 요일(목요일)에만
  // 걸려서, 월요일·금요일 한정 약이 영원히 등장하지 못한다. 9는 7과 서로소라
  // 63일에 걸쳐 모든 요일을 한 번씩 훑는다.
  if (seasonal.length > 0 && today.epochDay % 9 === 0) {
    const r = mulberry32(today.epochDay + 7)();
    return seasonal[Math.floor(r * seasonal.length) % seasonal.length];
  }
  return pickBase(base, today.epochDay);
}

// 유입 경로를 GA4에서 구분하려고 utm을 붙인다.
// 앱의 URL 파라미터는 전부 get('특정이름') 방식이라 모르는 파라미터가 붙어도 무시된다.
export function buildLink(med) {
  const q = new URLSearchParams({
    utm_source: 'facebook',
    utm_medium: 'social',
    utm_campaign: 'daily_medicine',
    utm_content: med.id,
  });
  return `${APP_URL}?${q}`;
}

// 매일 같은 틀이면 광고처럼 보인다. 날짜에 따라 도입부를 바꾼다.
const OPENERS = [
  (m) => `${m.icon} 오늘의 마음약 — ${m.name}`,
  (m) => `${m.icon} 오늘 처방된 약: ${m.name}`,
  (m) => `${m.icon} 이런 약, 필요하신 분?\n\n『${m.name}』`,
  (m) => `${m.icon} 약국에 이런 게 들어왔습니다.\n\n『${m.name}』`,
];

const CLOSERS = [
  '지금 내 마음엔 어떤 약이 필요할까요?\n30초면 오늘의 처방이 나옵니다 👇',
  '오늘 기분 한 번 고르면, 마음에 맞는 처방이 나옵니다 👇',
  '운세도 보고, 마음에 주사도 한 대 놓고 가세요 💉',
  '내 마음에 필요한 약은 뭔지 뽑아보세요 👇',
];

export function buildMessage(med, categories, today) {
  const pick = (arr) => arr[(today.epochDay + arr.length) % arr.length];
  const cat = categories.find((c) => c.key === med.category);

  const tags = ['#맘운자로', '#마음처방', '#오늘의운세', `#${med.name}`];
  if (cat) tags.push(`#${cat.label.replace(/[·\s]/g, '')}`);
  if (med.limited && med.season) tags.push(`#${med.season}한정`);

  const season = med.limited && med.season ? `\n\n🎟️ ${med.season} 한정 처방입니다.` : '';

  return [
    pick(OPENERS)(med),
    '',
    med.description,
    season.trim(),
    '',
    pick(CLOSERS),
    buildLink(med),
    '',
    tags.join(' '),
  ].filter((line, i, a) => !(line === '' && a[i - 1] === '')).join('\n');
}

// 오늘 올릴 게시글 한 건을 통째로 만들어 준다.
export async function buildTodayPost(now = new Date()) {
  const { MEDICINES, MED_CATEGORIES } = await loadGameData();
  const today = seoulToday(now);
  const med = pickMedicine(MEDICINES, today);
  return {
    today,
    medicine: med,
    message: buildMessage(med, MED_CATEGORIES, today),
    link: buildLink(med),
  };
}
