// 편마다 다른 단락 차례.
//
// ─────────────────────────────────────────────────────────────
// 왜 따로 떼어 놓았나
// ─────────────────────────────────────────────────────────────
//
// write.mjs 가 model.mjs 를 읽는다. 그래서 model.mjs 가 write.mjs 를
// 도로 읽으면 두 파일이 서로를 기다린다. 둘 다 쓰는 조각은 아무것도
// 읽지 않는 파일에 둔다.

/**
 * 기획 파일이 들고 온 단락 차례가 쓸 만한가. 아니면 null.
 *
 * 쓸 만하지 않으면 **조용히 고쳐 쓰지 않고 통째로 버린다.** 반쯤 맞는
 * 차례로 대본을 쓰면 어디가 틀어졌는지 나중에 못 찾는다. 버리면 기본
 * 차례로 돌아가고, 대본 검사가 "섹션이 없습니다"로 바로 잡아 준다.
 */
export function usableSections(sections) {
  if (!Array.isArray(sections) || sections.length < 2) return null;
  const out = [];
  const seen = new Set();
  for (const s of sections) {
    const key = String(s?.key || '').trim().toUpperCase();
    const label = String(s?.label || '').trim();
    // 키는 대문자와 밑줄만. 대본의 `## [KEY]` 를 정규식으로 찾기 때문에
    // 다른 글자가 섞이면 섹션을 못 찾고 "섹션이 없습니다"로 막힌다.
    if (!/^[A-Z][A-Z_]*$/.test(key) || !label || seen.has(key)) return null;
    seen.add(key);
    out.push({ key, label, note: String(s?.note || '').trim() });
  }
  // 훅은 포맷의 뼈대다. 쇼츠 점수와 썸네일 고르기가 HOOK 을 기대고 있다.
  if (out[0].key !== 'HOOK') return null;
  return out;
}
