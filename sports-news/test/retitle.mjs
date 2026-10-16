// 발행된 글의 제목·메타 설명만 고치는 경로 검사.
//
// 발행된 글을 건드리는 일이라 "건드리지 않아야 할 것"을 더 꼼꼼히 본다.
// 슬러그를 바꾸면 기존 링크와 검색 순위를 통째로 잃는다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startMockWordPress } from './mock-wordpress.mjs';
import { findPosts, retitlePost, restoreFromBackup } from '../src/wordpress/retitle.mjs';
import { ROOT } from '../src/utils/env.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[제목·메타 설명 고치기]');

const 원본 = {
  status: 'publish',
  title: { raw: 'DB 대만 화이트 완파' },
  slug: 'db-대만-화이트-완파',
  content: { raw: '<p>본문입니다.</p>' },
  excerpt: { raw: '요약' },
  meta: {
    rank_math_title: '',
    rank_math_description: '',
    rank_math_focus_keyword: '',
  },
};

const wp = await startMockWordPress({
  posts: { 1234: JSON.parse(JSON.stringify(원본)) },
  existingPosts: [{ id: 1234, title: { rendered: 'DB 대만 화이트 완파' }, link: 'http://x/?p=1234', date: '2026-09-01T00:00:00', modified: '2026-09-01T00:00:00', status: 'publish' }],
});
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

const 찾음 = await findPosts('대만');
check('검색어로 글을 찾는다', () => {
  assert.ok(찾음.length >= 1, JSON.stringify(찾음));
  assert.equal(찾음[0].id, 1234);
});

// ── 미리보기 ───────────────────────────────────────────────
const 미리 = await retitlePost(1234, {
  title: 'DB 윌리엄존스컵 대만 화이트 완파 (결승 진출 확정)',
  description: '중계 보는 법과 결승 일정을 정리했습니다.',
}, { apply: false });

check('미리보기는 저장하지 않는다', () => {
  assert.ok(미리.changed);
  assert.equal(wp.state.updated.length, 0, '미리보기가 저장했습니다');
  assert.equal(미리.backup, null, '미리보기가 백업을 남겼습니다');
});

check('바뀔 내용을 전후로 보여준다', () => {
  assert.equal(미리.before.title, 'DB 대만 화이트 완파');
  assert.ok(미리.after.title.includes('윌리엄존스컵'));
});

// ── 실제 적용 ──────────────────────────────────────────────
const 적용 = await retitlePost(1234, {
  title: 'DB 윌리엄존스컵 대만 화이트 완파 (결승 진출 확정)',
  seoTitle: 'DB 윌리엄존스컵 대만전 결과와 결승 일정',
  description: '중계 보는 법과 결승 일정을 정리했습니다.',
  focusKeyword: 'DB 윌리엄존스컵',
});

const patch = () => wp.state.updated.find((u) => u.id === 1234);

check('제목과 메타를 보낸다', () => {
  assert.ok(적용.changed);
  assert.equal(patch().title, 'DB 윌리엄존스컵 대만 화이트 완파 (결승 진출 확정)');
  assert.equal(patch().meta.rank_math_description, '중계 보는 법과 결승 일정을 정리했습니다.');
  assert.equal(patch().meta.rank_math_focus_keyword, 'DB 윌리엄존스컵');
});

check('슬러그를 바꾸지 않는다', () => {
  // 바꾸면 기존 링크와 검색 순위를 통째로 잃는다.
  assert.equal(patch().slug, undefined, '슬러그를 보냈습니다');
});

check('발행 상태를 바꾸지 않는다', () => {
  assert.equal(patch().status, undefined, 'status를 보냈습니다');
  assert.equal(적용.before.status, 'publish');
});

check('본문을 건드리지 않는다', () => {
  assert.equal(patch().content, undefined, '본문을 보냈습니다');
});

check('보내는 항목이 제목과 meta뿐이다', () => {
  assert.deepEqual(Object.keys(patch()).sort(), ['id', 'meta', 'title']);
});

check('고치기 전에 원본을 파일로 남긴다', () => {
  assert.ok(적용.backup, '백업이 없습니다');
  assert.ok(fs.existsSync(적용.backup), 적용.backup);
  const saved = JSON.parse(fs.readFileSync(적용.backup, 'utf8'));
  assert.equal(saved.title, 'DB 대만 화이트 완파', '원본 제목이 아닙니다');
  assert.equal(saved.slug, 'db-대만-화이트-완파');
});

// ── 되돌리기 ───────────────────────────────────────────────
await restoreFromBackup(적용.backup);
check('백업으로 되돌릴 수 있다', () => {
  const 마지막 = wp.state.updated.filter((u) => u.id === 1234).pop();
  assert.equal(마지막.title, 'DB 대만 화이트 완파');
  assert.equal(마지막.status, undefined, '되돌릴 때도 상태를 건드리면 안 됩니다');
  assert.equal(마지막.slug, undefined, '되돌릴 때도 슬러그를 건드리면 안 됩니다');
});

const 변화없음 = await retitlePost(1234, { title: 'DB 대만 화이트 완파' });
check('바뀔 게 없으면 저장하지 않는다', () => {
  assert.equal(변화없음.changed, false);
  assert.equal(변화없음.backup, null);
});

// ── 따옴표로 시작하는 값 (2026-10-16) ─────────────────────
//
// arg() 가 앞뒤 따옴표를 무조건 벗기고 있었다. 메타 설명을
//   "남서울 CC 파3 이용료"와 "남서울 CC 파3 예약방법"을 …
// 로 쓰면 **맨 앞 따옴표가 사라져 짝이 깨진다.** 미리보기에서 잡았다.
// 셸이 문법 따옴표를 이미 먹고 넘기므로 남은 따옴표는 내용이다.
check('따옴표로 시작하는 값을 그대로 넘긴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/retitle.mjs'), 'utf8');
  // 주석에 옛 코드를 인용해 두었으므로 **함수 본문만** 본다.
  const 본문 = src.slice(src.indexOf('function arg(name)'));
  const 끝 = 본문.indexOf('\n}');
  assert.ok(끝 > 0, 'arg() 본문을 찾지 못했습니다');
  assert.ok(!/\.replace\(/.test(본문.slice(0, 끝)),
    'arg() 가 받은 값을 다시 손대고 있습니다');
});

const 따옴표설명 = '"남서울 CC 파3 이용료"와 "남서울 CC 파3 예약방법"을 정리했습니다.';
const 따옴표결과 = await retitlePost(1234, { description: 따옴표설명 });
check('따옴표가 든 메타 설명이 글자 그대로 저장된다', () => {
  const 마지막 = wp.state.updated.filter((u) => u.id === 1234).pop();
  assert.equal(마지막.meta.rank_math_description, 따옴표설명, '따옴표가 바뀌었습니다');
  assert.equal(마지막.slug, undefined, '슬러그를 보냈습니다');
  assert.ok(따옴표결과.changed);
});

// 뒷정리
fs.rmSync(path.join(ROOT, 'out', 'backup'), { recursive: true, force: true });
wp.server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
