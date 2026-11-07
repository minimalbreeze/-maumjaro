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
 * 참조 사진에서 얼굴을 얼마나 세게 가져올지 (0~1, 기본 1).
 *
 * 1 이면 사진 얼굴이 거의 그대로 들어가 **화풍을 이긴다.** 몸과 배경만
 * 그림이 되고 얼굴만 사진이라 붕 떠 보인다.
 *
 * 0.7 은 **첫 시도값**이었다. 2026-11-07 실행 #65 에서 결과를 처음
 * 봤다 — 그 전까지는 사진이 레코드까지 가지 않아서 참조 모델이 아예
 * 안 불렸다(#418).
 *
 * 운영자가 타자 그림을 보고 말했다.
 *
 *     "선수 얼굴 부분이 만화 같지 않고 어색하다"
 *
 * 맞다. 얼굴만 매끈하게 렌더된 사진처럼 나오고 몸과 배경은 납작한
 * 만화라 따로 놀았다. 0.7 도 여전히 화풍을 이겼다.
 *
 * 그래서 내린다. 한 번에 안 끝났다 — 운영자가 화면을 더 짚었다.
 *
 *     "여기도 얼굴이 너무 만화 같지 않아 어색하다"
 *     "심지어 여기는 더하다. 좀더 만화 같이 자연스럽게 부탁한다."
 *
 * 그래서 **0.35 까지 내린다.** 참조 모델은 실제 얼굴로 배운 것이라,
 * 세기가 조금만 남아도 그 자리만 사진처럼 그린다. 어중간하게 두면
 * 닮지도 않으면서 어색하기만 하다 — 제일 나쁜 자리다.
 *
 * 닮음이 꽤 약해진다. 그 값을 치르기로 한 것이다. 운영자가 고른 것은
 * **"만화 같이 자연스럽게"** 쪽이다. 우리 채널에서는 그쪽이 맞다 — 지브리 결로 가기로 한 것이
 * 보기 좋으라고만 한 결정이 아니라 유튜브 정책 방어이기도 하다
 * (스포츠영상/유튜브정책.md). 얼굴이 사진 같아지면 그 방어가 무너진다.
 *
 * ⚠️ 다음에 조절할 때도 **한 번에 하나만** 바꾼다. id_weight 와
 *    start_step 을 같이 움직이면 무엇이 효과였는지 가를 수가 없다.
 */
export const PORTRAIT_ID_WEIGHT = 0.35;

/**
 * 몇 번째 단계부터 얼굴을 얹을지 (기본 0).
 *
 * 0 이면 처음부터 얼굴을 밀어 넣어서 그림체가 자리를 못 잡는다.
 * 뒤로 미루면 구도와 화풍이 먼저 잡히고 그 위에 얼굴이 얹히므로
 * 얼굴도 그림체를 따라간다.
 *
 * 2026-11-07: 2 → 6. 실행 #65 에서 얼굴만 사진처럼 떴다. 그림체가
 * 자리를 잡을 시간을 더 준다. 4 로 갔다가 화면을 더 보고 6 으로
 * 올렸다.
 *
 * ⚠️ id_weight 를 같이 내렸다. 둘을 한꺼번에 움직였으니 **이번만큼은
 *    무엇이 효과였는지 못 가른다.** 다음 조절부터는 하나씩 한다.
 *    두 값 다 같은 방향(화풍 쪽)이라 이번에는 같이 가도 된다고 봤다.
 */
export const PORTRAIT_START_STEP = 6;

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
  // 사진을 참조로 얼굴을 가져오는 모델.
  //
  // 글로만 생김새를 적으면 "그 조건에 맞는 아무 얼굴"이 나온다. 이 모델은
  // 참조 사진에서 얼굴 특징을 직접 가져오므로 진짜로 닮는다. 인물 시트를
  // 한 장 만들 때만 쓰고(assets/portrait.mjs), 본편 샷 수십 장에는 쓰지
  // 않는다 — 느리고 비싸다.
  //
  // ⚠️ 입력 이름이 **버전마다 다르다.** main_face_image 는 여러 버전에
  //    공통이지만 나머지는 바뀐 적이 있다. 모르는 이름을 보내면 모델이
  //    통째로 거부하므로, 확실한 것만 보내고 나머지는 모델 기본값에 맡긴다.
  // ⚠️ 이 모델은 **커뮤니티 모델**이다(2026-11-04 에 404 로 알았다).
  //    공식 모델(black-forest-labs/flux-*)은 /models/{이름}/predictions 가
  //    있지만 커뮤니티 모델은 없다. 버전을 먼저 찾아 /predictions 로 건다.
  //    community: true 가 그 분기를 켠다.
  //
  //    이름도 하나가 아니다. 같은 PuLID 를 올린 사람이 여럿이고, 올린
  //    사람이 지우면 그날로 404 다. 후보를 차례로 찾아보고 되는 것을 쓴다 —
  //    모델 정보를 읽는 것은 공짜라서 몇 번 더 물어도 돈이 안 든다.
  portrait: {
    key: 'portrait',
    model: 'zsxkib/flux-pulid',
    community: true,
    alsoTry: ['jichengdu/flux-pulid'],
    // 추정치다. 상한을 걸기 위한 기준이지 청구서가 아니다 — 이 모델은
    // 처음 써 보는 것이라 실제 금액은 첫 실행 뒤 Replicate 사용량 화면에서
    // 확인해야 한다.
    usdPerImage: 0.05,
    note: '사진을 참조로 얼굴을 가져온다. 인물 시트 전용.',
    needsReference: true,
    input: (prompt, { referenceImage, negativePrompt, aspectRatio }) => ({
      prompt,
      main_face_image: referenceImage,
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      // ── 얼굴 힘을 낮춘다 (2026-11-04) ──
      //
      // 기본값은 "최대한 닮게"다. 그래서 사진 얼굴이 그대로 들어가고,
      // 몸과 배경만 그림이 된다. 운영자가 최원호 감독 그림을 보고
      // "얼굴이 그냥 얼굴이잖아, 애니메이션으로 그려야지" 라고 했다.
      // 3화 때 "얼굴이 붕 떠있다" 던 것과 같은 증상이다.
      //
      // id_weight 를 내리면 닮음이 약해지는 대신 화풍이 이긴다.
      // start_step 을 올리면 그림의 구도와 화풍이 먼저 잡힌 뒤에
      // 얼굴이 얹히므로, 얼굴도 그림체를 따라간다.
      //
      // ⚠️ 이 두 이름은 **모델 버전에 따라 없을 수 있다.** 없는 이름을
      //    보내면 모델이 통째로 거부한다. 그래서 아래 filterInput 이
      //    모델이 선언한 이름만 남긴다 — 없으면 조용히 빠진다.
      id_weight: PORTRAIT_ID_WEIGHT,
      start_step: PORTRAIT_START_STEP,
      // 인물 시트는 세로(896x1152)지만 **본편 샷은 가로**다. 세로로
      // 만들어 16:9 에 넣으면 좌우가 잘려 얼굴이 날아간다.
      ...(aspectRatio === '16:9'
        ? { width: 1344, height: 768 }
        : { width: 896, height: 1152 }),
      num_steps: 20,
      guidance_scale: 4,
      // 0 이면 첫 걸음부터 얼굴을 밀어 넣는다 — 제일 닮지만 화풍을 덜
      // 따른다. 캐리커처로 만들어야 하므로 조금 늦게 넣는다.
      start_step: 2,
      output_format: 'png',
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
   * 커뮤니티 모델의 최신 버전 번호를 찾는다.
   *
   * 번호를 코드에 박아 두면 올린 사람이 새 버전을 내는 날 멈춘다. 매번
   * 물어본다 — 모델 정보를 읽는 것은 돈이 안 들고, 한 번 찾으면 이 실행
   * 안에서는 다시 묻지 않는다.
   */
  const versionCache = new Map();
  const schemaCache = new Map();

  /**
   * 모델이 받는 입력 이름만 남긴다.
   *
   * PuLID 는 올린 사람과 버전마다 입력 이름이 다르다. 모르는 이름을
   * 하나라도 보내면 모델이 **요청을 통째로 거부한다.** 그러면 얼굴 힘을
   * 조절하려다 그림을 한 장도 못 만든다.
   *
   * 버전 정보에 입력 목록이 들어 있으므로 그걸로 거른다. 목록을 못
   * 읽으면 거르지 않는다 — 여태 돌던 것을 새 코드가 막으면 안 된다.
   */
  function filterInput(input, name) {
    const allowed = schemaCache.get(name);
    if (!allowed || !allowed.size) return input;
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      if (allowed.has(k)) out[k] = v;
    }
    return out;
  }

  async function latestVersionOf(m) {
    const names = [m.model, ...(m.alsoTry || [])];
    for (const name of names) {
      if (versionCache.has(name)) return { name, version: versionCache.get(name) };
      try {
        const info = await request(`${API_ROOT}/models/${name}`, { method: 'GET' });
        const version = info?.latest_version?.id;
        if (version) {
          versionCache.set(name, version);
          const props =
            info?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties;
          if (props && typeof props === 'object') {
            schemaCache.set(name, new Set(Object.keys(props)));
          }
          return { name, version };
        }
      } catch (e) {
        // 404 면 다음 후보로. 그 밖의 오류(401·429)는 후보를 바꿔도 같으므로
        // 그대로 올린다.
        if (!/\b404\b/.test(String(e.message))) throw e;
      }
    }
    throw new Error(
      `참조 모델을 찾지 못했습니다. 찾아본 이름: ${names.join(', ')}. ` +
        'Replicate 에서 지워졌거나 이름이 바뀐 것입니다 — replicate.mjs 의 portrait.model 을 고치세요.'
    );
  }

  /**
   * 이미지 하나를 만든다. 끝날 때까지 기다린다.
   *
   * `Prefer: wait` 를 쓰면 Replicate이 최대 60초까지 붙들고 있다가 끝난
   * 결과를 바로 준다. 대부분 한 번에 끝나고, 안 끝나면 아래에서 폴링한다.
   */
  async function generate(prompt, {
    modelKey = DEFAULT_IMAGE_MODEL,
    aspectRatio = '16:9',
    // 참조 사진 **주소**. 이걸 받는 모델에만 쓴다.
    referenceImage = null,
    negativePrompt = null,
  } = {}) {
    const m = modelFor(modelKey);
    // 참조가 필요한 모델에 참조를 안 주면 모델이 거부한다. 돈을 쓰기 전에
    // 여기서 막는다.
    if (m.needsReference && !referenceImage) {
      throw new Error(`${m.model} 은 참조 사진 주소가 있어야 합니다.`);
    }
    const input = m.input(prompt, { aspectRatio, referenceImage, negativePrompt });
    let usedModel = m.model;
    let prediction;
    if (m.community) {
      // 커뮤니티 모델에는 /models/{이름}/predictions 가 없다. 버전을 찾아
      // /predictions 에 건다.
      const { name, version } = await latestVersionOf(m);
      usedModel = name;
      prediction = await request(`${API_ROOT}/predictions`, {
        method: 'POST',
        headers: { Prefer: 'wait' },
        body: JSON.stringify({ version, input: filterInput(input, name) }),
      });
    } else {
      prediction = await request(`${API_ROOT}/models/${m.model}/predictions`, {
        method: 'POST',
        headers: { Prefer: 'wait' },
        body: JSON.stringify({ input }),
      });
    }

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

    return { url, usdEstimate: m.usdPerImage, model: usedModel, predictionId: prediction.id };
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
