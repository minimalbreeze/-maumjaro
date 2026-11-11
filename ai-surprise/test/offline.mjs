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
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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
const { loadTracks: loadBgmTracks } = await import('../src/audio/bgm.mjs');
const { MOODS: SCENE_MOODS, IMAGE_CAMERA_MOVES } = await import('../src/scenes/assets.mjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const out = fn();
    // async 함수를 test() 에 넘기면 **실패해도 ✅ 가 찍힌다.**
    //
    // try/catch 는 비동기 거부를 잡지 못한다. 그래서 통과로 세어 놓고,
    // 요약까지 다 찍은 뒤에 node 가 처리되지 않은 거부로 죽는다.
    // 실행 #28 이 그렇게 났다 — 로컬에서 "301건 통과" 로 보였는데
    // 종료 코드는 1이었다.
    if (out && typeof out.then === 'function') {
      throw new Error('async 함수는 test() 가 아니라 asyncTest() 로 넘기세요.');
    }
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

let skipped = 0;

/**
 * 돌릴 수 없는 검사를 건너뛴다.
 *
 * 이 모음의 약속은 **키 없이, 설치 없이 돈다**는 것이다. ffmpeg 가 있어야
 * 하는 검사를 그냥 넣었다가 워크플로의 자체 검사 단계를 통째로 실패시켰다
 * (실행 #24). 거기서는 ffmpeg 를 그 뒤 단계에서 깔기 때문이다.
 *
 * 조용히 통과시키지 않고 **건너뛰었다고 찍는다.** 초록불인데 실제로는
 * 아무것도 안 본 상태가 제일 나쁘다.
 */
function skip(name, why) {
  skipped++;
  console.log(`  ⏭  ${name} — 건너뜀 (${why})`);
}

/** ffmpeg 가 이 기계에 있는가. */
function hasFfmpeg() {
  try {
    const { execFileSync } = require('node:child_process');
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
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

test('전설 추적 모드는 사건이 아니라 이야기의 출처를 검증한다', () => {
  const p = buildCollectPrompt({ topic: '세르게이 포노마렌코', legend: true });
  assert.ok(p.includes('전설·괴담 추적 편'));
  assert.ok(p.includes('가장 이른 출처'), '출처 추적 지시가 없다');
  assert.ok(p.includes('사건이 일어났는가'), '검증 대상을 바꾼다는 설명이 없다');
  // 출처조차 확인 안 되면 빈 손으로 와야 한다. 괴담 하나 더 퍼뜨리면 안 된다.
  assert.ok(p.includes('빈 목록을 제출'));
});

test('--legend 없이 같은 소재를 주면 평소 검증 프롬프트가 나온다', () => {
  const normal = buildCollectPrompt({ topic: '세르게이 포노마렌코' });
  assert.ok(!normal.includes('전설·괴담 추적 편'));
  assert.ok(normal.includes('1차 기록'));
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
// ─────────────────────────────────────────────────────────────

section('4-b. 전설 추적 편 — 지어낸 이야기를 사실처럼 쓰지 않는가');

const { KIND } = await import('../src/model.mjs');
const { sectionsFor, ORIGIN_SECTION } = await import('../src/script/write.mjs');

function legendItem(extra = {}) {
  return makeItem({
    title: '세르게이 포노마렌코',
    summary: '시간여행자라고 알려진 이야기',
    category: '실제 미스터리',
    sources: [{ url: 'https://a.test' }, { url: 'https://b.test' }],
    source_count: 2,
    fact_status: 'UNVERIFIED',
    risk_flags: ['FABRICATED'],
    risk_score: 20,
    kind: 'LEGEND',
    ...extra,
  });
}

test('1차 기록이 없어도 전설 편은 막히지 않는다', () => {
  // EVENT라면 차단이 맞다. LEGEND는 그게 전제다.
  const asEvent = makeItem({ ...legendItem(), kind: 'EVENT' });
  assert.equal(evaluateGate(asEvent).gate, GATE.BLOCKED);
  assert.equal(evaluateGate(legendItem()).gate, GATE.REVIEW_NEEDED);
});

test('전설 편은 자동 통과시키지 않는다 — 사람이 대본을 읽어야 한다', () => {
  const g = evaluateGate(legendItem());
  assert.notEqual(g.gate, GATE.AUTO_OK);
  assert.ok(g.reasons.some((r) => r.includes('사실처럼')), g.reasons.join(' | '));
});

test('전설 편이어도 출처가 하나뿐이면 사람이 봐야 한다', () => {
  const g = evaluateGate(legendItem({ sources: [{ url: 'https://a.test' }], source_count: 1 }));
  assert.notEqual(g.gate, GATE.AUTO_OK);
  assert.ok(g.reasons.some((r) => r.includes('출처가 1개')));
});

test('전설 편이어도 명예훼손·범죄 미화는 막는다', () => {
  for (const flag of ['DEFAMATION', 'CRIMINAL_GLORIFICATION']) {
    const g = evaluateGate(legendItem({ risk_flags: [flag] }));
    assert.equal(g.gate, GATE.BLOCKED, `${flag} 이 막히지 않았다`);
  }
});

test('전설 편에 사람 이름이 나오는 것만으로는 막지 않는다', () => {
  // 세르게이 포노마렌코 편이 이걸로 막혔다. 막힌 이유를 뜯어보니
  // "우리가 누군가를 지목한다"가 아니라 "이야기에 이름이 나온다"였다.
  // 전해지는 이야기에 사람 이름이 나오는 건 당연하고, 그걸로 주제를 막으면
  // 도시전설을 아예 다룰 수 없다.
  const g = evaluateGate(legendItem({ risk_flags: ['LIVING_PERSON_CLAIM'] }));
  assert.equal(g.gate, GATE.REVIEW_NEEDED);
  // 막지 않는 대신, 무엇을 봐야 하는지 분명히 알려줘야 한다.
  assert.ok(g.reasons.some((r) => r.includes('특정인을 지목')), g.reasons.join(' | '));

  // 같은 소재를 EVENT로 주면 여전히 막힌다 — 실화 편은 기준이 다르다.
  const asEvent = makeItem({ ...legendItem({ risk_flags: ['LIVING_PERSON_CLAIM'] }), kind: 'EVENT' });
  assert.equal(evaluateGate(asEvent).gate, GATE.BLOCKED);
});

test('가드가 사라진 게 아니라 대본 지시로 옮겨갔다', () => {
  // 관문에서 뺐으면 대본에서 막아야 한다. 둘 다 없으면 그냥 구멍이다.
  const p = buildScriptPrompt(legendItem());
  assert.ok(p.includes('살아 있는 특정 인물을 지목하지 않습니다'), '지목 금지 지시가 없다');
  assert.ok(p.includes('"어디서 나왔다"로 씁니다'), '대안 표현 지시가 없다');
  assert.ok(p.includes('명예훼손'), '왜 안 되는지 설명이 없다');
});

test('출처를 못 찾아도 빈손으로 오지 말라고 한다', () => {
  // 예전에는 "출처 2개 확인 안 되면 빈 목록"이었다. 그러면 도시전설은
  // 거의 전부 빈손으로 돌아온다 — 원전이 없는 게 그 장르의 속성이니까.
  const p = buildCollectPrompt({ topic: '어떤 괴담', legend: true });
  assert.ok(p.includes('출처를 못 찾아도 제출'), p.slice(-700));
  assert.ok(p.includes('어디까지'), '무엇을 대신 적으라는 지시가 없다');
  // 지어내는 건 여전히 금지
  assert.ok(p.includes('지어내거나'));
  // 지목해야만 성립하는 이야기는 여전히 거른다
  assert.ok(p.includes('지목해야만 성립'));
});

test('전설 편 대본에는 출처 섹션이 들어간다', () => {
  const keys = sectionsFor(KIND.LEGEND).map((s) => s.key);
  assert.ok(keys.includes('ORIGIN'));
  // 반전 뒤, 마지막 질문 앞. 맨 끝에 붙이는 변명이 아니라 절정의 자리다.
  assert.ok(keys.indexOf('ORIGIN') > keys.indexOf('TWIST'));
  assert.ok(keys.indexOf('ORIGIN') < keys.indexOf('QUESTION'));
  // 일반 편에는 없어야 한다.
  assert.ok(!sectionsFor(KIND.EVENT).map((s) => s.key).includes('ORIGIN'));
});

test('출처 섹션이 없는 전설 대본은 오류다', () => {
  const noOrigin = fakeScript(2); // ORIGIN 없는 평범한 대본
  const v = validateScript(noOrigin, { kind: KIND.LEGEND });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('ORIGIN')), v.errors.join(' | '));
  // 같은 대본이 일반 편으로는 통과해야 한다 — ORIGIN 요구가 전설 편에만 걸린다.
  assert.ok(!validateScript(noOrigin, { kind: KIND.EVENT }).errors.some((e) => e.includes('ORIGIN')));
});

test('출처 섹션이 제목만 있고 비어 있으면 오류다', () => {
  // 제목만 넣고 통과시키는 건 출처를 안 밝힌 것과 같다.
  const empty = legendScript({ originBody: '' });
  const v = validateScript(empty, { kind: KIND.LEGEND });
  assert.ok(v.errors.some((e) => e.includes('ORIGIN')), v.errors.join(' | '));
});

test('출처를 제대로 밝힌 전설 대본은 통과한다', () => {
  const v = validateScript(legendScript(), { kind: KIND.LEGEND });
  assert.equal(v.ok, true, v.errors.join(' | '));
});

test('전설 편 대본 지시가 사건을 FACT로 쓰지 말라고 말한다', () => {
  const p = buildScriptPrompt(legendItem());
  assert.ok(p.includes('전설 추적'));
  assert.ok(p.includes('[FACT]로 쓰지 않습니다'), '사건을 사실로 쓰지 말라는 지시가 없다');
  // 7분 속이고 마지막에 뒤집는 구성을 막는 지시
  assert.ok(p.includes('사실인 척하다가'), p.slice(-600));
  // 일반 편에는 이 지시가 없어야 한다
  assert.ok(!buildScriptPrompt(makeItem({ ...legendItem(), kind: 'EVENT' })).includes('전설 추적'));
});

/** ORIGIN 섹션이 들어간 전설 대본. */
function legendScript({ originBody = '[FACT] 이 이야기의 가장 이른 등장은 한 TV 프로그램이었다.' } = {}) {
  const filler = '당시 기록에 남은 내용은 여기까지였고 그 뒤의 일은 어떤 문서로도 확인되지 않았다';
  const lines = [];
  for (const s of sectionsFor(KIND.LEGEND)) {
    lines.push(`## [${s.key}] ${s.label}`);
    if (s.key === 'ORIGIN') {
      if (originBody) lines.push(originBody);
    } else {
      for (let i = 0; i < 2; i++) {
        lines.push(`[${TAGS[i % TAGS.length]}] ${s.key} 문단 ${i + 1}입니다. ${filler}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────

section('4-c. 유튜브 정책 — 올려서 막히지 않는가');

const {
  findAdUnsafe,
  checkTitle,
  uploadChecklist,
  AD_UNSAFE_NARRATION,
  SYNTHETIC_DISCLOSURE,
} = await import('../src/policy.mjs');

test('나레이션의 그래픽한 묘사를 잡는다 — 그림만 막아서는 소용없다', () => {
  // 그림에 시체가 없어도 나레이션이 시체를 묘사하면 광고는 똑같이 막힌다.
  const found = findAdUnsafe('[FACT] 시신은 심하게 훼손되어 있었다.');
  assert.equal(found.length, 1);
  assert.equal(found[0].word, '훼손');
  assert.ok(found[0].line.includes('훼손'), '어디서 걸렸는지 알려줘야 한다');
});

test('죽음을 다루는 것 자체는 막지 않는다', () => {
  // 유튜브도 비그래픽 다큐멘터리 서술에는 광고를 붙인다. 이 채널 소재가
  // 실종·사망이라 "죽음"을 막아버리면 아무것도 못 만든다.
  for (const line of [
    '1900년 12월, 등대지기 세 명이 사라졌다.',
    '세 사람은 끝내 발견되지 않았다.',
    '해변에서 신원 불명의 시신이 발견됐다.',
    '사인은 끝내 밝혀지지 않았다.',
  ]) {
    assert.equal(findAdUnsafe(line).length, 0, `막으면 안 되는 문장이 걸렸다: ${line}`);
  }
});

test('자해·자살 방법 묘사를 잡는다 — 유튜브가 가장 엄격한 영역', () => {
  assert.ok(findAdUnsafe('그는 목을 매 숨진 채 발견됐다').length > 0);
});

test('빈 글에도 죽지 않는다', () => {
  for (const input of ['', null, undefined]) assert.deepEqual(findAdUnsafe(input), []);
  assert.deepEqual(checkTitle(null), []);
});

test('영상이 지키지 못할 약속을 하는 제목을 잡는다', () => {
  // 처벌이 광고 제한이 아니라 영상 삭제다. 미스터리 채널은 답을 주지 않는
  // 장르라서 "진실 공개" 같은 제목이 바로 위반이 된다.
  const p = checkTitle('드디어 밝혀진 충격 실화!!!');
  assert.ok(p.length >= 3, JSON.stringify(p));
  assert.ok(p.some((x) => x.why.includes('밝혀졌다')));
  assert.ok(p.some((x) => x.why.includes('충격')));
});

test('멀쩡한 제목은 통과시킨다', () => {
  assert.deepEqual(checkTitle('세 명이 사라졌는데 외투는 두 벌만 없었다'), []);
});

test('제목이 모바일에서 잘릴 길이면 알려준다', () => {
  const long = '가'.repeat(61);
  assert.ok(checkTitle(long).some((p) => p.pattern === 'length'));
  assert.equal(checkTitle('가'.repeat(60)).length, 0);
});

test('AI 합성 고지가 필수 항목으로 들어간다 — 빠뜨리면 계정이 날아간다', () => {
  const c = uploadChecklist({ title: '세 명이 사라졌다' });
  const item = c.items.find((i) => i.key === 'synthetic_disclosure');
  assert.ok(item, '합성 고지 항목이 없다');
  assert.equal(item.required, true);
  assert.ok(item.how.includes('합성된 콘텐츠'), '어디를 눌러야 하는지 없다');
  assert.equal(SYNTHETIC_DISCLOSURE.required, true);
});

test('체크리스트가 제목 문제를 자동으로 잡아서 담는다', () => {
  const c = uploadChecklist({ title: '진실 공개!!!' });
  const item = c.items.find((i) => i.key === 'title_not_misleading');
  assert.ok(item.problems.length > 0, '제목 문제를 안 담았다');
});

test('전설 편에만 "전해지는 이야기임이 드러나는가" 항목이 붙는다', () => {
  const legend = uploadChecklist({ kind: 'LEGEND' }).items.map((i) => i.key);
  const event = uploadChecklist({ kind: 'EVENT' }).items.map((i) => i.key);
  assert.ok(legend.includes('legend_framing'));
  assert.ok(!event.includes('legend_framing'));
});

test('양산형 포맷 경고가 들어 있다 — 우리한테 제일 큰 위험이다', () => {
  const c = uploadChecklist({});
  const item = c.items.find((i) => i.key === 'not_templated');
  assert.ok(item, '양산 경고 항목이 없다');
  assert.ok(item.why.includes('채널 전체'), '단속이 채널 단위라는 설명이 없다');
});

test('대본 검증이 광고 위험 표현을 경고로 알린다', () => {
  const withGore = SECTIONS.map(
    (s) =>
      `## [${s.key}] ${s.label}\n[FACT] ${s.key} 문단입니다. 기록은 여기까지였다.` +
      (s.key === 'CASE' ? ' 시신은 심하게 훼손되어 있었다.' : '')
  ).join('\n\n');
  const v = validateScript(withGore);
  assert.ok(v.warnings.some((w) => w.includes('광고가 제한')), v.warnings.join(' | '));
  // 오류가 아니라 경고여야 한다 — 맥락상 꼭 써야 하는 경우가 있고,
  // 그 판단은 사람이 한다.
  assert.ok(!v.errors.some((e) => e.includes('광고')), '오류로 막으면 안 된다');
});

// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────

section('4-d. 소리 — 자막·그림이 실제 음성에 맞는가');

const { estimateUsd: ttsUsd, createClient: createTts, MAX_CHARS_PER_REQUEST } =
  await import('../src/audio/tts.mjs');
const {
  narrate,
  narrationUnits,
  applyTimings,
  looksLikeMp3,
  concatArgs: audioConcatArgs,
  PAUSE_SECONDS,
} = await import('../src/audio/narrate.mjs');
const { loadTracks, pickTrack, mixArgs, attributionText, BGM_GAIN_DB } =
  await import('../src/audio/bgm.mjs');

const MP3_HEAD = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
function fakeMp3(size = 2048) {
  return Buffer.concat([MP3_HEAD, Buffer.alloc(size - 4, 3)]);
}

function voiceScenes() {
  return [
    {
      scene_number: 1,
      section: 'HOOK',
      mood: 'mystery',
      duration: 20,
      paragraphs: [
        { tag: 'FACT', text: '첫 문단입니다.', seconds: 10 },
        { tag: 'UNKNOWN', text: '둘째 문단입니다.', seconds: 10 },
      ],
      shots: [
        { shot_id: 'S01-1', duration: 10 },
        { shot_id: 'S01-2', duration: 10 },
      ],
    },
  ];
}

test('TTS 키가 없으면 부르기 전에 막고, 어디서 받는지 알려준다', () => {
  assert.throws(
    () => createTts({ apiKey: '' }),
    (err) => err.code === 'TTS_KEY_MISSING' && /Text-to-Speech/.test(err.message)
  );
});

test('문단 단위가 자막·장면과 같아야 타이밍을 맞출 수 있다', () => {
  const units = narrationUnits(voiceScenes());
  assert.deepEqual(units.map((u) => u.id), ['S01-P1', 'S01-P2']);
  // 빈 문단은 읽을 게 없으므로 빠진다.
  const withEmpty = voiceScenes();
  withEmpty[0].paragraphs.push({ tag: 'FACT', text: '   ' });
  assert.equal(narrationUnits(withEmpty).length, 2);
  assert.deepEqual(narrationUnits(null), []);
});

test('비용이 글자 수에 비례한다', () => {
  assert.equal(ttsUsd(0), 0);
  assert.ok(Math.abs(ttsUsd(2600) - ttsUsd(1300) * 2) < 1e-6);
  // 8분 1편이 1달러를 넘으면 뭔가 잘못 계산한 것이다.
  assert.ok(ttsUsd(2600) < 1);
});

test('받다 만 파일을 mp3로 인정하지 않는다', () => {
  assert.equal(looksLikeMp3(fakeMp3()), true);
  assert.equal(looksLikeMp3(Buffer.from('<html>오류</html>')), false);
  assert.equal(looksLikeMp3(Buffer.alloc(0)), false);
  assert.equal(looksLikeMp3(MP3_HEAD), false, '4바이트짜리는 음성이 아니다');
});

await asyncTest('너무 긴 문단은 부르기 전에 잡는다', async () => {
  const scenes = voiceScenes();
  scenes[0].paragraphs[0].text = '가'.repeat(MAX_CHARS_PER_REQUEST + 1);
  await assert.rejects(
    () => narrate(scenes, { workDir: path.join(TMP, 'tts-long'), client: {}, sleepFn: async () => {} }),
    /너무 깁니다/
  );
});

test('이어 붙일 때 다시 인코딩한다 — 틈이 쌓이면 자막이 밀린다', () => {
  const args = audioConcatArgs({ listPath: 'l.txt', outputPath: 'v.mp3' });
  // -c copy 였다면 mp3 프레임 경계 때문에 오차가 쌓인다.
  assert.ok(!args.includes('copy'), '복사로 붙이면 타이밍이 어긋난다');
  assert.ok(args.includes('libmp3lame'));
});

test('장면·샷 길이가 실제 음성 길이로 바뀐다 — 자막만 고치면 그림이 어긋난다', () => {
  // 추정은 문단당 10초였는데 실제로는 6초와 14초였다고 하자.
  const timings = [
    { id: 'S01-P1', seconds: 6 },
    { id: 'S01-P2', seconds: 14 },
  ];
  const fixed = applyTimings(voiceScenes(), timings);

  assert.equal(fixed[0].paragraphs[0].seconds, 6 + PAUSE_SECONDS);
  assert.equal(fixed[0].paragraphs[1].seconds, 14 + PAUSE_SECONDS);

  // 장면 길이가 문단 합계와 같아야 한다.
  const sum = fixed[0].paragraphs.reduce((s, p) => s + p.seconds, 0);
  assert.ok(Math.abs(fixed[0].duration - sum) < 0.02);

  // 샷 길이 합계도 장면 길이와 같아야 한다. 여기가 어긋나면 그림이 밀린다.
  const shotSum = fixed[0].shots.reduce((s, x) => s + x.duration, 0);
  assert.ok(Math.abs(shotSum - fixed[0].duration) < 0.05, `샷 ${shotSum} vs 장면 ${fixed[0].duration}`);

  // 샷의 개수와 번호는 그대로여야 한다 — 그림이 이미 그 번호로 만들어져 있다.
  assert.deepEqual(fixed[0].shots.map((x) => x.shot_id), ['S01-1', 'S01-2']);
});

await asyncTest('문단 길이가 실제 쉼을 센다 — 쇼츠 자르는 자리가 밀리지 않는다', async () => {
  // 7화·8화에서 **5번 쇼츠가 두 편 연속 잘려** 나왔다. 원인이 여기였다.
  //
  // applyTimings 가 문단 길이에 PAUSE_SECONDS(0.45초)를 더했다. 그런데
  // 그건 가운데 값이고, 실제 쉼은 pauseAfter() 가 자리마다 다르게
  // 정한다 (0.22 / 0.35 / 0.5 / 0.65 / 0.85). 문단마다 조금씩 틀린
  // 값이 쌓여서, 8분 영상이면 끝에서 몇 초가 어긋났다.
  //
  // 쇼츠는 그 어긋난 시각으로 영상을 자른다. 계산한 자리가 실제보다
  // 앞이면 그 구간의 마지막 문장이 끝나기 전에 잘린다.
  //
  // timings 에는 이미 진짜 시각이 들어 있었다 — concat 하면서 쉼까지
  // 더한 cursor 로 찍은 값이다. 그걸 쓰면 어긋날 일이 없다.
  const { applyTimings, PAUSE_SECONDS } = await import('../src/audio/narrate.mjs');

  const scenes = [
    { scene_number: 1, section: 'HOOK', paragraphs: [{ tag: 'FACT', text: '가' }, { tag: 'FACT', text: '나' }] },
    { scene_number: 2, section: 'BODY', paragraphs: [{ tag: 'FACT', text: '다' }] },
  ];
  // 쉼을 일부러 제각각으로 둔다 — 0.85, 0.22. 둘 다 0.45 가 아니다.
  const timings = [
    { id: 'S01-P1', start: 0, end: 10, seconds: 10 },
    { id: 'S01-P2', start: 10.85, end: 20.85, seconds: 10 },
    { id: 'S02-P1', start: 21.07, end: 31.07, seconds: 10 },
  ];

  const out = applyTimings(scenes, timings);
  assert.equal(out[0].paragraphs[0].seconds, 10.85, '첫 문단이 실제 쉼(0.85)을 안 셉니다');
  assert.equal(out[0].paragraphs[1].seconds, 10.22, '둘째 문단이 실제 쉼(0.22)을 안 셉니다');
  // 마지막 문단 뒤에는 쉼이 없다. 그래도 조금 길게 잡는다 —
  // 화면이 소리보다 먼저 끝나면 검은 화면이 남는다.
  assert.equal(out[1].paragraphs[0].seconds, 10 + PAUSE_SECONDS);

  // ── 핵심 ── 길이를 더해 나간 자리가 실제 시각과 **똑같아야** 한다.
  // 여기가 어긋나면 그만큼 쇼츠가 잘린다.
  const flat = out.flatMap((sc) => sc.paragraphs);
  let cursor = 0;
  for (let i = 0; i < timings.length; i += 1) {
    assert.equal(cursor, timings[i].start, `${timings[i].id}: 계산한 시작이 실제와 다릅니다`);
    cursor = Math.round((cursor + flat[i].seconds) * 100) / 100;
  }

  // start/end 가 없는 예전 타이밍도 받아야 한다. NaN 이 되면 길이가
  // 0인 문단이 생긴다 — 실제로 한 번 그렇게 만들었다.
  const old = applyTimings(scenes, [
    { id: 'S01-P1', seconds: 10 },
    { id: 'S01-P2', seconds: 10 },
    { id: 'S02-P1', seconds: 10 },
  ]);
  for (const sc of old) {
    for (const par of sc.paragraphs) {
      assert.ok(Number(par.seconds) > 0, `길이가 0이 됐습니다: ${par.text}`);
    }
  }
});

test('타이밍이 없으면 장면을 건드리지 않는다', () => {
  const before = voiceScenes();
  assert.deepEqual(applyTimings(before, []), before);
  assert.deepEqual(applyTimings(before, null), before);
});

test('배경음악이 없어도 멈추지 않는다', () => {
  assert.deepEqual(loadTracks(path.join(TMP, '없는폴더')), []);
  assert.equal(pickTrack(voiceScenes(), [], {}), null);
});

test('장면 분위기에 맞는 곡을 고른다', () => {
  const tracks = [
    { file: 'calm.mp3', moods: ['calm'] },
    { file: 'dark.mp3', moods: ['mystery'] },
  ];
  assert.equal(pickTrack(voiceScenes(), tracks, { seed: 0 }).file, 'dark.mp3');
  // 맞는 분위기가 없으면 아무거나 쓴다 — 음악이 없는 것보다 낫다.
  assert.ok(pickTrack([{ mood: '없는분위기' }], tracks, { seed: 0 }));
});

test('같은 편은 늘 같은 곡, 다른 편은 다른 곡', () => {
  const tracks = [{ file: 'a.mp3', moods: [] }, { file: 'b.mp3', moods: [] }];
  assert.equal(pickTrack([], tracks, { seed: 3 }).file, pickTrack([], tracks, { seed: 3 }).file);
  assert.notEqual(pickTrack([], tracks, { seed: 2 }).file, pickTrack([], tracks, { seed: 3 }).file);
});

test('배경음악을 나레이션 밑으로 깐다', () => {
  const args = mixArgs({ voicePath: 'v.mp3', bgmPath: 'b.mp3', outputPath: 'o.mp3', seconds: 100 });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.ok(filter.includes(`volume=${BGM_GAIN_DB}dB`), '음량을 안 낮췄다');
  assert.ok(BGM_GAIN_DB <= -15, '음악이 나레이션을 덮는다');
  assert.ok(filter.includes('afade=t=in'), '페이드 인이 없다');
  assert.ok(filter.includes('afade=t=out'), '페이드 아웃이 없다');
  // 음악이 더 길어도 영상이 늘어나면 안 된다.
  assert.ok(filter.includes('duration=first'));
  assert.ok(args.includes('-stream_loop'), '음악이 짧으면 반복해야 한다');
});

test('출처 표기가 필요한 곡만 문구를 뽑는다', () => {
  assert.equal(attributionText({ attribution: '' }), '');
  assert.equal(attributionText(null), '');
  const text = attributionText({ attribution: 'Music: Dark Drone by Someone' });
  assert.ok(text.includes('Dark Drone'));
  // 보관함이 준 문구를 고치지 않고 그대로 넣어야 표기로 인정된다.
  assert.ok(text.includes('Music: Dark Drone by Someone'));
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
  // 영화 스틸컷 — 포토리얼이 아니어야 한다. 어설프게 사실적인 그림은
  // 싸구려로 보이고 실존 인물과 닮아버릴 위험도 커진다.
  assert.ok(STYLE_SUFFIX.includes('not photorealistic'), STYLE_SUFFIX);
  assert.ok(/cinematic|film still/.test(STYLE_SUFFIX));
  // 채널 색을 묶는 색감 지시
  assert.ok(/teal|desaturated/.test(STYLE_SUFFIX));
  // 실존 인물 금지가 들어 있어야 한다
  assert.ok(NEGATIVE_SUFFIX.includes('identifiable'));
});

test('시대마다 색감이 달라진다 — 시청자가 언제인지 알아보게', () => {
  const past = composeImagePrompt('a street', 'past');
  const future = composeImagePrompt('a street', 'future');
  assert.ok(past.includes('sepia'), past.slice(0, 60));
  assert.ok(/cold|blue-white/.test(future), future.slice(0, 60));
  assert.notEqual(past, future);
  // 시대를 안 주면 기본 톤만 붙는다. 깨지지 않아야 한다.
  assert.ok(composeImagePrompt('a street').includes(STYLE_SUFFIX));
  assert.ok(composeImagePrompt('a street', '없는시대').includes(STYLE_SUFFIX));
});

test('설명 안 되는 것은 빛으로만 그리라고 지시한다', () => {
  // 구체적인 UFO를 그리면 어설픈 CG가 되고 상상할 여지가 사라진다.
  const p = composeImagePrompt('a man looks up at the sky', 'anomaly');
  assert.ok(/light only/.test(p), p.slice(0, 120));
  assert.ok(/never a detailed object/.test(p));
});

test('모르는 시대 이름은 present 로 떨어진다 (렌더가 멈추지 않게)', () => {

  const r = mergeVisuals(
    { scene_number: 1, shots: [{ shot_id: 'S01-1' }] },
    { mood: 'mystery', visual_description: 'x', shots: [{ shot_id: 'S01-1', image_prompt: 'a room', video_prompt: '', era: '헬리콥터', camera: 'zoom in', motion_need: 3, depicts_real_person: false }] }
  );
  assert.equal(r.scene.shots[0].era, 'present');
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

const { pickShorts, SHORTS_MIN_SECONDS, SHORTS_MAX_SECONDS, spoilerSectionsFor } = await import('../src/video/shorts.mjs');

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

const { cameraFilter, PRESCALE, clipArgs, concatArgs, concatList, finishArgs, shortsArgs, escapeFilterPath } =
  await import('../src/video/ffmpeg.mjs');

test('카메라 움직임마다 프레임 수가 길이×fps와 맞는다', () => {
  for (const camera of ['zoom in', 'zoom out', 'pan left', 'pan right', 'slow camera shake', 'parallax']) {
    const f = cameraFilter(camera, { width: 1920, height: 1080, fps: 30, duration: 8 });
    assert.ok(f.includes('d=240'), `${camera}: d= 가 240이 아니다 — ${f}`);
    assert.ok(f.includes('s=1920x1080'), `${camera}: 출력 크기가 없다`);
    assert.ok(f.includes('fps=30'), `${camera}: fps가 없다`);
    // 계단과 끊김을 막으려고 먼저 키운다. 배수는 PRESCALE 이 정한다 —
    // 숫자를 여기 박아 두면 배수를 올릴 때 테스트가 막는다.
    assert.ok(
      f.startsWith(`scale=${1920 * PRESCALE}:${1080 * PRESCALE}`),
      `${camera}: 미리 ${PRESCALE}배로 키우지 않았다 — ${f.slice(0, 60)}`
    );
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

// voice --voices 는 **편과 무관한 명령**이다. 키가 살아 있는지 돈 안 쓰고
// 확인하는 유일한 수단이므로, 아직 만든 편이 하나도 없을 때도 돌아야 한다.
// 예전에는 --id 와 scenes.json 을 먼저 요구해서 바로 그 상황에서 못 썼다.
await asyncTest('voice --voices 는 --id 없이도 키 문제를 먼저 알려준다', async () => {
  const { execFileSync } = await import('node:child_process');
  const env = { ...process.env };
  delete env.GOOGLE_TTS_API_KEY;
  let out = '';
  try {
    execFileSync(process.execPath, ['src/main.mjs', 'voice', '--voices'], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.fail('키가 없으면 멈춰야 합니다');
  } catch (err) {
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  assert.ok(/GOOGLE_TTS_API_KEY/.test(out), `키 안내가 나와야 합니다: ${out}`);
  assert.ok(!/--id/.test(out), `--id 를 요구하면 안 됩니다: ${out}`);
});

// 실제 bgm/목록.json 을 검사한다.
//
// 곡을 추가하다 파일 이름을 한 글자 틀리면 **에러가 나지 않는다** —
// loadTracks 가 조용히 그 곡을 건너뛰고, 배경음악만 안 깔린 채 영상이
// 나온다. 영상을 끝까지 들어보기 전에는 모른다. 그래서 여기서 잡는다.
test('bgm 목록에 적힌 곡은 파일이 실제로 있다', () => {
  const dir = new URL('../bgm/', import.meta.url).pathname;
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '목록.json'), 'utf8'));
  const listed = manifest.tracks || [];
  assert.ok(listed.length > 0, '곡이 하나도 적혀 있지 않습니다');
  for (const t of listed) {
    assert.ok(fs.existsSync(path.join(dir, t.file)), `파일이 없습니다: ${t.file}`);
  }
  const usable = loadBgmTracks(dir);
  assert.equal(usable.length, listed.length, '적힌 곡과 쓸 수 있는 곡의 수가 다릅니다');
});

// 어떤 분위기가 나와도 곡이 하나는 걸려야 한다. 안 걸리면 pickTrack 이
// 전체 목록에서 고르므로 밝은 곡이 무거운 장면에 깔릴 수 있다.
test('장면 분위기 6종이 모두 어떤 곡엔가 걸려 있다', () => {
  const dir = new URL('../bgm/', import.meta.url).pathname;
  const tracks = loadBgmTracks(dir);
  for (const mood of SCENE_MOODS) {
    const matching = tracks.filter((t) => (t.moods || []).includes(mood));
    assert.ok(matching.length > 0, `'${mood}' 분위기에 걸리는 곡이 없습니다`);
  }
});

// 워크플로의 「실행」 단계가 코드가 읽는 비밀값을 전부 넘기는지 본다.
//
// 실제로 당한 사고: GOOGLE_TTS_API_KEY 를 「이미지 토큰 확인」 단계에만
// 적어 두고 「실행」 단계에 빠뜨렸다. 등록 확인 단계는 초록으로 통과하고
// 정작 node 를 돌리는 단계에서 "키가 없습니다"로 죽었다. 확인 단계가
// 통과했으니 키 문제가 아니라고 착각하기 딱 좋은 모양이었다.
test('워크플로 실행 단계가 코드가 읽는 비밀값을 모두 넘긴다', () => {
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  // 「실행」 단계의 env 블록만 떼어 낸다 (다음 단계가 시작되기 전까지).
  const start = yml.indexOf('- name: 실행');
  assert.ok(start > 0, '「실행」 단계를 찾지 못했습니다');
  const body = yml.slice(start, yml.indexOf('\n      - name:', start + 1));
  for (const key of ['ANTHROPIC_API_KEY', 'REPLICATE_API_TOKEN', 'GOOGLE_TTS_API_KEY']) {
    assert.ok(
      body.includes(`${key}: \${{ secrets.${key} }}`),
      `「실행」 단계에 ${key} 가 없습니다 — 등록 확인은 통과하고 실행에서 죽습니다`
    );
  }
});

// 실행 #11 이 여기서 죽었다.
//
// 음성을 만들고 나면 샷 길이는 **실제 음성**에 맞춰진다. 그런데 검사는
// totalSeconds() — 글자 수로 계산하는 추정치 — 와 비교하고 있었다. 맞춘
// 것을 틀렸다고 판정하고 멈춘 것이다. 그림 66장과 음성을 다 만든 뒤였다.
await asyncTest('음성을 만든 뒤에는 추정치가 아니라 실제 길이와 비교한다', async () => {
  const { applyTimings, PAUSE_SECONDS } = await import('../src/audio/narrate.mjs');

  // 글자 수 추정치와 실제 음성 길이가 다른 상황을 만든다. 한국어는 글자마다
  // 읽는 속도가 달라서 실제로 늘 다르다.
  const scenes = [];
  const timings = [];
  let spoken = 0;
  let units = 0;
  for (let n = 1; n <= 6; n++) {
    const paragraphs = [];
    for (let i = 1; i <= 3; i++) {
      const seconds = 11 + ((n + i) % 5); // 추정치와 겹치지 않는 값
      const id = `S0${n}-P${i}`;
      paragraphs.push({ text: '가'.repeat(60), seconds: 10 });
      timings.push({ id, scene_number: n, section: 'BODY', seconds });
      spoken += seconds;
      units++;
    }
    scenes.push({
      scene_number: n,
      section: 'BODY',
      duration: 30,
      paragraphs,
      shots: [
        { shot_id: `S0${n}-01`, asset_type: 'IMAGE', duration: 15, camera: 'zoom in' },
        { shot_id: `S0${n}-02`, asset_type: 'IMAGE', duration: 15, camera: 'pan right' },
      ],
    });
  }

  // 실제 voice.mp3 길이 = 말한 시간 + 문단 사이 쉼 (마지막 뒤에는 없다)
  const realSeconds = spoken + (units - 1) * PAUSE_SECONDS;
  const fitted = applyTimings(scenes, timings);

  const withReal = buildTimeline(fitted, { format: FORMATS.wide, narrationSeconds: realSeconds });
  assert.deepEqual(withReal.problems, [], `실제 길이와는 맞아야 합니다: ${withReal.problems.join(' / ')}`);
  assert.equal(withReal.narration_seconds, Math.round(realSeconds * 100) / 100);

  // 같은 장면을 추정치와 비교하면 어긋난다 — 고치기 전의 동작이다.
  const withEstimate = buildTimeline(fitted, { format: FORMATS.wide });
  assert.ok(
    withEstimate.narration_seconds !== withReal.narration_seconds,
    '이 테스트는 추정치와 실제가 다른 상황을 가정합니다'
  );
});

// 돈이 두 번 나가지 않게 막는 장치.
//
// 서버는 실행마다 지워지므로, 뒤 단계에서 실패하면 앞에서 **산 것**이 같이
// 사라진다. 결과물을 되돌려 놓고 다시 돌릴 때 같은 것을 또 사면 안 된다.
await asyncTest('이미 만든 것이 있으면 돈 쓰는 단계를 건너뛴다', async () => {
  const { execFileSync } = await import('node:child_process');
  const root = new URL('../', import.meta.url).pathname;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
  const dir = path.join(data, 'content', '001');
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });

  const scenes = [{
    scene_number: 1, section: 'HOOK', duration: 20,
    paragraphs: [{ text: '가'.repeat(40), seconds: 20 }],
    shots: [
      { shot_id: 'S01-01', asset_type: 'IMAGE', duration: 10, camera: 'zoom in' },
      { shot_id: 'S01-02', asset_type: 'IMAGE', duration: 10, camera: 'static' },
    ],
  }];
  fs.writeFileSync(path.join(dir, 'scenes.json'), JSON.stringify({ scenes, problems: [] }));
  fs.writeFileSync(path.join(dir, 'script.md'), '# 대본\n');
  for (const sid of ['S01-01', 'S01-02']) fs.writeFileSync(path.join(dir, 'assets', `${sid}.png`), 'x');
  fs.writeFileSync(path.join(dir, 'audio', 'voice.mp3'), 'x');
  fs.writeFileSync(
    path.join(dir, 'audio', 'timings.json'),
    JSON.stringify({ total_seconds: 20, count: 1, timings: [{ id: 'S01-P1', scene_number: 1, seconds: 20 }] })
  );

  // 키를 **전부 빼고** 돌린다. 하나라도 사려 들면 여기서 죽는다.
  const env = { ...process.env, AI_SURPRISE_DATA_DIR: data };
  delete env.ANTHROPIC_API_KEY;
  delete env.REPLICATE_API_TOKEN;
  delete env.GOOGLE_TTS_API_KEY;

  const out = execFileSync(
    process.execPath,
    ['src/main.mjs', 'auto', '--resume=001', '--scenes', '--images', '--narrate', '--dry-run'],
    { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );

  for (const what of ['scenes.json', '그림 2장', 'voice.mp3']) {
    assert.ok(out.includes(what), `${what} 을 건너뛴다고 알려야 합니다:\n${out}`);
  }
  assert.equal((out.match(/돈을 아낍니다/g) || []).length, 3, `세 단계 모두 건너뛰어야 합니다:\n${out}`);
  fs.rmSync(data, { recursive: true, force: true });
});

// 이어할 편이 없는데 이어하라고 하면, 조용히 새로 만들지 말고 멈춰야 한다.
// 새로 만들면 효성님은 "이어했다"고 믿는데 실제로는 돈이 다 나간다.
await asyncTest('이어할 대본이 없으면 새로 만들지 않고 멈춘다', async () => {
  const { execFileSync } = await import('node:child_process');
  const root = new URL('../', import.meta.url).pathname;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-none-'));
  const env = { ...process.env, AI_SURPRISE_DATA_DIR: data };
  delete env.ANTHROPIC_API_KEY;
  let out = '';
  try {
    execFileSync(process.execPath, ['src/main.mjs', 'auto', '--resume=001', '--scenes'], {
      cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.fail('멈춰야 합니다');
  } catch (err) {
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  assert.ok(/script\.md 이 없습니다/.test(out), `무엇이 없는지 말해야 합니다: ${out}`);
});

// 멈춘 단계가 한나절 돌지 않게.
//
// ffmpeg 설치(실측 24초)가 한 번 25분을 멈춰 있었다. 그대로 두면 GitHub
// 기본값인 6시간을 다 쓴다. 효성님은 그동안 기다리기만 한다.
test('워크플로에 시간 제한이 걸려 있다', () => {
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  // 같은 키가 두 번 있으면 GitHub 이 워크플로 자체를 거부한다 — 실행이
  // 0초 만에 실패하고 아무 단계도 돌지 않는다. 실제로 그렇게 한 번
  // 날렸다. 파이썬 yaml 검사는 중복 키를 통과시키므로 여기서 센다.
  const jobLines = yml.split('\n').filter((l) => /^    timeout-minutes: \d+$/.test(l));
  assert.equal(jobLines.length, 1, `잡 상한이 ${jobLines.length}번 있습니다 (1이어야 합니다)`);
  const job = /\n    timeout-minutes: (\d+)/.exec(yml);
  assert.ok(job, '잡 전체에 timeout-minutes 가 없습니다 (기본 6시간)');
  assert.ok(Number(job[1]) <= 180, `잡 상한이 너무 깁니다: ${job[1]}분`);

  const start = yml.indexOf('- name: ffmpeg와 한글 글꼴 설치');
  assert.ok(start > 0, 'ffmpeg 설치 단계를 찾지 못했습니다');
  const body = yml.slice(start, yml.indexOf('\n      - name:', start + 1));
  const step = /timeout-minutes: (\d+)/.exec(body);
  assert.ok(step, 'ffmpeg 설치 단계에 timeout-minutes 가 없습니다');
  assert.ok(Number(step[1]) <= 15, `설치 상한이 너무 깁니다: ${step[1]}분`);
});

// 화면이 중간에 멈추지 않게.
//
// 실제 영상을 보고 발견했다. 예전에는 프레임당 고정량(0.0012)을 더해
// 확대했는데, 한계(1.3배)에 먼저 닿는 클립은 **남은 시간 동안 완전히
// 정지**했다. 10초 클립이면 마지막 1.6초가 멈춰 있었다.
//
// 여기서는 식만 본다. 진짜 매끄러운지는 렌더해서 재야 하고, 그건
// tools/움직임-재보기.mjs 가 한다 (클립당 25초라 여기 넣지 않았다).
await asyncTest('모든 카메라 움직임이 클립 길이에 맞춰 퍼진다', async () => {
  const frames = 300;
  for (const camera of IMAGE_CAMERA_MOVES) {
    const f = cameraFilter(camera, { width: 1920, height: 1080, fps: 30, duration: 10 });
    assert.ok(
      f.includes(`/${frames}`),
      `${camera}: 길이로 나누지 않습니다 — 긴 클립에서 중간에 멈춥니다\n${f}`
    );
    // zoom+0.001 처럼 앞 프레임 값에 더하는 꼴은 한계에 닿으면 멈춘다.
    assert.ok(
      !/zoom\s*[+-]\s*0?\./.test(f),
      `${camera}: 프레임마다 더하는 방식입니다 — 한계에 닿으면 멈춥니다\n${f}`
    );
  }
});

// zoompan 은 자를 위치를 정수로만 계산한다. 미리 크게 키워 두지 않으면
// 느린 움직임이 같은 정수로 반올림되어 툭툭 멈춘다. 2배에서 pan 의
// 16.7%가 멈췄고 4배에서 0%가 됐다 — 실측값이다.
test('앞확대가 4배 이상이다 (느린 움직임이 정수로 뭉개지지 않게)', () => {
  assert.ok(PRESCALE >= 4, `앞확대가 ${PRESCALE}배입니다. 4배 아래면 pan 이 끊깁니다.`);
  const f = cameraFilter('pan right', { width: 1920, height: 1080, fps: 30, duration: 10 });
  assert.ok(f.includes(`scale=${1920 * PRESCALE}:${1080 * PRESCALE}`), `앞확대가 식에 반영되지 않았습니다:\n${f}`);
});

// 흔들림은 배율이 고정이면 사인파 꼭대기에서 멈춘다 (실측 40%).
// 아주 약한 확대를 밑에 깔아 항상 움직이게 한다.
test('흔들림에도 밑에 깔린 움직임이 있다', () => {
  const f = cameraFilter('slow camera shake', { width: 1920, height: 1080, fps: 30, duration: 10 });
  assert.ok(!/zoompan=z=[\d.]+:/.test(f), `배율이 고정입니다 — 사인파 꼭대기에서 멈춥니다:\n${f}`);
});

// 목소리 고르기.
//
// 첫 완성본의 나레이션이 "너무 딱딱하다"는 말을 듣고 넣었다. 이름만 보고
// 바꾸면 $3짜리 완성본을 돌려서야 톤을 안다.
await asyncTest('들어볼 목소리에 지금 쓰는 것이 반드시 들어간다', async () => {
  const { pickSampleVoices, sampleFileName, SAMPLE_TEXT } = await import('../src/audio/sample.mjs');
  const available = [
    { name: 'ko-KR-Neural2-C' }, { name: 'ko-KR-Chirp3-HD-Charon' },
    { name: 'ko-KR-Chirp3-HD-Umbriel' }, { name: 'ko-KR-Wavenet-C' },
    { name: 'ko-KR-Standard-A' },
  ];
  const picked = pickSampleVoices(available, { current: 'ko-KR-Neural2-C' });
  // 비교 대상이 없으면 "전보다 나은가"를 판단할 수 없다.
  assert.ok(picked.includes('ko-KR-Neural2-C'), '지금 쓰는 목소리가 빠졌습니다');
  assert.ok(picked.length > 1, '비교할 후보가 없습니다');
  assert.equal(new Set(picked).size, picked.length, '같은 목소리가 두 번 들어갔습니다');
  // 목록에 없는 이름을 부르면 합성이 실패한다.
  for (const v of picked) assert.ok(available.some((a) => a.name === v), `쓸 수 없는 목소리: ${v}`);

  assert.ok(SAMPLE_TEXT.length > 40, '들어볼 문장이 너무 짧으면 톤을 판단할 수 없습니다');
  assert.ok(!/[/\\]/.test(sampleFileName('ko-KR-Chirp3-HD-Charon', 0.95)), '파일 이름에 경로 문자가 들어갔습니다');
});

// Chirp 계열에 pitch 를 보내면 합성 전체가 거부될 수 있다. 문서가 엇갈려
// 확실하지 않으므로 보내지 않는다 — 안 보내도 중립 음높이일 뿐이다.
await asyncTest('Chirp 목소리에는 pitch 를 보내지 않는다', async () => {
  const { supportsPitch, createClient } = await import('../src/audio/tts.mjs');
  assert.equal(supportsPitch('ko-KR-Chirp3-HD-Charon'), false);
  assert.equal(supportsPitch('ko-KR-Neural2-C'), true);

  const sent = [];
  const fakeFetch = async (url, init) => {
    sent.push(JSON.parse(init.body));
    const payload = JSON.stringify({ audioContent: Buffer.from('x').toString('base64') });
    return { ok: true, status: 200, text: async () => payload, json: async () => JSON.parse(payload) };
  };
  const client = createClient({ apiKey: 'test', fetchFn: fakeFetch });
  await client.synthesize('안녕하세요 시험입니다', { voice: 'ko-KR-Chirp3-HD-Charon' });
  await client.synthesize('안녕하세요 시험입니다', { voice: 'ko-KR-Neural2-C' });
  assert.equal('pitch' in sent[0].audioConfig, false, 'Chirp 에 pitch 를 보냈습니다');
  assert.equal('pitch' in sent[1].audioConfig, true, 'Neural2 에는 pitch 를 보내야 합니다');
});

// 목소리를 바꿨는데 옛 음성이 그대로 쓰이면, 바꾼 줄 알고 있다가
// 완성본에서야 안 바뀐 걸 알게 된다. 그때는 영상까지 다 만든 뒤다.
await asyncTest('목소리를 바꾸면 이미 있는 음성이어도 다시 만든다', async () => {
  const { execFileSync } = await import('node:child_process');
  const root = new URL('../', import.meta.url).pathname;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-swap-'));
  const dir = path.join(data, 'content', '001');
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scenes.json'), JSON.stringify({
    scenes: [{
      scene_number: 1, section: 'HOOK', duration: 10,
      paragraphs: [{ text: '가'.repeat(30), seconds: 10 }],
      shots: [{ shot_id: 'S01-01', asset_type: 'IMAGE', duration: 10, camera: 'zoom in' }],
    }],
    problems: [],
  }));
  fs.writeFileSync(path.join(dir, 'audio', 'voice.mp3'), 'x');
  fs.writeFileSync(path.join(dir, 'audio', 'timings.json'), JSON.stringify({
    voice: 'ko-KR-Neural2-C', total_seconds: 10, count: 1,
    timings: [{ id: 'S01-P1', scene_number: 1, seconds: 10 }],
  }));

  const env = { ...process.env, AI_SURPRISE_DATA_DIR: data };
  delete env.GOOGLE_TTS_API_KEY;
  delete env.TTS_VOICE;

  // 같은 목소리면 건너뛴다 — 키가 없어도 성공해야 한다.
  const same = execFileSync(process.execPath,
    ['src/main.mjs', 'voice', '--id=001', '--voice=ko-KR-Neural2-C'],
    { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.ok(/다시 만들지 않습니다/.test(same), `같은 목소리는 건너뛰어야 합니다:\n${same}`);

  // 다른 목소리면 다시 만들려 들고, 키가 없으니 키를 달라고 멈춘다.
  let out = '';
  try {
    execFileSync(process.execPath,
      ['src/main.mjs', 'voice', '--id=001', '--voice=ko-KR-Chirp3-HD-Iapetus'],
      { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.fail('키가 없으면 멈춰야 합니다');
  } catch (err) {
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  assert.ok(/목소리가 다르므로 다시 만듭니다/.test(out), `바뀐 것을 알아채야 합니다:\n${out}`);
  assert.ok(!/다시 만들지 않습니다/.test(out), `건너뛰면 안 됩니다:\n${out}`);
  fs.rmSync(data, { recursive: true, force: true });
});

// 효성님이 샘플을 듣고 고른 목소리. 바뀌면 영상 톤이 통째로 달라지므로
// 모르는 사이에 바뀌지 않게 못 박는다.
await asyncTest('기본 목소리가 효성님이 고른 것으로 되어 있다', async () => {
  const { DEFAULT_VOICE, DEFAULT_SPEAKING_RATE } = await import('../src/audio/tts.mjs');
  assert.equal(DEFAULT_VOICE, 'ko-KR-Chirp3-HD-Iapetus');
  assert.equal(DEFAULT_SPEAKING_RATE, 0.95);
});

// 말투가 딱딱한지 숫자로 본다.
//
// 첫 완성본을 듣고 "너무 딱딱하다"는 말이 나왔다. 규칙만 바꿔 두면 다음에
// AI 가 슬그머니 다큐체로 돌아가도 영상을 끝까지 들어보기 전에는 모른다.
await asyncTest('다큐체와 구어체를 숫자로 가른다', async () => {
  const { toneStats, SPOKEN_ENDING_MIN, LONG_SENTENCE_MAX_RATIO } = await import('../src/script/write.mjs');

  const 다큐체 =
    '1958년 4월 키예프의 한 거리에서 촬영된 것으로 알려진 이 사진에는 당시로서는 ' +
    '존재하지 않았던 물건을 손에 든 남자가 찍혀 있었다. 이 사진은 오랫동안 진위 논란의 ' +
    '대상이 되어 왔다. 전문가들은 해당 물건이 현대의 휴대전화와 유사하다고 분석하였다. ' +
    '그러나 이를 뒷받침하는 1차 기록은 발견되지 않았다.';
  const 구어체 =
    '1958년 4월, 키예프의 어느 거리였어요. 사진 한 장이 찍혔습니다. ' +
    '남자가 손에 뭔가를 들고 있었는데요. 작고, 검은 물건이었습니다. ' +
    '그런데 그게 문제였거든요. 그 물건은 당시에 존재하지 않았습니다. ' +
    '왜 아무도 그 날짜를 확인해 보지 않았을까요?';

  const a = toneStats(다큐체);
  const b = toneStats(구어체);

  // 다큐체는 두 기준 모두 걸려야 한다.
  assert.ok(a.spokenRatio < SPOKEN_ENDING_MIN, `다큐체를 못 잡습니다: 입말 ${a.spokenRatio}`);
  assert.ok(a.longRatio > LONG_SENTENCE_MAX_RATIO, `긴 문장을 못 잡습니다: ${a.longRatio}`);

  // 구어체는 둘 다 통과해야 한다. 잘못 잡으면 좋은 대본이 경고를 달고 나온다.
  assert.ok(b.spokenRatio >= SPOKEN_ENDING_MIN, `구어체를 잘못 잡습니다: 입말 ${b.spokenRatio}`);
  assert.ok(b.longRatio <= LONG_SENTENCE_MAX_RATIO, `구어체를 잘못 잡습니다: 긴문장 ${b.longRatio}`);

  assert.deepEqual(toneStats('').sentences, 0, '빈 글에도 죽지 않아야 합니다');
});

// 프롬프트가 실제로 구어체를 시키는지. 여기가 다시 다큐체로 돌아가면
// 위 숫자 검사는 경고만 낼 뿐 막지 못한다.
await asyncTest('대본 규칙이 구어체와 궁금증을 요구한다', async () => {
  const { SCRIPT_SYSTEM } = await import('../src/script/write.mjs');
  for (const must of ['거든요', '잖아요', '짧게 끊는다', '궁금']) {
    assert.ok(SCRIPT_SYSTEM.includes(must), `규칙에 "${must}" 가 없습니다`);
  }
  // 낚시 금지 — 궁금하게 만들라고만 하고 답하라고 안 하면 정책 위험이 된다.
  assert.ok(SCRIPT_SYSTEM.includes('반드시 답한다'), '던진 질문에 답하라는 규칙이 없습니다');
  // 말투가 풀렸다고 사실까지 풀리면 안 된다.
  assert.ok(SCRIPT_SYSTEM.includes('지어내도 된다는 뜻이 아니다'), '사실 규칙이 느슨해졌습니다');
  // 예전 다큐체 지시가 남아 있으면 안 된다.
  assert.ok(!SCRIPT_SYSTEM.includes('차분한 다큐멘터리 나레이션'), '다큐체 지시가 남아 있습니다');
});

// 훅 길이.
//
// 첫 구어체 대본의 훅이 141자(약 26초)로 나왔다. 프롬프트에 **길이를 아예
// 적지 않았기 때문**이다. 예시만 주고 숫자를 안 주면 AI 는 길게 쓴다.
await asyncTest('프롬프트와 검사가 같은 훅 길이를 본다', async () => {
  const { buildScriptPrompt, validateScript, HOOK_CHARS_TARGET, HOOK_CHARS_MAX } =
    await import('../src/script/write.mjs');

  assert.ok(HOOK_CHARS_TARGET < HOOK_CHARS_MAX, '목표가 상한보다 커서는 안 됩니다');
  assert.ok(HOOK_CHARS_MAX <= 90, `상한 ${HOOK_CHARS_MAX}자는 첫 10초에 못 들어갑니다`);

  // 숫자를 프롬프트에 **직접** 적어야 한다. 예시만으로는 AI 가 길게 쓴다.
  const prompt = buildScriptPrompt({ title: '시험' }, { targetMinutes: 8 });
  assert.ok(prompt.includes(`${HOOK_CHARS_TARGET}자 안팎`), '프롬프트에 목표 길이가 없습니다');
  assert.ok(prompt.includes(`${HOOK_CHARS_MAX}자를 넘기지`), '프롬프트에 상한이 없습니다');

  // 프롬프트의 예시가 옛 다큐체면 AI 를 그쪽으로 끌고 간다.
  assert.ok(!prompt.includes('호텔에 들어왔습니다'), '예시가 옛 다큐체 그대로입니다');
  assert.ok(/있었어요|거든요|습니다/.test(prompt), '예시가 비어 있습니다');
});

// 프롬프트가 "48자입니다"라고 적어 두고 실제로는 다른 길이면, AI 에게
// 틀린 기준을 주는 것이다. 세어서 맞춘다.
await asyncTest('프롬프트 예시에 적은 글자 수가 실제와 같다', async () => {
  const { buildScriptPrompt } = await import('../src/script/write.mjs');
  const { countNarrationChars } = await import('../src/narration.mjs');
  const prompt = buildScriptPrompt({ title: '시험' }, { targetMinutes: 8 });

  // 예시는 따옴표로 묶인 두 줄이다. 그 뒤에 (N자입니다) 가 온다.
  const claimed = /\((\d+)자입니다/.exec(prompt);
  assert.ok(claimed, '예시 길이를 적어두지 않았습니다');
  const quoted = /"([\s\S]*?)"/.exec(prompt.slice(prompt.indexOf('이런 식입니다')));
  assert.ok(quoted, '예시 문장을 찾지 못했습니다');
  const real = countNarrationChars(quoted[1].replace(/\s+/g, ' '));
  assert.equal(
    Number(claimed[1]), real,
    `프롬프트는 ${claimed[1]}자라고 적었는데 실제로는 ${real}자입니다`
  );
});

// 길면 알려주고, 알맞으면 조용해야 한다. 잘못 잡으면 좋은 대본이 경고를 단다.
await asyncTest('긴 훅은 알려주고 짧은 훅은 통과시킨다', async () => {
  const { validateScript, SECTIONS, HOOK_CHARS_MAX } = await import('../src/script/write.mjs');
  const body = (hook) =>
    SECTIONS.map((sec) =>
      `## [${sec.key}] ${sec.label}\n\n[FACT] ${sec.key === 'HOOK' ? hook : '가'.repeat(200)}\n`
    ).join('\n');

  const 긴훅 =
    '신분증에는 1932년생이라고 적혀 있었다고 해요. 그런데 그걸 가진 사람은 청년이었습니다. ' +
    '2006년 4월, 키이우에서 있었다고 전해지는 이야기예요. 영어권에서는 가장 설득력 있는 ' +
    '시간여행자 이야기라고 부르기도 했거든요.';
  const 짧은훅 = '신분증에는 1932년생이라고 적혀 있었어요. 그런데 그걸 들고 있던 사람은, 스물몇 살짜리 청년이었습니다.';

  const long = validateScript(body(긴훅), { targetMinutes: 8 });
  const short = validateScript(body(짧은훅), { targetMinutes: 8 });
  const hookWarn = (r) => r.warnings.filter((w) => w.startsWith('HOOK이'));

  assert.equal(hookWarn(long).length, 1, `긴 훅을 못 잡습니다:\n${long.warnings.join('\n')}`);
  assert.equal(hookWarn(short).length, 0, `짧은 훅을 잘못 잡습니다:\n${short.warnings.join('\n')}`);
  assert.ok(hookWarn(long)[0].includes('초'), '몇 초인지 알려줘야 고칠 수 있습니다');
});


// ─────────────────────────────────────────────────────────────
// 올릴 거리 — 제목·썸네일·설명문·태그 (Phase 6)
// ─────────────────────────────────────────────────────────────
//
// 여기서 막아야 하는 것은 "제목이 심심한가"가 아니다. 그건 효성님이 보고
// 고르면 된다. 코드가 막아야 하는 것은 **처벌이 삭제인 실수**다 —
// 영상에 없는 것을 약속하는 제목, 화면 밖으로 나가는 썸네일 글자,
// 빠진 AI 합성 고지.

const {
  TITLE_CHARS_MAX,
  UPLOAD_SCHEMA,
  filterCandidates,
  finishDescription,
  buildUploadPrompt,
  channelNameFor,
  uploadSystemFor,
} = await import('../src/upload/pack.mjs');
const {
  THUMB_WIDTH,
  THUMB_HEIGHT,
  MAX_LINE_CHARS,
  LINE_BOX,
  layoutText,
  thumbnailArgs,
  pickThumbnailMoments,
} = await import('../src/upload/thumbnail.mjs');

test('두 줄이 어떤 길이여도 화면 안에 들어간다', () => {
  // 처음에 아랫줄이 잘렸다. y 계산이 글자 상자 높이를 빼먹었기 때문이다.
  // 눈으로 한 번 확인하는 것으로는 다음에 또 잘린다.
  const cases = [
    ['1958년 신분증', '2006년의 청년'],
    ['가', '나'],
    ['열세글자를다채운줄', '여기도열세글자를다'],
    ['짧다', '여기만열세글자다아'],
    ['한 줄만 있는 경우', null],
  ];
  for (const [a, b] of cases) {
    const L = layoutText(a, b);
    assert.ok(L.y1 >= L.bandY, `"${a}" 윗줄이 띠 위로 올라갔습니다 (y1=${L.y1}, bandY=${L.bandY})`);
    assert.ok(L.bottom <= THUMB_HEIGHT, `"${a}/${b}" 가 ${L.bottom}px 로 화면(${THUMB_HEIGHT})을 넘습니다`);
    if (b) assert.ok(L.y2 > L.y1, '아랫줄이 윗줄보다 위에 있습니다');
  }
});

test('아랫줄이 윗줄보다 크지 않다', () => {
  // 아랫줄이 더 크면 어디를 먼저 읽어야 할지 알 수 없다.
  const L = layoutText('아주 긴 윗줄을 넣는다', '짧다');
  assert.ok(L.size2 <= L.size1, `아랫줄(${L.size2})이 윗줄(${L.size1})보다 큽니다`);
});

test('글자 상자 높이를 1보다 크게 잡는다 (한글 받침)', () => {
  // 1.0 으로 두면 받침이 아래 줄과 겹친다.
  assert.ok(LINE_BOX > 1, '한글은 글자 크기보다 세로로 더 차지합니다');
});

test('썸네일 글자를 명령줄이 아니라 파일로 넘긴다', () => {
  const args = thumbnailArgs({
    videoPath: '/x/final.mp4',
    seconds: 12.5,
    line1: "1958년 '신분증'",
    line2: '2006년: 청년',
    line1File: '/x/.line1-0.txt',
    line2File: '/x/.line2-0.txt',
    outputPath: '/x/thumb-1.jpg',
  });
  const vf = args[args.indexOf('-vf') + 1];
  assert.ok(vf.includes('textfile='), 'textfile 로 넘기지 않습니다');
  // drawtext= 자체에도 "text=" 가 들어 있으므로 옵션 자리의 text= 만 본다.
  assert.ok(!/[,:]text=/.test(vf), '글자를 필터에 직접 박으면 한글·따옴표에서 깨집니다');
  // 따옴표와 콜론이 들어간 글자가 필터 문법을 깨뜨리지 않아야 한다.
  assert.ok(!vf.includes("'신분증'"), '글자가 필터 안에 그대로 들어갔습니다');
});

test('썸네일은 유튜브 규격으로 자른다', () => {
  const args = thumbnailArgs({
    videoPath: '/x/final.mp4', line1: '가', line1File: '/x/a.txt', outputPath: '/x/t.jpg',
  });
  const vf = args[args.indexOf('-vf') + 1];
  assert.ok(vf.includes(`crop=${THUMB_WIDTH}:${THUMB_HEIGHT}`), `${THUMB_WIDTH}x${THUMB_HEIGHT} 로 자르지 않습니다`);
  assert.equal(args[args.indexOf('-frames:v') + 1], '1', '한 장만 뽑아야 합니다');
  // -ss 가 -i 보다 앞에 있어야 빨리 찾아간다.
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'), '-ss 가 -i 뒤에 있으면 긴 영상에서 느립니다');
});

test('아랫줄이 없으면 글자를 한 번만 그린다', () => {
  const args = thumbnailArgs({
    videoPath: '/x/f.mp4', line1: '한 줄', line1File: '/x/a.txt', outputPath: '/x/t.jpg',
  });
  const vf = args[args.indexOf('-vf') + 1];
  assert.equal((vf.match(/drawtext/g) || []).length, 1);
});

test('낚시 제목과 긴 제목을 거른다', () => {
  const r = filterCandidates({
    titles: [
      { text: '1958년 신분증을 들고 2006년에 나타난 남자', why: '대본 4단락' },
      { text: '충격 실화! 시간여행자의 진실 공개!!!', why: '' },
      { text: '가'.repeat(TITLE_CHARS_MAX + 1), why: '' },
    ],
  });
  assert.equal(r.titles.length, 1, `남긴 제목: ${r.titles.map((t) => t.text).join(' / ')}`);
  assert.equal(r.droppedTitles.length, 2);
  // 왜 걸렀는지 말해 줘야 다시 쓸 수 있다.
  for (const d of r.droppedTitles) assert.ok(d.problems.length, `${d.text} 를 이유 없이 걸렀습니다`);
  assert.ok(r.droppedTitles.some((d) => d.problems.some((p) => p.includes(`${TITLE_CHARS_MAX}자`))));
});

test('화면을 넘길 썸네일 문구를 거른다', () => {
  const r = filterCandidates({
    thumbnails: [
      { line1: '1958년 신분증', line2: '2006년의 청년' },
      { line1: '가'.repeat(MAX_LINE_CHARS + 1), line2: '나' },
    ],
  });
  assert.equal(r.thumbnails.length, 1);
  assert.equal(r.droppedThumbs.length, 1);
  assert.ok(r.droppedThumbs[0].problems[0].includes(`${MAX_LINE_CHARS}자`));
});

test('설명문에 AI 합성 고지가 반드시 들어간다', () => {
  // 고지를 AI 에게 부탁하지 않는 이유: 한 번 빠지면 계정 정지다.
  const d = finishDescription('1958년 신분증 이야기입니다.', {});
  assert.ok(d.includes('AI로 만든 이미지'), `고지가 없습니다:\n${d}`);
  assert.ok(d.includes(SYNTHETIC_DISCLOSURE.text.split('\n')[0]));
});

test('설명문에 내부용 경고 문구를 넣지 않는다', () => {
  // SYNTHETIC_DISCLOSURE.why 는 효성님에게 하는 말이다. 시청자가
  // "계정 정지 대상입니다"를 읽으면 안 된다.
  const d = finishDescription('본문', {});
  assert.ok(!d.includes('계정 정지'), `시청자에게 보일 글에 내부 경고가 들어갔습니다:\n${d}`);
  assert.ok(!d.includes(SYNTHETIC_DISCLOSURE.why));
});

test('배경음악 출처와 참고 자료를 코드가 붙인다', () => {
  const d = finishDescription('본문', {
    track: { title: 'Dark Hallway', attribution: 'Dark Hallway — Audio Library' },
    sources: [{ name: '키이우 경찰 기록', url: 'https://example.org/a' }],
  });
  assert.ok(d.includes('Dark Hallway — Audio Library'), '음악 출처가 빠졌습니다');
  assert.ok(d.includes('https://example.org/a'), '참고 자료가 빠졌습니다');
});

test('출처 표기가 없는 곡은 제목만 적는다', () => {
  const d = finishDescription('본문', { track: { title: 'Quiet Room', attribution: '' } });
  assert.ok(d.includes('Quiet Room'));
});

test('제목 프롬프트가 대본 전문을 함께 넘긴다', () => {
  // 대본을 안 주면 AI 는 영상에 없는 것을 약속하게 된다.
  const p = buildUploadPrompt(
    { title: '세르게이 포노마렌코', kind: 'EVENT', what_is_strange: '1958년 신분증' },
    { scriptMarkdown: '## [HOOK] 훅\n\n[FACT] 신분증에는 1932년생이라고', minutes: 8.2 }
  );
  assert.ok(p.includes('[FACT] 신분증에는'), '대본이 프롬프트에 없습니다');
  assert.ok(p.includes('삭제'), '제목을 과장하면 어떻게 되는지 알려주지 않습니다');
});

test('전설 편에는 단정하지 말라고 따로 알려준다', () => {
  const legend = buildUploadPrompt({ title: 'x', kind: 'LEGEND' }, {});
  const event = buildUploadPrompt({ title: 'x', kind: 'EVENT' }, {});
  assert.ok(legend.includes('추적'), '전설 편 지시가 없습니다');
  assert.ok(!event.includes('"실화"라고 단정'));
});

test('동화는 "사건 편"이라고 적지 않는다', () => {
  // 3화(숨바꼭질)에서 설명문에 "마지막 장 | 사건 편"이 나왔다.
  // 지어낸 이야기를 사건이라고 적으면 보는 사람이 실화로 읽는다.
  const tale = buildUploadPrompt({ title: 'x', kind: 'TALE' }, {});
  assert.ok(tale.includes('창작 동화 편'), '동화 종류 표기가 없습니다');
  assert.ok(!tale.includes('사건 편'), '동화를 사건 편이라고 적었습니다');
});

test('썸네일 지점을 서로 떨어뜨려 고른다', () => {
  const scenes = [
    { duration: 40, mood: 'calm', section: 'HOOK' },
    { duration: 40, mood: 'twist', section: 'TWIST' },
    { duration: 40, mood: 'tension', section: 'DIG' },
    { duration: 40, mood: 'mystery', section: 'DIG' },
    { duration: 40, mood: 'twist', section: 'TWIST' },
    { duration: 40, mood: 'somber', section: 'CLOSE' },
  ];
  const picked = pickThumbnailMoments(scenes, { count: 3, minGap: 20 });
  assert.equal(picked.length, 3);
  for (let i = 1; i < picked.length; i++) {
    assert.ok(picked[i].at - picked[i - 1].at >= 20, `${picked[i - 1].at}초와 ${picked[i].at}초가 너무 가깝습니다`);
  }
  // 센 분위기를 먼저 집는다.
  assert.ok(picked.some((p) => p.mood === 'twist'), '반전 장면을 하나도 안 집었습니다');
});

test('맨 앞과 맨 끝은 피한다 (어둡거나 비어 있다)', () => {
  const scenes = Array.from({ length: 10 }, (_, i) => ({ duration: 30, mood: i === 0 ? 'twist' : 'mystery' }));
  const total = 300;
  for (const p of pickThumbnailMoments(scenes, { count: 3 })) {
    assert.ok(p.at > total * 0.08 && p.at < total * 0.92, `${p.at}초는 양 끝입니다`);
  }
});

test('짧은 편에서도 요청한 수만큼 돌려준다', () => {
  // 간격을 지킬 수 없으면 간격을 포기한다. 썸네일이 없는 것보다 낫다.
  const scenes = [{ duration: 10, mood: 'twist' }, { duration: 10, mood: 'mystery' }];
  assert.equal(pickThumbnailMoments(scenes, { count: 3 }).length, 2);
});

test('장면이 없으면 빈 목록을 돌려준다 (죽지 않는다)', () => {
  assert.deepEqual(pickThumbnailMoments([], { count: 3 }), []);
  assert.deepEqual(pickThumbnailMoments(null, { count: 3 }), []);
});

test('올릴 거리 스키마가 strict 요건을 지킨다', () => {
  // additionalProperties:false 가 하나라도 빠지면 호출이 400으로 죽는다.
  // 대본을 다 쓰고 나서 죽으면 그 돈은 날아간다.
  const missing = [];
  const walk = (node, at) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object' && node.additionalProperties !== false) missing.push(at);
    for (const [k, v] of Object.entries(node.properties || {})) walk(v, `${at}.${k}`);
    if (node.items) walk(node.items, `${at}[]`);
  };
  walk(UPLOAD_SCHEMA, 'UPLOAD_SCHEMA');
  assert.deepEqual(missing, [], `additionalProperties:false 가 없는 곳: ${missing.join(', ')}`);
  assert.ok(UPLOAD_SCHEMA.required.length);
});

test('올릴 때 쓸 파일들을 한 폴더에 저장한다', () => {
  const dir = store.saveUploadPack('901', {
    titles: [{ text: '1958년 신분증을 들고 2006년에 나타난 남자', why: '대본 4단락' }],
    droppedTitles: [{ text: '충격 실화', problems: ['"충격"은 광고주 친화 기준에서도 불리합니다'] }],
    thumbnails: [{ line1: '1958년 신분증', line2: '2006년의 청년' }],
    droppedThumbs: [],
    description: finishDescription('본문입니다.', {}),
    tags: ['미스터리', '시간여행'],
    moments: [{ at: 185.5, mood: 'twist', section: 'TWIST' }],
  });
  for (const f of ['upload.json', '설명문.txt', '태그.txt', '올릴때-쓸것.md']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `${f} 가 없습니다`);
  }
  const md = fs.readFileSync(path.join(dir, '올릴때-쓸것.md'), 'utf8');
  assert.ok(md.includes('1958년 신분증을 들고'), '제목 후보가 안 적혔습니다');
  assert.ok(md.includes('거른 제목'), '거른 이유가 안 적혔습니다');
  assert.ok(md.includes('3분 6초'), `썸네일 지점이 몇 분 몇 초인지 안 적혔습니다:\n${md}`);
  // 설명문 파일은 그대로 복사해 붙일 수 있어야 한다.
  assert.ok(fs.readFileSync(path.join(dir, '설명문.txt'), 'utf8').includes('AI로 만든 이미지'));
});


test('워크플로의 모든 모드가 제 갈 길로 간다', () => {
  // 모드를 하나 늘릴 때 case 에 안 적으면, 셸은 오류를 내지 않고 맨 끝
  // *) 로 떨어진다. 그러면 "올릴 거리를 만들어 줘"를 눌렀는데 소재만
  // 찾고 끝난다 — 아무 에러 없이. 그래서 여기서 막는다.
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );

  // 1) 고를 수 있는 모드
  const optBlock = yml.slice(yml.indexOf('        options:'), yml.indexOf('      resume_run:'));
  const modes = [...optBlock.matchAll(/^\s+- '(.+)'$/gm)].map((m) => m[1]);
  assert.ok(modes.length >= 10, `모드를 못 읽었습니다 (${modes.length}개)`);

  // 2) 실행 단계의 case 분기 — 적힌 순서가 곧 우선순위다
  const runStep = yml.slice(yml.indexOf('- name: 실행'), yml.indexOf('\n      - name:', yml.indexOf('- name: 실행') + 1));
  const caseBody = runStep.slice(runStep.indexOf('case "$IN_MODE" in'));
  const branches = [...caseBody.matchAll(/^\s+(\*(?:'([^']+)')?\*?)\)\s*$/gm)].map((m) => m[2] || null);
  assert.ok(branches.length >= 8, `case 분기를 못 읽었습니다 (${branches.length}개)`);
  assert.equal(branches[branches.length - 1], null, '맨 끝에 기본 분기(*)가 없습니다');

  // 3) 모드마다 어디로 가는지. 셸 case 와 같은 "처음 맞는 것" 규칙.
  const route = (mode) => branches.find((b) => b === null || mode.includes(b));
  const expected = {
    // '발음 들어보기' 에도 '들어보기' 가 들어 있다. '목소리 들어보기'
    // 보다 **먼저** 와야 서로 가로채지 않는다. 분기에서도 맨 앞이다.
    '발음 들어보기': '발음 들어보기',
    '소리 점검': '소리 점검',
    '목소리 들어보기': '목소리 들어보기',
    '대본만 다시 쓰기': '대본만 다시 쓰기',
    '올릴 거리': '올릴 거리',
    // '이상한 동화 — 완성본' 에도 '완성본' 이 들어 있다. 표에서도 분기에서도
    // 동화가 **먼저** 와야 한다. 순서가 뒤바뀌면 동화가 실화로 샌다.
    '동화': '동화',
    // '스포츠 분석 — 완성본' 도 마찬가지다. '완성본' 보다 **먼저** 와야 한다.
    '스포츠': '스포츠',
    // '사진을 지브리로 (받아 둔 **사진**을 …)' 와 '인물 시트 만들기
    // (**사진**을 참조로 얼굴 …)' 가 '사진' 을 같이 쓴다. 지브리 쪽이
    // 분기에서 먼저이므로 표에서도 먼저 둔다 — 2026-11-09 에 넣으면서
    // 이 검사가 바로 잡았다.
    '사진을 지브리로': '사진을 지브리로',
    // ⚠️ 이름에 '그림' 을 넣었다가 `*'그림'*` 분기로 샜다 (2026-11-09).
    //    이 테스트가 바로 잡았다. 모드 이름은 다른 모드의 낱말을 품으면
    //    안 된다 — '사진 살펴보기' 는 '사진을 지브리로' 를 안 품는다.
    '사진 살펴보기': '사진 살펴보기',


    // '인물 시트 만들기 (사진을 참조로 얼굴 …)' 는 다른 낱말과 겹치지
    // 않지만, 분기를 '화풍 미리보기' 보다 먼저 두었으므로 표에서도 먼저
    // 둔다. 표 차례와 분기 차례가 어긋나면 이 검사가 거짓으로 통과한다.
    '인물 시트': '인물 시트',
    // '화풍 후보 비교 (같은 장면 네 **그림**체 …)' 에도 '그림' 이 들어 있다.
    // 2026-11-04 에 넣으면서 똑같이 그림 분기로 샜고 이 검사가 잡았다.
    // '화풍 미리보기' 와도 '화풍' 을 같이 쓰므로 둘의 차례도 중요하다.
    '화풍 후보 비교': '화풍 후보 비교',
    // '화풍 미리보기 (그림 6장만 …)' 에는 '그림' 이 들어 있다.
    // 여기서도 **먼저** 와야 그림 분기로 새지 않는다.
    '화풍 미리보기': '화풍 미리보기',
    '완성본': '완성본',
    '그림': '그림',
    '영상': '영상',
    '장면까지': '장면까지',
    '대본까지': '대본까지',
    '소재만': null, // 기본 분기 = 소재만 찾기
    '테스트만': null, // 이 단계 자체가 건너뛰어진다
  };
  // ── ffmpeg 를 쓰는 모드는 설치도 켜져 있어야 한다 (2026-11-09) ──
  //
  // 세 번째로 같은 함정에 걸렸다(실행 #79). 워크플로 주석에 "새 모드를
  // 넣을 때마다 이 줄을 먼저 본다"고 적혀 있는데도 안 봤다. 사람이
  // 기억하기로 막는 규칙은 안 지켜진다. 테스트로 막는다.
  //
  // ffmpeg 를 쓰는 모드: 영상·완성본·올릴 거리처럼 렌더를 하는 것,
  // 그리고 사진을 다루는 '지브리로'(워터마크 자르기)와
  // '살펴보기'(글자 그림으로 펴기).
  const FFMPEG_필요 = ['지브리로', '살펴보기'];
  const 설치줄 = yml.split('\n').find((l) => l.includes("name: ffmpeg와 한글 글꼴 설치"));
  const 설치if = yml.split('\n').find(
    (l) => l.trim().startsWith('if:') && l.includes("contains(inputs.mode, '영상')")
  );
  assert.ok(설치줄 && 설치if, 'ffmpeg 설치 단계를 못 찾았습니다');
  for (const w of FFMPEG_필요) {
    assert.ok(
      설치if.includes(`contains(inputs.mode, '${w}')`),
      `'${w}' 모드는 ffmpeg 를 쓰는데 설치 조건에 없습니다 — 실행이 "ffmpeg 가 없어서" 로 죽습니다`
    );
  }


  for (const mode of modes) {
    const key = Object.keys(expected).find((k) => mode.includes(k));
    assert.ok(key, `"${mode}" 가 어디로 가야 하는지 이 테스트가 모릅니다. 표를 고쳐 주세요`);
    assert.equal(route(mode), expected[key], `"${mode}" 가 엉뚱한 분기로 갑니다`);
  }
});

test('창작 편 고지문이 "조사했다"고 말하지 않는다', () => {
  // 1화에서 실제로 나간 글이다. 지어낸 이야기를 "사람이 조사하고 썼습니다"로
  // 고지했다. 고지문은 속이지 않으려고 붙이는 글인데 그 글이 거짓이면
  // 붙이는 의미가 없다.
  const tale = finishDescription('본문', { kind: 'TALE' });
  assert.ok(!tale.includes('조사하고'), `창작 편이 조사했다고 말합니다:\n${tale}`);
  assert.ok(tale.includes('지어낸') || tale.includes('창작'), '창작물임을 안 밝힙니다');

  // 실화 쪽 문구는 그대로여야 한다.
  const event = finishDescription('본문', { kind: 'EVENT' });
  assert.ok(event.includes('조사하고 썼습니다'), '실화 고지문이 바뀌었습니다');
});

test('창작 편 설명문에 출처 항목을 만들지 않는다', () => {
  // 창작물에 출처가 있을 수 없다. 실수로 들어오면 적지 않는다.
  const tale = finishDescription('본문', {
    kind: 'TALE',
    sources: [{ name: '있으면 안 되는 출처', url: 'https://example.org/a' }],
  });
  assert.ok(!tale.includes('참고한 자료'), `창작 편에 출처가 적혔습니다:\n${tale}`);
  assert.ok(!tale.includes('example.org'));
});

test('채널 이름이 종류마다 다르다', () => {
  // 1화 설명문에 "AI 서프라이즈에서 만든 창작물입니다"가 적혀 나갔다.
  // 프롬프트에 채널 이름이 박혀 있었기 때문이다.
  assert.equal(channelNameFor('TALE'), '마지막 장');
  assert.equal(channelNameFor('EVENT'), 'AI 서프라이즈');

  const taleSys = uploadSystemFor('TALE');
  assert.ok(taleSys.includes('마지막 장'), '동화 프롬프트에 채널 이름이 없습니다');
  assert.ok(!taleSys.includes('AI 서프라이즈'), '동화 프롬프트에 실화 채널 이름이 섞였습니다');
  assert.ok(taleSys.includes('창작'), '창작물임을 밝히라고 알려주지 않습니다');

  assert.ok(uploadSystemFor('EVENT').includes('AI 서프라이즈'), '실화 채널 이름이 바뀌었습니다');

  // 대본 작가 쪽도 같아야 한다. (아래 동화 블록의 TALE_SYSTEM 은 이 시점에
  // 아직 초기화 전이라 여기서 따로 읽는다.)
  const writeSrc = fs.readFileSync(fileURLToPath(new URL('../src/script/write.mjs', import.meta.url)), 'utf8');
  assert.ok(
    /TALE_SYSTEM = `당신은 "마지막 장" 채널의 작가다/.test(writeSrc),
    '동화 대본 규칙의 채널 이름이 다릅니다'
  );
});

await asyncTest('동화 쇼츠에 뒤집힘·여운이 들어가지 않는다', async () => {
  // 1화에서 실제로 난 일이다. 쇼츠 2번이 94~169초로 잘려 뒤집힘과
  // 여운이 통째로 들어갔다. 그걸 보면 본편을 볼 이유가 사라진다.
  const { splitIntoScenes: split } = await import('../src/scenes/split.mjs');
  const { TALE_SECTIONS: TS } = await import('../src/script/write.mjs');

  // 1화와 비슷한 분량의 동화 대본을 만든다.
  const md = TS.map((sec) => {
    const lines = Array.from({ length: 4 }, (_, i) => `[STORY] ${sec.key}문단${i} ${'가'.repeat(40)}`);
    return `## [${sec.key}] ${sec.label}\n\n${lines.join('\n\n')}\n`;
  }).join('\n');

  const { scenes: taleScenes, problems } = split(md, { kind: 'TALE' });
  assert.deepEqual(problems, []);

  const picks = pickShorts(taleScenes, { count: 3, kind: 'TALE' });
  assert.ok(picks.length, '쇼츠가 하나도 안 나왔습니다');
  for (const p of picks) {
    assert.ok(!p.sections.includes('TURN'), `쇼츠 ${p.rank}에 뒤집힘이 들어갔습니다: ${p.sections.join(' → ')}`);
    assert.ok(!p.sections.includes('CLOSE'), `쇼츠 ${p.rank}에 여운이 들어갔습니다: ${p.sections.join(' → ')}`);
  }

  // kind 를 안 넘기면 막히지 않는다는 것도 확인한다 — 그래야 이 가드가
  // 실제로 일하고 있다는 뜻이다.
  const unguarded = pickShorts(taleScenes, { count: 3 });
  assert.ok(
    unguarded.some((p) => p.sections.includes('TURN') || p.sections.includes('CLOSE')),
    'kind 없이도 결말이 안 나온다면 이 테스트가 가드를 재고 있지 않습니다'
  );
});

await asyncTest('동화 쇼츠가 본편에서 끊긴 구간을 이어 붙이지 않는다', async () => {
  // 결말 문단을 빼고 나면 남은 문단들이 본편에서는 떨어져 있을 수 있다.
  // 그걸 그냥 이어 붙이면 영상이 건너뛴 것처럼 보인다.
  const { splitIntoScenes: split } = await import('../src/scenes/split.mjs');
  const { TALE_SECTIONS: TS } = await import('../src/script/write.mjs');
  const md = TS.map((sec) => {
    const lines = Array.from({ length: 4 }, (_, i) => `[STORY] ${sec.key}문단${i} ${'가'.repeat(40)}`);
    return `## [${sec.key}] ${sec.label}\n\n${lines.join('\n\n')}\n`;
  }).join('\n');
  const { scenes: taleScenes } = split(md, { kind: 'TALE' });

  for (const p of pickShorts(taleScenes, { count: 3, kind: 'TALE' })) {
    // 구간 길이와 문단 길이 합이 같아야 끊긴 데가 없는 것이다.
    const sum = p.paragraphs.reduce((a, x) => a + x.seconds, 0);
    assert.ok(
      Math.abs(sum - p.duration) < 0.1,
      `쇼츠 ${p.rank}이 ${p.duration}초인데 문단 합은 ${sum.toFixed(2)}초입니다 — 중간이 끊겼습니다`
    );
  }
});

test('실화 쇼츠는 그대로 반전을 쓴다', () => {
  // 미스터리는 반전을 보여줘도 "그래서 어떻게 된 건데"가 남는다.
  // 동화 때문에 실화 쪽을 같이 막으면 안 된다.
  const picks = pickShorts(videoScenes(), { count: 3 });
  assert.ok(picks.length, '실화 쇼츠가 안 나옵니다');
  assert.equal(spoilerSectionsFor('EVENT').length, 0, '실화에 결말 금지가 걸렸습니다');
  assert.equal(spoilerSectionsFor('LEGEND').length, 0);
  assert.deepEqual(spoilerSectionsFor('TALE'), ['TURN', 'CLOSE']);
});

test('결과물 파일 이름에 편 제목이 들어간다', () => {
  // 실행마다 content 가 비어 있게 시작하므로 모든 편이 001 이다. 그래서
  // 1화와 2화를 나란히 풀면 thumb-2.jpg 가 둘 다 있다. 실제로 두 번
  // 헷갈렸다 — 결말이 든 쇼츠를 올릴 뻔했고, 2화 영상에 1화 썸네일을 붙였다.
  assert.equal(store.fileSlug('이름을 파는 가게'), '이름을파는가게');
  assert.equal(store.fileSlug('그림자가 먼저 집에 가는 아이'), '그림자가먼저집에가는아이');

  // 파일 이름에 못 쓰는 글자는 빠진다.
  assert.ok(!/[\\/:*?"<>|]/.test(store.fileSlug('가/나:다*라?마')));
  // 제목이 비어도 이름 없는 파일을 만들지 않는다.
  assert.equal(store.fileSlug(''), '편');
  assert.equal(store.fileSlug('   '), '편');
  // 너무 길면 자른다.
  assert.ok(store.fileSlug('가'.repeat(100)).length <= 18);

  // 편이 다르면 이름도 달라야 한다 — 이게 이 기능의 전부다.
  assert.notEqual(
    store.fileSlug('그림자가 먼저 집에 가는 아이'),
    store.fileSlug('이름을 파는 가게')
  );
});

test('올릴 거리 문서가 실제 파일 이름을 적는다', () => {
  // 문서가 thumb-1.jpg 라고 적는데 폴더에는 다른 이름이 있으면,
  // 효성님이 폴더를 열어 보고 나서야 어긋난 걸 알게 된다.
  const dir = store.saveUploadPack('902', {
    titles: [{ text: '이름을 파는 가게', why: '' }],
    thumbnails: [{ line1: '값은', line2: '이름입니다' }],
    thumbFiles: ['이름을파는가게-썸네일-1.jpg'],
    description: '본문',
    tags: ['창작동화'],
    moments: [{ at: 16.8 }],
  });
  const md = fs.readFileSync(path.join(dir, '올릴때-쓸것.md'), 'utf8');
  assert.ok(md.includes('이름을파는가게-썸네일-1.jpg'), `실제 파일 이름이 안 적혔습니다:\n${md}`);
  assert.ok(!md.includes('thumb-1.jpg ~ thumb-3.jpg'), '예전 고정 문구가 남아 있습니다');
});

test('동화는 배경음악을 끄고 만든다', () => {
  // bgm/ 의 여섯 곡은 전부 미스터리·스릴러용이다. 조용한 동화에 깔면
  // 그 자리에서 어긋난다. 안 맞는 음악은 없는 음악보다 나쁘다.
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  const at = yml.indexOf("*'동화'*)");
  assert.ok(at > 0, '동화 분기를 찾지 못했습니다');
  const branch = yml.slice(at, yml.indexOf("            *'대본만 다시 쓰기'*)", at));
  assert.ok(branch.includes('--no-bgm'), '동화 완성본이 미스터리용 음악을 깝니다');
  assert.ok(branch.includes('--script='), '써 둔 대본을 쓰는 길이 없습니다');

  // 그리고 그 음악 파일들이 실제로 미스터리용인지 — 목록이 바뀌면 이
  // 판단도 다시 해야 한다.
  // new URL(...).pathname 은 한글을 퍼센트 인코딩해서 돌려준다. 그대로
  // 열면 ENOENT 가 난다 — fileURLToPath 를 써야 한다.
  const listFile = fileURLToPath(new URL('../bgm/목록.json', import.meta.url));
  const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const moods = new Set(list.tracks.flatMap((t) => t.moods || []));
  assert.ok(moods.has('tension') || moods.has('twist'), 'bgm 목록 성격이 바뀌었습니다 — 동화에 쓸 수 있는지 다시 보세요');
});

test('동화 완성본이 비밀값 확인을 모두 거친다', () => {
  // 전에 한 번 겪은 실패다 — 키 확인은 초록불이었는데 실행 단계에 키를
  // 안 넘겨서 거기서 죽었다. 방식을 늘릴 때마다 이게 다시 생길 수 있다.
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  const optBlock = yml.slice(yml.indexOf('        options:'), yml.indexOf('      tale_plan:'));
  const modes = [...optBlock.matchAll(/^\s+- '(.+)'$/gm)].map((m) => m[1]);
  const taleFull = modes.find((m) => m.includes('동화') && m.includes('완성본'));
  assert.ok(taleFull, '동화 완성본 방식이 없습니다');

  // 각 확인 단계의 if 조건을 떼어내 이 모드가 걸리는지 본다.
  const condOf = (name) => {
    const at = yml.indexOf(`- name: ${name}`);
    assert.ok(at > 0, `${name} 단계를 찾지 못했습니다`);
    return yml.slice(at, yml.indexOf('\n        env:', at));
  };
  // contains(inputs.mode, 'X') 를 모아 이 모드가 하나라도 맞는지 본다.
  const hits = (cond) =>
    [...cond.matchAll(/contains\(inputs\.mode, '([^']+)'\)/g)].some((m) => taleFull.includes(m[1]));

  assert.ok(hits(condOf('목소리 키가 등록되어 있는지 확인')), '동화 완성본에 TTS 키 확인이 안 걸립니다');
  assert.ok(hits(condOf('이미지 토큰이 등록되어 있는지 확인')), '동화 완성본에 이미지 토큰 확인이 안 걸립니다');
  assert.ok(hits(condOf('ffmpeg와 한글 글꼴 설치')), '동화 완성본에 ffmpeg·글꼴이 안 깔립니다');
});

test('스포츠 완성본도 비밀값 확인을 모두 거친다', () => {
  // 동화 때와 같은 검사를 종류마다 되풀이한다. 방식을 하나 늘릴 때마다
  // "확인 단계의 if 조건에 안 걸려서 실행 중에 죽는" 실패가 되살아난다.
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  const optBlock = yml.slice(yml.indexOf('        options:'), yml.indexOf('      tale_plan:'));
  const modes = [...optBlock.matchAll(/^\s+- '(.+)'$/gm)].map((m) => m[1]);
  const full = modes.find((m) => m.includes('스포츠') && m.includes('완성본'));
  assert.ok(full, '스포츠 완성본 방식이 없습니다');

  const condOf = (name) => {
    const at = yml.indexOf(`- name: ${name}`);
    assert.ok(at > 0, `${name} 단계를 찾지 못했습니다`);
    return yml.slice(at, yml.indexOf('\n        env:', at));
  };
  const hits = (cond) =>
    [...cond.matchAll(/contains\(inputs\.mode, '([^']+)'\)/g)].some((m) => full.includes(m[1]));

  assert.ok(hits(condOf('목소리 키가 등록되어 있는지 확인')), '스포츠 완성본에 TTS 키 확인이 안 걸립니다');
  assert.ok(hits(condOf('이미지 토큰이 등록되어 있는지 확인')), '스포츠 완성본에 이미지 토큰 확인이 안 걸립니다');
  // 카드를 ffmpeg 로 그린다. 안 깔리면 표가 전부 빠진 영상이 나온다.
  assert.ok(hits(condOf('ffmpeg와 한글 글꼴 설치')), '스포츠 완성본에 ffmpeg·글꼴이 안 깔립니다');
});

test('자체 검사는 ffmpeg 없이도 끝까지 돈다', () => {
  // 실행 #24 가 여기서 죽었다. ffmpeg 가 있어야 하는 검사를 그냥 넣었는데,
  // 워크플로는 자체 검사를 **ffmpeg 설치보다 먼저** 돌린다. 내 기계에는
  // ffmpeg 가 있어서 통과했고 러너에서만 터졌다.
  //
  // 그래서 ffmpeg 를 쓰는 검사는 반드시 hasFfmpeg() 뒤에 둔다.
  const src = fs.readFileSync(new URL('./offline.mjs', import.meta.url), 'utf8');
  const usesFfmpeg = /execFileSync\('ffmpeg'|renderCardImage|'images', `--id=/.test(src);
  if (usesFfmpeg) {
    assert.ok(/function hasFfmpeg\(\)/.test(src), 'ffmpeg 유무를 확인하는 함수가 없습니다');
    assert.ok(/if \(!hasFfmpeg\(\)\)/.test(src), 'ffmpeg 검사를 건너뛰는 분기가 없습니다');
  }
});

test('올릴 거리 모드가 ffmpeg와 한글 글꼴을 깐다', () => {
  // 썸네일도 ffmpeg 로 만들고 글자도 얹는다. 글꼴이 없으면 ffmpeg 는
  // 오류 없이 네모를 그린다 — 받아서 열어 보기 전까지 모른다.
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  const start = yml.indexOf('- name: ffmpeg와 한글 글꼴 설치');
  assert.ok(start > 0, 'ffmpeg 설치 단계를 찾지 못했습니다');
  const cond = yml.slice(start, yml.indexOf('\n        timeout-minutes', start));
  assert.ok(cond.includes("contains(inputs.mode, '올릴 거리')"), '올릴 거리 모드에 ffmpeg·글꼴이 안 깔립니다');
});


// ─────────────────────────────────────────────────────────────
// 창작 동화 (KIND.TALE)
// ─────────────────────────────────────────────────────────────
//
// 여기서 막는 것은 두 방향이다.
//
//  1) 창작 때문에 **실화의 엄격함이 깎이지 않는가.** 출처 관문을 느슨하게
//     만든 게 아니라 TALE 에만 예외를 둔 것이므로, EVENT 가 그대로인지
//     매번 확인한다.
//  2) 동화가 **실화 규칙에 걸려 한 편도 못 나가지 않는가.**

const {
  TALE_SECTIONS,
  TALE_TAGS,
  TALE_MINUTES,
  TALE_SYSTEM,
  TALE_HOOK_EXAMPLE,
  ALL_TAGS,
  tagsFor,
  buildTalePrompt,
  sectionsFor: sectionsForKind,
  HOOK_CHARS_MAX: TALE_HOOK_MAX,
  DEFAULT_MINUTES: DEFAULT_MINUTES_SCRIPT,
} = await import('../src/script/write.mjs');
const { splitIntoScenes: splitScenes } = await import('../src/scenes/split.mjs');
const { makeTale, isFiction } = await import('../src/model.mjs');
const { TALE_STYLE_SUFFIX, STYLE_SUFFIX: EVENT_STYLE, composeImagePrompt: composeImg } = await import('../src/scenes/visuals.mjs');
const { countNarrationChars: countChars } = await import('../src/narration.mjs');

const taleBody = (opts = {}) =>
  TALE_SECTIONS.map((sec) => {
    const text = sec.key === 'HOOK' ? (opts.hook ?? TALE_HOOK_EXAMPLE) : '가'.repeat(120);
    return `## [${sec.key}] ${sec.label}\n\n[STORY] ${text}\n`;
  }).join('\n');

test('창작 동화는 출처 없이도 관문을 통과한다', () => {
  // 출처 0개, 1차 기록 없음. 실화였다면 전부 막히는 조건이다.
  const t = makeTale({ title: '그림자가 먼저 집에 가는 아이', premise: '매일 저녁 그림자가 먼저 간다' });
  assert.notEqual(t.gate, GATE.BLOCKED, `창작물이 막혔습니다: ${t.gate_reasons.join(' / ')}`);
  assert.equal(t.source_count, 0);
  assert.ok(isFiction(t));
});

test('창작이라고 사람이 읽는 것까지 면제하지 않는다', () => {
  const t = makeTale({ title: 'x' });
  assert.equal(t.gate, GATE.REVIEW_NEEDED, '자동 통과시키면 아무 글이나 나갑니다');
  assert.ok(t.gate_reasons.length, '왜 봐야 하는지 알려주지 않습니다');
  assert.equal(t.recommended, false, '창작물에 추천 표시를 달면 안 됩니다');
});

test('실화의 출처 관문은 그대로다 (동화 때문에 깎이지 않았는가)', () => {
  // 이 테스트가 이 기능 전체에서 가장 중요하다. 예외를 하나 뚫으면
  // 그 구멍으로 실화가 같이 빠져나가기 쉽다.
  const 실화 = makeItem({
    title: '출처 없는 사건',
    kind: 'EVENT',
    fact_status: 'UNVERIFIED',
    sources: [],
  });
  assert.equal(실화.gate, GATE.BLOCKED, '출처 없는 실화가 통과했습니다');
});

test('창작 동화에 실존 인물 주장이 있으면 막는다', () => {
  // 창작물에 실존 인물이 나올 이유가 없다. 나왔다면 그건 창작이 아니라
  // 그 사람에 대한 주장이다.
  const t = makeTale({ title: 'x' });
  t.risk_flags = ['LIVING_PERSON_CLAIM'];
  const again = evaluateGate(t);
  assert.equal(again.gate, GATE.BLOCKED, `생존 인물 주장이 통과했습니다: ${again.reasons.join(' / ')}`);
});

test('종류마다 쓸 수 있는 태그가 다르다', () => {
  assert.deepEqual(tagsFor('TALE'), TALE_TAGS);
  assert.ok(!tagsFor('EVENT').includes('STORY'));
  // 파서는 양쪽을 다 읽을 수 있어야 한다. 모르는 태그를 만나면 그 문단을
  // 통째로 잃어버리는데, 그게 제일 조용한 실패다.
  for (const t of [...TALE_TAGS, 'FACT']) assert.ok(ALL_TAGS.includes(t), `${t} 를 파서가 모릅니다`);
});

test('동화는 6섹션, 실화는 9섹션을 쓴다', () => {
  const tale = sectionsForKind('TALE').map((s) => s.key);
  const event = sectionsForKind('EVENT').map((s) => s.key);
  assert.deepEqual(tale, ['HOOK', 'SETUP', 'NOTICE', 'FOLLOW', 'TURN', 'CLOSE']);
  assert.ok(event.includes('OUR_READING'), '실화 섹션이 바뀌었습니다');
  assert.ok(!tale.includes('OUR_READING'), '동화에 실화 전용 섹션이 들어갔습니다');
});

test('동화 대본이 실화 섹션을 요구받지 않는다', () => {
  // kind 를 안 넘기면 9섹션을 기대해서 전부 "섹션이 없습니다"로 막힌다.
  const r = validateScript(taleBody(), { targetMinutes: TALE_MINUTES, kind: 'TALE' });
  assert.deepEqual(r.errors, [], `동화 대본이 막혔습니다:\n${r.errors.join('\n')}`);
  assert.equal(r.stats.sectionsExpected, 6, '기대 섹션 수가 실화 기준으로 찍힙니다');
});

test('동화에 [FACT] 를 쓰면 막는다', () => {
  // 지어낸 이야기를 사실이라고 표시한 대본은 그대로 시청자를 속인다.
  const bad = taleBody().replace('[STORY]', '[FACT]');
  const r = validateScript(bad, { targetMinutes: TALE_MINUTES, kind: 'TALE' });
  assert.ok(r.errors.some((e) => e.includes('[FACT]')), `[FACT] 를 못 잡습니다:\n${r.errors.join('\n')}`);
});

test('실화에 [STORY] 를 쓰면 막는다', () => {
  const body = SECTIONS.map((sec) => `## [${sec.key}] ${sec.label}\n\n[STORY] ${'가'.repeat(150)}\n`).join('\n');
  const r = validateScript(body, { targetMinutes: 8, kind: 'EVENT' });
  assert.ok(r.errors.some((e) => e.includes('[STORY]')), `실화에 창작 태그가 통과했습니다:\n${r.errors.join('\n')}`);
});

test('훅 길이를 잴 때 [STORY] 태그를 벗긴다', () => {
  // 태그를 안 벗기면 훅이 7자 길게 재어진다. 멀쩡한 훅이 경고를 단다.
  const r = validateScript(taleBody(), { targetMinutes: TALE_MINUTES, kind: 'TALE' });
  assert.equal(r.stats.hookChars, countChars(TALE_HOOK_EXAMPLE), '태그가 글자 수에 섞였습니다');
});

test('프롬프트에 적은 훅 예시가 실제로 짧다', () => {
  // 예시가 길면 AI 가 그 길이를 따라 쓴다. 숫자를 적을 때는 재서 적는다.
  const n = countChars(TALE_HOOK_EXAMPLE);
  assert.ok(n <= TALE_HOOK_MAX, `훅 예시가 ${n}자입니다 (${TALE_HOOK_MAX}자 이내여야 합니다)`);
});

test('동화 기본 길이가 실화보다 짧다', () => {
  // 같은 길이로 끌면 설명이 들어가고, 설명이 들어가면 동화가 아니게 된다.
  assert.ok(TALE_MINUTES < DEFAULT_MINUTES_SCRIPT, '동화가 실화만큼 깁니다');
  assert.equal(TALE_MINUTES, 4);
});

test('동화 프롬프트가 비트 시트를 그대로 넘긴다', () => {
  const p = buildTalePrompt({
    title: '그림자가 먼저 집에 가는 아이',
    summary: '매일 저녁 그림자가 먼저 간다',
    strange: '그림자가 혼자 걸어간다',
    beats: [{ key: 'TURN', what: '그림자가 식탁에 앉아 저녁을 먹고 있다' }],
    last_line: '밖에 남은 쪽에는 그림자가 없다',
  }, { targetMinutes: TALE_MINUTES });

  assert.ok(p.includes('식탁에 앉아'), '비트가 프롬프트에 없습니다');
  assert.ok(p.includes('밖에 남은 쪽'), '마지막 장면이 프롬프트에 없습니다');
  assert.ok(p.includes('[STORY]'), '쓸 태그를 안 알려줍니다');
  assert.ok(!p.includes('[FACT]') || p.includes('[FACT] 같은'), '쓰면 안 되는 태그를 예시로 보여줍니다');
  // 섹션을 전부 적어 줘야 순서대로 쓴다.
  for (const s of TALE_SECTIONS) assert.ok(p.includes(`## [${s.key}]`), `${s.key} 가 프롬프트에 없습니다`);
});

test('동화 규칙이 설명·교훈을 금지한다', () => {
  // 이 둘이 이 포맷을 죽이는 가장 흔한 방법이다.
  assert.ok(TALE_SYSTEM.includes('설명하지 않는다'));
  assert.ok(TALE_SYSTEM.includes('교훈'));
  assert.ok(TALE_SYSTEM.includes('실존 인물'), '창작물에 실존 인물을 금지하지 않습니다');
});

test('동화 화면은 코믹스체, 실화는 시네마틱 — 섞이지 않는다', () => {
  const tale = composeImg('a boy at a doorway', 'past', { kind: 'TALE' });
  const event = composeImg('a boy at a doorway', 'past');

  assert.ok(tale.includes('risograph'), '동화에 코믹스체가 안 붙었습니다');
  assert.ok(!tale.includes('cinematic film still'), '동화에 실화 톤이 섞였습니다');
  // 동화는 팔레트가 고정이라 시대 색감을 쓰지 않는다.
  assert.ok(!tale.includes('sepia'), '동화에 시대 색감이 섞여 편마다 색이 달라집니다');

  assert.ok(event.includes('cinematic film still'), '실화 톤이 바뀌었습니다');
  assert.ok(!event.includes('risograph'), '실화에 코믹스체가 섞였습니다');
});

test('코믹스체 프롬프트에 작가·작품 이름이 없다', () => {
  // 화풍 자체는 저작권 대상이 아니지만, 특정 이름을 지목하면 성격이 달라진다.
  // 기법 용어로만 쓴다.
  const banned = /ghibli|disney|pixar|miyazaki|지브리|디즈니|픽사|in the style of/i;
  assert.ok(!banned.test(TALE_STYLE_SUFFIX), `작가·작품 이름이 들어갔습니다: ${TALE_STYLE_SUFFIX}`);
  assert.ok(!banned.test(EVENT_STYLE));
  // 팔레트가 고정이어야 채널이 한 덩어리로 보인다.
  assert.ok(TALE_STYLE_SUFFIX.includes('palette'), '팔레트를 고정하지 않았습니다');
});

test('동화 대본도 장면으로 쪼개진다', () => {
  // kind 를 안 넘기면 파서가 실화 섹션을 기대해 통째로 막힌다.
  const { scenes, problems } = splitScenes(taleBody(), { kind: 'TALE' });
  assert.deepEqual(problems, [], `동화가 장면으로 안 쪼개집니다:\n${problems.join('\n')}`);
  assert.ok(scenes.length, '장면이 하나도 안 나왔습니다');
  const tags = new Set(scenes.flatMap((s) => (s.paragraphs || []).map((p) => p.tag)));
  assert.deepEqual([...tags], ['STORY'], `태그가 잘못 읽혔습니다: ${[...tags].join(', ')}`);
});


// ─────────────────────────────────────────────────────────────
// 영상 계획 단계를 실제로 돌려 본다
// ─────────────────────────────────────────────────────────────
//
// 실행 #20 이 여기서 죽었다. 쇼츠에 kind 를 넘기려고 한 줄을 넣었는데
// 그 함수에 없는 변수 이름(loaded)을 썼다. 바로 두 줄 아래에 맞는 이름
// (research)이 있었는데도.
//
//   ❌ content/001 영상 만들기 실패: loaded is not defined
//
// 문법 오류가 아니라 **실행해야만 나는 오류**라서 node --check 도,
// 다른 어떤 테스트도 못 잡았다. 그림 26장과 음성을 다 산 뒤에 터졌다.
//
// 그래서 CLI 를 진짜로 한 번 돌린다. --dry-run 이면 ffmpeg 도 AI 도
// 쓰지 않으므로 공짜고 빠르다. 그러면서 편집 계획·자막·쇼츠·체크리스트
// 경로를 전부 지나간다 — 거기 있는 ReferenceError 는 다 걸린다.
await asyncTest('영상 계획 단계가 실제로 끝까지 돈다', async () => {
  const { execFileSync } = await import('node:child_process');
  const id = '950';
  const dir = store.contentPath(id);
  fs.mkdirSync(dir, { recursive: true });

  const item = makeTale({ title: '테스트 동화', premise: '한 줄', strange: '이상한 것' });
  fs.writeFileSync(path.join(dir, 'research.json'), JSON.stringify(item, null, 2), 'utf8');

  const md = TALE_SECTIONS.map((sec) => {
    const lines = Array.from({ length: 4 }, (_, i) => `[STORY] ${sec.key}문단${i} ${'가'.repeat(40)}`);
    return `## [${sec.key}] ${sec.label}\n\n${lines.join('\n\n')}\n`;
  }).join('\n');
  fs.writeFileSync(path.join(dir, 'script.md'), md, 'utf8');

  const { scenes: s950, stats, problems } = splitScenes(md, { kind: 'TALE' });
  assert.deepEqual(problems, []);
  store.saveScenes(id, { scenes: s950, stats, problems });

  let out = '';
  try {
    out = execFileSync('node', ['src/main.mjs', 'video', `--id=${id}`, '--dry-run'], {
      env: { ...process.env, AI_SURPRISE_DATA_DIR: TMP },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const text = `${err.stdout || ''}${err.stderr || ''}`;
    assert.fail(`video --dry-run 이 실패했습니다:\n${text.split('\n').slice(-12).join('\n')}`);
  }

  // 돌다가 조용히 건너뛴 게 아니라 정말 지나갔는지 본다.
  assert.ok(/편집 계획/.test(out), `편집 계획 단계가 안 보입니다:\n${out.slice(-400)}`);
  assert.ok(/쇼츠 후보/.test(out), `쇼츠 단계가 안 보입니다:\n${out.slice(-400)}`);
  assert.ok(!/is not defined/.test(out), out.slice(-400));
});

// ─────────────────────────────────────────────────────────────
// 스포츠 분석 — 글자 카드
// ─────────────────────────────────────────────────────────────

await asyncTest('칸이 있으면 표, 없으면 한 문장으로 읽는다', async () => {
  const C = await import('../src/video/card.mjs');
  const table = C.parseCardText('FA 보상 규정\nA등급|연봉 200%\nB등급|연봉 100%');
  assert.equal(table.type, 'table');
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0].right, '연봉 200%');

  const say = C.parseCardText('백억짜리 선수의 실제 영입 비용은\n백억이 아닙니다');
  assert.equal(say.type, 'statement');
  assert.equal(say.statement.length, 2);
  // 한 문장 카드는 줄을 제목/본문으로 가르지 않는다. 갈랐더니 두 문장이
  // 끊겨 보였다.
  assert.equal(say.rows.length, 0);
});

await asyncTest('카드 글자가 자막 자리를 침범하지 않는다', async () => {
  const C = await import('../src/video/card.mjs');
  // 줄을 많이 넣어도 아래 240px(자막 자리)로 내려가면 안 된다.
  const many = C.parseCardText(
    ['많은 줄', ...Array.from({ length: 12 }, (_, i) => `항목 ${i}|값 ${i}`)].join('\n')
  );
  const L = C.cardLayout(many);
  assert.equal(L.overflow, false, '카드가 안전 영역을 넘었습니다');
  const limit = C.CARD_HEIGHT - C.SUBTITLE_RESERVED;
  assert.ok(L.rowYs.at(-1) < limit, `마지막 줄 ${L.rowYs.at(-1)} 이 자막 자리 ${limit} 를 넘었습니다`);
});

await asyncTest('퍼센트가 들어간 카드가 깨지지 않는다', async () => {
  const C = await import('../src/video/card.mjs');
  // drawtext 는 % 를 서식 문자로 읽는다. expansion=none 이 빠지면
  // "Stray %" 가 나면서 **그 줄이 통째로 안 그려진다.** 보상등급 표가
  // 전부 퍼센트라 실제로 이 카드가 빈 화면이 될 뻔했다.
  const card = C.parseCardText('FA 보상 규정\nA등급|연봉 200%');
  const args = C.cardArgs({
    card,
    files: { title: '/t/title.txt', rows: [{ left: '/t/l0.txt', right: '/t/r0.txt' }] },
    outputPath: '/t/out.png',
  });
  const vf = args[args.indexOf('-vf') + 1];
  const draws = vf.split(',').filter((f) => f.startsWith('drawtext'));
  assert.ok(draws.length >= 3, '그릴 글자가 모자랍니다');
  for (const d of draws) {
    assert.ok(d.includes('expansion=none'), `expansion=none 이 빠졌습니다: ${d.slice(0, 60)}`);
  }
});

await asyncTest('카드 글자는 명령줄이 아니라 파일로 넘긴다', async () => {
  const C = await import('../src/video/card.mjs');
  // 한글과 따옴표·콜론을 명령줄에 직접 넣으면 ffmpeg 필터 문법과 충돌한다.
  const card = C.parseCardText('값은 "이름"입니다\n조건|오전 9:00');
  const args = C.cardArgs({
    card,
    files: { title: '/t/title.txt', rows: [{ left: '/t/l0.txt', right: '/t/r0.txt' }] },
    outputPath: '/t/out.png',
  });
  const vf = args[args.indexOf('-vf') + 1];
  assert.ok(!vf.includes('이름'), '글자가 필터 문자열에 직접 들어갔습니다');
  assert.ok(!vf.includes('9:00'), '콜론이 든 글자가 필터에 직접 들어갔습니다');
  assert.ok(vf.includes('textfile='), 'textfile 로 넘기지 않았습니다');
});

// 카드를 CLI 로 실제로 한 번 그려 본다.
//
// 단위 검사는 "인자를 맞게 조립하는가"까지만 본다. 그 인자로 ffmpeg 가
// 정말 도는지는 돌려 봐야 안다 — 퍼센트 버그가 딱 그렇게 나왔다.
// 카드는 AI 도 토큰도 필요 없으므로 **이 검사는 공짜다.**
if (!hasFfmpeg()) {
  skip('카드가 CLI 로 실제 그려진다', 'ffmpeg 가 없습니다');
} else await asyncTest('카드가 CLI 로 실제 그려진다', async () => {
  const { execFileSync } = await import('node:child_process');
  const { makeSports } = await import('../src/model.mjs');
  const id = '951';
  const dir = store.contentPath(id);
  fs.mkdirSync(dir, { recursive: true });

  const item = makeSports({ title: '카드 검사', premise: '한 줄', angle: '각도' });
  fs.writeFileSync(path.join(dir, 'research.json'), JSON.stringify(item, null, 2), 'utf8');

  // 카드 두 장과 보통 그림 한 장. 둘이 섞여 있어야 가르는 쪽도 함께 본다.
  const prompts = [
    { shot_id: 'S1-1', image_prompt: '', card_text: 'FA 보상 규정\nA등급|연봉 200%\nB등급|연봉 100%' },
    { shot_id: 'S1-2', image_prompt: '', card_text: '백억짜리 선수의 실제 영입 비용은\n백억이 아닙니다' },
    { shot_id: 'S1-3', image_prompt: 'a desk at night', card_text: '' },
  ];
  fs.writeFileSync(path.join(dir, 'prompts.json'), JSON.stringify({ prompts }, null, 2), 'utf8');

  let out = '';
  try {
    out = execFileSync('node', ['src/main.mjs', 'images', `--id=${id}`], {
      env: { ...process.env, AI_SURPRISE_DATA_DIR: TMP, REPLICATE_API_TOKEN: '' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    // 토큰이 없어 AI 그림 단계에서 멈추는 것은 정상이다. 그 전에 카드가
    // 그려졌는지를 본다.
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }

  assert.ok(!/is not defined/.test(out), out.slice(-500));

  const a = path.join(dir, 'assets', 'S1-1.png');
  const b = path.join(dir, 'assets', 'S1-2.png');
  assert.ok(fs.existsSync(a), `표 카드가 안 그려졌습니다:\n${out.slice(-500)}`);
  assert.ok(fs.existsSync(b), `문장 카드가 안 그려졌습니다:\n${out.slice(-500)}`);
  // 빈 파일이 아니라 진짜 그림인지 본다.
  assert.ok(fs.statSync(a).size > 3000, '표 카드가 너무 작습니다 — 글자가 안 그려졌을 수 있습니다');
  assert.ok(fs.statSync(b).size > 3000, '문장 카드가 너무 작습니다');
  // 카드가 아닌 샷은 AI 쪽으로 가야 한다 (토큰이 없어 안 만들어진다).
  assert.ok(!fs.existsSync(path.join(dir, 'assets', 'S1-3.png')), '카드가 아닌 샷까지 그려졌습니다');
});

// ─────────────────────────────────────────────────────────────
// 스포츠 분석 — 사실과 전망을 가르는 장치
// ─────────────────────────────────────────────────────────────

await asyncTest('스포츠 편은 현역 선수를 다뤄도 막히지 않는다', async () => {
  const { makeSports, GATE } = await import('../src/model.mjs');
  // 현역 선수 이름을 못 부르면 이 소재는 성립하지 않는다. 막는 대신
  // 사람이 반드시 읽게 한다.
  const item = makeSports({ title: 'FA 프리뷰', premise: '한 줄', sources: [{ url: 'https://a/b' }] });
  assert.equal(item.gate, GATE.REVIEW_NEEDED, '스포츠 편이 막혔거나 그냥 통과했습니다');
  assert.ok(
    item.gate_reasons.some((r) => r.includes('단정')),
    `단정하지 말라는 안내가 없습니다: ${item.gate_reasons.join(' / ')}`
  );
});

await asyncTest('스포츠 대본에 재구성 태그를 쓰면 막는다', async () => {
  const W = await import('../src/script/write.mjs');
  // 아직 일어나지 않은 일을 "재구성"할 수는 없다. 남겨 두면 전망을
  // 재구성처럼 적게 된다.
  assert.deepEqual(W.tagsFor('SPORTS'), ['FACT', 'THEORY', 'UNKNOWN']);
  const md = W.SPORTS_SECTIONS.map((sec, i) => {
    const tag = i === 0 ? 'RECONSTRUCTION' : 'THEORY';
    return `## [${sec.key}] ${sec.label}\n\n[${tag}] ${'가'.repeat(60)}\n`;
  }).join('\n');
  const v = W.validateScript(md, { kind: 'SPORTS', targetMinutes: 10 });
  assert.equal(v.ok, false, '쓸 수 없는 태그가 통과했습니다');
});

test('스포츠 고지문은 전망이 섞여 있다고 밝힌다', () => {
  const sports = finishDescription('본문', { kind: 'SPORTS' });
  assert.ok(sports.includes('전망'), `전망이 섞였다는 안내가 없습니다:\n${sports}`);
  // 창작물이 아니므로 "지어낸" 이라고 하면 안 된다.
  assert.ok(!sports.includes('지어낸'), '스포츠 편을 창작물이라고 말합니다');
  // 실화 쪽 고지문과도 달라야 한다 — 실화는 이미 끝난 일을 다룬다.
  assert.notEqual(sports, finishDescription('본문', { kind: 'EVENT' }));
});

test('스포츠 편 설명문에는 출처를 적는다', () => {
  // 창작 동화와 정반대다. 실제 규정과 실제 계약을 말하므로 근거가 남아야 한다.
  const d = finishDescription('본문', {
    kind: 'SPORTS',
    sources: [{ name: 'KBO 공시', url: 'https://www.koreabaseball.com/x' }],
  });
  assert.ok(d.includes('참고한 자료'), `출처가 안 적혔습니다:\n${d}`);
  assert.ok(d.includes('KBO 공시'), '출처 이름이 빠졌습니다');
});

await asyncTest('카드로 그릴 샷은 이미지 프롬프트를 비운다', async () => {
  const V = await import('../src/scenes/visuals.mjs');
  // 둘 다 채워 두면 나중에 누가 그 프롬프트로 그림을 사고, 화면에는
  // 카드가 올라가 산 그림이 버려진다. 돈만 나간다.
  const scene = { scene_number: 1, section: 'RULES', shots: [{ shot_id: 'S1-1' }, { shot_id: 'S1-2' }] };
  const design = {
    mood: 'record',
    visual_description: '설명',
    shots: [
      { shot_id: 'S1-1', image_prompt: 'a desk', video_prompt: '', era: 'present', camera: 'zoom in', motion_need: 2, depicts_real_person: false, card_text: '' },
      { shot_id: 'S1-2', image_prompt: 'should be dropped', video_prompt: '', era: 'present', camera: 'zoom in', motion_need: 0, depicts_real_person: false, card_text: 'FA 보상 규정\nA등급|연봉 200%' },
    ],
  };
  const { scene: merged } = V.mergeVisuals(scene, design, { kind: 'SPORTS' });
  const [plain, card] = merged.shots;
  assert.ok(plain.image_prompt.includes('a desk'), '보통 샷의 프롬프트가 사라졌습니다');
  assert.equal(card.image_prompt, '', '카드 샷에 이미지 프롬프트가 남아 있습니다');
  assert.ok(card.card_text.includes('A등급'), '카드 글이 전달되지 않았습니다');
});

await asyncTest('스포츠 화면 지시가 선수 이름을 쓰지 말라고 한다', async () => {
  const V = await import('../src/scenes/visuals.mjs');
  const sys = V.visualsSystemFor('SPORTS');
  // 이미지 모델은 KBO 선수 얼굴을 모른다. 이름을 넣으면 닮지도 않으면서
  // 닮게 하려 한 흔적만 남는다.
  assert.ok(sys.includes('선수 이름을 프롬프트에 쓰지 않는다'), '이름 금지 지시가 없습니다');
  assert.ok(sys.includes('로고'), '구단 로고 금지 지시가 없습니다');
  // 다른 종류는 이 지시를 받지 않는다.
  assert.ok(!V.visualsSystemFor('TALE').includes('선수 이름을'), '동화에 스포츠 지시가 섞였습니다');
});

await asyncTest('스포츠는 쇼츠를 열 개 뽑는다', async () => {
  const S = await import('../src/video/shorts.mjs');
  // 다섯 → 여덟 → 열로 왔다. 처음엔 올리는 리듬(화~금 넷)에서 나온
  // 숫자였는데, 성적을 보니 **쇼츠가 전부**였고(유입 96% 가 Shorts 피드)
  // **이탈이 73.4%** 였다. 짧게 자르면 완주율이 오르고 개수도 는다.
  // 9분대 대본에서 40~70초로 열까지는 겹침이 11초(2%)다.
  assert.equal(S.shortsCountFor('SPORTS'), 10);
  assert.equal(S.shortsCountFor('TALE'), 3, '동화까지 늘어나면 서로 겹칩니다');
  assert.equal(S.shortsCountFor('EVENT'), 3);
});

await asyncTest('스포츠 섹션에 점수가 매겨져 있다', async () => {
  const S = await import('../src/video/shorts.mjs');
  // 점수가 없으면 전부 0점이 되어 **순위가 길이로만** 정해진다. 실제로
  // 그래서 1화에서 가장 궁금한 대목(ACE — 삼성이 둘 다 지킬 수 있나)이
  // 쇼츠에서 통째로 빠졌다.
  const scenes = ['HOOK', 'RULES', 'ACE', 'OUTFIELD', 'CATCHER', 'DEBATE', 'SCENARIO', 'CLOSE'].map(
    (section, i) => ({
      scene_number: i + 1,
      section,
      paragraphs: Array.from({ length: 8 }, (_, k) => ({
        tag: 'THEORY',
        text: `${section} 문단 ${k} ${'가'.repeat(40)}`,
      })),
    })
  );
  const picked = S.pickShorts(scenes, { kind: 'SPORTS' });
  // 개수는 **목표지 약속이 아니다.** 이 가짜 대본은 520초뿐이라 안 겹치고
  // 열 편을 담을 수 없다. 그럴 때는 적게 뽑는 것이 맞다 — 같은 대목이 두
  // 번 올라가면 두 편 다 손해다. 그래서 하한만 본다.
  assert.ok(picked.length >= 5, `${picked.length}편뿐입니다 — 점수가 안 매겨진 것 같습니다`);
  assert.ok(picked.length <= 10, `${picked.length}편은 요청(10)보다 많습니다`);
  // 이 검사의 본뜻은 개수가 아니라 **값이 매겨졌는가**다. 점수가 없으면
  // 순위가 길이로만 정해지고, 1화에서 실제로 ACE 가 통째로 빠졌다.
  assert.ok(
    picked.some((p) => p.sections.includes('ACE')),
    '가장 중요한 ACE 구간이 쇼츠에 없습니다'
  );
});

await asyncTest('쇼츠끼리 거의 겹치지 않는다', async () => {
  const S = await import('../src/video/shorts.mjs');
  // 전에는 "절반 넘게"만 막았다. 다섯을 뽑자마자 같은 대목에서 조금씩
  // 밀린 쇼츠가 셋 나왔다 — 49% 겹쳐도 규칙은 통과하기 때문이다.
  const scenes = ['HOOK', 'RULES', 'ACE', 'OUTFIELD', 'CATCHER', 'DEBATE', 'SCENARIO', 'CLOSE'].map(
    (section, i) => ({
      scene_number: i + 1,
      section,
      paragraphs: Array.from({ length: 8 }, (_, k) => ({
        tag: 'THEORY',
        text: `${section} 문단 ${k} ${'가'.repeat(40)}`,
      })),
    })
  );
  const picked = S.pickShorts(scenes, { kind: 'SPORTS' });
  for (let i = 0; i < picked.length; i += 1) {
    for (let j = i + 1; j < picked.length; j += 1) {
      const a = picked[i];
      const b = picked[j];
      const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      const limit = Math.min(a.duration, b.duration) * 0.11;
      assert.ok(
        overlap <= limit,
        `${a.rank}순위와 ${b.rank}순위가 ${Math.round(overlap)}초 겹칩니다 (재료가 넉넉한데도)`
      );
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 실행 #27 에서 드러난 것들
// ─────────────────────────────────────────────────────────────

await asyncTest('카드 글이 프롬프트 목록까지 전달된다', async () => {
  // 실행 #27 에서 **카드 24장이 통째로 사라졌다.** 장면 설계는 card_text 를
  // 제대로 채웠는데 prompts.json 에 그 칸이 없었다. 그래서 그림 단계는
  // "프롬프트가 비었다"며 건너뛰고, 카드 단계는 그릴 것이 없다고 봤다.
  // 79샷 중 55장만 남고 24샷이 빈 채로 영상까지 갔다.
  const id = '952';
  // saveScenes 는 마지막에 상태를 올리는데, 그러려면 research.json 이
  // 있어야 한다. 없이 불렀다가 실행 #28 이 죽었다.
  const dir = store.contentPath(id);
  fs.mkdirSync(dir, { recursive: true });
  const { makeSports } = await import('../src/model.mjs');
  fs.writeFileSync(
    path.join(dir, 'research.json'),
    JSON.stringify(makeSports({ title: '카드 전달 검사', premise: '한 줄' }), null, 2),
    'utf8'
  );
  store.saveScenes(id, {
    scenes: [
      {
        scene_number: 1,
        section: 'RULES',
        mood: 'record',
        shots: [
          { shot_id: 'S1-1', asset_type: 'IMAGE', duration: 5, camera: 'zoom in', image_prompt: 'a desk', video_prompt: '', card_text: '' },
          { shot_id: 'S1-2', asset_type: 'IMAGE', duration: 5, camera: 'zoom in', image_prompt: '', video_prompt: '', card_text: 'FA 보상 규정\nA등급|연봉 200%' },
        ],
      },
    ],
    stats: {},
    problems: [],
  });
  const saved = JSON.parse(fs.readFileSync(store.contentPath(id, 'prompts.json'), 'utf8'));
  const card = saved.prompts.find((p) => p.shot_id === 'S1-2');
  assert.ok(card, 'S1-2 가 목록에 없습니다');
  assert.ok(card.card_text.includes('A등급'), 'card_text 가 prompts.json 에 담기지 않았습니다');

  // 그리고 실제로 두 길로 갈라져야 한다 — 한쪽은 AI, 한쪽은 카드.
  const { shotsToGenerate, cardShots } = await import('../src/assets/images.mjs');
  const assetDir = store.contentPath(id, 'assets');
  assert.deepEqual(shotsToGenerate(saved.prompts, { assetDir }).todo.map((x) => x.shot_id), ['S1-1']);
  assert.deepEqual(cardShots(saved.prompts, { assetDir }).todo.map((x) => x.shot_id), ['S1-2']);
});

await asyncTest('반올림이 쌓인 어긋남은 마지막 클립이 흡수한다', async () => {
  const { buildTimeline, DRIFT_ABSORB_MAX } = await import('../src/video/plan.mjs');
  // 실행 #27 이 여기서 멈췄다 — 8.9분짜리에서 1.5초. 클립 79개를 반올림하며
  // 쌓인 값이고 어느 샷도 틀리지 않았는데 합계만 안 맞았다.
  const scenes = [
    {
      scene_number: 1,
      section: 'HOOK',
      mood: 'record',
      shots: Array.from({ length: 10 }, (_, i) => ({
        shot_id: `S1-${i + 1}`,
        asset_type: 'IMAGE',
        duration: 5.333,
        camera: 'zoom in',
      })),
    },
  ];
  const base = buildTimeline(scenes, {});
  const total = base.duration;

  const fixed = buildTimeline(scenes, { narrationSeconds: Number((total + 1.46).toFixed(2)) });
  assert.deepEqual(fixed.problems, [], '반올림 차이로 멈췄습니다');
  assert.equal(fixed.duration, fixed.narration_seconds, '흡수하고도 합계가 안 맞습니다');
  // 마지막 클립만 늘어나야 한다. 중간을 건드리면 뒤 자막이 전부 밀린다.
  assert.equal(fixed.clips.at(-1).duration, Number((base.clips.at(-1).duration + 1.46).toFixed(2)));
  assert.equal(fixed.clips[0].duration, base.clips[0].duration, '첫 클립이 바뀌었습니다');
});

await asyncTest('큰 어긋남은 흡수하지 않고 그대로 알린다', async () => {
  const { buildTimeline, DRIFT_ABSORB_MAX } = await import('../src/video/plan.mjs');
  // 조용히 늘려서 덮어 버리면 영상과 소리가 어긋난 채로 나간다.
  const scenes = [
    {
      scene_number: 1,
      section: 'HOOK',
      mood: 'record',
      shots: Array.from({ length: 10 }, (_, i) => ({
        shot_id: `S1-${i + 1}`,
        asset_type: 'IMAGE',
        duration: 5,
        camera: 'zoom in',
      })),
    },
  ];
  const base = buildTimeline(scenes, {});
  const big = buildTimeline(scenes, { narrationSeconds: base.duration + DRIFT_ABSORB_MAX + 5 });
  assert.ok(big.problems.length, '크게 어긋났는데 조용히 넘어갔습니다');
  assert.equal(big.clips.at(-1).duration, base.clips.at(-1).duration, '덮으면 안 되는데 덮었습니다');
});

await asyncTest('스포츠 캐리커처는 얼굴을 그리되 아껴 쓰게 한다', async () => {
  const V = await import('../src/scenes/visuals.mjs');
  // 1화에서는 얼굴 없는 영상이 나왔다 — 눈코입 없는 동그라미와 실루엣뿐.
  // 그래서 "얼굴을 그린다"로 밀었는데, 3화에서는 반대로 너무 많이
  // 그려서 "동작이랑 얼굴 방향도 안 맞다, 도저히 볼 수가 없다"는
  // 말을 들었다. 그림 모델은 같은 사람을 여러 번 그리면 매번 다른
  // 사람을 그린다 — **많이 그릴수록 많이 틀린다.**
  //
  // 그래서 지금 자리는 가운데다. 얼굴은 그리되, 꼭 필요한 데만.

  // 그릴 때는 얼굴을 그린다 (1화의 "눈코입 없는 동그라미"로 안 돌아간다).
  const p = V.composeImagePrompt('a general manager at a desk', null, { kind: 'SPORTS' });
  assert.ok(/eyebrows/.test(p) && /mouth/.test(p), '눈썹·입 지시가 없습니다');

  // ── 3화·4화에서 나온 것들을 하나씩 막는다 (2026-11-03) ──
  // 머리가 몸보다 큰 대머리 인형이 나왔다. 운영자 말로 "퀄리티가 너무
  // 떨어진다". 원인이 전부 이 프롬프트 안에 적혀 있었다.
  assert.ok(/anime|manga/.test(p), '2D 만화 지시가 없습니다');
  // 지브리 결은 **요소로** 적는다. 스튜디오 이름을 적으면 모델이
  // 그걸 어떻게 이해하는지 통제할 수 없다 (2026-11-03).
  assert.ok(/hand-painted|watercolour/.test(p), '손으로 칠한 결이 없습니다');
  assert.ok(!/ghibli/i.test(p), '스튜디오 이름이 들어갔습니다 — 요소로 적으세요');
  assert.ok(/never a 3D render/.test(p), '3D 를 막지 않습니다');
  assert.ok(/one seventh/.test(p), '등신 비율을 숫자로 안 박았습니다 — 말로 두면 흐려집니다');
  assert.ok(/never bald/.test(p), '머리카락 지시가 없습니다 — 대머리가 나옵니다');

  // ── 머리부터 발끝까지 (2026-11-07 운영자) ──
  // "그림 위에 얼굴을 얹지 말고, 머리부터 발끝까지 그려서 넣어라."
  // 전에는 'waist-up or full-body' 였다. 허리 위 샷은 얼굴만 큰 그림이
  // 되기 쉽고, 그럴수록 얼굴이 따로 노는 게 눈에 띈다.
  assert.ok(/from head to feet/.test(p), '전신 지시가 없습니다');
  assert.ok(/complete body inside\s+the frame|complete body inside the frame/.test(p), '프레이밍 지시가 없습니다 — 다리가 잘립니다');
  assert.ok(/never a floating head/.test(p), '얼굴만 얹는 것을 안 막습니다');

  // ── 머리 방향은 몸이 정한다 (2026-11-07 운영자) ──
  // 이 테스트 맨 위 주석에 3화 때도 "동작이랑 얼굴 방향도 안 맞다"는
  // 말이 적혀 있다. 같은 지적이 두 번 나왔다는 뜻이다. 그때는 얼굴을
  // 적게 그리는 쪽으로 때웠는데, 적게 그려도 그린 것이 틀리면 똑같다.
  // 이번에는 **방향 자체**를 못 박는다.
  assert.ok(/from behind, draw the back of the head/.test(p), '뒷모습 지시가 없습니다');
  assert.ok(/never twist the neck/.test(p), '목 꺾기를 안 막습니다');
  assert.ok(
    /never a front-facing face on a figure seen from behind/.test(p),
    '뒷모습에 정면 얼굴 붙이는 것을 안 막습니다'
  );
  // 얼굴 지시는 **조건부**여야 한다. 무조건이면 뒷모습에서도 얼굴을 그린다.
  assert.ok(
    /when the face is turned toward the camera/.test(p),
    '얼굴 지시가 조건 없이 걸려 있습니다 — 뒷모습 샷에서 목이 꺾입니다'
  );

  // 닮게 그리는 샷에서도 같은 조건이 걸려야 한다. 여기가 더 세다 —
  // "사진과 같은 얼굴"은 얼굴이 안 보이는 자세에서도 얼굴을 불러낸다.
  const ref = V.composeImagePrompt('a pitcher seen from behind', null, {
    kind: 'SPORTS',
    likeness: true,
  });
  assert.ok(
    /likeness applies only when the pose actually shows his face/.test(ref),
    '닮음 지시에 자세 조건이 없습니다'
  );
  // 옛 문구가 되살아나지 않는지 본다. 이 셋이 아기 인형을 만들었다.
  for (const bad of ['oversized head on small body', 'glossy toy-figure', 'clear large eyes']) {
    assert.ok(!p.includes(bad), `"${bad}" 가 되살아났습니다`);
  }
  // 금지 목록에도 이름을 적어 둔다.
  for (const no of ['no 3D render', 'no bald head', 'no cropped legs']) {
    assert.ok(p.includes(no), `금지 목록에 "${no}" 가 없습니다`);
  }
  // ⚠️ 2026-11-11. 'no chibi, no baby face, no toddler' 를 **뺐다.**
  //    그 줄이 있는데도 김도영(24세)·하주석(32세)이 아이로 나왔다.
  //    금지로 적은 낱말이 오히려 그쪽으로 끈다 — 모자 마크와 같은 성질이다.
  //    이제 그릴 것을 적는다.
  for (const w of ['chibi', 'baby face', 'toddler']) {
    assert.ok(!p.includes(w), `"${w}" 가 프롬프트에 있습니다 — 부르면 그립니다`);
  }
  assert.ok(
    /adult body proportions with an adult neck and shoulders/.test(p),
    '어른으로 그리라는 줄이 없습니다'
  );
  // 특정인을 닮히는 것은 여전히 막는다.
  assert.ok(/not resembling any specific real person/.test(p));
  assert.ok(/no real identifiable public figures/.test(p));

  // 장면 지시는 얼굴을 아껴 쓰라고 말해야 한다 (3화 자리로도 안 간다).
  const sys = V.visualsSystemFor('SPORTS');
  assert.ok(/얼굴은 아껴 쓴다/.test(sys), '얼굴을 아끼라는 지시가 없습니다');
  assert.ok(/한 사람에 한 장면/.test(sys), '한 사람에 한 장면 규칙이 없습니다');
  assert.ok(/많아야 여섯/.test(sys), '한 편 상한이 없습니다');
  assert.ok(/덕아웃|전광판/.test(sys), '얼굴 대신 쓸 그림을 알려주지 않습니다');

  // 글자 카드는 중요한 숫자만 (2026-11-03). 3화·4화에서 30~41장을
  // 썼다가 글자만 보는 영상이 됐다.
  assert.ok(/6~10장만 쓴다/.test(sys), '카드 상한이 안 줄었습니다');
  assert.ok(/카드로 쓰지 말 것/.test(sys), '카드로 쓰면 안 되는 것을 안 알려줍니다');
  assert.ok(!/10~20장/.test(sys), '옛 카드 상한이 남아 있습니다');
  // 1화의 실수로는 돌아가지 않는다 — 뒷모습만 권하면 안 된다.
  assert.ok(!/뒷모습·옆모습·손·책상 위가 낫다/.test(sys), '아직 뒷모습만 권하고 있습니다');
});

await asyncTest('몸이 사라지는 네 가지를 막는다 (실행 #65 화면)', async () => {
  // 운영자가 실행 #65 영상을 보면서 하나씩 짚었다. 전부 **몸이
  // 사라지는** 같은 병이고, 나타나는 꼴만 달랐다.
  //
  //   "이건 왜 목만 둥둥 떠 있나?"        → 클립보드가 화면 아래를 덮고
  //                                         머리와 어깨만 그 위에 떴다
  //   "다리는 어디 가고? 유니폼이 의자에   → 앉은 뒷모습인데 다리가 없고
  //    걸려 있는 것 같나"                   점퍼만 의자에 걸린 꼴
  //   "이건 왜 등에 걸려 있나?"            → 클립보드가 점퍼 등판에 붙었다
  //   "유니폼에 왜 목만 둥둥 떠 있나?"      → 라커룸에서 옷걸이에 걸린
  //                                         유니폼 위에 머리만 얹혔다
  //
  // 뿌리는 하나다. 우리가 "머리부터 발끝까지"라고만 적고 **소품을
  // 어디에 얼마나 크게 두는지, 앉으면 어떻게 하는지**를 안 적었다.
  // 모델은 빈자리를 제 맘대로 채운다.
  const V = await import('../src/scenes/visuals.mjs');
  const p = V.composeImagePrompt('a manager with a clipboard', null, { kind: 'SPORTS' });

  // ① 소품이 몸을 가리지 않는다
  assert.ok(/never covering the/.test(p), '소품이 몸 가리는 것을 안 막습니다');
  assert.ok(/never enlarged to fill the lower half/.test(p), '소품 크기를 안 막습니다');
  assert.ok(/never a head and shoulders sitting on top of a large object/.test(p), '목만 뜨는 것을 안 막습니다');

  // ② 앉아도 다리를 그린다
  assert.ok(/a seated figure still has legs/.test(p), '앉은 자세에 다리 지시가 없습니다');
  assert.ok(/never an empty jacket or uniform draped over a chair/.test(p), '빈 옷이 사람 자리를 차지하는 것을 안 막습니다');

  // ③ 물건은 손에 들거나 어디에 놓는다
  assert.ok(/objects are held in a hand/.test(p), '물건 두는 자리가 없습니다');
  assert.ok(/never stuck to the back or chest/.test(p), '등에 붙는 것을 안 막습니다');

  // ④ 사람과 걸어 둔 옷은 다른 것이다
  assert.ok(/never a head on top of a jersey on a hanger/.test(p), '옷걸이 유니폼과 섞이는 것을 안 막습니다');

  // 그리고 전신은 그대로 지켜져야 한다. 위의 것들을 넣느라 이게
  // 빠지면 처음 문제로 돌아간다.
  assert.ok(/from head to feet/.test(p), '전신 지시가 사라졌습니다');
});

await asyncTest('한 장면의 인물 샷은 그림 한 장을 나눠 쓰고 움직이지 않는다', async () => {
  // 3화: 한 장면이 샷 두세 개로 쪼개지고 샷마다 그림을 따로 그렸다.
  // 같은 사람을 따로 그리면 얼굴도 방향도 자세도 다 다르게 나온다 —
  // 18초 동안 세 사람이 지나간다. 그려 달라는 장 수를 줄이는 것
  // 말고는 방법이 없다.
  const V = await import('../src/scenes/visuals.mjs');
  const scene = { scene_number: 19, section: 'GAP', shots: [
    { shot_id: 'S19-1' }, { shot_id: 'S19-2' }, { shot_id: 'S19-3' },
  ] };
  const shot = (id, camera) => ({
    shot_id: id, image_prompt: 'a round-faced slugger', video_prompt: 'he turns',
    era: 'present', camera, motion_need: 6, depicts_real_person: true, card_text: '',
  });
  const { scene: out } = V.mergeVisuals(scene, {
    mood: 'record', visual_description: 'x',
    shots: [shot('S19-1', 'pan right'), shot('S19-2', 'zoom in'), shot('S19-3', 'parallax')],
  }, { kind: 'SPORTS' });

  // 그림은 한 장만 그린다.
  const drawn = out.shots.filter((x) => x.image_prompt);
  assert.equal(drawn.length, 1, `${drawn.length}장을 그립니다 — 한 장이어야 합니다`);
  assert.equal(out.shots[1].same_image_as, 'S19-1');
  assert.equal(out.shots[2].same_image_as, 'S19-1');
  // 안 그리는 샷은 영상으로도 만들지 않는다 (돈이 샌다).
  assert.equal(out.shots[1].video_prompt, '');

  // 얼굴은 움직이지 않는다. 모델이 pan 을 골랐어도 덮어쓴다.
  for (const x of out.shots) {
    assert.equal(x.camera, 'hold', `${x.shot_id} 카메라가 ${x.camera} 입니다`);
  }

  // 사람이 안 나오는 샷은 건드리지 않는다.
  const plain = V.mergeVisuals(
    { scene_number: 4, shots: [{ shot_id: 'S04-1' }, { shot_id: 'S04-2' }] },
    { mood: 'record', visual_description: 'x', shots: [
      { ...shot('S04-1', 'pan right'), depicts_real_person: false },
      { ...shot('S04-2', 'zoom in'), depicts_real_person: false },
    ] },
    { kind: 'SPORTS' }
  ).scene;
  assert.equal(plain.shots[0].camera, 'pan right');
  assert.ok(!plain.shots[1].same_image_as, '사람 없는 샷을 묶었습니다');
});

await asyncTest('hold 카메라는 거의 움직이지 않는다', async () => {
  const F = await import('../src/video/ffmpeg.mjs');
  const hold = F.cameraFilter('hold', { width: 1920, height: 1080, fps: 30, duration: 5 });
  const zoom = F.cameraFilter('zoom in', { width: 1920, height: 1080, fps: 30, duration: 5 });
  // 중앙 기준이라 얼굴이 화면 밖으로 밀려나지 않는다.
  assert.ok(/iw\/2-\(iw\/zoom\/2\)/.test(hold), 'hold 가 중앙 기준이 아닙니다');
  // 확대량이 zoom in 보다 훨씬 작아야 한다.
  assert.ok(F.HOLD_ZOOM_RANGE < 0.1, `hold 확대량이 ${F.HOLD_ZOOM_RANGE} 입니다 — 너무 큽니다`);
  assert.ok(F.HOLD_ZOOM_RANGE > 0, 'hold 가 완전히 멈추면 영상이 끊긴 것처럼 보입니다');
  assert.ok(hold !== zoom);
  // 가로로 미는 성분이 없어야 한다 — 그게 "붕 뜨는" 느낌을 만들었다.
  assert.ok(!/\(iw-iw\/zoom\)/.test(hold), 'hold 에 가로 이동이 들어 있습니다');
});

test('스포츠 목소리는 들어 보고 고른 것이다', () => {
  // Puck 은 Google 의 성격 설명(upbeat)만 보고 골랐다가 운영자에게
  // "너무 어린 하이톤"이라는 말을 들었다. Algieba 는 같은 야구 문장을
  // 여덟 목소리로 읽혀 나란히 듣고 고른 것이다 (2026-11-03).
  const src = fs.readFileSync(
    fileURLToPath(new URL('../src/audio/tts.mjs', import.meta.url)), 'utf8'
  );
  assert.ok(
    /SPORTS_VOICE = 'ko-KR-Chirp3-HD-Algieba'/.test(src),
    '스포츠 목소리가 바뀌었습니다 — 바꿀 때는 먼저 들어 보세요 (voice --sample --kind=SPORTS)'
  );
  // 되돌아가지 않는지 본다.
  assert.ok(!/SPORTS_VOICE = 'ko-KR-Chirp3-HD-Puck'/.test(src), 'Puck 으로 되돌아갔습니다');
  // 왜 바꿨는지가 코드에 남아 있어야 한다. 안 남기면 다음에 또 설명만
  // 보고 고른다.
  assert.ok(/들어 보고 골랐다/.test(src), '고른 근거가 안 적혀 있습니다');
});

await asyncTest('스포츠는 중계 톤으로 조금 빠르게 읽는다', async () => {
  const T = await import('../src/audio/tts.mjs');
  // 0.95 는 미스터리·동화에 맞춘 속도다. 야구 분석에 쓰면 늘어진다.
  assert.ok(T.speakingRateFor('SPORTS') > T.DEFAULT_SPEAKING_RATE, '스포츠가 더 빠르지 않습니다');
  assert.equal(T.speakingRateFor('TALE'), T.DEFAULT_SPEAKING_RATE, '동화 속도가 바뀌었습니다');
  assert.equal(T.speakingRateFor('EVENT'), T.DEFAULT_SPEAKING_RATE);
  // 숫자와 퍼센트를 읽어야 하므로 너무 빠르면 안 된다.
  assert.ok(T.speakingRateFor('SPORTS') <= 1.15, '너무 빨라서 금액이 안 들립니다');
});

await asyncTest('속도를 바꾸면 이미 있는 음성이어도 다시 만든다', async () => {
  const { execFileSync } = await import('node:child_process');
  // 목소리와 같은 이유다. 안 적어 두면 속도를 바꿔도 옛 파일을 그대로 쓰고,
  // 완성본에서야 안 바뀐 걸 알게 된다.
  const id = '953';
  const dir = store.contentPath(id);
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  const { makeSports } = await import('../src/model.mjs');
  fs.writeFileSync(path.join(dir, 'research.json'), JSON.stringify(makeSports({ title: '속도 검사' })), 'utf8');
  fs.writeFileSync(path.join(dir, 'audio', 'voice.mp3'), 'x');
  store.saveNarration(id, { timings: [], totalSeconds: 1, voice: 'ko-KR-Chirp3-HD-Iapetus', speakingRate: 0.95 });

  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'audio', 'timings.json'), 'utf8'));
  assert.equal(saved.speaking_rate, 0.95, '속도가 기록되지 않았습니다');

  // scenes.json 이 없으면 voice 단계가 먼저 멈추므로, 여기서는 기록만 확인한다.
  const { speakingRateFor } = await import('../src/audio/tts.mjs');
  assert.notEqual(saved.speaking_rate, speakingRateFor('SPORTS'), '검사 전제가 깨졌습니다');
});

await asyncTest('화풍 미리보기가 깨졌던 장면을 본다', async () => {
  const P = await import('../src/assets/preview.mjs');
  // 미리보기는 예쁜 장면이 아니라 **못 하던 장면**을 넣어야 뜻이 있다.
  // 1화에서 사라진 것이 얼굴이므로 셋 다 얼굴이다.
  const scenes = P.previewScenesFor('SPORTS');
  assert.ok(scenes.length >= 3, '볼 장면이 모자랍니다');
  for (const sc of scenes) {
    assert.ok(sc.why, `${sc.key}: 왜 보는지가 안 적혀 있습니다`);
    // 얼굴 단서는 'face' 라고만 적히지 않는다 — 표정을 쓰는 말이면 된다.
    assert.ok(
      /face|faces|expression|frowning|serious|smiling|looking/i.test(sc.content),
      `${sc.key}: 얼굴이나 표정이 안 들어간 장면입니다`
    );
  }
  // 모델을 나란히 놓고 봐야 모델 차이인지 프롬프트 차이인지 가른다.
  const jobs = P.previewJobs('SPORTS', { models: ['schnell', 'dev'] });
  assert.equal(jobs.length, scenes.length * 2);
  const bySceneKey = jobs.filter((j) => j.key === scenes[0].key);
  assert.equal(bySceneKey.length, 2, '같은 장면이 모델마다 하나씩 있어야 합니다');
  assert.equal(bySceneKey[0].prompt, bySceneKey[1].prompt, '같은 장면인데 프롬프트가 다릅니다');
  // 화풍과 금지 목록은 그대로 붙어야 한다.
  // 미리보기도 본편과 **같은 화풍**이어야 뜻이 있다. 2D 만화로 바꾼 뒤
  // 여기만 옛 문구를 보고 있으면 둘이 갈라진 것을 못 잡는다.
  assert.ok(/manga|anime/.test(jobs[0].prompt), '미리보기가 본편 화풍과 다릅니다');
  assert.ok(/never bald/.test(jobs[0].prompt), '미리보기에 머리카락 지시가 없습니다');
  // ⚠️ 2026-11-09 에 또 바뀌었다. 'no Major League Baseball logos' 도
  //    **뺐다.** flux-schnell·dev 는 negative_prompt 를 안 받아서
  //    금지 목록이 프롬프트 **본문**에 붙어 갔다 — 모델이 받은 것은
  //    금지가 아니라 "Major League Baseball" 이라는 낱말이었다.
  assert.ok(
    !/Major League Baseball/.test(jobs[0].prompt),
    '미국 리그 이름이 프롬프트에 있습니다 — 부르면 그립니다'
  );
  // 2026-11-03 유니폼을 국대로 바꿨다. 가슴 글자는 **살아야** 한다 —
  // 전에는 금지 목록의 'no readable jersey text' 가 그걸 지웠다.
  // ⚠️ 2026-11-07 에 **두 번** 바뀌었다.
  //
  //    아침: 국대 유니폼 고정을 뺐다 — 그 지시가 모델에게 "야구
  //          유니폼처럼 생긴 아무것"을 그리게 했고 거기서 양키스 모자가
  //          나왔다. 샷마다 "장면 설명에 적힌 팀 색"을 쓰게 했다.
  //    저녁: 그 "장면 설명에 적힌" 이 또 틀렸다. 운영자: "유니폼이
  //          완전 다른 색상이다." 색을 적는 주체가 설계 AI 였기 때문이다.
  //          이제 유니폼은 uniforms.mjs 가 만들고 코드가 꽂는다.
  //
  //    여기 미리보기는 사람 기록이 없어서(화풍만 보는 자리다) 구단
  //    문장이 안 붙는다. 그래서 **밑줄**이 남아 있는지만 본다.
  assert.ok(
    /the team colours given for this figure/.test(jobs[0].prompt),
    '팀 색 밑줄이 없습니다'
  );
  // 뒤에서도 누구인지 읽혀야 한다 (2026-11-07 운영자: "유니폼과 등번호가
  // 같아야 선수임을 뒤만 봐도 알 수 있지 않나").
  assert.ok(
    /identifiable from behind/.test(jobs[0].prompt),
    '뒤에서 읽히라는 지시가 없습니다'
  );
  assert.ok(
    !/no readable jersey text/.test(jobs[0].prompt),
    '유니폼 글자를 막는 줄이 되살아났습니다 — 국대 유니폼 지시와 충돌합니다'
  );
  // 미리보기는 참조 사진이 없다. 그러면 지어낸 인물이어야 한다.
  assert.ok(/an invented character/.test(jobs[0].prompt));
});

await asyncTest('사진이 있는 사람만 닮게 그리라고 적는다', async () => {
  // 사진이 없는데 "닮게 그려라"라고 하면, 닮지도 않으면서 닮은 척하는
  // 얼굴이 나온다. 그게 제일 나쁘다.
  const V = await import('../src/scenes/visuals.mjs');
  const plain = V.composeImagePrompt('a batter at the plate', null, { kind: 'SPORTS' });
  const like = V.composeImagePrompt('a batter at the plate', null, {
    kind: 'SPORTS',
    likeness: true,
  });

  assert.ok(plain.includes(V.SPORTS_INVENTED_CLAUSE));
  assert.ok(!plain.includes('reference photograph'));
  assert.ok(like.includes(V.SPORTS_LIKENESS_CLAUSE));
  // 둘을 같이 붙이면 서로 반대라 모델이 하나를 버린다.
  assert.ok(!like.includes(V.SPORTS_INVENTED_CLAUSE), '반대되는 두 줄이 같이 붙었습니다');
  // 운영자가 "캐리커처 할 필요 없다"고 했다(2026-11-03).
  assert.ok(/no caricature or exaggeration/.test(like));
  // 2026-11-04: "감독 얼굴이 그냥 얼굴이잖아, 애니메이션으로 그려야지".
  // 닮음 지시 안에 **그림체가 먼저**라는 말이 들어 있어야 한다.
  assert.ok(/hand-painted 2D anime character/.test(like), '그림으로 그리라는 말이 없습니다');
  assert.ok(/never a photographic face/.test(like), '사진 얼굴을 막는 말이 없습니다');

  // 금지 목록의 이 줄은 닮게 그리라는 줄과 정반대다. 같이 보내면
  // 모델이 하나를 버리는데, 어느 쪽을 버렸는지는 그림이 나와야 안다.
  assert.ok(
    !like.includes('no real identifiable public figures'),
    '닮게 그리라면서 실존 인물을 막는 줄이 같이 갔습니다'
  );
  // 사진을 안 준 샷에서는 그대로 남아야 한다.
  assert.ok(plain.includes('no real identifiable public figures'));
  // 미스터리·동화 편은 건드리면 안 된다.
  const tale = V.composeImagePrompt('a quiet road', null, { kind: 'TALE' });
  assert.ok(tale.includes('no real identifiable public figures'));
});

await asyncTest('사진 주소가 http 일 때만 참조로 센다', async () => {
  const V = await import('../src/scenes/visuals.mjs');
  const names = V.photoNamesOf({
    research: {
      people: [
        { name: '김도영', photo: 'https://example.com/a.jpg' },
        // 로컬 경로는 이미지 모델이 열 수 없다. 세면 안 된다.
        { name: '박재현', photo: '/home/user/photos/b.jpg' },
        { name: '최원호', photo: '' },
        { name: '', photo: 'https://example.com/c.jpg' },
      ],
    },
  });
  assert.deepEqual([...names], ['김도영']);
  assert.equal(V.photoNamesOf(null).size, 0);
  assert.equal(V.photoNamesOf({}).size, 0);

  // ⚠️ 실제로 넘어오는 모양은 이쪽이다. main.mjs 가 `item: loaded.research`
  //    로 넘기므로 item 이 **이미** research 다. 처음에 한 겹 더 들어가서
  //    봤는데 그러면 사진을 넣어도 한 장도 안 붙는다 — 조용히 실패한다.
  const flat = V.photoNamesOf({
    title: '6화',
    people: [
      { name: '박재현', photo: 'https://example.com/p.jpg' },
      { name: '최원호', photo: 'https://example.com/c.jpg' },
      { name: '김도영', photo: '' },
    ],
  });
  assert.deepEqual([...flat].sort(), ['박재현', '최원호']);
});

await asyncTest('6화 사람 목록이 실제 파일 모양과 맞는다', async () => {
  // 파일이 바뀌어도 코드가 사진을 찾을 수 있는지 본다. 모양이 어긋나면
  // 돈을 다 쓰고 나서야 "왜 안 닮았지" 하게 된다.
  const V = await import('../src/scenes/visuals.mjs');
  const file = new URL('../../스포츠영상/6화.json', import.meta.url).pathname;
  if (!fs.existsSync(file)) return; // 대본은 리포에 있지만 없는 환경도 있다
  const item = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(item.people) && item.people.length, '6화에 people 이 없습니다');
  for (const p of item.people) {
    assert.ok(String(p.name || '').trim(), 'people 에 이름 없는 항목이 있습니다');
  }
  // 사진 주소를 아직 안 넣었으면 여기는 비어 있다. 그건 정상이다 —
  // 다만 넣었는데도 비면 모양이 어긋난 것이므로 그때 이 검사가 잡는다.
  const named = new Set(item.people.map((p) => String(p.name).trim()));
  for (const n of V.photoNamesOf(item)) {
    assert.ok(named.has(n), `${n} 은 people 에 없는 이름입니다`);
  }
});

await asyncTest('설계한 샷이 사람 이름을 달고 나온다', async () => {
  // 이름이 없으면 사진을 받아 둬도 어느 샷에 쓸지 알 수가 없다.
  const V = await import('../src/scenes/visuals.mjs');
  const scene = {
    scene_number: 1,
    shots: [{ shot_id: 'S1-1', duration: 5 }, { shot_id: 'S1-2', duration: 5 }],
  };
  const { scene: out } = V.mergeVisuals(
    scene,
    {
      shots: [
        {
          shot_id: 'S1-1', image_prompt: 'a batter', video_prompt: '', era: 'present',
          camera: 'zoom in', motion_need: 3, depicts_real_person: true, person: ' 김도영 ',
        },
        {
          shot_id: 'S1-2', image_prompt: 'an empty dugout', video_prompt: '', era: 'present',
          camera: 'zoom in', motion_need: 1, depicts_real_person: false,
        },
      ],
    },
    { kind: 'SPORTS', photoNames: new Set(['김도영']) }
  );
  assert.equal(out.shots[0].person, '김도영', '앞뒤 공백을 안 털었습니다');
  assert.equal(out.shots[1].person, '');
  assert.ok(out.shots[0].image_prompt.includes('reference photograph'));
  assert.ok(out.shots[1].image_prompt.includes('an invented character'));
});

test('미리보기 모드가 이미지 토큰 확인을 거친다', () => {
  // 토큰 없이 돌리면 그림 단계에서야 죽는다. 앞에서 막는다.
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  const optBlock = yml.slice(yml.indexOf('        options:'), yml.indexOf('      tale_plan:'));
  const modes = [...optBlock.matchAll(/^\s+- '(.+)'$/gm)].map((m) => m[1]);
  const preview = modes.find((m) => m.includes('화풍 미리보기'));
  assert.ok(preview, '화풍 미리보기 방식이 없습니다');

  const at = yml.indexOf('- name: 이미지 토큰이 등록되어 있는지 확인');
  const cond = yml.slice(at, yml.indexOf('\n        env:', at));
  const hits = [...cond.matchAll(/contains\(inputs\.mode, '([^']+)'\)/g)].some((m) =>
    preview.includes(m[1])
  );
  assert.ok(hits, '미리보기 모드에 이미지 토큰 확인이 안 걸립니다');

  // 결과물이 아티팩트로 나와야 받아 볼 수 있다.
  assert.ok(yml.includes('ai-surprise/preview/'), '미리보기 폴더가 결과물에 안 담깁니다');
});

// ─────────────────────────────────────────────────────────────

section('4-k. 목소리를 종류가 고른다');

const {
  DEFAULT_VOICE: TTS_DEFAULT_VOICE,
  SPORTS_VOICE,
  voiceFor,
} = await import('../src/audio/tts.mjs');

test('스포츠는 중계 톤 목소리, 나머지는 기본 목소리', () => {
  assert.equal(voiceFor('SPORTS'), SPORTS_VOICE);
  assert.equal(voiceFor('TALE'), TTS_DEFAULT_VOICE);
  assert.equal(voiceFor('EVENT'), TTS_DEFAULT_VOICE);
  assert.equal(voiceFor(undefined), TTS_DEFAULT_VOICE);
  assert.notEqual(SPORTS_VOICE, TTS_DEFAULT_VOICE, '바꾼 보람이 없습니다');
});

test('목소리 이름이 한국어 Chirp3 꼴이다', () => {
  // 이름을 잘못 적으면 합성이 400 으로 죽는데, **완성본을 25분 돌린 끝에**
  // 알게 된다. 실제로 있는 이름인지는 `voice --voices` 로만 알 수 있으므로
  // (키가 필요하다) 여기서는 꼴만 본다 — 오타와 계열 착각은 이걸로 걸린다.
  for (const name of [TTS_DEFAULT_VOICE, SPORTS_VOICE]) {
    assert.match(name, /^ko-KR-Chirp3-HD-[A-Z][A-Za-z]+$/, `목소리 이름이 이상합니다: ${name}`);
  }
});

test('목소리를 바꾸면 쓰던 음성을 다시 만든다', () => {
  // 목소리만 바꾸고 돌리면 옛 voice.mp3 를 그대로 쓰던 때가 있었다.
  // 바뀐 줄 알고 있다가 완성본에서야 안 바뀐 것을 알게 된다.
  const src = fs.readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
  assert.ok(/made !== wantVoice/.test(src), '만들어 둔 목소리와 쓰려는 목소리를 견주지 않습니다');
  assert.ok(/voiceFor\(kind\)/.test(src), '종류가 목소리를 고르게 되어 있지 않습니다');
  // 사람이 들어보고 고른 것이 코드의 기본값보다 낫다. 지정하면 그쪽이 이긴다.
  assert.ok(/env\('TTS_VOICE', voiceFor\(kind\)\)/.test(src), 'TTS_VOICE 지정이 기본값을 못 이깁니다');
});

test('화풍 미리보기에는 ffmpeg를 깔지 않는다', () => {
  // 실행 #30 이 여기서 죽었다. 모드 이름에 '그림' 이 들어 있어 설치 단계에
  // 걸렸는데, 그 방식은 그림 6장을 받아 저장할 뿐이라 ffmpeg 를 한 번도
  // 부르지 않는다. 필요하지도 않은 설치에 6분을 쓰고 끝났다.
  //
  // 조건을 눈으로 읽는 대신 **실제로 따져 본다.** contains() 만 세던
  // 기존 검사는 `!` 를 못 본다 — 그래서 이 버그를 못 잡았다.
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  const start = yml.indexOf('- name: ffmpeg와 한글 글꼴 설치');
  const line = yml.slice(yml.indexOf('if: ${{', start), yml.indexOf('\n        timeout-minutes', start));
  const expr = line.slice(line.indexOf('${{') + 3, line.lastIndexOf('}}'));

  const evalFor = (mode) => {
    const js = expr.replace(
      /contains\(inputs\.mode, '([^']+)'\)/g,
      (_, needle) => (mode.includes(needle) ? 'true' : 'false')
    );
    // 치환하고 남은 글자가 논리식뿐인지 본다. 아니면 식이 바뀐 것이므로
    // 조용히 통과시키지 않고 여기서 멈춘다.
    assert.match(js, /^[\s!&|()truefals]+$/, `조건이 아는 꼴이 아닙니다: ${js}`);
    return Function(`return (${js});`)();
  };

  const optBlock = yml.slice(yml.indexOf('        options:'), yml.indexOf('      tale_plan:'));
  const modes = [...optBlock.matchAll(/^\s+- '(.+)'$/gm)].map((m) => m[1]);
  const find = (...needles) => {
    const m = modes.find((x) => needles.every((n) => x.includes(n)));
    assert.ok(m, `방식을 찾지 못했습니다: ${needles.join(' ')}`);
    return m;
  };

  assert.equal(evalFor(find('미리보기')), false, '미리보기에 ffmpeg 를 깝니다 — 쓰지도 않는데 6분을 씁니다');
  assert.equal(evalFor(find('스포츠', '완성본')), true, '스포츠 완성본에 ffmpeg 가 안 깔립니다');
  assert.equal(evalFor(find('동화', '완성본')), true, '동화 완성본에 ffmpeg 가 안 깔립니다');
  assert.equal(evalFor(find('올릴 거리')), true, '올릴 거리에 ffmpeg 가 안 깔립니다');
  assert.equal(evalFor(find('테스트만')), false, '테스트만 하는데 ffmpeg 를 깝니다');
  assert.equal(evalFor(find('소리 점검')), false, '소리 점검인데 ffmpeg 를 깝니다');
});


// ─────────────────────────────────────────────────────────────

section('4-l. 사람 생김새가 화면 지시까지 간다');

const { peopleRules, visualsSystemFor: visSysFor } = await import('../src/scenes/visuals.mjs');
const { makeSports: mkSports } = await import('../src/model.mjs');

const FIVE = [
  { name: '원태인', role: '삼성 투수', look: 'a Korean man in his mid-20s with a round face' },
  { name: '최지훈', role: 'SSG 중견수', look: 'a narrow tapered face', tell: 'a red headband' },
];

test('생김새를 적으면 화면 지시에 그대로 실린다', () => {
  const rules = peopleRules(FIVE);
  assert.ok(rules.includes('a Korean man in his mid-20s with a round face'), '생김새 문장이 안 실립니다');
  assert.ok(rules.includes('a red headband'), '표식이 안 실립니다');
  assert.ok(rules.includes('원태인'), '누구 생김새인지 안 적힙니다');
  assert.ok(/그대로 베껴/.test(rules), '그대로 쓰라는 말이 없으면 모델이 줄여 씁니다');
});

test('생김새가 없으면 빈 제목만 붙이지 않는다', () => {
  // 빈 제목만 남으면 모델이 그 칸을 채우려고 엉뚱한 말을 지어낸다.
  assert.equal(peopleRules([]), '');
  assert.equal(peopleRules(null), '');
  assert.equal(peopleRules([{ name: '이름만' }]), '', 'look 없는 사람이 실렸습니다');
});

test('스포츠 화면 지시에만 사람이 붙는다', () => {
  const sports = visSysFor('SPORTS', { people: FIVE });
  const tale = visSysFor('TALE', { people: FIVE });
  assert.ok(sports.includes('a red headband'), '스포츠에 사람이 안 붙습니다');
  assert.ok(!tale.includes('a red headband'), '동화에 선수 생김새가 붙었습니다');
  // 사람을 안 넘겨도 스포츠 규칙 자체는 그대로 있어야 한다.
  assert.ok(visSysFor('SPORTS').includes('선수 이름을 프롬프트에 쓰지 않는다'));
});

test('기획 파일의 사람이 소재 레코드에 실린다', () => {
  const item = mkSports({
    title: '제목',
    sources: [{ name: 'ㄱ', url: 'https://example.com/a' }],
    people: [
      { name: '원태인', role: '투수', look: 'round face', tell: '' },
      { name: '버리는사람', look: '' },
      { look: '이름이 없다' },
    ],
  });
  assert.equal(item.people.length, 1, 'look 이나 이름이 빈 사람을 걸러내지 않습니다');
  assert.equal(item.people[0].look, 'round face');
});

test('1화 기획에 다섯 명이 다 적혀 있다', () => {
  // 한 명이라도 빠지면 그 선수만 샷마다 다른 얼굴로 나온다 — 영상을
  // 다 만들고 나서야 안다.
  const plan = JSON.parse(
    // 경로에 한글이 있다. URL.pathname 은 퍼센트 인코딩된 문자열을 주므로
    // 그대로 열면 파일을 못 찾는다.
    fs.readFileSync(decodeURIComponent(new URL('../../스포츠영상/1화.json', import.meta.url).pathname), 'utf8')
  );
  const names = (plan.people || []).map((p) => p.name);
  for (const who of ['원태인', '구자욱', '홍창기', '최지훈', '박동원']) {
    assert.ok(names.includes(who), `${who} 생김새가 없습니다`);
  }
  for (const p of plan.people) {
    assert.ok(p.look && p.look.length > 40, `${p.name} 생김새가 너무 짧습니다`);
    assert.ok(!/[가-힣]/.test(p.look), `${p.name} 생김새에 한글이 있습니다 — 프롬프트는 영어입니다`);
  }
  // 겹치는 둘은 표식으로 갈라야 한다.
  const byName = Object.fromEntries(plan.people.map((p) => [p.name, p]));
  assert.ok(byName['최지훈'].tell, '최지훈은 구자욱과 겹칩니다 — 표식이 필요합니다');
  assert.ok(byName['박동원'].tell, '박동원은 포수 장비로 갈라야 합니다');
});

// ─────────────────────────────────────────────────────────────

section('4-m. 한도에 걸리면 그 자리에서 멈춘다');

const { isFatalApiError } = await import('../src/ai/client.mjs');
const { designAllScenes: designAll } = await import('../src/scenes/visuals.mjs');

test('더 걸어도 소용없는 오류를 알아본다', () => {
  // 실제로 받은 문구다 (실행 #33).
  const real = '400 {"type":"error","error":{"type":"invalid_request_error",' +
    '"message":"You have reached your specified API usage limits. ' +
    'You will regain access on 2026-11-01 at 00:00 UTC."}}';
  assert.equal(isFatalApiError(new Error(real)), true);
  assert.equal(isFatalApiError(new Error('Your credit balance is too low')), true);
  assert.equal(isFatalApiError(new Error('authentication_error')), true);
  // 한 번 더 걸면 되는 것들은 건드리지 않는다.
  assert.equal(isFatalApiError(new Error('529 overloaded_error')), false);
  assert.equal(isFatalApiError(new Error('rate_limit_error')), false);
  assert.equal(isFatalApiError(new Error('타임아웃')), false);
  assert.equal(isFatalApiError(null), false);
});

await asyncTest('한도 오류면 남은 장면을 때리지 않는다', async () => {
  // 실행 #33 에서 29개 중 7번째가 한도에 걸렸는데 남은 23개를 마저 때렸다.
  // 전부 같은 400 이었고, 그러고도 그림 단계로 넘어가 돈을 썼다.
  const scenes = Array.from({ length: 10 }, (_, i) => ({
    scene_number: i + 1,
    section: 'ACE',
    shots: [{ shot_id: `S${i + 1}-1`, narration: '글' }],
  }));

  let called = 0;
  const made = {
    stop_reason: 'tool_use',
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{
      type: 'tool_use',
      name: 'submit_shots',
      input: { mood: 'calm', visual_description: '설명', shots: [] },
    }],
  };
  const aiClient = await import('../src/ai/client.mjs');
  aiClient.__setClientForTest({
    messages: {
      stream: () => {
        called += 1;
        const n = called;
        return {
          finalMessage: async () => {
            if (n >= 3) {
              // 실제 SDK 오류에는 status 가 붙어 온다. 그래야 withRetry 가
              // 4xx 로 보고 곧장 포기한다 — 붙이지 않으면 검사만 현실과
              // 달라진다.
              const err = new Error('400 You have reached your specified API usage limits.');
              err.status = 400;
              throw err;
            }
            return made;
          },
        };
      },
    },
  });
  try {
    await assert.rejects(
      () => designAll(scenes, { item: { kind: 'SPORTS' } }),
      /usage limits/,
      '한도 오류를 삼키고 끝까지 돌았습니다'
    );
  } finally {
    aiClient.__setClientForTest(null);
    aiClient.resetUsage();
  }
  // 3번째에서 터졌으니 그 뒤로는 부르지 않아야 한다.
  assert.equal(called, 3, `한도에 걸린 뒤에도 ${called - 3}번 더 불렀습니다`);
});

test('한도 오류면 그림·목소리로 넘어가지 않는다', () => {
  // 그림과 목소리는 다른 회사라, 대본 쪽이 막혀도 돈은 그대로 나간다.
  const src = fs.readFileSync(fileURLToPath(new URL('../src/main.mjs', import.meta.url)), 'utf8');
  const at = src.indexOf('async function runStages');
  const stages = src.slice(at, src.indexOf('async function cmdAuto', at));
  assert.ok(/isFatalApiError\(err\)/.test(stages), '장면 실패를 그냥 넘깁니다');
  const guard = stages.indexOf('isFatalApiError(err)');
  const images = stages.indexOf('flags.images');
  assert.ok(guard > 0 && guard < images, '멈추는 자리가 그림 단계보다 뒤에 있습니다');
});

// ─────────────────────────────────────────────────────────────

section('4-n. 읽어 주는 말투를 잰다');

const { checkSpoken, spokenSentences } = await import('../src/script/spoken.mjs');

test('읽지 않는 줄은 세지 않는다', () => {
  // 제목과 태그는 소리가 되지 않는다. 그것까지 세면 비율이 엉뚱해진다.
  const md = ['## [HOOK] 첫 줄', '', '[FACT] 하나입니다. 둘입니다.', '[THEORY] 셋인가요?'].join('\n');
  assert.deepEqual(spokenSentences(md), ['하나입니다.', '둘입니다.', '셋인가요?']);
});

test('말끝이 한 가지로 쏠리면 알려준다', () => {
  const flat = Array.from({ length: 20 }, (_, i) => `[FACT] 이것은 ${i}번 문장입니다.`).join('\n');
  const r = checkSpoken(flat);
  assert.ok(r.formalRatio > 0.9, `격식 비율이 ${r.formalRatio} 입니다`);
  assert.ok(r.notes.some((n) => n.includes('-습니다')), '말끝 쏠림을 짚지 않습니다');
  assert.ok(r.notes.some((n) => n.includes('잇따릅니다')), '같은 어미 연속을 짚지 않습니다');
});

test('섞여 있으면 트집 잡지 않는다', () => {
  // 고치라고만 하는 검사는 꺼지게 되어 있다. 멀쩡한 글은 통과해야 한다.
  const good = [
    '[FACT] 노시환, 삼백칠억.',
    '[FACT] 지난겨울 시장이 남긴 숫자죠.',
    '[THEORY] 그런데 이 숫자가 왜 기준이 될까요?',
    '[THEORY] 다음 계약들이 전부 여기에 맞춰지거든요.',
    '[FACT] 다섯 명이 한꺼번에 나옵니다.',
    '[THEORY] 한 명만 움직여도 나머지가 흔들려요.',
  ].join('\n');
  const r = checkSpoken(good);
  assert.equal(r.notes.length, 0, `멀쩡한 글에 트집을 잡았습니다: ${r.notes.join(' / ')}`);
});

test('귀로 따라가기 힘든 긴 문장을 짚는다', () => {
  const long = '[FACT] ' + '가'.repeat(80) + '입니다.';
  const r = checkSpoken(long);
  assert.ok(r.notes.some((n) => n.includes('귀로는 깁니다')), '긴 문장을 안 짚습니다');
});

test('빈 대본에도 죽지 않는다', () => {
  for (const x of ['', null, '## [HOOK] 제목만']) {
    const r = checkSpoken(x);
    assert.equal(r.notes.length, 0);
    assert.equal(r.sentences.length, 0);
  }
});

test('대본 검사가 이 경고를 함께 낸다', () => {
  // 야포츠 1화가 기존 검사(글투냐 말투냐)를 통과하고도 "읽어 주는 워딩이
  // 어색하다"는 말을 들었다. 「-습니다」는 말투로 쳐서 초록불이었는데,
  // 그게 123문장 중 69개였다. 보는 축이 달라서 둘 다 필요하다.
  const md = fs.readFileSync(
    decodeURIComponent(new URL('../../스포츠영상/1화-대본.md', import.meta.url).pathname),
    'utf8'
  );
  const r = validateScript(md, { kind: 'SPORTS', targetMinutes: 10 });
  assert.equal(r.errors.length, 0, `1화 대본에 오류가 생겼습니다: ${r.errors.join(' / ')}`);
  assert.ok(
    r.warnings.some((w) => w.includes('같은 가락')),
    '대본 검사가 말끝 쏠림을 알려주지 않습니다'
  );
});

// ─────────────────────────────────────────────────────────────

section('4-o. 편마다 자기 단락 차례를 쓴다');

const { usableSections } = await import('../src/script/sections.mjs');
const { sectionsFor: secFor, SPORTS_SECTIONS: SPORTS_SEC } = await import('../src/script/write.mjs');
const { makeSports: mkSports2 } = await import('../src/model.mjs');

test('쓸 만한 차례는 받고 아니면 통째로 버린다', () => {
  const good = [{ key: 'HOOK', label: '첫 줄' }, { key: 'WORDS', label: '말부터' }];
  assert.deepEqual(usableSections(good).map((x) => x.key), ['HOOK', 'WORDS']);
  // 반쯤 맞는 차례로 대본을 쓰면 어디가 틀어졌는지 나중에 못 찾는다.
  assert.equal(usableSections([{ key: 'MID', label: 'a' }, { key: 'CLOSE', label: 'b' }]), null, 'HOOK 없이 통과했습니다');
  assert.equal(usableSections([{ key: 'HOOK', label: 'a' }, { key: '중간', label: 'b' }]), null, '한글 키가 통과했습니다');
  assert.equal(usableSections([{ key: 'HOOK', label: 'a' }, { key: 'HOOK', label: 'b' }]), null, '같은 키가 두 번 통과했습니다');
  assert.equal(usableSections([{ key: 'HOOK', label: '' }]), null, '라벨 없이 통과했습니다');
  assert.equal(usableSections([{ key: 'HOOK', label: 'a' }]), null, '한 개짜리가 통과했습니다');
  assert.equal(usableSections(null), null);
});

test('안 주면 지금 쓰던 차례 그대로다', () => {
  // 1화는 이 길로 계속 가야 한다. 고치다가 기존 편을 깨면 안 된다.
  assert.deepEqual(secFor('SPORTS'), SPORTS_SEC);
  assert.deepEqual(secFor('SPORTS', { sections: null }), SPORTS_SEC);
  assert.deepEqual(secFor('SPORTS', { sections: [{ key: '틀림', label: 'x' }] }), SPORTS_SEC);
});

test('주면 그쪽이 이긴다', () => {
  const mine = [{ key: 'HOOK', label: '첫 줄' }, { key: 'WORDS', label: '말부터' }, { key: 'CLOSE', label: '마무리' }];
  assert.deepEqual(secFor('SPORTS', { sections: mine }).map((x) => x.key), ['HOOK', 'WORDS', 'CLOSE']);
});

await asyncTest('내 단락으로 쓴 대본이 검사를 통과한다', async () => {
  // 2화는 ACE·OUTFIELD·CATCHER 가 아무 뜻이 없다. 그 칸에 억지로
  // 끼워 넣지 않고도 대본이 서는지 끝까지 확인한다.
  const sections = [
    { key: 'HOOK', label: '첫 줄' },
    { key: 'WORDS', label: '말부터' },
    { key: 'CLOSE', label: '마무리' },
  ];
  const md = [
    '## [HOOK] 첫 줄',
    '',
    '[FACT] 여든여섯 명입니다. 일 위 팀이 열 명을 내보냈죠.',
    '',
    '## [WORDS] 말부터',
    '',
    '[FACT] 재계약 불가와 보류선수 명단은 다릅니다.',
    '[THEORY] 그래서 이 숫자는 더 늘어납니다.',
    '',
    '## [CLOSE] 마무리',
    '',
    '[THEORY] 누가 손을 내밀까요?',
  ].join('\n');

  const r = validateScript(md, { kind: 'SPORTS', targetMinutes: 10, sections });
  assert.deepEqual(r.errors, [], `내 단락인데 오류가 났습니다: ${r.errors.join(' / ')}`);

  // 같은 대본을 기본 차례로 재면 막혀야 한다. 안 막히면 검사가 헐겁다는 뜻이다.
  const withDefault = validateScript(md, { kind: 'SPORTS', targetMinutes: 10 });
  assert.ok(withDefault.errors.length, '기본 차례로도 통과했습니다 — 섹션 검사가 헐겁습니다');

  // 장면 분할까지 내려가는지 본다. 여기서 끊기면 그림을 못 만든다.
  const { splitIntoScenes: split2 } = await import('../src/scenes/split.mjs');
  const sp = split2(md, { kind: 'SPORTS', sections });
  assert.deepEqual(sp.problems, [], `장면 분할이 막혔습니다: ${sp.problems.join(' / ')}`);
  assert.ok(sp.scenes.length >= 3, `장면이 ${sp.scenes.length}개뿐입니다`);
});

test('소재 레코드가 단락 차례를 들고 간다', () => {
  const item = mkSports2({
    title: '방출 86명',
    sources: [{ name: 'ㄱ', url: 'https://example.com/a' }],
    sections: [{ key: 'HOOK', label: '첫 줄' }, { key: 'WORDS', label: '말부터' }],
  });
  assert.deepEqual(item.sections.map((x) => x.key), ['HOOK', 'WORDS']);
  // 안 주면 null 이고, 그러면 기본 차례로 간다.
  assert.equal(mkSports2({ title: 'x', sources: [] }).sections, null);
});

test('모르는 단락이라도 쇼츠 점수가 다 같지는 않다', () => {
  // 1화에서 스포츠 섹션에 점수를 안 넣었더니 전부 0 이 되어 순위가
  // 길이로만 정해졌고, 가장 중요한 구간이 쇼츠에서 통째로 빠졌다.
  const src = fs.readFileSync(fileURLToPath(new URL('../src/main.mjs', import.meta.url)), 'utf8');
  assert.ok(/function sectionValuesOf/.test(src), '단락 가치를 뽑는 자리가 없습니다');
  assert.ok(/sectionValues: sectionValuesOf/.test(src), '쇼츠에 가치를 안 넘깁니다');
});

// ─────────────────────────────────────────────────────────────

section('4-p. 제목에 쉼표가 있어도 쇼츠가 나온다');

const { escapeFilterPath: escFilter } = await import('../src/video/ffmpeg.mjs');
const { fileSlug: slugOf } = await import('../src/store.mjs');

test('파일 이름에서 ffmpeg가 뜻을 갖는 글자를 뺀다', () => {
  // 2화 제목이 "방출 86명, 성적순이 아니다" 였다. 쉼표가 그대로 남아
  // 쇼츠 다섯 편이 전부 죽었다.
  assert.equal(slugOf('방출 86명, 성적순이 아니다'), '방출86명성적순이아니다');
  assert.ok(!slugOf('가,나;다[라]').includes(','), '쉼표가 남았습니다');
  assert.ok(!slugOf('가,나;다[라]').includes(';'), '세미콜론이 남았습니다');
  assert.ok(!/[[\]]/.test(slugOf('가,나;다[라]')), '대괄호가 남았습니다');
  // 멀쩡한 제목은 건드리지 않는다.
  assert.equal(slugOf('2027 KBO FA 시장 프리뷰'), '2027KBOFA시장프리뷰');
});

test('필터 경로의 쉼표에 탈출 문자를 붙인다', () => {
  // 파일 이름 쪽을 고쳤어도 여기는 따로 막는다. 경로는 ffmpeg 말고도
  // 여러 곳을 지나가고, 우리가 안 만든 이름이 들어올 수도 있다.
  assert.equal(escFilter('가,나.ass'), '가\\,나.ass');
  assert.equal(escFilter('가;나.ass'), '가\\;나.ass');
  assert.equal(escFilter('[가].ass'), '\\[가\\].ass');
  // 원래 막던 것도 그대로여야 한다.
  assert.equal(escFilter('C:/가.ass'), 'C\\:/가.ass');
  assert.equal(escFilter("가'나.ass"), "가\\'나.ass");
  // 역슬래시가 먼저 처리되어야 한다. 나중에 하면 탈출 문자를 또 탈출시킨다.
  assert.equal(escFilter('가\\나.ass'), '가\\\\나.ass');
});

test('단계가 엎어지면 초록불로 끝내지 않는다', () => {
  // 2화에서 쇼츠 다섯 편이 전부 죽었는데 실행은 성공으로 끝났다.
  // 결과물이 반쪽인데 초록불이면 받아서 열어 보기 전까지 모르고,
  // 그 사이에 올려 버릴 수도 있다.
  const src = fs.readFileSync(fileURLToPath(new URL('../src/main.mjs', import.meta.url)), 'utf8');
  const at = src.indexOf('async function runStages');
  const stages = src.slice(at, src.indexOf('function endWithFailures', at));

  // 네 단계가 **전부** 실패를 적어 두어야 한다. 하나라도 빠지면 그
  // 단계만 조용히 넘어간다 — 지금까지 영상이 그랬다.
  //
  // ⚠️ 예전에는 failed.push 의 **개수**를 셌다. 그런데 한 단계가
  //    실패를 두 가지로 적게 되자(그림: 예외 / 그림: 몇 장 실패)
  //    숫자가 어긋나 멀쩡한 코드에서 검사가 깨졌다. 개수가 아니라
  //    **단계 이름이 다 있는지**를 본다.
  for (const stage of ['장면', '그림', '목소리', '영상']) {
    assert.ok(
      new RegExp(`failed\\.push\\([\`'"]${stage}`).test(stages),
      `${stage} 단계가 실패를 안 적습니다 — 그 단계만 조용히 넘어갑니다`
    );
  }

  // 그림은 예외가 안 나도 **몇 장 실패했으면** 실패로 친다.
  // 실행 #41 에서 58/88 장이 자리표시였는데 success 로 끝났다.
  assert.ok(
    /made\?\.failed\?\.length/.test(stages),
    '그림이 몇 장 실패해도 초록불로 넘어갑니다'
  );

  assert.ok(/return failed;/.test(stages), 'runStages 가 실패를 돌려주지 않습니다');
  assert.ok(/process\.exitCode = 1/.test(src), '종료 코드를 올리지 않습니다');
  // 만들어진 것까지 버리지는 않는다. 본편은 멀쩡한데 쇼츠만 죽는 일이 있다.
  assert.ok(!/endWithFailures[\s\S]{0,400}process\.exit\(/.test(src), '만들어진 것을 버리고 죽습니다');
});

await asyncTest('쉼표가 든 자막 경로로 ffmpeg가 실제로 돈다', async () => {
  // 코드만 보고 넘기면 또 당한다. 2화에서 실제로 당했다 — 본편은
  // subtitle.ass 라는 고정 이름이라 멀쩡했고, 쇼츠만 죽었는데 워크플로는
  // 초록불이었다.
  if (!hasFfmpeg()) return skip('ffmpeg 가 없습니다');

  // 이 파일은 ESM 이라 require 가 없다. hasFfmpeg() 안에서 쓰던 방식을
  // 그대로 가져온다.
  const { execFileSync } = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(TMP, 'comma-'));
  const assName = '쉼표,있는-쇼츠-1.ass';
  fs.writeFileSync(
    path.join(dir, assName),
    [
      '[Script Info]',
      'ScriptType: v4.00+',
      'PlayResX: 1080',
      'PlayResY: 1920',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, Alignment, MarginV',
      'Style: D,Sans,48,&H00FFFFFF,2,60',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Text',
      'Dialogue: 0,0:00:00.00,0:00:01.00,D,검사',
      '',
    ].join('\n'),
    'utf8'
  );

  const src = path.join(dir, 'src.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'color=c=black:s=320x180:d=1', '-frames:v', '1', src, '-y']);

  const out = path.join(dir, 'out.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src,
    '-vf', `ass=${escFilter(assName)}`, '-frames:v', '1', out, '-y'], { cwd: dir });

  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 0, '쇼츠가 안 만들어졌습니다');
});

// ─────────────────────────────────────────────────────────────

section('4-q. 인물 시트 — 사진은 주소로만 받는다');

const { portraitJobs, portraitPrompt, PORTRAIT_STYLE } = await import('../src/assets/portrait.mjs');
const { modelFor: modelOf } = await import('../src/assets/replicate.mjs');

test('사진 주소가 없거나 로컬 경로면 만들지 않는다', () => {
  // 저장소가 공개라 사진 파일을 커밋하면 그걸 퍼블리싱하는 것이 된다.
  // 로컬 경로를 넣었다는 건 사진을 저장소에 들이려 한다는 뜻이므로 막는다.
  const { jobs, skipped } = portraitJobs([
    { name: '손아섭', photo: 'https://example.com/a.jpg' },
    { name: '홍건희', photo: '스포츠영상/사진/홍건희.jpg' },
    { name: '장시환' },
  ]);
  assert.deepEqual([...new Set(jobs.map((j) => j.name))], ['손아섭']);
  assert.equal(skipped.length, 2);
  assert.ok(skipped.every((x) => x.reason));
});

test('사람마다 두 장씩 뽑는다', () => {
  const { jobs } = portraitJobs([
    { name: '손아섭', photo: 'https://e.com/a.jpg' },
    { name: '홍건희', photo: 'https://e.com/b.jpg' },
  ]);
  assert.equal(jobs.length, 4, '한 장만 뽑으면 이게 최선인지 알 수 없습니다');
  assert.deepEqual(jobs.map((j) => j.file), ['손아섭-1.png', '손아섭-2.png', '홍건희-1.png', '홍건희-2.png']);
  // 참조 주소가 작업마다 붙어 있어야 한다.
  assert.ok(jobs.every((j) => j.referenceImage.startsWith('https://')));
});

test('시트 화풍이 본편과 같은 결이다', () => {
  // 시트만 다른 그림체면 그걸 참조로 만든 샷이 본편에서 혼자 튄다.
  const p = portraitPrompt({ name: '손아섭', role: '외야수', tell: 'black eye-black stripes' });
  assert.ok(p.includes('caricature'), '캐리커처라고 적지 않습니다');
  assert.ok(p.includes('black eye-black stripes'), '표식이 안 들어갑니다');
  assert.ok(PORTRAIT_STYLE.includes('oversized head'), '본편 화풍과 결이 다릅니다');
  // 닮게 만드는 것이 목적이므로 "누구도 닮지 말라"는 줄은 **없어야** 한다.
  assert.ok(!/not resembling/.test(p), '닮지 말라는 지시가 남아 있습니다 — 시트는 닮아야 합니다');
  // 그래도 사진처럼 보이면 안 된다.
  assert.ok(!/photorealistic|photo of/.test(p), '사진처럼 그리라고 적혀 있습니다');
});

test('참조가 없으면 모델을 부르기 전에 막는다', () => {
  const m = modelOf('portrait');
  assert.equal(m.needsReference, true);
  // 참조를 안 넣으면 input 에 main_face_image 가 비어 나간다 — 모델이
  // 거부하고 그때는 이미 호출한 뒤다. generate 가 먼저 막아야 한다.
  const made = m.input('글', { referenceImage: 'https://e.com/a.jpg' });
  assert.equal(made.main_face_image, 'https://e.com/a.jpg');
  assert.ok(made.prompt, '프롬프트가 안 들어갑니다');
});

await asyncTest('참조 없이 부르면 돈을 쓰기 전에 멈춘다', async () => {
  const { createClient: createRep } = await import('../src/assets/replicate.mjs');
  let called = 0;
  const api = createRep({ token: 'r8_test', fetchFn: async () => { called += 1; return new Response('{}'); } });
  await assert.rejects(
    () => api.generate('글', { modelKey: 'portrait' }),
    /참조 사진 주소/,
    '참조 없이도 모델을 불렀습니다'
  );
  assert.equal(called, 0, `돈이 나가는 호출을 ${called}번 했습니다`);
});

test('인물 시트 모드가 제 갈 길로 간다', () => {
  // '미리보기' 분기보다 먼저 와야 한다. 모드 이름에 든 낱말로 분기하는
  // 곳에서 이미 두 번 샜다 ('그림' 때문에 라우팅과 ffmpeg 설치에서).
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  const at = yml.indexOf("*'인물 시트'*)");
  const preview = yml.indexOf("*'화풍 미리보기'*)");
  assert.ok(at > 0, '인물 시트 분기가 없습니다');
  assert.ok(at < preview, '미리보기 분기보다 뒤에 있어 그쪽으로 샙니다');

  // 토큰 확인은 거쳐야 하고, ffmpeg 는 안 깔아야 한다.
  const condOf = (name, end) => {
    const i = yml.indexOf(`- name: ${name}`);
    return yml.slice(i, yml.indexOf(end, i));
  };
  assert.ok(
    condOf('이미지 토큰이 등록되어 있는지 확인', '\n        env:').includes("'인물 시트'"),
    '인물 시트에 이미지 토큰 확인이 안 걸립니다'
  );
  assert.ok(
    condOf('ffmpeg와 한글 글꼴 설치', '\n        timeout-minutes').includes("!contains(inputs.mode, '인물 시트')"),
    '쓰지도 않는 ffmpeg 를 깝니다'
  );
});

// ─────────────────────────────────────────────────────────────

section('4-r. 쇼츠를 여덟 편으로 늘린다');

const shortsMod = await import('../src/video/shorts.mjs');

test('스포츠만 열 편 40~70초, 나머지는 그대로', () => {
  // 본편보다 쇼츠 반응이 좋아서 늘렸다. 다른 종류까지 같이 바꾸면
  // 이야기 편이 토막난다 — 거기는 한 편이 완결돼야 한다.
  assert.equal(shortsMod.shortsCountFor('SPORTS'), 10);
  assert.deepEqual(shortsMod.shortsLengthFor('SPORTS'), { min: 40, max: 70 });
  assert.equal(shortsMod.shortsCountFor('TALE'), 3);
  assert.deepEqual(shortsMod.shortsLengthFor('TALE'), { min: 60, max: 90 });
  assert.deepEqual(shortsMod.shortsLengthFor(null), { min: 60, max: 90 });
});

test('길이를 안 넘기면 0초가 되지 않는다', () => {
  // Number(null) 은 0 이고 Number.isFinite(0) 은 true 다. isFinite 로만
  // 거르면 안 넘긴 값이 0초가 되는데, 실제로 그렇게 되어 쇼츠가
  // 562초짜리 한 편으로 나왔다.
  // 장면의 실제 꼴은 paragraphs 다. shots 로 만들면 길이가 0이 되어
  // 검사만 혼자 다른 세상이 된다.
  const scenes = Array.from({ length: 24 }, (_, i) => ({
    scene_number: i + 1,
    section: i === 0 ? 'HOOK' : 'GAP',
    paragraphs: Array.from({ length: 6 }, (_, k) => ({
      tag: 'THEORY',
      text: `문단 ${i}-${k} ${'가'.repeat(40)}`,
    })),
  }));
  for (const opts of [{}, { minSeconds: null }, { maxSeconds: undefined }, { minSeconds: '' }]) {
    const picked = shortsMod.pickShorts(scenes, { kind: 'SPORTS', ...opts });
    assert.ok(picked.length > 1, `${JSON.stringify(opts)} 에서 ${picked.length}편만 나왔습니다`);
    for (const p of picked) {
      assert.ok(p.duration >= 40, `${p.duration}초짜리가 나왔습니다 — 길이가 0으로 떨어졌습니다`);
    }
  }
  // 넘긴 값은 그대로 이긴다.
  const narrow = shortsMod.pickShorts(scenes, { kind: 'SPORTS', minSeconds: 100, maxSeconds: 130 });
  assert.ok(narrow.every((p) => p.duration >= 100), '넘긴 길이를 안 씁니다');
});

test('열 편이 서로 거의 안 겹친다', () => {
  // 늘리면 같은 내용이 두 쇼츠에 들어갈 위험이 커진다. 9분대 대본에서
  // 겹침이 전체의 5%를 넘으면 개수를 다시 생각해야 한다.
  // 열 편(평균 53초)을 담으려면 9분대 본편이 있어야 한다. 재료를 모자라게
  // 두고 "왜 겹치냐"고 묻는 검사는 코드가 아니라 검사가 틀린 것이다.
  const scenes = Array.from({ length: 34 }, (_, i) => ({
    scene_number: i + 1,
    section: i === 0 ? 'HOOK' : 'GAP',
    paragraphs: Array.from({ length: 6 }, (_, k) => ({
      tag: 'THEORY',
      text: `문단 ${i}-${k} ${'가'.repeat(40)}`,
    })),
  }));
  const picked = shortsMod.pickShorts(scenes, { kind: 'SPORTS' });
  assert.equal(picked.length, 10, `${picked.length}편만 나왔습니다`);
  const spans = picked.map((p) => [p.start, p.end]).sort((a, b) => a[0] - b[0]);
  let overlap = 0;
  for (let i = 1; i < spans.length; i++) overlap += Math.max(0, spans[i - 1][1] - spans[i][0]);
  const total = picked.reduce((a, p) => a + p.duration, 0) + overlap;
  assert.ok(overlap / total < 0.05, `겹침이 ${Math.round((overlap / total) * 100)}% 입니다`);
});

// ─────────────────────────────────────────────────────────────

section('4-s. 쇼츠 끝에 마무리를 붙인다');

const { outroFilters, shortsArgs: sArgs, OUTRO_SECONDS: OUTRO_S } = await import('../src/video/ffmpeg.mjs');

test('마지막 몇 초에만 띄운다', () => {
  const f = outroFilters({ textPath: 't.txt', fontFile: '/f.ttc', duration: 60 });
  // 60초짜리면 57~60초에만 보여야 한다. 처음부터 떠 있으면 본문을 가린다.
  assert.ok(f.every((x) => x.includes(`between(t,${(60 - OUTRO_S).toFixed(3)},60.000)`)), f.join('\n'));
  // 글자 뒤를 깐다. 밝은 장면에서 흰 글씨만 얹으면 사라진다.
  assert.ok(f.some((x) => x.startsWith('drawbox=')), '글자 뒤를 안 깝니다');
  // 한글은 파일로 넘긴다. 명령줄에 직접 넣으면 깨진다.
  assert.ok(f.some((x) => x.includes('textfile=')), 'textfile 로 안 넘깁니다');
  assert.ok(f.some((x) => x.includes('expansion=none')), '% 가 서식 문자로 먹힙니다');
});

test('자막 뒤에 얹는다', () => {
  // 앞에 두면 자막이 띠 위에 겹쳐 찍힌다.
  const args = sArgs({
    videoPath: 'v.mp4', start: 0, duration: 60, subtitlePath: 's.ass',
    outputPath: 'o.mp4', outroTextPath: 't.txt', outroFontFile: '/f.ttc',
  });
  const vf = args[args.indexOf('-vf') + 1];
  assert.ok(vf.indexOf('ass=') < vf.indexOf('drawbox='), '자막보다 먼저 얹습니다');
});

test('마무리를 안 주면 아무것도 안 붙인다', () => {
  const vf = (o) => {
    const a = sArgs({ videoPath: 'v.mp4', start: 0, duration: 60, outputPath: 'o.mp4', ...o });
    return a[a.indexOf('-vf') + 1];
  };
  assert.ok(!vf({}).includes('drawbox'), '안 줬는데 붙었습니다');
  // 글만 있고 글꼴이 없으면 네모가 나온다. 둘 다 있을 때만 붙인다.
  assert.ok(!vf({ outroTextPath: 't.txt' }).includes('drawbox'), '글꼴 없이 붙었습니다');
  assert.ok(!vf({ outroFontFile: '/f.ttc' }).includes('drawbox'), '글 없이 붙었습니다');
});

await asyncTest('마무리 띠가 실제로 그려진다', async () => {
  // 코드만 보고 넘기지 않는다. 한글 drawtext 는 글꼴·따옴표·% 에서
  // 조용히 깨지고, 그건 영상을 눈으로 보기 전까지 모른다.
  if (!hasFfmpeg()) return skip('ffmpeg 가 없습니다');
  const { execFileSync } = await import('node:child_process');
  const font = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
  if (!fs.existsSync(font)) return skip('한글 글꼴이 없습니다');

  const dir = fs.mkdtempSync(path.join(TMP, 'outro-'));
  const txt = path.join(dir, 't.txt');
  fs.writeFileSync(txt, '전체 영상은 채널에 있습니다\n야포츠 구독하고 다음 편 보기\n', 'utf8');

  const f = outroFilters({ textPath: 't.txt', fontFile: font, duration: 6 });
  const vf = ['scale=1080:1920:force_original_aspect_ratio=increase', 'crop=1080:1920', ...f].join(',');
  const out = path.join(dir, 'out.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'color=c=slategray:s=640x360:d=6', '-vf', vf, '-t', '6', out, '-y'], { cwd: dir });
  assert.ok(fs.statSync(out).size > 1000, '영상이 안 만들어졌습니다');
});

// ─────────────────────────────────────────────────────────────

section('4-t. 쇼츠의 시작과 끝을 고른다');

const {
  openingScore, endingScore, BACK_REFERENCE: BACKREF, CURIOSITY_END: CURIOUS,
} = await import('../src/video/shorts.mjs');

const para = (text) => [{ text, section: 'GAP', seconds: 8 }];

test('앞을 받는 말로 시작하면 깎는다', () => {
  // 본편에서는 "그런데 이 열여섯 명 중에…" 로 열어도 된다. 그 문장이
  // 쇼츠 첫 줄이 되면 무엇에 대한 '그런데'인지 모른다.
  for (const w of ['그런데', '그중', '쉽게 말하면', '먼저', '다른 쪽은', '정리하겠습니다']) {
    assert.ok(openingScore(para(`${w} 이러저러합니다.`)) < 0, `"${w}" 가 안 걸립니다`);
  }
  // 스스로 서는 문장은 안 깎는다.
  assert.ok(openingScore(para('황대인의 올해 일 군 기록입니다.')) >= 0);
  assert.ok(openingScore(para('이천십구 년 한화에는 유망주 삼총사가 있었습니다.')) >= 0);
});

test('숫자로 열면 더 준다', () => {
  // 성적에서 1등 한 쇼츠가 숫자로 열었다 (1위 10명, 꼴찌 8명 — 916회).
  assert.ok(openingScore(para('서른두 명이 갑니다.')) > 0);
  assert.ok(openingScore(para('86명입니다.')) > 0);
});

test('묻고 끝나면 더 주고, 다 끝나면 깎는다', () => {
  assert.ok(endingScore(para('재능의 차이였을까요?')) > 15);
  assert.ok(endingScore(para('왜 그럴까요?')) > 15);
  assert.ok(endingScore(para('지금 벌어지고 있는 게 그겁니다.')) > 0);
  assert.ok(endingScore(para('어떻게 보시는지 댓글로 남겨 주세요.')) < 0);
  assert.ok(endingScore(para('이상입니다.')) < 0);
});

test('"거니까요" 를 물음으로 세지 않는다', () => {
  // 까요 로만 보면 이유를 대는 말이 물음으로 잡힌다. 실제로 그렇게
  // 잡혀서 끝이 안 궁금한 쇼츠가 위로 올라왔다.
  const 이유 = endingScore(para('벤치에서 한 타석을 맡을 카드로도 안 뽑힌 거니까요.'));
  const 물음 = endingScore(para('재능의 차이였을까요?'));
  assert.ok(이유 < 물음, `이유(${이유})가 물음(${물음})만큼 점수를 받았습니다`);
});

await asyncTest('실제 대본에서 시작이 약한 쇼츠가 없다', async () => {
  // 이 검사가 이 변경의 전부다. 규칙을 아무리 써도 실제 대본에서
  // 안 걸러지면 소용없다.
  const [{ splitIntoScenes: split3 }, S3] = await Promise.all([
    import('../src/scenes/split.mjs'),
    import('../src/video/shorts.mjs'),
  ]);
  const base = decodeURIComponent(new URL('../../스포츠영상/', import.meta.url).pathname);
  const plan = JSON.parse(fs.readFileSync(path.join(base, '3화.json'), 'utf8'));
  const md = fs.readFileSync(path.join(base, '3화-대본.md'), 'utf8');
  const { scenes } = split3(md, { kind: 'SPORTS', sections: plan.sections });
  const values = {};
  for (const sec of plan.sections) values[sec.key] = sec.value ?? (sec.key === 'HOOK' ? 100 : 20);
  const picked = S3.pickShorts(scenes, { kind: 'SPORTS', sectionValues: values });

  assert.ok(picked.length >= 8, `${picked.length}편뿐입니다`);
  for (const p of picked) {
    const first = String(p.paragraphs[0].text).trim();
    const weak = BACKREF.find((w) => first.startsWith(w));
    assert.ok(!weak, `${p.rank}순위가 "${weak}" 로 시작합니다: ${first.slice(0, 30)}`);
  }
  // 끝이 궁금한 쇼츠가 적어도 셋은 있어야 한다. 전부는 못 만든다 —
  // 대본이 50초마다 물음으로 끝나도록 쓰이지는 않았기 때문이다.
  const Q = /[?]$|(?<!니)까요\.?$|(?<!니)을까\.?$|나요\.?$/;
  const curious = picked.filter((p) => {
    const last = String(p.paragraphs[p.paragraphs.length - 1].text).trim();
    return Q.test(last) || CURIOUS.some((w) => last.endsWith(w));
  });
  assert.ok(curious.length >= 3, `끝이 궁금한 쇼츠가 ${curious.length}편뿐입니다`);
});

await asyncTest('쇼츠가 실제 음성 길이를 쓴다 — 글자 수로 다시 추정하지 않는다', async () => {
  // 실행 #38 에서 마지막 쇼츠가 43.45초로 골라졌는데 21.8초로 잘려 나왔다.
  // 글자 수 추정 562.55초로 구간을 고르는데 실제 음성은 540.97초였다.
  // narrate 단계가 문단마다 채워 둔 seconds 를 쓰면 안 어긋난다.
  const S = await import('../src/video/shorts.mjs');

  // 실제 음성이 추정치의 절반인 대본. 추정만 쓰면 뒤로 갈수록 벌어진다.
  const scenes = [];
  for (let i = 1; i <= 24; i++) {
    scenes.push({
      scene_number: i,
      section: i === 1 ? 'HOOK' : 'BODY',
      paragraphs: [
        { tag: 'FACT', text: '가'.repeat(120), seconds: 11 },
        { tag: 'THEORY', text: '나'.repeat(120), seconds: 11 },
      ],
    });
  }
  const real = 24 * 22; // 528초
  const picked = S.pickShorts(scenes, { kind: 'SPORTS' });
  assert.ok(picked.length > 0, '쇼츠가 하나도 안 나왔습니다');
  for (const p of picked) {
    assert.ok(
      p.end <= real + 0.01,
      `${p.rank}순위가 본편 끝(${real}초)을 넘습니다: ${p.start}~${p.end}`
    );
  }

  // seconds 가 없으면(목소리 전) 추정으로 돈다 — 그 길은 살아 있어야 한다.
  const noAudio = scenes.map((sc) => ({
    ...sc,
    paragraphs: sc.paragraphs.map(({ seconds, ...rest }) => rest),
  }));
  assert.ok(S.pickShorts(noAudio, { kind: 'SPORTS' }).length > 0, '목소리 없이 고르지 못했습니다');
});

await asyncTest('대본의 마크다운 강조를 떼고 읽는다', async () => {
  // 3화에서 "**키우는 자리**" 가 그대로 음성으로 나갔다. 다섯 군데였다.
  // 별표는 "여기 힘줘서 읽어라"는 표시지 읽을 글자가 아니다.
  const { stripEmphasis, parseScript } = await import('../src/scenes/parse.mjs');

  assert.equal(stripEmphasis('**키우는 자리**라는 거죠.'), '키우는 자리라는 거죠.');
  assert.equal(stripEmphasis('다만 __하나는__ 분명합니다.'), '다만 하나는 분명합니다.');
  assert.equal(stripEmphasis('그래서 *이것* 입니다.'), '그래서 이것 입니다.');
  // 숫자나 말 안에 든 기호는 건드리지 않는다.
  assert.equal(stripEmphasis('타율 .302, OPS .850'), '타율 .302, OPS .850');
  assert.equal(stripEmphasis('2 * 3 은 6'), '2 * 3 은 6');
  assert.equal(stripEmphasis('파일은 a_b_c 입니다'), '파일은 a_b_c 입니다');

  // 실제 대본을 지나가도 남지 않는다.
  const base = decodeURIComponent(new URL('../../스포츠영상/', import.meta.url).pathname);
  const plan = JSON.parse(fs.readFileSync(path.join(base, '3화.json'), 'utf8'));
  const md = fs.readFileSync(path.join(base, '3화-대본.md'), 'utf8');
  assert.ok(md.includes('**'), '3화 대본에 별표가 없습니다 — 이 검사가 무의미해집니다');
  const parsed = parseScript(md, { kind: 'SPORTS', sections: plan.sections });
  for (const p of parsed.paragraphs) {
    assert.ok(!/\*\*|__/.test(p.text), `별표가 남았습니다: ${p.text.slice(0, 40)}`);
  }
});


await asyncTest('읽을 글에서 따옴표를 뗀다 — 글자는 그대로 둔다', async () => {
  // 3화를 듣고 운영자가 잡았다: 따옴표 뒤가 느리고 어색하다.
  // 눈에는 "여기까지가 남의 말"인데 귀에는 아무것도 아니다.
  const { speechText, sameMeaning } = await import('../src/audio/speech.mjs');

  assert.equal(
    speechText('"상상하고 싶지도 않다"던 노시환이 말했습니다.'),
    '상상하고 싶지도 않다던 노시환이 말했습니다.'
  );
  assert.equal(speechText('\u201c슈퍼 루키\u201d라는 말도 붙었고요.'), '슈퍼 루키라는 말도 붙었고요.');
  assert.equal(speechText("쉽게 말하면 하나는 '지금', 하나는 '나중'이죠."), '쉽게 말하면 하나는 지금, 하나는 나중이죠.');

  // 글자는 한 자도 지우지 않는다 — 기호만 뗀다.
  for (const line of [
    '"가능성"은 이제 안 통합니다.',
    '타율 .302, OPS .850 입니다.',
    '"7회에 왼손을 올리면 이 선수" — 이 한 줄이면 됩니다.',
  ]) {
    assert.ok(sameMeaning(line, speechText(line)), `글자가 달라졌습니다: ${line} → ${speechText(line)}`);
  }

  // 숫자와 소수점은 건드리지 않는다.
  assert.equal(speechText('삼 할 이 리'), '삼 할 이 리');
  // ⚠️ 2026-11-07 에 두 번 바뀌었다.
  //    ① PRONOUNCE 가 OPS 를 '오피에스'로 읽는다.
  //    ② numbers.mjs 가 .850 을 '팔 할 오 푼'으로 읽는다. 야구에서
  //       점으로 시작하는 세 자리는 할·푼·리로 읽는다 — 타율이든
  //       출루율이든 오피에스든 같다.
  //    자막에는 'OPS .850' 이 그대로 나간다. 눈에 익은 쪽이다.
  assert.equal(speechText('OPS .850'), '오피에스 팔 할 오 푼');
});

await asyncTest('자막은 영어, 읽기는 한글 (2026-11-07 운영자)', async () => {
  // "영어가 어색하게 읽히면 한글로 해서 읽는다. 그리고 자막에는 보는
  //  사람을 위해 익숙한 영어로 적는다. 가능한가?"
  //
  // 가능하다. 대본에 영어로 쓰면 자막은 영어로 나가고, speechText() 가
  // 읽을 글만 한글로 바꾼다. 둘이 갈라지는 자리가 여기다.
  const { speechText, sameMeaning, PRONOUNCE } = await import('../src/audio/speech.mjs');
  const { narrationUnits } = await import('../src/audio/narrate.mjs');

  assert.equal(speechText('FA 시장이 열립니다.'), '에프에이 시장이 열립니다.');
  assert.equal(speechText('MLB 와 KBO.'), '메이저리그 와 케이비오.');

  // ⚠️ KIA 가 이 규칙의 본보기다. 2026-11-07 운영자:
  //    "FA나 KIA 이런 부분은 영문으로 표기하고 에프에이, 기아 이렇게
  //     읽으라는 이야기다. 영문으로 두면 케이아이에이 이렇게 읽으니."
  //    철자로 읽으면 안 되는 것이라 그냥 두면 틀린다.
  assert.equal(speechText('KIA가 삼 위를 했습니다.'), '기아가 삼 위를 했습니다.');
  assert.ok(!/케이아이에이/.test(speechText('KIA')), 'KIA 를 철자로 읽습니다');
  // 팀 이름들. KT 는 철자로 읽는 게 맞고, KIA 는 낱말로 읽는 게 맞다.
  assert.equal(speechText('KT와 LG와 NC와 SSG.'), '케이티와 엘지와 엔씨와 에스에스지.');

  // 뜻이 같은지 검사가 이걸 버그로 보면 안 된다.
  for (const line of ['FA 시장이 열립니다.', 'OPS 가 높습니다.', 'MLB 진출입니다.']) {
    assert.ok(sameMeaning(line, speechText(line)), `뜻이 달라졌다고 잡혔습니다: ${line}`);
  }

  // 그리고 자막에는 영어가 그대로 남아야 한다. 이게 운영자가 원한 것이다.
  const [u] = narrationUnits([
    { scene_number: 1, section: 'HOOK', paragraphs: [{ tag: 'FACT', text: 'FA 시장이 열립니다.' }] },
  ]);
  assert.equal(u.text, 'FA 시장이 열립니다.', '자막까지 한글로 바뀌었습니다');
  assert.equal(u.speech, '에프에이 시장이 열립니다.', '읽을 글이 안 바뀌었습니다');

  // 긴 것이 먼저 와야 한다. 'FA' 가 'MLB' 보다 앞에 있으면 상관없지만,
  // 세 글자가 두 글자보다 뒤에 오면 반쪽만 바뀌는 사고가 난다.
  const keys = [...PRONOUNCE.keys()];
  for (let i = 1; i < keys.length; i += 1) {
    assert.ok(
      keys[i].length <= keys[i - 1].length,
      `발음 사전 차례가 뒤집혔습니다: ${keys[i - 1]} 뒤에 ${keys[i]}`
    );
  }
});

await asyncTest('읽을 글이 음성 모델로 가고, 자막에는 원문이 남는다', async () => {
  // 떼는 자리가 한 곳이어야 한다. 음성만 고치면 자막이 어긋난다.
  const { narrationUnits } = await import('../src/audio/narrate.mjs');
  const scenes = [{
    scene_number: 1,
    section: 'HOOK',
    paragraphs: [{ tag: 'FACT', text: '"상상조차 싫다"던 말이 있었습니다.' }],
  }];
  const [u] = narrationUnits(scenes);
  assert.equal(u.text, '"상상조차 싫다"던 말이 있었습니다.', '자막용 원문이 바뀌었습니다');
  assert.equal(u.speech, '상상조차 싫다던 말이 있었습니다.', '읽을 글이 안 만들어졌습니다');
  // 돈은 읽는 글자 수로 나간다.
  assert.equal(u.chars, u.speech.length);
});

await asyncTest('발음 사전에는 영어 약어만, 한글 읽기로 넣는다', async () => {
  // ⚠️ 이 테스트는 원래 "발음 사전은 비어 있다"였다. 짐작으로 넣으면
  //    멀쩡한 발음을 망치니까 들어 보기 전에는 아무것도 넣지 말자는
  //    규칙이었다.
  //
  //    2026-11-07 에 운영자가 그 자리를 쓰기로 했다 — "영어가 어색하게
  //    읽히면 한글로 해서 읽고, 자막에는 익숙한 영어로 적는다."
  //    그래서 비어 있으라고는 못 한다. 대신 **무엇을 넣어도 되는지**를
  //    좁힌다. 영어 약어의 한글 읽기만이다. 한글 낱말의 발음을 짐작으로
  //    고치는 것은 여전히 막는다 — 그게 원래 이 테스트가 막던 사고다.
  const { PRONOUNCE, SOFTEN_LIST_COMMAS, softenListCommas } = await import('../src/audio/speech.mjs');
  for (const [from, to] of PRONOUNCE) {
    assert.ok(/^[A-Z]{2,5}$/.test(from), `영어 약어가 아닌 것이 들어 있습니다: ${from}`);
    assert.ok(/^[가-힣]+$/.test(to), `읽기가 한글이 아닙니다: ${from} → ${to}`);
  }
  assert.equal(SOFTEN_LIST_COMMAS, false, '듣지 않고 쉼표 바꾸기를 켰습니다');
  // 켤 때 어떻게 되는지는 미리 확인해 둔다.
  assert.equal(softenListCommas('노시환, 유로결, 변우혁'), '노시환·유로결·변우혁');
  assert.equal(softenListCommas('노시환, 변우혁'), '노시환, 변우혁', '둘뿐인 것은 건드리지 않습니다');
});


await asyncTest('따옴표가 눈으로만 되는 자리를 잡는다', async () => {
  // 듣는 사람은 따옴표를 못 본다. 따옴표 안이 문장인데 조사가 바로
  // 붙으면 귀로는 엉킨다. 3화·4화에서 다섯 줄이 그랬다.
  const { bareQuoteSpots } = await import('../src/script/spoken.mjs');

  const bad = [
    '그런데 그게 "그러니까 안 쓴다"의 이유가 되면, 길이 사라집니다.',
    '그러니까 삼백칠억은 "십일 년 동안 여기 있어라"가 아니었습니다.',
    '"미국이 노린다"와 "그렇게 썼다"는 전혀 다른 말이죠.',
    '이제 "왜 버리고 가나"가 설명됩니다.',
  ];
  for (const line of bad) {
    assert.equal(bareQuoteSpots([line]).length, 1, `못 잡았습니다: ${line}`);
  }

  // 따옴표 안이 명사면 조사가 자연스럽게 붙는다 — 잡지 않는다.
  // 묶어 주는 말이 뒤에 오는 것도 잡지 않는다.
  const fine = [
    '"가능성"은 이제 안 통합니다.',
    '그 한 자리는 "칠 거 같은 사람"이 아니라 "치고 있는 사람"에게 갑니다.',
    '이 군에서 잘 치면 "이 군이니까"라고 하거든요.',
    '그래서 "삼백칠억을 버린다"는 말도 다르게 읽힙니다.',
    '따옴표가 없는 문장은 당연히 괜찮습니다.',
  ];
  for (const line of fine) {
    assert.equal(bareQuoteSpots([line]).length, 0, `잘못 잡았습니다: ${line}`);
  }
});

await asyncTest('3화·4화 대본에 따옴표가 눈으로만 되는 자리가 없다', async () => {
  // 고친 것이 되돌아오지 않게 실제 대본을 본다.
  const [{ bareQuoteSpots, spokenSentences }] = await Promise.all([
    import('../src/script/spoken.mjs'),
  ]);
  const base = decodeURIComponent(new URL('../../스포츠영상/', import.meta.url).pathname);
  for (const ep of ['3화', '4화']) {
    const md = fs.readFileSync(path.join(base, `${ep}-대본.md`), 'utf8');
    const bad = bareQuoteSpots(spokenSentences(md));
    assert.equal(bad.length, 0, `${ep}: ${bad[0]}`);
  }
});


test('발음 들어보기 모드가 TTS 키는 받고 ffmpeg는 안 깐다', () => {
  // 모드를 늘릴 때마다 조건문 한 줄을 빠뜨려서 실행 중에 죽는 실패가
  // 되살아난다. 실행 #30 이 그랬다 — '화풍 미리보기' 에 '그림' 이
  // 들어 있어서 쓰지도 않는 ffmpeg 설치가 6분간 돌다 죽었다.
  const yml = fs.readFileSync(
    new URL('../../.github/workflows/ai-surprise.yml', import.meta.url).pathname,
    'utf8'
  );
  const MODE = '발음 들어보기 (한 줄을 여러 꼴로 읽어 봅니다 · 1센트 미만)';
  assert.ok(yml.includes(`- '${MODE}'`), '모드가 목록에 없습니다');

  const condOf = (name) => {
    const at = yml.indexOf(`- name: ${name}`);
    assert.ok(at > 0, `${name} 단계를 찾지 못했습니다`);
    const block = yml.slice(at, yml.indexOf('\n        env:', at));
    const m = block.match(/if: \$\{\{ (.+?) \}\}/);
    return m ? m[1] : '';
  };

  // GitHub 표현식을 **실제로 계산한다.** contains() 를 세는 것만으로는
  // `!` 를 못 본다 — 그래서 한 번 틀렸다.
  const evaluate = (cond, mode) => {
    const js = cond
      .replace(/contains\(inputs\.mode, '([^']+)'\)/g, (_m, needle) =>
        mode.includes(needle) ? 'true' : 'false')
      .replace(/\|\|/g, '||')
      .replace(/&&/g, '&&');
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${js});`)();
  };

  assert.equal(evaluate(condOf('목소리 키가 등록되어 있는지 확인'), MODE), true,
    '발음 들어보기에 TTS 키 확인이 안 걸립니다 — 키 없이 돌다 죽습니다');
  assert.equal(evaluate(condOf('ffmpeg와 한글 글꼴 설치'), MODE), false,
    '발음 들어보기에 ffmpeg 를 깝니다 — 쓰지도 않는데 몇 분을 버립니다');
  assert.equal(evaluate(condOf('이미지 토큰이 등록되어 있는지 확인'), MODE), false,
    '발음 들어보기에 이미지 토큰을 요구합니다');

  // 읽을 줄을 env 로 넘긴다. 표현식을 run 에 바로 쓰면 셸이 실행한다.
  assert.ok(yml.includes('IN_SAY_LINES: ${{ inputs.say_lines }}'), 'say_lines 를 env 로 안 넘깁니다');
  assert.ok(yml.includes("node src/main.mjs voice \"${args[@]}\""), 'voice --say 를 부르지 않습니다');
});


test('워크플로 YAML 의 블록이 끊기지 않는다', () => {
  // `run: |` 안의 줄은 run 보다 깊이 들여써야 한다. 한 줄이라도 맨 앞에
  // 붙으면 **YAML 블록이 거기서 끝난다.** 그 뒤는 키로 읽히고, 깨진
  // 워크플로는 GitHub 에서 "workflow_dispatch 트리거가 없습니다" 라는
  // 엉뚱한 말로 거부된다 — 원인을 짐작하기 어렵다.
  //
  // 실제로 셸 히어독(<<EOF … EOF)을 넣다가 이렇게 깨뜨렸다. 히어독은
  // 종료 표시를 줄 맨 앞에 붙여야 해서 YAML 블록과 같이 쓸 수 없다.
  // (`<<-` 는 탭만 지우므로 공백 들여쓰기에는 안 듣는다.)
  const dir = new URL('../../.github/workflows/', import.meta.url).pathname;
  const files = fs.readdirSync(decodeURIComponent(dir)).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length, '워크플로 파일을 못 찾았습니다');

  for (const file of files) {
    const lines = fs.readFileSync(path.join(decodeURIComponent(dir), file), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)[\w-]+: \|-?\s*$/);
      if (!m) continue;
      const keyIndent = m[1].length;
      // 블록의 첫 줄이 들여쓰기 기준을 정한다.
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length) continue;
      const blockIndent = lines[j].match(/^\s*/)[0].length;
      assert.ok(
        blockIndent > keyIndent,
        `${file}:${j + 1} 블록이 키보다 얕습니다`
      );
      // 블록이 끝날 때까지, 빈 줄이 아닌 줄은 모두 기준보다 깊어야 한다.
      for (let k = j; k < lines.length; k++) {
        const line = lines[k];
        if (!line.trim()) continue;
        const indent = line.match(/^\s*/)[0].length;
        if (indent >= blockIndent) continue; // 아직 블록 안이다

        // 여기부터는 블록 밖이다. 블록을 **제대로** 끝낸 줄인지 본다.
        // 제대로 끝내는 줄은 그 자리에서 YAML 로 읽히는 것뿐이다 —
        // 목록 항목(`- …`)이나 키(`이름:`)다.
        //
        // ⚠️ 이 검사를 처음 썼을 때 여기서 그냥 break 했다. 그래서
        //    히어독으로 깨뜨린 파일을 **통과시켰다.** 맨 앞에 붙은
        //    `$IN_SAY_LINES` 를 "블록이 끝났구나"로 읽은 것이다.
        //    끝낸 줄이 YAML 인지까지 봐야 한다.
        const looksLikeYaml = /^\s*(?:-\s|[\w.\-"']+\s*:|#)/.test(line);
        assert.ok(
          looksLikeYaml,
          `${file}:${k + 1} 가 '${lines[i].trim()}' 블록을 끊습니다 — ` +
            `들여쓰기 ${indent} 로는 YAML 로 읽힙니다: "${line.slice(0, 50)}"`
        );
        break;
      }
    }
  }
});

test('워크플로에 셸 히어독을 쓰지 않는다', () => {
  // 위 검사가 결과를 잡는다면 이것은 원인을 잡는다. 히어독은 종료
  // 표시가 줄 맨 앞이라 YAML 블록 안에서 쓸 수 없다. 대신
  // `< <(printf '%s\n' "$VAR")` 를 쓴다.
  const dir = decodeURIComponent(new URL('../../.github/workflows/', import.meta.url).pathname);
  for (const file of fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const hit = text.match(/<<-?\s*'?[A-Z_]{3,}'?\s*$/m);
    assert.ok(!hit, `${file} 에 히어독이 있습니다: ${hit?.[0]} — YAML 블록을 끊습니다`);
  }
});


test('선언하지 않은 상수를 쓰지 않는다', () => {
  // `node --check` 는 **문법만** 본다. 선언을 안 한 이름은 통과시키고,
  // 그 줄이 실제로 돌 때 가서야 ReferenceError 로 죽는다.
  //
  // 실행 #39 에서 그렇게 죽었다. SHORT_CUT_WARN_SECONDS 를 넣으면서
  // 선언을 끼워 넣는 자리를 잘못 잡아 **쓰기만 하고 선언이 없었다.**
  // node --check 는 통과했고, 검사도 그 줄을 안 밟아서 못 봤다.
  // 그림값 $0.45 를 쓰고 영상 단계에서 죽었다.
  //
  // 여기서는 대문자 상수만 본다. 이름 규칙이 뚜렷해서 오탐이 없고,
  // 사람이 손으로 끼워 넣다 빠뜨리는 것도 거의 이쪽이다.
  const GLOBALS = new Set([
    'URL', 'JSON', 'NaN', 'Infinity', 'URLSearchParams', 'AbortController',
    'TextEncoder', 'TextDecoder', 'Buffer', 'Math', 'Date', 'Promise',
    'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Error',
    'Map', 'Set', 'WeakMap', 'AbortSignal', 'Intl', 'Function',
    'TypeError', 'RangeError', 'SyntaxError',
  ]);

  const srcDir = decodeURIComponent(new URL('../src/', import.meta.url).pathname);
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.mjs')) files.push(full);
    }
  })(srcDir);
  assert.ok(files.length > 10, `소스를 못 찾았습니다 (${files.length}개)`);

  const missing = [];
  for (const file of files) {
    let t = fs.readFileSync(file, 'utf8');
    // 주석·정규식·문자열을 지운다. 그 안의 대문자는 이름이 아니다.
    t = t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    t = t.replace(/\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n\[])+\/[gimsuy]*/g, ' RE ');
    t = t.replace(/`(?:\\.|[^`\\])*`/g, '``')
         .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
         .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

    const declared = new Set();
    for (const m of t.matchAll(/(?:^|\s)(?:export\s+)?(?:const|let|var|function|class)\s+([A-Z][A-Z0-9_]{2,})\b/g)) {
      declared.add(m[1]);
    }
    for (const m of t.matchAll(/import\s+(?:[\w*\s{},]+)\s+from/g)) {
      for (const n of m[0].matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) declared.add(n[1]);
    }

    for (const m of new Set([...t.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((x) => x[1]))) {
      if (declared.has(m) || GLOBALS.has(m)) continue;
      // 속성 이름(`x.FOO`)이나 객체 키(`FOO:`)는 선언이 아니어도 된다.
      if (new RegExp(`[.\\w]\\s*${m}\\b|\\b${m}\\s*:`).test(t)) continue;
      missing.push(`${path.relative(srcDir, file)}: ${m}`);
    }
  }
  assert.deepEqual(missing, [], `선언 없이 쓰는 상수가 있습니다:\n  ${missing.join('\n  ')}`);
});


await asyncTest('잔액이 떨어지면 남은 샷을 걸지 않는다', async () => {
  // 실행 #39: Replicate 잔액이 떨어졌는데 남은 41장을 세 번씩
  // 시도했다. 123번을 걸어 123번 거절당했다.
  const I = await import('../src/assets/images.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 'credit-'));

  let calls = 0;
  const client = {
    generate: async () => {
      calls++;
      throw new Error('Replicate 402: You have insufficient credit to run this model.');
    },
    download: async () => Buffer.alloc(0),
  };
  const prompts = Array.from({ length: 20 }, (_, i) => ({
    shot_id: `S${i + 1}`, scene_number: i + 1, image_prompt: 'a dugout', card_text: '',
  }));
  const out = await I.generateImages(prompts, {
    assetDir: dir, client, sleepFn: async () => {},
  });

  assert.equal(out.stoppedBy, 'credit', '잔액 없음으로 멈추지 않았습니다');
  assert.equal(calls, 1, `${calls}번 걸었습니다 — 한 번이면 충분합니다`);
  assert.equal(out.failed.length, 20, '실패 목록이 모자랍니다');
  assert.equal(out.made.length, 0);
});

await asyncTest('한도에 걸리면 알려 준 만큼 기다린다', async () => {
  // 2초만 쉬고 다시 걸면 또 걸린다. Replicate 는 "resets in ~8s" 라고
  // 알려 주는데 그걸 안 읽고 있었다.
  const I = await import('../src/assets/images.mjs');

  assert.equal(I.retryAfterMs(new Error('throttled. Your rate limit resets in ~8s.')), 9000);
  assert.equal(I.retryAfterMs(new Error('resets in ~0s')), 1000);
  assert.equal(I.retryAfterMs(new Error('그냥 실패')), null, '없는 숫자를 지어냈습니다');
  // 너무 오래 기다리지는 않는다.
  assert.equal(I.retryAfterMs(new Error('resets in ~9999s')), 60000);

  // 실제로 그만큼 쉬는지 본다.
  const dir = fs.mkdtempSync(path.join(TMP, 'throttle-'));
  const slept = [];
  let n = 0;
  const client = {
    generate: async () => {
      if (++n < 3) throw new Error('Replicate 429: throttled. Your rate limit resets in ~8s.');
      return { url: 'http://x/y.png', usdEstimate: 0.025 };
    },
    // PNG 머리글 + 크기 검사를 넘길 만큼의 채움
    download: async () => Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(I.MIN_IMAGE_BYTES || 4096),
    ]),
  };
  const out = await I.generateImages(
    [{ shot_id: 'S01-1', scene_number: 1, image_prompt: 'a dugout', card_text: '' }],
    { assetDir: dir, client, sleepFn: async (ms) => { slept.push(ms); } }
  );
  assert.deepEqual(slept, [9000, 9000], `쉰 시간이 ${slept} 입니다`);
  assert.equal(out.made.length, 1, '결국 만들어지지 않았습니다');
});


await asyncTest('쉼이 자리마다 다르다 — 메트로놈처럼 끊지 않는다', async () => {
  // 운영자가 "어딘가 기계 같은 느낌"이라고 했다(2026-11-03). 제일 큰
  // 원인은 목소리가 아니라 **문단마다 똑같이 0.45초**를 끼운 것이었다.
  // 아무리 좋은 목소리도 같은 간격으로 끊으면 기계로 들린다.
  const N = await import('../src/audio/narrate.mjs');
  const u = (o) => ({ section: 'A', scene_number: 1, text: '이 정도면 보통 길이의 문장이라고 할 수 있겠습니다', ...o });

  // 마지막 문단 뒤에는 안 쉰다. 영상 끝에 빈 소리가 남는다.
  assert.equal(N.pauseAfter(u(), null), 0);

  // 단락이 바뀌면 제일 길게.
  assert.equal(N.pauseAfter(u(), u({ section: 'B' })), 0.85);
  // 물음표 뒤에는 생각할 틈.
  assert.equal(N.pauseAfter(u({ text: '왜 그럴까요?' }), u()), 0.65);
  // 장면이 바뀌면 중간.
  assert.equal(N.pauseAfter(u(), u({ scene_number: 2 })), 0.5);
  // 짧은 토막 뒤에 길게 쉬면 어색하다.
  assert.equal(N.pauseAfter(u({ text: '아닙니다.' }), u()), 0.22);
  // 다만 **구조가 글자 수보다 먼저다.** 짧은 문장 뒤라도 화면이
  // 바뀌면 그만큼 쉰다 — 안 그러면 쫓기듯 들린다.
  assert.equal(
    N.pauseAfter(u({ text: '아닙니다.' }), u({ scene_number: 2 })), 0.5,
    '짧은 토막이 장면 바뀜을 이겼습니다'
  );
  // 그 밖에는 짧게 넘어간다.
  assert.equal(N.pauseAfter(u(), u()), 0.35);

  // ⚠️ 차례가 중요하다. 짧은 물음("왜죠?")이 "짧은 토막"으로 떨어지면
  //    생각할 틈이 사라진다. 물음표를 먼저 봐야 한다.
  assert.equal(N.pauseAfter(u({ text: '왜죠?' }), u()), 0.65, '짧은 물음이 토막으로 떨어졌습니다');
  // 단락 바뀜은 물음표보다도 앞이다.
  assert.equal(N.pauseAfter(u({ text: '왜죠?' }), u({ section: 'B' })), 0.85);

  // 쓰는 길이가 전부 무음 파일 목록에 있어야 한다. 없으면 이어붙이다 죽는다.
  const used = new Set();
  for (const a of [{}, { text: '짧다.' }, { text: '왜요?' }]) {
    for (const b of [{}, { section: 'B' }, { scene_number: 2 }]) {
      used.add(N.pauseAfter(u(a), u(b)));
    }
  }
  for (const sec of used) {
    assert.ok(N.PAUSE_LENGTHS.includes(sec), `${sec}초 무음 파일을 안 만듭니다`);
  }

  // 간격이 실제로 흩어져 있어야 귀에 들린다.
  const lo = Math.min(...N.PAUSE_LENGTHS), hi = Math.max(...N.PAUSE_LENGTHS);
  assert.ok(hi / lo >= 3, `쉼 차이가 ${(hi / lo).toFixed(1)}배뿐입니다 — 들리지 않습니다`);
});

await asyncTest('자막에 영문이 익숙한 이름을 한글로 적으면 알려 준다', async () => {
  // 2026-11-07 운영자가 방향을 분명히 했다. 전부 영어로 적는 게 아니다.
  //
  //   KIA 라고 적으면  → 음성이 "케이 아이 에이"로 읽는다  (PRONOUNCE 가 고친다)
  //   기아 라고 적으면 → 자막에 낯선 글자가 나간다         (이 검사가 잡는다)
  //
  // 두 방향을 다 봐야 한 바퀴가 돈다.
  const { subtitleSpellingSpots, checkSpoken } = await import('../src/script/spoken.mjs');

  assert.equal(subtitleSpellingSpots(['기아가 삼 위를 했습니다.']).length, 1);
  assert.equal(subtitleSpellingSpots(['KIA가 삼 위를 했습니다.']).length, 0, '영문은 걸면 안 됩니다');
  assert.deepEqual(
    subtitleSpellingSpots(['케이티와 엘지.'])[0].hits.map((h) => h.latin).sort(),
    ['KT', 'LG']
  );

  // 한글이 원래 이름인 팀은 건드리지 않는다.
  assert.equal(subtitleSpellingSpots(['삼성과 롯데와 두산과 한화와 키움.']).length, 0);
  // '메이저리그'도 자막에 그대로 적어서 낯설지 않다. 안 건다.
  assert.equal(subtitleSpellingSpots(['메이저리그에 갔습니다.']).length, 0);

  // 9화는 깨끗해야 한다. 이 규칙이 생긴 뒤에 쓴 첫 편이다.
  const base = decodeURIComponent(new URL('../../스포츠영상/', import.meta.url).pathname);
  const md = fs.readFileSync(path.join(base, '9화-대본.md'), 'utf8');
  const notes = checkSpoken(md).notes.filter((n) => n.includes('영문'));
  assert.deepEqual(notes, [], `9화: ${notes[0]}`);

  // ⚠️ 1~8화는 이미 올린 편이라 소급해서 고치지 않는다. 그래서 이
  //    검사는 **알려 주기만** 하고 실패시키지 않는다. 실제로 걸리는지만
  //    확인해 둔다 — 안 걸리면 검사가 죽은 것이다.
  const old = fs.readFileSync(path.join(base, '8화-대본.md'), 'utf8');
  assert.ok(
    checkSpoken(old).notes.some((n) => n.includes('영문')),
    '8화에 한글 팀 이름이 있는데 안 잡혔습니다 — 검사가 죽었습니다'
  );
});

await asyncTest('읽을 글에 영어 글자를 넣지 않는다', async () => {
  // 음성 모델이 알파벳을 철자로 읽는다. "OPS" 가 "오 피 에스" 가 된다.
  // 운영자가 잡았다 (2026-11-03).
  const { latinSpots, checkSpoken } = await import('../src/script/spoken.mjs');

  assert.equal(latinSpots(['오피에스 팔 할 오 푼입니다.']).length, 0);

  // ⚠️ 2026-11-07 에 바뀌었다. 전에는 영어가 보이면 전부 걸었다.
  //    이제 PRONOUNCE 에 읽기가 등록된 것은 **해결된 것**이라 안 건다.
  //    이미 해결된 것을 계속 지적하면 진짜 문제가 묻힌다.
  assert.equal(latinSpots(['OPS 팔 할 오 푼입니다.']).length, 0, '등록된 약어를 걸었습니다');
  assert.equal(latinSpots(['FA 시장과 MLB.']).length, 0, '등록된 약어를 걸었습니다');

  // 등록 안 된 영어는 그대로 걸린다. 이게 이 검사의 본래 일이다.
  assert.equal(latinSpots(['WHIP 가 낮습니다.']).length, 1);
  assert.deepEqual(latinSpots(['WHIP 과 BABIP.'])[0].hits, ['WHIP', 'BABIP']);
  // 섞여 있으면 등록 안 된 것만 집는다.
  assert.deepEqual(latinSpots(['FA 와 WHIP.'])[0].hits, ['WHIP']);

  // 2화 이후 대본은 깨끗해야 한다. 1화는 이미 올린 편이라 둔다.
  const base = decodeURIComponent(new URL('../../스포츠영상/', import.meta.url).pathname);
  for (const ep of ['2화', '3화', '4화', '5화', '9화']) {
    const md = fs.readFileSync(path.join(base, `${ep}-대본.md`), 'utf8');
    const notes = checkSpoken(md).notes.filter((n) => n.includes('영어'));
    assert.deepEqual(notes, [], `${ep}: ${notes[0]}`);
  }
});


await asyncTest('닮게 그리는 샷에서도 실사는 막혀 있다 (유튜브 정책)', async () => {
  // 2026-11-07 운영자: "구글 유튜브 정책에 안 걸리게 부탁한다.
  // 잘하다가 정책에 걸려 정지당하면 큰일이다."
  //
  // 유튜브는 **현실로 오인될 수 있는** 합성 콘텐츠에 공시를 요구한다.
  // 분명한 일러스트는 대상이 아니다. 그러니까 우리 그림체가 그 자체로
  // 방어다 — 실사로 가는 순간 그 방어가 통째로 무너진다.
  //
  // 걱정되는 자리가 하나 있다. 닮게 그리는 샷에서는 공통 금지 목록의
  // 'no real identifiable public figures' 를 **일부러 뺀다**(안 빼면
  // 닮으라는 지시와 정면으로 싸운다). 그때 실사 금지까지 같이 빠지면
  // 사진 같은 실존 인물 얼굴이 나올 수 있다.
  //
  // 그래서 여기서 못 박는다. 닮음은 풀어도 **실사는 안 풀린다.**
  const V = await import('../src/scenes/visuals.mjs');

  for (const likeness of [false, true]) {
    const p = V.composeImagePrompt('a pitcher on the mound', null, { kind: 'SPORTS', likeness });
    assert.ok(/no photorealistic faces/.test(p), `실사 얼굴 금지가 빠졌습니다 (likeness=${likeness})`);
    assert.ok(/no photograph/.test(p), `사진 금지가 빠졌습니다 (likeness=${likeness})`);
    assert.ok(/no extra arms/.test(p), `팔 개수 금지가 빠졌습니다 (likeness=${likeness})`);
    // ⚠️ 2026-11-09. 구단 이름과 '스폰서 글자' 금지는 **뺐다.**
    //    flux-schnell·dev 에 negative_prompt 가 없어 본문으로 갔다.
    //    실사 금지는 남긴다 — 그쪽은 유튜브 정책이고, 화풍을 적는
    //    긍정문(지브리·수채)이 같이 세게 끌어 준다.
    for (const w of ['Major League Baseball', 'sponsor text', 'wordmark']) {
      assert.ok(!new RegExp(w, 'i').test(p), `"${w}" 가 프롬프트에 있습니다 — 부르면 그립니다`);
    }
  }

  // 닮음을 켰을 때만 실존 인물 금지가 빠진다. 끄면 그대로 있어야 한다.
  const off = V.composeImagePrompt('x', null, { kind: 'SPORTS', likeness: false });
  const on = V.composeImagePrompt('x', null, { kind: 'SPORTS', likeness: true });
  assert.ok(/no real identifiable public figures/.test(off), '사진 없는 샷에서 빠졌습니다');
  assert.ok(!/no real identifiable public figures/.test(on), '닮음 지시와 싸우는 줄이 남아 있습니다');
});

await asyncTest('기획 파일의 사진 주소가 소재 레코드까지 간다 (실행 #64)', async () => {
  // ⚠️ 이게 **실제로 돈을 쓰고 나서야** 드러난 버그다.
  //
  // 9화에 사진 다섯 장을 다 넣고 완성본을 돌렸는데(실행 #64) 한 장도
  // 안 쓰였다. 로그에 "생김새만 적힌 사람 5명" 만 찍혔다.
  //
  // 원인은 model.mjs 의 makeSports 였다. 기획 파일의 사람을 레코드로
  // 옮길 때 name·role·look·tell 네 개만 옮기고 **photo 를 버렸다.**
  // 그래서 뒤에서 사진을 읽는 코드가 늘 빈손이었다.
  //
  //   main.mjs: loadContent(id)?.research?.people
  //             → photo 가 없으니 참조 모델을 한 번도 안 부른다
  //
  // 미리보기와 인물 시트는 기획 파일을 **직접** 읽어서 이 map 을 안
  // 거친다. 그래서 그쪽은 멀쩡해 보였고, 더 늦게 알아챘다.
  //
  // 사진을 모으는 일은 사람 손이 많이 간다. 그걸 조용히 버리는 것이
  // 제일 나쁘다 — 아무도 안 터지고 그림만 안 닮는다.
  const { makeSports } = await import('../src/model.mjs');

  const item = makeSports({
    title: 'x',
    people: [
      { name: '가', role: '투수', look: 'a pitcher', tell: '', photo: 'https://e.com/a.jpg', photo_예비: 'https://e.com/a2.jpg' },
      { name: '나', role: '타자', look: 'a batter', tell: '' },
    ],
  });

  assert.equal(item.people.length, 2);
  assert.equal(item.people[0].photo, 'https://e.com/a.jpg', '사진 주소가 레코드까지 안 갑니다');
  assert.equal(item.people[0].photo_예비, 'https://e.com/a2.jpg', '예비 주소가 레코드까지 안 갑니다');

  // 사진이 없는 사람에게는 빈 photo 를 붙이지 않는다. 붙으면 레코드를
  // 눈으로 볼 때 "넣었는데 안 됐나" 하고 헷갈린다.
  assert.ok(!('photo' in item.people[1]), '사진 없는 사람에게 빈 photo 가 붙었습니다');

  // main.mjs 가 쓰는 바로 그 걸러내기로 한 번 더 본다. 이게 0이면
  // 참조 모델을 안 부른다.
  const withPhoto = item.people.filter((p) => /^https?:\/\//.test(String(p?.photo || '')));
  assert.equal(withPhoto.length, 1, '참조로 쓸 사람이 안 잡힙니다');

  // 실제 9화 기획 파일로도 본다. 다섯 명 전부 사진이 있어야 한다.
  const base = decodeURIComponent(new URL('../../스포츠영상/', import.meta.url).pathname);
  const plan = JSON.parse(fs.readFileSync(path.join(base, '9화.json'), 'utf8'));
  const real = makeSports({ title: plan.title, people: plan.people });
  const realWithPhoto = real.people.filter((p) => /^https?:\/\//.test(String(p?.photo || '')));
  // ⚠️ 처음에는 5 라고 숫자를 박아 뒀는데, 사람이 아홉으로 늘자 이
  //    테스트가 먼저 걸렸다. 제 일을 한 것이다. 그래도 숫자를 박으면
  //    사람을 더할 때마다 여기를 고쳐야 하고, 고치다 보면 생각 없이
  //    숫자만 바꾸게 된다. **"전원인지"로 바꾼다** — 그게 진짜 규칙이다.
  assert.ok(real.people.length >= 5, `9화 사람이 ${real.people.length}명뿐입니다`);
  assert.equal(
    realWithPhoto.length,
    real.people.length,
    `9화 사람 ${real.people.length}명 중 사진이 레코드까지 간 사람이 ${realWithPhoto.length}명입니다`
  );
});

await asyncTest('사진이 있는 사람의 샷만 참조 모델로 그린다', async () => {
  // 운영자가 "그림이 진짜 선수 같은 느낌이었으면" 한다(2026-11-03).
  // 글로만 생김새를 적으면 "그 조건에 맞는 아무 얼굴"이 나온다.
  // 사진을 참조로 주면 실제로 닮는다.
  //
  // 그런데 참조 모델은 비싸다($0.05 대 $0.025). 그 사람이 나오는 샷에만 쓴다.
  const I = await import('../src/assets/images.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 'ref-'));

  const calls = [];
  const client = {
    generate: async (prompt, o) => {
      calls.push({ modelKey: o.modelKey, ref: o.referenceImage, ar: o.aspectRatio });
      return { url: 'http://x/y.png', usdEstimate: o.referenceImage ? 0.05 : 0.025 };
    },
    download: async () => Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4096),
    ]),
  };
  const prompts = [
    { shot_id: 'S1-1', scene_number: 1, image_prompt: 'a dugout', card_text: '', person: '' },
    { shot_id: 'S1-2', scene_number: 1, image_prompt: 'kim', card_text: '', person: '김도영' },
    { shot_id: 'S1-3', scene_number: 1, image_prompt: 'park', card_text: '', person: '박재현' },
  ];
  const out = await I.generateImages(prompts, {
    assetDir: dir, client, sleepFn: async () => {},
    people: [
      { name: '김도영', photo: 'https://example.com/kim.jpg' },
      // 사진 주소가 없는 사람은 그냥 글로 그린다.
      { name: '박재현', photo: '' },
    ],
  });

  assert.equal(out.made.length, 3);
  // ⚠️ 2026-11-07 에 바뀌었다. 전에는 'schnell' 이었다.
  //
  //    운영자: "선수 사진만 갑자기 캐리커처가 나오니 이상하잖아."
  //            "전체 그림톤은 통일이다. 지브리다. 달라지면 안 된다."
  //
  //    원인이 프롬프트가 아니라 **모델**이었다. 참조 샷은 flux-pulid 가
  //    그리는데 그건 flux-dev 위에 얹혀 있고, 나머지는 flux-schnell 이
  //    그렸다. 바탕이 다르니 결이 다르다 — id_weight 를 0.7 에서
  //    0.35 까지 내려도 안 없어졌던 까닭이 이것이다.
  //
  //    그래서 참조 샷이 하나라도 있으면 나머지도 그 바탕으로 그린다.
  assert.equal(calls[0].modelKey, 'dev', '참조 샷이 있는데 바탕을 안 맞췄습니다');
  assert.equal(
    calls[0].modelKey,
    (await import('../src/assets/replicate.mjs')).modelFor('portrait').baseModel,
    '참조 모델의 바탕과 다릅니다'
  );
  assert.equal(calls[1].modelKey, I.REFERENCE_MODEL, '사진 있는 사람이 참조 모델로 안 갔습니다');
  assert.equal(calls[1].ref, 'https://example.com/kim.jpg');
  assert.equal(calls[2].modelKey, 'dev', '사진 없는 사람이 참조 모델로 갔습니다');

  // 본편은 가로다. 세로로 만들면 16:9 에 넣을 때 위아래가 잘린다.
  for (const c of calls) assert.equal(c.ar, '16:9');

  // 참조 샷이 더 비싸다. 그 값으로 세야 상한이 맞는다.
  assert.equal(out.spentUsd, 0.1, `쓴 돈이 $${out.spentUsd} 입니다 (0.025+0.05+0.025 여야 합니다)`);
});

await asyncTest('사진에서 얼굴을 못 찾으면 예비로, 그래도 안 되면 참조 없이 그린다 (실행 #65)', async () => {
  // 실행 #65 에서 류현진 사진으로 건 두 샷이 이렇게 죽었다.
  //
  //     facexlib align face fail
  //
  // 참조 모델이 사진에서 얼굴을 못 찾은 것이다. 투구 동작 사진이라
  // 얼굴이 작거나 글러브에 가렸을 것이다.
  //
  // 문제는 그 둘이 **자리표시 화면**으로 영상에 남았다는 것이다.
  // 7분짜리에 빈 화면 두 장은 눈에 띈다. 안 닮은 그림이 빈 화면보다
  // 백 배 낫다.
  const I = await import('../src/assets/images.mjs');
  const V = await import('../src/scenes/visuals.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 'face-'));

  const calls = [];
  const client = {
    generate: async (prompt, o) => {
      calls.push({ ref: o.referenceImage, prompt });
      // 본 사진과 예비 사진 둘 다 얼굴을 못 찾는다고 해 본다.
      if (o.referenceImage) {
        const err = new Error('이미지 생성 실패 (failed): facexlib align face fail');
        throw err;
      }
      return { url: 'http://x/y.png', usdEstimate: 0.025 };
    },
    // PNG 머리 + 넉넉한 길이. 짧으면 looksLikeImage 가 거른다.
    download: async () =>
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(I.MIN_IMAGE_BYTES || 4096),
      ]),
  };

  const prompt = V.composeImagePrompt('a pitcher', null, { kind: 'SPORTS', likeness: true });
  const out = await I.generateImages(
    [{ shot_id: 'S05-2', scene_number: 5, person: '류현진', image_prompt: prompt }],
    {
      assetDir: dir,
      token: 't',
      client,
      people: [{ name: '류현진', photo: 'https://e.com/main.jpg', photo_예비: 'https://e.com/spare.jpg' }],
      sleep: async () => {},
    }
  );

  // 세 번 걸었어야 한다: 본 사진 → 예비 사진 → 참조 없이.
  assert.deepEqual(
    calls.map((c) => c.ref),
    ['https://e.com/main.jpg', 'https://e.com/spare.jpg', null],
    '세 단으로 안 내려갑니다'
  );

  // 그리고 **그림은 나와야 한다.** 자리표시 화면이 아니다.
  assert.equal(out.failed.length, 0, `실패로 남았습니다: ${JSON.stringify(out.failed)}`);
  assert.equal(out.made.length, 1, '그림이 안 나왔습니다');

  // 참조를 뗀 마지막 호출은 "사진과 같은 얼굴" 지시도 떼야 한다.
  // 안 떼면 모델이 있지도 않은 사진을 찾느라 얼굴이 더 이상해진다.
  const last = calls[calls.length - 1];
  assert.ok(!last.prompt.includes(V.SPORTS_LIKENESS_CLAUSE), '닮음 지시가 남아 있습니다');
  assert.ok(last.prompt.includes(V.SPORTS_INVENTED_CLAUSE), '지어낸 인물 지시가 안 붙었습니다');

  // 얼굴 못 찾음을 보통 실패와 갈라 보는가. 다시 걸어도 똑같은 실패라
  // 사진을 바꿔야 하는 쪽이다.
  assert.ok(I.isFaceFail(new Error('facexlib align face fail')));
  assert.ok(!I.isFaceFail(new Error('Replicate 429: Request was throttled')));
});

await asyncTest('참조 사진이 하나도 없으면 바탕을 안 바꾼다', async () => {
  // 바탕을 맞추는 것은 **참조 샷이 있을 때만** 하는 일이다. 사진이
  // 하나도 없으면 flux-pulid 를 아예 안 부르므로 결이 어긋날 일이
  // 없고, 그때까지 비싼 모델로 그리면 돈만 더 쓴다.
  const I = await import('../src/assets/images.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 'nobase-'));
  const calls = [];
  const client = {
    generate: async (_p, o) => { calls.push(o.modelKey); return { url: 'http://x/y.png', usdEstimate: 0.003 }; },
    download: async () => Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(I.MIN_IMAGE_BYTES || 4096),
    ]),
  };
  await I.generateImages([{ shot_id: 'S01-1', scene_number: 1, image_prompt: 'a field' }], {
    assetDir: dir, token: 't', client,
    people: [{ name: '아무개', look: 'a man', photo: '' }],
    sleep: async () => {},
  });
  assert.deepEqual(calls, ['schnell'], '사진이 없는데 비싼 바탕으로 갔습니다');
});

await asyncTest('참조 샷은 비싼 값으로 상한을 센다', async () => {
  // 싼 값으로 세면 상한을 넘겨 놓고 넘은 줄 모른다.
  const I = await import('../src/assets/images.mjs');
  const dir = fs.mkdtempSync(path.join(TMP, 'refcap-'));
  let n = 0;
  const client = {
    generate: async (_p, o) => {
      n++;
      return { url: 'http://x/y.png', usdEstimate: o.referenceImage ? 0.05 : 0.025 };
    },
    download: async () => Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4096),
    ]),
  };
  const out = await I.generateImages(
    [
      { shot_id: 'A', scene_number: 1, image_prompt: 'x', card_text: '', person: '김도영' },
      { shot_id: 'B', scene_number: 1, image_prompt: 'x', card_text: '', person: '김도영' },
    ],
    {
      assetDir: dir, client, sleepFn: async () => {}, maxUsd: 0.06,
      people: [{ name: '김도영', photo: 'https://example.com/kim.jpg' }],
    }
  );
  // 0.05 한 장은 되고, 두 장째(0.10)는 상한 0.06 을 넘는다.
  assert.equal(n, 1, `${n}장을 걸었습니다 — 한 장이어야 합니다`);
  assert.equal(out.stoppedBy, 'budget');
});


await asyncTest('커뮤니티 모델은 버전을 찾아 /predictions 에 건다', async () => {
  // 실행 #52 가 404 로 죽었다. 코드가 /models/{이름}/predictions 를 썼는데
  // 그 주소는 **공식 모델에만** 있다. flux schnell·dev 는 공식이라 되고,
  // flux-pulid 는 커뮤니티 모델이라 없다.
  const R = await import('../src/assets/replicate.mjs');
  const calls = [];
  const fetchFn = async (url, opt = {}) => {
    calls.push({ url, method: opt.method || 'GET', body: opt.body });
    if (url.endsWith('/models/zsxkib/flux-pulid')) {
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ latest_version: { id: 'ver-abc123' } }),
        json: async () => ({ latest_version: { id: 'ver-abc123' } }),
      };
    }
    const done = { id: 'p1', status: 'succeeded', output: ['http://x/y.png'] };
    return { ok: true, status: 200, text: async () => JSON.stringify(done), json: async () => done };
  };
  const api = R.createClient({ token: 't', fetchFn, sleepFn: async () => {} });
  const out = await api.generate('a batter', {
    modelKey: 'portrait',
    referenceImage: 'https://example.com/k.jpg',
    aspectRatio: '16:9',
  });
  assert.equal(out.url, 'http://x/y.png');

  // 먼저 모델 정보를 읽어 버전을 찾아야 한다.
  assert.ok(
    calls[0].url.endsWith('/models/zsxkib/flux-pulid'),
    `첫 호출이 ${calls[0].url} 입니다 — 모델 정보를 먼저 읽어야 합니다`
  );
  assert.equal(calls[0].method, 'GET');

  // 그다음 /predictions 에 version 을 실어 건다.
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post, 'POST 가 없습니다');
  assert.ok(
    post.url.endsWith('/v1/predictions'),
    `${post.url} 에 걸었습니다 — 커뮤니티 모델은 /v1/predictions 입니다`
  );
  const sent = JSON.parse(post.body);
  assert.equal(sent.version, 'ver-abc123', '버전을 안 실었습니다');
  assert.equal(sent.input.main_face_image, 'https://example.com/k.jpg');
  // 가로 샷이어야 한다. 세로로 만들면 16:9 에 넣을 때 위아래가 잘린다.
  assert.equal(sent.input.width, 1344);
});

await asyncTest('공식 모델은 예전 주소를 그대로 쓴다', async () => {
  // 커뮤니티 분기를 넣으면서 공식 모델까지 바꾸면 되던 것이 깨진다.
  const R = await import('../src/assets/replicate.mjs');
  const calls = [];
  const fetchFn = async (url, opt = {}) => {
    calls.push({ url, method: opt.method || 'GET' });
    const done = { id: 'p1', status: 'succeeded', output: ['http://x/y.png'] };
    return { ok: true, status: 200, text: async () => JSON.stringify(done), json: async () => done };
  };
  const api = R.createClient({ token: 't', fetchFn, sleepFn: async () => {} });
  await api.generate('a dugout', { modelKey: 'schnell' });
  assert.equal(calls.length, 1, '공식 모델인데 모델 정보를 따로 읽었습니다');
  assert.ok(calls[0].url.includes('/models/'), calls[0].url);
  assert.ok(calls[0].url.endsWith('/predictions'), calls[0].url);
});

await asyncTest('참조 모델 이름이 다 404 면 분명히 말한다', async () => {
  // 올린 사람이 모델을 지우면 그날로 404 다. "resource could not be found"
  // 만 보고는 무엇을 고쳐야 하는지 알 수 없다.
  const R = await import('../src/assets/replicate.mjs');
  const fetchFn = async () => ({
    ok: false, status: 404,
    text: async () => 'not found',
    json: async () => ({ detail: 'not found' }),
  });
  const api = R.createClient({ token: 't', fetchFn, sleepFn: async () => {}, maxAttempts: 1 });
  await assert.rejects(
    () => api.generate('x', { modelKey: 'portrait', referenceImage: 'https://e.com/a.jpg' }),
    (e) => {
      assert.ok(/찾아본 이름/.test(e.message), `메시지: ${e.message}`);
      assert.ok(/zsxkib\/flux-pulid/.test(e.message), '찾아본 이름을 안 알려줍니다');
      assert.ok(/replicate\.mjs/.test(e.message), '어디를 고쳐야 하는지 안 알려줍니다');
      return true;
    }
  );
});


await asyncTest('얼굴을 안 쓰는 샷에 무엇을 그릴지 알려 준다', async () => {
  // 2026-11-04 운영자: "사람 정면만 넣지 말고, 수비 보는 장면, 타격하는
  // 장면 등등 야구장 같은 현장감을 넣어서 만들어 줘."
  //
  // 전에는 "얼굴은 아껴 쓴다"까지만 적혀 있었다. 아끼라고만 하고 **대신
  // 뭘 그리라는 말이 없으니** 빈 화면이나 회의실이 나왔다.
  const V = await import('../src/scenes/visuals.mjs');
  const r = V.SPORTS_VISUALS_RULES;

  assert.ok(/야구장을 그린다/.test(r), '현장을 그리라는 말이 없습니다');
  // 종목 장면이 실제로 적혀 있어야 한다. 말만 "현장감"이라고 하면
  // 모델이 알아서 하지 않는다.
  for (const w of ['불펜', '수비', '타격', '전광판']) {
    assert.ok(r.includes(w), `${w} 장면 예시가 없습니다`);
  }
  // 그림이 그 문장과 맞아야 한다는 말
  assert.ok(/그 문장이 말하는 것을 보여야/.test(r));
  // 얼굴 아끼기 규칙은 그대로 남아 있어야 한다
  assert.ok(/한 사람에 한 장면이 기본/.test(r));
});

await asyncTest('사진이 있는 사람은 한 장으로 묶지 않는다', async () => {
  // 묶기는 "같은 사람이 샷마다 다른 얼굴로 나온다"를 막으려고 넣었다.
  // 참조 사진이 그 문제를 이미 푼다. 그런데도 묶으면 한 장면이 통째로
  // 정지 그림 한 장이 되어 현장감이 죽는다.
  const V = await import('../src/scenes/visuals.mjs');
  const scene = {
    scene_number: 1,
    shots: [{ shot_id: 'S1-1', duration: 5 }, { shot_id: 'S1-2', duration: 5 }],
  };
  const design = {
    shots: [
      {
        shot_id: 'S1-1', image_prompt: 'a batter swinging', video_prompt: '', era: 'present',
        camera: 'pan right', motion_need: 6, depicts_real_person: true, person: '김도영',
      },
      {
        shot_id: 'S1-2', image_prompt: 'rounding first base', video_prompt: '', era: 'present',
        camera: 'zoom in', motion_need: 7, depicts_real_person: true, person: '김도영',
      },
    ],
  };

  // 사진이 있으면 둘 다 제 그림을 그리고 카메라도 그대로다.
  const withPhoto = V.mergeVisuals(scene, design, {
    kind: 'SPORTS', photoNames: new Set(['김도영']),
  }).scene;
  assert.ok(withPhoto.shots[1].image_prompt, '사진이 있는데 두 번째 샷을 비웠습니다');
  assert.ok(!withPhoto.shots[1].same_image_as, '사진이 있는데 묶었습니다');
  assert.equal(withPhoto.shots[0].camera, 'pan right', '사진이 있는데 카메라를 멈췄습니다');

  // 사진이 없으면 여태대로 묶는다 — 3화를 망친 문제가 그대로이므로.
  const noPhoto = V.mergeVisuals(scene, design, { kind: 'SPORTS' }).scene;
  assert.equal(noPhoto.shots[1].same_image_as, 'S1-1', '사진이 없는데 안 묶었습니다');
  assert.equal(noPhoto.shots[1].image_prompt, '');
  assert.equal(noPhoto.shots[0].camera, 'hold');
});


await asyncTest('화면을 층으로 채우되 요란하게 하지 않는다', async () => {
  // 2026-11-04 운영자: "너무 썰렁하지도 너무 과하지도 않게, 적당한 구성과
  // 배경과 배경 흐리기 등등의 다양한 효과를 넣어서 화면을 풍성하게."
  const V = await import('../src/scenes/visuals.mjs');
  const r = V.SPORTS_VISUALS_RULES;

  assert.ok(/층이 셋/.test(r), '층 지시가 없습니다');
  for (const w of ['앞', '가운데', '뒤']) assert.ok(r.includes(w));
  assert.ok(/흐리게/.test(r), '배경 흐리기 지시가 없습니다');

  // 과하게 가는 것도 막아야 한다. "풍성하게"만 적으면 폭발과 속도선이 나온다.
  assert.ok(/폭발·불꽃·번개·속도선/.test(r), '과한 효과를 막는 말이 없습니다');

  // 화풍 문장에도 들어가야 한다 — 규칙은 설계 AI 가 읽고, 화풍 문장은
  // 그림 모델이 읽는다. 한쪽에만 적으면 다른 쪽이 모른다.
  const p = V.composeImagePrompt('a batter', null, { kind: 'SPORTS' });
  assert.ok(/three layers/.test(p), '그림 모델에게 가는 글에 층 지시가 없습니다');
  assert.ok(/out-of-focus/.test(p), '앞을 흐리게 하라는 말이 없습니다');
});


await asyncTest('주요 인물은 한 명도 빠뜨리지 말라고 적는다', async () => {
  // 2026-11-04 운영자: "주요 인물들은 꼭 들어가야 하고."
  //
  // 전에는 "얼굴은 아껴 쓴다"까지만 있었다. 아끼라고만 하면 아예 안
  // 그리게 된다 — 그러면 이름만 나오고 얼굴은 없는 영상이 된다.
  const V = await import('../src/scenes/visuals.mjs');
  const r = V.SPORTS_VISUALS_RULES;
  assert.ok(/주요 인물은 반드시 한 번씩 넣는다/.test(r), '반드시 넣으라는 말이 없습니다');
  assert.ok(/한 명도 빠뜨리지 않는다/.test(r));
  // 아끼는 규칙도 같이 남아야 한다. 둘 다 있어야 "한 번씩"이 된다.
  assert.ok(/안 그린다 — 제도·규정/.test(r), '아껴 쓰는 규칙이 사라졌습니다');

  // 사람 목록 쪽에도 적혀 있어야 한다. 규칙만 보고 목록을 안 볼 수 있다.
  const pr = V.peopleRules([{ name: '김도영', role: '삼루수', look: 'a man' }]);
  assert.ok(/한 명도 빠뜨리지 않는다/.test(pr), '사람 목록에 그 말이 없습니다');
  assert.ok(/person 칸에 이름을 적어야/.test(pr), 'person 칸을 채우라는 말이 없습니다');
});

await asyncTest('7화에 나오는 사람이 모두 적혀 있다', async () => {
  // 대본이 한 단락을 통째로 쓰는 사람이 people 에 없으면, 설계 AI 가
  // 아무 얼굴이나 그린다. 김태군이 실제로 그랬다(2026-11-04).
  const file = new URL('../../스포츠영상/7화.json', import.meta.url).pathname;
  const script = new URL('../../스포츠영상/7화-대본.md', import.meta.url).pathname;
  if (!fs.existsSync(file) || !fs.existsSync(script)) return;
  const item = JSON.parse(fs.readFileSync(file, 'utf8'));
  const text = fs.readFileSync(script, 'utf8');
  const named = new Set(item.people.map((p) => String(p.name).trim()));

  // 대본에서 세 번 이상 나오는 사람 이름은 주요 인물로 본다.
  for (const name of ['정해영', '김호령', '김태군', '김도영', '박재현', '양현종']) {
    const hits = text.split(name).length - 1;
    if (hits >= 2) {
      assert.ok(named.has(name), `${name} 이 대본에 ${hits}번 나오는데 people 에 없습니다`);
    }
  }
});


await asyncTest('5.7초 어긋남을 고르게 나눠 맞춘다 (실행 #58)', async () => {
  // 실행 #58 이 여기서 죽었다. 샷 합계 288.63초, 나레이션 282.91초.
  // 그림 50장과 음성을 이미 만들어 놓고($0.17) 영상이 안 나왔다.
  //
  // 마지막 클립 하나로 5.7초를 흡수하면 그 화면이 눈에 띄게 끌린다.
  // 예순 개에 나누면 샷마다 0.1초라 안 보인다.
  const P = await import('../src/video/plan.mjs');

  // 샷 60개 × 4.81초 = 288.6초, 나레이션은 282.91초
  const shots = [];
  for (let i = 1; i <= 60; i++) {
    shots.push({
      shot_id: `S1-${i}`, duration: 4.81, asset_type: 'image', camera: 'zoom in',
    });
  }
  const scenes = [{ scene_number: 1, section: 'HOOK', shots, paragraphs: [] }];

  const plan = P.buildTimeline(scenes, { narrationSeconds: 282.91, assetDir: 'assets' });
  assert.deepEqual(plan.problems ?? [], [], `문제가 남았습니다: ${JSON.stringify(plan.problems)}`);
  assert.ok(
    Math.abs(plan.duration - 282.91) <= 1,
    `합계가 ${plan.duration} 입니다 — 282.91 에 맞아야 합니다`
  );

  // 한 클립에 몰리지 않았는지 본다. 몰면 그 화면만 길게 끌린다.
  const longest = Math.max(...plan.clips.map((c) => c.duration));
  assert.ok(longest < 6, `한 클립이 ${longest}초입니다 — 한 곳에 몰렸습니다`);

  // start 가 이어져야 한다. 틀리면 영상 중간이 비거나 겹친다.
  let t = 0;
  for (const c of plan.clips) {
    assert.ok(Math.abs(c.start - t) < 0.05, `${c.shot_id} 의 시작이 어긋납니다`);
    t = Math.round((t + c.duration) * 100) / 100;
  }
});

await asyncTest('정말 크게 어긋나면 그대로 실패시킨다', async () => {
  // 고르게 나눈다고 뭐든 맞추면 안 된다. 절반이 어긋나는 것은 반올림도
  // 오차도 아니라 설계가 틀린 것이다. 조용히 늘리면 영상이 늘어진 채 나간다.
  const P = await import('../src/video/plan.mjs');
  const shots = [];
  for (let i = 1; i <= 10; i++) {
    shots.push({ shot_id: `S1-${i}`, duration: 10, asset_type: 'image', camera: 'zoom in' });
  }
  const scenes = [{ scene_number: 1, section: 'HOOK', shots, paragraphs: [] }];
  const plan = P.buildTimeline(scenes, { narrationSeconds: 50, assetDir: 'assets' });
  assert.ok(
    (plan.problems || []).some((x) => /어긋납니다/.test(x)),
    '100초짜리를 50초로 우겨 넣고도 통과했습니다'
  );
});


await asyncTest('번째는 고유어로 읽는다 — 일곱 번째', async () => {
  // 2026-11-10 운영자: "칠번째 반지가 아니라 일곱번째 반지다"
  //
  // 11화에 "7번째 반지를 꼈습니다" 가 있는데 **"칠번째"** 로 읽혔다.
  //
  // 까닭은 예외 표에 있었다. '번' 의 예외 정규식이
  //   /^(째|\s*(타자|타순|타|지명|선발|홈런|투수))/
  // 였다. 맨 앞 '째' 때문에 **번째가 한자어로 빠졌다.**
  //
  // 거꾸로다. 번째는 언제나 고유어고, 한자어인 것은 **타순의 번**이다 —
  // 4번 타자는 "사번 타자"가 맞다. 그 둘을 한 줄에 묶는 바람에
  // 지켜야 할 쪽이 막혔다.
  const SP = await import('../src/audio/speech.mjs');
  const r = (t) => SP.speechText(t);

  assert.equal(r('7번째 반지'), '일곱 번째 반지');
  assert.equal(r('2번째'), '두 번째');
  assert.equal(r('3번째'), '세 번째');
  assert.equal(r('20번째'), '스무 번째');

  // 1번째만 '한 번째' 가 아니라 **첫 번째**다. 차례를 셀 때만 바뀐다.
  assert.equal(r('1번째'), '첫 번째');

  // ⚠️ 타순의 '번' 은 그대로 한자어여야 한다. 이쪽을 깨뜨리면 안 된다.
  assert.equal(r('4번 타자'), '사번 타자');
  assert.equal(r('1번 타순'), '일번 타순');
});

await asyncTest('한자어 수는 붙여 읽는 것이 기본이다', async () => {
  // ── 2026-11-10. 구조를 뒤집었다 ──
  //
  // 운영자가 하루에 여섯 번을 짚었다 —
  //   "칠번째가 아니라 일곱번째" / "오~강권이 아니라 오강권"
  //   "십 연승이 아니라 십연승" / "그 경기를 두고에 텀이 너무 길다"
  //   "유격수였 고유효 튜표가 아니라 유격수였고, 유효투표"
  //   "7 전 4선승이 아니라 7전 4선승이다. **띄어읽기 오류가 너무 많다**"
  //
  // 고칠 때마다 '붙여 읽을 단위' 목록에 한 줄씩 더하고 있었다.
  // 그 구조로는 목록이 영영 안 찬다 — 단위가 끝이 없기 때문이다.
  // 모자 마크에서 "금지는 끝이 없다" 고 배운 것과 같은 모양이다.
  //
  // 그래서 **기본을 뒤집었다.** 한자어 수는 뒤 단위에 붙인다.
  // 띄우는 것은 SPLIT_AFTER 에 적은 '월'·'일' 뿐이다. 날짜가 이어지면
  // "십일월일일" 이 되어 '매일' 처럼 들리기 때문이다.
  //
  // 11화·12화 대본 전체를 훑으니 띄어 읽는 자리가 111곳에서 9곳으로
  // 줄었고, 남은 9곳은 전부 고유어 수사라 띄우는 게 맞다.
  const SP4 = await import('../src/audio/speech.mjs');
  const r = (t) => SP4.speechText(t);

  // 붙는다 — 이게 기본이다.
  assert.equal(r('7전 4선승제'), '칠전 사선승제');
  assert.equal(r('208안타'), '이백팔안타');
  assert.equal(r('90승'), '구십승');
  assert.equal(r('97표 중 72표'), '구십칠표 중 칠십이표');
  assert.equal(r('2607경기'), '이천육백칠경기');
  assert.equal(r('2006년'), '이천육년');

  // ⚠️ 날짜만 띄운다. 안 그러면 "십일월일일" 이 '매일' 처럼 들린다.
  assert.ok(/십일월 /.test(r('11월 1일')), '월 뒤를 안 띄웠습니다');

  // ⚠️ 고유어 수사는 띄운 그대로다. 이쪽을 붙이면 안 된다.
  assert.equal(r('10개 구단'), '열 개 구단');
  assert.equal(r('5경기에'), '다섯 경기에');
  assert.equal(r('4번 타자'), '사번 타자'); // 타순의 번만 한자어다
  assert.equal(r('7번째'), '일곱 번째');
});

await asyncTest('같은 날 걸린 띄어 읽기 넷을 한꺼번에 막는다', async () => {
  // 2026-11-10 에 운영자가 11화를 들으며 네 번 짚었다. 전부 **읽는
  // 쪽** 문제고 대본은 멀쩡하다. 한 번에 걸어 둔다.
  //
  //   "칠번째 반지가 아니라 일곱번째 반지다"
  //   "오~강권이 아니라 오강권이다"
  //   "십 연승이 아니라 십연승이다"
  //   "'그 경기를 두고' 에 텀이 너무 길다"
  //
  // ⚠️ 한 번에 하나씩 짚어 받는 대신, 11화·12화 대본 전체를 훑어
  //    같은 모양을 한꺼번에 찾았다. 거기서 '만원'·'백만'·'일과' 도
  //    같이 나왔다 — 운영자는 아직 안 짚었지만 같은 고장이다.
  const SP3 = await import('../src/audio/speech.mjs');
  const r = (t) => SP3.speechText(t);

  assert.equal(r('창단 최초 10연승'), '창단 최초 십연승');
  assert.equal(r('3연패에 빠졌다'), '삼연패에 빠졌다');
  // 숫자 글자인 '만' 이 뒤에 오면 떨어져 읽혔다.
  assert.equal(r('홈 100만 관중'), '홈 백만 관중');
  assert.equal(r('계약금은 3억 5,000만원입니다.'), '계약금은 삼억 오천만원입니다.');
  // '과' 는 조사다. "1과 3분의 2이닝" 이 "일 과" 로 끊겼다.
  assert.ok(/일과 삼분의/.test(r('고영표가 1과 3분의 2이닝 8실점을')));
  // 지시어가 뒤 낱말과 떨어져 읽히던 자리.
  assert.ok(/그경기를 두고/.test(r('감독이 그 경기를 두고 말했죠')));

  // ⚠️ 이미 맞던 것이 깨지지 않았는지 같이 본다.
  assert.equal(r('2회 말에 3차전 1루까지'), '이회말에 삼차전 일루까지');
  assert.equal(r('경기는 8-7로 끝났어요.'), '경기는 팔 대 칠로 끝났어요.');
  assert.equal(r('4번 타자'), '사번 타자');
});

await asyncTest('순위를 묶어 부르는 말은 붙여 읽는다 — 오강권', async () => {
  // 2026-11-10 운영자: "오~강권이 아니라 오강권이다"
  //
  // 11화의 "5강권 정도로 봤어요" 가 "오 강권" 으로 띄어 나갔고, 읽는
  // 쪽이 그 사이를 쉬었다. 듣기에는 **'오강권' 이라는 사람 이름**처럼
  // 들린다. 야구 중계에서 순위를 묶어 부르는 말은 한 덩어리다.
  const SP2 = await import('../src/audio/speech.mjs');
  const r = (t) => SP2.speechText(t);

  assert.equal(r('5강권 정도로 봤어요'), '오강권 정도로 봤어요');
  assert.equal(r('3강 체제'), '삼강 체제');
  assert.equal(r('5위권'), '오위권');

  // ⚠️ 단위를 넓게 잡지 않는다. 이미 맞던 것들이 그대로여야 한다.
  assert.equal(r('2회 말'), '이회말');
  assert.equal(r('3차전'), '삼차전');
  assert.equal(r('1루에서'), '일루에서');
});

await asyncTest('숫자와 단위를 붙여 읽는다 — 이회말', async () => {
  // 2026-11-06 운영자: "2회 말 이런 부분도 어색하다. 2회말 이렇게
  // 붙여서 읽어라."
  //
  // 야구에서 "이회말"은 한 낱말이다. 띄어 적으면 음성 모델이
  // "이 / 회 / 말" 로 끊어 읽어서 숫자를 세는 것처럼 들린다.
  const S = await import('../src/audio/speech.mjs');

  assert.equal(S.speechText('이 회 말에 소형준이 흔들렸습니다.'), '이회말에 소형준이 흔들렸습니다.');
  assert.equal(S.speechText('삼 차전에서 졌습니다.'), '삼차전에서 졌습니다.');
  assert.equal(S.speechText('일 번은 김민혁이었습니다.'), '일번은 김민혁이었습니다.');
  assert.equal(S.speechText('구자욱도 삼 루까지 갔습니다.'), '구자욱도 삼루까지 갔습니다.');

  // ⚠️ 처음에 "단위 뒤에 한글이 오면 건드리지 않는다"로 막아 뒀는데
  //    그러면 아무것도 안 붙었다. 한국어는 단위 뒤에 조사가 늘 온다.
  //    조사가 붙은 자리에서 실제로 붙는지 본다 — 이게 핵심이다.
  for (const [a, b] of [
    ['이 회 말에', '이회말에'], ['삼 차전에서', '삼차전에서'],
    ['일 번은', '일번은'], ['삼 루까지', '삼루까지'],
  ]) {
    assert.equal(S.speechText(a), b, `조사가 붙으면 안 붙습니다: ${a}`);
  }

  // 날짜·점수·비율은 건드리면 안 된다.
  // "십일월 일 일"을 붙이면 "십일월일일"이 되어 매일처럼 들린다.
  for (const t of ['십일월 일 일에 끝났습니다.', '일 대 육이었습니다.', '팔십팔 점 구 퍼센트입니다.']) {
    assert.equal(S.speechText(t), t, `건드리면 안 되는 자리를 바꿨습니다: ${t}`);
  }

  // 자막과 뜻이 같아야 한다. 공백만 지웠으므로 같아야 한다.
  const src = '이 회 말에 삼 루까지 갔습니다.';
  assert.ok(S.sameMeaning(src, S.speechText(src)), '글자를 건드렸습니다');
});

await asyncTest('이름을 쉼표로 셋 이상 이으면 잡는다', async () => {
  // 2026-11-06 운영자: "이재현, 류지혁, 김지찬 이렇게 선수가 연속으로
  // 나오면 말이 어색하다. 사람마다 좀 끊어서 읽어라."
  //
  // 쉼표는 눈으로는 목록인데 귀로는 한 덩어리다. 마침표로 끊어야
  // 음성이 실제로 쉰다 — pauseAfter 는 문단이 바뀔 때 쉼을 준다.
  const S = await import('../src/script/spoken.mjs');

  assert.equal(S.nameListSpots(['이재현, 류지혁, 김지찬에게 연속으로 볼넷을 줬어요.']).length, 1);
  // 둘까지는 자연스럽다.
  assert.equal(S.nameListSpots(['최원준과 이정훈을 잡고 끝냈습니다.']).length, 0);
  assert.equal(S.nameListSpots(['김도영, 나성범이 있습니다.']).length, 0);
  // 고친 모양은 안 걸려야 한다.
  assert.equal(
    S.nameListSpots(['이재현에게 볼넷. 류지혁에게 볼넷. 김지찬에게도 볼넷이었습니다.']).length, 0
  );

  // checkSpoken 이 실제로 알려 주는지 본다. 함수만 있고 안 부르면 소용없다.
  const r = S.checkSpoken('## [HOOK] 첫 줄\n\n[FACT] 이재현, 류지혁, 김지찬에게 볼넷을 줬어요.\n');
  assert.ok(
    (r.notes || []).some((n) => /쉼표로 셋 이상/.test(n)),
    `알려 주지 않았습니다: ${JSON.stringify(r.notes)}`
  );
});
// ════════════════════════════════════════════════════════════
// 유니폼과 등번호 (2026-11-07)
// ════════════════════════════════════════════════════════════
//
//   "그럼 유니폼은 어떻게 구현을 하나? 유니폼이 완전 다른 색상이다."
//   "유니폼과 등번호가 같아야 선수임을 뒤만 봐도 알 수 있지 않나.
//    그래야 팬들이 찾아오지 않겠나."
//
// 이 묶음이 지키는 것은 하나다 — **유니폼을 설계 AI 에게 맡기지
// 않는다.** 전에는 look 문장에 색을 적어 두고 그 AI 가 베껴 주기를
// 부탁했다. 안 베끼면 색이 사라진다. 그게 "완전 다른 색상"이었다.
// ════════════════════════════════════════════════════════════
// 11화 대본을 읽혀 보고 찾은 것들 (2026-11-08)
// ════════════════════════════════════════════════════════════
//
// 한국시리즈 편을 쓰고 대본 전체를 speechText 에 넣어 봤다. 다섯 군데가
// 틀렸다. 전부 **읽는 쪽**을 고쳤다 — 대본은 안 건드렸다. 자막은 눈에
// 익은 쪽이고, 어색한 건 읽기니까 고칠 자리도 읽기다.
const SM = await import('../src/model.mjs');

test('주소 없는 출처를 버리지 않는다', () => {
  // ⚠️ 2026-11-08. 11화 소재를 검사하다 찾았다. 출처 12개를 적었는데
  //    4개만 남아 있었다. `sources.filter((x) => x?.url)` 이 주소 없는
  //    것을 버렸고, **운영자가 기사 본문을 붙여 줄 때는 주소가 없다.**
  //    날아간 8개가 그 편의 가장 중요한 근거 전부였다.
  //
  //    조용히 사라지는 종류라 더 나쁘다. 영상 설명문에 근거를 적을 때
  //    그 기사들이 없는 채로 올라간다.
  const m = SM.makeSports({
    title: 'x',
    sources: [
      { name: '운영자가 붙여 준 기사', url: '', note: '본문만 받았다' },
      { name: '검색으로 찾은 기록', url: 'https://example.com/a' },
      { name: '', url: '' },
    ],
  });
  assert.equal(m.source_count, 2, '주소 없는 출처가 버려졌습니다');
  assert.ok(m.sources.some((x) => x.name === '운영자가 붙여 준 기사'));
  // 이름도 주소도 없는 줄은 버린다. 빈 줄을 세면 출처 수가 거짓이 된다.
  assert.ok(!m.sources.some((x) => !x.name && !x.url));
  // 대표 출처는 **주소가 있는 것 중 첫째**다. 주소 없는 것을 대표로
  // 세우면 설명문에 링크 없는 줄이 올라간다.
  assert.equal(m.source_url, 'https://example.com/a');
  assert.equal(m.source_name, '검색으로 찾은 기록');

  // ⚠️ makeItem 은 **일부러 다르다.** 둘을 맞추려 들면 한쪽이 깨진다.
  //
  //   makeItem    AI 가 찾아온 소재. 주소가 없으면 확인할 길이 없다.
  //   makeSports  사람이 쓴 기획. 운영자가 기사를 읽고 직접 적었다.
  //
  // 같은 이름의 칸이지만 믿는 근거가 다르다.
  const ai = makeItem({
    title: 'x',
    fact_status: 'CONFIRMED',
    sources: [{ name: '어디선가 들음' }, { url: 'https://a.example', name: 'A' }],
  });
  assert.equal(ai.source_count, 1, 'AI 소재는 주소 없는 출처를 세면 안 됩니다');
});

test('10화·11화의 출처가 한 줄도 안 사라진다', () => {
  for (const f of ['10화.json', '11화.json']) {
    const p = decodeURIComponent(
      new URL(`../../스포츠영상/${f}`, import.meta.url).pathname
    );
    if (!fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const written = (raw.sources || []).filter((x) => x?.name || x?.url).length;
    assert.ok(written >= 5, `${f}: 출처를 더 적어야 합니다 (${written}개)`);
    assert.equal(
      SM.makeSports(raw).source_count,
      written,
      `${f}: 적어 둔 출처가 중간에 사라집니다`
    );
  }
});

// ════════════════════════════════════════════════════════════
// 나레이션 속도를 실제로 재서 고쳤다 (2026-11-08, 실행 #70)
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// 체격을 글로 적다가 두 번 틀렸다 (2026-11-09)
// ════════════════════════════════════════════════════════════
//
//   2026-11-07  한승혁(185cm 100kg)을 "lean and wiry" 라고 적었다
//   2026-11-09  올러(193cm 102kg)를 "a heavy thick build" 라고 적었다
//               → 운영자: "이 돼지는 누구인가? 올러는 이렇게 뚱뚱하지 않다"
//
// 두 번 다 **네일과 구분하려고 숫자 없이 느낌말을 골랐다.** 느낌말은
// 모델이 제 맘대로 읽는다. 'heavy' 는 비만이 되고 'lean' 은 말라깽이가
// 된다.
//
// 그래서 규칙을 하나로 못 박는다 — **체격을 말하려면 숫자를 적는다.**
// 숫자를 못 찾으면 체격 말을 쓰지 않고 얼굴·머리·수염으로 가른다.
// ════════════════════════════════════════════════════════════
// 사진을 그대로 지브리로 (2026-11-09)
// ════════════════════════════════════════════════════════════
//
// 운영자가 구조를 정했다.
//
//   "사진을 사용하는 게 아니라 사진을 지브리 스타일로 그려서 사용한다.
//    그리고 중간 사진은 지금처럼 사용한다."
//   "필요한 중요 사진의 이미지는 내가 url 로 준다. 사람별로 몇 장이
//    필요한지 주면 맞춰서 URL 을 주겠다."
//   "다만 워터마크는 꼭! 지워라."
section('4-v. 사진을 그대로 지브리로');

const RP = await import('../src/assets/repaint.mjs');

test('사람당 여러 장을 받는다', () => {
  // 샷마다 다른 자세가 필요하다. 전에는 photo 와 photo_예비 둘뿐이었는데
  // 그건 "얼굴 한 장만 참조한다"는 전제에서 나온 모양이다.
  const { jobs } = RP.repaintJobs([
    {
      name: '김도영',
      photos: [
        { url: 'https://a/1.jpg', 쓰임: '유격수 수비' },
        { url: 'https://a/2.jpg', 쓰임: '타석' },
      ],
    },
  ]);
  assert.equal(jobs.length, 2);
  // 파일 이름에 쓰임이 들어가야 한다. 결과를 고르는 것은 사람이고,
  // 나는 그림을 못 보기 때문에 더 그렇다.
  assert.ok(jobs.some((j) => j.file.includes('유격수 수비')));
  assert.ok(jobs.some((j) => j.file.includes('타석')));
});

test('옛 모양(photo / photo_예비)도 그대로 돈다', () => {
  // ⚠️ 1~11화 기획 파일이 전부 옛 모양이다. 한꺼번에 고치면 지금
  //    돌아가는 것을 깨뜨린다. 둘 다 받는다.
  const one = RP.repaintJobs([{ name: '구자욱', photo: 'https://b/1.jpg' }]);
  assert.equal(one.jobs.length, 1);
  assert.equal(one.jobs[0].file, '구자욱.png');

  const two = RP.repaintJobs(
    [{ name: '구자욱', photo: 'https://b/1.jpg', photo_예비: 'https://b/2.jpg' }],
    { spare: true }
  );
  assert.equal(two.jobs.length, 2);
});

test('주소가 아니면 건너뛰고 까닭을 말한다', () => {
  // 로컬 경로를 넣었다면 그건 사진을 저장소에 들이려는 것이고,
  // 공개 저장소라 그건 퍼블리싱이다. 그러지 않기로 했다.
  const { jobs, skipped } = RP.repaintJobs([
    { name: '없는사람' },
    { name: '로컬', photo: '스포츠영상/사진/a.jpg' },
  ]);
  assert.equal(jobs.length, 0);
  assert.equal(skipped.length, 2);
});

test('워터마크를 프롬프트에서 아예 말하지 않는다', () => {
  // ── 두 번 틀렸고 두 번 다 더 나빠졌다 (2026-11-09) ──
  //
  //   1차  'no watermark, no logo stamp, no agency mark, ...'
  //        → 뉴스1, 일간스포츠가 그림 안에 그려져 나왔다
  //   2차  '사진에 통신사 워터마크가 찍혀 있다. 덮어 칠하고 그 뒤에
  //        있던 것을 그려라'
  //        → **더 또렷해졌다.** 일간스포츠, 엑스포츠뉴스
  //
  //   운영자: "오히려 워터마크가 더 생겼다. 너 돈만 쓰고 이렇게 할래."
  //
  // 그림 모델은 프롬프트에 **나온 낱말을 그리려 든다.** "하지 마라"로
  // 적어도 그렇다. 모자 마크에서 `no Boston B` 를 적었더니 `C` 가
  // 나온 것과 같은 성질이다. 거기서 "금지는 끝이 없다"고 적어 두고도
  // 여기서 또 같은 길을 갔다.
  //
  // 그래서 이 테스트는 **낱말이 있는지**를 본다. 다음에 누가 좋은
  // 뜻으로 "워터마크 금지"를 다시 넣으면 여기서 걸린다.
  const p = RP.repaintPrompt({ name: '김도영' });
  const 부르면_나오는_낱말 = [
    'watermark', 'logo', 'stamp', 'agency', 'caption',
    'overlay', 'credit', 'wordmark', 'lettering',
  ];
  const 남은것 = 부르면_나오는_낱말.filter((w) => new RegExp(w, 'i').test(p));
  assert.deepEqual(
    남은것,
    [],
    `프롬프트에 이 낱말이 있으면 모델이 그것을 **그립니다**: ${남은것.join(', ')}\n` +
      '2026-11-09 에 두 번 해 보고 두 번 다 더 나빠졌습니다. ' +
      'repaint.mjs 의 REPAINT_CLEAN 주석을 읽으세요.'
  );

  // 대신 "면이 매끈하다"는 **긍정문**으로 적는다.
  assert.ok(
    /surfaces are painted smooth and even/.test(p),
    '매끈한 면을 그리라는 긍정문이 없습니다'
  );
});

test('사진의 구도와 자세를 지키라고 적는다', () => {
  // ⚠️ 이게 이 방식을 쓰는 **까닭 전부**다. 구도를 안 지키면 그냥
  //    비싼 그림 생성이고, 팔이 셋인 문제가 그대로 돌아온다.
  const p = RP.repaintPrompt({ name: '김도영' });
  assert.ok(/keep the exact same pose/.test(p));
  assert.ok(/the same composition as the photograph/.test(p));
  assert.ok(/keep both arms and both legs exactly where they are/.test(p));
  // 유니폼은 **바꾸라고 하지 않는다.** 사진에 이미 그 팀 옷이 있다.
  // 색을 바꾸라고 적으면 모델이 엉뚱한 것을 칠한다.
  // ⚠️ 전에는 'keep the uniform ... exactly as they appear in the
  //    photograph' 였다. 그 말이 **사진을 전부 베끼라는 쪽**으로
  //    민다 — 워터마크까지 '사진에 나타난 것'이기 때문이다.
  //    유니폼은 지키되 '사진을 베껴라'는 말은 뺐다.
  assert.ok(/the same uniform and cap in the same colours/.test(p));
  assert.ok(!/as they appear in the photograph/.test(p), '사진을 베끼라는 말이 돌아왔습니다');
});

test('사진 느낌이 남지 않게 적는다', () => {
  // 2026-11-04 운영자: "감독 얼굴이 그냥 얼굴이잖아."
  // 사진 전체를 바탕으로 쓰면 그 함정이 더 크다.
  const p = RP.repaintPrompt({ name: '김도영' });
  for (const must of ['no photographic texture', 'no skin pores', 'no lens blur', 'repainted']) {
    assert.ok(p.includes(must), `사진 느낌을 막는 줄이 빠졌습니다: ${must}`);
  }
});

// ════════════════════════════════════════════════════════════
// 워터마크는 잘라서 없앤다 (2026-11-09)
// ════════════════════════════════════════════════════════════
//
// 운영자: "워터마크는 잘라내라. 100% 나오면 안 된다."
//
// 프롬프트로 두 번 해 봤고 두 번 다 더 나빠졌다. 모델은 프롬프트에
// 나온 낱말을 그린다 — "하지 마라"로 적어도 그렇다.
//
// 그래서 방향을 바꿨다. **모델이 못 보게 한다.** 안 보이면 못 그린다.
section('4-u. 워터마크는 잘라서 없앤다');

const CR = await import('../src/assets/crop.mjs');

test('자르는 식이 비율대로 나온다', () => {
  // ffmpeg 의 crop 은 `너비:높이:x:y` 다. 입력 크기를 미리 몰라도
  // 되도록 iw·ih 로 적는다.
  const f = CR.cropFilter({ top: 0.04, bottom: 0.12, left: 0.04, right: 0.04 });
  assert.equal(f, 'crop=iw*0.9200:ih*0.8400:iw*0.0400:ih*0.0400');
  // 아래를 가장 많이 자른다 — 한국 뉴스 사진의 워터마크가 대개 거기다.
  assert.ok(CR.DEFAULT_CROP.bottom > CR.DEFAULT_CROP.top);
});

test('너무 많이 자르지 않는다 — 사람이 잘린다', () => {
  // ⚠️ 야구 사진은 세로로 꽉 찬 것이 많다. 아래를 20% 넘게 자르면
  //    다리가 날아간다. 워터마크를 지우려다 그림을 버리면 안 된다.
  const d = CR.DEFAULT_CROP;
  assert.ok(d.bottom <= 0.2, `아래를 ${d.bottom * 100}% 자르면 다리가 날아갑니다`);
  const 남는넓이 = (1 - d.left - d.right) * (1 - d.top - d.bottom);
  assert.ok(남는넓이 > 0.7, `${Math.round(남는넓이 * 100)}% 밖에 안 남습니다`);
});

await asyncTest('진짜로 잘라서 data URI 로 돌려준다', async () => {
  // 가짜 사진을 만들어 자르기 자체가 도는지 본다. 네트워크를 안 탄다.
  if (!CR.hasFfmpeg()) return; // ffmpeg 가 없는 곳에서는 건너뛴다
  const { spawnSync } = await import('node:child_process');
  const tmp = path.join(TMP, 'crop-src.png');
  spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'color=c=green:s=600x400', '-frames:v', '1', tmp,
  ]);
  const buf = fs.readFileSync(tmp);

  const r = await CR.cropToDataUri('https://fake/x.png', {
    fetchFn: async () => new Response(buf, { status: 200 }),
  });
  assert.ok(r.cropped, `자르지 못했습니다: ${r.reason}`);
  assert.ok(r.url.startsWith('data:image/png;base64,'), 'data URI 가 아닙니다');

  // 진짜로 잘렸는지 크기를 잰다. 600x400 의 92% x 84% = 552x336.
  const out = path.join(TMP, 'crop-out.png');
  fs.writeFileSync(out, Buffer.from(r.url.split(',')[1], 'base64'));
  const p = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', out],
    { encoding: 'utf8' }
  );
  assert.equal(p.stdout.trim(), '552,336', `잘린 크기가 다릅니다: ${p.stdout.trim()}`);
});

await asyncTest('자르기가 실패해도 그림은 만든다', async () => {
  // ⚠️ 자르기는 **있으면 좋은 것**이다. 여기서 멈추면 그림이 한 장도
  //    안 나온다. 실패하면 원래 주소를 그대로 돌려준다.
  const bad = await CR.cropToDataUri('https://fake/x.png', {
    fetchFn: async () => new Response('', { status: 404 }),
  });
  assert.equal(bad.cropped, false);
  assert.equal(bad.url, 'https://fake/x.png', '실패했는데 원래 주소를 안 돌려줬습니다');

  // 주소가 아니면 아무것도 안 한다.
  const notUrl = await CR.cropToDataUri('스포츠영상/사진/a.jpg');
  assert.equal(notUrl.cropped, false);
});

// ════════════════════════════════════════════════════════════
// 반만 자르면 안 자른 것보다 나쁘다 (2026-11-09)
// ════════════════════════════════════════════════════════════
//
// 고정 12% 로 잘랐더니 박진만은 깨끗했는데 고영표는 **반만 잘렸다.**
// 그 반쪽이 남은 그림에 모델이 커다란 글자를 지어 넣었다.
//
// 운영자: "박진만은 잘 잘렸는데, 고영표는 반만 잘렸다 왜 이러나"
//
// 글자 조각을 보면 모델은 "글자를 그려야 하는 자리"로 읽는다.
// 모자 마크가 C → STL 로 간 것과 같은 성질이다.
section('4-u2. 아래 띠를 재서 자른다');

test('워터마크 밑의 여백 때문에 바닥 줄만 보면 못 잡는다', () => {
  // ⚠️ 처음에 "맨 아랫줄이 시끄러운가"로 짰다가 **아무것도 못 잡았다.**
  //    워터마크는 사진 테두리에 딱 붙어 있지 않고 밑에 여백이 있다.
  const h = 200;
  const noise = new Array(h).fill(0.01); // 조용한 사진
  for (let y = 150; y < 170; y += 1) noise[y] = 0.4; // 글자 띠
  // 170~199 는 여백이라 조용하다 — 바닥 줄은 시끄럽지 않다.
  const band = CR.watermarkBand(noise);
  assert.ok(band !== null, '밑에 여백이 있으면 못 잡습니다 — 바닥 줄만 보면 안 됩니다');
  // 띠 꼭대기(150)부터 바닥까지를 잘라야 한다. (200-150)/200 = 25%
  assert.ok(band > 0.2 && band < 0.3, `띠가 ${(band * 100).toFixed(0)}% 로 나왔습니다`);
});

test('조용한 사진에서는 띠를 만들어내지 않는다', () => {
  assert.equal(CR.watermarkBand(new Array(200).fill(0.01)), null);
});

await asyncTest('큰 워터마크는 더 깊이, 작은 것은 기본만큼 자른다', async () => {
  if (!CR.hasFfmpeg()) return;
  const { spawnSync } = await import('node:child_process');
  const draw = (name, text, size, up) => {
    const f = path.join(TMP, name);
    spawnSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=#3a6b4a:s=800x600',
      '-vf', `drawtext=text='${text}':fontsize=${size}:fontcolor=white:x=(w-tw)/2:y=h-${up}`,
      '-frames:v', '1', f,
    ]);
    return f;
  };

  const big = CR.measureBottom(draw('wm-big.png', 'SPORTS NEWS', 60, 110));
  const small = CR.measureBottom(draw('wm-small.png', 'news1', 22, 34));

  // 큰 것은 기본값보다 깊이 자른다 — 안 그러면 **반만 잘린다.**
  assert.ok(
    big.bottom > CR.DEFAULT_CROP.bottom,
    `큰 워터마크인데 기본값(${CR.DEFAULT_CROP.bottom})만 잘랐습니다: ${big.bottom}`
  );
  // 작은 것도 최소 기본값은 자른다.
  assert.ok(small.bottom >= CR.DEFAULT_CROP.bottom);
  // 둘 다 상한 안이라 그릴 수 있다.
  assert.ok(big.bottom <= CR.MAX_BOTTOM);
});

await asyncTest('너무 깊으면 반만 자르지 않고 아예 안 그린다', async () => {
  // ⚠️ 이것이 이 변경의 핵심이다. 깨끗이 못 자를 바에는 **안 그린다.**
  //    반쪽이 남은 그림을 받느니 사진을 바꾸는 쪽이 싸고 확실하다.
  if (!CR.hasFfmpeg()) return;
  const { spawnSync } = await import('node:child_process');
  const f = path.join(TMP, 'wm-deep.png');
  spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=#3a6b4a:s=800x600',
    '-vf', "drawtext=text='WATERMARK':fontsize=70:fontcolor=white:x=(w-tw)/2:y=h-220",
    '-frames:v', '1', f,
  ]);
  const m = CR.measureBottom(f);
  assert.ok(m.bottom > CR.MAX_BOTTOM, `상한(${CR.MAX_BOTTOM})을 안 넘었습니다: ${m.bottom}`);

  const buf = fs.readFileSync(f);
  const r = await CR.cropToDataUri('https://fake/deep.png', {
    fetchFn: async () => new Response(buf, { status: 200 }),
  });
  assert.equal(r.cropped, false);
  assert.equal(r.needsNewPhoto, true, '사진을 바꿔 달라고 말하지 않았습니다');
  assert.equal(r.url, 'https://fake/deep.png');
});

test('기획 파일에서 사진마다 자르기를 못 박을 수 있다', () => {
  // ⚠️ 재는 쪽은 **진짜 사진에서 잘 못 잡는다**(2026-11-09 고영표 #76).
  //    단색 바탕에서는 글자가 튀지만, 스포츠 사진은 어디나 복잡해서
  //    워터마크가 변화량으로 안 튄다. 내가 쓴 테스트가 단색이었던 것이
  //    바로 그 함정이었다.
  //
  // 그래서 사람이 **자른 사진을 눈으로 보고** 숫자를 적는 길을 둔다.
  const { jobs } = RP.repaintJobs([
    {
      name: '고영표',
      photos: [
        { url: 'https://a/1.jpg', 쓰임: '투구', 아래: 0.22 },
        { url: 'https://a/2.jpg', 쓰임: '더그아웃' },
      ],
    },
  ]);
  assert.equal(jobs.length, 2);
  assert.equal(jobs.find((j) => j.쓰임 === '투구').아래, 0.22);
  assert.equal(jobs.find((j) => j.쓰임 === '더그아웃').아래, null);
});

test('못 박은 자르기로 실제로 자른다', () => {
  // 못 박았으면 재지 않는다 — 사람이 보고 적은 값이 추측보다 정확하다.
  const f = CR.cropFilter({ top: 0.04, bottom: 0.22, left: 0.04, right: 0.04 });
  assert.equal(f, 'crop=iw*0.9200:ih*0.7400:iw*0.0400:ih*0.0400');
});

await asyncTest('자른 사진을 꺼내 볼 수 있게 돌려준다', async () => {
  // 내가 그림을 못 보므로, 자르기가 모자란 것인지 모델이 지어낸 것인지
  // 가를 길은 **모델이 본 사진을 사람이 보는 것**뿐이다.
  if (!CR.hasFfmpeg()) return;
  const { spawnSync } = await import('node:child_process');
  const tmp = path.join(TMP, 'crop-png-src.png');
  spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'color=c=navy:s=640x480', '-frames:v', '1', tmp,
  ]);
  const r = await CR.cropToDataUri('https://fake/z.png', {
    fetchFn: async () => new Response(fs.readFileSync(tmp), { status: 200 }),
  });
  assert.ok(r.cropped);
  assert.ok(Buffer.isBuffer(r.png), '자른 사진을 안 돌려줬습니다');
  assert.ok(r.png.length > 100);
});

test('로그가 실제로 자른 값을 말한다', () => {
  // ⚠️ #76 에서 로그가 "아래 9% 를 자릅니다" 라고 했는데 실제로는
  //    기본값 12% 를 잘랐다. want 를 적고 max(fallback, want) 를
  //    자르고 있었다. 로그가 거짓말을 하면 디버깅이 거짓말 위에서 돈다.
  const noise = new Array(200).fill(0.01);
  for (let y = 190; y < 196; y += 1) noise[y] = 0.4; // 아주 얕은 띠
  const band = CR.watermarkBand(noise);
  assert.ok(band !== null && band < CR.DEFAULT_CROP.bottom, `띠 ${band}`);
  // 얕은 띠라도 기본값만큼은 자른다 — 그리고 로그가 그 값을 말해야 한다.
});

section('4-w. 체격은 숫자로 적는다');

// ── 무엇을 잡는가 ──
//
// 해로운 것은 **몸 전체를 느낌말 하나로 뭉뚱그리는 것**이다.
//
//   ❌ "a heavy thick build"          → 모델이 비만으로 읽는다
//   ❌ "a lean build with ..."        → 말라깽이가 된다
//   ✅ "narrow shoulders and thin forearms"   → 부위가 적혀 있다
//   ✅ "193cm tall and about 102kg"           → 숫자가 있다
//
// 부위에 붙은 말은 모델이 그릴 자리가 분명해서 극단으로 안 간다.
// 그래서 `<느낌말> build/body/frame/physique` 꼴만 잡는다.
// ⚠️ 목록을 **실제로 터진 말**로만 좁혔다. 'solid build'(감독),
//    'compact build' 같은 것은 지금까지 문제를 일으킨 적이 없다.
//    넓게 막으면 걸리는 게 많아져서 결국 목록을 꺼 버리게 된다.
const 체격말 = [
  'heavy', 'thick', 'stocky', 'chubby', 'fat', 'obese', 'overweight',
  'lean', 'wiry', 'skinny', 'slim', 'slender', 'bulky', 'huge', 'massive',
];
// 몸 전체를 가리키는 말. 이 앞에 느낌말이 붙으면 잡는다.
const 전체말 = '(build|body|physique|figure)';
// 숫자가 붙어 있으면 괜찮다.
const 숫자있나 = (t) => /\d{2,3}\s?(cm|kg)/.test(t);

test('기획 파일의 체격 말에는 숫자가 붙어 있다', () => {
  const base = decodeURIComponent(new URL('../../스포츠영상/', import.meta.url).pathname);
  if (!fs.existsSync(base)) return;
  const files = fs.readdirSync(base).filter((f) => /^\d+화\.json$/.test(f));
  assert.ok(files.length >= 3, `기획 파일이 ${files.length}개뿐입니다`);
  const 걸린것 = [];
  for (const f of files) {
    const people = JSON.parse(fs.readFileSync(path.join(base, f), 'utf8')).people || [];
    for (const p of people) {
      const look = String(p.look || '');
      // "<느낌말> build/body/frame" 꼴만 잡는다. 사이에 다른 꾸밈말이
      // 하나쯤 끼는 것도 받는다 — "a heavy thick build" 가 그 꼴이다.
      const 쓴말 = 체격말.filter((w) =>
        new RegExp(`\\b${w}\\b(\\s+\\w+)?\\s+${전체말}\\b`, 'i').test(look)
      );
      if (!쓴말.length) continue;
      // 같은 문장 안에 키나 몸무게가 있으면 통과다.
      if (숫자있나(look) || 숫자있나(String(p.role || ''))) continue;
      걸린것.push(`${f} ${p.name}: "${쓴말.join(', ')}" 에 숫자가 없습니다`);
    }
  }
  assert.equal(
    걸린것.length,
    0,
    '체격을 느낌말로만 적었습니다. 키·몸무게를 찾아 적거나, 못 찾으면 ' +
      '체격 말을 빼고 얼굴·머리·수염으로 가르세요:\n  ' + 걸린것.join('\n  ')
  );
});

await asyncTest('올러와 네일을 키가 아니라 두께로 가른다', async () => {
  // ⚠️ 둘 다 **193cm 로 키가 같다**(baseball-reference 6-4).
  //    네일 83kg(185lbs), 올러 102kg(225lbs). 키로 가르려 하면
  //    모델이 한 명을 작게 그리거나 한 명을 뚱뚱하게 그린다.
  const p = decodeURIComponent(
    new URL('../../스포츠영상/10화.json', import.meta.url).pathname
  );
  if (!fs.existsSync(p)) return;
  const people = JSON.parse(fs.readFileSync(p, 'utf8')).people || [];
  const 네일 = people.find((x) => x.name === '네일');
  const 올러 = people.find((x) => x.name === '올러');
  assert.ok(네일 && 올러, '네일과 올러가 있어야 합니다');
  for (const [이름, x] of [['네일', 네일], ['올러', 올러]]) {
    assert.ok(/193cm/.test(x.look), `${이름} 의 look 에 키가 없습니다`);
    assert.ok(/\d{2,3}kg/.test(x.look), `${이름} 의 look 에 몸무게가 없습니다`);
  }
  assert.ok(/83kg/.test(네일.look), '네일은 83kg 입니다');
  assert.ok(/102kg/.test(올러.look), '올러는 102kg 입니다');
  // 돼지를 만든 두 문장이 돌아오면 안 된다.
  assert.ok(!/heavy thick/.test(올러.look), '"heavy thick" 이 돌아왔습니다');
  assert.ok(
    !/covering the jaw/.test(올러.look),
    '"covering the jaw" 가 돌아왔습니다 — 산적 수염이 나옵니다'
  );
});

await asyncTest('빠진 팔다리와 비만을 막는다', async () => {
  // 2026-11-09 운영자가 본 것 둘이다.
  //   "이 돼지는 누구인가"        → 비만 체형
  //   "외팔이에 뭔가 이상하다"    → 글러브 낀 팔이 통째로 없다
  //
  // ⚠️ 9화에서 팔이 셋 나온 걸 고치면서 `no extra arms`(더 많은 것)만
  //    적었다. **빠진 것**은 안 막혀 있었다. 한쪽만 본 것이다.
  const V9 = await import('../src/scenes/visuals.mjs');
  const p = V9.composeImagePrompt('a pitcher', 'present', { kind: 'SPORTS' });
  for (const must of [
    'no missing arm',      // 빠진 팔
    'no one-armed figure', // 외팔이
    'both arms are drawn', // 둘 다 그린다
    'the glove arm',       // 야구는 글러브 팔을 잊는다
    'no obese',            // 비만
    'no large belly',
    'no long bushy lumberjack beard', // 산적 수염
    'never both feet in the', // 두 발이 다 뜨는 것
  ]) {
    assert.ok(p.includes(must), `금지·지시가 빠졌습니다: ${must}`);
  }
  // 팔이 셋인 것도 그대로 막혀 있어야 한다. 한쪽을 고치다 다른 쪽을
  // 잃으면 9화의 문제가 돌아온다.
  assert.ok(p.includes('no third arm'), '팔이 셋인 것을 막던 줄이 사라졌습니다');
  assert.ok(p.includes('no extra arms'), '팔이 더 많은 것을 막던 줄이 사라졌습니다');
});

await asyncTest('모자와 가슴에 글자를 그리라고 하지 않는다', async () => {
  // ── 세 번 틀렸다. 세 번째에 까닭을 알았다 (2026-11-09) ──
  //
  //   1차  미국 구단 셋을 이름으로 막았다 → 모델이 **C** 를 가져왔다
  //   2차  "한 글자 모노그램 금지" 로 고쳤다 → **STL** 이 나왔다
  //   3차  운영자: "아직도 그대로다" — 고영표 가슴에 "읽가ㅅㅍ大"
  //
  // 세 번째에 코드를 읽고 알았다. **flux-schnell 과 flux-dev 는
  // negative_prompt 를 아예 안 받는다.** replicate.mjs 의 input() 을
  // 보면 그 칸이 없다. 그래서 composeImagePrompt 가 만든 금지 목록은
  // 프롬프트 **본문 끝에 그대로 이어 붙어** 모델에게 갔다.
  //
  // 모델이 받은 것은 이랬다:
  //   "... no interlocking NY, no Dodgers script, no Boston B,
  //    no Cincinnati C, no Chicago C ..."
  //
  // 금지로 읽히지 않는다. **낱말 목록으로 읽힌다.** 그래서 막을수록
  // 더 나왔다. 목록이 길어질수록 더.
  //
  // 그리고 가슴은 금지도 아니었다 — 내가 'the team wordmark across the
  // chest ... legible' 이라고 **그리라고** 적어 뒀다. Flux 는 한글을
  // 못 쓰니 글자꼴만 나온다.
  //
  // 그래서 글자 이야기를 전부 들어냈다. 선수를 알아보게 하는 것은
  // **색과 등번호**다. 숫자는 한두 자리라 모델이 제대로 그린다.
  const V10 = await import('../src/scenes/visuals.mjs');
  const p = V10.composeImagePrompt('a manager', 'present', { kind: 'SPORTS' });

  // ⚠️ 이 목록에 낱말을 **다시 넣지 마라.** 넣으면 그려진다.
  const 부르면_그리는_낱말 = [
    'wordmark', 'lettering', 'monogram', 'watermark', 'caption',
    'subtitle', 'sponsor', 'Major League Baseball',
    'Dodgers', 'Yankees', 'Boston', 'Cincinnati', 'Chicago', 'STL',
  ];
  const 남은것 = 부르면_그리는_낱말.filter((w) => new RegExp(w, 'i').test(p));
  assert.deepEqual(
    남은것,
    [],
    `프롬프트에 이 낱말이 있으면 모델이 **그립니다**: ${남은것.join(', ')}\n` +
      'flux-schnell·dev 는 negative_prompt 를 안 받습니다 — "no X" 도 본문으로 갑니다.'
  );

  // 대신 무엇을 그릴지로 적는다.
  // ⚠️ 2026-11-11. 전에는 "그 구단의 마크를 올려라" 였다. 모델은 KIA 를
  //    **모르므로** 아는 것을 가져왔다 — 모자에 B, K, R 이 차례로 나왔다.
  //    마크 이야기를 아예 안 한다. 모자는 한 색으로 칠한 천이다.
  assert.ok(
    /the cap is plain fabric in one solid colour all over/.test(p),
    '모자를 민무늬로 적은 줄이 없습니다'
  );
  assert.ok(!/mark of the Korean/.test(p), '아직 마크를 그리라고 시키고 있습니다');
  assert.ok(
    /the front of the jersey is smooth plain fabric/.test(p),
    '가슴이 민무늬라고 적은 줄이 없습니다'
  );
  // 뒤에서 알아보는 길은 등번호다. 그건 살아 있어야 한다.
  assert.ok(/the number across the back/.test(p), '등번호 지시가 사라졌습니다');
});

test('리페인트도 가슴을 민무늬로 다시 그린다', () => {
  // ⚠️ 리페인트는 uniforms.mjs 도 스타일 꼬리도 **안 쓴다.** 그래서
  //    거기를 고쳐도 이 경로는 안 고쳐진다. 한 번 그렇게 착각해서
  //    커밋 메시지에 원인을 잘못 적었다(2026-11-09).
  //
  // 이 경로에서 글자가 나오는 까닭은 다르다 — REPAINT_KEEP 이 "구도를
  // 그대로 두라"고 세게 미니까, 원본 사진 가슴에 있던 것(워터마크든
  // 재킷 글자든)을 모델이 베낀다. Flux 는 한글을 못 쓰니 베끼면 반드시
  // 글자꼴만 남는다.
  //
  // 그래서 가슴만 예외로 둔다. 색은 지키고 무늬는 안 지킨다.
  const p = RP.repaintPrompt({ name: '고영표' });
  assert.ok(
    /the front of the jersey and jacket is smooth plain fabric/.test(p),
    '가슴 민무늬 지시가 없습니다 — 원본 사진의 가슴 글자를 베낍니다'
  );
  assert.ok(/carrying nothing across the chest/.test(p));
  // 색과 등번호는 지켜야 한다. 그게 선수를 말해 주는 것이다.
  assert.ok(/the same uniform and cap in the same colours/.test(p));
  assert.ok(/the same jersey number/.test(p));
  // ⚠️ 긍정문이어야 한다. 낱말을 부르면 그린다.
  for (const w of ['watermark', 'logo', 'wordmark', 'lettering']) {
    assert.ok(!new RegExp(w, 'i').test(p), `"${w}" 가 있습니다 — 부르면 그립니다`);
  }
});

await asyncTest('photos 만 적힌 사람도 본편에서 얼굴 참조를 잃지 않는다', async () => {
  // ── 하마터면 조용히 망가질 뻔했다 (2026-11-09) ──
  //
  // 기획 파일에 사진을 적는 모양이 둘이다. 옛 모양 `photo` 와, 리페인트를
  // 만들면서 들인 새 모양 `photos: [{url, 쓰임}]` 이다.
  //
  // 그런데 **새 모양은 리페인트만 읽었다.** 본편 그림·인물 시트·화풍
  // 미리보기·소재 레코드·닮음 판정은 전부 `photo` 만 봤다.
  //
  // 11화 사람 다섯의 photo 를 photos 로 바꾸면서 그걸 몰랐다. 그대로
  // 돌렸으면 그 다섯의 **얼굴 참조가 통째로 사라졌을 것이다.** 그리고
  // 오류는 안 난다 — 그림은 멀쩡히 나오고 얼굴만 남의 얼굴이 된다.
  // 그림을 못 보는 나로서는 알아챌 길이 없는 종류의 고장이다.
  //
  // 그래서 읽는 자리를 photo-of.mjs 하나로 모았다. 여기서 못 박는다.
  const PO = await import('../src/assets/photo-of.mjs');

  // 두 모양 다 읽는다.
  assert.equal(PO.photoOf({ photo: 'https://a/1.jpg' }), 'https://a/1.jpg');
  assert.equal(PO.photoOf({ photos: [{ url: 'https://b/1.jpg' }] }), 'https://b/1.jpg');
  assert.equal(PO.photoOf({}), '');
  // 예비도 마찬가지다.
  assert.equal(PO.sparePhotoOf({ photo_예비: 'https://a/2.jpg' }), 'https://a/2.jpg');
  assert.equal(
    PO.sparePhotoOf({ photos: [{ url: 'https://b/1.jpg' }, { url: 'https://b/2.jpg' }] }),
    'https://b/2.jpg'
  );

  // ⚠️ 그리고 **읽는 자리마다** 이걸 쓰는지 본다. 한 군데라도 String(p.photo)
  //    로 돌아가면 그 경로에서만 조용히 얼굴이 빠진다.
  const 읽는곳 = [
    'src/model.mjs', 'src/assets/portrait.mjs', 'src/assets/preview.mjs',
    'src/assets/images.mjs', 'src/scenes/visuals.mjs', 'src/main.mjs',
  ];
  for (const f of 읽는곳) {
    const code = fs.readFileSync(new URL(`../${f}`, import.meta.url).pathname, 'utf8');
    // 주석은 뺀다 — 설명에 적힌 것까지 잡으면 못 쓴다.
    const 알맹이 = code.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const 날것 = 알맹이.match(/String\(p[?]?\.photo(_예비)?\s*\|\|/g) || [];
    assert.deepEqual(
      날것,
      [],
      `${f} 가 photo 를 직접 읽습니다 (${날것.length}군데). ` +
        'photo-of.mjs 의 photoOf/sparePhotoOf 를 쓰세요 — ' +
        'photos 로만 적힌 사람의 얼굴이 조용히 빠집니다.'
    );
  }
});

await asyncTest('구단 표에도 글자 이야기가 없다', async () => {
  // uniforms.mjs 의 열 팀이 전부 'white jersey with black lettering'
  // 꼴이었다. 그것도 가슴 글자의 범인이다 — 색으로만 적는다.
  const U = await import('../src/scenes/uniforms.mjs');
  for (const [key, u] of Object.entries(U.KBO_UNIFORMS)) {
    for (const w of ['lettering', 'wordmark', 'logo', 'text']) {
      assert.ok(
        !new RegExp(w, 'i').test(`${u.jersey} ${u.cap}`),
        `${key} 에 "${w}" 가 있습니다 — Flux 는 글자를 못 씁니다. 색으로 적으세요.`
      );
    }
    // 색은 반드시 있어야 한다. 그게 팀을 말해 주는 유일한 수단이다.
    assert.ok(u.jersey.length > 20 && u.cap, `${key} 의 색 설명이 부실합니다`);
  }
});

await asyncTest('유니폼 문장이 가슴을 민무늬로 못 박는다', async () => {
  const U = await import('../src/scenes/uniforms.mjs');
  const c = U.uniformClause({ team: 'KT', number: '1' });
  assert.ok(/smooth plain fabric/.test(c), '가슴 민무늬 지시가 없습니다');
  // 등번호는 살아 있어야 한다 — 뒤에서 선수를 알아보는 유일한 길이다.
  assert.ok(/the number 1 in large/.test(c), '등번호가 사라졌습니다');
});

await asyncTest('상체와 하체가 한 동작이다', async () => {
  // 2026-11-09 운영자: "동작도 이상한데..."
  //
  // 상체는 공을 던지는데 하체는 두 발을 벌리고 **그냥 서 있는** 그림이
  // 나왔다. '자세'를 한 덩어리로만 적으면 모델이 상체에만 적용한다.
  const V12 = await import('../src/scenes/visuals.mjs');
  const p = V12.composeImagePrompt('a pitcher', 'present', { kind: 'SPORTS' });
  assert.ok(/whole body is in one single action/.test(p));
  assert.ok(
    /never a throwing upper body on legs that merely stand still/.test(p),
    '위아래가 따로 노는 것을 막는 줄이 없습니다'
  );
});

await asyncTest('어려운 동작보다 사진 자세를 고르라고 적는다', async () => {
  // 2026-11-09 운영자: "이런 샷이 안 되겠으면 전달해 준 이미지 중에
  //                     하나를 차라리 워터마크 빼고 지브리로 그려라."
  //
  // 한창 돌아가는 중간을 고르면 팔이 꺾이고 하체가 따로 논다.
  // **정적인 자세라도 어색한 동작보다 낫다.**
  const V13 = await import('../src/scenes/visuals.mjs');
  const sys = V13.visualsSystemFor('SPORTS', { people: [{ name: 'a', look: 'b' }] });
  assert.ok(/워터마크 빼고/.test(sys), '운영자 말이 설계 규칙에 없습니다');
  assert.ok(/어색한 동작보다/.test(sys), '정적이라도 낫다는 줄이 없습니다');
  assert.ok(/세트.*포지션|공을 놓기 직전/.test(sys), '고를 자세 예가 없습니다');

  // ⚠️ **반쪽만 들으면 안 된다.** 2026-11-09 운영자의 말은 두 쪽이다.
  //
  //   "전달해 준 이미지를 최대한 활용할 수 있는 건 활용해 그리되,
  //    없는 장면 중에 중요 장면은 그린다."
  //
  // 앞쪽만 들으면 영상이 전부 가만히 선 사람이 되고, 뒤쪽만 들으면
  // 팔이 꺾인다. 둘 다 적혀 있어야 한다.
  assert.ok(/최대한 활용/.test(sys), '사진을 쓰라는 쪽이 없습니다');
  assert.ok(
    /중요 장면은 그린다/.test(sys),
    '사진에 없어도 중요하면 그리라는 쪽이 없습니다 — 영상이 전부 정적이 됩니다'
  );
  assert.ok(/멈추는 자리/.test(sys), '움직임을 그릴 때 멈추는 자리를 고르라는 줄이 없습니다');
});

await asyncTest('좌우가 같아야 한다 — 양말 짝짝이', async () => {
  // 2026-11-09 운영자: "양말 색이 짝짝이다"
  //
  // 뒷모습 샷에서 한쪽은 남색 양말인데 다른 쪽은 빨간 바지가 그대로
  // 발목까지 내려와 있었다. 유니폼 **색**은 적어 뒀는데 **양쪽이
  // 같아야 한다**는 말이 없어서 다리를 따로 그렸다.
  const V11 = await import('../src/scenes/visuals.mjs');
  const p = V11.composeImagePrompt('x', 'present', { kind: 'SPORTS' });
  for (const must of [
    'both socks the same colour',
    'both shoes the same colour',
    'both sleeves the same length',
    'never one leg bare where the other has a sock',
  ]) {
    assert.ok(p.includes(must), `좌우 대칭 지시가 빠졌습니다: ${must}`);
  }
});

section('4-x. 나레이션 속도는 종류마다 다르다');

const NR = await import('../src/narration.mjs');

test('스포츠 속도는 실제로 잰 값이다', () => {
  // ── 실행 #70 · 11화 한국시리즈에서 쟀다 ──
  //
  //   나레이션 글자    2,752자  (태그를 뗀 문단 합계)
  //   실제 TTS 길이    439.46초
  //   말하기 속도      1.08     (SPORTS_SPEAKING_RATE)
  //
  // 이 테스트가 지키는 것은 **잰 값과 코드가 맞는다**는 것이다.
  // 숫자를 눈대중으로 바꾸면 여기서 걸린다.
  const 글자 = 2752;
  const 실제초 = 439.46;
  const 잰값 = (글자 / 실제초) * 60;
  assert.ok(
    Math.abs(NR.SPORTS_NARRATION_CHARS_PER_MINUTE - 잰값) < 1,
    `잰 값은 ${잰값.toFixed(1)}자/분인데 코드는 ${NR.SPORTS_NARRATION_CHARS_PER_MINUTE} 입니다`
  );
  // 그 값으로 다시 재면 실제와 1초 안쪽으로 맞아야 한다.
  const 다시 = NR.secondsForChars(글자, 'SPORTS');
  assert.ok(
    Math.abs(다시 - 실제초) < 1,
    `${다시.toFixed(2)}초로 재는데 실제는 ${실제초}초입니다`
  );
});

test('종류를 안 넘기면 전과 똑같이 돈다', () => {
  // kind 를 모르는 자리가 있다. 거기서 동작이 바뀌면 안 된다.
  assert.equal(NR.charsPerMinuteFor(null), NR.NARRATION_CHARS_PER_MINUTE);
  assert.equal(NR.charsPerMinuteFor(undefined), NR.NARRATION_CHARS_PER_MINUTE);
  assert.equal(NR.charsPerMinuteFor('EVENT'), NR.NARRATION_CHARS_PER_MINUTE);
  assert.equal(NR.charsPerMinuteFor('TALE'), NR.NARRATION_CHARS_PER_MINUTE);
  assert.equal(NR.secondsForChars(330), 60);
  assert.equal(NR.charsForMinutes(8), 2640);
});

test('스포츠는 같은 분량에 글자가 더 들어간다', () => {
  // 중계 톤으로 빠르게 읽으니 8분에 더 많은 글자가 들어간다.
  // 이 차이를 안 보면 스포츠 대본을 1.14배로 길게 재고, 그 경고를
  // 따라 내용을 과하게 깎는다. 11화에서 실제로 그랬다.
  assert.ok(
    NR.charsForMinutes(8, 'SPORTS') > NR.charsForMinutes(8),
    '스포츠가 기본보다 글자를 더 받아야 합니다'
  );
  const 배 = NR.SPORTS_NARRATION_CHARS_PER_MINUTE / NR.NARRATION_CHARS_PER_MINUTE;
  assert.ok(배 > 1.1 && 배 < 1.2, `어긋남이 ${배.toFixed(3)}배입니다 — 다시 재야 합니다`);
});

await asyncTest('말하기 속도와 글자 속도가 짝으로 움직인다', async () => {
  // ⚠️ SPORTS_NARRATION_CHARS_PER_MINUTE 는 **말하기 속도 1.08 에
  //    묶여 있다.** 한쪽만 바꾸면 길이가 다시 어긋난다. 둘이 같이
  //    움직여야 한다는 것을 여기서 못 박는다.
  const TTS = await import('../src/audio/tts.mjs');
  assert.equal(
    TTS.SPORTS_SPEAKING_RATE,
    1.08,
    '말하기 속도가 바뀌었습니다 — 글자/분도 다시 재야 합니다'
  );
});

await asyncTest('장면과 문단 길이가 종류별 속도를 쓴다', async () => {
  // narration.mjs 만 고치고 호출하는 쪽에 kind 를 안 넘기면 아무것도
  // 바뀌지 않는다. 실제로 흘러가는지 본다.
  const { splitIntoScenes } = await import('../src/scenes/split.mjs');
  const p = decodeURIComponent(
    new URL('../../스포츠영상/11화-대본.md', import.meta.url).pathname
  );
  const j = decodeURIComponent(
    new URL('../../스포츠영상/11화.json', import.meta.url).pathname
  );
  if (!fs.existsSync(p) || !fs.existsSync(j)) return;
  const sections = JSON.parse(fs.readFileSync(j, 'utf8')).sections;
  const md = fs.readFileSync(p, 'utf8');
  const sports = splitIntoScenes(md, { kind: 'SPORTS', sections });
  const plain = splitIntoScenes(md, { sections });
  assert.ok(
    sports.stats.totalSeconds < plain.stats.totalSeconds,
    `종류가 길이에 안 먹습니다 (스포츠 ${sports.stats.totalSeconds} / 기본 ${plain.stats.totalSeconds})`
  );
  // 실제 TTS 가 439.46초였다. 10초 안쪽으로 맞아야 한다.
  assert.ok(
    Math.abs(sports.stats.totalSeconds - 439.46) < 10,
    `${sports.stats.totalSeconds}초로 재는데 실제는 439.46초였습니다`
  );
});

await asyncTest('시작이 약한 쇼츠보다 조금 겹치는 쇼츠를 먼저 쓴다', async () => {
  // ⚠️ 속도를 고치니 문단이 짧아지고 쇼츠 창이 밀렸다. 그 바람에
  //    3화 8순위가 "이 군 성적이 일 군 성적을 보장하지 않기 때문입니다"
  //    로 시작했다 — 물음에 대한 **답**에서 시작한 셈이다.
  //
  // openingScore 의 -45 벌점으로는 부족했다. 후보가 넉넉하지 않으면
  // 벌점을 받고도 뽑힌다 — 결말 문단에서 이미 겪은 그대로다.
  //
  // 그래서 채우는 순서를 바꿨다. **시작을 먼저 보고 겹침을 나중에
  // 본다.** 겹치는 것은 두 편을 본 사람만 손해지만, 시작이 약한 것은
  // 그 한 편을 본 사람 모두가 손해다.
  const S = await import('../src/video/shorts.mjs');
  const src = fs.readFileSync(
    decodeURIComponent(new URL('../src/video/shorts.mjs', import.meta.url).pathname),
    'utf8'
  );
  // 단단한 시작을 두 번 먼저 채우고, 그다음에 약한 시작을 받는가.
  const order = [...src.matchAll(/fill\(([\d.]+)(?:,\s*\{\s*allowWeakStart:\s*(\w+)\s*\})?\)/g)]
    .map((m) => ({ limit: Number(m[1]), weak: m[2] !== 'false' }));
  assert.ok(order.length >= 3, `채우는 단계가 ${order.length}개뿐입니다`);
  assert.equal(order[0].weak, false, '첫 단계가 약한 시작을 받습니다');
  assert.equal(order[1].weak, false, '둘째 단계가 약한 시작을 받습니다');
  assert.ok(
    order.some((x) => x.weak),
    '약한 시작을 아예 못 받으면 짧은 편에서 개수를 못 채웁니다'
  );
  assert.ok(S.BACK_REFERENCE.includes('이 군'));
});

section('4-y. 야구 대본에서 틀렸던 읽기');

const RN = await import('../src/audio/speech.mjs');

test('점수의 하이픈을 "대" 로 읽는다', () => {
  // 전에는 "팔-영" 이 돼서 음성이 그 자리를 그냥 지나갔다. 야구 영상은
  // 점수가 계속 나오니 매 편에서 어색해진다.
  assert.equal(
    RN.speechText('1차전은 빠르게 8-0으로 앞섰습니다.'),
    '일차전은 빠르게 팔 대 영으로 앞섰습니다.'
  );
  assert.equal(RN.speechText('삼성이 3-2로 이겼습니다.'), '삼성이 삼 대 이로 이겼습니다.');
  // 0 이 앞에 와도 읽는다.
  assert.ok(/영 대 팔/.test(RN.speechText('0-8로 뒤진 7회초')));
});

test('문장의 쉼표를 숫자로 먹지 않는다', () => {
  // ⚠️ 이게 이 묶음에서 가장 고약했다. 숫자 꼴이 `\d[\d,]*` 라서
  //    "5-1," 의 쉼표까지 숫자로 삼켰다. 쉼표가 사라지면 두 경기가
  //    한 덩어리로 붙어 무슨 말인지 알 수 없게 된다.
  const out = RN.speechText('3차전 5-1, 4차전 10-5, 5차전 12-1입니다.');
  assert.equal(out, '삼차전 오 대 일, 사차전 십 대 오, 오차전 십이 대 일입니다.');
  assert.ok(!/일사차전/.test(out), '쉼표가 사라져 두 경기가 붙었습니다');
  // 자릿점은 **세 자리 묶음일 때만** 받는다. 이건 그대로 읽어야 한다.
  assert.ok(
    // ⚠️ 2026-11-10 에 '만' 을 붙여 읽게 바꿨다("백 만 관중" → "백만 관중").
    //    그래서 여기도 "구천칠백이십삼 만" 이 아니라 붙은 꼴이 맞다.
    /구천칠백이십삼만/.test(RN.speechText('143억 9,723만 원')),
    '자릿점이 든 금액을 못 읽습니다'
  );
});

test('번을 횟수로도 순번으로도 읽는다', () => {
  // 야구에서 '번' 은 두 가지로 쓰인다. 바로 뒤에 오는 말이 둘을 가른다.
  //
  //   횟수   "3번뿐"    → 세 번뿐      (고유어)
  //   순번   "1번 타자" → 일번 타자    (한자어)
  assert.ok(
    /세 번뿐/.test(RN.speechText('90승을 넘긴 일은 3번뿐이에요.')),
    '횟수를 고유어로 안 읽습니다'
  );
  // ⚠️ 조건 없이 고유어로 넣었다가 되돌렸다 — "1번 타자"가 "한 번
  //    타자"가 된다. 야구 대본에 자주 나오는 말이라 매 편에서 틀린다.
  assert.ok(
    /일번 타자/.test(RN.speechText('1번 타자로 나선 최원준')),
    '타순을 고유어로 읽었습니다'
  );
  assert.ok(!/한 번 타자/.test(RN.speechText('1번 타자로 나선 최원준')));
  // 서수와 등번호도 한자어다.
  assert.ok(/삼십팔번째/.test(RN.speechText('역대 38번째 기록입니다.')));
  assert.ok(/삼십오번/.test(RN.speechText('등번호 35번입니다.')));
});

test('분수 뒤가 한글이면 띄운다', () => {
  // "3분의 1이닝" 이 "삼분의 일이닝" 이 되면 음성이 '일이닝' 을 한
  // 덩어리로 읽는다. ⑤ 정수가 하는 것과 같은 일을 분수에서도 한다.
  const out = RN.speechText('2와 3분의 1이닝 1실점.');
  assert.ok(/삼분의 일 이닝/.test(out), `이닝이 붙어 있습니다: ${out}`);
});

test('MVP 를 한글로 읽는다', () => {
  // 자막은 MVP 그대로, 읽기는 엠브이피다. 그냥 두면 영어로 읽는다.
  assert.ok(/엠브이피/.test(RN.speechText('5차전 MVP를 받았습니다.')));
  // 자막에는 영문이 남아야 한다 — 바꾸는 건 읽기뿐이다.
  assert.ok(RN.PRONOUNCE.has('MVP'));
});

test('11화 대본을 다 읽어도 영어 글자가 안 남는다', () => {
  // 읽을 글에 영어가 남으면 음성이 철자로 읽거나 건너뛴다. 대본
  // 전체를 넣어 한 줄도 안 남는지 본다 — 새 약어가 나올 때마다
  // 여기서 잡힌다.
  const p = decodeURIComponent(
    new URL('../../스포츠영상/11화-대본.md', import.meta.url).pathname
  );
  if (!fs.existsSync(p)) return;
  const lines = fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => /^\[(FACT|THEORY)\]/.test(l))
    .map((l) => l.replace(/^\[(FACT|THEORY)\]\s*/, ''));
  assert.ok(lines.length > 50, '대본이 너무 짧습니다');
  for (const l of lines) {
    const spoken = RN.speechText(l);
    assert.ok(
      !/[A-Za-z]/.test(spoken),
      `읽을 글에 영어가 남았습니다: ${spoken.match(/[A-Za-z]+/)?.[0]} — ${l.slice(0, 50)}`
    );
  }
});

section('4-z. 유니폼은 코드가 적는다');

const U = await import('../src/scenes/uniforms.mjs');
const UV = await import('../src/scenes/visuals.mjs');
const UM = await import('../src/model.mjs');
const 스포츠영상 = (f) =>
  decodeURIComponent(new URL(`../../스포츠영상/${f}`, import.meta.url).pathname);

test('팀 이름을 어떻게 적어도 찾는다', () => {
  // 기획 파일에 뭐라고 적힐지 모른다. 대본은 자막용으로 'KIA' 라고
  // 쓰고 읽기용으로 '기아' 로 바꾸므로(PRONOUNCE) 둘 다 올 수 있다.
  for (const given of ['KIA', '기아', 'KIA 타이거즈', 'kia tigers', '타이거즈']) {
    assert.equal(U.teamKey(given), 'KIA', `${given} 를 못 찾았습니다`);
  }
  assert.equal(U.teamKey('한화 이글스'), '한화');
  assert.equal(U.teamKey('두산 베어스'), '두산');
  // 모르는 팀은 빈 값이다. 지어내지 않는다.
  assert.equal(U.teamKey('뉴욕 양키스'), '');
  assert.equal(U.teamKey(''), '');
  assert.equal(U.teamKey(undefined), '');
});

test('KBO 열 팀이 다 있고, 어디서 온 값인지 적혀 있다', () => {
  const keys = Object.keys(U.KBO_UNIFORMS);
  assert.equal(keys.length, 10, 'KBO 는 열 팀입니다');
  for (const k of keys) {
    const u = U.KBO_UNIFORMS[k];
    assert.ok(u.ko && u.jersey && u.cap && u.numberColour, `${k} 칸이 비었습니다`);
    // ⚠️ 색을 지어내지 않기 위한 칸이다. 2026-11-07 에 찾아봤더니
    //    열 팀을 한 번에 정리한 자료가 없었고 위키백과도 막혀 있었다.
    //    그래서 칸마다 '확인'(출처를 봤다)인지 '통념'(내가 아는 값)인지
    //    적어 둔다. 틀린 것은 그 줄만 고치면 된다.
    assert.ok(
      ['확인', '통념'].includes(u.확실한가),
      `${k}: 어디서 온 값인지 안 적혀 있습니다`
    );
  }
  // KIA 는 출처를 봤다 — 2021년 현대차그룹 공식 글.
  assert.equal(U.KBO_UNIFORMS.KIA.확실한가, '확인');
});

test('등번호를 모르는 사람에게는 번호 얘기를 안 한다', () => {
  // ⚠️ 이게 이 묶음에서 가장 중요한 줄이다. 빈 칸을 남기면 모델이
  //    채우려고 **아무 번호나** 그린다. 틀린 번호는 번호가 없는 것보다
  //    나쁘다 — 팬이 뒤만 봐도 알아보게 하려는 것이 목적인데, 번호가
  //    틀리면 알아보기는커녕 다른 선수가 된다.
  const withNumber = U.uniformClause({ team: 'KIA', number: '40' });
  assert.ok(/number 40/.test(withNumber));

  for (const missing of [undefined, null, '', '   ']) {
    const c = U.uniformClause({ team: 'KIA', number: missing });
    assert.ok(c, '팀은 있으니 유니폼 문장은 나와야 합니다');
    assert.ok(!/number \d/.test(c), `등번호가 없는데 번호를 적었습니다: ${c}`);
  }
});

test('감독에게는 등번호를 안 달고 팀 재킷을 입힌다', () => {
  // 감독은 유니폼 위에 팀 재킷을 입는다. 등번호는 보통 안 보인다.
  const c = U.uniformClause({ team: 'KIA', number: '77', role: 'KIA 감독' });
  assert.ok(/team jacket/.test(c), '감독에게 재킷이 없습니다');
  assert.ok(!/number \d/.test(c), '감독에게 등번호를 달았습니다');
});

test('표에 없는 팀은 빈 문장이다 — 색을 지어내지 않는다', () => {
  // 빈 값이면 composeImagePrompt 가 유니폼 문장 없이 그리고, 고정
  // 문구의 밑줄만 적용된다. 전과 같아질 뿐 더 나빠지지 않는다.
  assert.equal(U.uniformClause({ team: '뉴욕 양키스', number: '99' }), '');
  assert.equal(U.uniformClause({}), '');
});

test('유니폼이 장면 설명 바로 뒤, 고정 문구 앞에 들어간다', () => {
  // ⚠️ 자리가 중요하다. 고정 스타일 문구가 수백 자다. 그 뒤에 색을
  //    적으면 그림 모델이 앞쪽만 무겁게 보고 색을 흘린다.
  const uni = U.uniformClause({ team: 'KIA', number: '40' });
  const p = UV.composeImagePrompt('a pitcher at the top of his windup', 'present', {
    kind: 'SPORTS',
    uniform: uni,
  });
  // ⚠️ 2026-11-11. 구단 이름을 프롬프트에서 뺐다 — 모델이 모르는 이름을
  //    아는 구단으로 바꿔 그렸다(모자에 B·K·R). 이제 색으로 찾는다.
  const atUniform = p.indexOf('bright red piping');
  const atStyle = p.indexOf(UV.SPORTS_PAINT.slice(0, 20));
  assert.ok(atUniform > 0, '유니폼 문장이 프롬프트에 없습니다');
  assert.ok(atStyle > 0, '화풍 문구가 프롬프트에 없습니다');
  assert.ok(
    atUniform < atStyle,
    '유니폼이 화풍 문구 뒤에 있습니다 — 거기서는 색이 흐려집니다'
  );
  assert.ok(p.indexOf('windup') < atUniform, '장면 설명보다 앞에 있습니다');
  // 점이 두 개 찍히지 않는가.
  assert.ok(!/\.\./.test(p), `마침표가 겹쳤습니다: ${p.slice(0, 160)}`);
});

test('샷의 person 으로 그 사람의 유니폼을 찾아 꽂는다', () => {
  // 설계 AI 가 무엇을 쓰든 유니폼은 프롬프트에 있어야 한다. 그게
  // 이 바꿈의 전부다.
  const item = {
    people: [
      { name: '네일', role: 'KIA 선발투수', look: 'a tall pitcher', team: 'KIA', number: '40' },
      { name: '이범호', role: 'KIA 감독', look: 'a manager', team: 'KIA' },
    ],
  };
  const uniforms = UV.uniformsOf(item);
  assert.equal(uniforms.size, 2);
  assert.ok(/number 40/.test(uniforms.get('네일')));
  assert.ok(!/number \d/.test(uniforms.get('이범호')), '감독에게 번호가 붙었습니다');

  const scene = {
    scene_number: 1,
    shots: [
      { shot_id: 's1', seconds: 4 },
      { shot_id: 's2', seconds: 4 },
      { shot_id: 's3', seconds: 4 },
    ],
  };
  const design = {
    mood: 'tension',
    visual_description: '마운드',
    shots: [
      // 설계 AI 가 유니폼을 한 글자도 안 적은 샷이다. 전에는 이러면
      // 색이 사라졌다.
      { shot_id: 's1', person: '네일', image_prompt: 'a pitcher releasing the ball', camera: 'zoom in' },
      { shot_id: 's2', person: '이범호', image_prompt: 'a manager at the dugout rail', camera: 'zoom in' },
      // 글자 카드에는 사람이 없다. 유니폼이 붙으면 안 된다.
      { shot_id: 's3', person: '', card_text: '183이닝', image_prompt: '', camera: 'zoom in' },
    ],
  };
  const { scene: merged } = UV.mergeVisuals(scene, design, { kind: 'SPORTS', uniforms });
  const [s1, s2, s3] = merged.shots;
  assert.ok(/bright red piping/.test(s1.image_prompt), '투수 샷에 유니폼이 안 붙었습니다');
  assert.ok(
    !/KIA|Tigers|타이거즈/.test(s1.image_prompt),
    '구단 이름이 프롬프트에 있습니다 — 모델이 아는 구단으로 바꿔 그립니다'
  );
  assert.ok(/number 40/.test(s1.image_prompt), '투수 샷에 등번호가 안 붙었습니다');
  assert.ok(/team jacket/.test(s2.image_prompt), '감독 샷에 재킷이 안 붙었습니다');
  // ⚠️ 'number' 라는 낱말은 고정 문구에도 있다("when a jersey number is
  //    given..."). 실제 **숫자**가 붙었는지를 봐야 한다.
  assert.ok(
    !/number \d/.test(s2.image_prompt),
    `감독 샷에 번호가 붙었습니다: ${s2.image_prompt.match(/number \d+/)?.[0]}`
  );
  // 번호가 없는 사람에게는 "번호를 그리지 마라"가 가 있어야 한다.
  assert.ok(/no number at all when none is given/.test(s2.image_prompt));
  assert.equal(s3.image_prompt, '', '카드 샷에 그림 프롬프트가 생겼습니다');
});

test('기획 파일의 team 과 number 가 소재 레코드까지 간다', () => {
  // ⚠️ 2026-11-07 에 photo 로 똑같은 일을 겪었다. makeSports 가 photo 를
  //    떨어뜨려서 **여덟 편 내내 참조 사진이 한 번도 안 쓰였다.** 기획
  //    파일에 적어도 프롬프트까지 안 가면 적은 적이 없는 것과 같다.
  const made = UM.makeSports({
    title: 'x',
    people: [
      { name: '네일', role: 'KIA 선발투수', look: 'a tall pitcher', team: 'KIA', number: '40' },
      { name: '엄상백', role: '한화 투수', look: 'a pitcher', team: '한화' },
    ],
  });
  assert.equal(made.people[0].team, 'KIA');
  assert.equal(made.people[0].number, '40');
  assert.equal(made.people[1].team, '한화');
  // 등번호를 못 찾은 사람에게는 **칸 자체가 없어야** 한다. '' 가 붙으면
  // uniformClause 가 빈 번호를 적으려 할 수 있다.
  assert.ok(!('number' in made.people[1]), '빈 등번호 칸이 붙었습니다');
});

test('9화·10화 사람에게 팀이 다 적혀 있다', () => {
  // 유니폼은 team 이 있어야 붙는다. 하나라도 비면 그 사람만 색이
  // 틀린 그림으로 나오고, 영상을 다 만든 뒤에야 보인다.
  for (const f of ['9화.json', '10화.json']) {
    const p = 스포츠영상(f);
    if (!fs.existsSync(p)) continue;
    const people = JSON.parse(fs.readFileSync(p, 'utf8')).people || [];
    assert.ok(people.length, `${f}: 사람이 없습니다`);
    for (const person of people) {
      assert.ok(person.team, `${f}: ${person.name} 에게 team 이 없습니다`);
      assert.ok(
        U.teamKey(person.team),
        `${f}: ${person.name} 의 팀 '${person.team}' 이 구단 표에 없습니다`
      );
      // look 에 유니폼 색을 **다시** 적어 두지 않는다. 둘 다 있으면
      // "red and black uniform"(look) 과 "white jersey with black
      // wordmark"(코드) 가 서로 싸워 모델이 하나를 버린다.
      assert.ok(
        !/uniform in /.test(person.look),
        `${f}: ${person.name} 의 look 에 유니폼 색이 남아 있습니다`
      );
    }
  }
});

test('비율을 재는 자리마다 적는다', () => {
  // 2026-11-07 운영자: "그림의 비율이 이상하면 안 된다."
  // 머리 크기만 적어 뒀더니 어깨가 좁고 팔이 짧은 그림이 나왔다.
  const p = UV.composeImagePrompt('a pitcher', 'present', { kind: 'SPORTS' });
  for (const must of [
    'one seventh of total height',
    'two head-widths',
    'reach mid-thigh',
    'half the',
  ]) {
    assert.ok(p.includes(must), `비율 지시가 빠졌습니다: ${must}`);
  }
});




console.log(`\n${'═'.repeat(60)}`);
console.log(`통과 ${passed}건  실패 ${failed}건` + (skipped ? `  건너뜀 ${skipped}건` : ''));
console.log(`임시 폴더: ${TMP}`);
console.log('═'.repeat(60));

// 테스트가 만든 임시 폴더를 지운다.
fs.rmSync(TMP, { recursive: true, force: true });


if (failed) process.exit(1);
