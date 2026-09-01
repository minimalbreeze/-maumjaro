// 맘운자로 — 주간 행운번호 (로또 추첨기)
//
// ⚠️ 설계에서 가장 중요한 두 가지
//  1) 번호는 AI로 만들지 않는다.
//     어차피 어떤 방식으로 뽑아도 당첨 확률은 같은데, "AI가 분석해 뽑았다"고 하면
//     당첨 가능성을 암시하게 된다. 돈이 오가는 영역이라 그 선은 넘지 않는다.
//     사주(일주) + 별자리 + 띠 + 그 주 월요일 날짜로 결정론적으로 만든다.
//     비용 0, 오프라인 동작, 같은 주에는 몇 번을 들어와도 같은 번호가 나온다.
//  2) 주 1회. 월요일에 리셋된다. 뽑은 번호는 저장되어 로또 살 때 다시 확인할 수 있다.
//
// 구조 원칙(CLAUDE.md)
//  - app.js / prescriptions.js 무수정. 필요한 건 window.MaumjaroRx로만 쓴다.
//  - 새 탭을 만들지 않는다 — 기록 탭 안의 타일 하나로 들어간다.
//    (하단 탭이 6개가 되면 6칸 중 3칸이 부가 콘텐츠가 되어 브랜드 축이 무너진다)
//  - 결과는 주사를 놓아야 열린다. 타로·MBTI·궁합과 같은 규칙.
(() => {
  'use strict';

  const KEY = 'maumjaro:luckyNumbers';   // { '2026-08-31': { sets: [[..],..], at } }
  const SETS = 5;                        // 한 주에 5게임
  const PICKS = 6;                       // 게임당 6개
  const MAX = 45;                        // 1~45

  function Rx() { return window.MaumjaroRx; }

  function sfx(name, arg) {
    try {
      const S = window.MaumjaroSfx;
      if (S && typeof S[name] === 'function') S[name](arg);
    } catch (e) { /* 소리는 없어도 된다 */ }
  }
  function track(name, params) {
    try {
      const G = window.MaumjaroGame;
      if (G && typeof G.track === 'function') G.track(name, params || {});
    } catch (e) { /* 통계 실패는 무시 */ }
  }
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  // ---------- 주차 키 ----------
  // 로또는 토요일 추첨이라 "월요일 시작"으로 한 주를 끊는다.
  // 날짜는 반드시 사용자의 로컬 날짜로 계산한다(UTC로 하면 한국에서 하루가 어긋난다).
  function weekMondayKey(d) {
    const base = d ? new Date(d) : new Date();
    const day = base.getDay();                  // 0=일 … 6=토
    const diff = day === 0 ? -6 : 1 - day;      // 일요일이면 지난 월요일로
    base.setDate(base.getDate() + diff);
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, '0');
    const dd = String(base.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  function weekLabel(key) {
    const [y, m, d] = key.split('-').map(Number);
    const mon = new Date(y, m - 1, d);
    const sun = new Date(y, m - 1, d + 6);
    return `${mon.getMonth() + 1}월 ${mon.getDate()}일 ~ ${sun.getMonth() + 1}월 ${sun.getDate()}일`;
  }

  // ---------- 저장 ----------
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(weekKey, sets) {
    try {
      const all = loadAll();
      all[weekKey] = { sets, at: Date.now() };
      // 1년치만 남긴다(52주). 그 이상은 로또 살 때 쓸 일이 없다.
      const keys = Object.keys(all).sort().reverse();
      keys.slice(52).forEach((k) => delete all[k]);
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) { /* 저장 실패는 무시 */ }
  }

  // ---------- 결정론적 번호 생성 ----------
  // 같은 사람이 같은 주에 몇 번을 들어와도 같은 번호가 나와야 한다.
  // (매번 달라지면 "아까 그 번호가 뭐였지"가 되어 기록의 의미가 없다)
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // xorshift32 — 시드 하나로 재현 가능한 난수열을 만든다
  function rng(seed) {
    let x = seed || 1;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }

  // 내 운세 재료를 한 문자열로 모은다. 사람마다 달라야 하고, 같은 사람은 늘 같아야 한다.
  function personSeed() {
    let bits = [];
    try {
      const chart = JSON.parse(localStorage.getItem('maumjaro:sajuChart') || 'null');
      if (chart && chart.pillars) {
        bits.push(chart.pillars.year.gan + chart.pillars.year.zhi);
        bits.push(chart.pillars.day.gan + chart.pillars.day.zhi);
        bits.push(chart.dayMasterElement || '');
      }
      const p = JSON.parse(localStorage.getItem('maumjaro:sajuProfile') || 'null');
      if (p) bits.push(`${p.calendarType || 'solar'}:${p.birthDate || ''}:${p.bloodType || ''}`);
    } catch (e) { /* 프로필이 없으면 기기 시드로 간다 */ }
    if (!bits.length) {
      // 사주 프로필이 없어도 뽑을 수 있어야 한다. 기기마다 한 번 만든 시드를 쓴다.
      try {
        let s = localStorage.getItem('maumjaro:deviceSeed');
        if (!s) { s = Math.random().toString(36).slice(2, 10); localStorage.setItem('maumjaro:deviceSeed', s); }
        bits.push(s);
      } catch (e) { bits.push('guest'); }
    }
    return bits.join('|');
  }

  function buildSets(weekKey) {
    const base = personSeed();
    const out = [];
    for (let s = 0; s < SETS; s++) {
      const rand = rng(hashStr(`${base}#${weekKey}#${s}`));
      // 1~45에서 6개를 중복 없이. 부분 셔플이 편향이 적고 빠르다.
      const pool = [];
      for (let i = 1; i <= MAX; i++) pool.push(i);
      for (let i = 0; i < PICKS; i++) {
        const j = i + Math.floor(rand() * (pool.length - i));
        const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      out.push(pool.slice(0, PICKS).sort((a, b) => a - b));
    }
    return out;
  }

  // 로또 공 색: 실제 로또와 같은 구간별 색이라 눈에 익다
  function ballClass(n) {
    if (n <= 10) return 'lk-y';
    if (n <= 20) return 'lk-b';
    if (n <= 30) return 'lk-r';
    if (n <= 40) return 'lk-g';
    return 'lk-k';
  }
  function ballsHtml(nums, delay) {
    return nums.map((n, i) => `<span class="lk-ball ${ballClass(n)}"${delay ? ` style="animation-delay:${(i * 0.12).toFixed(2)}s"` : ''}>${n}</span>`).join('');
  }

  // ---------- 추첨기 연출 ----------
  // 갓차와 같은 방식으로 화면을 통째로 쓴다. 공이 통 안에서 돌다가 하나씩 관으로 나온다.
  function runMachine(sets, done) {
    document.querySelectorAll('.lk-full').forEach((o) => o.remove());
    const balls = Array.from({ length: 18 }, (_, i) => {
      const n = 1 + (i * 7) % MAX;
      const x = 12 + (i * 23) % 70;
      const y = 14 + Math.floor(i / 4) * 18 + (i % 2) * 6;
      return `<span class="lk-mix ${ballClass(n)}" style="left:${x}%;top:${y}%;animation-delay:${(i * 0.13).toFixed(2)}s">${n}</span>`;
    }).join('');

    const el = document.createElement('div');
    el.className = 'lk-full';
    el.innerHTML = `
      <div class="lk-stage">
        <p class="lk-title">🎰 행운번호 추첨</p>
        <p class="lk-guide" id="lk-guide">공이 돌고 있어요...</p>
        <div class="lk-machine">
          <div class="lk-dome">${balls}<span class="lk-dome-shine"></span></div>
          <div class="lk-neck"></div>
          <div class="lk-tray" id="lk-tray"></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));

    const tray = el.querySelector('#lk-tray');
    const guide = el.querySelector('#lk-guide');
    const first = sets[0];

    // 첫 게임의 공 6개가 하나씩 관을 타고 나온다
    first.forEach((n, i) => {
      setTimeout(() => {
        const b = document.createElement('span');
        b.className = `lk-ball lk-out ${ballClass(n)}`;
        b.textContent = n;
        tray.appendChild(b);
        sfx('capsuleDrop');
      }, 900 + i * 380);
    });
    setTimeout(() => { guide.textContent = '번호가 나왔어요!'; sfx('loveReveal'); }, 900 + first.length * 380 + 200);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 280);
      done();
    }, 900 + first.length * 380 + 1500);
  }

  // ---------- 화면 ----------
  let mount = null;
  let onBack = null;

  function draw() {
    if (!mount) return;
    const weekKey = weekMondayKey();
    const all = loadAll();
    const mine = all[weekKey];
    const past = Object.keys(all).sort().reverse().filter((k) => k !== weekKey).slice(0, 8);

    mount.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="lk-back" type="button">‹</button>
        <span class="rx-nav-title">🎰 행운번호</span>
      </div>

      ${mine ? `
        <div class="rx-detail-card lk-hero">
          <div class="rx-detail-emoji">🍀</div>
          <div class="rx-detail-title">이번 주 행운번호</div>
          <div class="rx-detail-diagnosis">${esc(weekLabel(weekKey))}</div>
        </div>
        ${mine.sets.map((s, i) => `
          <div class="lk-row">
            <span class="lk-row-no">${String.fromCharCode(65 + i)}</span>
            <span class="lk-row-balls">${ballsHtml(s)}</span>
          </div>`).join('')}
        <button class="action-btn" id="lk-share" type="button" style="width:100%;margin-top:12px;">번호 공유하기 💌</button>
        <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">
          다음 주 월요일에 새 번호를 뽑을 수 있어요
        </p>
      ` : `
        <div class="rx-detail-card lk-hero">
          <div class="rx-detail-emoji">🎰</div>
          <div class="rx-detail-title">이번 주 행운번호</div>
          <div class="rx-detail-diagnosis">${esc(weekLabel(weekKey))}</div>
          <p class="rx-detail-symptom">내 사주·별자리·띠와 이번 주 날짜로 5게임을 뽑아드려요.<br />주사를 놓으면 추첨기가 돕니다.</p>
        </div>
        <div class="rx-detail-card mbti-hero">
          <div class="mbti-sealed" aria-hidden="true">
            <span class="mbti-sealed-q">🍀</span>
            <span class="mbti-sealed-stamp">봉인</span>
          </div>
        </div>
        <button class="action-btn" id="lk-gate" type="button" style="width:100%;">💉 주사 놓고 번호 뽑기</button>
        <p class="rx-custom-hint" style="text-align:center;margin-top:10px;">팔을 눌러도 되고, 폰을 콕 찌르듯 움직여도 돼요</p>
      `}

      ${past.length ? `
        <div class="rx-nav-header" style="margin-top:22px;">
          <span class="rx-nav-title">📜 지난 주 번호</span>
        </div>
        ${past.map((k) => `
          <div class="lk-past">
            <p class="lk-past-week">${esc(weekLabel(k))}</p>
            ${all[k].sets.map((s, i) => `
              <div class="lk-row lk-row-sm">
                <span class="lk-row-no">${String.fromCharCode(65 + i)}</span>
                <span class="lk-row-balls">${ballsHtml(s)}</span>
              </div>`).join('')}
          </div>`).join('')}
      ` : ''}

      <p class="rx-custom-hint lk-warn">
        ⚠️ 재미로 보는 번호예요. <b>당첨을 보장하지 않습니다.</b><br />
        어떤 방식으로 뽑아도 당첨 확률은 같아요. 구매는 신중히, 감당할 수 있는 만큼만.
      </p>
    `;

    const back = mount.querySelector('#lk-back');
    if (back) back.addEventListener('click', () => { if (onBack) onBack(); });

    const share = mount.querySelector('#lk-share');
    if (share && mine) {
      share.addEventListener('click', () => {
        const text = `이번 주 내 행운번호 🍀\n${mine.sets.map((s, i) => `${String.fromCharCode(65 + i)}  ${s.join(', ')}`).join('\n')}\n\n너도 뽑아볼래?`;
        const R = Rx();
        if (R && typeof R.shareOrCopy === 'function') R.shareOrCopy(text, 'https://maumjaro.minimalbreeze.com/');
        track('lucky_shared', { week: weekKey });
      });
    }

    const gate = mount.querySelector('#lk-gate');
    if (gate) wireGate(weekKey);
  }

  // 주사를 놓아야 추첨기가 돈다(타로·MBTI·궁합과 같은 규칙).
  function wireGate(weekKey) {
    const btn = document.getElementById('lk-gate');
    const R = Rx();
    const finish = () => {
      const sets = buildSets(weekKey);
      runMachine(sets, () => {
        save(weekKey, sets);
        track('lucky_drawn', { week: weekKey });
        draw();
        if (mount) mount.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    };
    // 주사 시스템이 없으면 번호를 영영 못 뽑게 되면 안 된다.
    if (!R || typeof R.wireExternalTrigger !== 'function') {
      btn.addEventListener('click', finish);
      return;
    }
    const syntheticP = {
      id: 'lucky-draw', category: 'fun', title: '행운번호', diagnosis: '추첨기를 돌리는 중',
      emoji: '🍀', color: '#2f6f5e',
    };
    R.wireExternalTrigger(btn, syntheticP, () => {
      const tag = document.getElementById('dose-tag');
      const cap = document.getElementById('dose-caption');
      const liquid = document.getElementById('liquid');
      if (tag) tag.hidden = true;
      if (cap) cap.hidden = true;
      if (liquid) liquid.style.fill = '';
      R.resetGenericFlowState('💉 주사 놓고 번호 뽑기');
      R.showRxImageFade(syntheticP, () => {
        const tab = document.querySelector('.tab-btn[data-view="history"]');
        if (tab) tab.click();
        // 기록 탭으로 돌아오면 허브가 다시 그려지므로, 행운번호 화면을 다시 연다.
        setTimeout(() => { if (window.MaumjaroLucky) window.MaumjaroLucky.open(mount, onBack); finish(); }, 120);
      });
    });
  }

  function open(mountEl, backFn) {
    mount = mountEl || mount;
    onBack = backFn || onBack;
    draw();
  }

  // 기록 타일에 "이번 주 뽑음 / 아직" 을 표시하는 데 쓴다.
  function summary() {
    const all = loadAll();
    return { drawn: !!all[weekMondayKey()], weeks: Object.keys(all).length };
  }

  window.MaumjaroLucky = { open, summary };
})();
