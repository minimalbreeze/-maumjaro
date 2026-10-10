// 오타 고치기 도구가 안전선을 지키는지 검사.
//
// 이 도구는 발행된 글 633편의 **제목과 본문**을 건드린다. 한 번 잘못 고치면
// 633편이 틀린다. 그래서 가장 세게 보는 것이 둘이다.
//
//   ① 표에 적힌 것 말고는 아무것도 안 바뀐다
//   ② 멀쩡한 낱말을 오타로 보지 않는다 ("아구찜"의 아구)
//
// 그리고 **주소(슬러그)를 보내지 않는다** — 주소가 바뀌면 네이버가 들고 있는
// 주소가 깨진다. 네이버 색인을 끊지 않는다는 안전선이다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  바로잡기, 한항목고치기, 고치기, 오타만바뀌었나, 글자거리, 한글낱말, 오타후보,
} from '../src/wordpress/typo-fix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[오타 고치기]');

check('표에 있는 오타를 고친다', () => {
  const r = 고치기('KBO리그 1236만 관중 신기록 (韓 아구 새 역사 썼다!)');
  assert.match(r.after, /韓 야구 새 역사/);
  assert.deepEqual(r.바뀐것, [{ 틀린: '아구', 맞는: '야구', 횟수: 1 }]);
});

check('본문에 여러 번 있으면 다 고친다', () => {
  const r = 고치기('아구 경기장에서 아구를 봤다');
  assert.equal(r.after, '야구 경기장에서 야구를 봤다');
  assert.equal(r.바뀐것[0].횟수, 2);
});

// ── 멀쩡한 낱말을 건드리지 않는다 ─────────────────────────
// 한국어에서 짧은 조각은 어디에나 들어 있다. `구매의도` 가점이 한 글자
// 패턴으로 "김채영"의 채, "화성시"의 화를 먹은 그 사고와 같은 종류다.
check('"아구찜" 은 그대로 둔다', () => {
  const r = 고치기('경기장 앞 아구찜 맛집');
  assert.equal(r.after, '경기장 앞 아구찜 맛집', '멀쩡한 음식 이름을 고쳤습니다');
  assert.equal(r.바뀐것.length, 0);
});

check('한 글에 오타와 멀쩡한 낱말이 같이 있어도 가른다', () => {
  const r = 고치기('韓 아구 새 역사, 경기장 앞 아구찜');
  assert.equal(r.after, '韓 야구 새 역사, 경기장 앞 아구찜');
  assert.equal(r.바뀐것[0].횟수, 1, '한 곳만 고쳐야 합니다');
});

check('오타가 없으면 글자 하나도 안 바뀐다', () => {
  const 원본 = 'KBO리그 1236만 관중 신기록 (韓 야구 새 역사 썼다!)';
  assert.equal(고치기(원본).after, 원본);
});

check('표의 모든 항목에 이유가 적혀 있다', () => {
  // 머릿속에서 만들어 넣은 항목을 막는다. 왜 오타라고 판단했는지 남겨야 한다.
  for (const 항목 of 바로잡기) {
    assert.ok(항목.틀린 && 항목.맞는, JSON.stringify(항목));
    assert.ok(항목.이유 && 항목.이유.length > 10, `이유가 없습니다: ${항목.틀린}`);
    assert.notEqual(항목.틀린, 항목.맞는);
    // 한 글자 패턴은 넣지 않는다 — 어디에나 들어 있다 (리포 규칙).
    assert.ok(항목.틀린.length >= 2, `한 글자 항목입니다: ${항목.틀린}`);
  }
});

check('가드가 붙은 항목은 가드가 실제로 동작한다', () => {
  for (const 항목 of 바로잡기.filter((x) => x.가드)) {
    const 멀쩡 = 한항목고치기(항목.틀린 + '찜', 항목);
    // 가드에 걸리는 꼴이면 횟수가 0 이어야 한다. 표마다 꼴이 다르니
    // 적어도 가드가 "무엇도 막지 않는" 정규식은 아닌지 본다.
    assert.ok(항목.가드.source.length > 2, `가드가 비었습니다: ${항목.틀린}`);
    assert.ok(멀쩡.횟수 === 0 || !항목.가드.test(항목.틀린 + '찜'),
      `가드가 동작하지 않습니다: ${항목.틀린}`);
  }
});

// ── 보내기 전 확인 ────────────────────────────────────────
console.log('\n[보내기 전 확인]');

