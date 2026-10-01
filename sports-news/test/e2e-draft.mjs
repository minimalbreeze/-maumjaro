// 전 구간 실행 검사 — 뉴스 파일 → AI(모의) → 워드프레스(모의) 임시글 저장.
//
// 실제 네트워크 없이, 실제 코드 경로를 그대로 태운다.
// 검증되지 않는 것: Claude가 진짜로 어떤 글을 쓰는지, 실제 사이트의 응답.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockServer } from './mock-anthropic.mjs';
import { startMockWordPress } from './mock-wordpress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn('node', ['src/main.mjs', ...args], {
      cwd: ROOT, env: { ...process.env, ...env },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

console.log('\n[전 구간 — 임시글 저장]');

const ai = await startMockServer({ simulatePauseTurn: true });
const wp = await startMockWordPress({ rankMathWritable: true });

// wp:check를 먼저 돌려 config/site.json을 만든다 (실제 사용 순서와 동일)
const probeEnv = {
  WORDPRESS_URL: `http://127.0.0.1:${wp.port}`,
  WORDPRESS_USERNAME: 'tester',
  WORDPRESS_APP_PASSWORD: 'aaaa bbbb cccc dddd',
  ANTHROPIC_API_KEY: 'sk-ant-mock',
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${ai.port}`,
  DRY_RUN: '',
};
const sitePath = path.join(ROOT, 'config/site.json');
const siteBackup = fs.existsSync(sitePath) ? fs.readFileSync(sitePath, 'utf8') : null;

const probe = await new Promise((resolve) => {
  const c = spawn('node', ['src/wordpress/probe.mjs'], { cwd: ROOT, env: { ...process.env, ...probeEnv } });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('exit', (code) => resolve({ code, out }));
});

check('wp:check가 사이트를 조사한다', () => assert.equal(probe.code, 0, probe.out.slice(-400)));
check('wp:check는 글을 만들지 않는다', () => assert.equal(wp.state.created.length, 0));
check('카테고리 14개를 읽어온다', () => assert.ok(/카테고리 14개/.test(probe.out), probe.out.slice(-300)));
check('Rank Math 쓰기 가능 필드를 찾아낸다', () => {
  assert.ok(wp.state.optionsCalls > 0, 'OPTIONS 스키마 조회를 하지 않았습니다');
  assert.ok(/rank_math_title/.test(probe.out), probe.out.slice(-300));
});

const result = await run(
  ['--topic=바둑', '--draft', '--fixture=test/fixtures/sample-news.json'],
  probeEnv
);

check('정상 종료한다', () => assert.equal(result.code, 0, result.out.slice(-600)));
check('pause_turn이 와도 이어받아 끝낸다', () => {
  assert.ok(ai.verifyCalls >= 2, `사실확인 호출 ${ai.verifyCalls}회 — 이어받기가 동작하지 않았습니다`);
  assert.ok(/확인된 사실 5건/.test(result.out), result.out.slice(-400));
});
check('웹검색 도구를 붙여서 사실확인을 한다', () => assert.ok(ai.seen.hadWebSearch));
// 폴백이 있으면 잘못 부른 호출도 겉으로는 성공해 보인다. 거부당한 호출이
// 하나라도 있으면 실패로 본다.
check('Claude API를 거부당하지 않는 형태로 부른다', () =>
  assert.deepEqual(ai.seen.rejected, [], `거부당한 호출: ${ai.seen.rejected.join(', ')}`));
check('글이 워드프레스에 저장된다', () => assert.equal(wp.state.created.length, 1, result.out.slice(-600)));

const post = wp.state.created[0] || {};
check('상태가 draft다', () => assert.equal(post.status, 'draft'));
check('publish로 저장되지 않는다', () => assert.notEqual(post.status, 'publish'));
check('제목이 실린다', () => assert.ok(post.title?.includes('삼성화재배'), JSON.stringify(post.title)));
check('본문이 워드프레스 블록으로 변환된다', () => {
  assert.ok(post.content?.includes('<!-- wp:heading -->'), '소제목 블록이 없습니다');
  assert.ok(post.content?.includes('<!-- wp:list -->'), '관전포인트 목록 블록이 없습니다');
  assert.ok(post.content?.includes('<strong>'), '굵은 라벨이 없습니다');
});
check('카테고리가 하나만 지정된다', () => {
  assert.equal(post.categories?.length, 1, JSON.stringify(post.categories));
  // 사이트에 "바둑" 카테고리가 실제로 있으므로 상위인 "스포츠"가 아니라 "바둑"으로 가야 한다
  assert.equal(post.categories[0], 8, `바둑 카테고리(id=8)여야 하는데 ${post.categories[0]}로 갔습니다`);
});
check('태그가 5~10개 범위다', () => {
  assert.ok(post.tags?.length >= 5 && post.tags.length <= 10, `태그 ${post.tags?.length}개`);
});
check('태그에 # 기호가 없다', () => assert.ok(!wp.state.tagsCreated.some((t) => t.startsWith('#')), wp.state.tagsCreated.join(',')));
check('메타 설명이 excerpt로 들어간다', () => assert.ok(post.excerpt?.length > 20));
check('Rank Math 필드가 저장된다', () => {
  assert.ok(post.meta?.rank_math_title, JSON.stringify(post.meta));
  assert.ok(post.meta?.rank_math_description);
});
check('인증 헤더가 Basic으로 붙는다', () => assert.ok(wp.state.authHeaders.some((h) => h.startsWith('Basic '))));
check('비밀번호가 화면에 노출되지 않는다', () => {
  assert.ok(!result.out.includes('aaaa bbbb cccc dddd'), '비밀번호가 출력에 남았습니다');
  assert.ok(!probe.out.includes('aaaa bbbb cccc dddd'));
});
check('편집 링크를 알려준다', () => assert.ok(/wp-admin\/post\.php/.test(result.out), result.out.slice(-400)));

// Rank Math를 쓸 수 없는 사이트에서는 meta를 보내지 않아야 한다
const wp2 = await startMockWordPress({ rankMathWritable: false });
fs.writeFileSync(sitePath, JSON.stringify({ seoFields: { writable: [] }, categories: [] }));
const r2 = await run(['--topic=바둑', '--draft', '--fixture=test/fixtures/sample-news.json'], {
  ...probeEnv, WORDPRESS_URL: `http://127.0.0.1:${wp2.port}`,
});
check('SEO 필드를 쓸 수 없으면 meta를 보내지 않는다', () => {
  assert.equal(r2.code, 0, r2.out.slice(-500));
  const p2 = wp2.state.created[0] || {};
  assert.ok(!p2.meta || Object.keys(p2.meta).length === 0, JSON.stringify(p2.meta));
  assert.equal(p2.status, 'draft');
});

