// 어떤 샷을 AI 영상으로 만들고 어떤 샷을 이미지로 만들지 정한다 (기획서 8·9·20번).
// 그리고 분위기에 따라 BGM·효과음을 배정한다 (기획서 13번).
//
// 전부 코드가 정한다. AI에게 "이 샷은 영상이 필요한가?"를 물어 그대로 따르면
// 안 되는 이유가 있다. AI는 "움직임이 있으면 더 좋다"는 쪽으로 기울고,
// 그게 곧 돈이다. 한 편 비용의 70% 이상이 AI 영상 생성에서 난다.
//
// 그래서 역할을 나눈다.
//   AI  : "이 샷은 움직임이 얼마나 필요한가" (0~10점)로 의견만 낸다
//   코드: 예산 안에서 점수 높은 순으로 영상을 배정한다
//
// 이렇게 하면 영상 비중을 숫자 하나로 조절할 수 있고, AI가 무엇을 하든
// 편당 비용의 상한이 보장된다.

export const ASSET_TYPE = { IMAGE: 'IMAGE', VIDEO: 'VIDEO' };

/**
 * AI 영상으로 만들 샷의 비율.
 *
 * 기획서 9번은 20~30%를 제시한다. 기본값을 0.15로 낮춘 이유:
 *
 * 영상 72초(=9클립)를 Veo 3.1 Lite 1080p 무음으로 뽑으면 약 $3.60이고,
 * 이게 편당 비용의 대부분이다. 비중을 15%로 내리면 그 절반이 된다.
 * 그리고 기획서 10번이 요구하는 스타일("완벽한 영화 느낌을 피한다",
 * "과장된 줌인/줌아웃")은 이미지 + 카메라 움직임으로 더 잘 나온다.
 *
 * 기획서대로 가고 싶으면 VIDEO_SHOT_RATIO=0.3 으로 올리면 된다.
 */
export const DEFAULT_VIDEO_RATIO = 0.15;

/** 한 편에 쓸 AI 영상 클립 수의 절대 상한. 비율 계산이 어긋나도 이걸 넘지 않는다. */
export const MAX_VIDEO_SHOTS = 12;

/**
 * 이미지에 걸 카메라 움직임 (기획서 8번).
 * 이미지를 영상처럼 보이게 하는 장치다. ffmpeg zoompan으로 구현한다(Phase 5).
 */
export const IMAGE_CAMERA_MOVES = [
  'zoom in',
  'zoom out',
  'pan left',
  'pan right',
  'slow camera shake',
  'parallax',
];

/** 장면 분위기. AI가 이 중 하나를 고른다. */
export const MOODS = ['mystery', 'tension', 'twist', 'record', 'calm', 'somber'];

/**
 * 분위기 → BGM·효과음 (기획서 13번).
 *
 * 실제 음원 파일은 Phase 5에서 붙인다. 지금은 "어떤 성격의 소리가 필요한가"를
 * 이름으로 정해 둔다. 이름을 미리 고정해 두면 Phase 5에서 음원을 구할 때
 * 목록이 그대로 쇼핑 리스트가 된다.
 */
export const MOOD_SOUND = {
  mystery: { bgm: 'low_tension', sfx: null },
  tension: { bgm: 'tension_rise', sfx: 'heartbeat' },
  twist: { bgm: 'tension_rise', sfx: 'impact' },
  record: { bgm: 'low_tension', sfx: 'paper_typewriter' },
  calm: { bgm: 'ambient_low', sfx: null },
  somber: { bgm: 'ambient_low', sfx: null },
};

/**
 * 효과음을 넣을 장면의 최대 비율.
 *
 * 기획서 13번이 "단, 과도하게 사용하지 않는다"고 못박았다. 그 '과도하게'를
 * 숫자로 정해 코드가 지키게 한다. 장면마다 쿵쾅거리면 B급이 아니라 싸구려가 된다.
 */
export const MAX_SFX_SCENE_RATIO = 0.4;

/** 전환 효과 (기획서 10번). 단순한 것만. */
export const TRANSITIONS = ['cut', 'fade', 'zoom', 'whip'];

// ─────────────────────────────────────────────────────────────

/**
 * 샷마다 이미지/영상을 정한다.
 *
 * 입력: 장면 목록 (visuals.mjs가 image_prompt·video_prompt·motion_need를 채운 뒤)
 * 출력: 같은 장면 목록 (asset_type 이 채워진 새 객체)
 *
 * 규칙
 *  1) 실명 인물을 사실적으로 그리는 샷은 무조건 이미지다.
 *     AI 영상으로 실존 인물이 말하거나 움직이는 장면을 만드는 건
 *     유튜브의 합성 콘텐츠 정책에서 가장 민감한 영역이고, 명예훼손
 *     위험도 가장 크다. 비용 문제가 아니라 안전 문제라 예산보다 먼저 본다.
 *  2) 영상 프롬프트가 없는 샷은 이미지다.
 *  3) 남은 샷 중 motion_need 높은 순으로 예산만큼 영상을 준다.
 *  4) 동점이면 앞 샷을 고른다 — 앞부분이 이탈률이 높아 투자 효율이 좋다.
 */
