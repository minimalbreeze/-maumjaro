// 장면 → 나레이션 음성 + 실제 타이밍 (기획서 11번).
//
// ─────────────────────────────────────────────────────────────
// 왜 문단마다 따로 만들어 이어 붙이는가
// ─────────────────────────────────────────────────────────────
//
// 대본 전체를 한 번에 보내면 mp3 하나가 나온다. 간단해 보이지만 그러면
// **문단이 각각 몇 초인지 알 수 없다.**
//
// 그게 왜 문제냐면, 지금 자막 타이밍이 "330자에 1분"이라는 **추정치**로
// 계산되기 때문이다. 추정은 문장마다 조금씩 틀리고, 그 오차가 쌓여서 8분짜리
// 영상이면 뒤로 갈수록 자막이 눈에 띄게 밀린다. 장면 전환 시점도 같은
// 추정치를 쓰므로 그림까지 같이 밀린다.
//
// 문단마다 따로 만들면 길이를 **재면** 된다. 추정이 사라진다.
// 덤으로 얻는 것:
//   - 한 문단이 실패해도 그것만 다시 만든다 (돈을 다시 안 쓴다)
//   - 문단 사이에 자연스러운 쉼을 넣을 수 있다
//
// 비용은 똑같다. 글자 수로 과금하므로 나눠 부르든 한 번에 부르든 같다.

import { speechText } from './speech.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  createClient,
  estimateUsd,
  DEFAULT_VOICE,
  DEFAULT_SPEAKING_RATE,
  MAX_CHARS_PER_REQUEST,
} from './tts.mjs';

/**
 * 문단 사이 쉼(초). 다큐 나레이션은 사이가 있어야 긴장이 생긴다.
 *
 * 이 값은 **가운데 값**이다. 실제로는 pauseAfter() 가 자리마다 다르게
 * 정한다 — 아래를 보라.
 */
export const PAUSE_SECONDS = 0.45;

/**
 * 자리마다 다르게 쉰다.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 고쳤나
 * ─────────────────────────────────────────────────────────────
 * 운영자가 "어딘가 기계 같은 느낌이 든다"고 했다(2026-11-03).
 *
 * 제일 큰 원인은 목소리가 아니라 **쉼이 전부 똑같다**는 것이었다.
 * 문단마다 0.45 초짜리 같은 파일을 끼워 넣으니 메트로놈처럼 들린다.
 * 사람은 그렇게 말하지 않는다 — 단락이 바뀔 때는 숨을 고르고, 같은
 * 흐름이면 거의 안 쉬고 넘어간다.
 *
 * 목소리를 바꾸는 것보다 이쪽이 크다. 아무리 좋은 목소리도 똑같은
 * 간격으로 끊으면 기계로 들린다.
 *
 * ─────────────────────────────────────────────────────────────
 * 규칙
 * ─────────────────────────────────────────────────────────────
 *   단락이 바뀐다        0.85   숨을 고르고 새 이야기를 시작한다
 *   물음표로 끝났다      0.65   듣는 사람이 생각할 틈을 준다
 *   장면이 바뀐다        0.50   화면도 같이 바뀌는 자리다
 *   짧은 토막 (20자 밑)  0.22   "아닙니다." 뒤에 길게 쉬면 어색하다
 *   그 밖                0.35   같은 흐름이면 빨리 넘어간다
 *
 * 숫자는 0.22 ~ 0.85 사이에 흩어져 있다. 네 배 차이라 귀에 들린다.
 *
 * @param unit 지금 문단
 * @param next 다음 문단 (없으면 마지막)
 */
export function pauseAfter(unit, next) {
  if (!next) return 0;
  const text = String(unit?.text || '').trim();

  // 단락이 바뀌는 자리가 제일 길다. 여기서 안 쉬면 이야기가 뭉친다.
  if (unit?.section && next?.section && unit.section !== next.section) return 0.85;

  // 물음표 뒤. 묻고 바로 답하면 묻지 않은 것과 같다.
  if (/[?？]$/.test(text)) return 0.65;

  // 장면이 바뀌는 자리. 화면도 같이 바뀐다.
  if (unit?.scene_number !== next?.scene_number) return 0.5;

  // 짧은 토막. "아닙니다." "그게 전부입니다." 뒤에 길게 쉬면 어색하다.
  //
  // ⚠️ **구조가 바뀌는 자리를 먼저 본다.** 단락·물음표·장면이 전부
  //    이 줄보다 위에 있다. 처음엔 이 줄을 장면 바뀜보다 위에 뒀는데,
  //    짧은 문장 뒤에 화면이 바뀌어도 0.22초만 쉬어서 쫓기듯 들렸다.
  //    글자 수는 구조보다 약한 단서다.
  if (text.length < 20) return 0.22;

  return 0.35;
}

