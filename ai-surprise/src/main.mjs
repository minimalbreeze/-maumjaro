#!/usr/bin/env node
// AI 서프라이즈 — Phase 1 명령줄 도구.
//
// 쓰는 법:
//   node src/main.mjs collect              소재 찾아서 심사하고 보관함에 넣기
//   node src/main.mjs collect --count=3    3건만
//   node src/main.mjs list                 보관함과 제작 중인 편 보기
//   node src/main.mjs script <파일명>      보관함의 소재로 대본 쓰기
//   node src/main.mjs script --id=001      이미 제작에 들어간 편의 대본 다시 쓰기
//
// 기획서 18번: 완전 자동 업로드를 기본값으로 하지 않는다.
// 그래서 collect는 보관함까지만 간다. 대본은 사람이 소재를 고른 뒤에 쓴다.

import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { log } from './utils/logger.mjs';
import { missingKeys, env, ROOT } from './utils/env.mjs';
import { usageSummary, MODELS } from './ai/client.mjs';
import { collect } from './research/collect.mjs';
import { scoreAll } from './research/score.mjs';
import { writeScript, validateScript, DEFAULT_MINUTES, TALE_MINUTES, SPORTS_MINUTES } from './script/write.mjs';
import { GATE, MIN_SOURCE_COUNT, KIND, makeTale, makeSports } from './model.mjs';
import { uploadChecklist, checkTitle } from './policy.mjs';
import { splitIntoScenes } from './scenes/split.mjs';
import { designAllScenes } from './scenes/visuals.mjs';
import { isFatalApiError } from './ai/client.mjs';
import { assignAssetTypes, assignSound, estimateCost, DEFAULT_VIDEO_RATIO, ASSET_TYPE } from './scenes/assets.mjs';
import { spawn } from 'node:child_process';
import { generateImages, shotsToGenerate, cardShots, estimateUsd, DEFAULT_MAX_USD } from './assets/images.mjs';
import { renderCardImage } from './video/card.mjs';
import { previewJobs, previewScenesFor } from './assets/preview.mjs';
import { portraitJobs, PORTRAIT_NEGATIVE, VARIANTS_PER_PERSON } from './assets/portrait.mjs';
import {
  narrate,
  narrationUnits,
  applyTimings,
  DEFAULT_MAX_USD as DEFAULT_TTS_MAX_USD,
} from './audio/narrate.mjs';
import { SAMPLE_TEXT, pickSampleVoices, sampleFileName } from './audio/sample.mjs';
import { makeUploadPack, finishDescription } from './upload/pack.mjs';
import { thumbnailArgs, pickThumbnailMoments } from './upload/thumbnail.mjs';
import {
  createClient as createTtsClient,
  estimateUsd as estimateTtsUsd,
  DEFAULT_VOICE,
  voiceFor,
  speakingRateFor,
} from './audio/tts.mjs';
import { loadTracks, pickTrack, mixArgs, attributionText } from './audio/bgm.mjs';
import { modelFor, DEFAULT_IMAGE_MODEL, createClient as createReplicate } from './assets/replicate.mjs';
import { FORMATS, buildAss, buildCues, renderSrt } from './video/subtitle.mjs';
import { buildTimeline } from './video/plan.mjs';
import { pickShorts } from './video/shorts.mjs';
import { renderTimeline, renderShort, probe } from './video/render.mjs';
import {
  saveToInbox,
  listInbox,
  listContent,
  knownTitles,
  promoteToContent,
  saveScript,
  saveScenes,
  saveVideoPlan,
  saveNarration,
  loadNarration,
  loadContent,
  INBOX_DIR,
  contentPath,
  saveUploadPack,
  fileSlug,
} from './store.mjs';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      flags[k] = v === undefined ? true : v;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function requireApiKey() {
  const missing = missingKeys(['ANTHROPIC_API_KEY']);
  if (missing.length) {
    log.error('ANTHROPIC_API_KEY 가 없습니다.');
    log.info('ai-surprise/.env 파일을 만들고 아래 한 줄을 넣어주세요:');
    log.info('  ANTHROPIC_API_KEY=sk-ant-...');
    log.info('키는 https://console.anthropic.com 에서 발급합니다.');
    process.exit(1);
  }
}

const GATE_LABEL = {
  [GATE.AUTO_OK]: '통과',
  [GATE.REVIEW_NEEDED]: '검토 필요',
  [GATE.BLOCKED]: '다룰 수 없음',
};

/** 소재 카드 한 장을 글로 그린다 (기획서 4번). */
function printCard(item, index) {
  const star = item.recommended ? ' ⭐추천' : '';
  log.raw('');
  log.raw(`┌─ ${index != null ? `${index}. ` : ''}${item.title}${star}`);
  log.raw(`│  ${item.summary}`);
  log.raw(`│`);
  log.raw(`│  분야: ${item.category}`);
  log.raw(`│  점수: ${item.final_score}/100   위험도: ${item.risk_score}/100   사실성: ${item.fact_status}`);
  log.raw(`│  관문: ${GATE_LABEL[item.gate] || item.gate}`);
  for (const r of item.gate_reasons || []) log.raw(`│    · ${r}`);
  log.raw(`│  출처 ${item.source_count}개:`);
  for (const s of (item.sources || []).slice(0, 4)) {
    log.raw(`│    · [${s.kind || '?'}] ${s.name || ''} ${s.url || ''}`);
  }
  if (item._file) log.raw(`│  파일: ${item._file}`);
  log.raw(`└─`);
}

// ─────────────────────────────────────────────────────────────

async function cmdCollect(flags) {
  requireApiKey();
  const count = Number(flags.count || 5);
  const category = typeof flags.category === 'string' ? flags.category : null;
  const topic = typeof flags.topic === 'string' && flags.topic.trim() ? flags.topic.trim() : null;
  // 전설 추적 편. 사건의 1차 기록이 없는 걸 전제로, 이야기의 출처를 쫓는다.
  const legend = Boolean(flags.legend) && Boolean(topic);
  if (flags.legend && !topic) {
    log.error('--legend 는 --topic 과 함께 써야 합니다. 어떤 이야기를 추적할지 정해야 합니다.');
    process.exit(1);
  }

  log.section(
    topic
      ? `🔍 ${legend ? '전설 추적' : '소재 조사'}  |  "${topic}"  |  모델 ${MODELS.collect}`
      : `🔍 소재 수집  |  ${count}건 요청  |  모델 ${MODELS.collect}`
  );

  const avoid = knownTitles();
  // 소재를 지정했으면 "이미 다룬 것 제외"를 걸지 않는다. 같은 소재를 다시
  // 만들려는 것일 수도 있고, 어차피 하나만 조사하므로 제외 목록이 방해만 된다.
  if (!topic && avoid.length) log.info(`이미 다룬 소재 ${avoid.length}건은 제외합니다.`);

  const found = await collect({
    count,
    category,
    topic,
    legend,
    avoidTitles: topic ? [] : avoid,
    onProgress: (m) => log.step(m),
  });

  if (!found.items.length) {
    log.warn(topic ? `"${topic}" 는 기준을 통과하지 못했습니다.` : '기준을 통과한 소재가 없습니다.');
    if (found.searchNotes) log.info(`조사 메모: ${found.searchNotes}`);
    if (topic) log.info('위 메모를 읽고 다른 소재를 골라 주세요. 억지로 통과시키지 않는 게 맞습니다.');
    return;
  }
  log.ok(`${found.items.length}건을 찾았습니다. 이제 심사합니다.`);
  if (found.searchNotes) log.info(`조사 메모: ${found.searchNotes}`);

  log.section(`⚖️  소재 심사  |  모델 ${MODELS.score}`);
  // 전설 추적 편은 여기서 종류를 박는다. 관문(1차 기록 없으면 차단)과
  // 대본(ORIGIN 섹션 필수)이 둘 다 이 값을 보고 갈린다.
  const tagged = found.items.map((i) => ({ ...i, kind: legend ? KIND.LEGEND : KIND.EVENT }));
  const { items, failures } = await scoreAll(tagged, { onProgress: (m) => log.step(m) });

  for (const f of failures) log.warn(`심사 실패: ${f.title} — ${f.error}`);

  const kept = [];
  for (const item of items) {
    if (item.gate === GATE.BLOCKED) {
      log.warn(`버림: ${item.title} — ${(item.gate_reasons || []).join(', ')}`);
      // 왜 막혔는지 자세히 찍는다.
      //
      // 예전에는 한 줄("생존 인물에 대한 근거 없는 의혹")만 찍고 끝냈다.
      // 그런데 막힌 소재는 보관함에도 안 들어가므로, 사람이 **판단할 자료가
      // 하나도 없이** 결과만 통보받는 꼴이었다. 관문이 과하게 걸린 건지
      // 진짜 위험한 건지 알 길이 없다.
      //
      // 관문의 목적은 사람을 대신해 결정하는 게 아니라 사람이 결정할 수
      // 있게 하는 것이다. 그래서 심사 메모와 출처를 같이 보여준다.
      if (item.risk_notes) log.info(`  심사 메모: ${item.risk_notes}`);
      if (item.what_is_strange) log.info(`  이상한 점: ${item.what_is_strange}`);
      if ((item.risk_flags || []).length) log.info(`  위험 표시: ${item.risk_flags.join(', ')}`);
      for (const src of (item.sources || []).slice(0, 5)) {
        log.info(`  출처: [${src.kind || '?'}] ${src.name || ''} ${src.url || ''}`);
      }
      log.info('  이 판정이 과하다고 보시면 소재를 좁혀 다시 지정하거나, 사람이 직접 확인해 주세요.');
      continue;
    }
    saveToInbox(item);
    kept.push(item);
  }

  log.section(`📋 보관함에 들어간 소재 ${kept.length}건`);
  kept.sort((a, b) => b.final_score - a.final_score).forEach((item, i) => printCard(item, i + 1));

  const needReview = kept.filter((i) => i.gate === GATE.REVIEW_NEEDED).length;
  log.raw('');
  log.ok(`보관함: ${INBOX_DIR}`);
  if (needReview) {
    log.warn(`${needReview}건은 검토가 필요합니다. 출처를 ${MIN_SOURCE_COUNT}개 이상 직접 열어보고 판단해 주세요.`);
  }
  log.info('대본을 쓰려면: node src/main.mjs script <파일명>');
  printUsage();
}

function cmdList() {
  const inbox = listInbox();
  const contents = listContent();

  log.section(`📋 소재 보관함 ${inbox.length}건`);
  if (!inbox.length) {
    log.info('비어 있습니다. node src/main.mjs collect 로 모아보세요.');
  } else {
    inbox.forEach((item, i) => printCard(item, i + 1));
  }

  log.section(`🎬 제작 중인 편 ${contents.length}개`);
  if (!contents.length) {
    log.info('아직 없습니다.');
  } else {
    for (const c of contents) {
      const check = c.script ? '대본 있음' : '대본 없음';
      log.raw(`  ${c.id}  [${c.research.status}]  ${c.research.title}  (${check})`);
    }
  }
}

async function cmdScript(positional, flags) {
  requireApiKey();
  // 기본 길이는 **편의 종류가 정한다.** 여기서 8분을 박아두면 동화도
  // 8분으로 쓰라고 시키게 되고, 8분짜리 동화는 설명이 들어간다.
  // 소재를 읽기 전이라 아래에서 다시 정한다.
  let id;
  let item;

  if (flags.id) {
    // 이미 제작에 들어간 편의 대본을 다시 쓴다.
    id = String(flags.id).padStart(3, '0');
    const loaded = loadContent(id);
    if (!loaded) {
      log.error(`content/${id} 을 찾을 수 없습니다. node src/main.mjs list 로 확인해 주세요.`);
      process.exit(1);
    }
    item = loaded.research;
  } else {
    // 보관함에서 고른다.
    const name = positional[0];
    if (!name) {
      log.error('어떤 소재로 쓸지 알려주세요.');
      log.info('  node src/main.mjs list            보관함 보기');
      log.info('  node src/main.mjs script <파일명>  그 소재로 대본 쓰기');
      process.exit(1);
    }
    const file = path.join(INBOX_DIR, name.endsWith('.json') ? name : `${name}.json`);
    if (!fs.existsSync(file)) {
      log.error(`보관함에 ${name} 이 없습니다.`);
      log.info('node src/main.mjs list 로 파일명을 확인해 주세요.');
      process.exit(1);
    }
    item = JSON.parse(fs.readFileSync(file, 'utf8'));

    // 기획서 18번의 1단계 승인. 검토 필요 소재는 사람이 명시적으로 넘겨야 한다.
    if (item.gate === GATE.REVIEW_NEEDED && !flags.force) {
      log.section('⚠️  이 소재는 검토가 필요합니다');
      printCard(item);
      log.raw('');
      log.warn('아래 이유로 자동 진행을 멈췄습니다:');
      for (const r of item.gate_reasons || []) log.info(`· ${r}`);
      log.raw('');
      log.info('출처를 직접 열어보고 괜찮다고 판단하셨으면 --force 를 붙여 다시 실행해 주세요:');
      log.info(`  node src/main.mjs script ${name} --force`);
      process.exit(2);
    }
    if (item.gate === GATE.BLOCKED) {
      log.error('이 소재는 다룰 수 없습니다. --force 로도 진행되지 않습니다.');
      for (const r of item.gate_reasons || []) log.info(`· ${r}`);
      process.exit(2);
    }

    ({ id } = promoteToContent(item));
    log.ok(`content/${id} 으로 올렸습니다.`);
  }

  const targetMinutes = Number(flags.minutes) > 0
    ? Number(flags.minutes)
    : minutesFor(item?.kind);

  log.section(`✍️  대본 작성  |  content/${id}  |  약 ${targetMinutes}분  |  모델 ${MODELS.script}`);
  log.info(`소재: ${item.title}`);

  const { markdown, check } = await writeScript(item, {
    targetMinutes,
    onProgress: (m) => log.step(m),
  });

  saveScript(id, markdown, check);

  log.raw('');
  log.info(`나레이션 ${check.stats.narrationChars}자 (약 ${check.stats.estimatedMinutes}분)`);
  log.info(`HOOK ${check.stats.hookChars}자`);
  log.info(
    `태그 — ${Object.entries(check.stats.tagCounts).map(([k, v]) => `${k} ${v}`).join(' / ')}`
  );
  log.info(`섹션 ${check.stats.sectionsFound}/${check.stats.sectionsExpected}개`);

  for (const w of check.warnings) log.warn(w);

  if (check.ok) {
    log.ok(`대본 완성: ${contentPath(id, 'script.md')}`);
    log.info('기획서 18번의 2단계입니다. 대본을 직접 읽어보고 승인해 주세요.');
  } else {
    log.error('대본이 양식을 통과하지 못했습니다. 두 번 시도했지만 아래가 남았습니다:');
    for (const e of check.errors) log.info(`· ${e}`);
    log.info(`대본은 저장했습니다: ${contentPath(id, 'script.md')}`);
    log.info('직접 고치거나, node src/main.mjs script --id=' + id + ' 로 다시 시도할 수 있습니다.');
  }
  printUsage();
}

