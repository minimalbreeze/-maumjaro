// 글의 흐름이 "몇 달 뒤에도 검색되는 글"의 구조를 갖췄는지 점검한다.
//
// 운영자가 정한 흐름:
//   ① 검색 관심이 올라오는 주제 → ② 사람이 궁금해할 제목 → ③ 첫 문장에서 답변
//   → ④ 데이터·사례 → ⑤ 오래 검색될 개념으로 확장 → ⑥ 다음 검색을 유도하는 끝맺음
//
// ①은 글감을 고를 때 정해진다(news/demand.mjs). 여기서는 ②~⑥을 완성된 글에
// 대고 본다. 지시서에 적어두기만 하면 지켜지지 않는다 — 셀 수 있는 것은 센다.

import { 오래가는소제목인가 } from './longevity.mjs';

const H2 = (body) => [...String(body).matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());

/** 소제목 이전의 첫 덩어리 = 핵심 요약 */
const leadOf = (body) => String(body).split(/^##\s+/m)[0] || '';

/** 마지막 소제목부터 글 끝까지 */
function tailOf(body) {
  const parts = String(body).split(/^##\s+/m);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/** 문장 수를 센다. 마침표·물음표·느낌표로 끊는다. */
const 문장수 = (text) => (String(text).match(/[.!?…]\s|[.!?…]$/g) || []).length;

const 질문어 = /(언제|어디서|어디|왜|누가|누구|몇|어떻게|무엇|뭐|될까|있나|인가|하나요|할까)/;

export function checkFlow({ title = '', body = '', demand = null } = {}) {
  const heads = H2(body);
  const lead = leadOf(body);
  const tail = tailOf(body);

  // ④ 숫자: 본문에 구체적인 수치가 얼마나 있는가 (연도만 센 것은 제외)
  const 숫자 = (body.match(/\d+(?:[.,]\d+)?\s*(?:개|명|승|패|점|타점|홈런|골|초|분|회|위|호|타|년|월|일|%|억|만|원|달러|㎞|km|m)/g) || []);

  // ⑤ 개념 확장: 시간이 지나도 값이 변하지 않는 내용의 신호
  const 개념 = /(규칙|룰|제도|방식|원리|구조|역대|통산|계보|처음|최초|비교|차이|달리|반면)/;

  const items = [
    {
      id: 'demand', step: '①', label: '관심은 오르고 경쟁은 덜한 글감',
      ok: demand ? demand.weight > 0 : null,
      detail: demand ? demand.reasons.join(' · ') : '글감 단계에서만 알 수 있습니다',
      fix: '매체가 5곳 이상 다룬 글감은 검색결과를 언론사가 가져갑니다',
    },
    {
      id: 'title-q', step: '②', label: '제목이 질문을 담았다',
      ok: 질문어.test(title),
      detail: title.slice(0, 60),
      fix: '괄호 안을 사람이 실제로 검색할 질문으로 쓰세요 (언제·왜·누가·몇·어디서)',
    },
    {
      id: 'lead-answer', step: '③', label: '첫 문단이 답부터 말한다',
      // 첫 문장이 인사말이나 배경 설명으로 시작하면 안 된다.
      ok: lead.trim().length >= 60 && !/^(안녕하세요|여러분|오늘은)/.test(lead.trim()),
      detail: lead.trim().split('\n')[0].slice(0, 60),
      fix: '인사말 없이 결론부터 쓰세요. 첫 문장에 날짜와 이름이 들어가야 합니다',
    },
    {
      id: 'data', step: '④', label: `숫자로 말한다 (${숫자.length}개)`,
      ok: 숫자.length >= 8,
      detail: 숫자.slice(0, 6).join(', '),
      fix: '기록·통산 성적·순위를 구체적인 숫자로 쓰세요. 비교 대상을 함께 두면 더 오래 읽힙니다',
    },
    {
      id: 'evergreen', step: '⑤', label: '오래 가는 내용으로 확장했다',
      ok: 개념.test(body) && heads.some(오래가는소제목인가),
      detail: heads.filter(오래가는소제목인가).join(' / ') || '해당 소제목 없음',
      fix: '규칙·원리·역사·비교 중 둘 이상을 담은 섹션을 두세요. 뉴스만 있으면 한 주 뒤에 죽습니다',
    },
    {
      // 길이로만 재면 한국어는 금방 넘어간다. "찾아볼 거리가 있는가"로 본다:
      // 구체적인 숫자(날짜·회차)가 있고, 응원 한 줄로 끝나지 않았는가.
      id: 'next-search', step: '⑥', label: '다음 검색으로 이어준다',
      ok: /\d/.test(tail) && 문장수(tail) >= 3,
      detail: tail.trim().replace(/\s+/g, ' ').slice(0, 60),
      fix: '마지막에 다음에 궁금해질 것 2~3가지를 날짜·이름으로 구체적으로 적으세요',
    },
  ];

  const 평가대상 = items.filter((i) => i.ok !== null);
  const score = 평가대상.length
    ? Math.round((평가대상.filter((i) => i.ok).length / 평가대상.length) * 100)
    : 0;

  return { items, score, missing: items.filter((i) => i.ok === false) };
}
