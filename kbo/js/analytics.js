/* 이벤트 집계 래퍼. GA4가 없어도 조용히 아무 일도 하지 않는다.
   개인정보는 보내지 않는다 — 구장/구역 같은 식별 불가 값만 담는다(지시서 58번). */
(function () {
  const EVENTS = [
    'stadium_view', 'game_view', 'weather_view', 'seat_view', 'seat_share',
    'seat_recommend', 'ticket_click', 'food_view', 'shop_view',
    'facility_view', 'transport_view', 'seat_report'
  ];
  function track(name, params) {
    if (!EVENTS.includes(name)) return;           // 오타를 조용히 흘려보내지 않기 위한 화이트리스트
    try {
      if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
    } catch (e) { /* 집계 실패가 기능을 막지 않는다 */ }
  }
  window.KboAnalytics = { track, EVENTS };
})();
