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
  'exactly where they are, keep the number of people the same, ' +
  // ⚠️ 2026-11-09. 이 예외가 없어서 워터마크가 **그림 안으로 들어갔다.**
  //    "구도를 그대로 지켜라"와 "완성된 그림에는 얹힌 게 없다"가 싸웠고
  //    앞엣것이 이겼다. 모델이 워터마크를 장면의 일부로 보고 같이 그렸다.
  //    그래서 구도 규칙 **안에서** 예외를 밝힌다.
  'this applies to the people and the place only';

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

/**
 * 워터마크와 글자를 지운다.
 *
 * 2026-11-09 운영자: "다만 워터마크는 꼭! 지워라."
 *
 * ⚠️ **따로 지우는 단계가 아니다.** 이 모델은 화면 전체를 다시 그린다.
 *    제대로 다시 그려지면 워터마크는 애초에 남지 않는다 — 그림에는
 *    그런 게 없으니까.
 *
 *    그래서 워터마크가 **남아 있다면 그건 변환이 약했다는 신호**다.
 *    사진이 그만큼 그대로 통과했다는 뜻이고, 그러면 "감독 얼굴이 그냥
 *    얼굴이잖아"(2026-11-04)와 같은 문제가 같이 와 있다.
 *
 *    아래 줄은 그래서 "지워라"가 아니라 **"그런 건 그림에 없다"**로
 *    적는다. 모델에게 지우라고 시키는 것보다 애초에 없는 것으로 두는
 *    쪽이 잘 먹는다.
 *
 * ⚠️ 그리고 애초에 **워터마크가 없는 사진**을 받는 쪽이 낫다. 지우는
 *    품을 들일 필요가 없고 결과도 깨끗하다.
 */
/**
 * ⚠️⚠️ **워터마크를 이 프롬프트에서 말하지 않는다.** ⚠️⚠️
 *
 * ── 두 번 틀렸고 두 번 다 더 나빠졌다 (2026-11-09) ──
 *
 *   1차  'no watermark, no logo stamp, no agency mark, no caption bar,
 *         no date stamp, no text of any kind anywhere in the frame'
 *        → 뉴스1, 일간스포츠가 그림 안에 그려져 나왔다
 *
 *   2차  'the source photograph has a news agency watermark stamped
 *         over it; paint over it completely and draw whatever surface
 *         lies underneath...'
 *        → **더 또렷해졌다.** 일간스포츠, 엑스포츠뉴스
 *
 *   운영자: "오히려 워터마크가 더 생겼다. 너 돈만 쓰고 이렇게 할래."
 *
 * ── 까닭 ──
 *
 * 그림 모델은 프롬프트에 **나온 낱말을 그리려 든다.** "하지 마라"로
 * 적어도 그렇다. 부정은 약하게 먹고 낱말 자체는 세게 먹는다.
 * 모자 마크에서 `no Boston B` 를 적었더니 `C` 가 나온 것과 같은 성질이고,
 * 거기서 "금지는 끝이 없다"고 적어 두고도 여기서 또 같은 길을 갔다.
 *
 * 더 자세히 적을수록 더 또렷해졌다. 안 해 본 것은 **아예 말하지 않는
 * 것** 하나뿐이다.
 *
 * ── 그래서 ──
 *
 * 1. 워터마크·로고·글자 이야기를 이 프롬프트에서 **전부 뺐다.**
 *    아래 줄은 "면이 매끈하다"는 **긍정문**이고 그 낱말을 쓰지 않는다.
 *
 * 2. **가장 확실한 길은 워터마크 없는 사진을 받는 것이다.** 지우는
 *    품을 들이는 것보다 애초에 없는 것을 받는 쪽이 싸고 확실하다.
 *
 * 3. 잘라내는 길은 지금 막혀 있다. 내 프록시가 뉴스 사이트를 막아서
 *    사진을 열 수가 없고, 자르려면 저장소에 들여야 하는데 그건 안
 *    하기로 했다.
 *
 * ⚠️ 다음에 누가 "워터마크를 막는 줄을 넣자"고 생각하면 이 주석을
 *    먼저 읽어라. 두 번 해 봤고 두 번 다 더 나빠졌다.
 */
