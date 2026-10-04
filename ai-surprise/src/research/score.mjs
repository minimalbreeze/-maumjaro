// 소재 평가와 위험도 판정 (기획서 3번).
//
// 수집과 분리한 이유: 같은 호출에서 모으고 점수까지 매기면, AI가 자기가
// 찾아온 소재를 변호하는 쪽으로 기운다. 여기서는 소재를 "심사하는" 역할만 준다.
//
// 그리고 최종 관문 판정은 AI가 하지 않는다. AI는 각 항목 점수와 위험 플래그만
// 내놓고, 자동 제작 가능 여부는 model.mjs의 evaluateGate가 코드로 정한다.

import { callForJson, MODELS } from '../ai/client.mjs';
import { FACT_STATUS, RISK_FLAGS, SCORE_WEIGHTS, makeItem } from '../model.mjs';

export const SCORE_SYSTEM = `당신은 다큐멘터리 제작팀의 심사위원이다.
조사원이 가져온 소재를 심사해 점수와 위험도를 매긴다.

당신의 역할은 소재를 통과시키는 것이 아니라 거르는 것이다.
재미있어 보인다는 이유로 사실성 점수를 올려주지 않는다.
두 가지는 완전히 별개의 항목이다.

위험 판정은 보수적으로 한다. 애매하면 위험하다고 적는다.
사람이 한 번 더 보는 비용은 작고, 가짜를 사실처럼 방송한 비용은 복구되지 않는다.`;

/** 배점 설명문. 프롬프트와 스키마가 같은 숫자를 쓰도록 한 곳에서 만든다. */
function weightTable() {
  return [
    `- interesting_score (0~${SCORE_WEIGHTS.interesting_score}): 신기함. 한 문장 듣고 "그게 무슨 소리야?" 하는 반응이 나오는가.`,
    `- twist_score (0~${SCORE_WEIGHTS.twist_score}): 반전 가능성. 이야기 중간에 전제가 뒤집히는 지점이 있는가.`,
    `- fact_score (0~${SCORE_WEIGHTS.fact_score}): 사실성. 1차 기록으로 확인되는 정도. 출처가 많아도 모두 2차면 낮다.`,
    `- visual_score (0~${SCORE_WEIGHTS.visual_score}): 영상화 가능성. AI 이미지와 짧은 영상으로 재현할 수 있는 장면이 있는가. 추상적인 이야기는 낮다.`,
    `- title_score (0~${SCORE_WEIGHTS.title_score}): 제목 클릭 가능성. 거짓말 없이 궁금증을 만드는 제목을 뽑을 수 있는가.`,
  ].join('\n');
}

export const SCORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'interesting_score',
    'twist_score',
    'fact_score',
    'visual_score',
    'title_score',
    'fact_status',
    'fact_notes',
    'risk_flags',
    'risk_score',
    'risk_notes',
  ],
  properties: {
    interesting_score: { type: 'integer', minimum: 0, maximum: SCORE_WEIGHTS.interesting_score },
    twist_score: { type: 'integer', minimum: 0, maximum: SCORE_WEIGHTS.twist_score },
    fact_score: { type: 'integer', minimum: 0, maximum: SCORE_WEIGHTS.fact_score },
    visual_score: { type: 'integer', minimum: 0, maximum: SCORE_WEIGHTS.visual_score },
    title_score: { type: 'integer', minimum: 0, maximum: SCORE_WEIGHTS.title_score },
    fact_status: {
      type: 'string',
      enum: Object.keys(FACT_STATUS),
      description:
        'CONFIRMED=1차 기록으로 확인, PARTIAL=핵심은 확인되나 세부가 엇갈림, DISPUTED=신뢰할 출처끼리 반박, UNVERIFIED=1차 기록 없음',
    },
    fact_notes: {
      type: 'string',
      description: '무엇이 확인되고 무엇이 확인되지 않았는지 2~3문장',
    },
    risk_flags: {
      type: 'array',
      description: '해당하는 위험 유형. 없으면 빈 배열.',
      items: { type: 'string', enum: Object.keys(RISK_FLAGS) },
    },
    risk_score: {
      type: 'integer',
      minimum: 0,
      maximum: 100,
      description: '종합 위험도. 0=안전, 100=절대 다루면 안 됨',
    },
    risk_notes: {
      type: 'string',
      description: '위험하다고 본 근거, 또는 안전하다고 본 근거',
    },
  },
};

/** 심사 프롬프트를 만든다. 순수 함수 — 테스트로 검증한다. */
export function buildScorePrompt(material) {
  const sources = (material?.sources || [])
    .map((s, i) => `  ${i + 1}. [${s.kind || '?'}] ${s.name || '(이름 없음)'} — ${s.url}`)
    .join('\n');

  return [
    '아래 소재를 심사해 주세요.',
    '',
    `제목: ${material?.title || '(없음)'}`,
    `분야: ${material?.category || '(없음)'}`,
    '',
    '요약:',
    material?.summary || '(없음)',
    '',
    `이상한 점: ${material?.what_is_strange || '(없음)'}`,
    '',
    '확인되지 않은 것:',
    (material?.unknowns || []).length
      ? material.unknowns.map((u) => `- ${u}`).join('\n')
      : '- (조사원이 적지 않음)',
    '',
    `출처 ${(material?.sources || []).length}개:`,
    sources || '  (없음)',
    `1차 기록 있음: ${material?.primary_record_found ? '예' : '아니오'}`,
    '',
    '배점:',
    weightTable(),
    '',
    '위험 유형:',
    Object.entries(RISK_FLAGS)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n'),
    '',
    '판정할 때 유의할 점:',
    '- 출처 목록에 PRIMARY가 없으면 fact_score는 낮아야 하고 fact_status는 UNVERIFIED나 PARTIAL이 맞습니다.',
    '- 같은 내용을 베낀 2차 출처가 여러 개인 것은 확인이 아닙니다.',
    '- 소재가 재미있는 것과 사실인 것은 별개입니다. 두 점수를 같이 움직이지 마세요.',
  ].join('\n');
}

/**
 * 소재 한 건을 심사해 저장용 레코드로 만든다.
 *
 * 반환값은 makeItem을 통과한 레코드다. 즉 gate 판정이 이미 들어 있다.
 */
export async function scoreOne(material, { model = MODELS.score } = {}) {
  const verdict = await callForJson({
    system: SCORE_SYSTEM,
    prompt: buildScorePrompt(material),
    toolName: 'submit_verdict',
    description: '소재 심사 결과를 제출한다',
    schema: SCORE_SCHEMA,
    model,
    maxTokens: 6000,
  });

  // 조사원이 모은 정보와 심사위원의 판정을 합쳐 레코드를 만든다.
  return makeItem({
    ...material,
    ...verdict,
    // 출처는 조사원 쪽 정보가 원본이다. 심사 단계에서 덮어쓰지 않는다.
    sources: material?.sources || [],
  });
}

/**
 * 여러 건을 차례로 심사한다.
 * 하나가 실패해도 나머지는 계속 진행한다 — 5건 중 1건 실패로 전부 날리지 않는다.
 */
export async function scoreAll(materials, { model = MODELS.score, onProgress } = {}) {
  const items = [];
  const failures = [];

  for (const [i, material] of materials.entries()) {
    onProgress?.(`심사 중 ${i + 1}/${materials.length}: ${material?.title || '(제목 없음)'}`);
    try {
      items.push(await scoreOne(material, { model }));
    } catch (err) {
      failures.push({ title: material?.title || '(제목 없음)', error: err?.message || String(err) });
    }
  }

  return { items, failures };
}
