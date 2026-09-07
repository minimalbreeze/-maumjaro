// Claude API 클라이언트.
//
// 이 파일의 역할은 "안전한 호출 한 번"을 제공하는 것이다.
//  - 서버 웹검색이 길어져 pause_turn으로 끊기면 자동으로 이어서 받는다
//  - 긴 출력은 스트리밍으로 받아 HTTP 타임아웃을 피한다
//  - JSON이 필요한 곳은 strict tool로 받는다 (문자열 파싱 실패 위험 제거)

import Anthropic from '@anthropic-ai/sdk';
import { env, requireEnv } from '../utils/env.mjs';
import { withRetry } from '../utils/retry.mjs';

export const MODEL = env('CLAUDE_MODEL', 'claude-opus-5');

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
  max_uses: Number(env('WEB_SEARCH_MAX_USES', '8')),
};

const MAX_CONTINUATIONS = 5;

/**
 * 웹검색을 곁들인 호출. pause_turn이 오면 대화를 그대로 되돌려보내 이어받는다.
 * (문서상 "Continue" 같은 사용자 메시지를 덧붙이면 안 된다 — 서버가 스스로 이어간다.)
 */
export async function callWithSearch({ system, prompt, tools = [], maxTokens = 16000, effort = 'high' }) {
  const messages = [{ role: 'user', content: prompt }];
  let response;
  let continuations = 0;

  for (;;) {
    response = await withRetry(
      () => ai().messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages,
        tools: [WEB_SEARCH_TOOL, ...tools],
        thinking: { type: 'adaptive' },
        output_config: { effort },
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
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      thinking: { type: 'adaptive' },
      output_config: { effort },
    });
    return await stream.finalMessage();
  }, { tries: 3, base: 2000, label: 'Claude 본문 생성' });

  guardRefusal(response);
  return textOf(response);
}

/**
 * 스키마에 맞는 JSON을 받는다.
 * strict: true 이므로 input이 스키마를 반드시 만족한다 — 파싱 실패를 걱정하지 않아도 된다.
 */
export async function callForJson({ system, prompt, toolName, description, schema, maxTokens = 16000, effort = 'high' }) {
  const tool = {
    name: toolName,
    description,
    strict: true,
    input_schema: schema,
  };

  const response = await withRetry(
    () => ai().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      tools: [tool],
      tool_choice: { type: 'tool', name: toolName },
      thinking: { type: 'adaptive' },
      output_config: { effort },
    }),
    { tries: 3, base: 2000, label: `Claude ${toolName}` }
  );

  guardRefusal(response);
  const block = response.content.find((b) => b.type === 'tool_use' && b.name === toolName);
  if (!block) throw new Error(`${toolName} 결과를 받지 못했습니다 (stop_reason=${response.stop_reason})`);
  return block.input;
}

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
