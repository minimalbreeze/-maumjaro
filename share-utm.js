// 사용자가 손으로 퍼뜨리는 공유 링크에 붙이는 표.
//
// 왜 필요한가
//   이게 없으면 인스타·스레드·X·카톡 어디로 나갔든 GA4에서 전부 "Direct"로
//   뭉뚱그려진다. 어느 기능의 공유가 실제로 사람을 데려오는지 알 수 없고,
//   모르면 늘릴 수도 없다. 유입이 공유에 달린 앱에서 이건 계기판이 없는 것과 같다.
//
//   자동 게시(scripts/fb-content.mjs)는 이미 자기 utm을 붙이므로 건드리지 않는다.
//   여기는 "사람이 공유 시트로 보낸 링크"만 담당한다.
//
// 무엇을 알 수 있게 되는가
//   utm_source=share  → 사용자 공유로 들어온 사람 (검색·직접 방문과 구분된다)
//   utm_medium=<기능> → 어느 화면의 공유가 데려왔는지 (rx / fortune / tarot ...)
//
//   어느 SNS인지까지는 알 수 없다. navigator.share()는 사용자가 공유 시트에서
//   무엇을 골랐는지 알려주지 않기 때문이다. 다만 GA4의 참조 도메인(t.co,
//   l.instagram.com 등)이 남는 경우가 있어 그쪽으로 추정할 수 있다.
(() => {
  'use strict';

  const HOST = 'maumjaro.minimalbreeze.com';

  function tag(url, medium) {
    if (typeof url !== 'string' || !url) return url;
    try {
      const u = new URL(url, location.href);
      // 남의 주소에는 붙이지 않는다. 로컬 개발 서버에서도 동작하도록 같은 출처는 허용한다.
      if (u.hostname !== HOST && u.origin !== location.origin) return url;
      // 이미 표가 있으면 덮어쓰지 않는다 — 받은 링크를 그대로 다시 공유하는 경우,
      // 최초 유입 경로를 지워버리면 안 된다.
      if (u.searchParams.has('utm_source')) return url;
      u.searchParams.set('utm_source', 'share');
      u.searchParams.set('utm_medium', medium || 'sns');
      return u.toString();
    } catch (e) {
      // URL 파싱이 실패하면 원본을 그대로 쓴다. 공유가 깨지는 것보다 표가 없는 편이 낫다.
      return url;
    }
  }

  window.MaumjaroUtm = { tag };
})();
