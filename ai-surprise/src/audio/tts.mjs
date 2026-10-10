// Google Cloud Text-to-Speech 클라이언트 (기획서 11번).
//
// ─────────────────────────────────────────────────────────────
// 왜 API 키 방식인가
// ─────────────────────────────────────────────────────────────
//
// Google Cloud는 보통 서비스 계정 JSON을 쓴다. 그런데 TTS의 synthesize
// 엔드포인트는 **API 키 하나로** 부를 수 있다. 키 하나면 Replicate과 똑같이
// GitHub Secrets에 넣고 끝이다 — JSON 파일을 비밀값에 넣고 다시 파일로
// 풀어 쓰는 과정이 통째로 사라진다.
//
// 나중에 유튜브 업로드(Phase 7)를 붙일 때는 OAuth가 필요하다. 그건 그때
// 따로 한다. 지금 필요하지도 않은 인증 방식을 미리 깔 이유가 없다.
//
// ─────────────────────────────────────────────────────────────
// 왜 SDK를 안 쓰는가
// ─────────────────────────────────────────────────────────────
//
// @google-cloud/text-to-speech 는 의존성이 무겁고, 우리가 쓰는 건
// 엔드포인트 두 개(목소리 목록, 합성)뿐이다. fetch로 직접 부른다.

const API_ROOT = 'https://texttospeech.googleapis.com/v1';

/**
 * 이 목소리가 pitch 를 받아들이는가.
 *
 * Chirp 3: HD 계열은 받지 않는다는 문서와 받는다는 문서가 섞여 있다.
 * 확실하지 않은 쪽으로 요청을 보내면 합성 전체가 실패하므로, 애매하면
 * 보내지 않는다. 안 보내도 중립 음높이로 읽을 뿐이다.
 */
export function supportsPitch(voice) {
  return !/chirp/i.test(String(voice || ''));
}

/**
 * 기본 목소리.
 *
 * 다큐멘터리 나레이션이라 낮고 차분한 남성 목소리를 기본으로 둔다.
 * Neural2 계열은 오래 유지돼 온 안정적인 목소리다.
 *
 * Google은 더 새로운 계열(Chirp3-HD 등)을 계속 내놓는데, 이름이 자주
 * 바뀌므로 코드에 박아두지 않았다. 대신 `voices` 명령으로 **지금 실제로
 * 쓸 수 있는 목록을 받아볼 수 있게** 했다. 마음에 드는 걸 찾으면
 * TTS_VOICE 환경변수로 바꾸면 된다.
 */
export const DEFAULT_VOICE = 'ko-KR-Neural2-C';
export const DEFAULT_LANGUAGE = 'ko-KR';

/**
 * 말하기 속도.
 *
 * 1.0이 기본인데 이 채널에는 빠르다. 기획서 6번이 "뉴스 아나운서보다 낮고
 * 느리게"라고 했고, 미스터리 나레이션은 사이를 두어야 긴장이 생긴다.
 */
export const DEFAULT_SPEAKING_RATE = 0.92;
export const DEFAULT_PITCH = -2;

/**
 * 100만 글자당 요금(달러) **추정치.**
 *
 * 상한을 걸기 위한 기준이지 청구서가 아니다. 실제 금액은 Google Cloud
 * 콘솔의 사용량 화면에서 확인해야 한다. 계열에 따라 몇 배씩 차이 난다.
 */
export const USD_PER_MILLION_CHARS = 16;

/** 한 번에 보낼 수 있는 글자 수 한계. 넘으면 API가 거부한다. */
export const MAX_CHARS_PER_REQUEST = 4500;

/** 글자 수 → 예상 비용(달러). */
export function estimateUsd(chars) {
  const usd = ((Number(chars) || 0) / 1_000_000) * USD_PER_MILLION_CHARS;
  return Math.round(usd * 100000) / 100000;
}

/**
 * TTS 클라이언트.
 *
 * @param apiKey   Google Cloud API 키
 * @param fetchFn  테스트에서 갈아끼우기 위한 주입점
 */
