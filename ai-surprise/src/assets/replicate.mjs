// Replicate 이미지 생성 클라이언트 (기획서 7번).
//
// ─────────────────────────────────────────────────────────────
// 왜 Replicate인가
// ─────────────────────────────────────────────────────────────
//
// 이미지 모델은 바뀐다. 더 싸고 좋은 게 몇 달마다 나온다. Google이나
// OpenAI에 직접 붙으면 모델이 하나로 고정되고, 갈아타려면 코드를 다시 쓴다.
// Replicate은 모델 이름만 바꾸면 되므로 그 비용이 없다.
//
// 이 채널은 1편에 이미지가 40~50장 든다. 모델을 바꿀 수 있다는 건
// 비용을 몇 배로 바꿀 수 있다는 뜻이고, 그게 이 사업에서 작은 차이가 아니다.
//
// ─────────────────────────────────────────────────────────────
// SDK를 안 쓴다
// ─────────────────────────────────────────────────────────────
//
// 우리가 쓰는 건 엔드포인트 두 개뿐이다(예측 만들기, 예측 조회). SDK를
// 깔면 의존성이 늘고, 정작 우리가 제어하고 싶은 것(재시도 횟수, 대기 시간,
// 실패했을 때 무엇을 남길지)은 SDK 안에 숨는다. fetch로 직접 부른다.

const API_ROOT = 'https://api.replicate.com/v1';

/**
 * 쓸 수 있는 모델.
 *
 * 'schnell'은 빠르고 싸다. 'dev'는 느리고 비싸지만 묘사가 정확하다.
 * 우리 화면은 인물 클로즈업이 아니라 공간(빈 복도, 멈춘 시계)이라
 * schnell로도 충분한 경우가 많다. 처음엔 schnell로 한 편 뽑아보고
 * 부족하면 dev로 올린다 — 반대로 하면 돈을 먼저 쓴 뒤에 알게 된다.
 *
 * usdPerImage는 **추정치다.** 실제 청구액은 Replicate 가격 페이지와
 * 계정의 사용량 화면에서 확인해야 한다. 여기 숫자는 "상한을 걸기 위한
 * 기준"이지 청구서가 아니다.
 */
export const IMAGE_MODELS = {
  schnell: {
    key: 'schnell',
    model: 'black-forest-labs/flux-schnell',
    usdPerImage: 0.003,
    note: '빠르고 싸다. 처음엔 이걸로.',
    input: (prompt, { aspectRatio }) => ({
      prompt,
      aspect_ratio: aspectRatio,
      output_format: 'png',
      num_outputs: 1,
      go_fast: true,
      megapixels: '1',
    }),
  },
  dev: {
    key: 'dev',
    model: 'black-forest-labs/flux-dev',
    usdPerImage: 0.025,
    note: '느리고 비싸지만 묘사가 정확하다.',
    input: (prompt, { aspectRatio }) => ({
      prompt,
      aspect_ratio: aspectRatio,
      output_format: 'png',
      num_outputs: 1,
      guidance: 3,
      num_inference_steps: 28,
    }),
  },
};

export const DEFAULT_IMAGE_MODEL = 'schnell';

/** 모델 이름 → 설정. 모르는 이름이면 분명한 오류로 막는다. */
export function modelFor(key) {
  const m = IMAGE_MODELS[key || DEFAULT_IMAGE_MODEL];
  if (!m) {
    throw new Error(
      `모르는 이미지 모델입니다: "${key}". 쓸 수 있는 것: ${Object.keys(IMAGE_MODELS).join(', ')}`
    );
  }
  return m;
}

/** 예측이 끝났는지. */
export function isDone(status) {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

/**
 * 예측 결과에서 이미지 URL 하나를 꺼낸다.
 *
 * Replicate의 output은 모델마다 모양이 다르다 — 문자열일 때도 있고
 * 배열일 때도 있다. 여기서 한 번에 흡수한다.
 */
export function firstUrl(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const found = output.find((o) => typeof o === 'string' && o.startsWith('http'));
    return found || null;
  }
  return null;
}

