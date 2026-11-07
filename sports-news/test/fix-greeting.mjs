// 글 맨 앞 인사말 걷어내기 검사.
import assert from 'node:assert/strict';
import { 인사말시작, 첫문단블록, 인사말뗀문단, 고친것, 인사말만뗐나 } from '../src/wordpress/fix-greeting.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[글 맨 앞 인사말 걷어내기]');

const 문단 = (t) => `<!-- wp:paragraph -->\n<p>${t}</p>\n<!-- /wp:paragraph -->`;

check('안녕하세요 한 문장을 떼고 다음 문장이 리드가 된다', () => {
  const 글 = 문단('안녕하세요, 골프 애호가 여러분! 오늘은 수원CC 파3 골프장을 소개할게요. 이용료를 정리했습니다.');
  const r = 고친것(글);
  assert.equal(r.뗀문장, '안녕하세요, 골프 애호가 여러분!');
  assert.ok(r.html.includes('<p>오늘은 수원CC 파3 골프장을 소개할게요.'));
  assert.ok(!r.html.includes('안녕하세요'));
});

check('반갑습니다도 뗀다', () => {
  const r = 고친것(문단('반갑습니다. 오늘은 볼링 대회를 정리합니다. 일정이 나왔습니다.'));
  assert.equal(r.뗀문장, '반갑습니다.');
});

check("'오늘은'으로 시작하는 글은 떼지 않는다 — 주제를 말하는 문장이다", () => {
  assert.equal(고친것(문단('오늘은 수원CC 파3 골프장을 소개할게요. 이용료를 정리했습니다.')), null);
});

check("'여러분'만 있는 문장도 떼지 않는다 — 세는 기준과 고치는 기준이 다르다", () => {
  assert.equal(고친것(문단('골프 팬 여러분! 오늘은 대회를 정리합니다. 일정이 나왔습니다.')), null);
});

check('인사말이 문단의 유일한 문장이면 떼지 않는다 — 빈 문단을 만들지 않는다', () => {
  assert.equal(고친것(문단('안녕하세요, 여러분!')), null);
  // 남는 글자가 너무 짧으면 그것도 떼지 않는다.
  assert.equal(고친것(문단('안녕하세요! 네.')), null);
});

check('첫 문단을 고를 때 광고·링크·이미지 문단은 건너뛴다', () => {
  const 글 = [
    '<!-- wp:paragraph -->\n<p><a href="https://coupa.ng/x">쿠팡 광고입니다 여기를 누르세요</a></p>\n<!-- /wp:paragraph -->',
    문단('안녕하세요, 야구 팬 여러분! 오늘은 한국시리즈를 정리합니다. 일정이 나왔습니다.'),
  ].join('\n\n');
  const r = 고친것(글);
  assert.equal(r.뗀문장, '안녕하세요, 야구 팬 여러분!');
  // 광고 문단은 손대지 않는다.
  assert.ok(r.html.includes('쿠팡 광고입니다'));
});

check('첫 문단이 인사말이 아니면 뒤 문단을 뒤지지 않는다', () => {
  const 글 = [
    문단('수원CC 파3 골프장은 경기도에 있습니다. 9홀 구성입니다.'),
    문단('안녕하세요, 여러분! 뒤에 있는 인사말입니다. 손대지 않습니다.'),
  ].join('\n\n');
  assert.equal(고친것(글), null);
});

check('인사말 말고 다른 것이 바뀌면 걸러낸다', () => {
  const 전 = 문단('안녕하세요, 여러분! 오늘은 대회를 정리합니다. 일정이 나왔습니다.');
  const { html } = 고친것(전);
  assert.equal(인사말만뗐나(전, html), true);
  assert.equal(인사말만뗐나(전, html.replace('일정이', '요금이')), false);
});

check('문단 블록 밖의 글자는 건드리지 않는다', () => {
  const 글 = `<!-- wp:heading -->\n<h2>안녕하세요 라는 소제목</h2>\n<!-- /wp:heading -->\n\n${문단('안녕하세요! 오늘은 대회를 정리합니다. 일정이 나왔습니다.')}`;
  const r = 고친것(글);
  assert.ok(r.html.includes('<h2>안녕하세요 라는 소제목</h2>'), '소제목의 인사말은 그대로 둔다');
});

check('인사말시작은 두 가지만 받는다', () => {
  assert.equal(인사말시작.test('안녕하세요, 여러분'), true);
  assert.equal(인사말시작.test('반갑습니다'), true);
  assert.equal(인사말시작.test('오늘은 대회를'), false);
  assert.equal(인사말시작.test('여러분!'), false);
});

check('첫문단블록이 위치를 함께 돌려준다', () => {
  const 글 = `<!-- wp:heading -->\n<h2>소제목</h2>\n<!-- /wp:heading -->\n\n${문단('첫 문단입니다. 두 문장입니다.')}`;
  const b = 첫문단블록(글);
  assert.ok(b.시작 > 0);
  assert.equal(글.slice(b.시작, b.끝), b.전체);
});

check('태그를 다시 쓰지 않는다 — p 속성이 그대로 남는다', () => {
  const 글 = '<!-- wp:paragraph -->\n<p class="has-x" id="y">안녕하세요! 오늘은 대회를 정리합니다. 일정이 나왔습니다.</p>\n<!-- /wp:paragraph -->';
  const r = 인사말뗀문단('<p class="has-x" id="y">안녕하세요! 오늘은 대회를 정리합니다. 일정이 나왔습니다.</p>');
  assert.ok(r.새속.startsWith('<p class="has-x" id="y">'));
  assert.ok(고친것(글).html.includes('class="has-x" id="y"'));
});

console.log(`\n  ${passed}개 통과`);
