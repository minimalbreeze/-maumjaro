// 스포츠 선수 MBTI — 공개 출처가 있는 것만
//
// 왜 이 파일이 따로 있나:
// 네이버 서치어드바이저에 "신진서 mbti" "서승재 mbti" "강소휘 mbti" 같은 검색이
// 꾸준히 들어온다(30일 17회). 실존 인물의 성격 유형이라 아무 목록이나 베껴 올리면
// 안 되고, 어디서 나온 말인지를 선수마다 붙여 둬야 한다. 그래서 본문 생성 코드와
// 분리해 "출처가 달린 데이터"만 여기 모은다.
//
// 여기 넣는 기준 — 셋 다 만족해야 한다:
//   1. 선수 본인이 밝힌 것이거나, 언론사가 본인에게 직접 물어 보도한 것
//   2. 매체 이름과 보도 날짜가 특정되는 것
//   3. 링크가 살아 있는 것
//
// 넣지 않는 것:
//   - 출처 없이 떠도는 "국가대표 MBTI 모음" 류 목록
//   - 기사에서 "이 유형의 예"로 언급만 된 경우(본인이 밝힌 게 아니다)
//   - 커뮤니티 글, 위키
//
// confirmed 필드:
//   'full'    기사 원문 또는 검색 결과에서 네 글자를 그대로 확인함
//   'partial' 기사와 보도 사실은 확인했으나 네 글자 중 일부만 교차 확인됨
//             (확인된 글자를 note에 적는다. 어긋나는 글자는 하나도 없었다.)
//
// 유형을 바꾸거나 선수를 추가할 때는 반드시 출처부터 확인한다.
// 확인이 안 되면 넣지 않는다 — 비워 두는 쪽이 틀린 걸 올리는 것보다 낫다.

export const ATHLETE_MBTI = [
  {
    name: '손흥민',
    sport: '축구',
    team: '국가대표',
    type: 'ESFJ',
    confirmed: 'full',
    how: '2021년 11월 라디오 방송에서 본인이 직접 밝힘',
    source: '문화일보 2022-06-06',
    url: 'https://www.munhwa.com/article/11301379',
    note: '',
  },
  {
    name: '김도영',
    sport: '야구',
    team: 'KIA 타이거즈',
    type: 'ISFP',
    confirmed: 'full',
    how: '인터뷰에서 본인이 ISFP라고 소개',
    source: '스포츠경향 2024-09-13',
    url: 'https://sports.khan.co.kr/article/202409131050003',
    note: '',
  },
  {
    name: '김택연',
    sport: '야구',
    team: '두산 베어스',
    type: 'ISFP',
    confirmed: 'full',
    how: '같은 기획 인터뷰에서 공개',
    source: '스포츠경향 2024-09-13',
    url: 'https://sports.khan.co.kr/article/202409131050003',
    note: '',
  },
  {
    name: '윤동희',
    sport: '야구',
    team: '롯데 자이언츠',
    type: 'ESTP',
    confirmed: 'partial',
    how: '같은 기획 인터뷰에서 공개',
    source: '스포츠경향 2024-09-15',
    url: 'https://sports.khan.co.kr/article/202409150940006',
    note: '기사에서 외향(E)형으로 소개된 것까지 확인',
  },
  {
    name: '황성빈',
    sport: '야구',
    team: '롯데 자이언츠',
    type: 'ESFJ',
    confirmed: 'partial',
    how: '같은 기획 인터뷰에서 공개',
    source: '스포츠경향 2024-09-15',
    url: 'https://sports.khan.co.kr/article/202409150940006',
    note: '기사에서 외향(E)·계획(J)형으로 소개된 것까지 확인',
  },
  {
    name: '이재현',
    sport: '야구',
    team: '삼성 라이온즈',
    type: 'ISTP',
    confirmed: 'partial',
    how: '같은 기획 인터뷰에서 공개',
    source: '스포츠경향 2024-09-13',
    url: 'https://sports.khan.co.kr/article/202409131050003',
    note: '기사 제목에 김영웅과 유형이 다르다는 내용이 있음',
  },
  {
    name: '김영웅',
    sport: '야구',
    team: '삼성 라이온즈',
    type: 'ENFP',
    confirmed: 'partial',
    how: '같은 기획 인터뷰에서 공개',
    source: '스포츠경향 2024-09-13',
    url: 'https://sports.khan.co.kr/article/202409131050003',
    note: '기사에서 감정(F)형으로 소개된 것까지 확인',
  },
];
