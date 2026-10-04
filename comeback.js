// 주사 직후 마무리 카드 — 다시 올 이유와 퍼뜨릴 입구를 한 화면에 둔다
//
// 왜 만들었나:
// 재방문 장치(연속 출석·마음약 46종·레벨)와 확산 장치(친구에게 보내기)가 이미 다 있는데,
// 재방문이 83명 중 1명이었다. 장치가 없어서가 아니라 전부 사람이 안 보는 자리에 있었다.
//   - 연속·레벨·수집  → 기록 탭 안 (거의 아무도 안 간다)
//   - 홈 게임 패널     → y=812, 접힘선 778 아래라 안 보인다
//   - 친구에게 보내기  → 운세 결과 안, 타로 결과 안, 처방센터 안 (전부 깊다)
//   - 주사 완료 순간   → 빛 효과와 위로 문구 한 줄. 아무 유도가 없었다
//
// 주사를 끝까지 놓은 사람은 (1) 앱을 완주했고 (2) 방금 기분이 좋아졌고
// (3) 100% 이 화면을 본다. 앱에서 가장 귀한 1초인데 비어 있었다. 거기를 채운다.
//
// 문구를 "얻는 말"이 아니라 "잃는 말"로 쓴다:
//   내일 오면 🔥 36일   →   내일 안 오면 🔥 35일이 0이 돼요
// 같은 사실인데 사람은 잃는 쪽을 더 크게 느낀다. 거짓말은 한 마디도 하지 않는다.
//
// ⚠️ 겁을 주지 않는다. "안 하면 나쁜 일이 생긴다" 류는 쓰지 않는다.
// 마음이 힘든 사람이 쓰는 앱이라, 불안으로 끌어오면 정작 힘들 때 안 열게 된다.
// (fortune-ai.js / heal-ai.js의 "불안을 조장하지 않는다"와 같은 선이다.)
//
// app.js는 건드리지 않는다. app.js가 이미 쏘고 있는 maumjaro:emotion-injected 를 듣는다.
(() => {
  'use strict';

  // 앞에 뜨는 것들이 끝나기를 기다리는 값.
  //
  // ⚠️ 여기서 한 번 틀렸다. 처음엔 14초만 기다리게 했는데 카드가 아예 안 떴다.
  // 보상 오버레이(reward-overlay)는 저절로 닫히지 않는다 — 마음약 상자를 사용자가
  // 직접 눌러서 열어야 닫힌다. 사람이 1분 뒤에 누를 수도 있어서 넉넉히 기다린다.
  //
  // 그리고 install-prompt.js도 보상 오버레이가 닫히고 900ms 뒤에 시트를 띄운다.
  // 내가 그보다 빨리 뜨면 두 개가 겹친다. 그래서 900보다 뒤에 서고,
  // 띄우기 직전에 설치 시트가 떠 있는지 한 번 더 본다.
  const SHOW_AFTER_SETTLE_MS = 1400; // install-prompt.js의 900ms보다 뒤
  const MAX_WAIT_MS = 180000;        // 상자를 늦게 열어도 기다린다
  const POLL_MS = 250;

  // 이 셋 중 하나라도 떠 있으면 아직 내 차례가 아니다.
  //   healing-overlay : 주사 직후 빛 효과(app.js가 3.7초 뒤 닫는다)
  //   reward-overlay  : 오늘의 마음약 지급(첫 주사일 때만)
  //   install-sheet   : 홈 화면에 추가 권유(평생 한 번, install-prompt.js)
  function somethingElseIsOpen() {
    const heal = document.getElementById('healing-overlay');
    if (heal && heal.classList.contains('show')) return true;
    const reward = document.getElementById('reward-overlay');
    if (reward && !reward.hidden) return true;
    if (document.querySelector('.install-sheet')) return true;
    return false;
  }

  function track(name, params) {
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') G.track(name, params || {});
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ---------- 보낼 링크 ----------
  // 커스텀 처방전과 똑같은 ?custom= 규격을 쓴다. 받는 쪽이 이미 만들어져 있어서
  // (홈 상단 "친구가 보낸 처방" 카드) 새로 만들 것이 없다.
  function buildShareUrl(symptom) {
    const Rx = window.MaumjaroRx;
    if (!Rx || typeof Rx.buildCustomShareUrl !== 'function') return '';
    let sender = '';
    try { sender = (localStorage.getItem('maumjaro:username') || '').trim().slice(0, 12); } catch (e) { /* 이름은 없어도 된다 */ }
    const payload = {
      p: '',                                   // 받는 사람 이름은 보내는 쪽에서 안 정한다
      d: `${symptom.label} ${symptom.mg}`,     // 진단명 자리에 감정과 용량
      rx: symptom.caption || '오늘 마음에 한 대 놓고 가요',
      w: '하루 한 번, 마음이 무거울 때',
      dr: sender || '맘운자로',
      ts: Date.now(),
    };
    try { return Rx.buildCustomShareUrl(payload); } catch (e) { return ''; }
  }

  // ---------- 카드 ----------
  function render(symptom) {
    if (document.getElementById('cb-card')) return;

    const G = window.MaumjaroGame;
    const p = (G && typeof G.previewToday === 'function') ? G.previewToday() : null;

    const rows = [];

    // 1) 연속 — 잃는 쪽으로 말한다. 1일째는 아직 잃을 게 없으니 다르게 쓴다.
    if (p && p.streak > 0) {
      rows.push(p.streak === 1
        ? `<div class="cb-row"><span class="cb-ico">🔥</span><span><b>오늘부터 1일</b><br><span class="cb-sub">내일도 오면 2일이 돼요</span></span></div>`
        : `<div class="cb-row"><span class="cb-ico">🔥</span><span><b>${p.streak}일 연속</b><br><span class="cb-sub">내일 안 오면 0일로 돌아가요</span></span></div>`);
    }

    // 2) 수집 — 오늘 것은 오늘만 받을 수 있다(game.js의 시즌 한정이 실제로 그렇다).
    if (p && p.totalMedicines) {
      rows.push(`<div class="cb-row"><span class="cb-ico">💊</span><span><b>마음약국 ${p.collectedCount}/${p.totalMedicines}</b><br><span class="cb-sub">오늘의 마음약은 오늘만 받을 수 있어요</span></span></div>`);
    }

    const url = buildShareUrl(symptom);

    const el = document.createElement('div');
    el.id = 'cb-card';
    el.className = 'cb-card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '오늘의 마무리');
    el.innerHTML = `
      <div class="cb-inner">
        <div class="cb-head">오늘의 마무리</div>
        ${rows.join('')}
        ${url ? `<button class="cb-share" id="cb-share" type="button">💌 이 처방 친구에게 보내기</button>` : ''}
        <button class="cb-close" id="cb-close" type="button">닫기</button>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    track('comeback_card_shown', { streak: p ? p.streak : 0 });

    function close(how) {
      el.classList.remove('show');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
      track('comeback_card_closed', { how });
    }

    const shareBtn = document.getElementById('cb-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        track('comeback_share_clicked', { emotion: symptom.label });
        const Rx = window.MaumjaroRx;
        const text = `${symptom.emoji} ${symptom.label} ${symptom.mg} — 오늘 마음에 한 대 놓고 가요`;
        try {
          if (Rx && typeof Rx.shareOrCopy === 'function') await Rx.shareOrCopy(text, url, 'friend_rx');
        } catch (e) { /* 공유 실패해도 카드는 닫는다 */ }
        close('share');
      });
    }
    document.getElementById('cb-close').addEventListener('click', () => close('close'));
    // 바깥을 눌러도 닫힌다. 가두면 다음에 주사를 안 놓는다.
    el.addEventListener('click', (e) => { if (e.target === el) close('backdrop'); });
  }

  // ---------- 앞 오버레이가 다 끝나길 기다렸다가 띄운다 ----------
  function waitThenShow(symptom) {
    const started = Date.now();
    (function tick() {
      if (Date.now() - started > MAX_WAIT_MS) return;   // 뭔가 붙잡혀 있으면 조용히 포기한다
      if (somethingElseIsOpen()) { setTimeout(tick, POLL_MS); return; }
      setTimeout(() => {
        if (somethingElseIsOpen()) { tick(); return; }  // 기다리는 사이 또 떴으면 다시 기다린다
        render(symptom);
      }, SHOW_AFTER_SETTLE_MS);
    })();
  }

  document.addEventListener('maumjaro:emotion-injected', (e) => {
    const key = e && e.detail && e.detail.key;
    const Core = window.MaumjaroCore;
    const symptom = (Core && Core.SYMPTOMS && key) ? Core.SYMPTOMS[key] : null;
    if (!symptom) return;
    waitThenShow(symptom);
  });
})();
