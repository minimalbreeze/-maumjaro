// 환경변수 로딩과 검증.
//
// 원칙: 값 자체는 어디에도 출력하지 않는다. "무엇이 비었는지"만 알려준다.
// dotenv를 쓰지 않는다 — Node 22의 process.loadEnvFile()이 같은 일을 하므로
// 의존성을 하나 줄인다.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const envPath = path.join(ROOT, '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

/** 값 없이 키만 반환한다. 로그에 그대로 찍어도 안전하다. */
export function missingKeys(keys) {
  loadEnv();
  return keys.filter((k) => !process.env[k] || !String(process.env[k]).trim());
}

export function env(key, fallback = undefined) {
  loadEnv();
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

export function requireEnv(keys) {
  const missing = missingKeys(keys);
  if (missing.length) {
    const err = new Error(`.env에 다음 값이 필요합니다: ${missing.join(', ')}`);
    err.code = 'ENV_MISSING';
    err.missing = missing;
    throw err;
  }
}

/**
 * 로그·콘솔에 나가는 모든 문자열이 통과하는 마스킹 필터.
 *
 * 두 가지를 지운다.
 *  1) .env에 들어 있는 실제 비밀값 (길이 8자 이상인 것만 — "true" 같은 값까지
 *     지우면 로그가 ***투성이가 된다)
 *  2) .env에 없더라도 형태만 봐도 비밀인 것 (sk-ant-..., Basic 인증 헤더 등)
 */
const SECRET_KEY_PATTERN = /(KEY|TOKEN|PASSWORD|SECRET|PASS)/i;

export function maskSecrets(input) {
  loadEnv();
  let s = typeof input === 'string' ? input : String(input);

  for (const [k, v] of Object.entries(process.env)) {
    if (!SECRET_KEY_PATTERN.test(k)) continue;
    if (!v || v.length < 8) continue;
    s = s.split(v).join(`***${k}***`);
  }

  s = s
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***')
    .replace(/(Authorization:\s*)(Basic|Bearer)\s+\S+/gi, '$1$2 ***')
    .replace(/\/\/[^/@\s:]+:[^/@\s]+@/g, '//***:***@');

  return s;
}
