// prompts.json → 실제 이미지 파일 (기획서 7번).
//
// ─────────────────────────────────────────────────────────────
// 이 파일이 지키는 것: 돈
// ─────────────────────────────────────────────────────────────
//
// 여기가 이 시스템에서 처음으로 "장당 돈이 나가는" 자리다. 대본과 장면은
// 한 편에 몇 번의 호출로 끝나지만, 이미지는 샷마다 하나씩 40~50번 나간다.
// 버그 하나가 비싸진다.
//
// 그래서 세 가지를 코드가 지킨다.
//
//  1) **비용 상한.** 넘으면 멈춘다. AI가 아니라 코드가 센다.
//  2) **이미 있는 파일은 건너뛴다.** 중간에 죽어도 돈을 다시 쓰지 않는다.
//     이게 없으면 48번째 샷에서 실패했을 때 47장을 다시 사게 된다.
//  3) **한 샷이 실패해도 멈추지 않는다.** 실패한 샷만 기록해 두고 끝까지
//     간다. 나중에 같은 명령을 다시 돌리면 실패한 것만 다시 만든다
//     (2번 덕분에).

import fs from 'node:fs';
import path from 'node:path';
import { createClient, modelFor, DEFAULT_IMAGE_MODEL } from './replicate.mjs';

/** 기본 비용 상한(달러). 1편 기준. 넘으면 멈춘다. */
export const DEFAULT_MAX_USD = 3;

/** 한 샷당 다시 걸어보는 횟수. */
export const MAX_ATTEMPTS = 3;

/**
 * 잔액이 없어 **더 해 봐야 소용없는** 오류인가.
 *
 * 실행 #39 에서 Replicate 잔액이 떨어졌는데, 코드가 그걸 모르고 남은
 * 41장을 전부 세 번씩 시도했다. 123번을 걸어서 123번 거절당했다.
 * 로그만 길어지고 얻은 것은 없다.
 */
export function isOutOfCredit(err) {
  const msg = String(err?.message || err || '');
  return (
    /insufficient credit/i.test(msg) ||
    /requires credit to run/i.test(msg) ||
    /Replicate 402/.test(msg)
  );
}

/**
 * 한도(429) 메시지에서 **얼마나 기다리라는지** 읽는다.
 *
 * Replicate 는 "Your rate limit resets in ~8s." 라고 알려 준다. 그걸
 * 안 읽고 2초만 쉬면 또 걸린다 — 실행 #39 에서 그래서 세 번을 2초
 * 간격으로 걸고 포기했다. 8초를 기다렸으면 됐을 일이다.
 *
 * 되돌려주는 것: 밀리초. 못 읽으면 null.
 */
export function retryAfterMs(err) {
  const m = String(err?.message || err || '').match(/resets? in ~?(\d+(?:\.\d+)?)s/i);
  if (!m) return null;
  const seconds = Number(m[1]);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  // 알려 준 시각 **직후**에 걸면 아슬아슬하게 또 걸린다. 1초를 더 준다.
  return Math.min(60_000, Math.round(seconds * 1000) + 1000);
}


/** 규격별 가로세로비. 쇼츠는 본편을 잘라 만들므로 16:9 하나만 쓴다. */
export const ASPECT_RATIO = '16:9';

/**
 * 만들어진 이미지가 쓸 만한지 본다.
 *
 * 내려받기가 중간에 끊기면 0바이트나 몇 바이트짜리 파일이 남는다. 그걸
 * 그대로 두면 다음 실행이 "이미 있네" 하고 건너뛰고, ffmpeg가 렌더할 때
 * 가서야 깨진다. 그때는 어느 샷이 문제인지 찾기 어렵다.
 *
 * PNG는 항상 같은 8바이트로 시작한다. 그것만 확인해도 "내려받다 만 파일"을
 * 거의 다 걸러낸다.
 */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_IMAGE_BYTES = 1024;

