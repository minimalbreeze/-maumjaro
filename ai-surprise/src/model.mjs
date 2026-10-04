// 소재 한 건의 데이터 모양과, 자동 제작 여부를 가르는 판정 규칙.
//
// 이 파일에 AI 호출이 없는 것은 의도적이다. 전부 순수 함수라서
// API 키 없이 테스트로 돌려볼 수 있다. 가짜 괴담을 걸러내는 방어선이
// 여기 있으므로, 이 규칙은 반드시 검증 가능한 상태로 둔다.

// ─────────────────────────────────────────────────────────────
// 분류 값
// ─────────────────────────────────────────────────────────────

/** 기획서 2번의 소재 유형 10가지. */
export const CATEGORIES = [
  '실제 미스터리',
  '역사적 미스터리',
  '이상한 실화',
  '기묘한 사건',
  '과학적 미스터리',
  '설명하기 어려운 사진',
  '사라진 사람/물건',
  '이상한 기록',
  '믿기 어려운 역사적 사건',
  '독특한 인간 이야기',
];

/**
 * 사실성 등급.
 *
 * 이 채널의 생존은 "지어낸 이야기를 사실처럼 방송하지 않는 것"에 달려 있다.
 * 인터넷에 도는 미스터리 상당수는 출처를 따라가면 나오는 게 없다.
 * 그래서 등급을 네 단계로 분명히 나눈다.
 */
export const FACT_STATUS = {
  /** 1차 기록(신문·판결문·공문서·학술자료)으로 확인됨 */
  CONFIRMED: 'CONFIRMED',
  /** 핵심 사건은 확인되지만 세부가 출처마다 다름 */
  PARTIAL: 'PARTIAL',
  /** 신뢰할 수 있는 출처가 서로 반박함 */
  DISPUTED: 'DISPUTED',
  /** 이야기만 돌고 1차 기록이 없음 — 이 채널에서 다루지 않는다 */
  UNVERIFIED: 'UNVERIFIED',
};

/** 기획서 17번의 제작 상태. 순서대로 진행된다. */
export const STATUS = [
  'IDEA',
  'SELECTED',
  'SCRIPTING',
  'SCRIPT_READY',
  'SCENES_READY',
  'ASSETS_GENERATING',
  'VOICE_READY',
  'EDITING',
  'REVIEW',
  'APPROVED',
  'PUBLISHED',
];

/**
 * 자동 진행 관문.
 *
 * 기획서 3번이 요구한 '검토 필요' 분류를 status와 섞지 않고 따로 둔다.
 * status는 "어디까지 만들었나"이고 gate는 "사람이 봐야 하나"라서 성질이 다르다.
 */
export const GATE = {
  /** 사람 승인만 받으면 바로 제작 가능 */
  AUTO_OK: 'AUTO_OK',
  /** 위험 요소가 있어 사람이 반드시 확인해야 함 */
  REVIEW_NEEDED: 'REVIEW_NEEDED',
  /** 다루면 안 되는 소재 */
  BLOCKED: 'BLOCKED',
};

/** 기획서 3번의 위험 유형 6가지. AI가 해당 여부를 판정한다. */
export const RISK_FLAGS = {
  FABRICATED: '확인되지 않은 가짜 사건',
  DEFAMATION: '명예훼손 가능성이 높은 사건',
  LIVING_PERSON_CLAIM: '생존 인물에 대한 근거 없는 의혹',
  CRIMINAL_GLORIFICATION: '범죄자를 미화하는 내용',
  CONSPIRACY_AS_FACT: '음모론을 사실처럼 표현하는 내용',
  SINGLE_SOURCE: '출처가 하나뿐인 의심스러운 이야기',
};

// ─────────────────────────────────────────────────────────────
// 배점
// ─────────────────────────────────────────────────────────────

