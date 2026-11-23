// 4시간짜리 긴 버전을 만든다.
//
//   node playlist/scripts/long.mjs --name 작업4시간 --vols 006,005,007,008
//
// ── 왜 '반복'이 아니라 '이어 붙이기'인가 ──────────────────────────
// 상위 채널들(good day flow 10시간, Yurimood 10시간, Hickive·plimate)은
// 전부 한 집을 Replay 로 되풀이해 길이를 늘린다. 그런데 그러면 듣는 사람이
// "아까 그 곡인데" 하고 알아챈다. 우리는 집이 이미 여러 개 있으므로, 잘되는
// 집을 맨 앞에 두고 같은 결의 집들을 이어 붙인다 — 4시간 내내 다른 음악이고
// 되풀이가 아예 없다.
//
// ⚠️ 재인코딩하지 않는다. 모든 집이 같은 규격(h264 1920x1080 24fps yuv420p /
//    aac 96kHz 2ch)으로 렌더되므로 스트림 복사로 몇 초 만에 붙는다.
//    규격이 다른 파일이 섞이면 소리가 밀리므로 붙이기 전에 검사한다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const argv = process.argv.slice(2);
const pick = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const fail = (m) => { console.error(`\n❌ ${m}\n`); process.exit(1); };

const NAME = pick('--name', '');
const VOLS = pick('--vols', '').split(',').map((x) => x.trim()).filter(Boolean);
if (!NAME || !VOLS.length) fail('사용법: --name 작업4시간 --vols 006,005,007,008');

const mmss = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`
           : `${m}:${String(x).padStart(2, '0')}`;
};
const probe = (f, k) => execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', k, '-of', 'default=nw=1:nk=1', f], { encoding: 'utf8' }).trim();

// 규격 검사 — 하나라도 다르면 붙이지 않는다
const specs = VOLS.map((v) => {
  const f = join(OUT, `minimalbreeze-${v}.mp4`);
  if (!existsSync(f)) fail(`${v}집 영상이 없습니다: ${f}`);
  const vs = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt',
    '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim();
  const as = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_rate,channels',
    '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim();
  return { vol: v, file: f, key: `${vs}|${as}`, sec: Number(probe(f, 'format=duration')) };
});
const key0 = specs[0].key;
const odd = specs.filter((s) => s.key !== key0);
if (odd.length) {
  fail(`규격이 다른 집이 섞여 있습니다. 이대로 붙이면 소리가 밀립니다.\n`
    + `   ${specs[0].vol}: ${key0}\n`
    + odd.map((s) => `   ${s.vol}: ${s.key}`).join('\n'));
}

console.log('─'.repeat(60));
console.log(`긴 버전 — ${NAME}`);
specs.forEach((s) => console.log(`  ${s.vol}집  ${mmss(s.sec)}`));
const total = specs.reduce((a, s) => a + s.sec, 0);
console.log(`  합계 ${mmss(total)}`);
console.log('─'.repeat(60));

// 챕터 — 각 집의 챕터를 읽어 앞선 길이만큼 밀어 준다
const rows = [];
let at = 0;
for (const s of specs) {
  const ch = join(OUT, `챕터-${s.vol}.txt`);
  if (!existsSync(ch)) fail(`${s.vol}집 챕터 파일이 없습니다: ${ch}`);
  readFileSync(ch, 'utf8').split('\n').filter(Boolean).forEach((line) => {
    const m = line.match(/^(\d+):(\d+)\s+(.*)$/);
    if (!m) return;
    const sec = Number(m[1]) * 60 + Number(m[2]);
    rows.push(`${mmss(at + sec)} ${m[3]}`);
  });
  at += s.sec;
}

const listFile = join(OUT, `.long-${NAME}.txt`);
writeFileSync(listFile, specs.map((s) => `file '${s.file}'`).join('\n'));
const out = join(OUT, `minimalbreeze-${NAME}.mp4`);
console.log('\n🎬 이어 붙입니다 — 재인코딩하지 않으므로 화질 손실이 없습니다');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0',
  '-i', listFile, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' });

const chapFile = join(OUT, `챕터-${NAME}.txt`);
writeFileSync(chapFile, `${rows.join('\n')}\n`);
console.log(`\n✅ ${out.replace(ROOT, 'playlist')}  (${mmss(Number(probe(out, 'format=duration')))})`);
console.log(`✅ ${chapFile.replace(ROOT, 'playlist')}  — 곡 ${rows.length}개`);
