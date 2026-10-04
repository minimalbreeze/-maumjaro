// Claude API 클라이언트.
//
// 이 파일의 역할은 "안전한 호출 한 번"을 제공하는 것이다.
//  - 서버 웹검색이 길어져 pause_turn으로 끊기면 자동으로 이어서 받는다
//  - 긴 출력은 스트리밍으로 받아 HTTP 타임아웃을 피한다
//  - JSON이 필요한 곳은 strict 도구로 받아 파싱 실패 위험을 없앤다
//  - 토큰 사용량을 모아 실행이 끝난 뒤 비용을 보여준다
//
// SDK는 top-level import 하지 않는다. 실제로 호출할 때 처음 불러온다.
// 그래야 npm install 전에도 프롬프트 조립·결과 검증 같은 순수 로직을
// 테스트로 돌려볼 수 있다. (test/offline.mjs 가 이것에 의존한다)

import { env, requireEnv } from '../utils/env.mjs';
import { withRetry } from '../utils/retry.mjs';

/**
 * 단계마다 다른 모델을 쓸 수 있게 열어 둔다.
 *
 * 기본값은 전부 Opus 5.5다. 기획서 22번이 "영상 품질보다 소재와 이야기가
 * 우선"이라고 못박았고, 그 소재와 이야기를 만드는 게 이 단계이기 때문이다.
 *
 * 비용을 줄이려면 .env에서 단계별로 내릴 수 있다. 예:
 *   CLAUDE_MODEL_COLLECT=claude-sonnet-5-5   (소재 수집 — 검색 결과 정리에 가까운 일)
 *   CLAUDE_MODEL_SCORE=claude-haiku-4-5      (점수 매기기 — 기계적인 판정)
 *   CLAUDE_MODEL_SCRIPT=claude-sonnet-5-5    (대본 — 여기만 내려도 체감 비용이 가장 많이 줄지만
 *                                             품질 차이가 가장 크게 나는 자리이기도 하다)
 *
 * 어느 쪽이 나은지는 실제로 돌려서 글을 비교해 보고 정하는 게 맞다.
 * 지금은 숫자를 지어내지 않고 기본값만 품질 쪽에 둔다.
 */
export const MODELS = {
  collect: env('CLAUDE_MODEL_COLLECT', 'claude-opus-5-5'),
  score: env('CLAUDE_MODEL_SCORE', 'claude-opus-5-5'),
  script: env('CLAUDE_MODEL_SCRIPT', 'claude-opus-5-5'),
};

/**
 * 모델마다 받는 파라미터가 다르다. 틀리면 400이 난다.
 *
 *  - Opus 5.5 / Sonnet 5.5: thinking을 끌 수 없다. {type:'disabled'} 도 400,
 *    budget_tokens 도 400이다. 양을 줄이려면 effort를 내리는 게 유일한 방법이다.
 *    그리고 Opus 5.5의 effort 기본값은 medium이라 명시하지 않으면 조용히 낮게 돈다.
 *  - Opus 5 / Sonnet 5: thinking {type:'adaptive'} + effort.
 *  - Haiku 4.5: adaptive를 모른다. budget_tokens 형태이고 effort를 주면 오류가 난다.
 */
export function tuningFor(model, { effort = 'high', maxTokens = 16000 } = {}) {
  if (/haiku/.test(model)) {
    // Haiku는 effort를 받지 않는다. 생각을 조금만 시킨다.
    return { thinking: { type: 'enabled', budget_tokens: Math.min(4000, Math.floor(maxTokens / 2)) } };
  }
  // 나머지 현행 모델은 모두 adaptive + effort 를 받는다.
  // effort는 반드시 명시한다 — 모델별 기본값이 달라서 빼면 결과가 달라진다.
  return { thinking: { type: 'adaptive' }, output_config: { effort } };
}

/**
 * 이 모델에서 "특정 도구를 강제로 부르기"가 되는가?
 *
 * Opus 5.5 / Sonnet 5.5 / Fable 계열은 tool_choice 에 'tool' 또는 'any' 를 주면
 * 400을 돌려준다:
 *   tool_choice: type "tool" and "any" are not supported for this model.
 *
 * sports-news 쪽 코드는 Sonnet 5 / Haiku 4.5 를 쓰고 있어서 강제 호출이 아직
 * 통한다. 하지만 거기 모델을 최신으로 올리는 순간 SEO 단계가 통째로 깨진다.
 * 이 프로젝트는 기본값이 Opus 5.5이므로 처음부터 갈라서 처리한다.
 *
 * 강제할 수 없는 모델에서는 tool_choice를 auto로 두고, 프롬프트에서 도구 이름을
 * 분명히 지목한다. strict: true 가 걸려 있으니 인자 형태는 어차피 보장된다.
 */
