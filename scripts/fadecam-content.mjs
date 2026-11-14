// 페이드캠 스레드 홍보 — 글 만들기
//
// 맘운자로 글(threads-content.mjs)과 뼈대는 같지만 결이 다르다.
//
// 왜 "소개글"을 안 쓰는가
//   효성님 계정의 실제 숫자가 그렇게 말한다(2026-10 기준, 2일 이상 지난 글):
//     구글 플레이 테스터 규칙 (겪은 일)  조회 358 · 프로필 60 · 팔로우 3
//     앱스토어 리뷰 안 올라옴 (겪은 일)  조회 685 · 프로필  7 · 팔로우 0
//     페이드캠 소개 (이미지 3장)         조회 186 · 프로필  0 · 팔로우 0
//   제품을 소개한 글만 프로필 방문이 0이었다. 반대로 "만들다 겪은 일"이
//   프로필 전환 1위였다. 그래서 여기서는 제품 자랑을 본문에서 하지 않는다.
//   본문은 상황·겪은 일·선택의 이유만 말하고, 제품은 댓글에서만 꺼낸다.
//
// 스레드양식.md 를 그대로 따른다
//   본문 — 짧은 훅, 링크 없음, 질문으로 끝낸다
//   댓글 — 딱 하나. 거기에만 링크.

import { APP, FACTS, MOMENTS, MAKING, CHOICES, LIMITS, REVIEWS } from './fadecam-data.mjs';
import { seoulToday } from './fb-content.mjs';

const BODY_MAX = 500;

/* 한 바퀴를 다 돌 때까지 같은 소재를 다시 꺼내지 않는다.
 * 바퀴마다 순서를 다시 섞고, 바퀴가 바뀌는 자리에서 지난 바퀴의 끝과
 * 겹치지 않게 손본다. (threads-content.mjs 와 같은 방식) */
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
function pickCycled(list, n, salt) {
  const len = list.length;
  if (!len) return null;
  if (len < 4) return shuffled(list, Math.floor(n / len) * 7919 + (salt || 0))[n % len];
  const seed = (r) => r * 7919 + (salt || 0) * 104729;
  const round = Math.floor(n / len);
  const idx = n % len;
  const order = shuffled(list, seed(round));
  /* 바퀴가 바뀌는 자리를 손본다. 한 바퀴 안에서는 같은 소재가 안 나오지만
   * 지난 바퀴의 끝과 이번 바퀴의 처음은 서로 몰라서, 며칠 만에 같은 글이
   * 또 나올 수 있다. 겹치는 범위를 넉넉히 잡을수록 간격이 길어진다. */
  const EDGE = Math.min(5, Math.floor(len / 3));
  if (round > 0 && EDGE > 0) {
    const tail = shuffled(list, seed(round - 1)).slice(-EDGE);
    const head = order.slice(0, EDGE);
    for (let i = 0; i < head.length; i++) {
      if (tail.indexOf(head[i]) < 0) continue;
      for (let j = order.length - 1; j >= EDGE; j--) {
        if (tail.indexOf(order[j]) < 0) { const t = order[i]; order[i] = order[j]; order[j] = t; break; }
      }
    }
  }
  return order[idx];
}
/* 날짜를 한 번 섞어 소재 주기와 어긋나게 한다. XOR 결과에 부호가 붙으므로
 * 마지막에 양수로 되돌린다 — 안 그러면 음수 번째를 꺼내 undefined 가 된다. */
function vary(list, today, salt) {
  let h = (today.epochDay * 2654435761 + (salt || 0) * 40503) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return list[h % list.length];
}

/* ── 소재를 한 줄로 세운다 ───────────────────────────────────
 *
 * 처음에는 맘운자로처럼 "요일마다 어떤 종류" 식으로 짰다. 그런데 거기는
 * 데이터가 많아서(감정 28·마음약 46) 조합이 나왔지만, 여기 소재는 전부
 * "실제로 있었던 일"이라 수가 적다. 종류별로 나눠 돌리니 같은 글이 하루
 * 걸러 나왔다.
 *
 * 그래서 종류를 가리지 않고 전부 한 줄로 세워 순환시킨다. 한 바퀴를 다
 * 돌 때까지 같은 소재가 다시 안 나오고, 바퀴마다 순서를 다시 섞는다.
 * 종류가 섞여 나오는 편이 읽는 쪽에서도 자연스럽다.
 *
 * ⚠️ 소재 수가 곧 주기다. 지금 수로는 매일 올리면 금세 한 바퀴가 돈다.
 *    그래서 워크플로를 주 4회로 잡아 뒀다. 소재가 늘면 빈도를 올리면 된다.
 */
