// 유튜브 썸네일을 만든다
//
//   node playlist/scripts/thumbnail.mjs --vol 002 \
//     --top "가을의 끝" --sub "창이 큰 로비에서" --tag "작업할 때 듣는 재즈 · 61분"
//
// 왜 필요한가
//   유튜브가 자동으로 뽑는 썸네일은 영상의 한 프레임일 뿐이라 검색 결과에서
//   아무 말도 못 한다. 제목이 좋아도 썸네일에서 걸러진다.
//
// 크기
//   1280x720 으로 뽑는다. 검색 결과에서는 가로 210px 쯤으로 줄어드니까,
//   글자가 그 크기에서도 읽혀야 한다. 큰 줄을 120px 로 잡은 이유다
//   (210px 로 줄면 약 20px — 읽히는 하한).

import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'art');
const BRAND = join(ROOT, 'brand');
const OUT = join(ROOT, 'out');
const WORK = join(OUT, 'work');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const VOL = val('--vol', '').replace(/[^\w-]/g, '');
const TOP = val('--top', '');
const SUB = val('--sub', '');
const TAG = val('--tag', '');

/* Inter 는 한글을 못 그린다. 설치한 Noto Sans CJK 를 쓴다.
 * .ttc 는 여러 글꼴이 든 묶음이라 index 를 줘야 한다. 한글만 쓸 때는
 * JP/KR/SC 어느 쪽을 골라도 한글 글자꼴은 같다. */
const KR = {
  bold: '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  regular: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
};

const W = 1280, H = 720;
const X = 92;                     // 글자 블록 왼쪽 여백
const INK_DARK = '0x14100e';      // 밝은 그림 위
const INK_LIGHT = '0xf2efe9';     // 어두운 그림 위

function fail(m) { console.error(`\n❌ ${m}\n`); process.exit(1); }
function ff(a) { return execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { encoding: 'utf8' }); }

if (!VOL) fail('--vol 을 주세요 (예: --vol 002)');
if (!TOP) fail('--top 을 주세요 (썸네일의 큰 글자)');
for (const f of Object.values(KR)) if (!existsSync(f)) fail(`한글 글꼴이 없습니다: ${f}\n   apt-get install -y fonts-noto-cjk`);

mkdirSync(WORK, { recursive: true });

/* 그림 고르기 */
const pngs = existsSync(ART)
  ? readdirSync(ART).filter((f) => /\.(png|jpg|jpeg)$/i.test(f) && f.startsWith(`${VOL}-`)).sort()
  : [];
if (!pngs.length) fail(`${VOL}집 그림이 없습니다 — playlist/art/${VOL}-*.png`);
const art = join(ART, pngs[0]);

/* 글자가 앉을 자리(왼쪽 절반)가 밝은지 어두운지 재서 글자색을 고른다.
 * build.mjs 가 자막 띠에서 하는 것과 같은 방법이다. */
function brightness(file, crop) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file,
    '-vf', `scale=${W}:${H},crop=${crop},format=gray,signalstats,metadata=print`,
    '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = `${r.stdout || ''}${r.stderr || ''}`.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return m ? Number(m[1]) : null;
}

const avg = brightness(art, `700:420:40:170`);
if (avg === null) fail('그림 밝기를 재지 못했습니다');
const bright = avg > 140;
const ink = bright ? INK_DARK : INK_LIGHT;
const lockup = join(BRAND, bright ? 'logo-mark-dark.svg' : 'logo-mark-light.png');
console.log(`글자 자리 밝기 ${avg.toFixed(0)} → ${bright ? '어두운 글자' : '밝은 글자'}`);

/* 글자는 파일로 넘긴다. 따옴표·쉼표가 filter 문법을 깨뜨리기 때문이다. */
let seq = 0;
const tf = (s) => { const f = join(WORK, `th${seq++}.txt`); writeFileSync(f, String(s)); return f; };

/* 밝은 그림 위의 어두운 글자는 그림자가 필요 없다. 반대는 필요하다. */
const shade = bright
  ? ':shadowcolor=0xf2efe9@0.45:shadowx=0:shadowy=2'
  : ':shadowcolor=0x14100e@0.55:shadowx=0:shadowy=2';

const parts = [
  `scale=${W}:${H}`,
  /* 글자 쪽을 살짝 눌러 대비를 준다. 밝은 그림이면 하얗게, 어두우면 검게.
   * 세기를 낮게 잡은 건 썸네일에서 띠가 보이면 싸구려로 보이기 때문이다. */
  `drawbox=x=0:y=0:w=760:h=${H}:color=${bright ? '0xffffff' : '0x101010'}@0.18:t=fill`,
  `drawtext=fontfile=${KR.bold}:textfile=${tf(TOP)}:fontcolor=${ink}`
    + `:fontsize=120:x=${X}:y=236${shade}`,
];
if (SUB) {
  parts.push(`drawtext=fontfile=${KR.regular}:textfile=${tf(SUB)}:fontcolor=${ink}@0.88`
    + `:fontsize=56:x=${X}:y=388${shade}`);
}
if (TAG) {
  parts.push(`drawbox=x=${X}:y=486:w=96:h=3:color=${ink}@0.7:t=fill`);
  parts.push(`drawtext=fontfile=${KR.regular}:textfile=${tf(TAG)}:fontcolor=${ink}@0.75`
    + `:fontsize=34:x=${X}:y=520${shade}`);
}

const out = join(OUT, `썸네일-${VOL}.png`);
ff(['-i', art, '-i', lockup,
  '-filter_complex',
    `[0:v]${parts.join(',')}[bg];`
    + `[1:v]scale=96:-1[lk];`
    + `[bg][lk]overlay=${X}:600[v]`,
  '-map', '[v]', '-frames:v', '1', out]);

const size = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height',
  '-of', 'csv=p=0:s=x', out], { encoding: 'utf8' }).trim();
console.log(`✅ ${out.replace(ROOT, 'playlist')}  (${size})`);
