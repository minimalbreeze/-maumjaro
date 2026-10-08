// 모의 Claude API 서버.
//
// 목적: API 키 없이 파이프라인 전 구간(사실확인 → 작성 → SEO → 저장)을 실제로 돌려본다.
// SDK의 baseURL을 이 서버로 돌리면 src/ai/*.mjs의 실제 코드가 그대로 실행된다.
// 검증되는 것: 요청 형태, 응답 파싱, 도구 결과 추출, 본문 분해, 린트, HTML 변환.
// 검증되지 않는 것: Claude가 실제로 어떤 글을 쓰는지(그건 진짜 키가 필요하다).

import http from 'node:http';

const VERIFICATION = {
  topicSummary: '2026 삼성화재배 월드 바둑 마스터스 8강에서 신진서와 커제의 맞대결이 확정됐다. 10월 서울에서 열린다.',
  eventStatus: 'upcoming',
  confirmed: [
    { field: '대회명', value: '2026 삼성화재배 월드 바둑 마스터스', sources: ['A일보', 'B신문'] },
    { field: '일정', value: '2026년 10월', sources: ['A일보', 'B신문'] },
    { field: '장소', value: '서울', sources: ['B신문'] },
    { field: '8강 대진', value: '신진서 vs 커제', sources: ['A일보', 'B신문', 'C스포츠'] },
    { field: '디펜딩 챔피언', value: '신진서', sources: ['C스포츠'] },
  ],
  conflicting: [{ field: '정확한 대국일', versions: ['10월 초', '10월 중순'] }],
  unverified: ['중계 채널', '총 상금 규모'],
  outlook: ['신진서가 상대전적에서 앞서 있어 우승 후보로 꼽힌다'],
  addedValue: ['역대 상대전적 정리', '대회 일정 한눈에 보기', '8강 전체 대진 분석'],
  isDuplicateOfExisting: false,
  duplicateReason: '',
  worthWriting: true,
  worthWritingReason: '확인된 사실이 충분하고 앞으로 열리는 대회라 검색 수요가 이어진다',
};

