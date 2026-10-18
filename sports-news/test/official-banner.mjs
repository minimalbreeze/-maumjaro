// 구단·협회 공식 홈페이지 배너 검사.
//
// 2026-10-08 에 효성님이 KIA 최병용 글에 "기아타이거즈 공식홈페이지로 가는
// 배너와 URL"을 넣어 달라고 했다. 앱 배너와 같은 원칙으로 만든다 —
// **주소를 만들어내지 않는다.**
//
// 공식 사이트에서 특히 조심할 것: 나무위키·팬카페 주소를 '공식'이라고 걸면
// 깨진 링크보다 나쁘다. 독자는 구단이 쓴 글인 줄 안다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadOfficialLinks, pickOfficial, officialBannerHtml, officialBannerFor,
  공식주소인가, 주소없는사이트, OFFICIAL_MARK,
} from '../src/seo/official-banner.mjs';
import { appBannerFor } from '../src/seo/app-banner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[공식 홈페이지 배너]');

const KIA = {
  이름: 'KIA 타이거즈 공식 홈페이지',
  match: ['KIA 타이거즈', '기아타이거즈'],
  url: 'https://tigers.co.kr/',
  cta: 'KIA 타이거즈 공식 홈페이지 가기',
  hint: '경기 일정·선수 정보·입장권 안내',
};

// ── 주소를 만들어내지 않는다 ───────────────────────────────
check('주소가 없으면 배너를 넣지 않는다', () => {
  assert.equal(officialBannerHtml({ ...KIA, url: '' }), '');
  assert.equal(officialBannerHtml({ ...KIA, url: undefined }), '');
  assert.equal(officialBannerHtml(null), '');
  assert.equal(officialBannerHtml({}), '');
});

check('팬 사이트·백과사전을 공식이라고 걸지 않는다', () => {
  // 이게 이 파일의 가장 중요한 검사다. 독자는 구단이 쓴 글인 줄 안다.
  for (const 가짜 of [
    'https://namu.wiki/w/KIA%20타이거즈',
    'https://ko.wikipedia.org/wiki/KIA_타이거즈',
    'https://nuri.fandom.com/ko/wiki/KIA_타이거즈',
    'https://blog.naver.com/kiatigers',
    'https://cafe.naver.com/kiatigers',
    'https://kiatigers.tistory.com/',
  ]) {
    assert.equal(공식주소인가(가짜), false, `통과해버림: ${가짜}`);
    assert.equal(officialBannerHtml({ ...KIA, url: 가짜 }), '', `배너가 나감: ${가짜}`);
  }
});

check('http·검색 결과 주소를 거른다', () => {
  for (const 나쁜 of [
    'http://tigers.co.kr/',
    'https://www.google.com/search?q=기아타이거즈',
    'https://example.com/list?query=tigers',
    'tigers.co.kr',
    '',
  ]) {
    assert.equal(공식주소인가(나쁜), false, `통과해버림: ${나쁜}`);
  }
});

check('제대로 된 공식 주소는 받는다', () => {
  assert.equal(공식주소인가('https://tigers.co.kr/'), true);
  assert.equal(공식주소인가('https://www.koreabaseball.com/'), true);
});

// ── 배너 모양 ──────────────────────────────────────────────
check('배너에 이름과 주소가 그대로 들어간다', () => {
  const html = officialBannerHtml(KIA);
  assert.ok(html.includes('KIA 타이거즈 공식 홈페이지'), '이름이 없습니다');
  assert.ok(html.includes(KIA.url), '주소가 없습니다');
  assert.ok(html.includes(OFFICIAL_MARK), '표식이 없습니다');
  assert.match(html, /^<!-- wp:html -->/, '구텐베르크 블록이 아닙니다');
});

check('링크를 현재 창에서 연다', () => {
  const html = officialBannerHtml(KIA);
  assert.ok(!html.includes('target='), 'target 이 있습니다');
  assert.ok(!html.includes('noopener'), 'target 이 없으면 noopener 도 필요 없습니다');
  assert.ok(html.includes('rel="nofollow"'), '바깥 링크에 nofollow 가 없습니다');
});

check('앱 배너와 같은 카드를 쓴다', () => {
  // 카드가 두 벌이면 한쪽만 고쳤을 때 글마다 배너가 달라진다.
  // 오늘 낱말 목록이 갈라져 생긴 사고와 같은 유형이다.
  const 공식 = officialBannerHtml(KIA);
  const 앱 = appBannerFor('페이드캠 써봤다');
  assert.ok(앱, '앱 배너가 비었습니다 (설정 확인)');
  for (const 조각 of ['linear-gradient(135deg,#b779ef,#ff8fb3)', 'border-radius:999px', 'color:#6b2d8f']) {
    assert.ok(공식.includes(조각) && 앱.includes(조각), `카드 모양이 다릅니다: ${조각}`);
  }
});

