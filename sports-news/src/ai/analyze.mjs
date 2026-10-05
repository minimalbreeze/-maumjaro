// 사실 확인 단계.
//
// 지시서 [5][6]의 핵심: 여러 출처를 비교해서
//   확정 사실 / 출처마다 다른 내용 / 미확인 / 전망
// 을 갈라놓는다. 이 단계의 출력에서 confirmed에 들어간 것만 본문에 쓸 수 있다.
//
// RSS는 제목과 한 줄 요약만 준다. 그것만으로는 일정·상금·중계를 알 수 없으므로
// 여기서 웹검색을 붙여 Claude가 직접 확인하게 한다.

import { callWithSearch, toolInputOf, searchSummary } from './client.mjs';
import { givenArticleNote } from '../news/given-article.mjs';

export const SYSTEM = `당신은 한국 스포츠 블로그의 팩트체커입니다.

역할은 글을 쓰는 것이 아니라, 어떤 정보가 확실하고 어떤 정보가 확실하지 않은지 가려내는 것입니다.

철칙:
- 확인되지 않은 정보를 확인된 것처럼 분류하지 않습니다.
- 검색으로 찾지 못한 정보는 unverified에 넣습니다. 추측으로 채우지 않습니다.
- 출처마다 내용이 다르면 conflicting에 넣습니다.
- 날짜가 중요합니다. 이미 지난 대회를 예정된 대회로 착각하지 않습니다.
- 오늘 날짜를 기준으로 "다가오는 일정"과 "이미 끝난 일"을 구분합니다.`;

export const REPORT_TOOL = {
  name: 'report_verification',
  description: '수집한 뉴스와 웹검색 결과를 종합해 사실 확인 결과를 보고합니다.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      topicSummary: { type: 'string', description: '이 사건이 무엇인지 2~3문장 요약' },
      eventStatus: {
        type: 'string',
        enum: ['upcoming', 'ongoing', 'finished', 'unclear'],
        description: '대회/사건이 앞으로 열리는지, 진행 중인지, 이미 끝났는지',
      },
      confirmed: {
        type: 'array',
        description: '2개 이상의 출처에서 일치하게 확인된 사실만',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: '예: 대회명, 일정, 장소, 상금, 중계, 디펜딩챔피언, 현재순위' },
            value: { type: 'string' },
            sources: { type: 'array', items: { type: 'string' }, description: '확인된 매체명 또는 사이트' },
          },
          required: ['field', 'value', 'sources'],
          additionalProperties: false,
        },
      },
      conflicting: {
        type: 'array',
        description: '출처마다 다르게 나오는 내용',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            versions: { type: 'array', items: { type: 'string' } },
          },
          required: ['field', 'versions'],
          additionalProperties: false,
        },
      },
      unverified: {
        type: 'array',
        description: '확인하지 못한 항목. 본문에 쓰면 안 되는 것들',
        items: { type: 'string' },
      },
      outlook: {
        type: 'array',
        description: '전망·추측. 사실이 아니라 전망임을 밝혀야 쓸 수 있는 내용',
        items: { type: 'string' },
      },
      addedValue: {
        type: 'array',
        description: '단순 기사 요약을 넘어 독자에게 줄 수 있는 부가가치 (일정 정리, 최근 성적, 대진 분석, 관전 포인트, 코스 분석, 시즌 흐름, 기록 등)',
        items: { type: 'string' },
      },
      isDuplicateOfExisting: {
        type: 'boolean',
        description: '제시된 기존 블로그 글과 사실상 같은 내용이면 true',
      },
      duplicateReason: { type: 'string', description: 'isDuplicateOfExisting 판단 근거. 아니면 빈 문자열' },
      worthWriting: {
        type: 'boolean',
        description: '확인된 사실이 충분해서 글을 쓸 가치가 있으면 true. 확인된 게 거의 없으면 false',
      },
      worthWritingReason: { type: 'string' },
    },
    required: [
      'topicSummary', 'eventStatus', 'confirmed', 'conflicting', 'unverified',
      'outlook', 'addedValue', 'isDuplicateOfExisting', 'duplicateReason',
      'worthWriting', 'worthWritingReason',
    ],
    additionalProperties: false,
  },
};

