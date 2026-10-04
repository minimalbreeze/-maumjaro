// 콘텐츠 저장소 (기획서 21번).
//
// 콘텐츠 한 편마다 폴더를 하나 쓴다.
//
//   content/001/research.json   소재 정보 + 심사 결과 + 상태
//   content/001/script.md       대본
//   content/001/scenes.json     장면 (Phase 2)
//   content/001/prompts.json    이미지·영상 프롬프트 (Phase 2)
//   content/001/voice.mp3       나레이션 (Phase 4)
//   content/001/timeline.json   편집 타임라인 (Phase 5)
//   content/001/thumbnail/      썸네일 후보 (Phase 6)
//   content/001/final.mp4       완성 영상 (Phase 5)
//
// 지금은 research.json과 script.md만 쓴다. 폴더 규칙을 먼저 정해 두면
// 뒤 Phase에서 파일 위치를 다시 논의하지 않아도 된다.
//
// 보관함(소재 보관함, 기획서 1번 메뉴 2)은 아직 제작에 들어가지 않은 소재다.
// 콘텐츠 번호를 주지 않고 inbox/ 에 모아둔다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, env } from './utils/env.mjs';
import { STATUS } from './model.mjs';

// 저장 위치. 기본은 ai-surprise/ 아래지만 환경변수로 옮길 수 있다.
// 테스트가 실제 content/ 폴더를 건드리지 않게 하려고 열어 둔 것이다.
const DATA_DIR = env('AI_SURPRISE_DATA_DIR', ROOT);