// ── C 판정: 기존 글 업데이트 후보 ─────────────────────────────
// 오래된 비슷한 글이 있으면 새 글을 만들지 않고 참고 원고만 남겨야 한다.
console.log('\n[C 판정 — 기존 글 업데이트 후보]');
const oldDate = new Date(Date.now() - 200 * 86400000).toISOString();
const wp3 = await startMockWordPress({
  rankMathWritable: true,
  existingPosts: [{
    id: 55, title: { rendered: '2026 삼성화재배 8강 대진 확정, 신진서 vs 커제 성사' },
    link: 'http://example.test/?p=55', date: oldDate, modified: oldDate, status: 'publish',
  }],
});
fs.writeFileSync(sitePath, JSON.stringify({ seoFields: { writable: [] }, categories: [] }));
const r3 = await run(['--topic=바둑', '--draft', '--fixture=test/fixtures/sample-news.json'], {
  ...probeEnv, WORDPRESS_URL: `http://127.0.0.1:${wp3.port}`,
});

check('오래된 비슷한 글이 있으면 C로 판정한다', () => {
  assert.ok(/업데이트 후보/.test(r3.out), r3.out.slice(-700));
});
check('C 판정이면 워드프레스에 새 글을 만들지 않는다', () => {
  assert.equal(wp3.state.created.length, 0, `${wp3.state.created.length}건이 저장됐습니다`);
});
check('C 판정이어도 참고 원고는 파일로 남긴다', () => {
  assert.ok(/참고용 원고 저장/.test(r3.out), r3.out.slice(-500));
});
check('고쳐야 할 기존 글을 알려준다', () => {
  assert.ok(/고칠 글:/.test(r3.out), r3.out.slice(-500));
});

// ── B 판정: 최근 같은 글 → 아무것도 만들지 않는다 ───────────────
console.log('\n[B 판정 — 중복]');
const wp4 = await startMockWordPress({
  existingPosts: [{
    id: 66, title: { rendered: '2026 삼성화재배 8강 대진 확정, 신진서 vs 커제 성사' },
    link: 'http://example.test/?p=66', date: new Date().toISOString(),
    modified: new Date().toISOString(), status: 'publish',
  }],
});
const r4 = await run(['--topic=바둑', '--draft', '--fixture=test/fixtures/sample-news.json'], {
  ...probeEnv, WORDPRESS_URL: `http://127.0.0.1:${wp4.port}`,
});
check('최근 같은 글이 있으면 B로 판정하고 건너뛴다', () => {
  assert.ok(/중복 가능성 높음/.test(r4.out), r4.out.slice(-600));
  assert.equal(wp4.state.created.length, 0);
});
check('B 판정이면 AI 작성 단계로 넘어가지 않는다', () => {
  assert.ok(!/워프양식으로 작성 중/.test(r4.out), '중복인데 글을 썼습니다');
});

