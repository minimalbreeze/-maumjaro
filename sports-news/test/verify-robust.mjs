// 사실 확인 응답이 잘렸을 때, 그리고 그 호출 비용을 세는지 검사.
//
// 2026-10-05 윤이나 기사(4,537바이트)로 돌렸을 때 두 가지가 한꺼번에 드러났다.
//
// ① 도구 입력이 잘려 confirmed 가 없는 결과가 왔고, 코드가 `confirmed.length`를
//    읽다가 죽었다. 3분 걸린 유료 호출값을 읽기도 전에 버렸고, 로그에는
//    "Cannot read properties of undefined (reading 'length')" 만 남았다.
//
// ② callWithSearch 가 recordUsage 를 부르지 않아서 **사실 확인 단계가 비용
//    집계에 아예 안 들어갔다.** 한 편 127원이라고 찍힌 값이 실제보다 낮았다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 정리한사실확인 } from '../src/ai/analyze.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[사실 확인 — 잘린 응답과 비용 집계]');

const 온전한결과 = {
  topicSummary: '윤이나가 롯데 챔피언십에서 준우승했다',
  eventStatus: 'finished',
  confirmed: [{ field: '순위', value: '단독 2위', sources: ['A일보'] }],
  conflicting: [], unverified: [], outlook: [], addedValue: [],
  isDuplicateOfExisting: false, duplicateReason: '',
  worthWriting: true, worthWritingReason: '기록이 분명하다',
};

// ── ① 잘린 응답 ────────────────────────────────────────────
check('confirmed 가 아예 없으면 잘렸다고 말하고 멈춘다', () => {
  // 사실 0건으로 넘기면 "사실 근거 부족"이라는 틀린 이유가 로그에 남는다.
  const 잘린것 = { topicSummary: '윤이나가 준우승했다', eventStatus: 'finished' };
  assert.throws(
    () => 정리한사실확인(잘린것, { stop_reason: 'max_tokens' }),
    (err) => {
      assert.equal(err.code, 'VERIFY_TRUNCATED', `code=${err.code}`);
      assert.match(err.message, /잘렸습니다/, '잘렸다는 말이 없습니다');
      assert.match(err.message, /max_tokens/, 'stop_reason 이 없습니다');
      assert.match(err.message, /VERIFY_MAX_TOKENS/, '어떻게 고치는지 없습니다');
      return true;
    },
  );
});

check('confirmed 만 있고 나머지가 없어도 죽지 않는다', () => {
  // 사실이 있으면 글은 쓸 수 있다. 부수 항목이 없다고 버릴 이유가 없다.
  const v = 정리한사실확인({ ...온전한결과, conflicting: undefined, unverified: undefined, outlook: undefined, addedValue: undefined });
  assert.equal(v.confirmed.length, 1);
  for (const k of ['conflicting', 'unverified', 'outlook', 'addedValue']) {
    assert.ok(Array.isArray(v[k]), `${k} 가 배열이 아닙니다`);
  }
  // main.mjs 가 바로 .length 를 읽는다. 여기서 막히면 거기서 죽는다.
  assert.doesNotThrow(() => `${v.confirmed.length}/${v.unverified.length}/${v.conflicting.length}`);
});

check('잘렸다는 사실을 남겨 로그에 찍게 한다', () => {
  // 모델이 이유를 적어 보냈어도, 잘렸으면 그 이유를 그대로 믿을 수 없다.
  const v = 정리한사실확인(온전한결과, { stop_reason: 'max_tokens' });
  assert.equal(v.잘린결과, true);
  assert.match(v.worthWritingReason, /불완전/, '근거가 불완전하다는 말이 없습니다');
  assert.match(v.worthWritingReason, /기록이 분명하다/, '모델이 적은 이유를 버렸습니다');
  // 온전하면 표시하지 않는다.
  assert.equal(정리한사실확인(온전한결과, { stop_reason: 'tool_use' }).잘린결과, false);
});

