// 두 문단이 용접된 자리를 푸는 도구 검사.
//
// 2026-10-19 1693(제일CC 파3)에서 문단 세 개가 이렇게 생긴 것을 봤다.
//   "리베라CC 파3 이용료는 본 코스(비회원 평일 210,000원~ 주말 280,000원대)
//    보다 훨씬 저렴해 … 실제 이용자 제일CC 파3 골프장의 이용료는 …"
// 제일CC 요금을 보러 온 독자가 리베라CC 요금을 먼저 읽는다.
//
// 이 도구가 지키는 선은 하나다 — **앞 토막만 버린다.** 뒤 토막은 이 글의
// 제대로 된 문장이라 한 글자도 바꾸지 않는다. 새 문장을 쓰지 않으므로
// 지어낸 글자가 들어갈 여지가 없다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { 문단에서, 용접푼것, 앞토막만버렸나, 글자만, 최소버릴길이 } from '../src/wordpress/fix-glued.mjs';
import { 손대도되는글인가 } from '../src/wordpress/noindex.mjs';

const 검사 = [];
const check = (이름, fn) => 검사.push([이름, fn]);

// 1693 의 실제 문단 셋(줄여 적었다)
const 잘린문단 = '<p>이용방법은 간단합니다. 최소 2인 플레이가 원칙으로, 1인 플레이 불가예요. 티켓을 받으제일CC 파3 골프장의 이용방법은 간단합니다. 회원가입 없이 방문 가능합니다.</p>';
const 남의것문단 = '<p>리베라CC 파3 이용료는 본 코스(비회원 평일 210,000원~ 주말 280,000원대)보다 훨씬 저렴해 부담 없이 즐길 수 있습니다. 실제 이용자 제일CC 파3 골프장의 이용료는 주중과 주말로 나뉩니다.</p>';
const 깨끗한문단 = '<p>제일CC 파3 골프장은 9홀 주중 25,000원입니다. 건드리면 안 되는 문단입니다.</p>';

check('① 문장이 잘린 채 붙은 자리를 푼다', () => {
  const r = 문단에서(잘린문단, '제일CC');
  assert.ok(r, '못 찾았습니다');
  assert.match(r.표식, /잘린/);
  assert.match(글자만(r.버린것), /티켓을 받으$/, '잘린 글자까지 버리지 않았습니다');
  assert.match(글자만(r.남긴것), /^제일CC 파3 골프장의 이용방법은/);
});

check('② 앞 토막이 다른 시설 이야기인 자리를 푼다 — 띄어쓰기가 살아 있어 ①로는 못 잡는다', () => {
  // 1693 의 세 문단 중 하나가 바로 이 꼴이다. ② 가 없으면 리베라CC 요금
  // (비회원 평일 210,000원)이 제일CC 글에 그대로 남는다.
  assert.equal(문단에서(남의것문단, '제일CC'), null, '다른 이름을 안 주면 못 잡는 것이 맞습니다');
  const r = 문단에서(남의것문단, '제일CC', ['리베라CC']);
  assert.ok(r, '다른 이름을 줬는데도 못 찾았습니다');
  assert.match(r.표식, /다른 시설/);
  assert.ok(!글자만(r.남긴것).includes('리베라CC'), '리베라CC 가 남았습니다');
  assert.ok(!글자만(r.남긴것).includes('210,000'), '남의 요금이 남았습니다');
});

check('깨끗한 문단은 건드리지 않는다', () => {
  assert.equal(문단에서(깨끗한문단, '제일CC', ['리베라CC']), null);
  const r = 용접푼것(깨끗한문단, '제일CC', ['리베라CC']);
  assert.equal(r.고친것.length, 0);
  assert.equal(r.html, 깨끗한문단);
});

check('문단이 이름으로 시작하면 버릴 것이 없다', () => {
  // '제일CC 파3 …' 로 시작하는 문단은 앞 토막이 없다. 자르면 글이 사라진다.
  assert.equal(문단에서('<p>제일CC 파3 골프장 이용료는 다음과 같습니다.</p>', '제일CC'), null);
});

check('버릴 토막이 짧으면 건너뛴다 — 우연히 붙은 자리일 수 있다', () => {
  assert.ok(최소버릴길이 >= 10, '기준이 너무 낮으면 멀쩡한 문단을 자릅니다');
  assert.equal(문단에서('<p>가나제일CC 파3 골프장 이용료입니다.</p>', '제일CC'), null);
});

