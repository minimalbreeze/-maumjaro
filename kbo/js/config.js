/* 바뀔 수 있는 값은 전부 여기 둔다. 코드 수정 없이 운영할 수 있어야 한다(지시서 78번). */
window.KBO_CONFIG = {
  siteName: 'KBO 명당지도',
  tagline: '야구장 가기 전에, 내 자리를 미리 본다.',

  // 배포 주소가 정해지면 여기만 바꾼다. 공유 링크·OG·sitemap이 모두 이 값을 쓴다.
  siteUrl: '',

  dataDir: 'data/',

  // 날씨: 1단계는 API 키가 필요 없는 Open-Meteo를 쓴다.
  // 키가 필요한 API(기상청 단기예보)로 바꿀 때는 Cloudflare Worker 프록시 주소를
  // weatherProxyUrl에 넣는다 — 키를 클라이언트에 두지 않는다(지시서 47번).
  weather: {
    provider: 'open-meteo',
    endpoint: 'https://api.open-meteo.com/v1/forecast',
    weatherProxyUrl: '',
    cacheMinutes: 30
  },

  // 경기 상태는 우리가 단정하지 않는다. 항상 공식 발표로 보낸다(지시서 13번).
  officialStatusUrl: 'https://www.koreabaseball.com/Schedule/Schedule.aspx',

  // 공유 문구(지시서 35번)
  shareCopy: {
    seat: (stadium, section) =>
      `${stadium} ${section} 자리 어때? 👀\n내가 찾은 명당은 여기야.\n\n⚾ KBO 명당지도`,
    stadium: (stadium) =>
      `${stadium} 직관 가기 전에 자리부터 보고 가자 👀\n\n⚾ KBO 명당지도`
  },

  // 점수는 공식 정보가 아니다. 화면에 항상 이 문장을 함께 띄운다(지시서 68번).
  scoreDisclaimer: '좌석 점수는 직관 경험을 바탕으로 한 이 서비스의 참고 지표입니다. 공식 평가가 아닙니다.',
  weatherDisclaimer: '직관지수는 이 서비스의 참고 지표입니다. 경기 취소 여부와는 무관하며, 진행 여부는 공식 발표를 확인하세요.',

  /* 사용자 제보.
     지금은 외부 의존성 없이 동작한다 — 앱 안에서 폼을 채우면 정리된 글이 만들어지고,
     공유 시트나 클립보드로 운영자에게 보낸다. 로그인도 서버도 필요 없다.

     나중에 받는 곳이 생기면 여기만 채우면 그쪽으로 바뀐다.
       url   구글폼 등 웹 폼 주소. 채우면 "제보하러 가기" 버튼이 그 주소를 연다.
       email 있으면 메일 앱으로 보내는 선택지가 하나 늘어난다.
     둘 다 비어 있어도 제보는 된다(공유·복사). */
  report: {
    url: '',
    email: '',
    // 제보가 어떻게 처리되는지 사용자에게 그대로 보여준다.
    policy: '보내주신 내용은 확인을 거친 뒤 반영합니다. 확인 전에는 지도에 "확인 중"으로 표시되고, ' +
            '공식 정보와 사용자 제보는 화면에서 구분합니다.',
    topics: [
      { id: 'view',      label: '📸 시야 사진이 있어요' },
      { id: 'price',     label: '💰 실제 가격을 알아요' },
      { id: 'review',    label: '💺 앉아본 후기가 있어요' },
      { id: 'facility',  label: '🚻 매점·굿즈샵·화장실 위치' },
      { id: 'wrong',     label: '⚠️ 틀린 정보가 있어요' }
    ]
  },

  emptyText: '정보 준비 중'
};
