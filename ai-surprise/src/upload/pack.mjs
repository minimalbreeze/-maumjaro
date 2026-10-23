// 올릴 때 필요한 것들 — 제목·썸네일 문구·설명문·태그.
//
// ─────────────────────────────────────────────────────────────
// 왜 코드가 끼어드는가
// ─────────────────────────────────────────────────────────────
//
// 제목과 썸네일은 **정책 위반이 영상 삭제로 이어지는 유일한 자리**다.
// 조회수가 아쉬워 과장하기도 가장 쉬운 자리이기도 하다.
//
// 그래서 AI 에게는 후보를 여러 개 내게 하고, **고르는 기준은 코드가 쥔다.**
// 낚시 표현은 코드가 거르고(checkTitle), AI 합성 고지와 배경음악 출처는
// 코드가 붙인다 — 사람이 기억하기로 하면 언젠가 빠뜨린다.

import { callForJson, MODELS } from '../ai/client.mjs';
import { checkTitle, SYNTHETIC_DISCLOSURE } from '../policy.mjs';
import { KIND } from '../model.mjs';
import { MAX_LINE_CHARS } from './thumbnail.mjs';

/**
 * 채널 이름.
 *
 * 실화와 창작은 **다른 채널**이다. 이름을 프롬프트에 박아 두면 창작 편
 * 설명문에 실화 채널 이름이 적혀 나간다 — 실제로 1화에서 그렇게 나왔다.
 */
export const CHANNEL_NAMES = {
  [KIND.EVENT]: 'AI 서프라이즈',
  [KIND.LEGEND]: 'AI 서프라이즈',
  [KIND.TALE]: '마지막 장',
  // 블로그·사이트와 같은 이름으로 묶는다(운영자 결정, 2026-10-23).
  // 서로 보내기 쉽고, 야구 말고 다른 종목으로 넓힐 때도 갇히지 않는다.
  [KIND.SPORTS]: 'minimalbreeze',
};

export function channelNameFor(kind) {
  return CHANNEL_NAMES[kind] || CHANNEL_NAMES[KIND.EVENT];
}

/** 유튜브가 검색 결과에서 잘라내기 시작하는 지점. */
export const TITLE_CHARS_MAX = 45;

export function uploadSystemFor(kind) {
  const channel = channelNameFor(kind);
  const extra =
    kind === KIND.TALE
      ? `

━━━ 이 채널은 창작 동화 채널이다 ━━━

11. 지어낸 이야기다. **실화인 것처럼 쓰지 않는다.**
    설명문 첫 줄 근처에 창작물임을 한 줄로 밝힌다.

12. 출처를 적지 않는다. 창작물이라 출처라는 것이 없다.
    "출처: 없음" 같은 말도 쓰지 않는다 — 안 쓰면 그만이다.

13. 태그에 다른 채널 이름을 쓰지 않는다. 이 채널 이름은 "${channel}" 이다.`
      : kind === KIND.SPORTS
      ? `

━━━ 이 채널은 스포츠 분석 채널이다 ━━━

11. **확정되지 않은 것을 제목에서 단정하지 않는다.**
    "○○ 이적 확정", "○○ 100억 계약" 처럼 쓰면 안 된다. 계약이 발표되지
    않았기 때문이다. 물음표를 쓰거나 "가능할까", "변수" 처럼 연다.

12. 선수 이름은 대본에 나온 사람만 쓴다. 대본에 없는 선수를 제목이나
    태그에 넣지 않는다 — 그 선수를 찾아온 사람이 영상에서 못 찾는다.

13. 금액은 **대본에 [FACT] 로 적힌 것만** 그대로 쓴다. 전망 금액을
    제목에 넣을 때는 반드시 물음표를 붙인다.

14. 태그에 다른 채널 이름을 쓰지 않는다. 이 채널 이름은 "${channel}" 이다.`
      : '';
  return UPLOAD_SYSTEM_BASE.replace('{{CHANNEL}}', channel) + extra;
}

