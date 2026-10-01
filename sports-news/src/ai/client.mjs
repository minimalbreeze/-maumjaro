// Claude API 클라이언트.
//
// 이 파일의 역할은 "안전한 호출 한 번"을 제공하는 것이다.
//  - 서버 웹검색이 길어져 pause_turn으로 끊기면 자동으로 이어서 받는다
//  - 긴 출력은 스트리밍으로 받아 HTTP 타임아웃을 피한다
//  - JSON이 필요한 곳은 strict tool로 받는다 (문자열 파싱 실패 위험 제거)

import Anthropic from '@anthropic-ai/sdk';
import { env, requireEnv } from '../utils/env.mjs';
import { withRetry } from '../utils/retry.mjs';

/**
 * 단계마다 다른 모델을 쓴다.
 *
 * 사실 확인과 본문 작성은 품질이 곧 결과물이므로 가장 좋은 모델을 쓴다.
 * SEO는 다 쓴 글에서 제목·설명·태그를 뽑는 단순 작업이라 가벼운 모델로 충분하다.
 * 이 단계만 바꿔도 한 편당 비용이 눈에 띄게 줄어든다.
 */
export const MODELS = {
  // 사실 확인: 기사에서 사실을 뽑아 분류하는 기계적인 일에 가깝다.
  //   웹검색이 붙어 가장 비싼 단계이므로 여기를 낮추는 효과가 가장 크다.
  verify: env('CLAUDE_MODEL_VERIFY', 'claude-sonnet-5'),
  // 본문 작성: 한 편 비용의 95%가 여기서 난다.
  //   Opus 5로 쓰면 한 편에 약 330원, Sonnet 5면 약 90원이다.
  //   실제로 뽑아본 글을 비교해 보니 양식·사실 준수는 차이가 없었고,
  //   차이가 나는 건 문장의 결 정도였다. 매일 돌릴 도구라 여기를 낮춘다.
  //   품질이 아쉬우면 CLAUDE_MODEL_WRITE=claude-opus-5 로 되돌리면 된다.
  write: env('CLAUDE_MODEL_WRITE', 'claude-sonnet-5'),
  // SEO: 다 쓴 글에서 제목·설명·태그를 뽑는 단순 작업.
  seo: env('CLAUDE_MODEL_SEO', 'claude-haiku-4-5'),
};

// 이전 이름을 쓰던 곳이 있어 남겨둔다.
export const MODEL = MODELS.write;

/**
 * 모델마다 받는 파라미터가 다르다. 틀리면 400이 난다.
 *
 *  - Opus 5 / Sonnet 5 등 최신 계열: thinking {type:'adaptive'}, output_config.effort
 *  - Haiku 4.5: adaptive를 모른다. thinking은 budget_tokens 형태이고 effort는 오류가 난다.
 *
 * 그리고 도구 사용을 강제할 때(tool_choice로 특정 도구를 지목할 때)는 생각을
 * 켤 수 없다. 켜면 400이 난다:
 *   Thinking may not be enabled when tool_choice forces tool use.
 * 실제로 이 조합 때문에 다 써 놓은 글이 SEO 단계에서 통째로 날아간 적이 있다.
 *
 * 그래서 모델 이름과 도구 강제 여부를 보고 맞는 형태를 만들어 붙인다.
 */
export function tuningFor(model, { effort = 'high', maxTokens = 16000, forcedTool = false } = {}) {
  const isHaiku = /haiku/.test(model);
  // 도구를 지목해 부르는 자리는 스키마에 맞는 JSON만 받으면 되는 단순한 일이다.
  // 생각이 필요하지도 않고, 켜면 API가 거부한다.
  if (forcedTool) return isHaiku ? {} : { output_config: { effort } };
  if (isHaiku) {
    // Haiku는 effort를 받지 않는다. 생각을 조금만 시킨다.
    return { thinking: { type: 'enabled', budget_tokens: Math.min(4000, Math.floor(maxTokens / 2)) } };
  }
  return { thinking: { type: 'adaptive' }, output_config: { effort } };
}

let client = null;
export function ai() {
  if (!client) {
    requireEnv(['ANTHROPIC_API_KEY']);
    client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), maxRetries: 2 });
  }
  return client;
}

/** 최신 정보를 확인해야 하는 단계에서만 붙인다. */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209',
  name: 'web_search',
  // 8회였을 때 한 번 실행에 검색 결과를 72건 참조했다. 정확도는 좋았지만
  // 비용과 시간(8분)이 컸다.
  //
  // 그래서 3회로 줄였더니 이번엔 반대로 기울었다. 사실확인 단계가
  // "검색 도구 제한으로 추가 검증이 불가능했다"며 글을 못 쓰겠다고 했다.
  // 아껴봐야 글이 안 나오면 그게 제일 비싸다. 5회가 그 사이다.
  max_uses: Number(env('WEB_SEARCH_MAX_USES', '4')),
};

