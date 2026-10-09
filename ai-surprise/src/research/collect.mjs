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
  topic = null,
  legend = false,
  avoidTitles = [],
  maxSearches = WEB_SEARCH_MAX_USES,
} = {}) {
  // 소재를 사람이 지정한 경우는 아예 다른 작업이다. 후보를 찾는 게 아니라
  // 정해진 하나를 끝까지 파는 것이다.
  if (topic && String(topic).trim()) {
    return legend
      ? buildLegendPrompt(String(topic).trim(), maxSearches)
      : buildTopicPrompt(String(topic).trim(), maxSearches);
  }

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
/**
 * 사람이 고른 소재 하나를 조사하는 프롬프트.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 사람이 고르는 쪽을 따로 두는가
 * ─────────────────────────────────────────────────────────────
 *
 * 처음에는 AI가 후보를 찾아 점수를 매기고 1등으로 대본을 썼다. 그렇게 나온
 * 1편이 "하늘에서 고기가 떨어졌다"였는데, 기록은 확실했지만 재미가 없었다.
 *
 * 이유가 있다. **검증 가능성과 재미는 자주 반대로 간다.** 기록이 깔끔하게
 * 남은 사건은 대개 그냥 일어났고 설명도 끝난 사건이다. 전제가 뒤집히는
 * 순간이 없다. 반대로 사람을 붙잡는 이야기는 "A인 줄 알았는데 B였다"거나
 * "아직도 설명이 안 된다"로 끝나는데, 그런 건 점수로 집어내기 어렵다.
 *
 * 사람의 감이 AI 점수보다 낫다. 그래서 소재는 사람이 고르고, AI는 고른
 * 소재를 **검증**한다. 역할이 바뀐 게 아니라 제자리를 찾은 것이다.
 *
 * 중요한 것: 사람이 골랐다고 검증을 건너뛰지 않는다. 지정한 소재가 알고 보니
 * 원전 없는 괴담이면 그대로 돌려보내야 한다. 그래서 아래 프롬프트의 마지막
 * 문단이 "억지로 통과시키지 말라"다.
 */
function buildTopicPrompt(topic, maxSearches) {
  const lines = [];

  lines.push(`제작진이 고른 소재입니다. 이 하나만 조사해 주세요.`);
  lines.push('');
  lines.push(`━━━ 소재 ━━━`);
  lines.push(topic);
  lines.push('');

  lines.push('다른 후보를 찾지 마세요. 검색 예산을 전부 이 소재에 쓰세요.');
  lines.push('');

  lines.push('조사할 것:');
  lines.push('1. 이 사건이 실제로 있었는지. 당대 신문, 공문서, 판결문, 경찰 기록, 학술 자료.');
  lines.push('2. 널리 퍼진 이야기 중 **어디까지가 기록이고 어디부터가 덧붙은 것인지.**');
  lines.push('   유명한 사건일수록 원전에 없는 세부가 섞여 있습니다. 그 경계를 분명히 적어 주세요.');
  lines.push('3. 지금도 설명되지 않은 지점이 무엇인지 (unknowns).');
  lines.push('4. 전제가 뒤집히는 지점이 있는지 — "A인 줄 알았는데 사실 B였다".');
  lines.push('   있으면 what_is_strange에 그 지점을 분명히 적어 주세요. 영상의 중심이 됩니다.');
  lines.push('');

  lines.push(`━━━ 검색 예산: ${maxSearches}회 ━━━`);
  lines.push('소재가 하나뿐이니 넉넉합니다. 1차 기록까지 끝까지 따라가 주세요.');
  lines.push('같은 내용을 베낀 페이지는 출처 1개로 셉니다. 서로 다른 출처를 찾으세요.');
  lines.push('');

  lines.push('이 소재가 기준에 못 미치면 **빈 목록을 제출하세요.**');
  lines.push('제작진이 골랐다는 이유로 억지로 통과시키지 마세요. 못 미치는 경우는 이렇습니다:');
  lines.push('- 1차 기록을 찾을 수 없다 (널리 퍼졌지만 원전이 없는 이야기)');
  lines.push('- 서로 다른 출처가 1개뿐이다');
  lines.push('- 생존 인물이나 유족에게 해가 된다');
  lines.push('- 음모론이다 (신뢰할 수 있는 기록과 어긋나는 주장)');
  lines.push('');
  lines.push('왜 못 미치는지 search_notes에 적어 주세요. 제작진이 읽고 다른 소재를 고릅니다.');
  lines.push('빈 목록을 내는 것은 실패가 아닙니다. 근거 없는 이야기를 방송하는 것이 실패입니다.');

  return lines.join('\n');
}

/**
 * 전설·괴담 추적 프롬프트 (KIND.LEGEND).
 *
 * 검증 대상이 바뀐다. **사건이 일어났는가**가 아니라 **이야기가 어디서 나와
 * 어떻게 퍼졌는가**를 확인한다. 전자는 확인할 수 없고(그래서 전설이고),
 * 후자는 확인할 수 있다.
 *
 * 이 모드는 "확인이 안 되니까 그냥 넘어가자"가 아니다. 오히려 반대로,
 * 확인되지 않았다는 사실 자체를 **영상의 중심**으로 끌어올린다.
 */
function buildLegendPrompt(topic, maxSearches) {
  const lines = [];

  lines.push('제작진이 고른 소재입니다. **전설·괴담 추적 편**으로 조사해 주세요.');
  lines.push('');
  lines.push('━━━ 소재 ━━━');
  lines.push(topic);
  lines.push('');

  lines.push('이 소재는 사건의 1차 기록이 없을 가능성이 높습니다. 그래도 됩니다.');
  lines.push('이 편에서 확인할 것은 **사건이 일어났는가**가 아니라');
  lines.push('**이 이야기가 어디서 나와 어떻게 퍼졌는가** 입니다.');
  lines.push('');

  lines.push('조사할 것:');
  lines.push('1. **가장 이른 출처.** 이 이야기가 처음 등장한 곳이 어디인가.');
  lines.push('   TV 프로그램, 신문 기사, 포럼 게시글, 책 — 날짜와 함께.');
  lines.push('   여기가 이 편의 핵심입니다. 끝까지 따라가 주세요.');
  lines.push('2. **어떻게 퍼졌나.** 언제부터 널리 돌았는지, 어디를 거쳤는지.');
  lines.push('3. **버전 차이.** 전하는 사람마다 달라지는 세부가 있는지.');
  lines.push('   날짜·나이·지명이 버전마다 다르면 그건 중요한 단서입니다.');
  lines.push('4. **진짜 기록이 있는 부분.** 전부 거짓인 경우는 드뭅니다.');
  lines.push('   실존하는 장소·실제 사건이 섞여 있다면 어디까지가 그것인지.');
  lines.push('5. **누가 반박했나.** 팩트체크·검증 글이 있으면 출처와 함께.');
  lines.push('');

  lines.push('제출할 때:');
  lines.push('- primary_record_found 는 **사건**에 대한 1차 기록 기준으로 적습니다.');
  lines.push('  없으면 없다고 하십시오. 그게 이 편의 전제입니다.');
  lines.push('- what_is_strange 에는 "왜 이렇게 많은 사람이 믿었는가"를 적습니다.');
  lines.push('- unknowns 에는 추적하다 막힌 지점을 적습니다.');
  lines.push('- sources 에는 **이야기의 출처와 확산에 대한** 자료를 적습니다.');
  lines.push('  사건의 증거가 아니라 이야기의 내력에 대한 자료입니다.');
  lines.push('');

  lines.push(`━━━ 검색 예산: ${maxSearches}회 ━━━`);
  lines.push('출처 추적에 전부 쓰세요. 가장 이른 등장을 찾는 게 제일 중요합니다.');
  lines.push('같은 내용을 베낀 페이지가 수십 개 나올 겁니다 — 그건 출처 1개로 셉니다.');
  lines.push('');

  lines.push('━━━ 출처를 못 찾아도 제출하세요 ━━━');
  lines.push('');
  lines.push('이건 "전해지는 이야기"를 다루는 편입니다. 원전을 끝내 못 찾는 경우가');
  lines.push('오히려 흔하고, **그 자체가 이 편의 결론**입니다.');
  lines.push('');
  lines.push('  "가장 설득력 있다던 이야기인데, 따라가 보니 아무도 원전을 대지 못한다"');
  lines.push('');
  lines.push('그러니 출처를 못 밝혔다고 빈손으로 오지 마십시오. 대신 **어디까지');
  lines.push('찾아봤고 무엇이 없었는지**를 unknowns 와 fact_notes 에 정확히 적으세요.');
  lines.push('서로 베낀 요약 페이지뿐이었다면 그렇다고 적으십시오. 그게 정보입니다.');
  lines.push('');
  lines.push('절대 하지 말 것: 없는 출처를 지어내거나 "아마 ~일 것이다"로 채우기.');
  lines.push('');
  lines.push('다음 경우에만 **빈 목록을 제출하세요:**');
  lines.push('- 생존 인물이나 유족에게 해가 된다');
  lines.push('- 실존 인물을 범인·조작범으로 지목해야만 성립하는 이야기다');
  lines.push('  (단순히 이야기 안에 사람 이름이 나오는 것은 괜찮습니다.');
  lines.push('   우리가 누군가를 지목하게 되는 경우만 해당합니다)');

  return lines.join('\n');
}

export async function collect({ count = 5, category = null, topic = null, legend = false, avoidTitles = [], onProgress } = {}) {
  const tool = {
    name: 'submit_materials',
    description: '조사한 소재 목록을 제출한다',
    strict: true,
    input_schema: COLLECT_SCHEMA,
  };

  onProgress?.(
    topic
      ? `"${topic}" ${legend ? '의 출처를 추적하는 중' : '를 조사하는 중'}... (몇 분 걸립니다)`
      : `웹검색으로 소재 ${count}건 찾는 중... (검색이 여러 번 돌아 몇 분 걸립니다)`
  );

  const response = await callWithSearch({
    system: COLLECT_SYSTEM,
    prompt: buildCollectPrompt({ count, category, topic, legend, avoidTitles }),
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
