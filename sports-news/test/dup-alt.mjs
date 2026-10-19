// 한 이미지에 alt 가 둘 들어간 것을 하나로 돌리는 도구 검사.
//
// 2026-10-19: 1650(서평택골프클럽 파3)에 '용인 88CC' 가 여섯 번 나왔다.
// 본문은 깨끗했고 전부 이미지 alt 안에 있었다 — 한 <img> 에 alt 가 둘이고,
// **중복 속성은 앞의 것이 이긴다.** 브라우저와 구글이 읽는 것은 다른
// 골프장 이름을 여덟 줄 나열한 쪽이었다.
//
// 왜 났나: fix-alt 의 HAS_ALT 가 `(.*?)` 였다. `.` 은 줄바꿈을 못 넘으므로
// 여러 줄 alt 를 없는 것으로 보고 하나 더 붙였다. 같은 파일의
// altOnlyChange 는 처음부터 `[\s\S]` 였다 — 한 파일 안에서 어긋나 있었다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { alt값들, 중복alt푼것, 한줄로, 제목에서나왔나 } from '../src/wordpress/dup-alt.mjs';
import { fillAlts, altOnlyChange, alt하나씩인가 } from '../src/wordpress/fix-alt.mjs';

const 검사 = [];
const check = (이름, fn) => 검사.push([이름, fn]);

// 1650 의 실제 태그(줄여 적었다)
const 깨진태그 = '<img src="***/image-116.png" alt="용인 88CC 파3 골프장\n용인 88CC 파3\n용인 파3 골프장\n88CC\n용인 88CC" class="wp-image-1653" style="width:526px;height:auto" alt="서평택골프클럽 파3 골프장: 이용료 및 이용방법, 예약방법, 매력포인트"/>';
const 깨진본문 = `<!-- wp:image --><figure class="wp-block-image">${깨진태그}</figure><!-- /wp:image -->\n<!-- wp:paragraph --><p>서평택골프클럽 파3 골프장은 평택시 포승읍에 있습니다.</p><!-- /wp:paragraph -->`;

check('여러 줄 alt 를 읽는다 — 이걸 못 읽어서 사고가 났다', () => {
  const 값 = alt값들(깨진태그);
  assert.equal(값.length, 2, `alt 를 ${값.length}개로 셉니다`);
  assert.match(값[0], /용인 88CC/);
  assert.match(값[1], /서평택골프클럽/);
});

check('실제 사고(1650)를 고친다 — 마지막 alt 만 남긴다', () => {
  const r = 중복alt푼것(깨진본문);
  assert.equal(r.고친것.length, 1);
  assert.match(r.고친것[0].남긴것, /서평택골프클럽/, '이 글의 alt 를 남기지 않았습니다');
  assert.equal(r.고친것[0].버린것.length, 1);
  assert.match(한줄로(r.고친것[0].버린것[0]), /용인 88CC/);
  assert.ok(!r.html.includes('용인 88CC'), '남의 골프장 이름이 남았습니다');
  assert.equal(alt값들(r.html).length, 1, 'alt 가 하나로 안 됐습니다');
});

check('본문 글자는 하나도 바뀌지 않는다', () => {
  const r = 중복alt푼것(깨진본문);
  assert.ok(r.html.includes('<p>서평택골프클럽 파3 골프장은 평택시 포승읍에 있습니다.</p>'));
  assert.ok(r.html.includes('<!-- wp:image -->'), '블록 주석이 사라졌습니다');
  assert.ok(r.html.includes('class="wp-image-1653"'), '다른 속성이 사라졌습니다');
  assert.ok(r.html.includes('style="width:526px;height:auto"'));
  assert.ok(r.html.includes('src="***/image-116.png"'));
  assert.equal(altOnlyChange(깨진본문, r.html), true, 'alt 말고 다른 것이 바뀌었습니다');
  assert.equal(alt하나씩인가(r.html), true);
});

