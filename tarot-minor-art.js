// 마이너 아르카나 카드 앞면 그림 — 직접 그린다.
//
// 왜 (2026-11-17 효성님 "타로 이미지는 매우 중요하다. 메인 이미지와 똑같이 만들고").
//
// 메이저 22장은 1909년 라이더-웨이트 퍼블릭 도메인 도판을 쓴다. 그런데 마이너
// 56장은 도판이 없어서 이모지 하나로 때우고 있었다. 한 벌에서 22장만 그림이고
// 56장이 이모지면 결이 갈린다 — 타로에서 그림은 곁다리가 아니라 본체다.
//
// 도판을 받아오려 했지만 이 컨테이너에서 위키미디어가 막혀 있다. 그래서 그렸다.
// ⚠️ 마이너를 지어내는 게 아니다. 마이너 핍 카드(에이스~10)는 전통적으로
//    **슈트 문양을 숫자만큼 배열한 그림**이다(마르세유 덱이 그렇다).
//    배열도 카드 그림의 관례를 그대로 따랐다 — 3은 가운데 세로, 4는 네 귀퉁이,
//    5는 네 귀퉁이와 가운데, 10은 두 줄 여덟에 가운데 둘.
// ⚠️ 색과 선은 **카드 뒷면과 같은 것**을 쓴다(검정 #0e0b1c + 금박 #e0be78).
//    새 팔레트를 만들지 않는다. 그래야 78장이 한 벌로 보인다.
// ⚠️ viewBox 도 뒷면과 같은 `0 0 120 205` 다. 같은 자리에 같은 크기로 들어간다.
(() => {
  'use strict';

  const GOLD = '#e0be78';
  const GOLD_SOFT = '#c9a45e';
  const INK = '#0e0b1c';

  // ---------- 슈트 문양 ----------
  // 각 문양은 (0,0)을 중심으로 대략 ±10 안에 그린다. 놓을 때 transform 으로 옮긴다.
  const SUIT_GLYPH = {
    // 완드 — 잎이 돋은 지팡이
    wands: `
      <path d="M0 -11 L0 11" />
      <path d="M0 -5 q-5 -2 -6 -7 q5 1 6 5" />
      <path d="M0 1 q5 -2 6 -7 q-5 1 -6 5" />
      <path d="M-2.4 11 L2.4 11" />`,
    // 컵 — 성배
    cups: `
      <path d="M-6.5 -8 L6.5 -8 Q6.5 1 0 3 Q-6.5 1 -6.5 -8 Z" />
      <path d="M0 3 L0 8" />
      <path d="M-5 10.5 Q0 7.5 5 10.5" />
      <path d="M-6.5 -5.4 L6.5 -5.4" />`,
    // 소드 — 날과 손잡이
    swords: `
      <path d="M0 -11 L2 -6 L2 4 L-2 4 L-2 -6 Z" />
      <path d="M-6 4 L6 4" />
      <path d="M0 4 L0 9" />
      <path d="M-2.6 10.6 L2.6 10.6" />`,
    // 펜타클 — 원 안의 오각별
    pentacles: `
      <circle cx="0" cy="0" r="9" />
      <path d="M0 -7.4 L4.35 6 L-7.04 -2.3 L7.04 -2.3 L-4.35 6 Z" />`,
  };

  // ---------- 핍 배열 ----------
  // [x, y] 좌표. 카드 안쪽 영역은 x 24~96(가운데 60), y 42~166 이다.
  const CX = 60; const LX = 37; const RX = 83;
  const PIPS = {
    1: [[CX, 104]],
    2: [[CX, 66], [CX, 142]],
    3: [[CX, 60], [CX, 104], [CX, 148]],
    4: [[LX, 68], [RX, 68], [LX, 140], [RX, 140]],
    5: [[LX, 66], [RX, 66], [CX, 104], [LX, 142], [RX, 142]],
    6: [[LX, 62], [RX, 62], [LX, 104], [RX, 104], [LX, 146], [RX, 146]],
    7: [[LX, 62], [RX, 62], [LX, 104], [RX, 104], [LX, 146], [RX, 146], [CX, 83]],
    8: [[LX, 58], [RX, 58], [LX, 89], [RX, 89], [LX, 119], [RX, 119], [LX, 150], [RX, 150]],
    9: [[LX, 58], [RX, 58], [LX, 89], [RX, 89], [LX, 119], [RX, 119], [LX, 150], [RX, 150], [CX, 104]],
    10: [[LX, 58], [RX, 58], [LX, 89], [RX, 89], [LX, 119], [RX, 119], [LX, 150], [RX, 150], [CX, 73], [CX, 135]],
  };

  // 숫자가 많을수록 문양을 작게 — 열 개가 서로 안 닿게.
  const PIP_SCALE = { 1: 2.5, 2: 1.5, 3: 1.35, 4: 1.3, 5: 1.2, 6: 1.1, 7: 1.05, 8: 0.95, 9: 0.9, 10: 0.88 };

  // ---------- 코트 카드 ----------
  // 사람을 그리지 않는다. 계급을 말하는 **표식**(왕관·투구·말)과 슈트 문양만 올린다.
  // 얼굴을 그리려 들면 56장이 제각각이 되고, 작게 줄이면 뭉개진다.
  const COURT = {
    // 시종은 소식을 들고 오는 사람이라 **깃발**로 적는다. 처음엔 모자로 그렸는데
    // 작게 줄이면 뭉툭한 덩어리가 되고 기사(말)와도 잘 안 갈렸다.
    11: { ko: '시종', mark: `
      <path d="M-7 12 L-7 -16" />
      <path d="M-7 -16 L11 -11 L-7 -6" />
      <path d="M-11 12 L-3 12" />
      <circle cx="-7" cy="-18.5" r="2.2" />` },
    12: { ko: '기사', mark: `
      <path d="M-11 8 L-11 -4 Q-11 -14 -1 -16 L5 -21 L7 -16 Q14 -13 14 -5 L14 8" />
      <path d="M-11 -4 L-2 -4" />
      <path d="M5 -11 L8 -11" />` },
    13: { ko: '여왕', mark: `
      <path d="M-14 6 L-11 -9 L-5 -2 L0 -12 L5 -2 L11 -9 L14 6 Z" />
      <path d="M-14 6 L14 6" />
      <circle cx="-11" cy="-11.5" r="2" />
      <circle cx="0" cy="-14.5" r="2" />
      <circle cx="11" cy="-11.5" r="2" />` },
    14: { ko: '왕', mark: `
      <path d="M-15 7 L-15 -10 L-7 -3 L0 -14 L7 -3 L15 -10 L15 7 Z" />
      <path d="M-15 7 L15 7" />
      <path d="M-15 1 L15 1" />
      <path d="M0 -14 L0 -20" />
      <path d="M-3.5 -17 L3.5 -17" />` },
  };

  function glyphAt(suit, x, y, scale) {
    return `<g transform="translate(${x} ${y}) scale(${scale})">${SUIT_GLYPH[suit]}</g>`;
  }

  // rank: 1~14 (에이스 1, 시종 11, 기사 12, 여왕 13, 왕 14)
  function faceSvg(suit, rank, pip) {
    if (!SUIT_GLYPH[suit]) return '';
    let body;
    if (rank <= 10) {
      const spots = PIPS[rank] || PIPS[1];
      const scale = PIP_SCALE[rank] || 1;
      body = spots.map(([x, y]) => glyphAt(suit, x, y, scale)).join('');
    } else {
      const c = COURT[rank] || COURT[11];
      body = `
        <g transform="translate(60 92) scale(1.35)">${c.mark}</g>
        ${glyphAt(suit, 60, 150, 1.25)}`;
    }
    return `
    <svg viewBox="0 0 120 205" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <rect width="120" height="205" fill="${INK}"/>
      <rect x="4" y="4" width="112" height="197" rx="7" fill="none" stroke="${GOLD}" stroke-width="0.9" opacity="0.55"/>
      <rect x="8.5" y="8.5" width="103" height="188" rx="5" fill="none" stroke="${GOLD_SOFT}" stroke-width="0.5" opacity="0.4"/>
      <g stroke="${GOLD}" fill="none" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round">
        ${body}
      </g>
      <text x="60" y="26" text-anchor="middle" fill="${GOLD}" font-size="13" font-weight="700"
        font-family="ui-sans-serif, system-ui, sans-serif" opacity="0.92">${pip || ''}</text>
      <path d="M26 32 L94 32" stroke="${GOLD_SOFT}" stroke-width="0.5" opacity="0.5"/>
      <path d="M26 176 L94 176" stroke="${GOLD_SOFT}" stroke-width="0.5" opacity="0.5"/>
    </svg>`;
  }

  // 카드 객체(tarot-minor-data.js 가 만든 것)를 받아 앞면 SVG 를 돌려준다.
  // 메이저이거나 모양을 모르면 빈 문자열 — 그러면 예전처럼 이모지로 떨어진다.
  function faceForCard(card) {
    if (!card || !card.suit) return '';
    const rank = rankOf(card);
    if (!rank) return '';
    return faceSvg(card.suit, rank, card.pip);
  }

  // id 로 계급을 되찾는다. 슈트마다 14장씩 22부터 이어 붙어 있다.
  function rankOf(card) {
    if (!card || typeof card.id !== 'number' || card.id < 22) return 0;
    return ((card.id - 22) % 14) + 1;
  }

  window.MaumjaroTarotArt = { faceSvg, faceForCard, rankOf, SUIT_GLYPH, PIPS, COURT };
})();
