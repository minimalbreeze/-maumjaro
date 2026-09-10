// 본문 작성.
//
// 이 단계에는 웹검색을 붙이지 않는다. 일부러 그렇게 한다.
// 검색을 열어두면 확인 절차를 거치지 않은 정보가 본문에 섞여 들어간다.
// 여기서는 앞 단계가 confirmed로 확정한 사실만 재료로 쓴다.

import fs from 'node:fs';
import path from 'node:path';
import { callForText } from './client.mjs';
import { ROOT } from '../utils/env.mjs';

let styleCache = null;
export function loadStyle() {
  if (!styleCache) {
    styleCache = fs.readFileSync(path.join(ROOT, 'config', 'style-warp.md'), 'utf8');
  }
  return styleCache;
}

const SYSTEM = `당신은 한국의 스포츠 전문 블로거입니다. 워드프레스 블로그에 글을 씁니다.

당신이 지켜야 할 절대 규칙:
1. 전달받은 "확인된 사실" 목록에 없는 구체 정보(날짜, 장소, 상금, 스코어, 순위, 중계 채널)를
   단 하나도 만들어내지 않습니다. 없으면 그 문장을 아예 쓰지 않습니다.
2. 전망과 사실을 뒤섞지 않습니다.
3. 뉴스 기사 문장을 옮기거나 바꿔쓰지 않습니다. 사실을 재료로 새 글을 씁니다.
4. AI가 쓴 티가 나지 않게, 사람이 직접 쓴 것처럼 씁니다.`;

export async function writeArticle({ cluster, verification, today }) {
  const style = loadStyle();

  const confirmedBlock = verification.confirmed.map((c) => `- ${c.field}: ${c.value}  [확인: ${c.sources.join(', ')}]`).join('\n');
  const conflictBlock = verification.conflicting?.length
    ? verification.conflicting.map((c) => `- ${c.field}: ${c.versions.join(' / ')} (출처마다 다름 — 단정하지 말 것)`).join('\n')
    : '(없음)';
  const unverifiedBlock = verification.unverified?.length
    ? verification.unverified.map((u) => `- ${u}`).join('\n')
    : '(없음)';
  const outlookBlock = verification.outlook?.length
    ? verification.outlook.map((o) => `- ${o}`).join('\n')
    : '(없음)';
  const valueBlock = verification.addedValue?.length
    ? verification.addedValue.map((v) => `- ${v}`).join('\n')
    : '(없음)';

  const prompt = `오늘 날짜: ${today} (한국시간)
종목: ${cluster.topic}
사건 요약: ${verification.topicSummary}
진행 상태: ${statusLabel(verification.eventStatus)}

## ✅ 확인된 사실 — 본문에 쓸 수 있는 것은 이것뿐입니다
${confirmedBlock}

## ⚠️ 출처마다 다른 내용 — 단정해서 쓰지 마세요
${conflictBlock}

## 🚫 확인되지 않은 항목 — 절대 쓰지 마세요
${unverifiedBlock}

## 🔮 전망 — 반드시 전망임이 드러나게 쓰세요
${outlookBlock}

## 💡 이 글이 독자에게 줄 부가가치
${valueBlock}

────────────────────────────────────────
${style}
────────────────────────────────────────

위 규칙에 맞춰 글 전체를 작성하세요.

출력 형식:
- 첫 줄에 제목만 씁니다 (앞에 "제목:" 같은 라벨을 붙이지 않습니다).
- 한 줄 띄고 본문을 씁니다.
- 소제목은 마크다운 H2(\`## 이모지 소제목\`)로 씁니다.
- 해시태그 목록은 쓰지 않습니다 (태그는 별도로 처리합니다).
- 설명이나 사족 없이 글 본문만 출력합니다.`;

  const raw = await callForText({ system: SYSTEM, prompt, maxTokens: 32000 });
  return splitTitleAndBody(raw);
}

function statusLabel(s) {
  return { upcoming: '아직 열리지 않음 (예정)', ongoing: '진행 중', finished: '이미 종료됨', unclear: '불명확' }[s] || s;
}

export function splitTitleAndBody(raw) {
  const lines = raw.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;

  let title = (lines[i] || '').trim()
    .replace(/^#+\s*/, '')          // 제목을 H1으로 쓴 경우
    .replace(/^제목\s*[:：]\s*/, '') // 라벨을 붙인 경우
    .trim();

  const body = lines.slice(i + 1).join('\n').trim();
  return { title, body };
}

/** 지시서가 금지한 것들이 실제로 안 들어갔는지 코드로 확인한다. */
export function lintArticle({ title, body }) {
  const issues = [];

  if (!title) issues.push('제목이 비어 있습니다');
  if (body.length < 500) issues.push(`본문이 너무 짧습니다 (${body.length}자)`);

  // [8]-⑧ 마지막 소제목에 "마무리" 금지
  const headings = [...body.matchAll(/^##\s*(.+)$/gm)].map((m) => m[1].trim());
  if (headings.some((h) => h.includes('마무리'))) issues.push('소제목에 "마무리"가 들어 있습니다');
  if (headings.length < 4) issues.push(`소제목이 ${headings.length}개뿐입니다 (5~6개 권장)`);

  // [9] 반복 금지 표현
  for (const phrase of ['살펴보겠습니다', '알아보겠습니다', '기대됩니다', '주목됩니다', '흥미진진합니다']) {
    const count = body.split(phrase).length - 1;
    if (count > 1) issues.push(`"${phrase}"가 ${count}회 반복됩니다`);
  }

  // 형식 규칙
  if (/^---\s*$/m.test(body)) issues.push('구분선(---)이 들어 있습니다');
  if (/^\s*\|.*\|/m.test(body)) issues.push('표가 들어 있습니다');
  if (/!\[.*\]\(/.test(body)) issues.push('이미지가 들어 있습니다');
  if (/#[가-힣A-Za-z0-9]+/.test(body)) issues.push('본문에 # 해시태그가 들어 있습니다');

  return { ok: issues.length === 0, issues, headings };
}