/**
 * 대본 → 장면·샷·프롬프트 (Phase 2).
 *
 * 쪼개는 건 코드가, 화면 설계는 AI가 한다.
 */
async function cmdScenes(flags) {
  const id = String(flags.id || '').padStart(3, '0');
  if (!flags.id) {
    log.error('어떤 편의 장면을 만들지 알려주세요.');
    log.info('  node src/main.mjs list              제작 중인 편 보기');
    log.info('  node src/main.mjs scenes --id=001   그 편의 장면 만들기');
    process.exit(1);
  }

  // 이미 만들어 둔 장면이 있으면 다시 만들지 않는다.
  //
  // 장면 만들기는 AI를 부르므로 돈이 든다. 실행이 뒤 단계에서 실패해 다시
  // 돌릴 때, 똑같은 장면을 또 사느라 돈을 내는 일이 없어야 한다.
  //
  // **조사 기록을 읽기 전에** 본다. 장면이 이미 있으면 research.json 이
  // 빠져 있어도 할 일이 없는데, 뒤에 두면 그 때문에 멈춰 버린다.
  if (fs.existsSync(contentPath(id, 'scenes.json')) && !flags.force) {
    log.ok(`content/${id}/scenes.json 이 이미 있습니다. 다시 만들지 않습니다 (돈을 아낍니다).`);
    log.info('새로 만들려면 --force 를 붙이세요.');
    return;
  }

  const loaded = loadContent(id);
  if (!loaded) {
    log.error(`content/${id} 을 찾을 수 없습니다. node src/main.mjs list 로 확인해 주세요.`);
    process.exit(1);
  }
  if (!loaded.script) {
    log.error(`content/${id} 에 대본이 없습니다. 먼저 대본을 써야 합니다:`);
    log.info(`  node src/main.mjs script --id=${id}`);
    process.exit(1);
  }

  // 기획서 18번의 2단계. 양식을 통과하지 못한 대본으로 장면을 만들지 않는다.
  if (loaded.research.status === 'SCRIPTING' && !flags.force) {
    log.error('이 편의 대본은 양식 검사를 통과하지 못했습니다.');
    log.info(`content/${id}/script-check.json 을 확인하고 대본을 고쳐주세요.`);
    log.info('그래도 진행하려면 --force 를 붙이세요.');
    process.exit(2);
  }

  const videoRatio = flags['video-ratio'] !== undefined
    ? Number(flags['video-ratio'])
    : Number(env('VIDEO_SHOT_RATIO', String(DEFAULT_VIDEO_RATIO)));

  // ── 1단계: 코드가 쪼갠다 (AI 안 씀, 비용 0원)
  log.section(`✂️  장면 분할  |  content/${id}  |  코드가 처리 (비용 0원)`);
  const split = splitIntoScenes(loaded.script, {
    // 기획 파일이 자기 단락 차례를 들고 왔으면 그걸 쓴다. 안 그러면
    // FA 전용 이름(ACE·OUTFIELD·CATCHER)에 억지로 끼워 맞추게 된다.
    sections: loaded.research?.sections || null,
    targetScenes: flags.scenes ? Number(flags.scenes) : null,
    // 창작 동화는 섹션도 태그도 다르다. 안 넘기면 실화 기준으로 읽고
    // "섹션이 없습니다"로 전부 막힌다.
    kind: loaded.research?.kind,
  });

  if (split.problems.length) {
    log.error('대본에 문제가 있어 장면을 만들 수 없습니다:');
    for (const p of split.problems) log.info(`· ${p}`);
    process.exit(2);
  }

  log.ok(`장면 ${split.stats.sceneCount}개, 샷 ${split.stats.shotCount}개`);
  log.info(`전체 ${split.stats.totalSeconds}초 (약 ${(split.stats.totalSeconds / 60).toFixed(1)}분), 나레이션 ${split.stats.totalChars}자`);
  log.info(`장면 길이 ${split.stats.shortestScene}~${split.stats.longestScene}초`);
  if (split.stats.outsideTargetRange) {
    log.warn(`장면이 ${split.stats.sceneCount}개입니다. 기획서 목표는 12~15개입니다 — 대본 길이 때문일 수 있습니다.`);
  }

  if (flags['dry-run']) {
    log.raw('');
    log.info('미리보기입니다. 화면 설계(AI)를 하지 않고 여기서 멈춥니다.');
    for (const s of split.scenes) {
      log.raw(`  장면 ${s.scene_number} [${s.section}] ${s.duration}초 · 샷 ${s.shots.length}개 · ${s.tags.join('+')}`);
      log.raw(`     ${s.narration.slice(0, 60)}${s.narration.length > 60 ? '…' : ''}`);
    }
    return;
  }

  // ── 2단계: AI가 화면을 설계한다
  requireApiKey();
  log.section(`🎨 화면 설계  |  장면 ${split.scenes.length}개  |  모델 ${MODELS.script}`);
  const designed = await designAllScenes(split.scenes, {
    item: loaded.research,
    onProgress: (m) => log.step(m),
  });

  // ── 3단계: 코드가 이미지/영상을 배분하고 소리를 배정한다
  log.section('💡 이미지·영상 배분과 소리');
  let scenes = assignAssetTypes(designed.scenes, { videoRatio });
  scenes = assignSound(scenes);

  const cost = estimateCost(scenes);
  const problems = [...designed.problems];

  const shots = scenes.flatMap((s) => s.shots);
  const videoShots = shots.filter((s) => s.asset_type === ASSET_TYPE.VIDEO);
  log.info(`AI 영상 ${videoShots.length}개 / 이미지 ${shots.length - videoShots.length}개 (영상 비중 ${Math.round(videoRatio * 100)}%)`);
  log.info(`AI 영상 길이 합계 ${cost.videoSeconds}초`);
  const realPersonShots = shots.filter((s) => s.depicts_real_person).length;
  if (realPersonShots) {
    log.info(`실존 인물이 보이는 샷 ${realPersonShots}개 — 전부 이미지로 고정했습니다.`);
  }
  const sfxScenes = scenes.filter((s) => s.sound_effect).length;
  log.info(`효과음 ${sfxScenes}/${scenes.length} 장면 (과도하게 쓰지 않도록 상한을 둡니다)`);

  log.raw('');
  log.raw('  장면별:');
  for (const s of scenes) {
    const v = s.shots.filter((x) => x.asset_type === ASSET_TYPE.VIDEO).length;
    log.raw(
      `  ${String(s.scene_number).padStart(2)} [${s.section}] ${String(s.duration).padStart(6)}초 · ` +
        `샷 ${s.shots.length}(영상 ${v}) · ${s.mood}${s.sound_effect ? ' · ' + s.sound_effect : ''}`
    );
    if (s.visual_description) log.raw(`     ${s.visual_description}`);
  }

  saveScenes(id, { scenes, stats: split.stats, problems, cost });

  log.section('💰 Phase 3 예상 에셋 비용');
  log.info(`이미지 ${cost.imageCount}장 → $${cost.imageUsd}`);
  log.info(`AI 영상 ${cost.videoCount}클립 ${cost.videoSeconds}초 → $${cost.videoUsd}`);
  log.info(`합계 약 $${cost.totalUsd}`);
  log.info(cost.note);

  log.raw('');
  if (problems.length) {
    log.error(`확인이 필요한 문제 ${problems.length}건 — 상태를 SCENES_READY로 올리지 않았습니다:`);
    for (const p of problems) log.info(`· ${p}`);
    log.info(`파일은 저장했습니다: ${contentPath(id, 'scenes.json')}`);
  } else {
    log.ok(`장면 완성: ${contentPath(id, 'scenes.json')}`);
    log.info(`Phase 3 입력: ${contentPath(id, 'prompts.json')}`);
  }
  printUsage();
}

/**
 * 화면 프롬프트 → 실제 이미지 파일 (Phase 3).
 *
 * 여기가 처음으로 "장당 돈이 나가는" 단계다. 그래서 기본값이 보수적이다.
 *  - 모델은 싼 쪽(schnell)이 기본
 *  - 비용 상한이 걸려 있고, 넘으면 멈춘다
 *  - --dry-run 으로 몇 장에 얼마인지 먼저 볼 수 있다 (비용 0원)
 */
/**
 * 올릴 때 필요한 것들을 만든다 (제목·썸네일·설명문·태그).
 *
 * 썸네일은 **완성된 영상에서 프레임을 떼어** 글자를 얹는다. 따로 그리면
 * "영상에 없는 장면"이 되기 쉽고, 그건 유튜브가 영상을 내리는 사유다.
 */
/**
 * 창작 동화 한 편을 시작한다 (KIND.TALE).
 *
 * 조사 단계가 없다. 소재를 웹에서 찾지 않고 **사람이 준다.** 그래서
 * 여기서 돈이 드는 것은 대본 한 번뿐이다.
 *
 * 비트 시트(beats)를 넘기면 대본이 그 순서대로 나온다. 안 넘기면 AI가
 * 전개를 혼자 정하는데, 그러면 편마다 전개가 비슷해진다 — 양산물로 보이는
 * 가장 빠른 길이다. 되도록 넘긴다.
 */
/**
 * 기획·대본 파일을 찾는다.
 *
 * ROOT 는 ai-surprise 폴더인데, 기획 파일은 리포 맨 위의 이상한동화/ 에
 * 있다. 그래서 "이상한동화/1화.json" 을 그대로 쓰면 못 찾고, 쓰는 쪽이
 * ../ 를 붙여야 했다. 그건 틀리기 쉽고, 틀리면 워크플로가 그 자리에서
 * 죽는다. 두 군데를 다 본다.
 */
