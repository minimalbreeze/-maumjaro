// 첫 방문 온보딩 (1장)
//
// 왜 3장에서 1장으로 줄였나 (2026-09)
//   GA4 7일치를 보니 신규 49명 중 주사를 끝까지 놓은 건 11번(22%)이었고,
//   활성 사용자당 평균 참여 시간이 35초였다. 즉 78%가 아무것도 안 하고 즉시 나간다.
//   그런데 끝까지 간 사람은 공유까지 한다(완주 11 / 공유 26). 물건이 나쁜 게 아니라
//   문 앞에서 돌아가는 것이다.
//
//   옛 3장은 전부 "어떻게 쓰는지"였다 — 고른다 / 찌른다 / 받는다.
//   처음 온 사람의 질문은 "어떻게 쓰나"가 아니라 "이걸 왜 하지"다.
//   아직 원하지도 않는 물건의 사용법을 3장에 걸쳐 가르치고 있었던 셈이다.
//   게다가 주사 한 대까지 탭이 7번이었고 그중 앞 4번은 아무 일도 일어나지 않았다.
//
//   그래서 한 장만 남기고 그 한 장을 "왜"로 바꿨다. 조작법은 빼도 된다 —
//   찌르는 법은 화면 안에 "콕! 찔러서 놓기"로 이미 안내되고, 마음약은 받아보면 안다.
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
      // 앱의 마스코트를 여기로 데려온다.
      //   이 캐릭터는 지금껏 #arm-target 한 군데에만 있었다 — 주사를 놓기 직전,
      //   그러니까 감정을 고르고 준비 상태까지 간 사람만 볼 수 있는 자리다.
      //   그런데 신규의 92%가 보는 화면은 여기(온보딩)고, 8초에 나가는 사람은
      //   캐릭터를 한 번도 못 본 채 떠난다. 브랜드의 얼굴을 제일 안 보이는 데
      //   숨겨둔 셈이었다.
      //   그림도 제목("마음에 한 대 놓고 갑니다")과 맞는다 — 배를 내밀고 기다리는 모습이
      //   감정 칩 나열보다 슬로건을 직접 보여준다.
      // 주의: index.html의 #arm-target SVG와 같은 문서에 있으므로 gradient id가 겹치면
      //   한쪽이 상대 그라디언트를 쓴다. 그래서 ob 접두사를 붙여뒀다.
      art: `<svg viewBox="0 0 140 118" width="150" height="126" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="obcharBody" x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0%" stop-color="#ffe9c9" /><stop offset="100%" stop-color="#ffd2a3" />
            </linearGradient>
            <linearGradient id="obcharShirt" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%" stop-color="#8fd6c6" /><stop offset="100%" stop-color="#5fb3a3" />
            </linearGradient>
            <!-- 바닥 그림자: 가운데가 진하고 가장자리로 흩어져야 "떠 있지 않고 서 있다"가 된다 -->
            <radialGradient id="obcharGround" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0%" stop-color="rgba(90,60,40,0.34)" />
              <stop offset="60%" stop-color="rgba(90,60,40,0.14)" />
              <stop offset="100%" stop-color="rgba(90,60,40,0)" />
            </radialGradient>
          </defs>
          <!-- 바닥 그림자 -->
          <ellipse cx="70" cy="114" rx="36" ry="6" fill="url(#obcharGround)" />
          <!-- 다리 -->
          <rect x="52" y="96" width="13" height="18" rx="6.5" fill="#3d8a7c" />
          <rect x="75" y="96" width="13" height="18" rx="6.5" fill="#3d8a7c" />
          <!-- 몸통(배) -->
          <ellipse cx="70" cy="72" rx="34" ry="29" fill="url(#obcharBody)" stroke="#1f5c50" stroke-width="3.5" />
          <!-- 배 아래쪽에 그늘을 넣어 평평한 타원이 아니라 둥근 배로 보이게 한다 -->
          <ellipse cx="70" cy="80" rx="30" ry="21" fill="rgba(214,150,96,0.22)" />
          <ellipse cx="59" cy="66" rx="12" ry="8" fill="rgba(255,255,255,0.42)" />
          <!-- 옷: 배꼽 위쪽만 덮어 배를 내놓은 모습 -->
          <path d="M38 62 a34 29 0 0 1 64 0 z" fill="url(#obcharShirt)" stroke="#1f5c50" stroke-width="3.5" stroke-linejoin="round" />
          <!-- 옷 주름 한 줄 -->
          <path d="M50 52 q20 8 40 0" fill="none" stroke="rgba(31,92,80,0.28)" stroke-width="2.2" stroke-linecap="round" />
          <!-- 팔 -->
          <path d="M38 60 q-14 10 -10 24" fill="none" stroke="#1f5c50" stroke-width="3.5" stroke-linecap="round" />
          <path d="M102 60 q14 10 10 24" fill="none" stroke="#1f5c50" stroke-width="3.5" stroke-linecap="round" />
          <!-- 머리 -->
          <circle cx="70" cy="28" r="23" fill="url(#obcharBody)" stroke="#1f5c50" stroke-width="3.5" />
          <!-- 볼록해 보이도록 왼쪽 위 하이라이트 + 턱 밑 그늘 -->
          <ellipse cx="60" cy="19" rx="9" ry="6" fill="rgba(255,255,255,0.45)" />
          <path d="M50 33 a23 23 0 0 0 40 0 a23 23 0 0 1 -40 0z" fill="rgba(214,150,96,0.18)" />
          <path d="M52 14 q18 -10 36 0" fill="none" stroke="#1f5c50" stroke-width="3.5" stroke-linecap="round" />
          <circle cx="61" cy="28" r="2.8" fill="#1f5c50" />
          <circle cx="79" cy="28" r="2.8" fill="#1f5c50" />
          <circle cx="62" cy="27" r="0.9" fill="#fff" />
          <circle cx="80" cy="27" r="0.9" fill="#fff" />
          <path d="M64 36 q6 5 12 0" fill="none" stroke="#1f5c50" stroke-width="2.6" stroke-linecap="round" />
          <ellipse cx="53" cy="34" rx="5" ry="3.2" fill="#ffb3b3" opacity=".75" />
          <ellipse cx="87" cy="34" rx="5" ry="3.2" fill="#ffb3b3" opacity=".75" />
          <!-- 주사 놓을 자리 (배꼽) -->
          <circle cx="70" cy="78" r="9" class="arm-site-ring" />
          <circle cx="70" cy="78" r="3.5" fill="#ef6a54" />
        </svg>`,
      // 슬로건을 그대로 쓴다. 이 앱이 무엇을 약속하는지가 여기 다 들어 있는데
      // 정작 옛 온보딩 세 장에는 한 번도 안 나왔다.
      title: '오늘도 마음에 한 대 놓고 갑니다',
      body: '기분을 하나 고르면, 오늘 해볼 수 있는<br>한 가지를 처방해드려요. 30초면 됩니다.',
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
        ${SLIDES.length > 1 ? `<div class="ob-dots" id="ob-dots">
          ${SLIDES.map((_, n) => `<span class="ob-dot${n === 0 ? ' on' : ''}"></span>`).join('')}
        </div>` : ''}
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
