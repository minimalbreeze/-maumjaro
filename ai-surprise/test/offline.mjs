// 오프라인 테스트.
//
// API 키 없이, npm install 없이 돌아간다. 돈이 들지 않고 몇 초면 끝난다.
// 그래서 코드를 고칠 때마다 부담 없이 돌려볼 수 있다.
//
//   node test/offline.mjs
//
// 여기서 검증하는 것은 "AI가 좋은 대본을 쓰는가"가 아니다. 그건 실제로
// 돌려봐야 안다. 여기서 보는 것은 "AI가 엉뚱한 걸 내놨을 때 우리 코드가
// 그걸 잡아내는가"다. 그게 이 프로젝트의 안전장치 전부다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// store.mjs 를 불러오기 전에 저장 위치를 임시 폴더로 바꾼다.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-surprise-test-'));
process.env.AI_SURPRISE_DATA_DIR = TMP;

const { makeItem, finalScore, evaluateGate, GATE, FACT_STATUS, MAX_SCORE, STATUS } = await import(
  '../src/model.mjs'
);
const { buildCollectPrompt, COLLECT_SCHEMA } = await import('../src/research/collect.mjs');
const { buildScorePrompt, SCORE_SCHEMA } = await import('../src/research/score.mjs');
const { buildScriptPrompt, validateScript, SECTIONS, TAGS } = await import('../src/script/write.mjs');
const store = await import('../src/store.mjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message.split('\n').slice(0, 6).join('\n     ')}`);
  }
}

/**
 * 비동기 테스트.
 *
 * 위의 test()는 동기라서 async 함수를 넘기면 예외를 못 잡고 조용히 통과한다.
 * 조용히 통과하는 테스트는 테스트가 없는 것보다 나쁘므로 따로 둔다.
 * 호출할 때 반드시 await 해야 한다.
 */
async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message.split('\n').slice(0, 6).join('\n     ')}`);
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`);
}

// ─────────────────────────────────────────────────────────────
section('1. 점수 계산');

test('배점 합계가 100점이다', () => {
  assert.equal(MAX_SCORE, 100);
});

test('항목 점수를 더해 최종 점수를 낸다', () => {
  const score = finalScore({
    interesting_score: 20,
    twist_score: 20,
    fact_score: 15,
    visual_score: 10,
    title_score: 10,
  });
  assert.equal(score, 75);
});

test('배점 상한을 넘겨 주면 깎는다', () => {
  // AI가 25점 항목에 999점을 줘도 100점 만점이 무너지지 않아야 한다.
  const score = finalScore({
    interesting_score: 999,
    twist_score: 999,
    fact_score: 999,
    visual_score: 999,
    title_score: 999,
  });
  assert.equal(score, 100);
});

test('점수가 빠져 있으면 0으로 센다', () => {
  assert.equal(finalScore({}), 0);
  assert.equal(finalScore(null), 0);
  assert.equal(finalScore({ interesting_score: 'abc' }), 0);
});

// ─────────────────────────────────────────────────────────────
section('2. 자동 제작 관문 — 가짜 소재를 막는 방어선');

const fullScores = {
  interesting_score: 25,
  twist_score: 25,
  fact_score: 20,
  visual_score: 15,
  title_score: 15,
};

test('출처 2개 + 확인된 사실이면 통과한다', () => {
  const item = makeItem({
    title: '통과해야 하는 소재',
    fact_status: 'CONFIRMED',
    sources: [
      { url: 'https://a.example', name: 'A신문', kind: 'PRIMARY' },
      { url: 'https://b.example', name: 'B기록원', kind: 'PRIMARY' },
    ],
    ...fullScores,
    risk_flags: [],
    risk_score: 5,
  });
  assert.equal(item.gate, GATE.AUTO_OK);
  assert.equal(item.recommended, true);
});

test('출처가 1개면 점수가 만점이라도 검토 필요로 간다', () => {
  // 이게 이 프로젝트에서 가장 중요한 규칙이다.
  // 재미있는 소재가 점수로 관문을 뚫는 일이 없어야 한다.
  const item = makeItem({
    title: '출처 하나뿐',
    fact_status: 'PARTIAL',
    sources: [{ url: 'https://a.example', name: 'A블로그', kind: 'SECONDARY' }],
    ...fullScores,
    risk_flags: [],
    risk_score: 0,
  });
  assert.equal(item.final_score, 100);
  assert.equal(item.gate, GATE.REVIEW_NEEDED);
  assert.equal(item.recommended, false);
  assert.ok(item.gate_reasons.some((r) => r.includes('출처')));
});

test('1차 기록이 없는 이야기(UNVERIFIED)는 아예 막는다', () => {
  const item = makeItem({
    title: '인터넷 괴담',
    fact_status: 'UNVERIFIED',
    sources: [
      { url: 'https://a.example', name: '커뮤니티', kind: 'SECONDARY' },
      { url: 'https://b.example', name: '요약블로그', kind: 'SECONDARY' },
    ],
    ...fullScores,
    risk_flags: [],
    risk_score: 10,
  });
  assert.equal(item.gate, GATE.BLOCKED);
});

test('위험 유형 4가지는 즉시 차단된다', () => {
  for (const flag of [
    'FABRICATED',
    'DEFAMATION',
    'LIVING_PERSON_CLAIM',
    'CRIMINAL_GLORIFICATION',
  ]) {
    const item = makeItem({
      title: `위험: ${flag}`,
      fact_status: 'CONFIRMED',
      sources: [
        { url: 'https://a.example', name: 'A', kind: 'PRIMARY' },
        { url: 'https://b.example', name: 'B', kind: 'PRIMARY' },
      ],
      ...fullScores,
      risk_flags: [flag],
      risk_score: 90,
    });
    assert.equal(item.gate, GATE.BLOCKED, `${flag} 이 차단되지 않았다`);
  }
});

