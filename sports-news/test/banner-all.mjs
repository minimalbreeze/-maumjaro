// 배너를 발행글 전체에 돌리는 드라이버 검사.
// 네트워크를 쓰지 않는다 — 고를글/유형읽기/제한읽기는 순수 함수고,
// 전수() 는 넣기 함수와 글목록을 주입해서 돌린다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { 고를글, 유형읽기, 제한읽기, 전수 } from '../src/wordpress/banner-all.mjs';

const 검사 = [];
const check = (이름, fn) => 검사.push([이름, fn]);

const BASE = 'https://wiki.minimalbreeze.com';
const 글하나 = (id, title, host = 'wiki.minimalbreeze.com') =>
  ({ id, title, link: `https://${host}/${id}` });

check('wiki 밖의 글은 고르지 않는다', () => {
  const 글 = [
    글하나(1, '2025 KLPGA 중계 경기일정'),
    글하나(2, '2025 KLPGA 중계 경기일정', 'in.minimalbreeze.com'),
    글하나(3, '2025 KLPGA 중계 경기일정', '01.in.minimalbreeze.com'),
  ];
  const { 뽑힌것, 버린것 } = 고를글(글, { base: BASE });
  assert.deepEqual(뽑힌것.map((p) => p.id), [1]);
  assert.equal(버린것.남의사이트, 2);
});

check('주소를 읽을 수 없으면 고르지 않는다 — 모르면 안 건드린다', () => {
  const 글 = [{ id: 9, title: '중계', link: '' }, { id: 10, title: '중계' }];
  const { 뽑힌것, 버린것 } = 고를글(글, { base: BASE });
  assert.equal(뽑힌것.length, 0);
  assert.equal(버린것.남의사이트, 2);
});

check('유형을 주면 그 유형만 고른다', () => {
  const 글 = [
    글하나(1, '2025 KLPGA 챔피언십 중계 경기일정 시간'),
    글하나(2, '군위 파크골프장 이용료·예약 방법'),
    글하나(3, '어스몬다민컵 우승 상금은 얼마'),
  ];
  const { 뽑힌것, 버린것 } = 고를글(글, { base: BASE, 유형: '중계' });
  assert.deepEqual(뽑힌것.map((p) => p.id), [1]);
  assert.equal(버린것.다른유형, 2);
});

check('유형을 비우면 전부 고른다', () => {
  const 글 = [글하나(1, '중계'), 글하나(2, '파크골프장 이용료'), 글하나(3, '아무 말')];
  const { 뽑힌것 } = 고를글(글, { base: BASE });
  assert.equal(뽑힌것.length, 3);
});

check('유형·제한 꼬리말을 읽는다', () => {
  assert.equal(유형읽기(['--all', '--유형=중계']), '중계');
  assert.equal(유형읽기(['--all']), '');
  assert.equal(제한읽기(['--limit=120']), 120);
  assert.equal(제한읽기(['--limit=0']), 0);
  assert.equal(제한읽기(['--limit=abc']), 0);
  assert.equal(제한읽기(['--limit=-5']), 0);
  assert.equal(제한읽기([]), 0);
});

check('제한을 주면 그만큼만 돌린다', async () => {
  const 글 = [1, 2, 3, 4, 5].map((n) => 글하나(n, '중계'));
  const 부른것 = [];
  const 센것 = await 전수(async (id) => { 부른것.push(id); return { 한일: '넣음', url: 'u' }; },
    { 글목록: 글, base: BASE, limit: 2, 찍기: () => {} });
  assert.deepEqual(부른것, [1, 2]);
  assert.equal(센것.넣음, 2);
});

check('미리보기가 기본이다 — apply 를 넘기지 않으면 false 로 간다', async () => {
  let 받은apply = null;
  await 전수(async (id, o) => { 받은apply = o.apply; return { 한일: '넣음' }; },
    { 글목록: [글하나(1, '중계')], base: BASE, 찍기: () => {} });
  assert.equal(받은apply, false);
});

check('건너뛴 이유를 모아 센다', async () => {
  const 글 = [1, 2, 3].map((n) => 글하나(n, '중계'));
  const 센것 = await 전수(async (id) => (id === 3
    ? { 한일: '넣음' }
    : { skip: '배너가 이미 지금 모양으로 들어 있습니다' }),
  { 글목록: 글, base: BASE, 찍기: () => {} });
  assert.equal(센것.건너뜀, 2);
  assert.equal(센것.넣음, 1);
});

