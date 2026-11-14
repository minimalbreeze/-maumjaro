// 유튜브 썸네일을 만든다
//
//   node playlist/scripts/thumbnail.mjs --vol 002
//
// 왜 필요한가
//   유튜브가 자동으로 뽑는 썸네일은 영상의 한 프레임일 뿐이라 검색 결과에서
//   아무 말도 못 한다. 제목이 좋아도 썸네일에서 걸러진다.
//
// ⚠️ 1집의 얼굴을 그대로 쓴다 (2026-11-12 효성님)
//   "처음에 만들었던 이퀄라이저랑 그 느낌 그대로 하라고, 바꾸지 말어
//    그건 시그니처야" / "001의 느낌이 계속 이어져야지 바꾸지 말어"
//
//   그래서 썸네일은 영상 한 장면과 같은 얼굴로 만든다 — 같은 자막 띠,
//   같은 이퀄라이저(같은 자리·같은 크기·같은 색), 같은 로고. 자리와 크기는
//   look.mjs 에서 가져오므로 영상과 어긋날 수 없다. 곡 제목만 뺀다.
//   썸네일에 한 곡의 이름이 박혀 있으면 그 곡의 영상처럼 보이기 때문이다.
//
// ⚠️ 계절은 그림이 말한다
//   "우리는 계절감을 창문과 로비의 그림으로 표현한다."
//   "최초 우리가 계획한 글씨 이외에는 다른 거 넣지 마라."
//   계절도 장르도 길이도 글자로 쓰지 않는다. 창밖 풍경이 계절을 말하고,
//   로비가 분위기를 말한다. 처음엔 "가을의 끝"을 크게 넣었다가,
//   "late autumn" 으로 바꿨다가, 둘 다 뺐다.
//
// 크기
//   1920x1080 으로 그린 뒤 1280x720 으로 줄인다. 영상과 같은 좌표를 쓰려면
//   같은 크기에서 그려야 한다. 검색 결과에서는 다시 가로 210px 쯤으로
//   줄어들지만, 이퀄라이저 막대와 로고의 윤곽은 그 크기에서도 남는다.

import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOOK, scrimFor, scrimBoxes, eqFilter } from './look.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'art');
const BRAND = join(ROOT, 'brand');
const BGM = join(ROOT, 'bgm');
const OUT = join(ROOT, 'out');
const WORK = join(OUT, 'work');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const VOL = val('--vol', '').replace(/[^\w-]/g, '');
/* 이퀄라이저 막대는 그 순간의 소리 모양이다. 곡이 조용한 대목에 걸리면
 * 막대가 납작해져서 썸네일이 빈약해 보인다. 기본값은 곡이 충분히 울리는
 * 자리로 잡아 두고, 모양이 마음에 안 들면 --at 으로 옮긴다. */
const AT = val('--at', '40');

const W = 1280, H = 720;        // 유튜브 썸네일 크기

function fail(m) { console.error(`\n❌ ${m}\n`); process.exit(1); }
function ff(a) { return execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { encoding: 'utf8' }); }

if (!VOL) fail('--vol 을 주세요 (예: --vol 002)');
mkdirSync(WORK, { recursive: true });

/* 그림 */
const pngs = existsSync(ART)
  ? readdirSync(ART).filter((f) => /\.(png|jpg|jpeg)$/i.test(f) && f.startsWith(`${VOL}-`)).sort()
  : [];
if (!pngs.length) fail(`${VOL}집 그림이 없습니다 — playlist/art/${VOL}-*.png`);
const art = join(ART, pngs[0]);

/* 이퀄라이저에 먹일 소리.
 * 이미 뽑아 둔 영상이 있으면 그 소리를 쓴다 — 영상에 실제로 보이는 모양이
 * 그대로 나온다. 없으면 그 집 첫 곡을 쓴다. */
const mp4 = join(OUT, `minimalbreeze-${VOL}.mp4`);
let sound = existsSync(mp4) ? mp4 : null;
if (!sound) {
  const dir = join(BGM, VOL);
  const list = join(dir, '목록.json');
  if (existsSync(list)) {
    const first = (JSON.parse(execFileSync('cat', [list], { encoding: 'utf8' })).tracks || [])[0];
    if (first && existsSync(join(dir, first.file))) sound = join(dir, first.file);
  }
}
if (!sound) fail(`소리를 찾지 못했습니다 — ${mp4} 또는 playlist/bgm/${VOL}/ 가 필요합니다`);

/* 로고. 자막 띠를 씌우고 나면 그 자리는 늘 어두우므로 밝은 로고를 쓴다 —
 * 영상에서 쓰는 것과 같은 파일이다. */
const lockup = join(BRAND, 'lockup-light.png');
if (!existsSync(lockup)) fail(`로고가 없습니다: ${lockup}`);

console.log(`그림  ${art.replace(ROOT, 'playlist')}`);
console.log(`소리  ${sound.replace(ROOT, 'playlist')}  (${AT}초 지점)`);
const scrim = scrimFor(art);

const { w, h, y } = LOOK;
const out = join(OUT, `썸네일-${VOL}.png`);

ff(['-i', art, '-ss', String(AT), '-i', sound, '-i', lockup,
  '-filter_complex',
    /* showfreqs 의 첫 프레임은 분석 창이 덜 찬 상태라 막대가 납작하다.
     * 1초쯤 흘려보낸 뒤의 프레임을 쓴다. */
    `[1:a]${eqFilter()},trim=start=1,setpts=PTS-STARTPTS[eq];`
    + `[0:v]scale=${w}:${h},${scrimBoxes(scrim).join(',')}[bg];`
    + `[bg][eq]overlay=(W-w)/2:${y.eq}[a];`
    + `[2:v]scale=${LOOK.lockupW}:-1[lk];`
    + `[a][lk]overlay=(W-w)/2:${y.lockup},scale=${W}:${H}[v]`,
  '-map', '[v]', '-frames:v', '1', out]);

const size = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height',
  '-of', 'csv=p=0:s=x', out], { encoding: 'utf8' }).trim();
console.log(`✅ ${out.replace(ROOT, 'playlist')}  (${size})`);
