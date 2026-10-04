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
 * 추정치다. 차분한 다큐멘터리 톤을 기준으로 잡았다.
 * Phase 4에서 실제 TTS로 읽혀서 측정하고 보정해야 한다.
 * 그때는 이 숫자 하나만 바꾸면 대본 분량 지시와 장면 길이가 함께 따라간다.
 */
export const NARRATION_CHARS_PER_MINUTE = 330;

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
export function secondsForChars(chars) {
  return (Number(chars) || 0) * 60 / NARRATION_CHARS_PER_MINUTE;
}

/** 나레이션 글 → 초 */
export function secondsForText(text) {
  return secondsForChars(countNarrationChars(text));
}

/** 분 → 목표 글자 수 (대본 분량 지시에 쓴다) */
export function charsForMinutes(minutes) {
  return Math.round((Number(minutes) || 0) * NARRATION_CHARS_PER_MINUTE);
}

/** 글자 수 → 분 */
export function minutesForChars(chars) {
  return (Number(chars) || 0) / NARRATION_CHARS_PER_MINUTE;
}
