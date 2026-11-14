// 스레드 자동 게시
//
// GitHub Actions가 매일 이 파일을 실행한다.
// 토큰은 리포에 절대 두지 않는다. GitHub Secrets(THREADS_TOKEN)로만 들어온다.
//
// 수동 확인:  DRY_RUN=true node scripts/threads-post.mjs   ← 글만 출력, 올리지 않음
//
// 스레드는 페이스북과 올리는 방법이 다르다. 한 번에 올라가지 않고 두 걸음이다.
//   ① 컨테이너를 만든다 (POST /threads)        → creation_id
//   ② 그 컨테이너를 게시한다 (POST /threads_publish) → 글 id
// 댓글도 같은 두 걸음을 반복하되 reply_to_id에 본문 글 id를 넣는다.
//
// 본문과 댓글을 왜 붙여서 올리는가
//   스레드는 올린 뒤 첫 1시간의 답글 수가 도달을 크게 가른다(스레드양식 5번).
//   링크가 든 댓글이 늦게 붙으면 그 시간을 놓친다. 그래서 본문 게시 직후 바로 단다.

/* 어떤 글을 올릴지는 CONTENT 로 고른다. 게시하는 일(컨테이너 만들고 올리고
 * 댓글 붙이는 것)은 어느 쪽이든 똑같아서 이 파일 하나로 둔다.
 *   CONTENT=fadecam  페이드캠 홍보 (scripts/fadecam-content.mjs)
 *   CONTENT=maum     맘운자로     (scripts/threads-content.mjs)  ← 기본값 */
const SOURCES = {
  fadecam: './fadecam-content.mjs',
  maum: './threads-content.mjs',
};

const API = 'https://graph.threads.net/v1.0';

// 컨테이너를 만든 뒤 바로 게시하면 아직 준비가 안 됐다는 오류가 날 수 있다.
// Meta 문서가 권하는 대기 시간은 30초지만, 글만 올리는 경우는 훨씬 빨리 끝난다.
// 짧게 기다렸다가 실패하면 늘려가며 다시 시도한다.
const PUBLISH_WAITS_MS = [3000, 7000, 15000, 30000];

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 오류를 한국어로 풀어 준다. 새벽에 혼자 로그를 보게 되므로 영어 원문만 찍으면 쓸모없다. */
function explain(e) {
  if (!e) return '';
  const c = e.code;
  if (c === 190) return '   → 토큰이 만료·무효입니다. 가이드 ③을 다시 해서 THREADS_TOKEN을 갱신하세요.';
  if (c === 10 || c === 200) return '   → 권한 부족입니다. threads_basic / threads_content_publish 가 붙은 토큰인지 확인하세요.';
  if (c === 100) return '   → THREADS_USER_ID가 잘못됐을 수 있습니다. 스레드 사용자 ID여야 합니다(페이스북 페이지 ID 아님).';
  if (c === 4 || c === 32 || c === 613) return '   → 호출 한도에 걸렸습니다. 24시간에 글 250개·답글 1,000개가 상한입니다.';
  return '';
}

async function call(path, params) {
  // 토큰은 URL이 아니라 본문에 담는다. 오류 메시지에 주소가 찍혀도 토큰이 새지 않게.
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* HTML 오류가 올 때가 있다 */ }
  return { ok: res.ok && json && !json.error, status: res.status, json, text };
}

