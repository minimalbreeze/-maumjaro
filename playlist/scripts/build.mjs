// minimalbreeze 플레이리스트 영상 만들기
//
// 곡은 자르지 않는다. 음량만 맞추고 그대로 이어 붙인다.
// 영상은 짧은 루프를 한 번만 렌더하고 재인코딩 없이 이어 붙인다 —
// 그래서 1시간이든 3시간이든 만드는 시간이 거의 같다(실측: 3시간 60초).
//
//   node playlist/scripts/build.mjs
//   node playlist/scripts/build.mjs --dry          계획만 출력
//   node playlist/scripts/build.mjs --minutes 2    2분짜리로 빨리 확인
//   node playlist/scripts/build.mjs --tone         음원 없이 테스트 톤으로

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'art');
const BRAND = join(ROOT, 'brand');
const BGM = join(ROOT, 'bgm');
const OUT = join(ROOT, 'out');
const WORK = join(OUT, 'work');

const FONT = {
  light: '/usr/share/fonts/opentype/inter/Inter-Light.otf',
  medium: '/usr/share/fonts/opentype/inter/Inter-Medium.otf',
};

/* 화면에 들어가는 값들. 여기만 고치면 된다. */
const LOOK = {
  w: 1920, h: 1080, fps: 24,
  ink: '0xf2efe9',          // 글자
  accent: '0xffc66b',       // 강조 (진행선·바늘)
  logo: 'm i n i m a l b r e e z e',
  // 글자 뒤에만 깔리는 그늘. 그림 전체를 어둡게 하면 그림이 흐려진다.
  scrim: 0.34,
  /* 진행선이 매 프레임 자라게 할 것인가.
   *
   * true  로 하면 구간 전체를 다시 인코딩해야 한다. 글자는 곡 안에서 안 바뀌는데
   *       진행선만 시간에 따라 달라지기 때문이다. 1시간에 15분 넘게 걸린다.
   * false 면 짧은 루프에 그 곡의 글자를 한 번만 구워 넣고 재인코딩 없이 늘린다.
   *       진행선은 곡이 바뀔 때마다 한 칸씩 간다. 1시간이 2분 남짓이면 끝난다.
   *
   * BGM 영상에서 진행선이 매끄럽게 자라는 것을 볼 사람은 거의 없고,
   * 유튜브에 자기 재생바가 이미 있다. 그래서 기본값은 false 다. */
  smoothProgress: false,
  // 서로소 주기. 겹쳐서 전체 패턴이 7*11*13 = 1001초(16.7분)마다 반복한다.
  period: { lp: 7, drift: 11, dust: 13 },
};

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const DRY = has('--dry');
const TONE = has('--tone');
const LIMIT_MIN = Number(val('--minutes', '0')) || 0;

