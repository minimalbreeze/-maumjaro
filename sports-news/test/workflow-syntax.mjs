// 워크플로 문법 검사.
//
// 왜 필요한가: GitHub은 ${{ }} 를 주석이든 어디든 가리지 않고 먼저 해석한다.
// 셸 주석 안에 써도 소용없다. 안이 비어 있으면 파일 전체를 못 읽고,
// 워크플로 이름조차 표시되지 않은 채 0초 만에 실패한다.
//
// 실제로 그 실수를 했다. run 블록 주석에 "${{ }} 를 바로 쓰면 위험하다"고
// 적어둔 것이 그대로 문법 오류가 됐다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOWS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.github/workflows');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[워크플로 문법]');

const files = fs.existsSync(WORKFLOWS)
  ? fs.readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))
  : [];

check('워크플로 파일을 찾는다', () => assert.ok(files.length > 0, WORKFLOWS));

for (const file of files) {
  const text = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
  const exprs = [...text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)];

  check(`${file}: 빈 표현식이 없다`, () => {
    const empty = exprs.filter((m) => !m[1].trim());
    assert.equal(empty.length, 0, `${empty.length}개 — GitHub이 파일 전체를 못 읽게 됩니다`);
  });

  check(`${file}: 표현식이 알려진 컨텍스트만 쓴다`, () => {
    const known = /^(secrets|inputs|github|env|vars|matrix|needs|steps|job|runner|strategy|always|success|failure|cancelled|hashFiles|format|toJSON|fromJSON|contains|startsWith|endsWith|join)\b/;
    const bad = exprs.map((m) => m[1].trim()).filter((e) => !known.test(e));
    assert.equal(bad.length, 0, `알 수 없는 표현식: ${bad.join(' / ')}`);
  });
}

const sports = path.join(WORKFLOWS, 'sports-news.yml');
if (fs.existsSync(sports)) {
  const text = fs.readFileSync(sports, 'utf8');
  check('sports-news: 자동 실행(cron)이 걸려 있지 않다', () => {
    assert.ok(!/^\s*schedule:/m.test(text), '사람이 누를 때만 돌아야 합니다');
  });
  check('sports-news: 기본값이 미리보기다', () => {
    assert.ok(/default: '미리보기/.test(text), '실수로 눌렀을 때 저장되면 안 됩니다');
  });
  check('sports-news: 입력값을 run 블록에 직접 끼워 넣지 않는다', () => {
    const runBlocks = [...text.matchAll(/run: \|([\s\S]*?)(?=\n {6}- |\n {6}\w|$)/g)].map((m) => m[1]);
    const injected = runBlocks.filter((b) => /\$\{\{\s*inputs\./.test(b));
    assert.equal(injected.length, 0, '입력값은 env로 넘겨야 합니다');
  });
  check('sports-news: 리포에 쓰기 권한을 요구하지 않는다', () => {
    assert.ok(/contents: read/.test(text));
  });
}

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
