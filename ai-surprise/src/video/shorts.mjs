// 쇼츠 후보 고르기 (기획서 14번).
//
// "하나의 본편에서 Shorts 후보를 3개 자동 추천한다. 9:16, 30~60초."
//
// AI를 쓰지 않는다. 대본 구조가 이미 어디가 중요한지 말해주고 있기 때문이다.
// HOOK은 첫 10초를 위해 쓴 문단이고, TWIST는 전제가 뒤집히는 지점이다.
// 그 구조를 그대로 쓰면 된다.
//
// 자르는 규칙이 하나 있다: **문장 중간에서 끊지 않는다.**
// 쇼츠는 소리를 켜고 보는 사람이 많아서, 말이 끊기면 바로 나간다.
// 그래서 문단 경계에서만 자른다.

import { secondsForChars, countNarrationChars } from '../narration.mjs';

/**
 * 쇼츠 길이.
 *
 * 처음엔 30~60초로 잡았다. 유튜브가 쇼츠를 3분까지 늘린 뒤로 60초 제한은
 * 더 이상 기술적 한계가 아니다. 그리고 30초짜리는 이야기가 안 된다 —
 * 사건을 소개하다 끝나서 "그래서 뭐?"가 된다.
 *
 * 60~90초면 "이상한 상황 제시 → 한 번 뒤집기"가 들어간다. 그게 끝까지
 * 보게 만드는 최소 단위다.
 */
export const SHORTS_MIN_SECONDS = 60;
export const SHORTS_MAX_SECONDS = 90;

/**
 * 섹션별 쇼츠 가치.
 *
 * HOOK이 가장 높다 — 애초에 사람을 붙잡으려고 쓴 글이라 그대로 쇼츠가 된다.
 * TWIST가 그다음이다. 전제가 뒤집히는 순간은 그 자체로 완결된 이야기다.
 * OUR_READING은 이 채널만의 해석이라 채널 색을 보여주기 좋다.
 * EXPLAIN·KNOWN은 앞뒤 맥락이 있어야 이해돼서 단독으로는 약하다.
 */
const SECTION_VALUE = {
  HOOK: 100,
  // 전설 추적 편의 ORIGIN("이 이야기는 어디서 왔나")은 그 편의 반전이다.
  // 쇼츠로 잘라도 그 자체로 완결된다 — "다들 믿던 그 이야기, 출처가 여기다".
  ORIGIN: 95,
  TWIST: 90,
  ODD: 70,
  CLUE: 65,
  OUR_READING: 60,
  QUESTION: 55,
  CASE: 40,
  EXPLAIN: 30,
  KNOWN: 25,
};

/**
 * 본편에서 쇼츠 후보 구간을 고른다.
 *
 * 반환: [{ rank, start, end, duration, sections, reason, paragraphs }]
 *   start/end 는 본편 기준 초다. 이 구간을 잘라 9:16으로 다시 렌더한다.
 *
 * 고르는 방법
 *  1) 문단을 순서대로 이어 붙이며 30~60초가 되는 모든 구간을 만든다
 *  2) 구간마다 점수를 낸다 (섹션 가치 + 길이 적합도)
 *  3) 점수 높은 순으로 고르되, 이미 고른 구간과 많이 겹치면 건너뛴다
 */
