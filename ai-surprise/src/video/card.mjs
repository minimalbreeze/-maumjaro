// 글자 카드 만들기.
//
// ─────────────────────────────────────────────────────────────
// 왜 AI 그림 대신 ffmpeg 인가
// ─────────────────────────────────────────────────────────────
//
// 스포츠 분석 편은 내용의 절반이 **표와 숫자**다. FA 일정, 보상등급,
// 선수별로 값을 가르는 변수. 이런 화면을 이미지 모델에게 시키면 두 가지가
// 나빠진다. 한글 표를 또렷하게 그리지 못하고, 장당 돈이 든다.
//
// 글자는 확실한 방법으로 넣는 쪽이 낫다. 썸네일에서 이미 쓰는 방법이고,
// 카드 한 장에 **0원**이다.
//
// ─────────────────────────────────────────────────────────────
// 자막 자리를 비운다
// ─────────────────────────────────────────────────────────────
//
// 완성본은 아래 240px(FORMATS.wide.marginV)를 자막이 쓴다. 카드 글자가
// 거기까지 내려오면 자막과 겹쳐서 둘 다 안 읽힌다. 그래서 이 파일은
// **안전 영역 안에서만** 글자를 앉힌다.

/** 카드 규격. 완성본과 같아야 이어 붙일 때 다시 늘이지 않는다. */
export const CARD_WIDTH = 1920;
export const CARD_HEIGHT = 1080;

/** 자막이 쓰는 아래 여백. FORMATS.wide.marginV 와 같은 값이다. */
export const SUBTITLE_RESERVED = 240;

/** 좌우 여백. */
export const CARD_MARGIN = 150;

/** 한글이 받침까지 차지하는 세로 높이 배수. 썸네일과 같은 이유다. */
export const LINE_BOX = 1.35;

/** 바탕색과 글자색. 캐리커처 화면의 어두운 사무실 톤에 맞춘다. */
export const CARD_BG = '#111a24';
export const CARD_ACCENT = '#ffd54a';
export const CARD_TEXT = '#ffffff';
export const CARD_DIM = '#9fb3c8';

/** 한글이 들어간 굵은 글꼴. 썸네일과 같은 파일을 쓴다. */
export const FONT_FILE = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';

/**
 * 카드 글을 뜯어 읽는다.
 *
 * 첫 줄이 제목이고, 나머지가 각각 한 줄이다. 줄 안의 `|` 는 칸을 나눈다.
 *
 *   2027 FA 일정
 *   자격 공시|한국시리즈 뒤
 *   교섭 시작|승인 다음 날
 *
 * 오른쪽 칸은 강조색으로 그린다 — 표에서 눈이 가야 하는 쪽은 값이다.
 */
export function parseCardText(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  // 칸(|)이 하나도 없으면 표가 아니라 **한 문장**이다.
  //
  // 처음에 전부 표로 다뤘더니 강조 문장이 깨졌다 — 첫 줄만 제목 크기로
  // 커지고, 사이에 밑줄이 들어가 두 문장이 끊겨 보였다. 한 호흡으로 읽어야
  // 하는 글을 두 덩어리로 갈라 놓은 셈이다.
  const hasColumns = lines.some((l) => l.includes('|'));
  if (!hasColumns) {
    return { type: 'statement', title: lines[0], rows: [], statement: lines };
  }

  const title = lines[0];
  const rows = lines.slice(1).map((l) => {
    const i = l.indexOf('|');
    if (i < 0) return { left: l, right: '' };
    return { left: l.slice(0, i).trim(), right: l.slice(i + 1).trim() };
  });
  return { type: 'table', title, rows, statement: [] };
}

/**
 * 카드 배치를 계산한다.
 *
 * 순수 함수다. ffmpeg 를 돌려 눈으로 보는 것만으로는 다음에 또 잘린다 —
 * 썸네일에서 두 줄이 화면 밖으로 잘렸던 것과 같은 실수를 막는다.
 *
 * 줄이 많으면 **글자를 줄여서** 안전 영역에 맞춘다. 줄을 버리지 않는다.
 */
