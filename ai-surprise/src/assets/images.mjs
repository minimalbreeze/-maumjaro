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
import { SPORTS_LIKENESS_CLAUSE, SPORTS_INVENTED_CLAUSE } from '../scenes/visuals.mjs';
import { photoOf as mainPhoto, sparePhotoOf as sparePhoto } from './photo-of.mjs';

/**
 * 참조 모델이 **사진에서 얼굴을 못 찾았는가.**
 *
 * 2026-11-07 실행 #65. 류현진 사진으로 건 두 샷이 이렇게 죽었다.
 *
 *     facexlib align face fail
 *
 * facexlib 는 참조 모델이 얼굴을 떼어낼 때 쓰는 것이다. 투구 동작처럼
 * 얼굴이 작거나 가린 사진이면 못 찾는다.
 *
 * ⚠️ 이건 **다시 걸어도 똑같다.** 사진이 문제라 사진을 바꿔야 한다.
 *    그래서 보통 실패와 갈라서 본다.
 */
export function isFaceFail(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('align face fail') || m.includes('no face') || m.includes('face not found');
}

/**
 * 프롬프트에서 "사진과 같은 얼굴" 지시를 뺀다.
 *
 * 참조 사진을 못 쓰게 됐을 때 쓴다. 참조 없이 보내면서 닮게 그리라고
 * 하면, 모델이 있지도 않은 사진을 찾느라 얼굴이 더 이상해진다.
 * 대신 "지어낸 인물" 쪽으로 바꿔 단다.
 */
export function withoutLikeness(prompt) {
  const t = String(prompt ?? '');
  if (!t.includes(SPORTS_LIKENESS_CLAUSE)) return t;
  return t.replace(SPORTS_LIKENESS_CLAUSE, SPORTS_INVENTED_CLAUSE);
}

/** 기본 비용 상한(달러). 1편 기준. 넘으면 멈춘다. */
export const DEFAULT_MAX_USD = 3;

/** 한 샷당 다시 걸어보는 횟수. */
export const MAX_ATTEMPTS = 3;

