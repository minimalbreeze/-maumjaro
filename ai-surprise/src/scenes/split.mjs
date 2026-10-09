// 대본을 장면과 샷으로 쪼갠다 (기획서 7번).
//
// 전부 코드가 한다. AI를 부르지 않는다. 나레이션 글자를 하나도 바꾸지
// 않고 버리지 않는 것이 이 파일의 유일한 약속이고, 그 약속은 분할 뒤에
// 지문(narrationFingerprint)을 다시 찍어서 기계로 확인한다.
//
// 장면과 샷을 왜 나누는가
//   기획서 7번은 장면 12~15개를 요구한다. 그런데 4분(240초)을 13개로
//   나누면 장면 하나가 18초다. 이미지 한 장을 18초 동안 보여주면 아무도
//   안 본다. 그래서 장면 안에서 다시 "샷"으로 쪼갠다.
//
//   장면 = 이야기의 한 토막 (나레이션·분위기·효과음이 붙는 단위)
//   샷   = 화면 하나 (이미지 한 장 또는 AI 영상 한 클립)
//
//   샷 하나는 최대 8초다. AI 영상 클립이 대개 8~10초까지이고, 이미지에
//   줌을 걸어도 8초를 넘기면 지루해진다.

import { parseScript, narrationFingerprint } from './parse.mjs';
import { secondsForChars } from '../narration.mjs';

/**
 * 장면 수.
 *
 * 기획서 7번은 "12~15개"라고 못 박았는데, 그건 **4분 영상 기준**이었다.
 * 영상을 7~8분으로 늘리면서 그 숫자를 그대로 두면 장면 하나가 32초가 된다.
 * 32초 동안 같은 분위기의 화면이 이어지면 시청자가 나간다.
 *
 * 그래서 고정값이 아니라 **길이에 비례**하게 바꿨다. 장면 하나에 18초쯤이
 * 기준이다(4분 → 13개, 8분 → 27개). 상한을 둔 이유는 장면이 너무 잘게
 * 쪼개지면 화면 설계(AI)를 장면마다 돌려야 해서 비용과 시간이 늘기 때문이다.
 */
export const SECONDS_PER_SCENE = 18;
export const TARGET_SCENES_MIN = 12;
export const TARGET_SCENES_MAX = 40;

/** 나레이션 길이에 맞는 목표 장면 수. */
export function targetScenesFor(totalSeconds) {
  return clamp(Math.round((Number(totalSeconds) || 0) / SECONDS_PER_SCENE), TARGET_SCENES_MIN, TARGET_SCENES_MAX);
}

/**
 * 장면 하나가 너무 길거나 너무 짧은지.
 *
 * 장면 **개수**를 고정 범위(12~15)와 비교하던 것을 이걸로 바꿨다. 개수는
 * 영상 길이에 따라 당연히 달라지므로 그 자체로는 아무것도 말해주지 않는다.
 * 실제로 중요한 건 **화면이 얼마나 자주 바뀌는가**다.
 *
 *  - 10초보다 짧으면: 화면이 정신없이 바뀐다. 설계 비용도 쓸데없이 는다.
 *  - 30초보다 길면: 같은 분위기가 너무 오래 간다. 여기서 시청자가 나간다.
 */
export const SCENE_SECONDS_MIN = 10;
export const SCENE_SECONDS_MAX = 30;

export function sceneLengthOffTarget(sceneCount, totalSeconds) {
  if (!sceneCount || !totalSeconds) return false;
  const average = totalSeconds / sceneCount;
  return average < SCENE_SECONDS_MIN || average > SCENE_SECONDS_MAX;
}

/** 샷 하나의 길이 한계 (초). */
export const SHOT_SECONDS_MAX = 8;
export const SHOT_SECONDS_MIN = 2.5;

/**
 * 문단들을 장면으로 묶는다.
 *
 * 규칙
 *  1) 섹션 경계를 넘지 않는다. HOOK의 문단과 CASE의 문단이 한 장면에
 *     섞이면 이야기의 토막이 뭉개진다.
 *  2) 그 안에서 목표 장면 길이에 가깝게 문단을 이어 붙인다.
 *  3) 문단은 쪼개지 않는다. 문단이 목표보다 길면 그 문단 하나가 한 장면이다.
 *     문단을 쪼개려면 문장을 잘라야 하는데, 한국어 문장 경계를 정규식으로
 *     자르면 "…했다. 그런데" 같은 데서 어색하게 끊긴다. 긴 문단은
 *     장면 하나로 두고 샷으로 나누는 쪽이 안전하다.
 */