function fail(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1); }
function ff(a) { return execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { encoding: 'utf8' }); }
function probe(file) {
  return Number(execFileSync('ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    { encoding: 'utf8' }).trim());
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// drawtext 는 콜론과 작은따옴표를 구분자로 쓴다. 곡 제목에 들어가면 필터가 깨진다.
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");

/* ── 소재 읽기 ──────────────────────────────────────────── */
function loadTracks() {
  if (TONE) {
    // 음원 없이 파이프라인만 확인할 때. 길이가 제각각이어야 의미가 있다.
    return [
      { title: 'Test Tone A', artist: 'minimalbreeze', recorded: '—', _tone: 220, _sec: 40 },
      { title: 'Test Tone B', artist: 'minimalbreeze', recorded: '—', _tone: 294, _sec: 55 },
      { title: 'Test Tone C', artist: 'minimalbreeze', recorded: '—', _tone: 330, _sec: 35 },
    ];
  }
  const listFile = join(BGM, '목록.json');
  if (!existsSync(listFile)) fail(`${listFile} 가 없습니다.`);
  const list = JSON.parse(readFileSync(listFile, 'utf8'));
  const tracks = (list.tracks || []).filter((t) => t.file && existsSync(join(BGM, t.file)));
  if (!tracks.length) {
    fail('쓸 수 있는 음원이 없습니다.\n'
      + `   ${BGM} 에 파일을 넣고 목록.json 에 적어 주세요.\n`
      + '   음원 없이 파이프라인만 보려면: node playlist/scripts/build.mjs --tone');
  }
  return tracks;
}

function pickArt() {
  if (!existsSync(ART)) return null;
  const png = readdirSync(ART).filter((f) => /\.(png|jpg|jpeg)$/i.test(f)).sort();
  return png.length ? join(ART, png[0]) : null;
}

/* ── 오디오 ─────────────────────────────────────────────────
 * 곡을 자르지 않는다. 음량만 맞춘다(길이 불변 — 실측 20.000초 → 20.000초).
 * 곡 사이에는 크래클만 넣어 LP 한 면처럼 잇는다.
 */
const GAP_SEC = 1.2;   // 곡 사이. 0 으로 두면 뚝 끊겨 LP 느낌이 깨진다

function buildAudio(tracks) {
  const parts = [];
  tracks.forEach((t, i) => {
    const norm = join(WORK, `a${i}.wav`);
    if (t._tone) {
      ff(['-f', 'lavfi', '-i', `sine=f=${t._tone}:d=${t._sec}`, '-c:a', 'pcm_s16le', norm]);
    } else {
      // loudnorm 은 재생 레벨만 맞춘다. 연주도 길이도 그대로다.
      ff(['-i', join(BGM, t.file), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', norm]);
    }
    t._sec = probe(norm);
    parts.push(norm);
    if (i < tracks.length - 1) {
      const gap = join(WORK, `g${i}.wav`);
      ff(['-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo:d=${GAP_SEC}`, '-c:a', 'pcm_s16le', gap]);
      parts.push(gap);
    }
  });

  const listFile = join(WORK, 'audio.txt');
  writeFileSync(listFile, parts.map((p) => `file '${p}'`).join('\n'));
  const joined = join(WORK, 'joined.wav');
  ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', joined]);

  // 전체에 아주 얇은 크래클. 원본 78 잡음보다 한참 아래로 둔다 —
  // 원본이 이미 지직거리므로 더 얹으면 LP 느낌이 아니라 지저분해진다.
  const total = probe(joined);
  const final = join(WORK, 'audio.m4a');
  ff(['-i', joined,
    '-f', 'lavfi', '-t', String(total), '-i', 'anoisesrc=c=violet:a=0.010:r=44100',
    '-filter_complex', '[1:a]highpass=f=2000,alimiter=limit=0.07,aformat=channel_layouts=stereo[crk];'
      + '[0:a][crk]amix=inputs=2:weights=1 0.85:normalize=0[a]',
    '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', final]);
  return { file: final, total: probe(final) };
}

/* 글자 뒤에만 까는 그늘.
 * 그림 전체에 어두운 상자를 덮으면 그림이 통째로 흐려진다. 글자가 앉는 띠에만,
 * 위아래로 서서히 사라지게 깔아서 경계가 안 보이게 한다. */
function makeScrim(h0, h1) {
  const file = join(WORK, 'scrim.png');
  const { w } = LOOK;
  const H = h1 - h0;
  const rows = [];
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    // 가운데가 가장 진하고 양끝이 0 이 되는 곡선
    const a = Math.round(255 * LOOK.scrim * Math.sin(Math.PI * t) ** 1.4);
    rows.push(Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 4).fill(0).map((_, i) => (i % 4 === 3 ? a : 0x10))]));
  }
  const raw = Buffer.concat(rows);
  const zlib = require('node:zlib');
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => {
    const t = Buffer.from(type); const body = Buffer.concat([t, data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
  return file;
}

/* ── 영상 ─────────────────────────────────────────────────── */
function baseLoop(art, seconds) {
  const loop = join(WORK, 'loop_base.mp4');
  const { w, h, fps } = LOOK;
  const p = LOOK.period;

  // 배경: 그림이 있으면 쓰고, 없으면 임시 그라디언트.
  const src = art
    ? ['-loop', '1', '-t', String(seconds), '-i', art]
    : ['-f', 'lavfi', '-t', String(seconds), '-i', `gradients=s=${w}x${h}:c0=0x1b2430:c1=0x4a3b2e:n=2`];

  // 빛이 아주 느리게 흔들리고(11초), 먼지 두 점이 떠다닌다(7·13초).
  // 주기가 서로소라 겹친 패턴은 1001초마다 반복한다.
  const vf = [
    `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    `eq=eval=frame:brightness='0.012*sin(2*PI*t/${p.drift})'`,
    `drawbox=x='${Math.round(w * 0.30)}+140*cos(2*PI*t/${p.lp})':y='${Math.round(h * 0.42)}+70*sin(2*PI*t/${p.lp})':w=5:h=5:color=${LOOK.ink}@0.16:t=fill`,
    `drawbox=x='${Math.round(w * 0.68)}+200*cos(2*PI*t/${p.dust})':y='${Math.round(h * 0.34)}+90*sin(2*PI*t/${p.dust})':w=4:h=4:color=${LOOK.accent}@0.18:t=fill`,
    'format=yuv420p',
  ].join(',');

  ff([...src, '-vf', vf, '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    // 루프 전체에 키프레임 하나. 이어붙이려면 맨 앞에만 있으면 된다.
    '-g', String(Math.round(seconds * fps)), '-keyint_min', String(Math.round(seconds * fps)),
    '-sc_threshold', '0', '-an', loop]);
  return loop;
}

/* 곡 하나짜리 구간. 루프를 필요한 만큼 늘리고 그 곡의 글자를 얹는다. */
function trackSegment(loop, loopSec, t, idx, nTracks, startSec, totalSec, seconds, scrim, logo) {
  const { w, h } = LOOK;
  const titled = join(WORK, `v${idx}_t.mp4`);
  const cy = Math.round(h * 0.56);

  const draw = [
    // 곡 제목
    `drawtext=fontfile=${FONT.medium}:text='${esc(t.title)}':fontcolor=${LOOK.ink}:fontsize=56:x=(w-text_w)/2:y=${cy}`,
    // 아티스트 · 녹음 연도
    `drawtext=fontfile=${FONT.light}:text='${esc(`${t.artist}  ·  ${t.recorded}`)}':fontcolor=${LOOK.ink}@0.62:fontsize=27:x=(w-text_w)/2:y=${cy + 78}`,
    // 진행선 — 전체 중 어디쯤인지. 구간 안에서 계속 차오른다.
    `drawbox=x=${Math.round(w / 2 - 300)}:y=${cy + 148}:w=600:h=1:color=${LOOK.ink}@0.22:t=fill`,
    LOOK.smoothProgress
      ? `drawbox=x=${Math.round(w / 2 - 300)}:y=${cy + 147}:w='600*(${startSec}+t)/${totalSec}':h=3:color=${LOOK.accent}@0.85:t=fill`
      : `drawbox=x=${Math.round(w / 2 - 300)}:y=${cy + 147}:w=${Math.max(2, Math.round(600 * (startSec + seconds / 2) / totalSec))}:h=3:color=${LOOK.accent}@0.85:t=fill`,
    // 몇 번째 곡인지
    `drawtext=fontfile=${FONT.light}:text='${String(idx + 1).padStart(2, '0')} / ${String(nTracks).padStart(2, '0')}':fontcolor=${LOOK.ink}@0.40:fontsize=20:x=(w-text_w)/2:y=${cy + 192}`,
    // 워드마크 (마크는 아래에서 그림으로 얹는다)
    `drawtext=fontfile=${FONT.light}:text='${esc(LOOK.logo)}':fontcolor=${LOOK.ink}@0.72:fontsize=23:x=(w-text_w)/2:y=${cy + 300}`,
  ].join(',');

  // 그늘 → 글자 → 로고 마크 순으로 쌓는다.
  // 그늘을 글자 아래에만 깔아야 그림이 안 흐려진다.
  const SCRIM_TOP = Math.round(h * 0.40);
  const LOGO_W = 150;
  const fc = `[0:v][1:v]overlay=0:${SCRIM_TOP}[s];`
    + `[s]${draw}[d];`
    + `[2:v]scale=${LOGO_W}:-1[lg];`
    + `[d][lg]overlay=(W-w)/2:${cy + 218}[v]`;

  if (LOOK.smoothProgress) {
    // 느린 길: 구간 전체를 다시 인코딩한다(진행선이 매 프레임 자란다).
    ff(['-stream_loop', String(Math.ceil(seconds / loopSec)), '-i', loop,
      '-i', scrim, '-i', logo, '-t', String(seconds),
      '-filter_complex', fc, '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-an', titled]);
    return titled;
  }

  // 빠른 길: 루프 한 바퀴에만 글자를 굽고, 늘리는 건 재인코딩 없이 한다.
  const stamped = join(WORK, `v${idx}_s.mp4`);
  ff(['-i', loop, '-i', scrim, '-i', logo, '-t', String(loopSec),
    '-filter_complex', fc, '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-g', String(Math.round(loopSec * LOOK.fps)), '-keyint_min', String(Math.round(loopSec * LOOK.fps)),
    '-sc_threshold', '0', '-an', stamped]);
  ff(['-stream_loop', String(Math.ceil(seconds / loopSec)), '-i', stamped,
    '-t', String(seconds), '-c', 'copy', titled]);
  return titled;
}

/* ── 메인 ───────────────────────────────────────────────── */
function main() {
  const tracks = loadTracks();
  const art = pickArt();

  console.log('─'.repeat(56));
  console.log(`minimalbreeze — 곡 ${tracks.length}개${TONE ? ' (테스트 톤)' : ''}`);
  console.log(`배경 그림: ${art ? art.replace(ROOT, 'playlist') : '없음 — 임시 그라디언트로 갑니다'}`);
  if (!art) {
    console.log('   → playlist/art/ 에 PNG 를 넣으면 그걸 씁니다 (가로 1920px 이상).');
  }
  console.log('─'.repeat(56));

  if (DRY) {
    tracks.forEach((t, i) => console.log(`  ${String(i + 1).padStart(2, '0')}. ${t.title} — ${t.artist} (${t.recorded || '?'})`));
    console.log('\n🧪 --dry 라 렌더하지 않았습니다.');
    return;
  }

  mkdirSync(WORK, { recursive: true });

  console.log('\n🎵 오디오 — 곡은 자르지 않고 음량만 맞춥니다');
  const audio = buildAudio(tracks);
  console.log(`   합계 ${mmss(audio.total)}`);

  console.log('\n🎬 영상 — 루프 한 번만 렌더하고 이어 붙입니다');
  const loopSec = 30;
  const loop = baseLoop(art, loopSec);

  const scrim = makeScrim(Math.round(LOOK.h * 0.40), Math.round(LOOK.h * 0.96));
  const logo = join(BRAND, 'logo-mark-light.png');
  if (!existsSync(logo)) fail(`로고가 없습니다: ${logo}`);

  const segs = [];
  const chapters = [];
  let at = 0;
  tracks.forEach((t, i) => {
    const seconds = LIMIT_MIN ? Math.min(t._sec, (LIMIT_MIN * 60) / tracks.length) : t._sec + (i < tracks.length - 1 ? GAP_SEC : 0);
    chapters.push(`${mmss(at)} ${String(i + 1).padStart(2, '0')}. ${t.title} — ${t.artist}`);
    segs.push(trackSegment(loop, loopSec, t, i, tracks.length, at, audio.total, seconds, scrim, logo));
    at += seconds;
    process.stdout.write(`   ${i + 1}/${tracks.length}\r`);
  });

  const vlist = join(WORK, 'video.txt');
  writeFileSync(vlist, segs.map((p) => `file '${p}'`).join('\n'));
  const videoOnly = join(WORK, 'video.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', vlist, '-c', 'copy', videoOnly]);

  const out = join(OUT, 'minimalbreeze.mp4');
  ff(['-i', videoOnly, '-i', audio.file, '-c', 'copy', '-shortest', '-movflags', '+faststart', out]);

  const chapFile = join(OUT, '챕터.txt');
  writeFileSync(chapFile, `${chapters.join('\n')}\n`);

  console.log(`\n\n✅ ${out.replace(ROOT, 'playlist')}  (${mmss(probe(out))})`);
  console.log(`✅ ${chapFile.replace(ROOT, 'playlist')}  — 유튜브 설명란에 그대로 붙여넣으세요`);
  console.log('\n' + chapters.join('\n'));
}

main();
