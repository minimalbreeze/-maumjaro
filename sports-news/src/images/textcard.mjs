// 텍스트 카드 이미지.
//
// 사진 없이 제목만으로 썸네일을 만든다. 저작권 걱정이 없고, 무료이고,
// 글마다 다른 그림이 나온다. 요즘 스포츠 블로그에서 흔한 형태다.
//
// SVG로 그린 뒤 sharp로 PNG로 굽는다. 브라우저를 띄우지 않으므로 빠르다.

import sharp from 'sharp';

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

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 카드 SVG를 만든다.
 * kind: 'hero'(대표 이미지, 크게) | 'section'(본문 중간, 납작하게)
 */
export function cardSvg({ title, label = '', kind = 'hero', seed = '' }) {
  const w = 1200;
  const h = kind === 'hero' ? 630 : 400;
  const p = paletteFor(seed || label || title);
  const lines = wrapTitle(title, kind === 'hero' ? 13 : 16, kind === 'hero' ? 4 : 3);
  const fs = kind === 'hero' ? (lines.length > 3 ? 74 : 86) : 58;
  const lh = Math.round(fs * 1.28);
  const blockH = lines.length * lh;
  const startY = Math.round((h - blockH) / 2 + fs * 0.82) + (label ? 26 : 0);

  const tspans = lines
    .map((l, i) => `<tspan x="${w / 2}" y="${startY + i * lh}">${esc(l)}</tspan>`)
    .join('');

  const labelMark = label
    ? `<g>
        <rect x="${w / 2 - 140}" y="${startY - fs - 92}" width="280" height="56" rx="28" fill="${p.accent}" opacity="0.92"/>
        <text x="${w / 2}" y="${startY - fs - 53}" font-size="30" font-weight="700" fill="${p.from}"
              text-anchor="middle" font-family="${FONT_STACK}">${esc(label)}</text>
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
  <text font-size="${fs}" font-weight="800" fill="${p.ink}" text-anchor="middle"
        font-family="${FONT_STACK}" letter-spacing="-1">${tspans}</text>
  <text x="${w / 2}" y="${h - 38}" font-size="26" fill="${p.ink}" opacity="0.72"
        text-anchor="middle" font-family="${FONT_STACK}">maumjaro.minimalbreeze.com</text>
</svg>`;
}

export async function renderCard(opts) {
  const svg = cardSvg(opts);
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export { PALETTES, FONT_STACK };
