// 쿠팡 하단 고정 바 넣기/빼기 검사.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 바넣기, 바빼기, 바있나, 바만바뀌었나, 바HTML, 표식 } from '../src/wordpress/add-sticky.mjs';
import { ROOT } from '../src/utils/env.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[쿠팡 하단 고정 바]');

const 본문 = [
  '<!-- wp:paragraph -->',
  '<p>첫 문단입니다.</p>',
  '<!-- /wp:paragraph -->',
  '',
  '<!-- wp:heading -->',
  '<h2>소제목</h2>',
  '<!-- /wp:heading -->',
].join('\n');

check('본문 끝에 바를 넣는다', () => {
  const r = 바넣기(본문);
  assert.ok(바있나(r), '바가 없습니다');
  assert.ok(r.startsWith(본문.trimEnd()), '기존 본문이 앞에 그대로 있지 않습니다');
  assert.match(r, /<!-- wp:html -->[\s\S]*<!-- \/wp:html -->$/, 'wp:html 블록으로 감싸지 않았습니다');
});

check('두 번 넣지 않는다', () => {
  const 한번 = 바넣기(본문);
  assert.equal(바넣기(한번), null, '두 번 넣었습니다');
});

check('빼면 원래 본문으로 돌아온다', () => {
  const 한번 = 바넣기(본문);
  assert.equal(바빼기(한번), 본문.trimEnd(), '되돌리지 못했습니다');
  assert.equal(바빼기(본문), null, '없는데 뺐습니다');
});

check('바 말고 다른 것이 바뀌면 잡는다', () => {
  const 한번 = 바넣기(본문);
  assert.equal(바만바뀌었나(본문, 한번), true, '정상인데 막았습니다');
  const 망친것 = 한번.replace('첫 문단입니다.', '');
  assert.equal(바만바뀌었나(본문, 망친것), false, '본문이 지워진 것을 못 잡았습니다');
});

check('쿠팡 코드를 제휴사가 준 그대로 쓴다', () => {
  const html = 바HTML();
  const 원본 = fs.readFileSync(path.join(ROOT, 'config/ad-coupang.html'), 'utf8');
  const 주소 = /src="(https:\/\/coupa\.ng\/[A-Za-z0-9]+)"/.exec(원본);
  assert.ok(주소, '원본에서 쿠팡 위젯 주소를 찾지 못했습니다');
  assert.ok(html.includes(주소[1]), `쿠팡 위젯 주소가 다릅니다: ${주소[1]}`);
  assert.match(html, /width="100%"\s+height="44"/, '쿠팡이 준 크기를 바꿨습니다');
});

check('고지문이 바 안에 있다', () => {
  assert.match(바HTML(), /쿠팡 파트너스 활동의 일환으로/, '파트너스 고지문이 없습니다');
});

check('닫기 버튼이 있고 그 방문 동안 기억한다', () => {
  const html = 바HTML();
  assert.match(html, /id="cpst-x"/, '닫기 버튼이 없습니다');
  assert.match(html, /sessionStorage/, '닫은 것을 기억하지 않습니다');
  assert.match(html, /try\s*\{[\s\S]*sessionStorage[\s\S]*catch/, 'sessionStorage 가 막혀도 견디게 감싸지 않았습니다');
});

check('본문 마지막 줄을 덮지 않게 여백을 준다', () => {
  assert.match(바HTML(), /paddingBottom/, '아래 여백을 주지 않습니다');
});

check('화면을 가리는 전면 팝업이 아니다', () => {
  const html = 바HTML();
  assert.match(html, /position:fixed[^"]*bottom:0/, '하단 고정이 아닙니다');
  assert.ok(!/height:100%|inset:0|width:100vw|height:100vh/.test(html), '화면을 덮는 크기입니다 — 구글이 순위를 깎는 인터스티셜이 됩니다');
});

check('본문만 보낸다 — 제목·주소·발행상태를 보내지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/add-sticky.mjs'), 'utf8');
  const 보내는것 = [...src.matchAll(/body:\s*\{([^}]*)\}/g)].map((m) => m[1].trim());
  assert.deepEqual(보내는것, ['content: after'], `본문 말고 다른 것을 보냅니다: ${보내는것.join(' / ')}`);
  assert.ok(!/slug/.test(src), '주소(슬러그)를 다룹니다');
});

check('미리보기가 기본이다 — --apply 가 있어야 저장한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/add-sticky.mjs'), 'utf8');
  assert.match(src, /const apply = args\.includes\('--apply'\)/);
  assert.match(src, /if \(!apply\) continue;/);
  assert.match(src, /--빼기/, '되돌리는 길이 없습니다');
});

check('전체는 --전체 를 적었을 때만 돈다', () => {
  // 700편을 실수로 건드리지 않는다. 글 번호가 기본이고 전체는 명시해야 한다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/add-sticky.mjs'), 'utf8');
  assert.match(src, /const 전체 = args\.includes\('--전체'\)/, '--전체 플래그가 없습니다');
  assert.match(src, /if \(전체\)[\s\S]{0,200}발행글전부\(\)/, '--전체 일 때만 전부를 받아오지 않습니다');
});

check('표식이 넣기·빼기·검사에서 같은 것을 가리킨다', () => {
  assert.ok(바HTML().includes(표식), `바 HTML 에 표식이 없습니다: ${표식}`);
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
