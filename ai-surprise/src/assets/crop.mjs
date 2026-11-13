// 사진 가장자리를 잘라 낸다 — 워터마크를 **모델에게 보여주지 않는다.**
//
// ─────────────────────────────────────────────────────────────
// 왜 자르나
// ─────────────────────────────────────────────────────────────
//
// 2026-11-09 운영자: "워터마크는 잘라내라. 100% 나오면 안 된다."
//
// 프롬프트로 두 번 해 봤고 두 번 다 더 나빠졌다(repaint.mjs 의
// REPAINT_CLEAN 주석). 그림 모델은 **프롬프트에 나온 낱말을 그린다** —
// "하지 마라"로 적어도 그렇다.
//
// 그래서 방향을 바꾼다. **모델이 못 보게 한다.** 아예 안 보이면
// 그릴 수가 없다. 이건 부탁이 아니라 사실이다.
//
// ─────────────────────────────────────────────────────────────
// 내가 왜 직접 못 하고 러너에서 하나
// ─────────────────────────────────────────────────────────────
//
// 내 프록시가 뉴스 사이트를 막는다(403). 그래서 나는 사진을 열 수도,
// 자를 수도 없다. 그런데 **GitHub Actions 러너는 안 막혀 있다** —
// 지금도 Replicate 에서 만든 그림을 거기서 받아 온다.
//
// 그래서 자르는 일을 러너에서 한다. 받아서 → 자르고 → data URI 로
// Replicate 에 보낸다. 사진 파일은 저장소에 남지 않는다(공개
// 저장소라 그건 퍼블리싱이다).
//
// ─────────────────────────────────────────────────────────────
// ⚠️ 무엇을 보장하고 무엇을 못 하나
// ─────────────────────────────────────────────────────────────
//
// 보장한다  가장자리·구석에 있는 워터마크. 잘라 내면 모델이 못 본다
// 못 한다   **화면 한가운데, 사람 몸 위에 걸친 워터마크.** 그걸
//           자르면 사진이 없어진다
//
// 2026-11-09 에 나온 '일간스포츠'(점퍼 가슴)와 '엑스포츠뉴스'(어깨)가
// 그 못 하는 쪽이었을 수 있다. 그런 사진은 **다른 사진으로 바꾸는 것**이
// 유일한 답이다. 운영자가 "최대한 안 들어간 것으로 주겠다"고 한 것이
// 정확히 그 길이다.
//
// 그러니 이 파일은 **100%를 혼자 만들지 못한다.** 깨끗한 사진을 받는
// 것이 1번이고, 이건 그래도 남은 것을 줄이는 2번이다.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 가장자리에서 얼마나 잘라낼지 (비율).
 *
 * 한국 뉴스 사진의 워터마크는 대개 **아래쪽**에 있다. 그래서 아래를
 * 가장 많이 자른다. 위·좌·우는 구석에 찍힌 것을 걷어내는 정도다.
 *
 * ⚠️ 너무 많이 자르면 사람이 잘린다. 야구 사진은 세로로 꽉 찬 것이
 *    많아서 아래를 20% 넘게 자르면 다리가 날아간다.
 */
export const DEFAULT_CROP = { top: 0.04, bottom: 0.12, left: 0.04, right: 0.04 };

/** ffmpeg 가 있는가. 없으면 자르기를 건너뛴다(그림은 그대로 만든다). */
export function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

/**
 * 비율을 ffmpeg crop 필터로 바꾼다.
 *
 * ffmpeg 는 `crop=너비:높이:x:y` 를 받는다. 입력 크기를 미리 알
 * 필요가 없도록 `iw`(입력 너비)·`ih`(입력 높이) 식으로 적는다.
 */
export function cropFilter({ top, bottom, left, right } = DEFAULT_CROP) {
  const w = `iw*${(1 - left - right).toFixed(4)}`;
  const h = `ih*${(1 - top - bottom).toFixed(4)}`;
  const x = `iw*${left.toFixed(4)}`;
  const y = `ih*${top.toFixed(4)}`;
  return `crop=${w}:${h}:${x}:${y}`;
}