test('음모론 플래그는 차단이 아니라 검토 필요다', () => {
  // 음모론 자체를 다루는 건 가능하다. THEORY로 구분하면 된다.
  const item = makeItem({
    title: '음모론이 얽힌 사건',
    fact_status: 'CONFIRMED',
    sources: [
      { url: 'https://a.example', name: 'A', kind: 'PRIMARY' },
      { url: 'https://b.example', name: 'B', kind: 'PRIMARY' },
    ],
    ...fullScores,
    risk_flags: ['CONSPIRACY_AS_FACT'],
    risk_score: 40,
  });
  assert.equal(item.gate, GATE.REVIEW_NEEDED);
  assert.ok(item.gate_reasons.some((r) => r.includes('THEORY')));
});

test('위험도 50점 이상이면 검토 필요다', () => {
  const item = makeItem({
    title: '위험도 높음',
    fact_status: 'CONFIRMED',
    sources: [
      { url: 'https://a.example', name: 'A', kind: 'PRIMARY' },
      { url: 'https://b.example', name: 'B', kind: 'PRIMARY' },
    ],
    ...fullScores,
    risk_flags: [],
    risk_score: 60,
  });
  assert.equal(item.gate, GATE.REVIEW_NEEDED);
});

test('모르는 위험 플래그는 조용히 버린다', () => {
  // AI가 스키마에 없는 값을 보내도 코드가 죽지 않아야 한다.
  const item = makeItem({
    title: '이상한 플래그',
    fact_status: 'CONFIRMED',
    sources: [
      { url: 'https://a.example', name: 'A', kind: 'PRIMARY' },
      { url: 'https://b.example', name: 'B', kind: 'PRIMARY' },
    ],
    ...fullScores,
    risk_flags: ['NOT_A_REAL_FLAG'],
    risk_score: 0,
  });
  assert.deepEqual(item.risk_flags, []);
  assert.equal(item.gate, GATE.AUTO_OK);
});

test('사실성 등급이 이상하면 UNVERIFIED로 떨어뜨린다', () => {
  // 모르는 값을 "확인됨"으로 봐주면 안 된다. 안전한 쪽으로 기울인다.
  const item = makeItem({ title: 'x', fact_status: '아무말', sources: [] });
  assert.equal(item.fact_status, FACT_STATUS.UNVERIFIED);
  assert.equal(item.gate, GATE.BLOCKED);
});

test('출처 배열에서 source_count 를 직접 센다', () => {
  // AI가 source_count 를 틀리게 보고해도 실제 배열 길이를 쓴다.
  const item = makeItem({
    title: 'x',
    fact_status: 'CONFIRMED',
    source_count: 99,
    sources: [{ url: 'https://a.example', name: 'A', kind: 'PRIMARY' }],
  });
  assert.equal(item.source_count, 1);
});

test('url 없는 출처는 세지 않는다', () => {
  const item = makeItem({
    title: 'x',
    fact_status: 'CONFIRMED',
    sources: [{ name: '어디선가 들음' }, { url: 'https://a.example', name: 'A' }],
  });
  assert.equal(item.source_count, 1);
});

// ─────────────────────────────────────────────────────────────
section('3. 프롬프트 조립');

test('수집 프롬프트에 분야 목록이 들어간다', () => {
  const p = buildCollectPrompt({ count: 3 });
  assert.ok(p.includes('3건'));
  assert.ok(p.includes('실제 미스터리'));
  assert.ok(p.includes('submit_materials'));
});

test('수집 프롬프트에 제외 목록이 들어간다', () => {
  const p = buildCollectPrompt({ count: 2, avoidTitles: ['이미 한 소재'] });
  assert.ok(p.includes('이미 한 소재'));
  assert.ok(p.includes('제외'));
});

test('분야를 지정하면 그 분야만 넣는다', () => {
  const p = buildCollectPrompt({ category: '과학적 미스터리' });
  assert.ok(p.includes('분야: 과학적 미스터리'));
});

test('심사 프롬프트에 출처와 1차 기록 여부가 들어간다', () => {
  const p = buildScorePrompt({
    title: '테스트 사건',
    sources: [{ url: 'https://a.example', name: 'A신문', kind: 'PRIMARY' }],
    primary_record_found: true,
  });
  assert.ok(p.includes('테스트 사건'));
  assert.ok(p.includes('https://a.example'));
  assert.ok(p.includes('[PRIMARY]'));
  assert.ok(p.includes('1차 기록 있음: 예'));
});

test('심사 프롬프트에 배점이 숫자로 들어간다', () => {
  const p = buildScorePrompt({ title: 'x' });
  assert.ok(p.includes('0~25'));
  assert.ok(p.includes('0~20'));
  assert.ok(p.includes('0~15'));
});

test('대본 프롬프트에 모든 섹션이 순서대로 들어간다', () => {
  const p = buildScriptPrompt({ title: 'x', summary: 'y' });
  let last = -1;
  for (const s of SECTIONS) {
    const idx = p.indexOf(`[${s.key}]`);
    assert.ok(idx > -1, `${s.key} 가 프롬프트에 없다`);
    assert.ok(idx > last, `${s.key} 순서가 어긋났다`);
    last = idx;
  }
});

test('대본 프롬프트에 분량이 글자 수로 들어간다', () => {
  const p = buildScriptPrompt({ title: 'x' }, { targetMinutes: 4 });
  assert.ok(p.includes('1320자'), '4분 × 330자 = 1320자가 들어가야 한다');
});

test('확인되지 않은 항목이 UNKNOWN 지시와 함께 들어간다', () => {
  const p = buildScriptPrompt({ title: 'x', unknowns: ['그가 왜 왔는지'] });
  assert.ok(p.includes('그가 왜 왔는지'));
  assert.ok(p.includes('[UNKNOWN]'));
});

test('스키마가 strict 요건을 지킨다', () => {
  // strict: true 를 쓰려면 additionalProperties: false 와 required 가 있어야 한다.
  for (const [name, schema] of [
    ['COLLECT_SCHEMA', COLLECT_SCHEMA],
    ['SCORE_SCHEMA', SCORE_SCHEMA],
  ]) {
    assert.equal(schema.additionalProperties, false, `${name} 에 additionalProperties:false 가 없다`);
    assert.ok(Array.isArray(schema.required) && schema.required.length, `${name} 에 required 가 없다`);
  }
});

