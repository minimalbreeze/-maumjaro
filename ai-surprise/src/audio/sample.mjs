// 목소리 들어보기.
//
// ─────────────────────────────────────────────────────────────
// 왜 필요한가
// ─────────────────────────────────────────────────────────────
//
// 첫 완성본을 보고 효성님이 "나레이션이 너무 딱딱하다"고 했다. 기본으로
// 잡아 둔 ko-KR-Neural2-C 는 뉴스 읽는 톤에 가깝다. 어떤 목소리가 "친구가
// 무서운 이야기를 해주는" 톤에 맞는지는 **들어봐야** 안다.
//
// 이름만 보고 고르면 또 $3짜리 완성본을 돌려서야 알게 된다. 같은 문장을
// 여러 목소리로 만들어 두면 몇 센트로 끝난다.
//
// 목소리 이름은 Google 이 계속 바꾸므로 코드에 박지 않는다. 지금 실제로
// 쓸 수 있는 목록을 받아 와서 거기서 고른다.

/** 들어볼 문장. 실제 대본과 같은 결로 — 사실을 담담히 깔다가 틀어지는 투. */
export const SAMPLE_TEXT =
  '1958년 4월, 키예프의 한 거리에서 사진 한 장이 찍혔습니다. ' +
  '사진 속 남자는 손에 작고 검은 물건을 들고 있었습니다. ' +
  '그런데 그 물건은, 당시에는 존재하지 않았습니다.';

/** 이 이름들을 먼저 찾는다. 없으면 조용히 건너뛴다. */
export const PREFERRED = [
  'ko-KR-Chirp3-HD-Charon',
  'ko-KR-Chirp3-HD-Enceladus',
  'ko-KR-Chirp3-HD-Umbriel',
  'ko-KR-Chirp3-HD-Iapetus',
  'ko-KR-Chirp3-HD-Orus',
  'ko-KR-Chirp3-HD-Algieba',
  'ko-KR-Wavenet-C',
  'ko-KR-Neural2-C',
];

/**
 * 들어볼 목소리를 고른다.
 *
 * @param available listVoices() 가 돌려준 목록
 * @param current   지금 쓰고 있는 목소리. 비교하려면 반드시 들어가야 한다.
 */
export function pickSampleVoices(available, { current, limit = 8 } = {}) {
  const names = new Set((available || []).map((v) => v.name));
  const picked = PREFERRED.filter((n) => names.has(n));
  // 지금 쓰는 목소리가 빠지면 "전보다 나은가"를 판단할 수 없다.
  if (current && names.has(current) && !picked.includes(current)) picked.unshift(current);
  return picked.slice(0, limit);
}

/** 파일 이름으로 쓸 수 있게 다듬는다. */
export function sampleFileName(voice, rate) {
  const safe = String(voice).replace(/[^A-Za-z0-9._-]/g, '_');
  return `${safe}__속도${String(rate).replace('.', '_')}.mp3`;
}
