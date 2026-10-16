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
import { KIND } from '../model.mjs';

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
  // ── 창작 동화(KIND.TALE)의 섹션
  //
  // TURN·CLOSE 는 **점수를 매기지 않는다.** 아래 SPOILER_SECTIONS 가
  // 아예 후보에서 빼기 때문이다. 점수를 주면 "쓸 수도 있다"는 뜻이 되어
  // 다음 사람이 헷갈린다.
  //
  // NOTICE 가 FOLLOW 보다 높다. 이상한 것을 **처음 알아채는 순간**이
  // 쇼츠 한 편으로 완결되기 때문이다. FOLLOW 는 쫓아가는 중간이라
  // 그 자체로는 끝맺음이 없다.
  NOTICE: 85,
  FOLLOW: 70,
  SETUP: 50,
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
 * 쇼츠에 넣으면 안 되는 섹션.
 *
 * ─────────────────────────────────────────────────────────────
 * 1화에서 실제로 난 일
 * ─────────────────────────────────────────────────────────────
 *
 * 1화(174초)의 쇼츠 2번이 94~169초로 잘렸다. 뒤집힘과 여운이 **통째로**
 * 들어갔다 — 그림자가 식탁에 앉는 장면도, 엄마가 창문을 안 보는 것도,
 * 발밑이 비어 있다는 마지막 줄도. 그걸 보고 나면 본편을 볼 이유가 없다.
 *
 * 실화 편에서는 이 문제가 없었다. 미스터리는 반전을 보여줘도 "그래서
 * 어떻게 된 건데"가 남기 때문이다. **동화는 뒤집히는 순간이 끝이다.**
 *
 * 쇼츠의 일은 본편으로 데려오는 것이지 본편을 대신하는 것이 아니다.
 * 그래서 동화에서는 TURN·CLOSE 가 든 구간을 후보에서 아예 뺀다.
 */
export const SPOILER_SECTIONS = {
  [KIND.TALE]: ['TURN', 'CLOSE'],
};

export function spoilerSectionsFor(kind) {
  return SPOILER_SECTIONS[kind] || [];
}

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
export function pickShorts(scenes, { count = 3, minSeconds = SHORTS_MIN_SECONDS, maxSeconds = SHORTS_MAX_SECONDS, kind = null } = {}) {
  const spoilers = spoilerSectionsFor(kind);
  const isSpoiler = (section) => spoilers.includes(section);
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

  // 결말이 든 문단은 후보 재료에서 뺀다. 점수를 낮추는 것으로는 부족하다 —
  // 낮은 점수도 후보가 셋뿐이면 뽑히기 때문이다.
  const usable = spoilers.length ? paragraphs.filter((p) => !isSpoiler(p.section)) : paragraphs;
  if (!usable.length) return [];

  // 모든 연속 구간 중 길이 조건을 만족하는 것을 모은다.
  const candidates = [];
  for (let i = 0; i < usable.length; i++) {
    let seconds = 0;
    for (let j = i; j < usable.length; j++) {
      // 결말 문단을 뺐으므로 usable 안에서 이웃이어도 본편에서는 떨어져
      // 있을 수 있다. 그런 구간을 이어 붙이면 영상이 건너뛴 것처럼 보인다.
      if (j > i && usable[j].start > usable[j - 1].end + 0.01) break;
      seconds += usable[j].seconds;
      if (seconds > maxSeconds) break;
      if (seconds < minSeconds) continue;

      const slice = usable.slice(i, j + 1);
      candidates.push({
        from: i,
        to: j,
        start: round2(usable[i].start),
        end: round2(usable[j].end),
        duration: round2(seconds),
        paragraphs: slice,
        score: scoreSlice(slice, seconds, { minSeconds, maxSeconds }),
      });
    }
  }

  if (!candidates.length) {
    // 대본이 짧아 구간이 안 나오는 경우. 쓸 수 있는 데까지를 하나로 돌려준다.
    // **여기서도 결말은 넣지 않는다.** 짧다는 이유로 결말을 흘리면
    // 위에서 막은 것이 무의미해진다.
    const first = usable[0];
    const last = usable[usable.length - 1];
    const seconds = round2(last.end - first.start);
    return [
      {
        rank: 1,
        start: round2(first.start),
        end: round2(last.end),
        duration: seconds,
        sections: [...new Set(usable.map((p) => p.section))],
        reason: `쓸 수 있는 구간이 ${seconds}초뿐이라 ${minSeconds}초 구간을 만들 수 없었습니다. 그대로 썼습니다.`,
        paragraphs: usable,
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
