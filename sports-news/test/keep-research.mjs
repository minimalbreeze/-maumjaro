// 글을 못 쓰게 됐을 때 **조사 결과를 버리지 않는지** 검사.
//
// 2026-10-19: 5655(BNP 파리바 오픈)의 상금을 채우려고 조사를 돌렸다.
// 확인된 사실 8건을 얻고도 AI 중복 판정에서 그냥 돌아가서, 158원이
// "8건" 이라는 글자만 남기고 사라졌다.
//
// 중복 판정은 "새 글을 만들지 말라"는 뜻이지 "조사한 것을 버리라"는 뜻이
// 아니다 — 기존 글을 보강할 재료가 바로 그것이다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 사실찍기, 조사결과남기기 } from '../src/main.mjs';

const 검사 = [];
const check = (이름, fn) => 검사.push([이름, fn]);

const 사실들 = [
  { fact: '2026 BNP 파리바 오픈 총상금은 남녀 각 960만 달러다', source: 'https://www.atptour.com/' },
  '우승 상금은 약 130만 달러다',
];

check('확인된 사실이 있으면 파일로 남긴다', () => {
  const file = 조사결과남기기({
    label: '2026 BNP 파리바 오픈 총상금과 우승 상금',
    topic: '테니스',
    skipped: 'AI 중복 판정: 기존 글에 이미 상금이 있다',
    verification: { confirmed: 사실들, unverified: ['관중 수'], conflicting: ['개막일'] },
  });
  assert.ok(file, '파일을 안 남겼습니다');
  const md = fs.readFileSync(file, 'utf8');
  assert.match(md, /960만 달러/, '사실이 파일에 없습니다');
  assert.match(md, /130만 달러/);
  assert.match(md, /atptour\.com/, '출처가 빠졌습니다');
  // 쓰면 안 되는 것은 그렇게 적는다.
  assert.match(md, /미확인 1건 — 쓰지 마세요/);
  assert.match(md, /출처가 엇갈린 것 1건 — 쓰지 마세요/);
  // 다음에 무엇을 하면 되는지 적어 둔다.
  assert.match(md, /섹션 끼워넣기|갈아끼우기/, '다음 단계를 안 적었습니다');
  // 왜 글을 안 썼는지도 남는다.
  assert.match(md, /AI 중복 판정/);
  assert.ok(fs.existsSync(file.replace(/\.md$/, '.json')), 'json 을 안 남겼습니다');
  fs.rmSync(file); fs.rmSync(file.replace(/\.md$/, '.json'));
});

check('확인된 사실이 없으면 빈 파일을 만들지 않는다', () => {
  for (const v of [
    { confirmed: [] },
    { confirmed: undefined },
    undefined,
  ]) assert.equal(조사결과남기기({ label: '아무개', verification: v }), '');
  assert.equal(조사결과남기기(undefined), '');
});

check('사실을 로그에 찍는다 — 개수만 찍으면 손에 남는 것이 없다', () => {
  const 찍힌것 = [];
  const 원래 = console.log;
  console.log = (...a) => 찍힌것.push(a.join(' '));
  try {
    사실찍기({ confirmed: 사실들 });
  } finally { console.log = 원래; }
  const 전부 = 찍힌것.join('\n');
  assert.match(전부, /확인된 사실 2건/);
  assert.match(전부, /960만 달러/, '사실 내용이 안 찍혔습니다');
  assert.match(전부, /130만 달러/);
  assert.match(전부, /atptour\.com/);
});

check('사실이 없으면 아무것도 찍지 않는다', () => {
  const 찍힌것 = [];
  const 원래 = console.log;
  console.log = (...a) => 찍힌것.push(a.join(' '));
  try {
    for (const v of [{ confirmed: [] }, {}, undefined, null]) 사실찍기(v);
  } finally { console.log = 원래; }
  assert.equal(찍힌것.length, 0, `${찍힌것.length}줄 찍었습니다`);
});

check('두 관문 모두에서 사실을 찍는다', () => {
  // AI 중복 판정과 사실 근거 부족, 둘 다 돈을 쓰고 글을 못 쓰는 자리다.
  const src = fs.readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
  const 중복 = src.indexOf('isDuplicateOfExisting) {');
  const 부족 = src.indexOf('!verification.worthWriting');
  assert.ok(중복 > 0 && 부족 > 중복);
  const 중복구간 = src.slice(중복, 부족);
  const 부족구간 = src.slice(부족, 부족 + 900);
  assert.match(중복구간, /조사결과남기기\(result\)/, '중복 판정에서 파일을 안 남깁니다');
  assert.match(중복구간, /사실찍기\(verification\)/, '중복 판정에서 사실을 안 찍습니다');
  assert.match(부족구간, /사실찍기\(verification\)/, '근거 부족에서 사실을 안 찍습니다');
});

check('운영자가 적은 종목을 분류기보다 믿는다', () => {
  // 2026-10-19: "2026 BNP 파리바 오픈 총상금과 우승 상금" 을 넘겼더니
  // "BNP 파리바 오픈은 PGA 투어의 정식 골프 토너먼트" 라며 골프로 분류했다.
  // 인디언웰스에서 열리는 테니스 대회다.
  const src = fs.readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
  assert.match(src, /args\.topic && names\.includes\(args\.topic\)/, '종목을 믿는 자리가 없습니다');
  assert.match(src, /classified\.category = args\.topic/, '종목으로 덮지 않습니다');
  // 사이트에 없는 카테고리를 넘기면 쓰지 않는다 — 없는 곳에 넣을 수 없다.
  assert.match(src, /names\.includes\(args\.topic\)/);
});

check('워크플로가 주제와 종목을 함께 넘긴다', () => {
  // 주제를 적으면 종목을 안 넘기던 탓에, 종목을 적어도 분류기 판단만 남았다.
  const wf = ['../../.github/workflows/sports-news.yml', '../.github/workflows/sports-news.yml']
    .map((p) => new URL(p, import.meta.url))
    .find((u) => fs.existsSync(u));
  assert.ok(wf, '워크플로를 못 찾았습니다');
  const text = fs.readFileSync(wf, 'utf8');
  const i = text.indexOf('--subject=$IN_SUBJECT');
  assert.ok(i > 0);
  const 구간 = text.slice(i, i + 700);
  assert.match(구간, /args\+=\("--topic=\$IN_TOPIC"\)/, '종목을 안 넘깁니다');
});

export default async function run() {
  console.log('\n[조사 결과를 버리지 않는다]');
  let 실패 = 0;
  for (const [이름, fn] of 검사) {
    try { await fn(); console.log(`  ✅ ${이름}`); } catch (e) { 실패 += 1; console.log(`  ❌ ${이름}\n     ${e.message}`); }
  }
  if (실패) { console.log(`\n❌ ${실패}개 실패`); process.exitCode = 1; } else console.log(`\n✅ ${검사.length}개 항목 통과`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