export function looksLikeImage(buffer) {
  if (!buffer || buffer.length < MIN_IMAGE_BYTES) return false;
  // PNG이거나 JPEG이면 통과. 모델이 형식을 바꿔 보내는 일이 있다.
  if (buffer.subarray(0, 8).equals(PNG_MAGIC)) return true;
  return buffer[0] === 0xff && buffer[1] === 0xd8;
}

/** 이미 받아둔 파일이 쓸 만한지. */
export function hasUsableFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < MIN_IMAGE_BYTES) return false;
    const head = Buffer.alloc(8);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, head, 0, 8, 0);
    } finally {
      fs.closeSync(fd);
    }
    return head.equals(PNG_MAGIC) || (head[0] === 0xff && head[1] === 0xd8);
  } catch {
    return false;
  }
}

/**
 * 만들 샷 목록을 고른다.
 *
 * 영상 샷(asset_type VIDEO)도 이미지를 만든다. 두 가지 이유다.
 *  - 영상 생성이 실패하면 이미지로 대체한다 (기획서 9번, plan.mjs의 fallback)
 *  - AI 영상은 아직 안 붙였다. 지금은 전부 이미지로 돌아간다.
 */
/**
 * 글자 카드로 그릴 샷을 골라낸다.
 *
 * 이 샷들은 **이미지 모델을 부르지 않는다.** 표와 숫자는 ffmpeg 로 직접
 * 그리는 쪽이 한글이 또렷하고 장당 0원이다.
 *
 * 그림 목록과 완전히 갈라 둔다. 한쪽에만 들어가야 돈 계산이 맞는다.
 */
export function cardShots(prompts, { assetDir, force = false }) {
  const todo = [];
  const skipped = [];

  for (const p of prompts || []) {
    if (!p?.shot_id) continue;
    const text = String(p.card_text || '').trim();
    if (!text) continue;
    const file = path.join(assetDir, `${p.shot_id}.png`);
    if (!force && hasUsableFile(file)) {
      skipped.push({ shot_id: p.shot_id, reason: '이미 있습니다', file });
      continue;
    }
    todo.push({ shot_id: p.shot_id, card_text: text, file });
  }

  return { todo, skipped };
}

export function shotsToGenerate(prompts, { assetDir, force = false }) {
  const todo = [];
  const skipped = [];

  for (const p of prompts || []) {
    if (!p?.shot_id) continue;
    // 카드로 그릴 샷은 여기서 빠진다. cardShots 가 맡는다.
    if (String(p.card_text || '').trim()) {
      skipped.push({ shot_id: p.shot_id, reason: '글자 카드로 그립니다 (0원)' });
      continue;
    }
    if (!p.image_prompt || !String(p.image_prompt).trim()) {
      skipped.push({ shot_id: p.shot_id, reason: '화면 프롬프트가 비어 있습니다' });
      continue;
    }
    const file = path.join(assetDir, `${p.shot_id}.png`);
    if (!force && hasUsableFile(file)) {
      skipped.push({ shot_id: p.shot_id, reason: '이미 있습니다', file });
      continue;
    }
    todo.push({ ...p, file });
  }

  return { todo, skipped };
}

/** 비용 추정. 상한을 걸기 위한 기준이지 청구서가 아니다. */
export function estimateUsd(count, modelKey = DEFAULT_IMAGE_MODEL) {
  const usd = modelFor(modelKey).usdPerImage * Math.max(0, count);
  return Math.round(usd * 10000) / 10000;
}

/**
 * 샷 목록대로 이미지를 만든다.
 *
 * 반환: { made, skipped, failed, spentUsd, stoppedBy }
 *   stoppedBy 가 'budget' 이면 상한에 걸려 멈춘 것이다. 나머지 샷은
 *   같은 명령을 다시 돌리면 이어서 만든다.
 */