/**
 * 기획서 3번의 100점 배점.
 *
 * 주의 — 기획서 2번의 저장 필드 이름과 3번의 배점 항목이 서로 맞지 않는다.
 *   2번 필드: interesting_score, mystery_score, visual_score, story_score
 *   3번 배점: 신기함 25 / 반전 가능성 25 / 사실성 20 / 영상화 가능성 15 / 제목 클릭 가능성 15
 * 2번에는 '사실성'과 '제목'에 해당하는 필드가 없고, 3번에는 story_score에
 * 해당하는 항목이 없다. 그래서 3번의 배점을 정답으로 보고 필드를 맞췄다.
 * story_score는 '제목 클릭 가능성'(title_score)으로 옮겼다 — 둘 중 배점표에
 * 실제로 들어 있는 쪽을 살렸다.
 */
export const SCORE_WEIGHTS = {
  interesting_score: 25, // 신기함
  twist_score: 25, // 반전 가능성
  fact_score: 20, // 사실성
  visual_score: 15, // 영상화 가능성
  title_score: 15, // 제목 클릭 가능성
};

export const SCORE_KEYS = Object.keys(SCORE_WEIGHTS);
export const MAX_SCORE = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0); // 100

/**
 * 항목 점수를 합쳐 최종 점수를 낸다.
 *
 * 각 항목은 0부터 배점 상한까지의 값으로 받는다. 상한을 넘겨 오면 깎는다 —
 * AI가 25점짜리 항목에 30점을 주는 일이 실제로 생기고, 그대로 두면
 * 100점 만점이 무너져서 소재끼리 비교가 안 된다.
 */
export function finalScore(scores) {
  let total = 0;
  for (const [key, max] of Object.entries(SCORE_WEIGHTS)) {
    const raw = Number(scores?.[key]);
    if (!Number.isFinite(raw)) continue;
    total += Math.max(0, Math.min(max, raw));
  }
  return Math.round(total);
}

/** 자동 추천 기준점. 이 점수 이상이면 카드에서 추천 표시를 한다. */
export const RECOMMEND_THRESHOLD = 70;

// ─────────────────────────────────────────────────────────────
// 자동 제작 관문 판정
// ─────────────────────────────────────────────────────────────

/**
 * 출처 최소 개수.
 *
 * 이 값을 AI 판단에 맡기지 않고 코드로 못박는 이유가 있다.
 * AI는 "흥미로운 이야기"를 앞에 두면 출처가 부족해도 통과시키려는 쪽으로
 * 기운다. 사람이 승인 화면에서 확인해야 할 유일한 숫자가 이것이라
 * 기계적으로 막는 편이 안전하다.
 */
export const MIN_SOURCE_COUNT = 2;

/**
 * 소재 하나를 보고 자동 제작 가능 여부를 정한다.
 *
 * 반환: { gate, reasons }
 *  - reasons 는 사람이 읽을 문장 배열이다. 카드에 그대로 띄운다.
 *
 * 규칙은 전부 "막는" 방향이다. 통과시키는 조건을 늘리지 않는다.
 */
