// 휴지통 때문에 깨진 링크를 세는 도구가 거짓말하지 않는지 검사.
//
// 이 도구의 숫자는 "치울 것이 남았나"를 판단하는 근거다. 0편이라고 잘못
// 말하면 깨진 링크를 통째로 지나친다. 그래서 세는 자리와 "고치지 않는다"는
// 약속을 함께 박아 둔다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 깨진것찾기 } from '../src/wordpress/broken-links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[휴지통 깨진 링크 세기]');

const 휴지통 = [
  { id: 379, slug: '서평택골프클럽-파3-골프장', title: '서평택 (짧은 쪽)' },
  { id: 1105, slug: '화천-산천어-파크골프장', title: '화천 (짧은 쪽)' },
];

check('휴지통 글을 가리키는 글을 찾는다', () => {
  const 발행글 = [
    { id: 1650, title: '서평택 (남긴 쪽)', content: '<p>보기</p>' },
    { id: 900, title: '어떤 글', content: '<a href="https://wiki.minimalbreeze.com/서평택골프클럽-파3-골프장/">보기</a>' },
  ];
  const r = 깨진것찾기(발행글, 휴지통);
  assert.equal(r.length, 1);
  assert.equal(r[0].post.id, 900);
  assert.equal(r[0].가리킨것[0].id, 379);
});

check('퍼센트 인코딩으로 적힌 링크도 찾는다 — 자동 상자가 그렇게 쓴다', () => {
  const 인코딩 = encodeURIComponent('화천-산천어-파크골프장').toLowerCase();
  const 발행글 = [{ id: 901, title: '자동 상자', content: `<a href="/${인코딩}/">화천</a>` }];
  const r = 깨진것찾기(발행글, 휴지통);
  assert.equal(r.length, 1, '인코딩된 링크를 놓쳤습니다 — 0편이라고 거짓 보고합니다');
  assert.equal(r[0].가리킨것[0].id, 1105);
});

check('한 글이 둘을 가리키면 둘 다 센다', () => {
  const 발행글 = [{
    id: 902, title: '둘 다',
    content: '<a href="/서평택골프클럽-파3-골프장/">가</a><a href="/화천-산천어-파크골프장/">나</a>',
  }];
  const r = 깨진것찾기(발행글, 휴지통);
  assert.equal(r.length, 1);
  assert.equal(r[0].가리킨것.length, 2);
});

check('가리키지 않으면 세지 않는다', () => {
  const 발행글 = [{ id: 903, title: '딴 글', content: '<a href="/남서울-cc-파3-골프장/">남서울</a>' }];
  assert.deepEqual(깨진것찾기(발행글, 휴지통), []);
});

check('휴지통이 비었거나 값이 없으면 터지지 않는다', () => {
  assert.deepEqual(깨진것찾기([{ id: 1, content: '<p>가</p>' }], []), []);
  assert.deepEqual(깨진것찾기(undefined, 휴지통), []);
  assert.deepEqual(깨진것찾기([{ id: 1 }], 휴지통), []);
  assert.deepEqual(깨진것찾기([{ id: 1, content: '<p>가</p>' }], undefined), []);
});

check('슬러그가 비어 있는 휴지통 글은 모든 글을 가리킨 것으로 세지 않는다', () => {
  // 빈 슬러그를 그대로 넣으면 '/' 를 찾아 거의 모든 글이 걸린다.
  const r = 깨진것찾기([{ id: 904, content: '<a href="/무엇/">가</a>' }], [{ id: 7, slug: '', title: '' }]);
  assert.deepEqual(r, []);
});

check('고치는 길이 이 파일에 없다 — 읽기만 한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/broken-links.mjs'), 'utf8');
  const 코드만 = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/method:\s*['"]POST['"]/.test(코드만), 'POST 를 보냅니다');
  assert.ok(!/--apply/.test(코드만), '적용 길이 있습니다');
  assert.match(src, /손대도되는글인가\(p\.link, base\)/, '다른 사이트 글을 거릅니다');
  assert.match(src, /보장은 아닙니다|보장은 없다/, '한계를 적지 않았습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
