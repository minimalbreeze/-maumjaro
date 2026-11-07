// 읽는 시점에 흔들리는 말 걷어내기 검사.
import assert from 'node:assert/strict';
import { 바꿀말, 고친것, 표에적힌것만바뀌었나, JSON이살아있나 } from '../src/wordpress/fix-drift.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[읽는 시점에 흔들리는 말]');

check('지난주는 뗀다 — 대회 이름이 문장에 이미 있다', () => {
  const r = 고친것('<p>지난주 포티넷 파운더스컵에서 우승한 김효주가 또 나섭니다.</p>');
  assert.equal(r.html, '<p>포티넷 파운더스컵에서 우승한 김효주가 또 나섭니다.</p>');
  assert.equal(r.기록[0].수, 1);
});

check('이번 주는 이번 대회로 바꾼다', () => {
  assert.equal(고친것('<p>이번 주 김효주의 컨디션이 관전 포인트입니다.</p>').html,
    '<p>이번 대회 김효주의 컨디션이 관전 포인트입니다.</p>');
  // 붙여 쓴 꼴도 받는다.
  assert.equal(고친것('<p>이번주도 눈을 뗄 수 없습니다.</p>').html,
    '<p>이번 대회도 눈을 뗄 수 없습니다.</p>');
});

check("'지난해'·'올해'·'내년'·'작년'은 손대지 않는다 — 어느 해인지 글이 말하지 않는다", () => {
  const 글 = '<p>지난해 77전 73승 4패였고 올해는 70경기 1패입니다. 내년과 작년도 그대로 둡니다.</p>';
  assert.equal(고친것(글).html, 글);
  assert.equal(고친것(글).기록.length, 0);
});

check("'다음 주'는 손대지 않는다 — 떼면 순서 정보를 잃는다", () => {
  const 글 = '<p>다음 주 오거스타에서도 강세를 보입니다.</p>';
  assert.equal(고친것(글).html, 글);
});

check("'지난 시즌'은 손대지 않는다 — 라벨로 쓰이는 자리가 있다", () => {
  const 글 = '<p>지난 시즌: 1승 추가</p>';
  assert.equal(고친것(글).html, 글);
});

check('조사가 붙은 꼴은 떼지 않는다 — 떼면 문장이 깨진다', () => {
  // '지난주' 뒤에 공백이 없으면 바꾸지 않는다.
  const 글 = '<p>지난주에는 비가 왔습니다.</p>';
  assert.equal(고친것(글).html, 글);
});

check('바꿀 말이 없으면 기록도 비어 있다', () => {
  const r = 고친것('<p>11월 1일 결승이 열렸습니다.</p>');
  assert.equal(r.기록.length, 0);
});

check('표에 적힌 것 말고 다른 것이 바뀌면 걸러낸다', () => {
  const 전 = '<p>지난주 대회에서 이겼습니다.</p>';
  const { html } = 고친것(전);
  assert.equal(표에적힌것만바뀌었나(전, html), true);
  // 누가 다른 글자를 끼워 넣으면 거짓이 된다.
  assert.equal(표에적힌것만바뀌었나(전, html.replace('이겼', '졌')), false);
});

check('길이가 늘어나는 항목에서도 검사가 통과한다', () => {
  const 전 = '<p>이번 주 열립니다.</p>';
  const { html } = 고친것(전);
  assert.ok(html.length > 전.length);
  assert.equal(표에적힌것만바뀌었나(전, html), true);
});

check('구조화 데이터가 읽히는지 본다', () => {
  const 좋음 = '<script type="application/ld+json">{"@type":"FAQPage"}</script>';
  assert.equal(JSON이살아있나(좋음), true);
  assert.equal(JSON이살아있나('<script type="application/ld+json">{"@type":}</script>'), false);
  // JSON-LD 가 없는 글은 통과다.
  assert.equal(JSON이살아있나('<p>글입니다.</p>'), true);
});

check('구조화 데이터 안의 문장도 본문과 같이 바뀐다 — 어긋나지 않게', () => {
  const 전 = '<p>이번 주 열립니다.</p><script type="application/ld+json">{"q":"이번 주 열립니다."}</script>';
  const { html } = 고친것(전);
  assert.ok(html.includes('{"q":"이번 대회 열립니다."}'));
  assert.equal(JSON이살아있나(html), true);
});

check('표의 모든 항목에 바꿀 말과 이유가 적혀 있다', () => {
  assert.ok(바꿀말.length >= 8);
  for (const x of 바꿀말) {
    assert.equal(typeof x.전, 'string');
    assert.ok(x.전.length > 0, '바꿀 말이 비어 있다');
    assert.equal(typeof x.후, 'string');
    assert.ok(x.왜 && x.왜.length > 4, `${x.전} 에 이유가 없다`);
    // '해'·'년'이 든 말은 표에 없어야 한다 — 연도를 지어내게 된다.
    assert.ok(!/해|년/.test(x.전), `${x.전} 은 연도를 지어내게 된다`);
  }
});

console.log(`\n  ${passed}개 통과`);
