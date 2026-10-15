// 스레드 답글 도우미 — 새 댓글을 모아서 답글 초안까지 써 준다
//
// ⚠️ 이 스크립트는 아무것도 올리지 않는다. 읽기만 한다.
//
// 왜 자동으로 답글을 달지 않는가
//   답글 자체는 공식 API가 지원한다(24시간에 1,000개). 자동 팔로우·자동 좋아요와
//   달리 그건 정책 위반이 아니다. 막히는 건 API가 아니라 내용이다.
//   스레드 스팸 정책이 보는 것은 "반복적인 콘텐츠"와 "진정성 없는 상호작용"인데,
//   템플릿 답글이 열 명에게 비슷하게 가면 정확히 그 모양이 된다. 사람 눈에도 보인다.
//
//   그리고 효성님 계정의 실제 숫자가 그 반대를 말한다. 프로필 방문이 붙은 글은
//   "겪은 일"을 쓰고 거기 달린 댓글에 진짜로 대화한 글들이었다. 대화를 봇이
//   가로채면 그게 끊긴다.
//
//   그래서 여기까지만 한다 — 새 댓글을 찾아 주고, 답글 초안을 써 주고,
//   올리는 건 사람이 한다. 저녁 10분 루틴이 2분으로 줄어드는 게 목표다.
//
// 이미 답한 댓글은 어떻게 걸러내나
//   어디에도 상태를 저장하지 않는다. 저장할 필요가 없다.
//   같은 대화에 "내가 쓴 답글"이 있고 그게 그 댓글을 가리키면(replied_to) 답한 것이다.
//   그래서 효성님이 답하면 다음 실행에서 자동으로 목록에서 빠진다.
//   안 답하면 계속 올라온다 — 그게 맞는 동작이다.
//
// 수동 확인:
//   THREADS_USER_ID=... THREADS_TOKEN=... ANTHROPIC_API_KEY=... node scripts/threads-replies.mjs
//   HOURS=72 을 붙이면 최근 72시간을 본다(기본 48시간).
//   ANTHROPIC_API_KEY 가 없으면 초안 없이 댓글 목록만 나온다.

import { APP, FACTS } from './fadecam-data.mjs';

const API = 'https://graph.threads.net/v1.0';
const CLAUDE = 'https://api.anthropic.com/v1/messages';

// 초안은 짧은 한국어 두세 줄이다. 무거운 모델이 필요한 일이 아니다.
// 리포 다른 도구들과 같은 기준(sports-news/src/ai/client.mjs)을 따른다.
const MODEL = process.env.THREADS_REPLY_MODEL || 'claude-sonnet-5';

// 한 번에 초안을 쓸 댓글 수 상한. 비용이 새지 않게 막아 둔다.
// 하루에 이보다 많이 달리면 좋은 문제다 — 그때 올리면 된다.
const MAX_DRAFTS = Math.max(1, Math.min(40, Number(process.env.MAX_DRAFTS) || 12));

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

/* 대화에 달린 답글 전부.
 *
 * 필드 이름은 Meta 쪽에서 소리 없이 바뀌는 일이 있다. 통째로 요청했다가 하나
 * 때문에 전부 실패하면 댓글을 아예 못 본다. 그래서 넓은 쪽부터 좁혀 가며 묻는다.
 * (성적표가 메트릭을 하나씩 묻는 것과 같은 이유다)
 */
const REPLY_FIELDS = [
  'id,text,username,timestamp,permalink,replied_to,is_reply_owned_by_me,hide_status',
  'id,text,username,timestamp,permalink,replied_to,is_reply_owned_by_me',
  'id,text,username,timestamp,replied_to',
  'id,text,username,timestamp',
];

async function repliesOf(postId, token) {
  // conversation 은 대댓글까지 한 줄로 펼쳐 준다. 없으면 replies 로 떨어진다.
  for (const edge of ['conversation', 'replies']) {
    for (const fields of REPLY_FIELDS) {
      const r = await get(`${postId}/${edge}`, { fields, limit: '100', access_token: token });
      if (r.ok) return { rows: r.json.data || [], edge, fields };
      const e = r.json && r.json.error;
      // 토큰·권한 문제는 필드를 줄여도 안 풀린다. 바로 올려 보낸다.
      if (e && [190, 10, 200].includes(e.code)) return { error: e };
    }
  }
  return { rows: [] };
}

/* 서울 시각 "10-15 19:04".
 * 로케일 포맷을 문자열로 치환하면 구분자가 로케일마다 달라 깨진다.
 * 칸을 따로 받아서 직접 조립한다. */
function at(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso)).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/* ── 초안 ─────────────────────────────────────────────────────
 * 한 번에 몰아서 부른다. 따로 부르면 비싸기도 하고, 서로를 못 봐서 열 개가
 * 다 비슷한 말로 나온다. 같이 보여 주고 "서로 겹치지 말라"고 시킨다.
 */
