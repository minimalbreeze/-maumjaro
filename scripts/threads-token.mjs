// 스레드 장기 토큰 갱신
//
// 왜 필요한가
//   페이스북 페이지 토큰은 만료되지 않지만, 스레드 장기 토큰은 60일짜리다.
//   그냥 두면 60일 뒤 어느 날 자동 게시가 조용히 멈춘다.
//   이 스크립트가 토큰을 갱신해 다시 60일로 늘린다.
//
// 어떻게 쓰나 — 두 가지 길이 있다
//   ① 손으로 (기본)
//      로컬에서  THREADS_TOKEN=xxx node scripts/threads-token.mjs
//      출력된 새 토큰을 GitHub Secret에 붙여 넣는다. 두 달에 한 번.
//   ② 자동 (선택)
//      .github/workflows/threads-token.yml 이 매주 돌면서 갱신하고 Secret까지
//      바꿔 준다. 단 Secret을 고치려면 PAT(개인 액세스 토큰)가 하나 필요하다.
//      가이드의 "⑥ 토큰이 멈추지 않게" 참고.
//
// 주의: 갱신된 토큰은 발급 후 24시간이 지나야 다시 갱신할 수 있다.
//       매일 돌려도 24시간 안쪽의 갱신 요청은 그냥 거절된다(고장이 아니다).

const API = 'https://graph.threads.net';

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const token = process.env.THREADS_TOKEN;
  if (!token) {
    fail('THREADS_TOKEN이 비어 있습니다.\n'
      + '   THREADS_TOKEN=받은토큰 node scripts/threads-token.mjs 처럼 넣어 주세요.');
  }

  const url = new URL(`${API}/refresh_access_token`);
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', token);

  const res = await fetch(url);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* HTML 오류가 올 때가 있다 */ }

  if (!res.ok || !json || json.error || !json.access_token) {
    const e = json && json.error;
    // 24시간이 안 지났을 때는 고장이 아니다. 자동 워크플로가 매번 빨간불이 되면
    // 진짜 고장났을 때 알아채지 못한다.
    if (e && /24 hours|too soon|not.*old enough/i.test(e.message || '')) {
      console.log('⏸️  아직 갱신할 때가 아닙니다 (발급 후 24시간이 지나야 합니다). 정상입니다.');
      return;
    }
    fail(`토큰 갱신 실패 [HTTP ${res.status}]\n   `
      + (e ? `${e.message} (code: ${e.code})` : text.slice(0, 300))
      + '\n   토큰이 이미 만료됐다면 갱신이 안 됩니다. 가이드 ③을 처음부터 다시 하세요.');
  }

  const days = json.expires_in ? Math.round(json.expires_in / 86400) : null;
  console.log(`✅ 갱신 완료${days ? ` — 앞으로 ${days}일 더 씁니다` : ''}`);

  // 새 토큰은 GitHub Actions 로그에 절대 찍지 않는다. 로그는 리포가 public이면
  // 누구나 본다. 로컬에서 직접 돌릴 때만 화면에 보여 준다.
  if (process.env.GITHUB_ACTIONS) {
    // 워크플로가 Secret을 갱신할 수 있도록 출력으로만 넘긴다(마스킹된다).
    console.log('::add-mask::' + json.access_token);
    if (process.env.GITHUB_OUTPUT) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GITHUB_OUTPUT, `token=${json.access_token}\n`);
    }
    console.log('   새 토큰은 로그에 찍지 않았습니다(워크플로가 Secret에 바로 넣습니다).');
  } else {
    console.log('\n새 토큰 — 이 값을 GitHub Secret THREADS_TOKEN 에 덮어쓰세요:\n');
    console.log(json.access_token);
    console.log('\n⚠️ 이 값을 채팅이나 메모장에 남기지 마세요.');
  }
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
