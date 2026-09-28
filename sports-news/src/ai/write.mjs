// 본문 작성.
//
// 이 단계에는 웹검색을 붙이지 않는다. 일부러 그렇게 한다.
// 검색을 열어두면 확인 절차를 거치지 않은 정보가 본문에 섞여 들어간다.
// 여기서는 앞 단계가 confirmed로 확정한 사실만 재료로 쓴다.

import fs from 'node:fs';
import path from 'node:path';
import { callForText } from './client.mjs';
import { ROOT } from '../utils/env.mjs';
import { targetKeywordCount } from '../seo/rankmath.mjs';

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

export async function writeArticle({ cluster, verification, today, focusKeyword = '' }) {
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

${focusKeyword ? `## 🔑 검색 키워드 배치

이 글의 대표 검색 키워드는 **"${focusKeyword}"** 입니다.

반드시 들어가야 할 자리:
- 제목 (앞쪽에)
- 글 맨 앞 핵심 요약의 **첫 문장**
- 소제목 중 최소 하나
- 자주 묻는 질문의 질문 문장 중 하나

그리고 본문 전체에서 **"${focusKeyword}"를 ${targetKeywordCount()}회 이상** 씁니다.
검색엔진이 키워드 밀도 1.25% 이상을 요구하기 때문입니다.

억지로 끼워 넣으라는 뜻이 아닙니다. "이 대회", "그 선수" 같은 대명사로 받을
자리에 이름을 그대로 한 번 더 쓰면 자연스럽게 채워집니다. 어차피 AI가 문단을
떼어 인용할 때도 대명사보다 이름이 들어 있는 문장이 인용됩니다.
다만 한 문단에 세 번 넣는 식으로 몰아 쓰지는 마세요.
` : ''}
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
  if (body.length < 2400) issues.push(`본문이 너무 짧습니다 (${body.length}자, 3,000자 이상 권장)`);

  // [8]-⑧ 마지막 소제목에 "마무리" 금지
  const headings = [...body.matchAll(/^##\s*(.+)$/gm)].map((m) => m[1].trim());
  if (headings.some((h) => h.includes('마무리'))) issues.push('소제목에 "마무리"가 들어 있습니다');
  if (headings.length < 6) issues.push(`소제목이 ${headings.length}개뿐입니다 (7~9개 권장)`);
  if (!/^##\s*[^\n]*(자주 묻는|Q&A|궁금)/m.test(body) && !/\*\*Q\./.test(body)) {
    issues.push('자주 묻는 질문 섹션이 없습니다');
  }

  // 문단이 길면 모바일에서 글이 벽처럼 보인다. 문장 수로 센다.
  const wall = body
    .split(/\n\s*\n/)
    .filter((para) => !/^\s*(#|\*\*Q\.|[-*✅✔•])/.test(para))
    .filter((para) => (para.match(/[.!?…](\s|$)/g) || []).length > 4);
  if (wall.length) issues.push(`문단 ${wall.length}개가 너무 깁니다 (2~3문장마다 빈 줄로 끊으세요)`);

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
