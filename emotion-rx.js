// 감정 → 처방 잇기
//
// 왜 만들었나:
// 효성님이 "감정이 오늘의 처방에 반영이 안 된 것 같다"고 했고, 코드를 보니 맞았다.
//   prescriptions.js  pickTodaysPrescription() — 날짜 해시로만 130개 중 하나를 뽑는다
//   app.js            launchEmotionFlow()      — 감정을 고르면 처방을 건너뛰고 바로 주사
// 즉 홈에서 "외로움"을 눌러도 오늘의 처방 카드에는 전혀 다른 것이 떠 있었다.
// CLAUDE.md의 핵심 UX가 "운 → 마음 → 처방 → 주사"인데 마음과 처방 사이가 끊겨 있었다.
// 이 파일이 그 한 칸을 잇는다.
//
// app.js·game.js는 건드리지 않는다. 감정 칩이 이미 쏘고 있는 클릭과,
// 주사가 끝날 때 app.js가 쏘는 maumjaro:emotion-injected 를 듣기만 한다.
// prescriptions.js에는 export 하나(setTodayPrescriptionFor)만 더했다.
(() => {
  'use strict';

  // 감정 28개를 처방 카테고리 10개에 붙인다.
  //
  // 고르는 기준은 "그 감정일 때 사람이 실제로 뭘 하고 싶어지나"다.
  // 감정 이름과 카테고리 이름을 맞추는 게 아니다 — 예컨대 무기력은 '감정'이 아니라
  // '수면'으로 보낸다. 무기력할 때 필요한 건 감정 설명이 아니라 쉬라는 허락이라서다.
  //
  // ⚠️ 'emotion' 카테고리에는 처방이 0개다(RX_CATEGORIES에는 있지만 시드가 없다).
  // 여기에 붙이면 카드가 안 바뀐다. 쓰지 않는다.
  const MAP = {
    // 관계 — 2026-10-11에 보강한 쪽이다
    crush: 'love',          // 짝사랑
    breakup: 'love',        // 이별
    affection: 'love',      // 사랑
    excitement: 'love',     // 설렘
    jealousy: 'love',       // 질투
    longing: 'love',        // 그리움
    loneliness: 'social',   // 외로움
    hurt: 'social',         // 서운함
    awkward: 'social',      // 어색함
    compare: 'social',      // 비교
    betrayed: 'social',     // 배신감
    gratitude: 'social',    // 감사 — 고마운 마음은 대개 누군가에게 향한다

    // 일·압박
    stress: 'work',
    stuffy: 'work',         // 답답함
    anger: 'work',
    nervous: 'study',       // 긴장 — 시험·발표 쪽 처방이 가장 가깝다

    // 소진
    lethargy: 'sleep',      // 무기력
    exhausted: 'sleep',     // 지침

    // 가라앉음
    anxiety: 'daily',
    depression: 'daily',    // 우울
    deflated: 'daily',      // 허탈함
    selfblame: 'daily',     // 자책
    ordinary: 'daily',      // 평범

    // 풀림·기쁨
    joy: 'fun',
    proud: 'fun',           // 뿌듯함
    comfort: 'travel',      // 편안함
    relief: 'travel',       // 홀가분
    craving: 'food',        // 식욕 폭발
  };

  function apply(key) {
    if (!key || !MAP[key]) return;
    const Rx = window.MaumjaroRx;
    if (!Rx || typeof Rx.setTodayPrescriptionFor !== 'function') return;
    let picked = null;
    try { picked = Rx.setTodayPrescriptionFor(MAP[key], key); } catch (e) { return; }
    if (!picked) return;
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') {
      G.track('today_rx_matched', { emotion: key, category: MAP[key], rx: picked.id });
    }
  }

  // 1) 홈에서 감정 칩을 누른 순간. 주사 화면이 덮고 있는 동안 카드를 바꿔 두면,
  //    주사가 끝나고 홈으로 돌아왔을 때 방금 고른 감정에 맞는 처방이 기다리고 있다.
  //    거품 단계라 app.js의 기존 처리보다 뒤에 돈다 — 흐름을 막지 않는다.
  document.addEventListener('click', (e) => {
    const chip = e.target.closest && e.target.closest('.home-emo');
    if (chip && chip.dataset && chip.dataset.emo) apply(chip.dataset.emo);
  });

  // 2) 안전망. 감정 선택은 홈 칩 말고 다른 경로로도 일어난다(증상 모달 등).
  //    app.js가 주사를 끝내며 쏘는 이벤트에는 감정 키가 들어 있다.
  document.addEventListener('maumjaro:emotion-injected', (e) => {
    apply(e && e.detail && e.detail.key);
  });
})();