// ── 글에서 찾기 ────────────────────────────────────────────
check('글에 구단 이름이 있으면 찾는다', () => {
  const cfg = { sites: [KIA] };
  assert.equal(pickOfficial('KIA 타이거즈가 육성선수 7명을 영입했다', cfg)?.이름, KIA.이름);
  assert.equal(pickOfficial('기아타이거즈 최병용', cfg)?.이름, KIA.이름);
  // 조사가 붙어도 찾는다.
  assert.equal(pickOfficial('기아타이거즈는 6일 밝혔다', cfg)?.이름, KIA.이름);
});

check('관계없는 글에는 배너를 넣지 않는다', () => {
  const cfg = { sites: [KIA] };
  assert.equal(pickOfficial('신지애 통산 상금 1위', cfg), null);
  assert.equal(pickOfficial('', cfg), null);
  // 2026-10-18: 예전에는 '윤이나 LPGA 2026시즌 성적'을 썼다. LPGA 가 설정에
  // 없던 때라 배너가 안 붙는 게 맞았는데, 이제 LPGA 공식 홈페이지가 들어왔으니
  // 그 글에는 **붙는 게 맞다.** 검사의 뜻(설정에 없는 대상이면 안 붙는다)은
  // 그대로 두고 예시만 설정에 없는 것으로 바꿨다.
  assert.equal(officialBannerFor('윤이나 2026시즌 드라이버 비거리'), '');
});

// ── 설정 파일 ──────────────────────────────────────────────
check('설정이 주소와 확인방법을 함께 적는다', () => {
  // "직접 열어봤다"와 "검색으로만 봤다"는 신뢰도가 다르다. 구분이 남아야 한다.
  const cfg = loadOfficialLinks();
  assert.ok(Array.isArray(cfg.sites) && cfg.sites.length, '사이트 목록이 비었습니다');
  for (const s of cfg.sites) {
    assert.ok(s.이름, '이름이 없는 항목이 있습니다');
    assert.ok(공식주소인가(s.url), `${s.이름}: 공식 주소 모양이 아닙니다 — ${s.url}`);
    assert.match(s.확인일 || '', /^\d{4}-\d{2}-\d{2}$/, `${s.이름}: 확인일이 없습니다`);
    assert.ok(s.확인방법, `${s.이름}: 어떻게 확인했는지 적혀 있지 않습니다`);
  }
});

check('KIA 배너가 실제 주소로 나간다', () => {
  assert.deepEqual(주소없는사이트(), [], '쓸 수 없는 주소가 있습니다');
  const html = officialBannerFor('KIA 타이거즈 최병용 육성선수 영입');
  assert.ok(html, '배너가 나가지 않았습니다');
  assert.ok(html.includes('https://tigers.co.kr/'), `주소가 다릅니다: ${html.slice(0, 300)}`);
});

