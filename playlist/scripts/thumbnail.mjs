// 유튜브 썸네일을 만든다
//
//   node playlist/scripts/thumbnail.mjs --vol 002
//
// 왜 필요한가
//   유튜브가 자동으로 뽑는 썸네일은 영상의 한 프레임일 뿐이라 검색 결과에서
//   아무 말도 못 한다. 제목이 좋아도 썸네일에서 걸러진다.
//
// ⚠️ 썸네일에는 로고만 올린다 (2026-11-12 효성님)
//   "우리는 계절감을 창문과 로비의 그림으로 표현한다."
//   "최초 우리가 계획한 글씨 이외에는 다른 거 넣지 마라.
//    나머지는 그림으로 표현한다. 로고 아이덴티티가 명확해야 한다."
//
//   그래서 계절도, 장르도, 길이도 글자로 쓰지 않는다. 창밖 풍경이 계절을
//   말하고, 로비가 분위기를 말한다. 글자를 얹으면 그림이 할 말을 뺏는다.
//   처음엔 "가을의 끝"을 크게 넣었다가, "late autumn" 으로 바꿨다가,
//   둘 다 뺐다. 남는 것은 minimalbreeze 로고 하나뿐이다.
//
//   영상 안에서 쓰는 글자(곡 제목·아티스트·로고)가 처음 정한 전부다.
//   여기에 더하지 않는다.
//
// ⚠️ 한글을 쓰지 않는다
//   브랜드가 영문 레터스페이싱(minimalbreeze)이라 굵은 한글 고딕과 따로
//   논다. 처음에 한글로 크게 넣어 봤다가 뺐다. 영상 안 곡 제목도 Inter 다.
//
// 크기
//   1280x720 으로 뽑는다. 검색 결과에서는 가로 210px 쯤으로 줄어든다.
//   로고를 가로 720px(화면의 56%)로 크게 쓴다. 그 크기로 줄어도 동그라미와
//   양옆 선의 윤곽이 남아서 어느 채널인지 알아볼 수 있다.

import { existsSync, readdirSync, mkdirSync } from 'node:fs';
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

const W = 1280, H = 720;
const LOCKUP_W = 720;
const X = Math.round((W - LOCKUP_W) / 2);
const INK_DARK = '0x14100e';                // 밝은 그림 위
const INK_LIGHT = '0xf2efe9';               // 어두운 그림 위

function fail(m) { console.error(`\n❌ ${m}\n`); process.exit(1); }
function ff(a) { return execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { encoding: 'utf8' }); }

if (!VOL) fail('--vol 을 주세요 (예: --vol 002)');

mkdirSync(WORK, { recursive: true });

const pngs = existsSync(ART)
  ? readdirSync(ART).filter((f) => /\.(png|jpg|jpeg)$/i.test(f) && f.startsWith(`${VOL}-`)).sort()
  : [];
if (!pngs.length) fail(`${VOL}집 그림이 없습니다 — playlist/art/${VOL}-*.png`);
const art = join(ART, pngs[0]);

/* 로고가 앉을 자리가 밝은지 어두운지 재서 밝은 로고와 어두운 로고 중 고른다.
 * build.mjs 가 자막 띠에서 하는 것과 같은 방법이다. */
function brightness(file, crop) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file,
    '-vf', `scale=${W}:${H},crop=${crop},format=gray,signalstats,metadata=print`,
    '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = `${r.stdout || ''}${r.stderr || ''}`.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return m ? Number(m[1]) : null;
}

const avg = brightness(art, `${LOCKUP_W}:200:${X}:${Math.round(H / 2) - 100}`);
if (avg === null) fail('그림 밝기를 재지 못했습니다');
const bright = avg > 140;
const ink = bright ? INK_DARK : INK_LIGHT;
const lockup = join(BRAND, bright ? 'lockup-dark.svg' : 'lockup-light.png');
if (!existsSync(lockup)) fail(`로고가 없습니다: ${lockup}`);
console.log(`로고 자리 밝기 ${avg.toFixed(0)} → ${bright ? '어두운 로고' : '밝은 로고'}`);

/* 그림 전체를 아주 살짝 눌러 로고가 뜨게 한다. 띠는 만들지 않는다 —
 * 썸네일에 경계선이 보이면 싸구려로 보인다. */
const parts = [
  `scale=${W}:${H}`,
  `drawbox=x=0:y=0:w=${W}:h=${H}:color=${bright ? '0xffffff' : '0x101010'}@0.14:t=fill`,
];

const out = join(OUT, `썸네일-${VOL}.png`);
ff(['-i', art, '-i', lockup,
  '-filter_complex',
    `[0:v]${parts.join(',')}[bg];`
    + `[1:v]scale=${LOCKUP_W}:-1[lk];`
    + `[bg][lk]overlay=(W-w)/2:(H-h)/2[v]`,
  '-map', '[v]', '-frames:v', '1', out]);

const size = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height',
  '-of', 'csv=p=0:s=x', out], { encoding: 'utf8' }).trim();
console.log(`✅ ${out.replace(ROOT, 'playlist')}  (${size})`);
