// 쿠팡 광고가 본문 어디에 들어가는지 보는 검사.
//
// 왜 이 검사가 필요한가 (2026-10-18)
//   운영자가 "쿠팡 클릭이 안 나는 것 같다, 클릭 날 자리를 찾아보자"고 했다.
//   코드를 보니 자리가 **두 곳으로 갈려 있었다.**
//
//     이미 올라간 글  첫 문단 뒤   ← 2026-10-15 move-coupang.mjs 로 내림
//     새로 만드는 글  가운데 소제목 앞 ← planPlacements 가 그대로 둠
//
//   9257(전국체전) 본문에서 실제로 재 보니 144문단 중 45번째, 글의 31%
//   지점이었다. 일정·중계 글의 독자는 "언제 어디서 보나"만 확인하고
//   나가므로 거기까지 내려가지 않는다.
//
//   검사가 하나도 없어서 이 어긋남이 조용히 남아 있었다. 광고는 자리가
//   틀려도 아무 소리를 내지 않는다 — 오늘 배너에서 같은 종류의 버그를 넷
//   잡았고, 이것이 다섯 번째다.
//
// 지키려는 선
//   - 광고가 글 맨 위에 오지 않는다. 첫 화면에 본문이 한 줄은 보여야 한다
//     (10-15 에 운영자가 준 모바일 캡처가 그 반대였다).
//   - 그러면서 너무 아래로 내려가지도 않는다.

import assert from 'node:assert/strict';
import { planPlacements, insertMarks, AD_MARK, IMAGE_MARK } from '../src/images/embed.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[쿠팡 광고 자리]');

const 본문 = [
  '도입부 첫 문단입니다.', '',
  '## 📅 일정', '일정 내용', '',
  '## 📺 중계', '중계 내용', '',
  '## 🏅 순위', '순위 내용', '',
  '## ❓ 자주 묻는 질문', '답',
].join('\n');

const 줄들 = (body, opts) => insertMarks(body, planPlacements(body, opts))
  .split('\n').filter((l) => l.trim());

check('광고가 글 맨 위에 오지 않는다 — 본문이 먼저 보인다', () => {
  const l = 줄들(본문, { sectionImages: 1, withAd: true });
  const 광고 = l.findIndex((x) => x.includes(AD_MARK));
  assert.ok(광고 > 0, '광고가 첫 줄입니다');
  // 광고보다 앞에 소제목이 아닌 본문 줄이 하나는 있어야 한다
  const 앞본문 = l.slice(0, 광고).filter((x) => !x.startsWith('##') && !x.startsWith('<!--'));
  assert.ok(앞본문.length >= 1, `광고 앞에 본문이 없습니다: ${l.slice(0, 광고 + 1).join(' | ')}`);
});

check('광고가 첫 소제목 앞에 들어간다 — 가운데로 내려가지 않는다', () => {
  const l = 줄들(본문, { sectionImages: 1, withAd: true });
  const 광고 = l.findIndex((x) => x.includes(AD_MARK));
  const 첫소제목 = l.findIndex((x) => x.startsWith('## '));
  assert.ok(광고 < 첫소제목, `광고(${광고})가 첫 소제목(${첫소제목}) 뒤에 있습니다`);
});

check('대표 이미지가 광고보다 앞에 온다', () => {
  // 둘이 같은 자리를 쓴다. 광고가 이미지보다 먼저 나오면 첫 화면이 광고로 시작한다.
  const l = 줄들(본문, { sectionImages: 1, withAd: true });
  const 이미지 = l.findIndex((x) => x.includes(IMAGE_MARK(0)));
  const 광고 = l.findIndex((x) => x.includes(AD_MARK));
  assert.ok(이미지 !== -1, '대표 이미지 자리가 없습니다');
  assert.ok(이미지 < 광고, `이미지(${이미지})가 광고(${광고}) 뒤에 있습니다`);
});

check('소제목이 적은 글에도 광고가 들어간다', () => {
  // 예전에는 소제목이 3개 이상이어야 광고가 들어갔다. 짧은 글은 광고가 아예
  // 빠졌는데, 그건 수익 자리를 그냥 버리는 것이다.
  const 짧은글 = ['도입부입니다.', '', '## 하나뿐인 소제목', '내용'].join('\n');
  const l = 줄들(짧은글, { sectionImages: 0, withAd: true });
  assert.ok(l.some((x) => x.includes(AD_MARK)), '소제목 1개짜리 글에 광고가 없습니다');
});

check('광고를 끄면 안 들어간다', () => {
  const l = 줄들(본문, { sectionImages: 1, withAd: false });
  assert.ok(!l.some((x) => x.includes(AD_MARK)), '광고를 껐는데 들어갔습니다');
});

check('중계 배너와 광고가 같은 자리에서 겹치지 않는다', () => {
  const l = 줄들(본문, { sectionImages: 1, withAd: true, withWatch: true });
  const 광고 = l.findIndex((x) => x.includes(AD_MARK));
  const 중계 = l.findIndex((x) => x.includes('WATCH'));
  assert.ok(중계 !== -1, '중계 배너 자리가 없습니다');
  assert.notEqual(광고, 중계, '광고와 중계 배너가 같은 줄입니다');
  assert.ok(광고 < 중계, '광고가 중계 배너보다 뒤에 있습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