export async function generateImages(prompts, {
  assetDir,
  token,
  modelKey = DEFAULT_IMAGE_MODEL,
  maxUsd = DEFAULT_MAX_USD,
  force = false,
  client = null,
  onProgress = null,
  sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  fs.mkdirSync(assetDir, { recursive: true });

  const api = client || createClient({ token, sleepFn });
  const { todo, skipped } = shotsToGenerate(prompts, { assetDir, force });

  const made = [];
  const failed = [];
  let spentUsd = 0;
  let stoppedBy = null;

  const perImage = modelFor(modelKey).usdPerImage;

  for (const [i, shot] of todo.entries()) {
    // 잔액이 떨어졌으면 남은 것은 **걸어 보지도 않는다.**
    if (stoppedBy === 'credit') {
      failed.push({ shot_id: shot.shot_id, reason: '잔액이 떨어져 만들지 않았습니다' });
      continue;
    }
    // 상한을 넘기 **전에** 멈춘다. 넘은 다음에 세면 이미 쓴 뒤다.
    if (spentUsd + perImage > maxUsd) {
      stoppedBy = 'budget';
      for (const rest of todo.slice(i)) {
        failed.push({ shot_id: rest.shot_id, reason: `비용 상한 $${maxUsd}에 걸려 만들지 않았습니다` });
      }
      break;
    }

    onProgress?.(`이미지 ${i + 1}/${todo.length} — ${shot.shot_id} (장면 ${shot.scene_number})`);

    let lastError = null;
    let done = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
      try {
        const result = await api.generate(shot.image_prompt, { modelKey, aspectRatio: ASPECT_RATIO });
        // 호출이 성공한 시점에 돈이 나갔다. 내려받기가 실패해도 쓴 건 쓴 거다.
        spentUsd += result.usdEstimate ?? perImage;

        const bytes = await api.download(result.url);
        if (!looksLikeImage(bytes)) {
          throw new Error(`내려받은 파일이 이미지가 아닙니다 (${bytes?.length ?? 0}바이트)`);
        }

        // 임시 이름으로 쓴 뒤 바꿔 단다. 쓰는 도중에 죽어도 반쪽짜리
        // 파일이 제 이름으로 남지 않는다 — 다음 실행이 그걸 "있다"고 볼 테니까.
        const tmp = `${shot.file}.part`;
        fs.writeFileSync(tmp, bytes);
        fs.renameSync(tmp, shot.file);

        made.push({ shot_id: shot.shot_id, file: shot.file, bytes: bytes.length, attempts: attempt });
        done = true;
      } catch (err) {
        lastError = err;
        // 잔액이 없으면 다시 거는 것이 의미가 없다. 바깥 루프도 멈춘다.
        if (isOutOfCredit(err)) {
          stoppedBy = 'credit';
          onProgress?.(`  ${shot.shot_id} — 잔액이 떨어졌습니다. 남은 샷은 걸지 않습니다.`);
          break;
        }
        const canRetry = err?.retryable !== false && attempt < MAX_ATTEMPTS;
        if (!canRetry) break;
        // 한도(429)에 걸렸으면 **알려 준 만큼** 기다린다. 2초만 쉬고 다시
        // 걸면 또 걸린다 — 실행 #39 에서 그렇게 세 번을 날렸다.
        const wait = retryAfterMs(err) ?? 2000 * attempt;
        onProgress?.(
          `  ${shot.shot_id} 실패 (${attempt}/${MAX_ATTEMPTS}) — ${err.message} ` +
            `${Math.round(wait / 1000)}초 쉬었다 다시 겁니다.`
        );
        await sleepFn(wait);
      }
    }

    if (!done) {
      failed.push({ shot_id: shot.shot_id, reason: lastError?.message || '알 수 없는 이유' });
    }
  }

  return {
    made,
    skipped,
    failed,
    spentUsd: Math.round(spentUsd * 10000) / 10000,
    stoppedBy,
    model: modelFor(modelKey).model,
  };
}
