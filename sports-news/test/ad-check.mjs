// 광고 진단이 사실을 정확히 세는지 검사.
//
// 2026-10-09: 운영자가 애드센스 게재율 63.04% 를 보고 "노출이 안 되는 것
// 같다"고 했다. 이 리포는 쿠팡 광고만 넣고 애드센스는 넣지 않는다. 추측 대신
// 실제 페이지를 받아 세기로 했고, 그 세는 눈이 정확해야 한다.
//
// 이 도구는 **읽기만 한다.** 광고 코드를 넣거나 고치거나 지우지 않는다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAdsTxt, readAdMarkup, readInstallHints } from '../src/wordpress/ad-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[광고 진단 — 읽기만 함]');

// ── ads.txt ────────────────────────────────────────────────
check('google.com 줄과 DIRECT·RESELLER 를 가른다', () => {
  const a = readAdsTxt([
    '# 주석은 세지 않는다',
    'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0',
    'google.com, pub-9999999999999999, RESELLER, f08c47fec0942fa0',
    'example.com, 1, RESELLER',
    '',
  ].join('\n'));
  assert.equal(a.줄수, 3, '주석·빈 줄을 셌습니다');
  assert.equal(a.구글줄수, 2);
  assert.equal(a.DIRECT, 1);
  assert.equal(a.RESELLER, 1);
  assert.equal(a.게시자ID있음, true);
});

check('google.com 줄이 없으면 바로 드러난다', () => {
  // 이게 없으면 애드센스가 이 사이트를 자기 것으로 못 본다.
  const a = readAdsTxt('example.com, 1, RESELLER');
  assert.equal(a.구글줄수, 0);
  assert.equal(a.게시자ID있음, false);
});

check('빈 ads.txt 를 "있다"고 하지 않는다', () => {
  for (const 빈것 of ['', '   ', '# 주석만\n\n', null, undefined]) {
    const a = readAdsTxt(빈것);
    assert.equal(a.줄수, 0, `"${빈것}" 를 줄이 있다고 셌습니다`);
    assert.equal(a.구글줄수, 0);
  }
});

check('게시자 ID 를 통째로 돌려주지 않는다', () => {
  // ads.txt 가 원래 공개하는 값이지만 로그에 흘리지 않는다.
  const a = readAdsTxt('google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0');
  assert.ok(!JSON.stringify(a).includes('pub-1234567890123456'), '게시자 ID 가 그대로 들어 있습니다');
  assert.equal(a.게시자ID있음, true);
});

// ── 페이지 마크업 ──────────────────────────────────────────
const 애드센스있는페이지 = `<html><head>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456"></script>
</head><body>
<p>본문입니다. 여기에 글이 들어갑니다.</p>
<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-1234567890123456"></ins>
<ins class="adsbygoogle" style="display:block"></ins>
<script src="https://ads-partners.coupang.com/g.js"></script>
</body></html>`;

check('애드센스 스크립트와 슬롯을 따로 센다', () => {
  const r = readAdMarkup(애드센스있는페이지);
  assert.equal(r.애드센스스크립트, 1);
  assert.equal(r.광고슬롯, 2);
  assert.equal(r.클라이언트ID있음, true);
  assert.equal(r.쿠팡, 1);
});

check('애드센스가 없는 페이지를 있다고 하지 않는다', () => {
  // 이게 틀리면 "코드는 있는데 왜 안 나오지"로 엉뚱한 곳을 판다.
  const r = readAdMarkup('<html><body><p>광고 없는 글.</p></body></html>');
  assert.equal(r.애드센스스크립트, 0);
  assert.equal(r.광고슬롯, 0);
  assert.equal(r.클라이언트ID있음, false);
});

check('자동 광고만 쓰는 상태를 구분한다', () => {
  // 스크립트는 있는데 <ins> 슬롯이 없는 경우. 둘은 다른 상태다.
  const r = readAdMarkup('<html><head><script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1"></script></head><body><p>글</p></body></html>');
  assert.equal(r.애드센스스크립트, 1);
  assert.equal(r.광고슬롯, 0);
});

check('새 창 링크를 센다', () => {
  // 전에 걷어낸 문제다. 다시 생기면 전면 광고가 막힌다.
  assert.equal(readAdMarkup('<a target="_blank">1</a><a target="_blank">2</a>').새창링크, 2);
  // 공백이 끼어도 잡는다.
  assert.equal(readAdMarkup('<a href="/x" target = "_blank">띄어쓰기</a>').새창링크, 1);
  assert.equal(readAdMarkup('<a href="/x">현재 창</a>').새창링크, 0);
});

check('본문 글자수에서 스크립트·태그를 뺀다', () => {
  // 광고 붙일 자리가 있는지 보려면 진짜 글자만 세야 한다.
  const r = readAdMarkup('<html><script>var a = "긴 스크립트 내용이 여기 들어갑니다";</script><style>.a{color:red}</style><p>본문 열 글자</p></html>');
  assert.ok(!String(r.본문글자수).includes('NaN'));
  assert.ok(r.본문글자수 < 20, `스크립트를 글자로 셌습니다: ${r.본문글자수}자`);
  assert.ok(r.본문글자수 >= 6, `본문을 못 셌습니다: ${r.본문글자수}자`);
});

// ── 어디에 깔려 있나 ───────────────────────────────────────
check('테마와 광고 플러그인을 가려낸다', () => {
  // "애드센스 가서 고쳐"는 답이 아니다. 어느 스위치인지 알려면 이게 필요하다.
  const i = readInstallHints([
    '<link href="/wp-content/themes/astra/style.css">',
    '<script src="/wp-content/plugins/google-site-kit/dist/a.js"></script>',
    '<script src="/wp-content/plugins/contact-form-7/f.js"></script>',
    '<script src="/wp-content/plugins/ad-inserter/js/ai.js"></script>',
  ].join(''));
  assert.deepEqual(i.테마, ['astra']);
  assert.deepEqual(i.광고플러그인.sort(), ['ad-inserter', 'google-site-kit']);
  // 광고와 무관한 플러그인을 광고 플러그인이라고 하지 않는다.
  assert.ok(!i.광고플러그인.includes('contact-form-7'));
  assert.ok(i.플러그인.includes('contact-form-7'), '전체 목록에는 있어야 합니다');
});

check('같은 플러그인이 여러 번 나와도 한 번만 센다', () => {
  const i = readInstallHints('/wp-content/plugins/ad-inserter/a.js /wp-content/plugins/ad-inserter/b.js');
  assert.deepEqual(i.플러그인, ['ad-inserter']);
});

check('흔적이 없으면 없다고 한다', () => {
  const i = readInstallHints('<html><body><p>아무것도 없음</p></body></html>');
  assert.deepEqual(i.테마, []);
  assert.deepEqual(i.광고플러그인, []);
  assert.equal(i.사이트킷, false);
  assert.equal(i.구글소유확인, false);
});

// ── 안전 ───────────────────────────────────────────────────
check('광고를 고치는 코드가 들어 있지 않다', () => {
  // 운영자가 "광고 관련해서는 건들지 말아줘"라고 했다. 이 파일은 읽기 전용이다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/ad-check.mjs'), 'utf8');
  assert.ok(!/method:\s*['"]POST['"]/.test(src), 'POST 로 무언가를 저장합니다');
  assert.ok(!/method:\s*['"](PUT|PATCH|DELETE)['"]/.test(src), '쓰기 요청이 들어 있습니다');
  assert.match(src, /읽기만 한다/, '읽기 전용이라는 설명이 없습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
