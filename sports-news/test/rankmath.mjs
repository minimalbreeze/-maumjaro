// SEO 항목 점검 검사.
//
// Rank Math는 대표 키워드가 어디에 들어가 있는지로 점수를 매긴다.
// 우리가 지킬 수 있는 항목을 실제로 지키는지, 그리고 못 지켰을 때
// 제대로 짚어내는지 확인한다.

import assert from 'node:assert/strict';
import { checkRankMath, buildSlug, chooseFocusKeyword, 조사붙은낱말인가, 조사앞까지 } from '../src/seo/rankmath.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[SEO 항목 점검]');

// 키워드 밀도 1.25~2.5%를 맞추려면 키워드 한 번에 본문 단어가 80개쯤이면 된다.
const 문단 = (n = 1) => Array.from({ length: n }, () =>
  `KBO 신인 드래프트 관련 소식입니다. ${'내용입니다 '.repeat(75)}`).join('\n\n');

const good = {
  title: '2027 KBO 신인 드래프트 (하현승 1순위!)',
  seoTitle: '2027 KBO 신인 드래프트 결과 정리',
  metaDescription: '2027 KBO 신인 드래프트 결과와 지명 순서를 정리했습니다.',
  focusKeyword: 'KBO 신인 드래프트',
  slug: 'kbo-신인-드래프트',
  body: [
    '2027 KBO 신인 드래프트가 마무리됐습니다.',
    문단(2),
    '## ✨ KBO 신인 드래프트 개요',
    문단(2),
    '## 🌟 주목할 선수',
    문단(1),
    '## 📌 배경과 맥락',
    문단(1),
    '## 🎯 분석',
    문단(1),
    '## 👀 관전 포인트',
    문단(1),
    '## ❓ 자주 묻는 질문',
    '**Q. KBO 신인 드래프트는 언제 열렸나요?**\n\n9월에 열렸습니다.',
    '## 🔥 마지막',
    '끝',
  ].join('\n\n'),
  imageCount: 2,
  imageAlts: ['KBO 신인 드래프트 - 하현승 1순위'],
};

check('모든 조건을 갖추면 100점이다', () => {
  const r = checkRankMath(good);
  assert.equal(r.score, 100, r.missing.map((m) => m.label).join(', '));
  assert.equal(r.missing.length, 0);
});

check('키워드가 없으면 점수가 크게 깎인다', () => {
  const r = checkRankMath({ ...good, focusKeyword: '' });
  assert.ok(r.score < 40, `${r.score}점`);
  assert.ok(r.missing.some((m) => m.id === 'kw-set'));
});

check('슬러그의 하이픈 때문에 키워드를 놓치지 않는다', () => {
  // "KBO 신인 드래프트"가 "kbo-신인-드래프트" 안에 있다고 봐야 한다
  const r = checkRankMath(good);
  assert.ok(r.items.find((i) => i.id === 'kw-slug').ok, '하이픈 비교가 틀렸습니다');
});

// 2026-10-10: 분량은 점수에서 빠졌다. 구글 '무시해야 할 사항' —
//   "콘텐츠 길이 자체는 순위 결정과 관련 없습니다."
check('본문이 짧아도 점수를 깎지 않는다 — 글자 수만 보여준다', () => {
  const r = checkRankMath({ ...good, body: '짧은 글\n\n## 소제목\n\n내용' });
  assert.ok(!r.missing.some((m) => m.id === 'length'), '분량이 아직 감점 항목입니다');
  const 항목 = r.items.find((i) => i.id === 'length');
  assert.ok(항목, 'length 항목이 사라졌습니다 — 보여는 줘야 합니다');
  assert.equal(항목.정보, true);
  assert.match(항목.label, /\d+자/, 항목.label);
});

