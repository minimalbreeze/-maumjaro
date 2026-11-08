// 자주 묻는 질문 절 넣기 검사.
import assert from 'node:assert/strict';
import { 묶음열쇠, 버릴이유, 마크다운, 넣은것 } from '../src/wordpress/add-faq.mjs';
import { extractFaq } from '../src/seo/faq-schema.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[자주 묻는 질문 절 넣기]');

const 본문글 = '수원CC 파3 골프장은 경기도 용인시에 있습니다. 9홀이고 주중 이용료는 25000원입니다. 예약은 전화 031-123-4567 로만 받습니다. 운영시간은 오전 6시부터입니다.';
const 좋은것 = [
  { q: '수원CC 파3 이용료는 얼마인가요?', a: '주중 이용료는 25000원입니다.' },
  { q: '수원CC 파3 골프장은 어디에 있나요?', a: '경기도 용인시에 있습니다.' },
  { q: '예약은 어떻게 하나요?', a: '전화 031-123-4567 로만 받습니다.' },
  { q: '몇 홀인가요?', a: '9홀입니다.' },
];

check('짧지만 옳은 답은 버리지 않는다 — "9홀입니다." 가 그 경우다', () => {
  assert.equal(버릴이유({ faqs: 좋은것, 키워드: '수원CC 파3', 본문글 }), null);
  // 정말 비었거나 부스러기면 버린다.
  const 나쁜것 = [{ ...좋은것[3], a: '네.' }, ...좋은것.slice(0, 3)];
  assert.ok(버릴이유({ faqs: 나쁜것, 키워드: '수원CC 파3', 본문글 }).includes('짧습니다'));
});

check('본문 사실로만 쓴 질문 넷은 통과한다', () => {
  assert.equal(버릴이유({ faqs: 좋은것, 키워드: '수원CC 파3', 본문글 }), null);
});

check('답에 본문에 없는 숫자가 들어오면 버린다 — 이 도구의 중심', () => {
  const 나쁜것 = [...좋은것.slice(1), { q: '수원CC 파3 이용료는 얼마인가요?', a: '주중 이용료는 38000원입니다.' }];
  const 이유 = 버릴이유({ faqs: 나쁜것, 키워드: '수원CC 파3', 본문글 });
  assert.ok(이유 && 이유.includes('38000'), `이유: ${이유}`);
});

check('질문이 4~5개가 아니면 버린다', () => {
  assert.ok(버릴이유({ faqs: 좋은것.slice(0, 3), 키워드: '수원CC 파3', 본문글 }).includes('3개'));
  const 여섯 = [...좋은것, { q: '주차는 되나요?', a: '본문에 있습니다.' }, { q: '샤워실이 있나요?', a: '본문에 있습니다.' }];
  assert.ok(버릴이유({ faqs: 여섯, 키워드: '수원CC 파3', 본문글 }).includes('6개'));
});

check('빈 목록은 버린다 — 모델이 억지로 만들지 않은 것이다', () => {
  assert.ok(버릴이유({ faqs: [], 키워드: '수원CC 파3', 본문글 }).includes('답할 사실이 없다'));
});

check('물음표로 끝나지 않으면 버린다', () => {
  const 나쁜것 = [{ ...좋은것[0], q: '이용료 안내입니다.' }, ...좋은것.slice(1)];
  assert.ok(버릴이유({ faqs: 나쁜것, 키워드: '수원CC 파3', 본문글 }).includes('질문 꼴이'));
});

check('질문 어디에도 대표 키워드가 없으면 버린다', () => {
  // 네 질문 **전부** 에서 키워드를 빼야 이 검사가 걸린다.
  const 나쁜것 = [
    { q: '이용료는 얼마인가요?', a: '주중 이용료는 25000원입니다.' },
    { q: '어디에 있나요?', a: '경기도 용인시에 있습니다.' },
    { q: '예약은 어떻게 하나요?', a: '전화 031-123-4567 로만 받습니다.' },
    { q: '몇 홀인가요?', a: '9홀입니다.' },
  ];
  const 이유 = 버릴이유({ faqs: 나쁜것, 키워드: '수원CC 파3', 본문글 });
  assert.ok(이유 && 이유.includes('대표 키워드'), `이유: ${이유}`);
});

check('앞선 글과 질문 묶음이 같으면 버린다 — 똑같은 질문 631벌을 막는다', () => {
  const 이미 = new Set([묶음열쇠(좋은것)]);
  const 이유 = 버릴이유({ faqs: 좋은것, 키워드: '수원CC 파3', 본문글, 이미쓴열쇠: 이미 });
  assert.ok(이유 && 이유.includes('같습니다'), `이유: ${이유}`);
});

check('묶음열쇠는 순서가 달라도 같게 본다', () => {
  assert.equal(묶음열쇠(좋은것), 묶음열쇠([...좋은것].reverse()));
});

check('만든 마크다운을 extractFaq 가 그대로 읽는다 — 본문과 구조화 데이터가 같아야 한다', () => {
  const md = 마크다운(좋은것);
  const 읽은것 = extractFaq(md);
  assert.equal(읽은것.length, 4);
  assert.equal(읽은것[0].question, '수원CC 파3 이용료는 얼마인가요?');
  assert.equal(읽은것[0].answer, '주중 이용료는 25000원입니다.');
});

check('마지막 소제목 앞에 넣는다 — ⑨ 가 ⑩ 보다 앞이다', () => {
  const 글 = [
    '<!-- wp:heading -->\n<h2>✨ 개요</h2>\n<!-- /wp:heading -->',
    '<!-- wp:paragraph -->\n<p>본문입니다.</p>\n<!-- /wp:paragraph -->',
    '<!-- wp:heading -->\n<h2>🔥 마지막 절</h2>\n<!-- /wp:heading -->',
    '<!-- wp:paragraph -->\n<p>끝 문단입니다.</p>\n<!-- /wp:paragraph -->',
  ].join('\n\n');
  const r = 넣은것(글, 마크다운(좋은것));
  assert.ok(r.indexOf('자주 묻는 질문') < r.indexOf('🔥 마지막 절'), '질문 절이 마지막 절보다 앞이어야 한다');
  assert.ok(r.indexOf('✨ 개요') < r.indexOf('자주 묻는 질문'), '개요는 그대로 앞에 있어야 한다');
  assert.ok(r.includes('끝 문단입니다.'), '기존 본문을 잃지 않는다');
});

check('소제목이 없는 글이면 끝에 붙인다', () => {
  const 글 = '<!-- wp:paragraph -->\n<p>본문만 있습니다.</p>\n<!-- /wp:paragraph -->';
  const r = 넣은것(글, 마크다운(좋은것));
  assert.ok(r.indexOf('본문만 있습니다') < r.indexOf('자주 묻는 질문'));
});

check('구조화 데이터를 함께 넣고, 그 JSON 이 읽힌다', () => {
  const 글 = '<!-- wp:heading -->\n<h2>끝</h2>\n<!-- /wp:heading -->';
  const r = 넣은것(글, 마크다운(좋은것));
  const m = r.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, '구조화 데이터가 들어가야 한다');
  const data = JSON.parse(m[1].trim());
  assert.equal(data['@type'], 'FAQPage');
  assert.equal(data.mainEntity.length, 4);
  // 본문과 글자가 같아야 한다 — 다르면 구글이 스팸으로 본다.
  assert.equal(data.mainEntity[0].name, 좋은것[0].q);
});

console.log(`\n  ${passed}개 통과`);
