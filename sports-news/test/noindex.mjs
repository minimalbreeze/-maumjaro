// 색인에서 빼는 도구가 안전선을 지키는지 검사.
//
// 발행된 글 수백 편을 한 번에 건드리는 도구다. 잘못 고르면 유입이 있는 글이
// 검색에서 사라진다. 고르는 눈과 값을 만드는 손을 둘 다 검사한다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noindex인가, noindex더하기, 뺄글고르기, ROBOTS_KEY } from '../src/wordpress/noindex.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[색인에서 빼기]');

// ── 값 만들기 ──────────────────────────────────────────────
check('빈 값에서도 noindex 를 만든다', () => {
  assert.deepEqual(noindex더하기(undefined), ['noindex']);
  assert.deepEqual(noindex더하기(null), ['noindex']);
  assert.deepEqual(noindex더하기([]), ['noindex']);
});

check('원래 들어 있던 다른 지시어를 지우지 않는다', () => {
  // Rank Math 는 nofollow·noarchive 를 같이 담는다. 우리 일은 색인 제외뿐이다.
  assert.deepEqual(noindex더하기(['nofollow', 'noarchive']), ['nofollow', 'noarchive', 'noindex']);
});

check('index 와 noindex 를 함께 두지 않는다', () => {
  // 둘이 같이 있으면 뜻이 충돌한다.
  const r = noindex더하기(['index', 'nofollow']);
  assert.ok(!r.includes('index'));
  assert.ok(r.includes('noindex'));
  assert.ok(r.includes('nofollow'));
});

check('이미 걸려 있으면 그대로 둔다 (중복으로 넣지 않는다)', () => {
  assert.deepEqual(noindex더하기(['noindex']), ['noindex']);
  assert.equal(noindex더하기(['noindex', 'nofollow']).filter((v) => v === 'noindex').length, 1);
});

check('문자열이 아닌 값은 버린다', () => {
  assert.deepEqual(noindex더하기([null, 42, 'nofollow']), ['nofollow', 'noindex']);
});

check('지금 상태를 바르게 읽는다', () => {
  assert.equal(noindex인가(['noindex']), true);
  assert.equal(noindex인가(['nofollow']), false);
  assert.equal(noindex인가(undefined), false);
  assert.equal(noindex인가('noindex'), false, '문자열을 배열로 착각합니다');
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

// ── 안전 ───────────────────────────────────────────────────
check('robots 칸 말고 다른 것을 쓰지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  // 본문·제목·슬러그·상태를 보내면 안 된다.
  assert.ok(!/body:\s*{[^}]*\b(content|title|slug|status)\b/.test(src), '본문·제목·슬러그·상태를 보냅니다');
  // 코드는 상수(ROBOTS_KEY)로 쓴다. 그 상수가 실제로 robots 칸을 가리키는지와,
  // meta 로 보내는 것이 그 상수 하나뿐인지를 본다.
  assert.equal(ROBOTS_KEY, 'rank_math_robots');
  assert.match(src, /meta:\s*\{\s*\[ROBOTS_KEY\]:/, 'robots 칸만 보내는 모양이 아닙니다');
  assert.ok(!/method:\s*['"]DELETE['"]/.test(src), '삭제 요청이 들어 있습니다');
});

check('미리보기가 기본이고 --apply 가 있어야 쓴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  assert.match(src, /includes\('--apply'\)/, '--apply 검사가 없습니다');
  assert.match(src, /if \(!적용\)/, '미리보기에서 빠져나가는 길이 없습니다');
});

check('모양을 확인하기 전에는 쓰지 않는다', () => {
  // Rank Math 의 robots 는 PHP 직렬화 배열이고 공개 문서가 구조를 확정해 주지
  // 않는다. 리포 지시서: 실제 필드 구조를 확인하지 않고 저장하지 않는다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  assert.match(src, /robots있음/, '칸이 열렸는지 확인하지 않습니다');
  assert.match(src, /Array\.isArray\(표본\.robots\)/, '값이 배열인지 확인하지 않습니다');
});

check('되돌릴 수 있게 원래 값을 남긴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/noindex.mjs'), 'utf8');
  assert.match(src, /saveBackup\(/);
});

// ── 플러그인 ───────────────────────────────────────────────
check('플러그인이 robots 칸을 배열로 열었다', () => {
  const php = fs.readFileSync(path.join(ROOT, 'wordpress-plugin/maumjaro-seo-rest.php'), 'utf8');
  assert.match(php, /rank_math_robots/, 'robots 칸을 열지 않았습니다');
  assert.match(php, /'type'\s*=>\s*'array'/, '배열로 등록하지 않았습니다');
  assert.match(php, /1\.1\.0/, '버전을 올리지 않았습니다');
});

check('플러그인이 아는 지시어만 받는다', () => {
  const php = fs.readFileSync(path.join(ROOT, 'wordpress-plugin/maumjaro-seo-rest.php'), 'utf8');
  assert.match(php, /MAUMJARO_SEO_ROBOTS_ALLOWED/);
  assert.match(php, /in_array\(\$one, MAUMJARO_SEO_ROBOTS_ALLOWED, true\)/);
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
