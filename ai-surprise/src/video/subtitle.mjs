// 자막 파일(ASS) 생성 (기획서 12번).
//
// ─────────────────────────────────────────────────────────────
// 왜 화면 아래를 비우는가
// ─────────────────────────────────────────────────────────────
//
// 유튜브는 자기 자막(자동 생성·자동 번역·우리가 올린 SRT)을 화면 하단 중앙에
// 띄운다. 그 위치는 우리가 제어할 수 없다. 시청자가 자막 크기를 200%로 키우면
// 세 줄로 늘어나며 더 위로 올라오기도 한다.
//
// 제어할 수 있는 건 우리가 구워 넣는 자막뿐이다. 그래서 제어할 수 있는 쪽이
// 비켜준다. 16:9는 하단 240px, 쇼츠(9:16)는 하단 UI(제목·채널명·버튼)가 더
// 크므로 600px를 비운다.
//
// 이 숫자는 추정치다. 실제로 한 편 올려보고 PC·모바일에서 눈으로 보정해야 한다.
//
// ─────────────────────────────────────────────────────────────
// 왜 ASS인가 (SRT가 아니라)
// ─────────────────────────────────────────────────────────────
//
// SRT는 위치·색·외곽선을 지정할 수 없다. 기획서 12번이 요구하는
// "흰 글자 + 검은 그림자 + 중요 단어 노란색"과 위 여백 규칙을 쓰려면 ASS가 필요하다.
// 유튜브에 따로 올리는 자막 트랙은 SRT로 만든다 — 그건 Phase 7의 일이다.

import { secondsForChars, countNarrationChars } from '../narration.mjs';

/** 화면 규격별 설정. */
export const FORMATS = {
  wide: {
    name: 'wide',
    width: 1920,
    height: 1080,
    fontSize: 64,
    // 유튜브 자막 자리로 비워두는 아래 여백 (px)
    marginV: 240,
    marginH: 120,
    // 한 줄에 넣을 한글 글자 수 상한.
    // 1920px에 64px 글자면 산술적으로는 30자가 들어가지만, 기획서 12번이
    // "한 화면에 너무 많은 글자를 넣지 않는다"고 했으므로 여유를 둔다.
    maxCharsPerLine: 22,
    maxLines: 2,
  },
  shorts: {
    name: 'shorts',
    width: 1080,
    height: 1920,
    fontSize: 72,
    // 쇼츠는 하단에 제목·채널명·구독 버튼이 깔린다. 더 많이 비운다.
    marginV: 600,
    // 오른쪽에 좋아요·공유 아이콘 줄이 있다.
    marginH: 100,
    // 실제로 렌더해 보고 정한 값이다. 처음에 14로 잡았더니 "…26일, / 보급선"
    // 처럼 어절 하나가 혼자 떨어졌다. 72px 글자가 1080px 폭에서 실제로는
    // 글자당 35~55px로 그려져(숫자가 한글보다 좁다) 여유가 더 있었다.
    maxCharsPerLine: 18,
    maxLines: 2,
  },
};

/**
 * ASS 색상 표기는 &HAABBGGRR 이다. RGB가 뒤집혀 있어서 헷갈리기 쉽다.
 * 색을 새로 추가할 때는 반드시 이 함수를 쓴다.
 */
export function assColor({ r, g, b, a = 0 }) {
  const hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, '0');
  return `&H${hex(a)}${hex(b)}${hex(g)}${hex(r)}`;
}

export const COLORS = {
  white: assColor({ r: 255, g: 255, b: 255 }),
  black: assColor({ r: 0, g: 0, b: 0 }),
  // 기획서 12번: 중요 단어는 노란색 또는 빨간색
  yellow: assColor({ r: 255, g: 214, b: 0 }),
  // 그림자는 반투명 검정
  shadow: assColor({ r: 0, g: 0, b: 0, a: 128 }),
};

/**
 * 강조할 말을 찾는다.
 *
 * "중요 단어"를 코드가 정확히 알 수는 없다. 그래서 이 장르에서 실제로 핵심이
 * 되는 것 하나만 규칙으로 잡는다 — **숫자**다.
 *
 *   "세 명이 사라졌는데 외투는 두 벌만 없었다"
 *   "1900년 12월 26일"
 *
 * 이 채널의 소재는 거의 항상 숫자가 안 맞는 데서 이상해진다. 연도, 인원,
 * 개수, 날짜가 그렇다. 그래서 숫자를 강조하면 대개 맞는다.
 *
 * 한글 수사(한, 두, 세, 네...)도 포함한다. 한국어에서는 "세 명"처럼 쓰는 일이
 * 아라비아 숫자보다 많다.
 */
