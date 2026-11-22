// 첫 곡으로 쓰면 안 되는 곡을 거른다
//
//   node playlist/scripts/intro.mjs --vol 011
//
// 왜 필요한가 (2026-11-19 분석)
//   유입의 69.4% 가 추천 동영상이고 검색은 4.3% 다. 추천 알고리즘은
//   시청 지속 시간으로 돌고, 지속 시간을 가르는 것은 처음 30초다.
//   인트로 유지율이 집마다 2.5배 차이났다 — 1집 50% · 6집 38% · 2집 20%.
//   그런데 10집까지 첫 곡은 fetch 순서가 그대로였다. 아무도 안 골랐다.
//
// ⚠️ 이 도구는 고르지 못한다. 거르기만 한다.
//   처음에는 점수를 매겨 1등을 뽑게 만들었는데, 11집 16곡에 돌려 보니
//   15곡이 전부 "+0.1dB · 0초" 로 똑같이 나왔다. 음악은 대개 음량이
//   고른 데다 27초 구간과 곡 전체를 비교하면 차이가 날 수가 없다.
//   눈금이 너무 굵어서 순위가 안 나온다.
//
//   딱 하나 갈린 것이 Amazing Grace(-2.6dB · 12초) 였다. 12초 동안
//   조용하다가 들어오는 곡이다. 그러니까 이 도구가 실제로 하는 일은
//   **서서히 차오르는 곡을 찾아내는 것** 하나다. 그것만 한다고 적는다.
//   "어느 곡이 더 좋은 시작인가" 는 사람이 듣고 정한다.
//
// 무엇을 재는가
//   존재감  3~30초 구간의 RMS 가 곡 전체 RMS 보다 몇 dB 큰가
//   도달    곡 전체 RMS 의 -3dB 에 몇 초 만에 닿는가
//   둘 다 음량 이야기다. 멜로디가 좋은지는 못 잰다.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const VOL = val('--vol', '').replace(/[^\w-]/g, '');
if (!VOL) { console.error('\n❌ --vol 을 주세요 (예: --vol 011)\n'); process.exit(1); }

/* 이보다 조용하게 시작하거나 이보다 늦게 자리를 잡으면 첫 곡으로 쓰지 않는다.
 * 11집 실측에서 멀쩡한 곡은 전부 0dB · 0초 근처였고, 걸린 것은 -2.6dB · 12초
 * 하나였다. 그 사이에 선을 긋는다. */
const MIN_DB = -1.0;
const MAX_SEC = 4;

const BGM = join(ROOT, 'bgm', VOL);
const list = JSON.parse(readFileSync(join(BGM, '목록.json'), 'utf8'));
const tracks = (list.tracks || []).filter((t) => existsSync(join(BGM, t.file)));

function rms(file, ss, t) {
  const a = ['-v', 'error'];
  if (ss != null) a.push('-ss', String(ss));
  a.push('-i', file);
  if (t != null) a.push('-t', String(t));
  a.push('-af', 'astats=metadata=1:reset=0,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f', 'null', '-');
  const r = spawnSync('ffmpeg', a, { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = `${r.stdout || ''}`.match(/RMS_level=(-?[\d.]+)/g);
  return m && m.length ? Number(m[m.length - 1].split('=')[1]) : null;
}

function reachSec(file, target, limit = 30) {
  for (let s = 0; s < limit; s += 1) {
    const v = rms(file, s, 2);
    if (v != null && v >= target) return s;
  }
  return limit;
}

const rows = tracks.map((t) => {
  const f = join(BGM, t.file);
  const whole = rms(f, null, null);
  const head = rms(f, 3, 27);
  if (whole == null || head == null) return null;
  return { t, presence: head - whole, reach: reachSec(f, whole - 3) };
}).filter(Boolean);

const bad = rows.filter((x) => x.presence < MIN_DB || x.reach > MAX_SEC);
const ok = rows.filter((x) => !bad.includes(x));

console.log(`\n${VOL}집 — 첫 곡 거르개\n`);
if (bad.length) {
  console.log('❌ 첫 곡으로 쓰지 마세요 — 서서히 차오릅니다\n');
  bad.forEach((x) => console.log(
    `   ${x.presence.toFixed(1)}dB · ${x.reach}초   ${x.t.title.slice(0, 44)} — ${x.t.artist}`));
} else {
  console.log('❌ 서서히 차오르는 곡은 없습니다.');
}
console.log(`\n✅ 처음부터 제 음량으로 나오는 곡 ${ok.length}개`);
console.log('   여기서는 음량으로 더 가릴 수 없습니다. 들어 보고 고르세요.');
console.log('   캐럴 집이면 아는 멜로디가 바로 나오는 곡이 좋습니다.\n');
ok.forEach((x) => console.log(`   ${x.t.title.slice(0, 48)} — ${x.t.artist}`));
console.log('');
