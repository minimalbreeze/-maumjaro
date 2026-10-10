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
import { MAX_LINE_CHARS } from './thumbnail.mjs';

/** 유튜브가 검색 결과에서 잘라내기 시작하는 지점. */
export const TITLE_CHARS_MAX = 45;

export const UPLOAD_SYSTEM = `당신은 "AI 서프라이즈" 채널의 편집자다.
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
export function finishDescription(body, { track = null, sources = [] } = {}) {
  const out = [String(body || '').trim()];

  out.push('', '━━━━━━━━━━━━━━━━');
  out.push(SYNTHETIC_DISCLOSURE.text);

  if (sources.length) {
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

export function buildUploadPrompt(item, { scriptMarkdown = '', minutes = 0 } = {}) {
  const lines = [];
  lines.push('완성된 영상에 붙일 제목·썸네일 문구·설명문·태그를 만들어 주세요.');
  lines.push('');
  lines.push('━━━ 이 영상 ━━━');
  lines.push(`제목(작업용): ${item?.title || '(없음)'}`);
  if (minutes) lines.push(`길이: 약 ${minutes}분`);
  if (item?.kind) lines.push(`종류: ${item.kind === 'LEGEND' ? '전설·괴담 추적 편' : '사건 편'}`);
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
    system: UPLOAD_SYSTEM,
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
