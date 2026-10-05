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
export function buildTimeline(scenes, { format = FORMATS.wide, fps = DEFAULT_FPS, assetDir = 'assets' } = {}) {
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

      clips.push({
        shot_id: shot.shot_id,
        scene_number: scene.scene_number,
        section: scene.section,
        start: round2(cursor),
        duration: round2(duration),
        // 실제 파일은 Phase 3이 만든다. 지금은 어디에 있어야 하는지만 적는다.
        source: {
          type: isVideo ? 'video' : 'image',
          path: `${assetDir}/${shot.shot_id}.${isVideo ? 'mp4' : 'png'}`,
          // 영상 생성이 실패하면 이미지로 대체한다 (기획서 9번).
          fallback: isVideo ? `${assetDir}/${shot.shot_id}.png` : null,
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

  const duration = round2(cursor);

  // 샷 길이 합계와 나레이션 길이가 맞는지 본다. 어긋나면 Phase 5에서
  // 영상과 음성이 안 맞는데 원인을 찾기 어려워진다.
  const narration = round2(totalSeconds(scenes));
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