// 밀도는 **상한만** 본다. 구글: "유인 키워드 반복은 스팸 정책에 위반됩니다."
check('키워드를 한 번만 써도 감점하지 않는다', () => {
  const body = ['KBO 신인 드래프트 결과를 정리합니다.', '## ✨ 개요',
    '내용입니다 '.repeat(400), '## ❓ 자주 묻는 질문',
    '**Q. KBO 신인 드래프트는 언제 열렸나요?**\n\n9월입니다.'].join('\n\n');
  const r = checkRankMath({ ...good, body });
  const d = r.items.find((i) => i.id === 'kw-density');
  assert.ok(d.ok, `${d.label} — 한 번 쓴 것을 감점했습니다`);
});

check('키워드를 2.5% 넘게 반복하면 짚어낸다', () => {
  const body = ['KBO 신인 드래프트', 'KBO 신인 드래프트 '.repeat(40)].join('\n\n');
  const r = checkRankMath({ ...good, body });
  const d = r.items.find((i) => i.id === 'kw-density');
  assert.ok(!d.ok, `${d.label} — 과도한 반복을 통과시켰습니다`);
  assert.match(d.fix, /스팸/, d.fix);
});

check('키워드가 본문에 한 번도 안 나오면 짚어낸다', () => {
  const r = checkRankMath({ ...good, body: '## 소제목\n\n' + '관계없는 내용 '.repeat(200) });
  const d = r.items.find((i) => i.id === 'kw-density');
  assert.ok(!d.ok, d.label);
  assert.match(d.fix, /한 번도 나오지 않습니다/, d.fix);
});

check('첫 문단에 키워드가 없으면 짚어낸다', () => {
  const body = '안녕하세요, 팬 여러분!\n\n' + '내용 '.repeat(400)
    + '\n\n## ✨ 개요\n\n내용\n\n## 🌟 선수\n\n내용\n\n## 🎯 분석\n\n내용\n\n## 🔥 끝\n\n끝';
  const r = checkRankMath({ ...good, body });
  assert.ok(r.missing.some((m) => m.id === 'kw-first'), r.missing.map((m) => m.id).join(','));
});

check('이미지 alt에 키워드가 없으면 짚어낸다', () => {
  const r = checkRankMath({ ...good, imageAlts: ['그냥 사진'] });
  assert.ok(r.missing.some((m) => m.id === 'kw-alt'));
});

check('빠진 항목마다 고치는 법을 알려준다', () => {
  const r = checkRankMath({ ...good, focusKeyword: '', imageCount: 0 });
  assert.ok(r.missing.every((m) => m.fix && m.fix.length > 5), '설명 없는 항목이 있습니다');
});

console.log('\n[슬러그]');

check('기존 글과 같은 형태로 만든다', () => {
  // 사장님 기존 글: wiki.minimalbreeze.com/야구-타율-3할
  assert.equal(buildSlug({ focusKeyword: '야구 타율 3할' }), '야구-타율-3할');
});

check('특수문자를 걷어낸다', () => {
  assert.equal(buildSlug({ focusKeyword: '2027 KBO 드래프트 1순위!' }), '2027-kbo-드래프트-1순위');
});

check('키워드가 없으면 제목을 쓴다', () => {
  assert.ok(buildSlug({ focusKeyword: '', title: 'KBO 순위' }).includes('kbo'));
});

check('둘 다 없어도 빈 슬러그를 내지 않는다', () => {
  assert.ok(buildSlug({ focusKeyword: '', title: '', fallback: 'KBO' }).length > 2);
});

check('너무 길면 자른다', () => {
  assert.ok(buildSlug({ focusKeyword: '가'.repeat(100) }).length <= 60);
});

// ── 본문에 실제로 있는 키워드 고르기 ────────────────────────
// 실제로 당한 일: SEO 단계가 본문에 한 번도 나오지 않는 긴 구절
// "피트 알론소 양대 리그 타점왕"을 대표 키워드로 골라 밀도가 0.00%가 됐다.
console.log('\n[대표 키워드 고르기]');

const 야구본문 = `${'피트 알론소가 또 하나의 기록을 세웠습니다. '.repeat(13)}${'메이저리그 정규시즌이 끝났습니다. '.repeat(90)}`;

check('본문에 없는 긴 키워드 대신 본문에 있는 말을 고른다', () => {
  const r = chooseFocusKeyword(야구본문, ['피트 알론소 양대 리그 타점왕', '피트 알론소']);
  assert.equal(r.keyword, '피트 알론소', JSON.stringify(r.candidates.slice(0, 3)));
  assert.ok(r.density > 0, `${r.density}%`);
});