check('alt 가 하나인 이미지는 건드리지 않는다', () => {
  const 멀쩡 = '<figure><img src="a.png" alt="제일CC 파3 골프장 이용료"/></figure>';
  const r = 중복alt푼것(멀쩡);
  assert.equal(r.고친것.length, 0);
  assert.equal(r.html, 멀쩡);
});

check('alt 가 없는 이미지도 건드리지 않는다 — 채우는 일은 fix-alt 가 한다', () => {
  const 빈것 = '<img src="a.png"/>';
  assert.equal(중복alt푼것(빈것).고친것.length, 0);
  assert.equal(중복alt푼것(빈것).html, 빈것);
});

check('셋 이상이어도 마지막 하나만 남긴다', () => {
  const t = '<img src="a.png" alt="첫째" alt="둘째" alt="셋째"/>';
  const r = 중복alt푼것(t);
  assert.equal(r.고친것[0].남긴것, '셋째');
  assert.deepEqual(r.고친것[0].버린것, ['첫째', '둘째']);
  assert.equal(alt값들(r.html).length, 1);
});

check('이미지가 여럿이면 각각 본다', () => {
  const t = `<figure>${깨진태그}</figure><p>글</p><figure><img src="b.png" alt="멀쩡한 설명"/></figure><figure>${깨진태그}</figure>`;
  const r = 중복alt푼것(t);
  assert.equal(r.고친것.length, 2, '깨진 것 둘만 고쳐야 합니다');
  assert.ok(r.html.includes('alt="멀쩡한 설명"'), '멀쩡한 이미지가 바뀌었습니다');
});

check('빈 값·없는 값에도 던지지 않는다', () => {
  for (const v of [undefined, null, '', 0]) {
    assert.deepEqual(alt값들(v), []);
    assert.equal(중복alt푼것(v).고친것.length, 0);
    assert.equal(typeof 중복alt푼것(v).html, 'string');
  }
});

check('근본 원인이 막혔다 — fix-alt 가 여러 줄 alt 를 보고 하나 더 붙이지 않는다', () => {
  // 이 검사가 사고를 재현한다. 고치기 전 fix-alt 는 채움 1 을 돌려주고
  // alt 가 둘인 태그를 만들었다.
  const 여러줄 = '<figure><img src="a.png" alt="용인 88CC 파3 골프장\n용인 88CC 파3\n88CC" class="x"/></figure>';
  const r = fillAlts(여러줄, '서평택골프클럽 파3 골프장 이용료');
  assert.equal(r.채움, 0, '이미 설명이 있는데 또 채웁니다');
  assert.equal(r.html, 여러줄, '멀쩡한 태그를 바꿨습니다');
  assert.equal(alt하나씩인가(r.html), true);
});

check('alt 가 정말 빈 이미지는 여전히 채운다 — 원래 할 일은 그대로다', () => {
  const r = fillAlts('<img src="a.png"/>', '서평택골프클럽 파3 골프장 이용료');
  assert.equal(r.채움, 1);
  assert.equal(alt값들(r.html).length, 1);
  const r2 = fillAlts('<img src="a.png" alt=""/>', '서평택골프클럽 파3 골프장 이용료');
  assert.equal(r2.채움, 1);
  assert.equal(alt값들(r2.html).length, 1);
  // 공백만 든 alt 도 비어 있는 것으로 본다.
  const r3 = fillAlts('<img src="a.png" alt="   "/>', '서평택골프클럽 파3 골프장 이용료');
  assert.equal(r3.채움, 1);
  assert.equal(alt값들(r3.html).length, 1);
});

check('alt 하나씩인가가 중복을 잡는다 — altOnlyChange 가 못 잡던 자리다', () => {
  // altOnlyChange 는 양쪽에서 alt 를 전부 지우고 비교하므로, alt 를 하나
  // **붙인** 변경을 "alt 만 바뀜"으로 보고 통과시켰다. 그 틈이 이 사고다.
  const 전 = '<img src="a.png" alt="가"/>';
  const 후 = '<img src="a.png" alt="가" alt="나"/>';
  assert.equal(altOnlyChange(전, 후), true, '이 검사의 전제가 깨졌습니다');
  assert.equal(alt하나씩인가(후), false, '중복을 못 잡습니다');
  assert.equal(alt하나씩인가(전), true);
});