/**
 * 아래쪽 띠를 **재서** 자른다.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 재나 — 반만 자르면 안 자른 것보다 나쁘다
 * ─────────────────────────────────────────────────────────────
 *
 * 2026-11-09. 고정 12% 로 잘랐더니 박진만은 깨끗했는데 고영표는
 * **반만 잘렸다.** 그리고 그 반쪽이 남은 그림에 모델이 커다란 글자를
 * 지어 넣었다 — 사람이 읽을 수 없는 글자꼴이었다.
 *
 * 까닭은 분명하다. 글자 **조각**을 보면 모델은 그것을 글자로 알아보고
 * "글자를 그려야 하는 자리"로 읽는다. 아예 안 보이면 안 그리지만,
 * 반쪽이 보이면 제 마음대로 채운다. 모자 마크가 `C` 에서 `STL` 로
 * 간 것과 같은 성질이다.
 *
 * **그래서 반만 자르느니 안 자르는 게 낫고, 자를 거면 끝까지 자른다.**
 *
 * ─────────────────────────────────────────────────────────────
 * 어떻게 재나
 * ─────────────────────────────────────────────────────────────
 *
 * 글자는 **가로 방향 밝기 변화가 많다.** 잔디·하늘·유니폼 같은 면은
 * 적다. 그래서 줄마다 옆 픽셀과의 차이를 더해 '시끄러운 정도'를 낸다.
 *
 *   1. 사진을 가로 256 픽셀 회색조로 줄인다 (빠르고 충분하다)
 *   2. 줄마다 |p[i+1] - p[i]| 를 더한다
 *   3. 가운데 절반의 중앙값을 '보통'으로 삼는다
 *   4. 맨 아래부터 올라가며 '보통'보다 뚜렷이 시끄러운 줄이
 *      이어지는 곳을 찾는다 — 그게 워터마크 띠다
 *   5. 그 띠의 **위**까지 자른다 (여유 2% 더)
 *
 * ⚠️ 못 하는 것은 그대로다. 사람 몸 위에 걸친 워터마크는 재도 못 자른다.
 *    그런 것은 띠가 바닥에 안 닿으므로 여기서 안 잡히고, 사진을 바꾸는
 *    것이 유일한 답이다.
 */

/** 재서 자를 때 아래를 최대 얼마까지 자를 수 있나. */
export const MAX_BOTTOM = 0.28;

/**
 * 회색조 픽셀에서 줄마다 '가로 방향 시끄러움'을 낸다. 0~1.
 * @param {Uint8Array|Buffer} gray  width*height 바이트
 */
export function rowNoise(gray, width, height) {
  const out = new Array(height).fill(0);
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const base = y * width;
    for (let x = 0; x + 1 < width; x += 1) {
      sum += Math.abs(gray[base + x + 1] - gray[base + x]);
    }
    out[y] = sum / 255 / (width - 1);
  }
  return out;
}

/**
 * 줄별 시끄러움에서 **바닥에 닿은 시끄러운 띠**의 높이를 비율로 낸다.
 *
 * 못 찾으면 null. 찾았는데 MAX_BOTTOM 을 넘으면 그 값을 그대로 돌려준다
 * — 자를지 말지는 부르는 쪽이 정한다(반만 자르느니 안 자른다).
 */
export function watermarkBand(noise, { zone = 0.35 } = {}) {
  const h = noise.length;
  if (h < 40) return null;

  // '보통'은 가운데 절반의 중앙값으로 잡는다. 위아래 가장자리에
  // 워터마크·자막바가 있을 수 있어서 거기는 안 본다.
  const mid = noise.slice(Math.floor(h * 0.25), Math.floor(h * 0.75)).slice().sort((a, b) => a - b);
  const baseline = mid[Math.floor(mid.length / 2)] || 0;
  const loud = (v) => v > baseline * 1.6 + 0.02;

  // ⚠️ "맨 아랫줄이 시끄러운가"로 보면 안 된다. 워터마크 **밑에는 대개
  //    여백이 있다** — 글자가 사진 테두리에 딱 붙어 있지 않다. 처음에
  //    그렇게 짰다가 아무것도 못 잡았다.
  //
  // 그래서 아래 zone(기본 35%) 안에서 **가장 위에 있는 시끄러운 줄**을
  // 찾고, 거기서부터 바닥까지를 띠로 본다. 여백은 자동으로 포함된다.
  const from = Math.floor(h * (1 - zone));
  let top = -1;
  for (let y = from; y < h; y += 1) {
    if (loud(noise[y])) {
      top = y;
      break;
    }
  }
  if (top < 0) return null;
  return (h - top) / h;
}