export function groupIntoScenes(parsed, { targetScenes = null } = {}) {
  const paragraphs = parsed?.paragraphs || [];
  if (!paragraphs.length) return [];

  // 1) 섹션별로 연속된 문단을 모은다.
  const runs = [];
  for (const p of paragraphs) {
    const last = runs.at(-1);
    if (last && last.sectionKey === p.sectionKey) last.paragraphs.push(p);
    else runs.push({ sectionKey: p.sectionKey, paragraphs: [p] });
  }

  const totalSeconds = paragraphs.reduce((s, p) => s + p.seconds, 0);

  // 2) 목표 장면 수.
  //    섹션이 9개면 장면은 최소 9개다(섹션 경계를 넘지 않으므로).
  //    문단 수보다 많은 장면도 만들 수 없다(문단을 쪼개지 않으므로).
  //    그 두 한계 사이에서 길이에 맞는 수로 맞춘다.
  const wanted = clamp(
    targetScenes || targetScenesFor(totalSeconds),
    Math.max(TARGET_SCENES_MIN, runs.length),
    Math.min(TARGET_SCENES_MAX, paragraphs.length)
  );

  // 3) 섹션마다 장면 몇 개를 줄지 정한다.
  //    기본 1개씩 주고, 남은 몫을 길이 비례로 나눈다(최대 잉여법).
  //    긴 섹션이 더 많은 장면을 갖는 게 맞다 — 반전 섹션이 길면 거기서
  //    화면이 더 자주 바뀌어야 한다.
  const quotas = allocateQuotas(runs, wanted);

  // 4) 섹션 안에서 문단을 그 개수만큼 나눈다.
  const groups = [];
  for (const [i, run] of runs.entries()) {
    groups.push(...splitRun(run.paragraphs, quotas[i]));
  }

  return groups.map((group, i) => makeScene(group, i + 1));
}

/** 섹션마다 장면 몇 개씩. 합계가 정확히 wanted가 되게 한다. */
function allocateQuotas(runs, wanted) {
  // 섹션당 최소 1개. 문단 수를 넘지 못한다.
  const caps = runs.map((r) => r.paragraphs.length);
  const quotas = runs.map(() => 1);
  let remaining = wanted - runs.length;

  if (remaining <= 0) return quotas;

  // 길이 비례로 남은 몫을 나눈다.
  const seconds = runs.map((r) => r.paragraphs.reduce((s, p) => s + p.seconds, 0));
  const total = seconds.reduce((a, b) => a + b, 0) || 1;

  // 1차: 내림으로 배분
  const shares = seconds.map((s) => (s / total) * remaining);
  for (let i = 0; i < runs.length && remaining > 0; i++) {
    const add = Math.min(Math.floor(shares[i]), caps[i] - quotas[i], remaining);
    if (add > 0) {
      quotas[i] += add;
      remaining -= add;
    }
  }

  // 2차: 남은 몫을 잉여가 큰 순서로 하나씩. 여유가 없는 섹션은 건너뛴다.
  const order = shares
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let guard = runs.length * 2;
  while (remaining > 0 && guard-- > 0) {
    let placed = false;
    for (const { i } of order) {
      if (remaining <= 0) break;
      if (quotas[i] < caps[i]) {
        quotas[i]++;
        remaining--;
        placed = true;
      }
    }
    // 모든 섹션이 문단 수에 꽉 찼으면 더 쪼갤 수 없다. 남은 몫을 버린다.
    if (!placed) break;
  }

  return quotas;
}

/**
 * 한 섹션의 문단들을 k개 장면으로 나눈다.
 *
 * 길이가 고르게 되도록 "지금까지 담은 시간이 이상적인 경계를 넘었으면
 * 다음 장면으로" 방식으로 자른다. 문단은 쪼개지 않는다.
 */
function splitRun(paragraphs, k) {
  const count = clamp(k, 1, paragraphs.length);
  if (count === 1) return [paragraphs];
  if (count === paragraphs.length) return paragraphs.map((p) => [p]);

  const total = paragraphs.reduce((s, p) => s + p.seconds, 0);
  const groups = [];
  let bucket = [];
  let elapsed = 0;

  for (const [i, p] of paragraphs.entries()) {
    bucket.push(p);
    elapsed += p.seconds;

    const groupsLeftAfterThis = count - groups.length - 1;
    const paragraphsLeft = paragraphs.length - i - 1;

    // 남은 문단으로 남은 장면을 못 채우겠으면 지금 끊는다.
    const mustCut = paragraphsLeft <= groupsLeftAfterThis;
    // 이상적인 경계를 넘었고, 남은 문단으로 남은 장면을 채울 수 있으면 끊는다.
    const idealBoundary = (total * (groups.length + 1)) / count;
    const shouldCut = elapsed >= idealBoundary && paragraphsLeft > groupsLeftAfterThis;

    if (groups.length < count - 1 && (mustCut || shouldCut)) {
      groups.push(bucket);
      bucket = [];
    }
  }
  if (bucket.length) groups.push(bucket);
  return groups;
}