check('세 문단을 한 번에 풀고 앞뒤 본문은 그대로 둔다', () => {
  const 본문 = [
    '<!-- wp:heading --><h2>이용방법</h2><!-- /wp:heading -->',
    잘린문단, 남의것문단, 깨끗한문단,
    '<!-- wp:list --><ul><li>리베라CC 파3 골프장: 이용료 및 이용방법</li></ul><!-- /wp:list -->',
  ].join('\n');
  const r = 용접푼것(본문, '제일CC', ['리베라CC']);
  assert.equal(r.고친것.length, 2);
  assert.ok(r.html.includes('<h2>이용방법</h2>'), '소제목이 사라졌습니다');
  assert.ok(r.html.includes('<li>리베라CC 파3 골프장: 이용료 및 이용방법</li>'), '목록을 건드렸습니다');
  assert.ok(r.html.includes(깨끗한문단), '깨끗한 문단이 바뀌었습니다');
  assert.equal(앞토막만버렸나(본문, r.html, r.고친것), true);
});

check('앞 토막 버리기 말고 다른 것이 바뀌면 거짓이다', () => {
  const r = 용접푼것(잘린문단, '제일CC');
  assert.equal(앞토막만버렸나(잘린문단, `${r.html}<p>몰래 넣은 문단</p>`, r.고친것), false);
  assert.equal(앞토막만버렸나(잘린문단, r.html.replace('간단합니다', '복잡합니다'), r.고친것), false);
});

check('남긴 토막은 언제나 원래 문단의 뒤 토막 그대로다', () => {
  // 새 문장을 쓰지 않는다는 약속이 이 검사다. 지어낸 글자가 한 자도 없다.
  for (const 문단 of [잘린문단, 남의것문단]) {
    const r = 문단에서(문단, '제일CC', ['리베라CC']);
    assert.ok(문단.includes(r.남긴것), '남긴 토막이 원래 문단에 없습니다 — 글자를 만들었습니다');
  }
});

check('빈 값·없는 값에도 던지지 않는다', () => {
  for (const v of [undefined, null, '', 0]) {
    assert.equal(문단에서(v, '제일CC'), null);
    assert.equal(문단에서(잘린문단, v), null);
    assert.equal(typeof 용접푼것(v, '제일CC').html, 'string');
  }
});

check('미리보기가 기본이다 — apply 를 붙여야 저장한다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/fix-glued.mjs', import.meta.url), 'utf8');
  assert.match(src, /apply = false/, '기본값이 저장이면 실수로 눌렀을 때 글이 바뀝니다');
  assert.match(src, /if \(apply\) \{/, '저장을 apply 로 가두지 않았습니다');
});

check('content 하나만 보낸다 — 제목·슬러그·발행상태는 보내지 않는다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/fix-glued.mjs', import.meta.url), 'utf8');
  assert.match(src, /body:\s*\{\s*content:\s*html\s*\}/);
  assert.ok(!/body:\s*\{[^}]*status:/.test(src), '발행상태를 보냅니다');
});

check('wiki 밖의 글은 건드리지 않는다 — 우리 사이트 주소를 함께 넘긴다', () => {
  // 2026-10-19: 두 번째 인자를 빼고 불러서 **모든 글이 남의 글**이 됐다.
  // 미리보기가 5편 전부 건너뛰고 0편으로 끝났는데, 호스트 확인이 있다는
  // 것만 보던 검사는 그걸 잡지 못했다. 그래서 행동으로 본다.
  assert.equal(손대도되는글인가('https://wiki.minimalbreeze.com/a', 'https://wiki.minimalbreeze.com/'), true);
  assert.equal(손대도되는글인가('https://wiki.minimalbreeze.com/a', undefined), false,
    '주소를 안 주면 모든 글이 남의 글이 됩니다');
  const src = fs.readFileSync(new URL('../src/wordpress/fix-glued.mjs', import.meta.url), 'utf8');
  const 부름 = /손대도되는글인가\((.*)\)/.exec(src);   // wpConfig() 의 괄호까지 넘어가야 한다
  assert.ok(부름, '호스트 확인이 없습니다');
  assert.equal(부름[1].split(',').length, 2, `인자가 ${부름[1].split(',').length}개입니다: ${부름[1]}`);
  assert.match(부름[1], /wpConfig\(\)\.base/, '우리 사이트 주소를 넘기지 않습니다');
});

check('고치기 전 원본을 남긴다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/fix-glued.mjs', import.meta.url), 'utf8');
  assert.match(src, /saveContentBackup/);
  // 백업이 저장보다 먼저여야 한다 — 뒤면 되돌릴 것이 없다.
  assert.ok(src.indexOf('saveContentBackup({') < src.indexOf("method: 'POST'"), '백업이 저장보다 뒤입니다');
});

export default async function run() {
  console.log('\n[용접된 문단 풀기]');
  let 실패 = 0;
  for (const [이름, fn] of 검사) {
    try { await fn(); console.log(`  ✅ ${이름}`); } catch (e) { 실패 += 1; console.log(`  ❌ ${이름}\n     ${e.message}`); }
  }
  if (실패) { console.log(`\n❌ ${실패}개 실패`); process.exitCode = 1; } else console.log(`\n✅ ${검사.length}개 항목 통과`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
