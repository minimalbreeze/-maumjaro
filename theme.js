// 화면 무드 — 지금 보이는 탭에 따라 배경 색을 바꾼다
//
// 효성님 지시: "운세나 타로를 할 때는 배경이 타로 분위기 색상으로 변경".
// 바꾸는 건 색뿐이다. 구조도, 배치도, 탭 순서도 건드리지 않는다.
//
// 왜 클릭이 아니라 화면을 보는가:
// 탭 버튼 클릭만 듣게 하면 세 군데에서 틀린다.
//   1) gate.js가 잠긴 탭의 클릭을 캡처 단계에서 멈춘다 — 막혔는데 배경만 보라로 바뀐다
//   2) 운세 화면은 탭 말고도 열린다(공유 링크 ?start=tarot, 폼의 "타로 먼저 보기",
//      친구가 보낸 타로 ?tarot=...)
//   3) fortune.js 안에서 홈으로 되돌리는 goHomeTab() 같은 경로는 탭 클릭이 아니다
// 그래서 "무엇을 눌렀나"가 아니라 "지금 무엇이 보이나"를 본다. 보이는 화면이 진실이다.
//
// app.js는 건드리지 않는다. hidden 속성이 바뀌는 것만 지켜본다.
(() => {
  'use strict';

  // 이 화면들이 보일 때 타로 무드가 된다. MBTI도 포함한다 —
  // 운세 탭 안에서 들어가는 같은 계열이라, 여기만 민트로 남으면 오히려 튄다.
  const MOODY = { 'view-fortune': 'tarot', 'view-mbti': 'tarot' };

  const views = Object.keys(MOODY)
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!views.length) return;

  const root = document.documentElement;

  function apply() {
    // hidden이 빠진(=보이는) 화면 중 첫 번째의 무드를 쓴다.
    const shown = views.find((el) => !el.hidden);
    const mood = shown ? MOODY[shown.id] : '';
    if (mood) root.setAttribute('data-mood', mood);
    else root.removeAttribute('data-mood');
  }

  // hidden만 지켜본다. 다른 속성까지 보면 렌더링 때마다 쓸데없이 깨어난다.
  const mo = new MutationObserver(apply);
  views.forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['hidden'] }));

  apply();   // 공유 링크로 운세 화면이 먼저 열린 채 시작하는 경우
})();
