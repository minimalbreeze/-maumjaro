// 편집 타임라인 만들기 (기획서 21번의 timeline.json).
//
// scenes.json(Phase 2)을 ffmpeg가 쓸 수 있는 형태로 바꾼다.
// AI를 쓰지 않는다. 전부 계산이다.
//
// 타임라인이 따로 있는 이유: 렌더링은 느리고 비싸다(1편에 몇 분). 무엇을 만들지
// 먼저 파일로 확정해 두면, 렌더가 중간에 죽어도 같은 타임라인으로 이어서 할 수
// 있고, 사람이 "이 샷만 다시"라고 말할 수 있다.

import { FORMATS, buildCues, totalSeconds } from './subtitle.mjs';
import { ASSET_TYPE } from '../scenes/assets.mjs';

export const DEFAULT_FPS = 30;

/** 전환 길이(초). 기획서 10번: 단순한 전환만. */
export const TRANSITION_SECONDS = 0.4;

/**
 * 장면·샷 → 타임라인.
 *
 * @param scenes   Phase 2가 만든 장면 목록 (asset_type·camera가 채워진 상태)
 * @param format   FORMATS.wide 또는 FORMATS.shorts
 * @param assetDir 에셋이 들어 있는 폴더 이름 (타임라인에는 상대 경로만 적는다)
 */
/**
 * 마지막 클립이 흡수할 수 있는 어긋남의 한계 (초).
 *
 * 반올림이 쌓여 생기는 차이는 길어야 몇 초다. 이보다 크면 반올림이 아니라
 * 무언가 틀린 것이므로 흡수하지 않고 문제로 남긴다 — 조용히 늘려서
 * 덮어 버리면 영상과 소리가 어긋난 채로 나간다.
 */
export const DRIFT_ABSORB_MAX = 3;

/**
 * 고르게 늘려서 맞출 수 있는 어긋남의 한계 (나레이션 길이에 대한 비율).
 *
 * 2026-11-04 실행 #58 이 5.7초(2%) 로 죽었다. 반올림이 아니라 진짜
 * 차이다 — 클립 예순 개를 소수 둘째 자리로 반올림해도 0.3초를 못 넘는다.
 * 장면 설계가 잡은 샷 길이와 실제로 읽힌 음성 길이가 그만큼 달랐다.
 *
 * 전에는 **마지막 클립 하나**로만 흡수했다. 3초를 넘으면 마지막 화면
 * 하나가 그만큼 늘어나 눈에 띄므로 한계를 뒀고, 넘으면 실패시켰다.
 * 그런데 실패시키면 그림 50장과 음성을 이미 만들어 놓고($0.17) 영상이
 * 안 나온다.
 *
 * 고르게 나누면 그 문제가 없다. 2% 면 샷마다 0.1초쯤이라 안 보인다.
 *
 * ⚠️ 자막은 안 밀린다. buildCues 가 **실제 음성 타이밍**
 *    (paragraphTimings)을 쓰기 때문이다 — 클립 길이와 무관하다.
 *    예전 주석이 "중간 클립을 건드리면 자막이 밀린다"고 적어 둔 것은
 *    음성 타이밍이 없던 시절 이야기다.
 *
 * 이보다 크게 어긋나면 고르게 늘려도 장면이 눈에 띄게 끌린다. 그건
 * 반올림도 오차도 아니라 설계가 틀린 것이므로 실패시킨다.
 */
export const DRIFT_SCALE_MAX_RATIO = 0.08;

/** 흡수한 뒤에도 마지막 클립이 이보다는 길어야 한다. */
export const MIN_CLIP_SECONDS = 0.5;

