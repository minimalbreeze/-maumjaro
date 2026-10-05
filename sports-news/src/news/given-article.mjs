// 운영자가 직접 준 기사를 글감 재료로 만든다.
//
// 왜 필요한가
//   2026-10-05 에 운영자가 신지애 통산 상금 기사를 붙여주며 "이걸 확장해서
//   작성해줘"라고 했다. 그런데 넘길 경로가 없어서 주제 한 줄만 전달됐고,
//   사실 확인 단계가 이렇게 답했다.
//
//     "'통산 상금 131억원, 2~15위 격차, 후도 유리·전미정·이지희 비교'는
//      새로운 각도일 수 있으나, 그 핵심 수치들을 검색으로 확인하지 못해
//      새 글을 쓸 만큼의 추가 사실이 확보되지 않음"
//
//   그 숫자는 운영자가 준 기사에 다 있었다(15억 3901만 엔, 후도 유리 13억
//   7297만 …). RSS 가 긁어온 기사에는 우승 소식만 있었다. 재료가 손에 있는데
//   전달이 안 돼서 글을 못 쓴 것이다.
//
// 무엇을 하지 않는가
//   원문을 복사하거나 문장을 바꿔 쓰지 않는다. 이 파일은 기사를 "확인된 사실의
//   출처"로 넘기기만 한다. 글은 그 사실을 재료로 새로 쓴다(리포 지시서).
//   출처를 '운영자 제공'으로 분명히 남겨, 어디서 온 사실인지 추적할 수 있게 한다.

/** 기사 본문에서 제목으로 쓸 첫 줄을 고른다. 없으면 주제를 쓴다. */
export function 첫줄제목(text, fallback = '') {
  const 줄 = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const 쓸만한 = 줄.find((l) => l.length >= 10 && l.length <= 120);
  return 쓸만한 || fallback;
}

/**
 * 운영자가 준 기사를 묶음(cluster)으로 만든다.
 *
 * 뉴스 수집을 거치지 않으므로 매체 수는 1이다. 점수는 매기지 않는다 —
 * 운영자가 직접 고른 글감이라 점수로 가릴 일이 없다.
 */
export function givenArticleCluster(text, { subject = '', topic = '주제', category = '' } = {}) {
  const 본문 = String(text || '').trim();
  if (!본문) return null;

  const title = 첫줄제목(본문, subject);
  return {
    label: subject || title,
    topic,
    category,
    articles: [{
      title,
      summary: 본문,
      source: '운영자 제공',
      url: '',
      publishedAt: new Date().toISOString(),
    }],
    sources: ['운영자 제공'],
    sourceCount: 1,
    articleCount: 1,
    score: 0,
    reasons: ['운영자가 직접 준 기사'],
    latestAt: new Date().toISOString(),
    hasUndated: false,
    운영자제공: true,
  };
}

/**
 * 사실 확인 단계에 덧붙일 안내.
 *
 * 이 기사는 언론사가 쓴 1차 출처다. 웹검색이 막혀도 여기 적힌 숫자는 쓸 수 있다 —
 * 그게 이 경로를 만든 이유다. 다만 적혀 있지 않은 것을 채우지는 않는다.
 */
export function givenArticleNote() {
  return `## 이 기사는 운영자가 직접 준 것이다

위 기사 본문은 운영자가 붙여 준 것이다. 언론사가 쓴 **1차 출처**로 다룬다.

- **여기 적힌 숫자와 사실을 먼저 confirmed 에 넣는다.** 특히 금액·순위·연도처럼
  글의 뼈대가 되는 수치를 빠뜨리지 않는다.
- sources 에는 '운영자 제공 기사'라고 적는다.
- **웹검색이 막혀도 이 기사만으로 글을 쓴다.** 검색이 안 된다고 포기하지 않는다.
  보강이 필요한 항목만 unverified 로 남긴다.
- 적혀 있지 않은 것을 추측으로 채우지 않는다.
- 원문을 복사하거나 문장을 바꿔 쓰지 않는다. 사실을 재료로 새로 쓴다.`;
}
