// 나레이션 길이 ↔ 시간 환산.
//
// 이 값이 한 곳에만 있어야 하는 이유가 있다.
//
// 대본을 쓸 때는 "4분이면 1320자"로 분량을 지시하고, 장면을 쪼갤 때는
// "이 문단은 몇 초짜리인가"를 계산한다. 두 곳이 서로 다른 값을 쓰면
// 대본은 4분으로 썼는데 장면 합계는 5분이 되는 식으로 조용히 어긋난다.
// 그러면 Phase 5에서 영상과 음성 길이가 안 맞는데 원인을 찾기 어렵다.
//
// 그래서 숫자를 여기 하나만 두고 양쪽이 이걸 가져다 쓴다.

/**
 * 한국어 다큐멘터리 나레이션 속도 (공백 제외 글자 / 분).
 *
 * 추정치다. 차분한 다큐멘터리 톤(말하기 속도 0.95)을 기준으로 잡았다.
 *
 * ⚠️ **아직 실제로 재 보지 못한 값이다.** 동화·미스터리 편을 TTS 로
 *    읽혀서 길이를 재면 그때 고친다. 스포츠는 아래에서 쟀다.
 */
export const NARRATION_CHARS_PER_MINUTE = 330;

/**
 * 스포츠 분석 나레이션 속도. **실제로 재서 얻은 값이다.**
 *
 * ── 어떻게 쟀나 (2026-11-08, 실행 #70 · 11화 한국시리즈) ──
 *
 *   나레이션 글자    2,752자  (태그를 뗀 문단 합계)
 *   실제 TTS 길이    439.46초
 *   말하기 속도      1.08     (tts.mjs 의 SPORTS_SPEAKING_RATE)
 *
 *   2752 / 439.46 × 60 = 375.7 자/분
 *
 * 330 으로 재면 500.4초(8.3분)로 나온다. 실제는 439.46초(7.3분)다.
 * **1.139배 길게 잡고 있었다.**
 *
 * ── 왜 중요한가 ──
 *
 * 이 숫자가 대본 분량 경고를 움직인다. 1.14배로 길게 재면 8분짜리
 * 대본이 9분으로 보이고, 그 경고를 따라 내용을 깎게 된다. 11화에서
 * 실제로 그랬다 — 4,119자를 12.5분이라고 보고 깎았는데 실제로는
 * 11분이었다. 깎은 건 맞았지만 그만큼은 아니었다.
 *
 * ⚠️ 이 값은 **말하기 속도 1.08 에 묶여 있다.** SPORTS_SPEAKING_RATE 를
 *    바꾸면 여기도 다시 재야 한다. 둘은 같이 움직인다.
 * ⚠️ 한 편으로 잰 값이다. 다음 편에서 또 재서 어긋나면 평균으로 간다.
 */
export const SPORTS_NARRATION_CHARS_PER_MINUTE = 376;

/**
 * 이 종류의 나레이션 속도.
 *
 * tts.mjs 의 speakingRateFor 와 **짝이다** — 말하기 속도가 종류마다
 * 다르니 글자/분도 종류마다 달라야 한다. 한쪽만 고치면 어긋난다.
 *
 * kind 를 안 넘기면 기본값으로 간다. 그래서 kind 를 모르는 자리는
 * 전과 똑같이 돈다.
 */
export function charsPerMinuteFor(kind) {
  return kind === 'SPORTS' ? SPORTS_NARRATION_CHARS_PER_MINUTE : NARRATION_CHARS_PER_MINUTE;
}

/**
 * 나레이션 글자 수를 센다. 공백은 세지 않는다.
 *
 * 공백을 빼는 이유: 한국어는 띄어쓰기를 어떻게 하느냐에 따라 글자 수가
 * 10% 넘게 흔들린다. 읽는 시간은 그만큼 달라지지 않으므로 공백을 빼는 쪽이
 * 시간 추정에 더 안정적이다.
 */
export function countNarrationChars(text) {
  return String(text || '').replace(/\s/g, '').length;
}

/** 글자 수 → 초 */
export function secondsForChars(chars, kind = null) {
  return (Number(chars) || 0) * 60 / charsPerMinuteFor(kind);
}

/** 나레이션 글 → 초 */
export function secondsForText(text, kind = null) {
  return secondsForChars(countNarrationChars(text), kind);
}

/** 분 → 목표 글자 수 (대본 분량 지시에 쓴다) */
export function charsForMinutes(minutes, kind = null) {
  return Math.round((Number(minutes) || 0) * charsPerMinuteFor(kind));
}

/** 글자 수 → 분 */
export function minutesForChars(chars, kind = null) {
  return (Number(chars) || 0) / charsPerMinuteFor(kind);
}
