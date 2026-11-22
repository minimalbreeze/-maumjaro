// 스레드 성적표 — 올린 글이 실제로 어땠는지 긁어 온다
//
// 왜 필요한가
//   스레드양식.md 가 이렇게 적어 뒀다:
//     "결과를 초안 파일에 적는다. 안 적으면 계속 추측으로만 쓰게 된다."
//   맞는 말인데 손으로 적으면 며칠 하다 만다. 그래서 긁어 오게 만든다.
//
//   목표가 "조회·댓글·좋아요를 늘리는 것"이면, 늘리는 방법은 하나뿐이다.
//   어떤 글이 잘 됐는지 알고 그쪽으로 글을 옮기는 것. 그러려면 숫자가 있어야 한다.
//
// 어떻게 모양을 알아내나
//   올린 글의 id를 따로 저장해 두지 않는다. 저장할 필요가 없다.
//   threads-content.mjs 는 "날짜만 주면 그날 글이 똑같이 나오는" 구조라,
//   글이 올라간 날짜로 다시 만들어 보면 그날 어떤 모양이었는지 알 수 있다.
//
// 수동 확인:  THREADS_USER_ID=... THREADS_TOKEN=... node scripts/threads-report.mjs
//             DAYS=30 을 붙이면 최근 30일을 본다(기본 14일).

import { buildTodayThread } from './threads-content.mjs';
import { seoulToday } from './fb-content.mjs';

const API = 'https://graph.threads.net/v1.0';

