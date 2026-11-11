// 유튜브 설명란에 그대로 붙여넣을 글을 만든다
//
//   node playlist/scripts/description.mjs > playlist/out/설명란.txt
//
// ⚠️ CC BY 는 출처를 밝혀야 한다. 안 밝히면 라이선스 위반이다.
//    목록.json 의 credit 을 모아 설명란 문구로 뽑는다.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* 집(volume). --vol 002 면 bgm/002/ 를 읽는다. build.mjs 와 같은 규칙. */
const argv = process.argv.slice(2);
const pick = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const VOL = pick('--vol', '').replace(/[^\w-]/g, '');
const BGM = VOL ? join(ROOT, 'bgm', VOL) : join(ROOT, 'bgm');
const INTRO = pick('--intro', '가을 저녁, 창이 큰 어느 로비에서.');

const list = JSON.parse(readFileSync(join(BGM, '목록.json'), 'utf8'));
const tracks = (list.tracks || []).filter((t) => existsSync(join(BGM, t.file)));

/* ⚠️ build.mjs 의 GAP_SEC 과 반드시 같아야 한다.
 * 1집 때 여기가 1.2, build.mjs 가 1.5 여서 곡마다 0.3초씩 밀렸다.
 * 18곡이면 마지막 챕터가 5초 어긋난다. 한쪽을 고치면 다른 쪽도 고칠 것. */
const GAP = 1.5;
const dur = (f) => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', join(BGM, f)],
  { encoding: 'utf8' }).trim());
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const out = [];
out.push(INTRO);
out.push('틀어두고 하던 일을 하세요.');
out.push('');
out.push('━━━━━━━━━━━━━━━━');
out.push('');

let at = 0;
const rows = [];
tracks.forEach((t, i) => {
  const s = dur(t.file);
  rows.push(`${mmss(at)}  ${t.title} — ${t.artist}`);
  at += s + (i < tracks.length - 1 ? GAP : 0);
});
out.push(...rows);
out.push('');
out.push(`전체 ${mmss(at)}`);
out.push('');
out.push('━━━━━━━━━━━━━━━━');
out.push('');

/* 출처 표기. CC BY 는 이걸 안 적으면 위반이다. */
const credits = tracks.filter((t) => t.credit || /CC BY/i.test(t.license || ''));
if (credits.length) {
  out.push('음원 출처 (Creative Commons)');
  out.push('');
  credits.forEach((t) => {
    out.push(`· ${t.title} — ${t.artist}`);
    out.push(`  ${t.license || 'CC BY'}${t.source ? ` · ${t.source}` : ''}`);
  });
  out.push('');
  out.push('모든 음원은 상업적 이용이 허용된 라이선스로만 골랐습니다.');
  out.push('');
  out.push('━━━━━━━━━━━━━━━━');
  out.push('');
}
out.push('minimalbreeze');
out.push('#플레이리스트 #playlist #작업할때듣는음악 #재즈 #lofi #공부할때듣는음악');

console.log(out.join('\n'));
