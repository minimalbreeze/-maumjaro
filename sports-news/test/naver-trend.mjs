// 네이버 데이터랩 검색어트렌드 연동 검사.
//
// 가장 조심할 것: 상대지수를 절대 검색수인 척 쓰지 않는다.
// 데이터랩이 주는 0~100은 "그 요청에 넣은 키워드들 사이의" 상대값이다.

import assert from 'node:assert/strict';
import http from 'node:http';
import {
  risingFrom, trendWeight, naverTrendConfig, hasNaverTrend, attachTrend, fetchTrends,
} from '../src/news/naver-trend.mjs';
import { demandSignals } from '../src/news/demand.mjs';
import { searchKeywordFor } from '../src/news/naver-keywords.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};
const 키지우기 = () => { delete process.env.NAVER_CLIENT_ID; delete process.env.NAVER_CLIENT_SECRET; };

console.log('\n[데이터랩 검색어트렌드]');

키지우기();
check('키가 없으면 기능을 끄고 조용히 지나간다', () => {
  assert.equal(naverTrendConfig(), null);
  assert.equal(hasNaverTrend(), false);
});

check('둘 중 하나만 있으면 켜지 않는다', () => {
  process.env.NAVER_CLIENT_ID = 'id';
  assert.equal(hasNaverTrend(), false);
  키지우기();
});

const 만들기 = (ratios) => ratios.map((r, i) => ({ period: `2026-09-${String(i + 1).padStart(2, '0')}`, ratio: r }));

check('최근이 올라오면 상승으로 본다', () => {
  const r = risingFrom(만들기([...Array(23).fill(10), ...Array(7).fill(60)]));
  assert.ok(r.rising, JSON.stringify(r));
  assert.ok(r.ratio >= 1.3);
});

check('평탄하면 상승이 아니다', () => {
  assert.ok(!risingFrom(만들기(Array(30).fill(40))).rising);
});

check('내려가면 상승이 아니다', () => {
  assert.ok(!risingFrom(만들기([...Array(23).fill(80), ...Array(7).fill(10)])).rising);
});

check('값이 너무 적으면 상승을 주장하지 않는다', () => {
  assert.ok(!risingFrom(만들기([5, 90, 90])).rising, '점이 3개뿐인데 판단했습니다');
});

check('바닥에서 몇 % 오른 것을 상승이라 하지 않는다', () => {
  // 1 → 2는 2배지만 둘 다 아무도 안 찾는 수준이다.
  const r = risingFrom(만들기([...Array(23).fill(1), ...Array(7).fill(2)]));
  assert.ok(!r.rising, JSON.stringify(r));
});

check('상승에 가점, 바닥 키워드에 감점', () => {
  assert.ok(trendWeight({ rising: true, peak: 70 }) > trendWeight({ rising: false, peak: 70 }));
  assert.ok(trendWeight({ rising: false, peak: 2 }) < 0);
  assert.equal(trendWeight(null), 0);
});

// ── 실제 호출 경로 ─────────────────────────────────────────
console.log('\n[실제 호출 경로]');

const 받은 = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    받은.push({ headers: req.headers, body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      results: [
        { title: '박신자컵', keywords: ['박신자컵'], data: 만들기([...Array(23).fill(8), ...Array(7).fill(55)]) },
        { title: '여자농구', keywords: ['여자농구'], data: 만들기(Array(30).fill(45)) },
      ],
    }));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const 원래fetch = globalThis.fetch;
const port = server.address().port;
globalThis.fetch = (url, opts) =>
  원래fetch(String(url).replace('https://openapi.naver.com', `http://127.0.0.1:${port}`), opts);

process.env.NAVER_CLIENT_ID = 'test-id';
process.env.NAVER_CLIENT_SECRET = 'test-secret';

const clusters = [
  { label: '여자농구 AG 금메달 영웅들, 박신자컵 출격', sourceCount: 3, articles: [] },
  { label: '아시안게임 여자농구 결승전', sourceCount: 10, articles: [] },
];
await attachTrend(clusters, { limit: 5, keywordOf: searchKeywordFor });

check('추이를 글감에 붙인다', () => {
  assert.ok(clusters[0].trend, '안 붙었습니다');
  assert.equal(clusters[0].trend.keyword, '박신자컵');
  assert.ok(clusters[0].trend.rising);
});

check('인증 헤더 두 개를 보낸다', () => {
  const h = 받은[0].headers;
  assert.ok(h['x-naver-client-id'], 'client id가 없습니다');
  assert.ok(h['x-naver-client-secret'], 'client secret이 없습니다');
});

check('키워드 묶음을 5개까지만 보낸다', () => {
  assert.ok(받은[0].body.keywordGroups.length <= 5, JSON.stringify(받은[0].body.keywordGroups));
});

check('오늘이 아니라 어제까지로 물어본다', () => {
  // 오늘치는 집계가 덜 돼 있어 추이가 왜곡된다.
  const { startDate, endDate } = 받은[0].body;
  assert.ok(endDate < new Date().toISOString().slice(0, 10), `endDate=${endDate}`);
  assert.ok(startDate < endDate);
});

check('상승한 글감이 평탄한 글감보다 높은 점수를 받는다', () => {
  const 상승 = demandSignals(clusters[0]);
  const 평탄 = demandSignals({ sourceCount: 3, articles: [], trend: { keyword: 'x', rising: false, peak: 45, ratio: 1 } });
  assert.ok(상승.weight > 평탄.weight, `${상승.weight} vs ${평탄.weight}`);
  assert.ok(상승.reasons.some((r) => r.includes('상승')), 상승.reasons.join(' | '));
});

check('상대지수를 검색수라고 부르지 않는다', () => {
  // 문구가 "월 N회"로 나가면 사람이 절대 검색수로 오해한다.
  const d = demandSignals(clusters[0]);
  const 문구 = d.reasons.join(' ');
  assert.ok(!/월\s*[\d,]+회/.test(문구), 문구);
  assert.ok(/상대지수/.test(문구), 문구);
});

server.close();
globalThis.fetch = () => Promise.reject(new Error('네트워크 끊김'));
let 알림 = '';
const 결과 = await attachTrend([{ label: '삼성화재배 8강', sourceCount: 3, articles: [] }], {
  keywordOf: searchKeywordFor, onError: (m) => { 알림 = m; },
});
check('조회가 실패해도 글감을 그대로 돌려준다', () => {
  assert.equal(결과.length, 1);
  assert.equal(결과[0].trend, undefined);
  assert.ok(알림);
});

globalThis.fetch = 원래fetch;
키지우기();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