check('원래 키워드가 본문에 없었다는 것을 보여준다', () => {
  const r = chooseFocusKeyword(야구본문, ['피트 알론소 양대 리그 타점왕']);
  const 원래 = r.candidates.find((c) => c.keyword === '피트 알론소 양대 리그 타점왕');
  assert.equal(원래.count, 0, '본문에 없어야 합니다');
});

check('범위에 드는 것이 있으면 그중 더 구체적인 쪽을 고른다', () => {
  // "삼성화재배 8강"이 1.25~2.5%에 들고, "삼성화재배"도 같이 든다면 긴 쪽.
  const body = `${'삼성화재배 8강 대진이 나왔습니다. '.repeat(8)}${'바둑 소식입니다. '.repeat(120)}`;
  const r = chooseFocusKeyword(body, ['삼성화재배 8강']);
  assert.equal(r.keyword, '삼성화재배 8강', JSON.stringify(r.candidates));
});

check('일반명사로 떨어지지 않는다', () => {
  // 실제로 당한 일: "경주 알천파크골프장 야간개장"이 밀도가 높다는 이유로
  // "파크골프"로 떨어졌다. 전국 수백 개 블로그와 싸우는 말이라 1페이지에 못 간다.
  // 실측 데이터도 구체적인 이름이 클릭을 만든다고 말한다.
  const body = `${'경주 알천파크골프장이 야간개장합니다. '.repeat(6)}${'파크골프 이야기입니다. '.repeat(30)}`;
  const r = chooseFocusKeyword(body, ['경주 알천파크골프장 야간개장', '파크골프']);
  assert.equal(r.keyword, '경주 알천파크골프장', JSON.stringify(r.candidates.slice(0, 3)));
});

check('일반명사밖에 없으면 그것이라도 쓴다', () => {
  // 감점이지 금지가 아니다. 대안이 없으면 비워두는 것보다 낫다.
  const body = '골프 이야기입니다. '.repeat(40);
  assert.equal(chooseFocusKeyword(body, ['골프']).keyword, '골프');
});

check('후보가 없으면 빈 값을 돌려준다', () => {
  assert.equal(chooseFocusKeyword('내용', []).keyword, '');
});

check('제목에 쉼표가 끼어도 키워드가 들어 있다고 본다', () => {
  // "피트 알론소, 양대 리그 타점왕 최초" 는 사람 눈에는 키워드가 들어 있다.
  const r = checkRankMath({
    ...good,
    title: '메츠 왜 버렸을까 (피트 알론소, 양대 리그 타점왕 최초!)',
    focusKeyword: '피트 알론소 양대 리그 타점왕',
  });
  assert.ok(r.items.find((i) => i.id === 'kw-title').ok, '쉼표 때문에 놓쳤습니다');
});


// ── 조사가 붙은 키워드 ─────────────────────────────────────
check('조사가 붙은 낱말을 알아본다', () => {
  // 글 7769 에서 대표 키워드가 "신지애가 일본여자오픈 골프선수권대회"로 잡혔다.
  // 사람은 "신지애가"로 검색하지 않는다.
  assert.ok(조사붙은낱말인가('신지애가'));
  assert.ok(조사붙은낱말인가('경기를'));
  assert.ok(조사붙은낱말인가('대회에서'));
  assert.ok(조사붙은낱말인가('우승했다'));
});

check('조사가 아닌 것을 조사로 오인하지 않는다', () => {
  // 떼고 나서 한 글자만 남으면 조사가 아니다. 멀쩡한 말을 버리면 안 된다.
  assert.ok(!조사붙은낱말인가('국가'));
  assert.ok(!조사붙은낱말인가('신지애'));
  assert.ok(!조사붙은낱말인가('경기'));
  assert.ok(!조사붙은낱말인가('KBO'));     // 영문에는 조사가 붙지 않는다
  assert.ok(!조사붙은낱말인가('3R'));
  assert.ok(!조사붙은낱말인가(''));
});

