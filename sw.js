// 서비스 워커 — 설치 가능성과 오프라인을 담당한다
//
// 왜 만들었나(두 가지, 둘 다 실측된 문제다):
//
//  1. 안드로이드에서 설치 창이 안 떴다.
//     install-prompt.js는 beforeinstallprompt 이벤트를 잡아서 Chrome의 설치 창을
//     띄운다. 그런데 그 이벤트는 "fetch 핸들러를 가진 서비스 워커"가 있어야 온다.
//     우리는 서비스 워커가 없었으니 이벤트가 영영 오지 않았고, 안드로이드 사용자는
//     전부 수동 안내(메뉴 → 홈 화면에 추가)로 빠졌다. 10/4 잠금이 "설치해야 열린다"
//     인데, 정작 설치가 제일 어려운 길로만 열려 있었다.
//
//  2. Play 스토어(TWA)에 올리려면 필수다.
//     TWA 품질 기준이 PWA 설치 조건을 요구한다. 그리고 Chrome 86부터는 웹 쪽 404·5xx와
//     오프라인 요청 실패가 "네이티브 앱 크래시"로 집계된다 — 서비스 워커가 그걸 받아주지
//     않으면 Android Vitals가 망가진다.
//
// ⚠️ 캐시 우선(cache-first)으로 짜지 않는다.
// 서비스 워커 사고는 대부분 여기서 난다. 캐시를 먼저 쓰면, 배포를 해도 사람들 화면은
// 옛날 그대로다. 이 저장소는 index.html의 ?v=34 같은 쿼리로 갱신을 관리하는데,
// 캐시 우선이면 그 장치가 통째로 무력화된다.
//
// 그래서 네트워크 우선(network-first)이다:
//   온라인이면 항상 서버 것을 쓴다  → 배포하면 바로 반영된다. 지금과 똑같다.
//   네트워크가 죽었을 때만 캐시     → 지하철에서도 앱이 열린다
//
// 즉 이 파일은 "빠르게" 하려고 있는 게 아니라 "설치 가능하게, 그리고 끊겨도 열리게"
// 하려고 있다. 속도를 위해 캐시 우선으로 바꾸고 싶어지면, 위의 사고를 먼저 떠올릴 것.

const VERSION = 'maumjaro-v1';
const OFFLINE_URL = './';

// 네트워크가 죽었을 때 최소한 앱이 열리도록 미리 받아 두는 것들.
// 적게 잡는다 — 여기 많이 넣을수록 설치가 느려지고 틀릴 여지가 커진다.
const PRECACHE = [
  './',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // 하나라도 실패하면 addAll 전체가 실패한다. 캐시는 있으면 좋은 것이지
      // 없으면 앱이 안 도는 게 아니므로, 실패해도 설치는 끝낸다.
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 페이지가 "지금 바로 새 버전으로 넘어가라"고 말할 수 있는 통로.
// 배포 직후 탭을 닫았다 열지 않아도 넘어가게 하려고 둔다.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET만 다룬다. 그 외(POST 등)는 건드리지 않는다.
  if (req.method !== 'GET') return;

  // 다른 출처(AI 호출, 폰트, CDN)는 통째로 비켜 준다.
  // 남의 응답을 캐시하면 불투명 응답이 쌓이고 디버깅이 지옥이 된다.
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // 정상 응답만 넣어 둔다. 404·5xx를 캐시하면 그 화면이 박제된다.
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => {
        if (hit) return hit;
        // 화면 이동인데 캐시에도 없으면, 최소한 홈이라도 보여 준다.
        if (req.mode === 'navigate') return caches.match(OFFLINE_URL);
        return Response.error();
      }))
  );
});
