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

  // 예약 시각. 그냥 currentTime을 쓰면, 컨텍스트가 막 깨어나는 중일 때
  // 예약 시점이 이미 지나가 버려 그 소리가 통째로 버려진다(특히 iOS).
  // 아주 짧은 여유(20ms)를 두면 사람 귀엔 즉시로 들리면서 그 사고를 막는다.
  function now(c) {
    // 컨텍스트가 막 만들어진 직후에는 오디오 스레드가 아직 안 도는 구간이 있어서
    // 20ms로는 부족하다(실측: 이 구간에 예약한 소리는 출력이 0으로 나온다).
    // 그때만 여유를 더 준다 — 0.12초는 귀로는 여전히 "즉시"로 들린다.
    return c.currentTime + (c.currentTime < 0.4 ? 0.12 : 0.02);
  }

  // iOS/모바일 브라우저는 사용자가 화면을 건드리기 전까지 오디오를 막는다.
  // 클릭 핸들러 안에서 AudioContext를 "만들기만" 해서는 부족하고, 제스처가 살아 있는
  // 동안 resume()과 무음 재생을 한 번 해줘야 확실히 풀린다.
  // 이걸 안 해두면 "그 화면에서만 소리가 안 난다"가 된다 — 실제로 MBTI 시험지에서 그랬다.
  // (앱 어디를 처음 누르든 그 순간 풀리도록 document 전체에서 잡는다)
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    if (!on()) return;              // 소리가 꺼져 있으면 다음 제스처에 다시 시도한다
    const c = audio();
    if (!c) return;
    unlocked = true;
    try {
      if (c.state === 'suspended') c.resume();
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, c.sampleRate);
      s.connect(c.destination);
      s.start(0);
    } catch (e) { /* 실패해도 다음 소리에서 다시 시도된다 */ }
  }
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => {
    document.addEventListener(ev, unlock, { capture: true, passive: true });
  });

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
    const t0 = now(c);
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
    const t = now(c);
    burst(c, t, 0.16, { freq: 900, freqTo: 3200, q: 0.7, gain: 0.10 });
    burst(c, t + 0.15, 0.05, { freq: 2600, q: 1.6, gain: 0.09 });
  }

  // 카드를 뒤집어 공개하는 소리. 뽑기보다 짧고 단단하게.
  function cardFlip() {
    const c = audio(); if (!c) return;
    const t = now(c);
    burst(c, t, 0.07, { freq: 2200, freqTo: 900, q: 1.0, gain: 0.12 });
    blip(c, t + 0.02, 320, 0.09, { type: 'triangle', gain: 0.07, freqTo: 210 });
  }

  // 카드가 열리며 결과가 드러나는 소리.
  // 처음엔 cardFlip(노이즈)을 썼는데 "촥" 하고 요란해서 신비로운 맛이 없었다.
  // 노이즈를 걷어내고 5음계 화음을 아주 부드럽게 위로 쌓는다.
  function cardReveal() {
    const c = audio(); if (!c) return;
    const t = now(c);
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
    const t0 = now(c);
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
    const t0 = now(c);
    const bounces = [0, 0.13, 0.22, 0.28, 0.32];
    bounces.forEach((d, i) => {
      const g = 0.2 * Math.pow(0.62, i);
      blip(c, t0 + d, 240 - i * 18, 0.11, { type: 'sine', gain: g, freqTo: 120 });
      burst(c, t0 + d, 0.035, { freq: 1800, q: 1.4, gain: g * 0.45 });
    });
  }

  // ---------- 캡슐 열기 ----------

  // 캡슐을 두드리는 소리. 7단계로 늘어났으므로 세기 변화도 그만큼 잘게 나눈다.
  // 뒤로 갈수록 금이 깊어져 껍질이 얇아지는 느낌 — 음이 높아지고 잔향이 길어진다.
  function capsuleTap(step) {
    const c = audio(); if (!c) return;
    const t = now(c);
    const s = Math.max(0, Math.min(6, (step || 1) - 1)) / 6; // 0~1로 정규화
    burst(c, t, 0.045 + s * 0.03, { freq: 2300 + s * 1500, q: 2.4, gain: 0.09 + s * 0.07 });
    blip(c, t, 185 + s * 150, 0.065 + s * 0.05, { type: 'triangle', gain: 0.065 + s * 0.05, freqTo: 105 });
    // 4번째부터는 금이 자잘하게 번지는 소리를 뒤에 하나 더 붙인다
    if (s > 0.45) {
      burst(c, t + 0.05, 0.05 + s * 0.03, { freq: 3600 + s * 1800, q: 1.6, gain: 0.03 + s * 0.05, filter: 'highpass' });
    }
  }

  // 캡슐이 "와자작" 부서지는 소리.
  //
  // 핵심은 여기다 — 와자작은 크랙 "한 번"이 아니다.
  // 단단한 껍질은 한 지점이 터지면 금이 사방으로 번지면서 아주 짧은 파열이
  // 150ms 안에 십수 번 몰아친다. 그 밀도가 "쩍"과 "와자작"을 가른다.
  // 그래서 (2)를 한 방이 아니라 앞이 촘촘하고 뒤로 성겨지는 무리로 만든다.
  //
  // 그리고 이건 하루에 한 번 여는 상자다. 부서지는 데서 끝나면 허전하고,
  // 부서진 자리에서 뭔가 솟아올라야 "열었다"는 희열이 된다.
  // 그래서 마지막에 위로 올라가는 밝은 종소리를 얹는다.
  function capsuleCrack() {
    const c = audio(); if (!c) return;
    const t = now(c);

    // 1) 껍질이 버티다 끊기는 저역 충격 "쿵" — 무게를 만든다
    blip(c, t, 340, 0.1, { type: 'triangle', gain: 0.32, freqTo: 62 });
    burst(c, t, 0.06, { freq: 380, q: 0.8, gain: 0.24, filter: 'lowpass' });

    // 2) 와자작 — 금이 번지는 미세 파열 무리.
    //    앞이 촘촘(간격 8ms)하고 뒤로 갈수록 성겨진다(간격 22ms).
    //    하나하나는 8~22ms로 아주 짧고 Q를 높여 "딱딱"하게 만든다.
    const CRACKS = 16;
    let d = 0.002;
    for (let i = 0; i < CRACKS; i++) {
      const p = i / (CRACKS - 1);              // 0 → 1
      const decay = Math.pow(0.9, i);
      burst(c, t + d, 0.008 + Math.random() * 0.014, {
        freq: 2200 + Math.random() * 4800,
        q: 6 + Math.random() * 6,
        gain: (0.38 - p * 0.18) * decay,
        rate: 0.85 + Math.random() * 0.7,
      });
      // 중간중간 넓은 대역 파열을 섞어야 "종이 찢는 소리"가 아니라 "깨지는 소리"가 된다
      if (i % 4 === 1) {
        burst(c, t + d, 0.03, {
          freq: 5200 + Math.random() * 2500, freqTo: 1400,
          q: 0.6, gain: 0.21 * decay, filter: 'highpass', rate: 1.3,
        });
      }
      d += 0.008 + p * 0.014 + Math.random() * 0.006;
    }

    // 3) 파편이 튀어 흩어지는 소리 — 성기고 점점 작아진다
    for (let i = 0; i < 10; i++) {
      const dd = 0.16 + i * 0.035 + Math.random() * 0.04;
      const decay = Math.pow(0.8, i);
      burst(c, t + dd, 0.02 + Math.random() * 0.02, {
        freq: 3000 + Math.random() * 3800, q: 4, gain: 0.10 * decay, rate: 0.9 + Math.random() * 0.6,
      });
      if (i % 3 === 0) blip(c, t + dd, 820 + Math.random() * 1100, 0.03, { type: 'square', gain: 0.028 * decay, freqTo: 320 });
    }

    // 4) 희열 — 부서진 자리에서 솟아오르는 밝은 종소리(도-미-솔-도-미).
    //    위로 올라가는 음형이라야 "열렸다!"가 된다. 아래로 내려가면 부서진 걸로 끝난다.
    [1046.5, 1318.5, 1568.0, 2093.0, 2637.0].forEach((f, i) => {
      const st = t + 0.10 + i * 0.055;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, st);
      const dur = 1.3 - i * 0.15;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.10 - i * 0.010, st + 0.012); // 종이라 어택이 빠르다
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      osc.connect(g).connect(c.destination);
      osc.start(st); osc.stop(st + dur + 0.05);
    });

    // 5) 위로 훑고 올라가는 반짝임 — 희열을 한 번 더 밀어 올린다
    burst(c, t + 0.12, 0.55, { freq: 1800, freqTo: 9000, q: 0.5, gain: 0.075, filter: 'bandpass', rate: 1.2 });

    // 6) 빈 껍데기가 울리는 여운
    blip(c, t + 0.04, 160, 0.6, { type: 'sine', gain: 0.06, freqTo: 92 });
  }

  // 갓차 캡슐이 열리며 운세가 드러나는 소리. 카드 공개와 같은 계열의 신비로운 톤.
  function gachaReveal() {
    const c = audio(); if (!c) return;
    const t = now(c);
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

  // 시험지를 한 장 넘기는 소리.
  // 한 번의 노이즈 스윕으로는 "쉬-" 하는 바람소리가 되어 종이로 안 들린다.
  // 실제 종이는 (1) 손가락이 모서리를 집어 드는 짧은 "삭",
  // (2) 장이 휘면서 공기를 가르는 "샤아—" (고역이 넓게 퍼졌다 좁아짐),
  // (3) 장이 뒤집혀 반대편에 탁 떨어지는 "타닥" 두 겹으로 들린다.
  // 그리고 종이는 섬유질이라 스펙트럼이 넓다 — 대역폭(Q)을 아주 낮게 잡아야 한다.
  function pageFlip() {
    const c = audio(); if (!c) return;
    const t = now(c);

    // 1) 모서리를 집어 드는 짧은 마찰
    burst(c, t, 0.045, { freq: 5200, freqTo: 3200, q: 0.35, gain: 0.06, filter: 'highpass', rate: 1.3 });

    // 2) 장이 휘며 공기를 가르는 본체 — 두 겹을 살짝 어긋나게 겹쳐 두께를 만든다
    burst(c, t + 0.035, 0.16, { freq: 3400, freqTo: 1100, q: 0.3, gain: 0.085, filter: 'bandpass', rate: 1.05 });
    burst(c, t + 0.055, 0.13, { freq: 6200, freqTo: 2200, q: 0.4, gain: 0.045, filter: 'highpass', rate: 0.95 });

    // 3) 장이 반대편에 떨어지는 "타-닥" (두 번, 아주 짧게)
    burst(c, t + 0.175, 0.04, { freq: 1700, freqTo: 800, q: 0.9, gain: 0.075, filter: 'bandpass' });
    burst(c, t + 0.215, 0.055, { freq: 1100, freqTo: 520, q: 0.7, gain: 0.055, filter: 'bandpass' });
    // 종이 뭉치가 눌리는 아주 낮은 울림(있고 없고가 "얇은 종이 한 장"과 "시험지 묶음"을 가른다)
    blip(c, t + 0.185, 120, 0.09, { type: 'sine', gain: 0.035, freqTo: 72 });
  }

  // 답을 고를 때의 짧은 체크 소리. 넘기는 소리와 겹쳐도 묻히지 않게 또렷한 톤 하나.
  function pageMark() {
    const c = audio(); if (!c) return;
    const t = now(c);
    burst(c, t, 0.04, { freq: 3000, q: 2.4, gain: 0.07 });
    blip(c, t, 880, 0.07, { type: 'triangle', gain: 0.06, freqTo: 1320 });
  }

  // 결과 발표. 두구두구(저역 롤) → 잠깐 정적 → 팡파르(장3화음 상행) → 반짝임.
  function resultFanfare() {
    const c = audio(); if (!c) return;
    const t0 = now(c);
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

  // ---------- 궁합 공개 ----------

  // 궁합이 열리는 소리. "봄날 같고 사랑스럽게"가 목표다.
  // 신비로운 계열(cardReveal)은 차갑고 밤 느낌이라 여기엔 안 맞는다.
  // 따뜻하게 들리게 하는 건 세 가지다 —
  //  (1) 장6화음(도-미-솔-라): 장3화음보다 부드럽고 달콤하다. 긴장이 없다.
  //  (2) 느린 어택: 톡 치고 들어오면 차갑고, 서서히 차오르면 포근하다.
  //  (3) 아주 옅은 비브라토: 기계음이 아니라 숨 쉬는 소리로 들린다.
  // 마지막에 작은 종소리 두 방울을 얹어 "반짝"을 만든다.
  function loveReveal() {
    const c = audio(); if (!c) return;
    const t = now(c);

    // 도-미-솔-라 (C6/A add6). 어떤 순서로 겹쳐도 달콤하게 맞물린다.
    const chord = [523.25, 659.25, 783.99, 880.0];
    chord.forEach((f, i) => {
      const st = t + i * 0.11;
      const dur = 1.9 - i * 0.12;

      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, st);

      // 숨 쉬는 느낌을 주는 아주 얕은 비브라토(±0.35%)
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(4.6, st);
      lfoGain.gain.setValueAtTime(f * 0.0035, st);
      lfo.connect(lfoGain).connect(osc.frequency);

      const g = c.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.085 - i * 0.008, st + 0.22); // 느린 어택
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);

      osc.connect(g).connect(c.destination);
      osc.start(st); osc.stop(st + dur + 0.05);
      lfo.start(st); lfo.stop(st + dur + 0.05);
    });

    // 한 옥타브 아래 도 — 아주 작게 깔아 바닥을 따뜻하게 받친다
    blip(c, t, 261.63, 1.6, { type: 'sine', gain: 0.045 });

    // 반짝이는 종소리 두 방울
    [1567.98, 2093.0].forEach((f, i) => {
      const st = t + 0.5 + i * 0.19;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.035 - i * 0.008, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.9);
      osc.connect(g).connect(c.destination);
      osc.start(st); osc.stop(st + 0.95);
    });

    // 봄바람 같은 아주 옅은 공기감(거의 안 들릴 세기로만)
    burst(c, t + 0.1, 1.1, { freq: 5200, freqTo: 3200, q: 0.4, gain: 0.011, filter: 'highpass' });
  }

  window.MaumjaroSfx = {
    loveReveal,
    cardShuffle, cardDraw, cardFlip, cardReveal,
    gachaCrank, capsuleDrop, gachaReveal,
    capsuleTap, capsuleCrack,
    pageFlip, pageMark, resultFanfare,
  };
})();
