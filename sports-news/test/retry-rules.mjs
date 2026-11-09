// 무엇을 다시 보내고 무엇을 포기하는가.
//
// 2026-11-08. 글 업로드가 **Imunify360 403** 에 걸려 한 번에 죽었다.
// retry.mjs 의 기본 규칙이 "4xx 는 재시도하지 않는다" 였기 때문이다.
// 그런데 그 403 은 "권한이 없다"가 아니라 "이 IP 를 막았다"이고,
// 러너가 바뀌면 그냥 풀린다. 하루에 다섯 번 났고 그때마다 사람이 눌렀다.
//
// 가르는 기준은 **중복이 생길 수 있는가** 하나다. 이 검사가 그 선을 지킨다.
import assert from 'node:assert/strict';
import { 다시보낼까, describeBotProtection, WordPressError } from '../src/wordpress/client.mjs';
import { withRetry, 기본재시도판정 } from '../src/utils/retry.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[재시도 규칙]');

const 봇차단 = (method) => new WordPressError('막힘', { status: 403, botBlocked: true });
const 권한없음 = () => new WordPressError('권한 없음', { status: 403, botBlocked: false });
const 서버오류 = () => new WordPressError('서버', { status: 502 });
const 끊김 = () => new Error('fetch failed');

check('봇 차단은 읽기든 쓰기든 다시 보낸다 — 워드프레스에 닿기 전에 막혔다', () => {
  assert.equal(다시보낼까(봇차단(), 'GET'), true);
  assert.equal(다시보낼까(봇차단(), 'POST'), true);
  assert.equal(다시보낼까(봇차단(), 'PUT'), true);
});

check('진짜 권한 없음(403)은 다시 보내지 않는다 — 몇 번을 보내도 같다', () => {
  assert.equal(다시보낼까(권한없음(), 'GET'), false);
  assert.equal(다시보낼까(권한없음(), 'POST'), false);
});

check('읽기는 5xx·연결 끊김에 다시 보낸다', () => {
  assert.equal(다시보낼까(서버오류(), 'GET'), true);
  assert.equal(다시보낼까(끊김(), 'GET'), true);
});

// 이 검사가 이 파일의 **핵심**이다. 여기가 true 로 바뀌면 같은 글이
// 두 번 저장될 수 있다. 중복 글은 실패보다 나쁘다.
check('쓰기는 5xx·연결 끊김에 다시 보내지 않는다 — 중복 글을 막는다', () => {
  assert.equal(다시보낼까(서버오류(), 'POST'), false);
  assert.equal(다시보낼까(끊김(), 'POST'), false);
  assert.equal(다시보낼까(서버오류(), 'PUT'), false);
});

check('봇 차단 판정은 상태 코드가 아니라 문구로 한다', () => {
  assert.ok(describeBotProtection('Access denied by Imunify360 bot-protection'));
  assert.ok(describeBotProtection('bot protection'));
  assert.equal(describeBotProtection('Sorry, you are not allowed to do that.'), '');
});

check('기본 판정은 그대로다 — 다른 호출자가 쓰고 있다', () => {
  assert.equal(기본재시도판정(서버오류()), true);
  assert.equal(기본재시도판정(권한없음()), false);
});

await (async () => {
  let 횟수 = 0;
  const 시작 = Date.now();
  try {
    await withRetry(async () => { 횟수 += 1; throw 봇차단(); },
      { tries: 3, base: 1, retryable: (e) => 다시보낼까(e, 'POST') });
  } catch { /* 끝내 실패하는 것이 맞다 */ }
  check('봇 차단은 정해진 횟수만큼 다시 보내고 그래도 안 되면 포기한다', () => {
    assert.equal(횟수, 3, `3번 시도해야 하는데 ${횟수}번 했습니다`);
    assert.ok(Date.now() - 시작 < 5000, '기다리는 시간이 너무 깁니다');
  });

  let 쓰기횟수 = 0;
  try {
    await withRetry(async () => { 쓰기횟수 += 1; throw 서버오류(); },
      { tries: 3, base: 1, retryable: (e) => 다시보낼까(e, 'POST') });
  } catch { /* 한 번만 하고 포기하는 것이 맞다 */ }
  check('쓰기의 5xx 는 한 번만 보내고 포기한다', () => {
    assert.equal(쓰기횟수, 1, `1번만 보내야 하는데 ${쓰기횟수}번 보냈습니다`);
  });
})();

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