/** 참조 사진이 있는 샷에 쓰는 모델. 사진에서 얼굴을 가져온다. */
export const REFERENCE_MODEL = 'portrait';

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
  /* 이 편에 나오는 사람들 [{ name, photo }]. 사진 주소가 있는 사람이
     나오는 샷은 **그 사진을 참조로** 그린다 — 글로만 적으면 "그 조건에
     맞는 아무 얼굴"이 나오고, 참조를 주면 실제로 닮는다.
     운영자 요청(2026-11-03): "그림이 진짜 선수 같은 느낌이었으면". */
  people = [],
  maxUsd = DEFAULT_MAX_USD,
  force = false,
  client = null,
  onProgress = null,
  sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  fs.mkdirSync(assetDir, { recursive: true });

  const api = client || createClient({ token, sleepFn });
  const { todo, skipped } = shotsToGenerate(prompts, { assetDir, force });

  // 이름 → 사진 주소. 주소가 아닌 것은 안 담는다.
  const photoOf = new Map();
  // 예비 주소. 본 사진에서 얼굴을 못 찾으면 이쪽으로 한 번 더 해 본다.
  const sparePhotoOf = new Map();
  // ── 한 편의 그림 바탕을 하나로 맞춘다 (2026-11-07 운영자) ──
  //
  //   "다 좋은데 그림에 선수 사진이 너무 다른 그림과 차이가 나,
  //    지브리 스타일로 만들어 달라니…"
  //   "선수 사진만 갑자기 캐리커처가 나오니 이상하잖아"
  //   "앞으로 전체 그림톤이 유사하게 지브리 톤으로 맞춰줘"
  //
  // 원인은 프롬프트가 아니라 **모델**이었다. 참조 샷은 flux-pulid 가
  // 그리는데 그건 flux-dev 위에 얹혀 있고, 나머지 샷은 flux-schnell 이
  // 그렸다. 바탕이 다르니 결이 다르다.
  //
  // id_weight 를 0.7 → 0.5 → 0.35 로 내려도 안 없어졌던 까닭이 이것이다.
  // 세기를 아무리 낮춰도 **다른 모델이 그린 그림**인 것은 그대로다.
  //
  // 그래서 이 편에 참조 샷이 하나라도 있으면 나머지도 같은 바탕으로
  // 그린다. 비싸지지만(장당 $0.003 → $0.025) 한 편의 그림이 한 결로
  // 나온다. 톤이 튀는 것보다 그 값이 싸다.
  for (const p of people || []) {
    const name = String(p?.name || '').trim();
    const photo = mainPhoto(p);
    if (name && /^https?:\/\//.test(photo)) photoOf.set(name, photo);
    const spare = sparePhoto(p);
    if (name && /^https?:\/\//.test(spare)) sparePhotoOf.set(name, spare);
  }

  // 참조 샷이 있으면 나머지도 그 바탕으로 맞춘다.
  //
  // ⚠️ 사람이 모델을 **직접 골랐으면 그 말을 따른다.** 화풍을 비교해
  //    보려고 일부러 schnell 을 고르는 일이 있다.
  const refBase = modelFor(REFERENCE_MODEL).baseModel;
  // 기본값 그대로 들어왔으면 "사람이 안 골랐다"로 본다. 호출하는 쪽이
  // 늘 값을 채워 보내서 "안 줬다"를 따로 알 수가 없다.
  const modelGiven = modelKey !== DEFAULT_IMAGE_MODEL;
  if (photoOf.size && refBase && !modelGiven) {
    modelKey = refBase;
    onProgress?.(
      `참조 사진이 있어서 나머지 샷도 ${refBase} 로 그립니다 — 한 편의 그림 결을 맞춥니다.`
    );
  }

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
    // ⚠️ 참조 모델이 더 비싸므로 **그 샷의 값**으로 센다. 싼 값으로
    //    세면 상한을 넘겨 놓고 넘은 줄 모른다.
    const nextCost = photoOf.get(String(shot.person || '').trim())
      ? modelFor(REFERENCE_MODEL).usdPerImage
      : perImage;
    if (spentUsd + nextCost > maxUsd) {
      stoppedBy = 'budget';
      for (const rest of todo.slice(i)) {
        failed.push({ shot_id: rest.shot_id, reason: `비용 상한 $${maxUsd}에 걸려 만들지 않았습니다` });
      }
      break;
    }

    // 이 샷에 사진을 받아 둔 사람이 나오면 참조 모델로 그린다.
    const who = String(shot.person || '').trim();
    // ── 참조 사진이 안 될 때 돌아갈 길 (2026-11-07, 실행 #65) ──
    //
    // 류현진 사진 두 샷이 `facexlib align face fail` 로 죽었다. 참조
    // 모델이 사진에서 얼굴을 못 찾은 것이다. 투구 동작 사진이라 얼굴이
    // 작거나 글러브에 가렸을 것이다.
    //
    // 그런데 그 둘이 **자리표시 화면**으로 영상에 남았다. 7분짜리
    // 영상에 빈 화면 두 장은 눈에 띈다. 닮지 않은 그림이 빈 화면보다
    // 백 배 낫다.
    //
    // 그래서 세 단으로 내려간다.
    //   ① 본 사진으로 참조
    //   ② 얼굴을 못 찾으면 예비 사진으로 참조
    //   ③ 그것도 안 되면 참조 없이 그린다 (안 닮지만 그림은 나온다)
    //
    // ⚠️ ③ 으로 내려갈 때는 프롬프트도 같이 바꿔야 한다. "사진과 같은
    //    얼굴"이라고 적힌 채로 참조 없이 보내면 모델이 없는 사진을
    //    찾는다. composeImagePrompt 가 likeness 로 가르는 그 문장이다.
    const refChain = [];
    const mainPhoto = photoOf.get(who) || null;
    if (mainPhoto) refChain.push({ url: mainPhoto, label: '사진 참조' });
    const sparePhoto = sparePhotoOf.get(who) || null;
    if (mainPhoto && sparePhoto) refChain.push({ url: sparePhoto, label: '예비 사진 참조' });
    // 마지막 단은 참조 없이. 사진을 안 받아 둔 사람은 처음부터 여기다.
    refChain.push({ url: null, label: null });

    let refStep = 0;
    let reference = refChain[0].url;
    let useKey = reference ? REFERENCE_MODEL : modelKey;
    let shotCost = modelFor(useKey).usdPerImage;

    onProgress?.(
      `이미지 ${i + 1}/${todo.length} — ${shot.shot_id} (장면 ${shot.scene_number})` +
        (reference ? `  👤 ${shot.person} ${refChain[refStep].label}` : '')
    );

    let lastError = null;
    let done = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
      try {
        const result = await api.generate(shot.image_prompt, {
          modelKey: useKey,
          aspectRatio: ASPECT_RATIO,
          referenceImage: reference,
        });
        // 호출이 성공한 시점에 돈이 나갔다. 내려받기가 실패해도 쓴 건 쓴 거다.
        spentUsd += result.usdEstimate ?? shotCost;

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
        // 얼굴을 못 찾은 것은 다시 걸어도 똑같다. 사진이 문제라
        // 사진을 바꿔야 한다. 다음 단으로 내려간다.
        if (reference && isFaceFail(err) && refStep + 1 < refChain.length) {
          refStep += 1;
          reference = refChain[refStep].url;
          useKey = reference ? REFERENCE_MODEL : modelKey;
          shotCost = modelFor(useKey).usdPerImage;
          // 참조를 뗐으면 프롬프트의 "사진과 같은 얼굴"도 떼야 한다.
          if (!reference) shot.image_prompt = withoutLikeness(shot.image_prompt);
          onProgress?.(
            `  ${shot.shot_id} — 사진에서 얼굴을 못 찾았습니다. ` +
              (reference ? `${refChain[refStep].label}로 다시 겁니다.` : '참조 없이 그립니다.')
          );
          // 이 시도는 안 센다. 사진을 바꿨으니 처음부터 다시다.
          attempt -= 1;
          continue;
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
