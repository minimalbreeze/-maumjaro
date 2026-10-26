// 텍스트 카드 이미지.
//
// 사진 없이 제목만으로 썸네일을 만든다. 저작권 걱정이 없고, 무료이고,
// 글마다 다른 그림이 나온다. 요즘 스포츠 블로그에서 흔한 형태다.
//
// SVG로 그린 뒤 sharp로 PNG로 굽는다. 브라우저를 띄우지 않으므로 빠르다.

import sharp from 'sharp';
import { execFileSync } from 'node:child_process';

// 맘운자로 브랜드 색(CLAUDE.md의 팔레트)을 그대로 쓴다.
// 스포츠 글이지만 같은 사람이 운영하는 사이트이므로 톤을 맞춘다.
const PALETTES = [
  { name: '코랄', from: '#ff9166', to: '#ffc66b', ink: '#3a1d10', accent: '#ffffff' },
  { name: '딥틸', from: '#1f5c50', to: '#2f6f5e', ink: '#ffffff', accent: '#ffc66b' },
  { name: '보라핑크', from: '#b779ef', to: '#ff8fb3', ink: '#ffffff', accent: '#fff3c4' },
  { name: '나이트', from: '#12263a', to: '#1f4468', ink: '#ffffff', accent: '#ff9166' },
];

// 설치된 한글 폰트를 순서대로 시도한다. 앞의 것이 없으면 다음으로 넘어간다.
const FONT_STACK = "'Noto Sans CJK KR','Noto Sans KR','NanumGothic','Malgun Gothic','WenQuanYi Zen Hei',sans-serif";

/** 종목 이름으로 팔레트를 고른다. 같은 종목은 늘 같은 색이라 시리즈처럼 보인다. */
export function paletteFor(seed = '') {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

/**
 * 한글 제목을 줄바꿈한다.
 * 한글은 글자 폭이 거의 일정해서 글자 수로 끊어도 잘 맞는다.
 * 단어 중간에서 끊기지 않도록 공백을 우선 본다.
 */
export function wrapTitle(text, perLine = 13, maxLines = 4) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= perLine) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // 한 단어가 너무 길면 강제로 자른다.
  return lines.flatMap((l) => (l.length <= perLine + 4 ? [l] : l.match(new RegExp(`.{1,${perLine}}`, 'g')))).slice(0, maxLines);
}

/* ── 색 대비 ────────────────────────────────────────────────
 * 글자 색을 팔레트에 박아두면 배경이 밝은 팔레트에서 글씨가 묻힌다.
 * 실제로 보라핑크 카드에서 라벨이 거의 안 보였다. 그래서 색을 고정하지 않고
 * 배경에 대고 대비를 계산해 흰색과 먹색 중 잘 보이는 쪽을 고른다.
 * 기준은 WCAG 명암비다.
 */
const DARK_INK = '#1b1023';
const LIGHT_INK = '#ffffff';

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

export function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 두 색을 반씩 섞는다 — 그라디언트 한가운데 색을 구할 때 쓴다. */
export function mixHex(a, b) {
  const [ra, ga, ba] = hexToRgb(a);
  const [rb, gb, bb] = hexToRgb(b);
  const mid = [(ra + rb) / 2, (ga + gb) / 2, (ba + bb) / 2];
  return '#' + mid.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** 이 배경 위에서 더 잘 보이는 글자색을 고른다. */
export function inkFor(bg) {
  return contrastRatio(DARK_INK, bg) >= contrastRatio(LIGHT_INK, bg) ? DARK_INK : LIGHT_INK;
}

/**
 * 라벨을 알약 안에 들어갈 길이로 줄인다.
 *
 * 예전에는 알약 폭이 280px로 고정이라, 긴 라벨이 알약 밖으로 삐져나갔다.
 * 삐져나간 글자는 배경과 같은 계열 색이어서 사실상 보이지 않았다.
 */
export function shortLabel(text, max = 16) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp >= max - 5 ? cut.slice(0, sp) : cut).trim() + '…';
}

/** 글자 폭을 어림한다. 한글·한자는 한 글자가 거의 정사각이고, 영문·숫자는 그 절반쯤이다. */
export function estimateTextWidth(text, fontSize) {
  let units = 0;
  for (const ch of String(text)) {
    if (/\s/.test(ch)) units += 0.34;
    else if (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF\u3040-\u30FF]/.test(ch)) units += 1;
    else units += 0.56;
  }
  return Math.ceil(units * fontSize);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 카드 SVG를 만든다.
 * kind: 'hero'(대표 이미지, 크게) | 'section'(본문 중간, 납작하게)
 */
