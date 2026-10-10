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
  바로잡기, 한항목고치기, 고치기, 오타만바뀌었나, 글자거리, 한글낱말, 오타후보, 붙은꼴인가,
} from '../src/wordpress/typo-fix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[오타 고치기]');

// 표는 **실제 글에서 확인한 것만** 들어간다 (633편 --찾기 결과).
check('표에 있는 오타를 고친다', () => {
  const r = 고치기('박성국 우승, KPGA 골프존 오픈 2025 결과 중계 다십보기(이동환 준우승)');
  assert.match(r.after, /결과 중계 다시보기/);
  assert.deepEqual(r.바뀐것, [{ 틀린: '다십보기', 맞는: '다시보기', 횟수: 1 }]);
});

check('선수 이름 오타를 고친다', () => {
  const r = 고치기('KPGA 현대해상 최경주 인비테이셔널 2025 중계 경기일정 시간(최경주, 이수민, 혹태훈 출전)');
  assert.match(r.after, /이수민, 옥태훈 출전/);
});

check('본문에 여러 번 있으면 다 고친다', () => {
  const r = 고치기('랭팅 40위의 반란, 랭팅이 말해준다');
  assert.equal(r.after, '랭킹 40위의 반란, 랭킹이 말해준다');
  assert.equal(r.바뀐것[0].횟수, 2);
});

check('오타가 없으면 글자 하나도 안 바뀐다', () => {
  const 원본 = '2025 ATP 상하이 마스터스 중계 다시보기 (랭킹 40위의 반란)';
  assert.equal(고치기(원본).after, 원본);
  assert.equal(고치기(원본).바뀐것.length, 0);
});

check('표의 모든 항목에 이유가 적혀 있다', () => {
  // 머릿속에서 만들어 넣은 항목을 막는다. 왜 오타라고 판단했는지 남겨야 한다.
  for (const 항목 of 바로잡기) {
    assert.ok(항목.틀린 && 항목.맞는, JSON.stringify(항목));
    assert.ok(항목.이유 && 항목.이유.length > 10, `이유가 없습니다: ${항목.틀린}`);
    // 이유에 글 번호가 있어야 한다 — 실제 글에서 봤다는 증거다.
    assert.match(항목.이유, /글 \d+/, `어느 글에서 봤는지 없습니다: ${항목.틀린}`);
    assert.notEqual(항목.틀린, 항목.맞는);
    // 한 글자 패턴은 넣지 않는다 — 어디에나 들어 있다 (리포 규칙).
    assert.ok(항목.틀린.length >= 2, `한 글자 항목입니다: ${항목.틀린}`);
  }
});

check('"아구" 는 표에 없다 (슬러그였다)', () => {
  // 서치콘솔 색인 실패 목록의 `韓-아구-…` 를 보고 넣었는데, 실제로는
  // **슬러그**였고 어느 제목에도 없었다. 슬러그는 이 도구가 안 건드린다.
  assert.ok(!바로잡기.some((x) => x.틀린 === '아구'), '쏠 데가 없는 항목이 다시 들어왔습니다');
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/typo-fix.mjs'), 'utf8');
  assert.match(src, /슬러그는 이 도구가 건드리지 않기로 한 바로 그것이다/);
});

// ── 멀쩡한 낱말을 건드리지 않는다 (가드) ──────────────────
// 한국어에서 짧은 조각은 어디에나 들어 있다. `구매의도` 가점이 한 글자
// 패턴으로 "김채영"의 채, "화성시"의 화를 먹은 그 사고와 같은 종류다.
// 지금 표에는 가드가 필요한 항목이 없지만, **장치는 살아 있어야 한다** —
// 다음에 그런 항목이 들어올 때 쓰인다.
const 가드표 = [{
  틀린: '아구', 맞는: '야구', 이유: '시험용 (글 0)', 가드: /아구(?:찜|아|스)/,
}];

