// 실행 스플래시 — 치우는 쪽만 담당한다
//
// 그리는 쪽은 index.html이다(마크업 + 첫 페인트 전 표시 여부 판단). 왜 나눴나:
//   로고를 JS로 그리면 홈이 먼저 한 번 보이고 그 위에 로고가 덮인다. 앱을 켠 느낌이
//   아니라 화면이 깜빡이는 버그로 보인다. 그래서 첫 프레임은 문서가 책임진다.
//
// 그리고 사라지는 동작도 원래 CSS(mj-splash-out)가 한다. 이 파일이 없어도, 늦어도,
// 에러가 나도 1.1초 뒤 스플래시는 투명·visibility:hidden·pointer-events:none이 된다.
// 이 파일이 더하는 것은 세 가지뿐이다.
//   1) 다 끝난 로고를 DOM에서 빼기 (보이지 않는 전체화면 레이어를 남겨두지 않는다)
//   2) 탭하면 즉시 건너뛰기 — 측정된 문제가 "8초 이탈"이라, 기다리게 만들면 안 된다
//   3) whenDone() — 첫 방문 온보딩이 스플래시 위에 겹쳐 뜨지 않게 순서를 잡아준다
(() => {
  'use strict';

  const el = document.getElementById('mj-splash');
  // 스플래시를 띄우지 않기로 한 방문(친구 링크·같은 세션 재방문)에서는 이 클래스가 붙어 있다.
  const showing = !!el && !document.documentElement.classList.contains('mj-nosplash');

  const waiting = [];
  let done = false;

  function finish() {
    if (done) return;
    done = true;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    while (waiting.length) {
      const fn = waiting.shift();
      try { fn(); } catch (e) { /* 한쪽이 터져도 나머지는 실행한다 */ }
    }
  }

  // 스플래시가 끝난 뒤(또는 애초에 안 띄운 경우 바로) 실행할 일을 예약한다.
  function whenDone(fn) {
    if (typeof fn !== 'function') return;
    if (done) { setTimeout(fn, 0); return; }
    waiting.push(fn);
  }

  function skip() {
    if (done) return;
    if (!el) { finish(); return; }
    // CSS 애니메이션을 끊고 남은 거리만 빠르게 닫는다. 지금 보이는 상태에서
    // 이어서 사라지므로, 눌렀는데 로고가 다시 밝아지는 일이 없다.
    el.style.animation = 'none';
    el.style.opacity = getComputedStyle(el).opacity;
    el.style.pointerEvents = 'none';
    void el.offsetWidth;
    el.style.transition = 'opacity 160ms ease';
    el.style.opacity = '0';
    setTimeout(finish, 180);
  }

  window.MaumjaroSplash = { whenDone, skip, get shown() { return showing; } };

  if (!showing) { finish(); return; }

  el.addEventListener('pointerdown', skip, { passive: true });
  // 애니메이션은 안에 있는 로고·글자에도 걸려 있어서 animationend가 여러 번 올라온다.
  // 화면 전체(el)에서 난 것만 "끝"으로 본다.
  el.addEventListener('animationend', (e) => { if (e.target === el) finish(); });
  // 안전망. 백그라운드 탭처럼 애니메이션 이벤트가 오지 않는 상황에서도 반드시 치운다.
  // 길이를 여기에 따로 적어두지 않는다 — 2600으로 박아뒀다가 CSS를 2.4초에서 3.5초로
  // 늘렸을 때 이 타이머가 먼저 터져서 마지막 0.9초가 잘렸다. 화면은 다 그려졌는데
  // 보여주기 직전에 치워버린 셈이다. CSS가 한 군데(--mj-splash-ms)에서 길이를 말하고
  // 여기서는 읽기만 한다. 못 읽으면 넉넉한 기본값을 쓴다.
  var total = 3500;
  try {
    var v = parseInt(getComputedStyle(el).getPropertyValue('--mj-splash-ms'), 10);
    if (v > 0) total = v;
  } catch (e) { /* 무시 */ }
  setTimeout(finish, total + 1200);

  const G = window.MaumjaroGame;
  if (G && typeof G.track === 'function') {
    // 홈 화면에 추가해서 켠 사람과 브라우저로 들어온 사람을 나눠 본다.
    // 전자는 OS 스플래시 → 이 화면으로 이어지므로 체감이 다르다.
    let mode = 'browser';
    try {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) mode = 'standalone';
    } catch (e) { /* 무시 */ }
    G.track('splash_shown', { launch_mode: mode });
  }
})();