// ─────────────────────────────────────────────────────────────
section('4. 대본 검증 — AI가 양식을 어겼을 때 잡아내는가');

/** 양식을 지킨 대본을 만든다. 글자 수를 채워 분량 경고를 피한다. */
function goodScript() {
  const filler = '기록에 남은 내용은 여기까지였다. 그 뒤의 일은 문서로 확인되지 않는다. ';
  const lines = [];
  for (const s of SECTIONS) {
    lines.push(`## [${s.key}] ${s.label}`);
    lines.push(`[FACT] 1987년 11월 그 호텔에서 일어난 일이다. ${filler.repeat(2)}`);
    lines.push(`[UNKNOWN] 확인되지 않은 부분이 남아 있다. ${filler}`);
    lines.push('');
  }
  return lines.join('\n');
}

test('양식을 지킨 대본은 통과한다', () => {
  const r = validateScript(goodScript());
  assert.equal(r.ok, true, `오류: ${r.errors.join(' | ')}`);
  assert.equal(r.stats.sectionsFound, SECTIONS.length);
  assert.ok(r.stats.tagCounts.FACT > 0);
});

test('섹션이 빠지면 잡아낸다', () => {
  const broken = goodScript().replace(/## \[TWIST\][\s\S]*?(?=## \[OUR_READING\])/, '');
  const r = validateScript(broken);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('TWIST')));
});

test('우리 해석 섹션이 빠지면 잡아낸다', () => {
  // 유튜브 비정품 콘텐츠 정책 대응 섹션이다. 빠지면 반드시 걸려야 한다.
  const broken = goodScript().replace(/## \[OUR_READING\][\s\S]*?(?=## \[EXPLAIN\])/, '');
  const r = validateScript(broken);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('OUR_READING')));
});

test('태그 없는 문단을 잡아낸다', () => {
  // 가장 위험한 실패다. 태그가 없으면 추측이 사실로 섞인다.
  const broken = goodScript() + '\n이 문단에는 태그가 없습니다. 그래서 걸려야 합니다.\n';
  const r = validateScript(broken);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('태그가 없는 문단')));
});

test('FACT 문단이 하나도 없으면 잡아낸다', () => {
  const noFact = goodScript().replace(/\[FACT\]/g, '[THEORY]');
  const r = validateScript(noFact);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('[FACT]')));
});

test('인사말을 잡아낸다', () => {
  for (const greeting of [
    '[FACT] 안녕하세요 오늘의 사건입니다.',
    '[FACT] 여러분이 아는 그 사건입니다.',
    '[FACT] 구독과 좋아요 부탁드립니다.',
  ]) {
    const r = validateScript(goodScript() + '\n' + greeting + '\n');
    assert.equal(r.ok, false, `잡아내지 못함: ${greeting}`);
    assert.ok(r.errors.some((e) => e.includes('쓰지 않기로 한 표현')));
  }
});

test('섹션 순서가 바뀌면 잡아낸다', () => {
  const lines = goodScript().split('\n');
  // HOOK 블록과 CASE 블록의 제목을 서로 바꾼다.
  const out = lines.map((l) =>
    l.startsWith('## [HOOK]') ? '## [CASE] 사건 소개' : l.startsWith('## [CASE]') ? '## [HOOK] 훅' : l
  );
  const r = validateScript(out.join('\n'));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('순서')));
});

test('나레이션이 짧으면 경고한다 (오류는 아니다)', () => {
  const short = SECTIONS.map((s) => `## [${s.key}] ${s.label}\n[FACT] 짧다.`).join('\n');
  const r = validateScript(short);
  assert.equal(r.ok, true, '분량은 오류가 아니라 경고여야 한다');
  assert.ok(r.warnings.some((w) => w.includes('짧습니다')));
});

test('태그와 제목을 뺀 글자 수만 센다', () => {
  const one = '## [HOOK] 훅\n[FACT] 가나다라마바사\n';
  const r = validateScript(one);
  // "가나다라마바사" 7자만 세야 한다. [FACT] 나 ## [HOOK] 훅 은 빼고.
  assert.equal(r.stats.narrationChars, 7);
});

test('빈 대본에도 죽지 않는다', () => {
  for (const input of ['', null, undefined]) {
    const r = validateScript(input);
    assert.equal(r.ok, false);
  }
});

test('모든 태그 이름이 검증기와 프롬프트에서 같다', () => {
  const p = buildScriptPrompt({ title: 'x' });
  for (const t of TAGS) {
    assert.ok(p.includes(`[${t}]`), `프롬프트에 [${t}] 설명이 없다`);
  }
});

// ─────────────────────────────────────────────────────────────
section('5. 저장소');

test('소재를 보관함에 넣고 다시 읽는다', () => {
  const item = makeItem({
    title: '보관함 테스트 소재',
    summary: '요약',
    fact_status: 'CONFIRMED',
    sources: [
      { url: 'https://a.example', name: 'A', kind: 'PRIMARY' },
      { url: 'https://b.example', name: 'B', kind: 'PRIMARY' },
    ],
    ...fullScores,
  });
  store.saveToInbox(item);
  const list = store.listInbox();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, '보관함 테스트 소재');
  assert.ok(list[0]._file.endsWith('.json'));
});

test('보관함은 점수 높은 순으로 정렬된다', () => {
  const low = makeItem({
    title: '낮은 점수 소재',
    fact_status: 'CONFIRMED',
    sources: [{ url: 'https://c.example', name: 'C' }, { url: 'https://d.example', name: 'D' }],
    interesting_score: 5,
  });
  store.saveToInbox(low);
  const list = store.listInbox();
  assert.ok(list[0].final_score >= list[list.length - 1].final_score);
});

