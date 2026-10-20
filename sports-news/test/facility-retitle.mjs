// 시설 글 제목 재정리가 안전선을 지키는지 검사.
//
// 발행된 글 수십 편의 제목을 한 번에 바꾼다. 잘못 만들면 제목이 거짓말이 된다.
// 만들다가 실제로 두 번 걸렸고(모음 글, 재개장 뉴스 글) 그 두 경우를 박아 둔다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 제목분해, 새제목, 대표키워드, 다듬을거리, 주소처럼생겼나, 가는길있나 } from '../src/wordpress/facility-retitle.mjs';

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
  assert.deepEqual(제목분해(''), { 시설명: '', 주소: '', 괄호속: '' });
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

check('주소가 아닌 괄호는 주소로 세지 않는다', () => {
  const { 주소 } = 제목분해('무슨 골프장: 이용방법(언제부터 칠 수 있나?)');
  assert.equal(주소, '');
});

check('주소가 아니어도 괄호 안의 말을 버리지 않는다', () => {
  // 실제로 날아갔던 사례. 7곳이라는 사실이 제목에서 사라졌다.
  const t = '구미 파크골프장: 이용료 및 이용방법, 예약방법, 매력포인트(구미, 동락, 선산, 도개, 해평, 양포, 옥성 7곳)';
  const r = 새제목(t);
  assert.ok(r.includes('7곳'), `괄호 안의 말이 사라졌습니다: ${r}`);
  assert.ok(r.startsWith('구미 파크골프장'), '시설명이 앞에 없습니다');
});

// ── 안전 ───────────────────────────────────────────────────
check('본문·슬러그·발행상태를 보내지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/facility-retitle.mjs'), 'utf8');
  // 저장은 retitlePost 로만 한다. 그 함수가 슬러그·상태·본문을 안 보낸다.
  assert.ok(!/wpFetch\([^)]*method:\s*['"]POST['"]/s.test(src), '직접 POST 를 보냅니다');
  assert.match(src, /retitlePost\(/, '검증된 저장 경로를 쓰지 않습니다');

  const 코드만 = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/slug/.test(코드만), '슬러그를 다룹니다');

  // 2026-10-20: 전에는 소스에 'content:' 가 **있기만** 해도 실패했다. 그런데
  // 본문을 **읽는** 것은 보내는 것이 아니다 — 제목에 '가는 길' 을 넣어도 되는지
  // 가리려면 본문을 봐야 한다. 검사의 의도는 "저장할 때 본문·슬러그를 보내지
  // 않는다" 하나이므로, **저장에 넘기는 값**을 본다.
  assert.match(
    코드만,
    /return \{ title: 제목, focusKeyword: 대표키워드\(시설명\) \};/,
    '다듬을거리() 가 title·focusKeyword 말고 다른 것을 넘깁니다',
  );
  assert.match(코드만, /retitlePost\(post\.id, 바꿀값, \{ apply: true \}\)/, '저장에 넘기는 값이 바꿀값이 아닙니다');
  // 본문을 받는 wpFetch 는 읽기여야 한다 — method 를 주지 않는다(GET).
  const 본문읽기 = /wpFetch\(`\/wp\/v2\/posts\/\$\{p\.id\}`, \{ query: \{ context: 'edit' \} \}\)/.test(코드만);
  assert.ok(본문읽기, '본문을 읽는 자리가 GET 이 아닙니다');
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

// ── 가는 길이 적힌 글만 제목에 넣는다 (2026-10-20) ────────────
//
// 네이버 실측: 제목에 그 낱말이 있으면 15~30%, 없으면 1~3% 다.
//   남서울 파3 이용방법  122노출 14.8%   파주파인빌파3가는법  111노출 2.7%
//
// 없는 것을 제목에 쓰면 낚시다(CLAUDE.md ④). 본문을 보고 가른다.

// 1667 본문 65째 줄 — 실제 문장이다.
const 가는길본문 = '<p>편리한 접근성과 주변 관광지: 서울에서 약 50분 거리로 접근성이 뛰어나며, 자유로를 통해 교통 체증 없이 방문 가능합니다.</p>';

check('본문에 가는 길이 있으면 제목에 넣는다 — 1667 의 실제 본문', () => {
  assert.equal(가는길있나(가는길본문), true);
  const r = 다듬을거리({
    title: '파주 파인빌 파3 골프장: 이용료 및 이용방법, 예약방법, 매력포인트(새오리로 250)',
    content: 가는길본문,
  });
  assert.ok(r, '다듬을 것이 없다고 합니다');
  assert.match(r.title, /·가는 길/);
});

check('가는 길이 없으면 넣지 않는다', () => {
  const 없는본문 = '<p>이용료는 주중 48,000원입니다. 예약은 전화로 받습니다. 그린 상태가 좋습니다.</p>';
  assert.equal(가는길있나(없는본문), false);
  const r = 다듬을거리({
    title: '서평택골프클럽 파3 골프장: 이용료 및 이용방법, 예약방법, 매력포인트(포승향남로 218-10)',
    content: 없는본문,
  });
  assert.ok(r);
  assert.ok(!/가는 길/.test(r.title), `가는 길이 들어갔습니다: ${r.title}`);
});

check('"주차장" 만으로는 가는 길로 보지 않는다 — 시설 안내에 거의 다 나온다', () => {
  assert.equal(가는길있나('<p>주차장이 넓어 편리합니다. 주차는 무료입니다.</p>'), false);
});

check('본문이 없으면 넣지 않는다 — 모르면 쓰지 않는다', () => {
  assert.equal(가는길있나(''), false);
  assert.equal(가는길있나(null), false);
  assert.equal(가는길있나(undefined), false);
  const r = 다듬을거리({ title: '아산CC 파3 골프장: 이용료 및 이용방법, 예약방법, 매력포인트(음봉로 52-38)' });
  assert.ok(r);
  assert.ok(!/가는 길/.test(r.title));
});

check('여러 꼴의 가는 길을 읽는다', () => {
  for (const t of [
    '<p>서울에서 약 50분 거리입니다.</p>',
    '<p>내비게이션에 "대구CC" 를 치면 됩니다.</p>',
    '<p>오시는 길: 경부고속도로 나들목에서 10분.</p>',
    '<p>지하철 3호선 OO역에서 버스를 타면 됩니다.</p>',
  ]) {
    assert.equal(가는길있나(t), true, `못 읽었습니다: ${t}`);
  }
});

check('태그 안의 글자는 세지 않는다', () => {
  // class 이름 같은 데 '고속도로' 가 들어가도 본문이 아니다.
  assert.equal(가는길있나('<div class="자유로-banner"></div>'), false);
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
