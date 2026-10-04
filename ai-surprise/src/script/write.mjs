// 대본 생성 (기획서 5번·6번).
//
// 이 파일에는 두 가지 요구가 겹쳐 있다.
//
//  1) 기획서 5번·6번: 정해진 흐름과 FACT/RECONSTRUCTION/THEORY/UNKNOWN 구분
//  2) 유튜브 수익화 정책: "일반적이거나 독창성 없는 템플릿으로 만든 AI 콘텐츠로,
//     제작자의 원본 통찰이나 관점을 더하지 않고 대량 생산된 느낌을 주는 것"은
//     수익화 대상이 아니다 (2025년 7월 '비정품 콘텐츠' 정책, 2026년 7월 구체화).
//
// 2번 때문에 대본 구조에 "우리가 주목한 것" 섹션을 고정으로 넣는다.
// 나중에 붙이는 게 아니라 처음부터 구조에 있어야 한다 — 100편을 만든 뒤에
// 추가하면 앞의 100편이 전부 템플릿 양산물로 남는다.

import { callForText, MODELS } from '../ai/client.mjs';

/** 사실 구분 태그 (기획서 6번). 대본 모든 문단에 하나씩 붙는다. */
export const TAGS = ['FACT', 'RECONSTRUCTION', 'THEORY', 'UNKNOWN'];

/**
 * 대본 흐름 (기획서 5번) + 고유 해석 섹션.
 *
 * 'OUR_READING'이 기획서에 없는 항목이다. 위에 적은 정책 대응으로 넣었다.
 * 위치를 '반전' 다음에 둔 이유: 시청자가 사실을 다 알게 된 시점이어야
 * 해석이 설득력을 갖는다. 반전 앞에 두면 스포일러가 된다.
 */
export const SECTIONS = [
  { key: 'HOOK', label: '훅', note: '첫 10초. 인사말 없이 바로 사건 안으로.' },
  { key: 'CASE', label: '사건 소개', note: '언제 어디서 무슨 일이 있었나.' },
  { key: 'ODD', label: '이상한 점', note: '설명이 안 되는 지점.' },
  { key: 'CLUE', label: '새로운 단서', note: '나중에 밝혀진 것.' },
  { key: 'TWIST', label: '반전', note: '전제가 뒤집히는 지점.' },
  {
    key: 'OUR_READING',
    label: '우리가 주목한 것',
    note:
      '이 채널의 해석. 기록을 읽으면서 다른 곳에서 짚지 않은 지점을 말한다. ' +
      '사실 요약을 반복하지 않는다. 새로운 주장을 사실로 말하지도 않는다.',
  },
  { key: 'EXPLAIN', label: '가능한 설명', note: '제시된 가설들. 전부 THEORY다.' },
  { key: 'KNOWN', label: '현재까지 밝혀진 사실', note: '확정된 것만.' },
  { key: 'QUESTION', label: '마지막 질문', note: '여운. 답을 주지 않는다.' },
];

export const SCRIPT_SYSTEM = `당신은 "AI 서프라이즈" 채널의 작가다.
실제로 있었던 이상한 이야기를 3~5분 영상 대본으로 쓴다.

말투와 톤:
- 차분한 다큐멘터리 나레이션. 뉴스 아나운서보다 낮고 느리다.
- 모든 문장을 과장하지 않는다. 사건 자체가 충분히 이상하므로 감정을 덧붙일 필요가 없다.
- 시청자를 "여러분"이라고 부르지 않는다. 인사말을 쓰지 않는다.
- "놀랍게도", "충격적인", "소름 돋는" 같은 말로 감정을 지시하지 않는다.
  무엇이 놀라운지는 사실을 보여주고 시청자가 느끼게 한다.

절대 지켜야 할 것:

1. 모든 문단에 사실 구분 태그를 하나 붙인다.
   [FACT] 1차 기록으로 확인되는 내용
   [RECONSTRUCTION] 기록을 바탕으로 장면을 재현한 것 (추측이 섞인 묘사)
   [THEORY] 가설이나 가능성
   [UNKNOWN] 현재 확인되지 않은 부분

2. 확인되지 않은 것을 사실처럼 쓰지 않는다.
   조사 자료에 없는 연도, 지명, 인명, 숫자, 대사를 만들어내지 않는다.
   장면을 재현할 때도 [RECONSTRUCTION] 태그를 붙여 구분한다.

3. 가설을 결론처럼 쓰지 않는다.
   "~였던 것이다" 대신 "~라는 설명이 있다"로 쓴다.

4. 생존 인물을 범인으로 암시하지 않는다.

5. "우리가 주목한 것" 섹션에서도 새로운 사실을 만들지 않는다.
   기록에 이미 있는 것들 사이의 관계를 짚는 것이지, 없는 것을 더하는 게 아니다.`;