export function canForceTool(model) {
  return !/(opus-5-5|sonnet-5-5|fable|mythos)/.test(model);
}

let client = null;

async function ai() {
  if (!client) {
    requireEnv(['ANTHROPIC_API_KEY']);
    // 여기서 처음 SDK를 불러온다. 설치가 안 돼 있으면 안내 메시지로 바꿔 던진다.
    let Anthropic;
    try {
      ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch (err) {
      const e = new Error(
        'Anthropic SDK가 설치되지 않았습니다. ai-surprise 폴더에서 "npm install" 을 먼저 실행하세요.'
      );
      e.code = 'SDK_MISSING';
      e.cause = err;
      throw e;
    }
    client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), maxRetries: 2 });
  }
  return client;
}

/** 테스트에서 가짜 클라이언트를 끼울 수 있게 열어 둔다. */
export function __setClientForTest(fake) {
  client = fake;
}

/**
 * 웹검색 횟수 한도.
 *
 * 처음에 sports-news를 따라 6으로 뒀더니 실제 실행에서 모자랐다. 소재를
 * 5건 요청했는데 검색 6번을 쓰고 'Server tool use limit exceeded'가 떠서
 * 1건만 제출됐다. 1차 기록을 확인하려면 소재 하나에 4~6번은 든다 —
 * 후보를 찾는 검색, 원전을 찾는 검색, 다른 출처를 찾는 검색이 각각 필요하다.
 *
 * sports-news는 이미 있는 뉴스 기사를 확인하는 일이라 4번으로 충분했다.
 * 여기는 1855년 신문을 찾아 들어가는 일이라 성격이 다르다.
 *
 * 올리면 비용이 는다. 검색 결과가 전부 입력 토큰으로 쌓이기 때문이다.
 * 실측: 검색 6회에 입력 91,150 토큰이었다. 20회면 입력이 3배 가까이 될 수 있다.
 * 그래서 소재 개수를 줄이는 쪽이 검색을 늘리는 쪽보다 싸다.
 */
export const WEB_SEARCH_MAX_USES = Number(env('WEB_SEARCH_MAX_USES', '20'));

/** 최신 정보를 확인해야 하는 단계에서만 붙인다. */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: WEB_SEARCH_MAX_USES,
};

const MAX_CONTINUATIONS = 5;

/**
 * 웹검색을 곁들인 호출. pause_turn이 오면 대화를 그대로 되돌려보내 이어받는다.
 * (문서상 "Continue" 같은 사용자 메시지를 덧붙이면 안 된다 — 서버가 스스로 이어간다.)
 */
export async function callWithSearch({
  system,
  prompt,
  tools = [],
  model = MODELS.collect,
  maxTokens = 16000,
  effort = env('SEARCH_EFFORT', 'high'),
}) {
  const messages = [{ role: 'user', content: prompt }];
  let response;
  let continuations = 0;

  for (;;) {
    response = await withRetry(
      async () => {
        const c = await ai();
        // 반드시 스트리밍으로 받는다. max_tokens가 크면 SDK가 논스트리밍 요청을
        // 아예 거부한다:
        //   "Streaming is required for operations that may take longer than 10 minutes"
        // 실제로 이것 때문에 첫 실행이 6초 만에 죽었다. 검색이 여러 번 돌면
        // 한 번 호출이 몇 분씩 걸리므로 여기가 가장 긴 호출이다.
        const stream = c.messages.stream({
          model,
          max_tokens: maxTokens,
          system,
          messages,
          tools: [WEB_SEARCH_TOOL, ...tools],
          ...tuningFor(model, { effort, maxTokens }),
        });
        return await stream.finalMessage();
      },
      { tries: 3, base: 2000, label: 'Claude 검색 호출' }
    );

    if (response.stop_reason !== 'pause_turn' || continuations >= MAX_CONTINUATIONS) break;
    continuations++;
    // 마지막 assistant 턴을 그대로 넣고 다시 요청하면 서버가 이어서 진행한다.
    if (messages.at(-1)?.role === 'assistant') messages.pop();
    messages.push({ role: 'assistant', content: response.content });
  }

  guardRefusal(response);
  recordUsage(model, response);
  return response;
}

/** 도구 없이 긴 글을 받는다. 스트리밍으로 받아 타임아웃을 피한다. */
export async function callForText({
  system,
  prompt,
  model = MODELS.script,
  maxTokens = 32000,
  effort = 'high',
}) {
  const response = await withRetry(
    async () => {
      const c = await ai();
      const stream = c.messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
        ...tuningFor(model, { effort, maxTokens }),
      });
      return await stream.finalMessage();
    },
    { tries: 3, base: 2000, label: 'Claude 본문 생성' }
  );

  guardRefusal(response);
  recordUsage(model, response);
  return textOf(response);
}