function draftPrompt(items) {
  const facts = [
    `앱 이름: ${APP.name}`,
    `하는 일: 사진을 찍을 때 며칠 뒤에 지울지 미리 정해두는 카메라`,
    `보관 기간 선택: ${FACTS.keeps.join(' / ')}`,
    `기한이 지나면 휴지통으로 가고 거기서 ${FACTS.trashDays}일 더 기다린다`,
    FACTS.free ? '무료' : '유료',
    FACTS.noAccount ? '계정·로그인·백업 없음. 서버를 아예 안 쓴다(사진이 인터넷으로 안 나가지만, 기기를 바꾸면 앱 안 사진은 안 따라온다)' : '',
    `앱에서 만드는 앨범 이름: ${FACTS.albumName}`,
    APP.androidUrl ? '아이폰·안드로이드 둘 다 있다' : '아직 아이폰만 있다. 안드로이드는 테스트 중',
  ].filter(Boolean).join('\n- ');

  return `내가 만든 앱 "${APP.name}"에 대해 스레드에 글을 올렸고, 아래 댓글들이 달렸어.
각 댓글에 내가 달 답글의 초안을 써 줘.

# 아는 사실 (여기 없는 건 모르는 것이다)
- ${facts}

# 답글을 쓰는 규칙
- 반말. 친구에게 말하듯이. 존댓말로 쓰지 마.
- 짧게. 한 줄에서 세 줄.
- 링크를 넣지 마. 앱 이름도 꼭 필요할 때만.
- 영업하지 마. 댓글이 물어본 것에만 답해.
- 모르는 건 모른다고 써. 위 '아는 사실'에 없는 숫자나 기능을 지어내지 마.
- 자연스러울 때는 되물어. 대화가 이어지면 글이 더 퍼진다. 억지로 물어보진 마.
- 여러 댓글의 초안이 서로 비슷한 말로 끝나지 않게 해. 똑같은 답을 복사한
  것처럼 보이면 그게 제일 안 좋다.
- 칭찬 댓글에는 고맙다고만 하고 길게 늘이지 마.
- 비판이나 불만에는 변명하지 말고 인정할 건 인정해.

# 댓글들
${items.map((x, i) => `
[${i + 1}]
내 글: ${x.postText.split('\n').filter(Boolean).slice(0, 3).join(' / ')}
댓글 쓴 사람: @${x.username || '알수없음'}
댓글: ${x.text}`).join('\n')}

# 내보내는 형식
JSON 배열 하나만. 설명이나 코드펜스 없이.
[{"n":1,"draft":"답글 초안"},{"n":2,"draft":"..."}]`;
}

async function drafts(items, key) {
  const res = await fetch(CLAUDE, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: draftPrompt(items) }],
    }),
  });
  if (!res.ok) {
    // 초안이 없어도 댓글 목록은 보여야 한다. 죽이지 않고 비워서 돌려준다.
    console.error(`   ⚠️ 초안 생성 실패 [HTTP ${res.status}] — 댓글 목록만 보여 줍니다.`);
    return {};
  }
  const json = await res.json();
  const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  // 모델이 코드펜스를 붙여 보낼 때가 있다. 대괄호만 떼어 읽는다.
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) {
    console.error('   ⚠️ 초안 형식을 읽지 못했습니다 — 댓글 목록만 보여 줍니다.');
    return {};
  }
  const out = {};
  try {
    JSON.parse(m[0]).forEach((r) => { if (r && r.n && r.draft) out[r.n] = String(r.draft); });
  } catch {
    console.error('   ⚠️ 초안 JSON 파싱 실패 — 댓글 목록만 보여 줍니다.');
  }
  return out;
}

