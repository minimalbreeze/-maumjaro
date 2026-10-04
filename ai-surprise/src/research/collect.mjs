// 소재 수집 (기획서 2번).
//
// 웹검색으로 "이상한 실화" 후보를 모은다. 이 단계에서 점수는 매기지 않는다 —
// 수집과 평가를 섞으면 AI가 재미있어 보이는 쪽에 점수를 몰아주면서
// 사실 확인을 건너뛴다. 모으는 사람과 심사하는 사람을 분리하는 셈이다.
//
// 이 파일에서 가장 중요한 요구는 "출처를 실제 URL로 받는 것"이다.
// 출처 없이 요약만 돌려주면 다음 단계에서 검증할 방법이 없다.

import { callWithSearch, searchSummary, textOf, MODELS, WEB_SEARCH_MAX_USES } from '../ai/client.mjs';
import { CATEGORIES } from '../model.mjs';

export const COLLECT_SYSTEM = `당신은 다큐멘터리 제작팀의 자료 조사원이다.
"실제로 있었던 이상한 이야기"를 찾아 제작진에게 넘기는 일을 한다.

지켜야 할 원칙:

1. 1차 기록이 있는 사건만 가져온다.
   당대 신문 기사, 판결문, 공문서, 경찰 기록, 학술 논문, 공공 기록관 자료가
   1차 기록이다. 커뮤니티 게시글, 요약 블로그, 유튜브 영상 설명, 위키 문서만
   있는 이야기는 1차 기록이 없는 것으로 취급한다.

2. 인터넷에 널리 퍼진 "유명한 괴담"을 경계한다.
   많이 퍼졌다는 것은 사실이라는 뜻이 아니다. 출처를 따라가면 원전이
   없는 이야기가 매우 많다. 원전을 찾지 못했으면 찾지 못했다고 적는다.

3. 출처를 반드시 URL로 적는다.
   기억에 의존해 쓰지 않는다. 검색해서 실제로 본 페이지만 적는다.
   같은 내용을 베낀 페이지 여러 개는 출처 1개로 센다.

4. 다음은 가져오지 않는다.
   - 생존 인물에게 범죄나 의혹을 씌우는 이야기
   - 범죄자를 멋있게 그리는 이야기
   - 음모론 (신뢰할 수 있는 기록과 어긋나는 주장)
   - 최근 사건으로 피해자·유족이 생존해 있어 다루면 상처가 될 이야기

5. 모르는 것을 지어내지 않는다.
   연도, 지명, 인명, 숫자를 추측해서 채우지 않는다. 확실하지 않으면
   비워두고 확실하지 않다고 적는다.`;

/**
 * 수집 결과를 받을 도구 스키마.
 *
 * strict 도구로 받으므로 이 형태가 보장된다.
 * 점수 항목이 여기 없는 것은 의도적이다 — 평가는 다음 단계의 일이다.
 */
export const COLLECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      description: '찾은 소재 목록',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'category', 'sources', 'primary_record_found', 'what_is_strange', 'unknowns'],
        properties: {
          title: {
            type: 'string',
            description: '사건을 가리키는 짧은 이름. 영상 제목이 아니라 자료 제목이다.',
          },
          summary: {
            type: 'string',
            description: '사건 요약 2~4문장. 확인된 사실만 쓴다.',
          },
          category: {
            type: 'string',
            enum: CATEGORIES,
          },
          sources: {
            type: 'array',
            description:
              '실제로 열어본 출처. 같은 내용을 베낀 페이지는 하나로 센다. 1차 기록을 앞에 둔다.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['url', 'name', 'kind'],
              properties: {
                url: { type: 'string' },
                name: { type: 'string', description: '매체나 기관 이름' },
                kind: {
                  type: 'string',
                  enum: ['PRIMARY', 'SECONDARY'],
                  description:
                    'PRIMARY = 당대 신문·판결문·공문서·학술자료, SECONDARY = 그것을 전한 글',
                },
              },
            },
          },
          primary_record_found: {
            type: 'boolean',
            description: 'sources 중 PRIMARY가 하나라도 있는가. 없으면 false.',
          },
          what_is_strange: {
            type: 'string',
            description: '이 사건에서 설명되지 않는 지점 한 문장. 영상의 핵심이 된다.',
          },
          unknowns: {
            type: 'array',
            description: '현재 확인되지 않은 것들. 대본에서 UNKNOWN으로 표시될 내용이다.',
            items: { type: 'string' },
          },
        },
      },
    },
    search_notes: {
      type: 'string',
      description: '검색하면서 걸러낸 것, 원전을 못 찾아 버린 이야기 등 메모',
    },
  },
};

