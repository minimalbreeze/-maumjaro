// 뉴스 기사 없이, 주제만 받아 공식 자료를 찾아 사실을 모은다.
//
// 왜 필요한가
//   지금까지 파이프라인의 입구는 뉴스 RSS였다. 그런데 운영자의 실측에서 가장 잘
//   되는 글감은 뉴스에 없는 정보다.
//
//     남서울 파3 이용방법     38클릭 / CTR 13.7%
//     서평택 파3 예약방법      6클릭 / CTR 18.2%
//     안산 제일cc 파3 복장     3클릭 / CTR 23.1%
//
//   요금·예약 방법·주차·가는 길은 스포츠 뉴스에 안 나온다. 시설 공식 홈페이지나
//   지자체 안내에 있다. 그래서 "KBL 티켓 예매 방법" 같은 주제를 지정해도 뉴스
//   근거가 부족하다며 글을 못 썼다(실제로 건너뛰었다).
//
//   가장 잘 되는 글감을 구조적으로 못 쓰고 있었다. 이 파일이 그 입구를 연다.
//
// 베끼지 않는다
//   찾은 글을 옮기거나 문장을 바꿔 쓰지 않는다. **사실만 확인해서 새로 쓴다.**
//   그게 기존 사실확인 단계가 하던 일이고, 여기서는 그 일을 입구로 옮긴 것뿐이다.

import { callWithSearch, toolInputOf, searchSummary } from './client.mjs';
import { officialBlock } from '../news/official.mjs';
import { SYSTEM, REPORT_TOOL } from './analyze.mjs';

/**
 * 출처 등급.
 *
 * 블로그·카페도 본다 — 실제 이용 후기에만 있는 정보가 있다(주차가 실제로 되는지,
 * 예약이 얼마나 빨리 차는지). 다만 **단독 근거로는 쓰지 않는다.** 블로그 하나만
 * 보고 요금을 단정하면 틀린 정보가 그대로 옮겨 붙는다. 요금·일정·연락처처럼
 * 틀리면 독자가 헛걸음하는 항목은 공식 출처에서 확인되어야 한다.
 */
export const 출처등급 = `## 출처 등급 (중요)

**1순위 — 공식**
- 관공서·지자체 (go.kr, 시청·군청·체육시설관리공단)
- 협회·연맹 (대한체육회, KBL, KLPGA, 대한파크골프협회 등 or.kr)
- 시설·구단 공식 홈페이지, 공식 예매처

**2순위 — 언론**
- 신문·방송 보도

**3순위 — 블로그·카페·커뮤니티**
- 실제 이용 후기에만 있는 정보가 있습니다(주차가 실제로 되는지, 예약이 얼마나
  빨리 차는지, 초보가 가도 되는지). 이런 것은 참고하세요.
- **다만 단독 근거로 쓰지 마세요.** 블로그 하나만 보고 요금·일정·연락처를
  단정하면 틀린 정보가 그대로 옮겨 붙습니다.
- 아래 항목은 **1순위에서 확인되어야만** confirmed에 넣으세요. 아니면 unverified로:
  **요금·이용료·예약 방법·운영 시간·휴무일·주소·연락처·대회 일정·상금**

**어디서도 못 찾으면 unverified에 넣으세요.** 지어내지 마세요.
이 원칙이 글의 분량과 완성도보다 위에 있습니다.`;

/**
 * 주제 하나를 받아 웹검색으로 사실을 모은다.
 *
 * verifyCluster와 같은 도구(REPORT_TOOL)로 결과를 받는다. 뒤 단계(작성·SEO)가
 * 같은 모양을 기대하기 때문이다. 다른 점은 입력이 "뉴스 기사 목록"이 아니라
 * "주제 한 줄"이라는 것뿐이다.
 */