export function cardSvg({ title, label = '', kind = 'hero', seed = '' }) {
  const w = 1200;
  const h = kind === 'hero' ? 630 : 400;
  const p = paletteFor(seed || label || title);
  // 글자색은 팔레트에 박지 않고 배경 한가운데 색에 대고 계산한다.
  const bgMid = mixHex(p.from, p.to);
  const ink = inkFor(bgMid);
  const lines = wrapTitle(title, kind === 'hero' ? 13 : 16, kind === 'hero' ? 4 : 3);
  const fs = kind === 'hero' ? (lines.length > 3 ? 74 : 86) : 58;
  const lh = Math.round(fs * 1.28);
  const blockH = lines.length * lh;
  const startY = Math.round((h - blockH) / 2 + fs * 0.82) + (label ? 26 : 0);

  const tspans = lines
    .map((l, i) => `<tspan x="${w / 2}" y="${startY + i * lh}">${esc(l)}</tspan>`)
    .join('');

  // 알약 폭을 글자 길이에 맞춘다. 고정 폭이면 긴 라벨이 밖으로 삐져나간다.
  const labelText = shortLabel(label);
  const labelFs = 30;
  const pillW = Math.min(w - 120, estimateTextWidth(labelText, labelFs) + 64);
  const labelInk = inkFor(p.accent);
  const labelMark = labelText
    ? `<g>
        <rect x="${Math.round(w / 2 - pillW / 2)}" y="${startY - fs - 92}" width="${pillW}" height="56" rx="28" fill="${p.accent}"/>
        <text x="${w / 2}" y="${startY - fs - 53}" font-size="${labelFs}" font-weight="700" fill="${labelInk}"
              text-anchor="middle" font-family="${FONT_STACK}">${esc(labelText)}</text>
       </g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.from}"/>
      <stop offset="100%" stop-color="${p.to}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${w - 120}" cy="${h - 90}" r="190" fill="${p.accent}" opacity="0.10"/>
  <circle cx="90" cy="70" r="130" fill="${p.accent}" opacity="0.08"/>
  ${labelMark}
  <text font-size="${fs}" font-weight="800" fill="${ink}" text-anchor="middle"
        font-family="${FONT_STACK}" letter-spacing="-1">${tspans}</text>
  <text x="${w / 2}" y="${h - 38}" font-size="26" font-weight="600" fill="${ink}" opacity="0.9"
        text-anchor="middle" font-family="${FONT_STACK}">maumjaro.minimalbreeze.com</text>
</svg>`;
}

/** 한글(자모·음절)이 들어 있나. */
export function 한글들었나(text) {
  return /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7A3]/.test(String(text || ''));
}

// 폰트 조회는 한 번만 한다. 한 번 돌 때 카드를 여러 장 그리기 때문이다.
let _한글폰트 = null;

/** 테스트에서 캐시를 비운다. */
export function 폰트검사다시(){ _한글폰트 = null; }

/**
 * 한글을 그릴 수 있는 폰트가 이 기계에 있나.
 *
 * 왜 보나 — 2026-10-26 에 리디아 고 글(11265)의 카드가 통째로 두부(□)로
 * 나갔다. 워크플로의 '한글 폰트 설치' 단계가 apt 가 매달려 5분 타임아웃에
 * 걸렸는데, `continue-on-error: true` 와 `|| echo` 때문에 **성공으로
 * 찍혔다.** 폰트가 없는 줄 모르고 카드를 그렸고, 그 글이 그대로 발행됐다.
 *
 * 폰트가 없으면 글자가 깨지는 것이 아니라 **코드포인트 상자**가 그려진다.
 * 그림만 보면 알아채기 어렵고, 발행 뒤에야 눈에 띈다. 그래서 그리기 전에
 * 막는다.
 *
 * fc-list 가 없는 기계에서는 '있다'로 본다 — 확인할 방법이 없는데 카드를
 * 막아 버리면 멀쩡한 곳에서 이미지를 잃는다.
 */
export function 한글폰트있나() {
  if (_한글폰트 !== null) return _한글폰트;
  try {
    const out = execFileSync('fc-list', [':lang=ko', 'family'], {
      encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    _한글폰트 = String(out).trim().length > 0;
  } catch (err) {
    // ENOENT = fc-list 자체가 없다. 그 밖(권한·타임아웃)도 판단 불가로 본다.
    _한글폰트 = true;
  }
  return _한글폰트;
}

export async function renderCard(opts) {
  const 글자 = `${opts?.title || ''} ${opts?.label || ''}`;
  if (한글들었나(글자) && !한글폰트있나()) {
    throw new Error(
      '한글 폰트가 없어 카드를 그리지 않았습니다 — 그리면 글자가 두부(□)로 나갑니다. '
      + 'fonts-noto-cjk 또는 fonts-nanum 을 깔고 다시 돌리세요',
    );
  }
  const svg = cardSvg(opts);
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export { PALETTES, FONT_STACK };