export function cardLayout(card, {
  width = CARD_WIDTH,
  height = CARD_HEIGHT,
  reserved = SUBTITLE_RESERVED,
  margin = CARD_MARGIN,
} = {}) {
  const top = Math.round(height * 0.11);
  const bottom = height - reserved - 40;
  const space = bottom - top;

  // 한 문장 카드. 모든 줄이 같은 크기로, 밑줄 없이 간다.
  if (card?.type === 'statement') {
    const lines = card.statement || [];
    let size = 92;
    const gap = 30;
    const needed = () => lines.length * (size * LINE_BOX + gap) - gap;
    let g = 0;
    while (needed() > space && g < 60) { size = Math.round(size * 0.94); g += 1; }
    const h = needed();
    const start = Math.round(top + Math.max(0, (space - h) / 2));
    return {
      type: 'statement',
      size,
      lineYs: lines.map((_, i) => Math.round(start + i * (size * LINE_BOX + gap))),
      leftX: margin,
      overflow: start + h > bottom,
    };
  }

  const rows = card?.rows || [];

  let titleSize = 84;
  let rowSize = 56;
  const titleGap = 56;
  const rowGap = 26;

  const need = () =>
    titleSize * LINE_BOX + (rows.length ? titleGap + rows.length * (rowSize * LINE_BOX + rowGap) - rowGap : 0);

  // 들어갈 때까지 같은 비율로 줄인다. 제목만 줄이면 균형이 깨진다.
  let guard = 0;
  while (need() > space && guard < 60) {
    titleSize = Math.round(titleSize * 0.94);
    rowSize = Math.round(rowSize * 0.94);
    guard += 1;
  }

  const blockH = need();
  const startY = Math.round(top + Math.max(0, (space - blockH) / 2));
  const titleY = startY;
  const rowsTop = Math.round(titleY + titleSize * LINE_BOX + (rows.length ? titleGap : 0));

  const rowYs = rows.map((_, i) => Math.round(rowsTop + i * (rowSize * LINE_BOX + rowGap)));

  return {
    type: 'table',
    titleSize,
    titleY,
    rowSize,
    rowYs,
    leftX: margin,
    // 값 칸은 화면 한가운데쯤에서 **왼쪽 정렬**로 세운다.
    //
    // 처음엔 오른쪽 끝에 붙였는데, 1920px 양끝으로 갈라지니 항목과 값이
    // 너무 멀어 눈이 둘을 잇지 못했다. 표로 안 읽히고 따로 노는 두 열이
    // 됐다. 가운데로 당기니 한 줄로 읽힌다.
    rightX: Math.round(width * 0.46),
    // 제목 밑줄. 제목이 어디서 끝나는지 눈으로 알린다.
    ruleY: Math.round(titleY + titleSize * LINE_BOX + 18),
    ruleW: Math.round(width * 0.14),
    hasRows: rows.length > 0,
    // 안전 영역을 넘겼는지. 넘겼으면 만들기 전에 잡는다.
    overflow: titleY + blockH > bottom,
  };
}

/**
 * drawtext 는 글자 안의 `%` 를 서식 문자로 읽는다.
 *
 * "연봉 200%" 를 그대로 넘기면 `Stray % near ''` 가 나고 **그 줄이 통째로
 * 안 그려진다.** 보상등급 표가 전부 퍼센트라 이 카드가 빈 화면이 될 뻔했다.
 * 실제로 한 장 그려 보고서야 나왔다 — 인자만 봐서는 안 보이는 종류다.
 *
 * 그래서 모든 drawtext 에 `expansion=none` 을 붙인다. 글자를 글자로만 읽는다.
 */