export const CONTENT_DIR = path.join(DATA_DIR, 'content');
export const INBOX_DIR = path.join(DATA_DIR, 'inbox');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 파일 이름에 쓸 수 없는 문자를 바꾼다. */
function slug(title) {
  return String(title || 'untitled')
    .replace(/[\\/:*?"<>|\n\r\t]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'untitled';
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 보관함 (아직 제작에 들어가지 않은 소재)
// ─────────────────────────────────────────────────────────────

/** 소재를 보관함에 저장한다. 파일 하나당 소재 하나. */
export function saveToInbox(item) {
  ensureDir(INBOX_DIR);
  const name = `${item.date_found}_${slug(item.title)}.json`;
  const file = path.join(INBOX_DIR, name);
  fs.writeFileSync(file, JSON.stringify(item, null, 2) + '\n', 'utf8');
  return file;
}

/** 보관함의 소재를 전부 읽는다. 점수 높은 순으로 돌려준다. */
export function listInbox() {
  if (!fs.existsSync(INBOX_DIR)) return [];
  return fs
    .readdirSync(INBOX_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const item = readJsonSafe(path.join(INBOX_DIR, f));
      return item ? { ...item, _file: f } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
}

/** 이미 다룬 적 있는 제목 목록. 수집할 때 중복을 피하는 데 쓴다. */
export function knownTitles() {
  const fromInbox = listInbox().map((i) => i.title);
  const fromContent = listContent().map((c) => c.research?.title).filter(Boolean);
  return [...new Set([...fromInbox, ...fromContent])];
}

// ─────────────────────────────────────────────────────────────
// 콘텐츠 (제작에 들어간 편)
// ─────────────────────────────────────────────────────────────

/** 다음 콘텐츠 번호. 001부터 세 자리로 쓴다. */
export function nextContentId() {
  ensureDir(CONTENT_DIR);
  const used = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => Number(d.name));
  const max = used.length ? Math.max(...used) : 0;
  return String(max + 1).padStart(3, '0');
}

export function contentPath(id, ...parts) {
  return path.join(CONTENT_DIR, id, ...parts);
}

/**
 * 소재를 콘텐츠로 올린다 (기획서 4번의 [대본 만들기] 버튼이 하는 일).
 * 보관함 파일은 지우지 않는다 — 기록은 남긴다.
 */
export function promoteToContent(item) {
  const id = nextContentId();
  ensureDir(contentPath(id));
  const research = { ...item, status: 'SELECTED', content_id: id, selected_at: new Date().toISOString() };
  fs.writeFileSync(contentPath(id, 'research.json'), JSON.stringify(research, null, 2) + '\n', 'utf8');
  return { id, research };
}

export function loadContent(id) {
  const research = readJsonSafe(contentPath(id, 'research.json'));
  if (!research) return null;
  const scriptFile = contentPath(id, 'script.md');
  return {
    id,
    research,
    script: fs.existsSync(scriptFile) ? fs.readFileSync(scriptFile, 'utf8') : null,
    scenes: readJsonSafe(contentPath(id, 'scenes.json')),
  };
}

export function listContent() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
    .map((d) => loadContent(d.name))
    .filter(Boolean)
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/** 상태를 바꾼다. 기획서 17번에 없는 값은 거부한다 — 오타로 상태가 깨지는 걸 막는다. */
export function setStatus(id, status) {
  if (!STATUS.includes(status)) {
    throw new Error(`모르는 상태입니다: ${status} (가능한 값: ${STATUS.join(', ')})`);
  }
  const file = contentPath(id, 'research.json');
  const research = readJsonSafe(file);
  if (!research) throw new Error(`content/${id}/research.json 을 찾을 수 없습니다`);
  research.status = status;
  research.status_updated_at = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(research, null, 2) + '\n', 'utf8');
  return research;
}

/**
 * 장면과 프롬프트를 저장한다 (기획서 21번의 scenes.json / prompts.json).
 *
 * 두 파일로 나누는 이유: scenes.json은 사람이 읽고 판단하는 것이고,
 * prompts.json은 Phase 3이 기계로 돌리는 입력이다. 성격이 달라서
 * 한 파일에 섞으면 둘 다 읽기 나빠진다.
 *
 * 문제가 남아 있으면 SCENES_READY로 올리지 않는다 — 깨진 장면으로
 * Phase 3을 돌리면 돈을 쓴 뒤에야 알게 된다.
 */
export function saveScenes(id, { scenes, stats, problems = [], cost = null }) {
  ensureDir(contentPath(id));

  fs.writeFileSync(
    contentPath(id, 'scenes.json'),
    JSON.stringify({ stats, problems, cost, scenes }, null, 2) + '\n',
    'utf8'
  );

  // Phase 3이 바로 집어 쓸 수 있는 평평한 목록.
  const prompts = [];
  for (const scene of scenes || []) {
    for (const shot of scene.shots || []) {
      prompts.push({
        shot_id: shot.shot_id,
        scene_number: scene.scene_number,
        asset_type: shot.asset_type,
        fallback: shot.fallback,
        duration: shot.duration,
        camera: shot.camera,
        image_prompt: shot.image_prompt,
        video_prompt: shot.video_prompt,
        depicts_real_person: shot.depicts_real_person,
        mood: scene.mood,
      });
    }
  }
  fs.writeFileSync(
    contentPath(id, 'prompts.json'),
    JSON.stringify({ count: prompts.length, prompts }, null, 2) + '\n',
    'utf8'
  );

  setStatus(id, problems.length ? 'SCRIPT_READY' : 'SCENES_READY');
  return contentPath(id, 'scenes.json');
}

/** 대본을 저장하고 검증 결과를 함께 남긴다. */
export function saveScript(id, markdown, check) {
  ensureDir(contentPath(id));
  fs.writeFileSync(contentPath(id, 'script.md'), markdown, 'utf8');
  fs.writeFileSync(
    contentPath(id, 'script-check.json'),
    JSON.stringify(check, null, 2) + '\n',
    'utf8'
  );
  // 양식을 통과하지 못한 대본은 SCRIPT_READY로 올리지 않는다.
  setStatus(id, check?.ok ? 'SCRIPT_READY' : 'SCRIPTING');
  return contentPath(id, 'script.md');
}