check('fix-alt 가 저장 전에 중복을 막는다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/fix-alt.mjs', import.meta.url), 'utf8');
  assert.match(src, /alt하나씩인가\(html\)/, '저장 전 확인이 없습니다');
  assert.ok(src.indexOf('alt하나씩인가(html)') < src.indexOf("method: 'POST'"), '확인이 저장보다 뒤입니다');
});

check('미리보기가 기본이고 전체 적용은 막혀 있다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/dup-alt.mjs', import.meta.url), 'utf8');
  assert.match(src, /apply = false/, '기본값이 저장이면 실수로 눌렀을 때 글이 바뀝니다');
  assert.match(src, /전체 적용은 막아 두었습니다/, '번호 없이 전체 적용이 됩니다');
});

check('content 하나만 보내고, 원본을 먼저 남기고, wiki 밖은 건드리지 않는다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/dup-alt.mjs', import.meta.url), 'utf8');
  assert.match(src, /body:\s*\{\s*content:\s*html\s*\}/);
  assert.ok(!/body:\s*\{[^}]*status:/.test(src), '발행상태를 보냅니다');
  assert.ok(src.indexOf('saveContentBackup({') < src.indexOf("method: 'POST'"), '백업이 저장보다 뒤입니다');
  const 부름 = /손대도되는글인가\((.*)\)/.exec(src);
  assert.ok(부름, '호스트 확인이 없습니다');
  assert.match(부름[1], /wpConfig\(\)\.base/, '우리 사이트 주소를 넘기지 않습니다');
});

check('남길 alt 가 제목에서 나온 것인지 센다 — 네 편 보고 835장을 고칠 수는 없다', () => {
  // "마지막 alt 를 남긴다"는 규칙은 fix-alt 가 제목에서 만든 alt 를 태그
  // 끝에 붙였다는 전제에 기댄다. 349편 835장에 손대기 전에 그 전제가
  // 글마다 참인지 센다. 어긋난 글은 건너뛰고 사람이 본다.
  const 제목 = '윤석민 선수: KIA 에이스 투수에서 프로골퍼 변신 스토리(#13)';
  assert.equal(제목에서나왔나('윤석민 선수: KIA 에이스 투수에서 프로골퍼 변신 스토리 - 주요 경력', 제목), true);
  assert.equal(제목에서나왔나('기아 윤석민 사이버투수 사이버투수 은퇴', 제목), false,
    '키워드 나열을 제목에서 나온 것으로 봅니다');
  // 괄호 안 군더더기는 제목줄이기가 떼므로 거기까지 같을 필요는 없다.
  assert.equal(제목에서나왔나('윤석민 선수: KIA 에이스 투수에서 프로골퍼 변신 스토리', 제목), true);
  for (const v of [undefined, null, '']) {
    assert.equal(제목에서나왔나(v, 제목), false);
    assert.equal(제목에서나왔나('아무개', v), false);
  }
});

check('전제가 깨진 글은 저장하지 않고 건너뛴다', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/dup-alt.mjs', import.meta.url), 'utf8');
  const i = src.indexOf('어긋난것');
  const j = src.indexOf("method: 'POST'");
  assert.ok(i > 0 && i < j, '전제 확인이 저장보다 뒤입니다');
  assert.match(src, /skip: `남길 alt 가 제목에서 나온 것이 아닙니다/, '건너뛰지 않고 저장합니다');
});

export default async function run() {
  console.log('\n[한 이미지의 alt 둘]');
  let 실패 = 0;
  for (const [이름, fn] of 검사) {
    try { await fn(); console.log(`  ✅ ${이름}`); } catch (e) { 실패 += 1; console.log(`  ❌ ${이름}\n     ${e.message}`); }
  }
  if (실패) { console.log(`\n❌ ${실패}개 실패`); process.exitCode = 1; } else console.log(`\n✅ ${검사.length}개 항목 통과`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
