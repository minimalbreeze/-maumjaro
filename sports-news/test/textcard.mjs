// 텍스트 카드 이미지 검사.
//
// 한글 폰트가 없는 환경에서는 글자가 네모로 깨진다. 그림이라 눈으로 보기 전엔
// 모르므로, 렌더링된 픽셀을 세어 글자가 실제로 그려졌는지 확인한다.

import assert from 'node:assert/strict';
import sharp from 'sharp';
import { wrapTitle, paletteFor, cardSvg, renderCard, PALETTES, mixHex, inkFor, contrastRatio, shortLabel, estimateTextWidth } from '../src/images/textcard.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[텍스트 카드]');

check('긴 제목을 여러 줄로 나눈다', () => {
  const lines = wrapTitle('2026 삼성화재배 8강 신진서 vs 커제 한중 최강 재대결');
  assert.ok(lines.length >= 2 && lines.length <= 4, `${lines.length}줄`);
  assert.ok(lines.every((l) => l.length <= 18), lines.join(' / '));
});

check('짧은 제목은 한 줄로 둔다', () => {
  assert.equal(wrapTitle('KBO 순위 경쟁').length, 1);
});

check('공백 없는 긴 제목도 잘라낸다', () => {
  const lines = wrapTitle('가'.repeat(60));
  assert.ok(lines.length > 1);
  assert.ok(lines.every((l) => l.length <= 18));
});

check('같은 종목은 늘 같은 색이다', () => {
  assert.equal(paletteFor('야구').name, paletteFor('야구').name);
  assert.ok(PALETTES.includes(paletteFor('야구')));
});

check('제목의 특수문자를 이스케이프한다', () => {
  const svg = cardSvg({ title: '<script>&"위험"', seed: 'x' });
  assert.ok(!svg.includes('<script>'), 'SVG에 스크립트가 그대로 들어갔습니다');
  assert.ok(svg.includes('&lt;script&gt;'));
});

check('맘운자로 주소를 표시한다', () => {
  assert.ok(cardSvg({ title: 'x', seed: 'y' }).includes('maumjaro.minimalbreeze.com'));
});

await checkAsync('대표 이미지가 1200x630으로 나온다', async () => {
  const png = await renderCard({ title: 'KBO 포스트시즌 경쟁', label: '야구', kind: 'hero', seed: '야구' });
  const m = await sharp(png).metadata();
  assert.equal(m.width, 1200);
  assert.equal(m.height, 630);
  assert.equal(m.format, 'png');
});

await checkAsync('본문 카드가 1200x400으로 나온다', async () => {
  const png = await renderCard({ title: '관전 포인트', kind: 'section', seed: '야구' });
  const m = await sharp(png).metadata();
  assert.equal(m.height, 400);
});

await checkAsync('한글이 네모로 깨지지 않는다', async () => {
  // 글자 영역에 배경색과 다른 픽셀이 충분히 있어야 한다.
  const png = await renderCard({ title: '한글제목테스트', kind: 'hero', seed: '딥틸테스트' });
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const hist = new Map();
  for (let i = 0; i < data.length; i += info.channels) hist.set(data[i], (hist.get(data[i]) || 0) + 1);
  // 명도 종류가 몇 가지 안 되면 글자가 아예 안 그려진 것이다.
  assert.ok(hist.size > 20, `명도 종류 ${hist.size}가지 — 글자가 그려지지 않았습니다`);
});

// ── 글씨가 보이는가 ────────────────────────────────────────
// 실제로 당한 일: 라벨 알약이 280px 고정이라 긴 라벨이 밖으로 삐져나갔고,
// 삐져나간 글자는 배경과 같은 계열 색이어서 거의 보이지 않았다.
console.log('\n[글씨가 보이는가]');

check('모든 팔레트에서 본문 글자가 배경과 충분히 대비된다', () => {
  for (const p of PALETTES) {
    const bg = mixHex(p.from, p.to);
    const ratio = contrastRatio(inkFor(bg), bg);
    // WCAG AA 기준은 4.5:1. 큰 글씨라 3:1이면 되지만 넉넉히 잡는다.
    assert.ok(ratio >= 4.5, `${p.name}: ${ratio.toFixed(2)}:1`);
  }
});

check('모든 팔레트에서 라벨 글자가 알약과 충분히 대비된다', () => {
  for (const p of PALETTES) {
    const ratio = contrastRatio(inkFor(p.accent), p.accent);
    assert.ok(ratio >= 4.5, `${p.name}: ${ratio.toFixed(2)}:1`);
  }
});

check('긴 라벨을 알약 안에 들어갈 길이로 줄인다', () => {
  const short = shortLabel('피트 알론소 볼티모어 오리올스 아메리칸리그 타점왕 홈런왕');
  assert.ok(short.length <= 17, `${short.length}자: ${short}`);
  assert.ok(short.endsWith('…'), short);
});

check('짧은 라벨은 그대로 둔다', () => {
  assert.equal(shortLabel('야구'), '야구');
  assert.equal(shortLabel('배드민턴'), '배드민턴');
});

check('알약이 글자보다 넓다', () => {
  for (const label of ['야구', '파크골프', '골프 스윙', '피트 알론소 볼티모어 오리올스 아메리칸리그']) {
    const svg = cardSvg({ title: '제목입니다', label, kind: 'hero', seed: label });
    const pillW = Number(/<rect [^>]*rx="28"[^>]*width="(\d+)"/.exec(svg)?.[1]
      ?? /<rect [^>]*width="(\d+)" height="56"/.exec(svg)?.[1]);
    const textW = estimateTextWidth(shortLabel(label), 30);
    assert.ok(pillW >= textW, `"${label}": 알약 ${pillW}px < 글자 ${textW}px`);
    assert.ok(pillW <= 1200 - 100, `"${label}": 알약이 카드를 넘습니다 (${pillW}px)`);
  }
});

check('라벨이 없으면 알약을 그리지 않는다', () => {
  const svg = cardSvg({ title: '제목', label: '', kind: 'hero' });
  assert.ok(!/height="56"/.test(svg), '빈 알약이 그려졌습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
