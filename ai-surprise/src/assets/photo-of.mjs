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

/**
 * 이 사람에게 받아 둔 **사진 전부**. 주소만 추린다.
 *
 * 2026-11-11 운영자: "준 이미지 중에 차라리 하나씩 골라서 그대로
 * 그려서 써라. 등번호 이런 거 맞추면 뭐하나, 그림이 어색하기만 하다."
 *
 * 사람 샷을 글로 그리지 않고 **받은 사진을 그림으로 바꿔** 쓰려면
 * 한 사람의 사진을 여러 장 알아야 한다. 샷마다 다른 사진을 돌려 쓴다.
 */
export function allPhotosOf(p) {
  const out = [];
  const push = (u) => {
    const url = String(u || '').trim();
    if (/^https?:\/\//.test(url) && !out.includes(url)) out.push(url);
  };
  push(p?.photo);
  for (const row of Array.isArray(p?.photos) ? p.photos : []) push(row?.url || row);
  push(p?.photo_예비);
  return out;
}

/**
 * 사진마다 적어 둔 **아래 자를 비율**. 주소 → 비율.
 *
 * ⚠️⚠️ 2026-11-26. 리페인트(`repaintJobs`)는 기획 파일의 `아래` 를
 * 읽는데 **본편(images.mjs)은 안 읽고 있었다.** 그래서 미리보기에서
 * 0 을 적어 멀쩡하던 세로 사진이 본편에서는 기본 12% 가 잘렸다
 * (647x903 에서 108px — 발목이 날아간다).
 *
 * `allPhotosOf` 가 주소만 돌려주느라 중간에 값이 날아간 것이다.
 * 읽는 자리를 하나로 모으되 주소 목록의 모양은 건드리지 않는다.
 *
 * ⚠️ **0 도 값이다.** `>= 0` 으로 본다 — `아래: 0` 은 "자르지 말라"는
 *    뜻이고, 비워 둔 것은 "재서 알아서 잘라라" 다.
 */
export function photoCropsOf(p) {
  const out = new Map();
  for (const row of Array.isArray(p?.photos) ? p.photos : []) {
    const url = String(row?.url || '').trim();
    const v = Number(row?.아래);
    if (/^https?:\/\//.test(url) && Number.isFinite(v) && v >= 0 && !out.has(url)) {
      out.set(url, v);
    }
  }
  return out;
}