/** 사진을 가로 256 회색조로 펴서 돌려준다. 못 하면 null. */
export function grayPixels(file, width = 256) {
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  );
  const [w0, h0] = String(probe.stdout || '').trim().split(',').map(Number);
  if (!w0 || !h0) return null;
  const height = Math.max(1, Math.round((h0 / w0) * width));
  const r = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-vf', `scale=${width}:${height}`, '-pix_fmt', 'gray',
     '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 28 }
  );
  if (r.status !== 0 || !r.stdout || r.stdout.length < width * height) return null;
  return { gray: r.stdout, width, height };
}

/**
 * 이 사진은 아래를 얼마나 잘라야 하나.
 *
 * @returns {{ bottom:number, 잼:boolean, 띠:number|null, 까닭:string }}
 *   잼=false 면 못 쟀다는 뜻이고 bottom 은 기본값이다.
 */
export function measureBottom(file, { fallback = DEFAULT_CROP.bottom } = {}) {
  const px = grayPixels(file);
  if (!px) return { bottom: fallback, 잼: false, 띠: null, 까닭: '펴지 못했습니다' };
  const band = watermarkBand(rowNoise(px.gray, px.width, px.height));
  if (band === null) {
    // ⚠️ "띠가 없다"는 **워터마크가 없다는 뜻이 아니다.** 진짜 사진은
    //    어디나 복잡해서 글자가 변화량으로 안 튄다(2026-11-09 고영표).
    //    그래서 기본값만 자르고, 자른 사진을 사람이 보게 한다.
    return {
      bottom: fallback,
      잼: true,
      띠: null,
      까닭: `아래에서 띠를 못 찾아 기본값 ${Math.round(fallback * 100)}% 만 자릅니다`,
    };
  }
  const want = Math.min(0.95, band + 0.02); // 여유 2%
  if (want > MAX_BOTTOM) {
    return {
      bottom: want,
      잼: true,
      띠: band,
      까닭: `띠가 아래 ${Math.round(band * 100)}% 까지 올라옵니다 — 너무 깊습니다`,
    };
  }
  // ⚠️ 실제로 자르는 값을 적는다. 전에는 want 를 적고 실제로는
  //    Math.max(fallback, want) 를 잘라서 로그가 "9%" 인데 12% 를
  //    자르고 있었다 (2026-11-09 #76).
  const bottom = Math.max(fallback, want);
  return {
    bottom,
    잼: true,
    띠: band,
    까닭:
      `띠 ${Math.round(band * 100)}% → 아래 ${Math.round(bottom * 100)}% 를 자릅니다`,
  };
}

/**
 * 주소에서 받아 자르고 **data URI** 로 돌려준다.
 *
 * data URI 로 보내는 까닭: Replicate 에 파일을 올리려면 따로 올리는
 * 과정이 필요한데, data URI 는 그냥 입력값에 넣으면 된다. 사진 한 장이
 * 수백 KB 라 JSON 본문에 들어간다.
 *
 * 실패하면 **원래 주소를 그대로 돌려준다.** 자르기는 있으면 좋은
 * 것이지 없으면 못 만드는 것이 아니다 — 여기서 멈추면 그림이 한 장도
 * 안 나온다.
 *
 * @returns { url, cropped, reason }
 */