async function main() {
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_TOKEN;
  const aiKey = process.env.ANTHROPIC_API_KEY;
  const hours = Math.max(1, Math.min(720, Number(process.env.HOURS) || 48));

  if (!userId && !token) {
    console.log('⏸️  아직 스레드 연결 전입니다 (THREADS_USER_ID / THREADS_TOKEN 미등록).');
    console.log('   스레드_자동홍보_설정가이드.md 를 따라 두 개를 등록하면 댓글을 읽어 옵니다.');
    return;
  }
  if (!userId || !token) {
    fail(`${!userId ? 'THREADS_USER_ID' : 'THREADS_TOKEN'}가 비어 있습니다.`);
  }

  const since = Date.now() - hours * 3600000;

  // 내 최근 글. 댓글은 글에 달리니 글부터 찾는다.
  const list = await get(`${userId}/threads`, {
    fields: 'id,text,timestamp,permalink',
    limit: '50',
    access_token: token,
  });
  if (!list.ok) {
    const e = list.json && list.json.error;
    fail(`글 목록을 가져오지 못했습니다 [HTTP ${list.status}]\n   `
      + (e ? `${e.message} (code: ${e.code})` : list.text.slice(0, 300))
      + '\n   토큰이 만료됐을 수 있습니다. 가이드 ⑥을 보세요.');
  }

  // 댓글은 글이 올라간 뒤 며칠까지도 달린다. 그래서 글은 창보다 넉넉히 본다.
  const postSince = Date.now() - Math.max(hours, 24 * 14) * 3600000;
  const posts = (list.json.data || []).filter((p) => new Date(p.timestamp).getTime() >= postSince);

  const pending = [];
  let scanned = 0;
  for (const p of posts) {
    const r = await repliesOf(p.id, token);
    if (r.error) {
      const e = r.error;
      fail(`댓글을 읽을 권한이 없습니다 [code: ${e.code}]\n   ${e.message}\n`
        + '   → 토큰에 threads_manage_replies 권한이 붙어 있어야 합니다.\n'
        + '      메타 앱 설정에서 권한을 켜고 토큰을 다시 발급하세요(가이드 ②-5, ③).');
    }
    const rows = r.rows || [];
    if (!rows.length) continue;
    scanned += rows.length;

    // 내가 어느 댓글에 답했는지. 이게 "이미 처리함" 표시를 대신한다.
    const answered = new Set();
    rows.forEach((x) => {
      if (x.is_reply_owned_by_me && x.replied_to && x.replied_to.id) answered.add(x.replied_to.id);
    });

    rows.forEach((x) => {
      if (x.is_reply_owned_by_me) return;                       // 내 답글
      if (x.hide_status && x.hide_status !== 'NOT_HUSHED') return; // 숨긴 댓글
      if (!x.text || !x.text.trim()) return;                    // 사진만 달린 것
      if (answered.has(x.id)) return;                           // 이미 답했다
      if (new Date(x.timestamp).getTime() < since) return;      // 창 밖
      pending.push({
        id: x.id, text: x.text.trim(), username: x.username,
        timestamp: x.timestamp, permalink: x.permalink || p.permalink,
        postText: p.text || '', postLink: p.permalink,
      });
    });
  }

  pending.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const lines = [];
  if (!pending.length) {
    lines.push(`최근 ${hours}시간 안에 답할 댓글이 없습니다. (글 ${posts.length}개 · 댓글 ${scanned}개 확인)`);
    const out = lines.join('\n');
    console.log(out);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 💬 스레드 답글 도우미\n\n${out}\n`);
    }
    return;
  }

  // 초안. 상한을 넘는 건 목록에만 올린다.
  const toDraft = pending.slice(0, MAX_DRAFTS);
  let made = {};
  if (aiKey) {
    made = await drafts(toDraft, aiKey);
  } else {
    console.error('   ⚠️ ANTHROPIC_API_KEY 가 없어 초안 없이 목록만 보여 줍니다.');
  }

  lines.push(`답할 댓글 ${pending.length}개 (최근 ${hours}시간)`);
  if (pending.length > MAX_DRAFTS) lines.push(`초안은 앞의 ${MAX_DRAFTS}개까지만 썼습니다.`);
  lines.push('');

  pending.forEach((x, i) => {
    const draft = made[toDraft.indexOf(x) + 1];
    lines.push(`${'─'.repeat(52)}`);
    lines.push(`${i + 1}. @${x.username || '알수없음'} · ${at(x.timestamp)}`);
    lines.push(`   내 글: ${(x.postText.split('\n').filter(Boolean)[0] || '').slice(0, 40)}`);
    lines.push('');
    x.text.split('\n').forEach((l) => lines.push(`   💬 ${l}`));
    lines.push('');
    if (draft) {
      lines.push('   ✍️ 초안:');
      draft.split('\n').forEach((l) => lines.push(`      ${l}`));
    } else {
      lines.push('   ✍️ 초안 없음 — 직접 쓰세요.');
    }
    if (x.permalink) lines.push(`   🔗 ${x.permalink}`);
    lines.push('');
  });

  lines.push('※ 초안은 초안입니다. 그대로 올리지 말고 한 번 읽고 고치세요 —');
  lines.push('   고친 흔적이 있는 답글이 봇 답글과 갈리는 지점입니다.');
  lines.push('※ 답글을 달면 다음 실행에서 이 목록에서 자동으로 빠집니다.');

  const out = lines.join('\n');
  console.log(out);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    // 초안은 복사해서 쓰는 것이라 따로 코드블록으로 빼 둔다.
    const cards = pending.slice(0, MAX_DRAFTS).map((x, i) => {
      const draft = made[i + 1];
      return `### ${i + 1}. @${x.username || '알수없음'} · ${at(x.timestamp)}\n\n`
        + `> ${x.text.split('\n').join('\n> ')}\n\n`
        + (draft ? `**초안** (복사해서 쓰세요)\n\n\`\`\`\n${draft}\n\`\`\`\n\n` : '초안 없음 — 직접 쓰세요.\n\n')
        + (x.permalink ? `[댓글 열기 ›](${x.permalink})\n` : '');
    }).join('\n');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## 💬 스레드 답글 도우미 — 답할 댓글 ${pending.length}개\n\n`
      + '올리는 건 자동으로 하지 않습니다. 초안을 읽고 고쳐서 직접 달아 주세요.\n\n'
      + `${cards}\n`
      + '---\n\n답글을 달면 다음 실행에서 목록에서 자동으로 빠집니다.\n');
  }
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
