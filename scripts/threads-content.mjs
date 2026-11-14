// 스레드 자동 홍보 — 글 생성기
//
// 왜 페이스북(fb-content.mjs)과 따로 쓰는가
//   페이스북은 "글 하나 올리면 끝"이지만 스레드는 구조가 다르다.
//   스레드양식.md가 정한 모양은 이렇다:
//     본문 — 3줄 훅. 답을 주지 않는다. 링크 없음. 질문으로 끝낸다.
//     댓글 — 딱 하나. 나머지 + 링크.
//   페이스북 문구(약 소개 + 링크 + 해시태그)를 그대로 올리면 스레드에서는
//   광고로 읽혀 아무도 안 보고, 반복되면 계정이 눌린다.
//
// 지어내지 않는다
//   훅에 쓰는 숫자·문장은 전부 app.js(SYMPTOMS)와 game-data.js(MEDICINES)에서
//   읽어 온다. 여기에 베껴 적는 값은 하나도 없다. 앱의 값이 바뀌면 글도 따라
//   바뀐다. 스레드양식의 "반전을 지어내지 않는다" 규칙을 코드로 지키는 방법이다.
//
// 상태 파일이 없다
//   날짜만으로 오늘 글이 정해진다. 실행이 실패하거나 두 번 돌아도 같은 날이면
//   같은 글이 나온다(fb-content.mjs와 같은 방식).

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadSymptoms } from './lib/symptoms.mjs';
import { loadGameData, seoulToday } from './fb-content.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SITE = 'https://maumjaro.minimalbreeze.com/';

// 본문 길이 상한. 스레드양식 "6. 본문 500자, 짧을수록 좋다".
const BODY_MAX = 500;

/* ── 같은 소재라도 다르게 들리게 ────────────────────────────────
 * 소재 풀은 유한하다(감정 28·마음약 46·MBTI 32·혈액형 8). 소재만 돌리면
 * 한 달 남짓에 한 바퀴가 돌아 똑같은 글이 다시 나간다 — 스레드에서 제일
 * 빨리 눌리는 짓이다.
 * 그래서 들어가는 문장과 나오는 문장을 따로 돌린다. 소재 주기와 변주 주기가
 * 서로 어긋나므로(28 × 4처럼) 실제 반복 간격은 몇 배로 길어진다.
 * fb-content.mjs의 OPENERS/CLOSERS 와 같은 방식이다.
 */
function vary(list, today, salt) {
  /* 처음에는 (날짜 + 소금) % 개수로 골랐다. 그런데 소재도 날짜로 고르기 때문에
   * 둘이 같은 박자로 움직여서, 변주를 넣었는데도 28일 만에 똑같은 글이 다시
   * 나왔다. 날짜를 한 번 섞어(해시) 소재 주기와 어긋나게 만든다. */
  let h = (today.epochDay * 2654435761 + (salt || 0) * 40503) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;     // XOR 결과는 부호가 붙는다. 다시 양수로 돌린다.
  return list[h % list.length];     // 안 그러면 음수 번째를 꺼내 undefined 가 된다
}

/* ── 소재 고르기 ──────────────────────────────────────────────
 * 그냥 (날짜 % 개수)로 고르면 개수만큼 지나서 똑같은 소재가 돌아온다.
 * 감정이 28개라 딱 28일 만에 같은 글이 다시 나갔다.
 * 그래서 "한 바퀴를 다 돌 때까지 같은 것을 다시 꺼내지 않고, 바퀴마다 순서를
 * 다시 섞는" 방식으로 바꿨다. game.js·fb-content.mjs가 쓰는 시드 난수와 같다.
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, seed) {
  const rnd = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/* 날짜가 아니라 "이 모양이 몇 번째로 등장하는가"로 센다.
 * 날짜로 세면 모양이 돌아오는 주기(7일)와 소재 개수가 서로 꼬여서, 어떤 날은
 * 일주일 만에 같은 글이 나왔다. 등장 순번으로 세면 소재를 한 줄로 세워 놓고
 * 하나씩 꺼내 쓰는 것과 같아져서, 리스트를 다 쓸 때까지 같은 것이 안 나온다. */