const UPLOAD_SYSTEM_BASE = `당신은 "{{CHANNEL}}" 채널의 편집자다.
완성된 영상에 붙일 제목·썸네일 문구·설명문·태그를 만든다.

━━━ 제목 ━━━

1. **영상 안에 실제로 있는 것만 약속한다.** 이게 가장 중요하다.
   제목이 약속한 것이 영상에 없으면 유튜브는 영상을 **삭제**한다.
   수익이 줄어드는 게 아니라 사라진다.

2. 대문자 연속·느낌표 연발·"충격" "경악" "소름" 같은 말을 쓰지 않는다.
   사건 자체가 이상하므로 사실을 그대로 쓰면 된다.

3. ${TITLE_CHARS_MAX}자를 넘기지 않는다. 넘으면 검색 결과에서 잘린다.

4. 구체적인 것이 궁금증을 만든다.
   ❌ "충격적인 시간여행자의 진실"
   ✅ "1958년 신분증을 들고 2006년에 나타난 남자"

━━━ 썸네일 문구 ━━━

5. 두 줄, 각 줄 ${MAX_LINE_CHARS}자 이내. 넘으면 글자가 화면 밖으로 나간다.
   짧을수록 크게 들어가고, 클수록 작은 화면에서 읽힌다.

6. 제목을 그대로 옮기지 않는다. 제목과 썸네일이 같은 말을 하면 한 번
   말할 자리를 두 번 쓰는 것이다. 썸네일은 **한 장면이나 한 질문**만.

━━━ 설명문 ━━━

7. 첫 두 줄이 중요하다. 펼치기 전에 그만큼만 보인다.

8. 영상에서 다룬 것을 요약한다. 영상에 없는 것을 쓰지 않는다.

9. 출처가 있으면 적는다. 확인되지 않은 이야기라면 그 점을 적는다.

━━━ 태그 ━━━

10. 영상 내용과 실제로 관계있는 것만. 조회수를 노린 무관한 태그는
    유튜브가 스팸으로 본다.`;

export const UPLOAD_SCHEMA = {
  type: 'object',
  // strict 도구는 additionalProperties:false 가 없으면 400으로 거부한다.
  // 안쪽 객체까지 전부 붙여야 한다 — 하나만 빠져도 호출이 통째로 죽는다.
  additionalProperties: false,
  required: ['titles', 'thumbnails', 'description', 'tags'],
  properties: {
    titles: {
      type: 'array',
      description: `제목 후보 5개. 각 ${TITLE_CHARS_MAX}자 이내.`,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'why'],
        properties: {
          text: { type: 'string', description: '제목' },
          why: { type: 'string', description: '이 제목이 무엇을 약속하는지, 그게 영상 어디에 있는지' },
        },
      },
    },
    thumbnails: {
      type: 'array',
      description: '썸네일 문구 3안. 각각 두 줄.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line1', 'line2'],
        properties: {
          line1: { type: 'string', description: `윗줄. ${MAX_LINE_CHARS}자 이내` },
          line2: { type: 'string', description: `아랫줄. ${MAX_LINE_CHARS}자 이내` },
        },
      },
    },
    description: { type: 'string', description: '설명문. 줄바꿈 포함.' },
    tags: { type: 'array', description: '태그 10~15개', items: { type: 'string' } },
  },
};

/** 제목·썸네일 문구를 규격에 맞는 것만 남긴다. 거른 이유도 함께 돌려준다. */
export function filterCandidates({ titles = [], thumbnails = [] } = {}) {
  const keptTitles = [];
  const droppedTitles = [];
  for (const t of titles) {
    const text = String(t?.text || '').trim();
    if (!text) continue;
    const problems = checkTitle(text).map((p) => p.why || String(p));
    if (text.length > TITLE_CHARS_MAX) {
      problems.push(`${text.length}자입니다. ${TITLE_CHARS_MAX}자가 넘으면 검색 결과에서 잘립니다`);
    }
    if (problems.length) droppedTitles.push({ text, problems });
    else keptTitles.push({ text, why: String(t?.why || '').trim() });
  }

  const keptThumbs = [];
  const droppedThumbs = [];
  for (const t of thumbnails) {
    const line1 = String(t?.line1 || '').trim();
    const line2 = String(t?.line2 || '').trim();
    if (!line1) continue;
    const tooLong = [line1, line2].filter((l) => l.length > MAX_LINE_CHARS);
    if (tooLong.length) {
      droppedThumbs.push({ line1, line2, problems: tooLong.map((l) => `"${l}" 가 ${l.length}자입니다 (${MAX_LINE_CHARS}자 이내)`) });
    } else {
      keptThumbs.push({ line1, line2 });
    }
  }
  return { titles: keptTitles, droppedTitles, thumbnails: keptThumbs, droppedThumbs };
}