check('중복 여부를 모호하게 넘기지 않는다', () => {
  // undefined 를 그대로 두면 if (verification.isDuplicateOfExisting) 가 통과한다.
  assert.equal(정리한사실확인({ ...온전한결과, isDuplicateOfExisting: undefined }).isDuplicateOfExisting, false);
  assert.equal(정리한사실확인({ ...온전한결과, isDuplicateOfExisting: true }).isDuplicateOfExisting, true);
  // 'false' 같은 문자열이 와도 참으로 읽히지 않아야 한다.
  assert.equal(정리한사실확인({ ...온전한결과, isDuplicateOfExisting: 'false' }).isDuplicateOfExisting, false);
});

check('잘린 응답을 main 이 로그에 남긴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main.mjs'), 'utf8');
  assert.match(src, /verification\.잘린결과/, '잘린 결과를 보지 않습니다');
  assert.match(src, /VERIFY_MAX_TOKENS/, '어떻게 고치는지 로그에 없습니다');
});

// ── ② 비용 집계 ────────────────────────────────────────────
await checkAsync('사실 확인 호출이 비용 집계에 들어간다', async () => {
  // 이 검사가 이 파일의 두 번째 이유다. 없으면 돈을 쓰고도 안 썼다고 보고한다.
  let calls = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls++;
      const send = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
      const msg = {
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
        content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 4321, output_tokens: 0 },
      };
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      send('message_start', { type: 'message_start', message: msg });
      send('content_block_start', {
        type: 'content_block_start', index: 0,
        content_block: { type: 'tool_use', id: 'tu_1', name: 'report_verification', input: {} },
      });
      send('content_block_delta', {
        type: 'content_block_delta', index: 0,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(온전한결과) },
      });
      send('content_block_stop', { type: 'content_block_stop', index: 0 });
      send('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 765 } });
      send('message_stop', { type: 'message_stop' });
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  process.env.ANTHROPIC_API_KEY = 'sk-ant-mock';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  const { callWithSearch, usageSummary } = await import('../src/ai/client.mjs');
  const 전 = usageSummary().reduce((a, r) => a + r.input + r.output, 0);
  let 후목록; let 후;
  try {
    await callWithSearch({ system: '시스템', prompt: '프롬프트', tools: [] });
    후목록 = usageSummary();
    후 = 후목록.reduce((a, r) => a + r.input + r.output, 0);
  } finally {
    // 닫지 않으면 검사가 실패해도 프로세스가 끝나지 않는다. 한 번 그랬다.
    server.close();
  }

  assert.equal(calls, 1, '호출이 한 번 돌지 않았습니다');
  assert.ok(후 > 전, `집계가 늘지 않았습니다 (전 ${전} → 후 ${후})`);
  assert.equal(후 - 전, 4321 + 765, `센 토큰이 다릅니다: ${JSON.stringify(후목록)}`);
  // 사실 확인 모델로 잡혀야 한다. 다른 모델로 세면 단가가 틀린다.
  assert.ok(후목록.some((r) => r.input >= 4321), `사실 확인 호출이 집계에 없습니다: ${JSON.stringify(후목록)}`);
});

check('비용을 세는 자리가 이어받기 안쪽에 있다', () => {
  // pause_turn 이어받기는 호출마다 따로 과금된다. 루프 밖에서 한 번만 세면
  // 이어받은 호출이 공짜로 보인다.
  const src = fs.readFileSync(path.join(ROOT, 'src/ai/client.mjs'), 'utf8');
  const 시작 = src.indexOf('export async function callWithSearch');
  const 끝 = src.indexOf('\nexport async function callForText');
  const 본문 = src.slice(시작, 끝);
  const 집계 = 본문.indexOf('recordUsage(MODELS.verify');
  const 탈출 = 본문.indexOf("response.stop_reason !== 'pause_turn'");
  assert.ok(집계 > 0, 'callWithSearch 가 비용을 세지 않습니다');
  assert.ok(집계 < 탈출, '이어받기로 빠져나간 뒤에 세고 있습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
