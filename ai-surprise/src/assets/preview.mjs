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

import { composeImagePrompt, photoNamesOf } from '../scenes/visuals.mjs';
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
      key: '박재현-전신',
      person: '박재현',
      why: '전신에서 다리가 안 잘리는가. 가슴의 KOREA 글자가 읽히는가.',
      content:
        'full-body shot of a Korean baseball outfielder standing on the grass, ' +
        'glove at his side, looking toward the infield, late afternoon light',
    },
    {
      key: '최원호-감독',
      person: '최원호',
      why: '선수들과 안 섞이는가. 감독답게 나이가 들어 보이는가.',
      content:
        'a Korean baseball manager in his fifties standing at the dugout rail, ' +
        'arms folded, watching the field with a steady expression, players blurred behind him',
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
