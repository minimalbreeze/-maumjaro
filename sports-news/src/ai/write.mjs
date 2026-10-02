// 본문 작성.
//
// 이 단계에는 웹검색을 붙이지 않는다. 일부러 그렇게 한다.
// 검색을 열어두면 확인 절차를 거치지 않은 정보가 본문에 섞여 들어간다.
// 여기서는 앞 단계가 confirmed로 확정한 사실만 재료로 쓴다.

import fs from 'node:fs';
import path from 'node:path';
import { callForText } from './client.mjs';
import { ROOT, env } from '../utils/env.mjs';
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
## ⚠️ 반드시 들어가야 할 두 섹션

지시서를 다 읽었더라도 이 둘은 특히 빠지기 쉽습니다. 없으면 글을 다시 써야
합니다. 오늘 소식만 적힌 글은 한 주 뒤에 아무도 찾지 않습니다.

**1) \`## 📊\` 기록과 데이터**
확인된 숫자를 비교 대상과 함께 씁니다.
"좋은 성적" (X) → "43홈런 113타점, 2위는 106타점" (O)

**2) \`## 📌\` 배경·원리·비교 — 이 섹션이 글의 수명을 정합니다**
아래 중 **둘 이상**을 실제로 담습니다. 한 문장씩 흘리지 말고 각각 2~3문단으로.

- **규칙·제도**: 이 종목/대회가 어떻게 굴러가는지. 처음 보는 사람 기준으로.
- **원리**: 왜 그런 결과가 나오는지. 경기 구조·전략·조건.
- **역사·계보**: 언제 시작됐고 누가 있었는지. 이 기록이 왜 드문지.
- **비교**: 다른 대회·리그·선수·시설과 무엇이 어떻게 다른지.

예를 들어 지역 체육시설 재개장이라면, 재개장 날짜만 쓰고 끝내지 말고
그 종목의 코스가 어떻게 구성되는지, 이용 방법과 비용은 어떤지, 근처 다른
시설과 무엇이 다른지를 씁니다. **그게 1년 뒤에도 검색되는 부분입니다.**

출력 형식:
- 첫 줄에 제목만 씁니다 (앞에 "제목:" 같은 라벨을 붙이지 않습니다).
- 한 줄 띄고 본문을 씁니다.
- 소제목은 마크다운 H2(\`## 이모지 소제목\`)로 씁니다.
- 해시태그 목록은 쓰지 않습니다 (태그는 별도로 처리합니다).
- 설명이나 사족 없이 글 본문만 출력합니다.`;

  // effort를 낮추면 생각 토큰이 줄어 출력 요금이 내려간다. 양식이 이미
  // 지시서로 촘촘히 잡혀 있어 여기서 길게 고민할 일이 많지 않다.
  const raw = await callForText({
    system: SYSTEM, prompt,
    maxTokens: 24000,
    effort: env('WRITE_EFFORT', 'medium'),
  });
  return splitTitleAndBody(raw);
}

/**
 * ⑤ 배경·원리·비교 섹션만 따로 받아 온다.
 *
 * 왜 이게 필요한가 — 지시로는 안 됐다. 작성 지시에 "반드시 들어가야 할 두
 * 섹션"으로 박아두고 lint 검사까지 붙였는데도 7260·7264·7268·7272 네 편
 * 연속으로 빠졌다. 경고만 찍고 글은 그대로 저장됐기 때문이다.
 *
 * 전체를 다시 쓰지 않는다. 빠진 섹션 하나만 받아서 끼운다 — 한 편 다시 쓰는
 * 값의 1/5쯤이면 된다. 이 섹션이 글의 수명을 정하는 부분이라 비용을 쓸 값이 있다.
 */
