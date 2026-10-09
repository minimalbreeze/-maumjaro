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
const { buildScriptPrompt, validateScript, sectionBody, SECTIONS, TAGS } = await import(
  '../src/script/write.mjs'
);
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

test('수집 프롬프트가 검색 예산을 알려준다', () => {
  // 첫 실제 실행에서 모델이 자기 검색 한도(6회)를 모른 채 후보를 넓게 벌려놓고
  // 검증에 들어갔다가 한도에 걸려 1건만 제출했다. 예산을 알려줘야 집중한다.
  const p = buildCollectPrompt({ count: 5, maxSearches: 20 });
  assert.ok(p.includes('검색 예산: 20회'), '검색 횟수가 프롬프트에 없다');
  assert.ok(p.includes('4~6회'), '소재당 드는 검색 횟수 안내가 없다');
  assert.ok(p.includes('바닥'), '예산이 바닥나는 상황에 대한 경고가 없다');
});

test('검색 예산이 적으면 집중할 소재 수도 줄어든다', () => {
  // 예산 6회면 (6-2)/5 = 0 → 최소 1건. 예산 20회면 (20-2)/5 = 3건.
  const tight = buildCollectPrompt({ count: 5, maxSearches: 6 });
  const roomy = buildCollectPrompt({ count: 5, maxSearches: 20 });
  assert.ok(tight.includes('1건 정도에 집중'), tight.split('\n').find((l) => l.includes('집중')));
  assert.ok(roomy.includes('3건 정도에 집중'), roomy.split('\n').find((l) => l.includes('집중')));
  // 요청 개수보다 많이 집중하라고 시키지 않는다
  const few = buildCollectPrompt({ count: 2, maxSearches: 40 });
  assert.ok(few.includes('2건 정도에 집중'));
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

await asyncTest('스키마에 API가 거부하는 옵션이 없다', async () => {
  // 실제로 돈을 쓴 실패를 막는 테스트다.
  //
  // 점수 항목에 minimum/maximum을 넣었더니 심사 단계가 400으로 통째로 죽었다:
  //   tools.0.custom: For 'integer' type, properties maximum, minimum are not supported
  //
  // 소재를 찾는 데 1분 40초와 토큰 9만 개를 쓴 뒤에 이걸로 실패했다.
  // 범위 제한은 코드(makeItem의 clamp, mergeVisuals의 clampInt)가 이미 하므로
  // 스키마에서는 설명으로만 적는다.
  //
  // 스키마 전체를 재귀로 훑어서 거부되는 조합이 하나라도 있으면 걸리게 한다.
  const { VISUALS_SCHEMA: VS } = await import('../src/scenes/visuals.mjs');

  // 타입별로 strict 도구가 받지 않는 키워드.
  const BANNED_BY_TYPE = {
    integer: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
    number: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
  };

  const problems = [];
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    const banned = BANNED_BY_TYPE[node.type];
    if (banned) {
      for (const key of banned) {
        if (key in node) problems.push(`${path}: '${node.type}' 타입에 ${key} 를 쓸 수 없다`);
      }
    }
    for (const [key, child] of Object.entries(node.properties || {})) {
      walk(child, `${path}.${key}`);
    }
    if (node.items) walk(node.items, `${path}[]`);
  };

  for (const [name, schema] of [
    ['COLLECT_SCHEMA', COLLECT_SCHEMA],
    ['SCORE_SCHEMA', SCORE_SCHEMA],
    ['VISUALS_SCHEMA', VS],
  ]) {
    walk(schema, name);
  }

  assert.deepEqual(problems, [], `\n     ${problems.join('\n     ')}`);
});

// ─────────────────────────────────────────────────────────────
test('소재를 지정하면 그것만 조사하는 프롬프트가 된다', () => {
  const p = buildCollectPrompt({ topic: '플래넌 제도 등대지기 실종', count: 5 });
  assert.ok(p.includes('플래넌 제도 등대지기 실종'));
  assert.ok(p.includes('이 하나만 조사'), p.slice(0, 80));
  assert.ok(p.includes('다른 후보를 찾지 마세요'));
  // 후보를 여러 개 찾으라는 말이 남아 있으면 안 된다.
  assert.ok(!p.includes('소재를 5건'), '여러 건 찾으라는 말이 남아 있다');
});

test('소재를 지정해도 검증을 건너뛰지 않는다', () => {
  // 사람이 골랐다는 이유로 원전 없는 괴담을 통과시키면 이 시스템의 의미가 없다.
  const p = buildCollectPrompt({ topic: '어떤 괴담' });
  assert.ok(p.includes('빈 목록을 제출'), '기준 미달일 때 빈 손으로 오라는 지시가 없다');
  assert.ok(p.includes('억지로 통과시키지 마세요'));
  assert.ok(p.includes('1차 기록'));
});

test('소재가 비어 있으면 평소대로 후보를 찾는다', () => {
  for (const topic of [null, '', '   ', undefined]) {
    const p = buildCollectPrompt({ topic, count: 3 });
    assert.ok(p.includes('소재를 3건'), `topic=${JSON.stringify(topic)} 일 때 평소 프롬프트가 아니다`);
    assert.ok(!p.includes('다른 후보를 찾지 마세요'));
  }
});

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

await asyncTest('제목 다음에 빈 줄이 있어도 HOOK 길이를 센다', async () => {
  // 실제로 돈을 쓴 실패를 막는 테스트다.
  //
  // 실행 #3에서 "HOOK 0자"로 찍혔다. 정규식에 m 플래그가 붙어 $ 가 "줄 끝"을
  // 뜻했고, 마크다운이 제목 다음에 빈 줄을 두므로 거의 항상 0자로 측정됐다.
  // 대본은 멀쩡했는데 측정이 틀렸고, 더 나쁘게는 HOOK이 진짜 비어 있어도
  // 못 잡아냈다.
  const withBlank = ['## [HOOK] 훅', '', '[FACT] 1987년 그 호텔에 남자가 들어왔다.', '', '## [CASE] 사건', '[FACT] 다음.'].join('\n');
  const withoutBlank = ['## [HOOK] 훅', '[FACT] 1987년 그 호텔에 남자가 들어왔다.', '## [CASE] 사건', '[FACT] 다음.'].join('\n');

  for (const [name, md] of [['빈 줄 있음', withBlank], ['빈 줄 없음', withoutBlank]]) {
    const body = sectionBody(md, 'HOOK');
    assert.equal(body.length, 1, `${name}: 문단 1개여야 한다`);
    assert.ok(body[0].includes('1987년'), `${name}: 내용이 다르다`);
    const r = validateScript(md);
    assert.ok(r.stats.hookChars > 0, `${name}: HOOK 글자 수가 0으로 나왔다`);
  }

  // 두 형태의 측정값이 같아야 한다 — 빈 줄은 읽히는 말에 영향을 주지 않는다.
  assert.equal(
    validateScript(withBlank).stats.hookChars,
    validateScript(withoutBlank).stats.hookChars
  );
});

test('HOOK이 비어 있으면 오류로 잡는다', () => {
  // 경고가 아니라 오류여야 한다. 기획서 22번: 첫 10초가 가장 중요하다.
  const emptyHook = SECTIONS.map((s) =>
    s.key === 'HOOK'
      ? `## [${s.key}] ${s.label}\n`
      : `## [${s.key}] ${s.label}\n[FACT] 내용이 있습니다.`
  ).join('\n');
  const r = validateScript(emptyHook);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('HOOK')), r.errors.join(' | '));
  assert.equal(r.stats.hookChars, 0);
});