/** ffmpeg 필터 문자열에 안전하게 넣을 수 있게 경로를 다듬는다. */
export function escapePath(p) {
  return String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * 카드 한 장을 만드는 ffmpeg 인자.
 *
 * 글자는 전부 **파일로** 넘긴다(textfile). 한글과 따옴표·콜론을 명령줄에
 * 직접 넣으면 ffmpeg 필터 문법과 충돌해 깨진다.
 *
 * @param files  { title, rows: [{ left, right }] } — 각 값은 글자가 담긴 파일 경로.
 *               빈 칸은 null 로 둔다(그리지 않는다).
 */
export function cardArgs({
  card,
  files,
  outputPath,
  width = CARD_WIDTH,
  height = CARD_HEIGHT,
  fontFile = FONT_FILE,
}) {
  const L = cardLayout(card, { width, height });
  const f = (p) => escapePath(p);
  const filters = [
    // 바탕은 단색을 쓴다. 단색이 글자를 가장 또렷하게 받치고, 편마다
    // 똑같이 나온다.
    `drawbox=x=0:y=0:w=${width}:h=${height}:color=${CARD_BG}:t=fill`,
    // 왼쪽 세로 띠. 카드라는 것을 한눈에 알리는 표시다.
    `drawbox=x=0:y=0:w=14:h=${height}:color=${CARD_ACCENT}:t=fill`,
  ];

  const text = (file, size, color, x, y) =>
    `drawtext=expansion=none:fontfile='${f(fontFile)}':textfile='${f(file)}':` +
    `fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}`;

  if (L.type === 'statement') {
    (files.statement || []).forEach((file, i) => {
      const y = L.lineYs[i];
      if (file && y != null) filters.push(text(file, L.size, CARD_TEXT, L.leftX, y));
    });
    return ffmpegArgs(filters, { width, height, outputPath });
  }

  filters.push(text(files.title, L.titleSize, CARD_TEXT, L.leftX, L.titleY));
  if (L.hasRows) {
    filters.push(`drawbox=x=${L.leftX}:y=${L.ruleY}:w=${L.ruleW}:h=6:color=${CARD_ACCENT}:t=fill`);
  }

  (files.rows || []).forEach((row, i) => {
    const y = L.rowYs[i];
    if (y == null) return;
    if (row.left) {
      filters.push(text(row.left, L.rowSize, row.right ? CARD_DIM : CARD_TEXT, L.leftX, y));
    }
    if (row.right) {
      filters.push(text(row.right, L.rowSize, CARD_ACCENT, L.rightX, y));
    }
  });

  return ffmpegArgs(filters, { width, height, outputPath });
}

function ffmpegArgs(filters, { width, height, outputPath }) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi',
    '-i', `color=c=${CARD_BG}:s=${width}x${height}`,
    '-vf', filters.join(','),
    '-frames:v', '1',
    outputPath,
  ];
}

/**
 * 카드 한 장을 실제 이미지 파일로 그린다.
 *
 * 이미지 모델을 부르지 않는다. **장당 0원이고, 한글이 또렷하다.**
 *
 * @param cardText   카드 글 (첫 줄 제목, 다음 줄부터 `항목|값`)
 * @param outputPath 만들 PNG 경로
 * @param workDir    글자 파일을 둘 임시 폴더
 * @returns { ok, overflow, type, lines } — overflow 면 글이 너무 많다는 뜻이다.
 */
export async function renderCardImage(cardText, { outputPath, workDir, fontFile = FONT_FILE }) {
  const { runFfmpeg } = await import('./render.mjs');
  const fs = await import('node:fs');
  const path = await import('node:path');

  const card = parseCardText(cardText);
  if (!card) throw new Error('카드 글이 비어 있습니다.');

  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const put = (name, value) => {
    const p = path.join(workDir, name);
    fs.writeFileSync(p, value, 'utf8');
    return p;
  };

  const files = { title: null, rows: [], statement: [] };
  if (card.type === 'statement') {
    files.statement = card.statement.map((line, i) => put(`s${i}.txt`, line));
  } else {
    files.title = put('title.txt', card.title);
    files.rows = card.rows.map((r, i) => ({
      left: r.left ? put(`l${i}.txt`, r.left) : null,
      right: r.right ? put(`r${i}.txt`, r.right) : null,
    }));
  }

  const layout = cardLayout(card);
  await runFfmpeg(cardArgs({ card, files, outputPath, fontFile }));

  return {
    ok: true,
    overflow: Boolean(layout.overflow),
    type: card.type,
    lines: card.type === 'statement' ? card.statement.length : card.rows.length,
  };
}