export function createClient({ apiKey, fetchFn = globalThis.fetch, sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!apiKey) {
    const err = new Error(
      'GOOGLE_TTS_API_KEY 가 없습니다.\n' +
        '  1) https://console.cloud.google.com 에서 프로젝트를 만들고\n' +
        '  2) "Cloud Text-to-Speech API" 를 사용 설정한 뒤\n' +
        '  3) API 및 서비스 → 사용자 인증 정보 → API 키 만들기\n' +
        '  4) GitHub 리포 Settings → Secrets → GOOGLE_TTS_API_KEY 로 넣으세요'
    );
    err.code = 'TTS_KEY_MISSING';
    throw err;
  }

  async function request(path, init) {
    const res = await fetchFn(`${API_ROOT}${path}${path.includes('?') ? '&' : '?'}key=${apiKey}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // JSON이 아니면 아래 오류 메시지에 원문을 쓴다.
    }

    if (!res.ok) {
      const detail = body?.error?.message || text.slice(0, 200) || '(본문 없음)';
      const err = new Error(`Google TTS ${res.status}: ${detail}`);
      err.status = res.status;
      // 429(한도)와 5xx만 다시 걸어볼 만하다. 4xx는 다시 걸어도 같은 답이 온다.
      err.retryable = res.status === 429 || res.status >= 500;
      throw err;
    }
    return body;
  }

  /**
   * 지금 쓸 수 있는 한국어 목소리 목록.
   *
   * 목소리 이름을 코드에 박아두지 않으려고 만들었다. Google이 계열을
   * 추가·정리할 때마다 이름이 바뀌는데, 코드에 박아두면 어느 날 조용히
   * 400이 난다.
   */
  async function listVoices(languageCode = DEFAULT_LANGUAGE) {
    const body = await request(`/voices?languageCode=${encodeURIComponent(languageCode)}`, { method: 'GET' });
    return (body?.voices || []).map((v) => ({
      name: v.name,
      gender: v.ssmlGender,
      sampleRate: v.naturalSampleRateHertz,
    }));
  }

  /**
   * 글 한 덩어리를 mp3로. 반환: Buffer
   *
   * 긴 글을 통째로 넣지 않는다 — 호출하는 쪽이 문단 단위로 쪼개 부른다.
   * 이유는 narrate.mjs 주석에 있다.
   */
  async function synthesize(text, {
    voice = DEFAULT_VOICE,
    languageCode = DEFAULT_LANGUAGE,
    speakingRate = DEFAULT_SPEAKING_RATE,
    pitch = DEFAULT_PITCH,
  } = {}) {
    const clean = String(text || '').trim();
    if (!clean) throw new Error('읽을 글이 비어 있습니다.');
    if (clean.length > MAX_CHARS_PER_REQUEST) {
      throw new Error(
        `한 번에 ${MAX_CHARS_PER_REQUEST}자까지만 보낼 수 있습니다 (${clean.length}자). 더 잘게 쪼개 주세요.`
      );
    }

    const body = await request('/text:synthesize', {
      method: 'POST',
      body: JSON.stringify({
        input: { text: clean },
        voice: { languageCode, name: voice },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate,
          // Chirp 계열에는 pitch 를 보내지 않는다. 지원 여부가 문서마다
          // 다르고, 지원하지 않으면 요청 자체가 거부된다. 안 보내면
          // 중립값으로 읽을 뿐이라 잃는 것이 없다.
          ...(supportsPitch(voice) ? { pitch } : {}),
          // 나레이션이라 말소리 대역을 또렷하게. 유튜브가 어차피 다시
          // 인코딩하므로 여기서 과하게 손대지 않는다.
          effectsProfileId: ['headphone-class-device'],
        },
      }),
    });

    if (!body?.audioContent) {
      throw new Error('응답에 소리가 없습니다.');
    }
    return Buffer.from(body.audioContent, 'base64');
  }

  return { synthesize, listVoices, sleepFn };
}