export async function researchSubject(subject, {
  relatedPosts = [], today, category = '',
  // 공식 페이지에서 직접 받아온 내용. 웹검색이 막혀도 사실을 얻는 길이다.
  // main.mjs 가 gatherOfficial() 결과를 넣어 준다.
  official = [],
} = {}) {
  const existingLines = relatedPosts.length
    ? relatedPosts.map((p) => `- "${p.title}" (${p.date?.slice(0, 10)}, 유사도 ${Math.round((p.similarity || 0) * 100)}%)`).join('\n')
    : '(비슷한 기존 글 없음)';

  // 공식 페이지에서 받아온 글을 프롬프트 앞쪽에 둔다. 웹검색보다 먼저 쓰게 한다.
  const officialText = official.length ? `${officialBlock(official)}\n\n` : '';

  const prompt = `오늘 날짜: ${today} (한국시간)
${category ? `분야: ${category}\n` : ''}
## 쓰려는 주제
${subject}

## 내 블로그의 기존 글 중 비슷한 것
${existingLines}

${officialText}## 할 일

이 주제로 블로그 글을 쓰려고 합니다. **뉴스 기사는 없습니다.**${official.length
  ? ' 위에 코드가 직접 받아온 공식 페이지 내용이 있습니다. **그것부터 confirmed 에 넣고**, 모자란 것을 웹검색으로 보강하세요.'
  : ' 웹검색으로 직접 자료를 찾아 사실을 모아 주세요.'}

1. 주제에 나온 고유명사(시설명·대회명·단체명)의 **공식 출처**를 먼저 찾으세요.
2. 독자가 실제로 궁금해하는 것부터 확인하세요. 순서대로:
   - **요금·이용료·참가비** (얼마인지, 할인 대상이 있는지)
   - **예약 방법** (어디서, 언제부터, 전화인지 온라인인지)
   - **운영 시간·휴무일**
   - **위치·가는 길·주차** (주소, 대중교통, 주차 가능 여부와 요금)
   - **준비물·복장 규정**
   - 대회라면: 정식 명칭, 일정, 장소, **상금**, 주관 단체, 출전 선수
3. 숫자는 출처와 함께 확인하세요. confirmed의 sources에 어디서 봤는지 적으세요.
4. 기존 블로그 글과 사실상 같은 내용인지 판단하세요.
5. 확인이 끝나면 report_verification 도구를 호출해 결과를 보고하세요.

${출처등급}

## eventStatus 에 대하여

이 주제가 특정 시점의 사건이 아니라 "계속 유효한 안내"라면 \`unclear\` 대신
상황에 맞게 고르되, 시설 안내처럼 늘 유효한 내용이면 \`ongoing\` 으로 두세요.

${official.length ? `
## 웹검색이 막히면

웹검색이 한도 초과 등으로 작동하지 않으면 **거기서 멈추고, 위 공식 페이지에서
얻은 것만으로 보고하세요.** 검색이 안 된다고 글을 포기하지 마세요 — 공식 페이지에
요금과 운영 안내가 이미 적혀 있습니다. 모자란 항목은 unverified 로 남기면 됩니다.
` : ''}
report_verification 도구를 반드시 호출해야 합니다.`;

  const response = await callWithSearch({
    system: SYSTEM,
    prompt,
    tools: [REPORT_TOOL],
    maxTokens: 16000,
  });

  const result = toolInputOf(response, 'report_verification');
  if (!result) {
    const err = new Error('자료 조사 결과를 받지 못했습니다');
    err.code = 'RESEARCH_NO_RESULT';
    throw err;
  }

  return { ...result, searched: searchSummary(response) };
}

/**
 * 조사 결과를 뒤 단계가 쓰는 "묶음" 모양으로 바꾼다.
 *
 * 작성·SEO·분류 단계는 cluster를 받게 되어 있다. 뉴스가 없으니 기사 목록은
 * 비어 있고, 제목 자리에 주제를 넣는다.
 */
export function subjectAsCluster(subject, { topic = '주제', category = '' } = {}) {
  return {
    label: subject,
    topic,
    category,
    articles: [],
    sourceCount: 0,
    score: 0,
    reasons: ['주제 지정 — 뉴스 없이 공식 자료로 조사'],
    latestAt: new Date().toISOString(),
  };
}