export function pickShorts(scenes, { count = 3, minSeconds = SHORTS_MIN_SECONDS, maxSeconds = SHORTS_MAX_SECONDS } = {}) {
  // 문단을 평평하게 펴고 각자의 시작·끝 시각을 계산한다.
  const paragraphs = [];
  let cursor = 0;
  for (const scene of scenes || []) {
    for (const p of scene.paragraphs || []) {
      const seconds = secondsForChars(countNarrationChars(p.text));
      paragraphs.push({
        section: scene.section,
        scene_number: scene.scene_number,
        tag: p.tag,
        text: p.text,
        start: cursor,
        end: cursor + seconds,
        seconds,
      });
      cursor += seconds;
    }
  }
  if (!paragraphs.length) return [];

  // 모든 연속 구간 중 길이 조건을 만족하는 것을 모은다.
  const candidates = [];
  for (let i = 0; i < paragraphs.length; i++) {
    let seconds = 0;
    for (let j = i; j < paragraphs.length; j++) {
      seconds += paragraphs[j].seconds;
      if (seconds > maxSeconds) break;
      if (seconds < minSeconds) continue;

      const slice = paragraphs.slice(i, j + 1);
      candidates.push({
        from: i,
        to: j,
        start: round2(paragraphs[i].start),
        end: round2(paragraphs[j].end),
        duration: round2(seconds),
        paragraphs: slice,
        score: scoreSlice(slice, seconds, { minSeconds, maxSeconds }),
      });
    }
  }

  if (!candidates.length) {
    // 대본이 짧아 30초짜리 구간이 안 나오는 경우. 전체를 하나로 돌려준다.
    const seconds = round2(cursor);
    return [
      {
        rank: 1,
        start: 0,
        end: seconds,
        duration: seconds,
        sections: [...new Set(paragraphs.map((p) => p.section))],
        reason: `대본이 ${seconds}초뿐이라 ${minSeconds}초 구간을 만들 수 없었습니다. 전체를 썼습니다.`,
        paragraphs,
      },
    ];
  }

  candidates.sort((a, b) => b.score - a.score || a.start - b.start);

  const picked = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    // 이미 고른 구간과 절반 넘게 겹치면 건너뛴다. 비슷한 쇼츠 3개는 쓸모없다.
    const overlapsTooMuch = picked.some((p) => {
      const overlap = Math.min(p.end, c.end) - Math.max(p.start, c.start);
      return overlap > Math.min(p.duration, c.duration) * 0.5;
    });
    if (overlapsTooMuch) continue;

    const sections = [...new Set(c.paragraphs.map((p) => p.section))];
    picked.push({
      rank: picked.length + 1,
      start: c.start,
      end: c.end,
      duration: c.duration,
      sections,
      reason: explain(sections, c.duration),
      paragraphs: c.paragraphs,
    });
  }

  return picked;
}

/** 구간 점수. 섹션 가치가 주고, 길이는 보조다. */
function scoreSlice(slice, seconds, { minSeconds, maxSeconds }) {
  // 섹션 가치는 길이로 가중 평균한다. 짧게 스친 섹션이 점수를 끌어올리면 안 된다.
  let weighted = 0;
  let total = 0;
  for (const p of slice) {
    weighted += (SECTION_VALUE[p.section] ?? 35) * p.seconds;
    total += p.seconds;
  }
  const sectionScore = total ? weighted / total : 0;

  // 길이는 45초쯤이 가장 좋다. 너무 짧으면 이야기가 안 되고, 60초에 붙으면
  // 유튜브가 쇼츠로 안 잡을 위험이 있다.
  const ideal = (minSeconds + maxSeconds) / 2;
  const lengthScore = 100 - (Math.abs(seconds - ideal) / ideal) * 100;

  // 시작이 HOOK이면 더 준다. 쇼츠는 첫 1초가 전부다.
  const startsWithHook = slice[0]?.section === 'HOOK' ? 15 : 0;

  return sectionScore * 0.75 + lengthScore * 0.25 + startsWithHook;
}

function explain(sections, duration) {
  const names = {
    HOOK: '훅',
    CASE: '사건 소개',
    ODD: '이상한 점',
    CLUE: '새로운 단서',
    TWIST: '반전',
    OUR_READING: '우리가 주목한 것',
    ORIGIN: '이 이야기의 출처',
    EXPLAIN: '가능한 설명',
    KNOWN: '밝혀진 사실',
    QUESTION: '마지막 질문',
  };
  const label = sections.map((s) => names[s] || s).join(' → ');
  return `${label} (${duration}초)`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
