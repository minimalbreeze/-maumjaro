// 화풍 미리보기.
//
// ─────────────────────────────────────────────────────────────
// 왜 따로 두는가
// ─────────────────────────────────────────────────────────────
//
// 화풍을 한 번 고치면 결과를 보기까지 **완성본 한 편**을 돌려야 했다.
// 그림 56장에 나레이션까지 $0.23, 25분이다. 얼굴 하나 다듬자고 그걸
// 되풀이할 수는 없다.
//
// 1화에서 실제로 그 비용 때문에 막혔다 — 캐리커처에 얼굴이 없고
// 동그라미만 나왔는데, 고쳐 보려면 매번 영상을 새로 만들어야 했다.
//
// 그래서 **그림 몇 장만** 뽑는다. 장당 schnell 0.003, dev 0.025 이므로
// 세 장씩 두 모델을 비교해도 10센트가 안 된다.

import {
  composeImagePrompt,
  photoNamesOf,
  SPORTS_PAINT_CANDIDATES,
  SPORTS_PAINT_KEY,
} from '../scenes/visuals.mjs';
import { REFERENCE_MODEL } from './images.mjs';
import { KIND } from '../model.mjs';

/**
 * 미리 볼 장면.
 *
 * 고르는 기준은 "지금 못 하는 것"이다. 예쁜 장면이 아니라 **깨졌던
 * 장면**을 넣어야 고쳤는지 알 수 있다.
 *
 * 2026-11-04 에 세 장면을 통째로 갈았다. 전에 보던 것은 "얼굴이 그려지는가"
 * 였는데 그건 이제 된다. 지금 못 하는 것은 **그 사람처럼 보이는가**다 —
 * 3·5화에서 김도영이 샷마다 다른 남자였다.
 *
 * `person` 이 붙은 장면은 기획 파일에서 그 사람의 사진을 찾아 참조로 쓴다.
 * 사진이 없으면 그냥 글로 그린다 — 장면이 사라지지는 않는다.
 */
export const PREVIEW_SCENES = {
  [KIND.SPORTS]: [
    {
      key: '김도영-정면',
      person: '김도영',
      why: '사진과 닮았는가. 아이블랙과 이마가 드러난 머리가 살아 있는가.',
      content:
        'close-up portrait of a young Korean baseball player in his early twenties ' +
        'standing at the plate, black eye-black stripes under both eyes, ' +
        'hair swept up so the forehead shows, calm focused expression before a pitch',
    },
    {
      key: '박재현-상반신',
      person: '박재현',
      why: '사진과 닮았는가. 앞머리가 눈썹까지 내려오는가.',
      // ⚠️ 2026-11-04 까지 이 장면이 **전신**이었다. 전신이면 얼굴이
      //    그림의 5% 다. 운영자가 "박재현은 왜 얼굴이 안 나와" 라고
      //    물었고, 당연한 말이었다 — 참조 모델을 쓰면서 얼굴을 작게
      //    그리라고 한 셈이다. 돈만 나가고 얼굴은 안 보인다.
      content:
        'upper body portrait of a young Korean baseball outfielder in the dugout, ' +
        'facing the camera, neat straight black bangs falling to the eyebrows, ' +
        'calm quiet expression, evening stadium lights behind him',
    },
    {
      key: '최원호-감독',
      person: '최원호',
      why: '얼굴이 사진처럼 들뜨지 않고 그림체를 따라가는가.',
      // 2026-11-04 운영자: "감독 얼굴이 그냥 얼굴이잖아, 애니메이션으로
      // 그려야지". 이 장면은 이제 닮음이 아니라 **화풍**을 보는 자리다.
      content:
        'close-up portrait of a Korean baseball manager in his fifties at the dugout rail, ' +
        'arms folded, a steady unsmiling expression, soft evening light on his face',
    },
  ],
};

/** 이 종류의 미리보기 장면. 없으면 빈 목록. */
export function previewScenesFor(kind) {
  return PREVIEW_SCENES[kind] || [];
}

/**
 * 미리보기로 만들 그림 목록.
 *
 * 참조 사진이 있는 장면은 **참조 모델 한 장만** 뽑는다. 거기서는
 * schnell 과 dev 를 견줄 일이 없다 — 둘 다 사진을 못 받는다.
 * 사진이 없는 장면만 모델별로 나란히 뽑아 견준다.
 */
export function previewJobs(kind, { models = ['schnell'], people = [] } = {}) {
  const photoOf = new Map();
  const withPhoto = photoNamesOf({ people });
  for (const p of people || []) {
    const name = String(p?.name || '').trim();
    if (withPhoto.has(name)) photoOf.set(name, String(p.photo).trim());
  }

  const jobs = [];
  for (const scene of previewScenesFor(kind)) {
    const reference = photoOf.get(String(scene.person || '').trim()) || null;
    const prompt = composeImagePrompt(scene.content, null, {
      kind,
      likeness: Boolean(reference),
    });
    if (reference) {
      jobs.push({
        model: REFERENCE_MODEL,
        key: scene.key,
        why: scene.why,
        reference,
        file: `${REFERENCE_MODEL}-${scene.key}.png`,
        prompt,
      });
      continue;
    }
    for (const model of models) {
      jobs.push({
        model,
        key: scene.key,
        why: scene.why,
        reference: null,
        file: `${model}-${scene.key}.png`,
        prompt,
      });
    }
  }
  return jobs;
}

/**
 * 그림체 후보를 **같은 장면으로** 나란히 뽑는다.
 *
 * 2026-11-04 운영자: "잘 그리는 화풍이 있는가? 예시를 들어 주면 정해
 * 주겠다. 영상을 딱 보면 이건 우리 거다 하는".
 *
 * 설명 세 줄 읽고 고르면 또 틀린다. 장면을 하나로 고정하고 그림체만
 * 바꿔야 **무엇 때문에 달라졌는지** 가를 수 있다 — 장면까지 같이 바뀌면
 * 그림체 차이인지 장면 차이인지 알 수가 없다.
 *
 * 장면은 김도영 정면으로 고정한다. 채널에서 가장 많이 나오는 얼굴이고,
 * 사진 참조가 붙어 있어서 "얼굴이 붕 뜨는가"까지 같이 볼 수 있다.
 */
export function previewStyleJobs(kind, { people = [] } = {}) {
  const scene = previewScenesFor(kind)[0];
  if (!scene) return [];

  const photoOf = new Map();
  const withPhoto = photoNamesOf({ people });
  for (const p of people || []) {
    const name = String(p?.name || '').trim();
    if (withPhoto.has(name)) photoOf.set(name, String(p.photo).trim());
  }
  const reference = photoOf.get(String(scene.person || '').trim()) || null;

  const jobs = [];
  for (const [key, cand] of Object.entries(SPORTS_PAINT_CANDIDATES)) {
    jobs.push({
      model: reference ? REFERENCE_MODEL : 'dev',
      key,
      why: `${cand.label} — ${cand.why}`,
      reference,
      file: `화풍-${key}.png`,
      prompt: composeImagePrompt(scene.content, null, {
        kind,
        likeness: Boolean(reference),
        paint: cand.paint,
      }),
    });
  }
  return jobs;
}

/** 지금 쓰는 그림체 이름. 보고서에 적는다. */
export { SPORTS_PAINT_KEY };
