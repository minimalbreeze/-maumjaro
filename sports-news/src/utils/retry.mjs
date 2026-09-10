// 네트워크 호출 재시도. 지수 백오프.
//
// 4xx(인증 실패·잘못된 요청)는 재시도해도 같은 결과이므로 즉시 포기한다.
// 429와 5xx, 그리고 연결 오류만 다시 시도한다.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withRetry(fn, { tries = 3, base = 1000, label = '요청', onRetry } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status ?? err?.statusCode;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (!retryable || i === tries - 1) break;
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