function makeScene(paragraphs, sceneNumber) {
  const narration = paragraphs.map((p) => p.text).join(' ');
  const chars = paragraphs.reduce((s, p) => s + p.chars, 0);
  const seconds = round2(secondsForChars(chars));
  const tags = [...new Set(paragraphs.map((p) => p.tag))];

  return {
    scene_number: sceneNumber,
    section: paragraphs[0].sectionKey,
    narration,
    // 문단을 그대로 들고 간다. 나중에 자막을 문단 단위로 붙일 때 쓴다.
    paragraphs: paragraphs.map((p) => ({ tag: p.tag, text: p.text, seconds: p.seconds })),
    tags,
    chars,
    duration: seconds,
    shots: planShots(seconds, sceneNumber),
  };
}

/**
 * 장면 길이를 샷으로 나눈다.
 *
 * 8초 한계에 맞춰 개수를 정하고 길이를 고르게 나눈다.
 * 나머지를 마지막 샷에 몰아주지 않고 균등하게 나누는 이유: 마지막 샷만
 * 1초짜리가 되면 깜빡이는 것처럼 보인다.
 */
export function planShots(sceneSeconds, sceneNumber = 1) {
  const seconds = Math.max(0, Number(sceneSeconds) || 0);
  if (seconds <= 0) return [];

  const count = Math.max(1, Math.ceil(seconds / SHOT_SECONDS_MAX));
  const each = seconds / count;

  const shots = [];
  for (let i = 0; i < count; i++) {
    shots.push({
      shot_id: `S${String(sceneNumber).padStart(2, '0')}-${i + 1}`,
      duration: round2(each),
      // 에셋 종류(이미지/영상)와 프롬프트는 뒤 단계에서 채운다.
      asset_type: null,
      camera: null,
      image_prompt: null,
      video_prompt: null,
    });
  }
  return shots;
}

/**
 * 대본 → 장면 목록. 이 파일의 입구.
 *
 * 반환: { scenes, stats, problems }
 *   problems 가 비어 있지 않으면 다음 단계로 넘기지 않는다.
 */
export function splitIntoScenes(markdown, { targetScenes = null } = {}) {
  const parsed = parseScript(markdown);
  const problems = [...parsed.problems];

  if (problems.length) {
    return { scenes: [], stats: emptyStats(), problems };
  }

  const scenes = groupIntoScenes(parsed, { targetScenes });

  // 약속 확인: 쪼갠 뒤에도 나레이션이 원문과 같은가.
  // 같지 않으면 버그다. 조용히 넘기지 않고 멈춘다.
  const before = narrationFingerprint(parsed);
  const after = narrationFingerprint(scenes.flatMap((s) => s.paragraphs));
  if (before !== after) {
    problems.push(
      '장면으로 쪼개는 중 나레이션이 바뀌었습니다. 코드 버그입니다 — 이 결과를 쓰지 마세요.'
    );
  }

  // 장면 수가 목표에서 벗어나는 건 오류가 아니다. 짧은 대본은 장면이 적은 게
  // 맞다. problems에 넣지 않고 stats.outsideTargetRange로만 알린다.
  const sceneCount = scenes.length;
  const shots = scenes.flatMap((s) => s.shots);
  const totalSeconds = round2(scenes.reduce((s, x) => s + x.duration, 0));

  return {
    scenes,
    stats: {
      sceneCount,
      shotCount: shots.length,
      totalSeconds,
      totalChars: parsed.totalChars,
      sectionsCovered: [...new Set(scenes.map((s) => s.section))].length,
      shortestScene: sceneCount ? Math.min(...scenes.map((s) => s.duration)) : 0,
      longestScene: sceneCount ? Math.max(...scenes.map((s) => s.duration)) : 0,
      averageScene: sceneCount ? round2(totalSeconds / sceneCount) : 0,
      // 장면 하나가 너무 길거나 짧은지. 장면 "개수"가 아니라 "길이"를 본다.
      outsideTargetRange: sceneLengthOffTarget(sceneCount, totalSeconds),
    },
    problems,
  };
}

function emptyStats() {
  return {
    sceneCount: 0,
    shotCount: 0,
    totalSeconds: 0,
    totalChars: 0,
    sectionsCovered: 0,
    shortestScene: 0,
    longestScene: 0,
    outsideTargetRange: true,
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