/** 대본 프롬프트를 만든다. 순수 함수 — 테스트로 검증한다. */
export function buildScriptPrompt(item, { targetMinutes = 4 } = {}) {
  // 한국어 다큐멘터리 나레이션 속도를 분당 약 330자로 본다.
  // 이 값은 추정치다. Phase 4에서 실제 TTS로 읽혀보고 보정해야 한다.
  const charsPerMinute = 330;
  const target = Math.round(targetMinutes * charsPerMinute);

  const lines = [];

  lines.push('아래 조사 자료로 영상 대본을 써 주세요.');
  lines.push('');
  lines.push('━━━ 조사 자료 ━━━');
  lines.push(`제목: ${item?.title || '(없음)'}`);
  lines.push(`분야: ${item?.category || '(없음)'}`);
  lines.push(`사실성 등급: ${item?.fact_status || '(없음)'}`);
  lines.push('');
  lines.push('요약:');
  lines.push(item?.summary || '(없음)');
  lines.push('');
  if (item?.what_is_strange) {
    lines.push(`이상한 점: ${item.what_is_strange}`);
    lines.push('');
  }
  if (item?.fact_notes) {
    lines.push('확인된 것과 확인되지 않은 것:');
    lines.push(item.fact_notes);
    lines.push('');
  }
  if ((item?.unknowns || []).length) {
    lines.push('확인되지 않은 항목 (반드시 [UNKNOWN]으로 다룰 것):');
    lines.push(item.unknowns.map((u) => `- ${u}`).join('\n'));
    lines.push('');
  }
  if ((item?.sources || []).length) {
    lines.push('출처:');
    lines.push(
      item.sources.map((s) => `- [${s.kind || '?'}] ${s.name || ''} ${s.url || ''}`).join('\n')
    );
    lines.push('');
  }
  if (item?.risk_notes) {
    lines.push(`심사 메모 (주의할 점): ${item.risk_notes}`);
    lines.push('');
  }

  lines.push('━━━ 대본 형식 ━━━');
  lines.push('');
  lines.push('마크다운으로 쓰고, 아래 순서를 그대로 따릅니다.');
  lines.push('각 섹션은 `## [키] 라벨` 형태의 제목으로 시작합니다.');
  lines.push('');
  for (const s of SECTIONS) {
    lines.push(`## [${s.key}] ${s.label}`);
    lines.push(`   → ${s.note}`);
  }
  lines.push('');
  lines.push('각 섹션 안의 문단은 모두 아래 형태로 씁니다.');
  lines.push('');
  lines.push('[FACT] 1987년 11월, 오스트리아 빈의 한 호텔에 남자가 투숙했다.');
  lines.push('[RECONSTRUCTION] 로비는 어두웠고, 야간 직원 한 명이 카운터를 지키고 있었다.');
  lines.push('[THEORY] 신분을 숨기려 했다는 설명이 있다. 다만 확인된 것은 아니다.');
  lines.push('[UNKNOWN] 그가 그날 누구를 만나려 했는지는 기록에 없다.');
  lines.push('');
  lines.push('네 태그를 모두 쓰십시오. 특히 가설은 반드시 [THEORY]로 표시합니다 —');
  lines.push('가설을 [FACT]로 쓰면 이 채널이 거짓을 방송한 것이 됩니다.');
  lines.push('');
  lines.push('━━━ 분량 ━━━');
  lines.push(`나레이션 전체 ${target}자 안팎 (약 ${targetMinutes}분). 태그와 섹션 제목은 글자 수에서 제외합니다.`);
  lines.push('');
  lines.push('━━━ 첫 10초 ━━━');
  lines.push('HOOK은 가장 중요합니다. 인사말·채널 소개·"오늘은" 같은 말을 쓰지 않고');
  lines.push('첫 문장부터 사건 안에 들어갑니다. 이런 식입니다:');
  lines.push('');
  lines.push('  "1987년, 한 남자가 호텔에 들어왔습니다.');
  lines.push('   다음날 직원이 CCTV를 확인하다 이상한 사실을 발견합니다."');
  lines.push('');
  lines.push('대본 외의 설명은 쓰지 마세요. 대본만 출력합니다.');

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// 대본 검증
//
// AI가 양식을 어기는 일은 드물지 않다. 어긴 대본을 그대로 다음 단계로
// 넘기면 장면 분할이 깨지고, 더 나쁘게는 태그 없는 추측이 사실로 섞인다.
// 그래서 받자마자 기계적으로 확인한다.
// ─────────────────────────────────────────────────────────────

const GREETING_PATTERNS = [
  /안녕하세요/,
  /여러분/,
  /^\s*오늘은/m,
  /구독\s*(과|и|,)?\s*좋아요/,
  /채널에\s*오신/,
];

/**
 * 대본을 검사한다.
 *
 * 반환: { ok, errors, warnings, stats }
 *  - errors 가 있으면 사람이 봐야 한다. 다음 단계로 그냥 넘기지 않는다.
 *  - warnings 는 알려만 준다.
 */
export function validateScript(markdown, { targetMinutes = 4 } = {}) {
  const errors = [];
  const warnings = [];
  const text = String(markdown || '');

  // 1) 섹션이 다 있는가, 순서가 맞는가
  const foundOrder = [];
  for (const s of SECTIONS) {
    const re = new RegExp(`^##\\s*\\[${s.key}\\]`, 'm');
    const idx = text.search(re);
    if (idx === -1) {
      errors.push(`섹션이 없습니다: [${s.key}] ${s.label}`);
    } else {
      foundOrder.push({ key: s.key, idx });
    }
  }
  const sorted = [...foundOrder].sort((a, b) => a.idx - b.idx);
  if (sorted.map((s) => s.key).join(',') !== foundOrder.map((s) => s.key).join(',')) {
    errors.push(`섹션 순서가 다릅니다. 나온 순서: ${sorted.map((s) => s.key).join(' → ')}`);
  }

  // 2) 태그 없는 본문 문단이 있는가 — 가장 위험한 실패다
  const bodyLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('→') && !l.startsWith('━'));
  const untagged = bodyLines.filter((l) => !TAGS.some((t) => l.startsWith(`[${t}]`)));
  if (untagged.length) {
    errors.push(
      `사실 구분 태그가 없는 문단이 ${untagged.length}개 있습니다. 첫 번째: "${untagged[0].slice(0, 60)}..."`
    );
  }

  // 3) 태그별 개수
  const tagCounts = {};
  for (const t of TAGS) {
    tagCounts[t] = (text.match(new RegExp(`\\[${t}\\]`, 'g')) || []).length;
  }
  if (tagCounts.FACT === 0) {
    errors.push('[FACT] 문단이 하나도 없습니다. 확인된 사실 없이 만든 대본은 쓸 수 없습니다.');
  }

  // 4) 인사말
  for (const re of GREETING_PATTERNS) {
    if (re.test(text)) {
      errors.push(`쓰지 않기로 한 표현이 있습니다: ${re.source}`);
    }
  }

  // 5) 분량 — 태그와 제목을 뺀 실제 나레이션 글자 수
  const narration = bodyLines
    .map((l) => l.replace(/^\[(FACT|RECONSTRUCTION|THEORY|UNKNOWN)\]\s*/, ''))
    .join(' ');
  const chars = narration.replace(/\s/g, '').length;
  const charsPerMinute = 330;
  const estMinutes = chars / charsPerMinute;
  if (estMinutes < 2.5) {
    warnings.push(`나레이션이 ${chars}자(약 ${estMinutes.toFixed(1)}분)로 짧습니다.`);
  }
  if (estMinutes > 6) {
    warnings.push(`나레이션이 ${chars}자(약 ${estMinutes.toFixed(1)}분)로 깁니다.`);
  }

  // 6) HOOK 첫 문장 길이 — 첫 10초가 핵심이므로 따로 본다
  const hookMatch = text.match(/^##\s*\[HOOK\][^\n]*\n([\s\S]*?)(?=\n##\s*\[|$)/m);
  const hookChars = hookMatch
    ? hookMatch[1]
        .split('\n')
        .map((l) => l.trim().replace(/^\[\w+\]\s*/, ''))
        .join(' ')
        .replace(/\s/g, '').length
    : 0;
  if (hookMatch && hookChars > 120) {
    warnings.push(`HOOK이 ${hookChars}자입니다. 첫 10초면 약 55자가 적당합니다.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      narrationChars: chars,
      estimatedMinutes: Number(estMinutes.toFixed(2)),
      targetMinutes,
      hookChars,
      tagCounts,
      sectionsFound: foundOrder.length,
      sectionsExpected: SECTIONS.length,
    },
  };
}

/**
 * 대본을 쓴다.
 *
 * 양식을 어기면 한 번 다시 시킨다. 어긴 부분을 알려주면 두 번째에
 * 대개 맞춰 온다. 두 번 다 실패하면 대본과 오류를 함께 돌려주고
 * 사람이 판단하게 한다 — 조용히 넘기지 않는다.
 */
export async function writeScript(item, { targetMinutes = 4, model = MODELS.script, onProgress } = {}) {
  const prompt = buildScriptPrompt(item, { targetMinutes });

  onProgress?.('대본 쓰는 중...');
  let markdown = await callForText({
    system: SCRIPT_SYSTEM,
    prompt,
    model,
    maxTokens: 16000,
  });
  let check = validateScript(markdown, { targetMinutes });

  if (!check.ok) {
    onProgress?.(`양식이 어긋났습니다 (${check.errors.length}건). 고쳐서 다시 씁니다.`);
    const retryPrompt = [
      prompt,
      '',
      '━━━ 이전 시도에서 아래 문제가 있었습니다. 고쳐서 다시 써 주세요 ━━━',
      ...check.errors.map((e) => `- ${e}`),
    ].join('\n');

    markdown = await callForText({
      system: SCRIPT_SYSTEM,
      prompt: retryPrompt,
      model,
      maxTokens: 16000,
    });
    check = validateScript(markdown, { targetMinutes });
  }

  return { markdown, check };
}
