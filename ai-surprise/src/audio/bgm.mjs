// 배경음악 고르기와 섞기.
//
// ─────────────────────────────────────────────────────────────
// 왜 유튜브 오디오 보관함인가
// ─────────────────────────────────────────────────────────────
//
// 공짜이고 저작권이 안전하다. 유료 라이브러리(Epidemic Sound 등)가 곡이
// 더 좋지만 월 $10~15이고, 1편도 안 올려본 채널이 낼 돈이 아니다.
//
// 그리고 음악은 이 채널에서 **나레이션 밑에 깔리는 역할**이라 곡 자체가
// 돋보일 필요가 없다. 멜로디가 분명한 곡은 오히려 나레이션과 싸운다.
//
// ─────────────────────────────────────────────────────────────
// 출처 표기를 코드가 기억한다
// ─────────────────────────────────────────────────────────────
//
// 보관함 곡 중 일부는 설명란에 출처를 적어야 한다. 사람이 기억하기로 하면
// 20편쯤에서 반드시 빠뜨린다. 그래서 목록.json에 적어두고, 영상을 만들 때
// **그 편에 실제로 쓴 곡의 표기 문구만** 뽑아준다.

import fs from 'node:fs';
import path from 'node:path';

/**
 * 나레이션 아래로 깔 음량 (데시벨).
 *
 * -22dB면 말소리를 또렷하게 두고 음악은 "있는 줄 모르게" 깔린다.
 * 미스터리 다큐에서 음악이 들리기 시작하면 이미 너무 큰 것이다.
 */
export const BGM_GAIN_DB = -22;

/** 시작과 끝에 소리를 넣고 빼는 시간(초). 뚝 끊기면 싸구려로 들린다. */
export const FADE_SECONDS = 2.5;

/** 목록 파일을 읽는다. 없거나 깨졌으면 빈 목록 — 배경음악 없이 간다. */
export function loadTracks(bgmDir) {
  try {
    const manifest = path.join(bgmDir, '목록.json');
    if (!fs.existsSync(manifest)) return [];
    const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    return (parsed?.tracks || []).filter((t) => {
      if (!t?.file) return false;
      // 목록에 적혀 있어도 파일이 없으면 쓸 수 없다. 커밋을 빠뜨린 경우다.
      return fs.existsSync(path.join(bgmDir, t.file));
    });
  } catch {
    return [];
  }
}

/**
 * 이 편에 쓸 곡을 고른다.
 *
 * 장면마다 다른 곡을 까는 건 하지 않는다. 8분 영상에서 음악이 몇 번씩
 * 바뀌면 산만하고, 바뀌는 지점마다 이음새가 티 난다. **한 편에 한 곡**을
 * 깔고 음량으로만 존재감을 조절한다.
 *
 * 분위기는 장면들의 mood 중 가장 많이 나온 것으로 정한다.
 */
export function pickTrack(scenes, tracks, { seed = 0 } = {}) {
  const usable = tracks || [];
  if (!usable.length) return null;

  const counts = new Map();
  for (const s of scenes || []) {
    const mood = s?.mood;
    if (mood) counts.set(mood, (counts.get(mood) || 0) + 1);
  }
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'mystery';

  const matching = usable.filter((t) => (t.moods || []).includes(dominant));
  const pool = matching.length ? matching : usable;

  // seed 로 고른다. 편 번호를 넣으면 편마다 다른 곡이 돌아가고,
  // 같은 편을 다시 만들면 같은 곡이 나온다.
  return { ...pool[Math.abs(Math.trunc(seed)) % pool.length], mood: dominant };
}

/**
 * 나레이션에 배경음악을 섞는 ffmpeg 인자.
 *
 * 음악을 나레이션 길이에 맞춰 반복(`aloop`)하고, 음량을 낮추고, 앞뒤로
 * 페이드를 건 뒤 섞는다. `duration=first` 로 나레이션 길이에 맞춰 끝낸다 —
 * 음악이 더 길어도 영상이 늘어나지 않는다.
 */
export function mixArgs({ voicePath, bgmPath, outputPath, seconds, gainDb = BGM_GAIN_DB, fade = FADE_SECONDS }) {
  const total = Math.max(1, Number(seconds) || 1);
  const fadeOutStart = Math.max(0, total - fade);

  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', voicePath,
    // -stream_loop -1 로 음악을 무한 반복시킨 뒤 아래에서 길이를 자른다.
    '-stream_loop', '-1', '-i', bgmPath,
    '-filter_complex',
    [
      `[1:a]volume=${gainDb}dB,atrim=0:${total.toFixed(3)},` +
        `afade=t=in:st=0:d=${fade},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fade}[bg]`,
      `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]`,
    ].join(';'),
    '-map', '[out]',
    '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100',
    outputPath,
  ];
}

/**
 * 설명란에 넣을 출처 표기.
 *
 * 표기가 필요 없는 곡이면 빈 문자열. 필요한 곡이면 보관함이 준 문구를
 * 그대로 돌려준다 — 우리가 고쳐 쓰면 표기로 인정이 안 될 수 있다.
 */
export function attributionText(track) {
  const text = String(track?.attribution || '').trim();
  if (!text) return '';
  return ['', '━━━ 음악 ━━━', text].join('\n');
}
