// 사람 하나에서 **대표 사진 주소**를 꺼낸다.
//
// ─────────────────────────────────────────────────────────────
// 왜 있나 (2026-11-09)
// ─────────────────────────────────────────────────────────────
//
// 기획 파일에 사진을 적는 모양이 둘이다.
//
//   옛 모양  { "photo": "...", "photo_예비": "..." }
//   새 모양  { "photos": [ { "url": "...", "쓰임": "투구" }, ... ] }
//
// 새 모양은 리페인트를 만들면서 들였다 — 샷마다 다른 자세의 사진이
// 필요해서다. 그런데 **리페인트만 새 모양을 읽는다.** 본편 그림
// (images.mjs), 인물 시트(portrait.mjs), 화풍 미리보기(preview.mjs),
// 소재 레코드(model.mjs), 닮음 판정(visuals.mjs) 은 전부 `photo` 만 본다.
//
// 그래서 11화 사람 다섯의 photo 를 photos 로 바꿨더니 **본편에서 그
// 다섯의 얼굴 참조가 통째로 사라질 뻔했다.** 그림은 그대로 나오니
// 오류도 안 난다 — 얼굴만 남의 얼굴이 된다.
//
// 한쪽을 손으로 맞춰 두는 식은 또 어긋난다. 읽는 자리를 하나로 모은다.

/** 대표 사진 주소. 없으면 빈 문자열. */
export function photoOf(p) {
  const direct = String(p?.photo || '').trim();
  if (direct) return direct;
  for (const row of Array.isArray(p?.photos) ? p.photos : []) {
    const url = String(row?.url || row || '').trim();
    if (url) return url;
  }
  return '';
}

/** 예비 사진 주소. 대표가 죽었을 때 쓴다. 없으면 빈 문자열. */
export function sparePhotoOf(p) {
  const direct = String(p?.photo_예비 || '').trim();
  if (direct) return direct;
  const rows = (Array.isArray(p?.photos) ? p.photos : [])
    .map((r) => String(r?.url || r || '').trim())
    .filter(Boolean);
  // 대표가 photos[0] 이면 예비는 photos[1] 이다.
  return String(p?.photo || '').trim() ? rows[0] || '' : rows[1] || '';
}
