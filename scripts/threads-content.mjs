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
 *   sentence — 문장이 있다는 것만 알리고 감춘다 (양식이 "제일 세다"고 적은 모양)
 */
const SHAPES = ['sentence', 'pair', 'reason'];

/* ── 모양 1: 문장 감추기 ───────────────────────────────────────
 * 감정 하나를 고르고, 그 감정에 앱이 띄우는 메시지 10줄 중 하나를 감춘다.
 * 문장 자체는 보여주지 않는다 — 보여주면 들어올 이유가 없어진다.
 */
function buildSentence(sym, today) {
  const keys = Object.keys(sym);
  const key = keys[today.epochDay % keys.length];
  const s = sym[key];
  const n = s.messages.length;

  const text = [
    `감정마다 약 용량처럼 mg를 붙여봤어.`,
    ``,
    `${s.emoji} ${s.label}은 ${s.mg}.`,
    `누르면 그 감정한테만 하는 말이 하나 뜨는데`,
    `${s.label}에만 ${n}줄을 써뒀거든.`,
    ``,
    `그중에 내가 제일 오래 붙잡고 고친 한 줄이 있는데`,
    `이건 보여주면 재미없어서 안 쓸게.`,
    ``,
    `너는 오늘 몇 mg쯤이야?`,
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
function buildPair(sym, today) {
  const rows = Object.values(sym)
    .map((s) => ({ ...s, mg: mgNum(s.mg) }))
    .filter((s) => s.mg != null)
    .sort((a, b) => a.mg - b.mg);
  if (rows.length < 4) return null;

  const base = rows[today.epochDay % rows.length];
  // 기준보다 무거운 쪽에서 짝을 고른다. 기준이 제일 무거우면 가벼운 쪽에서 고른다.
  const heavier = rows.filter((r) => r.mg > base.mg);
  const lighter = rows.filter((r) => r.mg < base.mg);
  const pool = heavier.length >= 2 ? heavier : lighter;
  if (!pool.length) return null;
  const mate = pool[(today.epochDay * 3) % pool.length];

  // 기준이 동점이면 "이 감정은 N mg"는 참이지만 짝을 특정할 수 없다.
  // 답이 둘 이상인 질문이 되므로 그날은 모양을 바꾼다.
  if (hasTie(rows, mate.mg)) return null;

  const diff = Math.abs(mate.mg - base.mg).toFixed(1).replace(/\.0$/, '');
  const dir = mate.mg > base.mg ? '무거운' : '가벼운';

  const text = [
    `감정마다 약 용량처럼 mg를 붙여봤어.`,
    ``,
    `${base.emoji} ${base.label}은 ${fmtMg(base.mg)}이야.`,
    `근데 여기서 딱 ${diff}mg ${dir} 감정이 하나 있어.`,
    ``,
    `그게 뭔지는 안 쓸게. 보고 나면 좀 납득이 되더라.`,
    ``,
    `너는 오늘 몇 mg쯤이야?`,
  ].join('\n');

  const reply = [
    `${mate.emoji} ${mate.label} ${fmtMg(mate.mg)}이었어.`,
    `감정 ${rows.length}개에 전부 다른 용량이 붙어 있어.`,
    ``,
    `네 건 몇 mg인지 눌러보면 나와 👇`,
  ].join('\n');

  return { kind: `감정 비교 — ${base.label}`, utm: 'quiz', text, reply };
}

/* ── 모양 3: 까닭 감추기 ───────────────────────────────────────
 * 마음약 하나를 고르고, 이름만 주고 설명을 감춘다.
 */
function buildReason(meds, cats, today) {
  // 날짜로 고른다. 같은 약이 연달아 나오지 않게 소수(prime)를 곱해 건너뛴다.
  const med = meds[(today.epochDay * 7) % meds.length];
  const cat = cats.find((c) => c.key === med.category);

  const text = [
    `마음에 놓는 약을 ${meds.length}개 만들었는데`,
    `그중에 이름만 보고 다들 웃는 게 하나 있어.`,
    ``,
    `${med.icon} 『${med.name}』`,
    ``,
    `${cat ? cat.emoji + ' ' + cat.label : '마음'} 쪽 약인데`,
    `왜 이런 이름이 붙었는지는 설명을 봐야 알아.`,
    `그 한 줄 때문에 이 약을 만든 거라서.`,
    ``,
    `이름만 보고 무슨 약일 것 같아?`,
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

  // 오늘의 모양부터 시작해서, 못 만들면 다음 모양으로 넘어간다.
  // (동점 때문에 순위 글을 못 쓰는 날이 있다.)
  const start = today.epochDay % SHAPES.length;
  let post = null;
  let shape = null;
  for (let i = 0; i < SHAPES.length && !post; i++) {
    shape = SHAPES[(start + i) % SHAPES.length];
    if (shape === 'sentence') post = buildSentence(sym, today);
    else if (shape === 'pair') post = buildPair(sym, today);
    else post = buildReason(MEDICINES, MED_CATEGORIES, today);
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

// 단독 실행하면 오늘 글을 찍어 본다:  node scripts/threads-content.mjs
if (process.argv[1] && process.argv[1].endsWith('threads-content.mjs')) {
  buildTodayThread().then((p) => {
    console.log('─'.repeat(52));
    console.log(`📅 ${p.today.key} · 모양 ${p.shape} · ${p.kind}`);
    console.log('─'.repeat(52));
    console.log(p.text);
    console.log(`\n   (본문 ${p.text.length}자)`);
    console.log('─'.repeat(52));
    console.log('💬 댓글');
    console.log(p.reply);
    console.log('─'.repeat(52));
  });
}
