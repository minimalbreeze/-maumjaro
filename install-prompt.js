// 홈 화면에 추가 유도
//
// 이 앱은 웹앱이라 푸시 알림을 쓸 수 없다(iOS는 특히). 그래서 홈 화면 아이콘이
// 사실상 유일한 "다시 오는 길"이다. 연속 출석·마음약 컬렉션을 만들어 뒀지만
// 돌아올 방법이 없으면 작동하지 않는다.
//
// 원칙
//  - 첫 주사를 완주하고 보상을 닫은 직후에만 띄운다(만족도가 가장 높은 순간).
//    첫 진입 때 띄우면 맥락이 없어 그냥 닫힌다.
//  - 평생 한 번. 닫으면 다시 묻지 않는다.
//  - 이미 설치했거나 PC면 아예 띄우지 않는다.
//  - app.js / game.js는 건드리지 않는다. 보상 오버레이가 닫히는 것을 지켜보기만 한다.
(() => {
  'use strict';

  const KEY = 'maumjaro:installPrompt';
  const DELAY_MS = 900; // 보상 오버레이가 닫히고 잠깐 뒤에 올라온다

  // 이미 홈 화면에서 실행 중이면 권할 이유가 없다.
  function alreadyInstalled() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
  }

  // 안내 문구가 환경마다 달라야 한다. 특히 카카오톡 인앱 브라우저에는
  // "홈 화면에 추가" 메뉴 자체가 없어서, 먼저 기본 브라우저로 열어야 한다.
  function env() {
    const ua = navigator.userAgent || '';
    if (/KAKAOTALK/i.test(ua)) return 'kakao';
    if (/NAVER\(inapp|DaumApps|Instagram|FBAN|FBAV|Line\//i.test(ua)) return 'inapp';
    // iPadOS는 데스크톱 UA를 쓰므로 터치 지원 여부로 함께 판별한다.
    const isIOS = /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
  }

  const COPY = {
    kakao: {
      title: '📱 홈 화면에 두면 내일도 잊지 않아요',
      body: '카카오톡 안에서는 설치가 안 돼요.<br>먼저 <b>우측 상단 ⋯ → 다른 브라우저로 열기</b>를 눌러주세요.',
      cta: null,
    },
    ios: {
      title: '📱 홈 화면에 두면 내일도 잊지 않아요',
      body: '아래 <b>공유 버튼 <span class="ip-icon">⬆️</span></b> 을 누르고<br><b>“홈 화면에 추가”</b>를 선택하면 앱처럼 열려요.',
      cta: null,
    },
    android: {
      title: '📱 홈 화면에 두면 내일도 잊지 않아요',
      body: '설치해도 용량을 거의 쓰지 않아요.',
      cta: '홈 화면에 추가하기',
    },
    inapp: {
      title: '📱 홈 화면에 두면 내일도 잊지 않아요',
      body: '<b>다른 브라우저로 열기</b>를 누른 뒤<br>공유 메뉴에서 <b>“홈 화면에 추가”</b>를 선택해 주세요.',
      cta: null,
    },
  };

  // Android Chrome은 조건이 맞으면 이 이벤트를 준다. 잡아 두었다가 우리 버튼에서 쓴다.
  // (서비스워커가 없으면 안 올 수도 있다 — 그때는 수동 안내로 자연스럽게 넘어간다.)
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  function track(name, params) {
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') G.track(name, params);
  }

  function done(how) {
    try { localStorage.setItem(KEY, how); } catch (e) { /* 저장 실패는 무시 */ }
  }

  function show() {
    const kind = env();
    if (kind === 'desktop') return;
    const copy = COPY[kind];
    if (!copy) return;

    const sheet = document.createElement('div');
    sheet.className = 'install-sheet';
    sheet.innerHTML = `
      <div class="ip-card" role="dialog" aria-label="홈 화면에 추가">
        <p class="ip-title">${copy.title}</p>
        <p class="ip-body">${copy.body}</p>
        <p class="ip-why">연속 출석과 마음약 모으기는 매일 와야 이어져요.</p>
        ${copy.cta ? `<button class="action-btn ip-go" type="button">${copy.cta}</button>` : ''}
        <button class="ip-later" type="button">나중에</button>
      </div>`;
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('show'));
    track('install_prompt_shown', { env: kind });

    const close = (how) => {
      done(how);
      sheet.classList.remove('show');
      setTimeout(() => sheet.remove(), 250);
    };

    sheet.querySelector('.ip-later').addEventListener('click', () => {
      track('install_prompt_dismissed', { env: kind });
      close('dismissed');
    });
    // 카드 밖을 눌러도 닫힌다(닫기 방법이 하나뿐이면 갇힌 느낌이 든다).
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) { track('install_prompt_dismissed', { env: kind }); close('dismissed'); }
    });

    const go = sheet.querySelector('.ip-go');
    if (go) {
      go.addEventListener('click', async () => {
        if (!deferredPrompt) {
          // 네이티브 프롬프트를 못 쓰는 상황이면 수동 안내로 바꿔 보여준다.
          sheet.querySelector('.ip-body').innerHTML =
            '브라우저 <b>⋮ 메뉴 → “홈 화면에 추가”</b>를 눌러주세요.';
          go.remove();
          return;
        }
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
        track('install_prompt_result', { outcome: choice.outcome });
        deferredPrompt = null;
        close(choice.outcome === 'accepted' ? 'installed' : 'dismissed');
      });
    }
  }

  function maybeShow() {
    if (alreadyInstalled()) return;
    let seen = null;
    try { seen = localStorage.getItem(KEY); } catch (e) { return; }
    if (seen) return;          // 한 번 물었으면 다시 묻지 않는다
    setTimeout(show, DELAY_MS);
  }

  // ---------- 언제든 들어갈 수 있는 입구 ----------
  // 자동으로 뜨는 시트는 평생 한 번이라 놓치면 끝이다. 직접 찾아 들어올 길을 둔다.

  // 헤더의 배지 줄에 설치 버튼을 항상 함께 둔다.
  // 홈 화면은 스크롤 없이 딱 맞게 짜여 있어서 줄을 하나 더 넣으면 CTA가 탭바에 가린다.
  // 그래서 "설치 없이" 배지 하나를 빼고 그 자리에 버튼을 넣는다 — 한 줄이 유지된다.
  // ("설치 없이"와 "홈 화면에 추가"를 나란히 두면 서로 말이 어긋나기도 한다.)
  //
  // 처음에는 주사를 완주한 사람에게만 보여줬는데, 그러면 처음 온 사람과 기록을 지운
  // 사람에게는 영영 안 보인다. 설치는 권유일 뿐 방해가 아니므로 항상 노출한다.
  // 무료·30초 배지는 그대로 남겨서 진입 장벽을 낮추는 역할도 유지한다.
  function refreshHeaderCta() {
    const row = document.querySelector('.app-trust');
    if (!row) return;
    if (env() === 'desktop') return;
    if (alreadyInstalled()) return;
    if (row.dataset.installCta === '1') return; // 이미 바꿔 끼웠다

    row.dataset.installCta = '1';
    row.innerHTML = '<span>무료</span><span>30초</span>'
      + '<button class="app-trust-install" type="button">📲 홈 화면에 추가</button>';
    row.querySelector('button').addEventListener('click', () => {
      track('install_entry_clicked', { from: 'header' });
      show();
    });
  }

  function wireSettingsRow() {
    const row = document.getElementById('settings-install-row');
    const btn = document.getElementById('settings-install-btn');
    if (!row || !btn) return;
    if (env() === 'desktop' || alreadyInstalled()) { row.hidden = true; return; }
    row.hidden = false;
    btn.addEventListener('click', () => {
      track('install_entry_clicked', { from: 'settings' });
      show();
    });
  }

  // 보상 오버레이가 닫히는 순간 = 주사를 완주하고 마음약까지 받아본 직후.
  // game.js를 고치지 않고 hidden 속성 변화만 지켜본다.
  function watchReward() {
    const ov = document.getElementById('reward-overlay');
    if (!ov) return;
    let wasOpen = !ov.hidden;
    new MutationObserver(() => {
      const open = !ov.hidden;
      if (wasOpen && !open) {          // 열려 있다가 닫힌 순간
        maybeShow();
        refreshHeaderCta();            // 방금 첫 완주를 했다면 헤더 자리도 바꿔 끼운다
      }
      wasOpen = open;
    }).observe(ov, { attributes: true, attributeFilter: ['hidden'] });
  }

  function init() {
    watchReward();
    wireSettingsRow();
    refreshHeaderCta();
    // 주사가 끝나는 즉시 헤더 자리를 바꾼다.
    // 보상 오버레이가 닫힐 때만 갱신하면, 오늘 보상을 이미 받은 두 번째 주사에서는
    // 오버레이가 안 열려서 새로고침 전까지 버튼이 나타나지 않는다.
    document.addEventListener('maumjaro:emotion-injected', () => setTimeout(refreshHeaderCta, 100));
    document.addEventListener('maumjaro:rx-injected', () => setTimeout(refreshHeaderCta, 100));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
