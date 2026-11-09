// 연애센터 — 호감지수 + 연애 고민 10개의 다각도 풀이
//
// 왜 운세 탭이 아니라 별 탭인가:
// 이 기능은 점이 아니다. 호감지수는 사용자가 "본 것"을 세는 셈이고, 고민 풀이는
// 상황·관점·행동·금지 네 각도로 읽는 글이다. 운세센터에 넣으면 들어온 사람이
// 그걸 점괘로 읽게 되고, 그 순간 "맘운자로를 운세 앱으로 만들지 않는다"는
// 1번 원칙을 안에서부터 어긴다. 그래서 배경도 약국 톤을 그대로 쓴다 —
// theme.js의 MOODY에 view-love를 넣지 않았다. 색이 장소를 말하니까,
// 여기는 점집이 아니라 약국 쪽이라고 색으로 말해 둔다.
//
// 브랜드 원칙 3(모든 화면은 주사로 끝난다)을 지키는 방식:
//   호감지수 결과는 궁합과 똑같이 봉인해 두고 주사로 연다(Rx.wireExternalTrigger).
//   고민 풀이는 바로 읽히지만, 각 고민에 실제 처방 id가 붙어 있어 끝이 처방센터다.
//   게이트는 한 군데만 둔다 — 두 군데 다 걸면 10/4 설치 잠금과 같은 꼴이 된다.
//
// app.js는 건드리지 않는다. 탭은 mbti.js·fortune.js와 같은 방식으로
// .tab-btn에 독립 리스너를 하나 더 다는 식으로 붙인다.
(() => {
  'use strict';

  const Core = window.MaumjaroCore;
  const Rx = window.MaumjaroRx;
  const D = window.MaumjaroLoveData;
  const viewLove = document.getElementById('view-love');
  const mount = document.getElementById('love-content');
  if (!viewLove || !mount || !D || !Rx) return;

  const STORE_KEY = 'maumjaro:love';

  // 주사를 놓으면 화면이 홈으로 갔다 돌아오므로, 체크 상태는 모듈 안에 들고 있어야 한다.
  let checked = new Set();
  let revealed = false;

  function trackEvent(name, params) {
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') G.track(name, params);
  }
  function sfx(name) {
    try {
      const S = window.MaumjaroSfx;
      if (S && typeof S[name] === 'function') S[name]();
    } catch (e) { /* 소리는 없어도 된다 */ }
  }
  function toast(msg) {
    if (Core && typeof Core.showToast === 'function') Core.showToast(msg);
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/\n/g, '&#10;');
  }

  // ---------- 저장 (maumjaro: 접두사. 기존 키는 손대지 않는다) ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }
  function save(obj) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) { /* 저장이 막혀도 화면은 떠야 한다 */ }
  }

  // ---------- 셈 ----------
  // 점수가 아니라 셈이다. 체크된 가중치의 합을 긍정 총합으로 나눈다.
  // 반대 신호는 음수 가중치라 그냥 더해지고, 0 아래로는 내려가지 않는다.
  function scoreOf(set) {
    let raw = 0;
    D.LOVE_SIGNAL_GROUPS.forEach((g) => {
      g.items.forEach((it) => { if (set.has(it.id)) raw += it.w; });
    });
    const pct = Math.round((raw / D.LOVE_SIGNAL_MAX) * 100);
    return Math.max(0, Math.min(100, pct));
  }
  function bandOf(score) {
    return D.LOVE_BANDS.find((b) => score >= b.min) || D.LOVE_BANDS[D.LOVE_BANDS.length - 1];
  }
  function countOf(set, negative) {
    let n = 0;
    D.LOVE_SIGNAL_GROUPS.filter((g) => !!g.negative === negative).forEach((g) => {
      g.items.forEach((it) => { if (set.has(it.id)) n += 1; });
    });
    return n;
  }

  const DISCLAIMER = '이건 점이 아니라 셈이에요. 당신이 체크한 것을 더한 값이고, 상대 마음을 알아내는 장치가 아닙니다. 같은 행동도 사람마다 다른 뜻일 수 있어요.';

  // ---------- 허브 ----------
  function renderHub() {
    const last = load();
    const hasLast = last && typeof last.score === 'number';
    mount.innerHTML = `
      <div class="rx-nav-header">
        <span class="rx-nav-title">💘 연애센터</span>
      </div>

      <button class="rx-custom-cta" id="love-signal-cta" type="button">
        <span class="rx-custom-cta-emoji">📊</span>
        <span class="rx-custom-cta-text">
          <span class="rx-custom-cta-title">호감지수 보기</span>
          <span class="rx-custom-cta-sub">${hasLast ? `지난번 ${last.score} · 다시 체크하기` : '내가 본 신호를 체크하면 됩니다'}</span>
        </span>
        <span class="rx-custom-cta-arrow">›</span>
      </button>

      <button class="rx-custom-cta" id="love-topic-cta" type="button">
        <span class="rx-custom-cta-emoji">🧩</span>
        <span class="rx-custom-cta-text">
          <span class="rx-custom-cta-title">연애 고민 풀이</span>
          <span class="rx-custom-cta-sub">한 고민을 네 각도로 — 상황·상대·할 일·하지 말 것</span>
        </span>
        <span class="rx-custom-cta-arrow">›</span>
      </button>

      <div class="rx-category-grid">
        ${D.LOVE_TOPICS.slice(0, 6).map((t) => `
          <div class="rx-category-tile" data-topic="${t.id}">
            <span class="rx-category-emoji">${t.emoji}</span>
            <span class="rx-category-label">${esc(t.label)}</span>
            <span class="rx-category-count">${esc(t.sub)}</span>
          </div>`).join('')}
      </div>

      <button class="rx-friend-quick-btn" id="love-more-topics" type="button" style="width:100%;margin-top:4px;">고민 10개 전부 보기 ›</button>

      <button class="rx-friend-quick-btn" id="love-goto-match" type="button" style="width:100%;margin-top:8px;">💞 생년월일 궁합도 보기 ›</button>

      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">${DISCLAIMER}</p>
    `;

    document.getElementById('love-signal-cta').addEventListener('click', () => {
      trackEvent('love_signal_opened', { had_last: hasLast ? 1 : 0 });
      renderSignals();
    });
    document.getElementById('love-topic-cta').addEventListener('click', renderTopicList);
    document.getElementById('love-more-topics').addEventListener('click', renderTopicList);
    document.getElementById('love-goto-match').addEventListener('click', gotoMatch);
    mount.querySelectorAll('.rx-category-tile').forEach((tile) => {
      tile.addEventListener('click', () => renderTopic(tile.dataset.topic));
    });
  }

  // 궁합은 운세 탭 안에 이미 있다. 새로 만들지 않고 그쪽으로 보낸다.
  function gotoMatch() {
    const tab = document.querySelector('.tab-btn[data-view="fortune"]');
    if (tab) tab.click();
    setTimeout(() => {
      const tile = document.querySelector('.rx-category-tile[data-fortune="match"]');
      if (tile) tile.click();
    }, 120);
  }

  // ---------- 호감지수: 체크리스트 ----------
  function renderSignals() {
    const pos = countOf(checked, false);
    const neg = countOf(checked, true);
    mount.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="love-back" type="button">‹</button>
        <span class="rx-nav-title">📊 호감지수</span>
      </div>

      <div class="rx-detail-card">
        <div class="rx-detail-emoji">📝</div>
        <div class="rx-detail-title">본 것만 체크해주세요</div>
        <p class="rx-detail-symptom">짐작이 아니라 <strong>실제로 있었던 일</strong>만 고르는 게 좋아요. 반대로 가는 신호도 같이 있습니다 — 그쪽도 솔직하게 체크해야 숫자가 쓸모 있어요.</p>
      </div>

      ${D.LOVE_SIGNAL_GROUPS.map((g) => `
        <div class="rx-custom-preview" style="margin-top:10px;">
          <div class="rx-slip-row">
            <span class="rx-slip-key">${g.emoji} ${esc(g.label)}</span>
            <span class="rx-slip-value">${g.negative ? '있으면 체크' : ''}</span>
          </div>
          <div class="love-signal-list">
            ${g.items.map((it) => `
              <button class="love-signal${checked.has(it.id) ? ' on' : ''}" type="button" data-sig="${it.id}">
                <span class="love-signal-box">${checked.has(it.id) ? '✓' : ''}</span>
                <span class="love-signal-label">${esc(it.label)}</span>
              </button>`).join('')}
          </div>
        </div>`).join('')}

      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">
        체크 ${pos}개${neg ? ` · 반대 신호 ${neg}개` : ''}
      </p>
      <button class="action-btn" id="love-signal-submit" type="button" style="width:100%;margin-top:6px;">결과 보기</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">${DISCLAIMER}</p>
    `;

    document.getElementById('love-back').addEventListener('click', renderHub);
    mount.querySelectorAll('.love-signal').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.sig;
        if (checked.has(id)) checked.delete(id); else checked.add(id);
        revealed = false; // 체크가 바뀌면 다시 봉인한다 — 안 그러면 숫자만 갈아보게 된다
        const y = window.scrollY;
        renderSignals();
        window.scrollTo(0, y);
      });
    });
    document.getElementById('love-signal-submit').addEventListener('click', () => {
      if (!checked.size) { toast('하나라도 체크해주세요'); return; }
      trackEvent('love_signal_submit', { pos: countOf(checked, false), neg: countOf(checked, true) });
      renderSignalResult();
    });
  }

  // ---------- 호감지수: 결과(주사로 연다) ----------
  function renderSignalResult() {
    const score = scoreOf(checked);
    const band = bandOf(score);
    const pos = countOf(checked, false);
    const neg = countOf(checked, true);

    if (!revealed) {
      mount.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="love-back" type="button">‹</button>
          <span class="rx-nav-title">📊 호감지수</span>
        </div>
        <div class="rx-detail-card mbti-hero">
          <div class="rx-detail-emoji">💌</div>
          <div class="rx-detail-title">체크 ${pos}개${neg ? ` · 반대 ${neg}개` : ''}</div>
          <p class="rx-detail-symptom">결과가 봉해져 있어요.<br /><strong>주사를 놓으면 열립니다</strong></p>
          <div class="mbti-sealed" aria-hidden="true">
            <span class="mbti-sealed-q">📊</span>
            <span class="mbti-sealed-stamp">봉인</span>
          </div>
        </div>
        <button class="action-btn" id="love-gate-btn" type="button" style="width:100%;">💉 주사 놓고 결과 열기</button>
        <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">팔을 눌러도 되고, 폰을 콕 찌르듯 움직여도 돼요</p>
      `;
      document.getElementById('love-back').addEventListener('click', renderSignals);
      wireGate();
      return;
    }

    save({ date: new Date().toISOString().slice(0, 10), score, checked: Array.from(checked) });

    mount.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="love-back" type="button">‹</button>
        <span class="rx-nav-title">📊 호감지수</span>
      </div>

      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${band.emoji}</div>
        <div class="love-score">${score}</div>
        <div class="rx-detail-title">${esc(band.title)}</div>
        <p class="rx-detail-symptom">${esc(band.line)}</p>
      </div>

      <div class="rx-custom-preview">
        <div class="rx-slip-row"><span class="rx-slip-key">✅ 오늘 할 한 가지</span></div>
        <p class="rx-slip-text">${esc(band.doIt)}</p>
      </div>
      <div class="rx-custom-preview" style="margin-top:8px;">
        <div class="rx-slip-row"><span class="rx-slip-key">🚫 하면 더 나빠지는 것</span></div>
        <p class="rx-slip-text">${esc(band.dont)}</p>
      </div>

      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">
        체크한 신호 ${pos}개${neg ? ` · 반대로 가는 신호 ${neg}개` : ''} · 분모 ${D.LOVE_SIGNAL_MAX}
      </p>

      <button class="rx-friend-quick-btn love-goto-rx" type="button" data-rx="${band.rxId}" style="width:100%;margin-top:8px;">
        이 마음에 맞는 처방 보러가기 ›
      </button>
      <button class="action-btn" id="love-share-btn" type="button" style="width:100%;margin-top:8px;"
        data-txt="${escAttr(`호감지수 ${score} · ${band.title}\n내가 본 신호를 체크했더니 이렇게 나왔어`)}">결과 보내기 💌</button>
      <button class="rx-slip-photo-btn" id="love-redo" type="button" style="width:100%;margin-top:8px;">다시 체크하기</button>

      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">${DISCLAIMER}</p>
    `;
    document.getElementById('love-back').addEventListener('click', renderHub);
    document.getElementById('love-redo').addEventListener('click', () => { revealed = false; renderSignals(); });
    wireRxButtons();
    wireShare(document.getElementById('love-share-btn'), 'love-signal');
    trackEvent('love_signal_result', { score, pos, neg, band: band.min });
  }

  // 궁합과 같은 주사 게이트를 쓴다(Rx.wireExternalTrigger). 새로 구현하지 않는다.
  function wireGate() {
    const btn = document.getElementById('love-gate-btn');
    if (!btn) return;
    const syntheticP = {
      id: 'love-reveal', category: 'love', title: '호감지수', diagnosis: '결과를 여는 중',
      emoji: '📊', color: '#ff8fb3',
    };
    Rx.wireExternalTrigger(btn, syntheticP, () => {
      Rx.resetGenericFlowState('💉 주사 놓고 결과 열기');
      Rx.showRxImageFade(syntheticP, () => {
        const tab = document.querySelector('.tab-btn[data-view="love"]');
        if (tab) tab.click();
        revealed = true;
        sfx('loveReveal');
        renderSignalResult();
      });
    });
  }

  // ---------- 고민 목록 ----------
  function renderTopicList() {
    mount.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="love-back" type="button">‹</button>
        <span class="rx-nav-title">🧩 연애 고민</span>
      </div>
      <p class="rx-custom-hint" style="text-align:center;">지금 제일 가까운 걸 하나 골라주세요</p>
      <div class="rx-category-grid">
        ${D.LOVE_TOPICS.map((t) => `
          <div class="rx-category-tile" data-topic="${t.id}">
            <span class="rx-category-emoji">${t.emoji}</span>
            <span class="rx-category-label">${esc(t.label)}</span>
            <span class="rx-category-count">${esc(t.sub)}</span>
          </div>`).join('')}
      </div>
      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">
        여기 적힌 건 정답이 아니라 다른 각도예요. 당신 상황을 가장 잘 아는 사람은 당신입니다.
      </p>
    `;
    document.getElementById('love-back').addEventListener('click', renderHub);
    mount.querySelectorAll('.rx-category-tile').forEach((tile) => {
      tile.addEventListener('click', () => renderTopic(tile.dataset.topic));
    });
  }

  // ---------- 고민 하나: 네 각도 ----------
  function renderTopic(id) {
    const t = D.LOVE_TOPICS.find((x) => x.id === id);
    if (!t) { renderTopicList(); return; }
    const angles = [
      ['👀', '지금 무슨 일이 일어나고 있나', t.now],
      ['💭', '상대 쪽에서는', t.them],
      ['✅', '오늘 할 한 가지', t.doIt],
      ['🚫', '하면 더 나빠지는 것', t.dont],
    ];
    mount.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="love-back" type="button">‹</button>
        <span class="rx-nav-title">${t.emoji} ${esc(t.label)}</span>
      </div>
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${t.emoji}</div>
        <div class="rx-detail-title">${esc(t.label)}</div>
        <div class="rx-detail-diagnosis">${esc(t.sub)}</div>
      </div>
      ${angles.map(([e, head, body]) => `
        <div class="rx-custom-preview" style="margin-top:8px;">
          <div class="rx-slip-row"><span class="rx-slip-key">${e} ${head}</span></div>
          <p class="rx-slip-text">${esc(body)}</p>
        </div>`).join('')}

      <button class="rx-friend-quick-btn love-goto-rx" type="button" data-rx="${t.rxId}" style="width:100%;margin-top:12px;">
        이 고민에 맞는 처방 보러가기 ›
      </button>
      <button class="action-btn" id="love-share-btn" type="button" style="width:100%;margin-top:8px;"
        data-txt="${escAttr(`${t.label} — ${t.doIt}`)}">이 한 줄 보내기 💌</button>
      <button class="rx-slip-photo-btn" id="love-goto-signal" type="button" style="width:100%;margin-top:8px;">📊 호감지수도 재보기</button>

      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">
        정답이 아니라 다른 각도예요. 읽고 아니라고 느껴지면 그 느낌이 더 맞습니다.
      </p>
    `;
    document.getElementById('love-back').addEventListener('click', renderTopicList);
    document.getElementById('love-goto-signal').addEventListener('click', renderSignals);
    wireRxButtons();
    wireShare(document.getElementById('love-share-btn'), 'love-topic');
    trackEvent('love_topic_opened', { topic: t.id });
  }

  // ---------- 공통 배선 ----------
  function wireRxButtons() {
    mount.querySelectorAll('.love-goto-rx').forEach((b) => {
      b.addEventListener('click', () => {
        trackEvent('love_goto_rx', { rx: b.dataset.rx });
        // 정확한 처방 하나로 보낸다. 없으면 연애 카테고리 목록으로 떨어진다.
        if (typeof Rx.goToRx === 'function') Rx.goToRx(b.dataset.rx, 'love');
        else Rx.goToRxCategory('love');
      });
    });
  }
  function wireShare(btn, kind) {
    if (!btn) return;
    btn.addEventListener('click', () => {
      Rx.shareOrCopy(btn.dataset.txt, 'https://maumjaro.minimalbreeze.com/', kind);
    });
    if (window.MaumjaroThreads) {
      window.MaumjaroThreads.mountButton({
        after: btn, kind: 'love',
        fact: String(btn.dataset.txt || '').split('\n')[0],
      });
    }
  }

  // ---------- 탭 ----------
  let painted = false;
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      viewLove.hidden = view !== 'love';
      if (view !== 'love') return;
      // 주사를 놓고 돌아오는 길에도 이 리스너를 지나간다. 그때는 다시 그리면
      // 결과 화면이 허브로 밀려나므로, 처음 한 번만 그린다.
      if (!painted) { painted = true; renderHub(); }
    });
  });

  window.MaumjaroLove = {
    open() {
      const tab = document.querySelector('.tab-btn[data-view="love"]');
      if (tab) tab.click();
    },
    summary() {
      const last = load();
      return last && typeof last.score === 'number' ? { score: last.score, date: last.date } : null;
    },
  };
})();