const ARTICLE = `2026 삼성화재배 8강 (신진서 vs 커제, 누가 유리한가?)

2026 삼성화재배 8강에서 신진서와 커제가 맞붙습니다. 대국은 2026년 10월 서울에서 열립니다. 신진서는 이 대회 디펜딩 챔피언입니다.

삼성화재배 8강은 단판 승부입니다. 지면 그 자리에서 끝나기 때문에 두 기사 모두 물러설 곳이 없습니다.

## ✨ 대회 개요

**대회명**: 2026 삼성화재배 월드 바둑 마스터스
**일정**: 2026년 10월
**장소**: 서울
**8강 대진**: 신진서 vs 커제
**디펜딩 챔피언**: 신진서

정확한 대국일은 보도에 따라 10월 초와 중순으로 조금씩 다르게 전해지고 있습니다.

## 🌟 신진서라는 벽

디펜딩 챔피언입니다. 타이틀을 지키러 나옵니다.

작년 이 대회를 들어 올린 뒤로도 흐름이 끊기지 않았습니다. 큰 무대일수록 강해지는 쪽에 가깝습니다.

## ⚡ 커제라는 변수

커제는 상대가 누구든 자기 바둑을 두는 기사입니다.

8강이라는 무대가 오히려 편할 수 있습니다. 잃을 게 없는 쪽이 더 과감해지니까요.

## 🎯 이번 판의 핵심

상대전적에서는 신진서가 앞서 있습니다. 다만 그건 어디까지나 과거의 기록입니다.

주목할 부분은 초반 포석입니다. 둘 다 AI 연구를 깊게 하는 기사라, 초반 30수에서 이미 승부의 결이 드러날 가능성이 있습니다.

## 📊 숫자로 보는 두 기사

신진서는 2025년 이 대회에서 우승했습니다. 커제는 통산 세계대회 8회 우승 기록을 갖고 있습니다.

두 기사의 상대전적은 신진서가 앞섭니다. 8강은 단판 승부라 1국에서 모든 것이 갈립니다.

## 📌 삼성화재배 8강이 주목받는 이유

삼성화재배는 한국에서 열리는 세계 바둑 대회 중 역사가 긴 편에 속합니다. 역대 우승자 명단이 곧 그 시대 최강자 목록으로 읽히는 대회입니다.

한국과 중국의 최강자가 8강에서 만나는 구도는 드뭅니다. 보통은 4강이나 결승에서 만나기 때문입니다.

## 👀 관전 포인트

✅ 디펜딩 챔피언 신진서의 타이틀 방어 출발점
✅ 한중 최강자의 8강 조기 격돌
✅ 초반 포석에서 갈릴 주도권
✅ 서울에서 열리는 홈 어드밴티지
✅ 패자는 곧바로 탈락하는 단판 승부

## ❓ 자주 묻는 질문

**Q. 삼성화재배 8강은 언제 열리나요?**

2026년 10월에 열립니다. 정확한 대국일은 보도에 따라 10월 초와 중순으로 조금씩 다르게 전해지고 있습니다.

**Q. 삼성화재배 8강은 어디에서 열리나요?**

서울에서 열립니다. 한국에서 열리는 세계 바둑 대회입니다.

**Q. 신진서와 커제의 상대전적은 어떻게 되나요?**

상대전적에서는 신진서가 앞서 있습니다. 다만 그건 과거의 기록이고 이번 판과는 별개입니다.

**Q. 삼성화재배 8강 중계는 어디서 볼 수 있나요?**

중계 채널은 아직 공식 발표를 기다리는 중입니다. 확정되면 다시 정리해 드리겠습니다.

## 🔥 이 판을 이기는 쪽은 누구일까?

8강에서 만나기엔 아까운 대진입니다. 그만큼 재미있는 한 판이 나올 겁니다.

이 판이 끝나면 4강 대진이 정해집니다. 2025년 우승자 신진서가 2연패에 성공할지도 그때 윤곽이 잡힙니다.

중계 채널과 상금 규모는 아직 공식 발표를 기다리는 중입니다. 확정되면 다시 정리해 드리겠습니다.

10월, 서울에서 펼쳐질 승부를 함께 지켜봐 주시기 바랍니다.`;

const SEO = {
  seoTitle: '2026 삼성화재배 8강 신진서 vs 커제 대진 일정',
  metaDescription: '2026 삼성화재배 월드 바둑 마스터스 8강에서 신진서와 커제가 만납니다. 10월 서울에서 열리는 대회 일정과 대진, 관전 포인트를 정리했습니다.',
  focusKeyword: '삼성화재배 8강',
  keywords: ['삼성화재배', '신진서', '커제', '바둑 대회 일정'],
  tags: ['삼성화재배', '신진서', '커제', '신진서 커제 대국일정', '바둑8강', '세계바둑대회', '바둑'],
  slug: 'samsung-cup-2026-quarterfinal-shin-vs-ke',
};

function msg(content, stopReason = 'end_turn') {
  return {
    id: 'msg_mock', type: 'message', role: 'assistant', model: 'claude-opus-5',
    content, stop_reason: stopReason, stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 800 },
  };
}

const CLASSIFY = {
  category: '바둑',
  reason: '바둑 대회 소식이라 바둑 카테고리가 맞습니다.',
  queries: ['삼성화재배', '신진서 커제'],
  focusKeyword: '삼성화재배 8강',
};

