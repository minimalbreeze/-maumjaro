// 페이스북 페이지 자동 게시
//
// GitHub Actions가 매일 아침 이 파일을 실행한다.
// 토큰은 리포에 절대 두지 않는다. GitHub Secrets(FB_PAGE_TOKEN)로만 들어온다.
//
// 수동 확인:  DRY_RUN=true node scripts/fb-post.mjs   ← 문구만 출력, 게시 안 함

import { buildTodayPost } from './fb-content.mjs';

const GRAPH_VERSION = 'v21.0';

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const dryRun = /^(1|true|yes)$/i.test(process.env.DRY_RUN || '');
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;

  const post = await buildTodayPost();

  // 문구는 항상 로그에 남긴다. 나중에 "그날 뭐가 올라갔지?"를 확인할 수 있어야 한다.
  // 토큰은 어디에도 출력하지 않는다.
  console.log('─'.repeat(52));
  console.log(`📅 ${post.today.key} (한국시간 기준)`);
  console.log(`💊 ${post.medicine.name} [${post.medicine.rarity}]${post.medicine.limited ? ' · 시즌한정' : ''}`);
  console.log('─'.repeat(52));
  console.log(post.message);
  console.log('─'.repeat(52));

  if (dryRun) {
    console.log('\n🧪 DRY RUN — 실제로 올리지 않았습니다.');
    return;
  }

  // 아직 Secret을 등록하기 전이라면 실패로 처리하지 않는다. 그렇게 하면 설정을
  // 끝내기 전까지 매일 새벽 실패 알림이 날아온다. 대신 "설정된 뒤에 고장난 경우"는
  // 반드시 빨간불이 떠야 하므로, 둘 중 하나만 있는 상태는 실패로 본다.
  if (!pageId && !token) {
    console.log('\n⏸️  아직 페이스북 연결 전입니다 (FB_PAGE_ID / FB_PAGE_TOKEN 미등록).');
    console.log('   리포 Settings → Secrets and variables → Actions 에서 두 개를 등록하면');
    console.log('   다음 실행부터 자동으로 올라갑니다. 위 문구는 미리보기입니다.');
    return;
  }
  if (!pageId || !token) {
    fail(`${!pageId ? 'FB_PAGE_ID' : 'FB_PAGE_TOKEN'}가 비어 있습니다.\n`
      + '   리포 Settings → Secrets and variables → Actions 에서 두 개 모두 등록해야 합니다.');
  }

  // 토큰은 URL이 아니라 본문(body)에 담는다. 오류 메시지나 로그에 주소가 찍혀도
  // 토큰이 같이 새어 나가지 않게 하려는 것이다.
  const body = new URLSearchParams({
    message: post.message,
    link: post.link,
    access_token: token,
  });

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 페이스북이 HTML 오류를 줄 때가 있다 */ }

  if (!res.ok || !json || json.error) {
    const e = json && json.error;
    const detail = e
      ? `${e.message} (type: ${e.type}, code: ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})`
      : text.slice(0, 400);
    fail(`게시 실패 [HTTP ${res.status}]\n   ${detail}\n\n`
      + '   자주 나오는 원인:\n'
      + '   · code 190  → 토큰 만료/무효. 페이지 토큰을 다시 발급받아 Secret을 갱신하세요.\n'
      + '   · code 200  → 권한 부족. pages_manage_posts 권한이 붙은 토큰인지 확인하세요.\n'
      + '   · code 100  → FB_PAGE_ID가 페이지 ID가 아닐 수 있습니다(개인 계정 ID 아님).');
  }

  console.log(`\n✅ 게시 완료 — post id: ${json.id}`);
  console.log(`   https://www.facebook.com/${String(json.id).replace('_', '/posts/')}`);
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
