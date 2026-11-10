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
  accent: '0xffc66b',       // 이퀄라이저
  // 글자 뒤에만 깔리는 그늘. 그림 전체를 어둡게 하면 그림이 흐려진다.
  scrim: 0.30,
  // 서로소 주기. 겹쳐서 전체 패턴이 7*11*13 = 1001초(16.7분)마다 반복한다.
  period: { lp: 7, drift: 11, dust: 13 },
  /* 화면에 올리는 것은 네 층뿐이다.
   *   이퀄라이저 · 곡 제목 · 아티스트 · 로고(마크+채널명 한 덩이)
   * 진행선과 곡 번호는 뺐다 — 유튜브에 자기 재생바가 이미 있고,
   * minimal 이라는 이름을 달고 여섯 층을 쌓을 수는 없다. */
  eq: { w: 520, h: 52, alpha: 0.70 },
  lockupW: 360,
  y: { scrim: 590, scrimH: 350, eq: 626, title: 700, artist: 772, lockup: 862 },
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
/* drawtext 는 콜론과 작은따옴표를 구분자로 쓴다. 곡 제목에 "Gijom' Armide" 처럼
 * 따옴표가 들어가면 필터 문자열이 거기서 끊겨 버린다(실제로 깨졌다).
 * 이스케이프를 겹겹이 쌓는 대신 텍스트를 파일로 빼고 textfile= 로 읽힌다.
 * 그러면 안에 무엇이 들어 있든 상관이 없다. */
let textSeq = 0;
function textFile(str) {
  const f = join(WORK, `t${textSeq++}.txt`);
  writeFileSync(f, String(str));
  return f;
}

/* ── 소재 읽기 ──────────────────────────────────────────── */
/* bgm/ 에 있는데 목록.json 에 없는 파일을 주워서 등록한다.
 *
 * 유튜브 오디오 보관함에서 받으면 파일 이름이 "Track Name.mp3" 이고 태그에
 * 제목·아티스트가 들어 있다. 그걸 읽어 넣으면 손으로 JSON 을 고칠 일이 없다.
 * 태그가 비어 있으면 파일 이름을 제목으로 쓴다.
 */
function tagOf(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries',
      'format_tags=title,artist,album,date', '-of', 'json', file], { encoding: 'utf8' });
    const t = (JSON.parse(out).format || {}).tags || {};
    // 태그 키는 대소문자가 섞여 온다
    const pick = (k) => Object.entries(t).find(([n]) => n.toLowerCase() === k)?.[1] || '';
    return { title: pick('title'), artist: pick('artist'), date: pick('date') };
  } catch { return { title: '', artist: '', date: '' }; }
}

function adoptNewFiles(list) {
  const known = new Set((list.tracks || []).map((t) => t.file));
  const found = readdirSync(BGM)
    .filter((f) => /\.(mp3|m4a|wav|flac|ogg|aac)$/i.test(f) && !known.has(f))
    .sort();
  if (!found.length) return 0;

  console.log(`\n📥 ${BGM.replace(ROOT, 'playlist')} 에서 새 파일 ${found.length}개를 주웠습니다`);
  found.forEach((f) => {
    const tag = tagOf(join(BGM, f));
    const title = tag.title || f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    const artist = tag.artist || '미상';
    list.tracks.push({
      file: f, title, artist,
      recorded: (tag.date || '').slice(0, 4),
      license: '',   // ← 출처를 적어 두세요. 나중에 분쟁이 나면 이게 증거가 됩니다
      credit: '',
      source: '',
    });
    console.log(`   + ${title} — ${artist}`);
  });
  console.log('   목록.json 에 적었습니다. license / source 칸은 직접 채워 주세요.');
  return found.length;
}

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
  list.tracks = list.tracks || [];
  if (adoptNewFiles(list)) writeFileSync(listFile, `${JSON.stringify(list, null, 2)}\n`);
  const tracks = list.tracks.filter((t) => t.file && existsSync(join(BGM, t.file)));
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

/* ── 배경 루프 ─────────────────────────────────────────────
 * 짧은 루프를 한 번만 렌더하고 통 렌더에서 무한 반복시킨다.
 * 움직이는 요소의 주기를 서로소(7·11·13초)로 두어 겹친 패턴이
 * 1001초(16.7분)마다 반복한다 — 그 정도면 눈에 안 걸린다.
 */
