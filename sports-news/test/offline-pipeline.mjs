// 네트워크 없이 파이프라인 단계 간 연결을 검증한다.
//
// 검증 대상: RSS 파싱 → 중복제거 → 최신필터 → 군집화 → 점수 → 중복판정
//           → (가짜 사실확인 결과) → 양식 검사 → 워드프레스 HTML 변환 → 초안 파일
// 검증 제외: 실제 네트워크 호출과 Claude 응답 (로컬에서 확인)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFeed, dedupeItems, filterRecent } from '../src/news/fetch-rss.mjs';
import { clusterArticles, splitBySourceCount } from '../src/news/normalize.mjs';
import { rankClusters } from '../src/news/rank.mjs';
import { judgeDuplication } from '../src/duplicate/check.mjs';
import { resolveCategory, normalizeTags } from '../src/wordpress/taxonomy.mjs';
import { lintArticle, splitTitleAndBody, AI_TELLS } from '../src/ai/write.mjs';
import { extractFaq, faqSchemaBlock } from '../src/seo/faq-schema.mjs';
import { imageHtml } from '../src/images/embed.mjs';
import { keywordDensity, targetKeywordCount } from '../src/seo/rankmath.mjs';
import { markdownToBlocks } from '../src/wordpress/draft.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-09-07T09:00:00Z');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

// 시간을 고정한다. 그러지 않으면 테스트가 내일 깨진다.
const realNow = Date.now;
Date.now = () => NOW.getTime();

console.log('\n[1] RSS 파싱 → 정리');
const xml = fs.readFileSync(path.join(HERE, 'fixtures/googlenews-klpga.xml'), 'utf8');
const items = parseFeed(xml);
const deduped = dedupeItems(items);
const { fresh, undated } = filterRecent(deduped, 72);

check('CDATA와 HTML 엔티티를 모두 읽는다', () => assert.equal(items.length, 5));
check('추적 파라미터가 다른 같은 링크를 하나로 합친다', () => assert.equal(deduped.length, 4));
check('72시간이 지난 기사를 제외한다', () => assert.equal(fresh.length, 2));
check('발행일을 못 읽은 기사를 따로 분리한다', () => assert.equal(undated.length, 1));
check('기사 요약에서 HTML 태그를 제거한다', () => assert.ok(!items[0].summary.includes('<')));
check('매체명을 <source>에서 가져온다', () => assert.equal(items[0].source, '스포츠경향'));

console.log('\n[2] 군집화 → 점수');
const many = [
  { title: 'KLPGA 챔피언십 개막 D-3, 우승 후보 3人', source: 'A', publishedAt: iso(5), summary: '대회 일정' },
  { title: 'KLPGA 챔피언십 D-3 개막 우승 후보 압축', source: 'B', publishedAt: iso(7), summary: '프리뷰' },
  { title: 'KLPGA 챔피언십 개막 임박 우승 후보 세 명', source: 'C', publishedAt: iso(9), summary: '' },
  { title: '박모 선수 인스타 근황 화제', source: 'D', publishedAt: iso(1), summary: 'SNS' },
];
const clusters = clusterArticles(many);
const { enough, thin } = splitBySourceCount(clusters, 2);
const ranked = rankClusters(enough, { name: 'KLPGA', category: '골프', longTermHints: ['대회 일정'] });

check('같은 사건 기사 3건을 한 묶음으로 만든다', () => {
  const big = clusters.find((c) => c.articleCount === 3);
  assert.ok(big, `묶음 크기: ${clusters.map((c) => c.articleCount)}`);
  assert.equal(big.sourceCount, 3);
});
check('출처가 하나뿐인 묶음을 후보에서 뺀다', () => {
  assert.equal(enough.length, 1);
  assert.equal(thin.length, 1);
});
check('장기 검색가치가 높은 글감에 높은 점수를 준다', () => assert.ok(ranked[0].score > 30));