export async function verifyCluster(cluster, { relatedPosts = [], today }) {
  const articleLines = cluster.articles
    .map((a, i) => `${i + 1}. [${a.source || '출처미상'}] ${a.title}${a.publishedAt ? ` (${a.publishedAt.slice(0, 16).replace('T', ' ')} UTC)` : ' (발행일 미상)'}${a.summary ? `\n   요약: ${a.summary}` : ''}`)
    .join('\n');

  const existingLines = relatedPosts.length
    ? relatedPosts.map((p) => `- "${p.title}" (${p.date?.slice(0, 10)}, 유사도 ${Math.round((p.similarity || 0) * 100)}%)`).join('\n')
    : '(비슷한 기존 글 없음)';

  // 운영자가 직접 준 기사면 그 사실을 알린다. 1차 출처로 다루고, 웹검색이
  // 막혀도 거기 적힌 숫자로 글을 쓰게 한다.
  const 제공안내 = cluster.운영자제공 ? `\n\n${givenArticleNote()}` : '';

  const prompt = `오늘 날짜: ${today} (한국시간)
종목: ${cluster.topic}

## 수집된 기사 제목 (${cluster.articles.length}건 / 출처 ${cluster.sourceCount}곳)
${articleLines}${제공안내}

## 내 블로그의 기존 글 중 비슷한 것
${existingLines}

## 할 일
1. 위 기사들이 다루는 사건이 무엇인지 파악하세요.

2. **먼저 위 기사에 이미 적혀 있는 사실을 confirmed 에 넣으세요.**
   기사는 언론사가 쓴 1차 출처입니다. 제목과 요약에 적힌 날짜·장소·이름·숫자는
   웹검색을 하지 않아도 확인된 사실입니다. sources 에 그 매체 이름을 적으세요.
   이 단계를 건너뛰지 마세요.

3. 그 다음 웹검색으로 보강하세요. 찾지 못하면 unverified에 넣으세요.
   - 대회 정식 명칭, 일정(시작·종료일), 장소, 상금 규모, 주관 단체
   - 출전 선수, 디펜딩 챔피언, 현재 순위·랭킹, 최근 경기 결과
   - 부상·출전 여부, 대진표, 중계 정보

   **웹검색이 오류로 막히면(한도 초과 등) 거기서 멈추고 2번에서 얻은 것으로
   보고하세요.** 검색이 안 된다고 글을 포기하지 마세요 — 기사에 적힌 사실만으로도
   쓸 수 있는 글이 많습니다. worthWriting 을 false 로 두기 전에, 기사만으로 쓸 수
   있는지 다시 보세요.

   다만 기사에도 없고 검색으로도 못 찾은 숫자·날짜·이름을 기억으로 채우지는
   마세요. 그건 unverified 입니다.

4. 이 사건이 앞으로 열리는 일인지, 이미 끝난 일인지 오늘 날짜 기준으로 판단하세요.
5. 기존 블로그 글과 사실상 같은 내용인지 판단하세요. 같은 대회라도 새로운 진전이
   있으면 중복이 아닙니다. 단순 반복이면 중복입니다.
6. 확인이 끝나면 report_verification 도구를 호출해 결과를 보고하세요.

report_verification 도구를 반드시 호출해야 합니다.`;

  const response = await callWithSearch({
    system: SYSTEM,
    prompt,
    tools: [REPORT_TOOL],
    maxTokens: 16000,
  });

  const result = toolInputOf(response, 'report_verification');
  if (!result) {
    const err = new Error('사실 확인 결과를 받지 못했습니다');
    err.code = 'VERIFY_NO_RESULT';
    throw err;
  }

  return { ...result, searched: searchSummary(response) };
}

/** 본문에 쓸 수 있는 재료가 최소한 있는지 코드 차원에서 한 번 더 막는다. */
export function hasEnoughFacts(verification, { minConfirmed = 3 } = {}) {
  return (verification.confirmed?.length || 0) >= minConfirmed;
}