export async function cropToDataUri(url, { crop = DEFAULT_CROP, fetchFn = fetch, measure = true } = {}) {
  if (!/^https?:\/\//.test(String(url || ''))) {
    return { url, cropped: false, reason: '주소가 아닙니다' };
  }
  if (!hasFfmpeg()) {
    return { url, cropped: false, reason: 'ffmpeg 가 없습니다' };
  }

  let dir;
  try {
    const res = await fetchFn(url);
    if (!res.ok) {
      return { url, cropped: false, reason: `받지 못했습니다 (${res.status})` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) {
      return { url, cropped: false, reason: '받은 것이 너무 작습니다' };
    }

    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-'));
    const inFile = path.join(dir, 'in');
    const outFile = path.join(dir, 'out.png');
    fs.writeFileSync(inFile, buf);

    // ── 아래 띠를 재서 자른다 ──
    //
    // 고정 비율로 자르면 사진마다 워터마크 크기가 달라 **반만 잘린다.**
    // 반쪽이 남으면 모델이 그 자리를 글자로 읽고 제 마음대로 채운다
    // (2026-11-09 고영표). 그래서 재고, 못 재거나 너무 깊으면 **안 자른다.**
    let use = crop;
    let 잰말 = '';
    if (measure) {
      const m = measureBottom(inFile, { fallback: crop.bottom });
      잰말 = ` · ${m.까닭}`;
      if (m.bottom > MAX_BOTTOM) {
        // 반만 자르느니 안 자른다. 원본을 그대로 보내고 사람에게 알린다.
        return {
          url,
          cropped: false,
          reason: `${m.까닭}. 반만 자르면 모델이 글자를 지어냅니다 — 다른 사진이 필요합니다`,
          needsNewPhoto: true,
        };
      }
      use = { ...crop, bottom: m.bottom };
    }

    const r = spawnSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', inFile, '-vf', cropFilter(use), outFile],
      { encoding: 'utf8' }
    );
    if (r.status !== 0 || !fs.existsSync(outFile)) {
      return { url, cropped: false, reason: `ffmpeg 실패: ${(r.stderr || '').slice(0, 120)}` };
    }

    const out = fs.readFileSync(outFile);
    return {
      url: `data:image/png;base64,${out.toString('base64')}`,
      cropped: true,
      reason: `${buf.length}바이트 → ${out.length}바이트${잰말}`,
      // 자른 사진 그대로. 부르는 쪽이 preview 에 떨궈서 **사람이 눈으로**
      // 워터마크가 빠졌는지 보게 한다. 내가 그림을 못 보기 때문에
      // 이것이 유일하게 확실한 확인 방법이다.
      png: out,
    };
  } catch (e) {
    return { url, cropped: false, reason: e.message };
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────
// 사진을 글자 그림으로 찍는다 — **내가 보려고** (2026-11-09)
// ─────────────────────────────────────────────────────────────
//
// 고영표 가슴의 글자를 두고 네 번 돌렸다($0.20). 매번 원인을 다르게
// 짚었는데 **전부 추측이었다.** 내가 그림을 못 보기 때문이다.
//
//   · 워터마크다 → 잘랐다 → 그대로
//   · 재는 게 모자라다 → 재게 했다 → 띠를 못 찾음
//   · uniforms.mjs 가 범인이다 → 고쳤다 → 그 경로를 안 쓴다
//   · 리페인트 프롬프트다 → 고쳤다 → 그대로
//
// 추측을 한 번 더 하느니 **보는 길**을 만든다. 러너는 사진을 받을 수
// 있으니(내 프록시만 막혀 있다), 거기서 밝기를 글자로 바꿔 로그에
// 찍으면 내가 읽는다. 돈이 안 든다.
//
// ⚠️ 정밀한 그림이 아니다. 어두운 옷 위의 밝은 글자처럼 **대비가 큰
//    덩어리**를 찾는 용도다. 그 이상은 사람이 봐야 한다.

/** 어두운 곳부터 밝은 곳까지. 터미널에서 눈에 띄는 순서로 골랐다. */
const RAMP = ' .:-=+*#%@';

/**
 * 회색조 픽셀을 글자 그림으로.
 *
 * 글자는 세로로 길쭉해서(폭의 두 배쯤) 가로 칸 수의 절반만 세로로 쓴다.
 * 안 그러면 그림이 세로로 늘어나 글자꼴을 못 알아본다.
 */
export function asciiArt(gray, width, height, cols = 110) {
  const rows = Math.max(1, Math.round((height / width) * cols * 0.5));
  const lines = [];
  for (let r = 0; r < rows; r += 1) {
    let line = '';
    for (let c = 0; c < cols; c += 1) {
      // 한 칸이 덮는 네모의 평균을 낸다. 한 점만 찍으면 글자가 끊긴다.
      const x0 = Math.floor((c / cols) * width);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) / cols) * width));
      const y0 = Math.floor((r / rows) * height);
      const y1 = Math.max(y0 + 1, Math.floor(((r + 1) / rows) * height));
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1 && y < height; y += 1) {
        for (let x = x0; x < x1 && x < width; x += 1) {
          sum += gray[y * width + x];
          n += 1;
        }
      }
      const v = n ? sum / n / 255 : 0;
      line += RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
    }
    lines.push(line);
  }
  return lines;
}

/** 파일 하나를 글자 그림으로. 못 하면 null. */
export function asciiOf(file, cols = 110) {
  const px = grayPixels(file, 512);
  if (!px) return null;
  return asciiArt(px.gray, px.width, px.height, cols);
}
