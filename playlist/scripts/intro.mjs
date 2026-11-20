// 첫 곡을 고른다
//
//   node playlist/scripts/intro.mjs --vol 011
//   node playlist/scripts/intro.mjs --vol 011 --apply   앞으로 옮긴다
//
// 왜 필요한가 (2026-11-19 분석)
//   유입의 69.4% 가 추천 동영상이고 검색은 4.3% 다. 추천 알고리즘은
//   시청 지속 시간으로 돌고, 지속 시간을 가르는 것은 처음 30초다.
//   실제로 인트로 유지율이 집마다 2.5배 차이났다 —
//   1집 50% · 6집 38% · 2집 20%.
//
//   그런데 10집까지 첫 곡을 아무도 고르지 않았다. fetch-music.mjs 가
//   인기순으로 받아온 순서가 그대로 1번 트랙이었다. 69% 를 좌우하는
//   자리를 우연에 맡겨 온 셈이다.
//
// 무엇을 재는가
//   조용하게 시작해서 한참 뒤에야 멜로디가 나오는 곡은 "아무 일도
//   안 일어난다" 고 느껴진다. 그래서 두 가지를 잰다.
//
//     존재감  3~30초 구간의 RMS 가 곡 전체 RMS 보다 얼마나 큰가.
//             0dB 근처면 처음부터 제 음량으로 나온다는 뜻이다.
//     도달    곡 전체 RMS 의 -3dB 에 몇 초 만에 닿는가.
//             빠를수록 일찍 자리를 잡는다.
//
//   둘 다 음량 이야기다. "멜로디가 좋은가" 는 못 잰다 — 재는 척하지
//   않는다. 사람이 마지막에 듣고 고르라고 상위 몇 곡을 보여 준다.
//
// ⚠️ 이 도구는 순서만 바꾼다. 곡을 빼거나 더하지 않는다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const VOL = val('--vol', '').replace(/[^\w-]/g, '');
const APPLY = argv.includes('--apply');
if (!VOL) { console.error('\n❌ --vol 을 주세요 (예: --vol 011)\n'); process.exit(1); }

const BGM = join(ROOT, 'bgm', VOL);
const LIST = join(BGM, '목록.json');
const list = JSON.parse(readFileSync(LIST, 'utf8'));
const tracks = (list.tracks || []).filter((t) => existsSync(join(BGM, t.file)));

/* 구간 RMS(dB). 없으면 null. */
function rms(file, ss, t) {
  const a = ['-v', 'error'];
  if (ss != null) a.push('-ss', String(ss));
  a.push('-i', file);
  if (t != null) a.push('-t', String(t));
  a.push('-af', 'astats=metadata=1:reset=0,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f', 'null', '-');
  const r = spawnSync('ffmpeg', a, { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = `${r.stdout || ''}`.match(/RMS_level=(-?[\d.]+)/g);
  if (!m || !m.length) return null;
  return Number(m[m.length - 1].split('=')[1]);
}

/* 전체 RMS 의 -3dB 에 닿는 첫 순간. 2초 창을 1초씩 밀며 본다. */
function reachSec(file, target, limit = 30) {
  for (let s = 0; s < limit; s += 1) {
    const v = rms(file, s, 2);
    if (v != null && v >= target) return s;
  }
  return limit;
}

console.log(`\n${VOL}집 — 첫 곡 후보\n`);
console.log('   존재감 = 3~30초가 곡 전체보다 몇 dB 큰가 (0 에 가까울수록 좋다)');
console.log('   도달   = 전체 음량의 -3dB 에 닿는 데 걸린 초 (짧을수록 좋다)\n');

const scored = tracks.map((t) => {
  const f = join(BGM, t.file);
  const whole = rms(f, null, null);
  const head = rms(f, 3, 27);
  if (whole == null || head == null) return { t, bad: true };
  const presence = head - whole;
  const reach = reachSec(f, whole - 3);
  // 존재감이 주, 도달이 보조. 도달 1초는 0.15dB 쯤으로 친다.
  const score = presence - reach * 0.15;
  return { t, presence, reach, score };
}).filter((x) => !x.bad).sort((a, b) => b.score - a.score);

scored.forEach((x, i) => {
  const mark = i === 0 ? '→' : '  ';
  console.log(`${mark} ${x.presence >= 0 ? '+' : ''}${x.presence.toFixed(1)}dB  ${String(x.reach).padStart(2)}초   ${x.t.title.slice(0, 40)} — ${x.t.artist}`);
});

if (!APPLY) {
  console.log('\n   위 셋을 직접 들어 보고 고르세요. --apply 를 주면 1등을 맨 앞으로 옮깁니다.\n');
  process.exit(0);
}

const first = scored[0].t;
list.tracks = [first, ...list.tracks.filter((t) => t.file !== first.file)];
writeFileSync(LIST, JSON.stringify(list, null, 2), 'utf8');
console.log(`\n✅ 첫 곡: ${first.title} — ${first.artist}\n`);
