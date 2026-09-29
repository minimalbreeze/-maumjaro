// SEO 항목 점검 검사.
//
// Rank Math는 대표 키워드가 어디에 들어가 있는지로 점수를 매긴다.
// 우리가 지킬 수 있는 항목을 실제로 지키는지, 그리고 못 지켰을 때
// 제대로 짚어내는지 확인한다.

import assert from 'node:assert/strict';
import { checkRankMath, buildSlug, chooseFocusKeyword } from '../src/seo/rankmath.mjs';

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

check('본문이 짧으면 짚어낸다', () => {
  const r = checkRankMath({ ...good, body: '짧은 글\n\n## 소제목\n\n내용' });
  assert.ok(r.missing.some((m) => m.id === 'length'));
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

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