/**
 * 스키마에 맞는 JSON을 받는다.
 *
 * strict: true 이므로 도구가 불리면 input이 스키마를 반드시 만족한다.
 * 다만 Opus 5.5처럼 도구 강제가 막힌 모델에서는 "안 부를" 수도 있으므로
 * 프롬프트에서 도구 이름을 지목하고, 그래도 안 불렀으면 분명한 오류를 던진다.
 */
export async function callForJson({
  system,
  prompt,
  toolName,
  description,
  schema,
  model = MODELS.score,
  maxTokens = 8000,
  effort = 'high',
}) {
  const tool = { name: toolName, description, strict: true, input_schema: schema };
  const forced = canForceTool(model);

  // 강제할 수 없는 모델에서는 프롬프트가 도구 호출을 유도해야 한다.
  const instruction = forced
    ? prompt
    : `${prompt}\n\n반드시 ${toolName} 도구를 호출해서 결과를 제출하세요. 도구 호출 외의 설명 문장은 쓰지 마세요.`;

  const response = await withRetry(
    async () => {
      const c = await ai();
      // 여기도 스트리밍으로 받는다. 지금 maxTokens(6000~8000)는 논스트리밍으로도
      // 통과할 값이지만, 나중에 누가 이 값을 올리는 순간 위 검색 호출과 똑같이
      // 죽는다. 그 사고를 한 번 겪었으므로 호출 경로를 전부 스트리밍으로 맞춘다.
      const stream = c.messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: instruction }],
        tools: [tool],
        tool_choice: forced ? { type: 'tool', name: toolName } : { type: 'auto' },
        ...tuningFor(model, { effort, maxTokens }),
      });
      return await stream.finalMessage();
    },
    { tries: 3, base: 2000, label: `Claude ${toolName}` }
  );

  guardRefusal(response);
  recordUsage(model, response);

  const block = response.content.find((b) => b.type === 'tool_use' && b.name === toolName);
  if (!block) {
    throw new Error(
      `${toolName} 결과를 받지 못했습니다 (stop_reason=${response.stop_reason}). ` +
        `모델이 도구를 부르지 않고 글로 답했을 수 있습니다.`
    );
  }
  return block.input;
}

// ─────────────────────────────────────────────────────────────
// 사용량 집계
//
// 실행이 끝난 뒤 "이번 편에 얼마나 썼는지"를 보여주기 위해서다.
// 비용이 보이지 않으면 어디를 줄여야 할지 알 수 없다.
// ─────────────────────────────────────────────────────────────

const usageLog = [];

function recordUsage(model, response) {
  const u = response?.usage;
  if (!u) return;
  usageLog.push({
    model,
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    searches: countSearches(response),
  });
}

function countSearches(response) {
  return (response.content || []).filter((b) => b.type === 'web_search_tool_result').length;
}

/** 지금까지 쓴 양을 모델별로 정리해 돌려준다. */
export function usageSummary() {
  const byModel = new Map();
  for (const u of usageLog) {
    const cur = byModel.get(u.model) || { input: 0, output: 0, cacheRead: 0, searches: 0, calls: 0 };
    cur.input += u.input;
    cur.output += u.output;
    cur.cacheRead += u.cacheRead;
    cur.searches += u.searches;
    cur.calls++;
    byModel.set(u.model, cur);
  }
  return [...byModel.entries()].map(([model, v]) => ({ model, ...v }));
}

export function resetUsage() {
  usageLog.length = 0;
}

export function textOf(response) {
  return (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** 웹검색이 실제로 어떤 출처를 봤는지 — 로그와 출처 기록용. */
export function searchSummary(response) {
  const results = [];
  for (const block of response.content || []) {
    if (block.type !== 'web_search_tool_result') continue;
    // 성공이면 content가 배열, 실패면 객체다. 인덱싱 전에 반드시 구분한다.
    if (Array.isArray(block.content)) {
      for (const r of block.content) if (r?.url) results.push({ title: r.title || '', url: r.url });
    } else if (block.content?.error_code) {
      results.push({ error: block.content.error_code });
    }
  }
  return results;
}

function guardRefusal(response) {
  if (response.stop_reason === 'refusal') {
    const err = new Error(
      `Claude가 요청을 거절했습니다 (${response.stop_details?.category || '사유 미상'})`
    );
    err.code = 'CLAUDE_REFUSAL';
    throw err;
  }
}