function findPlanFile(given) {
  const raw = String(given);
  if (path.isAbsolute(raw)) return fs.existsSync(raw) ? raw : null;
  for (const base of [ROOT, path.join(ROOT, '..')]) {
    const full = path.resolve(base, raw);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** 이 종류의 기본 길이. 한 곳에만 둔다 — 두 곳에 적으면 한쪽만 고친다. */
function minutesFor(kind) {
  if (kind === KIND.TALE) return TALE_MINUTES;
  if (kind === KIND.SPORTS) return SPORTS_MINUTES;
  return DEFAULT_MINUTES;
}

async function cmdTale(flags) {
  // 사람이 쓴 대본을 그대로 쓰는 길.
  //
  // ─────────────────────────────────────────────────────────────
  // 왜 이 입구가 필요한가
  // ─────────────────────────────────────────────────────────────
  //
  // AI에게 대본을 시키면 **한 번 뽑고 끝**이다. 마음에 안 들면 돈을 다시
  // 쓰고 다시 뽑아야 하고, 어디가 왜 좋아졌는지는 아무도 모른다.
  //
  // 글은 고쳐 쓰는 물건이다. 쓰고, 재고, 고치고, 사람이 읽고 또 고친다.
  // 그 과정을 파일 하나로 두면 고친 것이 그대로 남고, 비용이 0원이고,
  // **효성님이 직접 손댄 문장이 그대로 영상이 된다.**
  //
  // 그리고 이게 '진정성 없는 콘텐츠' 쪽에서도 유일하게 진짜 방어다.
  // AI가 쓰든 사람이 쓰든, 사람이 읽고 고친 흔적이 남는 것이 중요하다.
  const scriptFile = flags.script ? String(flags.script) : null;
  // 대본을 주면 AI를 아예 안 부른다. 그래서 키도 필요 없다.
  if (!scriptFile) requireApiKey();

  // 기획 파일로 받는 쪽이 기본이다. 비트 시트를 명령줄에 넣을 수는 없다.
  let plan = {};
  if (flags.plan) {
    const file = findPlanFile(flags.plan);
    if (!file) {
      log.error(`기획 파일을 찾을 수 없습니다: ${flags.plan}`);
      log.info(`${ROOT} 와 그 윗 폴더에서 찾아봤습니다.`);
      process.exit(1);
    }
    try {
      plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      log.fail(`기획 파일을 읽을 수 없습니다: ${file}`, err);
      process.exit(1);
    }
  }

  // 명령줄 값이 파일보다 우선한다. 파일을 그대로 두고 제목만 바꿔볼 수 있다.
  const title = String(flags.title || plan.title || '').trim();
  if (!title) {
    log.error('제목을 알려주세요.');
    log.info('  node src/main.mjs tale --title="그림자가 먼저 집에 가는 아이" --premise="..."');
    log.info('  node src/main.mjs tale --plan=이상한동화/1화.json');
    process.exit(1);
  }

  const item = makeTale({
    title,
    premise: flags.premise || plan.premise || '',
    strange: flags.strange || plan.strange || '',
    beats: plan.beats || [],
    lastLine: flags['last-line'] || plan.last_line || '',
  });

  const targetMinutes = Number(flags.minutes) > 0 ? Number(flags.minutes) : TALE_MINUTES;

  log.section(
    `📖 이상한 동화  |  약 ${targetMinutes}분  |  ` +
      (scriptFile ? '사람이 쓴 대본 (비용 0원)' : `모델 ${MODELS.script}`)
  );
  log.info(`제목: ${item.title}`);
  if (item.summary) log.info(`설정: ${item.summary}`);
  log.info(`비트 ${item.beats.length}개` + (item.beats.length ? '' : ' — 전개를 AI가 혼자 정합니다'));
  if (!item.beats.length) {
    log.warn('비트 시트 없이 쓰면 편마다 전개가 비슷해집니다. --plan 으로 넘기는 쪽을 권합니다.');
  }
  for (const r of item.gate_reasons || []) log.info(`· ${r}`);

  const { id } = promoteToContent(item);
  log.ok(`content/${id} 으로 올렸습니다.`);

  let markdown;
  let check;
  if (scriptFile) {
    const file = findPlanFile(scriptFile);
    if (!file) {
      log.error(`대본 파일을 찾을 수 없습니다: ${scriptFile}`);
      log.info(`${ROOT} 와 그 윗 폴더에서 찾아봤습니다.`);
      process.exit(1);
    }
    markdown = fs.readFileSync(file, 'utf8');
    log.ok(`대본을 읽었습니다: ${scriptFile}`);
    // 사람이 썼다고 검사를 건너뛰지 않는다. 섹션이 빠지거나 태그가 틀리면
    // 다음 단계가 조용히 이상하게 돌아간다.
    check = validateScript(markdown, { targetMinutes, kind: item.kind, sections: item.sections });
  } else {
    ({ markdown, check } = await writeScript(item, {
      targetMinutes,
      onProgress: (m) => log.step(m),
    }));
  }
  saveScript(id, markdown, check);

  log.raw('');
  log.info(`나레이션 ${check.stats.narrationChars}자 (약 ${check.stats.estimatedMinutes}분)`);
  log.info(`HOOK ${check.stats.hookChars}자`);
  log.info(`섹션 ${check.stats.sectionsFound}/${check.stats.sectionsExpected}개`);
  for (const w of check.warnings) log.warn(w);

  if (check.ok) {
    log.ok(`대본 완성: ${contentPath(id, 'script.md')}`);
    log.raw('');
    log.info(`다음: node src/main.mjs auto --resume=${id} --scenes --images --narrate --video`);
  } else {
    log.error('대본이 양식을 통과하지 못했습니다:');
    for (const e of check.errors) log.info(`· ${e}`);
    log.info(`대본은 저장했습니다: ${contentPath(id, 'script.md')}`);
    process.exitCode = 2;
  }
}

async function cmdSports(flags) {
  // 스포츠 분석 한 편을 올린다.
  //
  // ─────────────────────────────────────────────────────────────
  // 대본을 AI 에게 맡기지 않는다
  // ─────────────────────────────────────────────────────────────
  //
  // 동화는 --script 가 선택이었다. 지어낸 이야기라서 AI 가 혼자 써도
  // 틀릴 것이 없었기 때문이다.
  //
  // 스포츠는 다르다. 날짜·금액·규정·계약 상태가 전부 **틀릴 수 있는
  // 사실**이고, AI 는 모르는 것을 그럴듯하게 채운다. 한 번 틀린 숫자를
  // 내보내면 그걸 보고 들어온 사람이 바로 알아채고, 채널 신뢰가 끝난다.
  //
  // 그래서 이 입구는 **사람이 쓴 대본만 받는다.** 사실은 사람이 확인한다.
  const scriptFile = flags.script ? String(flags.script) : null;
  if (!scriptFile) {
    log.error('스포츠 편은 사람이 쓴 대본이 있어야 합니다.');
    log.info('날짜·금액·규정은 AI 가 지어낼 수 있어서, 사실은 사람이 확인한 것만 씁니다.');
    log.info('  node src/main.mjs sports --plan=스포츠영상/1화.json --script=스포츠영상/1화-대본.md');
    process.exit(1);
  }

  let plan = {};
  if (flags.plan) {
    const file = findPlanFile(flags.plan);
    if (!file) {
      log.error(`기획 파일을 찾을 수 없습니다: ${flags.plan}`);
      log.info(`${ROOT} 와 그 윗 폴더에서 찾아봤습니다.`);
      process.exit(1);
    }
    try {
      plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      log.fail(`기획 파일을 읽을 수 없습니다: ${file}`, err);
      process.exit(1);
    }
  }

  const title = String(flags.title || plan.title || '').trim();
  if (!title) {
    log.error('제목을 알려주세요.');
    log.info('  node src/main.mjs sports --plan=스포츠영상/1화.json --script=스포츠영상/1화-대본.md');
    process.exit(1);
  }

  const item = makeSports({
    title,
    premise: flags.premise || plan.premise || '',
    angle: flags.angle || plan.angle || '',
    beats: plan.beats || [],
    sources: plan.sources || [],
    people: plan.people || [],
    // 편마다 단락 차례가 다르다. 1화의 ACE·OUTFIELD·CATCHER 는 2화에
    // 아무 뜻이 없다. 안 주면 FA 전용 기본값으로 돌아간다.
    sections: plan.sections || null,
  });

  const targetMinutes = Number(flags.minutes) > 0 ? Number(flags.minutes) : SPORTS_MINUTES;

  log.section(`⚾ 스포츠 분석  |  약 ${targetMinutes}분  |  사람이 쓴 대본 (대본 비용 0원)`);
  log.info(`제목: ${item.title}`);
  if (item.summary) log.info(`한 줄: ${item.summary}`);
  log.info(`출처 ${item.source_count}개`);
  // 생김새가 비면 샷마다 다른 사람이 나온다. 돈을 쓰기 전에 알려 준다.
  if (item.sections?.length) {
    log.info(`이 편의 단락 ${item.sections.length}개: ${item.sections.map((x) => x.key).join(' → ')}`);
  }
  if (item.people?.length) {
    log.info(`생김새를 적어 둔 사람 ${item.people.length}명: ${item.people.map((p) => p.name).join(', ')}`);
  } else {
    log.warn('생김새를 적어 둔 사람이 없습니다 — 그림의 인물이 샷마다 다른 얼굴로 나옵니다.');
    log.info('기획 파일에 people 을 넣어 주세요 (스포츠영상/선수-생김새.md 참고).');
  }
  if (!item.source_count) {
    log.warn('출처가 없습니다. 설명문에 적을 근거가 없다는 뜻입니다 — 기획 파일에 sources 를 넣어 주세요.');
  }
  for (const r of item.gate_reasons || []) log.info(`· ${r}`);

  const { id } = promoteToContent(item);
  log.ok(`content/${id} 으로 올렸습니다.`);

  const file = findPlanFile(scriptFile);
  if (!file) {
    log.error(`대본 파일을 찾을 수 없습니다: ${scriptFile}`);
    log.info(`${ROOT} 와 그 윗 폴더에서 찾아봤습니다.`);
    process.exit(1);
  }
  const markdown = fs.readFileSync(file, 'utf8');
  log.ok(`대본을 읽었습니다: ${scriptFile}`);

  // 사람이 썼다고 검사를 건너뛰지 않는다. 오히려 이쪽이 더 중요하다 —
  // 확인되지 않은 것을 [FACT] 로 적었는지를 태그 검사가 본다.
  const check = validateScript(markdown, { targetMinutes, kind: item.kind, sections: item.sections });
  saveScript(id, markdown, check);

  log.raw('');
  log.info(`나레이션 ${check.stats.narrationChars}자 (약 ${check.stats.estimatedMinutes}분)`);
  log.info(`HOOK ${check.stats.hookChars}자`);
  log.info(`섹션 ${check.stats.sectionsFound}/${check.stats.sectionsExpected}개`);
  const tags = check.stats.tagCounts || {};
  log.info(`태그 — 확인된 사실 ${tags.FACT || 0} · 전망 ${tags.THEORY || 0} · 미확인 ${tags.UNKNOWN || 0}`);
  if (!tags.FACT) {
    log.warn('[FACT] 가 하나도 없습니다. 근거 없이 전망만 늘어놓은 영상이 됩니다.');
  }
  for (const w of check.warnings) log.warn(w);

  if (check.ok) {
    log.ok(`대본 완성: ${contentPath(id, 'script.md')}`);
    log.raw('');
    log.info(`다음: node src/main.mjs auto --resume=${id} --scenes --images --narrate --video`);
  } else {
    log.error('대본이 양식을 통과하지 못했습니다:');
    for (const e of check.errors) log.info(`· ${e}`);
    log.info(`대본은 저장했습니다: ${contentPath(id, 'script.md')}`);
    process.exitCode = 2;
  }
}

async function cmdPreview(flags) {
  // 화풍만 몇 장 뽑아 본다.
  //
  // 화풍을 고칠 때마다 완성본을 돌리면 한 번에 $0.23 에 25분이다.
  // 얼굴 하나 다듬자고 그걸 되풀이할 수 없어서 따로 뒀다.
  const kind = String(flags.kind || KIND.SPORTS).toUpperCase();
  const scenes = previewScenesFor(kind);
  if (!scenes.length) {
    log.error(`${kind} 는 미리 볼 장면이 정해져 있지 않습니다.`);
    log.info('지금 되는 것: SPORTS');
    process.exit(1);
  }

  const models = String(flags.models || 'schnell,dev')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  for (const m of models) modelFor(m); // 모르는 이름이면 여기서 분명히 막힌다

  const jobs = previewJobs(kind, { models });
  const cost = jobs.reduce((sum, j) => sum + modelFor(j.model).usdPerImage, 0);

  log.section(`🎨 화풍 미리보기  |  ${kind}  |  ${models.join(' vs ')}`);
  log.info(`장면 ${scenes.length}개 × 모델 ${models.length}개 = ${jobs.length}장`);
  for (const sc of scenes) log.raw(`  · ${sc.key} — ${sc.why}`);
  log.info(`예상 비용 약 $${Math.round(cost * 10000) / 10000}`);

  if (flags['dry-run']) {
    log.raw('');
    log.info('미리보기입니다. 돈을 쓰지 않고 여기서 멈춥니다.');
    log.raw(`  ${jobs[0].prompt.slice(0, 160)}…`);
    return;
  }

  const token = env('REPLICATE_API_TOKEN');
  if (!token) {
    log.error('REPLICATE_API_TOKEN 이 없습니다.');
    process.exit(1);
  }

  const outDir = path.join(ROOT, 'preview', kind.toLowerCase());
  fs.mkdirSync(outDir, { recursive: true });
  const api = createReplicate({ token });

  let spent = 0;
  const made = [];
  for (const [i, job] of jobs.entries()) {
    log.step(`${i + 1}/${jobs.length} — ${job.file}`);
    try {
      const r = await api.generate(job.prompt, { modelKey: job.model, aspectRatio: '16:9' });
      spent += r.usdEstimate ?? modelFor(job.model).usdPerImage;
      const bytes = await api.download(r.url);
      fs.writeFileSync(path.join(outDir, job.file), bytes);
      made.push(job.file);
    } catch (e) {
      log.error(`${job.file}: ${e.message}`);
    }
  }

  // 무엇을 보려고 뽑았는지 함께 적어 둔다. 나중에 폴더만 열면 알 수 없다.
  const notes = [
    `# 화풍 미리보기 — ${kind}`,
    '',
    `모델: ${models.join(', ')}`,
    `쓴 돈 약 $${Math.round(spent * 10000) / 10000} (추정치)`,
    '',
    '## 무엇을 보나',
    ...scenes.map((sc) => `- **${sc.key}** — ${sc.why}`),
    '',
    '## 고를 때',
    '',
    '같은 장면을 모델별로 나란히 놓고 본다. 얼굴이 또렷한 쪽을 고른다.',
    '',
    '- 눈·눈썹·입이 보이는가 (1화에서는 동그라미만 나왔다)',
    '- 유니폼에 글자나 로고가 섞여 들어가지 않았는가',
    '- 특정 선수를 닮지 않았는가 — 닮았으면 그 쪽이 오히려 문제다',
    '',
    '## 프롬프트',
    '',
    '```',
    jobs[0].prompt,
    '```',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, '보는-법.md'), notes + '\n', 'utf8');

  log.raw('');
  log.ok(`${made.length}장 완성 — ${outDir}`);
  log.info(`쓴 돈 약 $${Math.round(spent * 10000) / 10000} (추정치)`);
  log.info('같은 장면을 모델별로 나란히 놓고, 얼굴이 또렷한 쪽을 고르세요.');
}

/**
 * 인물 시트를 만든다 — 사진을 참조로 캐리커처 얼굴 한 장.
 *
 * 사진은 **주소로만** 받는다. 저장소가 공개라 사진을 커밋하면 그걸
 * 퍼블리싱하는 것이 된다. Replicate 가 주소에서 직접 받아 가고 우리
 * 쪽엔 결과물(캐리커처)만 남는다.
 */
async function cmdPortrait(flags) {
  const planPath = typeof flags.plan === 'string' ? flags.plan : '';
  if (!planPath) {
    log.error('어느 편의 사람을 만들지 알려주세요.');
    log.info('  node src/main.mjs portrait --plan=스포츠영상/2화.json');
    process.exit(1);
  }
  const full = path.isAbsolute(planPath) ? planPath : path.join(ROOT, '..', planPath);
  if (!fs.existsSync(full)) {
    log.error(`${planPath} 이 없습니다.`);
    process.exit(1);
  }
  const plan = JSON.parse(fs.readFileSync(full, 'utf8'));
  const variants = Number(flags.variants) > 0 ? Number(flags.variants) : VARIANTS_PER_PERSON;
  const { jobs, skipped } = portraitJobs(plan.people, { variants });

  log.section(`🙂 인물 시트  |  ${planPath}`);
  for (const sk of skipped) log.warn(`${sk.name}: ${sk.reason}`);
  if (!jobs.length) {
    log.error('만들 사람이 없습니다.');
    log.info('기획 파일의 people 에 photo 를 **사진 주소**로 넣어 주세요 (http 로 시작).');
    log.info('사진 파일 자체는 저장소에 넣지 않습니다 — 공개 저장소라 그대로 퍼블리싱됩니다.');
    process.exit(1);
  }

  const per = modelFor('portrait').usdPerImage;
  const cost = Math.round(jobs.length * per * 10000) / 10000;
  const names = [...new Set(jobs.map((j) => j.name))];
  log.info(`사람 ${names.length}명 × ${variants}장 = ${jobs.length}장 — ${names.join(', ')}`);
  log.info(`예상 비용 약 $${cost} (추정치 — 이 모델은 처음 써 봅니다)`);

  if (flags['dry-run']) {
    log.raw('');
    log.info('미리보기입니다. 돈을 쓰지 않고 여기서 멈춥니다.');
    log.raw(`  ${jobs[0].name}: ${jobs[0].prompt.slice(0, 140)}…`);
    log.raw(`  참조: ${jobs[0].referenceImage}`);
    return;
  }

  const token = env('REPLICATE_API_TOKEN');
  if (!token) {
    log.error('REPLICATE_API_TOKEN 이 없습니다.');
    process.exit(1);
  }

  const outDir = path.join(ROOT, 'preview', 'portrait');
  fs.mkdirSync(outDir, { recursive: true });
  const api = createReplicate({ token });

  let spent = 0;
  const made = [];
  for (const [i, job] of jobs.entries()) {
    log.step(`${i + 1}/${jobs.length} — ${job.file}`);
    try {
      const r = await api.generate(job.prompt, {
        modelKey: 'portrait',
        referenceImage: job.referenceImage,
        negativePrompt: PORTRAIT_NEGATIVE,
      });
      spent += r.usdEstimate ?? per;
      fs.writeFileSync(path.join(outDir, job.file), await api.download(r.url));
      made.push(job.file);
    } catch (e) {
      log.error(`${job.file}: ${e.message}`);
    }
  }

  fs.writeFileSync(
    path.join(outDir, '고르는-법.md'),
    [
      '# 인물 시트 고르기',
      '',
      `쓴 돈 약 $${Math.round(spent * 10000) / 10000} (추정치)`,
      '',
      '사람마다 두 장씩 있습니다. 나란히 놓고 한 장을 고르세요.',
      '',
      '- 실제 선수와 **닮았는가**. 이게 첫째입니다',
      '- 사진처럼 보이지는 않는가 — 캐리커처로 보여야 합니다',
      '- 유니폼에 글자나 로고가 섞여 들어가지 않았는가',
      '',
      '## 고른 뒤',
      '',
      '고른 파일을 `스포츠영상/인물/<이름>.png` 로 옮겨 커밋합니다.',
      '**이건 우리가 만든 그림입니다** — 사진이 아니므로 저장소에 두어도 됩니다.',
      '그다음부터 모든 샷이 이 시트를 참조합니다. 원본 사진은 두 번 다시 쓰지 않습니다.',
      '',
      '## 만든 것',
      '',
      ...made.map((f) => `- ${f}`),
    ].join('\n') + '\n',
    'utf8'
  );

  log.raw('');
  log.ok(`${made.length}장 완성 — ${outDir}`);
  log.info(`쓴 돈 약 $${Math.round(spent * 10000) / 10000} (추정치)`);
  log.info('사람마다 두 장 중 하나를 골라 스포츠영상/인물/ 에 넣어 주세요.');
}

async function cmdUpload(flags) {
  const id = String(flags.id || '').padStart(3, '0');
  if (!flags.id) {
    log.error('어떤 편의 올릴 거리를 만들지 알려주세요.');
    log.info('  node src/main.mjs upload --id=001');
    process.exit(1);
  }
  requireApiKey();

  const loaded = loadContent(id);
  if (!loaded?.script) {
    log.error(`content/${id} 에 대본이 없습니다. 제목은 대본을 읽고 짓습니다.`);
    process.exit(1);
  }
  const videoPath = contentPath(id, 'video', 'final.mp4');
  const hasVideo = fs.existsSync(videoPath);

  log.section(`📤 올릴 거리 만들기  |  content/${id}  |  모델 ${MODELS.script}`);
  const narration = loadNarration(id);
  const minutes = narration?.total_seconds ? narration.total_seconds / 60 : 0;
  const pack = await makeUploadPack(loaded.research, {
    scriptMarkdown: loaded.script,
    minutes: Math.round(minutes * 10) / 10,
  });

  log.ok(`제목 후보 ${pack.titles.length}개` + (pack.droppedTitles.length ? ` (${pack.droppedTitles.length}개는 걸러냄)` : ''));
  for (const t of pack.titles) log.raw(`  · ${t.text}  (${t.text.length}자)`);
  for (const t of pack.droppedTitles) log.warn(`거름: ${t.text} — ${t.problems.join(', ')}`);

  // 설명문에 고지와 음악 출처는 **코드가** 붙인다. 부탁하지 않는다.
  const description = finishDescription(pack.descriptionBody, {
    track: narration?.bgm || null,
    sources: loaded.research?.sources || [],
    // 창작 편이면 고지문이 다르고 출처를 적지 않는다.
    kind: loaded.research?.kind,
  });
  log.ok(`설명문 ${description.length}자, 태그 ${pack.tags.length}개`);

  // ── 썸네일
  let moments = [];
  // 실제로 만들어진 썸네일만 기록한다. 안내 문서가 없는 파일을 가리키면
  // 효성님이 폴더를 열어 보고 나서야 없다는 걸 알게 된다.
  let madeThumbs = [];
  const thumbFiles = [];
  if (!hasVideo) {
    log.warn(`${videoPath} 가 없어 썸네일을 만들지 않습니다. 영상을 먼저 만들어 주세요.`);
  } else if (!pack.thumbnails.length) {
    log.warn('규격을 통과한 썸네일 문구가 없어 썸네일을 만들지 않았습니다.');
    for (const t of pack.droppedThumbs) log.info(`· ${t.problems.join(', ')}`);
  } else {
    const scenesFile = contentPath(id, 'scenes.json');
    const saved = fs.existsSync(scenesFile) ? JSON.parse(fs.readFileSync(scenesFile, 'utf8')) : { scenes: [] };
    const scenes = narration ? applyTimings(saved.scenes || [], narration.timings) : saved.scenes || [];
    moments = pickThumbnailMoments(scenes, { count: pack.thumbnails.length });
    // 뽑을 지점보다 문구가 많으면 문구를 줄인다. 지점이 없으면 at 이 0이
    // 되고, 0초는 보통 까맣다 — 까만 썸네일을 만들어 내놓지 않는다.
    const copies = pack.thumbnails.slice(0, moments.length);
    madeThumbs = copies;
    if (copies.length < pack.thumbnails.length) {
      log.info(`영상이 짧아 썸네일을 ${copies.length}장만 만듭니다.`);
    }
    const dir = contentPath(id, 'upload');
    fs.mkdirSync(dir, { recursive: true });
    const slug = fileSlug(loaded.research?.title);
    for (const [i, copy] of copies.entries()) {
      const at = moments[i].at;
      // 글자는 파일로 넘긴다 — 한글과 따옴표를 명령줄에 직접 넣으면 깨진다.
      const f1 = path.join(dir, `.line1-${i}.txt`);
      // 아랫줄이 비어 있으면 파일을 만들지 않는다. 빈 파일을 drawtext 에
      // 넘기면 ffmpeg 가 거기서 죽는다.
      const f2 = copy.line2 ? path.join(dir, `.line2-${i}.txt`) : null;
      fs.writeFileSync(f1, copy.line1, 'utf8');
      if (f2) fs.writeFileSync(f2, copy.line2, 'utf8');
      try {
        await runFfmpegArgs(
          thumbnailArgs({
            videoPath,
            seconds: at,
            line1: copy.line1,
            line2: copy.line2 || null,
            line1File: f1,
            line2File: f2,
            outputPath: path.join(dir, `${slug}-썸네일-${i + 1}.jpg`),
          })
        );
        thumbFiles.push(`${slug}-썸네일-${i + 1}.jpg`);
        log.ok(`${slug}-썸네일-${i + 1}.jpg — "${copy.line1} / ${copy.line2}" (${at}초 지점)`);
      } catch (err) {
        log.fail(`thumb-${i + 1}.jpg 실패`, err);
      }
      fs.rmSync(f1, { force: true });
      if (f2) fs.rmSync(f2, { force: true });
    }
  }

  const dir = saveUploadPack(id, {
    titles: pack.titles,
    droppedTitles: pack.droppedTitles,
    thumbnails: madeThumbs,
    thumbFiles,
    droppedThumbs: pack.droppedThumbs,
    description,
    tags: pack.tags,
    moments,
  });
  log.raw('');
  log.ok(`저장: ${dir}`);
  log.info('올릴 때는 이 폴더의 `올릴때-쓸것.md` 하나만 보면 됩니다.');
  log.error('AI 합성 콘텐츠 체크는 설명문으로 대신할 수 없습니다. Studio 에서 따로 켜 주세요.');
}

/** 그 편의 샷 번호 목록. scenes.json 이 없으면 빈 목록. */
function shotIdsOf(id) {
  try {
    const saved = JSON.parse(fs.readFileSync(contentPath(id, 'scenes.json'), 'utf8'));
    return (saved.scenes || []).flatMap((sc) => (sc.shots || []).map((sh) => sh.shot_id)).filter(Boolean);
  } catch {
    return [];
  }
}

async function cmdImages(flags) {
  const id = String(flags.id || '').padStart(3, '0');
  if (!flags.id) {
    log.error('어떤 편의 이미지를 만들지 알려주세요.');
    log.info('  node src/main.mjs list               제작 중인 편 보기');
    log.info('  node src/main.mjs images --id=001    그 편의 이미지 만들기');
    process.exit(1);
  }

  // 샷마다 그림이 이미 다 있으면 할 일이 없다.
  //
  // 이어할 때 중요하다. prompts.json 은 결과물이 아니라 중간 파일이어서
  // 빠질 수 있는데, 그 때문에 **이미 돈 주고 산 그림을 다시 사는** 일이
  // 있어서는 안 된다. 그림이 다 있으면 prompts.json 이 없어도 넘어간다.
  const needed = shotIdsOf(id);
  if (needed.length && needed.every((sid) => fs.existsSync(contentPath(id, 'assets', `${sid}.png`)))) {
    log.ok(`content/${id} 의 그림 ${needed.length}장이 이미 있습니다. 다시 만들지 않습니다 (돈을 아낍니다).`);
    log.info('새로 만들려면 content/<편>/assets 의 파일을 지우세요.');
    return;
  }

  const promptsPath = contentPath(id, 'prompts.json');
  if (!fs.existsSync(promptsPath)) {
    log.error(`${promptsPath} 이 없습니다. 먼저 장면을 만들어야 합니다:`);
    log.info(`  node src/main.mjs scenes --id=${id}`);
    process.exit(1);
  }

  const saved = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
  const prompts = saved.prompts || [];
  if (!prompts.length) {
    log.error('화면 프롬프트가 비어 있습니다.');
    process.exit(2);
  }

  const modelKey = typeof flags.model === 'string' ? flags.model : env('IMAGE_MODEL', DEFAULT_IMAGE_MODEL);
  const maxUsd = flags['max-usd'] !== undefined ? Number(flags['max-usd']) : DEFAULT_MAX_USD;
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
    log.error(`비용 상한이 숫자가 아닙니다: ${flags['max-usd']}`);
    process.exit(1);
  }

  const assetDir = contentPath(id, 'assets');
  const model = modelFor(modelKey);
  const { todo, skipped } = shotsToGenerate(prompts, { assetDir, force: Boolean(flags.force) });
  // 표·숫자 카드는 ffmpeg 로 직접 그린다. 이미지 모델을 부르지 않으므로
  // 돈이 들지 않고, 한글이 또렷하다.
  const cards = cardShots(prompts, { assetDir, force: Boolean(flags.force) });

  log.section(`🖼  이미지 생성  |  content/${id}  |  ${model.model}`);
  log.info(model.note);
  log.info(`샷 ${prompts.length}개 중 ${todo.length}개를 만듭니다.`);
  if (cards.todo.length) {
    log.info(`그중 글자 카드 ${cards.todo.length}장은 직접 그립니다 — 이미지 모델을 부르지 않습니다 (0원).`);
  }
  if (skipped.length) {
    const already = skipped.filter((s) => s.reason === '이미 있습니다').length;
    if (already) log.info(`${already}개는 이미 있어 건너뜁니다 (--force 로 다시 만듭니다).`);
    for (const s of skipped.filter((x) => x.reason !== '이미 있습니다')) {
      log.warn(`${s.shot_id}: ${s.reason}`);
    }
  }
  log.info(`예상 비용 약 $${estimateUsd(todo.length, modelKey)} (추정치), 상한 $${maxUsd}`);

  if (estimateUsd(todo.length, modelKey) > maxUsd) {
    log.warn(`예상 비용이 상한을 넘습니다. 상한에 걸리면 멈추고, 남은 샷은 다음 실행에서 이어서 만듭니다.`);
    log.info(`한 번에 끝내려면 --max-usd 를 올리세요.`);
  }

  if (flags['dry-run']) {
    log.raw('');
    log.info('미리보기입니다. 돈을 쓰지 않고 여기서 멈춥니다.');
    for (const s of todo.slice(0, 5)) {
      log.raw(`  ${s.shot_id}  ${String(s.image_prompt).slice(0, 90)}…`);
    }
    if (todo.length > 5) log.raw(`  … 그리고 ${todo.length - 5}개 더`);
    for (const c of cards.todo.slice(0, 3)) {
      log.raw(`  ${c.shot_id}  [카드] ${String(c.card_text).split('\n')[0]}`);
    }
    if (cards.todo.length > 3) log.raw(`  … 그리고 카드 ${cards.todo.length - 3}장 더`);
    return;
  }

  // 카드부터 그린다. 토큰이 없어도 되고 돈도 안 드니, AI 그림이 실패해도
  // 카드는 남는다.
  if (cards.todo.length) {
    const cardWork = contentPath(id, 'assets', '_card-text');
    let drawn = 0;
    for (const c of cards.todo) {
      try {
        const r = await renderCardImage(c.card_text, {
          outputPath: c.file,
          workDir: path.join(cardWork, c.shot_id),
        });
        drawn += 1;
        if (r.overflow) {
          log.warn(`${c.shot_id}: 카드 글이 많아 글자가 작아졌습니다. 줄을 줄이면 좋습니다.`);
        }
      } catch (e) {
        log.error(`${c.shot_id}: 카드를 그리지 못했습니다 — ${e.message}`);
      }
    }
    log.ok(`글자 카드 ${drawn}장 완성 (0원).`);
  }

  if (!todo.length) {
    log.ok('AI 로 만들 이미지가 없습니다.');
    log.info(`다음: node src/main.mjs video --id=${id}`);
    return;
  }

  const token = env('REPLICATE_API_TOKEN');
  if (!token) {
    log.error('REPLICATE_API_TOKEN 이 없습니다.');
    log.info('  1) https://replicate.com/account/api-tokens 에서 토큰을 만드세요 (r8_... 로 시작합니다)');
    log.info('  2) GitHub 리포 → Settings → Secrets and variables → Actions → New repository secret');
    log.info('  3) 이름을 REPLICATE_API_TOKEN 으로 넣으세요');
    process.exit(1);
  }

  const started = Date.now();
  const result = await generateImages(prompts, {
    assetDir,
    token,
    modelKey,
    maxUsd,
    force: Boolean(flags.force),
    onProgress: (m) => log.step(m),
  });

  log.raw('');
  log.ok(`이미지 ${result.made.length}개 완성 — ${assetDir}`);
  log.info(`${((Date.now() - started) / 60000).toFixed(1)}분 걸림, 쓴 돈 약 $${result.spentUsd} (추정치)`);
  log.info('실제 청구액은 https://replicate.com/account/billing 에서 확인하세요.');

  if (result.stoppedBy === 'budget') {
    log.warn(`비용 상한 $${maxUsd}에 걸려 멈췄습니다.`);
    log.info(`같은 명령을 다시 돌리면 이미 만든 것은 건너뛰고 남은 것부터 이어서 만듭니다.`);
  }

  if (result.failed.length) {
    log.error(`만들지 못한 샷 ${result.failed.length}개:`);
    for (const f of result.failed.slice(0, 10)) log.info(`· ${f.shot_id}: ${f.reason}`);
    if (result.failed.length > 10) log.info(`· … 그리고 ${result.failed.length - 10}개 더`);
    log.info('같은 명령을 다시 돌리면 실패한 것만 다시 만듭니다.');
    log.info('그대로 영상을 만들면 실패한 샷만 자리표시 화면으로 나옵니다.');
  }

  log.raw('');
  log.info(`다음: node src/main.mjs video --id=${id}`);
}