const NUMBER_PATTERN =
  /(\d[\d,]*(?:\.\d+)?\s*(?:년|월|일|시|분|초|명|벌|개|번|차|킬로|미터|시간|주|달|세기)?|[한두세네다섯여섯일곱여덟아홉열]\s*(?:명|벌|개|번|시간|가지|사람))/g;

/** 강조 구간을 ASS 인라인 태그로 감싼다. */
export function emphasize(text, { color = COLORS.yellow } = {}) {
  return String(text || '').replace(
    NUMBER_PATTERN,
    (m) => `{\\c${color}\\b1}${m}{\\c${COLORS.white}\\b0}`
  );
}

/**
 * 긴 문단을 화면에 들어갈 조각으로 나눈다.
 *
 * 문장 부호에서 먼저 끊고, 그래도 길면 띄어쓰기에서 끊는다.
 * 글자 한가운데서 자르지 않는다 — 한국어는 어절이 잘리면 읽기가 크게 나빠진다.
 */
export function splitForScreen(text, { maxCharsPerLine, maxLines }) {
  const limit = maxCharsPerLine * maxLines;
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (countNarrationChars(clean) <= limit) return [clean];

  // 1차: 문장 부호 뒤에서 끊는다.
  const sentences = clean.split(/(?<=[.!?。…])\s+/).filter(Boolean);

  const chunks = [];
  let buffer = '';

  const push = () => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = '';
  };

  for (const sentence of sentences) {
    if (countNarrationChars(sentence) > limit) {
      push();
      chunks.push(...splitWordsBalanced(sentence, limit));
      continue;
    }

    const next = buffer ? `${buffer} ${sentence}` : sentence;
    if (countNarrationChars(next) > limit) {
      push();
      buffer = sentence;
    } else {
      buffer = next;
    }
  }
  push();

  return chunks;
}

/**
 * 한 문장을 어절 단위로, 조각 수를 최소로 하면서 고르게 나눈다.
 *
 * 한도까지 꽉 채우는 방식으로 자르면 마지막에 "도착했다." 같은 짧은 꼬리가
 * 남는다. 그 조각은 1초도 안 되게 떴다 사라져서 화면에서 깜빡이는 것처럼 보인다.
 *
 * 그래서 두 가지를 같이 지킨다.
 *   1) 조각 수는 최소로 (= ceil(전체/한도))
 *   2) 그 조각 수 안에서 가장 고르게
 *
 * 방법: 목표 폭을 작게 잡고 시작해 한도까지 1씩 늘리면서, 조각 수가 최소에
 * 도달하는 첫 폭을 쓴다. 폭을 좁게 잡을수록 고르게 나뉘므로 "조각 수를
 * 만족하는 가장 좁은 폭"이 곧 가장 고른 분할이다.
 *
 * 어절 하나가 한도보다 긴 경우(긴 고유명사 등)에도 멈추지 않는다 — 그 어절은
 * 혼자 한 조각이 된다. 글자 한가운데서 자르지 않는다.
 */
export function splitWordsBalanced(sentence, limit) {
  const words = String(sentence || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const fill = (width) => {
    const out = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && countNarrationChars(next) > width) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
    return out;
  };

  const total = countNarrationChars(words.join(' '));
  const fewest = Math.max(1, Math.ceil(total / limit));
  const start = Math.max(1, Math.ceil(total / fewest));

  for (let width = start; width <= limit; width++) {
    const out = fill(width);
    if (out.length <= fewest) return out;
  }
  return fill(limit);
}

/** 조각을 maxLines 줄로 접는다. ASS의 줄바꿈은 \N 이다. */
export function wrapLines(text, { maxCharsPerLine, maxLines }) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (countNarrationChars(next) > maxCharsPerLine && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  // 줄 수를 넘기면 마지막 줄에 붙인다. 글자를 버리지 않는다 —
  // 나레이션은 읽히는데 자막만 사라지면 보는 사람이 혼란스럽다.
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    head.push(lines.slice(maxLines - 1).join(' '));
    return head.join('\\N');
  }
  return lines.join('\\N');
}

/** 초 → ASS 시간 표기 (H:MM:SS.cc) */
export function assTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

