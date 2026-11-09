// 사진을 그대로 지브리로 — 구도를 지키면서 화풍만 바꾼다.
//
// ─────────────────────────────────────────────────────────────
// 왜 만드나
// ─────────────────────────────────────────────────────────────
//
// 2026-11-09 운영자가 꺼낸 말이다.
//
//   "사진을 그림으로 그대로 지브리 스타일로 하는 건 어떤가?
//    그럼 걸리는 데서 더 많이 벗어날 것 같다."
//
// 그 전에 다른 채널이 뉴스 사진을 그대로 쓰는 것을 보고 물었던 흐름의
// 끝이다. 사진을 그대로 올리는 것과 글로만 그리는 것 사이에 한 칸이
// 더 있었다.
//
// ── 얻는 것 ──
//
// 포즈가 **실제 사람의 포즈**가 된다. 그래서 이것들이 구조적으로
// 불가능해진다 — 2026-11-09 에 운영자가 하루 동안 짚은 것들이다.
//
//   팔이 셋         사진에 둘이다
//   외팔이          사진에 둘이다
//   상체·하체 따로   한 사람의 한 순간이다
//   두 발이 공중에   사진이 그럴 리 없다
//   좌우 짝짝이     사진이 그럴 리 없다
//
// ── 여전히 조심할 것 ──
//
// 2026-11-04 운영자: **"감독 얼굴이 그냥 얼굴이잖아."**
// 사진을 너무 살리면 사진 느낌이 그대로 남는다. 그때는 flux-pulid 의
// id_weight 를 내려서 고쳤는데, 사진 **전체**를 바탕으로 쓰면 그
// 함정이 더 크다. 그래서 프롬프트에 "다시 그린 그림"임을 세게 적는다.
//
// ── 저작권에 대해 ──
//
// 이건 "안전해진다"가 아니라 **"훨씬 덜 위험해진다"**이다. 정확히 적어 둔다.
//
//   자동 탐지   거의 확실히 피한다. 픽셀이 통째로 다르다
//   법적으로    소지는 남는다. 사진의 창작성은 피사체가 아니라
//               구도·순간·앵글·조명에 있고, 그걸 그대로 옮기기 때문이다
//   실제 위험   많이 낮아진다. 원본을 아는 사람이라야 알아본다
//
// 저작권 판단은 운영자가 내렸다(2026-11-03, 11-04). 여기서 다시 꺼내지
// 않는다. 다만 **무엇이 달라지고 무엇이 안 달라지는지**는 적어 둔다 —
// 나중에 이 파일을 읽는 사람이 "안전하다"고 오해하면 안 된다.
//
// ── 사진은 저장소에 두지 않는다 ──
//
// portrait.mjs 와 같다. **주소만** 넘기고 Replicate 가 직접 받아 간다.
// 공개 저장소에 언론사 사진을 커밋하면 그건 퍼블리싱이다.

import { SPORTS_PAINT } from '../scenes/visuals.mjs';

/** 쓰는 모델. 사진을 받아 구도를 지키면서 화풍만 바꾼다. */
export const REPAINT_MODEL = 'kontext';

/**
 * 바꿔 달라고 보내는 글.
 *
 * ⚠️ 이 모델은 **지시문**을 받는다. 그림을 처음부터 그리는 모델처럼
 *    장면을 묘사하면 안 된다 — "이 사진을 이렇게 바꿔라"라고 적는다.
 *
 * ⚠️ 무엇을 **지킬지**도 적어야 한다. 안 적으면 모델이 구도를 바꿔
 *    버리는데, 그러면 이 모델을 쓰는 뜻이 없어진다. 우리가 이걸 쓰는
 *    까닭이 바로 "사진의 자세를 그대로 가져오는 것"이다.
 */
export const REPAINT_KEEP =
  'keep the exact same pose, the same camera angle, the same framing and ' +
  'the same composition as the photograph, keep both arms and both legs ' +
  'exactly where they are, keep the number of people the same';

/**
 * 사진 느낌을 지우는 줄.
 *
 * 2026-11-04 에 겪은 "감독 얼굴이 그냥 얼굴이잖아"를 막는다. 사진
 * 전체를 바탕으로 쓰면 그 증상이 더 크게 나온다.
 */
export const REPAINT_DROP =
  'redraw it completely as a hand-painted picture: no photographic texture, ' +
  'no skin pores, no camera depth of field, no lens blur, no photo grain, ' +
  'flat cel-shaded colour with inked linework, the whole frame repainted ' +
  'including the background and the crowd';

/** 한 장에 보낼 지시문. */
export function repaintPrompt(person) {
  const bits = [
    `Turn this photograph into ${SPORTS_PAINT}.`,
    REPAINT_KEEP,
    REPAINT_DROP,
  ];
  // 사람 기록에 팀이 있으면 유니폼 색이 어긋나지 않게 덧붙인다.
  // ⚠️ 다만 **바꾸라고는 하지 않는다.** 사진에 이미 그 팀 유니폼이
  //    있을 테니, 색을 바꾸라고 적으면 모델이 엉뚱한 것을 칠한다.
  //    "사진에 있는 유니폼을 그대로 두라"가 맞다.
  bits.push('keep the uniform, the cap and the number exactly as they appear in the photograph');
  if (person?.name) bits.push('keep the same person, the same face');
  return bits.join(' ');
}

/**
 * 만들 작업 목록.
 *
 * @param people  [{ name, role, photo, photo_예비 }] — photo 는 **주소**다
 * @returns { jobs, skipped }
 */
export function repaintJobs(people, { spare = false } = {}) {
  const jobs = [];
  const skipped = [];

  for (const p of people || []) {
    const name = String(p?.name || '').trim();
    if (!name) continue;
    // 본 사진을 쓰고, spare 를 켜면 예비도 같이 바꿔 본다. 어느 사진이
    // 더 잘 나오는지는 돌려 봐야 안다 — 내가 사진을 못 열기 때문이다.
    const urls = [String(p?.photo || '').trim()];
    if (spare) urls.push(String(p?.photo_예비 || '').trim());

    let made = 0;
    for (const [i, url] of urls.entries()) {
      if (!/^https?:\/\//.test(url)) continue;
      jobs.push({
        name,
        file: `${name}${i ? '-예비' : ''}.png`,
        referenceImage: url,
        prompt: repaintPrompt(p),
      });
      made += 1;
    }
    if (!made) {
      skipped.push({
        name,
        reason: '사진 주소가 없거나 http 로 시작하지 않습니다',
      });
    }
  }

  return { jobs, skipped };
}
