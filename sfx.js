// 효과음 엔진
//
// app.js에도 소리 함수가 있지만 그건 "주사" 계열(삐- 하는 톤)이다.
// 타로 카드나 갓차는 톤이 아니라 "사각사각", "드르륵", "딱" 같은 소음성 소리여야 해서
// 오실레이터만으로는 만들 수 없다. 노이즈 버퍼 + 필터가 필요하다.
//
// app.js는 건드리지 않고 자체 AudioContext를 쓴다. 소리 켜짐/꺼짐 설정은
// app.js가 쓰는 키(maumjaro:soundOn)를 그대로 읽어서 한 스위치로 동작하게 한다.
(() => {
  'use strict';

  const SOUND_KEY = 'maumjaro:soundOn';
  let ctx = null;
  let noiseBuf = null;

  function on() {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; }
  }

  // AudioContext는 사용자 제스처 안에서 처음 만들어야 iOS에서 소리가 난다.
  // 효과음은 전부 클릭/탭 핸들러에서 호출되므로 여기서 만들면 조건이 맞는다.
  function audio() {
    if (!on()) return null;
    try {
      if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        ctx = new Ctx();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }

  // 1초짜리 화이트노이즈를 한 번만 만들어 두고 재활용한다.
  // 소리마다 새로 만들면 연속 재생 때 끊긴다.
  function noise(c) {
    if (noiseBuf) return noiseBuf;
    const len = c.sampleRate;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // 노이즈 한 조각을 필터에 통과시켜 낸다. 카드·크랙 같은 소리의 기본 재료.
  function burst(c, t, dur, opts) {
    const o = opts || {};
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.playbackRate.value = o.rate || 1;

    const f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.freqTo), t + dur);
    f.Q.value = o.q == null ? 1.2 : o.q;

    const g = c.createGain();
    const peak = o.gain == null ? 0.15 : o.gain;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.008, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(f).connect(g).connect(c.destination);
    // 노이즈 버퍼는 1초라, 시작 지점을 흩어 주어야 같은 소리가 반복되지 않는다.
    src.start(t, Math.random() * 0.8, dur);
    src.stop(t + dur);
  }

  // 짧은 음정 하나. 캡슐이 굴러 떨어질 때의 "통" 같은 저음에 쓴다.
  function blip(c, t, freq, dur, opts) {
    const o = opts || {};
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.freqTo), t + dur);
    const peak = o.gain == null ? 0.18 : o.gain;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // ---------- 타로 ----------

  // 카드를 섞는 소리. 짧은 사각거림을 불규칙한 간격으로 겹쳐 낸다.
  // 규칙적으로 내면 기계음처럼 들려서 간격과 음색을 매번 흔든다.
  function cardShuffle() {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    let t = t0;
    const n = 12 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      burst(c, t, 0.045 + Math.random() * 0.03, {
        freq: 1600 + Math.random() * 1800,
        freqTo: 700 + Math.random() * 500,
        q: 0.8, gain: 0.055 + Math.random() * 0.04, rate: 0.9 + Math.random() * 0.4,
      });
      t += 0.028 + Math.random() * 0.035;
    }
  }

  // 카드 한 장을 뽑아 드는 소리. 스윽 하고 끌리다가 톡 하고 멈춘다.
  function cardDraw() {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    burst(c, t, 0.16, { freq: 900, freqTo: 3200, q: 0.7, gain: 0.10 });
    burst(c, t + 0.15, 0.05, { freq: 2600, q: 1.6, gain: 0.09 });
  }

  // 카드를 뒤집어 공개하는 소리. 뽑기보다 짧고 단단하게.
  function cardFlip() {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    burst(c, t, 0.07, { freq: 2200, freqTo: 900, q: 1.0, gain: 0.12 });
    blip(c, t + 0.02, 320, 0.09, { type: 'triangle', gain: 0.07, freqTo: 210 });
  }

  // 카드가 열리며 결과가 드러나는 소리.
  // 처음엔 cardFlip(노이즈)을 썼는데 "촥" 하고 요란해서 신비로운 맛이 없었다.
  // 노이즈를 걷어내고 5음계 화음을 아주 부드럽게 위로 쌓는다.
  function cardReveal() {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    // 도-미-솔-도-레 (펜타토닉). 어떤 순서로 겹쳐도 불협이 나지 않는다.
    const notes = [523.25, 659.25, 783.99, 1046.5, 1174.7];
    notes.forEach((f, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      const st = t + i * 0.075;
      const dur = 1.5 - i * 0.12;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.075 - i * 0.008, st + 0.12); // 천천히 차오름
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      osc.connect(g).connect(c.destination);
      osc.start(st);
      osc.stop(st + dur + 0.05);
    });
    // 아주 옅은 반짝임 하나만 얹어 공기감을 준다(노이즈지만 거의 안 들릴 세기).
    burst(c, t + 0.05, 0.5, { freq: 5200, q: 0.6, gain: 0.012, filter: 'highpass' });
  }

  // ---------- 갓차 ----------

  // 손잡이를 돌리는 드르륵. 일정 간격의 딱딱거림 + 밑에 깔리는 저역 진동.
  function gachaCrank(turns) {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    const n = turns || 10;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.062;
      // 톱니 하나가 넘어가는 딱 소리. 뒤로 갈수록 살짝 높아져 "돌아가는" 느낌을 준다.
      burst(c, t, 0.03, { freq: 1100 + i * 45, q: 3.5, gain: 0.13, filter: 'bandpass' });
      blip(c, t, 90 + i * 2, 0.045, { type: 'square', gain: 0.045, freqTo: 60 });
    }
  }

  // 캡슐이 굴러 나와 떨어지는 소리. 통 → 통 → 통, 점점 빨라지고 작아진다.
  function capsuleDrop() {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    const bounces = [0, 0.13, 0.22, 0.28, 0.32];
    bounces.forEach((d, i) => {
      const g = 0.2 * Math.pow(0.62, i);
      blip(c, t0 + d, 240 - i * 18, 0.11, { type: 'sine', gain: g, freqTo: 120 });
      burst(c, t0 + d, 0.035, { freq: 1800, q: 1.4, gain: g * 0.45 });
    });
  }

  // ---------- 캡슐 열기 ----------

  // 캡슐을 두드리는 소리. 두드릴수록 금이 깊어지도록 단계(step)에 따라 세진다.
  function capsuleTap(step) {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    const s = Math.max(0, Math.min(4, (step || 1) - 1));
    burst(c, t, 0.05 + s * 0.008, { freq: 2400 + s * 260, q: 2.2, gain: 0.10 + s * 0.022 });
    blip(c, t, 190 + s * 26, 0.07, { type: 'triangle', gain: 0.07 + s * 0.015, freqTo: 110 });
  }

  // 캡슐이 쩍 갈라지는 소리. 날카로운 크랙 뒤에 조각이 흩어지는 잔향.
  function capsuleCrack() {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    burst(c, t, 0.09, { freq: 3400, freqTo: 1200, q: 0.9, gain: 0.26, filter: 'highpass' });
    blip(c, t, 520, 0.12, { type: 'square', gain: 0.10, freqTo: 180 });
    for (let i = 0; i < 6; i++) {
      burst(c, t + 0.06 + i * 0.045 + Math.random() * 0.02, 0.05, {
        freq: 2600 + Math.random() * 2200, q: 2.0, gain: 0.05,
      });
    }
  }

  // 갓차 캡슐이 열리며 운세가 드러나는 소리. 카드 공개와 같은 계열의 신비로운 톤.
  function gachaReveal() {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    [392.0, 523.25, 659.25, 783.99].forEach((f, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      const st = t + i * 0.06;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.07 - i * 0.008, st + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 1.2 - i * 0.1);
      osc.connect(g).connect(c.destination);
      osc.start(st);
      osc.stop(st + 1.3);
    });
    burst(c, t, 0.45, { freq: 4800, q: 0.6, gain: 0.014, filter: 'highpass' });
  }

  // ---------- 마음유형 시험지 ----------

  // 시험지를 한 장 넘기는 소리. 종이는 음정이 없고 "사아—악" 하고 스치는 소음이라
  // 노이즈를 고역에서 저역으로 훑어 내리고, 끝에 종이가 놓이는 "톡"을 짧게 붙인다.
  function pageFlip() {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    burst(c, t, 0.19, { freq: 4200, freqTo: 900, q: 0.55, gain: 0.10, filter: 'bandpass', rate: 1.1 });
    burst(c, t + 0.05, 0.13, { freq: 2600, freqTo: 1400, q: 0.7, gain: 0.055 });
    // 넘긴 장이 책상에 닿는 소리
    burst(c, t + 0.17, 0.045, { freq: 1500, q: 1.8, gain: 0.07 });
    blip(c, t + 0.17, 150, 0.06, { type: 'sine', gain: 0.04, freqTo: 90 });
  }

  // 답을 고를 때의 짧은 체크 소리. 넘기는 소리와 겹쳐도 묻히지 않게 또렷한 톤 하나.
  function pageMark() {
    const c = audio(); if (!c) return;
    const t = c.currentTime;
    burst(c, t, 0.04, { freq: 3000, q: 2.4, gain: 0.07 });
    blip(c, t, 880, 0.07, { type: 'triangle', gain: 0.06, freqTo: 1320 });
  }

  // 결과 발표. 두구두구(저역 롤) → 잠깐 정적 → 팡파르(장3화음 상행) → 반짝임.
  function resultFanfare() {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    // 두구두구: 저역 타격을 점점 빠르고 세게
    let t = t0;
    for (let i = 0; i < 18; i++) {
      const p = i / 17;
      blip(c, t, 96 - i * 0.8, 0.055, { type: 'sine', gain: 0.05 + p * 0.07, freqTo: 60 });
      burst(c, t, 0.03, { freq: 320, q: 1.2, gain: 0.03 + p * 0.03, filter: 'lowpass' });
      t += 0.075 - p * 0.035;
    }
    // 정적 뒤에 터지는 팡파르 (도-미-솔-도)
    const fan = t + 0.22;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const st = fan + i * 0.085;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = i === 3 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, st);
      const dur = i === 3 ? 1.6 : 0.55;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.1 - i * 0.008, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      osc.connect(g).connect(c.destination);
      osc.start(st);
      osc.stop(st + dur + 0.05);
    });
    // 반짝이는 잔향
    burst(c, fan + 0.24, 0.9, { freq: 5600, q: 0.5, gain: 0.02, filter: 'highpass' });
  }

  window.MaumjaroSfx = {
    cardShuffle, cardDraw, cardFlip, cardReveal,
    gachaCrank, capsuleDrop, gachaReveal,
    capsuleTap, capsuleCrack,
    pageFlip, pageMark, resultFanfare,
  };
})();