// 메트릭 이름은 Meta 쪽에서 소리 없이 바뀌는 일이 있다. 통째로 요청했다가
// 하나 때문에 전부 실패하면 아무것도 못 본다. 그래서 하나씩 따로 묻는다.
const METRICS = ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'];

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function get(path, params) {
  const url = new URL(`${API}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* HTML 오류가 올 때가 있다 */ }
  return { ok: res.ok && json && !json.error, status: res.status, json, text };
}

/* 글 하나의 성적. 메트릭마다 따로 물어서 되는 것만 모은다. */
async function insightsOf(mediaId, token) {
  const out = {};
  for (const m of METRICS) {
    const r = await get(`${mediaId}/insights`, { metric: m, access_token: token });
    if (!r.ok) continue;                       // 이 계정에서 안 되는 메트릭은 건너뛴다
    const row = (r.json.data || [])[0];
    if (!row) continue;
    const v = row.values && row.values[0] ? row.values[0].value : row.value;
    if (typeof v === 'number') out[m] = v;
  }
  return out;
}

/* 서울 날짜 문자열(YYYY-MM-DD) */
function dayOf(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

function pad(s, n) {
  const w = String(s);
  // 한글은 두 칸 너비로 친다. 안 그러면 표가 어긋난다.
  let len = 0;
  for (const ch of w) len += /[ᄀ-ᇿ㄰-㆏가-힯]/.test(ch) ? 2 : 1;
  return w + ' '.repeat(Math.max(0, n - len));
}

async function main() {
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_TOKEN;
  const days = Math.max(1, Math.min(90, Number(process.env.DAYS) || 14));

  if (!userId && !token) {
    console.log('⏸️  아직 스레드 연결 전입니다. 설정이 끝나면 성적표가 나옵니다.');
    return;
  }
  if (!userId || !token) {
    fail(`${!userId ? 'THREADS_USER_ID' : 'THREADS_TOKEN'}가 비어 있습니다.`);
  }

  const since = Date.now() - days * 86400000;

  // 내 최근 글 목록. 올린 id를 따로 저장해 두지 않아도 여기서 다 나온다.
  const list = await get(`${userId}/threads`, {
    fields: 'id,text,timestamp,permalink,is_quote_post',
    limit: '100',
    access_token: token,
  });
  if (!list.ok) {
    const e = list.json && list.json.error;
    fail(`글 목록을 가져오지 못했습니다 [HTTP ${list.status}]\n   `
      + (e ? `${e.message} (code: ${e.code})` : list.text.slice(0, 300))
      + '\n   토큰이 만료됐을 수 있습니다. 가이드 ⑥을 보세요.');
  }

  const posts = (list.json.data || [])
    .filter((p) => new Date(p.timestamp).getTime() >= since)
    .filter((p) => p.text && !p.text.includes('utm_source=threads'));   // 링크 댓글은 뺀다

  if (!posts.length) {
    console.log(`최근 ${days}일 안에 올라간 글이 없습니다.`);
    return;
  }

  // 각 글이 그날 어떤 모양이었는지 되살린다(날짜만으로 글이 정해지는 구조라 가능).
  const rows = [];
  for (const p of posts) {
    const key = dayOf(p.timestamp);
    let shape = '-', kind = '-';
    try {
      // 그날 정오를 기준으로 만들면 서울 날짜가 흔들리지 않는다.
      const made = await buildTodayThread(new Date(`${key}T03:00:00Z`));
      // 본문이 그대로면 자동 게시한 글이다. 다르면 손으로 올린 글이다.
      if (made.text.trim() === p.text.trim()) { shape = made.shape; kind = made.kind; }
      else { shape = '손으로'; kind = p.text.split('\n')[0].slice(0, 18); }
    } catch { /* 그날 글을 못 만들면 모양만 비워 둔다 */ }

    const ins = await insightsOf(p.id, token);
    rows.push({ key, shape, kind, permalink: p.permalink, ...ins });
  }

  rows.sort((a, b) => (a.key < b.key ? 1 : -1));

  // ── 글별 성적
  const lines = [];
  lines.push(`최근 ${days}일 · 글 ${rows.length}개`);
  lines.push('');
  lines.push(`${pad('날짜', 12)}${pad('모양', 12)}${pad('조회', 8)}${pad('좋아요', 8)}${pad('댓글', 8)}${pad('리포스트', 10)}소재`);
  lines.push('─'.repeat(78));
  rows.forEach((r) => {
    lines.push(
      pad(r.key.slice(5), 12) + pad(r.shape, 12)
      + pad(r.views ?? '-', 8) + pad(r.likes ?? '-', 8)
      + pad(r.replies ?? '-', 8) + pad(r.reposts ?? '-', 10) + r.kind,
    );
  });

  // ── 모양별 평균 — 이게 진짜 보고 싶은 숫자다
  const byShape = {};
  rows.forEach((r) => {
    const b = (byShape[r.shape] = byShape[r.shape] || { n: 0, views: 0, likes: 0, replies: 0 });
    b.n++; b.views += r.views || 0; b.likes += r.likes || 0; b.replies += r.replies || 0;
  });
  lines.push('');
  lines.push('모양별 평균 (어느 쪽으로 글을 옮길지 정하는 숫자)');
  lines.push('─'.repeat(78));
  lines.push(`${pad('모양', 12)}${pad('글수', 8)}${pad('조회', 10)}${pad('좋아요', 10)}댓글`);
  Object.entries(byShape)
    .sort((a, b) => (b[1].replies / b[1].n) - (a[1].replies / a[1].n))
    .forEach(([k, v]) => {
      lines.push(pad(k, 12) + pad(v.n, 8)
        + pad((v.views / v.n).toFixed(1), 10)
        + pad((v.likes / v.n).toFixed(1), 10)
        + (v.replies / v.n).toFixed(1));
    });

  // ── 팔로워
  const fol = await get(`${userId}/threads_insights`, {
    metric: 'followers_count', access_token: token,
  });
  if (fol.ok) {
    const row = (fol.json.data || [])[0];
    const v = row && (row.total_value ? row.total_value.value : (row.values && row.values[0] && row.values[0].value));
    if (v != null) { lines.push(''); lines.push(`팔로워 ${v}명`); }
  }

  lines.push('');
  lines.push('※ 조회는 올린 지 얼마 안 된 글일수록 낮게 나옵니다. 사흘은 지나야 비교할 만합니다.');
  lines.push('※ 댓글 수가 제일 중요한 숫자입니다. 스레드는 댓글이 붙어야 더 퍼뜨립니다.');

  const out = lines.join('\n');
  console.log(out);

  // Actions에서 돌 때는 요약 화면에도 적어 둔다. 로그를 뒤지지 않아도 보인다.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## 📊 스레드 성적표\n\n\`\`\`\n${out}\n\`\`\`\n\n`
      + rows.filter((r) => r.permalink).slice(0, 10)
        .map((r) => `- [${r.key} ${r.kind}](${r.permalink})`).join('\n') + '\n');
  }
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