export function evaluateGate(item) {
  const reasons = [];
  const flags = Array.isArray(item?.risk_flags) ? item.risk_flags : [];

  // 1) 다루면 안 되는 것 — 되돌릴 수 없는 피해가 생기는 쪽
  const blocking = [];
  if (flags.includes('FABRICATED')) blocking.push(RISK_FLAGS.FABRICATED);
  if (flags.includes('DEFAMATION')) blocking.push(RISK_FLAGS.DEFAMATION);
  if (flags.includes('LIVING_PERSON_CLAIM')) blocking.push(RISK_FLAGS.LIVING_PERSON_CLAIM);
  if (flags.includes('CRIMINAL_GLORIFICATION')) blocking.push(RISK_FLAGS.CRIMINAL_GLORIFICATION);

  // 1차 기록이 전혀 없는 이야기는 이 채널의 소재가 아니다.
  if (item?.fact_status === FACT_STATUS.UNVERIFIED) {
    blocking.push('1차 기록으로 확인되지 않는 이야기');
  }

  if (blocking.length) {
    return { gate: GATE.BLOCKED, reasons: blocking.map((r) => `다룰 수 없음: ${r}`) };
  }

  // 2) 사람이 반드시 봐야 하는 것
  const sourceCount = Number(item?.source_count);
  if (!Number.isFinite(sourceCount) || sourceCount < MIN_SOURCE_COUNT) {
    reasons.push(`출처가 ${Number.isFinite(sourceCount) ? sourceCount : 0}개입니다 — ${MIN_SOURCE_COUNT}개 이상 직접 확인해 주세요`);
  }
  if (flags.includes('SINGLE_SOURCE')) {
    reasons.push(`${RISK_FLAGS.SINGLE_SOURCE} — 다른 출처를 찾아봐 주세요`);
  }
  if (flags.includes('CONSPIRACY_AS_FACT')) {
    reasons.push(`${RISK_FLAGS.CONSPIRACY_AS_FACT} — 대본에서 THEORY로 분명히 구분해야 합니다`);
  }
  if (item?.fact_status === FACT_STATUS.DISPUTED) {
    reasons.push('신뢰할 수 있는 출처끼리 서로 반박합니다 — 양쪽을 다 보여줄지 판단해 주세요');
  }
  const risk = Number(item?.risk_score);
  if (Number.isFinite(risk) && risk >= 50) {
    reasons.push(`위험도 ${risk}점 — 내용을 직접 읽어봐 주세요`);
  }

  return {
    gate: reasons.length ? GATE.REVIEW_NEEDED : GATE.AUTO_OK,
    reasons,
  };
}

/** 추천 표시 여부. 관문을 통과했고 점수가 기준 이상일 때만. */
export function isRecommended(item) {
  return item?.gate === GATE.AUTO_OK && Number(item?.final_score) >= RECOMMEND_THRESHOLD;
}

// ─────────────────────────────────────────────────────────────
// 레코드 만들기
// ─────────────────────────────────────────────────────────────

/**
 * AI가 돌려준 날것의 소재 정보를 저장용 레코드로 정규화한다.
 *
 * AI 출력을 그대로 저장하지 않는다. 필드가 빠지거나 타입이 달라지면
 * 뒤 단계가 조용히 깨지기 때문이다.
 */
export function makeItem(raw, { dateFound } = {}) {
  const scores = {};
  for (const key of SCORE_KEYS) {
    const v = Number(raw?.[key]);
    scores[key] = Number.isFinite(v) ? Math.max(0, Math.min(SCORE_WEIGHTS[key], v)) : 0;
  }

  const sources = Array.isArray(raw?.sources) ? raw.sources.filter((s) => s?.url) : [];

  const item = {
    title: String(raw?.title || '').trim(),
    summary: String(raw?.summary || '').trim(),
    category: CATEGORIES.includes(raw?.category) ? raw.category : '기묘한 사건',
    date_found: dateFound || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),

    // 출처는 배열로 보관하고, 기획서 2번이 요구한 단일 필드도 함께 채운다.
    sources,
    source_url: sources[0]?.url || String(raw?.source_url || ''),
    source_name: sources[0]?.name || String(raw?.source_name || ''),
    source_count: sources.length || Number(raw?.source_count) || 0,

    fact_status: FACT_STATUS[raw?.fact_status] || FACT_STATUS.UNVERIFIED,
    fact_notes: String(raw?.fact_notes || '').trim(),

    ...scores,
    final_score: finalScore(scores),

    risk_flags: Array.isArray(raw?.risk_flags)
      ? raw.risk_flags.filter((f) => f in RISK_FLAGS)
      : [],
    risk_score: Number.isFinite(Number(raw?.risk_score))
      ? Math.max(0, Math.min(100, Number(raw.risk_score)))
      : 0,
    risk_notes: String(raw?.risk_notes || '').trim(),

    status: 'IDEA',
  };

  const { gate, reasons } = evaluateGate(item);
  item.gate = gate;
  item.gate_reasons = reasons;
  item.recommended = isRecommended(item);

  return item;
}
