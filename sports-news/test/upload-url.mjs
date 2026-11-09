// 주소의 이미지를 우리 미디어에 올리기 — 검사.
import assert from 'node:assert/strict';
import { 그림인가, 한번에최대, 그림종류 } from '../src/wordpress/upload-url.mjs';

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

console.log(`\n  ${passed}개 통과`);
