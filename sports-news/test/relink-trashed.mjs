// 휴지통 링크를 남긴 글로 돌려주는 도구 검사.
//
// 발행된 글의 **본문**을 고치는 도구다. 잘못 만들면 사람이 쓴 문장을
// 건드리거나, 엉뚱한 글로 보내는 링크를 만든다. 깨진 링크보다 나쁘다 —
// 읽는 사람이 속는다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { href바꾸기, 고칠본문, 짝읽기 } from '../src/wordpress/relink-trashed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[휴지통 링크 돌려주기]');

const 새주소 = 'https://wiki.minimalbreeze.com/화천-산천어-파크골프장-2/';

check('죽은 슬러그로 가는 href 를 새 주소로 바꾼다', () => {
  const 전 = '<a href="https://wiki.minimalbreeze.com/화천-산천어-파크골프장/">화천 산천어</a>';
  const 후 = href바꾸기(전, ['화천-산천어-파크골프장'], 새주소);
  assert.ok(후.includes(새주소), `안 바뀌었습니다: ${후}`);
  // 사람이 보는 말은 그대로여야 한다.
  assert.ok(후.includes('>화천 산천어</a>'), '앵커 글자를 건드렸습니다');
});

check('퍼센트 인코딩으로 적힌 href 도 바꾼다 — 자동 상자가 그렇게 쓴다', () => {
  const 인코딩 = encodeURIComponent('화천-산천어-파크골프장').toLowerCase();
  const 전 = `<a href="/${인코딩}/">화천</a>`;
  assert.ok(href바꾸기(전, ['화천-산천어-파크골프장'], 새주소).includes(새주소));
});

check('쿼리·앵커가 붙은 주소도 바꾼다', () => {
  const 전 = '<a href="/화천-산천어-파크골프장/?utm=x#요금">화천</a>';
  const 후 = href바꾸기(전, ['화천-산천어-파크골프장'], 새주소);
  assert.ok(후.includes(새주소));
  assert.ok(!후.includes('utm=x'), `죽은 주소의 꼬리가 남았습니다: ${후}`);
});

check('href 가 아닌 곳의 글자는 건드리지 않는다 — 사람이 쓴 문장이다', () => {
  const 전 = '<p>예전 주소는 /화천-산천어-파크골프장/ 였습니다.</p>';
  assert.equal(href바꾸기(전, ['화천-산천어-파크골프장'], 새주소), 전);
});

check('딴 글로 가는 링크는 건드리지 않는다', () => {
  const 전 = '<a href="/남서울-cc-파3-골프장/">남서울</a>';
  assert.equal(href바꾸기(전, ['화천-산천어-파크골프장'], 새주소), 전);
});

check('새 주소가 없으면 아무것도 바꾸지 않는다 — 모르면 손대지 않는다', () => {
  const 전 = '<a href="/화천-산천어-파크골프장/">화천</a>';
  assert.equal(href바꾸기(전, ['화천-산천어-파크골프장'], ''), 전);
  assert.equal(href바꾸기(전, ['화천-산천어-파크골프장'], undefined), 전);
});

check('빈 슬러그로 모든 링크를 갈아치우지 않는다', () => {
  const 전 = '<a href="/아무글/">가</a>';
  assert.equal(href바꾸기(전, ['', null, undefined], 새주소), 전);
  assert.equal(href바꾸기(전, [], 새주소), 전);
});

check('바꿀 것이 없으면 null — 멀쩡한 글을 저장하지 않는다', () => {
  assert.equal(고칠본문({ content: '<p>아무것도 없다</p>' }, [{ 슬러그들: ['화천-산천어-파크골프장'], 새주소 }]), null);
  assert.equal(고칠본문({}, [{ 슬러그들: ['가'], 새주소 }]), null);
});

check('한 글에서 둘을 고치면 둘 다 센다', () => {
  const post = {
    content: '<a href="/대구cc-파3-골프장/">대구</a><a href="/서평택-골프클럽-파3/">서평택</a>',
  };
  const r = 고칠본문(post, [
    { 죽은슬러그: '대구cc-파3-골프장', 슬러그들: ['대구cc-파3-골프장'], 새주소: 'https://wiki.minimalbreeze.com/가/' },
    { 죽은슬러그: '서평택-골프클럽-파3', 슬러그들: ['서평택-골프클럽-파3'], 새주소: 'https://wiki.minimalbreeze.com/나/' },
  ]);
  assert.ok(r);
  assert.equal(r.바꾼것.length, 2);
  assert.ok(r.content.includes('/가/') && r.content.includes('/나/'));
});

// ── 짝 파일 ────────────────────────────────────────────────
check('짝 파일에 휴지통 5편이 모두 있고, 살릴 글이 적혀 있다', () => {
  const 짝 = 짝읽기(path.join(ROOT, 'config/relink.json'));
  assert.equal(짝.length, 5);
  for (const p of 짝) {
    assert.ok(p.죽은슬러그, '죽은 슬러그가 없습니다');
    assert.ok(Number.isInteger(p.살릴글), `살릴 글 번호가 없습니다: ${p.죽은슬러그}`);
    assert.ok(p.메모, `왜 이 짝인지 적지 않았습니다: ${p.죽은슬러그}`);
    // 살릴 글이 휴지통 글이면 휴지통으로 보내는 링크가 된다.
    assert.notEqual(p.살릴글, p.휴지통);
  }
  // 슬러그에 __trashed 를 적어 두면 안 된다 — 본문에 적힌 것은 바뀌기 전 주소다.
  for (const p of 짝) assert.ok(!/__trashed/.test(p.죽은슬러그), `${p.죽은슬러그} 에 꼬리가 붙어 있습니다`);
});

// ── 안전 ───────────────────────────────────────────────────
check('미리보기가 기본이고, 고치기 전에 본문을 남긴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/relink-trashed.mjs'), 'utf8');
  assert.match(src, /includes\('--apply'\)/);
  assert.match(src, /if \(!적용\)/);
  assert.match(src, /saveBackup\(\{ id: post\.id, title: post\.title, content: post\.content \}\)/, '원래 본문을 남기지 않습니다');
  assert.match(src, /손대도되는글인가\(p\.link, base\)/, '다른 사이트 글을 거르지 않습니다');
  // 짝을 코드가 추측하지 않는다.
  assert.match(src, /config', 'relink\.json/, '짝 파일을 읽지 않습니다');
  assert.ok(!/닮은정도|비슷한글묶기/.test(src), '짝을 코드가 추측합니다');
  // 살릴 글이 발행 상태인지 본다.
  assert.match(src, /status !== 'publish'/, '휴지통으로 보내는 링크를 만들 수 있습니다');
  // 슬러그·발행상태를 저장에 보내지 않는다.
  const 코드만 = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/body: \{ content: content, slug/.test(코드만));
  assert.match(코드만, /body: \{ content \}/, '본문만 보내지 않습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
