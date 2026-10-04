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
import { missingKeys } from './utils/env.mjs';
import { usageSummary, MODELS } from './ai/client.mjs';
import { collect } from './research/collect.mjs';
import { scoreAll } from './research/score.mjs';
import { writeScript } from './script/write.mjs';
import { GATE, MIN_SOURCE_COUNT } from './model.mjs';
import {
  saveToInbox,
  listInbox,
  listContent,
  knownTitles,
  promoteToContent,
  saveScript,
  loadContent,
  INBOX_DIR,
  contentPath,
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

  log.section(`🔍 소재 수집  |  ${count}건 요청  |  모델 ${MODELS.collect}`);

  const avoid = knownTitles();
  if (avoid.length) log.info(`이미 다룬 소재 ${avoid.length}건은 제외합니다.`);

  const found = await collect({ count, category, avoidTitles: avoid, onProgress: (m) => log.step(m) });

  if (!found.items.length) {
    log.warn('기준을 통과한 소재가 없습니다.');
    if (found.searchNotes) log.info(`조사 메모: ${found.searchNotes}`);
    return;
  }
  log.ok(`${found.items.length}건을 찾았습니다. 이제 심사합니다.`);
  if (found.searchNotes) log.info(`조사 메모: ${found.searchNotes}`);

  log.section(`⚖️  소재 심사  |  모델 ${MODELS.score}`);
  const { items, failures } = await scoreAll(found.items, { onProgress: (m) => log.step(m) });

  for (const f of failures) log.warn(`심사 실패: ${f.title} — ${f.error}`);

  const kept = [];
  for (const item of items) {
    if (item.gate === GATE.BLOCKED) {
      log.warn(`버림: ${item.title} — ${(item.gate_reasons || []).join(', ')}`);
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
  const targetMinutes = Number(flags.minutes || 4);

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
async function cmdAuto(flags) {
  requireApiKey();
  const count = Number(flags.count || 5);
  const scripts = Number(flags.scripts || 1);
  const targetMinutes = Number(flags.minutes || 4);
  const category = typeof flags.category === 'string' ? flags.category : null;

  log.section(`🔍 소재 수집  |  ${count}건 요청  |  모델 ${MODELS.collect}`);
  const found = await collect({
    count,
    category,
    avoidTitles: knownTitles(),
    onProgress: (m) => log.step(m),
  });

  if (!found.items.length) {
    log.warn('기준을 통과한 소재가 없습니다. 다시 돌려보시거나 분야를 바꿔보세요.');
    if (found.searchNotes) log.info(`조사 메모: ${found.searchNotes}`);
    return;
  }
  log.ok(`${found.items.length}건을 찾았습니다.`);
  if (found.searchNotes) log.info(`조사 메모: ${found.searchNotes}`);

  log.section(`⚖️  소재 심사  |  모델 ${MODELS.score}`);
  const { items, failures } = await scoreAll(found.items, { onProgress: (m) => log.step(m) });
  for (const f of failures) log.warn(`심사 실패: ${f.title} — ${f.error}`);

  const kept = [];
  for (const item of items) {
    if (item.gate === GATE.BLOCKED) {
      log.warn(`버림: ${item.title} — ${(item.gate_reasons || []).join(', ')}`);
      continue;
    }
    saveToInbox(item);
    kept.push(item);
  }

  log.section(`📋 보관함에 들어간 소재 ${kept.length}건`);
  kept.sort((a, b) => b.final_score - a.final_score).forEach((item, i) => printCard(item, i + 1));

  // 관문을 통과한 소재만 대본을 쓴다.
  const ready = kept.filter((i) => i.gate === GATE.AUTO_OK);
  const held = kept.filter((i) => i.gate === GATE.REVIEW_NEEDED);

  log.raw('');
  if (held.length) {
    log.warn(`${held.length}건은 검토가 필요해 대본을 쓰지 않습니다:`);
    for (const h of held) log.info(`· ${h.title} — ${(h.gate_reasons || []).join(', ')}`);
  }

  if (!ready.length) {
    log.warn('관문을 통과한 소재가 없어 대본을 쓰지 않았습니다.');
    log.info('소재 목록은 결과물에 들어 있습니다. 출처를 보고 판단해 주세요.');
    printUsage();
    return;
  }

  const targets = ready.slice(0, Math.max(1, scripts));
  log.section(`✍️  대본 작성  |  ${targets.length}편  |  모델 ${MODELS.script}`);

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
      } else {
        log.error(`양식 미달 — content/${id}/script.md 에 저장했지만 확인이 필요합니다:`);
        for (const e of check.errors) log.info(`· ${e}`);
      }
    } catch (err) {
      log.fail(`content/${id} 대본 실패`, err);
    }
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
    default:
      log.raw('AI 서프라이즈 — Phase 1 (소재 수집 · 심사 · 대본)');
      log.raw('');
      log.raw('  node src/main.mjs auto [--count=5] [--scripts=1] [--minutes=4]');
      log.raw('      소재 찾기부터 대본까지 한 번에. GitHub Actions가 이걸 씁니다.');
      log.raw('      관문을 통과한 소재만 대본을 씁니다.');
      log.raw('');
      log.raw('  node src/main.mjs collect [--count=5] [--category="실제 미스터리"]');
      log.raw('      웹에서 소재를 찾아 심사하고 보관함에 넣습니다.');
      log.raw('');
      log.raw('  node src/main.mjs list');
      log.raw('      보관함과 제작 중인 편을 보여줍니다.');
      log.raw('');
      log.raw('  node src/main.mjs script <파일명> [--minutes=4] [--force]');
      log.raw('      보관함의 소재로 대본을 씁니다.');
      log.raw('');
      log.raw('  node src/main.mjs script --id=001');
      log.raw('      이미 제작에 들어간 편의 대본을 다시 씁니다.');
      log.raw('');
      log.raw('  npm test');
      log.raw('      API 키 없이 돌아가는 테스트입니다.');
  }
}

main().catch((err) => {
  log.fail('실행 실패', err);
  process.exitCode = 1;
});
