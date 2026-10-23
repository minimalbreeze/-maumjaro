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

import { composeImagePrompt } from '../scenes/visuals.mjs';
import { KIND } from '../model.mjs';

/**
 * 미리 볼 장면.
 *
 * 고르는 기준은 "지금 못 하는 것"이다. 예쁜 장면이 아니라 **깨졌던
 * 장면**을 넣어야 고쳤는지 알 수 있다. 스포츠 쪽은 전부 얼굴이다 —
 * 1화에서 사라진 것이 얼굴이기 때문이다.
 */
export const PREVIEW_SCENES = {
  [KIND.SPORTS]: [
    {
      key: '단장-정면',
      why: '정면 얼굴과 표정. 1화에서 이 자리가 동그라미로 나왔다.',
      content:
        'close-up of a baseball team general manager at a dark office desk at night, ' +
        'frowning in thought while pressing a calculator, contract papers around him',
    },
    {
      key: '투수-상반신',
      why: '선수 얼굴. 유니폼은 색만, 로고와 글자는 없어야 한다.',
      content:
        'upper body of a young baseball pitcher standing on the mound, ' +
        'navy and grey uniform with no markings, looking down at the ball in his glove, calm serious expression',
    },
    {
      key: '협상-두사람',
      why: '한 화면에 얼굴 둘. 여럿이 나오면 얼굴이 먼저 뭉개진다.',
      content:
        'two people facing each other across a negotiation table in a bright meeting room, ' +
        'one in a suit and one in a plain baseball jacket, both mid-conversation, visible faces',
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
 * 모델마다 같은 장면을 뽑는다. **같은 프롬프트로 나란히 놓고 봐야**
 * 모델 차이인지 프롬프트 차이인지 가를 수 있다.
 */
export function previewJobs(kind, { models = ['schnell'] } = {}) {
  const scenes = previewScenesFor(kind);
  const jobs = [];
  for (const model of models) {
    for (const scene of scenes) {
      jobs.push({
        model,
        key: scene.key,
        why: scene.why,
        file: `${model}-${scene.key}.png`,
        prompt: composeImagePrompt(scene.content, null, { kind }),
      });
    }
  }
  return jobs;
}
