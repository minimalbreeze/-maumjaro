// 운영자가 직접 준 기사로 글을 쓰는 경로 검사.
//
// 왜 이 검사가 있는가: 2026-10-05에 운영자가 신지애 통산 상금 기사를 붙여주며
// "이걸 확장해서 작성해줘"라고 했는데, 넘길 경로가 없어서 주제 한 줄만 전달됐다.
// 사실확인 단계는 "핵심 수치들을 검색으로 확인하지 못해"라며 글을 포기했다.
// 그 숫자는 운영자가 준 기사에 다 있었다. 재료가 손에 있는데 전달이 안 된 것이다.
//
// 그래서 여기서 검사하는 것은 하나다: **붙여넣은 기사의 숫자가 사실확인
// 프롬프트까지 그대로 닿는가.**

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { givenArticleCluster, givenArticleNote, 첫줄제목 } from '../src/news/given-article.mjs';
import { parseArgs } from '../src/main.mjs';
import { startMockServer } from './mock-anthropic.mjs';

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

console.log('\n[운영자가 준 기사로 쓰기]');

// 운영자가 실제로 붙여넣은 기사와 같은 모양. 숫자가 본문 중간에도 흩어져 있다.
const 기사 = `신지애, JLPGA 통산 상금 15억 3901만 엔으로 역대 1위

신지애(38)가 일본여자프로골프(JLPGA) 투어 통산 상금 15억 3901만 엔을 기록했다.
한화로 약 131억원이다. 2위 후도 유리는 13억 7297만 엔, 3위 전미정은 13억 6760만 엔,
4위 이지희는 12억 5756만 엔이다.

신지애는 2014년 JLPGA 투어에 본격 진출했다. 영구시드를 보유하고 있다.
이번 대회 우승상금은 3000만 엔이었다.`;

// ── 재료 만들기 ────────────────────────────────────────────
check('기사 전문이 요약으로 그대로 들어간다', () => {
  // 이게 깨지면 숫자가 사실확인 단계에 닿지 않는다 — 10-05의 그 실패다.
  const c = givenArticleCluster(기사, { subject: '신지애 통산 상금', category: '골프' });
  const s = c.articles[0].summary;
  for (const 숫자 of ['15억 3901만', '13억 7297만', '13억 6760만', '12억 5756만', '3000만 엔', '2014년']) {
    assert.ok(s.includes(숫자), `요약에 ${숫자} 가 없습니다`);
  }
});

check('출처를 운영자 제공으로 분명히 남긴다', () => {
  // 어디서 온 사실인지 추적할 수 없으면 쓸 수 없는 재료다.
  const c = givenArticleCluster(기사, { subject: '신지애 통산 상금', category: '골프' });
  assert.equal(c.articles[0].source, '운영자 제공');
  assert.deepEqual(c.sources, ['운영자 제공']);
  assert.equal(c.sourceCount, 1);
  assert.equal(c.articleCount, 1);
  assert.equal(c.운영자제공, true);
});

check('카테고리와 주제를 그대로 받는다', () => {
  const c = givenArticleCluster(기사, { subject: '신지애 통산 상금', topic: '골프', category: '골프' });
  assert.equal(c.label, '신지애 통산 상금');
  assert.equal(c.topic, '골프');
  assert.equal(c.category, '골프');
});

check('발행일을 지금으로 둬서 7일 창에 걸리지 않는다', () => {
  // 날짜가 없거나 오래되면 뒤의 필터가 걸러낸다. 운영자가 직접 준 글감이 걸러지면 안 된다.
  const c = givenArticleCluster(기사, { subject: 'x' });
  assert.ok(Date.now() - Date.parse(c.articles[0].publishedAt) < 60_000);
  assert.equal(c.hasUndated, false);
});

check('빈 기사는 null 이다', () => {
  // 빈 걸 재료라고 넘기면 AI가 기억으로 채운다. 그게 제일 위험하다.
  assert.equal(givenArticleCluster(''), null);
  assert.equal(givenArticleCluster('   \n  \n '), null);
  assert.equal(givenArticleCluster(null), null);
  assert.equal(givenArticleCluster(undefined), null);
});

// ── 제목 뽑기 ──────────────────────────────────────────────
check('첫 줄에서 쓸 만한 제목을 고른다', () => {
  assert.equal(첫줄제목(기사), '신지애, JLPGA 통산 상금 15억 3901만 엔으로 역대 1위');
});
check('너무 짧은 줄은 건너뛴다', () => {
  // "속보", "골프" 같은 한두 낱말 줄이 제목이 되면 검색이 안 된다.
  assert.equal(첫줄제목('속보\n골프\n신지애 통산 상금 131억원 돌파했다'), '신지애 통산 상금 131억원 돌파했다');
});
check('쓸 만한 줄이 없으면 주제를 쓴다', () => {
  assert.equal(첫줄제목('짧다', '신지애 상금'), '신지애 상금');
  assert.equal(첫줄제목('', '신지애 상금'), '신지애 상금');
});

// ── 사실확인에 붙는 안내 ───────────────────────────────────
check('안내가 1차 출처로 다루라고 말한다', () => {
  const n = givenArticleNote();
  assert.match(n, /1차 출처/, '1차 출처라는 말이 없습니다');
  assert.match(n, /confirmed/, 'confirmed 에 넣으라는 지시가 없습니다');
  assert.match(n, /웹검색이 막혀도/, '검색 한도에 걸려도 쓰라는 지시가 없습니다');
});
check('안내가 안전선을 다시 못 박는다', () => {
  // 재료를 믿으라는 말이 "지어내도 된다"로 읽히면 안 된다.
  const n = givenArticleNote();
  assert.match(n, /추측으로 채우지 않는다/, '추측 금지가 없습니다');
  assert.match(n, /원문을 복사하거나 문장을 바꿔 쓰지 않는다/, '원문 복사 금지가 없습니다');
});

