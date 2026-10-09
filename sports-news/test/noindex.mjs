// 구글 색인에서만 빼는 도구가 안전선을 지키는지 검사.
//
// 발행된 글 수백 편을 한 번에 건드리는 도구다. 잘못 고르면 유입이 있는 글이
// 검색에서 사라진다.
//
// 2026-10-09 운영자가 짚은 것: "네이버는 색인이 잘되어 있어서". 그 전 설계는
// Rank Math 의 robots 칸에 noindex 를 넣었고, 그건 name="robots" 라 모든
// 검색엔진에게 하는 말이었다. 네이버 유입까지 끊을 뻔했다. 지금은 우리
// 플러그인이 구글에게만 말한다. 그 선을 테스트가 지킨다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 구글제외인가, 깃발세우기, 뺄글고르기, 손대도되는글인가, FLAG_KEY } from '../src/wordpress/noindex.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[색인에서 빼기]');

// ── 네이버를 끊지 않는다 (제일 중요한 선) ────────────────
check('Rank Math 의 robots 칸을 쓰지 않는다', () => {
  // rank_math_robots 는 <meta name="robots"> 를 만든다. 그건 네이버에게도
  // 하는 말이라 네이버 유입이 끊긴다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  const 주석뺀것 = src.replace(/\/\/.*$/gm, '');
  assert.ok(!/rank_math_robots/.test(주석뺀것), 'Rank Math robots 칸을 건드립니다');
  assert.equal(FLAG_KEY, 'maumjaro_google_noindex');
});