export function startMockServer({ simulatePauseTurn = false } = {}) {
  let verifyCalls = 0;
  // 모의가 거부한 요청을 남긴다. 거부가 한 번이라도 있으면 우리가 API를
  // 잘못 부르고 있다는 뜻이다 — 폴백이 삼켜서 겉으로는 성공해 보여도.
  const seen = { tools: [], hadWebSearch: false, systemPrompts: [], rejected: [], userPrompts: [] };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const payload = JSON.parse(body || '{}');
      const toolNames = (payload.tools || []).map((t) => t.name || t.type);
      seen.tools.push(toolNames);
      if (toolNames.includes('web_search')) seen.hadWebSearch = true;
      if (payload.system) seen.systemPrompts.push(String(payload.system).slice(0, 60));
      // 사용자 프롬프트 전문을 남긴다. 어떤 재료를 실제로 넘겼는지 검사하려면
      // 이게 있어야 한다 — 운영자가 준 기사가 사실확인 단계에 닿았는지 같은 것.
      for (const m of payload.messages || []) {
        if (m.role !== 'user') continue;
        const t = typeof m.content === 'string'
          ? m.content
          : (m.content || []).map((b) => b.text || '').join('\n');
        if (t) seen.userPrompts.push(t);
      }

      // 실제 API가 거부하는 조합은 모의도 거부해야 한다.
      // 도구를 지목해 부르면서 thinking을 켜면 400이 난다. 모의가 이걸 받아주는
      // 바람에, 테스트는 전부 통과하는데 운영에서 다 써 놓은 글이 SEO 단계에서
      // 통째로 날아갔다.
      const forcesTool = payload.tool_choice && payload.tool_choice.type === 'tool';
      if (forcesTool && payload.thinking) {
        seen.rejected.push('thinking + tool_choice 강제');
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'invalid_request_error', message: 'Thinking may not be enabled when tool_choice forces tool use.' },
        }));
        return;
      }

      let out;
      if (toolNames.includes('report_verification')) {
        verifyCalls++;
        // 첫 호출에서 pause_turn을 흉내내 이어받기 로직을 검사한다
        if (simulatePauseTurn && verifyCalls === 1) {
          out = msg([{ type: 'text', text: '검색 중...' }], 'pause_turn');
        } else {
          out = msg([
            { type: 'web_search_tool_result', tool_use_id: 'srv_1',
              content: [{ type: 'web_search_result', url: 'https://example.org/a', title: '대회 공지' }] },
            { type: 'tool_use', id: 'tu_1', name: 'report_verification', input: VERIFICATION },
          ], 'tool_use');
        }
      } else if (toolNames.includes('classify_subject')) {
        out = msg([{ type: 'tool_use', id: 'tu_3', name: 'classify_subject', input: CLASSIFY }], 'tool_use');
      } else if (toolNames.includes('generate_seo')) {
        out = msg([{ type: 'tool_use', id: 'tu_2', name: 'generate_seo', input: SEO }], 'tool_use');
      } else {
        out = msg([{ type: 'text', text: ARTICLE }]);
      }

      const wantsStream = payload.stream === true;
      if (!wantsStream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out));
        return;
      }
      // 스트리밍. 본문 작성뿐 아니라 사실 확인(도구 호출)도 이 길로 온다 —
      // max_tokens 를 올리려고 callWithSearch 를 스트리밍으로 바꿨기 때문이다.
      // 텍스트만 흘려보내면 도구 호출 블록이 사라져서 "결과를 받지 못했습니다"가 된다.
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
      send('message_start', { type: 'message_start', message: { ...out, content: [], usage: { input_tokens: 1200, output_tokens: 0 } } });

      let idx = 0;
      for (const block of out.content) {
        if (block.type === 'text') {
          send('content_block_start', { type: 'content_block_start', index: idx, content_block: { type: 'text', text: '' } });
          send('content_block_delta', { type: 'content_block_delta', index: idx, delta: { type: 'text_delta', text: block.text } });
        } else if (block.type === 'tool_use') {
          send('content_block_start', {
            type: 'content_block_start', index: idx,
            content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
          });
          send('content_block_delta', {
            type: 'content_block_delta', index: idx,
            delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
          });
        } else {
          // 서버 도구 결과(web_search_tool_result) 등은 통째로 한 번에 보낸다.
          send('content_block_start', { type: 'content_block_start', index: idx, content_block: block });
        }
        send('content_block_stop', { type: 'content_block_stop', index: idx });
        idx++;
      }

      send('message_delta', { type: 'message_delta', delta: { stop_reason: out.stop_reason || 'end_turn' }, usage: { output_tokens: 800 } });
      send('message_stop', { type: 'message_stop' });
      res.end();
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, seen, get verifyCalls() { return verifyCalls; } });
    });
  });
}

export { VERIFICATION, ARTICLE, SEO, CLASSIFY };
