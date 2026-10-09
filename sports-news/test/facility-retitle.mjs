// 시설 글 제목 재정리가 안전선을 지키는지 검사.
//
// 발행된 글 수십 편의 제목을 한 번에 바꾼다. 잘못 만들면 제목이 거짓말이 된다.
// 만들다가 실제로 두 번 걸렸고(모음 글, 재개장 뉴스 글) 그 두 경우를 박아 둔다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 제목분해, 새제목, 대표키워드, 다듬을거리, 주소처럼생겼나 } from '../src/wordpress/facility-retitle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[시설 글 제목 재정리]');

const 원래 = '송백지구 파크골프장: 이용료 및 이용방법, 예약방법, 매력포인트(송백리 663)';

check('검색어를 맨 앞에 두고 군더더기를 덜어낸다', () => {
  assert.equal(새제목(원래), '송백지구 파크골프장 이용료·예약 방법 (송백리 663)');
  // 아무도 검색하지 않는 말이 사라져야 한다.
  assert.ok(!새제목(원래).includes('매력포인트'));
  // 시설명은 그대로 남아야 한다 — 그게 검색어다.
  assert.ok(새제목(원래).startsWith('송백지구 파크골프장'));
});

check('대표 키워드를 시설명으로 잡는다 (실측 패턴)', () => {
  // config/search-demand.md: 사람은 "시설명 + 시설종류"로 찾는다("남서울cc 파3" 월 90).
  assert.equal(대표키워드(제목분해(원래).시설명), '송백지구 파크골프장');
});

check('주소가 없어도 제목을 만든다', () => {
  assert.equal(새제목('대구CC 파3 골프장: 이용료 및 예약 방법 안내'), '대구CC 파3 골프장 이용료·예약 방법');
});

check('새 정보를 지어내지 않는다', () => {
  // 결과에 들어간 말은 전부 원래 제목에 있던 것이거나 고정 문구여야 한다.
  const r = 새제목(원래);
  assert.ok(r.includes('송백리 663'), '주소를 잃었습니다');
  assert.ok(!/\d{2,3}-\d{3,4}-\d{4}/.test(r), '전화번호를 지어냈습니다');
  assert.ok(!/원$|시간$/.test(r), '요금·시간을 지어냈습니다');
});

// ── 손대면 안 되는 글 ──────────────────────────────────────
check('여러 시설을 묶은 글은 손대지 않는다', () => {
  // 실제로 망가졌던 사례. 괄호 안이 주소가 아니라 골프장 목록이었다.
  const t = '서울 근교 파3 골프장 추천: 이용방법, 골프장별 특징과 장점(동호, 파인힐 4개 골프장)';
  assert.equal(새제목(t), '');
});

check('시설 안내 틀이 아닌 글은 손대지 않는다', () => {
  // 같은 시설을 다룬 뉴스 글에 "이용료·예약 방법"을 붙이면 제목이 거짓말이 된다.
  const t = '충주 단월파크골프장, 1억 4천만 원 공사 마치고 재개장 (언제부터 칠 수 있나?)';
  assert.equal(새제목(t), '');
  assert.equal(새제목('서울 자치구 최대 36홀 파크골프장…영등포 2구장 안양천 개장일은 언제?'), '');
});

check('이미 다듬은 글을 다시 건드리지 않는다', () => {
  const 이미 = { title: '송백지구 파크골프장 이용료·예약 방법 (송백리 663)' };
  assert.equal(다듬을거리(이미), null);
});

check('빈 제목에 터지지 않는다', () => {
  assert.equal(새제목(''), '');
  assert.equal(새제목(undefined), '');
  assert.deepEqual(제목분해(''), { 시설명: '', 주소: '' });
});

// ── 주소 판별 ──────────────────────────────────────────────
check('주소처럼 생긴 것만 주소로 본다', () => {
  assert.equal(주소처럼생겼나('송백리 663'), true);
  assert.equal(주소처럼생겼나('송도국제대로 442'), true);
  assert.equal(주소처럼생겼나('포승향남로 218-10'), true);
  // 나열은 주소가 아니다
  assert.equal(주소처럼생겼나('동호, 파인힐, 한강파3, 일산파3 4개 골프장'), false);
  // 질문도 주소가 아니다
  assert.equal(주소처럼생겼나('언제부터 칠 수 있나?'), false);
  assert.equal(주소처럼생겼나(''), false);
});

check('주소가 아닌 괄호는 떼지 않는다', () => {
  // 떼면 뜻이 사라진다.
  const { 주소 } = 제목분해('무슨 골프장: 이용방법(언제부터 칠 수 있나?)');
  assert.equal(주소, '');
});

// ── 안전 ───────────────────────────────────────────────────
check('본문·슬러그·발행상태를 보내지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/facility-retitle.mjs'), 'utf8');
  // 저장은 retitlePost 로만 한다. 그 함수가 슬러그·상태·본문을 안 보낸다.
  assert.ok(!/wpFetch\([^)]*method:\s*['"]POST['"]/s.test(src), '직접 POST 를 보냅니다');
  assert.match(src, /retitlePost\(/, '검증된 저장 경로를 쓰지 않습니다');
  assert.ok(!/slug|content:/.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')), '슬러그나 본문을 다룹니다');
});

check('미리보기가 기본이고 wiki 밖은 건너뛴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/facility-retitle.mjs'), 'utf8');
  assert.match(src, /includes\('--apply'\)/);
  assert.match(src, /if \(!적용\)/);
  assert.match(src, /손대도되는글인가\(post\.link, base\)/, '다른 사이트 글을 거르지 않습니다');
});

check('이것만으로 충분하다고 말하지 않는다', () => {
  // 정직하게 한계를 적어 두었는가. 다음 사람이 이 도구를 과신하면 안 된다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/facility-retitle.mjs'), 'utf8');
  assert.match(src, /보장은 없다|보장은 없습니다/, '한계를 적지 않았습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