check('가드에 걸리는 낱말은 그대로 둔다', () => {
  const r = 고치기('경기장 앞 아구찜 맛집', 가드표);
  assert.equal(r.after, '경기장 앞 아구찜 맛집', '멀쩡한 음식 이름을 고쳤습니다');
  assert.equal(r.바뀐것.length, 0);
});

check('한 글에 오타와 멀쩡한 낱말이 같이 있어도 가른다', () => {
  const r = 고치기('韓 아구 새 역사, 경기장 앞 아구찜', 가드표);
  assert.equal(r.after, '韓 야구 새 역사, 경기장 앞 아구찜');
  assert.equal(r.바뀐것[0].횟수, 1, '한 곳만 고쳐야 합니다');
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

// 실측: 633편에서 후보 275개가 나왔고 진짜 오타는 3개였다. 거짓 양성의
// 가장 큰 덩어리가 조사·합성어였다 (54개).
check('조사·합성어는 후보로 올리지 않는다', () => {
  for (const [a, b] of [
    ['포인트는', '포인트'], ['경기를', '경기'], ['상금왕', '상금'],
    ['신세계', '세계'], ['지원금', '지원'], ['박현경의', '박현경'],
  ]) {
    assert.ok(붙은꼴인가(a, b), `"${a}" ←→ "${b}" 를 못 걸러냅니다`);
  }
  // 진짜 오타 셋은 붙은꼴이 아니다 — 걸러지면 안 된다.
  for (const [a, b] of [['다십보기', '다시보기'], ['혹태훈', '옥태훈'], ['랭팅', '랭킹']]) {
    assert.ok(!붙은꼴인가(a, b), `진짜 오타를 걸러냈습니다: "${a}"`);
  }
});

check('실제로 찾아낸 오타 셋을 후보로 올린다', () => {
  // 633편에서 이 셋을 찾았다. 체가 이걸 놓치면 쓸모가 없다.
  const 글 = [
    { id: 2744, title: '박성국 우승, KPGA 골프존 오픈 2025 결과 중계 다십보기(이동환 준우승)' },
    { id: 2799, title: 'KPGA 현대해상 최경주 2025 (최경주, 이수민, 혹태훈 출전)' },
    { id: 3369, title: '바체로 우승, 2025 ATP 상하이 마스터스 중계 다시보기(랭팅 40위의 반란)' },
    ...Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, title: `대회 결과 중계 다시보기 ${i}` })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: 200 + i, title: `KPGA 옥태훈 우승 ${i}` })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: 300 + i, title: `세계 랭킹 변동 ${i}` })),
  ];
  const 낱말들 = new Set(오타후보(글).map((c) => c.낱말));
  for (const w of ['다십보기', '혹태훈', '랭팅']) {
    assert.ok(낱말들.has(w), `"${w}" 를 놓쳤습니다`);
  }
});

check('3글자 이상은 먼저 보도록 표시한다', () => {
  // 긴 낱말은 우연히 겹칠 확률이 낮다. 275개 → 15개로 줄이는 손잡이다.
  const 글 = [
    { id: 1, title: '결과 중계 다십보기' },
    { id: 2, title: '세계 랭팅 변동' },
    ...Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, title: `결과 중계 다시보기 ${i}` })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: 200 + i, title: `세계 랭킹 변동 ${i}` })),
  ];
  const 후보 = 오타후보(글);
  assert.equal(후보.find((c) => c.낱말 === '다십보기').주목, true);
  assert.equal(후보.find((c) => c.낱말 === '랭팅').주목, false);
});

check('적중률이 낮다는 것을 화면에 밝힌다', () => {
  // 목록이 길어서 "다 오타"로 읽히면 멀쩡한 말을 고치게 된다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/typo-fix.mjs'), 'utf8');
  assert.match(src, /거짓 양성이 많습니다/);
  assert.match(src, /확인 못 한 것은 두세요/);
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
