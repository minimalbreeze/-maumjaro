// 메타 설명 일괄 채우기 검사.
//
// 발행된 글 수백 개를 건드리는 일이라 "건드리지 않아야 할 것"을 특히 꼼꼼히 본다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startMockWordPress } from './mock-wordpress.mjs';
import { describeFrom, findEmptyDescriptions, fillOne, 인사말빼기 } from '../src/wordpress/fill-meta.mjs';
import { ROOT } from '../src/utils/env.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[메타 설명 채우기]');

const 본문 = '<!-- wp:paragraph --><p>잠실유수지 파크골프장은 잠실동 1-1에 있습니다. '
  + '9홀 코스이고 이용료는 무료입니다. 예약은 서울시 공공서비스예약에서 합니다. '
  + '주차장이 넓어 차를 가져가기 좋습니다. 봄가을에 특히 붐빕니다.</p><!-- /wp:paragraph -->';

check('본문 첫 문단에서 설명을 뽑는다', () => {
  const d = describeFrom(본문, { focusKeyword: '잠실유수지 파크골프장' });
  assert.ok(d.startsWith('잠실유수지 파크골프장은'), d);
  assert.ok(d.length >= 60, `${d.length}자로 너무 짧습니다`);
});

check('155자를 넘지 않는다', () => {
  const 긴글 = `<p>${'아주 긴 문장입니다. '.repeat(40)}</p>`;
  assert.ok(describeFrom(긴글).length <= 155, describeFrom(긴글).length);
});

check('문장 중간에서 자르지 않는다', () => {
  const 긴글 = `<p>${'파크골프장 이용 안내입니다. '.repeat(20)}</p>`;
  const d = describeFrom(긴글);
  assert.ok(/[.!?]$|다$/.test(d), `어중간하게 끝납니다: ${d}`);
});

check('키워드가 없으면 앞에 붙인다', () => {
  const d = describeFrom(본문, { focusKeyword: '송도 파3' });
  assert.ok(d.includes('송도 파3'), d);
});

check('키워드가 이미 있으면 덧붙이지 않는다', () => {
  const d = describeFrom(본문, { focusKeyword: '잠실유수지 파크골프장' });
  assert.ok(!d.includes('정보입니다. 잠실유수지'), d);
});

check('HTML 태그와 구조화 데이터를 걷어낸다', () => {
  const d = describeFrom('<p>본문입니다. 두 번째 문장입니다.</p><script type="application/ld+json">{"@type":"FAQPage"}</script>');
  assert.ok(!d.includes('FAQPage'), d);
  assert.ok(!d.includes('<'), d);
});

check('인사말을 걷어낸다', () => {
  // 155자는 짧다. "안녕하세요, 스포츠 팬 여러분!"이 앞을 잡아먹으면
  // 검색결과에 정작 필요한 정보가 안 보인다.
  assert.equal(
    인사말빼기('안녕하세요, 스포츠 팬 여러분! 제9회 바둑춘향 선발대회가 10월 3일 남원에서 열립니다.'),
    '제9회 바둑춘향 선발대회가 10월 3일 남원에서 열립니다.');
  assert.equal(
    인사말빼기('파크골프 팬 여러분 반갑습니다! 충주 단월파크골프장이 10월 1일 재개장했습니다.'),
    '충주 단월파크골프장이 10월 1일 재개장했습니다.');
});

check('인사말만 있는 글은 지우지 않는다', () => {
  // 다 지워버리면 설명이 비어버린다. 없는 것보다는 인사말이라도 있는 게 낫다.
  assert.equal(인사말빼기('안녕하세요!'), '안녕하세요!');
  assert.equal(인사말빼기('스포츠 팬 여러분!'), '스포츠 팬 여러분!');
});

check('본문 중간의 인사말은 건드리지 않는다', () => {
  // 앞에서 한 번만 지운다. 문장 안의 말까지 지우면 뜻이 망가진다.
  const t = '김주형은 우승 후 "안녕하세요, 팬 여러분!" 이라고 인사했다. 상금은 2억원이다.';
  assert.equal(인사말빼기(t), t);
});

check('인사말로 시작하는 글도 설명이 정보로 시작한다', () => {
  const d = describeFrom('<p>안녕하세요, 스포츠 팬 여러분! 잠실유수지 파크골프장은 9홀이고 이용료는 무료입니다. 예약은 서울시 공공서비스예약에서 합니다.</p>');
  assert.ok(!d.startsWith('안녕하세요'), d);
  assert.ok(d.startsWith('잠실유수지'), d);
});

check('본문이 비면 빈 값을 돌려준다', () => {
  assert.equal(describeFrom(''), '');
  assert.equal(describeFrom('<p></p>'), '');
});

// ── 실제 경로 ──────────────────────────────────────────────
const wp = await startMockWordPress({
  posts: {
    1495: {
      status: 'publish', slug: '잠실유수지-파크골프장',
      title: { raw: '잠실유수지 파크골프장: 이용료 및 이용방법' },
      content: { raw: 본문 },
      meta: { rank_math_description: '', rank_math_focus_keyword: '잠실유수지 파크골프장' },
    },
    1500: {
      status: 'publish', slug: '서울-파크골프장',
      title: { raw: '서울 파크골프장' },
      content: { raw: 본문 },
      meta: { rank_math_description: '이미 설명이 있습니다', rank_math_focus_keyword: '서울 파크골프장' },
    },
  },
});
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

const 대상 = [{
  id: 1495, status: 'publish', slug: '잠실유수지-파크골프장',
  title: '잠실유수지 파크골프장: 이용료 및 이용방법',
  focusKeyword: '잠실유수지 파크골프장', seoTitle: '', content: 본문,
}];

const 미리 = await fillOne(대상[0], { apply: false });
check('미리보기는 저장하지 않는다', () => {
  assert.ok(미리.changed);
  assert.equal(wp.state.updated.length, 0);
  assert.equal(미리.backup, null);
});

const r = await fillOne(대상[0]);
const patch = () => wp.state.updated.find((u) => u.id === 1495);

check('메타 설명을 채운다', () => {
  assert.ok(r.changed);
  assert.ok(patch().meta.rank_math_description.startsWith('잠실유수지'), JSON.stringify(patch()));
});

check('meta 말고 아무것도 보내지 않는다', () => {
  // 제목·슬러그·상태·본문이 섞이면 발행된 글이 망가진다.
  assert.deepEqual(Object.keys(patch()).sort(), ['id', 'meta']);
  assert.deepEqual(Object.keys(patch().meta), ['rank_math_description']);
});

check('고치기 전에 원본을 남긴다', () => {
  assert.ok(r.backup && fs.existsSync(r.backup), r.backup);
  const saved = JSON.parse(fs.readFileSync(r.backup, 'utf8'));
  assert.equal(saved.id, 1495);
  assert.equal(saved.description, '', '원본은 비어 있었어야 합니다');
});

const { empty } = await findEmptyDescriptions();
check('이미 설명이 있는 글은 대상에서 뺀다', () => {
  // 사람이 공들여 쓴 설명을 덮어쓰면 안 된다.
  const ids = empty.map((e) => e.id);
  assert.ok(!ids.includes(1500), `1500번을 건드리려 합니다: ${ids.join(',')}`);
});

fs.rmSync(path.join(ROOT, 'out', 'backup'), { recursive: true, force: true });
wp.server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