export function assignAssetTypes(scenes, { videoRatio = DEFAULT_VIDEO_RATIO } = {}) {
  const list = Array.isArray(scenes) ? scenes : [];
  const allShots = [];
  for (const scene of list) {
    for (const shot of scene.shots || []) {
      allShots.push({ scene, shot });
    }
  }

  const ratio = clamp(Number(videoRatio), 0, 1);
  const budget = Math.min(MAX_VIDEO_SHOTS, Math.floor(allShots.length * ratio));

  // 영상 후보: 실명 인물을 사실적으로 그리지 않고, 영상 프롬프트가 있는 샷
  const eligible = allShots.filter(
    ({ shot }) => !shot.depicts_real_person && shot.video_prompt
  );

  const chosen = new Set(
    eligible
      .map(({ shot }, i) => ({
        id: shot.shot_id,
        motion: Number(shot.motion_need) || 0,
        order: i,
      }))
      .sort((a, b) => b.motion - a.motion || a.order - b.order)
      .slice(0, budget)
      .map((x) => x.id)
  );

  return list.map((scene) => ({
    ...scene,
    shots: (scene.shots || []).map((shot) => {
      const isVideo = chosen.has(shot.shot_id);
      return {
        ...shot,
        asset_type: isVideo ? ASSET_TYPE.VIDEO : ASSET_TYPE.IMAGE,
        // 영상 생성이 실패하면 이미지 + 카메라 움직임으로 대체한다 (기획서 9번).
        // 그래서 영상 샷에도 image_prompt와 camera를 그대로 남겨둔다.
        fallback: isVideo ? ASSET_TYPE.IMAGE : null,
      };
    }),
  }));
}

/**
 * 장면마다 BGM·효과음을 배정한다 (기획서 13번).
 *
 * 효과음은 전체 장면의 MAX_SFX_SCENE_RATIO 까지만 넣는다. 넘치면
 * "덜 중요한" 장면부터 뺀다. 중요도 순서는 반전 > 긴장 > 기록 > 나머지다.
 */
export function assignSound(scenes) {
  const list = Array.isArray(scenes) ? scenes : [];
  const cap = Math.max(1, Math.floor(list.length * MAX_SFX_SCENE_RATIO));

  const PRIORITY = { twist: 0, tension: 1, record: 2 };
  const candidates = list
    .map((scene, i) => ({ i, mood: scene.mood, sfx: MOOD_SOUND[scene.mood]?.sfx || null }))
    .filter((c) => c.sfx)
    .sort((a, b) => (PRIORITY[a.mood] ?? 9) - (PRIORITY[b.mood] ?? 9) || a.i - b.i);

  const keep = new Set(candidates.slice(0, cap).map((c) => c.i));

  return list.map((scene, i) => {
    const sound = MOOD_SOUND[scene.mood] || MOOD_SOUND.mystery;
    return {
      ...scene,
      bgm: sound.bgm,
      sound_effect: keep.has(i) ? sound.sfx : null,
      // 전환: 반전 장면 앞은 세게, 나머지는 단순하게.
      transition_in: i === 0 ? 'cut' : scene.mood === 'twist' ? 'whip' : 'cut',
    };
  });
}

/**
 * 비용을 미리 계산해 보여준다.
 *
 * 돈을 쓰기 전에 "이 편은 얼마짜리인가"를 숫자로 보여주기 위한 것이다.
 * 단가는 Phase 3에서 실제 API를 붙일 때 확인한 값으로 바꿔야 한다 —
 * 지금 기본값은 2026년 10월에 구글 공식 가격 페이지에서 확인한 값이다.
 */
export function estimateCost(scenes, {
  imageUsd = 0.02, // Imagen 4 Fast, 1K
  videoUsdPerSecond = 0.05, // Veo 3.1 Lite 1080p 무음
} = {}) {
  const shots = (Array.isArray(scenes) ? scenes : []).flatMap((s) => s.shots || []);
  const images = shots.filter((s) => s.asset_type !== ASSET_TYPE.VIDEO);
  const videos = shots.filter((s) => s.asset_type === ASSET_TYPE.VIDEO);
  const videoSeconds = videos.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);

  // 영상 샷도 대체용 이미지를 함께 뽑는다 (기획서 9번). 그 몫을 더한다.
  const imageCount = images.length + videos.length;

  return {
    imageCount,
    videoCount: videos.length,
    videoSeconds: round2(videoSeconds),
    imageUsd: round4(imageCount * imageUsd),
    videoUsd: round4(videoSeconds * videoUsdPerSecond),
    totalUsd: round4(imageCount * imageUsd + videoSeconds * videoUsdPerSecond),
    note: '단가는 2026-10 구글 공식 가격 기준 추정치입니다. 재생성 비용은 포함하지 않았습니다.',
  };
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
