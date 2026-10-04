// 공식 페이지 직접 받아오기 검사.
//
// 돈이 되는 글(시설 요금·예약)이 웹검색 한도에 묶여 두 번 연속 실패했다.
// 이 경로가 그 한도를 우회한다. 요금표를 제대로 읽는지가 전부다.

import assert from 'node:assert/strict';
import http from 'node:http';
import {
  loadFacilities, pickFacilities, textFromHtml, 금액줄찾기,
  fetchOfficial, gatherOfficial, officialBlock,
} from '../src/news/official.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[공식 페이지 직접 받아오기]');

// ── 설정 ───────────────────────────────────────────────────
check('설정에 적힌 주소만 쓴다', () => {
  // 코드가 주소를 만들어내면 없는 링크를 "공식 확인"이라 쓰게 된다.
  const cfg = loadFacilities();
  assert.ok(Array.isArray(cfg.시설) && cfg.시설.length, '시설 목록이 비었습니다');
  for (const f of cfg.시설) {
    assert.match(f.공식, /^https:\/\//, `${f.이름}: https 주소가 아닙니다`);
    assert.match(f.확인일 || '', /^\d{4}-\d{2}-\d{2}$/, `${f.이름}: 확인일이 없습니다`);
    assert.ok(f.이름 && f.카테고리, `${f.이름}: 이름·카테고리가 필요합니다`);
  }
});

check('주제에 든 시설을 이름과 별칭으로 찾는다', () => {
  assert.equal(pickFacilities('남서울CC 파3 이용료 얼마')[0]?.이름, '남서울CC 제2연습장 파3');
  // 사람은 공백을 아무렇게나 쓴다.
  assert.equal(pickFacilities('남서울cc파3 예약방법')[0]?.이름, '남서울CC 제2연습장 파3');
  assert.equal(pickFacilities('남서울 제2연습장 요금')[0]?.이름, '남서울CC 제2연습장 파3');
});

check('맞는 시설이 없으면 빈 목록이다', () => {
  assert.deepEqual(pickFacilities('KBO 포스트시즌 일정'), []);
  assert.deepEqual(pickFacilities(''), []);
});

// ── HTML 에서 글자 뽑기 ────────────────────────────────────
check('스크립트와 스타일은 통째로 버린다', () => {
  const t = textFromHtml('<style>.a{color:red}</style><script>var x=13000;</script><p>주중 30분 13,000원</p>');
  assert.ok(!/color:red|var x/.test(t), t);
  assert.ok(t.includes('주중 30분 13,000원'), t);
});

check('표의 칸 구분을 남긴다', () => {
  // 구분자가 없으면 요금표가 숫자 뭉치가 되어 무엇의 값인지 알 수 없다.
  const t = textFromHtml('<table><tr><td>주중 30분</td><td>13,000</td></tr><tr><td>주말 30분</td><td>16,000</td></tr></table>');
  assert.match(t, /주중 30분 \| 13,000/, t);
  assert.ok(t.split('\n').length >= 2, `줄이 안 나뉘었습니다: ${JSON.stringify(t)}`);
});

check('금액이 적힌 줄을 문맥과 함께 뽑는다', () => {
  // 숫자만 뽑으면 "13,000"이 무엇의 값인지 알 수 없다.
  const 줄 = 금액줄찾기('소개 글입니다\n주중 30분 | 13,000\n주말 30분 | 16,000\n문의 전화');
  assert.equal(줄.length, 2, JSON.stringify(줄));
  assert.ok(줄[0].includes('주중 30분'), 줄[0]);
});

check('금액이 아닌 숫자는 줄에 안 들어간다', () => {
  assert.deepEqual(금액줄찾기('9홀 코스입니다\n전화 031-123-4567'), []);
});

// ── 실제 받아오기 (모의 서버) ──────────────────────────────
const 요금페이지 = `<!doctype html><html><body>
<h1>제2연습장</h1>
<table>
  <tr><th>구분</th><th>주중</th><th>주말·공휴일</th></tr>
  <tr><td>시간제 30분</td><td>13,000</td><td>16,000</td></tr>
  <tr><td>시간제 70분</td><td>25,000</td><td>30,000</td></tr>
  <tr><td>Par3 9홀</td><td>25,000</td><td>30,000</td></tr>
</table>
<p>예약은 전화로만 받습니다. 운영 06:00~19:00</p>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/ok') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(요금페이지); }
  if (req.url === '/404') { res.writeHead(404); return res.end('no'); }
  if (req.url === '/empty') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body><script>draw()</script></body></html>'); }
  if (req.url === '/slow') { return setTimeout(() => { res.writeHead(200); res.end('late'); }, 3000); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

await checkAsync('요금표를 읽어온다', async () => {
  const r = await fetchOfficial(`${base}/ok`);
  assert.ok(r.ok, r.why);
  assert.ok(r.금액줄.length >= 3, JSON.stringify(r.금액줄));
  assert.ok(r.금액줄.some((l) => /Par3/.test(l)), '파3 줄을 못 읽었습니다');
  assert.ok(r.text.includes('운영 06:00~19:00'), '운영시간을 못 읽었습니다');
  assert.match(r.받은시각, /^\d{4}-\d{2}-\d{2}T/);
});

await checkAsync('실패해도 던지지 않고 이유를 남긴다', async () => {
  // 글은 그대로 나가야 한다. 공식 페이지 하나 못 받았다고 멈추면 안 된다.
  const r = await fetchOfficial(`${base}/404`);
  assert.equal(r.ok, false);
  assert.match(r.why, /HTTP 404/);
});

await checkAsync('스크립트로 그리는 페이지는 실패로 본다', async () => {
  // 글자가 없으면 요금을 못 읽는다. 성공으로 넘기면 빈 내용으로 글을 쓴다.
  const r = await fetchOfficial(`${base}/empty`);
  assert.equal(r.ok, false);
  assert.match(r.why, /글자가 거의 없습니다/);
});

await checkAsync('응답이 없으면 시간 안에 포기한다', async () => {
  const r = await fetchOfficial(`${base}/slow`, { timeoutMs: 300 });
  assert.equal(r.ok, false);
  assert.match(r.why, /300ms/);
});

await checkAsync('여러 곳을 차례로 받아온다', async () => {
  const 받음 = await gatherOfficial([
    { 이름: '가', 공식: `${base}/ok`, 지역: '경기', note: '메모', 확인일: '2026-10-04' },
    { 이름: '나', 공식: `${base}/404` },
  ]);
  assert.equal(받음.length, 2);
  assert.equal(받음[0].이름, '가');
  assert.ok(받음[0].ok);
  assert.equal(받음[1].ok, false);
});

// ── 사실 확인 단계에 넘기는 글 ─────────────────────────────
await checkAsync('받아온 내용을 출처와 함께 넘긴다', async () => {
  const 받음 = await gatherOfficial([{ 이름: '남서울 파3', 공식: `${base}/ok`, 지역: '경기 성남', 확인일: '2026-10-04' }]);
  const block = officialBlock(받음);
  assert.ok(block.includes(`${base}/ok`), '출처 주소가 없습니다');
  assert.ok(block.includes('13,000'), '금액이 없습니다');
  assert.match(block, /여기 적혀 있는 것만/, '추측 금지 지침이 없습니다');
  assert.match(block, /웹검색 결과가 아니다/, '출처 성격이 밝혀져 있지 않습니다');
  assert.match(block, /확인일/, '확인일 기준임을 밝히는 지침이 없습니다');
});

await checkAsync('하나도 못 받으면 빈 글을 돌려준다', async () => {
  // 빈 내용을 "공식 확인"이라고 넘기면 안 된다.
  const 받음 = await gatherOfficial([{ 이름: '나', 공식: `${base}/404` }]);
  assert.equal(officialBlock(받음), '');
});

server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