/**
 * 장면 목록 → 자막 큐 목록.
 *
 * 타이밍은 문단 길이에 비례해 나눈다. Phase 4에서 실제 TTS 타임스탬프가
 * 생기면 `paragraphTimings`로 넘겨 정확한 값으로 대체한다. 그때는 추정이
 * 아니라 실측이 된다.
 *
 * @param scenes            Phase 2가 만든 장면 목록
 * @param format            FORMATS.wide 또는 FORMATS.shorts
 * @param paragraphTimings  [{ start, end }] — 문단 순서대로. 없으면 추정한다.
 * @param range             { start, end } — 쇼츠처럼 일부 구간만 쓸 때
 */
export function buildCues(scenes, { format = FORMATS.wide, paragraphTimings = null, range = null } = {}) {
  const cues = [];
  let cursor = 0;
  let paragraphIndex = 0;

  for (const scene of scenes || []) {
    for (const p of scene.paragraphs || []) {
      const timing = paragraphTimings?.[paragraphIndex];
      const start = timing ? timing.start : cursor;
      const end = timing ? timing.end : cursor + (Number(p.seconds) || 0);
      paragraphIndex++;
      cursor = end;

      const span = Math.max(0.1, end - start);
      const chunks = splitForScreen(p.text, format);
      if (!chunks.length) continue;

      // 조각마다 글자 수에 비례해 시간을 나눈다. 짧은 조각이 오래 떠 있으면
      // 나레이션과 어긋난 것처럼 보인다.
      const weights = chunks.map((c) => Math.max(1, countNarrationChars(c)));
      const total = weights.reduce((a, b) => a + b, 0);

      let t = start;
      for (const [i, chunk] of chunks.entries()) {
        const dur = (weights[i] / total) * span;
        cues.push({
          start: t,
          end: t + dur,
          text: chunk,
          tag: p.tag,
          scene: scene.scene_number,
        });
        t += dur;
      }
    }
  }

  if (!range) return cues;

  // 구간을 자를 때: 걸치는 큐는 잘라서 남기고, 시작 시각을 0으로 옮긴다.
  return cues
    .filter((c) => c.end > range.start && c.start < range.end)
    .map((c) => ({
      ...c,
      start: Math.max(0, c.start - range.start),
      end: Math.min(range.end, c.end) - range.start,
    }))
    .filter((c) => c.end - c.start > 0.1);
}

/** 큐 목록 → ASS 파일 내용. */
export function renderAss(cues, { format = FORMATS.wide, fontName = 'Noto Sans CJK KR' } = {}) {
  const head = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${format.width}`,
    `PlayResY: ${format.height}`,
    // WrapStyle 2 = 줄바꿈을 우리가 넣은 \N 으로만 한다.
    // 자동 줄바꿈을 켜두면 maxCharsPerLine 계산이 무의미해진다.
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,' +
      ' Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline,' +
      ' Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Alignment 2 = 하단 중앙. MarginV가 그 하단에서 띄우는 거리다.
    // Outline 4 / Shadow 2 = 어떤 배경 위에서도 글자가 읽히게 하는 값.
    //   기획서 12번의 "흰색 글자 + 검은색 그림자"를 이렇게 구현한다.
    `Style: Main,${fontName},${format.fontSize},${COLORS.white},${COLORS.white},${COLORS.black},` +
      `${COLORS.shadow},-1,0,0,0,100,100,0,0,1,4,2,2,${format.marginH},${format.marginH},${format.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const lines = (cues || []).map((c) => {
    const wrapped = wrapLines(c.text, format);
    const text = emphasize(wrapped);
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Main,,0,0,0,,${text}`;
  });

  return [...head, ...lines, ''].join('\n');
}

/** 장면 → ASS 파일 내용 한 번에. */
export function buildAss(scenes, options = {}) {
  return renderAss(buildCues(scenes, options), options);
}

/**
 * 유튜브에 따로 올릴 SRT. 하드섭과 달리 위치·색을 못 쓰므로 글자만 담는다.
 *
 * 한국어 정확판과 영어 번역판을 이 형식으로 올린다(기획서에 없던 결정 —
 * 유튜브 자동 생성·자동 번역을 쓰지 않기로 했다. 우리는 대본 원문을 갖고 있어서
 * 음성인식으로 되돌릴 이유가 없다).
 */
export function renderSrt(cues) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const srtTime = (seconds) => {
    const s = Math.max(0, Number(seconds) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
  };

  return (cues || [])
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}

/** 장면 전체 길이(초). 타임라인과 자막이 같은 값을 쓰도록 여기 둔다. */
export function totalSeconds(scenes) {
  let chars = 0;
  for (const scene of scenes || []) {
    for (const p of scene.paragraphs || []) chars += countNarrationChars(p.text);
  }
  return secondsForChars(chars);
}
