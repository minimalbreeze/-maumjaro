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

/**
 * Phase 5가 만든 편집 계획을 저장한다.
 *
 * 영상 파일 자체는 content/<id>/video/ 에 들어간다. 계획(timeline.json)과
 * 자막은 따로 저장한다 — 렌더가 중간에 죽어도 같은 계획으로 이어서 할 수
 * 있어야 하고, 사람이 "이 샷만 다시"라고 말할 수 있어야 한다.
 */
/**
 * 올릴 때 필요한 것들을 한 폴더에 모은다.
 *
 * content/<편>/upload/ 안에 제목 후보, 썸네일 3장, 설명문, 태그를 둔다.
 * 유튜브 창을 열어 두고 이 폴더만 보면 되도록 — 여러 파일을 뒤져가며
 * 올리면 고지 체크 같은 걸 빠뜨린다.
 */
export function saveUploadPack(id, { titles = [], droppedTitles = [], thumbnails = [], droppedThumbs = [], description = '', tags = [], moments = [] } = {}) {
  const dir = contentPath(id, 'upload');
  ensureDir(dir);

  fs.writeFileSync(
    path.join(dir, 'upload.json'),
    JSON.stringify({ titles, droppedTitles, thumbnails, droppedThumbs, description, tags, moments }, null, 2) + '\n',
    'utf8'
  );
  fs.writeFileSync(path.join(dir, '설명문.txt'), description + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, '태그.txt'), tags.join(', ') + '\n', 'utf8');

  const md = ['# 올릴 때 쓸 것들', ''];
  md.push('## 제목 후보', '');
  if (titles.length) {
    titles.forEach((t, i) => {
      md.push(`${i + 1}. ${t.text}  (${t.text.length}자)`);
      if (t.why) md.push(`   - ${t.why}`);
    });
  } else {
    md.push('(규격을 통과한 제목이 없습니다. 아래 거른 목록을 보고 직접 정해 주세요.)');
  }
  if (droppedTitles.length) {
    md.push('', '### 거른 제목', '');
    for (const t of droppedTitles) md.push(`- ${t.text}`, ...t.problems.map((p) => `  - ${p}`));
  }

  md.push('', '## 썸네일', '');
  md.push('`upload/` 안의 `thumb-1.jpg` ~ `thumb-3.jpg` 중에서 고르세요.');
  md.push('');
  md.push('세 장 모두 **완성된 영상에서 떼어낸 장면**입니다. 그래서');
  md.push('"썸네일이 영상에 없는 장면"이라는 문제가 생기지 않습니다.');
  md.push('');
  thumbnails.forEach((t, i) => {
    const at = moments[i]?.at;
    md.push(`- thumb-${i + 1}.jpg — "${t.line1} / ${t.line2}"${at != null ? ` (영상 ${Math.floor(at / 60)}분 ${Math.round(at % 60)}초 지점)` : ''}`);
  });
  if (droppedThumbs.length) {
    md.push('', '### 거른 썸네일 문구', '');
    for (const t of droppedThumbs) md.push(`- ${t.line1} / ${t.line2}`, ...t.problems.map((p) => `  - ${p}`));
  }

  md.push('', '## 설명문', '', '```', description, '```');
  md.push('', '## 태그', '', tags.join(', '));
  md.push('', '---', '', '올리기 전에 `video/올리기-전-확인.md` 를 꼭 읽어 주세요.');
  fs.writeFileSync(path.join(dir, '올릴때-쓸것.md'), md.join('\n') + '\n', 'utf8');

  return dir;
}

