// 카메라 움직임이 매끄러운지 **실제로 렌더해서** 잰다.
//
//   node tools/움직임-재보기.mjs
//
// 오프라인 테스트에 넣지 않은 이유: 클립 하나에 25초씩 걸린다. 필터를
// 건드렸을 때만 손으로 돌린다. 돈은 들지 않는다.
//
// 보는 것은 "멈춘 프레임 비율"이다. 앞뒤 프레임이 똑같으면 그 순간 화면이
// 정지한 것이고, 그게 쌓이면 보는 사람이 끊긴다고 느낀다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { clipArgs } from '../src/video/ffmpeg.mjs';
import { IMAGE_CAMERA_MOVES } from '../src/scenes/assets.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'));
// 민무늬 그림으로는 끊김이 안 보인다. 무늬가 뚜렷한 것을 쓴다.
const src = path.join(dir, 'src.png');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi',
  '-i', 'testsrc2=size=1920x1080:duration=1', '-frames:v', '1', src]);

function frozenRatio(file) {
  const [w, h] = [160, 90];
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h}`,
    '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const n = w * h;
  const count = Math.floor(raw.length / n);
  let frozen = 0;
  for (let i = 1; i < count; i++) {
    let diff = 0;
    for (let k = 0; k < n; k++) diff += Math.abs(raw[(i - 1) * n + k] - raw[i * n + k]);
    if (diff / n < 0.05) frozen++;
  }
  return { frames: count, frozen, pct: (frozen / Math.max(1, count - 1)) * 100 };
}

let bad = 0;
for (const duration of [6, 14]) {
  for (const camera of IMAGE_CAMERA_MOVES) {
    const out = path.join(dir, `${duration}-${camera.replace(/ /g, '_')}.mp4`);
    execFileSync('ffmpeg', clipArgs({ camera, duration, source: { type: 'image' } },
      { width: 1920, height: 1080, fps: 30, inputPath: src, outputPath: out }),
      { stdio: ['ignore', 'pipe', 'pipe'] });
    const r = frozenRatio(out);
    const ok = r.pct < 1;
    if (!ok) bad++;
    console.log(`${ok ? '✅' : '❌'} ${duration}초 ${camera.padEnd(20)} 멈춤 ${r.frozen}/${r.frames} (${r.pct.toFixed(1)}%)`);
  }
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? `\n${bad}건이 기준(1%)을 넘습니다.` : '\n전부 매끄럽습니다.');
process.exit(bad ? 1 : 0);