function pickCycled(list, n, salt) {
  const len = list.length;
  if (!len) return null;
  if (len < 4) return shuffled(list, Math.floor(n / len) * 7919 + (salt || 0))[n % len];
  const seed = (r) => r * 7919 + (salt || 0) * 104729;
  const round = Math.floor(n / len);          // 몇 바퀴째인가
  const idx = n % len;                         // 이번 바퀴의 몇 번째인가
  const order = shuffled(list, seed(round));
  /* 바퀴가 바뀌는 자리를 손본다.
   * 한 바퀴 안에서는 같은 소재가 안 나오지만, 지난 바퀴의 끝과 이번 바퀴의
   * 처음은 서로 모르는 사이라 같은 소재가 며칠 만에 또 나올 수 있다.
   * (실제로 감정 글이 10일 만에 똑같이 나왔다.)
   * 지난 바퀴의 마지막 셋을 이번 바퀴 앞쪽에서 뒤로 밀어 둔다. */
  if (round > 0) {
    const tail = shuffled(list, seed(round - 1)).slice(-3);
    const head = order.slice(0, 3);
    for (let i = 0; i < head.length; i++) {
      if (tail.indexOf(head[i]) < 0) continue;
      // 뒤쪽에서 겹치지 않는 자리를 찾아 맞바꾼다
      for (let j = order.length - 1; j > 2; j--) {
        if (tail.indexOf(order[j]) < 0) { const t = order[i]; order[i] = order[j]; order[j] = t; break; }
      }
    }
  }
  return order[idx];
}
/* 오늘이 이 모양의 몇 번째 등장인가 */
function occurrence(shape, today) {
  const per = SHAPES.filter((x) => x === shape).length;      // 한 주기에 몇 번
  const cycles = Math.floor(today.epochDay / SHAPES.length);
  const pos = SHAPES.slice(0, today.epochDay % SHAPES.length)
    .filter((x) => x === shape).length;
  return cycles * per + pos;
}