export async function writeLongevitySection({ title, body, cluster, verification, focusKeyword = '' }) {
  const confirmed = (verification?.confirmed || [])
    .map((c) => `- ${c.field}: ${c.value}`).join('\n') || '(없음)';

  const prompt = `아래 블로그 글에 **"오래 검색되는 섹션"이 빠져 있습니다.** 그 섹션만 써 주세요.

## 글 제목
${title}

## 이미 쓴 본문
${body}

## 확인된 사실
${confirmed}

## 써야 할 것

\`## 📌\` 로 시작하는 소제목 하나와 그 내용만 씁니다.
소제목에는 **배경·원리·비교·역사·규칙·계보 중 한 낱말이 들어가야 합니다**
(예: \`## 📌 파크골프 코스 구성과 이용 규칙\`, \`## 📌 다른 구장과 비교하면\`).
아래 중 **둘 이상**을 실제로 담습니다. 각각 2~3문단으로 씁니다.

- **규칙·제도**: 이 종목/대회가 어떻게 굴러가는지. 처음 보는 사람 기준으로.
- **원리**: 왜 그런 결과가 나오는지. 경기 구조·전략·조건.
- **역사·계보**: 언제 시작됐고 누가 있었는지. 이 기록이 왜 드문지.
- **비교**: 다른 대회·리그·선수·시설과 무엇이 어떻게 다른지.

${focusKeyword ? `"${focusKeyword}"를 이 섹션에서 두 번 이상 자연스럽게 씁니다.\n` : ''}
## 규칙

- **공백 제외 400자 이상** 씁니다. 한 문장씩 흘리지 않습니다.
- 위 본문에 이미 적힌 내용을 되풀이하지 않습니다. 새로 알려주는 내용만 씁니다.
- 확인된 사실에 없는 숫자·날짜·이름을 만들지 않습니다. 모르면 일반적인 설명으로
  씁니다. **이 원칙이 분량보다 위에 있습니다.**
- "또한", "결론적으로", "귀추가 주목됩니다" 같은 말은 쓰지 않습니다.

소제목 한 줄과 본문만 출력합니다. 다른 설명은 붙이지 않습니다.`;

  const raw = await callForText({
    system: SYSTEM, prompt,
    maxTokens: 4000,
    effort: env('REPAIR_EFFORT', 'low'),
  });

  const t = String(raw || '').trim();

  // 소제목이 없거나, lintArticle이 "오래 가는 섹션"으로 인정하지 않는 말이면
  // 보정한다. 검사는 소제목에 배경·원리·비교·역사·규칙·계보 중 하나를 요구한다.
  // 이걸 안 맞추면 보완을 해도 검사가 계속 "섹션이 없다"고 한다 — 실제로 당했다.
  const 첫줄 = t.split('\n')[0] || '';
  if (!/^##\s/.test(첫줄)) return `${OLDEVITY_HEADING}\n\n${t}`;
  if (!LONGEVITY_WORDS.test(첫줄)) {
    return [OLDEVITY_HEADING, ...t.split('\n').slice(1)].join('\n');
  }
  return t;
}

/** lintArticle이 "오래 가는 섹션"으로 인정하는 낱말. */
export const LONGEVITY_WORDS = /배경|원리|비교|역사|규칙|계보/;
const OLDEVITY_HEADING = '## 📌 배경과 원리, 비슷한 사례 비교';

/**
 * 본문에 섹션을 끼운다.
 *
 * 자주 묻는 질문과 마지막 맺음 섹션 앞에 둔다. 글의 흐름이 ④ 데이터 → ⑤ 확장
 * → ⑥ 다음 검색이라, 질문·맺음 뒤로 가면 순서가 어그러진다.
 */
export function spliceSection(body, section) {
  const lines = String(body || '').split('\n');
  // 뒤에서부터 찾아 '자주 묻는 질문'이나 맺음 소제목의 첫 줄 위치를 잡는다.
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^##\s/.test(lines[i]) && /자주 묻는|질문|마지막|정리하면|다음에|더 찾아/.test(lines[i])) at = i;
  }
  if (at < 0) return `${body.trimEnd()}\n\n${section}`;
  return [...lines.slice(0, at), section, '', ...lines.slice(at)].join('\n').trim();
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

/**
 * AI가 쓴 티가 나는 표현과, 글 전체에서 허용하는 횟수.
 *
 * 0이면 한 번도 쓰지 않는다. 숫자가 있으면 그만큼까지는 봐준다 —
 * 한국어에서 자연스럽게 쓰이는 말까지 전부 막으면 글이 어색해진다.
 * 글투를 바꾸고 싶으면 config/style-warp.md와 이 표를 함께 고친다.
 */
export const AI_TELLS = {
  // 사람이 블로그에 거의 쓰지 않는 말들
  '결론적으로': 0,
  '귀추가 주목됩니다': 0,
  '다시 한번 강조하지만': 0,
  '앞서 언급했듯이': 0,
  '지금까지 살펴본 바와 같이': 0,
  '라고 할 수 있습니다': 0,
  '라고 볼 수 있습니다': 0,
  // 한 번까지는 자연스럽지만 반복되면 티가 난다
  '살펴보겠습니다': 1,
  '알아보겠습니다': 1,
  '기대됩니다': 1,
  '주목됩니다': 1,
  '흥미진진합니다': 1,
  '다양한': 1,
  '뿐만 아니라': 1,
  // 접속어 남용이 기계가 쓴 느낌을 가장 크게 만든다
  '또한': 2,
};

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

  // 글의 수명을 정하는 섹션. 두 편 연속 빠져서 검사로 올렸다.
  // 소제목만 있고 내용이 없는 경우도 잡으려고 분량까지 본다.
  const 오래가는 = headings.find((h) => /배경|원리|비교|역사|규칙|계보/.test(h));
  if (!오래가는) {
    issues.push('배경·원리·비교 섹션이 없습니다 (뉴스만 있으면 한 주 뒤에 죽습니다)');
  } else {
    const 조각 = body.split(new RegExp(`^##\\s*${오래가는.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'))[1] || '';
    const 본문 = 조각.split(/^##\s+/m)[0] || '';
    if (본문.replace(/\s/g, '').length < 300) {
      issues.push(`"${오래가는}" 섹션이 너무 짧습니다 (${본문.replace(/\s/g, '').length}자)`);
    }
  }

  // 문단이 길면 모바일에서 글이 벽처럼 보인다. 문장 수로 센다.
  const wall = body
    .split(/\n\s*\n/)
    .filter((para) => !/^\s*(#|\*\*Q\.|[-*✅✔•])/.test(para))
    .filter((para) => (para.match(/[.!?…](\s|$)/g) || []).length > 4);
  if (wall.length) issues.push(`문단 ${wall.length}개가 너무 깁니다 (2~3문장마다 빈 줄로 끊으세요)`);

  // AI가 쓴 티가 나는 표현을 잡는다.
  //
  // 운영자가 정한 첫 번째 원칙이 "AI가 쓴 글처럼 보이지 않는다"이다.
  // 문서로만 적어두면 지켜지지 않으므로 셀 수 있는 것은 센다.
  // limit은 "글 전체에서 이만큼까지 봐준다"는 뜻이다.
  for (const [phrase, limit] of Object.entries(AI_TELLS)) {
    const count = body.split(phrase).length - 1;
    if (count > limit) {
      issues.push(limit === 0
        ? `AI 티가 나는 표현 "${phrase}"가 들어 있습니다`
        : `"${phrase}"가 ${count}회 나옵니다 (${limit}회까지)`);
    }
  }

  // 형식 규칙
  if (/^---\s*$/m.test(body)) issues.push('구분선(---)이 들어 있습니다');
  if (/^\s*\|.*\|/m.test(body)) issues.push('표가 들어 있습니다');
  if (/!\[.*\]\(/.test(body)) issues.push('이미지가 들어 있습니다');
  if (/#[가-힣A-Za-z0-9]+/.test(body)) issues.push('본문에 # 해시태그가 들어 있습니다');

  return { ok: issues.length === 0, issues, headings };
}