test('파일명에 쓸 수 없는 문자가 있어도 저장된다', () => {
  const nasty = makeItem({
    title: 'a/b\\c:d*e?f"g<h>i|j',
    fact_status: 'CONFIRMED',
    sources: [{ url: 'https://e.example', name: 'E' }, { url: 'https://f.example', name: 'F' }],
  });
  const file = store.saveToInbox(nasty);
  assert.ok(fs.existsSync(file));
});

test('콘텐츠로 올리면 번호가 붙고 상태가 SELECTED가 된다', () => {
  const item = store.listInbox()[0];
  const { id, research } = store.promoteToContent(item);
  assert.match(id, /^\d{3}$/);
  assert.equal(research.status, 'SELECTED');
  assert.equal(research.content_id, id);
  assert.ok(fs.existsSync(store.contentPath(id, 'research.json')));
});

test('콘텐츠 번호는 001부터 하나씩 늘어난다', () => {
  const before = store.listContent().length;
  const item = store.listInbox()[1];
  const { id } = store.promoteToContent(item);
  assert.equal(Number(id), before + 1);
});

test('모르는 상태값은 거부한다', () => {
  const id = store.listContent()[0].id;
  assert.throws(() => store.setStatus(id, 'TOTALLY_MADE_UP'), /모르는 상태/);
  // 기획서 17번의 값은 모두 받아야 한다.
  for (const s of STATUS) store.setStatus(id, s);
});

test('양식을 통과한 대본은 SCRIPT_READY가 된다', () => {
  const id = store.listContent()[0].id;
  const check = validateScript(goodScript());
  store.saveScript(id, goodScript(), check);
  assert.equal(store.loadContent(id).research.status, 'SCRIPT_READY');
  assert.ok(store.loadContent(id).script.includes('[OUR_READING]'));
});

test('양식을 통과하지 못한 대본은 SCRIPT_READY로 올리지 않는다', () => {
  // 이게 중요하다. 깨진 대본이 다음 Phase로 조용히 넘어가면 안 된다.
  const id = store.listContent()[1].id;
  const broken = '## [HOOK] 훅\n태그 없는 문단';
  const check = validateScript(broken);
  assert.equal(check.ok, false);
  store.saveScript(id, broken, check);
  assert.equal(store.loadContent(id).research.status, 'SCRIPTING');
});

test('이미 다룬 제목 목록에 보관함과 콘텐츠가 모두 들어간다', () => {
  const titles = store.knownTitles();
  assert.ok(titles.includes('보관함 테스트 소재'));
  assert.ok(titles.length >= 2);
});

test('없는 콘텐츠를 읽으면 null을 돌려준다', () => {
  assert.equal(store.loadContent('999'), null);
});

// ─────────────────────────────────────────────────────────────
section('6. 모델별 파라미터 분기 — 400 오류를 막는 부분');

const { tuningFor, canForceTool } = await import('../src/ai/client.mjs');

test('Opus 5.5는 도구를 강제할 수 없다', () => {
  // 강제하면 400이 난다. 이걸 틀리면 심사 단계가 통째로 깨진다.
  assert.equal(canForceTool('claude-opus-5-5'), false);
  assert.equal(canForceTool('claude-sonnet-5-5'), false);
});

test('Sonnet 5와 Haiku 4.5는 도구를 강제할 수 있다', () => {
  assert.equal(canForceTool('claude-sonnet-5'), true);
  assert.equal(canForceTool('claude-haiku-4-5'), true);
});

test('Haiku에는 budget_tokens를 주고 effort를 주지 않는다', () => {
  const t = tuningFor('claude-haiku-4-5', { effort: 'high', maxTokens: 8000 });
  assert.ok(t.thinking?.budget_tokens > 0);
  assert.equal(t.output_config, undefined, 'Haiku에 effort를 주면 오류가 난다');
});

await asyncTest('모든 AI 호출이 스트리밍을 쓴다', async () => {
  // 실제로 돈을 쓴 실패를 막는 테스트다.
  //
  // max_tokens가 크면 SDK가 논스트리밍 요청을 아예 거부한다:
  //   "Streaming is required for operations that may take longer than 10 minutes"
  // 첫 실행이 이것 때문에 6초 만에 죽었다. 호출 경로가 하나라도 create()를
  // 쓰고 있으면 여기서 걸리게 한다.
  const client = await import('../src/ai/client.mjs');

  const calls = { stream: 0, create: 0 };
  const fakeResponse = {
    stop_reason: 'end_turn',
    content: [
      { type: 'text', text: '안녕' },
      { type: 'tool_use', name: 'probe', input: { ok: true } },
    ],
    usage: { input_tokens: 1, output_tokens: 1 },
  };

  client.__setClientForTest({
    messages: {
      stream: () => {
        calls.stream++;
        return { finalMessage: async () => fakeResponse };
      },
      create: async () => {
        calls.create++;
        return fakeResponse;
      },
    },
  });

  try {
    await client.callWithSearch({ system: 's', prompt: 'p', maxTokens: 24000 });
    await client.callForText({ system: 's', prompt: 'p' });
    await client.callForJson({
      system: 's',
      prompt: 'p',
      toolName: 'probe',
      description: 'd',
      schema: { type: 'object', additionalProperties: false, required: [], properties: {} },
    });
  } finally {
    client.__setClientForTest(null);
    client.resetUsage();
  }

  assert.equal(calls.create, 0, `논스트리밍 create()를 ${calls.create}번 썼다 — 긴 호출에서 400이 난다`);
  assert.equal(calls.stream, 3, `스트리밍 호출이 3번이어야 한다 (실제 ${calls.stream}번)`);
});

test('최신 모델에는 adaptive와 effort를 준다', () => {
  for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5']) {
    const t = tuningFor(model, { effort: 'high' });
    assert.equal(t.thinking.type, 'adaptive', `${model}`);
    assert.equal(t.output_config.effort, 'high', `${model}`);
    assert.equal(t.thinking.budget_tokens, undefined, `${model} 에 budget_tokens를 주면 400이 난다`);
  }
});