/** 쉼 길이별로 무음 파일을 하나씩만 만든다. 같은 길이는 다시 안 만든다. */
export const PAUSE_LENGTHS = [0.22, 0.35, 0.5, 0.65, 0.85];

/** 기본 비용 상한(달러). 1편 8분이면 $0.05 안팎이라 넉넉하다. */
export const DEFAULT_MAX_USD = 1;

/** 한 문단당 다시 걸어보는 횟수. */
export const MAX_ATTEMPTS = 3;

/** mp3는 항상 ID3 태그나 프레임 싱크로 시작한다. 받다 만 파일을 거른다. */
const MIN_AUDIO_BYTES = 512;

export function looksLikeMp3(buffer) {
  if (!buffer || buffer.length < MIN_AUDIO_BYTES) return false;
  // "ID3" 태그로 시작하거나, MPEG 프레임 싱크(0xFF 0xEx/0xFx)로 시작한다.
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

export function hasUsableAudio(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < MIN_AUDIO_BYTES) return false;
    const head = Buffer.alloc(3);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, head, 0, 3, 0);
    } finally {
      fs.closeSync(fd);
    }
    return looksLikeMp3(Buffer.concat([head, Buffer.alloc(MIN_AUDIO_BYTES)]));
  } catch {
    return false;
  }
}

/**
 * 장면 목록을 읽을 문단 목록으로 편다.
 *
 * 자막·장면 분할과 **같은 문단 단위**를 쓴다. 다른 단위를 쓰면 타이밍을
 * 맞출 수가 없다.
 */
export function narrationUnits(scenes) {
  const units = [];
  for (const scene of scenes || []) {
    for (const [i, p] of (scene.paragraphs || []).entries()) {
      const text = String(p?.text || '').trim();
      if (!text) continue;
      // 읽을 글은 따로 만든다. 자막에는 `text` 가 나가고 음성 모델에는
      // `speech` 를 보낸다 — 따옴표를 떼고 발음을 바로잡은 글이다.
      // 3화에서 따옴표 뒤가 느리고 이름이 어색하다는 말을 들었다.
      const speech = speechText(text);
      units.push({
        id: `S${String(scene.scene_number).padStart(2, '0')}-P${i + 1}`,
        scene_number: scene.scene_number,
        section: scene.section,
        tag: p.tag,
        text,
        speech,
        // 돈은 **읽는 글자 수**로 나간다. 따옴표를 떼면 그만큼 줄어든다.
        chars: speech.length,
      });
    }
  }
  return units;
}

/** 오디오 파일 길이(초). ffprobe로 잰다. */
export function audioSeconds(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe 실패 (${code}): ${filePath}`));
      const seconds = Number(out.trim());
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return reject(new Error(`길이를 읽을 수 없습니다: ${filePath}`));
      }
      resolve(seconds);
    });
  });
}

/**
 * 문단 mp3들을 쉼을 끼워 하나로 붙이는 ffmpeg 인자.
 *
 * concat 필터를 쓴다. demuxer + copy 가 더 빠르지만, mp3는 프레임 경계가
 * 딱 맞지 않아 이어 붙일 때 아주 작은 틈이나 겹침이 생긴다. 그 오차가
 * 문단 수십 개에 쌓이면 자막이 밀린다 — 우리가 애써 재놓은 타이밍이
 * 무의미해진다. 다시 인코딩하는 비용을 내고 정확도를 산다.
 */
export function concatArgs({ listPath, outputPath }) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100',
    outputPath,
  ];
}

/** 무음 파일을 만드는 인자. 문단 사이 쉼으로 쓴다. */
export function silenceArgs({ seconds, outputPath }) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=44100',
    '-t', Number(seconds).toFixed(3),
    '-c:a', 'libmp3lame', '-b:a', '192k',
    outputPath,
  ];
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 4000) err = err.slice(-4000);
    });
    proc.on('error', (e) => reject(new Error(`ffmpeg를 실행할 수 없습니다: ${e.message}`)));
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg 실패 (${code})\n${err.trim().split('\n').slice(-8).join('\n')}`))
    );
  });
}