/* 올리는 요일. 0=일 … 6=토. 워크플로의 cron 과 같아야 한다.
 * 소재가 17개뿐이라 매일 올리면 3주도 안 돼 한 바퀴가 돈다. 주 3회면
 * 40일쯤 걸린다. 소재가 늘면 여기와 cron 을 같이 늘리면 된다. */
export const POST_DAYS = [1, 3, 5];       // 월·수·금

/* 오늘이 몇 번째 게시인가.
 *
 * 날짜(epochDay)를 그대로 순번으로 쓰면 안 된다. 주 3회만 올리므로 날짜는
 * 1,3,5,8,10,12… 처럼 건너뛰는데, 순환은 순번이 1씩 이어져야 한 바퀴를 다
 * 돈다. 건너뛴 채로 돌리면 바퀴가 빨리 넘어가면서 같은 글이 이틀 만에 또
 * 나왔다(실제로 그랬다).
 * 그래서 "이번이 몇 번째 게시인지"를 직접 센다. */
export function postIndex(today) {
  const dow = (today.epochDay + 4) % 7;          // 1970-01-01 은 목요일
  const weeks = Math.floor((today.epochDay + 4) / 7);
  const at = POST_DAYS.indexOf(dow);
  // 올리는 요일이 아니면(수동 실행 등) 그 주에서 가장 가까운 자리로 센다
  const slot = at >= 0 ? at : POST_DAYS.filter((d) => d < dow).length;
  return weeks * POST_DAYS.length + slot;
}

function pool() {
  return [
    ...MOMENTS.map((x) => ({ type: 'moment', item: x })),
    ...MAKING.map((x) => ({ type: 'making', item: x })),
    ...CHOICES.map((x) => ({ type: 'choice', item: x })),
    ...LIMITS.map((x) => ({ type: 'limit', item: x })),
    ...REVIEWS.map((x) => ({ type: 'review', item: x })),
  ];
}

/* ── 댓글 ─────────────────────────────────────────────────────
 * 링크는 여기에만 붙는다. 그리고 반드시 두 가지를 밝힌다.
 *   1) 내가 만든 앱이라는 것 — 안 밝히면 표시광고법에 걸린다.
 *      블로그 초안에서도 같은 이유로 한 줄을 남겼다.
 *   2) 아이폰 전용이라는 것 — 안 밝히면 안드로이드 쓰는 사람이 헛걸음한다.
 */
function buildReply(lead, today) {
  const out = [];
  if (lead) out.push(lead, '');

  if (APP.androidUrl) {
    out.push(`${APP.name} — 내가 만든 앱이야. 둘 다 있어 👇`);
    out.push(APP.iosUrl);
    out.push(APP.androidUrl);
  } else {
    out.push(`${APP.name} — 내가 만들어 쓰는 앱이야. 아직 아이폰만 👇`);
    out.push(APP.iosUrl);
    const eta = APP.androidEta ? `${APP.androidEta}쯤` : '곧';
    out.push('');
    out.push(`안드로이드는 ${eta} 나와. 지금 테스트 중이야.`);
  }
  return out.join('\n');
}

/* ── 모양별 ─────────────────────────────────────────────────── */

function buildMoment(today, m) {
  const text = [...m.line, '', m.ask].join('\n');
  // 상황 글의 댓글은 제품 설명을 길게 하지 않는다. 한 줄이면 된다.
  const lead = vary([
    '나는 이게 너무 쌓여서 아예 카메라를 하나 만들었어.',
    '이거 때문에 찍을 때 수명을 정하는 카메라를 만들어서 쓰고 있어.',
    '나는 결국 못 참고 앱을 하나 만들었어. 찍을 때 며칠 뒤에 지울지 고르는 거.',
  ], today, 1);
  return { kind: `상황 — ${m.id}`, text, reply: buildReply(lead, today) };
}