/* 컨테이너 생성 → 게시. 게시는 준비될 때까지 몇 번 기다렸다 다시 해 본다. */
async function publish(userId, token, fields, what) {
  const made = await call(`${userId}/threads`, { ...fields, access_token: token });
  if (!made.ok) {
    const e = made.json && made.json.error;
    fail(`${what} 컨테이너 생성 실패 [HTTP ${made.status}]\n   `
      + (e ? `${e.message} (code: ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})` : made.text.slice(0, 300))
      + `\n${explain(e)}`);
  }
  const creationId = made.json.id;

  let last = null;
  for (const wait of PUBLISH_WAITS_MS) {
    await sleep(wait);
    const out = await call(`${userId}/threads_publish`, { creation_id: creationId, access_token: token });
    if (out.ok) return out.json.id;
    last = out;
    const e = out.json && out.json.error;
    // 준비가 덜 된 경우만 다시 시도한다. 권한·토큰 문제는 기다려도 안 풀린다.
    if (e && [190, 10, 200, 100].includes(e.code)) break;
    console.log(`   …${what} 게시 대기 중 (다시 시도)`);
  }
  const e = last && last.json && last.json.error;
  fail(`${what} 게시 실패 [HTTP ${last ? last.status : '?'}]\n   `
    + (e ? `${e.message} (code: ${e.code})` : (last ? last.text.slice(0, 300) : ''))
    + `\n${explain(e)}`);
}

async function main() {
  const dryRun = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_TOKEN;
  const which = (process.env.CONTENT || 'maum').toLowerCase();

  const src = SOURCES[which];
  if (!src) {
    fail(`CONTENT=${which} 는 모르는 값입니다. ${Object.keys(SOURCES).join(' / ')} 중에서 고르세요.`);
  }
  const mod = await import(src);
  const post = await mod.buildTodayThread();

  // 올라간 글은 항상 로그에 남긴다. 나중에 "그날 뭐가 올라갔지?"를 볼 수 있어야 한다.
  // 토큰은 어디에도 출력하지 않는다.
  console.log('─'.repeat(52));
  console.log(`📅 ${post.today.key} (한국시간) · ${which} · ${post.shape} · ${post.kind}`);
  console.log('─'.repeat(52));
  console.log(post.text);
  console.log(`\n   (본문 ${post.text.length}자 · 링크 없음)`);
  console.log('─'.repeat(52));
  console.log('💬 댓글 (본문 올린 직후에 붙습니다)');
  console.log(post.reply);
  console.log('─'.repeat(52));

  if (dryRun) {
    console.log('\n🧪 DRY RUN — 실제로 올리지 않았습니다.');
    return;
  }

  // 아직 Secret 등록 전이면 실패로 치지 않는다. 그러면 설정을 끝낼 때까지
  // 매일 실패 알림이 온다. 단 둘 중 하나만 있는 상태는 설정 실수이므로 실패다.
  if (!userId && !token) {
    console.log('\n⏸️  아직 스레드 연결 전입니다 (THREADS_USER_ID / THREADS_TOKEN 미등록).');
    console.log('   스레드_자동홍보_설정가이드.md 를 따라 두 개를 등록하면');
    console.log('   다음 실행부터 자동으로 올라갑니다. 위 글은 미리보기입니다.');
    return;
  }
  if (!userId || !token) {
    fail(`${!userId ? 'THREADS_USER_ID' : 'THREADS_TOKEN'}가 비어 있습니다.\n`
      + '   리포 Settings → Secrets and variables → Actions 에서 두 개 모두 등록해야 합니다.');
  }

  const postId = await publish(userId, token, { media_type: 'TEXT', text: post.text }, '본문');
  console.log(`\n✅ 본문 게시 완료 — id: ${postId}`);

  // 댓글이 실패해도 본문은 이미 올라가 있다. 링크가 빠진 채로 남으므로
  // 반드시 빨간불이 떠야 한다(publish 안에서 실패 시 종료된다).
  const replyId = await publish(
    userId, token,
    { media_type: 'TEXT', text: post.reply, reply_to_id: postId },
    '댓글',
  );
  console.log(`✅ 댓글 게시 완료 — id: ${replyId}`);
  console.log(`\n   링크: ${post.link}`);
  console.log('   이제 남이 답글을 달면 거기에만 대댓글로 답하세요.');
  console.log('   내 댓글을 더 달수록 남의 답글 자리가 줄어듭니다(스레드양식).');
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
