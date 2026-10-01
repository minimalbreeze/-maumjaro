// 네이버 검색광고 키워드도구 연동 검사.
//
// 가장 중요한 것: 이 기능이 없거나 실패해도 글 생성이 멈추면 안 된다.
// 보조 신호 하나 때문에 본업이 서는 일은 없어야 한다.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {
  makeSignature, toCount, competitionWeight, searchKeywordFor,
  naverAdConfig, hasNaverKeywords, attachSearchVolume,
} from '../src/news/naver-keywords.mjs';
import { demandSignals, volumeWeight } from '../src/news/demand.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

const 키지우기 = () => {
  delete process.env.NAVER_AD_API_KEY;
  delete process.env.NAVER_AD_SECRET;
  delete process.env.NAVER_AD_CUSTOMER_ID;
};

console.log('\n[네이버 검색광고 연동]');

키지우기();
check('키가 없으면 기능을 끄고 조용히 지나간다', () => {
  assert.equal(naverAdConfig(), null);
  assert.equal(hasNaverKeywords(), false);
});

check('키가 하나라도 없으면 켜지 않는다', () => {
  process.env.NAVER_AD_API_KEY = 'k';
  process.env.NAVER_AD_SECRET = 's';
  assert.equal(hasNaverKeywords(), false, 'CUSTOMER_ID 없이 켜졌습니다');
  키지우기();
});

check('서명은 {시각}.{메서드}.{경로}를 HMAC-SHA256 한 값이다', () => {
  const sig = makeSignature({ timestamp: '1700000000000', method: 'GET', path: '/keywordstool', secret: 'abc' });
  const 기대 = crypto.createHmac('sha256', 'abc').update('1700000000000.GET./keywordstool').digest('base64');
  assert.equal(sig, 기대);
});

check('"< 10"을 숫자로 바꾼다', () => {
  // 그대로 쓰면 NaN이 되어 정렬이 깨진다.
  assert.equal(toCount('< 10'), 5);
  assert.equal(toCount('<10'), 5);
  assert.equal(toCount('1,234'), 1234);
  assert.equal(toCount(900), 900);
  assert.equal(toCount(null), 0);
  assert.equal(toCount('알수없음'), 0);
});

check('경쟁이 낮을수록 가점이다', () => {
  assert.ok(competitionWeight('낮음') > competitionWeight('중간'));
  assert.ok(competitionWeight('중간') > competitionWeight('높음'));
  assert.equal(competitionWeight(''), 0);
});

check('너무 큰 키워드는 오히려 감점한다', () => {
  // 10만 회짜리는 개인 블로그가 1페이지에 가기 어렵다.
  assert.ok(volumeWeight(8000) > volumeWeight(246000), '노릴 구간이 더 높아야 합니다');
  assert.ok(volumeWeight(246000) < 0);
  assert.ok(volumeWeight(50) < 0, '아무도 안 찾는 말도 감점');
  assert.equal(volumeWeight(0), 0);
});

console.log('\n[검색어 고르기]');

const 사례 = [
  ['여자농구 AG 금메달 영웅들, 박신자컵 출격', '박신자컵'],
  ['2026 삼성화재배 8강 대진 확정', '삼성화재배'],
  ['제31회 LG배 조선일보 기왕전', 'LG배'],
];
for (const [label, want] of 사례) {
  check(`"${label.slice(0, 20)}…" → ${want}`, () => {
    assert.equal(searchKeywordFor(label), want);
  });
}

check('서술어를 검색어로 뽑지 않는다', () => {
  const kw = searchKeywordFor('메츠 왜 이 선수 버렸을까, 106년 만의 기록');
  assert.ok(!/까$/.test(kw), kw);
  assert.ok(!/^\d/.test(kw), `숫자로 시작합니다: ${kw}`);
});

check('뽑을 말이 없으면 빈 문자열', () => {
  assert.equal(searchKeywordFor(''), '');
  assert.equal(searchKeywordFor('경기 선수 오늘'), '');
});

// ── 실제 호출 경로 ─────────────────────────────────────────
console.log('\n[실제 호출 경로]');

const 받은요청 = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  받은요청.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    keywordList: [
      { relKeyword: '박신자컵', monthlyPcQcCnt: 1200, monthlyMobileQcCnt: 6900, compIdx: '낮음' },
      { relKeyword: '여자농구', monthlyPcQcCnt: '< 10', monthlyMobileQcCnt: 24000, compIdx: '높음' },
    ],
  }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

// 실제 주소 대신 모의 서버를 보게 한다.
const 원래fetch = globalThis.fetch;
const port = server.address().port;
globalThis.fetch = (url, opts) =>
  원래fetch(String(url).replace('https://api.searchad.naver.com', `http://127.0.0.1:${port}`), opts);

process.env.NAVER_AD_API_KEY = 'test-key';
process.env.NAVER_AD_SECRET = 'test-secret';
process.env.NAVER_AD_CUSTOMER_ID = '123456';

const clusters = [
  { label: '여자농구 AG 금메달 영웅들, 박신자컵 출격', sourceCount: 3, articles: [] },
  { label: '아시안게임 여자농구 결승전', sourceCount: 10, articles: [] },
];
await attachSearchVolume(clusters, { limit: 5 });

check('검색수를 글감에 붙인다', () => {
  assert.ok(clusters[0].searchVolume, '안 붙었습니다');
  assert.equal(clusters[0].searchVolume.total, 8100);
  assert.equal(clusters[0].searchVolume.competition, '낮음');
});

check('인증 헤더 네 개를 모두 보낸다', () => {
  const h = 받은요청[0].headers;
  for (const k of ['x-timestamp', 'x-api-key', 'x-customer', 'x-signature']) {
    assert.ok(h[k], `${k}가 없습니다`);
  }
});

check('비밀키를 주소나 헤더에 그대로 싣지 않는다', () => {
  const 전부 = JSON.stringify(받은요청);
  assert.ok(!전부.includes('test-secret'), '비밀키가 요청에 노출됐습니다');
});

check('힌트 키워드에서 공백을 뺀다', () => {
  assert.ok(!받은요청[0].query.hintKeywords.includes(' '), 받은요청[0].query.hintKeywords);
});

check('진짜 검색수가 대리 신호보다 세게 반영된다', () => {
  const d = demandSignals(clusters[0]);
  assert.ok(d.search, '검색 신호가 없습니다');
  assert.ok(d.weight > 20, `${d.weight}점`);
  assert.ok(d.reasons.some((r) => r.includes('8,100')), d.reasons.join(' | '));
});

// 실패해도 멈추지 않는지
server.close();
globalThis.fetch = () => Promise.reject(new Error('네트워크 끊김'));
const 실패글감 = [{ label: '삼성화재배 8강', sourceCount: 3, articles: [] }];
let 알림 = '';
const 결과 = await attachSearchVolume(실패글감, { onError: (m) => { 알림 = m; } });

check('조회가 실패해도 글감을 그대로 돌려준다', () => {
  assert.equal(결과.length, 1);
  assert.equal(결과[0].searchVolume, undefined);
  assert.ok(알림, '실패를 알려주지 않았습니다');
});

check('검색수가 없어도 수요 신호는 계산된다', () => {
  const d = demandSignals(실패글감[0]);
  assert.ok(Number.isFinite(d.weight), JSON.stringify(d));
  assert.equal(d.search, null);
});

globalThis.fetch = 원래fetch;
키지우기();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