/* mg는 '3mg' 같은 문자열로 저장돼 있다. 비교하려면 숫자로 꺼내야 한다. */
function mgNum(s) {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* 같은 값이 둘 이상인가. 스레드양식 "동점이 있는 데이터에서 순위를 말하지 않는다". */
function hasTie(rows, mg) {
  return rows.filter((r) => r.mg === mg).length > 1;
}

function fmtMg(n) {
  return `${n}mg`;
}

/* ── 링크 ──────────────────────────────────────────────────────
 * UTM-링크표.md의 스레드 항목과 같은 규칙.
 *   utm_content  = 글의 성격 (empathy / quiz …)
 *   utm_campaign = 글 하나하나를 가르기 위한 값. 자동 게시는 날짜로 붙인다.
 */
export function buildLink(content, today) {
  const u = new URL(SITE);
  u.searchParams.set('utm_source', 'threads');
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_content', content);
  u.searchParams.set('utm_campaign', `th-auto-${today.key.replace(/-/g, '')}`);
  return u.toString();
}

/* ── 글의 모양 ─────────────────────────────────────────────────
 * 스레드양식이 정한 세 가지 "감추는 모양"을 날마다 돌린다.
 * 직전 글과 다른 모양이 나오게 하려고 날짜로 순번을 돌린다.
 *   pair     — 한 감정의 용량은 주고, 짝이 되는 감정을 감춘다
 *   reason   — 결과는 주고 까닭을 감춘다
 *   typeTell — MBTI 타입이 "티 나는 것" 하나. 읽는 사람이 자기 얘기를 하게 만든다
 *   bloodTell— 혈액형판
 *   sentence — 문장이 있다는 것만 알리고 감춘다 (양식이 "제일 세다"고 적은 모양)
 */
/* 비중을 일부러 기울여 놓았다.
 * 맘운자로의 핵심은 "감정 → 마음 → 처방 → 주사"이지 MBTI가 아니다.
 * MBTI·혈액형 글은 사람을 데려오는 미끼라 7일 중 2일만 돈다.
 * 이 비율이 뒤집히면 글만 보고 "MBTI 앱"으로 기억하게 된다(브랜드 원칙 1).
 */
const SHAPES = [
  'sentence', 'pair', 'typeTell', 'reason', 'sentence', 'pair', 'bloodTell',
  'sentence', 'pair', 'typeTell', 'reason', 'sentence', 'pair', 'reason',
];

/* ── 모양 1: 문장 감추기 ───────────────────────────────────────
 * 감정 하나를 고르고, 그 감정에 앱이 띄우는 메시지 10줄 중 하나를 감춘다.
 * 문장 자체는 보여주지 않는다 — 보여주면 들어올 이유가 없어진다.
 */
function buildSentence(sym, today, n) {
  const keys = Object.keys(sym);
  const key = pickCycled(keys, n, 1);
  const s = sym[key];
  const lines = s.messages.length;

  const open = vary([
    `감정마다 약 용량처럼 mg를 붙여봤어.`,
    `마음에 놓는 주사를 만들면서 감정마다 mg를 매겼어.`,
    `감정을 약처럼 재면 몇 mg일까 싶어서 다 붙여봤어.`,
    `감정 하나하나에 약 용량을 매겨봤거든.`,
  ], today, 0);
  const close = vary([
    `너는 오늘 몇 mg쯤이야?`,
    `오늘 네 마음은 몇 mg야?`,
    `지금 제일 무거운 게 뭐야?`,
    `너한테는 이게 몇 mg 같아?`,
    `오늘 네 용량은 얼마쯤 될까?`,
    `${s.label} 요즘 자주 와? 몇 mg 같아?`,
  ], today, 1);
  const body = vary([
    [`그중에 내가 제일 오래 붙잡고 고친 한 줄이 있는데`, `이건 보여주면 재미없어서 안 쓸게.`],
    [`그 ${lines}줄 중에 하나는 쓰다가 몇 번을 지웠어.`, `그 줄은 여기 안 적을래.`],
    [`${lines}줄 중에 내가 제일 아끼는 게 하나 있는데`, `그건 직접 보는 게 나아.`],
  ], today, 14);

  const text = [
    open,
    ``,
    `${s.emoji} ${s.label}은 ${s.mg}.`,
    `누르면 그 감정한테만 하는 말이 하나 뜨는데`,
    `${s.label}에만 ${lines}줄을 써뒀거든.`,
    ``,
    body[0],
    body[1],
    ``,
    close,
  ].join('\n');

  const reply = [
    `${s.label} ${s.mg}이고, 제일 무거운 건 분노 쪽이야.`,
    `감정 ${keys.length}개에 전부 다른 용량이 붙어 있어.`,
    ``,
    `눌러보면 네 감정에 맞는 문장이 나와 👇`,
  ].join('\n');

  return { kind: `감정 문장 — ${s.label}`, utm: 'empathy', text, reply };
}

/* ── 모양 2: 짝 감추기 ─────────────────────────────────────────
 * 처음에는 "1위는 주고 2위를 감춘다"로 썼다. 그런데 1위와 2위는 고정값이라
 * 이 모양이 돌아올 때마다 글자 하나까지 똑같은 글이 나왔다 — 스레드에서
 * 가장 빨리 눌리는 짓이다.
 * 그래서 날마다 다른 두 감정을 비교한다. 기준 감정의 용량은 밝히고, 짝이
 * 되는 감정은 "몇 mg 차이"만 밝히고 이름을 감춘다. 조합이 많아 반복되지 않는다.
 *
 * 밝히는 건 전부 app.js의 실제 값이다. "다들 가벼울 거라 생각한다" 같은
 * 내가 지어낸 통념은 쓰지 않는다(스레드양식 "반전을 지어내지 않는다").
 */
function buildPair(sym, today, n) {
  const rows = Object.values(sym)
    .map((s) => ({ ...s, mg: mgNum(s.mg) }))
    .filter((s) => s.mg != null)
    .sort((a, b) => a.mg - b.mg);
  if (rows.length < 4) return null;

  const base = pickCycled(rows, n, 2);
  // 기준보다 무거운 쪽에서 짝을 고른다. 기준이 제일 무거우면 가벼운 쪽에서 고른다.
  const heavier = rows.filter((r) => r.mg > base.mg);
  const lighter = rows.filter((r) => r.mg < base.mg);
  const pool = heavier.length >= 2 ? heavier : lighter;
  if (!pool.length) return null;
  const mate = pickCycled(pool, n, 3);

  // 기준이 동점이면 "이 감정은 N mg"는 참이지만 짝을 특정할 수 없다.
  // 답이 둘 이상인 질문이 되므로 그날은 모양을 바꾼다.
  if (hasTie(rows, mate.mg)) return null;

  const diff = Math.abs(mate.mg - base.mg).toFixed(1).replace(/\.0$/, '');
  const dir = mate.mg > base.mg ? '무거운' : '가벼운';

  const open = vary([
    `감정마다 약 용량처럼 mg를 붙여봤어.`,
    `감정을 약 용량으로 재보면 이런 게 나와.`,
    `마음에 놓는 주사를 만들다가 감정마다 mg를 매겼는데.`,
    `감정 무게를 mg로 적어봤거든.`,
  ], today, 2);
  const close = vary([
    `너는 오늘 몇 mg쯤이야?`,
    `뭐일 것 같아?`,
    `맞혀볼 사람?`,
    `감 오는 사람 있어?`,
  ], today, 3);

  const text = [
    open,
    ``,
    `${base.emoji} ${base.label}은 ${fmtMg(base.mg)}이야.`,
    `근데 여기서 딱 ${diff}mg ${dir} 감정이 하나 있어.`,
    ``,
    `그게 뭔지는 안 쓸게. 보고 나면 좀 납득이 되더라.`,
    ``,
    close,
  ].join('\n');

  const reply = [
    `${mate.emoji} ${mate.label} ${fmtMg(mate.mg)}이었어.`,
    `감정 ${rows.length}개에 전부 다른 용량이 붙어 있어.`,
    ``,
    `네 건 몇 mg인지 눌러보면 나와 👇`,
  ].join('\n');

  return { kind: `감정 비교 — ${base.label}`, utm: 'quiz', text, reply };
}

/* ── 모양 4·5: "이건 티 난다" ──────────────────────────────────
 * mbti-data.js의 TYPE_TELLS / BLOOD_TELLS 를 쓴다.
 *
 * 왜 이걸 넣었나
 *   목표가 "댓글이 많이 달리는 것"인데, 스레드에서 댓글이 제일 잘 붙는 글은
 *   읽는 사람이 자기 얘기를 하게 되는 글이다. "내 타입은 ~인데" 하면서
 *   스스로 말을 꺼내게 된다. 감정 mg 글은 공감은 사지만 할 말을 덜 준다.
 *
 * 브랜드 원칙을 지키는 선
 *   MBTI는 사람을 데려오는 미끼고, 목적지는 언제나 "마음에 주사"다.
 *   그래서 댓글(링크가 붙는 자리)에서 그 타입이 앓는 곳(ache)으로 넘긴다.
 *   MBTI 결과만 보여주고 끝나는 글은 만들지 않는다(브랜드 원칙 3).
 */
async function loadMbti() {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(join(ROOT, 'mbti-data.js'), 'utf8');
  const w = {};
  new Function('window', src)(w);
  const d = w.MAUMJARO_MBTI_DATA;
  if (!d || !d.TYPE_TELLS || !d.MBTI_TYPES) {
    throw new Error('mbti-data.js에서 TYPE_TELLS / MBTI_TYPES를 읽지 못했습니다.');
  }
  return d;
}

function buildTypeTell(mbti, today, n) {
  const types = Object.keys(mbti.TYPE_TELLS);
  const type = pickCycled(types, n, 4);
  const tells = mbti.TYPE_TELLS[type];
  if (!tells || !tells.length) return null;
  const tell = vary(tells, today, 11);
  const info = mbti.MBTI_TYPES[type];
  if (!info) return null;

  const open = vary([
    `MBTI별로 "숨겨도 티 나는 것"을 하나씩 적어봤어.`,
    `MBTI별로 본인만 모르는 버릇을 적어봤어.`,
    `MBTI ${types.length}개에 "이건 숨겨도 보인다"를 하나씩 붙였어.`,
    `MBTI별로 남들은 다 아는 티를 하나씩 썼어.`,
    `MBTI ${types.length}개한테 "이건 티 난다"를 하나씩 붙여봤어.`,
    `MBTI별로 숨긴다고 숨기는데 결국 보이는 걸 적었어.`,
  ], today, 4);
  const body = vary([
    [`${types.length}개 다 쓰면서 제일 뜨끔한 게 하나 있었는데`, `그건 내 타입이라 안 쓸게.`],
    [`쓰다가 하나에서 손이 멈췄는데`, `그게 내 타입이어서 그건 빼놨어.`],
    [`${types.length}개 중에 내가 제일 찔린 게 하나 있어.`, `그건 안 올릴래.`],
  ], today, 13);
  const close = vary([
    `너는 뭐야? 맞는지 봐줘.`,
    `${type}인 사람 있어? 이거 맞아?`,
    `네 타입은 뭐라고 나와 있을 것 같아?`,
    `본인 타입 쓰고 가면 내가 맞는지 말해줄게.`,
    `${type} 맞는 사람 손 들어봐.`,
    `네 타입 쓰고 가면 그것도 찾아줄게.`,
  ], today, 5);

  const text = [
    open,
    ``,
    `${info.emoji} ${type}`,
    `"${tell}"`,
    ``,
    body[0],
    body[1],
    ``,
    close,
  ].join('\n');

  // 링크 자리에서 반드시 "마음"으로 넘긴다. MBTI로 끝내지 않는다.
  const reply = [
    `${type}은 『${info.name}』 — ${info.trait}`,
    ``,
    `타입마다 자주 앓는 곳이 따로 있더라.`,
    `${type}은 "${info.ache}".`,
    ``,
    `네 타입이 앓는 곳이랑, 거기 놓는 처방까지 여기 있어 👇`,
  ].join('\n');

  return { kind: `MBTI 티 — ${type}`, utm: 'quiz', text, reply };
}

function buildBloodTell(mbti, today, n) {
  if (!mbti.BLOOD_TELLS) return null;
  const bloods = Object.keys(mbti.BLOOD_TELLS);
  const b = pickCycled(bloods, n, 5);
  const tells = mbti.BLOOD_TELLS[b];
  if (!tells || !tells.length) return null;
  const tell = vary(tells, today, 12);

  const open = vary([
    `혈액형별로 "본인은 모르는데 남들은 아는 것"을 적어봤어.`,
    `혈액형별 버릇을 하나씩 적어봤는데.`,
    `혈액형마다 "이건 티 난다" 하나씩 썼어.`,
    `혈액형별로 남들만 아는 걸 하나씩 적었어.`,
  ], today, 6);
  const close = vary([
    `${b}형인 사람, 이거 맞아?`,
    `${b}형 있어? 억울하면 말해줘.`,
    `이거 ${b}형 맞다고 생각해?`,
    `${b}형 입장 좀 들어보자.`,
  ], today, 7);

  const text = [
    open,
    ``,
    `🩸 ${b}형`,
    `"${tell}"`,
    ``,
    `${bloods.length}개 중에 이게 제일 반응이 갈릴 것 같은데.`,
    ``,
    close,
  ].join('\n');

  const reply = [
    `나머지 ${bloods.length - 1}개도 있는데 여기선 안 쓸게.`,
    `혈액형이랑 MBTI를 같이 넣으면 또 다른 게 나오더라.`,
    ``,
    `그리고 오늘 마음이 무거우면 그쪽이 더 급해 👇`,
  ].join('\n');

  return { kind: `혈액형 티 — ${b}형`, utm: 'quiz', text, reply };
}

/* ── 모양 3: 까닭 감추기 ───────────────────────────────────────
 * 마음약 하나를 고르고, 이름만 주고 설명을 감춘다.
 */
function buildReason(meds, cats, today, n) {
  // 날짜로 고른다. 같은 약이 연달아 나오지 않게 소수(prime)를 곱해 건너뛴다.
  const med = pickCycled(meds, n, 6);
  const cat = cats.find((c) => c.key === med.category);

  const open = vary([
    `마음에 놓는 약을 ${meds.length}개 만들었는데\n그중에 이름만 보고 다들 웃는 게 하나 있어.`,
    `마음약 ${meds.length}개를 만들다가 이름부터 정한 게 있어.`,
    `약 이름을 ${meds.length}개 지었는데 이게 제일 마음에 들어.`,
    `마음에 놓는 약 ${meds.length}개 중에 하나만 꺼내볼게.`,
  ], today, 8);
  const close = vary([
    `이름만 보고 무슨 약일 것 같아?`,
    `이거 무슨 약 같아?`,
    `설명 뭐라고 써뒀을 것 같아?`,
    `한 줄로 맞혀볼 사람?`,
  ], today, 9);

  const text = [
    open,
    ``,
    `${med.icon} 『${med.name}』`,
    ``,
    `${cat ? cat.emoji + ' ' + cat.label : '마음'} 쪽 약인데`,
    `왜 이런 이름이 붙었는지는 설명을 봐야 알아.`,
    `그 한 줄 때문에 이 약을 만든 거라서.`,
    ``,
    close,
  ].join('\n');

  const reply = [
    `『${med.name}』 — ${med.description}`,
    ``,
    `이런 약을 ${meds.length}개 모아뒀어 👇`,
  ].join('\n');

  return { kind: `마음약 — ${med.name}`, utm: 'empathy', text, reply };
}

/* ── 오늘 올릴 글 ─────────────────────────────────────────────── */
export async function buildTodayThread(now = new Date()) {
  const today = seoulToday(now);
  const sym = await loadSymptoms(ROOT);
  const { MEDICINES, MED_CATEGORIES } = await loadGameData();
  const mbti = await loadMbti();

  // 오늘의 모양부터 시작해서, 못 만들면 다음 모양으로 넘어간다.
  // (동점 때문에 순위 글을 못 쓰는 날이 있다.)
  const start = today.epochDay % SHAPES.length;
  let post = null;
  let shape = null;
  for (let i = 0; i < SHAPES.length && !post; i++) {
    shape = SHAPES[(start + i) % SHAPES.length];
    const n = occurrence(shape, today);
    if (shape === 'sentence') post = buildSentence(sym, today, n);
    else if (shape === 'pair') post = buildPair(sym, today, n);
    else if (shape === 'typeTell') post = buildTypeTell(mbti, today, n);
    else if (shape === 'bloodTell') post = buildBloodTell(mbti, today, n);
    else post = buildReason(MEDICINES, MED_CATEGORIES, today, n);
  }
  if (!post) throw new Error('오늘 올릴 글을 만들지 못했습니다.');

  const link = buildLink(post.utm, today);
  const reply = `${post.reply}\n${link}`;

  if (post.text.length > BODY_MAX) {
    throw new Error(`본문이 ${post.text.length}자입니다. 스레드 본문 상한(${BODY_MAX}자)을 넘습니다.`);
  }
  // 본문에 링크가 섞여 들어가면 광고로 읽힌다. 섞였다면 코드가 잘못된 것이다.
  if (/https?:\/\//.test(post.text)) {
    throw new Error('본문에 링크가 들어갔습니다. 링크는 댓글에만 붙입니다.');
  }

  return { today, shape, kind: post.kind, text: post.text, reply, link };
}

/* 단독 실행 — 오늘 글을 찍어 본다
 *   node scripts/threads-content.mjs        오늘 것만
 *   node scripts/threads-content.mjs 14     앞으로 14일치 미리보기
 */
if (process.argv[1] && process.argv[1].endsWith('threads-content.mjs')) {
  const days = Math.max(1, Math.min(60, Number(process.argv[2]) || 1));
  (async () => {
    const now = Date.now();
    for (let i = 0; i < days; i++) {
      const p = await buildTodayThread(new Date(now + i * 86400000));
      console.log('─'.repeat(52));
      console.log(`📅 ${p.today.key} · 모양 ${p.shape} · ${p.kind}`);
      console.log('─'.repeat(52));
      console.log(p.text);
      console.log(`\n   (본문 ${p.text.length}자 · 링크 없음)`);
      console.log('💬 댓글 ─────────────────────────────────────');
      console.log(p.reply);
      console.log('');
    }
    if (days > 1) console.log(`※ ${days}일치 미리보기입니다. 실제로 올리려면 Actions 탭에서 돌리세요.`);
  })();
}