console.log('\n[3] 중복 판정 A/B/C');
const day = (n) => new Date(NOW - n * 86400000).toISOString();
check('비슷한 글이 없으면 A', () => {
  assert.equal(judgeDuplication({ label: '포르투 3쿠션 월드컵 조명우 도전' }, []).verdict, 'A');
});
check('최근에 같은 글이 있으면 B', () => {
  const r = judgeDuplication({ label: '2026 JLPGA 일본여자오픈 개막' }, [{ id: 1, title: '2026 JLPGA 일본여자오픈 개막', date: day(3) }]);
  assert.equal(r.verdict, 'B');
});
check('오래된 같은 글이 있으면 C (업데이트 후보)', () => {
  const r = judgeDuplication({ label: '2026 JLPGA 일본여자오픈 개막' }, [{ id: 2, title: '2026 JLPGA 일본여자오픈 개막', date: day(200) }]);
  assert.equal(r.verdict, 'C');
  assert.ok(r.updateCandidate);
});
check('애매한 구간은 AI 판단으로 넘긴다', () => {
  const r = judgeDuplication({ label: '2026 JLPGA 일본여자오픈 3라운드 순위 변동' }, [{ id: 3, title: '2026 JLPGA 일본여자오픈 개막 프리뷰', date: day(4) }]);
  assert.equal(r.needsAiJudgement, true);
});