export const REPAINT_CLEAN =
  'surfaces are painted smooth and even: fabric is plain cloth, grass is ' +
  'plain grass, the sky is plain sky';

/** 한 장에 보낼 지시문. */
export function repaintPrompt(person, shot = null) {
  const bits = [
    `Turn this photograph into ${SPORTS_PAINT}.`,
    REPAINT_KEEP,
    REPAINT_DROP,
    REPAINT_CLEAN,
  ];
  // 사람 기록에 팀이 있으면 유니폼 색이 어긋나지 않게 덧붙인다.
  // ⚠️ 다만 **바꾸라고는 하지 않는다.** 사진에 이미 그 팀 유니폼이
  //    있을 테니, 색을 바꾸라고 적으면 모델이 엉뚱한 것을 칠한다.
  //    "사진에 있는 유니폼을 그대로 두라"가 맞다.
  bits.push('the same uniform and cap in the same colours, the same jersey number');
  if (person?.name) bits.push('keep the same person, the same face');
  // 그 사진을 어디에 쓸지 적어 두면 사람이 결과를 고를 때 편하다.
  // 모델에게 보내는 글에는 넣지 않는다 — 한국어고, 지시가 아니다.
  if (shot?.쓰임) bits.push('');
  return bits.join(' ').trim();
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

    // ── 사진을 어디서 읽나 (2026-11-09) ──
    //
    // 운영자가 구조를 정했다 — "필요한 중요 사진의 이미지는 내가 url 로
    // 준다. 사람별로 몇 장이 필요한지 주면 맞춰서 URL 을 주겠다."
    //
    // 그래서 **사람당 여러 장**을 받는다. 전에는 photo 와 photo_예비
    // 둘뿐이었는데, 그건 "얼굴 한 장만 참조한다"는 전제에서 나온 모양이다.
    // 이제는 샷마다 다른 자세의 사진이 필요하므로 배열로 받는다.
    //
    //   photos: [
    //     { url: '...', 쓰임: '유격수 수비 자세' },
    //     { url: '...', 쓰임: '타석에서 치는 순간' },
    //   ]
    //
    // ⚠️ 옛 모양(photo / photo_예비)도 그대로 읽는다. 1~11화의 기획
    //    파일이 그 모양이고, 그걸 한꺼번에 고치면 지금 돌아가는 것을
    //    깨뜨린다. 둘 다 받아서 이어 붙인다.
    const shots = [];
    for (const row of Array.isArray(p?.photos) ? p.photos : []) {
      const url = String(row?.url || row || '').trim();
      if (url) shots.push({ url, 쓰임: String(row?.쓰임 || '').trim() });
    }
    // 옛 모양. photos 가 있으면 본 사진은 이미 거기 있을 테니 더하지 않는다.
    if (!shots.length) {
      const main = String(p?.photo || '').trim();
      if (main) shots.push({ url: main, 쓰임: '' });
      if (spare) {
        const sp = String(p?.photo_예비 || '').trim();
        if (sp) shots.push({ url: sp, 쓰임: '예비' });
      }
    }

    let made = 0;
    for (const [i, shot] of shots.entries()) {
      if (!/^https?:\/\//.test(shot.url)) continue;
      // 파일 이름에 쓰임을 넣어 둔다. 사람이 결과를 고를 때 어느 것이
      // 어느 샷인지 알아야 한다 — 나는 그림을 못 보기 때문에 더 그렇다.
      const label = shot.쓰임 ? `-${shot.쓰임.replace(/[\/\\:*?"<>|]/g, '')}` : `-${i + 1}`;
      jobs.push({
        name,
        쓰임: shot.쓰임,
        file: `${name}${shots.length > 1 || shot.쓰임 ? label : ''}.png`,
        referenceImage: shot.url,
        prompt: repaintPrompt(p, shot),
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