check('조사가 나오는 자리에서 후보를 자른다', () => {
  assert.equal(조사앞까지('신지애 일본여자오픈 골프선수권대회를 우승'), '신지애 일본여자오픈');
  assert.equal(조사앞까지('신지애가 일본여자오픈 골프선수권대회'), '');
  assert.equal(조사앞까지('남서울cc 파3 골프장'), '남서울cc 파3 골프장');
});

check('조사가 붙은 구절을 대표 키워드로 고르지 않는다', () => {
  // 이 검사가 마지막 방어선이다. 못 잡으면 슬러그까지 "신지애가-..."로 들어간다.
  const body = '신지애 우승 상금은 3천만엔이다. 신지애 우승 상금 규모를 보면 '
    + '신지애 우승 상금이 그중 크다. 신지애 우승 상금 기록.';
  const r = chooseFocusKeyword(body, ['신지애가 일본여자오픈 골프선수권대회', '신지애 우승 상금']);
  assert.equal(r.keyword, '신지애 우승 상금', r.keyword);
  assert.ok(!r.candidates.some((c) => c.keyword.includes('신지애가')), '조사 후보가 남았습니다');
});

// ── 키워드 껍데기 벗기기 ───────────────────────────────────
// 실측 사고(글 7276): 대표 키워드가 "'2026 우리할매떡볶이 어린이" 로 저장됐다.
// 따옴표로 시작하는 말을 검색창에 치는 사람은 없다.
//
// 왜 안 걸렸나 — 밀도를 셀 때(KEY_IN)는 구두점을 무시하고 센다. 그래서 따옴표가
// 붙은 후보도 밀도 1.26%로 멀쩡해 보였고 권장 구간에 들어 1순위가 됐다.
// 세는 쪽은 따옴표를 무시하는데 저장하는 쪽은 붙여서 저장한 것이다.
{
  const { 키워드정리 } = await import('../src/seo/rankmath.mjs');

  check('앞뒤 따옴표를 벗긴다', () => {
    assert.equal(키워드정리("'2026 우리할매떡볶이 어린이"), '2026 우리할매떡볶이 어린이');
    assert.equal(키워드정리('"서울 파크골프장"'), '서울 파크골프장');
    assert.equal(키워드정리('‘김노율’'), '김노율');
  });

  check('안쪽에 남은 괄호에서 끊는다', () => {
    assert.equal(키워드정리('잠실유수지 파크골프장 (9홀)'), '잠실유수지 파크골프장');
    assert.equal(키워드정리('"서울 파크골프장" (안양천)'), '서울 파크골프장');
  });

  check('멀쩡한 키워드는 그대로 둔다', () => {
    assert.equal(키워드정리('피트 알론소'), '피트 알론소');
    assert.equal(키워드정리('영등포 2구장 안양천'), '영등포 2구장 안양천');
  });

  check('낱말에 쓰이는 하이픈과 점은 지키지 않고 버리지 않는다', () => {
    // "3-1", "No.1" 처럼 숫자·낱말 안에 들어가는 기호는 건드리면 안 된다.
    assert.equal(키워드정리('KBO 3-1 승부'), 'KBO 3-1 승부');
    assert.equal(키워드정리('세계랭킹 No.1 안세영'), '세계랭킹 No.1 안세영');
  });

  check('따옴표 붙은 후보를 골라 저장하지 않는다', () => {
    const body = '2026 우리할매떡볶이 어린이 바둑왕 결승. 김노율이 박준우를 꺾었다. 어린이 바둑왕 대회였다. '.repeat(4)
      + '바둑 이야기. '.repeat(60);
    const r = chooseFocusKeyword(body, ["'2026 우리할매떡볶이 어린이 바둑왕에서 김노율"]);
    assert.ok(!/^['"‘’“”]/.test(r.keyword), `따옴표로 시작합니다: ${JSON.stringify(r.keyword)}`);
    assert.ok(!/['"‘’“”()]/.test(r.keyword), `기호가 남았습니다: ${JSON.stringify(r.keyword)}`);
  });
}

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