console.log('\n[4] 카테고리 · 태그');
const siteCats = [
  { id: 2, name: '골프' }, { id: 7, name: '골프 스윙', parent: 2 }, { id: 3, name: '파크골프' },
  { id: 4, name: '야구' }, { id: 5, name: '스포츠' }, { id: 6, name: '생활정보' },
];
check('종목 이름이 그대로 있으면 그 카테고리를 쓴다', () => assert.equal(resolveCategory('파크골프', siteCats).id, 3));
check('없는 종목은 상위 카테고리로 떨어뜨린다', () => {
  const r = resolveCategory('배드민턴', siteCats);
  assert.equal(r.name, '스포츠');
  assert.equal(r.matched, 'fallback');
});
check('카테고리를 새로 만들지 않는다', () => {
  const before = siteCats.length;
  resolveCategory('컬링', siteCats);
  assert.equal(siteCats.length, before);
});
check('태그에서 #을 떼고 중복을 합치며 10개로 제한한다', () => {
  const t = normalizeTags(['#JLPGA', 'JLPGA', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
  assert.ok(!t.some((x) => x.startsWith('#')));
  assert.equal(t.filter((x) => x.toLowerCase() === 'jlpga').length, 1);
  assert.ok(t.length <= 10);
});

console.log('\n[5] 양식 검사');
const good = splitTitleAndBody(`2026 KLPGA 챔피언십 (우승 경쟁 본격화!)

2026 KLPGA 챔피언십이 9월 10일부터 13일까지 서울CC에서 열립니다. 상금랭킹 1위와 2위의 격차가 크지 않아 순위가 뒤집힐 수 있는 대회입니다.

2026 KLPGA 챔피언십은 시즌 판도를 가를 한 판으로 꼽힙니다. 디펜딩 챔피언의 2연패 도전도 함께 걸려 있습니다.

## ✨ 2026 KLPGA 챔피언십 대회 개요

**일정**: 9월 10~13일
**장소**: 서울CC

## 🌟 주목할 선수

올 시즌 두 번의 우승을 거둔 선수가 출전합니다. 최근 흐름이 좋습니다.

## 📌 배경과 맥락

2026 KLPGA 챔피언십은 시즌 후반 상금 경쟁의 분수령으로 여겨져 왔습니다. 지난 시즌에도 이 대회 결과가 상금왕 향방을 갈랐습니다.

KLPGA 투어는 한 시즌에 30개 안팎의 대회를 치릅니다. 그중 메이저로 분류되는 대회는 상금과 랭킹 포인트가 따로 매겨집니다.

서울CC는 그린이 빠르기로 알려진 코스입니다. 퍼팅 감각이 좋은 선수에게 유리하다는 평가가 많습니다.

코스 길이는 전장 6,400야드 안팎입니다. 비슷한 전장의 다른 대회와 비교하면 페어웨이가 좁은 편이어서 드라이버 정확도가 중요합니다.

상금왕은 한 시즌 누적 상금으로 정해집니다. 대상은 포인트제라 꾸준함이 더 중요하고, 둘을 동시에 가져가는 선수는 많지 않습니다.

신인왕은 데뷔 시즌에만 노릴 수 있습니다. 한 번 놓치면 다시는 기회가 없다는 점에서 다른 타이틀과 성격이 다릅니다.

## 🎯 핵심 분석

상금랭킹 1위와 2위의 격차가 크지 않아 이번 대회 결과가 순위를 뒤집을 수 있습니다.

## 👀 관전 포인트

✅ 디펜딩 챔피언의 2연패 도전
✅ 상금왕 경쟁의 분수령
✅ 신인왕 구도
✅ 코스 난이도

## ❓ 자주 묻는 질문

**Q. 2026 KLPGA 챔피언십은 언제 열리나요?**
9월 10일부터 13일까지 나흘간 열립니다. 장소는 서울CC입니다.

**Q. 2026 KLPGA 챔피언십 우승 상금은 얼마인가요?**
공식 발표된 금액은 확인되지 않았습니다. 확정되면 다시 정리하겠습니다.

**Q. 어떤 선수를 눈여겨봐야 하나요?**
올 시즌 2승을 거둔 선수의 흐름이 가장 좋습니다. 디펜딩 챔피언도 2연패에 도전합니다.

**Q. 코스 난이도는 어떤가요?**
서울CC는 그린이 빠른 코스로 알려져 있습니다. 퍼팅에서 승부가 갈릴 가능성이 큽니다.

## 🔥 누가 웃게 될까?

주말 내내 눈을 뗄 수 없는 승부가 될 것 같습니다. 함께 지켜봐 주시기 바랍니다.

${'라운드마다 흐름이 바뀌는 코스라 마지막 홀까지 순위를 알 수 없습니다. 그린이 빠른 편이라 퍼팅 감각이 승부를 가릅니다.\n\n'.repeat(64)}`);
// 반복을 64회로 둔 이유: lint 가 채점표와 같은 기준(공백 제외 3,000자)으로
// 분량을 재기 때문이다. 28회(공백 제외 1,428자)로는 실제 글 길이를 못 비춘다.
const lintGood = lintArticle(good);
check('올바른 글은 양식 검사를 통과한다', () => assert.ok(lintGood.ok, lintGood.issues.join(' / ')));
check('소제목을 모두 인식한다', () => assert.equal(lintGood.headings.length, 7));
check('짧은 글은 작성 직후에 걸린다', () => {
  // 채점표와 같은 기준(공백 제외 3,000자)으로 센다. 기준이 다르면 lint 는
  // 통과하는데 SEO 점수에서 떨어진다 — 글 7769 가 그랬다.
  const 짧은글 = { title: '제목', body: '## 📌 배경과 원리, 비교\n\n' + '가나다라마바사아자차. '.repeat(100) };
  const r = lintArticle(짧은글);
  const 분량문제 = r.issues.filter((i) => /짧습니다/.test(i));
  assert.equal(분량문제.length, 1, r.issues.join(' / '));
  assert.match(분량문제[0], /공백 제외/, 분량문제[0]);
});

check('분량 미달이 비싼 보완을 부르지는 않는다', () => {
  // 보완은 ⑤ 섹션이 빠졌을 때만 돈다(AI를 한 번 더 부른다). 분량이 조금 모자란
  // 것만으로 매번 다시 부르면 한 편 값이 올라간다. main.mjs 의 실제 트리거
  // 조건을 꺼내 분량 문구에 대 본다.
  const src = fs.readFileSync(path.join(HERE, '../src/main.mjs'), 'utf8');
  const m = /const 수명문제 = lint\.issues\.filter\(\(i\) => (\/.+?\/)\.test\(i\)\);/.exec(src);
  assert.ok(m, '보완 트리거 조건을 못 찾았습니다');
  const 트리거 = new RegExp(m[1].slice(1, -1));
  const 분량문구 = lintArticle({ title: '제목', body: '## 📌 배경과 원리, 비교\n\n짧다.' })
    .issues.find((i) => /본문이 짧습니다/.test(i));
  assert.ok(분량문구, '분량 문구가 안 나왔습니다');
  assert.ok(!트리거.test(분량문구), `분량 미달이 보완을 부릅니다: ${m[1]}`);
});


const bad = splitTitleAndBody(`제목: 나쁜 예

## 🔥 마무리
기대됩니다. 정말 기대됩니다.

---

| a | b |

![img](x.jpg) #해시태그
${'글자 '.repeat(200)}`);
const lintBad = lintArticle(bad);
check('"제목:" 라벨을 떼어낸다', () => assert.equal(bad.title, '나쁜 예'));
check('금지 항목 5가지를 모두 잡아낸다', () => {
  const joined = lintBad.issues.join(' ');
  for (const kw of ['마무리', '기대됩니다', '구분선', '표', '이미지']) {
    assert.ok(joined.includes(kw), `"${kw}" 미검출: ${joined}`);
  }
});

console.log('\n[6] 워드프레스 HTML 변환');
const html = markdownToBlocks(good.body);
check('소제목이 H2 블록이 된다', () => assert.ok(html.includes('<!-- wp:heading -->\n<h2>✨ 2026 KLPGA 챔피언십 대회 개요</h2>')));
check('**굵게**가 목록으로 오인되지 않는다', () => {
  assert.ok(html.includes('<strong>일정</strong>'), '굵은 라벨이 깨졌습니다');
  assert.ok(!html.includes('<li>*일정'), '굵은 라벨이 목록으로 잘못 들어갔습니다');
});
check('✅ 목록이 <ul>이 된다', () => assert.ok(html.includes('<!-- wp:list -->') && html.includes('<li>디펜딩 챔피언의 2연패 도전</li>')));
check('HTML 특수문자를 이스케이프한다', () => {
  const h = markdownToBlocks('<script>alert(1)</script> & 특수');
  assert.ok(h.includes('&lt;script&gt;') && h.includes('&amp;'));
});

console.log('\n[7] 저장 상태 고정');
const draftSrc = fs.readFileSync(path.join(HERE, '../src/wordpress/draft.mjs'), 'utf8');
check("코드에 'publish' 상태가 존재하지 않는다", () => {
  assert.ok(!/status:\s*['"]publish['"]/.test(draftSrc));
  assert.ok(!/['"]publish['"]/.test(draftSrc));
});
check('상태는 draft 상수로 고정되어 있다', () => assert.ok(/const DRAFT_STATUS = 'draft';/.test(draftSrc)));

const { parseArgs } = await import('../src/main.mjs');
check('--draft 없이는 저장하지 않는다', () => {
  assert.equal(parseArgs([]).dryRun, true);
  assert.equal(parseArgs(['--topic=KBO']).dryRun, true);
});
check('--draft를 붙여야 저장 모드가 된다', () => {
  const a = parseArgs(['--draft']);
  assert.equal(a.draft, true);
  assert.equal(a.dryRun, false);
});
check('DRY_RUN=true는 --draft보다 우선한다', () => {
  process.env.DRY_RUN = 'true';
  const a = parseArgs(['--draft']);
  delete process.env.DRY_RUN;
  assert.equal(a.dryRun, true, 'DRY_RUN이 켜졌는데 저장 모드입니다');
  assert.equal(a.draft, false);
});
check('옵션을 제대로 읽는다', () => {
  const a = parseArgs(['--topic="JLPGA"', '--limit=3', '--fixture=x.json']);
  assert.deepEqual(a.topics, ['JLPGA']);
  assert.equal(a.limit, 3);
  assert.equal(a.fixture, 'x.json');
});
check('지시서 분량과 채점 기준이 같은 것을 가리킨다', () => {
  // 지시서는 "공백 포함", 채점표는 "공백 제외"로 재던 탓에 지시를 지킨 글이
  // 떨어졌다(글 7769: 공백 포함 3,651자 → 공백 제외 2,782자). 기준이 어긋나면
  // 작성자가 아무리 지켜도 점수가 깎인다.
  const warp = fs.readFileSync(path.join(HERE, '../config/style-warp.md'), 'utf8');
  const m = /본문 \*\*([\d,]+)~([\d,]+)자\*\*\(공백 포함\)/.exec(warp);
  assert.ok(m, '지시서에서 분량 규칙을 못 찾았습니다');
  const 하한 = Number(m[1].replace(/,/g, ''));
  // 한국어는 공백이 글자 수의 4분의 1쯤 된다. 공백 제외 3,000자를 채우려면
  // 공백 포함 하한이 3,750자 이상이어야 한다.
  assert.ok(하한 >= 3750, `지시서 하한 ${하한}자 — 공백 제외 3,000자를 채울 수 없습니다`);
});

check('--candidates 는 후보만 보는 모드다', () => {
  // 글을 쓰지 않으므로 0원이다. 글을 쓰게 되면 비용이 생긴다.
  assert.equal(parseArgs(['--candidates']).candidates, true);
  const a = parseArgs(['--candidates=5']);
  assert.equal(a.candidates, true);
  assert.equal(a.candidatesTop, 5);
  assert.equal(parseArgs([]).candidates, undefined);
});
check('--candidates 는 AI를 부르는 단계로 넘어가지 않는다', () => {
  // 후보만 보려고 돌렸는데 사실확인·작성까지 가면 돈이 나간다.
  const src = fs.readFileSync(path.join(HERE, '../src/main.mjs'), 'utf8');
  const 시작 = src.indexOf('async function 후보만보기');
  const 끝 = src.indexOf('\nfunction printUsage');
  assert.ok(시작 > 0 && 끝 > 시작, '후보만보기 함수를 못 찾았습니다');
  const 본문 = src.slice(시작, 끝);
  for (const 금지 of ['processCluster', 'verifyCluster', 'writeArticle', 'generateSeo', 'saveDraft']) {
    assert.ok(!본문.includes(금지), `후보만 보는 경로가 ${금지} 를 부릅니다 — 돈이 나갑니다`);
  }
  // 그리고 후보 경로는 --best 보다 먼저 멈춰야 한다.
  assert.ok(src.indexOf('if (args.candidates)') < src.indexOf('if (args.best)'),
    '--candidates 가 --best 뒤에 있으면 글을 써버립니다');
});


console.log('\n[8] 설정 — 종목과 카테고리가 맞물리는지');
const topicsCfg = JSON.parse(fs.readFileSync(path.join(HERE, '../config/topics.json'), 'utf8'));
const knownNames = new Set((topicsCfg.knownCategories?.list || []).map((c) => c.name));

check('알고 있는 카테고리 목록이 비어 있지 않다', () => assert.ok(knownNames.size > 0));
check('모든 종목의 카테고리가 사이트에 실제로 있다', () => {
  const bad = topicsCfg.topics.filter((t) => !knownNames.has(t.category));
  assert.equal(bad.length, 0, `사이트에 없는 카테고리: ${bad.map((t) => `${t.name}→${t.category}`).join(', ')}`);
});
check('켜져 있는 종목에는 검색어가 있다', () => {
  const bad = topicsCfg.topics.filter((t) => t.enabled !== false && !(t.queries || []).length);
  assert.equal(bad.length, 0, `검색어 없는 종목: ${bad.map((t) => t.name).join(', ')}`);
});
check('종목 이름이 중복되지 않는다', () => {
  const names = topicsCfg.topics.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
});
check('뉴스 소스가 둘 이상이다', () => {
  assert.ok((topicsCfg.feeds?.searchFeeds || []).length >= 2, '소스가 하나뿐이면 그 한 곳이 막힐 때 전체가 멈춥니다');
});

// ── 자주 묻는 질문 구조화 데이터 ──────────────────────────
console.log('\n[자주 묻는 질문 구조화 데이터]');

const faqBody = [
  '## ❓ 자주 묻는 질문',
  '**Q. 대회는 언제 열리나요?**',
  '2026년 10월 3일부터 5일까지 열립니다. 장소는 남원입니다.',
  '**Q. 참가비가 있나요?**',
  '공식 발표된 금액은 확인되지 않았습니다.',
  '## 🔥 누가 웃을까',
  '끝까지 지켜봐 주시기 바랍니다.',
].join('\n\n');

check('질문과 답을 읽어낸다', () => {
  const faqs = extractFaq(faqBody);
  assert.equal(faqs.length, 2, JSON.stringify(faqs));
  assert.equal(faqs[0].question, '대회는 언제 열리나요?');
  assert.ok(faqs[0].answer.startsWith('2026년 10월 3일'), faqs[0].answer);
});
check('소제목이 답에 섞여 들어가지 않는다', () => {
  const faqs = extractFaq(faqBody);
  assert.ok(!faqs[1].answer.includes('누가 웃을까'), faqs[1].answer);
  assert.ok(!faqs[1].answer.includes('지켜봐'), faqs[1].answer);
});
check('JSON-LD가 올바른 형태로 만들어진다', () => {
  const block = faqSchemaBlock(faqBody);
  const json = JSON.parse(block.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(json['@type'], 'FAQPage');
  assert.equal(json.mainEntity.length, 2);
  assert.equal(json.mainEntity[0]['@type'], 'Question');
  assert.equal(json.mainEntity[0].acceptedAnswer['@type'], 'Answer');
});
check('질문이 하나뿐이면 구조화 데이터를 만들지 않는다', () => {
  assert.equal(faqSchemaBlock('**Q. 하나뿐?**\n\n네.'), '');
});
check('본문에 질문이 없으면 아무것도 붙이지 않는다', () => {
  assert.equal(faqSchemaBlock('## ✨ 개요\n\n내용입니다.'), '');
});
check('</script>가 값에 섞여도 스크립트가 끊기지 않는다', () => {
  const block = faqSchemaBlock('**Q. 왜?**\n\n</script> 때문입니다.\n\n**Q. 또?**\n\n그렇습니다.');
  assert.ok(!/<\/script>[\s\S]*<\/script>[\s\S]*<\/script>/.test(block), '스크립트가 중간에 끊깁니다');
  assert.ok(block.includes('<\\/script'), '이스케이프되지 않았습니다');
});

// ── 키워드 밀도 ───────────────────────────────────────────
console.log('\n[키워드 밀도]');

check('밀도를 Rank Math 방식으로 센다', () => {
  const body = `${'가나다 '.repeat(96)}바둑춘향 선발대회`;
  const d = keywordDensity(body, '바둑춘향 선발대회');
  assert.equal(d.count, 1);
  assert.equal(d.words, 98);
  assert.ok(d.density > 1 && d.density < 1.1, `${d.density}%`);
});
check('키워드 사이 공백이 달라도 센다', () => {
  assert.equal(keywordDensity('바둑춘향   선발대회 소식', '바둑춘향 선발대회').count, 1);
});
check('목표 횟수는 분량에 비례한다', () => {
  assert.ok(targetKeywordCount(3000) < targetKeywordCount(4500));
  assert.ok(targetKeywordCount(4200) <= 20);
});

// 실제로 당한 일: 3,500자를 기준으로 목표를 잡았는데 글이 4,159자로 나와
// 밀도가 1.07%에 그쳤다. 분량이 규격(3,000~4,500자) 어디에 떨어지든
// 1.25~2.5% 안에 들어야 한다.
check('규격 분량 어디에 떨어져도 권장 구간 안에 든다', () => {
  const n = targetKeywordCount();
  for (const chars of [3000, 3500, 4000, 4500]) {
    const words = Math.round(chars / 3.5);
    const density = (n / words) * 100;
    assert.ok(density >= 1.25, `${chars}자에서 ${density.toFixed(2)}% — 너무 낮습니다`);
    assert.ok(density <= 2.5, `${chars}자에서 ${density.toFixed(2)}% — 남용입니다`);
  }
});

// ── 실행 진입점이 .env 없이도 도는가 ───────────────────────
// 실제로 당한 일: 새로 만든 명령이 process.loadEnvFile('.env')를 직접 불러
// GitHub Actions에서 ENOENT로 0초 만에 죽었다. 거기엔 .env가 없고 비밀값이
// 환경변수로 들어온다. .env 로딩은 utils/env.mjs의 loadEnv() 한 곳만 한다.
console.log('\n[.env 없이도 도는가]');

check('utils/env.mjs 말고는 .env를 직접 읽지 않는다', () => {
  const srcDir = path.join(HERE, "..", "src");
  const offenders = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.mjs')) continue;
      if (full.endsWith(path.join('utils', 'env.mjs'))) continue;
      if (/process\.loadEnvFile/.test(fs.readFileSync(full, 'utf8'))) {
        offenders.push(path.relative(path.join(HERE, ".."), full));
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, [], `loadEnv()를 쓰세요: ${offenders.join(', ')}`);
});

// ── 실측 데이터가 점수표에 반영됐는가 ───────────────────────
// 네이버 서치어드바이저 실측치(config/search-demand.md)를 근거로 점수를 준다.
// 문서와 코드가 따로 놀면 "데이터 기반"이 말뿐이 된다.
console.log('\n[실측 유입 데이터 반영]');

const 점수 = (label) => rankClusters(
  [{ label, articles: [{ summary: '' }], sourceCount: 3, latestAt: new Date(NOW).toISOString() }],
  { name: '골프', category: '골프', longTermHints: [] },
)[0].score;

check('상금 글감이 대회 결과보다 높다', () => {
  // 실측 1위가 "어스몬다민컵우승상금" 134클릭이다.
  assert.ok(점수('어스몬다민컵 우승 상금은 얼마') > 점수('어스몬다민컵 1라운드 결과'),
    `${점수('어스몬다민컵 우승 상금은 얼마')} vs ${점수('어스몬다민컵 1라운드 결과')}`);
});

check('시설 이용 안내가 개장 소식보다 높다', () => {
  assert.ok(점수('남서울 파3 이용방법과 예약 안내') > 점수('남서울 파3 야간개장 시작'));
});

check('복장·가는 길 같은 검색어에도 가점이 있다', () => {
  for (const kw of ['복장 규정', '가는 길과 주차', '중계 보는법', '이용료 안내']) {
    assert.ok(점수(`대회 ${kw}`) > 점수('대회 소식'), kw);
  }
});

check('실측 데이터 원본이 문서로 남아 있다', () => {
  const file = path.join(HERE, '..', 'config', 'search-demand.md');
  assert.ok(fs.existsSync(file), 'config/search-demand.md가 없습니다');
  const doc = fs.readFileSync(file, 'utf8');
  assert.ok(/확인일/.test(doc), '언제 받은 데이터인지 적혀 있어야 합니다');
  assert.ok(/어스몬다민컵|남서울/.test(doc), '실제 검색어가 빠졌습니다');
});

// ── 글의 수명을 정하는 섹션 ────────────────────────────────
// 두 편 연속으로 ⑤번(오래 가는 내용)이 빠졌다. 지시서에 적어두기만 해서는
// 안 지켜진다는 뜻이라 검사로 올렸다.
console.log('\n[배경·원리·비교 섹션]');

const 섹션있는글 = (본문) => [
  '핵심 요약입니다. 2026년 10월 6일에 다시 엽니다.',
  '## ✨ 개요', '**일정**: 10월 6일',
  '## 📌 배경과 원리', 본문,
  '## ❓ 자주 묻는 질문', '**Q. 언제 여나요?**', '10월 6일입니다.',
  '## 🔥 누가 웃을까', '다음은 10월 10일입니다. 또 정리하겠습니다. 지켜봐 주세요.',
].join('\n\n');

check('섹션이 아예 없으면 짚어낸다', () => {
  const body = 섹션있는글('내용').replace('## 📌 배경과 원리', '## 🎯 분석');
  const issues = lintArticle({ title: '제목', body }).issues.join(' ');
  assert.ok(issues.includes('배경·원리·비교 섹션이 없습니다'), issues);
});

check('소제목만 있고 내용이 비면 짚어낸다', () => {
  // 소제목 하나 넣고 한 문장만 쓰는 것으로 넘어가지 못하게 한다.
  const issues = lintArticle({ title: '제목', body: 섹션있는글('짧습니다.') }).issues.join(' ');
  assert.ok(/섹션이 너무 짧습니다/.test(issues), issues);
});

check('내용이 충분하면 통과한다', () => {
  const 긴본문 = '파크골프는 9홀 또는 18홀로 구성됩니다. 홀마다 파가 정해져 있습니다. '.repeat(12);
  const issues = lintArticle({ title: '제목', body: 섹션있는글(긴본문) }).issues.join(' ');
  assert.ok(!/배경|섹션이 너무 짧/.test(issues), issues);
});

check('작성 지시에도 그 섹션이 박혀 있다', () => {
  // 지시서 파일에만 있으면 모델이 흘려보낸다. 프롬프트 끝에 다시 넣었다.
  const src = fs.readFileSync(path.join(HERE, '..', 'src', 'ai', 'write.mjs'), 'utf8');
  assert.ok(/반드시 들어가야 할 두 섹션/.test(src), '작성 지시에서 빠졌습니다');
  assert.ok(/글의 수명을 정합니다/.test(src), '왜 중요한지 설명이 빠졌습니다');
});

// ── 네 가지 원칙이 코드로 지켜지는가 ────────────────────────
// 운영자가 정한 네 가지(① AI 티 안 나게 ② 구글 색인 ③ AI 인용 ④ 검색되는 제목).
// 문서로만 적어두면 지켜지지 않으므로, 셀 수 있는 것은 검사로 묶어둔다.
console.log('\n[네 가지 원칙]');

check('① AI 상투어를 잡아낸다', () => {
  const body = '## ✨ 개요\n\n결론적으로 좋은 대회입니다. 귀추가 주목됩니다.';
  const issues = lintArticle({ title: '제목', body }).issues.join(' ');
  assert.ok(issues.includes('결론적으로'), issues);
  assert.ok(issues.includes('귀추가 주목됩니다'), issues);
});

check('① 접속어 남용을 잡아낸다', () => {
  const body = `개요입니다. ${'또한 좋습니다. '.repeat(5)}`;
  const issues = lintArticle({ title: '제목', body }).issues.join(' ');
  assert.ok(/"또한"가 \d회 나옵니다/.test(issues), issues);
});

check('① 한 번 쓰는 것까지 막지는 않는다', () => {
  // 한국어에서 자연스러운 말까지 전부 막으면 글이 어색해진다.
  const body = '개요입니다. 또한 상금도 올랐습니다. 다양한 선수가 나옵니다.';
  const issues = lintArticle({ title: '제목', body }).issues.join(' ');
  assert.ok(!issues.includes('또한'), issues);
  assert.ok(!issues.includes('다양한'), issues);
});

check('① 금지어 표에 허용 횟수가 모두 적혀 있다', () => {
  for (const [phrase, limit] of Object.entries(AI_TELLS)) {
    assert.ok(Number.isInteger(limit) && limit >= 0, `${phrase}: ${limit}`);
  }
  assert.ok(Object.keys(AI_TELLS).length >= 10, '표가 너무 비었습니다');
});

const 지시서 = fs.readFileSync(path.join(HERE, '..', 'config', 'style-warp.md'), 'utf8');

check('②③④ 지시서가 네 가지 원칙을 맨 위에 싣고 있다', () => {
  const head = 지시서.slice(0, 1400);
  assert.ok(head.includes('AI가 쓴 글처럼 보이지 않는다'), '① 원칙이 없습니다');
  assert.ok(head.includes('색인'), '② 원칙이 없습니다');
  assert.ok(head.includes('AI가 인용'), '③ 원칙이 없습니다');
  assert.ok(head.includes('검색에 걸리는 제목'), '④ 원칙이 없습니다');
});

check('③ 지시서가 대명사 대신 이름을 쓰라고 지시한다', () => {
  assert.ok(/대명사/.test(지시서), '대명사 규칙이 빠졌습니다');
  assert.ok(/떼어 읽어도/.test(지시서), '문장 독립성 규칙이 빠졌습니다');
});

check('④ 지시서가 키워드를 제목 맨 앞에 두라고 지시한다', () => {
  assert.ok(/제목 맨 앞/.test(지시서), '제목 규칙이 빠졌습니다');
});

const 프로젝트규칙 = fs.readFileSync(path.join(HERE, '..', 'CLAUDE.md'), 'utf8');

check('네 가지 원칙이 프로젝트 규칙 파일에도 박혀 있다', () => {
  // 대화가 길어지면 맥락이 흐려진다. 다음 세션이 읽을 파일에도 남겨둔다.
  for (const kw of ['AI가 쓴 글처럼 보이지 않는다', '서치콘솔', '인용', '검색에 걸리는 제목']) {
    assert.ok(프로젝트규칙.includes(kw), `"${kw}"가 빠졌습니다`);
  }
});

check('여섯 단계 흐름이 문서에 남아 있다', () => {
  for (const kw of ['경쟁은 덜한 글감', '첫 문장에서 답변', '오래 검색될 개념', '다음 검색을 유도']) {
    assert.ok(프로젝트규칙.includes(kw), `"${kw}"가 빠졌습니다`);
  }
});

check('트렌드 데이터가 없다는 한계를 숨기지 않는다', () => {
  // 대리 신호를 "검색량"인 척하면 나중에 판단이 틀어진다.
  assert.ok(/대리 신호|접근하지\s*\n?못한다/.test(프로젝트규칙), '한계 설명이 빠졌습니다');
});

check('링크를 현재 창에서 연다는 규칙이 문서에 남아 있다', () => {
  assert.ok(/현재 창에서 연다/.test(프로젝트규칙), '링크 규칙이 빠졌습니다');
});

check('임시글로만 저장한다는 안전선이 문서에 남아 있다', () => {
  assert.ok(/임시글\(draft\)로만/.test(프로젝트규칙), '자동 발행 금지 원칙이 빠졌습니다');
});

// ── 링크는 현재 창에서 연다 ────────────────────────────────
// 새 창으로 띄우면 독자가 원래 글로 돌아오는 길을 잃고, 모바일에서는 탭이 쌓인다.
// 우리가 만드는 링크(이미지·중계 배너)에 target이 붙지 않는지 확인한다.
// 쿠팡 광고는 제휴사가 준 코드 그대로라 여기서 제외한다.
console.log('\n[링크는 현재 창에서]');

check('이미지 링크에 새 창이 붙지 않는다', () => {
  const html = imageHtml({ url: 'https://x.test/a.png', alt: '대체텍스트' });
  assert.ok(!/target=/.test(html), html);
  assert.ok(!/noopener/.test(html), html);
});

check('우리가 만드는 링크 어디에도 target이 없다', () => {
  const srcDir = path.join(HERE, '..', 'src');
  const offenders = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.mjs')) continue;
      const text = fs.readFileSync(full, 'utf8');
      // 주석에 설명으로 적은 것은 세지 않는다. 실제 출력에 들어가는 것만 본다.
      const code = text.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
      if (/target=["']_blank/.test(code)) offenders.push(path.relative(path.join(HERE, '..'), full));
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, [], `현재 창에서 열어야 합니다: ${offenders.join(', ')}`);
});

Date.now = realNow;
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ 전체 ${passed}개 항목 통과`}\n`);

function iso(hoursAgo) { return new Date(NOW - hoursAgo * 3600000).toISOString(); }
