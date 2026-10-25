// 인물 시트 — 사진을 참조로 캐리커처 얼굴을 한 장 만든다.
//
// ─────────────────────────────────────────────────────────────
// 왜 만드나
// ─────────────────────────────────────────────────────────────
//
// 글로만 생김새를 적는 데는 천장이 있다. "둥근 얼굴, 두툼한 눈썹"이라고
// 스무 줄을 적어도 모델이 그 사람을 본 적이 없으므로 "그 조건에 맞는
// 아무 얼굴"이 나온다. 운영자가 원하는 것은 **닮은 얼굴**이다.
//
// 사진을 참조로 받는 모델(PuLID)은 얼굴 특징을 직접 가져온다. 그래서
// 진짜로 닮는다.
//
// ─────────────────────────────────────────────────────────────
// 사진은 저장소에 두지 않는다
// ─────────────────────────────────────────────────────────────
//
// 이 저장소는 공개다. 언론사 사진을 커밋하면 "재료로 쓴 것"이 아니라
// **그 사진을 퍼블리싱한 것**이 된다. 피하려던 바로 그것이다.
//
// 그래서 **주소만** 넘긴다. Replicate 가 직접 받아 가고 우리 쪽엔 안 남는다.
// 그리고 사진은 **딱 한 번만** 쓴다 —
//
//   사진 주소 → 캐리커처 한 장 → 사람이 고름 → 저장소에 저장
//                                                 ↑ 우리가 만든 그림
//
// 그다음부터 모든 샷은 저장된 **캐리커처**를 참조로 쓴다. 사진은 두 번
// 다시 쓰지 않는다. 덤으로 편이 바뀌어도 같은 얼굴이 나온다 — 2화의
// 손아섭과 10화의 손아섭이 같은 사람이 된다.
//
// ─────────────────────────────────────────────────────────────
// 화풍 지시가 본편과 한 군데 다르다
// ─────────────────────────────────────────────────────────────
//
// 본편 화풍에는 "an invented character, not resembling any specific real
// person" 이 들어 있다. 여기서는 그 줄을 **뺀다.** 닮게 만드는 것이
// 목적이기 때문이다.
//
// 공인을 캐리커처로 그리는 것은 문제가 없다. 막아야 하는 것은 남의
// 사진을 그대로 쓰는 것이고, 그건 위에서 막았다. 다만 "사진처럼"은
// 여전히 막는다 — 캐리커처라는 게 한눈에 보여야 "실제 사진인 줄 알았다"는
// 오해가 안 생긴다.

/** 참조 모델. 얼굴 특징을 사진에서 가져온다. */
export const PORTRAIT_MODEL = 'portrait';

/**
 * 한 사람당 몇 장을 뽑을까.
 *
 * 두 장이다. 한 장만 뽑으면 "이게 최선인지" 알 수 없고, 넉 장을 뽑으면
 * 고르는 데 시간이 더 든다. 둘을 나란히 놓으면 바로 정해진다.
 */
export const VARIANTS_PER_PERSON = 2;

/**
 * 시트에 쓸 화풍.
 *
 * 본편(SPORTS_STYLE_SUFFIX)과 같은 결이어야 한다. 시트만 다른 그림체면
 * 그걸 참조로 만든 샷이 본편에서 혼자 튄다.
 */
export const PORTRAIT_STYLE =
  'stylized 3D caricature render, oversized head on small body, ' +
  'glossy toy-figure look, soft studio lighting, clean rim light, ' +
  'expressive cartoon face with clear large eyes, visible eyebrows and mouth, ' +
  'warm neutral background, chest-up portrait, facing the camera';

export const PORTRAIT_NEGATIVE =
  'no photorealistic skin, no photograph, no team logos, no team names, ' +
  'no brand marks, no sponsor text, no readable jersey text, no league emblem, ' +
  'no text, no watermark, no multiple people';

/**
 * 한 사람의 시트 프롬프트.
 *
 * look 을 그대로 얹는다. 참조 사진이 얼굴을 잡고, 글은 **화풍과 옷차림**을
 * 잡는다. 둘이 싸우지 않게 글에서는 이목구비를 다시 설명하지 않는다 —
 * 사진이 이미 말하고 있다.
 */
export function portraitPrompt(person) {
  const bits = [PORTRAIT_STYLE];
  if (person?.role) bits.push(`a Korean baseball ${/투수/.test(person.role) ? 'pitcher' : 'player'}`);
  if (person?.tell) bits.push(person.tell);
  return bits.join(', ');
}

/**
 * 만들 작업 목록.
 *
 * @param people  [{ name, role, tell, photo }] — photo 는 **주소**다
 * @returns { jobs, skipped }
 */
export function portraitJobs(people, { variants = VARIANTS_PER_PERSON } = {}) {
  const jobs = [];
  const skipped = [];

  for (const p of people || []) {
    const name = String(p?.name || '').trim();
    const photo = String(p?.photo || '').trim();
    if (!name) continue;
    if (!/^https?:\/\//.test(photo)) {
      // 주소가 아니면 건너뛴다. 로컬 경로를 넣었다면 그건 사진을 저장소에
      // 들이려는 것이고, 그러지 않기로 했다.
      skipped.push({ name, reason: photo ? '사진 주소가 http 로 시작하지 않습니다' : '사진 주소가 없습니다' });
      continue;
    }
    for (let i = 1; i <= variants; i++) {
      jobs.push({
        name,
        variant: i,
        file: `${name}-${i}.png`,
        referenceImage: photo,
        prompt: portraitPrompt(p),
      });
    }
  }

  return { jobs, skipped };
}
