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

  window.MaumjaroSfx = {
    cardShuffle, cardDraw, cardFlip,
    gachaCrank, capsuleDrop,
    capsuleTap, capsuleCrack,
  };
})();