// 주석에는 "name=robots 를 쓰면 네이버까지 끊긴다"는 설명이 들어 있다.
// 그 설명은 남겨야 다음 사람이 왜 이렇게 했는지 안다. 그래서 검사는 주석을
// 걷어낸 코드만 본다.
const phpCode = () => fs.readFileSync(path.join(ROOT, 'wordpress-plugin/maumjaro-seo-rest.php'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

check('플러그인이 구글에게만 말한다', () => {
  const php = phpCode();
  assert.match(php, /name="googlebot" content="noindex"/, '구글 전용 메타를 찍지 않습니다');
  // name="robots" 를 만들면 네이버까지 끊긴다. 절대 만들지 않는다.
  assert.ok(!/name="robots"/.test(php), 'name="robots" 를 만듭니다 — 네이버까지 끊깁니다');
  const 전체 = fs.readFileSync(path.join(ROOT, 'wordpress-plugin/maumjaro-seo-rest.php'), 'utf8');
  assert.match(전체, /1\.2\.0/, '버전을 올리지 않았습니다');
});

check('깃발 값은 1 하나뿐이다', () => {
  assert.equal(깃발세우기(), '1');
  assert.equal(구글제외인가('1'), true);
  assert.equal(구글제외인가(''), false);
  assert.equal(구글제외인가(undefined), false);
  assert.equal(구글제외인가(1), false, '문자열만 받아야 합니다');
});

check('플러그인이 1 말고는 저장하지 않는다', () => {
  const php = fs.readFileSync(path.join(ROOT, 'wordpress-plugin/maumjaro-seo-rest.php'), 'utf8');
  assert.match(php, /maumjaro_seo_clean_flag/);
  // 오타 하나로 색인이 꼬이지 않게 값 자체를 못 박는다.
  assert.match(php, /\?\s*'1'\s*:\s*''/);
});

check('글 하나하나에만 붙는다 (사이트 전체가 아니다)', () => {
  const php = fs.readFileSync(path.join(ROOT, 'wordpress-plugin/maumjaro-seo-rest.php'), 'utf8');
  assert.match(php, /is_singular\('post'\)/, '글 페이지인지 확인하지 않습니다');
  assert.match(php, /get_post_meta\(get_the_ID\(\)/, '글마다 깃발을 보지 않습니다');
});

// ── 고르기 ─────────────────────────────────────────────────
const 오늘 = new Date('2026-10-09T00:00:00Z');
const 글 = [
  { id: 1, date: '2025-07-07', 글자수: 836, title: '2025 VNL 여자배구대표팀 3주차 경기 중계 및 일정, 시청방법' },
  { id: 2, date: '2025-05-12', 글자수: 1046, title: '대구CC 파3 골프장: 이용료 및 예약 방법 안내' },
  { id: 3, date: '2026-10-05', 글자수: 900, title: '어제 경기 중계 다시보기' },
  { id: 4, date: '2025-01-01', 글자수: 4200, title: '2025 KBO 중계 시청 방법 총정리' },
  { id: 5, date: '2025-06-25', 글자수: 1076, title: '2025 보은장사씨름대회 중계 일정, 시청방법' },
];

check('끝난 대회의 얇은 중계 글만 고른다', () => {
  const 대상 = 뺄글고르기(글, { 오늘 });
  assert.deepEqual(대상.map((p) => p.id).sort(), [1, 5]);
});

check('돈이 되는 시설 글은 절대 고르지 않는다', () => {
  // 운영자가 광고 클릭을 확인한 유일한 유형이다. 여기 들어가면 안 된다.
  const 대상 = 뺄글고르기(글, { 오늘 });
  assert.ok(!대상.some((p) => p.id === 2), '시설 글이 대상에 들어갔습니다');
});

check('최근 글은 고르지 않는다 (아직 색인 중일 수 있다)', () => {
  const 대상 = 뺄글고르기(글, { 오늘 });
  assert.ok(!대상.some((p) => p.id === 3));
});

check('두꺼운 글은 고르지 않는다', () => {
  const 대상 = 뺄글고르기(글, { 오늘 });
  assert.ok(!대상.some((p) => p.id === 4));
});

check('날짜가 없거나 이상하면 고르지 않는다 (지어내지 않는다)', () => {
  const 이상한글 = [
    { id: 9, date: '', 글자수: 500, title: '중계 시청방법' },
    { id: 10, date: '날짜아님', 글자수: 500, title: '중계 시청방법' },
  ];
  assert.deepEqual(뺄글고르기(이상한글, { 오늘 }), []);
});

check('얇은 것부터 돌려준다', () => {
  const 대상 = 뺄글고르기(글, { 오늘 });
  for (let i = 1; i < 대상.length; i += 1) {
    assert.ok(대상[i - 1].글자수 <= 대상[i].글자수);
  }
});

// ── 다른 사이트는 건드리지 않는다 ──────────────────────────
// 2026-10-09 운영자 지시: "wiki만 손대줘 나머진 광고돌리는 사이트야 건들지 말어"
check('같은 사이트의 글만 손댄다', () => {
  const base = 'https://wiki.minimalbreeze.com';
  assert.equal(손대도되는글인가('https://wiki.minimalbreeze.com/abc', base), true);
  assert.equal(손대도되는글인가('https://in.minimalbreeze.com/abc', base), false);
  assert.equal(손대도되는글인가('https://01.in.minimalbreeze.com/abc', base), false);
  assert.equal(손대도되는글인가('https://minimalbreeze.com/abc', base), false);
});

check('주소를 모르면 손대지 않는다', () => {
  const base = 'https://wiki.minimalbreeze.com';
  assert.equal(손대도되는글인가('', base), false);
  assert.equal(손대도되는글인가(undefined, base), false);
  assert.equal(손대도되는글인가('주소아님', base), false);
  assert.equal(손대도되는글인가('https://wiki.minimalbreeze.com/a', ''), false);
});

check('비슷하게 생긴 호스트에 속지 않는다', () => {
  const base = 'https://wiki.minimalbreeze.com';
  assert.equal(손대도되는글인가('https://wiki.minimalbreeze.com.evil.kr/a', base), false);
  assert.equal(손대도되는글인가('https://notwiki.minimalbreeze.com/a', base), false);
});

check('쓰기 직전에 호스트를 확인한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  assert.match(src, /손대도되는글인가\(p\.link, base\)/, '글마다 호스트를 확인하지 않습니다');
  assert.match(src, /대상 사이트:/, '어느 사이트를 건드리는지 보여주지 않습니다');
});

// ── 안전 ───────────────────────────────────────────────────
check('깃발 칸 말고 다른 것을 쓰지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  // 본문·제목·슬러그·상태를 보내면 안 된다.
  assert.ok(!/body:\s*{[^}]*\b(content|title|slug|status)\b/.test(src), '본문·제목·슬러그·상태를 보냅니다');
  assert.match(src, /meta:\s*\{\s*\[FLAG_KEY\]:/, '깃발 칸만 보내는 모양이 아닙니다');
  assert.ok(!/method:\s*['"]DELETE['"]/.test(src), '삭제 요청이 들어 있습니다');
});

check('미리보기가 기본이고 --apply 가 있어야 쓴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  assert.match(src, /includes\('--apply'\)/, '--apply 검사가 없습니다');
  assert.match(src, /if \(!적용\)/, '미리보기에서 빠져나가는 길이 없습니다');
});

check('칸이 열려 있지 않으면 쓰지 않는다', () => {
  // 플러그인을 안 올렸는데 쓰면 조용히 아무 일도 안 일어난다. 그걸 막는다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  assert.match(src, /칸열림/, '칸이 열렸는지 확인하지 않습니다');
  assert.match(src, /1\.2\.0/, '어느 플러그인 버전이 필요한지 알려주지 않습니다');
});

check('되돌릴 수 있게 원래 값을 남긴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  assert.match(src, /saveBackup\(/);
});

// ── 플러그인 ───────────────────────────────────────────────
check('기존 SEO 세 칸은 그대로 열려 있다', () => {
  const php = fs.readFileSync(path.join(ROOT, 'wordpress-plugin/maumjaro-seo-rest.php'), 'utf8');
  for (const k of ['rank_math_title', 'rank_math_description', 'rank_math_focus_keyword']) {
    assert.ok(php.includes(k), `${k} 가 사라졌습니다`);
  }
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
