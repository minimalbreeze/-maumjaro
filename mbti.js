// 맘운자로 — 마음유형(간이 MBTI) 테스트 · 결과 · 궁합
//
// 구조 원칙(CLAUDE.md):
//  - app.js / prescriptions.js는 안 건드린다. 필요한 건 window.MaumjaroRx로만 쓴다.
//  - 새 탭을 만들지 않는다. 운세/타로 탭 안의 한 화면으로 들어간다.
//    (탭이 5개가 되면 성격·운세 콘텐츠가 2칸을 차지해 "운세 앱"처럼 보인다)
//  - 결과 화면은 정보로 끝나지 않고 반드시 처방 → 주사로 이어진다.
//  - localStorage 키는 maumjaro: 접두사, 기존 키는 건드리지 않는다.
(() => {
  'use strict';

  const D = window.MAUMJARO_MBTI_DATA;
  if (!D) return;
  const { MBTI_QUESTIONS, MBTI_TYPES, MBTI_MATCH, BLOOD_TYPES, BLOOD_MBTI_MIX } = D;

  const RESULT_KEY = 'maumjaro:mbtiResult';
  const RESULT_VERSION = 1;

  function Rx() { return window.MaumjaroRx; }

  function sfx(name, arg) {
    try {
      const S = window.MaumjaroSfx;
      if (S && typeof S[name] === 'function') S[name](arg);
    } catch (e) { /* 소리는 없어도 된다 */ }
  }

  function track(name, params) {
    try {
      if (window.MaumjaroGame && typeof window.MaumjaroGame.track === 'function') {
        window.MaumjaroGame.track(name, params || {});
      }
    } catch (e) { /* 통계는 실패해도 무시 */ }
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  // ---------- 저장 ----------
  function loadResult() {
    try {
      const r = JSON.parse(localStorage.getItem(RESULT_KEY) || 'null');
      if (!r || r.version !== RESULT_VERSION || !MBTI_TYPES[r.type]) return null;
      return r;
    } catch (e) { return null; }
  }
  function saveResult(r) {
    try { localStorage.setItem(RESULT_KEY, JSON.stringify(r)); } catch (e) { /* 무시 */ }
  }
  function clearResult() {
    try { localStorage.removeItem(RESULT_KEY); } catch (e) { /* 무시 */ }
  }

  function bloodOf() {
    try {
      const p = JSON.parse(localStorage.getItem('maumjaro:sajuProfile') || 'null');
      if (p && p.bloodType) return BLOOD_TYPES.find((b) => b.key === p.bloodType) || null;
    } catch (e) { /* 무시 */ }
    return null;
  }

  // ---------- 채점 ----------
  // 축마다 3문항이라 동점이 안 난다(2:1 또는 3:0). 그래도 방어적으로 기본값을 둔다.
  function scoreAnswers(answers) {
    const score = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
    answers.forEach((pick, i) => {
      const q = MBTI_QUESTIONS[i];
      if (!q || !pick) return;
      score[pick] += 1;
    });
    const type = [
      score.E >= score.I ? 'E' : 'I',
      score.S >= score.N ? 'S' : 'N',
      score.T >= score.F ? 'T' : 'F',
      score.J >= score.P ? 'J' : 'P',
    ].join('');
    return { type, score };
  }

  // ---------- 전체 화면 시험지 ----------
  let examEl = null;

  function closeExam() {
    if (!examEl) return;
    const el = examEl;
    examEl = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }

  function openExam(onDone, onCancel) {
    // 갓차와 같은 이유로 두 장이 겹치지 않게 항상 한 장만 남긴다.
    document.querySelectorAll('.mbti-exam').forEach((old) => old.remove());

    const answers = new Array(MBTI_QUESTIONS.length).fill(null);
    let idx = 0;

    const el = document.createElement('div');
    el.className = 'mbti-exam';
    el.innerHTML = `
      <div class="mx-desk" aria-hidden="true"></div>
      <button class="mx-close" type="button" aria-label="그만두기">✕</button>
      <div class="mx-progress"><span class="mx-progress-bar" id="mx-bar"></span></div>
      <div class="mx-sheet-wrap">
        <div class="mx-sheet" id="mx-sheet"></div>
      </div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    examEl = el;

    const sheet = el.querySelector('#mx-sheet');
    const bar = el.querySelector('#mx-bar');

    el.querySelector('.mx-close').addEventListener('click', () => {
      closeExam();
      if (onCancel) onCancel();
    });

    function paint(dir) {
      const q = MBTI_QUESTIONS[idx];
      sheet.classList.remove('flip-in', 'flip-back');
      void sheet.offsetWidth; // 애니메이션 재시작
      sheet.innerHTML = `
        <div class="mx-head">
          <span class="mx-no">문제 ${idx + 1}</span>
          <span class="mx-total">/ ${MBTI_QUESTIONS.length}</span>
        </div>
        <p class="mx-q">${esc(q.q)}</p>
        <div class="mx-choices">
          <button class="mx-choice${answers[idx] === q.a ? ' picked' : ''}" type="button" data-pick="${q.a}">
            <span class="mx-bullet">①</span><span>${esc(q.ao)}</span>
          </button>
          <button class="mx-choice${answers[idx] === q.b ? ' picked' : ''}" type="button" data-pick="${q.b}">
            <span class="mx-bullet">②</span><span>${esc(q.bo)}</span>
          </button>
        </div>
        <div class="mx-foot">
          ${idx > 0 ? '<button class="mx-prev" type="button">‹ 이전 문제</button>' : '<span></span>'}
          <span class="mx-note">정답은 없어요. 먼저 손이 가는 쪽으로</span>
        </div>
      `;
      sheet.classList.add(dir === 'back' ? 'flip-back' : 'flip-in');
      bar.style.width = `${(idx / MBTI_QUESTIONS.length) * 100}%`;

      sheet.querySelectorAll('.mx-choice').forEach((btn) => {
        btn.addEventListener('click', () => {
          answers[idx] = btn.dataset.pick;
          btn.classList.add('picked');
          sfx('pageMark');
          // 고른 게 눈에 보이고 나서 넘어가야 "체크했다"는 느낌이 난다.
          setTimeout(() => {
            if (idx < MBTI_QUESTIONS.length - 1) {
              idx += 1;
              sfx('pageFlip');
              paint('next');
            } else {
              bar.style.width = '100%';
              sfx('pageFlip');
              closeExam();
              onDone(answers);
            }
          }, 230);
        });
      });
      const prev = sheet.querySelector('.mx-prev');
      if (prev) {
        prev.addEventListener('click', () => {
          idx -= 1;
          sfx('pageFlip');
          paint('back');
        });
      }
    }

    paint('next');
  }

  // ---------- 결과 발표 ----------
  // 다 풀자마자 결과가 뜨면 "계산해서 뱉었다"는 느낌이라 김이 샌다.
  // 두구두구 소리와 함께 잠깐 뜸을 들이고 나서 유형을 터뜨린다.
  function announce(type, done) {
    document.querySelectorAll('.mbti-drum').forEach((old) => old.remove());
    const t = MBTI_TYPES[type];
    const el = document.createElement('div');
    el.className = 'mbti-drum';
    el.innerHTML = `
      <div class="md-inner">
        <p class="md-label">채점하는 중</p>
        <div class="md-dots"><span></span><span></span><span></span></div>
        <div class="md-card" id="md-card">
          <div class="md-emoji">${t.emoji}</div>
          <div class="md-type">${esc(type)}</div>
          <div class="md-name">${esc(t.name)}</div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    sfx('resultFanfare');

    // resultFanfare의 두구두구가 약 1.05초, 그 뒤 정적 0.22초에 팡파르가 터진다.
    setTimeout(() => {
      el.querySelector('.md-label').textContent = '당신의 마음유형은';
      el.classList.add('reveal');
    }, 1250);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
      done();
    }, 3200);
  }

  // ---------- 결과 화면 ----------
  function typeCardHtml(key) {
    const t = MBTI_TYPES[key];
    return `<span class="mbti-mini"><b>${t.emoji} ${esc(key)}</b> ${esc(t.name)}</span>`;
  }

  function resultHtml(result, blood) {
    const t = MBTI_TYPES[result.type];
    const match = MBTI_MATCH[result.type] || { best: [], grow: [] };
    const mixKey = blood ? `${blood.key}-${t.group}` : null;
    const mix = mixKey ? BLOOD_MBTI_MIX[mixKey] : null;
    const d = new Date(result.at);
    const dateLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;

    return `
      <div class="rx-detail-card mbti-hero">
        <div class="rx-detail-emoji">${t.emoji}</div>
        <div class="mbti-type-badge">${esc(result.type)}</div>
        <div class="rx-detail-title">${esc(t.name)}</div>
        <p class="rx-detail-symptom">${esc(t.trait)}</p>
        <p class="mbti-taken">${dateLabel}에 본 결과예요</p>
      </div>

      <div class="rx-custom-preview">
        <div class="rx-slip-row"><span class="rx-slip-key">💪 강점</span><span class="rx-slip-value">${esc(t.strong)}</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key">🫠 약한 지점</span><span class="rx-slip-value">${esc(t.weak)}</span></div>
      </div>

      ${blood ? `
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${blood.emoji}</div>
        <div class="rx-detail-title">${esc(blood.name)} × ${esc(result.type)}</div>
        <div class="rx-detail-diagnosis">${esc(blood.trait)}</div>
        <p class="rx-detail-symptom">${esc(mix || blood.quirk)}</p>
        <p class="rx-custom-hint" style="margin-top:8px;">💬 ${esc(blood.quirk)}</p>
      </div>` : `
      <button class="rx-friend-quick-btn" id="mbti-add-blood" type="button" style="width:100%;margin:8px 0;">
        🩸 혈액형을 넣으면 더 자세히 볼 수 있어요 ›
      </button>`}

      <div class="rx-custom-preview">
        <div class="rx-slip-row"><span class="rx-slip-key">💞 잘 맞는 유형</span>
          <span class="rx-slip-value">${match.best.map((k) => `${MBTI_TYPES[k].emoji} ${k}`).join(' · ')}</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key">🌱 배우게 되는 유형</span>
          <span class="rx-slip-value">${match.grow.map((k) => `${MBTI_TYPES[k].emoji} ${k}`).join(' · ')}</span></div>
      </div>
      <div class="mbti-match-list">
        ${match.best.map(typeCardHtml).join('')}
        ${match.grow.map(typeCardHtml).join('')}
      </div>

      <div class="rx-detail-card mbti-ache">
        <div class="rx-detail-emoji">💊</div>
        <div class="rx-detail-title">${esc(t.name)}이 자주 앓는 것</div>
        <p class="rx-detail-symptom">${esc(t.ache)}</p>
        <button class="rx-friend-quick-btn mbti-goto-rx" type="button" data-rxcat="${t.rx}" style="margin-top:8px;">
          이 마음에 맞는 처방 보러가기 ›
        </button>
      </div>

      <button class="action-btn" id="mbti-share-btn" type="button" style="width:100%;margin-top:6px;">친구에게 내 유형 보내기 💌</button>
      <button class="rx-friend-quick-btn" id="mbti-retake-btn" type="button" style="width:100%;margin-top:8px;">🔄 초기화하고 다시 시험 보기</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">
        재미로 보는 간이 유형 테스트예요. 공식 MBTI® 검사와는 무관합니다.
      </p>
    `;
  }

  function introHtml() {
    return `
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">📝</div>
        <div class="rx-detail-title">마음유형 시험지</div>
        <div class="rx-detail-diagnosis">${MBTI_QUESTIONS.length}문제 · 약 2분</div>
        <p class="rx-detail-symptom">한 장에 한 문제씩. 정답은 없으니 먼저 손이 가는 쪽을 고르세요.</p>
      </div>
      <div class="rx-custom-preview">
        <div class="rx-slip-row"><span class="rx-slip-key">결과로 볼 수 있는 것</span><span class="rx-slip-value">16유형 중 내 유형</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key"></span><span class="rx-slip-value">잘 맞는 유형 · 궁합</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key"></span><span class="rx-slip-value">혈액형 × 유형 조합</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key"></span><span class="rx-slip-value">내 유형에 맞는 마음 처방</span></div>
      </div>
      <button class="action-btn" id="mbti-start-btn" type="button" style="width:100%;margin-top:10px;">✏️ 시험 시작하기</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">
        재미로 보는 간이 유형 테스트예요. 공식 MBTI® 검사와는 무관합니다.
      </p>
    `;
  }

  // ---------- 진입점 ----------
  // fortune.js가 운세 탭 타일에서 호출한다. mount(그릴 곳)와 back(뒤로 갈 때)을 받는다.
  function render(opts) {
    const o = opts || {};
    const mount = o.mount || document.getElementById('fortune-content');
    if (!mount) return;
    const goBack = o.onBack || function () {};
    const editProfile = o.onEditProfile || null;

    function draw() {
      const result = loadResult();
      const blood = bloodOf();
      mount.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="mbti-back" type="button">‹</button>
          <span class="rx-nav-title">📝 마음유형</span>
        </div>
        ${result ? resultHtml(result, blood) : introHtml()}
      `;
      mount.querySelector('#mbti-back').addEventListener('click', goBack);

      const startBtn = mount.querySelector('#mbti-start-btn');
      if (startBtn) startBtn.addEventListener('click', startExam);

      const retake = mount.querySelector('#mbti-retake-btn');
      if (retake) {
        retake.addEventListener('click', () => {
          clearResult();
          track('mbti_reset', {});
          draw();
        });
      }

      const addBlood = mount.querySelector('#mbti-add-blood');
      if (addBlood && editProfile) addBlood.addEventListener('click', editProfile);

      mount.querySelectorAll('.mbti-goto-rx').forEach((b) => {
        b.addEventListener('click', () => {
          const R = Rx();
          if (R && typeof R.goToRxCategory === 'function') R.goToRxCategory(b.dataset.rxcat);
        });
      });

      const share = mount.querySelector('#mbti-share-btn');
      if (share && result) {
        share.addEventListener('click', () => {
          const t = MBTI_TYPES[result.type];
          const text = `나 ${result.type} · ${t.name}이래 ${t.emoji}\n너는 무슨 유형이야?`;
          const R = Rx();
          const url = 'https://maumjaro.minimalbreeze.com/';
          if (R && typeof R.shareOrCopy === 'function') R.shareOrCopy(text, url);
          track('mbti_share', { type: result.type });
        });
      }
    }

    function startExam() {
      track('mbti_start', {});
      openExam((answers) => {
        const { type, score } = scoreAnswers(answers);
        announce(type, () => {
          saveResult({ version: RESULT_VERSION, type, score, at: Date.now() });
          track('mbti_done', { type });
          draw();
          mount.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
      }, draw);
    }

    draw();
  }

  // 운세 타일에 "내 유형 / 아직 안 봄"을 표시하는 데 쓴다.
  function summary() {
    const r = loadResult();
    return r ? { type: r.type, name: MBTI_TYPES[r.type].name, emoji: MBTI_TYPES[r.type].emoji } : null;
  }

  window.MaumjaroMbti = { render, summary, clearResult };
})();
