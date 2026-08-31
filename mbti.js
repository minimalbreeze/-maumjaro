// 맘운자로 — 마음유형(간이 MBTI) 테스트 · 결과 · 궁합
//
// 구조 원칙(CLAUDE.md):
//  - app.js / prescriptions.js는 안 건드린다. 필요한 건 window.MaumjaroRx로만 쓴다.
//    탭 전환도 app.js 코드를 고치지 않고, prescriptions.js·fortune.js와 똑같이
//    .tab-btn에 독립 리스너를 하나 더 다는 방식으로 붙인다.
//  - 홈은 여전히 앱의 기본 목적지다. 마음유형은 홈을 밀어내지 않는 다섯 번째 칸이다.
//  - 결과 화면은 정보로 끝나지 않고 반드시 처방 → 주사로 이어진다.
//  - localStorage 키는 maumjaro: 접두사, 기존 키는 건드리지 않는다.
(() => {
  'use strict';

  const D = window.MAUMJARO_MBTI_DATA;
  if (!D) return;
  const {
    MBTI_QUESTIONS, MBTI_TYPES, MBTI_MATCH, BLOOD_TYPES, BLOOD_MBTI_MIX,
    MATCH_AXIS_LINES, MATCH_CAUTION, MATCH_HEADLINES, MATCH_SAME_TYPE,
    BLOOD_MATCH, BLOOD_DAY_LINES,
  } = D;

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
      el.querySelector('.md-label').textContent = '당신의 MBTI는';
      el.classList.add('reveal');
    }, 1250);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
      done();
    }, 3200);
  }

  // ---------- 궁합 ----------
  // 16×16 = 256쌍을 전부 손으로 쓸 수 없으므로 축별 문장을 조합한다.
  // 점수는 널리 쓰이는 해석을 따랐다: S/N이 같으면 말이 통하고(가장 큼),
  // E/I·T/F는 다를 때 서로를 채우고, J/P는 같을 때 생활 리듬이 맞는다.
  const AXES = [
    { key: 'EI', i: 0 }, { key: 'SN', i: 1 }, { key: 'TF', i: 2 }, { key: 'JP', i: 3 },
  ];

  function pairAnalysis(mine, other) {
    const same = AXES.map((a) => mine[a.i] === other[a.i]);
    let score = 0;
    score += same[1] ? 2 : 0;      // S/N
    score += same[0] ? 0.5 : 1;    // E/I
    score += same[2] ? 0.5 : 1;    // T/F
    score += same[3] ? 1 : 0.5;    // J/P

    let stars = Math.max(1, Math.min(5, Math.round(score)));
    // 결과 화면에서 이미 "잘 맞는 유형"이라고 소개한 쌍은 별점도 그에 맞춰야 말이 된다.
    const m = MBTI_MATCH[mine] || { best: [], grow: [] };
    if (m.best.indexOf(other) >= 0) stars = Math.max(stars, 5);
    else if (m.grow.indexOf(other) >= 0) stars = Math.max(stars, 3);

    const lines = AXES.map((a, k) => {
      const id = same[k] ? `${a.key}-same-${mine[a.i]}` : `${a.key}-diff`;
      return MATCH_AXIS_LINES[id];
    }).filter(Boolean);

    const cautions = AXES.filter((a, k) => !same[k]).map((a) => MATCH_CAUTION[a.key]).filter(Boolean);
    const pool = MATCH_HEADLINES[stars] || MATCH_HEADLINES[3];
    // 같은 쌍은 늘 같은 문장이 나와야 한다(다시 눌렀는데 바뀌면 신뢰가 떨어진다).
    let h = 0;
    const sig = mine + other;
    for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
    const headline = pool[Math.abs(h) % pool.length];

    // 부딪히는 축이 있으면 그 축에 맞는 처방으로 보낸다. 다 같으면 인간관계로.
    const rxByAxis = { EI: 'social', SN: 'work', TF: 'mind', JP: 'sleep' };
    const weak = AXES.filter((a, k) => !same[k])[0];
    const rx = weak ? rxByAxis[weak.key] : 'social';

    return { stars, headline, lines, cautions, rx, isSame: mine === other };
  }

  function starRow(n) {
    return `<span class="mbti-stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
  }

  function matchHtml(mine, other) {
    const a = pairAnalysis(mine, other);
    const tm = MBTI_TYPES[mine];
    const to = MBTI_TYPES[other];
    return `
      <div class="rx-detail-card mbti-pair">
        <div class="mbti-pair-row">
          <span class="mbti-pair-side"><b>${tm.emoji}</b><em>${esc(mine)}</em><i>나</i></span>
          <span class="mbti-pair-heart">💞</span>
          <span class="mbti-pair-side"><b>${to.emoji}</b><em>${esc(other)}</em><i>상대</i></span>
        </div>
        ${starRow(a.stars)}
        <div class="rx-detail-title" style="margin-top:6px;">${esc(a.headline)}</div>
        <p class="rx-detail-symptom">${esc(to.trait)}</p>
      </div>

      ${a.isSame ? `<p class="rx-custom-hint">🪞 ${esc(MATCH_SAME_TYPE)}</p>` : ''}

      <div class="rx-custom-preview">
        ${a.lines.map((l) => `<p class="rx-slip-text">· ${esc(l)}</p>`).join('')}
      </div>

      ${a.cautions.length ? `
      <div class="rx-detail-card mbti-ache">
        <div class="rx-detail-emoji">⚠️</div>
        <div class="rx-detail-title">조심할 지점</div>
        ${a.cautions.map((c) => `<p class="rx-detail-symptom">${esc(c)}</p>`).join('')}
      </div>` : `
      <p class="rx-custom-hint">네 축이 전부 같아요. 부딪힐 일은 적지만, 둘 다 같은 곳에서 막힙니다.</p>`}

      <button class="rx-friend-quick-btn mbti-goto-rx" type="button" data-rxcat="${a.rx}" style="width:100%;margin-top:8px;">
        우리 사이에 필요한 처방 보러가기 ›
      </button>
      <button class="action-btn" id="mbti-match-share" type="button" data-mine="${esc(mine)}" data-other="${esc(other)}" data-stars="${a.stars}" style="width:100%;margin-top:8px;">
        궁합 결과 보내기 💌
      </button>
    `;
  }

  // ---------- 혈액형 ----------
  // 같은 혈액형이면 같은 날 같은 말이 나와야 "나도 A형인데!"가 성립한다.
  function bloodDayLine(key) {
    const d = new Date();
    const sig = `${key}:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    let h = 0;
    for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
    return BLOOD_DAY_LINES[Math.abs(h) % BLOOD_DAY_LINES.length];
  }

  function bloodHtml(mineKey, viewKey, otherKey, myType) {
    const view = BLOOD_TYPES.find((b) => b.key === viewKey) || BLOOD_TYPES[0];
    const isMine = view.key === mineKey;
    const mixKey = myType ? `${view.key}-${MBTI_TYPES[myType].group}` : null;
    const mix = mixKey ? BLOOD_MBTI_MIX[mixKey] : null;
    const pair = mineKey && otherKey ? BLOOD_MATCH[`${mineKey}-${otherKey}`] : null;

    return `
      <div class="rx-detail-card mbti-hero">
        <div class="rx-detail-emoji">${view.emoji}</div>
        <div class="mbti-type-badge">${esc(view.name)}${isMine ? ' · 내 혈액형' : ''}</div>
        <div class="rx-detail-title">${esc(view.trait)}</div>
        <p class="rx-detail-symptom">${esc(view.quirk)}</p>
      </div>

      <div class="rx-custom-preview">
        <div class="rx-slip-row"><span class="rx-slip-key">🗓️ 오늘의 한 마디</span></div>
        <p class="rx-slip-text">${esc(bloodDayLine(view.key))}</p>
      </div>

      ${mix ? `
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">🧬</div>
        <div class="rx-detail-title">${esc(view.name)} × ${esc(myType)}</div>
        <p class="rx-detail-symptom">${esc(mix)}</p>
      </div>` : `
      <p class="rx-custom-hint">🧪 MBTI 시험을 보면 "혈액형 × 유형" 조합도 볼 수 있어요</p>`}

      <p class="rx-custom-hint" style="text-align:center;margin-top:12px;">다른 혈액형도 눌러보세요</p>
      <div class="blood-chips" data-role="view">
        ${BLOOD_TYPES.map((b) => `
          <button class="blood-chip${b.key === view.key ? ' on' : ''}" type="button" data-b="${b.key}">
            <span class="blood-chip-emoji">${b.emoji}</span><span>${esc(b.name)}</span>
          </button>`).join('')}
      </div>

      ${mineKey ? `
        <div class="rx-nav-header" style="margin-top:18px;">
          <span class="rx-nav-title">💞 혈액형 궁합</span>
        </div>
        <p class="rx-custom-hint" style="text-align:center;">
          내 혈액형은 <b>${esc(mineKey)}형</b>. 상대 혈액형을 골라주세요
        </p>
        <div class="blood-chips" data-role="match">
          ${BLOOD_TYPES.map((b) => `
            <button class="blood-chip${b.key === otherKey ? ' on' : ''}" type="button" data-o="${b.key}">
              <span class="blood-chip-emoji">${b.emoji}</span><span>${esc(b.name)}</span>
            </button>`).join('')}
        </div>
        ${pair ? `
        <div class="rx-detail-card mbti-pair">
          <div class="mbti-pair-row">
            <span class="mbti-pair-side"><b>${BLOOD_TYPES.find((x) => x.key === mineKey).emoji}</b><em>${esc(mineKey)}형</em><i>나</i></span>
            <span class="mbti-pair-heart">💞</span>
            <span class="mbti-pair-side"><b>${BLOOD_TYPES.find((x) => x.key === otherKey).emoji}</b><em>${esc(otherKey)}형</em><i>상대</i></span>
          </div>
          ${starRow(pair.stars)}
          <p class="rx-detail-symptom" style="margin-top:8px;">${esc(pair.line)}</p>
        </div>` : ''}
      ` : `
      <button class="rx-friend-quick-btn" id="blood-add" type="button" style="width:100%;margin-top:14px;">
        🩸 내 혈액형을 넣으면 궁합까지 볼 수 있어요 ›
      </button>`}

      <button class="rx-friend-quick-btn mbti-goto-rx" type="button" data-rxcat="social" style="width:100%;margin-top:12px;">
        사람 사이가 힘든 날의 처방 보러가기 ›
      </button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">
        혈액형 성격론은 과학적 근거가 없어요. 재미로만 봐주세요.
      </p>
    `;
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

      <button class="action-btn" id="mbti-match-open" type="button" style="width:100%;margin-top:6px;">💞 상대 유형 골라서 궁합 보기</button>
      <button class="rx-slip-photo-btn" id="mbti-blood-open" type="button" style="width:100%;margin-top:8px;">🩸 혈액형으로 더 보기</button>
      <button class="rx-slip-photo-btn" id="mbti-share-btn" type="button" style="width:100%;margin-top:8px;">친구에게 내 유형 보내기 💌</button>
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
        <div class="rx-detail-title">MBTI 시험지</div>
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
      <button class="rx-slip-photo-btn" id="mbti-blood-open" type="button" style="width:100%;margin-top:8px;">🩸 혈액형 먼저 볼래요</button>
      <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">
        재미로 보는 간이 유형 테스트예요. 공식 MBTI® 검사와는 무관합니다.
      </p>
    `;
  }

  // ---------- 진입점 ----------
  // 탭에서 부를 때는 mount만 넘기면 된다(뒤로 버튼 없음).
  // 다른 화면에서 불러 쓸 때는 onBack을 넘기면 뒤로 버튼이 생긴다.
  let lastDraw = null;
  function refresh() { if (lastDraw) lastDraw(); }

  function render(opts) {
    const o = opts || {};
    const mount = o.mount || document.getElementById('mbti-content');
    if (!mount) return;
    const goBack = o.onBack || null;
    const editProfile = o.onEditProfile || null;

    function draw() {
      const result = loadResult();
      const blood = bloodOf();
      mount.innerHTML = `
        <div class="rx-nav-header">
          ${goBack ? '<button class="rx-back-btn" id="mbti-back" type="button">‹</button>' : ''}
          <span class="rx-nav-title">📝 MBTI</span>
        </div>
        ${result ? resultHtml(result, blood) : introHtml()}
      `;
      const backBtn = mount.querySelector('#mbti-back');
      if (backBtn && goBack) backBtn.addEventListener('click', goBack);

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

      const matchOpen = mount.querySelector('#mbti-match-open');
      if (matchOpen && result) {
        matchOpen.addEventListener('click', () => drawMatch(result.type, null));
      }

      const bloodOpen = mount.querySelector('#mbti-blood-open');
      if (bloodOpen) {
        bloodOpen.addEventListener('click', () => {
          const mine = blood ? blood.key : null;
          drawBlood(mine || 'A', null);
        });
      }

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

    // 궁합 화면: 내 유형은 고정, 상대 유형만 16칸에서 고른다.
    function drawMatch(mine, other) {
      const keys = Object.keys(MBTI_TYPES);
      mount.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="mbti-match-back" type="button">‹</button>
          <span class="rx-nav-title">💞 MBTI 궁합</span>
        </div>
        <p class="rx-custom-hint" style="text-align:center;">
          내 유형은 <b>${esc(mine)}</b>. 상대 유형을 골라주세요
        </p>
        <div class="mbti-pick-grid">
          ${keys.map((k) => `
            <button class="mbti-pick${k === other ? ' on' : ''}" type="button" data-t="${k}">
              <span class="mbti-pick-emoji">${MBTI_TYPES[k].emoji}</span>
              <span class="mbti-pick-code">${k}</span>
            </button>`).join('')}
        </div>
        <div id="mbti-match-result">${other ? matchHtml(mine, other) : ''}</div>
      `;

      mount.querySelector('#mbti-match-back').addEventListener('click', draw);

      mount.querySelectorAll('.mbti-pick').forEach((b) => {
        b.addEventListener('click', () => {
          sfx('pageMark');
          drawMatch(mine, b.dataset.t);
          const res = mount.querySelector('#mbti-match-result');
          if (res) res.scrollIntoView({ block: 'start', behavior: 'smooth' });
          track('mbti_match', { mine, other: b.dataset.t });
        });
      });

      mount.querySelectorAll('.mbti-goto-rx').forEach((b) => {
        b.addEventListener('click', () => {
          const R = Rx();
          if (R && typeof R.goToRxCategory === 'function') R.goToRxCategory(b.dataset.rxcat);
        });
      });

      const ms = mount.querySelector('#mbti-match-share');
      if (ms) {
        ms.addEventListener('click', () => {
          const stars = Number(ms.dataset.stars);
          const text = `${ms.dataset.mine} × ${ms.dataset.other} 궁합 ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}\n우리 이렇게 나왔는데 볼래?`;
          const R = Rx();
          if (R && typeof R.shareOrCopy === 'function') R.shareOrCopy(text, 'https://maumjaro.minimalbreeze.com/');
          track('mbti_match_share', { mine: ms.dataset.mine, other: ms.dataset.other });
        });
      }
    }

    // 혈액형 화면: 보고 있는 혈액형(viewKey)과 궁합 상대(otherKey)를 따로 둔다.
    function drawBlood(viewKey, otherKey) {
      const b = bloodOf();
      const mineKey = b ? b.key : null;
      const r = loadResult();
      const myType = r ? r.type : null;

      mount.innerHTML = `
        <div class="rx-nav-header">
          <button class="rx-back-btn" id="blood-back" type="button">‹</button>
          <span class="rx-nav-title">🩸 혈액형</span>
        </div>
        ${bloodHtml(mineKey, viewKey, otherKey, myType)}
      `;

      mount.querySelector('#blood-back').addEventListener('click', draw);

      mount.querySelectorAll('.blood-chips[data-role="view"] .blood-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          sfx('pageMark');
          drawBlood(btn.dataset.b, otherKey);
        });
      });
      mount.querySelectorAll('.blood-chips[data-role="match"] .blood-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          sfx('pageMark');
          drawBlood(viewKey, btn.dataset.o);
          track('blood_match', { mine: mineKey, other: btn.dataset.o });
        });
      });

      const add = mount.querySelector('#blood-add');
      if (add && editProfile) add.addEventListener('click', editProfile);

      mount.querySelectorAll('.mbti-goto-rx').forEach((x) => {
        x.addEventListener('click', () => {
          const R = Rx();
          if (R && typeof R.goToRxCategory === 'function') R.goToRxCategory(x.dataset.rxcat);
        });
      });
    }

    lastDraw = draw;
    draw();
  }

  function summary() {
    const r = loadResult();
    return r ? { type: r.type, name: MBTI_TYPES[r.type].name, emoji: MBTI_TYPES[r.type].emoji } : null;
  }

  // ---------- 탭 ----------
  // app.js의 탭 핸들러는 home/history만 여닫고 나머지는 각 파일이 알아서 한다
  // (prescriptions.js·fortune.js와 같은 방식). app.js는 손대지 않는다.
  const viewMbti = document.getElementById('view-mbti');
  const mbtiContent = document.getElementById('mbti-content');
  let painted = false;

  if (viewMbti && mbtiContent) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        viewMbti.hidden = view !== 'mbti';
        if (view !== 'mbti') return;
        // 탭을 오갈 때마다 다시 그리면 결과 화면 스크롤이 튄다.
        // 처음 한 번만 그리고, 이후에는 결과가 바뀌었을 때만(draw 내부에서) 다시 그린다.
        if (!painted) {
          painted = true;
          render({ mount: mbtiContent, onEditProfile: goFortuneProfile });
        } else {
          refresh();
        }
      });
    });
  }

  // 혈액형은 운세 탭의 맘운 프로필에 들어 있다. 거기로 보내준다.
  function goFortuneProfile() {
    const tab = document.querySelector('.tab-btn[data-view="fortune"]');
    if (tab) tab.click();
    setTimeout(() => {
      const edit = document.getElementById('fortune-edit-profile-btn');
      if (edit) edit.click();
    }, 120);
  }

  window.MaumjaroMbti = { render, summary, clearResult };
})();