/**
 * 문단별 음성을 만들고 이어 붙인다.
 *
 * 반환: { voicePath, timings, made, skipped, failed, spentUsd, totalSeconds, stoppedBy }
 *   timings 는 [{ start, end }] — 문단 순서대로. 자막이 이걸 그대로 쓴다.
 */
export async function narrate(scenes, {
  workDir,
  apiKey,
  voice = DEFAULT_VOICE,
  // 말하기 속도. 종류마다 다르다 — 동화는 느리게, 스포츠는 중계 톤으로.
  speakingRate = DEFAULT_SPEAKING_RATE,
  maxUsd = DEFAULT_MAX_USD,
  force = false,
  client = null,
  onProgress = null,
  sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const partsDir = path.join(workDir, 'parts');
  fs.mkdirSync(partsDir, { recursive: true });

  const api = client || createClient({ apiKey, sleepFn });
  const units = narrationUnits(scenes);
  if (!units.length) {
    return { voicePath: null, timings: [], made: [], skipped: [], failed: [], spentUsd: 0, totalSeconds: 0, stoppedBy: null };
  }

  // 너무 긴 문단은 애초에 API가 거부한다. 만들기 전에 잡아서 알려준다.
  const tooLong = units.filter((u) => u.chars > MAX_CHARS_PER_REQUEST);
  if (tooLong.length) {
    throw new Error(
      `문단이 너무 깁니다 (${MAX_CHARS_PER_REQUEST}자 한계): ` +
        tooLong.map((u) => `${u.id} ${u.chars}자`).join(', ')
    );
  }

  const made = [];
  const skipped = [];
  const failed = [];
  let spentUsd = 0;
  let stoppedBy = null;

  for (const [i, unit] of units.entries()) {
    const file = path.join(partsDir, `${unit.id}.mp3`);
    unit.file = file;

    if (!force && hasUsableAudio(file)) {
      skipped.push({ id: unit.id, reason: '이미 있습니다' });
      continue;
    }

    const cost = estimateUsd(unit.chars);
    // 상한을 넘기 **전에** 멈춘다.
    if (spentUsd + cost > maxUsd) {
      stoppedBy = 'budget';
      for (const rest of units.slice(i)) {
        failed.push({ id: rest.id, reason: `비용 상한 $${maxUsd}에 걸려 만들지 않았습니다` });
      }
      break;
    }

    onProgress?.(`음성 ${i + 1}/${units.length} — ${unit.id} (${unit.chars}자)`);

    let done = false;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
      try {
        const bytes = await api.synthesize(unit.speech || unit.text, { voice, speakingRate });
        spentUsd += cost;
        if (!looksLikeMp3(bytes)) {
          throw new Error(`받은 것이 mp3가 아닙니다 (${bytes?.length ?? 0}바이트)`);
        }
        // 임시 이름으로 쓴 뒤 바꿔 단다. 쓰는 중에 죽어도 반쪽짜리가
        // 제 이름으로 남지 않는다.
        fs.writeFileSync(`${file}.part`, bytes);
        fs.renameSync(`${file}.part`, file);
        made.push({ id: unit.id, file, bytes: bytes.length, attempts: attempt });
        done = true;
      } catch (err) {
        lastError = err;
        if (err?.retryable === false || attempt >= MAX_ATTEMPTS) break;
        onProgress?.(`  ${unit.id} 실패 (${attempt}/${MAX_ATTEMPTS}) — ${err.message}. 다시 겁니다.`);
        await sleepFn(1500 * attempt);
      }
    }

    if (!done) failed.push({ id: unit.id, reason: lastError?.message || '알 수 없는 이유' });
  }

  const usable = units.filter((u) => hasUsableAudio(u.file));
  if (!usable.length) {
    return {
      voicePath: null,
      timings: [],
      made, skipped, failed,
      spentUsd: round4(spentUsd),
      totalSeconds: 0,
      stoppedBy,
    };
  }

  // 쉼 파일 하나를 만들어 돌려 쓴다.
  onProgress?.('문단을 이어 붙이는 중...');
  // 쉼 길이가 여러 가지다. 길이마다 무음 파일을 하나씩 만들어 두고
  // 돌려 쓴다 — 문단마다 만들면 백 번 넘게 ffmpeg 를 부른다.
  const silenceFor = new Map();
  for (const sec of PAUSE_LENGTHS) {
    const file = path.join(partsDir, `_pause-${String(sec).replace('.', '_')}.mp3`);
    if (!fs.existsSync(file)) {
      await runFfmpeg(silenceArgs({ seconds: sec, outputPath: file }));
    }
    silenceFor.set(sec, file);
  }

  // 길이를 재면서 목록을 만든다. 여기서 나온 숫자가 자막의 근거가 된다.
  const timings = [];
  const listLines = [];
  let cursor = 0;

  for (const [i, unit] of usable.entries()) {
    const seconds = await audioSeconds(unit.file);
    timings.push({
      id: unit.id,
      scene_number: unit.scene_number,
      section: unit.section,
      start: round2(cursor),
      end: round2(cursor + seconds),
      seconds: round2(seconds),
    });
    cursor += seconds;

    listLines.push(`file '${unit.file.replace(/'/g, "'\\''")}'`);
    // 마지막 문단 뒤에는 쉼을 넣지 않는다. 영상 끝에 빈 소리가 남는다.
    const gap = pauseAfter(unit, usable[i + 1]);
    if (gap > 0) {
      const file = silenceFor.get(gap);
      listLines.push(`file '${file.replace(/'/g, "'\\''")}'`);
      cursor += gap;
    }
  }

  const listPath = path.join(partsDir, 'concat.txt');
  fs.writeFileSync(listPath, listLines.join('\n') + '\n', 'utf8');

  const voicePath = path.join(workDir, 'voice.mp3');
  await runFfmpeg(concatArgs({ listPath, outputPath: voicePath }));

  return {
    voicePath,
    timings,
    made, skipped, failed,
    spentUsd: round4(spentUsd),
    totalSeconds: round2(await audioSeconds(voicePath)),
    stoppedBy,
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

/**
 * 장면·샷 길이를 **실제로 잰 음성 길이**로 맞춘다.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 자막만 고치면 안 되는가
 * ─────────────────────────────────────────────────────────────
 *
 * 처음엔 자막에만 실제 타이밍을 넘겼다. 그런데 **영상은 여전히 추정치로
 * 잘린다.** 장면 전환과 샷 길이가 "330자에 1분"으로 계산돼 있으니까.
 *
 * 그러면 자막은 음성에 맞고 그림은 안 맞는, 더 나쁜 상태가 된다. 둘 다
 * 추정치면 적어도 서로는 맞았는데.
 *
 * 그래서 **장면 데이터 자체를 고친다.** 문단 길이를 실제 값으로 바꾸고,
 * 장면 길이와 샷 길이를 그 비율대로 다시 나눈다. 그러면 자막·타임라인·
 * 쇼츠 구간이 전부 같은 숫자를 보게 된다 — 따로 넘겨줄 필요가 없다.
 *
 * 문단 쉼(PAUSE_SECONDS)은 그 문단 뒤에 붙여서 센다. 쉼 동안 화면이
 * 멈춰 있으면 안 되기 때문이다.
 */
export function applyTimings(scenes, timings) {
  const byId = new Map((timings || []).map((t) => [t.id, t]));
  if (!byId.size) return scenes || [];

  return (scenes || []).map((scene) => {
    const paragraphs = (scene.paragraphs || []).map((p, i) => {
      const id = `S${String(scene.scene_number).padStart(2, '0')}-P${i + 1}`;
      const t = byId.get(id);
      if (!t) return p;
      // 쉼까지 포함한 길이. 마지막 문단에는 쉼이 없지만, 조금 길게 잡는 쪽이
      // 짧게 잡는 쪽보다 낫다 — 화면이 먼저 끝나면 검은 화면이 남는다.
      return { ...p, seconds: round2(t.seconds + PAUSE_SECONDS) };
    });

    const duration = round2(paragraphs.reduce((s, p) => s + (Number(p.seconds) || 0), 0));
    const oldDuration = (scene.shots || []).reduce((s, x) => s + (Number(x.duration) || 0), 0);

    // 샷 길이를 새 장면 길이에 비례해 다시 나눈다. 샷의 개수와 순서는
    // 그대로 둔다 — 그림은 이미 그 샷 번호로 만들어져 있다.
    const shots = (scene.shots || []).map((shot) => ({
      ...shot,
      duration: oldDuration > 0 ? round2((Number(shot.duration) || 0) * (duration / oldDuration)) : shot.duration,
    }));

    return { ...scene, paragraphs, duration, shots };
  });
}