/**
 * 수집 프롬프트를 만든다. 순수 함수 — 테스트로 검증한다.
 *
 * maxSearches를 프롬프트에 적는 이유: 첫 실제 실행에서 모델이 자기 검색 한도를
 * 모른 채 후보를 넓게 벌려놓고 검증에 들어갔다가 한도에 걸렸다. 그래서
 * 6건 중 1건만 제출됐다. 예산을 알려주면 몇 건에 집중할지 스스로 정한다.
 */
export function buildCollectPrompt({
  count = 5,
  category = null,
  avoidTitles = [],
  maxSearches = WEB_SEARCH_MAX_USES,
} = {}) {
  const lines = [];

  lines.push(`"실제로 있었던 이상한 이야기" 소재를 ${count}건 찾아 주세요.`);
  lines.push('');

  if (category) {
    lines.push(`분야: ${category}`);
  } else {
    lines.push('분야는 아래 중 어느 것이든 좋습니다. 가능하면 서로 다른 분야로 섞어 주세요.');
    lines.push(CATEGORIES.map((c) => `- ${c}`).join('\n'));
  }
  lines.push('');

  lines.push('찾는 기준:');
  lines.push('- 한 문장으로 말했을 때 "그게 무슨 소리야?" 하는 반응이 나오는 사건');
  lines.push('- 당시 기록으로 확인되지만 지금도 설명이 안 되는 지점이 있는 사건');
  lines.push('- 3~5분 영상 하나로 이야기가 완결되는 규모');
  lines.push('');

  if (avoidTitles.length) {
    lines.push('이미 다룬 소재입니다. 제외해 주세요:');
    lines.push(avoidTitles.map((t) => `- ${t}`).join('\n'));
    lines.push('');
  }

  lines.push('작업 방법:');
  lines.push('1. 먼저 웹검색으로 후보를 찾습니다.');
  lines.push('2. 후보마다 1차 기록을 찾아봅니다. 당대 신문, 공문서, 판결문, 학술자료.');
  lines.push('3. 1차 기록을 못 찾은 후보는 버립니다. 버린 이유는 search_notes에 적습니다.');
  lines.push(`4. 남은 것을 submit_materials 도구로 제출합니다.`);
  lines.push('');

  lines.push(`━━━ 검색 예산: ${maxSearches}회 ━━━`);
  lines.push(`웹검색은 이번 작업에서 총 ${maxSearches}회만 쓸 수 있습니다. 넘기면 더 못 씁니다.`);
  lines.push('소재 하나를 1차 기록까지 확인하는 데 보통 4~6회가 듭니다.');
  lines.push('');
  lines.push('그래서 이렇게 쓰세요:');
  lines.push('- 후보를 넓게 벌려놓고 전부 검증하려 하지 마세요. 예산이 중간에 바닥납니다.');
  lines.push(`- 처음 1~2회로 후보를 모으고, 그중 ${Math.max(1, Math.min(count, Math.floor((maxSearches - 2) / 5)))}건 정도에 집중해 끝까지 확인하세요.`);
  lines.push('- 확인을 끝낸 소재가 생기면 바로 제출할 수 있게 준비해 두세요.');
  lines.push('');
  lines.push(
    `${count}건을 억지로 채우지 마세요. 기준을 통과한 것이 2건이면 2건만 제출하는 게 맞습니다. ` +
      `제대로 확인한 1건이 확인 안 된 5건보다 낫습니다.`
  );

  return lines.join('\n');
}

/**
 * 실제 수집 실행.
 *
 * 웹검색이 필요하므로 callWithSearch를 쓴다. 검색 도중 pause_turn이 와도
 * 클라이언트가 알아서 이어받는다.
 *
 * 도구 호출로 결과를 받으므로, 검색과 도구를 한 호출에 함께 붙인다.
 */
export async function collect({ count = 5, category = null, avoidTitles = [], onProgress } = {}) {
  const tool = {
    name: 'submit_materials',
    description: '조사한 소재 목록을 제출한다',
    strict: true,
    input_schema: COLLECT_SCHEMA,
  };

  onProgress?.(`웹검색으로 소재 ${count}건 찾는 중... (검색이 여러 번 돌아 몇 분 걸립니다)`);

  const response = await callWithSearch({
    system: COLLECT_SYSTEM,
    prompt: buildCollectPrompt({ count, category, avoidTitles }),
    tools: [tool],
    model: MODELS.collect,
    maxTokens: 24000,
  });

  const block = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_materials');
  if (!block) {
    // 도구를 안 부르고 글로 답한 경우. 왜 그랬는지 사람이 볼 수 있게 담아 던진다.
    const said = textOf(response).slice(0, 500);
    throw new Error(
      `소재를 제출하지 않았습니다 (stop_reason=${response.stop_reason}).` +
        (said ? `\n모델이 한 말: ${said}` : '')
    );
  }

  return {
    items: block.input.items || [],
    searchNotes: block.input.search_notes || '',
    sourcesSeen: searchSummary(response),
  };
}
