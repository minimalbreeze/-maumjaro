// 화면에 올라가는 것의 생김새. build.mjs 와 thumbnail.mjs 가 같이 쓴다.
//
// 왜 따로 떼어 놨나
//   곡 간격을 build.mjs 는 1.5 초로, description.mjs 는 1.2 초로 알고 있어서
//   1집 챕터가 뒤로 갈수록 밀렸다. 같은 값을 두 파일에 적어 두면 반드시
//   어긋난다. 영상과 썸네일이 같은 얼굴이어야 하므로 여기 한 곳에 둔다.
//
// ⚠️ 이퀄라이저 + 곡 제목 + 아티스트 + 로고. 이 네 층이 시그니처다.
//    (2026-11-12 효성님: "처음에 만들었던 이퀄라이저랑 그 느낌 그대로 하라고,
//     바꾸지 말어 그건 시그니처야")
//    층을 더하지도, 빼지도, 자리를 옮기지도 않는다. 썸네일도 같은 얼굴로 간다.

import { spawnSync } from 'node:child_process';

export const LOOK = {
  w: 1920, h: 1080, fps: 24,
  ink: '0xf2efe9',          // 글자
  accent: '0xffc66b',       // 이퀄라이저
  /* 자막 띠를 덮는 검정 막의 세기. 그림마다 다르게 잡는다 — scrimFor 참고.
   * 0.30 은 1집(띠 평균 밝기 105)에서 쓴 값이고, 그보다 밝은 그림이면 올린다. */
  scrim: 0.30,
  /* 막을 씌운 뒤 띠가 가야 할 밝기. 흰 글씨(242)와 명암비 4.5 를 넘기려면
   * 111 아래여야 한다. 여유를 두고 95 로 잡는다.
   * 1집 그림(원래 105)에 돌리면 0.30 이 나와서 1집 결과는 그대로다. */
  scrimTargetY: 95,
  // 서로소 주기. 겹쳐서 전체 패턴이 7*11*13 = 1001초(16.7분)마다 반복한다.
  period: { lp: 7, drift: 11, dust: 13 },
  /* 화면에 올리는 것은 네 층뿐이다.
   *   이퀄라이저 · 곡 제목 · 아티스트 · 로고(마크+채널명 한 덩이)
   * 진행선과 곡 번호는 뺐다 — 유튜브에 자기 재생바가 이미 있고,
   * minimal 이라는 이름을 달고 여섯 층을 쌓을 수는 없다. */
  eq: { w: 520, h: 52, alpha: 0.70 },
  lockupW: 560,   // 줄이면 선과 글자가 가늘어져 사라진다. 원본 크기에 가깝게 쓴다.
  /* 자막 띠는 586 에서 시작해 화면 바닥까지 간다.
   * 전에는 364px 짜리 상자였는데, 밝은 그림(2집) 위에서는 위아래 경계선이
   * 그대로 보였다 — 회색 판을 얹은 것처럼 됐다. 바닥까지 끌어내려 아래
   * 경계를 없애고, 위쪽만 scrimFade 만큼 서서히 번지게 한다. */
  y: { scrim: 586, eq: 626, title: 700, artist: 772, lockup: 858 },
  /* 번지는 구간은 제목이 앉는 y=700 보다 위에서 끝나야 한다.
   * 132 로 뒀더니 586+132=718 이라 제목이 아직 옅은 자리에 걸쳤고
   * 명암비가 3.3 까지 떨어졌다. 90 이면 676 에서 끝난다. */
  scrimFade: 90,
};

/* 자막 띠 자리의 그림이 얼마나 밝은지 재서, 막의 세기를 정한다.
 *
 * 1집은 저녁 로비라 그 자리가 어두웠고(평균 105) 0.30 으로 충분했다.
 * 2집은 해 지기 직전이라 바닥이 환하다(평균 191). 같은 0.30 을 쓰면
 * 흰 글씨와 배경의 명암비가 3.2 까지 떨어진다 — 읽히는 선(4.5)보다 낮다.
 * 그래서 재서 맞춘다. 1집 그림에 돌리면 그대로 0.30 이 나온다.
 */
export function scrimFor(art, log = console.log) {
  const { w, h, y } = LOOK;
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', art,
    '-vf', `scale=${w}:${h},crop=${w}:${h - y.scrim}:0:${y.scrim},`
      + 'format=gray,signalstats,metadata=print',
    '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = `${r.stdout || ''}${r.stderr || ''}`.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  if (!m) { log('   (띠 밝기를 못 재서 기본값을 씁니다)'); return LOOK.scrim; }
  const avg = Number(m[1]);
  const need = Math.max(LOOK.scrim, 1 - (LOOK.scrimTargetY / avg));
  const got = Math.min(0.62, need);          // 너무 세면 띠가 검은 판처럼 보인다
  log(`   자막 띠 밝기 ${avg.toFixed(0)} → 막 ${got.toFixed(2)}`);
  return got;
}

/* 위쪽이 서서히 번져 들어가는 자막 띠.
 *
 * drawbox 는 경계가 칼같이 떨어진다. 얇은 상자를 알파를 조금씩 올리며
 * 쌓아서 번지는 효과를 낸다. 한 칸이 3px, 알파 차이는 1/30 이라 눈에 안 띈다.
 * 아래쪽은 화면 바닥까지 가므로 경계 자체가 없다. */
export function scrimBoxes(scrim) {
  const { w, h, y, scrimFade } = LOOK;
  const step = 3;
  const steps = Math.round(scrimFade / step);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const a = (scrim * (i + 1)) / steps;
    out.push(`drawbox=x=0:y=${y.scrim + i * step}:w=${w}:h=${step}`
      + `:color=0x101010@${a.toFixed(4)}:t=fill`);
  }
  const top = y.scrim + steps * step;
  out.push(`drawbox=x=0:y=${top}:w=${w}:h=${h - top}:color=0x101010@${scrim}:t=fill`);
  return out;
}

/* 이퀄라이저. 소리를 받아 막대로 그린다. 영상과 썸네일이 같아야 하므로
 * 두 곳에서 이 문자열 하나를 쓴다. */
export function eqFilter() {
  return `showfreqs=mode=bar:ascale=sqrt:fscale=log:win_size=1024:colors=${LOOK.accent}`
    + `:size=${LOOK.eq.w}x${LOOK.eq.h},format=rgba,colorchannelmixer=aa=${LOOK.eq.alpha}`;
}
