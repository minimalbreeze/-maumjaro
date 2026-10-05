// ffmpeg 명령 조립.
//
// 이 파일은 명령을 "만들기만" 한다. 실행은 render.mjs가 한다.
// 나눈 이유: 인자 배열을 돌려주는 순수 함수라 ffmpeg를 돌리지 않고 테스트할 수 있다.
// ffmpeg 필터 문법은 오타 하나로 조용히 다른 그림이 나오므로 검증이 중요하다.
//
// ─────────────────────────────────────────────────────────────
// 왜 샷을 하나씩 렌더하고 나중에 이어 붙이는가
// ─────────────────────────────────────────────────────────────
//
// 샷 40~50개를 filter_complex 하나에 넣으면 명령이 수천 자가 되고, 하나가
// 틀리면 전체가 죽는다. 어디가 틀렸는지도 알기 어렵다.
//
// 샷마다 따로 렌더하면:
//  - 어느 샷이 실패했는지 바로 안다
//  - 그 샷만 다시 만들면 된다 (AI 영상이 비싸므로 중요하다)
//  - 중간에 끊겨도 이어서 할 수 있다
//
// 느린 대신 고치기 쉽다. 이 단계에서는 그게 맞는 교환이다.

/**
 * 이미지에 걸 카메라 움직임 (기획서 8번).
 *
 * zoompan은 "입력 프레임 하나"를 확대·이동하며 여러 프레임을 뽑는 필터다.
 * 원본 해상도 그대로 쓰면 확대할 때 계단이 생기므로, 먼저 2배로 키운 뒤
 * zoompan을 걸고 목표 크기로 뽑는다. 이게 흔들림 없는 줌을 얻는 방법이다.
 *
 * d= 는 뽑을 프레임 수다. 길이(초) × fps.
 */
export function cameraFilter(camera, { width, height, fps, duration }) {
  const frames = Math.max(1, Math.round(duration * fps));
  // 2배로 키워 두면 1.0~1.4배 확대해도 원본 해상도 아래로 안 떨어진다.
  const pre = `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2}`;
  const out = `:s=${width}x${height}:fps=${fps}`;

  // 화면 중앙을 기준으로 확대/축소할 때 쓰는 좌표.
  const centerX = `x='iw/2-(iw/zoom/2)'`;
  const centerY = `y='ih/2-(ih/zoom/2)'`;

  // 확대율. 0.0012/프레임이면 30fps·8초에 약 1.29배가 된다.
  // 기획서 10번이 "과장된 줌인"을 요구하지만, 이보다 빠르면 멀미가 난다.
  const step = 0.0012;

  switch (camera) {
    case 'zoom out':
      // 1.3배에서 시작해 1.0으로 줄인다.
      return (
        `${pre},zoompan=z='if(eq(on,0),1.3,max(1.0,zoom-${step}))':d=${frames}:` +
        `${centerX}:${centerY}${out}`
      );

    case 'pan left':
      // 1.15배로 고정하고 오른쪽에서 왼쪽으로 민다.
      return (
        `${pre},zoompan=z=1.15:d=${frames}:` +
        `x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)'${out}`
      );

    case 'pan right':
      return (
        `${pre},zoompan=z=1.15:d=${frames}:` +
        `x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)'${out}`
      );

    case 'slow camera shake':
      // 아주 느린 흔들림. 재연 느낌을 주는 장치다 (기획서 10번).
      // 진폭을 크게 하면 싸구려로 보인다.
      return (
        `${pre},zoompan=z=1.12:d=${frames}:` +
        `x='iw/2-(iw/zoom/2)+sin(on/18)*12':y='ih/2-(ih/zoom/2)+cos(on/23)*9'${out}`
      );

    case 'parallax':
      // 진짜 시차는 레이어가 나뉘어야 가능하다. 한 장짜리 이미지로는
      // 흉내만 낸다 — 느린 가로 이동에 아주 약한 확대를 겹친다.
      return (
        `${pre},zoompan=z='min(1.25,1.05+${step / 2}*on)':d=${frames}:` +
        `x='(iw-iw/zoom)*(0.35+0.3*on/${frames})':y='ih/2-(ih/zoom/2)'${out}`
      );

    case 'zoom in':
    default:
      return (
        `${pre},zoompan=z='min(zoom+${step},1.3)':d=${frames}:` +
        `${centerX}:${centerY}${out}`
      );
  }
}

/**
 * 샷 하나를 영상 조각으로 만드는 ffmpeg 인자.
 *
 * 이미지면 카메라 움직임을 걸고, 영상이면 길이에 맞춰 자르고 크기를 맞춘다.
 */
export function clipArgs(clip, { width, height, fps, inputPath, outputPath }) {
  const duration = Number(clip.duration) || 1;
  const common = [
    '-an', // 소리는 나중에 한 번에 붙인다
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-t', duration.toFixed(3),
  ];

  if (clip.source?.type === 'video') {
    return [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-vf',
      // 영상은 비율이 다를 수 있다. 꽉 채우고 넘치는 부분을 자른다.
      `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps}`,
      ...common,
      outputPath,
    ];
  }

  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1',
    '-i', inputPath,
    '-vf', cameraFilter(clip.camera, { width, height, fps, duration }),
    ...common,
    outputPath,
  ];
}

