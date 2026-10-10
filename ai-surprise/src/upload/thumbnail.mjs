// 썸네일 만들기.
//
// ─────────────────────────────────────────────────────────────
// 왜 영상에서 프레임을 뽑아 쓰는가
// ─────────────────────────────────────────────────────────────
//
// 썸네일을 따로 생성하면 "영상에 없는 장면"이 되기 쉽다. 유튜브는 그걸
// 오해를 부르는 썸네일로 보고 **영상을 내린다**(수익 감소가 아니라 삭제다).
//
// 영상 안의 프레임을 그대로 쓰면 그 위험이 구조적으로 사라진다. 썸네일에
// 보이는 장면은 반드시 영상 안에 있다 — 거기서 떼어 왔으니까.
//
// 글자는 ffmpeg 로 얹는다. AI 이미지 생성으로 큰 한글을 또렷하게 넣는 것은
// 아직 잘 안 된다. 글자는 확실한 방법으로 넣는 쪽이 낫다.

/** 유튜브 썸네일 규격. */
export const THUMB_WIDTH = 1280;
export const THUMB_HEIGHT = 720;

/** 한글이 들어간 굵은 글꼴. 워크플로가 fonts-noto-cjk 로 깐다. */
export const FONT_FILE = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';

/** 한 줄에 넣을 수 있는 글자 수. 넘으면 글자가 화면 밖으로 나간다. */
export const MAX_LINE_CHARS = 13;

/**
 * 글자가 차지하는 세로 높이.
 *
 * 한글은 받침까지 내려오므로 글자 크기보다 실제로 더 차지한다. 이 값을
 * 작게 잡으면 **아래 줄이 화면 밖으로 잘린다** — 처음에 그렇게 잘렸다.
 */
export const LINE_BOX = 1.3;

/** 글자 띠가 차지하는 화면 아래쪽 비율. */
export const BAND_RATIO = 0.42;

/**
 * 두 줄을 띠 안에 넣는 배치를 계산한다.
 *
 * 순수 함수다 — 숫자만 내놓으므로 테스트로 확인할 수 있다. ffmpeg 를
 * 돌려 보고 눈으로 확인하는 것만으로는 다음에 또 잘린다.
 *
 * 1) 줄 길이로 글자 크기를 정한다 (긴 줄은 작게).
 * 2) 두 줄을 합친 높이가 띠를 넘으면 **둘 다 같은 비율로 줄인다.**
 *    한쪽만 줄이면 두 줄의 크기 차이가 이상해진다.
 */
export function layoutText(line1, line2 = null, {
  width = THUMB_WIDTH,
  height = THUMB_HEIGHT,
  margin = 80,
  max = 128,
  min = 48,
} = {}) {
  const sizeFor = (line) => {
    const chars = Math.max(1, String(line || '').trim().length);
    return Math.max(min, Math.min(max, Math.floor((width - margin * 2) / chars)));
  };

  let s1 = sizeFor(line1);
  // 둘째 줄이 첫 줄보다 크면 눈에 거슬린다. 첫 줄을 넘지 않게 둔다.
  let s2 = line2 ? Math.min(sizeFor(line2), s1) : 0;

  const band = Math.round(height * BAND_RATIO);
  const bandY = height - band;
  const gapOf = (a) => Math.round(a * 0.22);

  // 띠의 92%까지만 쓴다. 가장자리에 붙으면 답답해 보인다.
  const room = band * 0.92;
  let blockH = s1 * LINE_BOX + (line2 ? gapOf(s1) + s2 * LINE_BOX : 0);
  if (blockH > room) {
    const shrink = room / blockH;
    s1 = Math.max(min, Math.floor(s1 * shrink));
    if (line2) s2 = Math.max(min, Math.floor(s2 * shrink));
    blockH = s1 * LINE_BOX + (line2 ? gapOf(s1) + s2 * LINE_BOX : 0);
  }

  const gap = line2 ? gapOf(s1) : 0;
  const top = Math.round(bandY + (band - blockH) / 2);
  return {
    band,
    bandY,
    size1: s1,
    size2: s2,
    // drawtext 의 y 는 글자 상자의 위쪽이다.
    y1: top,
    y2: line2 ? Math.round(top + s1 * LINE_BOX + gap) : null,
    // 아래 줄의 바닥. 화면을 넘으면 잘린 것이다.
    bottom: Math.round(top + blockH),
  };
}