const MAX_CONTINUATIONS = 5;

/**
 * 웹검색을 곁들인 호출. pause_turn이 오면 대화를 그대로 되돌려보내 이어받는다.
 * (문서상 "Continue" 같은 사용자 메시지를 덧붙이면 안 된다 — 서버가 스스로 이어간다.)
 */
export async function callWithSearch({ system, prompt, tools = [], maxTokens = 16000, effort = env('VERIFY_EFFORT', 'medium') }) {
  const messages = [{ role: 'user', content: prompt }];
  let response;
  let continuations = 0;

  for (;;) {
    response = await withRetry(
      () => ai().messages.create({
        model: MODELS.verify,
        max_tokens: maxTokens,
        system,
        messages,
        tools: [WEB_SEARCH_TOOL, ...tools],
        ...tuningFor(MODELS.verify, { effort, maxTokens }),
      }),
      { tries: 3, base: 2000, label: 'Claude 호출' }
    );

    if (response.stop_reason !== 'pause_turn' || continuations >= MAX_CONTINUATIONS) break;
    continuations++;
    // 마지막 assistant 턴을 그대로 넣고 다시 요청하면 서버가 이어서 진행한다.
    if (messages.at(-1)?.role === 'assistant') messages.pop();
    messages.push({ role: 'assistant', content: response.content });
  }

  guardRefusal(response);
  return response;
}

/** 도구 없이 긴 글을 받는다. 스트리밍으로 받아 타임아웃을 피한다. */
export async function callForText({ system, prompt, maxTokens = 32000, effort = 'high' }) {
  const response = await withRetry(async () => {
    const stream = ai().messages.stream({
      model: MODELS.write,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      ...tuningFor(MODELS.write, { effort, maxTokens }),
    });
    return await stream.finalMessage();
  }, { tries: 3, base: 2000, label: 'Claude 본문 생성' });

  guardRefusal(response);
  recordUsage(MODELS.write, response);
  return textOf(response);
}

/**
 * 스키마에 맞는 JSON을 받는다.
 * strict: true 이므로 input이 스키마를 반드시 만족한다 — 파싱 실패를 걱정하지 않아도 된다.
 */
export async function callForJson({ system, prompt, toolName, description, schema, maxTokens = 8000, effort = 'high', model = MODELS.seo }) {
  const tool = {
    name: toolName,
    description,
    strict: true,
    input_schema: schema,
  };

  const response = await withRetry(
    () => ai().messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      tools: [tool],
      tool_choice: { type: 'tool', name: toolName },
      ...tuningFor(model, { effort, maxTokens, forcedTool: true }),
    }),
    { tries: 3, base: 2000, label: `Claude ${toolName}` }
  );

  guardRefusal(response);
  recordUsage(model, response);
  const block = response.content.find((b) => b.type === 'tool_use' && b.name === toolName);
  if (!block) throw new Error(`${toolName} 결과를 받지 못했습니다 (stop_reason=${response.stop_reason})`);
  return block.input;
}

/**
 * 토큰 사용량을 모은다.
 *
 * 실행이 끝난 뒤 "이번 글에 얼마나 썼는지"를 보여주기 위해서다.
 * 비용이 보이지 않으면 어디를 줄여야 할지 알 수 없다.
 */
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
    cur.input += u.input; cur.output += u.output;
    cur.cacheRead += u.cacheRead; cur.searches += u.searches; cur.calls++;
    byModel.set(u.model, cur);
  }
  return [...byModel.entries()].map(([model, v]) => ({ model, ...v }));
}

export function resetUsage() { usageLog.length = 0; }

export function textOf(response) {
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** 응답 안의 tool_use 블록에서 특정 도구 결과를 꺼낸다. */
export function toolInputOf(response, toolName) {
  const block = response.content.find((b) => b.type === 'tool_use' && b.name === toolName);
  return block ? block.input : null;
}

/** 웹검색이 실제로 몇 번 돌았고 어떤 출처를 봤는지 — 로그용. */
export function searchSummary(response) {
  const results = [];
  for (const block of response.content) {
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
    const err = new Error(`Claude가 요청을 거절했습니다 (${response.stop_details?.category || '사유 미상'})`);
    err.code = 'CLAUDE_REFUSAL';
    throw err;
  }
}