function buildMaking(today, m) {
  const text = [...m.line, '', m.ask].join('\n');
  const lead = vary([
    '만들고 있는 건 사진 자동으로 지워주는 카메라야.',
    '참고로 만드는 중인 앱은 찍을 때 수명을 정하는 카메라야.',
  ], today, 2);
  return { kind: `만들며 — ${m.id}`, text, reply: buildReply(lead, today) };
}

function buildChoice(today, c) {
  const text = [...c.line, '', c.ask].join('\n');
  return { kind: `선택 — ${c.id}`, text, reply: buildReply(null, today) };
}

function buildLimit(today, l) {
  const text = [...l.line, '', l.ask].join('\n');
  return { kind: `한계 — ${l.id}`, text, reply: buildReply(null, today) };
}

function buildReview(today, r) {
  const open = vary([
    '앱 리뷰에 이런 게 적혀 있었거든',
    '내가 만든 앱 리뷰에 이런 말이 있었어',
    '리뷰를 보다가 모르는 말이 하나 있었어',
  ], today, 5);
  const text = [open, '', `"${r.quote}"`, '', ...r.note, '', r.ask].join('\n');
  return { kind: `리뷰 — ${r.id}`, text, reply: buildReply(null, today) };
}

/* ── 오늘 올릴 글 ─────────────────────────────────────────────── */
export async function buildTodayThread(now = new Date()) {
  const today = seoulToday(now);
  const all = pool();
  if (!all.length) throw new Error('소재가 하나도 없습니다. scripts/fadecam-data.mjs 를 확인하세요.');

  const picked = pickCycled(all, postIndex(today), 1);
  if (!picked) throw new Error('오늘 올릴 소재를 고르지 못했습니다.');

  const { type, item } = picked;
  let post = null;
  if (type === 'moment') post = buildMoment(today, item);
  else if (type === 'making') post = buildMaking(today, item);
  else if (type === 'choice') post = buildChoice(today, item);
  else if (type === 'limit') post = buildLimit(today, item);
  else if (type === 'review') post = buildReview(today, item);
  if (!post) throw new Error(`'${type}' 소재로 글을 만들지 못했습니다.`);

  if (post.text.length > BODY_MAX) {
    throw new Error(`본문이 ${post.text.length}자입니다. 상한 ${BODY_MAX}자를 넘습니다.`);
  }
  // 본문에 링크가 섞이면 광고로 읽혀 아예 안 퍼진다. 섞였다면 코드가 잘못된 것이다.
  if (/https?:\/\//.test(post.text)) {
    throw new Error('본문에 링크가 들어갔습니다. 링크는 댓글에만 붙입니다.');
  }
  return { today, shape: type, kind: post.kind, text: post.text,
           reply: post.reply, link: APP.iosUrl, poolSize: all.length };
}

/* 단독 실행
 *   node scripts/fadecam-content.mjs        다음에 올라갈 글 하나
 *   node scripts/fadecam-content.mjs 12     앞으로 12번치 미리보기
 *
 * 날짜를 하루씩 밀면서 보되, 올리는 요일(POST_DAYS)만 찍는다. 안 올리는
 * 날까지 찍으면 실제로 나가지 않는 글이 섞여 순서를 잘못 읽게 된다. */
if (process.argv[1] && process.argv[1].endsWith('fadecam-content.mjs')) {
  const want = Math.max(1, Math.min(60, Number(process.argv[2]) || 1));
  (async () => {
    const now = Date.now();
    let shown = 0;
    // 주 3회라 넉넉히 훑는다. 그래도 want 개를 못 채우면 거기서 멈춘다.
    for (let i = 0; i < want * 7 + 7 && shown < want; i++) {
      const when = new Date(now + i * 86400000);
      const dow = (seoulToday(when).epochDay + 4) % 7;
      if (!POST_DAYS.includes(dow)) continue;
      shown += 1;
      const p = await buildTodayThread(when);
      console.log('─'.repeat(52));
      console.log(`📅 ${p.today.key} · ${p.shape} · ${p.kind}`);
      console.log('─'.repeat(52));
      console.log(p.text);
      console.log(`\n   (본문 ${p.text.length}자 · 링크 없음)`);
      console.log('💬 댓글 ─────────────────────────────────────');
      console.log(p.reply);
      console.log('');
    }
    if (want > 1) console.log(`※ ${shown}번치 미리보기입니다(월·수·금). 실제로 올리려면 Actions 탭에서 돌리세요.`);
  })();
}
