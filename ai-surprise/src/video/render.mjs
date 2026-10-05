// 타임라인 → 실제 영상 파일.
//
// ffmpeg를 실제로 돌리는 유일한 파일이다. 명령 조립은 ffmpeg.mjs가 한다.
//
// 에셋이 없어도 멈추지 않는다. Phase 3이 아직 없으므로, 없는 에셋은
// 자리표시 이미지로 대신 만들어 파이프라인 전체를 돌려볼 수 있게 한다.
// 그래야 "그림이 없어서" 못 고치는 것과 "편집이 틀려서" 못 고치는 것을
// 구분할 수 있다.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { clipArgs, concatArgs, concatList, finishArgs, shortsArgs } from './ffmpeg.mjs';

/** ffmpeg 한 번 실행. 실패하면 stderr를 담아 던진다. */
export function runFfmpeg(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d.toString();
      // 통째로 쌓이면 메모리를 먹는다. 마지막 부분만 남긴다.
      if (err.length > 8000) err = err.slice(-8000);
    });
    proc.on('error', (e) =>
      reject(new Error(`ffmpeg를 실행할 수 없습니다: ${e.message}. 설치되어 있는지 확인하세요.`))
    );
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 실패 (종료 코드 ${code})\n${err.trim().split('\n').slice(-12).join('\n')}`));
    });
  });
}

/** ffmpeg가 있는지 확인한다. 없으면 분명한 안내로 바꿔 던진다. */
export async function requireFfmpeg() {
  try {
    await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-version']);
  } catch {
    const e = new Error(
      'ffmpeg가 없습니다. 영상 편집에 반드시 필요합니다.\n' +
        '  우분투/데비안: sudo apt-get install -y ffmpeg\n' +
        '  맥: brew install ffmpeg'
    );
    e.code = 'FFMPEG_MISSING';
    throw e;
  }
}

/**
 * 자리표시 이미지를 만든다.
 *
 * Phase 3이 아직 없으므로 진짜 그림이 없다. 샷 번호와 장면 정보를 적은
 * 단색 이미지를 대신 만들어 편집 파이프라인을 끝까지 돌려본다.
 *
 * 이 이미지는 보여주기용이 아니라 **검증용**이다. 샷이 순서대로 붙는지,
 * 길이가 맞는지, 카메라 움직임이 거는지, 자막이 제자리에 앉는지를 본다.
 */
export async function makePlaceholder(clip, { width, height, outputPath }) {
  // 장면마다 색을 조금씩 바꿔 경계가 눈에 보이게 한다.
  const hue = (clip.scene_number * 37) % 360;
  const label = `${clip.shot_id}  /  ${clip.section}  /  ${clip.camera}`;

  await runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=${width}x${height}`,
    '-vf',
    [
      `geq=r='${Math.round(20 + (hue / 360) * 40)}':g='${Math.round(20 + ((hue + 120) % 360 / 360) * 40)}':b='${Math.round(40 + ((hue + 240) % 360 / 360) * 50)}'`,
      `drawtext=font='Noto Sans CJK KR':text='${label.replace(/'/g, '')}':fontsize=${Math.round(width / 28)}:fontcolor=white@0.85:x=(w-text_w)/2:y=(h-text_h)/2`,
      `drawtext=font='Noto Sans CJK KR':text='자리표시 — 실제 그림은 Phase 3에서':fontsize=${Math.round(width / 46)}:fontcolor=white@0.45:x=(w-text_w)/2:y=(h-text_h)/2+${Math.round(height / 12)}`,
    ].join(','),
    '-frames:v', '1',
    outputPath,
  ]);
}

/**
 * 타임라인 하나를 렌더한다.
 *
 * @param timeline   plan.mjs가 만든 타임라인
 * @param workDir    작업 폴더 (여기에 조각과 결과물이 생긴다)
 * @param assetDir   실제 에셋 폴더. 없는 파일은 자리표시로 대체한다.
 * @param subtitle   ASS 파일 내용 (문자열). 없으면 자막을 굽지 않는다.
 * @param audioPath  나레이션 파일. 없으면 무음.
 */