export function buildTimeline(
  scenes,
  { format = FORMATS.wide, fps = DEFAULT_FPS, assetDir = 'assets', narrationSeconds = null } = {}
) {
  const clips = [];
  const problems = [];
  let cursor = 0;

  for (const scene of scenes || []) {
    for (const [i, shot] of (scene.shots || []).entries()) {
      const duration = Number(shot.duration) || 0;
      if (duration <= 0) {
        problems.push(`${shot.shot_id}: 길이가 0입니다.`);
        continue;
      }

      const isVideo = shot.asset_type === ASSET_TYPE.VIDEO;

      // 그림 파일을 어느 샷에서 가져올지. 인물 샷은 첫 장을 나눠 쓴다.

      const imageFrom = shot.same_image_as || shot.shot_id;

      clips.push({
        shot_id: shot.shot_id,
        scene_number: scene.scene_number,
        section: scene.section,
        start: round2(cursor),
        duration: round2(duration),
        // 실제 파일은 Phase 3이 만든다. 지금은 어디에 있어야 하는지만 적는다.
        source: {
          type: isVideo ? 'video' : 'image',
          // 인물 샷은 장면 안에서 **그림 한 장을 나눠 쓴다.** 그래서
          // 파일 이름이 자기 샷 번호가 아니라 첫 장의 번호다.
          // (visuals.mjs 에서 same_image_as 를 채운다)
          path: `${assetDir}/${imageFrom}.${isVideo ? 'mp4' : 'png'}`,
          // 영상 생성이 실패하면 이미지로 대체한다 (기획서 9번).
          fallback: isVideo ? `${assetDir}/${imageFrom}.png` : null,
        },
        // 이미지에 걸 카메라 움직임. 영상 샷에도 남겨둔다 — 대체될 때 쓴다.
        camera: shot.camera || 'zoom in',
        // 첫 샷은 전환이 없다. 장면이 바뀌는 첫 샷만 장면의 전환을 쓴다.
        transition: clips.length === 0 ? 'cut' : i === 0 ? scene.transition_in || 'cut' : 'cut',
        mood: scene.mood || 'mystery',
      });

      cursor += duration;
    }
  }

  // 보고하는 길이는 **클립 길이의 합**으로 센다. cursor 는 반올림 전
  // 값을 더한 것이라 클립 합계와 미세하게 다르고, 렌더가 쓰는 것은
  // 클립 쪽이다.
  let total = round2(clips.reduce((sum, c) => sum + c.duration, 0));

  // 샷 길이 합계와 나레이션 길이가 맞는지 본다. 어긋나면 Phase 5에서
  // 영상과 음성이 안 맞는데 원인을 찾기 어려워진다.
  //
  // **실제 음성 파일이 있으면 그 길이로 본다.** totalSeconds() 는 글자 수로
  // 계산하는 추정치(330자/분)다. 음성을 만든 뒤에는 샷 길이가 실제 음성에
  // 맞춰져 있으므로, 추정치와 비교하면 **맞춘 것을 틀렸다고 판정한다.**
  // 실제로 그렇게 걸려서 완성본 한 번을 날렸다.
  const narration =
    Number(narrationSeconds) > 0 ? round2(Number(narrationSeconds)) : round2(totalSeconds(scenes));

  // 반올림이 쌓인 만큼을 **마지막 클립이 흡수한다.**
  //
  // 실행 #27 이 여기서 멈췄다 — 8.9분짜리에서 1.5초가 어긋났다. 클립
  // 79개를 소수 둘째 자리로 반올림하면서 쌓인 값이고, 어느 샷도 틀리지
  // 않았는데 합계만 안 맞는다.
  //
  // 허용 오차를 늘리는 쪽은 택하지 않았다. 그러면 검사만 통과하고 **영상
  // 끝에 1.5초가 실제로 남는다.** 마지막 클립은 보통 마무리 정지 화면이라
  // 거기서 1~2초를 늘리거나 줄여도 보이지 않는다. 중간 클립을 건드리면
  // 그 뒤 자막이 전부 밀린다.
  if (Number(narrationSeconds) > 0 && clips.length) {
    const drift = round2(narration - total);
    const last = clips[clips.length - 1];
    const adjusted = round2(last.duration + drift);
    // 큰 차이는 반올림이 아니라 진짜 문제다. 그건 아래 검사가 잡게 둔다.
    if (drift !== 0 && Math.abs(drift) <= DRIFT_ABSORB_MAX && adjusted >= MIN_CLIP_SECONDS) {
      last.duration = adjusted;
      total = round2(clips.reduce((sum, c) => sum + c.duration, 0));
    }
  }

  // 마지막 클립 하나로 못 흡수한 차이는 **모든 클립에 고르게 나눈다.**
  //
  // 실행 #58 이 5.7초로 죽었다. 그림 50장과 음성을 이미 만들어 놓고
  // 영상이 안 나왔다. 마지막 클립 하나에 5.7초를 몰면 눈에 띄지만,
  // 예순 개에 나누면 샷마다 0.1초라 안 보인다.
  if (Number(narrationSeconds) > 0 && clips.length) {
    const drift = round2(narration - total);
    const limit = narration * DRIFT_SCALE_MAX_RATIO;
    if (drift !== 0 && Math.abs(drift) <= limit && total > 0) {
      const scale = narration / total;
      let cursor2 = 0;
      for (const c of clips) {
        c.duration = Math.max(MIN_CLIP_SECONDS, round2(c.duration * scale));
        c.start = round2(cursor2);
        cursor2 = round2(cursor2 + c.duration);
      }
      // 곱하면서 생긴 반올림 찌꺼기는 마지막 클립이 받는다.
      const after = round2(clips.reduce((sum, c) => sum + c.duration, 0));
      const rest = round2(narration - after);
      const last = clips[clips.length - 1];
      if (rest !== 0 && round2(last.duration + rest) >= MIN_CLIP_SECONDS) {
        last.duration = round2(last.duration + rest);
      }
      total = round2(clips.reduce((sum, c) => sum + c.duration, 0));
    }
  }

  const duration = total;
  if (Math.abs(duration - narration) > 1) {
    problems.push(
      `샷 길이 합계(${duration}초)와 나레이션 길이(${narration}초)가 ${Math.abs(duration - narration).toFixed(1)}초 어긋납니다.`
    );
  }

  return {
    format: format.name,
    width: format.width,
    height: format.height,
    fps,
    duration,
    narration_seconds: narration,
    clips,
    audio: {
      // Phase 4가 만든다. 없으면 무음으로 렌더한다.
      narration: 'voice.mp3',
      // 장면별 BGM·효과음은 Phase 5 후반에 붙인다.
      bgm: [...new Set((scenes || []).map((s) => s.bgm).filter(Boolean))],
      sfx: (scenes || [])
        .filter((s) => s.sound_effect)
        .map((s) => ({ scene: s.scene_number, name: s.sound_effect })),
    },
    subtitle: `subtitle-${format.name}.ass`,
    problems,
  };
}

/** 타임라인과 짝이 되는 자막 큐. 같은 장면 목록에서 같은 타이밍으로 만든다. */
export function buildSubtitleCues(scenes, { format = FORMATS.wide, paragraphTimings = null } = {}) {
  return buildCues(scenes, { format, paragraphTimings });
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
