// 첫 방문 온보딩 (3장)
//
// "앱이 어떤 앱인지 모르겠다"는 피드백에 대한 답이다.
// 로고 인트로가 아니라 "무엇을 하는 곳인지"를 세 장으로 보여준다.
//
// 원칙
//  - 첫 방문에만 자동으로 뜨고, 한 번 보면 다시 안 뜬다.
//  - "건너뛰기"를 항상 노출한다 — 급한 사람을 붙잡으면 이탈이 는다.
//  - 그림은 이미 앱에 있는 SVG 언어(주사기·캡슐·마음약)를 그대로 쓴다. 새 에셋 0.
//  - 설정에서 언제든 다시 볼 수 있다.
//  - 친구가 보낸 링크(?custom= 등)로 들어온 사람에게는 띄우지 않는다.
//    받은 걸 보러 온 사람 앞을 가로막으면 안 된다.
(() => {
  'use strict';

  const KEY = 'maumjaro:onboarded';

  const SLIDES = [
    {
      art: `<svg viewBox="0 0 120 90" width="132" height="99" aria-hidden="true">
        <rect x="6" y="18" width="24" height="30" rx="7" fill="#fff" stroke="#ffb37a" stroke-width="2.5"/>
        <text x="18" y="34" font-size="13" text-anchor="middle">😣</text>
        <rect x="34" y="18" width="24" height="30" rx="7" fill="#fff" stroke="#e3d9ee" stroke-width="2.5"/>
        <text x="46" y="34" font-size="13" text-anchor="middle">🥱</text>
        <rect x="62" y="18" width="24" height="30" rx="7" fill="#fff" stroke="#e3d9ee" stroke-width="2.5"/>
        <text x="74" y="34" font-size="13" text-anchor="middle">😊</text>
        <rect x="90" y="18" width="24" height="30" rx="7" fill="#fff" stroke="#e3d9ee" stroke-width="2.5"/>
        <text x="102" y="34" font-size="13" text-anchor="middle">😌</text>
        <path d="M18 56 l0 10" stroke="#ff9166" stroke-width="3" stroke-linecap="round"/>
        <path d="M13 62 l5 6 5-6" fill="none" stroke="#ff9166" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
      title: '오늘 기분을 하나 고르면',
      body: '스트레스·불안·기쁨까지 20가지 중에서<br>지금 마음과 가장 가까운 걸 고릅니다.',
    },
    {
      art: `<svg viewBox="0 0 120 90" width="132" height="99" aria-hidden="true">
        <rect x="50" y="10" width="20" height="46" rx="4" fill="#fdfbf6" stroke="#1f5c50" stroke-width="3"/>
        <rect x="53" y="30" width="14" height="24" rx="3" fill="#ff9166"/>
        <rect x="46" y="6" width="28" height="7" rx="3.5" fill="#ef6a54" stroke="#1f5c50" stroke-width="2.5"/>
        <path d="M60 56 v10" stroke="#1f5c50" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="60" cy="76" rx="34" ry="10" fill="#ffd9b8" stroke="#1f5c50" stroke-width="3"/>
        <circle cx="60" cy="74" r="4" fill="#ef6a54"/>
        <path d="M92 62 q10 6 0 12" fill="none" stroke="#ff9166" stroke-width="3" stroke-linecap="round"/>
        <path d="M22 62 q-10 6 0 12" fill="none" stroke="#ff9166" stroke-width="3" stroke-linecap="round"/>
      </svg>`,
      title: '폰을 콕 찌르면 주사가 놓여요',
      body: '화면을 눌러도 되고,<br>폰을 찌르듯 움직여도 됩니다.',
    },
    {
      art: `<svg viewBox="0 0 120 90" width="132" height="99" aria-hidden="true">
        <path d="M30 45 a22 22 0 0 1 44 0 z" transform="translate(8,0)" fill="#ff9166"/>
        <path d="M30 45 a22 22 0 0 0 44 0 z" transform="translate(8,0)" fill="#fff5e8" stroke="#f0c9a8" stroke-width="1.5"/>
        <rect x="35" y="42" width="46" height="6" rx="3" fill="#f0a12e"/>
        <rect x="88" y="26" width="22" height="12" rx="6" fill="#b779ef"/>
        <circle cx="16" cy="32" r="8" fill="#4f86e8"/>
        <path d="M12 62 l4 8 4-8z" fill="#8fd694"/>
        <text x="60" y="82" font-size="11" text-anchor="middle" fill="#7a6a75">46종</text>
      </svg>`,
      title: '마음약이 하나 나옵니다',
      body: '전부 다르게 생긴 46종.<br>모으고, 친구에게 보낼 수도 있어요.',
    },
  ];

  function seen() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return true; }
  }
  function markSeen() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* 저장 실패는 무시 */ }
  }
  function track(name, params) {
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') G.track(name, params);
  }

  // 목적을 갖고 들어온 링크인지. 그렇다면 온보딩이 아니라 그 목적부터 보여줘야 한다.
  //  - custom/maumun/t/tarot : 친구가 보낸 처방·운세·타로
  //  - start                 : 페이스북 자동 게시·블로그의 "무료 타로 보기" 착지 링크
  // start를 빼먹었더니 광고를 눌러 타로 화면까지 온 사람 앞에 온보딩 3장이 덮여 있었다.
  // 보러 온 것이 가려지면 그 자리에서 나간다.
  function cameFromFriendLink() {
    const q = new URLSearchParams(location.search);
    return !!(q.get('custom') || q.get('maumun') || q.get('t') || q.get('tarot') || q.get('start'));
  }

  function open(fromSettings) {
    if (document.querySelector('.ob')) return;
    let i = 0;

    const el = document.createElement('div');
    el.className = 'ob';
    el.innerHTML = `
      <div class="ob-card" role="dialog" aria-label="맘운자로 사용 안내">
        <div class="ob-brand">💉 맘운자로</div>
        <div class="ob-art" id="ob-art"></div>
        <p class="ob-title" id="ob-title"></p>
        <p class="ob-body" id="ob-body"></p>
        <div class="ob-dots" id="ob-dots">
          ${SLIDES.map((_, n) => `<span class="ob-dot${n === 0 ? ' on' : ''}"></span>`).join('')}
        </div>
        <button class="action-btn ob-next" id="ob-next" type="button">다음</button>
        <button class="ob-skip" id="ob-skip" type="button">${fromSettings ? '닫기' : '건너뛰기'}</button>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    const art = el.querySelector('#ob-art');
    const title = el.querySelector('#ob-title');
    const body = el.querySelector('#ob-body');
    const next = el.querySelector('#ob-next');
    const dots = [...el.querySelectorAll('.ob-dot')];

    function draw() {
      const s = SLIDES[i];
      art.innerHTML = s.art;
      title.textContent = s.title;
      body.innerHTML = s.body;
      dots.forEach((d, n) => d.classList.toggle('on', n === i));
      next.textContent = i === SLIDES.length - 1 ? '시작하기 💉' : '다음';
      // 카드를 다시 그릴 때마다 살짝 떠오르게 해서 넘어간 느낌을 준다
      art.classList.remove('in'); void art.offsetWidth; art.classList.add('in');
    }

    function close(how) {
      markSeen();
      track('onboarding_closed', { at: i + 1, how, from: fromSettings ? 'settings' : 'first_visit' });
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }

    next.addEventListener('click', () => {
      if (i < SLIDES.length - 1) { i += 1; draw(); return; }
      close('finished');
    });
    el.querySelector('#ob-skip').addEventListener('click', () => close('skipped'));
    el.addEventListener('click', (e) => { if (e.target === el) close('skipped'); });

    // 좌우로 쓸어 넘기기
    let x0 = null;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 40) return;
      if (dx < 0 && i < SLIDES.length - 1) { i += 1; draw(); }
      else if (dx > 0 && i > 0) { i -= 1; draw(); }
    }, { passive: true });

    draw();
    track('onboarding_shown', { from: fromSettings ? 'settings' : 'first_visit' });
  }

  function wireSettings() {
    const btn = document.getElementById('settings-onboarding-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const ov = document.getElementById('settings-overlay');
      if (ov) ov.classList.remove('show');
      setTimeout(() => open(true), 220);
    });
  }

  function init() {
    wireSettings();
    if (seen() || cameFromFriendLink()) return;
    // 첫 화면이 그려진 뒤에 띄운다(빈 화면 위에 뜨면 무엇에 대한 설명인지 모른다).
    setTimeout(() => open(false), 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MaumjaroOnboarding = { open };
})();