/**
 * Replicate 클라이언트를 만든다.
 *
 * @param token    API 토큰 (r8_...)
 * @param fetchFn  테스트에서 갈아끼우기 위한 주입점. 기본은 전역 fetch.
 * @param sleepFn  테스트에서 대기를 건너뛰기 위한 주입점.
 */
export function createClient({
  token,
  fetchFn = globalThis.fetch,
  sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
  pollIntervalMs = 2000,
  maxWaitMs = 180000,
} = {}) {
  if (!token) {
    const err = new Error(
      'REPLICATE_API_TOKEN 이 없습니다. https://replicate.com/account/api-tokens 에서 발급해 ' +
        'GitHub 리포 Settings → Secrets and variables → Actions 에 REPLICATE_API_TOKEN 으로 넣으세요.'
    );
    err.code = 'REPLICATE_TOKEN_MISSING';
    throw err;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  async function request(url, init) {
    const res = await fetchFn(url, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // JSON이 아니면 그대로 둔다. 아래에서 오류 메시지에 쓴다.
    }

    if (!res.ok) {
      const err = new Error(
        `Replicate ${res.status}: ${body?.detail || body?.title || text.slice(0, 200) || '(본문 없음)'}`
      );
      err.status = res.status;
      // 429(한도)와 5xx는 다시 걸어볼 만하다. 4xx는 다시 걸어도 같은 답이 온다.
      err.retryable = res.status === 429 || res.status >= 500;
      throw err;
    }
    return body;
  }

  /**
   * 이미지 하나를 만든다. 끝날 때까지 기다린다.
   *
   * `Prefer: wait` 를 쓰면 Replicate이 최대 60초까지 붙들고 있다가 끝난
   * 결과를 바로 준다. 대부분 한 번에 끝나고, 안 끝나면 아래에서 폴링한다.
   */
  async function generate(prompt, { modelKey = DEFAULT_IMAGE_MODEL, aspectRatio = '16:9' } = {}) {
    const m = modelFor(modelKey);
    let prediction = await request(`${API_ROOT}/models/${m.model}/predictions`, {
      method: 'POST',
      headers: { Prefer: 'wait' },
      body: JSON.stringify({ input: m.input(prompt, { aspectRatio }) }),
    });

    const deadline = Date.now() + maxWaitMs;
    while (prediction && !isDone(prediction.status)) {
      if (Date.now() > deadline) {
        const err = new Error(`이미지 생성이 ${Math.round(maxWaitMs / 1000)}초 안에 끝나지 않았습니다.`);
        err.retryable = true;
        throw err;
      }
      await sleepFn(pollIntervalMs);
      const next = prediction.urls?.get || `${API_ROOT}/predictions/${prediction.id}`;
      prediction = await request(next, { method: 'GET' });
    }

    if (prediction?.status !== 'succeeded') {
      const err = new Error(`이미지 생성 실패 (${prediction?.status}): ${prediction?.error || '이유 없음'}`);
      // 모델이 거부한 건(안전 필터 등) 다시 걸어도 같다. 하지만 일시적
      // 실패와 구분할 방법이 없으므로 한 번은 다시 걸어본다.
      err.retryable = true;
      throw err;
    }

    const url = firstUrl(prediction.output);
    if (!url) {
      throw new Error(`결과에 이미지 주소가 없습니다: ${JSON.stringify(prediction.output).slice(0, 200)}`);
    }

    return { url, usdEstimate: m.usdPerImage, model: m.model, predictionId: prediction.id };
  }

  /** 만들어진 이미지를 내려받아 바이트로 돌려준다. */
  async function download(url) {
    const res = await fetchFn(url);
    if (!res.ok) {
      const err = new Error(`이미지 내려받기 실패 ${res.status}: ${url.slice(0, 80)}`);
      err.retryable = res.status === 429 || res.status >= 500;
      throw err;
    }
    return Buffer.from(await res.arrayBuffer());
  }

  return { generate, download };
}