check('main 이 앱 배너가 없을 때만 공식 배너를 쓴다', () => {
  // 자리는 하나다. 둘 다 넣으면 카드가 연달아 붙어 광고판처럼 보인다.
  const src = fs.readFileSync(path.join(ROOT, 'src/main.mjs'), 'utf8');
  assert.match(src, /pickOfficial\(/, '공식 배너를 찾지 않습니다');
  assert.match(src, /app \? null : pickOfficial/, '앱 배너가 있어도 공식 배너를 또 찾습니다');
  assert.match(src, /officialBannerHtml\(official\)/, '공식 배너를 만들지 않습니다');
});

// ── 골프 투어 아홉 곳 (2026-10-18 운영자가 주소를 줬다) ──────────
check('골프 투어 아홉 곳이 각자 제 주소로 나간다', () => {
  const 짝 = [
    ['정찬민 KPGA 코리안투어 통산 3승', 'https://www.kpga.co.kr/'],
    ['KLPGA 국내 대회 우승', 'https://klpga.co.kr/web/main/index'],
    ['임성재 PGA 투어 시즌 개막', 'https://www.pgatour.com/'],
    ['최혜진 LPGA 준우승', 'https://www.lpga.com/'],
    ['DP 월드 투어 레이스 투 두바이', 'https://www.europeantour.com/dpworld-tour/'],
    ['LIV 골프 팀 순위', 'https://www.livgolf.com/'],
    ['JLPGA 일본여자프로골프 투어', 'https://www.lpga.or.jp/'],
    ['TGL 개막전', 'https://tglgolf.com/'],
    ['GTOUR 스크린골프 대회', 'https://www.gtour.com/'],
  ];
  for (const [글, url] of 짝) {
    const html = officialBannerFor(글);
    assert.ok(html, `배너가 나가지 않았습니다: ${글}`);
    assert.ok(html.includes(url), `${글} → 주소가 다릅니다: ${html.slice(0, 200)}`);
  }
});

check('LPGA 가 KLPGA·JLPGA 안에서 걸리지 않는다', () => {
  // 낱말 경계가 영문·숫자만 막는다. 이게 깨지면 국내 대회 글에 LPGA 배너가 붙는다.
  assert.equal(pickOfficial('KLPGA 신인상')?.url, 'https://klpga.co.kr/web/main/index');
  assert.equal(pickOfficial('JLPGA 투어 상금왕')?.url, 'https://www.lpga.or.jp/');
  assert.equal(pickOfficial('KPGA 선수권')?.url, 'https://www.kpga.co.kr/');
});

check('투어 이름이 둘 다 나오면 더 많이 나온 쪽을 쓴다', () => {
  // 최혜진 글에는 'KLPGA 출신'이 한 번 나오고 LPGA 가 내내 나온다.
  // 국내 대회 글에는 'LPGA 진출'이 한 번 나온다. 순서로 고르면 한쪽은 반드시 틀린다.
  const lpga글 = 'LPGA 투어 최혜진. KLPGA 출신인 최혜진은 LPGA 에서 LPGA 다섯 번째 준우승을 했다.';
  assert.equal(pickOfficial(lpga글)?.url, 'https://www.lpga.com/', 'LPGA 글에 LPGA 배너가 아닙니다');
  const klpga글 = 'KLPGA 챔피언십. KLPGA 상금 1위 선수가 LPGA 진출을 노린다. KLPGA 기록.';
  assert.equal(pickOfficial(klpga글)?.url, 'https://klpga.co.kr/web/main/index', 'KLPGA 글에 KLPGA 배너가 아닙니다');
});

check('이름이 안 나오는 글에는 배너를 안 붙인다', () => {
  // 횟수로 고르게 바꿨으니 0번인 것을 고르지 않는지 확인한다.
  assert.equal(pickOfficial('오늘 날씨가 좋다'), null);
  assert.equal(pickOfficial(''), null);
  assert.equal(officialBannerFor('동네 파3 골프장 이용료'), '');
});

// ── 선수가 뛰는 투어를 못 박는다 (2026-10-18 운영자 지시) ──────
check('투어 이름이 한 번도 안 나와도 선수 이름으로 고른다', () => {
  // 선수 프로필·통산 기록만 있는 글에는 투어 이름이 안 나온다. 그래도
  // 기록을 보러 갈 곳은 분명히 있다.
  assert.equal(pickOfficial('최혜진 프로필과 통산 성적')?.url, 'https://www.lpga.com/');
  assert.equal(pickOfficial('정찬민 나이와 데뷔')?.url, 'https://www.kpga.co.kr/');
  assert.equal(pickOfficial('스롱 피아비 국적과 데뷔 과정')?.url, 'https://www.pbatour.org/ko/index');
});

check('국내 대회 글이면 선수 매핑을 넘어선다', () => {
  // 운영자가 정한 것: "최혜진은 LPGA 로 진출. 국내 대회 안 나오면 LPGA 적용."
  // 뒤집어 말하면 국내 대회에 나가는 글은 KLPGA 다.
  const 국내 = '최혜진 KLPGA 챔피언십 출전. KLPGA 상금 순위와 KLPGA 기록.';
  assert.equal(pickOfficial(국내)?.url, 'https://klpga.co.kr/web/main/index');
  const 미국 = 'LPGA 투어 최혜진. KLPGA 출신인 최혜진은 LPGA 에서 LPGA 준우승을 했다.';
  assert.equal(pickOfficial(미국)?.url, 'https://www.lpga.com/');
});

check('선수 목록의 사이트 이름이 실제로 설정에 있다', () => {
  // 사이트 이름을 고치면서 선수 목록을 안 고치면 매핑이 조용히 죽는다.
  const cfg = loadOfficialLinks();
  const 있는이름 = new Set(cfg.sites.map((s) => s.이름));
  for (const p of cfg.선수 || []) {
    assert.ok(p.이름, '이름 없는 선수 항목이 있습니다');
    assert.ok(있는이름.has(p.사이트), `${p.이름}: '${p.사이트}' 라는 사이트가 설정에 없습니다`);
    assert.ok(p.비고, `${p.이름}: 왜 이 투어인지 적혀 있지 않습니다`);
  }
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
