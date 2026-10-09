// 설치 유도 잠금 — 홈 화면에 추가하지 않으면 일부 기능을 막는다
//
// ⚠️ 이건 실험이다. 되돌릴 수 있게 만들었다.
//
// 왜 하는가(효성님 결정):
// 재방문이 83명 중 1명이었다. 홈 화면 아이콘이 재방문을 만드는 가장 강한 수단인데
// 설치할 이유가 약했다. 그래서 "설치해야 열린다"로 바꿔 본다.
//
// 내가 반대했던 이유도 남겨 둔다(2주 뒤 판단할 때 이게 근거가 된다):
//   1. 83명 중 82명이 처음 온 사람이다. 20초 머문 낯선 사람에게 설치를 요구하면 나간다
//   2. iOS 설치는 공유 → 스크롤 → 홈 화면에 추가, 3단계 메뉴라 통과율이 낮다
//   3. 앱과 모든 홍보 문구가 "설치도 가입도 없이 30초"다 — 그 말을 보고 온 사람을 막는다
//   4. 네이버 유입 검색어가 전부 운세·타로다(여사제 역방향 17, 오늘의마음타로 32).
//      검색으로 온 사람이 벽을 만나면 바로 나가고 그게 순위를 떨어뜨린다
//
// 그래서 끄는 법을 제일 쉽게 만들어 뒀다:
//   index.html의 window.MAUMJARO_GATE 에서 on: false 로 바꾸면 전부 원래대로 돌아온다.
//   코드를 지울 필요가 없다. 2주 재보고 유입이 꺾이면 그 한 줄만 바꾼다.
//
// 무엇으로 판단하는가 — 이 파일이 심는 GA4 이벤트:
//   gate_blocked          막힌 횟수(어느 기능인지 함께). 이게 크고 아래가 작으면 그냥 쫓아낸 것이다
//   gate_install_clicked  막힌 뒤 설치 안내를 연 사람
//   gate_unlocked         설치한 상태로 잠긴 기능에 들어온 사람(= 벽을 넘은 사람)
//
// app.js는 건드리지 않는다. 탭 버튼의 클릭 처리는 app.js 안에 있지만,
// document에 캡처 단계로 붙으면 그보다 먼저 받아서 멈출 수 있다.
(() => {
  'use strict';

  const CFG = Object.assign(
    { on: false, dailyRxLimit: 0, lockedTabs: [], seoExempt: false },
    window.MAUMJARO_GATE || {}
  );
  if (!CFG.on) return;

  const LABEL = { fortune: '운세·타로', mbti: 'MBTI', rx: '처방센터', history: '기록' };

  function track(name, params) {
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') G.track(name, params || {});
  }

  // ---------- 열쇠 두 개 ----------
  // 효성님 지시: 기본 기능(오늘의 마음 주사)만 남기고, 나머지는
  // "설치 + 정보 등록"이 끝나야 열린다. 둘 다 있어야 한다.
  function profileDone() {
    try {
      const raw = localStorage.getItem('maumjaro:sajuProfile');
      return !!(raw && JSON.parse(raw));
    } catch (e) {
      return false;
    }
  }
  function unlocked() { return installed() && profileDone(); }

  // 다음에 무엇을 해야 하는지 — 안내 문구를 이것으로 가른다.
  function nextStep() {
    if (!installed()) return 'install';
    if (!profileDone()) return 'profile';
    return 'done';
  }

  function installed() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || window.navigator.standalone === true;
    } catch (e) {
      return false;   // 판별이 안 되면 막지 않는다. 막는 쪽으로 틀리면 사람을 잃는다
    }
  }

  // 데스크톱에는 "홈 화면에 추가"가 없다. 길이 없는데 막으면 그냥 막다른 길이다.
  function isDesktop() {
    const ua = navigator.userAgent || '';
    const touch = /iPad|iPhone|iPod|Android/i.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return !touch;
  }

  function gateActive() {
    return CFG.on && !unlocked() && !isDesktop();
  }

  // ---------- 검색으로 들어온 사람 예외 ----------
  // 네이버 검색 유입은 사실상 전부 타로·MBTI다(30일 TOP30 기준 노출의 70% 이상).
  // 그 사람들은 /tarot/여사제/ 같은 정적 페이지에 먼저 내려앉고, 거기 CTA로 앱에 들어온다.
  // 들어오자마자 찾던 그 기능이 잠겨 있으면 그냥 나가고, 그 이탈이 다시 순위를 깎는다.
  // 그래서 "찾아온 그 기능 하나만" 이번 방문 동안 열어 준다.
  //
  // 왜 referrer인가: 생성 페이지 수십 개의 링크를 고치지 않아도 되고, CTA 말고
  // 로고·하단 링크 등 어디로 넘어와도 똑같이 잡힌다. 같은 출처 이동이라
  // referrer에 경로까지 그대로 온다.
  //
  // 왜 sessionStorage인가: 이번 방문에서만 열린다. 다음에 다시 오면 잠금이 그대로다.
  // 잠금 실험 자체를 무력화하지 않으면서 유입 길목만 뚫는 선이 여기다.
  const GRANT_KEY = 'maumjaro:seoGrant';

  // 어떤 정적 페이지가 어떤 탭을 여는가. 타로는 운세 탭 안에 있다(rx-category-tile[data-fortune=tarot]).
  function viewsForPath(path) {
    if (/^\/tarot(\/|$)/.test(path)) return ['fortune'];
    if (/^\/mbti(\/|$)/.test(path)) return ['mbti'];
    return [];
  }

  function readGrant() {
    try {
      const a = JSON.parse(sessionStorage.getItem(GRANT_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }

  function captureGrant() {
    const have = readGrant();
    if (!CFG.seoExempt) return have;
    let views = [];
    try {
      if (document.referrer) {
        const u = new URL(document.referrer, location.href);
        if (u.origin === location.origin) views = viewsForPath(u.pathname);
      }
    } catch (e) { /* referrer를 못 읽으면 예외 없이 간다 */ }
    if (!views.length) return have;
    views.forEach((v) => { if (have.indexOf(v) === -1) have.push(v); });
    try { sessionStorage.setItem(GRANT_KEY, JSON.stringify(have)); } catch (e) { /* 무시 */ }
    return have;
  }

  const GRANT = captureGrant();
  function granted(view) { return CFG.seoExempt && GRANT.indexOf(view) !== -1; }

  // 통과를 셀 때 같은 탭을 여러 번 눌러도 한 번만 센다.
  const passLogged = {};
  function logPass(view) {
    if (passLogged[view]) return;
    passLogged[view] = true;
    track('gate_seo_pass', { what: LABEL[view] || view });
  }

  // ---------- 오늘 주사 횟수 ----------
  function todayRxCount() {
    const Core = window.MaumjaroCore;
    if (!Core || typeof Core.loadRecords !== 'function') return 0;
    try {
      const now = new Date();
      return Core.loadRecords().filter((ts) => Core.sameDay(new Date(ts), now)).length;
    } catch (e) {
      return 0;
    }
  }

  // ---------- 잠금 안내 ----------
  // 막기만 하면 그냥 나간다. 무엇이 열리는지와 여는 방법을 같이 보여준다.
  function openLock(what, reason) {
    if (document.getElementById('gate-lock')) return;
    const step = nextStep();
    track('gate_blocked', { what, reason, step });

    const el = document.createElement('div');
    el.id = 'gate-lock';
    el.className = 'gate-lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '홈 화면에 추가하면 열려요');
    el.innerHTML = `
      <div class="gate-inner">
        <div class="gate-ico">🔒</div>
        <div class="gate-title">${reason === 'daily'
          ? '오늘의 마음 주사는 하루 한 번이에요'
          : `${what}는 홈 화면에 추가하면 열려요`}</div>
        <p class="gate-body">${reason === 'daily'
          ? '홈 화면에 추가하면 <b>횟수 제한 없이</b> 맞을 수 있어요.'
          : '매일 바뀌는 내용이라 <b>홈 화면에서 바로 여는 쪽</b>이 편해요.'}</p>
        <div class="gate-steps">
          <div class="gate-step ${step === 'install' ? 'now' : 'ok'}"><span>${step === 'install' ? '①' : '✓'}</span> 홈 화면에 추가</div>
          <div class="gate-step ${step === 'profile' ? 'now' : (step === 'done' ? 'ok' : '')}"><span>${step === 'done' ? '✓' : '②'}</span> 맘운 프로필 등록</div>
          <div class="gate-step gate-step-done"><span>🔓</span> 운세 · 타로 · MBTI · 기록 전부 열림</div>
        </div>
        <button class="gate-go" id="gate-go" type="button">${step === 'profile' ? '🔮 맘운 프로필 등록하기' : '📲 홈 화면에 추가하는 법'}</button>
        <button class="gate-later" id="gate-later" type="button">나중에</button>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    function close(how) {
      el.classList.remove('show');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
      track('gate_lock_closed', { what, how });
    }

    document.getElementById('gate-go').addEventListener('click', () => {
      track('gate_cta_clicked', { what, step });
      close('cta');
      setTimeout(() => {
        if (step === 'profile') {
          // 설치는 끝났고 프로필만 남았다 — 설정의 맘운 프로필 입구로 보낸다.
          document.getElementById('settings-btn')?.click();
          setTimeout(() => document.getElementById('settings-fortune-profile-btn')?.click(), 320);
          return;
        }
        // install-prompt.js의 안내를 그대로 연다. 같은 안내를 두 번 만들지 않는다.
        const btn = document.querySelector('.app-trust-install')
          || document.querySelector('#settings-install-row button');
        if (btn) btn.click();
      }, 260);
    });
    document.getElementById('gate-later').addEventListener('click', () => close('later'));
    el.addEventListener('click', (e) => { if (e.target === el) close('backdrop'); });
  }

  // ---------- 탭 자물쇠 표시 ----------
  // 눌러보고 나서야 막힌 걸 아는 것보다, 미리 보이는 쪽이 덜 억울하다.
  function markTabs() {
    if (!gateActive()) return;
    (CFG.lockedTabs || []).forEach((v) => {
      if (granted(v)) return;   // 열어 준 탭에 자물쇠를 붙이면 거짓말이 된다
      const btn = document.querySelector(`.tab-btn[data-view="${v}"]`);
      if (btn && !btn.querySelector('.gate-badge')) {
        const b = document.createElement('i');
        b.className = 'gate-badge';
        b.textContent = '🔒';
        btn.appendChild(b);
      }
    });
  }

  // ---------- 가로채기 (캡처 단계라 app.js보다 먼저 받는다) ----------
  document.addEventListener('click', (e) => {
    if (!gateActive()) return;

    // 1) 잠긴 탭
    const tab = e.target.closest && e.target.closest('.tab-btn');
    if (tab) {
      const view = tab.dataset.view;
      if ((CFG.lockedTabs || []).indexOf(view) !== -1) {
        // 검색으로 그 기능을 찾아온 사람은 통과시킨다.
        if (granted(view)) { logPass(view); return; }
        e.preventDefault();
        e.stopPropagation();
        openLock(LABEL[view] || view, 'tab');
        return;
      }
    }

    // 2) 하루 주사 횟수 — 첫 한 번은 반드시 그대로 통과시킨다.
    //    처음 온 사람이 아무것도 못 해보고 막히면 이 실험 자체가 의미가 없다.
    const limit = CFG.dailyRxLimit || 0;
    if (limit > 0) {
      const starter = e.target.closest && e.target.closest('#action-btn, .home-emo');
      if (starter && todayRxCount() >= limit) {
        e.preventDefault();
        e.stopPropagation();
        openLock('오늘의 마음 주사', 'daily');
      }
    }
  }, true);

  // 설치한 사람이 잠긴 기능에 들어온 것도 센다(벽을 넘은 사람 수).
  document.addEventListener('click', (e) => {
    if (!CFG.on || !unlocked()) return;
    const tab = e.target.closest && e.target.closest('.tab-btn');
    if (tab && (CFG.lockedTabs || []).indexOf(tab.dataset.view) !== -1) {
      track('gate_unlocked', { what: LABEL[tab.dataset.view] || tab.dataset.view });
    }
  }, true);

  // ---------- 앱 안 설명 ----------
  // 막히고 나서야 아는 것보다, 쓰기 전에 알려주는 쪽이 덜 억울하다.
  // 온보딩 카드(첫 방문 안내)에 한 줄을 덧붙인다. 온보딩은 별도 오버레이라
  // 홈 접힘선(CTA가 탭바 위에 들어오는 선)에 영향을 주지 않는다.
  function explainInOnboarding() {
    if (!gateActive()) return;
    const card = document.querySelector('.ob-card');
    if (!card || card.querySelector('.gate-note')) return;
    // 열어 준 기능까지 "잠겨 있다"고 적으면 거짓말이 된다. 실제로 잠긴 것만 적는다.
    const NAME = { fortune: '운세 · 타로', mbti: 'MBTI', rx: '처방센터', history: '기록' };
    const still = (CFG.lockedTabs || []).filter((v) => !granted(v)).map((v) => NAME[v] || v);
    if (!still.length) return;
    const note = document.createElement('p');
    note.className = 'gate-note';
    note.innerHTML = '🔒 <b>오늘의 마음 주사</b>는 바로 쓸 수 있어요.<br>'
      + still.join(' · ') + '은(는) <b>홈 화면에 추가</b>하고 <b>맘운 프로필</b>을 등록하면 열려요.';
    card.appendChild(note);
  }

  // 온보딩은 스플래시가 끝난 뒤에 뜬다. 떠 있을 때를 잡는다.
  function watchOnboarding() {
    let tries = 0;
    const timer = setInterval(() => {
      explainInOnboarding();
      if (++tries > 60 || document.querySelector('.gate-note')) clearInterval(timer);
    }, 300);
  }

  // 설정에도 지금 상태를 보여준다(온보딩을 건너뛴 사람이 찾아볼 수 있는 자리).
  function explainInSettings() {
    const card = document.querySelector('#settings-overlay .settings-card');
    if (!card || card.querySelector('#gate-status')) return;
    const step = nextStep();
    const row = document.createElement('div');
    row.id = 'gate-status';
    row.className = 'sound-row';
    row.innerHTML = step === 'done'
      ? '<span>🔓 모든 기능이 열려 있어요</span>'
      : `<span>🔒 잠긴 기능 열기</span><button class="toggle-btn" type="button">${step === 'profile' ? '프로필 등록' : '홈 화면에 추가'}</button>`;
    const reset = document.getElementById('settings-reset-btn');
    if (reset && reset.parentNode) reset.parentNode.insertBefore(row, reset);
    const btn = row.querySelector('button');
    if (btn) {
      btn.addEventListener('click', () => {
        track('gate_cta_clicked', { what: 'settings', step });
        if (step === 'profile') document.getElementById('settings-fortune-profile-btn')?.click();
        else (document.querySelector('.app-trust-install')
          || document.querySelector('#settings-install-row button'))?.click();
      });
    }
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#settings-btn')) setTimeout(explainInSettings, 120);
  });

  function boot() { markTabs(); watchOnboarding(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