function baseLoop(art, seconds) {
  const loop = join(WORK, 'loop_base.mp4');
  const { w, h, fps } = LOOK;
  const p = LOOK.period;

  const src = art
    ? ['-loop', '1', '-t', String(seconds), '-i', art]
    : ['-f', 'lavfi', '-t', String(seconds), '-i', `gradients=s=${w}x${h}:c0=0x1b2430:c1=0x4a3b2e:n=2`];

  const vf = [
    `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    // 빛이 아주 느리게 흔들린다. 그림을 흐리지 않게 폭을 1.2% 로 묶는다.
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

/* ── 한 번에 통으로 렌더한다 ──────────────────────────────────
 *
 * 왜 구간을 나누지 않는가
 *   이퀄라이저는 소리를 봐야 그릴 수 있다. 구간을 따로 만들어 이어 붙이면
 *   그 구간의 소리를 모르므로 막대가 안 움직인다. 그래서 배경 루프와 오디오를
 *   한 번에 물려 통으로 뽑는다.
 *   대신 느리다 — 1시간에 30분쯤. AI 호출은 없으므로 돈은 안 든다.
 *
 * 곡 제목은 enable=between(t,…) 으로 때맞춰 나타났다 사라진다.
 */
function render(loop, audio, tracks, marks, out) {
  const { w, fps, y } = LOOK;
  const lockup = join(BRAND, 'lockup-light.png');
  if (!existsSync(lockup)) fail(`로고가 없습니다: ${lockup}`);

  const texts = [];
  tracks.forEach((t, i) => {
    const [a, b] = marks[i];
    const on = `:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`;
    const sub = `${t.artist}${t.recorded ? `  ·  ${t.recorded}` : ''}`.trim();
    texts.push(`drawtext=fontfile=${FONT.medium}:textfile=${textFile(t.title)}:fontcolor=${LOOK.ink}`
      + `:fontsize=54:x=(w-text_w)/2:y=${y.title}${on}`);
    texts.push(`drawtext=fontfile=${FONT.light}:textfile=${textFile(sub)}`
      + `:fontcolor=${LOOK.ink}@0.60:fontsize=26:x=(w-text_w)/2:y=${y.artist}${on}`);
  });

  const fc = [
    `[1:a]showfreqs=mode=bar:ascale=sqrt:fscale=log:win_size=1024:colors=${LOOK.accent}`
      + `:size=${LOOK.eq.w}x${LOOK.eq.h},format=rgba,colorchannelmixer=aa=${LOOK.eq.alpha}[eq]`,
    `[0:v]drawbox=x=0:y=${y.scrim}:w=${w}:h=${y.scrimH}:color=0x101010@${LOOK.scrim}:t=fill[bg]`,
    `[bg][eq]overlay=(W-w)/2:${y.eq}[a]`,
    `[a]${texts.join(',')}[t]`,
    `[2:v]scale=${LOOK.lockupW}:-1[lk]`,
    `[t][lk]overlay=(W-w)/2:${y.lockup}[v]`,
  ].join(';');

  ff(['-stream_loop', '-1', '-i', loop, '-i', audio, '-i', lockup,
    '-filter_complex', fc, '-map', '[v]', '-map', '1:a', '-shortest',
    '-r', String(fps), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', out]);
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

  console.log('\n🎬 영상 — 이퀄라이저가 소리를 따라가므로 통으로 렌더합니다');
  const loop = baseLoop(art, 30);

  // 곡이 화면에 떠 있을 구간. 곡 사이 빈틈에는 글자를 안 띄운다.
  const marks = [];
  const chapters = [];
  let at = 0;
  tracks.forEach((t, i) => {
    marks.push([at, at + t._sec]);
    chapters.push(`${mmss(at)} ${String(i + 1).padStart(2, '0')}. ${t.title} — ${t.artist}`);
    at += t._sec + (i < tracks.length - 1 ? GAP_SEC : 0);
  });

  const out = join(OUT, 'minimalbreeze.mp4');
  render(loop, audio.file, tracks, marks, out);

  const chapFile = join(OUT, '챕터.txt');
  writeFileSync(chapFile, `${chapters.join('\n')}\n`);

  console.log(`\n✅ ${out.replace(ROOT, 'playlist')}  (${mmss(probe(out))})`);
  console.log(`✅ ${chapFile.replace(ROOT, 'playlist')}  — 유튜브 설명란에 그대로 붙여넣으세요`);
  console.log('\n' + chapters.join('\n'));
}

main();