export async function renderTimeline(timeline, {
  workDir,
  assetDir = null,
  subtitle = null,
  audioPath = null,
  onProgress = null,
} = {}) {
  await requireFfmpeg();

  const { width, height, fps } = timeline;
  const clipsDir = path.join(workDir, 'clips');
  fs.mkdirSync(clipsDir, { recursive: true });

  const placeholders = [];
  const clipPaths = [];

  for (const [i, original] of (timeline.clips || []).entries()) {
    onProgress?.(`샷 ${i + 1}/${timeline.clips.length} — ${original.shot_id} (${original.camera}, ${original.duration}초)`);

    // 쓸 수 있는 소스를 고른다: 지정된 파일 → 대체 이미지 → 자리표시
    let clip = original;
    let inputPath = assetDir ? path.join(assetDir, path.basename(clip.source.path)) : null;
    let usable = Boolean(inputPath) && fs.existsSync(inputPath);

    if (!usable && clip.source.fallback && assetDir) {
      const alt = path.join(assetDir, path.basename(clip.source.fallback));
      if (fs.existsSync(alt)) {
        inputPath = alt;
        usable = true;
        // 영상이 없어 이미지로 대체됐다 (기획서 9번).
        // 이미지로 바뀌었으니 카메라 움직임을 걸어야 한다.
        clip = { ...clip, source: { ...clip.source, type: 'image' } };
      }
    }

    if (!usable) {
      inputPath = path.join(clipsDir, `${clip.shot_id}-placeholder.png`);
      await makePlaceholder(clip, { width, height, outputPath: inputPath });
      placeholders.push(clip.shot_id);
      clip = { ...clip, source: { ...clip.source, type: 'image' } };
    }

    const outputPath = path.join(clipsDir, `${clip.shot_id}.mp4`);
    await runFfmpeg(clipArgs(clip, { width, height, fps, inputPath, outputPath }));
    clipPaths.push(outputPath);
  }

  if (!clipPaths.length) throw new Error('렌더할 샷이 없습니다.');

  // 이어 붙이기
  onProgress?.(`샷 ${clipPaths.length}개를 이어 붙이는 중...`);
  const listPath = path.join(workDir, 'concat.txt');
  fs.writeFileSync(listPath, concatList(clipPaths), 'utf8');
  const silentPath = path.join(workDir, 'silent.mp4');
  await runFfmpeg(concatArgs({ listPath, outputPath: silentPath }));

  // 자막 굽고 소리 붙이기
  let subtitleName = null;
  if (subtitle) {
    subtitleName = timeline.subtitle || 'subtitle.ass';
    fs.writeFileSync(path.join(workDir, subtitleName), subtitle, 'utf8');
  }

  onProgress?.(subtitle ? '자막을 굽는 중...' : '마무리 중...');
  const finalName = 'final.mp4';
  await runFfmpeg(
    finishArgs({
      videoPath: path.basename(silentPath),
      subtitlePath: subtitleName,
      audioPath: audioPath ? path.relative(workDir, audioPath) : null,
      outputPath: finalName,
      fps,
    }),
    // ass 필터 경로 문제를 피하려고 작업 폴더에서 실행한다.
    { cwd: workDir }
  );

  return {
    path: path.join(workDir, finalName),
    // 자막이 구워지지 않은 중간 영상. 쇼츠는 반드시 이쪽에서 잘라야 한다
    // (완성본에서 자르면 자막이 두 겹이 된다 — ffmpeg.mjs의 shortsArgs 주석).
    silentPath,
    clipCount: clipPaths.length,
    placeholders,
    hasSubtitle: Boolean(subtitle),
    hasAudio: Boolean(audioPath),
  };
}

/**
 * 본편에서 쇼츠 한 편을 잘라낸다.
 *
 * @param sourceVideo  **자막이 구워지지 않은** 영상 (renderTimeline의 silentPath).
 *                     완성본을 넘기면 자막이 두 겹으로 나온다.
 * @param audioPath    나레이션 파일. 같은 시각에서 함께 잘라 붙인다.
 */
export async function renderShort(short, {
  sourceVideo,
  workDir,
  subtitle = null,
  audioPath = null,
  index = 1,
  fps = 30,
}) {
  await requireFfmpeg();
  fs.mkdirSync(workDir, { recursive: true });

  let subtitleName = null;
  if (subtitle) {
    subtitleName = `short-${index}.ass`;
    fs.writeFileSync(path.join(workDir, subtitleName), subtitle, 'utf8');
  }

  const outputName = `short-${index}.mp4`;
  await runFfmpeg(
    shortsArgs({
      videoPath: path.relative(workDir, sourceVideo),
      audioPath: audioPath ? path.relative(workDir, audioPath) : null,
      start: short.start,
      duration: short.duration,
      subtitlePath: subtitleName,
      outputPath: outputName,
      fps,
    }),
    { cwd: workDir }
  );

  return path.join(workDir, outputName);
}

/** 만들어진 영상의 길이·해상도를 읽는다. 결과가 의도대로인지 확인하는 용도다. */
export function probe(videoPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration:stream=width,height,r_frame_rate',
        '-of', 'default=noprint_wrappers=1', videoPath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe 실패 (${code})`));
      const get = (k) => out.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
      resolve({
        duration: Number(get('duration')) || 0,
        width: Number(get('width')) || 0,
        height: Number(get('height')) || 0,
        fps: get('r_frame_rate') || '',
      });
    });
  });
}