// ─────────────────────────────────────────────────────────────
section('7. 대본 파서 — 글자를 하나도 잃지 않는가');

const { parseScript, narrationFingerprint } = await import('../src/scenes/parse.mjs');
const { splitIntoScenes, groupIntoScenes, planShots, TARGET_SCENES_MIN, TARGET_SCENES_MAX, SHOT_SECONDS_MAX } =
  await import('../src/scenes/split.mjs');
const { countNarrationChars, charsForMinutes, NARRATION_CHARS_PER_MINUTE } = await import(
  '../src/narration.mjs'
);

/** 섹션마다 문단 n개를 넣은 대본. 길이를 조절해 여러 경우를 본다. */
function fakeScript(paragraphsPerSection = 3) {
  const filler = '당시 기록에 남은 내용은 여기까지였고 그 뒤의 일은 어떤 문서로도 확인되지 않았다';
  const lines = [];
  for (const s of SECTIONS) {
    lines.push(`## [${s.key}] ${s.label}`);
    for (let i = 0; i < paragraphsPerSection; i++) {
      lines.push(`[${TAGS[i % TAGS.length]}] ${s.key} 문단 ${i + 1}입니다. ${filler}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

test('대본을 섹션과 태그 문단으로 읽는다', () => {
  const p = parseScript(fakeScript(2));
  assert.equal(p.problems.length, 0, p.problems.join(' | '));
  assert.equal(p.sections.length, SECTIONS.length);
  assert.equal(p.paragraphs.length, SECTIONS.length * 2);
  assert.equal(p.sections[0].key, 'HOOK');
  assert.ok(p.totalChars > 0);
  assert.ok(p.totalSeconds > 0);
});

test('태그 없는 문단을 문제로 잡는다', () => {
  const p = parseScript(fakeScript(1) + '\n태그 없는 문단입니다.\n');
  assert.ok(p.problems.some((x) => x.includes('태그가 없는')));
});

test('섹션 제목보다 먼저 나온 문단을 잡는다', () => {
  const p = parseScript('[FACT] 섹션보다 먼저 나왔습니다.\n' + fakeScript(1));
  assert.ok(p.problems.some((x) => x.includes('먼저 나온')));
});

test('태그만 있고 내용이 없는 줄을 잡는다', () => {
  const p = parseScript('## [HOOK] 훅\n[FACT]\n');
  assert.ok(p.problems.some((x) => x.includes('내용이 없는')));
});

test('빈 대본에도 죽지 않는다', () => {
  for (const input of ['', null, undefined]) {
    const p = parseScript(input);
    assert.ok(p.problems.length > 0);
    assert.equal(p.paragraphs.length, 0);
  }
});

test('나레이션 속도가 대본 작성과 장면 분할에서 같은 값이다', () => {
  // 이게 어긋나면 "4분으로 쓴 대본이 장면 합계 5분"이 되는 버그가 생긴다.
  assert.equal(charsForMinutes(4), NARRATION_CHARS_PER_MINUTE * 4);
  const p = parseScript(fakeScript(3));
  const expected = (p.totalChars * 60) / NARRATION_CHARS_PER_MINUTE;
  assert.ok(Math.abs(p.totalSeconds - expected) < 1, `${p.totalSeconds} vs ${expected}`);
});

test('공백은 글자 수에서 빼고 센다', () => {
  assert.equal(countNarrationChars('가 나 다'), 3);
  assert.equal(countNarrationChars('가나다'), 3);
  assert.equal(countNarrationChars('  '), 0);
});

// ─────────────────────────────────────────────────────────────
section('8. 장면 분할 — 코드가 하고, 나레이션을 바꾸지 않는가');

test('장면으로 쪼개도 나레이션이 원문과 똑같다', () => {
  // 이게 Phase 2에서 가장 중요한 규칙이다.
  // 사람이 승인한 대본과 영상에서 읽히는 말이 달라지면 승인이 무의미해진다.
  for (const n of [1, 2, 3, 5, 8]) {
    const md = fakeScript(n);
    const parsed = parseScript(md);
    const r = splitIntoScenes(md);
    assert.equal(r.problems.length, 0, `문단 ${n}개: ${r.problems.join(' | ')}`);
    assert.equal(
      narrationFingerprint(r.scenes.flatMap((s) => s.paragraphs)),
      narrationFingerprint(parsed),
      `문단 ${n}개에서 나레이션이 바뀌었다`
    );
  }
});

test('문단을 하나도 잃지 않는다', () => {
  const md = fakeScript(4);
  const parsed = parseScript(md);
  const r = splitIntoScenes(md);
  const inScenes = r.scenes.reduce((sum, s) => sum + s.paragraphs.length, 0);
  assert.equal(inScenes, parsed.paragraphs.length);
});

test('문단 순서가 유지된다', () => {
  const md = fakeScript(3);
  const parsed = parseScript(md);
  const r = splitIntoScenes(md);
  const flat = r.scenes.flatMap((s) => s.paragraphs.map((p) => p.text));
  assert.deepEqual(flat, parsed.paragraphs.map((p) => p.text));
});

test('보통 길이 대본은 장면이 12~15개가 된다', () => {
  for (const n of [2, 3, 4, 5]) {
    const r = splitIntoScenes(fakeScript(n));
    assert.ok(
      r.stats.sceneCount >= TARGET_SCENES_MIN && r.stats.sceneCount <= TARGET_SCENES_MAX,
      `문단 ${n}개 → 장면 ${r.stats.sceneCount}개 (12~15를 벗어남)`
    );
    assert.equal(r.stats.outsideTargetRange, false);
  }
});

test('섹션 수보다 적은 장면은 만들 수 없다고 표시한다', () => {
  // 섹션 9개 × 문단 1개면 장면이 9개가 물리적 최소치다. 오류가 아니라 알림이다.
  const r = splitIntoScenes(fakeScript(1));
  assert.equal(r.stats.sceneCount, SECTIONS.length);
  assert.equal(r.stats.outsideTargetRange, true);
  assert.equal(r.problems.length, 0, '범위를 벗어난 건 오류가 아니어야 한다');
});

test('장면이 섹션 경계를 넘지 않는다', () => {
  const r = splitIntoScenes(fakeScript(4));
  for (const scene of r.scenes) {
    const sections = new Set(scene.paragraphs.map((p) => p.text.split(' ')[0]));
    assert.equal(sections.size, 1, `장면 ${scene.scene_number}에 여러 섹션이 섞였다`);
  }
});

test('샷은 8초를 넘지 않는다', () => {
  const r = splitIntoScenes(fakeScript(5));
  for (const scene of r.scenes) {
    for (const shot of scene.shots) {
      assert.ok(shot.duration <= SHOT_SECONDS_MAX + 0.01, `${shot.shot_id} = ${shot.duration}초`);
    }
  }
});

test('샷 길이 합계가 장면 길이와 같다', () => {
  const r = splitIntoScenes(fakeScript(4));
  for (const scene of r.scenes) {
    const sum = scene.shots.reduce((s, x) => s + x.duration, 0);
    assert.ok(Math.abs(sum - scene.duration) < 0.1, `장면 ${scene.scene_number}: ${sum} vs ${scene.duration}`);
  }
});

test('샷 번호가 겹치지 않는다', () => {
  const r = splitIntoScenes(fakeScript(4));
  const ids = r.scenes.flatMap((s) => s.shots.map((x) => x.shot_id));
  assert.equal(new Set(ids).size, ids.length);
});

test('깨진 대본으로는 장면을 만들지 않는다', () => {
  const r = splitIntoScenes('## [HOOK] 훅\n태그 없는 문단');
  assert.ok(r.problems.length > 0);
  assert.equal(r.scenes.length, 0);
});

test('planShots는 길이를 고르게 나눈다', () => {
  const shots = planShots(20, 3);
  assert.equal(shots.length, 3);
  assert.ok(shots.every((s) => Math.abs(s.duration - 20 / 3) < 0.02));
  assert.equal(shots[0].shot_id, 'S03-1');
  assert.deepEqual(planShots(0), []);
});

// ─────────────────────────────────────────────────────────────
section('9. 이미지/영상 배분 — 코드가 예산을 지키는가');

const {
  assignAssetTypes,
  assignSound,
  estimateCost,
  ASSET_TYPE,
  MAX_VIDEO_SHOTS,
  MAX_SFX_SCENE_RATIO,
  MOOD_SOUND,
} = await import('../src/scenes/assets.mjs');

/** 화면 설계가 끝난 상태의 가짜 장면들. */
function designedScenes({ realPersonShots = 0, noVideoPrompt = 0 } = {}) {
  const r = splitIntoScenes(fakeScript(4));
  let realLeft = realPersonShots;
  let noVidLeft = noVideoPrompt;
  const moods = ['mystery', 'tension', 'twist', 'record', 'calm', 'somber'];
  return r.scenes.map((scene, si) => ({
    ...scene,
    mood: moods[si % moods.length],
    visual_description: '설명',
    shots: scene.shots.map((shot, i) => {
      const real = realLeft-- > 0;
      const noVid = noVidLeft-- > 0;
      return {
        ...shot,
        image_prompt: 'an empty hotel lobby at night',
        video_prompt: noVid ? '' : 'a door slowly opens',
        camera: 'zoom in',
        // 뒤쪽 샷에 높은 점수를 준다 — 점수순으로 뽑히는지 보려고.
        motion_need: (si * 3 + i) % 11,
        depicts_real_person: real,
      };
    }),
  }));
}

test('영상 비중을 지킨다', () => {
  const scenes = designedScenes();
  const total = scenes.flatMap((s) => s.shots).length;
  for (const ratio of [0, 0.15, 0.3, 0.5]) {
    const out = assignAssetTypes(scenes, { videoRatio: ratio });
    const videos = out.flatMap((s) => s.shots).filter((x) => x.asset_type === ASSET_TYPE.VIDEO);
    assert.ok(videos.length <= Math.floor(total * ratio), `비중 ${ratio}: ${videos.length}개`);
  }
});

test('영상 비중 0이면 전부 이미지다', () => {
  const out = assignAssetTypes(designedScenes(), { videoRatio: 0 });
  assert.ok(out.flatMap((s) => s.shots).every((x) => x.asset_type === ASSET_TYPE.IMAGE));
});

test('비중을 1로 줘도 절대 상한을 넘지 않는다', () => {
  // AI가 뭘 하든 편당 영상 비용의 상한이 보장되어야 한다.
  const out = assignAssetTypes(designedScenes(), { videoRatio: 1 });
  const videos = out.flatMap((s) => s.shots).filter((x) => x.asset_type === ASSET_TYPE.VIDEO);
  assert.ok(videos.length <= MAX_VIDEO_SHOTS, `${videos.length} > ${MAX_VIDEO_SHOTS}`);
});

test('이상한 비중 값에도 죽지 않는다', () => {
  for (const bad of [NaN, -1, 'abc', undefined, null]) {
    const out = assignAssetTypes(designedScenes(), { videoRatio: bad });
    assert.ok(out.flatMap((s) => s.shots).every((x) => x.asset_type));
  }
});

test('실존 인물이 보이는 샷은 무조건 이미지다', () => {
  // 비용 문제가 아니라 안전 문제라 예산보다 먼저 적용되어야 한다.
  const scenes = designedScenes({ realPersonShots: 5 });
  const out = assignAssetTypes(scenes, { videoRatio: 1 });
  for (const shot of out.flatMap((s) => s.shots)) {
    if (shot.depicts_real_person) {
      assert.equal(shot.asset_type, ASSET_TYPE.IMAGE, `${shot.shot_id}이 영상으로 배정됐다`);
    }
  }
});

test('영상 프롬프트가 없는 샷은 영상으로 뽑지 않는다', () => {
  const out = assignAssetTypes(designedScenes({ noVideoPrompt: 6 }), { videoRatio: 1 });
  for (const shot of out.flatMap((s) => s.shots)) {
    if (!shot.video_prompt) assert.equal(shot.asset_type, ASSET_TYPE.IMAGE);
  }
});

test('움직임이 더 필요한 샷부터 영상으로 뽑는다', () => {
  const scenes = designedScenes();
  const out = assignAssetTypes(scenes, { videoRatio: 0.15 });
  const shots = out.flatMap((s) => s.shots);
  const videos = shots.filter((x) => x.asset_type === ASSET_TYPE.VIDEO);
  const images = shots.filter((x) => x.asset_type === ASSET_TYPE.IMAGE && x.video_prompt);
  const minVideo = Math.min(...videos.map((x) => x.motion_need));
  const maxImage = Math.max(...images.map((x) => x.motion_need));
  assert.ok(minVideo >= maxImage, `영상 최저 ${minVideo} < 이미지 최고 ${maxImage}`);
});

test('영상 샷에도 대체용 이미지 프롬프트가 남아 있다', () => {
  // 기획서 9번: AI 영상 생성 실패 시 이미지 + 카메라 움직임으로 대체한다.
  const out = assignAssetTypes(designedScenes(), { videoRatio: 0.3 });
  for (const shot of out.flatMap((s) => s.shots)) {
    if (shot.asset_type === ASSET_TYPE.VIDEO) {
      assert.equal(shot.fallback, ASSET_TYPE.IMAGE);
      assert.ok(shot.image_prompt, `${shot.shot_id}에 대체 이미지 프롬프트가 없다`);
      assert.ok(shot.camera, `${shot.shot_id}에 카메라 움직임이 없다`);
    }
  }
});

test('효과음을 과도하게 쓰지 않는다', () => {
  // 기획서 13번: "단, 과도하게 사용하지 않는다"
  const out = assignSound(designedScenes());
  const withSfx = out.filter((s) => s.sound_effect).length;
  assert.ok(
    withSfx <= Math.max(1, Math.floor(out.length * MAX_SFX_SCENE_RATIO)),
    `${withSfx}/${out.length} 장면에 효과음이 들어갔다`
  );
});

test('모든 장면에 BGM이 배정된다', () => {
  const out = assignSound(designedScenes());
  assert.ok(out.every((s) => s.bgm), 'BGM 없는 장면이 있다');
});

test('모르는 분위기에도 죽지 않는다', () => {
  const scenes = designedScenes().map((s) => ({ ...s, mood: '아무말' }));
  const out = assignSound(scenes);
  assert.ok(out.every((s) => s.bgm));
});

test('반전 장면이 효과음 우선순위를 갖는다', () => {
  const scenes = designedScenes();
  const twistIdx = scenes.findIndex((s) => s.mood === 'twist');
  assert.ok(twistIdx > -1, '테스트 데이터에 twist 장면이 있어야 한다');
  const out = assignSound(scenes);
  assert.equal(out[twistIdx].sound_effect, MOOD_SOUND.twist.sfx);
});

test('비용 계산에 영상 샷의 대체 이미지도 들어간다', () => {
  const out = assignAssetTypes(designedScenes(), { videoRatio: 0.15 });
  const shots = out.flatMap((s) => s.shots);
  const cost = estimateCost(out);
  // 영상 샷도 대체용 이미지를 뽑으므로 이미지 수 = 전체 샷 수
  assert.equal(cost.imageCount, shots.length);
  assert.ok(cost.totalUsd > 0);
  assert.ok(cost.videoSeconds > 0);
});

test('전부 이미지면 영상 비용이 0이다', () => {
  const cost = estimateCost(assignAssetTypes(designedScenes(), { videoRatio: 0 }));
  assert.equal(cost.videoUsd, 0);
  assert.equal(cost.videoCount, 0);
});

// ─────────────────────────────────────────────────────────────
section('10. 불편한 화면 차단 — 보는 사람을 지키는가');

const {
  checkPrompts,
  composeImagePrompt,
  buildVisualsPrompt,
  mergeVisuals,
  STYLE_SUFFIX,
  NEGATIVE_SUFFIX,
  VISUALS_SCHEMA,
} = await import('../src/scenes/visuals.mjs');

test('시체·피·상처가 들어간 프롬프트를 잡아낸다', () => {
  const bad = [
    'a bloodstained hotel carpet',
    'a corpse lying on the floor',
    'a wounded man in the hallway',
    'a terrified face in the dark',
    'a dead body covered with a sheet',
    'a zombie walking down the corridor',
  ];
  for (const prompt of bad) {
    const r = checkPrompts([{ shot_id: 'S01-1', image_prompt: prompt, video_prompt: '' }]);
    assert.equal(r.ok, false, `잡아내지 못함: ${prompt}`);
    assert.ok(r.violations[0].word);
  }
});

test('영상 프롬프트도 함께 검사한다', () => {
  const r = checkPrompts([
    { shot_id: 'S01-1', image_prompt: 'an empty room', video_prompt: 'blood dripping slowly' },
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].field, 'video_prompt');
});

test('괜찮은 프롬프트는 통과시킨다', () => {
  const good = [
    'an empty hotel corridor at night, a single lamp still on',
    'a half-open door with keys left on the floor',
    'a stopped clock on a bare wall',
    'an untouched dinner table, chairs pushed back',
    'yellowed newspaper clippings spread on a desk',
  ];
  const r = checkPrompts(good.map((p, i) => ({ shot_id: `S01-${i}`, image_prompt: p, video_prompt: '' })));
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('빈 입력에도 죽지 않는다', () => {
  for (const input of [[], null, undefined, [{}]]) {
    assert.equal(checkPrompts(input).ok, true);
  }
});

test('완성된 프롬프트에 고정 스타일과 금지 목록이 붙는다', () => {
  const p = composeImagePrompt('an empty hotel lobby');
  assert.ok(p.includes('an empty hotel lobby'));
  assert.ok(p.includes(STYLE_SUFFIX));
  assert.ok(p.includes(NEGATIVE_SUFFIX));
  // 기획서 10번: 1990년대 TV 재연 느낌
  assert.ok(STYLE_SUFFIX.includes('reenactment') || STYLE_SUFFIX.includes('reconstruction'));
  // 실존 인물 금지가 들어 있어야 한다
  assert.ok(NEGATIVE_SUFFIX.includes('identifiable'));
});

test('화면 설계 프롬프트에 태그별 지시가 들어간다', () => {
  const r = splitIntoScenes(fakeScript(4));
  const scene = r.scenes.find((s) => s.tags.includes('UNKNOWN')) || r.scenes[0];
  const p = buildVisualsPrompt(scene, { item: { title: '테스트 사건' }, totalScenes: r.scenes.length });
  assert.ok(p.includes('테스트 사건'));
  assert.ok(p.includes(scene.shots[0].shot_id));
  assert.ok(p.includes('시체'), '금지 지시가 프롬프트에 있어야 한다');
  for (const s of scene.shots) assert.ok(p.includes(s.shot_id));
});

test('화면 설계를 샷에 합친다', () => {
  const r = splitIntoScenes(fakeScript(3));
  const scene = r.scenes[0];
  const design = {
    mood: 'tension',
    visual_description: '빈 복도',
    shots: scene.shots.map((s) => ({
      shot_id: s.shot_id,
      image_prompt: 'an empty corridor',
      video_prompt: 'a door opens',
      camera: 'pan left',
      motion_need: 7,
      depicts_real_person: false,
    })),
  };
  const m = mergeVisuals(scene, design);
  assert.equal(m.problems.length, 0);
  assert.equal(m.scene.mood, 'tension');
  assert.ok(m.scene.shots[0].image_prompt.includes('an empty corridor'));
  assert.ok(m.scene.shots[0].image_prompt.includes(STYLE_SUFFIX));
  assert.equal(m.scene.shots[0].camera, 'pan left');
  assert.equal(m.scene.shots[0].motion_need, 7);
});

test('설계가 빠진 샷을 문제로 알린다', () => {
  const r = splitIntoScenes(fakeScript(3));
  const scene = r.scenes.find((s) => s.shots.length > 1) || r.scenes[0];
  const m = mergeVisuals(scene, { mood: 'mystery', visual_description: '', shots: [] });
  assert.ok(m.problems.length >= scene.shots.length);
});

test('없는 샷 번호가 돌아오면 알린다', () => {
  const r = splitIntoScenes(fakeScript(3));
  const scene = r.scenes[0];
  const m = mergeVisuals(scene, {
    mood: 'mystery',
    visual_description: '',
    shots: [
      ...scene.shots.map((s) => ({
        shot_id: s.shot_id, image_prompt: 'x', video_prompt: '', camera: 'zoom in',
        motion_need: 1, depicts_real_person: false,
      })),
      { shot_id: 'S99-9', image_prompt: 'y', video_prompt: '', camera: 'zoom in', motion_need: 1, depicts_real_person: false },
    ],
  });
  assert.ok(m.problems.some((p) => p.includes('S99-9')));
});

test('모르는 카메라 움직임은 기본값으로 바꾼다', () => {
  const r = splitIntoScenes(fakeScript(3));
  const scene = r.scenes[0];
  const m = mergeVisuals(scene, {
    mood: 'mystery',
    visual_description: '',
    shots: scene.shots.map((s) => ({
      shot_id: s.shot_id, image_prompt: 'x', video_prompt: '', camera: '빙글빙글',
      motion_need: 99, depicts_real_person: false,
    })),
  });
  assert.equal(m.scene.shots[0].camera, 'zoom in');
  assert.equal(m.scene.shots[0].motion_need, 10, '범위를 넘는 점수는 깎아야 한다');
});

test('화면 설계 스키마가 strict 요건을 지킨다', () => {
  assert.equal(VISUALS_SCHEMA.additionalProperties, false);
  assert.ok(VISUALS_SCHEMA.required.length);
  assert.equal(VISUALS_SCHEMA.properties.shots.items.additionalProperties, false);
});

// ─────────────────────────────────────────────────────────────
section('11. 장면 저장');

test('장면과 프롬프트를 두 파일로 저장한다', () => {
  const id = store.listContent()[0].id;
  const scenes = assignSound(assignAssetTypes(designedScenes(), { videoRatio: 0.15 }));
  const split = splitIntoScenes(fakeScript(4));
  store.saveScenes(id, { scenes, stats: split.stats, problems: [], cost: estimateCost(scenes) });

  assert.ok(fs.existsSync(store.contentPath(id, 'scenes.json')));
  assert.ok(fs.existsSync(store.contentPath(id, 'prompts.json')));
  assert.equal(store.loadContent(id).research.status, 'SCENES_READY');

  const prompts = JSON.parse(fs.readFileSync(store.contentPath(id, 'prompts.json'), 'utf8'));
  const shotCount = scenes.flatMap((s) => s.shots).length;
  assert.equal(prompts.count, shotCount);
  assert.ok(prompts.prompts.every((p) => p.shot_id && p.asset_type && p.image_prompt));
});

test('문제가 남아 있으면 SCENES_READY로 올리지 않는다', () => {
  const id = store.listContent()[1].id;
  const scenes = assignSound(assignAssetTypes(designedScenes(), { videoRatio: 0.15 }));
  store.saveScenes(id, {
    scenes,
    stats: splitIntoScenes(fakeScript(4)).stats,
    problems: ['화면 설계가 없는 샷이 있습니다'],
  });
  assert.notEqual(store.loadContent(id).research.status, 'SCENES_READY');
});

// ─────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`통과 ${passed}건  실패 ${failed}건`);
console.log(`임시 폴더: ${TMP}`);
console.log('═'.repeat(60));

// 테스트가 만든 임시 폴더를 지운다.
fs.rmSync(TMP, { recursive: true, force: true });

if (failed) process.exit(1);
