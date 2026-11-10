// 주소의 이미지를 우리 미디어에 올리기 — 검사.
import assert from 'node:assert/strict';
import {
  그림인가, 한번에최대, 그림종류, 사진링크, 사진링크안내,
} from '../src/wordpress/upload-url.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[주소의 이미지 올리기]');

const 머리 = {
  jpg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
  gif: Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(6)]),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]),
};

check('네 가지 그림을 머리 바이트로 알아본다', () => {
  for (const [ext, buf] of Object.entries(머리)) {
    assert.equal(그림인가(buf), ext, `${ext} 를 못 알아봤습니다`);
  }
});

// ⚠️ 이것이 이 검사의 핵심이다. 막힌 요청이 HTML 오류 페이지를 200 으로
//    돌려주는 일이 흔하고, Content-Type 만 믿으면 그것을 그림으로 올린다.
//    깨진 그림이 글에 박히면 독자가 먼저 본다.
check('HTML 오류 페이지를 그림으로 보지 않는다', () => {
  const html = Buffer.from('<!DOCTYPE html><html><head><title>403 Forbidden</title>');
  assert.equal(그림인가(html), null);
});

check('빈 바이트·짧은 바이트를 그림으로 보지 않는다', () => {
  assert.equal(그림인가(Buffer.alloc(0)), null);
  assert.equal(그림인가(Buffer.from([0xff, 0xd8])), null);
  assert.equal(그림인가(null), null);
  assert.equal(그림인가(undefined), null);
});

// RIFF 로 시작하지만 WEBP 가 아닌 것(WAV 등)을 걸러내는지.
check('RIFF 지만 WEBP 가 아니면 그림이 아니다', () => {
  const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
  assert.equal(그림인가(wav), null);
});

check('한 번에 받는 수에 상한이 있다', () => {
  assert.ok(Number.isInteger(한번에최대) && 한번에최대 >= 1 && 한번에최대 <= 10, `상한이 ${한번에최대} 입니다`);
});

check('올릴 수 있는 종류에 그림만 있다', () => {
  for (const [mime, ext] of Object.entries(그림종류)) {
    assert.ok(mime.startsWith('image/'), `${mime} 는 그림이 아닙니다`);
    assert.ok(/^(jpg|png|gif|webp)$/.test(ext), `${ext} 는 모르는 확장자입니다`);
  }
});

// ── 사진을 누르면 페이드캠으로 (2026-11-10 효성님 지시) ──────────────
//
// "앞으로 사진업로드 요청에는 사진 클릭 URL 에 페이드캠을 넣자.
//  페이드 캠도 다운로드 및 홍보가 되어야 한다."

check('사진 링크를 설정에서 읽는다 — 코드에 주소를 박지 않는다', () => {
  const u = 사진링크();
  assert.ok(u.startsWith('https://apps.apple.com/'), u);
  assert.ok(u.includes('id6818920687'), `페이드캠 앱 ID 가 아닙니다: ${u}`);
});

// ⚠️ 본문 배너(ct=wiki)와 섞이면 **사진을 눌러 들어온 수**를 가릴 수 없다.
check('사진 링크는 ct 를 따로 둔다 — 본문 배너와 섞이지 않게', () => {
  assert.ok(사진링크().includes('ct=wiki-photo'), 사진링크());
});

// ⚠️ 공정위 추천·보증 심사지침. 자기 앱을 남의 추천처럼 보이게 쓰면
//    표시광고법 문제가 된다(루트 지시서).
check('캡션 안내에 "내가 만든" 이 들어 있다', () => {
  assert.ok(사진링크안내.includes('내가 만든'),
    `자기 앱임을 밝혀야 합니다: ${사진링크안내}`);
});

// ⚠️ 선수 사진을 눌렀는데 앱스토어로 가면 독자가 당황한다.
check('캡션 안내가 어디로 가는지 말해 준다', () => {
  assert.ok(사진링크안내.includes('누르면'), 사진링크안내);
  assert.ok(사진링크안내.includes('페이드캠'), 사진링크안내);
});

console.log(`\n  ${passed}개 통과`);
