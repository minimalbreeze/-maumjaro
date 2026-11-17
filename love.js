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

  // 주사를 놓으면 화면이 홈으로 갔다 돌아오므로, 고른 답은 모듈 안에 들고 있어야 한다.
  // { 문항id: 고른 선택지 번호 }
  let answers = {};
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
  // ⚠️ 2026-11-17 에 체크리스트가 4지선다로 바뀌었다. 옛 기록은
  // `{date, score, checked:[]}` 였고 새 기록은 `{v:2, date, score, answers:{}}` 다.
  // **옛 값을 지우지 않는다**(localStorage 규칙). 읽을 때 v 로 가른다.
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }
  function save(obj) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) { /* 저장이 막혀도 화면은 떠야 한다 */ }
  }

  // ---------- 셈 ----------
  // 점이 아니라 셈이다. 고른 선택지의 가중치를 더해 0~100 으로 펼친다.
  // 전부 아래쪽을 고르면 0, 전부 위쪽이면 100, 섞이면 그 사이다.
  // **50 이 반반이다** — 옛 체크리스트처럼 "아무것도 안 해서 0" 이 아니다.
  function rawOf(ans) {
    return D.LOVE_SITUATIONS.reduce((sum, q) => {
      const i = ans[q.id];
      return sum + (typeof i === 'number' && q.opts[i] ? q.opts[i].w : 0);
    }, 0);
  }
  function scoreOf(ans) {
    const raw = rawOf(ans);
    const pct = Math.round(((raw - D.LOVE_W_MIN) / (D.LOVE_W_MAX - D.LOVE_W_MIN)) * 100);
    return Math.max(0, Math.min(100, pct));
  }
  function bandOf(score) {
    return D.LOVE_BANDS.find((b) => score >= b.min) || D.LOVE_BANDS[D.LOVE_BANDS.length - 1];
  }
  function answeredCount(ans) {
    return D.LOVE_SITUATIONS.filter((q) => typeof ans[q.id] === 'number').length;
  }
  // 위쪽(+)을 고른 문항과 아래쪽(-)을 고른 문항을 센다. 결과 화면에서 보여준다.
  function sideCount(ans, positive) {
    return D.LOVE_SITUATIONS.filter((q) => {
      const i = ans[q.id];
      if (typeof i !== 'number' || !q.opts[i]) return false;
      return positive ? q.opts[i].w > 0 : q.opts[i].w < 0;
    }).length;
  }

  const DISCLAIMER = '이건 점이 아니라 셈이에요. 당신이 고른 답을 더한 값이고, 상대 마음을 알아내는 장치가 아닙니다. 같은 행동도 사람마다 다른 뜻일 수 있어요.';

  // ---------- 허브 ----------
  function renderHub() {
    const F = window.MaumjaroFortune;
    if (F && typeof F.releaseMatchHost === 'function') F.releaseMatchHost();
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
          <span class="rx-custom-cta-sub">${hasLast ? `지난번 ${last.score} · 다시 해보기` : '일상에서 상대가 어떻게 하는지 10가지'}</span>
        </span>
        <span class="rx-custom-cta-arrow">›</span>
      </button>

      <button class="rx-custom-cta" id="love-ai-cta" type="button">
        <span class="rx-custom-cta-emoji">💌</span>
        <span class="rx-custom-cta-text">
          <span class="rx-custom-cta-title">연애 속풀이</span>
          <span class="rx-custom-cta-sub">지금 상황을 적어주시면 네 각도로 같이 봐드려요</span>
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

      <p class="rx-custom-hint" style="margin-top:18px;font-weight:600;">💞 궁합</p>
      <div class="rx-category-grid">
        <div class="rx-category-tile" data-match="saju">
          <span class="rx-category-emoji">🗓️</span>
          <span class="rx-category-label">생년월일 궁합</span>
          <span class="rx-category-count">사주 오행</span>
        </div>
        <div class="rx-category-tile" data-match="zodiac">
          <span class="rx-category-emoji">⭐</span>
          <span class="rx-category-label">별자리 궁합</span>
          <span class="rx-category-count">원소 관계</span>
        </div>
        <div class="rx-category-tile" data-match="animal">
          <span class="rx-category-emoji">🐯</span>
          <span class="rx-category-label">띠 궁합</span>
          <span class="rx-category-count">삼합·육합·충</span>
        </div>
      </div>

      <p class="rx-custom-hint" style="margin-top:18px;font-weight:600;">🧩 지금 제일 가까운 고민</p>
      <div class="rx-category-grid">
        ${D.LOVE_TOPICS.slice(0, 6).map((t) => `
          <div class="rx-category-tile" data-topic="${t.id}">
            <span class="rx-category-emoji">${t.emoji}</span>
            <span class="rx-category-label">${esc(t.label)}</span>
            <span class="rx-category-count">${esc(t.sub)}</span>
          </div>`).join('')}
      </div>

      <button class="rx-friend-quick-btn" id="love-more-topics" type="button" style="width:100%;margin-top:4px;">고민 10개 전부 보기 ›</button>
      <button class="rx-friend-quick-btn" id="love-goto-tarot" type="button" style="width:100%;margin-top:8px;">🔮 연애 타로 3장 보기 ›</button>

      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">${DISCLAIMER}</p>
    `;

    document.getElementById('love-signal-cta').addEventListener('click', () => {
      trackEvent('love_signal_opened', { had_last: hasLast ? 1 : 0 });
      renderSituations();
    });
    document.getElementById('love-ai-cta').addEventListener('click', () => {
      trackEvent('love_ai_opened', {});
      renderAiLove();
    });
    document.getElementById('love-topic-cta').addEventListener('click', renderTopicList);
    document.getElementById('love-more-topics').addEventListener('click', renderTopicList);
    document.getElementById('love-goto-tarot').addEventListener('click', gotoLoveTarot);
    mount.querySelectorAll('.rx-category-tile[data-topic]').forEach((tile) => {
      tile.addEventListener('click', () => renderTopic(tile.dataset.topic));
    });
    mount.querySelectorAll('.rx-category-tile[data-match]').forEach((tile) => {
      tile.addEventListener('click', () => renderMatch(tile.dataset.match));
    });
  }

  // ---------- 궁합 (2026-11-17 효성님 지시로 운세 탭에서 여기로 옮겼다) ----------
  //
  // 계산(사주 명식·오행 관계·별자리 원소·띠 삼합/육합/충/원진)은 fortune.js에
  // 한 벌로 있고, 그 화면을 **연애 탭 안에** 그려 달라고 부른다. 코드를 복사해 오면
  // 두 벌이 되고, 한쪽만 고쳐지는 날이 온다.
  //
  // 사주 프로필이 없으면 그릴 수 없다(상대와 비교할 내 명식이 없다). 그때는
  // 운세 탭의 프로필 입력으로 보낸다 — 프로필 화면은 그쪽 흐름이라 새로 만들지 않는다.
  function renderMatch(mode) {
    const F = window.MaumjaroFortune;
    trackEvent('love_match_opened', { mode: mode || 'saju' });
    if (F && typeof F.openMatchIn === 'function'
        && F.openMatchIn(mount, { mode: mode || 'saju', onBack: renderHub })) return;

    // 못 연 이유가 두 가지다. 프로필이 없는 것과, 사주 계산 라이브러리가 안 뜬 것.
    // 둘을 같은 문구로 덮으면 "생년월일을 넣으라"는데 이미 넣은 사람이 또 넣게 된다.
    const hasProfile = !!(F && typeof F.hasSajuProfile === 'function' && F.hasSajuProfile());
    mount.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="love-back" type="button">‹</button>
        <span class="rx-nav-title">💞 궁합</span>
      </div>
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${hasProfile ? '📡' : '🗓️'}</div>
        <div class="rx-detail-title">${hasProfile ? '지금은 궁합을 열 수 없어요' : '내 생년월일이 먼저 필요해요'}</div>
        <p class="rx-detail-symptom">${hasProfile
          ? '사주를 계산하는 자료를 불러오지 못했어요. 인터넷이 잠깐 끊겼을 때 이렇게 됩니다. 조금 뒤에 다시 들어와 주세요.'
          : '궁합은 두 사람의 사주를 맞대어 보는 거라, 내 생년월일이 있어야 시작할 수 있어요. 한 번만 넣어두시면 다음부터는 바로 열립니다.'}</p>
      </div>
      ${hasProfile ? `
      <button class="action-btn" id="love-match-retry" type="button" style="width:100%;margin-top:10px;">다시 열어보기</button>
      ` : `
      <button class="action-btn" id="love-goto-profile" type="button" style="width:100%;margin-top:10px;">생년월일 넣고 오기 ›</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">운세 탭에서 한 번 넣으면 끝이에요</p>
      `}
      <button class="rx-friend-quick-btn" id="love-match-to-signal" type="button" style="width:100%;margin-top:8px;">📊 그동안 호감지수 먼저 재보기 ›</button>
    `;
    document.getElementById('love-back').addEventListener('click', renderHub);
    const retry = document.getElementById('love-match-retry');
    if (retry) retry.addEventListener('click', () => renderMatch(mode));
    const toProfile = document.getElementById('love-goto-profile');
    if (toProfile) {
      toProfile.addEventListener('click', () => {
        const tab = document.querySelector('.tab-btn[data-view="fortune"]');
        if (tab) tab.click();
      });
    }
    // 막힌 화면을 끝으로 두지 않는다(브랜드 원칙 3). 여기서도 주사 쪽으로 길이 난다.
    document.getElementById('love-match-to-signal').addEventListener('click', renderSituations);
  }

  // 연애 타로는 타로 무대(운세 탭)에서 돌아간다 — 카드 섞기·뒤집기 연출이 그쪽에 있다.
  // 여기서는 입구만 둬서 "연애운은 연애센터에서 한눈에"를 지킨다.
  function gotoLoveTarot() {
    trackEvent('love_goto_tarot', {});
    const tab = document.querySelector('.tab-btn[data-view="fortune"]');
    if (tab) tab.click();
    setTimeout(() => {
      // 반드시 운세 탭 안에서 찾는다. `data-topic`은 연애센터 타일도 쓰는 이름이라
      // document 전체에서 찾으면 숨어 있는 연애 탭 타일을 집을 수 있다.
      const tile = document.querySelector('#fortune-content .rx-category-tile[data-fortune="tarot"]');
      if (tile) tile.click();
      setTimeout(() => {
        const love = document.querySelector('#fortune-content .rx-category-tile[data-topic="love"]');
        if (love) love.click();
      }, 140);
    }, 140);
  }

  // ---------- 호감지수: 일상 반응 10문항 (4지선다) ----------
  function renderSituations() {
    const done = answeredCount(answers);
    mount.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="love-back" type="button">‹</button>
        <span class="rx-nav-title">📊 호감지수</span>
      </div>

      <div class="rx-detail-card">
        <div class="rx-detail-emoji">📝</div>
        <div class="rx-detail-title">실제로 어땠는지 골라주세요</div>
        <p class="rx-detail-symptom">바라는 쪽이 아니라 <strong>최근에 실제로 있었던 쪽</strong>을 고르는 게 좋아요. 위쪽이 정답인 문제가 아닙니다 — 아래쪽 답도 그대로 결과에 들어갑니다.</p>
      </div>

      ${D.LOVE_SITUATIONS.map((q, qi) => `
        <div class="rx-custom-preview" style="margin-top:12px;">
          <div class="rx-slip-row">
            <span class="rx-slip-key">${q.emoji} ${esc(q.q)}</span>
            <span class="rx-slip-value">${qi + 1}/${D.LOVE_SITUATIONS.length}</span>
          </div>
          <div class="love-opt-list">
            ${q.opts.map((o, oi) => `
              <button class="love-opt${answers[q.id] === oi ? ' on' : ''}" type="button" data-q="${q.id}" data-o="${oi}">
                <span class="love-opt-dot">${answers[q.id] === oi ? '✓' : ''}</span>
                <span class="love-opt-label">${esc(o.t)}</span>
              </button>`).join('')}
          </div>
        </div>`).join('')}

      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">
        ${done}/${D.LOVE_SITUATIONS.length} 골랐어요
      </p>
      <button class="action-btn" id="love-signal-submit" type="button" style="width:100%;margin-top:6px;">결과 보기</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">${DISCLAIMER}</p>
    `;

    document.getElementById('love-back').addEventListener('click', renderHub);
    mount.querySelectorAll('.love-opt').forEach((b) => {
      b.addEventListener('click', () => {
        answers[b.dataset.q] = Number(b.dataset.o);
        revealed = false; // 답이 바뀌면 다시 봉인한다 — 안 그러면 숫자만 갈아보게 된다
        const y = window.scrollY;
        renderSituations();
        window.scrollTo(0, y);
      });
    });
    document.getElementById('love-signal-submit').addEventListener('click', () => {
      const n = answeredCount(answers);
      if (n < D.LOVE_SITUATIONS.length) {
        toast(`${D.LOVE_SITUATIONS.length - n}개가 남았어요`);
        return;
      }
      trackEvent('love_signal_submit', { pos: sideCount(answers, true), neg: sideCount(answers, false) });
      renderSignalResult();
    });
  }

  // ---------- 호감지수: 결과(주사로 연다) ----------
  function renderSignalResult() {
    const score = scoreOf(answers);
    const band = bandOf(score);
    const pos = sideCount(answers, true);
    const neg = sideCount(answers, false);

    if (!revealed) {
      mount.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="love-back" type="button">‹</button>
          <span class="rx-nav-title">📊 호감지수</span>
        </div>
        <div class="rx-detail-card mbti-hero">
          <div class="rx-detail-emoji">💌</div>
          <div class="rx-detail-title">${D.LOVE_SITUATIONS.length}가지를 다 골랐어요</div>
          <p class="rx-detail-symptom">결과가 봉해져 있어요.<br /><strong>주사를 놓으면 열립니다</strong></p>
          <div class="mbti-sealed" aria-hidden="true">
            <span class="mbti-sealed-q">📊</span>
            <span class="mbti-sealed-stamp">봉인</span>
          </div>
        </div>
        <button class="action-btn" id="love-gate-btn" type="button" style="width:100%;">💉 주사 놓고 결과 열기</button>
        <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">팔을 눌러도 되고, 폰을 콕 찌르듯 움직여도 돼요</p>
      `;
      document.getElementById('love-back').addEventListener('click', renderSituations);
      wireGate();
      return;
    }

    save({ v: 2, date: new Date().toISOString().slice(0, 10), score, answers: { ...answers } });

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

      <div class="rx-custom-preview" style="margin-top:8px;">
        <div class="rx-slip-row"><span class="rx-slip-key">🧾 어떻게 나온 숫자인가</span></div>
        <p class="rx-slip-text">${D.LOVE_SITUATIONS.length}문항 중 위쪽을 고른 것이 <strong>${pos}개</strong>, 아래쪽이 <strong>${neg}개</strong>입니다. 전부 아래쪽이면 0, 전부 위쪽이면 100이고 <strong>50이 반반</strong>이에요.</p>
      </div>

      <button class="rx-friend-quick-btn love-goto-rx" type="button" data-rx="${band.rxId}" style="width:100%;margin-top:8px;">
        이 마음에 맞는 처방 보러가기 ›
      </button>
      <button class="action-btn" id="love-share-btn" type="button" style="width:100%;margin-top:8px;"
        data-txt="${escAttr(`호감지수 ${score} · ${band.title}\n일상에서 실제로 어땠는지 10가지 고르니까 이렇게 나왔어`)}">결과 보내기 💌</button>
      <button class="rx-slip-photo-btn" id="love-redo" type="button" style="width:100%;margin-top:8px;">다시 해보기</button>

      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">${DISCLAIMER}</p>
    `;
    document.getElementById('love-back').addEventListener('click', renderHub);
    document.getElementById('love-redo').addEventListener('click', () => { revealed = false; renderSituations(); });
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

  // ---------- 연애 고민 물어보기 (AI) ----------
  //
  // AI 맘운(fortune.js)과 **같은 프록시**를 쓴다. 새로 만들지 않는다 —
  // 주소는 `window.MaumjaroFortune.AI_PROXY_URL` 로 이미 나와 있다.
  //
  // ⚠️ 여기가 연애센터에서 가장 선을 넘기 쉬운 자리다. 사람이 "그 사람이 날
  // 좋아하나요?" 를 묻고 AI 가 "좋아합니다" 라고 답하면 그 순간 규칙이 깨진다.
  // 그래서 지시문에 네 가지를 못 박는다 — 단정 금지, 근거 암시 금지,
  // 부추김 금지(거절도 결과로 인정), 안전이 걱정되면 상담 안내.
  // 프록시가 죽거나 늦으면 **고민 10개 중 가장 가까운 것으로 떨어진다.**
  // 빈 화면을 남기지 않는다.
  const AI_TIMEOUT_MS = 20000;

  function proxyUrl() {
    return (window.MaumjaroFortune && window.MaumjaroFortune.AI_PROXY_URL) || '';
  }

  // 글에서 가장 가까운 고민을 찾는다. 프록시가 죽었을 때 떨어질 자리이자,
  // AI 답 아래에 "이 고민도 보기" 로 붙일 자리다.
  function nearestTopic(text) {
    const t = String(text);
    const hit = (words) => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    const table = {
      'read-no-reply': ['읽씹', '읽고', '답장', '답이 없', '안 읽', '1이'],
      breakup: ['헤어', '이별', '찼', '차였', '헤어졌'],
      reunion: ['재회', '다시 만', '돌아가', '전 남친', '전 여친', '전애인'],
      fight: ['싸웠', '싸움', '화났', '다퉜', '서운'],
      boredom: ['권태', '설렘이', '식었', '지겨'],
      confess: ['고백', '좋아한다고', '말할까', '타이밍'],
      sseom: ['썸', '애매', '뭐지', '무슨 사이'],
      'first-date': ['소개팅', '첫 데이트', '첫 만남', '처음 만'],
      'letting-go': ['정리', '포기', '그만', '잊'],
      crush: ['짝사랑', '좋아하는데', '혼자'],
    };
    let best = null; let bestN = 0;
    Object.keys(table).forEach((id) => {
      const n = hit(table[id]);
      if (n > bestN) { bestN = n; best = id; }
    });
    return best ? D.LOVE_TOPICS.find((x) => x.id === best) : null;
  }

  let aiAsking = false;

  function renderAiLove() {
    mount.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="love-back" type="button">‹</button>
        <span class="rx-nav-title">💌 연애 속풀이</span>
      </div>

      <div class="rx-detail-card">
        <div class="rx-detail-emoji">💭</div>
        <div class="rx-detail-title">여기에 다 적어주세요</div>
        <p class="rx-detail-symptom">짧아도 괜찮고 길어도 괜찮아요. 무슨 일이 있었고 무엇이 걸리는지 적어주시면 <strong>상황·상대·오늘 할 일·하지 말 것</strong> 네 각도로 같이 봐드려요.</p>
      </div>

      <div class="rx-custom-field">
        <textarea id="love-ai-q" class="rx-custom-input" rows="5"
          placeholder="예) 두 달째 거의 매일 연락하는 사이인데, 만나자고 하면 항상 다음에 보자고 해요. 제가 너무 들이대는 걸까요?"></textarea>
      </div>
      <button class="action-btn" id="love-ai-submit" type="button" style="width:100%;margin-top:6px;">💌 털어놓기</button>
      <div id="love-ai-answer"></div>

      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">
        ${DISCLAIMER} 적어주신 내용은 답을 만드는 데만 쓰이고 저장하지 않아요.
      </p>
    `;
    document.getElementById('love-back').addEventListener('click', renderHub);
    document.getElementById('love-ai-submit').addEventListener('click', submitAiLove);
  }

  function submitAiLove() {
    const box = document.getElementById('love-ai-q');
    const btn = document.getElementById('love-ai-submit');
    const out = document.getElementById('love-ai-answer');
    const q = (box.value || '').trim();
    if (!q) { toast('지금 상황을 적어주세요'); trackEvent('love_ai_submit_empty', {}); return; }
    if (aiAsking) return;
    aiAsking = true;
    btn.disabled = true;
    btn.textContent = '생각하는 중…';
    const near = nearestTopic(q);
    trackEvent('love_ai_asked', { len: q.length, matched: near ? 1 : 0, topic: near ? near.id : 'none' });
    const askedAt = Date.now();

    askAiLove(q)
      .then((text) => {
        renderAiLoveAnswer(text, near, 'proxy');
        trackEvent('love_ai_answered', { source: 'proxy', ms: Date.now() - askedAt });
      })
      .catch(() => {
        // 프록시가 죽어도 빈손으로 두지 않는다. 가장 가까운 고민 풀이로 떨어진다.
        const t = near || D.LOVE_TOPICS[0];
        out.innerHTML = `
          <div class="rx-detail-card" style="margin-top:16px;">
            <p class="rx-detail-symptom">지금은 답을 못 만들었어요. 대신 가장 가까워 보이는 고민 풀이를 띄울게요.</p>
            <button class="rx-friend-quick-btn" id="love-ai-fallback" type="button" style="width:100%;margin-top:10px;">${t.emoji} ${esc(t.label)} 풀이 보기 ›</button>
          </div>`;
        document.getElementById('love-ai-fallback').addEventListener('click', () => renderTopic(t.id));
        trackEvent('love_ai_answered', { source: 'fallback', ms: Date.now() - askedAt });
      })
      .then(() => {
        aiAsking = false;
        if (btn) { btn.disabled = false; btn.textContent = '다시 물어보기'; }
      });
  }

  function askAiLove(question) {
    const url = proxyUrl();
    if (!url) return Promise.reject(new Error('no proxy'));

    /* AI-PROMPT-START — 아래는 모델에게 주는 지시문이지 사용자에게 보이는 글이 아니다.
       금지어가 '금지하려고' 들어 있으므로 검사에서 따로 다룬다(check-love-copy.mjs). */
    const systemPrompt = [
      '너는 맘운자로의 연애 상담 코너다. 한국어로, 따뜻하지만 솔직하게 답한다.',
      '답변은 네 각도를 순서대로 따른다. 각 각도는 한두 문단이고, 번호나 소제목은 쓰지 않는다.',
      '  (1) 지금 무슨 일이 일어나고 있나 — 적어준 상황을 구체적으로 짚어 정리한다.',
      '  (2) 상대 쪽에서는 — 상대 입장에서 가능한 해석을 하나 이상 제시한다.',
      '  (3) 오늘 할 한 가지 — 아주 작고 구체적인 행동 하나. "마음을 편히" 같은 막연한 말은 금지.',
      '  (4) 하면 더 나빠지는 것 — 하지 말 행동 하나를 이유와 함께.',
      '',
      '아래 네 가지는 어떤 경우에도 어기지 않는다.',
      '첫째, 상대의 마음을 단정하지 않는다. "그 사람은 당신을 좋아합니다" 또는 "좋아하지 않습니다" 처럼 말하지 않는다. 적어준 것은 그 사람이 본 행동일 뿐이고 너는 상대를 모른다. "~일 수 있어요", "~처럼 보여요" 로 말한다.',
      '둘째, 근거를 지어내지 않는다. "심리학적으로", "연구에 따르면", "통계상", "AI가 분석한 결과" 같은 말을 쓰지 않는다. 너에게는 그런 근거가 없다.',
      '셋째, 고백·연락·재회를 부추기지 않는다. 거절당할 가능성도 그대로 말하고, 거절도 하나의 결과로 인정하는 문장을 넣는다. 매달리기를 권하지 않는다.',
      '넷째, 같은 행동도 사람마다 다른 뜻일 수 있다는 점을 한 번은 짚는다.',
      '',
      '전체 500~800자. 문단 사이는 줄바꿈 두 번. 항목 기호(-, *, 1.)는 쓰지 않는다.',
      '상대를 비난하거나 "그런 사람은 거르세요" 같은 식으로 몰아가지 않는다. 판단은 적어준 사람이 한다.',
      '만약 자해, 자살, 폭력, 스토킹, 학대처럼 실제 안전이 걱정되는 이야기가 보이면 연애 조언으로 넘기지 않는다. 먼저 진심으로 걱정을 전하고, 혼자 감당하지 말고 주변 사람이나 전문 상담(자살예방 상담전화 109, 24시간 무료)에 꼭 연락해보라고 부드럽게 권한다. 겁주거나 다그치지 않는다.',
    ].join('\n');
    /* AI-PROMPT-END */

    const last = load();
    const ctx = (last && typeof last.score === 'number')
      ? `참고로 이 사람이 앱에서 호감지수를 재봤을 때 ${last.score}점(100점 만점, 50이 반반)이 나왔다. 숫자를 그대로 인용하지는 말고 분위기 참고만 한다.`
      : '';

    const userPrompt = [ctx, `고민: ${question}`].filter(Boolean).join('\n');

    // 프록시가 늦으면 답을 기다리다 화면이 멈춘다. 시간을 끊고 떨어진다.
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, AI_TIMEOUT_MS);

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userPrompt, maxTokens: 1200 }),
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then((r) => { if (!r.ok) throw new Error('proxy error'); return r.json(); })
      .then((data) => {
        if (!data || !data.answer) throw new Error('empty answer');
        return data.answer;
      })
      .then((t) => { clearTimeout(timer); return t; })
      .catch((e) => { clearTimeout(timer); throw e; });
  }

  function renderAiLoveAnswer(text, near, source) {
    const out = document.getElementById('love-ai-answer');
    const paras = String(text).trim().split(/\n{2,}/)
      .map((p) => `<p class="rx-detail-symptom" style="margin-top:10px;">${esc(p)}</p>`).join('');
    const rxId = near ? near.rxId : 'love-crush-silent';
    out.innerHTML = `
      <div class="rx-detail-card" style="margin-top:16px;">
        ${paras}
      </div>
      <button class="rx-friend-quick-btn love-goto-rx" type="button" data-rx="${rxId}" style="width:100%;margin-top:8px;">
        이 고민에 맞는 처방 보러가기 ›
      </button>
      ${near ? `<button class="rx-slip-photo-btn" id="love-ai-near" type="button" style="width:100%;margin-top:8px;">${near.emoji} ${esc(near.label)} 풀이도 보기 ›</button>` : ''}
    `;
    wireRxButtons();
    const n = document.getElementById('love-ai-near');
    if (n) n.addEventListener('click', () => renderTopic(near.id));
    trackEvent('love_ai_rendered', { source, topic: near ? near.id : 'none' });
  }

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
    document.getElementById('love-goto-signal').addEventListener('click', renderSituations);
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
