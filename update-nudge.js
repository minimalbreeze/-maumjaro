// 새 버전이 나왔을 때 알려주는 띠 — "앱은 떠 있는데 코드는 옛것"을 막는다.
//
// 왜 (2026-11-17).
// 효성님이 같은 날 두 번, **배포가 끝난 화면을 옛 모습으로** 봤다.
// 한 번은 타로 도판, 한 번은 연애 타로 자리였다. 그때마다 라이브 파일을 열어
// 보면 새 코드가 올라가 있었다.
//
// 원인은 캐시가 아니다(서비스 워커는 네트워크 우선이다). **홈 화면에 추가한 앱이
// 떠 있는 채로 탭만 옮기면 `index.html` 을 다시 안 받는다.** 그 안의 `?v=` 가
// 그대로니 스크립트도 옛것 그대로다. iOS 에서는 앱을 완전히 닫았다 열어야 바뀐다.
//
// 그래서 **앱이 스스로 알아채게** 한다. 사람에게 "새로고침 해보세요"라고 말하는
// 것으로는 안 끝난다 — 쓰는 사람은 자기가 옛 화면을 보고 있다는 걸 모른다.
//
// ⚠️ 가로막지 않는다. 화면을 덮는 팝업이 아니라 탭바 위 얇은 띠 하나이고,
//    닫을 수 있고, 저절로 새로고침하지 않는다. 쓰던 것을 빼앗지 않는다.
// ⚠️ 주사 중에는 안 뜬다. 핵심 인터랙션 위에 무엇도 얹지 않는다.
// ⚠️ 색은 기존 팔레트 그대로다(딥틸 `#1f5c50`, CTA 보라~핑크). 새 팔레트 없음.
(() => {
  'use strict';

  // 이 페이지가 어느 판으로 떴는지. 어떤 스크립트든 `?v=` 가 붙어 있으므로
  // 하나만 읽으면 된다.
  function versionOf(text) {
    const m = String(text || '').match(/love\.js\?v=(\d+)/);
    return m ? Number(m[1]) : null;
  }

  const here = (() => {
    const el = document.querySelector('script[src*="love.js"]');
    return el ? versionOf(el.getAttribute('src')) : null;
  })();
  if (!here) return; // 판을 모르면 비교할 것도 없다

  let shown = false;
  let lastCheck = 0;
  const MIN_GAP_MS = 60 * 1000; // 너무 자주 묻지 않는다

  function busy() {
    // 주사 중이거나 전체화면 연출이 떠 있으면 비켜 준다.
    const app = document.getElementById('app');
    if (app && (app.classList.contains('rx-ready') || app.classList.contains('rx-injecting'))) return true;
    return !!document.querySelector('.gacha-full.show, #tarot-card-overlay.show, .mj-splash, #mj-splash');
  }

  function show() {
    if (shown || document.getElementById('mj-update-bar')) return;
    shown = true;
    const bar = document.createElement('div');
    bar.id = 'mj-update-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `
      <span class="mj-update-text">새 버전이 나왔어요</span>
      <button type="button" class="mj-update-go">새로고침</button>
      <button type="button" class="mj-update-close" aria-label="닫기">✕</button>
    `;
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add('on'));

    bar.querySelector('.mj-update-go').addEventListener('click', () => {
      // 서비스 워커가 새것을 들고 기다리는 중이면 먼저 넘어가라고 말한다.
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
          navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg && reg.waiting) reg.waiting.postMessage('skip-waiting');
          }).catch(() => undefined);
        }
      } catch (e) { /* 없어도 새로고침은 된다 */ }
      // 쿼리를 붙여 확실히 새로 받게 한다(가운데 끼어 있는 캐시까지 건너뛴다).
      const u = new URL(location.href);
      u.searchParams.set('r', String(Date.now()));
      location.replace(u.toString());
    });
    bar.querySelector('.mj-update-close').addEventListener('click', () => {
      bar.classList.remove('on');
      setTimeout(() => { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 260);
      // 닫으면 이번 세션 동안 다시 안 띄운다. 성가시게 하지 않는다.
      shown = true;
      lastCheck = Infinity;
    });
  }

  // force 를 주면 1분 제한을 건너뛴다. 제한은 포커스가 연달아 올 때 서버를
  // 두들기지 않으려고 둔 것이지, 사람이 일부러 물을 때까지 막으려는 게 아니다.
  function check(force) {
    if (shown || lastCheck === Infinity) return;
    const now = Date.now();
    if (!force && now - lastCheck < MIN_GAP_MS) return;
    lastCheck = now;
    if (!navigator.onLine) return;
    // index.html 만 다시 받아 `?v=` 를 비교한다. 캐시를 타지 않게 no-store 다.
    fetch(`./?v=check&_=${now}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : null))
      .then((html) => {
        const there = versionOf(html);
        if (there && there > here && !busy()) show();
      })
      .catch(() => undefined);
  }

  // 앱으로 돌아올 때마다 본다 — 홈 화면 앱이 떠 있는 채로 며칠이 지나는 경우가
  // 정확히 이 기능이 필요한 자리다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  // 처음 뜨고 조금 뒤에 한 번. 첫 화면이 그려지는 것을 막지 않게 늦춘다.
  setTimeout(check, 6000);

  window.MaumjaroUpdate = { version: here, check, show };
})();
