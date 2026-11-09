// 네트워크 호출 재시도. 지수 백오프.
//
// 기본 규칙: 4xx(인증 실패·잘못된 요청)는 재시도해도 같은 결과이므로 즉시
// 포기한다. 429와 5xx, 그리고 연결 오류만 다시 시도한다.
//
// 2026-11-08 에 `retryable` 을 열었다. 기본 규칙으로는 **Imunify360 봇 차단
// (403)** 을 못 넘긴다 — 403 이라 한 번에 포기한다. 그런데 그건 "권한이
// 없다"가 아니라 "이 IP 를 막았다"이고, 러너가 바뀌면 그냥 풀린다.
// 실제로 하루에 다섯 번 났고 그때마다 사람이 다시 돌렸다.
//
// ⚠️ 그렇다고 전부 재시도하면 안 된다. **글을 만드는 POST 가 보내진 뒤
//    응답만 끊긴 경우, 다시 보내면 같은 글이 두 번 저장된다.** 중복 글은
//    실패보다 나쁘다. 그래서 무엇을 다시 보낼지는 부르는 쪽이 정한다.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 기본 판정 — 연결 오류·429·5xx 만 다시 보낸다. */
export function 기본재시도판정(err) {
  const status = err?.status ?? err?.statusCode;
  return status === undefined || status === 429 || status >= 500;
}

export async function withRetry(fn, {
  tries = 3,
  base = 1000,
  label = '요청',
  onRetry,
  // 무엇을 다시 보낼지. 부르는 쪽이 바꿀 수 있다 — 읽기와 쓰기가 다르다.
  retryable = 기본재시도판정,
} = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.statusCode;
      if (!retryable(err) || i === tries - 1) break;
      const wait = base * 2 ** i;
      onRetry?.(`${label} 실패 (${status ?? err.code ?? 'network'}) — ${wait / 1000}초 후 재시도 ${i + 2}/${tries}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/** 여러 작업을 돌리되 하나가 실패해도 나머지를 계속 진행한다. */
export async function settleAll(items, worker) {
  const results = [];
  for (const item of items) {
    try {
      results.push({ ok: true, item, value: await worker(item) });
    } catch (err) {
      results.push({ ok: false, item, error: err });
    }
  }
  return results;
}