check('한 글이 실패해도 나머지를 계속 돌린다', async () => {
  const 글 = [1, 2, 3].map((n) => 글하나(n, '중계'));
  const 부른것 = [];
  const 센것 = await 전수(async (id) => {
    부른것.push(id);
    if (id === 2) throw new Error('일부러');
    return { 한일: '넣음' };
  }, { 글목록: 글, base: BASE, 찍기: () => {} });
  assert.deepEqual(부른것, [1, 2, 3]);
  assert.equal(센것.실패, 1);
  assert.equal(센것.넣음, 2);
  process.exitCode = 0; // 전수() 가 세운 깃발을 테스트에서 되돌린다
});

check('안전선을 새로 만들지 않고 넣기 함수에 맡긴다', () => {
  // banner-all 이 워드프레스에 직접 쓰면 add-watch·add-banner 의 검사
  // (본문만 보내기·저장 전 확인·백업)를 우회할 수 있다. 막아 둔다.
  const src = fs.readFileSync(new URL('../src/wordpress/banner-all.mjs', import.meta.url), 'utf8');
  assert.ok(!/wpFetch\(/.test(src), 'banner-all 이 wpFetch 를 직접 부릅니다');
  assert.ok(!/method:\s*'POST'/.test(src), 'banner-all 이 POST 를 직접 보냅니다');
});

check('두 도구 모두 --all 을 받는다', () => {
  for (const f of ['add-watch.mjs', 'add-banner.mjs']) {
    const src = fs.readFileSync(new URL(`../src/wordpress/${f}`, import.meta.url), 'utf8');
    assert.match(src, /includes\('--all'\)/, `${f} 에 --all 처리가 없습니다`);
    assert.match(src, /from '\.\/banner-all\.mjs'/, `${f} 가 banner-all 을 쓰지 않습니다`);
  }
});

check('건너뛴 글은 번호와 제목까지 찍는다', async () => {
  // 이유만 세면 "야구 21편" 까지는 알아도 어느 글인지 모른다. 그러면
  // 중계 주소를 어디에 쓸지 정할 수가 없다 (2026-10-19 에 두 번 막혔다).
  const 줄 = [];
  await 전수(async () => ({ skip: "'야구' 카테고리는 중계 링크가 없습니다" }), {
    글목록: [글하나(7690, 'KBO 퓨처스리그 개막'), 글하나(6828, '전국고교야구대회')],
    base: BASE, 찍기: (s) => 줄.push(s),
  });
  const 글 = 줄.join('\n');
  assert.match(글, /7690/, '글 번호가 안 찍힙니다');
  assert.match(글, /KBO 퓨처스리그 개막/, '제목이 안 찍힙니다');
  assert.match(글, /6828/);
});

check('이미 잘 들어간 글은 번호를 늘어놓지 않는다', async () => {
  // 233편이 그렇다. 전부 찍으면 정작 봐야 할 줄이 밀려난다.
  const 줄 = [];
  await 전수(async () => ({ skip: '배너가 이미 지금 모양으로 들어 있습니다' }), {
    글목록: [글하나(111, '잘 된 글')], base: BASE, 찍기: (s) => 줄.push(s),
  });
  const 글 = 줄.join('\n');
  assert.match(글, /1편/, '편수는 찍어야 합니다');
  assert.ok(!글.includes('111'), '잘 된 글 번호까지 늘어놓습니다');
});

check('너무 많으면 잘라 찍고 남은 수를 알린다', async () => {
  const 줄 = [];
  await 전수(async () => ({ skip: '설정에 없습니다' }), {
    글목록: Array.from({ length: 30 }, (_, i) => 글하나(i + 1, `글${i + 1}`)),
    base: BASE, 보여줄글: 5, 찍기: (s) => 줄.push(s),
  });
  const 글 = 줄.join('\n');
  assert.match(글, /그 밖에 25편/);
});

export default async function run() {
  console.log('\n[배너 전체 훑기]');
  let 실패 = 0;
  for (const [이름, fn] of 검사) {
    try { await fn(); console.log(`  ✅ ${이름}`); } catch (e) { 실패 += 1; console.log(`  ❌ ${이름}\n     ${e.message}`); }
  }
  if (실패) { console.log(`\n❌ ${실패}개 실패`); process.exitCode = 1; } else console.log(`\n✅ ${검사.length}개 항목 통과`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
