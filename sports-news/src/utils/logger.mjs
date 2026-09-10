// 실행 로그. logs/YYYY-MM-DD.log 에 append 한다.
//
// 콘솔과 파일 양쪽으로 나가는 모든 문자열은 반드시 maskSecrets를 통과한다.
// API 키·워드프레스 비밀번호가 로그에 남는 사고를 코드 차원에서 막는다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, maskSecrets } from './env.mjs';

const LOG_DIR = path.join(ROOT, '..', 'logs');

function todayKey() {
  // 한국 시간 기준 날짜. 새벽에 돌려도 "어제 로그"에 섞이지 않게 한다.
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function stamp() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(11, 19);
}

let stream = null;

function out(line) {
  const safe = maskSecrets(line);
  console.log(safe);
  try {
    if (!stream) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      stream = fs.createWriteStream(path.join(LOG_DIR, `${todayKey()}.log`), { flags: 'a' });
    }
    stream.write(`[${stamp()}] ${safe}\n`);
  } catch {
    // 로그 파일을 못 써도 파이프라인은 계속 돈다.
  }
}

export const log = {
  section: (t) => out(`\n${'─'.repeat(56)}\n${t}\n${'─'.repeat(56)}`),
  info: (m) => out(`   ${m}`),
  step: (m) => out(`▶ ${m}`),
  ok: (m) => out(`✅ ${m}`),
  warn: (m) => out(`⚠️  ${m}`),
  error: (m) => out(`❌ ${m}`),
  raw: (m) => out(m),
  /** 오류는 스택까지 남기되 역시 마스킹을 거친다. */
  fail: (context, err) => out(`❌ ${context}: ${err?.message || err}${err?.stack ? `\n${err.stack.split('\n').slice(1, 4).join('\n')}` : ''}`),
};

export function logHeader(mode, topics) {
  log.section(`🏅 스포츠 뉴스 → 워드프레스 임시글  |  ${todayKey()} ${stamp()} (KST)`);
  log.info(`실행 모드: ${mode}`);
  log.info(`대상 주제: ${topics.join(', ')}`);
}