/**
 * 한 장을 만드는 ffmpeg 인자.
 *
 * 글자는 파일로 넘긴다(textfile). 한글과 따옴표·콜론을 명령줄에 직접 넣으면
 * ffmpeg 의 필터 문법과 충돌해 깨진다 — 이스케이프로 버티려 하지 않는다.
 *
 * 줄마다 따로 그려 각각 가운데로 맞춘다. 여러 줄을 한 번에 그리는 기능
 * (text_align)은 ffmpeg 버전을 타므로 쓰지 않는다.
 */
export function thumbnailArgs({
  videoPath,
  seconds = 0,
  line1,
  line2 = null,
  line1File,
  line2File = null,
  outputPath,
  fontFile = FONT_FILE,
}) {
  const esc = (p) => String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const L = layoutText(line1, line2File ? line2 : null);
  const { band, bandY, size1: s1, size2: s2, y1, y2 } = L;

  const filters = [
    `scale=${THUMB_WIDTH}:${THUMB_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${THUMB_WIDTH}:${THUMB_HEIGHT}`,
    // 글자가 읽히게 조금 눌러 준다. 원본을 알아볼 수 없게 만들지는 않는다.
    'eq=contrast=1.08:brightness=-0.05:saturation=0.95',
    // 글자 뒤에 어두운 띠. 밝은 장면에서도 글자가 읽힌다.
    `drawbox=x=0:y=${bandY}:w=${THUMB_WIDTH}:h=${band}:color=black@0.45:t=fill`,
    `drawtext=fontfile='${esc(fontFile)}':textfile='${esc(line1File)}':` +
      `fontsize=${s1}:fontcolor=#ffd54a:borderw=9:bordercolor=black@0.92:` +
      `x=(w-text_w)/2:y=${y1}`,
  ];
  if (line2File) {
    filters.push(
      `drawtext=fontfile='${esc(fontFile)}':textfile='${esc(line2File)}':` +
        `fontsize=${s2}:fontcolor=white:borderw=9:bordercolor=black@0.92:` +
        `x=(w-text_w)/2:y=${y2}`
    );
  }

  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    // -ss 를 -i 앞에 두면 빨리 찾아간다. 정확도는 썸네일에 충분하다.
    '-ss', Number(seconds).toFixed(2),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', filters.join(','),
    '-q:v', '2',
    outputPath,
  ];
}

/**
 * 어느 지점에서 프레임을 뽑을까.
 *
 * 장면 목록에서 **분위기가 센 장면**을 고른다(twist → tension → mystery).
 * 같은 장면만 세 장 뽑으면 셋이 똑같아지므로 서로 떨어진 것으로 고른다.
 *
 * 맨 앞과 맨 끝은 피한다. 보통 어둡거나 비어 있다.
 */
export const MOOD_RANK = { twist: 0, tension: 1, mystery: 2, somber: 3, record: 4, calm: 5 };

export function pickThumbnailMoments(scenes, { count = 3, minGap = 20 } = {}) {
  const list = [];
  let cursor = 0;
  for (const scene of scenes || []) {
    const duration = Number(scene.duration) || 0;
    // 장면 한가운데를 쓴다. 경계는 전환 중이라 흐릿할 수 있다.
    list.push({
      at: cursor + duration / 2,
      mood: scene.mood || 'mystery',
      section: scene.section || '',
      rank: MOOD_RANK[scene.mood] ?? 9,
    });
    cursor += duration;
  }
  const total = cursor;
  const usable = list.filter((x) => x.at > total * 0.08 && x.at < total * 0.92);
  const pool = usable.length ? usable : list;

  const picked = [];
  for (const cand of [...pool].sort((a, b) => a.rank - b.rank || a.at - b.at)) {
    if (picked.length >= count) break;
    if (picked.some((p) => Math.abs(p.at - cand.at) < minGap)) continue;
    picked.push(cand);
  }
  // 떨어뜨릴 수 없을 만큼 짧은 편이면 간격을 포기하고 채운다.
  for (const cand of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(cand)) picked.push(cand);
  }
  return picked.slice(0, count).sort((a, b) => a.at - b.at).map((x) => ({
    at: Math.round(x.at * 100) / 100,
    mood: x.mood,
    section: x.section,
  }));
}