check('표 밖의 것이 바뀌면 잡아낸다', () => {
  const before = '韓 아구 새 역사';
  const 제대로 = 고치기(before).after;
  assert.ok(오타만바뀌었나(before, 제대로));
  // 오타를 고치면서 다른 말까지 바꾼 경우
  assert.ok(!오타만바뀌었나(before, '韓 야구 새로운 역사'), '다른 변화를 통과시켰습니다');
  // 오타를 안 고치고 다른 말만 바꾼 경우
  assert.ok(!오타만바뀌었나(before, '韓 아구 새로운 역사'));
});

check('주소(슬러그)를 보내지 않는다', () => {
  // 주소가 바뀌면 네이버가 들고 있는 주소가 깨진다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/typo-fix.mjs'), 'utf8');
  const 코드 = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/\bslug\b/.test(코드), '슬러그를 보냅니다 — 네이버 색인이 끊깁니다');
  assert.ok(!/status:/.test(코드), '발행 상태를 보냅니다');
});

check('미리보기가 기본이고 --apply 가 있어야 쓴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/typo-fix.mjs'), 'utf8');
  assert.match(src, /includes\('--apply'\)/);
  assert.match(src, /if \(!적용\)/);
  assert.ok(!/method:\s*['"]DELETE['"]/.test(src), '삭제 요청이 들어 있습니다');
  assert.match(src, /손대도되는글인가/, '다른 사이트 글을 거르지 않습니다');
  assert.match(src, /saveBackup\(/, '원래 제목을 남기지 않습니다');
});

check('보내기 직전에 제목과 본문을 각각 확인한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/typo-fix.mjs'), 'utf8');
  assert.match(src, /오타만바뀌었나\(t\.post\.title, t\.제목\.after\)/, '제목 확인이 없습니다');
  assert.match(src, /오타만바뀌었나\(t\.content, t\.본문\.after\)/, '본문 확인이 없습니다');
});

// ── 오타 후보 찾기 ────────────────────────────────────────
// 찾는 쪽은 **아무것도 고치지 않는다.** 맞춤법을 코드가 판단할 수는 없으니,
// 사람이 보고 판단한 것만 표로 넘어온다.
console.log('\n[오타 후보 찾기]');

check('한 글자 차이를 센다', () => {
  assert.equal(글자거리('아구', '야구'), 1);
  assert.equal(글자거리('야구', '야구'), 0);
  assert.equal(글자거리('야구', '축구'), 1);
  assert.ok(글자거리('야구', '파크골프') >= 2);
});

check('길이가 많이 다르면 다른 말로 본다', () => {
  assert.ok(글자거리('야구', '야구장소개') > 2);
});

check('숫자·영문은 오타 판단 대상이 아니다', () => {
  assert.deepEqual(한글낱말('2026 KBO 야구 개막'), ['야구', '개막']);
  // 한 글자는 안 센다 — 어디에나 들어 있다.
  assert.deepEqual(한글낱말('그 날 비'), []);
});

check('드물게 나오고 흔한 말과 한 글자 다른 낱말을 후보로 올린다', () => {
  const 글 = [
    { id: 1, title: '韓 아구 새 역사' },
    ...Array.from({ length: 6 }, (_, i) => ({ id: 10 + i, title: `KBO 야구 소식 ${i}` })),
  ];
  const 후보 = 오타후보(글);
  const 찾음 = 후보.find((c) => c.낱말 === '아구');
  assert.ok(찾음, JSON.stringify(후보));
  assert.equal(찾음.닮은말, '야구');
  assert.equal(찾음.글[0].id, 1, '어느 글에 있는지 알려주지 않습니다');
});

check('흔한 말끼리는 후보로 올리지 않는다', () => {
  // 야구와 축구는 둘 다 흔하다. 한 글자 차이지만 오타가 아니다.
  const 글 = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: 10 + i, title: `KBO 야구 소식 ${i}` })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: 20 + i, title: `K리그 축구 소식 ${i}` })),
  ];
  assert.deepEqual(오타후보(글), []);
});

check('찾기만 할 때는 쓰기를 하지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/typo-fix.mjs'), 'utf8');
  const at = src.indexOf('if (찾기만) {');
  assert.ok(at > 0, '찾기 경로가 없습니다');
  const 몸 = src.slice(at, src.indexOf('\n  }\n', at));
  assert.ok(!/method: 'POST'/.test(몸), '찾기만 하면서 글을 씁니다');
  assert.match(몸, /return;/, '찾기 뒤에 고치는 쪽으로 흘러갑니다');
  // 화면에도 "안 고친다"고 밝힌다. 사람이 결과를 보고 다 끝났다고 믿으면 안 된다.
  assert.match(src, /아무것도 고치지 않습니다/);
  assert.match(몸, /후보일 뿐입니다/, '후보라는 사실을 알려주지 않습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
