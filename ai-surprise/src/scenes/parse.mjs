// script.md 를 읽어 섹션과 태그 문단으로 쪼갠다.
//
// AI를 쓰지 않는다. 정규식으로 읽는다. 이유가 있다.
//
// 대본을 AI에게 "장면으로 쪼개서 돌려줘"라고 시키면, 쪼개면서 나레이션을
// 요약하거나 문장을 다듬어버린다. 그러면 사람이 승인한 대본과 영상에서
// 실제로 읽히는 말이 달라진다. 승인 절차가 무의미해진다.
//
// 그래서 글자는 코드가 다룬다. 한 글자도 바꾸지 않고, 버리지 않는다.
// AI는 "이 장면에 어떤 그림이 어울리나"만 설계한다 (visuals.mjs).

import { SECTIONS, TAGS } from '../script/write.mjs';
import { countNarrationChars, secondsForText } from '../narration.mjs';

const SECTION_RE = /^##\s*\[([A-Z_]+)\]\s*(.*)$/;
const TAG_RE = new RegExp(`^\\[(${TAGS.join('|')})\\]\\s*(.*)$`);

/** 섹션 키 → 라벨. 대본에 라벨이 빠져 있어도 채워 넣는다. */
const SECTION_LABEL = new Map(SECTIONS.map((s) => [s.key, s.label]));

/**
 * 대본을 읽는다.
 *
 * 반환:
 *   {
 *     sections: [{ key, label, paragraphs }],
 *     paragraphs: [{ index, sectionKey, tag, text, chars, seconds }],
 *     totalChars, totalSeconds,
 *     problems: []            // 읽는 중 발견한 이상한 점
 *   }
 *
 * problems 가 비어 있지 않으면 장면 분할로 넘기지 않는다. 깨진 대본으로
 * 장면을 만들면 Phase 3에서 돈을 쓴 뒤에야 문제를 발견한다.
 */
export function parseScript(markdown) {
  const problems = [];
  const sections = [];
  const paragraphs = [];

  let current = null;

  for (const rawLine of String(markdown || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      const [, key, label] = sectionMatch;
      current = {
        key,
        label: label || SECTION_LABEL.get(key) || key,
        paragraphs: [],
      };
      sections.push(current);
      continue;
    }

    // 섹션 제목이 아닌 다른 마크다운 제목은 대본 양식이 아니다.
    if (line.startsWith('#')) {
      problems.push(`대본 양식에 없는 제목이 있습니다: "${line.slice(0, 40)}"`);
      continue;
    }

    const tagMatch = line.match(TAG_RE);
    if (!tagMatch) {
      // 태그 없는 문단. write.mjs의 validateScript가 이미 막지만,
      // 사람이 손으로 고친 대본이 들어올 수 있으므로 여기서도 막는다.
      problems.push(`사실 구분 태그가 없는 문단이 있습니다: "${line.slice(0, 40)}"`);
      continue;
    }

    const [, tag, text] = tagMatch;
    if (!text) {
      problems.push(`[${tag}] 태그만 있고 내용이 없는 줄이 있습니다.`);
      continue;
    }
    if (!current) {
      problems.push(`섹션 제목보다 먼저 나온 문단이 있습니다: "${text.slice(0, 40)}"`);
      continue;
    }

    const paragraph = {
      index: paragraphs.length,
      sectionKey: current.key,
      tag,
      text,
      chars: countNarrationChars(text),
      seconds: round2(secondsForText(text)),
    };
    paragraphs.push(paragraph);
    current.paragraphs.push(paragraph);
  }

  // 섹션이 다 있는지, 순서가 맞는지. validateScript와 같은 검사지만
  // 여기서 한 번 더 본다 — 저장된 대본을 사람이 고쳤을 수 있다.
  const foundKeys = sections.map((s) => s.key);
  const expectedKeys = SECTIONS.map((s) => s.key);
  for (const key of expectedKeys) {
    if (!foundKeys.includes(key)) problems.push(`섹션이 없습니다: [${key}]`);
  }
  const ordered = foundKeys.filter((k) => expectedKeys.includes(k));
  const expectedOrder = expectedKeys.filter((k) => ordered.includes(k));
  if (ordered.join(',') !== expectedOrder.join(',')) {
    problems.push(`섹션 순서가 다릅니다: ${ordered.join(' → ')}`);
  }

  if (!paragraphs.length) problems.push('나레이션 문단이 하나도 없습니다.');

  const totalChars = paragraphs.reduce((sum, p) => sum + p.chars, 0);

  return {
    sections,
    paragraphs,
    totalChars,
    totalSeconds: round2(paragraphs.reduce((sum, p) => sum + p.seconds, 0)),
    problems,
  };
}

/**
 * 쪼갠 결과를 되돌려 원문과 같은지 확인한다.
 *
 * 이 함수가 이 파일의 핵심이다. "글자를 하나도 안 바꿨다"는 주장을
 * 말로 하는 대신 기계로 증명한다. 장면 분할 뒤에도 같은 방식으로 확인한다.
 *
 * 비교는 공백을 뺀 글자열로 한다 — 줄바꿈과 띄어쓰기는 쪼개는 과정에서
 * 바뀔 수 있지만 읽히는 말이 달라지면 안 된다.
 */
export function narrationFingerprint(parsedOrParagraphs) {
  const list = Array.isArray(parsedOrParagraphs)
    ? parsedOrParagraphs
    : parsedOrParagraphs?.paragraphs || [];
  return list.map((p) => `${p.tag}:${String(p.text).replace(/\s/g, '')}`).join('|');
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
