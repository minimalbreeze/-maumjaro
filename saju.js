// 내 명식(命式) 한 장 — 여덟 글자를 실제로 보여준다.
//
// 왜 만들었나 (2026-11-17 효성님: "전체적인 운세/타로의 전문성을 좀 더 높였으면
// 좋겠어. 경쟁 앱들은 매우 화려하고 디테일하더라고").
//
// 명식은 이미 `fortune.js`가 계산하고 있었다. 그런데 화면에는 "연주 갑자(甲子)"처럼
// 네 줄 글자로만 나오고, 거기서 뽑은 오행 관계 하나로 운세를 썼다. 계산해 둔 것의
// 대부분을 안 보여주고 있었던 셈이다. 그래서 **새 계산을 더하지 않고** 이미 있는
// 명식에서 전통이 정해 둔 표만 펼친다 — 십성·지장간·오행 개수·일간 비유.
//
// ⚠️ **지어낸 것이 한 줄도 없다.** 음양, 지장간, 십성 규칙, 일간 비유는 전부
//    전통 표다(`saju-data.js` 맨 위 주석 참고). 로또 13장과 『행복의 기원』 7장에
//    걸어 둔 선과 같은 선이다.
// ⚠️ **사람을 채점하지 않는다.** 없는 오행을 모자람으로 쓰지 않고, "이러면 이렇게
//    된다"는 단정을 쓰지 않는다. 호감지수 0점 화면과 같은 자리다.
// ⚠️ **끝은 주사다**(브랜드 원칙 3). 명식은 읽고 끝나는 정보 화면이 아니라
//    "그래서 오늘은?"으로 맘운에 들어가는 입구다.
//
// app.js·prescriptions.js는 건드리지 않는다. fortune.js에는 타일 하나와
// 부르는 줄 하나만 더했다.
(() => {
  'use strict';

  const F = window.MAUMJARO_FORTUNE_DATA;
  const D = window.MAUMJARO_SAJU_DATA;
  if (!F || !D) return;

  const { STEM_KO, BRANCH_KO, GAN_ELEMENT, BRANCH_ELEMENT } = F;

  // 오행 상생·상극. fortune.js의 elementRelation과 같은 표를 쓴다 —
  // 두 벌로 두면 한쪽만 고쳐지는 날이 온다. 여기선 일간 기준이라 이름만 다르다.
  const GENERATES = { 목: '화', 화: '토', 토: '금', 금: '수', 수: '목' };
  const CONTROLS = { 목: '토', 토: '수', 수: '화', 화: '금', 금: '목' };

  function relationOf(mine, other) {
    if (mine === other) return 'same';
    if (GENERATES[mine] === other) return 'output';
    if (GENERATES[other] === mine) return 'resource';
    if (CONTROLS[mine] === other) return 'wealth';
    return 'authority';
  }

  // 십성 = 오행 관계 다섯 × 음양이 같은지 다른지.
  function tenGod(dayGan, targetGan) {
    if (!dayGan || !targetGan) return null;
    const rel = relationOf(GAN_ELEMENT[dayGan], GAN_ELEMENT[targetGan]);
    const sameYy = D.STEM_YY[dayGan] === D.STEM_YY[targetGan];
    const pair = D.TEN_GODS[rel];
    if (!pair) return null;
    return sameYy ? pair.sameYy : pair.diffYy;
  }

  // 지지의 십성은 **정기**(지장간의 마지막 글자)로 뽑는다. 전통 방식이다.
  function mainHiddenStem(zhi) {
    const list = D.HIDDEN_STEMS[zhi];
    return list && list.length ? list[list.length - 1] : null;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- 한 기둥(천간+지지) ----------
  function pillarCellHtml(key, p, dayGan, isDay) {
    const label = D.PILLAR_LABEL[key];
    if (!p) {
      return `
        <div class="saju-col saju-col-unknown">
          <div class="saju-col-head"><span class="saju-col-ko">${label.ko}</span><span class="saju-col-sub">${label.sub}</span></div>
          <div class="saju-char saju-char-empty">?</div>
          <div class="saju-char saju-char-empty">?</div>
          <div class="saju-col-foot">태어난 시간을<br />넣으면 채워져요</div>
        </div>`;
    }
    const ganEl = GAN_ELEMENT[p.gan];
    const zhiEl = BRANCH_ELEMENT[p.zhi];
    const zhiMain = mainHiddenStem(p.zhi);
    // 일간은 기준점이라 십성이 없다. "나"라고 적는다.
    const ganGod = isDay ? '나' : tenGod(dayGan, p.gan);
    const zhiGod = tenGod(dayGan, zhiMain);
    return `
      <div class="saju-col${isDay ? ' saju-col-day' : ''}">
        <div class="saju-col-head"><span class="saju-col-ko">${label.ko}</span><span class="saju-col-sub">${label.sub}</span></div>

        <div class="saju-god">${esc(ganGod || '—')}</div>
        <div class="saju-char" style="--el:${D.ELEMENT_INFO[ganEl].color};">
          <span class="saju-han">${p.gan}</span>
          <span class="saju-ko">${STEM_KO[p.gan]}</span>
        </div>
        <div class="saju-el">${D.ELEMENT_INFO[ganEl].emoji} ${ganEl}</div>

        <div class="saju-god">${esc(zhiGod || '—')}</div>
        <div class="saju-char" style="--el:${D.ELEMENT_INFO[zhiEl].color};">
          <span class="saju-han">${p.zhi}</span>
          <span class="saju-ko">${BRANCH_KO[p.zhi]}</span>
        </div>
        <div class="saju-el">${D.ELEMENT_INFO[zhiEl].emoji} ${zhiEl}</div>
      </div>`;
  }

  // ---------- 지장간 ----------
  function hiddenHtml(chart, dayGan) {
    const rows = ['year', 'month', 'day', 'time']
      .map((k) => [k, chart.pillars[k]])
      .filter(([, p]) => !!p)
      .map(([k, p]) => {
        const list = D.HIDDEN_STEMS[p.zhi] || [];
        const inner = list.map((g, i) => {
          const isMain = i === list.length - 1;
          const god = tenGod(dayGan, g);
          return `<span class="saju-hidden-chip${isMain ? ' main' : ''}">${STEM_KO[g]}<small>${esc(god || '')}</small></span>`;
        }).join('');
        return `
          <div class="rx-slip-row saju-hidden-row">
            <span class="rx-slip-key">${D.PILLAR_LABEL[k].ko} ${BRANCH_KO[p.zhi]}</span>
            <span class="saju-hidden-list">${inner}</span>
          </div>`;
      }).join('');
    return `
      <div class="rx-custom-preview" style="margin-top:8px;">
        <div class="rx-slip-row"><span class="rx-slip-key">🫙 지장간 — 지지 안에 숨은 글자</span></div>
        ${rows}
        <p class="rx-custom-hint" style="margin:8px 0 0;">진하게 표시된 것이 정기(正氣)예요. 지지의 십성은 이 글자로 봅니다.</p>
      </div>`;
  }

  // ---------- 오행 막대 ----------
  function elementsHtml(chart) {
    const counts = chart.wuxingCount || {};
    const total = D.ELEMENT_ORDER.reduce((s, e) => s + (counts[e] || 0), 0) || 1;
    const max = Math.max(...D.ELEMENT_ORDER.map((e) => counts[e] || 0));
    const bars = D.ELEMENT_ORDER.map((e) => {
      const n = counts[e] || 0;
      const info = D.ELEMENT_INFO[e];
      return `
        <div class="saju-bar-row">
          <span class="saju-bar-label">${info.emoji} ${e}</span>
          <span class="saju-bar-track">
            <span class="saju-bar-fill" style="width:${Math.round((n / total) * 100)}%;background:${info.color};"></span>
          </span>
          <span class="saju-bar-num">${n}</span>
        </div>`;
    }).join('');

    const many = D.ELEMENT_ORDER.filter((e) => (counts[e] || 0) === max && max > 0);
    const none = D.ELEMENT_ORDER.filter((e) => !counts[e]);
    const notes = [];
    many.forEach((e) => notes.push(`<p class="saju-note">${D.ELEMENT_INFO[e].emoji} <strong>${e}</strong> — ${D.ELEMENT_MANY[e]}</p>`));
    none.forEach((e) => notes.push(`<p class="saju-note">${D.ELEMENT_INFO[e].emoji} <strong>${e}</strong> — ${D.ELEMENT_NONE[e]}</p>`));

    return `
      <div class="rx-custom-preview" style="margin-top:8px;">
        <div class="rx-slip-row"><span class="rx-slip-key">⚖️ 오행 — 여덟 글자를 다섯으로 세면</span></div>
        <div class="saju-bars">${bars}</div>
        ${notes.join('')}
        ${chart.timeUnknown ? '<p class="rx-custom-hint" style="margin:8px 0 0;">태어난 시간을 모르면 시주 두 글자는 세지 않아요. 아는 것만 세는 쪽이 맞아서요.</p>' : ''}
      </div>`;
  }

  // ---------- 십성 요약 ----------
  function godsHtml(chart, dayGan) {
    const found = [];
    ['year', 'month', 'day', 'time'].forEach((k) => {
      const p = chart.pillars[k];
      if (!p) return;
      if (k !== 'day') { const g = tenGod(dayGan, p.gan); if (g) found.push(g); }
      const zg = tenGod(dayGan, mainHiddenStem(p.zhi));
      if (zg) found.push(zg);
    });
    const tally = {};
    found.forEach((g) => { tally[g] = (tally[g] || 0) + 1; });
    const list = Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
    if (!list.length) return '';
    const rows = list.map((g) => `
      <div class="rx-slip-row">
        <span class="rx-slip-key">${g}${tally[g] > 1 ? ` ×${tally[g]}` : ''}</span>
        <span class="rx-slip-value">${esc(D.TEN_GOD_NOTE[g] || '')}</span>
      </div>`).join('');
    return `
      <div class="rx-custom-preview" style="margin-top:8px;">
        <div class="rx-slip-row"><span class="rx-slip-key">🔟 십성 — 일간에서 본 나머지 글자</span></div>
        ${rows}
      </div>`;
  }

  // ---------- 대운(大運) ----------
  //
  // ⚠️⚠️ 여기는 **내가 검증하지 못한 값이 하나 섞인다.** 그걸 먼저 적어 둔다.
  //
  //   · 간지 흐름(순행/역행과 10년마다의 글자) → **내가 계산한다.** 월주에서 60갑자를
  //     한 칸씩 밀거나 당기는 산수라, 테스트로 전부 검산해 뒀다.
  //   · 시작 나이(대운수) → **라이브러리가 준다.** 절기(節氣)까지의 날수를 3으로 나누는
  //     값이라 절기 날짜가 필요한데, 그 표는 lunar-javascript 안에만 있다.
  //     이 컨테이너에서는 그 CDN이 막혀 있어 **실제 값을 한 번도 못 돌려봤다.**
  //
  // 그래서 나이는 **라이브러리가 줄 때만** 쓴다. 못 받으면 나이 칸을 비우고
  // 화면이 그 사실을 말한다. 지어낸 나이를 적느니 비우는 쪽이 맞다
  // (로또·책 규칙과 같은 선: 확인 못 한 것을 확인한 것처럼 적지 않는다).
  //
  // 그리고 **해석을 쓰지 않는다.** "이 시기엔 돈이 들어옵니다" 같은 말은 한 줄도 없다.
  // 명식의 다른 칸과 똑같이 글자·오행·십성까지만 적는다. 10년 앞을 예언하기
  // 시작하면 그 순간 이 앱이 운세 앱이 된다(브랜드 1번 원칙).

  // 양간: 갑·병·무·경·임. 양남·음녀는 순행, 음남·양녀는 역행 — 전통 규칙이다.
  function isForward(yearGan, gender) {
    const yang = D.STEM_YY[yearGan] === '양';
    const male = gender === 'male';
    return (yang && male) || (!yang && !male);
  }

  // 월주에서 ±1씩 민 간지 여덟 개. 60갑자를 돌려 쓴다.
  function daeunGanZhi(monthPillar, forward, count) {
    const cyc = D.SEXAGENARY;
    const start = cyc.indexOf(monthPillar.gan + monthPillar.zhi);
    if (start < 0) return [];
    const out = [];
    for (let i = 1; i <= (count || 8); i++) {
      const idx = ((start + (forward ? i : -i)) % 60 + 60) % 60;
      out.push({ gan: cyc[idx][0], zhi: cyc[idx][1] });
    }
    return out;
  }

  // 대운 시작 나이(대운수). **라이브러리 없이 우리가 계산한다**(solar-terms.js).
  //
  // ⚠️ 처음엔 lunar-javascript 의 getYun() 에 기대고 "CDN 이 막혀 못 돌려봤다"고
  //    적었다. 효성님이 짚었다 — "검산이 안 되면 안 띄운다가 아니라, 검산이 되게
  //    해라". 맞는 말이었다. 절기는 천문 계산이라 직접 구할 수 있고,
  //    `scripts/check-solar-terms.mjs` 가 공표된 분점·지점과 **1분 안쪽**으로
  //    맞는 것까지 확인한다(실측 최대 0.59분).
  function daeunDetail(profile, forward) {
    try {
      const S = window.MaumjaroSolarTerms;
      if (!S || !profile || !profile.birthDate) return null;
      const [y, m, d] = String(profile.birthDate).split('-').map(Number);
      if (!y || !m || !d) return null;
      let hour = 12; // 시간을 모르면 정오로 본다. 대운수는 3일 단위라 반나절이 흔들려도 같은 값이 나온다.
      if (!profile.timeUnknown && profile.birthTime) {
        const t = String(profile.birthTime).split(':').map(Number);
        if (Number.isFinite(t[0])) hour = t[0] + (t[1] || 0) / 60;
      }
      return S.daeunStartDetail({ y, m, d, hour }, forward);
    } catch (e) {
      return null;
    }
  }

  function daeunHtml(chart, profile) {
    const dayGan = chart.pillars.day.gan;
    const monthP = chart.pillars.month;
    if (!monthP) return '';
    const forward = isForward(chart.pillars.year.gan, profile && profile.gender);
    const list = daeunGanZhi(monthP, forward, 8);
    if (!list.length) return '';

    const detail = daeunDetail(profile, forward);
    const startAge = detail ? detail.age : null;
    const nowAge = (() => {
      if (!profile || !profile.birthDate) return null;
      const y = Number(String(profile.birthDate).slice(0, 4));
      return Number.isFinite(y) ? new Date().getFullYear() - y : null;
    })();

    const cells = list.map((p, i) => {
      const from = startAge == null ? null : startAge + i * 10;
      const to = from == null ? null : from + 9;
      const here = from != null && nowAge != null && nowAge >= from && nowAge <= to;
      const ganEl = GAN_ELEMENT[p.gan];
      const zhiEl = BRANCH_ELEMENT[p.zhi];
      return `
        <div class="saju-daeun-cell${here ? ' here' : ''}">
          <div class="saju-daeun-age">${from == null ? '—' : `${from}~${to}세`}</div>
          <div class="saju-daeun-gz" style="--el:${D.ELEMENT_INFO[ganEl].color};">
            <span class="saju-daeun-han">${p.gan}${p.zhi}</span>
            <span class="saju-daeun-ko">${STEM_KO[p.gan]}${BRANCH_KO[p.zhi]}</span>
          </div>
          <div class="saju-daeun-god">${esc(tenGod(dayGan, p.gan) || '—')} · ${esc(tenGod(dayGan, mainHiddenStem(p.zhi)) || '—')}</div>
          <div class="saju-daeun-el">${D.ELEMENT_INFO[ganEl].emoji}${D.ELEMENT_INFO[zhiEl].emoji}</div>
          ${here ? '<div class="saju-daeun-now">지금</div>' : ''}
        </div>`;
    }).join('');

    return `
      <div class="rx-custom-preview" style="margin-top:8px;">
        <div class="rx-slip-row">
          <span class="rx-slip-key">🕰️ 대운 — 10년마다 바뀌는 글자</span>
          <span class="rx-slip-value">${forward ? '순행' : '역행'}</span>
        </div>
        <div class="saju-daeun">${cells}</div>
        <p class="rx-custom-hint" style="margin:8px 0 0;">
          월주에서 60갑자를 ${forward ? '한 칸씩 앞으로' : '한 칸씩 뒤로'} 민 글자예요.
          ${forward ? '양간에 남자거나 음간에 여자면 순행' : '음간에 남자거나 양간에 여자면 역행'}으로 보는 전통 규칙을 그대로 씁니다.
          ${detail == null
            ? '<strong>시작 나이를 지금은 못 구했어요.</strong> 생년월일을 다시 확인해 주세요.'
            : `태어난 날에서 ${detail.forward ? '다음' : '지난'} 절기인 <strong>${esc(detail.termKo)}</strong>(${detail.termM}월 ${detail.termD}일)까지 ${detail.days}일이고, 3일을 1년으로 세어 <strong>만 ${detail.age}세</strong>에 첫 대운이 시작해요.`}
        </p>
        <p class="rx-custom-hint" style="margin:6px 0 0;">
          앞으로 어떻게 된다는 말은 적지 않았어요. 전통이 그 10년에 붙여온 <strong>글자와 십성</strong>까지만 적습니다.
        </p>
      </div>`;
  }

  // ---------- 화면 ----------
  function render(mount, chart, opts) {
    if (!mount || !chart || !chart.pillars || !chart.pillars.day) return false;
    const o = opts || {};
    const profile = o.profile || null;
    const dayGan = chart.pillars.day.gan;
    const dm = D.DAY_MASTER[dayGan];
    if (!dm) return false;

    mount.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="saju-back" type="button">‹</button>
        <span class="rx-nav-title">📜 내 명식</span>
      </div>

      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${dm.emoji}</div>
        <div class="rx-detail-title">나는 ${dm.ko} · ${dm.figure}</div>
        <p class="rx-detail-symptom">${esc(dm.line)}</p>
      </div>
      <p class="rx-custom-hint" style="text-align:center;margin:8px 0 2px;">
        사주에서 '나'는 태어난 날의 천간 한 글자예요. 그 글자를 일간(日干)이라고 부릅니다.
      </p>

      <div class="saju-grid">
        ${pillarCellHtml('year', chart.pillars.year, dayGan, false)}
        ${pillarCellHtml('month', chart.pillars.month, dayGan, false)}
        ${pillarCellHtml('day', chart.pillars.day, dayGan, true)}
        ${pillarCellHtml('time', chart.pillars.time, dayGan, false)}
      </div>
      <p class="rx-custom-hint" style="text-align:center;margin:8px 0 2px;">
        위가 천간, 아래가 지지예요. 각 글자 위에 적힌 말이 십성입니다.
      </p>

      ${godsHtml(chart, dayGan)}
      ${hiddenHtml(chart, dayGan)}
      ${elementsHtml(chart)}
      ${profile ? daeunHtml(chart, profile) : ''}

      <p class="rx-custom-hint" style="margin-top:12px;">
        🧾 여기 적힌 것은 전부 <strong>전통이 정해 둔 표를 그대로 펼친 것</strong>이에요.
        음양, 지장간, 십성, 오행은 계산해서 나오는 값이지 해석이 아닙니다.
        뜻풀이 한 줄씩은 명리에서 오래 써온 말까지만 적었어요.
        <strong>이 여덟 글자가 사람을 정하지는 않습니다.</strong>
      </p>

      <button class="action-btn" id="saju-goto-maumun" type="button" style="width:100%;margin-top:12px;">그래서 오늘은? 💞</button>
    `;

    const back = mount.querySelector('#saju-back');
    if (back) back.addEventListener('click', () => { if (typeof o.onBack === 'function') o.onBack(); });
    const go = mount.querySelector('#saju-goto-maumun');
    if (go) go.addEventListener('click', () => { if (typeof o.onMaumun === 'function') o.onMaumun(); });
    return true;
  }

  window.MaumjaroSaju = { render, tenGod, mainHiddenStem, isForward, daeunGanZhi, daeunDetail };
})();
