// 사용자가 직접 지정한 주제를 카테고리로 분류한다.
//
// 왜 필요한가: 매일 종목을 전부 훑는 대신 "이 주제로 한 편 써줘"로 쓰려면,
// 그 주제가 블로그의 어느 카테고리에 들어가는지부터 정해야 한다.
// 지시서 [11]: 기존 카테고리를 쓰고 새 카테고리를 계속 만들지 않는다.
//
// 가장 싼 모델로 한 번만 부른다. 이 단계에 좋은 모델을 쓸 이유가 없다.

import { callForJson, MODELS } from './client.mjs';

const SYSTEM = `당신은 한국 스포츠 블로그의 편집자입니다.
독자가 요청한 주제를 블로그에 이미 있는 카테고리 중 하나로 분류하고,
그 주제를 뉴스에서 찾을 검색어를 만듭니다.

원칙:
- 카테고리는 반드시 주어진 목록 안에서 고릅니다. 새로 만들지 않습니다.
- 어느 것도 맞지 않으면 "스포츠"를 고릅니다.
- 검색어는 실제 기사 제목에 나올 법한 말로 만듭니다. 문장이 아니라 낱말 묶음입니다.`;

const SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', description: '주어진 카테고리 목록 중 하나를 그대로' },
    reason: { type: 'string', description: '왜 그 카테고리인지 한 문장' },
    queries: {
      type: 'array',
      description: '뉴스 검색어 2~4개. 대회명·선수명 같은 고유명사를 그대로 쓴다.',
      items: { type: 'string' },
    },
    focusKeyword: { type: 'string', description: '이 주제의 대표 검색 키워드 하나' },
  },
  required: ['category', 'reason', 'queries', 'focusKeyword'],
  additionalProperties: false,
};

/**
 * @param {string} subject 사용자가 적어 준 주제 ("KBO 플레이오프 1차전" 같은 자유 문장)
 * @param {string[]} categories 블로그에 실제로 있는 카테고리 이름들
 */
export async function classifySubject(subject, categories) {
  const list = categories.length ? categories : ['스포츠'];

  const result = await callForJson({
    system: SYSTEM,
    prompt: `독자가 요청한 주제: "${subject}"

블로그에 있는 카테고리:
${list.map((c) => `- ${c}`).join('\n')}

이 주제를 분류하고 검색어를 만들어 주세요.`,
    toolName: 'classify_subject',
    description: '요청받은 주제를 카테고리로 분류하고 뉴스 검색어를 만듭니다.',
    schema: SCHEMA,
    maxTokens: 2000,
    effort: 'low',
    model: MODELS.seo,
  });

  // 모델이 목록 밖 카테고리를 말하면 그대로 믿지 않는다.
  const category = list.find((c) => c === result.category)
    || list.find((c) => c.replace(/\s/g, '') === String(result.category).replace(/\s/g, ''))
    || '스포츠';

  const queries = [...new Set([subject, ...(result.queries || [])].map((q) => String(q).trim()).filter(Boolean))].slice(0, 4);

  return { ...result, category, queries };
}

/** 분류 결과로 임시 종목을 만든다. 종목 설정 파일을 건드리지 않는다. */
export function subjectAsTopic(subject, classified) {
  return {
    name: subject,
    enabled: true,
    category: classified.category,
    queries: classified.queries,
    longTermHints: [],
    staticFeeds: [],
    adHoc: true,
  };
}