test('HOOK이 너무 길면 경고한다', () => {
  const long = goodScript().replace(
    '## [HOOK] 훅',
    '## [HOOK] 훅\n[FACT] ' + '가'.repeat(200)
  );
  const r = validateScript(long);
  assert.ok(r.warnings.some((w) => w.includes('HOOK')), r.warnings.join(' | '));
});

test('sectionBody는 다른 섹션 내용을 섞지 않는다', () => {
  const md = goodScript();
  for (const s of SECTIONS) {
    const body = sectionBody(md, s.key);
    assert.ok(body.length > 0, `${s.key} 본문이 비었다`);
    assert.ok(
      body.every((l) => /^\[(FACT|RECONSTRUCTION|THEORY|UNKNOWN)\]/.test(l)),
      `${s.key} 본문에 제목이나 빈 줄이 섞였다`
    );
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
const { countNarrationChars, charsForMinutes, secondsForChars, NARRATION_CHARS_PER_MINUTE } = await import(
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

test('문장 끝 마침표가 있든 없든 점이 두 개 찍히지 않는다', () => {
  // 실행 #5에서 나온 것: "...a single empty bench.. documentary reenactment still"
  // AI가 마침표로 끝낼 때와 아닐 때가 섞여서 절반만 이랬다.
  for (const body of ['an empty bench', 'an empty bench.', 'an empty bench. ', 'an empty bench,']) {
    const out = composeImagePrompt(body);
    assert.ok(!out.includes('..'), `점이 두 개: ${out.slice(0, 60)}`);
    assert.ok(out.startsWith('an empty bench. '), out.slice(0, 40));
  }
  // 내용이 비어도 고정 문구는 온전해야 한다.
  assert.ok(!composeImagePrompt('').includes('..'));
  assert.ok(!composeImagePrompt('   ').startsWith('.'));
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

// ─────────────────────────────────────────────────────────────

section('12. 자막 — 유튜브 자막 자리를 비켜주는가, 글자가 안 잘리는가');

const {
  FORMATS,
  COLORS,
  assColor,
  emphasize,
  splitForScreen,
  splitWordsBalanced,
  wrapLines,
  assTime,
  buildCues,
  renderAss,
  buildAss,
  renderSrt,
  totalSeconds,
} = await import('../src/video/subtitle.mjs');

test('ASS 색상은 &HAABBGGRR 순서다 (RGB가 뒤집힌다)', () => {
  // 빨강(255,0,0) → BB=00 GG=00 RR=FF
  assert.equal(assColor({ r: 255, g: 0, b: 0 }), '&H000000FF');
  // 파랑(0,0,255) → BB=FF
  assert.equal(assColor({ r: 0, g: 0, b: 255 }), '&H00FF0000');
  assert.equal(COLORS.white, '&H00FFFFFF');
});

test('유튜브 자막 자리를 비운다 — 16:9는 240px, 쇼츠는 600px', () => {
  for (const format of [FORMATS.wide, FORMATS.shorts]) {
    const ass = renderAss([{ start: 0, end: 2, text: '시험' }], { format });
    const style = ass.split('\n').find((l) => l.startsWith('Style: Main'));
    const fields = style.split(',');
    // Alignment, MarginL, MarginR, MarginV, Encoding 이 마지막 다섯 칸이다.
    assert.equal(fields.at(-5), '2', `${format.name}: 하단 중앙 정렬이어야 한다`);
    assert.equal(Number(fields.at(-2)), format.marginV, `${format.name}: MarginV`);
    assert.ok(ass.includes(`PlayResY: ${format.height}`));
  }
  assert.equal(FORMATS.wide.marginV, 240);
  assert.equal(FORMATS.shorts.marginV, 600);
});

test('자동 줄바꿈을 끈다 — 한 줄 글자 수 계산이 무의미해지지 않게', () => {
  assert.ok(renderAss([], {}).includes('WrapStyle: 2'));
});

test('숫자를 노란 굵은 글씨로 강조하고 다음 글자에서 되돌린다', () => {
  const out = emphasize('세 명이 사라졌는데 외투는 두 벌만 없었다');
  assert.ok(out.includes(`{\\c${COLORS.yellow}\\b1}세 명`), out);
  assert.ok(out.includes(`{\\c${COLORS.white}\\b0}`), out);
  // 되돌림 태그 수가 강조 태그 수와 같아야 한다. 하나라도 빠지면
  // 그 뒤의 자막 전체가 노란 굵은 글씨로 남는다.
  const on = out.match(/\\b1}/g)?.length ?? 0;
  const off = out.match(/\\b0}/g)?.length ?? 0;
  assert.equal(on, off);
});

test('아라비아 숫자와 단위도 함께 강조한다', () => {
  const out = emphasize('1900년 12월 26일에 등대지기 3명이 사라졌다');
  for (const piece of ['1900년', '12월', '26일', '3명']) {
    assert.ok(out.includes(`\\b1}${piece}`), `${piece}가 강조되지 않았다: ${out}`);
  }
});

test('강조할 숫자가 없으면 글자를 건드리지 않는다', () => {
  assert.equal(emphasize('아무도 남지 않았다'), '아무도 남지 않았다');
});

test('한 줄 글자 수 상한을 넘지 않는다', () => {
  const long =
    '등대지기 세 명이 사라진 뒤 섬에 도착한 보급선 선원들은 문이 안쪽에서 ' +
    '잠겨 있지 않은 것을 발견했고 식탁 위에는 손대지 않은 식사가 그대로 놓여 있었다';
  for (const format of [FORMATS.wide, FORMATS.shorts]) {
    for (const chunk of splitForScreen(long, format)) {
      for (const line of wrapLines(chunk, format).split('\\N')) {
        assert.ok(
          countNarrationChars(line) <= format.maxCharsPerLine,
          `${format.name}: "${line}" (${countNarrationChars(line)}자 > ${format.maxCharsPerLine}자)`
        );
      }
      assert.ok(wrapLines(chunk, format).split('\\N').length <= format.maxLines);
    }
  }
});

test('어절을 가운데서 자르지 않는다', () => {
  const text = '보급선 선원들이 도착했을 때 등대는 비어 있었다';
  const joined = splitForScreen(text, FORMATS.shorts)
    .flatMap((c) => wrapLines(c, FORMATS.shorts).split('\\N'))
    .join(' ')
    .replace(/\s+/g, ' ');
  // 조각을 다시 붙이면 원문의 어절이 전부 온전히 남아 있어야 한다.
  for (const word of text.split(' ')) {
    assert.ok(joined.includes(word), `어절 "${word}"가 잘렸다: ${joined}`);
  }
});

test('어절 하나가 혼자 떨어지지 않는다 — 1초짜리 자막을 막는다', () => {
  // 예전 구현은 한 줄을 끝까지 채우고 남은 어절을 다음 조각에 혼자 두었다.
  const sentence =
    '1900년 12월 26일 보급선이 플래넌 제도 등대에 도착했지만 등대지기 세 명은 아무도 없었고 식탁에는 식사가 그대로 있었다';
  const chunks = splitWordsBalanced(sentence, FORMATS.shorts.maxCharsPerLine * FORMATS.shorts.maxLines);
  assert.ok(chunks.length >= 2, '쪼개져야 한다');
  const shortest = Math.min(...chunks.map((c) => countNarrationChars(c)));
  const longest = Math.max(...chunks.map((c) => countNarrationChars(c)));
  // 가장 짧은 조각이 가장 긴 조각의 1/4보다는 커야 한다.
  assert.ok(shortest > longest / 4, `조각 길이가 너무 들쭉날쭉하다: ${JSON.stringify(chunks)}`);
});

test('짧은 글은 쪼개지 않는다', () => {
  assert.deepEqual(splitForScreen('아무도 없었다', FORMATS.wide), ['아무도 없었다']);
});

test('빈 글에도 죽지 않는다', () => {
  for (const input of ['', '   ', null, undefined]) {
    assert.deepEqual(splitForScreen(input, FORMATS.wide), []);
  }
  assert.deepEqual(buildCues(null, {}), []);
  assert.equal(totalSeconds(null), 0);
});

test('ASS 시간 표기는 h:mm:ss.cc 다', () => {
  assert.equal(assTime(0), '0:00:00.00');
  assert.equal(assTime(1.5), '0:00:01.50');
  assert.equal(assTime(61.23), '0:01:01.23');
  assert.equal(assTime(3725.5), '1:02:05.50');
  // 음수가 들어와도 0으로 막는다. ASS는 음수 시간을 조용히 무시한다.
  assert.equal(assTime(-3), '0:00:00.00');
});

test('자막 큐가 겹치지 않고 순서대로 간다', () => {
  const cues = buildCues(videoScenes(), { format: FORMATS.wide });
  assert.ok(cues.length > 0);
  for (let i = 1; i < cues.length; i++) {
    assert.ok(
      cues[i].start >= cues[i - 1].start - 0.001,
      `큐 ${i}가 앞으로 갔다: ${cues[i - 1].start} → ${cues[i].start}`
    );
    assert.ok(cues[i - 1].end <= cues[i].start + 0.001, `큐 ${i - 1}과 ${i}가 겹친다`);
    assert.ok(cues[i].end > cues[i].start, `큐 ${i}의 길이가 0이다`);
  }
});

test('자막 전체 길이가 나레이션 길이와 맞는다', () => {
  const scenes = videoScenes();
  const cues = buildCues(scenes, { format: FORMATS.wide });
  assert.ok(Math.abs(cues.at(-1).end - totalSeconds(scenes)) < 0.5);
});

test('TTS 실제 타임스탬프를 주면 그걸 쓴다 (추정하지 않는다)', () => {
  const scenes = videoScenes();
  const count = scenes.flatMap((s) => s.paragraphs).length;
  // 문단마다 정확히 10초로 못 박는다.
  const timings = Array.from({ length: count }, (_, i) => ({ start: i * 10, end: i * 10 + 10 }));
  const cues = buildCues(scenes, { format: FORMATS.wide, paragraphTimings: timings });
  assert.equal(cues[0].start, 0);
  assert.ok(Math.abs(cues.at(-1).end - count * 10) < 0.001);
});

test('쇼츠 구간을 자르면 시작이 0초로 옮겨진다', () => {
  const scenes = videoScenes();
  const all = buildCues(scenes, { format: FORMATS.shorts });
  const range = { start: 30, end: 70 };
  const cut = buildCues(scenes, { format: FORMATS.shorts, range });
  assert.ok(cut.length > 0 && cut.length < all.length);
  assert.ok(cut[0].start >= 0 && cut[0].start < 1, `첫 큐가 0초에서 시작해야 한다: ${cut[0].start}`);
  assert.ok(cut.at(-1).end <= range.end - range.start + 0.001, '구간 밖으로 넘어갔다');
});

test('SRT에는 위치·색 태그가 들어가지 않는다', () => {
  const srt = renderSrt(buildCues(videoScenes(), { format: FORMATS.wide }));
  assert.ok(srt.includes('-->'));
  assert.ok(!srt.includes('\\c&H'), 'SRT에 ASS 색상 태그가 섞였다');
  assert.ok(!srt.includes('\\N'), 'SRT에 ASS 줄바꿈이 섞였다');
  assert.ok(/^1\n00:00:00,000 --> /.test(srt), srt.slice(0, 60));
});

test('대본 한 편으로 ASS 한 파일이 끝까지 만들어진다', () => {
  const ass = buildAss(videoScenes(), { format: FORMATS.wide });
  assert.ok(ass.includes('[Events]'));
  const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.ok(dialogues.length > 10, `자막 줄이 ${dialogues.length}개뿐이다`);
  // 모든 Dialogue 줄의 칸 수가 같아야 한다. 하나라도 틀리면 ASS 전체가 깨진다.
  for (const d of dialogues) {
    assert.ok(d.split(',').length >= 10, `칸이 모자란 자막 줄: ${d}`);
  }
});

// ─────────────────────────────────────────────────────────────

section('13. 편집 타임라인 — 영상과 소리가 어긋나지 않는가');

const { buildTimeline, DEFAULT_FPS } = await import('../src/video/plan.mjs');

test('샷마다 클립 하나를 만들고 시간을 이어 붙인다', () => {
  const scenes = videoScenes();
  const t = buildTimeline(scenes, { format: FORMATS.wide });
  assert.equal(t.clips.length, scenes.flatMap((s) => s.shots).length);
  assert.equal(t.width, 1920);
  assert.equal(t.height, 1080);
  assert.equal(t.fps, DEFAULT_FPS);
  assert.equal(t.clips[0].start, 0);
  for (let i = 1; i < t.clips.length; i++) {
    const prev = t.clips[i - 1];
    assert.ok(
      Math.abs(t.clips[i].start - (prev.start + prev.duration)) < 0.02,
      `클립 ${i}에 빈틈이나 겹침이 있다`
    );
  }
});

test('샷 길이 합계가 나레이션 길이와 맞는다 — 안 맞으면 문제로 잡는다', () => {
  const t = buildTimeline(videoScenes(), { format: FORMATS.wide });
  assert.equal(t.problems.length, 0, t.problems.join(' | '));
  assert.ok(Math.abs(t.duration - t.narration_seconds) <= 1);
});

test('길이가 어긋나면 조용히 넘기지 않는다', () => {
  const scenes = videoScenes().map((s, i) =>
    i === 0 ? { ...s, shots: s.shots.map((sh) => ({ ...sh, duration: sh.duration + 5 })) } : s
  );
  const t = buildTimeline(scenes, { format: FORMATS.wide });
  assert.ok(t.problems.some((p) => p.includes('어긋납니다')), t.problems.join(' | '));
});

test('길이가 0인 샷은 버리고 문제로 남긴다', () => {
  const scenes = videoScenes();
  scenes[0].shots[0] = { ...scenes[0].shots[0], duration: 0 };
  const t = buildTimeline(scenes, { format: FORMATS.wide });
  assert.ok(t.problems.some((p) => p.includes('길이가 0')));
  assert.ok(!t.clips.some((c) => c.duration === 0));
});

test('영상 샷에는 이미지 대체 경로를 함께 적는다 (생성 실패 대비)', () => {
  const t = buildTimeline(videoScenes(), { format: FORMATS.wide });
  const videoClips = t.clips.filter((c) => c.source.type === 'video');
  assert.ok(videoClips.length > 0, '영상 샷이 하나는 있어야 이 테스트가 뜻이 있다');
  for (const c of videoClips) {
    assert.ok(c.source.path.endsWith('.mp4'));
    assert.ok(c.source.fallback?.endsWith('.png'), '이미지 대체 경로가 없다');
  }
  for (const c of t.clips.filter((c) => c.source.type === 'image')) {
    assert.ok(c.source.path.endsWith('.png'));
  }
});

test('첫 샷에는 전환을 걸지 않는다', () => {
  const t = buildTimeline(videoScenes(), { format: FORMATS.wide });
  assert.equal(t.clips[0].transition, 'cut');
});

test('쇼츠 규격으로도 같은 타임라인을 만든다', () => {
  const t = buildTimeline(videoScenes(), { format: FORMATS.shorts });
  assert.equal(t.width, 1080);
  assert.equal(t.height, 1920);
  assert.ok(t.subtitle.includes('shorts'));
});

test('빈 장면에도 죽지 않는다', () => {
  const t = buildTimeline([], {});
  assert.equal(t.clips.length, 0);
  assert.equal(t.duration, 0);
});

// ─────────────────────────────────────────────────────────────

section('14. 쇼츠 후보 — 말이 끊기지 않는 구간을 고르는가');

const { pickShorts, SHORTS_MIN_SECONDS, SHORTS_MAX_SECONDS } = await import('../src/video/shorts.mjs');

test('30~60초 구간 3개를 고른다', () => {
  const picks = pickShorts(videoScenes(), { count: 3 });
  assert.equal(picks.length, 3);
  for (const p of picks) {
    assert.ok(
      p.duration >= SHORTS_MIN_SECONDS && p.duration <= SHORTS_MAX_SECONDS,
      `${p.duration}초는 범위 밖이다`
    );
    assert.ok(p.end > p.start);
    assert.ok(p.reason.length > 0);
  }
});

test('문단 경계에서만 자른다 — 문장 중간에서 끊지 않는다', () => {
  const scenes = videoScenes();
  const picks = pickShorts(scenes, { count: 3 });
  // 문단 경계 시각을 전부 모은다.
  const bounds = [0];
  let cursor = 0;
  for (const s of scenes) {
    for (const p of s.paragraphs) {
      cursor += secondsForChars(countNarrationChars(p.text));
      bounds.push(Math.round(cursor * 100) / 100);
    }
  }
  const near = (t) => bounds.some((b) => Math.abs(b - t) < 0.05);
  for (const p of picks) {
    assert.ok(near(p.start), `시작 ${p.start}초가 문단 경계가 아니다`);
    assert.ok(near(p.end), `끝 ${p.end}초가 문단 경계가 아니다`);
  }
});

test('고른 구간들이 서로 절반 넘게 겹치지 않는다', () => {
  const picks = pickShorts(videoScenes(), { count: 3 });
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const overlap = Math.min(picks[i].end, picks[j].end) - Math.max(picks[i].start, picks[j].start);
      const limit = Math.min(picks[i].duration, picks[j].duration) * 0.5;
      assert.ok(overlap <= limit, `${i + 1}번과 ${j + 1}번이 ${overlap.toFixed(1)}초 겹친다`);
    }
  }
});

test('HOOK이나 TWIST가 들어간 구간을 1순위로 올린다', () => {
  const picks = pickShorts(videoScenes(), { count: 3 });
  assert.ok(
    picks[0].sections.includes('HOOK') || picks[0].sections.includes('TWIST'),
    `1순위 구간이 ${picks[0].sections.join('+')}이다`
  );
});

test('대본이 짧아 30초가 안 나오면 전체를 돌려주고 이유를 적는다', () => {
  const short = splitIntoScenes(fakeScript(1)).scenes.slice(0, 1);
  const picks = pickShorts(short, { count: 3 });
  assert.equal(picks.length, 1);
  assert.ok(picks[0].reason.includes('만들 수 없었습니다'), picks[0].reason);
});

test('빈 장면에도 죽지 않는다', () => {
  assert.deepEqual(pickShorts([], {}), []);
  assert.deepEqual(pickShorts(null, {}), []);
});

// ─────────────────────────────────────────────────────────────

section('15. ffmpeg 명령 조립 — 오타 하나로 다른 그림이 나오는 부분');

const { cameraFilter, clipArgs, concatArgs, concatList, finishArgs, shortsArgs, escapeFilterPath } =
  await import('../src/video/ffmpeg.mjs');

test('카메라 움직임마다 프레임 수가 길이×fps와 맞는다', () => {
  for (const camera of ['zoom in', 'zoom out', 'pan left', 'pan right', 'slow camera shake', 'parallax']) {
    const f = cameraFilter(camera, { width: 1920, height: 1080, fps: 30, duration: 8 });
    assert.ok(f.includes('d=240'), `${camera}: d= 가 240이 아니다 — ${f}`);
    assert.ok(f.includes('s=1920x1080'), `${camera}: 출력 크기가 없다`);
    assert.ok(f.includes('fps=30'), `${camera}: fps가 없다`);
    // 계단을 막으려고 먼저 2배로 키운다.
    assert.ok(f.startsWith('scale=3840:2160'), `${camera}: 미리 키우지 않았다`);
    // 따옴표 짝이 맞아야 한다. 하나라도 어긋나면 필터 전체가 깨진다.
    assert.equal((f.match(/'/g) || []).length % 2, 0, `${camera}: 따옴표가 안 맞는다`);
  }
});

test('모르는 카메라 이름은 줌인으로 떨어진다 (렌더가 멈추지 않게)', () => {
  const unknown = cameraFilter('헬리콥터 샷', { width: 1920, height: 1080, fps: 30, duration: 4 });
  const zoomIn = cameraFilter('zoom in', { width: 1920, height: 1080, fps: 30, duration: 4 });
  assert.equal(unknown, zoomIn);
});

test('길이가 0이어도 프레임을 최소 1장은 뽑는다', () => {
  assert.ok(cameraFilter('zoom in', { width: 100, height: 100, fps: 30, duration: 0 }).includes('d=1'));
});

test('이미지 샷에는 카메라 움직임을 걸고, 영상 샷에는 걸지 않는다', () => {
  const base = { width: 1920, height: 1080, fps: 30, inputPath: 'in', outputPath: 'out.mp4' };
  const image = clipArgs({ duration: 5, camera: 'pan left', source: { type: 'image' } }, base);
  assert.ok(image.includes('-loop'), '이미지는 -loop 1 로 늘려야 한다');
  assert.ok(image.join(' ').includes('zoompan'));

  const video = clipArgs({ duration: 5, camera: 'pan left', source: { type: 'video' } }, base);
  assert.ok(!video.includes('-loop'));
  assert.ok(!video.join(' ').includes('zoompan'));
  // 비율이 다른 영상도 꽉 채우고 넘치는 부분을 자른다.
  assert.ok(video.join(' ').includes('crop=1920:1080'));
});

test('샷 길이를 -t 로 못 박는다 — 소리와 어긋나지 않게', () => {
  const args = clipArgs(
    { duration: 7.456, camera: 'zoom in', source: { type: 'image' } },
    { width: 1920, height: 1080, fps: 30, inputPath: 'in', outputPath: 'out.mp4' }
  );
  assert.equal(args[args.indexOf('-t') + 1], '7.456');
  assert.ok(args.includes('-an'), '소리는 마지막에 한 번에 붙인다');
});

test('조각들은 다시 인코딩하지 않고 이어 붙인다', () => {
  const args = concatArgs({ listPath: 'list.txt', outputPath: 'out.mp4' });
  assert.ok(args.includes('-c') && args[args.indexOf('-c') + 1] === 'copy');
  assert.ok(args.includes('concat'));
});

test('concat 목록의 작은따옴표를 이스케이프한다', () => {
  const list = concatList(["/tmp/it's/a.mp4", '/tmp/b.mp4']);
  assert.ok(list.includes("'\\''"), list);
  assert.equal(list.trim().split('\n').length, 2);
});

test('자막을 마지막에 한 번만 굽는다 — 샷 경계에서 끊기지 않게', () => {
  const args = finishArgs({ videoPath: 'silent.mp4', subtitlePath: 'sub.ass', outputPath: 'final.mp4', fps: 30 });
  const vf = args[args.indexOf('-vf') + 1];
  assert.equal(vf, 'ass=sub.ass');
  assert.ok(args.includes('-an'), '소리가 없으면 무음으로 둔다');
});

test('나레이션을 붙이면 소리 크기를 방송 기준으로 맞춘다', () => {
  const args = finishArgs({ videoPath: 'v.mp4', audioPath: 'voice.mp3', outputPath: 'final.mp4', fps: 30 });
  assert.ok(args.join(' ').includes('loudnorm=I=-16'));
  assert.ok(args.includes('-shortest'));
  assert.ok(!args.includes('-an'));
});

test('쇼츠는 9:16으로 가운데를 잘라낸다', () => {
  const args = shortsArgs({ videoPath: 'silent.mp4', start: 12.5, duration: 45, outputPath: 's.mp4' });
  // -ss 가 -i 앞에 있어야 빨리 찾아간다.
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'));
  assert.equal(args[args.indexOf('-ss') + 1], '12.500');
  assert.equal(args[args.indexOf('-t') + 1], '45.000');
  assert.ok(args.join(' ').includes('crop=1080:1920'));
});

test('쇼츠 자막을 한 번만 굽는다 — 두 겹으로 겹치지 않게', () => {
  // 처음에 완성본(자막이 이미 구워진 영상)에서 잘랐더니 자막이 두 겹이 됐다.
  // 가로 자막이 세로로 확대·크롭되어 깨진 채 깔리고 그 위에 쇼츠 자막이 얹혔다.
  // 렌더는 성공했고 오류도 없었다. 영상을 눈으로 보기 전까지 몰랐다.
  const args = shortsArgs({
    videoPath: 'silent.mp4',
    start: 0,
    duration: 40,
    subtitlePath: 'short-1.ass',
    outputPath: 's.mp4',
  });
  const vf = args[args.indexOf('-vf') + 1];
  assert.equal((vf.match(/ass=/g) || []).length, 1, `자막 필터가 ${vf}`);
  // 원본은 자막 없는 중간 영상이어야 한다.
  assert.equal(args[args.indexOf('-i') + 1], 'silent.mp4');
});

test('쇼츠 소리는 영상과 같은 시각에서 자른다 — 입이 안 맞으면 바로 넘긴다', () => {
  const args = shortsArgs({
    videoPath: 'silent.mp4',
    audioPath: '../voice.mp3',
    start: 147.82,
    duration: 37.64,
    outputPath: 's.mp4',
  });
  // -ss 가 두 번, 각 입력 앞에 하나씩.
  const ssIndexes = args.reduce((acc, a, i) => (a === '-ss' ? [...acc, i] : acc), []);
  assert.equal(ssIndexes.length, 2, '-ss 가 입력마다 하나씩 있어야 한다');
  for (const i of ssIndexes) assert.equal(args[i + 1], '147.820');
  assert.ok(ssIndexes[0] < args.indexOf('silent.mp4'));
  assert.ok(ssIndexes[1] < args.lastIndexOf('../voice.mp3'));
  assert.ok(args.includes('-shortest'));
  assert.ok(args.join(' ').includes('loudnorm=I=-16'), '본편과 같은 소리 기준이어야 한다');
  assert.ok(!args.includes('-an'));
});

test('나레이션이 없으면 쇼츠는 무음으로 만든다', () => {
  const args = shortsArgs({ videoPath: 'silent.mp4', start: 0, duration: 40, outputPath: 's.mp4' });
  assert.ok(args.includes('-an'));
  assert.equal(args.filter((a) => a === '-ss').length, 1);
});

test('필터 경로의 콜론·따옴표·역슬래시를 이스케이프한다', () => {
  assert.equal(escapeFilterPath('C:\\x\\sub.ass'), 'C\\:\\\\x\\\\sub.ass');
  assert.equal(escapeFilterPath("it's.ass"), "it\\'s.ass");
  // 이스케이프한 경로가 필터 문자열에 그대로 들어간다.
  const args = finishArgs({ videoPath: 'v.mp4', subtitlePath: 'a:b.ass', outputPath: 'o.mp4' });
  assert.equal(args[args.indexOf('-vf') + 1], 'ass=a\\:b.ass');
});

/**
 * 영상 테스트가 쓰는 장면 묶음.
 *
 * designedScenes()와 달리 카메라 움직임을 종류별로 돌려가며 붙인다 —
 * 어떤 카메라든 ffmpeg 필터가 깨지지 않는지 보려고.
 */
function videoScenes() {
  const cameras = ['zoom in', 'zoom out', 'pan left', 'pan right', 'slow camera shake', 'parallax'];
  const scenes = designedScenes().map((scene, si) => ({
    ...scene,
    shots: scene.shots.map((shot, i) => ({ ...shot, camera: cameras[(si + i) % cameras.length] })),
  }));
  return assignSound(assignAssetTypes(scenes, { videoRatio: 0.15 }));
}

// ─────────────────────────────────────────────────────────────

section('16. 이미지 생성 — 코드가 돈을 지키는가');

const {
  IMAGE_MODELS,
  DEFAULT_IMAGE_MODEL,
  modelFor,
  isDone,
  firstUrl,
  createClient,
} = await import('../src/assets/replicate.mjs');
const {
  generateImages,
  shotsToGenerate,
  estimateUsd,
  looksLikeImage,
  hasUsableFile,
  DEFAULT_MAX_USD,
  MAX_ATTEMPTS,
} = await import('../src/assets/images.mjs');

/** 가짜 PNG. 앞 8바이트만 진짜면 우리 검사를 통과한다. */
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function fakePng(size = 4096) {
  return Buffer.concat([PNG_HEAD, Buffer.alloc(size - 8, 7)]);
}

/** 테스트용 가짜 Replicate. 몇 번 불렸는지, 무엇을 받았는지 기억한다. */
function fakeApi({ failTimes = 0, failForever = new Set(), bad = new Set() } = {}) {
  const calls = [];
  let failsLeft = failTimes;
  return {
    calls,
    async generate(prompt, opts) {
      calls.push({ prompt, opts });
      if (failsLeft > 0) {
        failsLeft--;
        const e = new Error('일시적 실패');
        e.retryable = true;
        throw e;
      }
      const shotHint = prompt.match(/SHOT:(\S+)/)?.[1];
      if (shotHint && failForever.has(shotHint)) {
        const e = new Error('모델이 거부했습니다');
        e.retryable = true;
        throw e;
      }
      return { url: `https://example.test/${calls.length}.png`, usdEstimate: 0.003, model: 'fake' };
    },
    async download(url) {
      const n = Number(url.match(/\/(\d+)\.png$/)?.[1]);
      return bad.has(n) ? Buffer.from('nope') : fakePng();
    },
  };
}

function fakePrompts(count, { prefix = 'S01' } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    shot_id: `${prefix}-${i + 1}`,
    scene_number: 1,
    asset_type: 'IMAGE',
    duration: 6,
    camera: 'zoom in',
    image_prompt: `SHOT:${prefix}-${i + 1} an empty lighthouse interior at night`,
    video_prompt: '',
    depicts_real_person: false,
    mood: 'mystery',
  }));
}

function imgDir(name) {
  const dir = path.join(TMP, 'img', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('모르는 모델 이름은 분명한 오류로 막는다', () => {
  assert.throws(() => modelFor('없는모델'), /모르는 이미지 모델/);
  assert.equal(modelFor(DEFAULT_IMAGE_MODEL).model, IMAGE_MODELS.schnell.model);
  // 기본은 싼 쪽이어야 한다. 비싼 게 기본이면 실수 한 번이 비싸진다.
  assert.ok(
    IMAGE_MODELS[DEFAULT_IMAGE_MODEL].usdPerImage <=
      Math.min(...Object.values(IMAGE_MODELS).map((m) => m.usdPerImage)),
    '기본 모델이 가장 싼 모델이 아닙니다'
  );
});

test('토큰이 없으면 호출 전에 막고, 어디서 받는지 알려준다', () => {
  assert.throws(
    () => createClient({ token: '' }),
    (err) => err.code === 'REPLICATE_TOKEN_MISSING' && /REPLICATE_API_TOKEN/.test(err.message)
  );
});

test('예측 상태를 끝난 것과 아닌 것으로 가른다', () => {
  for (const s of ['succeeded', 'failed', 'canceled']) assert.equal(isDone(s), true, s);
  for (const s of ['starting', 'processing']) assert.equal(isDone(s), false, s);
});

test('결과가 문자열이든 배열이든 주소를 꺼낸다', () => {
  assert.equal(firstUrl('https://a/1.png'), 'https://a/1.png');
  assert.equal(firstUrl(['https://a/1.png', 'https://a/2.png']), 'https://a/1.png');
  assert.equal(firstUrl([]), null);
  assert.equal(firstUrl(null), null);
  assert.equal(firstUrl({ image: 'https://a/1.png' }), null);
});

test('내려받다 만 파일을 이미지로 인정하지 않는다', () => {
  assert.equal(looksLikeImage(fakePng()), true);
  assert.equal(looksLikeImage(Buffer.from('<html>오류 페이지</html>')), false);
  assert.equal(looksLikeImage(Buffer.alloc(0)), false);
  assert.equal(looksLikeImage(PNG_HEAD), false, '8바이트짜리는 이미지가 아니다');
  assert.equal(looksLikeImage(null), false);
});

test('이미 있는 이미지는 다시 만들지 않는다 — 중간에 죽어도 돈을 다시 안 쓴다', () => {
  const dir = imgDir('skip');
  const prompts = fakePrompts(3);
  fs.writeFileSync(path.join(dir, 'S01-2.png'), fakePng());

  const { todo, skipped } = shotsToGenerate(prompts, { assetDir: dir });
  assert.deepEqual(todo.map((t) => t.shot_id), ['S01-1', 'S01-3']);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, '이미 있습니다');

  // --force 면 전부 다시 만든다.
  assert.equal(shotsToGenerate(prompts, { assetDir: dir, force: true }).todo.length, 3);
});

test('반쪽짜리 파일은 "있다"고 보지 않는다', () => {
  const dir = imgDir('partial');
  fs.writeFileSync(path.join(dir, 'S01-1.png'), Buffer.alloc(50));
  assert.equal(hasUsableFile(path.join(dir, 'S01-1.png')), false);
  assert.equal(shotsToGenerate(fakePrompts(1), { assetDir: dir }).todo.length, 1);
});

test('프롬프트가 빈 샷은 만들지 않고 문제로 남긴다', () => {
  const dir = imgDir('empty-prompt');
  const prompts = fakePrompts(2);
  prompts[0].image_prompt = '   ';
  const { todo, skipped } = shotsToGenerate(prompts, { assetDir: dir });
  assert.equal(todo.length, 1);
  assert.ok(skipped.some((s) => s.reason.includes('비어 있습니다')));
});

await asyncTest('이미지를 만들고 파일로 저장한다', async () => {
  const dir = imgDir('ok');
  const api = fakeApi();
  const r = await generateImages(fakePrompts(3), { assetDir: dir, client: api, sleepFn: async () => {} });

  assert.equal(r.made.length, 3);
  assert.equal(r.failed.length, 0);
  assert.equal(api.calls.length, 3);
  for (const m of r.made) assert.ok(fs.existsSync(m.file), `${m.file} 이 없다`);
  // 반쪽짜리 임시 파일이 남으면 안 된다.
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.part')).length, 0);
});

await asyncTest('가로세로비를 16:9로 넘긴다 — 본편 규격과 맞아야 한다', async () => {
  const dir = imgDir('ratio');
  const api = fakeApi();
  await generateImages(fakePrompts(1), { assetDir: dir, client: api, sleepFn: async () => {} });
  assert.equal(api.calls[0].opts.aspectRatio, '16:9');
});

await asyncTest('비용 상한을 넘기 전에 멈춘다 — 넘은 뒤에 세면 이미 쓴 뒤다', async () => {
  const dir = imgDir('budget');
  const api = fakeApi();
  // 장당 $0.003, 상한 $0.007 → 2장까지만.
  const r = await generateImages(fakePrompts(10), {
    assetDir: dir,
    client: api,
    maxUsd: 0.007,
    sleepFn: async () => {},
  });

  assert.equal(r.stoppedBy, 'budget');
  assert.equal(r.made.length, 2, `${r.made.length}장 만들었다`);
  assert.ok(r.spentUsd <= 0.007, `상한을 넘겨 썼다: $${r.spentUsd}`);
  assert.equal(api.calls.length, 2, 'API를 상한 너머로 불렀다');
  assert.equal(r.failed.length, 8);
  assert.ok(r.failed[0].reason.includes('비용 상한'));
});

await asyncTest('상한에 걸려 멈춘 뒤 다시 돌리면 남은 것부터 이어서 만든다', async () => {
  const dir = imgDir('resume');
  const prompts = fakePrompts(6);
  const first = await generateImages(prompts, {
    assetDir: dir, client: fakeApi(), maxUsd: 0.007, sleepFn: async () => {},
  });
  assert.equal(first.made.length, 2);

  const api2 = fakeApi();
  const second = await generateImages(prompts, {
    assetDir: dir, client: api2, maxUsd: 1, sleepFn: async () => {},
  });
  // 이미 만든 2장은 건너뛰고 4장만 새로 만든다.
  assert.equal(api2.calls.length, 4, `${api2.calls.length}번 불렀다 — 이미 있는 걸 다시 샀다`);
  assert.equal(second.made.length, 4);
  assert.equal(second.skipped.filter((s) => s.reason === '이미 있습니다').length, 2);
});

await asyncTest('일시적 실패는 다시 걸어본다', async () => {
  const dir = imgDir('retry');
  const api = fakeApi({ failTimes: 2 });
  const r = await generateImages(fakePrompts(1), { assetDir: dir, client: api, sleepFn: async () => {} });
  assert.equal(r.made.length, 1);
  assert.equal(r.made[0].attempts, 3);
  assert.equal(api.calls.length, 3);
});

await asyncTest('계속 실패하는 샷이 있어도 나머지는 끝까지 만든다', async () => {
  const dir = imgDir('partial-fail');
  const api = fakeApi({ failForever: new Set(['S01-2']) });
  const r = await generateImages(fakePrompts(4), { assetDir: dir, client: api, sleepFn: async () => {} });

  assert.equal(r.made.length, 3);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].shot_id, 'S01-2');
  // 실패한 샷만 MAX_ATTEMPTS 번 걸고 포기한다.
  assert.equal(api.calls.length, 3 + MAX_ATTEMPTS);
  assert.ok(!fs.existsSync(path.join(dir, 'S01-2.png')), '실패한 샷의 파일이 남았다');
});

await asyncTest('내려받은 게 이미지가 아니면 실패로 치고 파일을 남기지 않는다', async () => {
  const dir = imgDir('bad-download');
  // 모든 내려받기가 깨진 데이터를 준다.
  const api = fakeApi({ bad: new Set([1, 2, 3]) });
  const r = await generateImages(fakePrompts(1), { assetDir: dir, client: api, sleepFn: async () => {} });

  assert.equal(r.made.length, 0);
  assert.equal(r.failed.length, 1);
  assert.ok(/이미지가 아닙니다/.test(r.failed[0].reason), r.failed[0].reason);
  assert.equal(fs.readdirSync(dir).length, 0, '깨진 파일이 남았다');
});

await asyncTest('호출이 성공한 뒤 내려받기가 실패해도 쓴 돈으로 센다', async () => {
  const dir = imgDir('spend-on-call');
  const api = fakeApi({ bad: new Set([1, 2, 3]) });
  const r = await generateImages(fakePrompts(1), { assetDir: dir, client: api, sleepFn: async () => {} });
  // 세 번 걸었으니 세 번 돈이 나갔다. 파일은 0개다.
  assert.ok(r.spentUsd > 0, '돈을 썼는데 0원으로 셌다');
  assert.equal(r.made.length, 0);
});

test('비용 추정이 장수에 비례한다', () => {
  assert.equal(estimateUsd(0), 0);
  const one = estimateUsd(1);
  assert.ok(Math.abs(estimateUsd(50) - one * 50) < 1e-6);
  assert.ok(estimateUsd(50, 'dev') > estimateUsd(50, 'schnell'));
  assert.ok(DEFAULT_MAX_USD > 0);
});

await asyncTest('빈 목록에도 죽지 않는다', async () => {
  const dir = imgDir('empty');
  const r = await generateImages([], { assetDir: dir, client: fakeApi(), sleepFn: async () => {} });
  assert.equal(r.made.length, 0);
  assert.equal(r.spentUsd, 0);
  assert.equal(r.stoppedBy, null);
});

console.log(`\n${'═'.repeat(60)}`);
console.log(`통과 ${passed}건  실패 ${failed}건`);
console.log(`임시 폴더: ${TMP}`);
console.log('═'.repeat(60));

// 테스트가 만든 임시 폴더를 지운다.
fs.rmSync(TMP, { recursive: true, force: true });

if (failed) process.exit(1);
