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
      //   (2026-09-26) 스플래시·주사 화면과 같은 후드 캐릭터로 통일했다. 후드가 머리를
      //   감싸면 머리가 몸보다 커 보이고, 그게 아기 비율이 된다 — 귀여움은 거기서 온다.
      //   여기는 맞이하는 자리라 스플래시와 같은 표정(눈 감은 웃음 + 하트)을 쓴다.
      //   주사 화면만 눈을 뜬 채로 두었다. 기다리는 자리에서 눈을 감으면 자는 것처럼 보인다.
      // 주의: index.html의 #arm-target(char*)·스플래시(sp*) SVG와 같은 문서에 있으므로
      //   gradient id가 겹치면 한쪽이 상대 그라디언트를 쓴다. 그래서 ob 접두사를 붙여뒀다.
      art: `  <svg viewBox="0 0 150 162" width="159" height="172" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="obSkin" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="#fff1da" /><stop offset="100%" stop-color="#ffd9ab" />
      </linearGradient>
      <linearGradient id="obHood" x1="0.2" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stop-color="#8fd6c6" /><stop offset="100%" stop-color="#4fa392" />
      </linearGradient>
      <radialGradient id="obGround" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stop-color="rgba(90,60,40,0.30)" />
        <stop offset="60%" stop-color="rgba(90,60,40,0.12)" />
        <stop offset="100%" stop-color="rgba(90,60,40,0)" />
      </radialGradient>
    </defs>
    <ellipse cx="75" cy="154" rx="44" ry="7" fill="url(#obGround)" />
    <g>
      <!-- 몸통: 앉은 자세. 아래가 넓은 종 모양이라 서 있는 것보다 안정돼 보이고,
           안정된 실루엣이 곧 "순하다"로 읽힌다. -->
      <path d="M75 78 c27 0 41 19 41 40 c0 17 -9 28 -41 28 s-41 -11 -41 -28 c0 -21 14 -40 41 -40 z"
            fill="url(#obHood)" stroke="#1f5c50" stroke-width="4" stroke-linejoin="round" />
      <!-- 배: 후드 밖으로 나온 맨살. 옷과 살의 대비가 있어야 옷을 입은 걸로 보인다. -->
      <ellipse cx="75" cy="124" rx="31" ry="22" fill="url(#obSkin)" />
      <ellipse cx="75" cy="130" rx="27" ry="16" fill="rgba(214,150,96,0.16)" />
      <ellipse cx="64" cy="116" rx="10" ry="6" fill="rgba(255,255,255,0.45)" />
      <!-- 발 -->
      <ellipse cx="57" cy="147" rx="12" ry="7.5" fill="#3d8a7c" stroke="#1f5c50" stroke-width="4" />
      <ellipse cx="93" cy="147" rx="12" ry="7.5" fill="#3d8a7c" stroke="#1f5c50" stroke-width="4" />
      <!-- 후드: 머리를 통째로 감싼다. 이 앱 캐릭터가 귀여워 보이는 건 여기서 온다 —
           머리가 몸보다 크고, 그 큰 머리가 둥글게 감싸여 있으면 아기 비율이 된다. -->
      <circle cx="75" cy="52" r="43" fill="url(#obHood)" stroke="#1f5c50" stroke-width="4" />
      <!-- 후드 안쪽 그늘: 얼굴이 후드 안에 "들어가 있게" 만든다. 없으면 초록 원 위에
           얼굴을 얹어놓은 것처럼 납작해 보인다. -->
      <ellipse cx="75" cy="58" rx="33.5" ry="31.5" fill="rgba(20,70,60,0.28)" />
      <!-- 얼굴 -->
      <ellipse cx="75" cy="57" rx="31" ry="29" fill="url(#obSkin)" stroke="#1f5c50" stroke-width="3.6" />
      <ellipse cx="63" cy="44" rx="12" ry="7.5" fill="rgba(255,255,255,0.5)" />
      <!-- 눈을 감은 웃음. 위로 휜 선이라야 웃는 눈이 된다 — 아래로 휘면 우는 눈이다. -->
      <path d="M58 60 q7 -9 14 0" fill="none" stroke="#1f5c50" stroke-width="3.6" stroke-linecap="round" />
      <path d="M78 60 q7 -9 14 0" fill="none" stroke="#1f5c50" stroke-width="3.6" stroke-linecap="round" />
      <!-- 볼: 크고 진할수록 어려 보인다. -->
      <ellipse cx="52" cy="68" rx="7.5" ry="4.8" fill="#ffa8ae" opacity=".85" />
      <ellipse cx="98" cy="68" rx="7.5" ry="4.8" fill="#ffa8ae" opacity=".85" />
      <path d="M67 69 q8 8 16 0" fill="none" stroke="#1f5c50" stroke-width="3.2" stroke-linecap="round" />
      <!-- 팔이 앞으로 모인다. 바깥으로 늘어진 팔은 "서 있다", 모은 팔은 "건네준다"가 된다. -->
      <path d="M39 106 q3 14 17 16" fill="none" stroke="#1f5c50" stroke-width="4" stroke-linecap="round" />
      <path d="M111 106 q-3 14 -17 16" fill="none" stroke="#1f5c50" stroke-width="4" stroke-linecap="round" />
    </g>
    <!-- 품에 안긴 하트 -->
    <path d="M75 131 c-10.5 -7.5 -14 -12 -14 -16.5 a7 7 0 0 1 14 -3.4 a7 7 0 0 1 14 3.4 c0 4.5 -3.5 9 -14 16.5 z"
          fill="#ff8fb3" stroke="#1f5c50" stroke-width="3" stroke-linejoin="round" />
    <!-- 손은 하트 위에 그린다 — 그래야 "들고 있다"가 된다. -->
    <g>
      <circle cx="58" cy="122" r="8" fill="url(#obSkin)" stroke="#1f5c50" stroke-width="3.4" />
      <circle cx="92" cy="122" r="8" fill="url(#obSkin)" stroke="#1f5c50" stroke-width="3.4" />
    </g>
    <!-- 떠오르는 하트 둘. 처음부터 있으면 배경 장식이지만, 나중에 뜨면 캐릭터의 반응이 된다. -->
    <path d="M18 62 a5.6 5.6 0 0 1 9.4 -3.8 a5.6 5.6 0 0 1 9.4 3.8 c0 6 -9.4 11.4 -9.4 11.4 s-9.4 -5.4 -9.4 -11.4 z" fill="#ff8fb3" />
    <path d="M120 40 a4.2 4.2 0 0 1 7 -2.8 a4.2 4.2 0 0 1 7 2.8 c0 4.5 -7 8.5 -7 8.5 s-7 -4 -7 -8.5 z" fill="#ffb3c9" />
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
    // 실행 스플래시가 떠 있으면 그것이 끝난 뒤에 띄운다. 둘이 겹치면 로고를 한 번도
    // 못 보고, 무엇이 닫히는 중인지도 알 수 없다. 기다린 다음에는 260ms만 둔다 —
    // 스플래시가 이미 1초를 썼으므로 여기서 또 600ms를 더하면 문 앞이 너무 길어진다.
    const S = window.MaumjaroSplash;
    if (S && typeof S.whenDone === 'function' && S.shown) {
      // 스플래시가 이미 2.4초를 썼다. 여기서 또 600ms를 더하면 첫 방문자가 문 앞에서
      // 3초를 기다린다 — 지금 이 앱의 문제가 정확히 "8초 만에 나간다"이므로 그건 못 한다.
      // 사라지는 연출은 스플래시의 페이드가 이미 해줬으니 홈을 한 번만 스치게 두고 띄운다.
      S.whenDone(() => setTimeout(() => open(false), 150));
      return;
    }
    // 첫 화면이 그려진 뒤에 띄운다(빈 화면 위에 뜨면 무엇에 대한 설명인지 모른다).
    setTimeout(() => open(false), 600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.MaumjaroOnboarding = { open };
})();