/**
 * 설명문에 코드가 반드시 붙이는 것들.
 *
 * AI 에게 "고지를 넣어 주세요"라고 부탁하지 않는다. 한 번이라도 빠지면
 * 계정 정지 대상이고, 부탁은 언젠가 안 지켜진다. 코드가 붙인다.
 */
export function finishDescription(body, { track = null, sources = [], kind = null } = {}) {
  const isTale = kind === KIND.TALE;
  const isSports = kind === KIND.SPORTS;
  const out = [String(body || '').trim()];

  out.push('', '━━━━━━━━━━━━━━━━');
  // 종류마다 고지문이 다르다. 창작 편에 실화용을 붙이면 "조사하고
  // 썼습니다"가 나가고, 스포츠 편에 실화용을 붙이면 전망까지 조사한
  // 사실인 것처럼 읽힌다. 고지문은 속이지 않으려고 붙이는 글이다.
  out.push(
    isTale ? SYNTHETIC_DISCLOSURE.taleText
      : isSports ? SYNTHETIC_DISCLOSURE.sportsText
      : SYNTHETIC_DISCLOSURE.text
  );

  // 창작물에는 출처가 없다. 빈 '참고한 자료' 제목만 남기지 않는다.
  if (!isTale && sources.length) {
    out.push('', '참고한 자료');
    for (const s of sources.slice(0, 8)) {
      const name = s?.name || s?.title || '';
      const url = s?.url || '';
      if (name || url) out.push(`· ${[name, url].filter(Boolean).join(' ')}`);
    }
  }

  // 배경음악 출처 표기. 필요한 곡인데 안 적으면 저작권 신고가 들어온다.
  const attribution = String(track?.attribution || '').trim();
  if (attribution) {
    out.push('', '음악');
    out.push(attribution);
  } else if (track?.title) {
    out.push('', `음악: ${track.title} (유튜브 오디오 보관함)`);
  }

  return out.join('\n');
}

// 설명문에 들어가는 "종류" 한 줄. 동화는 실화가 아니므로 '사건 편'이라고 쓰면 안 된다.
const KIND_LABELS = {
  [KIND.EVENT]: '사건 편',
  [KIND.LEGEND]: '전설·괴담 추적 편',
  [KIND.TALE]: '창작 동화 편',
  [KIND.SPORTS]: '스토브리그 분석 편',
};

export function buildUploadPrompt(item, { scriptMarkdown = '', minutes = 0 } = {}) {
  const lines = [];
  lines.push('완성된 영상에 붙일 제목·썸네일 문구·설명문·태그를 만들어 주세요.');
  lines.push('');
  lines.push('━━━ 이 영상 ━━━');
  lines.push(`제목(작업용): ${item?.title || '(없음)'}`);
  if (minutes) lines.push(`길이: 약 ${minutes}분`);
  if (item?.kind) lines.push(`종류: ${KIND_LABELS[item.kind] || KIND_LABELS[KIND.EVENT]}`);
  if (item?.what_is_strange) lines.push(`이상한 점: ${item.what_is_strange}`);
  lines.push('');
  if (scriptMarkdown) {
    lines.push('━━━ 대본 전문 ━━━');
    lines.push(scriptMarkdown);
    lines.push('');
  }
  lines.push('제목이 약속하는 것은 **이 대본 안에 실제로 있어야 합니다.**');
  lines.push('대본에 없는 것을 제목이나 썸네일에 쓰면 영상이 삭제됩니다.');
  if (item?.kind === 'LEGEND') {
    lines.push('');
    lines.push('이 편은 사건의 1차 기록이 없는 이야기를 추적한 편입니다.');
    lines.push('제목이 "실화"라고 단정하면 안 됩니다. 추적한다는 것이 드러나야 합니다.');
  }
  return lines.join('\n');
}

export async function makeUploadPack(item, { scriptMarkdown = '', minutes = 0, model = MODELS.script } = {}) {
  const raw = await callForJson({
    system: uploadSystemFor(item?.kind),
    prompt: buildUploadPrompt(item, { scriptMarkdown, minutes }),
    toolName: 'submit_upload_pack',
    description: '올릴 때 쓸 제목·썸네일 문구·설명문·태그를 제출한다',
    schema: UPLOAD_SCHEMA,
    model,
    maxTokens: 4000,
  });
  const filtered = filterCandidates(raw);
  return {
    ...filtered,
    descriptionBody: String(raw?.description || '').trim(),
    tags: (raw?.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 15),
  };
}
