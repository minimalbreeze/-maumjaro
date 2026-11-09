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
export async function cropToDataUri(url, { crop = DEFAULT_CROP, fetchFn = fetch } = {}) {
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

    const r = spawnSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', inFile, '-vf', cropFilter(crop), outFile],
      { encoding: 'utf8' }
    );
    if (r.status !== 0 || !fs.existsSync(outFile)) {
      return { url, cropped: false, reason: `ffmpeg 실패: ${(r.stderr || '').slice(0, 120)}` };
    }

    const out = fs.readFileSync(outFile);
    return {
      url: `data:image/png;base64,${out.toString('base64')}`,
      cropped: true,
      reason: `${buf.length}바이트 → ${out.length}바이트`,
    };
  } catch (e) {
    return { url, cropped: false, reason: e.message };
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}