export function saveVideoPlan(id, {
  timeline,
  subtitleAss,
  subtitleSrt = null,
  shorts = [],
  checklist = null,
}) {
  const dir = contentPath(id, 'video');
  ensureDir(dir);

  fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline, null, 2) + '\n', 'utf8');
  if (subtitleAss) fs.writeFileSync(path.join(dir, timeline.subtitle || 'subtitle.ass'), subtitleAss, 'utf8');
  // 유튜브에 따로 올릴 자막 트랙 (Phase 7에서 쓴다).
  if (subtitleSrt) fs.writeFileSync(path.join(dir, 'subtitle-ko.srt'), subtitleSrt, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'shorts.json'),
    JSON.stringify(
      {
        count: shorts.length,
        // 문단 본문은 다시 빼낼 수 있으므로 저장하지 않는다. 파일이 커지면
        // 사람이 열어볼 수 없게 된다.
        shorts: shorts.map(({ paragraphs, ...rest }) => rest),
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  // 업로드 전에 사람이 확인해야 하는 것.
  //
  // 업로드 코드(Phase 7)는 아직 없다. 그래도 지금 남긴다 — 손으로 올리든
  // 코드로 올리든 확인할 항목은 같고, 가장 위험한 항목(AI 합성 고지)은
  // 빠뜨리면 광고 수익이 아니라 **계정**이 날아가기 때문이다.
  if (checklist) {
    fs.writeFileSync(path.join(dir, 'upload-checklist.json'), JSON.stringify(checklist, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(dir, '올리기-전-확인.md'), renderChecklist(checklist), 'utf8');
  }

  return dir;
}

/** 체크리스트를 사람이 읽는 형태로. JSON만 두면 아무도 안 읽는다. */
function renderChecklist(checklist) {
  const lines = ['# 올리기 전 확인', ''];
  lines.push('유튜브에서 실제로 문제 삼는 항목만 모았습니다. 근거는 결정사항.md에 있습니다.');
  lines.push('');

  for (const item of checklist.items || []) {
    lines.push(`## ${item.required ? '🔴 필수' : '🟡 권장'} — ${item.label}`);
    lines.push('');
    lines.push(`- **어떻게:** ${item.how}`);
    lines.push(`- **왜:** ${item.why}`);
    if (item.auto) lines.push('- 코드가 자동으로 검사한 항목입니다.');
    if (item.problems?.length) {
      lines.push('- **걸린 것:**');
      for (const p of item.problems) lines.push(`  - ${p.why}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('처벌이 서로 다릅니다. 가벼운 순서가 아닙니다:');
  lines.push('');
  lines.push('| 위반 | 결과 |');
  lines.push('|---|---|');
  lines.push('| AI 합성 미고지 | **계정 정지** 또는 광고 수익 박탈 |');
  lines.push('| 오해를 부르는 제목·썸네일 | **영상 삭제** |');
  lines.push('| 그래픽한 묘사 | 광고 제한 또는 없음 |');
  lines.push('| 양산형 포맷 | 채널 수익화 자격 상실 |');
  lines.push('');
  return lines.join('\n');
}

/**
 * 나레이션 결과를 저장한다.
 *
 * timings 가 이 파일의 존재 이유다. 영상 쪽(자막·장면 전환)이 "330자에 1분"
 * 추정치 대신 **실제로 잰 길이**를 쓰게 하는 다리다. 음성 파일만 있으면
 * 영상 코드가 그걸 다시 분석해야 하는데, 이미 만들 때 쟀으므로 적어둔다.
 */
export function saveNarration(id, { timings = [], totalSeconds = 0, voice = '', track = null }) {
  const dir = contentPath(id, 'audio');
  ensureDir(dir);
  fs.writeFileSync(
    path.join(dir, 'timings.json'),
    JSON.stringify(
      {
        voice,
        total_seconds: totalSeconds,
        // 쓴 곡. 출처 표기가 필요하면 업로드할 때 설명란에 넣는다.
        bgm: track ? { file: track.file, title: track.title || '', attribution: track.attribution || '' } : null,
        count: timings.length,
        timings,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  return dir;
}

/** 저장해 둔 나레이션 타이밍. 없으면 null — 영상은 추정치로 간다. */
export function loadNarration(id) {
  try {
    const file = contentPath(id, 'audio', 'timings.json');
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (parsed?.timings || []).length ? parsed : null;
  } catch {
    return null;
  }
}