// ── 인자 ───────────────────────────────────────────────────
check('--article= 로 파일 경로를 받는다', () => {
  assert.equal(parseArgs(['--article=/tmp/a.txt']).articleFile, '/tmp/a.txt');
  // 워크플로가 따옴표를 같이 넘기는 일이 있다.
  assert.equal(parseArgs(['--article="/tmp/a b.txt"']).articleFile, '/tmp/a b.txt');
  assert.equal(parseArgs([]).articleFile, undefined);
});

check('--article 갈림길이 --research 보다 앞에 있다', () => {
  // 뒤에 있으면 운영자가 기사를 줬는데도 뉴스 없이 검색만 하는 경로로 간다.
  const src = fs.readFileSync(path.join(ROOT, 'src/main.mjs'), 'utf8');
  const 기사갈림 = src.indexOf('if (args.articleFile)');
  const 조사갈림 = src.indexOf('if (args.research)');
  assert.ok(기사갈림 > 0, '--article 갈림길이 없습니다');
  assert.ok(기사갈림 < 조사갈림, '--article 이 --research 뒤에 있습니다');
});

check('--article 경로는 뉴스를 수집하지 않는다', () => {
  // 기사를 받았는데 RSS 를 또 긁으면 느려지고, 엉뚱한 기사가 섞인다.
  const src = fs.readFileSync(path.join(ROOT, 'src/main.mjs'), 'utf8');
  const 시작 = src.indexOf('if (args.articleFile)');
  const 끝 = src.indexOf('if (args.research)');
  const 본문 = src.slice(시작, 끝);
  for (const 금지 of ['collectNews', 'fetchRss', 'clusterArticles', 'rankClusters']) {
    assert.ok(!본문.includes(금지), `기사를 받은 경로가 ${금지} 를 부릅니다`);
  }
  assert.ok(/return;/.test(본문), '한 편 쓰고 끝내지 않습니다');
});

// ── 전 구간 (모의 AI) ──────────────────────────────────────
const ai = await startMockServer();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'given-'));
const 기사파일 = path.join(tmp, 'article.txt');
fs.writeFileSync(기사파일, 기사, 'utf8');

const run = (args, env = {}) => new Promise((resolve) => {
  const c = spawn('node', ['src/main.mjs', ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: 'sk-ant-mock',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${ai.port}`,
      WORDPRESS_URL: '', WORDPRESS_USERNAME: '', WORDPRESS_APP_PASSWORD: '',
      VARIETY_PENALTY: 'off',
      ...env,
    },
  });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('exit', (code) => resolve({ code, out }));
});

const r = await run(['--dry-run', '--subject=신지애 JLPGA 통산 상금 1위 131억원', `--article=${기사파일}`]);

await checkAsync('붙여넣은 기사로 한 편을 끝까지 쓴다', async () => {
  assert.equal(r.code, 0, r.out.slice(-1200));
  assert.match(r.out, /운영자가 준 기사를 재료로 씁니다/, r.out.slice(-600));
});

await checkAsync('기사 속 숫자가 사실확인 프롬프트까지 닿는다', async () => {
  // 이 검사가 이 파일의 존재 이유다.
  const 사실확인 = ai.seen.userPrompts.find((p) => p.includes('## 할 일') || p.includes('confirmed'));
  assert.ok(사실확인, `사실확인 프롬프트를 못 찾았습니다 (${ai.seen.userPrompts.length}개 수집)`);
  for (const 숫자 of ['15억 3901만', '13억 7297만', '12억 5756만', '3000만 엔']) {
    assert.ok(사실확인.includes(숫자), `프롬프트에 ${숫자} 가 없습니다`);
  }
});

await checkAsync('운영자 제공이라는 안내가 프롬프트에 붙는다', async () => {
  const 사실확인 = ai.seen.userPrompts.find((p) => p.includes('## 할 일') || p.includes('confirmed'));
  assert.match(사실확인, /운영자가 직접 준 것이다/, '제공 안내가 붙지 않았습니다');
});

await checkAsync('기사가 없을 때는 안내가 붙지 않는다', async () => {
  // 수집한 뉴스에까지 "운영자가 줬다"고 적으면 출처를 속이는 것이 된다.
  const 평소 = await run(['--dry-run', '--fixture=test/fixtures/sample-news.json', '--topic=바둑', '--limit=1']);
  assert.equal(평소.code, 0, 평소.out.slice(-800));
  const 프롬프트들 = ai.seen.userPrompts.filter((p) => p.includes('## 할 일') || p.includes('confirmed'));
  const 마지막 = 프롬프트들[프롬프트들.length - 1];
  assert.ok(마지막, '사실확인 프롬프트를 못 찾았습니다');
  assert.ok(!마지막.includes('운영자가 직접 준 것이다'), '수집한 뉴스에 제공 안내가 붙었습니다');
});

await checkAsync('빈 기사 파일은 이유를 말하고 멈춘다', async () => {
  const 빈파일 = path.join(tmp, 'empty.txt');
  fs.writeFileSync(빈파일, '   \n', 'utf8');
  const e = await run(['--dry-run', '--subject=아무거나', `--article=${빈파일}`]);
  assert.notEqual(e.code, 0, '빈 파일인데 그냥 넘어갔습니다');
  assert.match(e.out, /비어 있습니다/, e.out.slice(-500));
});

ai.server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