/**
 * TTS 키를 읽는다. 없으면 무엇을 해야 하는지 알려주고 멈춘다.
 * 두 곳(목록 보기 · 실제 합성)에서 쓰므로 한 군데에 모아 둔다.
 */
function requireTtsKey() {
  const apiKey = env('GOOGLE_TTS_API_KEY');
  if (!apiKey) {
    log.error('GOOGLE_TTS_API_KEY 가 없습니다.');
    log.info('  1) https://console.cloud.google.com 에서 프로젝트를 만들고');
    log.info('  2) "Cloud Text-to-Speech API" 를 사용 설정한 뒤');
    log.info('  3) API 및 서비스 → 사용자 인증 정보 → API 키 만들기');
    log.info('  4) GitHub 리포 Settings → Secrets → GOOGLE_TTS_API_KEY');
    process.exit(1);
  }
  return apiKey;
}

/**
 * 대본 → 나레이션 음성 + 배경음악 (Phase 4).
 *
 * 문단마다 따로 만들어 이어 붙인다. 그래야 **문단별 실제 길이**를 재서
 * 자막과 장면 전환을 추정치가 아닌 진짜 타이밍에 맞출 수 있다.
 */
async function cmdVoice(flags) {
  // 목소리 목록은 **편과 무관하다.** 키가 살아 있는지 공짜로 확인하는
  // 용도이기도 하므로, 아직 만든 편이 하나도 없어도 돌아가야 한다.
  if (flags.voices) {
    const apiKey = requireTtsKey();
    const list = await createTtsClient({ apiKey }).listVoices();
    log.section(`🗣  쓸 수 있는 한국어 목소리 ${list.length}개`);
    for (const v of list) log.raw(`  ${v.name.padEnd(28)} ${v.gender}`);
    log.info('마음에 드는 것을 --voice=이름 또는 TTS_VOICE 환경변수로 쓰세요.');
    return;
  }

  // 같은 문장을 여러 목소리로 만들어 둔다. 편과 무관하고, 몇 센트면 끝난다.
  // 이름만 보고 고르면 $3짜리 완성본을 돌려서야 톤을 알게 된다.
  if (flags.sample) {
    const apiKey = requireTtsKey();
    const client = createTtsClient({ apiKey });
    const rate = flags.rate !== undefined ? Number(flags.rate) : 0.95;
    const voices = pickSampleVoices(await client.listVoices(), {
      current: typeof flags.voice === 'string' ? flags.voice : DEFAULT_VOICE,
    });
    if (!voices.length) {
      log.error('들어볼 수 있는 한국어 목소리를 찾지 못했습니다.');
      process.exit(2);
    }
    const dir = contentPath('_목소리', '');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '읽은-문장.txt'), `${SAMPLE_TEXT}\n\n속도 ${rate}\n`, 'utf8');

    log.section(`🗣  목소리 들어보기  |  ${voices.length}개  |  속도 ${rate}`);
    log.info(`읽는 문장: ${SAMPLE_TEXT.slice(0, 40)}…`);
    let chars = 0;
    for (const voice of voices) {
      try {
        const mp3 = await client.synthesize(SAMPLE_TEXT, { voice, speakingRate: rate });
        fs.writeFileSync(path.join(dir, sampleFileName(voice, rate)), mp3);
        chars += SAMPLE_TEXT.length;
        log.ok(voice);
      } catch (err) {
        // 한 목소리가 안 돼도 나머지는 만든다. 계열마다 받는 설정이 다르다.
        log.warn(`${voice}: ${err.message}`);
      }
    }
    log.raw('');
    log.info(`${dir} 에 넣었습니다. 받아서 듣고 마음에 드는 이름을 알려 주세요.`);
    log.info(`쓴 돈 약 $${estimateTtsUsd(chars)} (추정치).`);
    return;
  }

  const id = String(flags.id || '').padStart(3, '0');
  if (!flags.id) {
    log.error('어떤 편의 목소리를 만들지 알려주세요.');
    log.info('  node src/main.mjs list             제작 중인 편 보기');
    log.info('  node src/main.mjs voice --id=001   그 편의 목소리 만들기');
    process.exit(1);
  }

  const scenesPath = contentPath(id, 'scenes.json');
  if (!fs.existsSync(scenesPath)) {
    log.error(`${scenesPath} 이 없습니다. 먼저 장면을 만들어야 합니다:`);
    log.info(`  node src/main.mjs scenes --id=${id}`);
    process.exit(1);
  }

  // 이미 만든 음성이 있으면 다시 만들지 않는다. 글자 수만큼 돈이 든다.
  //
  // 단, **같은 목소리일 때만** 그렇다. 목소리를 바꿨는데 옛 음성을 그대로
  // 쓰면 바꾼 줄 알고 있다가 완성본에서야 안 바뀐 걸 알게 된다. 그때는
  // 이미 영상까지 다 만든 뒤다.
  //
  // 목소리와 속도는 **종류가 정한다.** 동화는 차분하고 느리게, 스포츠는
  // 중계 톤으로. 다만 --voice / TTS_VOICE 로 지정하면 그쪽이 이긴다 —
  // 사람이 들어보고 고른 것이 코드의 기본값보다 낫다.
  const kind = loadContent(id)?.research?.kind;
  const wantVoice = typeof flags.voice === 'string' && flags.voice
    ? flags.voice
    : env('TTS_VOICE', voiceFor(kind));
  const wantRate = flags.rate !== undefined
    ? Number(flags.rate)
    : speakingRateFor(kind);
  if (
    !flags.force &&
    fs.existsSync(contentPath(id, 'audio', 'voice.mp3')) &&
    fs.existsSync(contentPath(id, 'audio', 'timings.json'))
  ) {
    const prev = loadNarration(id) || {};
    const made = prev.voice || '';
    const madeRate = prev.speaking_rate;
    if (made && made !== wantVoice) {
      log.warn(`만들어 둔 음성은 ${made} 로 읽은 것입니다. 지금 쓰려는 것은 ${wantVoice} 입니다.`);
      log.info('목소리가 다르므로 다시 만듭니다.');
    } else if (madeRate != null && Number(madeRate) !== wantRate) {
      log.warn(`만들어 둔 음성은 속도 ${madeRate} 입니다. 지금 쓰려는 것은 ${wantRate} 입니다.`);
      log.info('속도가 다르므로 다시 만듭니다.');
    } else {
      log.ok(`content/${id}/audio/voice.mp3 이 이미 있습니다. 다시 만들지 않습니다 (돈을 아낍니다).`);
      log.info('새로 만들려면 --force 를 붙이세요.');
      return;
    }
  }

  const scenes = JSON.parse(fs.readFileSync(scenesPath, 'utf8')).scenes || [];
  const units = narrationUnits(scenes);
  if (!units.length) {
    log.error('읽을 문단이 없습니다.');
    process.exit(2);
  }

  const chars = units.reduce((s, u) => s + u.chars, 0);
  const voice = wantVoice;  // 위에서 한 번만 정한다 — 두 곳에서 따로 정하면 어긋난다
  const maxUsd = flags['max-usd'] !== undefined ? Number(flags['max-usd']) : DEFAULT_TTS_MAX_USD;

  log.section(`🎙  나레이션  |  content/${id}  |  ${voice}  |  속도 ${wantRate}`);
  log.info(`문단 ${units.length}개, ${chars.toLocaleString()}자`);
  log.info(`예상 비용 약 $${estimateTtsUsd(chars)} (추정치), 상한 $${maxUsd}`);

  if (flags['dry-run']) {
    log.raw('');
    log.info('미리보기입니다. 돈을 쓰지 않고 여기서 멈춥니다.');
    for (const u of units.slice(0, 3)) log.raw(`  ${u.id}  ${u.text.slice(0, 50)}…`);
    if (units.length > 3) log.raw(`  … 그리고 ${units.length - 3}개 더`);
    return;
  }

  const apiKey = requireTtsKey();

  const workDir = contentPath(id, 'audio');
  const started = Date.now();
  const result = await narrate(scenes, {
    workDir,
    apiKey,
    voice,
    speakingRate: wantRate,
    maxUsd,
    force: Boolean(flags.force),
    onProgress: (m) => log.step(m),
  });

  if (!result.voicePath) {
    log.error('음성을 하나도 만들지 못했습니다.');
    for (const f of result.failed.slice(0, 5)) log.info(`· ${f.id}: ${f.reason}`);
    process.exit(2);
  }

  log.raw('');
  log.ok(`나레이션 완성: ${result.voicePath}`);
  log.info(`${result.totalSeconds}초 (약 ${(result.totalSeconds / 60).toFixed(1)}분), ${((Date.now() - started) / 1000).toFixed(0)}초 걸림`);
  log.info(`쓴 돈 약 $${result.spentUsd} (추정치). 실제 금액은 Google Cloud 콘솔에서 확인하세요.`);

  if (result.stoppedBy === 'budget') {
    log.warn(`비용 상한 $${maxUsd}에 걸려 멈췄습니다. 다시 돌리면 이어서 만듭니다.`);
  }
  if (result.failed.length) {
    log.error(`만들지 못한 문단 ${result.failed.length}개:`);
    for (const f of result.failed.slice(0, 5)) log.info(`· ${f.id}: ${f.reason}`);
    log.info('같은 명령을 다시 돌리면 실패한 것만 다시 만듭니다.');
  }

  // ── 배경음악
  //
  // 끌 수 있어야 한다. 지금 들어 있는 여섯 곡은 전부 미스터리·스릴러용이라
  // 조용한 동화에 깔면 그 자리에서 어긋난다. **안 맞는 음악은 없는 음악보다
  // 나쁘다** — 없으면 담백하고, 안 맞으면 싸구려로 들린다.
  //
  // 곡을 고르는 것은 사람 일이다. 오디오 보관함에서 받을 때 저작자 표시가
  // 붙는지도 확인해야 하므로(bgm/목록.json 참고) 코드가 대신 정할 수 없다.
  const bgmDir = path.join(ROOT, 'bgm');
  const tracks = flags['no-bgm'] ? [] : loadTracks(bgmDir);
  let track = null;

  if (flags['no-bgm']) {
    log.info('배경음악을 끄고 나레이션만 넣습니다 (--no-bgm).');
  } else if (!tracks.length) {
    log.warn('배경음악이 없습니다. 나레이션만 들어갑니다.');
    log.info(`유튜브 오디오 보관함에서 받아 ${bgmDir} 에 넣어주세요. 방법은 bgm/README.md 에 있습니다.`);
  } else {
    track = pickTrack(scenes, tracks, { seed: Number(id) });
    log.section('🎵 배경음악');
    log.ok(`${track.title || track.file} (${track.mood})`);
    const mixed = path.join(workDir, 'voice-with-bgm.mp3');
    await runFfmpegArgs(
      mixArgs({
        voicePath: result.voicePath,
        bgmPath: path.join(bgmDir, track.file),
        outputPath: mixed,
        seconds: result.totalSeconds,
      })
    );
    // 섞은 것을 voice.mp3 자리에 놓는다. 영상 쪽은 바뀔 게 없다.
    fs.renameSync(mixed, result.voicePath);
    log.ok('나레이션 아래로 깔았습니다.');

    const credit = attributionText(track);
    if (credit) {
      log.warn('이 곡은 설명란에 출처를 적어야 합니다:');
      for (const line of credit.split('\n').filter(Boolean)) log.info(`  ${line}`);
    }
  }

  saveNarration(id, { timings: result.timings, totalSeconds: result.totalSeconds, voice, speakingRate: wantRate, track });

  log.raw('');
  log.info(`다음: node src/main.mjs video --id=${id}`);
  log.info('자막과 장면 전환이 이제 추정치가 아니라 실제 음성 길이에 맞춰집니다.');
}