// ── 1순위가 막히면 다음 후보로 ──────────────────────────────────
// 예전에는 1순위 글감이 중복이면 그 종목은 그대로 빈손이었다.
// 후보가 더 있는데도 아무것도 안 만드는 건 아깝다.
console.log('\n[1순위가 막히면 다음 후보로]');
const wp5 = await startMockWordPress({
  existingPosts: [{
    id: 77, title: { rendered: '2026 삼성화재배 8강 대진 확정, 신진서 vs 커제 성사' },
    link: 'http://example.test/?p=77', date: new Date().toISOString(),
    modified: new Date().toISOString(), status: 'publish',
  }],
});
const r5 = await run(['--topic=바둑', '--draft', '--fixture=test/fixtures/two-clusters.json'], {
  ...probeEnv, WORDPRESS_URL: `http://127.0.0.1:${wp5.port}`,
});
check('1순위가 중복이면 다음 후보를 처리한다', () => {
  assert.ok(/다음 후보로 넘어갑니다/.test(r5.out), r5.out.slice(-800));
});
check('다음 후보로 임시글 1건을 만든다', () => {
  assert.equal(r5.code, 0, r5.out.slice(-600));
  assert.equal(wp5.state.created.length, 1, `${wp5.state.created.length}건 저장됨`);
  assert.equal(wp5.state.created[0].status, 'draft');
});
// 모의 AI는 어떤 글감을 줘도 같은 원고를 돌려주므로 저장된 제목으로는
// 어느 글감이었는지 가릴 수 없다. 로그에 찍힌 처리 순서로 확인한다.
check('중복 글감이 아니라 2순위 글감을 처리한다', () => {
  const order = [...r5.out.matchAll(/처리: (.+)/g)].map((m) => m[1]);
  assert.equal(order.length, 2, `처리한 글감 ${order.length}개: ${order.join(' / ')}`);
  assert.ok(/삼성화재배/.test(order[0]), order[0]);
  assert.ok(/LG배/.test(order[1]), order[1]);
});
wp5.server.close();

// ── 주제를 직접 지정해 한 편만 쓰기 ─────────────────────────
// 매일 전 종목을 훑는 것보다 훨씬 싸다. 요청한 주제를 카테고리로 분류하고
// 그 한 편만 만든다.
console.log('\n[주제 지정 — 1편만]');
const wp6 = await startMockWordPress();
const r6 = await run(
  ['--subject=삼성화재배 8강 신진서 커제', '--draft', '--fixture=test/fixtures/sample-news.json'],
  { ...probeEnv, WORDPRESS_URL: `http://127.0.0.1:${wp6.port}` },
);
check('주제를 카테고리로 분류한다', () => {
  assert.equal(r6.code, 0, r6.out.slice(-800));
  assert.ok(/주제 분류 중/.test(r6.out), r6.out.slice(-600));
  assert.ok(/카테고리: 바둑/.test(r6.out), r6.out.slice(-600));
});
check('주제 모드에서도 임시글로 저장한다', () => {
  assert.equal(wp6.state.created.length, 1, `${wp6.state.created.length}건`);
  assert.equal(wp6.state.created[0].status, 'draft');
});
check('주제 모드는 1편만 만든다', () => {
  assert.ok(/생성 1건/.test(r6.out), r6.out.slice(-400));
});
check('자주 묻는 질문 구조화 데이터가 본문에 붙는다', () => {
  const content = wp6.state.created[0].content || '';
  assert.ok(/application\/ld\+json/.test(content), '구조화 데이터가 없습니다');
  assert.ok(/"@type":\s*"FAQPage"/.test(content), content.slice(-300));
});
wp6.server.close();

// ── 전 종목에서 가장 좋은 글감 하나 ─────────────────────────
// 종목마다 1편씩 쓰면 "야구에 좋은 글감이 없는 날에도 야구 글을 쓰는" 일이
// 생긴다. --best는 그날 가장 좋은 것만 고른다. 수집은 공짜고 돈은 작성에 든다.
console.log('\n[전 종목에서 가장 좋은 글감]');
const wp7 = await startMockWordPress();
const r7 = await run(
  ['--best=1', '--draft', '--fixture=test/fixtures/two-clusters.json'],
  { ...probeEnv, WORDPRESS_URL: `http://127.0.0.1:${wp7.port}` },
);
check('전 종목을 훑어 후보를 모은다', () => {
  assert.equal(r7.code, 0, r7.out.slice(-800));
  assert.ok(/전 종목에서 글감 찾기/.test(r7.out), r7.out.slice(-600));
});
check('모은 후보 중 1편만 만든다', () => {
  assert.equal(wp7.state.created.length, 1, `${wp7.state.created.length}건 저장됨`);
  assert.equal(wp7.state.created[0].status, 'draft');
});
check('종목이 여러 개여도 글은 1편이다', () => {
  // 종목별 1편 경로였다면 종목 수만큼 나왔을 것이다.
  assert.ok(/생성 1건/.test(r7.out), r7.out.slice(-400));
});
wp7.server.close();

if (siteBackup !== null) fs.writeFileSync(sitePath, siteBackup); else fs.rmSync(sitePath, { force: true });
ai.server.close(); wp.server.close(); wp2.server.close(); wp3.server.close(); wp4.server.close();

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