/**
 * 조각들을 이어 붙이는 인자.
 *
 * concat 분리기(demuxer)를 쓴다. 조각이 전부 같은 코덱·해상도·fps라서
 * 다시 인코딩하지 않아도 된다 — 그래서 빠르다.
 */
export function concatArgs({ listPath, outputPath }) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    outputPath,
  ];
}

/** concat 목록 파일 내용. 경로의 작은따옴표를 이스케이프한다. */
export function concatList(paths) {
  return (paths || []).map((p) => `file '${String(p).replace(/'/g, "'\\''")}'`).join('\n') + '\n';
}

/**
 * 자막을 굽고 소리를 붙여 완성본을 만든다.
 *
 * 자막은 여기서 한 번에 굽는다. 샷마다 구우면 자막이 샷 경계에서 끊긴다.
 */
export function finishArgs({ videoPath, subtitlePath, audioPath, outputPath, fps }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath];

  if (audioPath) args.push('-i', audioPath);

  // ass 필터는 경로의 콜론과 작은따옴표에 민감하다. 작업 폴더를 기준으로
  // 파일 이름만 넘기는 게 가장 안전하다 (render.mjs가 cwd를 맞춰준다).
  if (subtitlePath) {
    args.push('-vf', `ass=${escapeFilterPath(subtitlePath)}`);
  }

  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p');
  if (fps) args.push('-r', String(fps));

  if (audioPath) {
    // 나레이션 크기를 방송 기준으로 맞춘다. 영상마다 소리가 들쭉날쭉하면
    // 시청자가 볼륨을 계속 만져야 한다.
    args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  } else {
    args.push('-an');
  }

  args.push(outputPath);
  return args;
}

/**
 * 본편에서 한 구간을 잘라 쇼츠(9:16)로 만드는 인자.
 *
 * 가로 영상을 세로로 바꾸는 방법은 두 가지다.
 *  1) 가운데를 잘라낸다 → 화면이 꽉 차지만 양옆이 날아간다
 *  2) 위아래에 흐린 배경을 깐다 → 다 보이지만 가운데가 작아진다
 *
 * 1번을 쓴다. 우리 화면은 인물 얼굴을 크게 잡지 않고 공간을 보여주는
 * 구성이라(빈 복도, 멈춘 시계) 가운데를 잘라도 뜻이 상하지 않는다.
 * 그리고 쇼츠는 작은 화면에서 보므로 꽉 찬 쪽이 낫다.
 *
 * ─────────────────────────────────────────────────────────────
 * 반드시 **자막이 구워지지 않은** 영상을 넘겨야 한다
 * ─────────────────────────────────────────────────────────────
 *
 * 처음에 완성본(final.mp4)에서 잘랐더니 자막이 두 겹으로 나왔다. 가로
 * 자막이 세로로 확대·크롭되어 깨진 채로 깔리고, 그 위에 쇼츠 자막이
 * 또 얹혔다. 렌더는 성공했고 오류도 없었다 — 영상을 눈으로 보기 전까지
 * 몰랐다.
 *
 * 그래서 쇼츠는 자막 없는 중간 영상(silent.mp4)에서 자르고, 쇼츠용 자막을
 * 여기서 새로 굽는다. 소리는 나레이션 파일에서 같은 시각을 잘라 붙인다.
 */
export function shortsArgs({
  videoPath,
  audioPath = null,
  start,
  duration,
  subtitlePath,
  outputPath,
  width = 1080,
  height = 1920,
  fps = 30,
}) {
  const filters = [
    // 세로 화면을 채우도록 키운 뒤 가운데를 자른다.
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
  ];
  if (subtitlePath) filters.push(`ass=${escapeFilterPath(subtitlePath)}`);

  const ss = Number(start).toFixed(3);
  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    // -ss 를 -i 앞에 둔다. 다시 인코딩할 때 ffmpeg는 키프레임부터 디코딩한 뒤
    // 앞부분을 버리므로, 앞에 두어도 시각이 어긋나지 않으면서 빠르다.
    '-ss', ss,
    '-i', videoPath,
  ];

  // 소리는 영상과 같은 시각에서 잘라야 입이 맞는다. 입력마다 -ss 를 따로 준다.
  if (audioPath) args.push('-ss', ss, '-i', audioPath);

  args.push(
    '-t', Number(duration).toFixed(3),
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-r', String(fps)
  );

  if (audioPath) {
    args.push('-map', '0:v:0', '-map', '1:a:0');
    // 본편과 같은 기준으로 맞춘다. 쇼츠만 소리가 작으면 바로 넘긴다.
    args.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  } else {
    args.push('-an');
  }

  args.push(outputPath);
  return args;
}

/**
 * 필터 안에 쓰는 경로를 이스케이프한다.
 *
 * ffmpeg 필터 문법에서 `:`는 인자 구분자, `'`는 따옴표, `\`는 이스케이프다.
 * 파일 이름에 이게 들어가면 필터가 깨진다. 한국어 파일명에는 드물지만,
 * 윈도우 경로(C:\...)에서는 반드시 걸린다.
 */
export function escapeFilterPath(p) {
  return String(p).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}