/** ffmpeg 한 번. render.mjs의 것과 같은 일이지만 여기선 소리만 다룬다. */
function runFfmpegArgs(args) {
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
 * 장면 → 실제 영상 파일 (Phase 5).
 *
 * AI를 한 번도 부르지 않는다. 전부 계산과 ffmpeg다. 그래서 공짜다 —
 * 몇 번이고 다시 돌려 눈으로 확인할 수 있다.
 *
 * Phase 3(그림)·Phase 4(목소리)가 아직 없으므로, 없는 에셋은 자리표시
 * 이미지로 채운다. 그래야 "그림이 없어서" 못 고치는 것과 "편집이 틀려서"
 * 못 고치는 것을 구분할 수 있다.
 */
/**
 * 기획 파일의 단락에서 쇼츠 가치표를 뽑는다.
 *
 * 적어 두지 않았으면 **차례대로 가치를 매긴다.** 앞쪽이 높다 —
 * 대개 앞 단락이 본론이고 뒤로 갈수록 마무리다. HOOK 은 늘 100 이고,
 * 마지막 단락은 낮다(마무리를 쇼츠로 떼면 혼자서는 뜻이 안 통한다).
 *
 * 완벽한 점수는 아니다. 다만 **전부 같은 점수인 것보다는 낫다** —
 * 그러면 순위가 길이로만 정해지고, 1화에서 실제로 그 때문에 가장
 * 중요한 구간이 쇼츠에서 통째로 빠졌다.
 */
function sectionValuesOf(sections) {
  if (!Array.isArray(sections) || !sections.length) return null;
  const out = {};
  const n = sections.length;
  sections.forEach((s, i) => {
    if (!s?.key) return;
    if (Number.isFinite(Number(s.value))) {
      out[s.key] = Number(s.value);
      return;
    }
    if (s.key === 'HOOK') out[s.key] = 100;
    else if (i === n - 1) out[s.key] = 20;
    else out[s.key] = Math.round(90 - ((i - 1) / Math.max(1, n - 2)) * 45);
  });
  return out;
}

/**
 * 쇼츠 마지막 3초에 띄울 글.
 *
 * 두 줄이다. 첫 줄이 무엇을 더 볼 수 있는지, 둘째 줄이 무엇을 하라는지.
 * 조회 2,500 에 구독이 +1 이었던 때(2026-10-31) 쇼츠에는 둘 다 없었다 —
 * 본편을 잘라 만들어서 끝이 그냥 끊겼다.
 *
 * 채널 이름을 넣는다. Shorts 피드에서 유입이 96% 라, 보는 사람 대부분이
 * 이 채널을 처음 본다.
 */
function outroLineFor(research) {
  const channel = research?.kind === KIND.SPORTS ? '야포츠' : null;
  if (!channel) return null;
  return `전체 영상은 채널에 있습니다\n${channel} 구독하고 다음 편 보기`;
}

async function cmdVideo(flags) {
  const id = String(flags.id || '').padStart(3, '0');
  if (!flags.id) {
    log.error('어떤 편의 영상을 만들지 알려주세요.');
    log.info('  node src/main.mjs list             제작 중인 편 보기');
    log.info('  node src/main.mjs video --id=001   그 편의 영상 만들기');
    process.exit(1);
  }

  const scenesPath = contentPath(id, 'scenes.json');
  if (!fs.existsSync(scenesPath)) {
    log.error(`${scenesPath} 이 없습니다. 먼저 장면을 만들어야 합니다:`);
    log.info(`  node src/main.mjs scenes --id=${id}`);
    process.exit(1);
  }

  const saved = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
  // 나레이션을 이미 만들었으면 **장면 데이터 자체**를 실제 음성 길이로
  // 고쳐서 쓴다. 자막에만 넘기면 그림은 여전히 추정치로 잘려 서로 어긋난다.
  const narration = loadNarration(id);
  const scenes = narration
    ? applyTimings(saved.scenes || [], narration.timings)
    : saved.scenes || [];
  // 제목과 소재 종류는 research.json 에 있다. 없어도 영상은 만든다 —
  // 체크리스트의 제목 검사만 건너뛴다.
  const research = loadContent(id)?.research || {};
  if (!scenes.length) {
    log.error('장면이 비어 있습니다.');
    process.exit(2);
  }

  // 기획서 18번의 2단계. 장면에 문제가 남아 있으면 영상을 만들지 않는다.
  if (saved.problems?.length && !flags.force) {
    log.error(`이 편의 장면에 확인되지 않은 문제가 ${saved.problems.length}건 있습니다:`);
    for (const p of saved.problems) log.info(`· ${p}`);
    log.info('그래도 진행하려면 --force 를 붙이세요.');
    process.exit(2);
  }

  // ── 1단계: 편집 계획 (비용 0원)
  log.section(`🎬 편집 계획  |  content/${id}  |  코드가 처리 (비용 0원)`);
  if (narration) {
    log.ok(`실제 음성 길이에 맞춥니다 (문단 ${narration.timings.length}개, ${narration.total_seconds}초).`);
  } else {
    log.warn('나레이션이 없어 추정치(330자/분)로 길이를 잡습니다. 무음 영상이 나옵니다.');
    log.info(`  목소리를 먼저 만들면 자막·장면 전환이 실제 음성에 맞습니다: node src/main.mjs voice --id=${id}`);
  }
  const timeline = buildTimeline(scenes, { format: FORMATS.wide, narrationSeconds: narration?.total_seconds });
  log.ok(`클립 ${timeline.clips.length}개, ${timeline.duration}초 (약 ${(timeline.duration / 60).toFixed(1)}분)`);
  log.info(`나레이션 길이 ${timeline.narration_seconds}초 — 샷 길이 합계와 ${Math.abs(timeline.duration - timeline.narration_seconds).toFixed(2)}초 차이`);
  if (timeline.problems.length) {
    log.error('편집 계획에 문제가 있습니다:');
    for (const p of timeline.problems) log.info(`· ${p}`);
    if (!flags.force) {
      log.info('그래도 진행하려면 --force 를 붙이세요.');
      process.exit(2);
    }
  }

  // ── 2단계: 자막
  //
  // 나레이션을 이미 만들었으면 **실제로 잰 문단 길이**를 쓴다. 없으면
  // "330자에 1분" 추정치로 간다. 추정은 문장마다 조금씩 틀리고 그 오차가
  // 쌓여서 8분 영상이면 뒤로 갈수록 자막이 눈에 띄게 밀린다.
  log.section('💬 자막');
  const ass = buildAss(scenes, { format: FORMATS.wide });
  const cues = buildCues(scenes, { format: FORMATS.wide });
  log.ok(`자막 ${cues.length}줄`);
  log.info(`유튜브 자막 자리로 화면 아래 ${FORMATS.wide.marginV}px를 비웠습니다 (가로), 쇼츠는 ${FORMATS.shorts.marginV}px.`);

  // ── 3단계: 쇼츠 후보
  log.section('📱 쇼츠 후보');
  // 동화는 뒤집힘·여운이 쇼츠에 들어가면 안 된다. kind 를 안 넘기면
  // 결말이 통째로 든 쇼츠가 나온다 — 1화에서 실제로 그랬다.
  const shorts = pickShorts(scenes, {
    // 개수를 비워 두면 종류가 정한다 (스포츠 5, 그 밖에 3).
    // 여기에 숫자를 적어 두면 shorts.mjs 의 기본값이 영영 안 쓰인다.
    count: flags.shorts !== undefined ? Number(flags.shorts) : null,
    kind: research.kind,
    // 편이 자기 단락 이름을 들고 왔으면 가치도 같이 넘긴다. 없으면
    // 모르는 이름이 전부 같은 점수가 되어 순위가 길이로만 정해진다.
    sectionValues: sectionValuesOf(research.sections),
  });
  for (const s of shorts) {
    log.raw(`  ${s.rank}순위  ${fmtTime(s.start)}~${fmtTime(s.end)}  ${s.duration}초  ${s.reason}`);
    log.raw(`      ${s.paragraphs[0].text.slice(0, 50)}…`);
  }

  // 유튜브에 올리기 전에 사람이 확인할 것. 업로드 코드가 생기기 전에도
  // 남겨둔다 — 손으로 올려도 확인할 항목은 같다.
  const checklist = uploadChecklist({
    title: research.title || '',
    kind: research.kind || KIND.EVENT,
  });

  const dir = saveVideoPlan(id, {
    timeline,
    subtitleAss: ass,
    subtitleSrt: renderSrt(cues),
    shorts,
    checklist,
  });
  log.ok(`편집 계획 저장: ${dir}`);

  log.section('📋 올리기 전 확인');
  log.error('AI 합성 콘텐츠로 반드시 고지해야 합니다 — 안 하면 계정 정지 대상입니다.');
  log.info('  YouTube Studio → 동영상 세부정보 → "변경되거나 합성된 콘텐츠" 체크');
  const titleProblems = checkTitle(research.title || '');
  if (titleProblems.length) {
    log.warn('제목에 걸리는 점이 있습니다:');
    for (const p of titleProblems) log.info(`· ${p.why}`);
  }
  log.info(`전체 목록: ${dir}/올리기-전-확인.md`);

  if (flags['dry-run']) {
    log.raw('');
    log.info('미리보기입니다. 렌더링을 하지 않고 여기서 멈춥니다.');
    return;
  }

  // ── 4단계: 실제 렌더링
  const assetDir = flags.assets ? path.resolve(String(flags.assets)) : contentPath(id, 'assets');
  const hasAssets = fs.existsSync(assetDir);
  // 나레이션은 audio/voice.mp3 에 있다 (배경음악까지 섞인 파일).
  const audioPath = flags.audio ? path.resolve(String(flags.audio)) : contentPath(id, 'audio', 'voice.mp3');
  const hasAudio = fs.existsSync(audioPath);

  log.section(`🖥  렌더링  |  ${timeline.width}x${timeline.height} @ ${timeline.fps}fps`);
  if (!hasAssets) {
    log.warn(`에셋 폴더가 없습니다 (${assetDir}). 모든 샷을 자리표시 이미지로 만듭니다.`);
    log.info('진짜 그림은 Phase 3이 만듭니다. 지금은 편집이 맞는지만 봅니다.');
  }
  if (!hasAudio) {
    log.warn(`나레이션 파일이 없습니다 (${audioPath}). 무음으로 만듭니다.`);
    log.info('목소리는 Phase 4가 만듭니다.');
  }
  log.info(`샷 ${timeline.clips.length}개를 하나씩 렌더합니다. 몇 분 걸립니다.`);

  const workDir = contentPath(id, 'video');
  const started = Date.now();
  const result = await renderTimeline(timeline, {
    workDir,
    assetDir: hasAssets ? assetDir : null,
    subtitle: ass,
    audioPath: hasAudio ? audioPath : null,
    onProgress: (m) => log.step(m),
  });

  const info = await probe(result.path);
  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  log.ok(`본편 완성: ${result.path}`);
  log.info(`${info.width}x${info.height}, ${info.duration.toFixed(1)}초, ${minutes}분 걸림`);
  if (result.placeholders.length) {
    log.info(`자리표시로 만든 샷 ${result.placeholders.length}/${timeline.clips.length}개`);
  }
  // 계획한 길이와 실제 길이가 다르면 소리가 어긋난다. 조용히 넘기지 않는다.
  const drift = info.duration - timeline.duration;
  if (Math.abs(drift) > 1) {
    log.error(`계획(${timeline.duration}초)과 실제 길이(${info.duration.toFixed(1)}초)가 ${drift.toFixed(1)}초 다릅니다.`);
  }

  // ── 5단계: 쇼츠 자르기
  if (shorts.length && !flags['no-shorts']) {
    log.section('📱 쇼츠 렌더링');
    const shortsDir = path.join(workDir, 'shorts');
    for (const s of shorts) {
      const shortAss = buildAss(scenes, {
        format: FORMATS.shorts,
        range: { start: s.start, end: s.end },
      });
      const out = await renderShort(s, {
        // 완성본이 아니라 자막 없는 중간 영상에서 자른다. 완성본에서 자르면
        // 가로 자막이 깨진 채 깔리고 그 위에 쇼츠 자막이 또 얹힌다.
        sourceVideo: result.silentPath,
        audioPath: hasAudio ? audioPath : null,
        workDir: shortsDir,
        subtitle: shortAss,
        index: s.rank,
        fps: timeline.fps,
        prefix: fileSlug(research.title),
        // 쇼츠 끝에 붙일 한 줄. 끝이 뚝 끊기면 보고 나서 할 일이 없다.
        outro: outroLineFor(research),
      });
      const si = await probe(out);
      log.ok(`쇼츠 ${s.rank}: ${si.width}x${si.height}, ${si.duration.toFixed(1)}초 — ${out}`);
    }
  }

  log.raw('');
  log.info('기획서 18번: 여기서 멈춥니다. 영상은 파일로만 있고 유튜브에 올라가지 않았습니다.');
  log.info('사람이 본편과 쇼츠를 직접 보고 승인한 뒤에 업로드합니다.');
}

/** 초 → m:ss. 쇼츠 구간을 사람이 읽기 쉽게. */
function fmtTime(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 버튼 한 번으로 소재 찾기부터 대본까지 (GitHub Actions용).
 *
 * GitHub에서 돌릴 때는 실행이 끝나면 컴퓨터가 사라진다. 그래서 "소재 찾고
 * 멈춘 다음 사람이 골라서 다시 누르기"를 할 수 없다. 한 번에 끝내야 한다.
 *
 * 기획서 18번의 소재 승인을 건너뛰는 게 아니다. 승인의 내용을 바꾼 것이다.
 *   - 관문을 통과한(AUTO_OK) 소재만 대본을 쓴다. 즉 1차 기록이 확인되고
 *     출처가 2개 이상인 소재만이다.
 *   - 검토 필요 소재는 대본을 쓰지 않고 목록으로만 남긴다. 사람이 보고
 *     따로 돌려야 한다.
 *   - 어차피 결과는 파일로만 나온다. 유튜브에 아무것도 올라가지 않는다.
 *     사람은 대본을 읽고 승인한 뒤에 다음 Phase를 시작한다.
 */
/**
 * 대본이 있는 편 하나를 장면 → 그림 → 목소리 → 영상 순서로 만든다.
 *
 * 처음부터 돌릴 때와 이어할 때가 **같은 코드를 지나야** 한다. 갈래가 둘이면
 * 한쪽에서만 나는 버그가 생기고, 그 버그는 비싼 쪽에서 난다.
 *
 * 단계마다 따로 try 를 두는 이유: 그림을 못 만들어도 영상은 만들어야 한다
 * (실패한 샷만 자리표시로 나온다). 목소리도 마찬가지다 — 무음으로라도 나온다.
 */
async function runStages(id, flags) {
  // 어느 단계가 엎어졌는지 모아 둔다.
  //
  // 단계마다 try 를 따로 두는 것은 **뒤 단계를 살리려고** 그런 것이지
  // 실패를 없던 일로 하려는 게 아니다. 그런데 모아 두지 않으면 그렇게
  // 된다 — 2화에서 쇼츠 다섯 편이 전부 죽었는데 워크플로는 초록불이었고,
  // 로그를 열어 보기 전까지 아무도 몰랐다.
  const failed = [];
  // 장면 (Phase 2). 이미 있으면 cmdScenes 가 건너뛴다.
  if (flags.scenes) {
    try {
      await cmdScenes({ id });
    } catch (err) {
      log.fail(`content/${id} 장면 만들기 실패`, err);
      failed.push('장면');
      // 계정 한도·인증 문제라면 뒤 단계도 전부 같은 벽에 부딪힌다. 그런데
      // 그림과 목소리는 **다른 회사**라 돈은 그대로 나간다 — 쓸 수 없는
      // 편에 쓰는 돈이다. 실제로 한 번 그렇게 썼다(2026-10-23).
      if (isFatalApiError(err)) {
        log.error('계정 한도나 인증 문제입니다. 다시 걸어도 같은 답이 옵니다.');
        log.info('https://console.anthropic.com/settings/limits 에서 사용 한도를 확인해 주세요.');
        log.info('뒤 단계(그림·목소리)는 돈이 나가므로 여기서 멈춥니다.');
        process.exit(2);
      }
    }
  }

  // 그림 (Phase 3). 장당 돈이 나간다. 상한은 cmdImages 가 지킨다.
  if (flags.images && flags.scenes) {
    try {
      await cmdImages({ id, model: flags['image-model'], 'max-usd': flags['max-usd'] });
    } catch (err) {
      log.fail(`content/${id} 이미지 만들기 실패`, err);
      failed.push('그림');
    }
  }

  // 목소리와 배경음악 (Phase 4).
  // 영상보다 **먼저** 만들어야 한다 — 영상이 음성 길이에 맞춰 잘리기 때문이다.
  if (flags.narrate && flags.scenes) {
    try {
      // --no-bgm 을 여기서 넘기지 않으면 auto 로 돌릴 때만 음악이 깔린다.
      // 같은 플래그가 경로에 따라 다르게 먹히는 것이 제일 찾기 어려운 버그다.
      await cmdVoice({
        id,
        voice: flags['tts-voice'],
        'max-usd': flags['tts-max-usd'],
        'no-bgm': flags['no-bgm'],
      });
    } catch (err) {
      log.fail(`content/${id} 목소리 만들기 실패`, err);
      failed.push('목소리');
    }
  }

  // 영상 (Phase 5). AI를 안 쓰므로 추가로 드는 돈은 없다.
  if (flags.video && flags.scenes) {
    try {
      await cmdVideo({ id });
    } catch (err) {
      log.fail(`content/${id} 영상 만들기 실패`, err);
      failed.push('영상');
    }
  }

  return failed;
}

/**
 * 엎어진 단계가 있으면 **초록불로 끝내지 않는다.**
 *
 * 2화에서 쇼츠 다섯 편이 전부 ffmpeg 오류로 죽었는데 실행은 성공으로
 * 끝났다. 결과물이 반쪽인데 초록불이면, 받아서 열어 보기 전까지 모른다.
 * 그 사이에 올려 버릴 수도 있다.
 *
 * 만들어진 것은 그대로 둔다 — 아티팩트는 이미 올라갔고, 본편까지
 * 버릴 이유가 없다. 다만 **색깔은 빨강이어야 한다.**
 */
function endWithFailures(failed) {
  if (!failed?.length) return;
  log.raw('');
  log.error(`끝나지 못한 단계가 있습니다: ${failed.join(', ')}`);
  log.info('만들어진 것은 결과물에 그대로 들어 있습니다. 위 오류를 보고 다시 돌려 주세요.');
  process.exitCode = 1;
}

async function cmdAuto(flags) {
  // ── 이어하기
  //
  // GitHub Actions 서버는 실행이 끝나면 통째로 지워진다. 그래서 뒤 단계에서
  // 한 번 실패하면 앞에서 **돈 주고 산 것**(조사·대본·장면·그림·음성)이 같이
  // 사라지고, 다시 돌리면 처음부터 다시 산다. 실제로 그렇게 두 번 날렸다.
  //
  // 앞 실행의 결과물을 content/ 에 되돌려 놓고 --resume=<번호> 로 부르면,
  // 조사와 대본을 건너뛰고 **없는 것만** 만든다. 각 단계도 이미 있는 결과는
  // 건너뛰므로(cmdScenes·cmdImages·cmdVoice), 남은 일만 돈이 든다.
  const resumeId = typeof flags.resume === 'string' && flags.resume.trim()
    ? String(flags.resume).trim().padStart(3, '0')
    : null;
  if (resumeId) {
    if (!fs.existsSync(contentPath(resumeId, 'script.md'))) {
      log.error(`content/${resumeId}/script.md 이 없습니다. 이어할 수 없습니다.`);
      log.info('앞 실행의 결과물(content 폴더)이 제자리에 있는지 확인해 주세요.');
      process.exit(1);
    }
    log.section(`↩️  이어하기  |  content/${resumeId}`);
    log.info('조사와 대본은 건너뜁니다. 이미 만들어 둔 것은 그대로 씁니다.');
    const failed = await runStages(resumeId, flags);
    endWithFailures(failed);
    printUsage();
    return;
  }

  requireApiKey();
  const count = Number(flags.count || 5);
  const scripts = Number(flags.scripts || 1);
  const targetMinutes = Number(flags.minutes || DEFAULT_MINUTES);
  const category = typeof flags.category === 'string' ? flags.category : null;
  const topic = typeof flags.topic === 'string' && flags.topic.trim() ? flags.topic.trim() : null;
  // 전설 추적 편. 사건의 1차 기록이 없는 걸 전제로, 이야기의 출처를 쫓는다.
  const legend = Boolean(flags.legend) && Boolean(topic);
  if (flags.legend && !topic) {
    log.error('--legend 는 --topic 과 함께 써야 합니다. 어떤 이야기를 추적할지 정해야 합니다.');
    process.exit(1);
  }

  log.section(
    topic
      ? `🔍 ${legend ? '전설 추적' : '소재 조사'}  |  "${topic}"  |  모델 ${MODELS.collect}`
      : `🔍 소재 수집  |  ${count}건 요청  |  모델 ${MODELS.collect}`
  );
  const found = await collect({
    count,
    category,
    topic,
    legend,
    avoidTitles: topic ? [] : knownTitles(),
    onProgress: (m) => log.step(m),
  });

  if (!found.items.length) {
    if (topic) {
      log.warn(`"${topic}" 는 기준을 통과하지 못했습니다. 대본을 쓰지 않습니다.`);
      log.info('1차 기록이 없거나, 출처가 하나뿐이거나, 다루면 해가 되는 소재입니다.');
      log.info('아래 조사 메모를 읽고 다른 소재를 골라 주세요.');
    } else {
      log.warn('기준을 통과한 소재가 없습니다. 다시 돌려보시거나 분야를 바꿔보세요.');
    }
    if (found.searchNotes) log.info(`조사 메모: ${found.searchNotes}`);
    return;
  }
  log.ok(`${found.items.length}건을 찾았습니다.`);
  if (found.searchNotes) log.info(`조사 메모: ${found.searchNotes}`);

  log.section(`⚖️  소재 심사  |  모델 ${MODELS.score}`);
  // 전설 추적 편은 여기서 종류를 박는다. 관문(1차 기록 없으면 차단)과
  // 대본(ORIGIN 섹션 필수)이 둘 다 이 값을 보고 갈린다.
  const tagged = found.items.map((i) => ({ ...i, kind: legend ? KIND.LEGEND : KIND.EVENT }));
  const { items, failures } = await scoreAll(tagged, { onProgress: (m) => log.step(m) });
  for (const f of failures) log.warn(`심사 실패: ${f.title} — ${f.error}`);

  const kept = [];
  for (const item of items) {
    if (item.gate === GATE.BLOCKED) {
      log.warn(`버림: ${item.title} — ${(item.gate_reasons || []).join(', ')}`);
      // 왜 막혔는지 자세히 찍는다.
      //
      // 예전에는 한 줄("생존 인물에 대한 근거 없는 의혹")만 찍고 끝냈다.
      // 그런데 막힌 소재는 보관함에도 안 들어가므로, 사람이 **판단할 자료가
      // 하나도 없이** 결과만 통보받는 꼴이었다. 관문이 과하게 걸린 건지
      // 진짜 위험한 건지 알 길이 없다.
      //
      // 관문의 목적은 사람을 대신해 결정하는 게 아니라 사람이 결정할 수
      // 있게 하는 것이다. 그래서 심사 메모와 출처를 같이 보여준다.
      if (item.risk_notes) log.info(`  심사 메모: ${item.risk_notes}`);
      if (item.what_is_strange) log.info(`  이상한 점: ${item.what_is_strange}`);
      if ((item.risk_flags || []).length) log.info(`  위험 표시: ${item.risk_flags.join(', ')}`);
      for (const src of (item.sources || []).slice(0, 5)) {
        log.info(`  출처: [${src.kind || '?'}] ${src.name || ''} ${src.url || ''}`);
      }
      log.info('  이 판정이 과하다고 보시면 소재를 좁혀 다시 지정하거나, 사람이 직접 확인해 주세요.');
      continue;
    }
    saveToInbox(item);
    kept.push(item);
  }

  log.section(`📋 보관함에 들어간 소재 ${kept.length}건`);
  kept.sort((a, b) => b.final_score - a.final_score).forEach((item, i) => printCard(item, i + 1));

  // 관문을 통과한 소재만 대본을 쓴다.
  // 검토 필요(REVIEW_NEEDED) 소재로 대본을 쓸 것인가.
  //
  // ─────────────────────────────────────────────────────────────
  // 소재를 사람이 지정했으면 쓴다
  // ─────────────────────────────────────────────────────────────
  //
  // 원래는 AUTO_OK만 대본을 썼다. AI가 소재를 고르던 시절엔 그게 맞았다 —
  // 아무도 안 본 소재로 돈을 쓰면 안 되니까.
  //
  // 그런데 전설 추적 편(LEGEND)을 만들면서 설계가 자기모순이 됐다.
  // LEGEND는 **항상** REVIEW_NEEDED로 나오게 해뒀는데(지어낸 이야기를
  // 사실처럼 쓰지 않았는지 사람이 읽어야 하므로), REVIEW_NEEDED는 대본을
  // 안 쓴다. **읽을 대본을 안 만들어 놓고 읽으라고 하는 꼴**이었다.
  //
  // 검토해야 할 대상이 소재가 아니라 **대본**이기 때문에 생긴 문제다.
  // 그리고 --topic 으로 소재를 지정했다는 건 고르는 판단을 사람이 이미
  // 했다는 뜻이다. 남은 검토는 결과물에 대한 것이다.
  //
  // 그래서: 소재를 지정했으면 REVIEW_NEEDED도 대본을 쓴다. 대신 **올리기
  // 전에 읽어야 한다는 것을 분명히 말한다.** BLOCKED는 그대로 막는다.
  const autoOk = kept.filter((i) => i.gate === GATE.AUTO_OK);
  const needsReview = kept.filter((i) => i.gate === GATE.REVIEW_NEEDED);
  const writeHeld = Boolean(topic);

  const ready = writeHeld ? [...autoOk, ...needsReview] : autoOk;
  const held = writeHeld ? [] : needsReview;

  log.raw('');
  if (held.length) {
    log.warn(`${held.length}건은 검토가 필요해 대본을 쓰지 않습니다:`);
    for (const h of held) log.info(`· ${h.title} — ${(h.gate_reasons || []).join(', ')}`);
    log.info('소재를 직접 지정(--topic)하면 검토 필요 소재로도 대본을 씁니다.');
  }
  if (writeHeld && needsReview.length) {
    log.warn(`소재를 지정하셨으므로 검토 필요 소재로도 대본을 씁니다 (${needsReview.length}건).`);
    for (const h of needsReview) {
      for (const reason of h.gate_reasons || []) log.info(`· ${reason}`);
    }
    log.error('만들어진 대본은 올리기 전에 반드시 읽어 주세요.');
  }

  if (!ready.length) {
    log.warn('관문을 통과한 소재가 없어 대본을 쓰지 않았습니다.');
    log.info('소재 목록은 결과물에 들어 있습니다. 출처를 보고 판단해 주세요.');
    printUsage();
    return;
  }

  const targets = ready.slice(0, Math.max(1, scripts));
  log.section(`✍️  대본 작성  |  ${targets.length}편  |  모델 ${MODELS.script}`);

  const scripted = [];
  for (const item of targets) {
    const { id } = promoteToContent(item);
    log.step(`content/${id} — ${item.title}`);
    try {
      const { markdown, check } = await writeScript(item, {
        targetMinutes,
        onProgress: (m) => log.info(m),
      });
      saveScript(id, markdown, check);
      log.info(
        `나레이션 ${check.stats.narrationChars}자 (약 ${check.stats.estimatedMinutes}분), HOOK ${check.stats.hookChars}자`
      );
      for (const w of check.warnings) log.warn(w);
      if (check.ok) {
        log.ok(`완성: content/${id}/script.md`);
        scripted.push(id);
      } else {
        log.error(`양식 미달 — content/${id}/script.md 에 저장했지만 확인이 필요합니다:`);
        for (const e of check.errors) log.info(`· ${e}`);
      }
    } catch (err) {
      log.fail(`content/${id} 대본 실패`, err);
    }
  }

  if (!scripted.length) {
    if (flags.scenes) log.warn('양식을 통과한 대본이 없어 장면을 만들지 않았습니다.');
  }
  for (const id of scripted) {
    const failed = await runStages(id, flags);
    endWithFailures(failed);
  }

  log.raw('');
  log.ok('끝났습니다. 아래 Artifacts 에서 소재 목록과 대본을 내려받으세요.');
  log.info('대본을 읽고 괜찮으면 다음 Phase로 넘어갑니다. 아직 유튜브에 아무것도 올라가지 않았습니다.');
  printUsage();
}

function printUsage() {
  const rows = usageSummary();
  if (!rows.length) return;
  log.section('💰 이번 실행에 쓴 토큰');
  for (const r of rows) {
    log.info(
      `${r.model}  호출 ${r.calls}회  입력 ${r.input.toLocaleString()}  출력 ${r.output.toLocaleString()}` +
        (r.searches ? `  웹검색 ${r.searches}회` : '')
    );
  }
  log.info('실제 금액은 https://console.anthropic.com/settings/usage 에서 확인하세요.');
}

// ─────────────────────────────────────────────────────────────

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional.shift();

  switch (cmd) {
    case 'collect':
      return cmdCollect(flags);
    case 'auto':
      return cmdAuto(flags);
    case 'list':
      return cmdList();
    case 'score':
      // 보관함에 이미 있는 소재를 다시 심사하는 자리. Phase 1에서는 collect가 함께 한다.
      log.info('collect 명령이 수집과 심사를 함께 합니다. node src/main.mjs collect 를 쓰세요.');
      return;
    case 'script':
      return cmdScript(positional, flags);
    case 'scenes':
      return cmdScenes(flags);
    case 'images':
      return cmdImages(flags);
    case 'voice':
      return cmdVoice(flags);
    case 'tale':
      await cmdTale(flags);
      break;
    case 'sports':
      await cmdSports(flags);
      break;
    case 'preview':
      await cmdPreview(flags);
      break;
    case 'portrait':
      await cmdPortrait(flags);
      break;
    case 'upload':
      await cmdUpload(flags);
      break;
    case 'video':
      return cmdVideo(flags);
    default:
      log.raw('AI 서프라이즈 — 소재 수집 · 심사 · 대본 · 장면');
      log.raw('');
      log.raw('  node src/main.mjs auto --topic="소재 이름" --scenes --images --video');
      log.raw('      소재를 직접 지정해서 영상까지 한 번에. 소재는 사람이 고르는 게 낫습니다.');
      log.raw('');
      log.raw('  node src/main.mjs auto [--count=5] [--scripts=1] [--minutes=8] [--scenes]');
      log.raw('      소재 찾기부터 한 번에. GitHub Actions가 이걸 씁니다.');
      log.raw('      관문을 통과한 소재만 대본을 씁니다.');
      log.raw('      --scenes 를 붙이면 장면·프롬프트까지 이어서 만듭니다.');
      log.raw('      --scenes --video 를 붙이면 영상 파일과 쇼츠까지 만듭니다.');
      log.raw('      --scenes --images --video 를 붙이면 진짜 그림까지 만듭니다 (장당 돈이 나갑니다).');
      log.raw('      --narrate 를 더하면 목소리와 배경음악까지 넣습니다.');
      log.raw('');
      log.raw('  node src/main.mjs collect [--count=5] [--category="실제 미스터리"]');
      log.raw('      웹에서 소재를 찾아 심사하고 보관함에 넣습니다.');
      log.raw('');
      log.raw('  node src/main.mjs collect --topic="세르게이 포노마렌코" --legend');
      log.raw('      전설·괴담 추적 편. 사건의 1차 기록이 없는 이야기를 다룹니다.');
      log.raw('      사건이 아니라 "이야기가 어디서 왔나"를 검증하고, 대본에');
      log.raw('      출처 섹션을 필수로 박습니다. --topic 과 함께 써야 합니다.');
      log.raw('');
      log.raw('  node src/main.mjs collect --topic="플래넌 제도 등대지기 실종"');
      log.raw('      소재를 직접 지정합니다. AI가 후보를 고르지 않고 이것만 조사합니다.');
      log.raw('      검증은 그대로 걸립니다 — 원전 없는 괴담이면 빈 손으로 돌아옵니다.');
      log.raw('');
      log.raw('  node src/main.mjs list');
      log.raw('      보관함과 제작 중인 편을 보여줍니다.');
      log.raw('');
      log.raw('  node src/main.mjs script <파일명> [--minutes=8] [--force]');
      log.raw('      보관함의 소재로 대본을 씁니다.');
      log.raw('');
      log.raw('  node src/main.mjs script --id=001');
      log.raw('      이미 제작에 들어간 편의 대본을 다시 씁니다.');
      log.raw('');
      log.raw('  node src/main.mjs scenes --id=001 [--dry-run] [--video-ratio=0.15]');
      log.raw('      대본을 장면·샷으로 쪼개고 화면 프롬프트를 만듭니다.');
      log.raw('      --dry-run 은 쪼개기만 하고 멈춥니다 (비용 0원).');
      log.raw('');
      log.raw('  node src/main.mjs images --id=001 [--dry-run] [--model=dev] [--max-usd=3]');
      log.raw('      화면 프롬프트로 실제 이미지를 만듭니다. 장당 돈이 나갑니다.');
      log.raw('      --dry-run 은 몇 장에 얼마인지만 보여줍니다 (비용 0원).');
      log.raw('      이미 만든 이미지는 건너뜁니다. 중간에 죽어도 돈을 다시 안 씁니다.');
      log.raw('');
      log.raw('  node src/main.mjs voice --id=001 [--dry-run] [--voice=이름] [--voices] [--no-bgm]');
      log.raw('      대본을 읽는 목소리를 만들고 배경음악을 깝니다.');
      log.raw('      문단마다 따로 만들어 실제 길이를 재므로, 자막이 추정치가 아니라');
      log.raw('      진짜 음성에 맞습니다. --voices 는 쓸 수 있는 목소리 목록만 봅니다.');
      log.raw('');
      log.raw('  node src/main.mjs video --id=001 [--dry-run] [--no-shorts]');
      log.raw('      장면을 실제 영상 파일로 만듭니다. 쇼츠도 함께 자릅니다.');
      log.raw('      AI를 안 쓰므로 비용 0원입니다. --dry-run 은 계획만 세웁니다.');
      log.raw('');
      log.raw('  node src/main.mjs tale --plan=이상한동화/1화.json');
      log.raw('      창작 동화 한 편을 시작합니다 (조사 없음, 대본값만 듭니다).');
      log.raw('      --title / --premise / --strange / --last-line 으로도 넘길 수 있습니다.');
      log.raw('      --script=파일.md 를 주면 그 대본을 그대로 씁니다 (AI 안 부름, 비용 0원).');
      log.raw('      기본 4분입니다. 실화 편(8분)과 다릅니다.');
      log.raw('');
      log.raw('  node src/main.mjs upload --id=001');
      log.raw('      올릴 때 쓸 것들을 만듭니다 — 제목 후보, 썸네일 3장, 설명문, 태그.');
      log.raw('      썸네일은 완성된 영상에서 떼어냅니다. 그래서 "영상에 없는 장면"이');
      log.raw('      되지 않습니다. 영상을 먼저 만들어 두세요.');
      log.raw('');
      log.raw('  npm test');
      log.raw('      API 키 없이 돌아가는 테스트입니다.');
  }
}

main().catch((err) => {
  log.fail('실행 실패', err);
  process.exitCode = 1;
});
