// 글끼리 링크 거는 도구가 안전선을 지키는지 검사.
//
// 발행된 글 수백 편의 **본문**을 건드리는 유일한 도구다. 본문이 망가지면
// 되돌리기가 제일 어렵다. 그래서 "블록 말고는 아무것도 안 바뀐다"를 가장
// 세게 검사한다.
//
// 설계 근거는 구글 "검색엔진 최적화(SEO) 기본 가이드":
//   "Google은 주로 이미 크롤링한 다른 페이지의 링크를 통해 페이지를 찾습니다."
//   "적절한 앵커 텍스트를 사용하면 ... 어떤 내용인지 쉽게 이해할 수 있습니다."

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LINK_SIGN, 이미있나, 블록걷어내기, 가까운정도, 이어줄글, 블록만들기, 붙이기, 블록만바뀌었나,
  같은종목인가, 겹치는낱말수,
} from '../src/wordpress/internal-links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[글끼리 링크 걸기]');

const 글들 = [
  { id: 1, title: '남서울CC 파3 이용료·예약 방법', link: 'https://wiki.x/a', date: '2025-07-01' },
  { id: 2, title: '대구CC 파3 골프장 이용료·예약 방법', link: 'https://wiki.x/b', date: '2025-07-02' },
  { id: 3, title: '가평파크골프장 이용료·예약 방법', link: 'https://wiki.x/c', date: '2025-07-03' },
  { id: 4, title: 'KBO 참가활동기간 1월 25일로 변경', link: 'https://wiki.x/d', date: '2025-07-04' },
  { id: 5, title: '끝난 대회 중계 시청 방법', link: 'https://wiki.x/e', date: '2025-07-05', 색인제외: true },
];

// ── 고르기 ─────────────────────────────────────────────────
check('비슷한 글을 고르고 자기 자신은 안 고른다', () => {
  const 고른것 = 이어줄글(글들[0], 글들);
  assert.ok(고른것.length > 0, '아무것도 못 골랐습니다');
  assert.ok(!고른것.some((p) => p.id === 1), '자기 자신을 골랐습니다');
});

check('구글 색인에서 뺀 글로는 링크하지 않는다', () => {
  // 거기로 보내봐야 구글이 안 올린다. 살아 있는 글끼리 이어야 한다.
  for (const p of 글들) {
    assert.ok(!이어줄글(p, 글들).some((t) => t.색인제외), `${p.id} 가 색인 제외 글로 링크합니다`);
  }
});

check('같은 유형을 먼저 고른다', () => {
  // 시설 글에서 골랐으면 시설 글이 먼저 와야 한다. 아무 글이나 이으면 소음이다.
  const 고른것 = 이어줄글(글들[0], 글들);
  assert.ok(/파3|파크골프/.test(고른것[0].title), `엉뚱한 글이 1순위입니다: ${고른것[0].title}`);
});

check('개수를 넘겨 고르지 않는다', () => {
  assert.ok(이어줄글(글들[0], 글들, { 개수: 2 }).length <= 2);
});

// ── 블록 ───────────────────────────────────────────────────
check('앵커 텍스트가 대상 글의 제목이다', () => {
  // 구글: "적절한 앵커 텍스트를 사용하면 ... 어떤 내용인지 쉽게 이해할 수 있습니다"
  const html = 블록만들기([글들[1]]);
  assert.ok(html.includes('대구CC 파3 골프장 이용료·예약 방법'), '제목이 앵커에 없습니다');
  assert.ok(!/>여기</.test(html) && !/>관련 글</.test(html), '뜻 없는 앵커를 씁니다');
});

check('내부 링크에 nofollow 를 붙이지 않는다', () => {
  // nofollow 는 신뢰할 수 없는 외부 링크용이다. 우리 글끼리는 이어져야 한다.
  assert.ok(!/nofollow/.test(블록만들기(글들.slice(0, 3))));
});

check('새 창으로 열지 않는다 (리포 규칙)', () => {
  assert.ok(!/target\s*=/.test(블록만들기(글들.slice(0, 3))));
});

check('제목에 든 기호를 그대로 쓰지 않는다', () => {
  const 위험 = [{ id: 9, title: '제목 <script>alert(1)</script> & "따옴표"', link: 'https://wiki.x/z' }];
  const html = 블록만들기(위험);
  assert.ok(!html.includes('<script>'), '태그가 그대로 들어갔습니다');
  assert.ok(html.includes('&lt;script&gt;'), '기호를 바꾸지 않았습니다');
  assert.ok(html.includes('&amp;'), '앰퍼샌드를 바꾸지 않았습니다');
});

check('이어줄 글이 없으면 블록을 만들지 않는다', () => {
  assert.equal(블록만들기([]), '');
});

// ── 붙이기 / 걷어내기 ──────────────────────────────────────
const 본문 = '<!-- wp:paragraph -->\n<p>원래 본문입니다.</p>\n<!-- /wp:paragraph -->';

check('본문 끝에 붙이고 기존 본문을 건드리지 않는다', () => {
  const 후 = 붙이기(본문, 블록만들기(글들.slice(1, 3)));
  assert.ok(후.startsWith(본문), '본문 앞부분이 바뀌었습니다');
  assert.ok(후.includes(LINK_SIGN));
});

check('두 번 돌려도 블록이 하나만 남는다', () => {
  const 한번 = 붙이기(본문, 블록만들기(글들.slice(1, 3)));
  const 두번 = 붙이기(한번, 블록만들기(글들.slice(1, 3)));
  assert.equal((두번.match(new RegExp(LINK_SIGN, 'g')) || []).length, 1);
  assert.equal(두번, 한번);
});

check('블록을 걷어내면 원래 본문으로 돌아온다', () => {
  const 후 = 붙이기(본문, 블록만들기(글들.slice(1, 3)));
  assert.equal(블록걷어내기(후), 본문);
});

check('블록이 없는 본문은 그대로 둔다', () => {
  assert.equal(블록걷어내기(본문), 본문);
  assert.equal(이미있나(본문), false);
});

check('블록 말고 다른 곳이 바뀌면 잡아낸다', () => {
  const 좋은것 = 붙이기(본문, 블록만들기(글들.slice(1, 3)));
  assert.equal(블록만바뀌었나(본문, 좋은것), true);
  // 본문을 건드린 경우
  const 나쁜것 = 붙이기(본문.replace('원래 본문입니다', '누가 고쳤다'), 블록만들기(글들.slice(1, 3)));
  assert.equal(블록만바뀌었나(본문, 나쁜것), false);
});

// ── 안전 ───────────────────────────────────────────────────
check('보내기 전에 블록만 바뀌었는지 확인한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/internal-links.mjs'), 'utf8');
  assert.match(src, /블록만바뀌었나\(before, after\)/, '보내기 전 확인이 없습니다');
  assert.match(src, /손대도되는글인가\(post\.link, base\)/, '다른 사이트 글을 거르지 않습니다');
});

check('미리보기가 기본이고 --apply 가 있어야 쓴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/internal-links.mjs'), 'utf8');
  assert.match(src, /includes\('--apply'\)/);
  assert.match(src, /if \(!적용\)/);
  assert.ok(!/method:\s*['"]DELETE['"]/.test(src), '삭제 요청이 들어 있습니다');
});

// ── 빈 줄을 건드리지 않는다 (2026-10-10, 633편 적용에서 잡음) ──
// 처음 판은 블록을 찾았을 때만 \n{3,} → \n\n 정규화를 걸었다. 그래서 빈 줄이
// 3개 이상인 글에서 "붙인 뒤 걷어낸 결과"가 원본과 달라졌고, 확인이 그 글을
// 거부했다. 633편 중 5편이 이것 때문에 막혔다 (4763·4827·4941·4947·4963).
console.log('\n[빈 줄 보존]');

const 빈줄많은본문 = '<p>첫 문단</p>\n\n\n\n<p>둘째 문단</p>\n\n\n<p>셋째</p>\n';

check('빈 줄이 3개 이상이어도 붙였다 떼면 원본과 글자 하나까지 같다', () => {
  const 블록 = 블록만들기([{ id: 2, title: '다른 글', link: 'https://wiki.minimalbreeze.com/b' }]);
  const after = 붙이기(빈줄많은본문, 블록);
  assert.equal(블록걷어내기(after), 빈줄많은본문, '빈 줄이 바뀌었습니다');
});

check('빈 줄이 3개 이상인 글도 확인을 통과한다', () => {
  const 블록 = 블록만들기([{ id: 2, title: '다른 글', link: 'https://wiki.minimalbreeze.com/b' }]);
  const after = 붙이기(빈줄많은본문, 블록);
  assert.ok(블록만바뀌었나(빈줄많은본문, after),
    '빈 줄 때문에 "다른 곳도 바뀐다"고 봅니다 — 633편 중 5편이 이걸로 막혔습니다');
});

check('앞뒤 공백도 그대로 둔다', () => {
  const 블록 = 블록만들기([{ id: 2, title: '다른 글', link: 'https://wiki.minimalbreeze.com/b' }]);
  for (const 본문 of ['\n\n<p>앞에 빈 줄</p>', '<p>뒤에 빈 줄</p>\n\n\n', '  <p>공백</p>  ']) {
    const after = 붙이기(본문, 블록);
    assert.equal(블록걷어내기(after), 본문, `공백이 바뀌었습니다: ${JSON.stringify(본문)}`);
    assert.ok(블록만바뀌었나(본문, after), `확인에 걸립니다: ${JSON.stringify(본문)}`);
  }
});

check('두 번 돌려도 빈 줄이 늘어나지 않는다', () => {
  const 블록 = 블록만들기([{ id: 2, title: '다른 글', link: 'https://wiki.minimalbreeze.com/b' }]);
  const 한번 = 붙이기(빈줄많은본문, 블록);
  const 두번 = 붙이기(한번, 블록);
  assert.equal(두번, 한번, '돌릴 때마다 본문이 자랍니다');
});

// ── 소음 링크를 걸지 않는다 (2026-10-10, 미리보기에서 잡음) ──
// 처음 판은 "같은 유형이면 2점"만으로 이었다. 유형이 '기타'·'일정'인 글들이
// 종목과 무관하게 다 이어졌다. 실제 미리보기에서 나온 두 건을 그대로 둔다.
console.log('\n[소음 링크]');

const 아이폰 = { id: 7789, title: '아이폰 사진첩 정리, 지우지 말고 애초에 안 쌓이게 하는 법 (페이드캠으로 1일·7일·30일 뒤 자동 삭제)', categories: [9], date: '2026-10-08' };
const 근로장려금 = { id: 7001, title: "근로장려금 신청 총정리! 최대 330만원! '국가가 주는 돈', 놓치지 말고 꼭 받자!", categories: [11], date: '2026-09-01' };
const 당구 = { id: 7793, title: '2026 경남고성군수배 전국당구대회 일정 (조명우 2연패 도전과 서서아 복귀, 상금은 얼마인가)', categories: [5], date: '2026-10-08' };
const 골프대회 = { id: 7500, title: '2026 KLPGA OK저축은행 읏맨 오픈 (김민솔 상금 1위 탈환, 방신실 2연패 도전!)', categories: [3], date: '2026-09-20' };
const 당구2 = { id: 7400, title: '2026 전국당구선수권 조명우 결승 진출 (우승 상금과 중계는?)', categories: [5], date: '2026-09-10' };

check('종목이 다르고 겹치는 낱말도 없으면 잇지 않는다', () => {
  assert.equal(가까운정도(아이폰, 근로장려금), 0,
    '아이폰 글과 근로장려금 글이 이어집니다 — 미리보기에서 실제로 나온 사고입니다');
  assert.equal(가까운정도(당구, 골프대회), 0,
    '당구 글과 골프 대회 글이 이어집니다 — 둘 다 "일정" 유형이라는 이유였습니다');
});

check('연도·회차만 겹치는 것은 겹친 것으로 안 본다', () => {
  // 그 해에 나온 글은 다 "2026"을 달고 있다. 당구 ↔ 골프가 그래서 이어졌다.
  assert.equal(겹치는낱말수(당구, 골프대회), 0, '"2026" 을 주제로 셉니다');
  const a = { title: '제16회 롯데 오픈 중계' };
  const b = { title: '제16회 전국체전 배구 일정' };
  assert.equal(겹치는낱말수(a, b), 0, '회차를 주제로 셉니다');
});

check('조사·흔한 꾸밈말만 겹치는 것도 안 본다', () => {
  // 아이폰 ↔ 근로장려금이 이어진 이유는 겹친 낱말 "말고" 하나였다.
  assert.equal(겹치는낱말수(아이폰, 근로장려금), 0, '"말고" 를 주제로 셉니다');
});

check('닮은정도(중복 판정)의 실측 기준은 건드리지 않는다', () => {
  // 중복 판정 기준값(0.55 / 0.13)이 실측으로 잡혀 있다. 낱말 목록을 거기서
  // 바꾸면 그 숫자가 전부 흔들리므로, 걸러내기는 링크 쪽에만 둔다.
  const audit = fs.readFileSync(path.join(ROOT, 'src/wordpress/index-audit.mjs'), 'utf8');
  assert.ok(!/뜻없는낱말|주제가아닌꼴/.test(audit),
    '걸러내기가 index-audit 으로 넘어갔습니다 — 중복 판정 기준이 흔들립니다');
});

check('같은 카테고리(= 같은 종목)면 잇는다', () => {
  assert.ok(가까운정도(당구, 당구2) > 0, '같은 종목 글을 못 잇습니다');
});

check('제목 낱말이 겹치면 카테고리가 달라도 잇는다', () => {
  // 같은 선수·대회를 다룬 글은 카테고리가 갈려 있어도 이어야 한다.
  const a = { id: 1, title: '신지애 일본여자오픈 우승', categories: [3], date: '2026-10-05' };
  const b = { id: 2, title: '신지애 누적 상금 1위', categories: [7], date: '2026-10-01' };
  assert.ok(가까운정도(a, b) > 0, '같은 선수 글을 못 잇습니다');
});

check('겹치는 낱말이 많을수록 앞에 온다', () => {
  const 나 = { id: 1, title: '신지애 일본여자오픈 우승 상금', categories: [3], date: '2026-10-05' };
  const 많이 = { id: 2, title: '신지애 일본여자오픈 3라운드', categories: [3], date: '2026-10-04' };
  const 조금 = { id: 3, title: '신지애 통산 기록', categories: [3], date: '2026-10-03' };
  const 고른것 = 이어줄글(나, [조금, 많이], { 개수: 2 });
  assert.equal(고른것[0].id, 2, '덜 가까운 글이 먼저 옵니다');
});

check('이을 글이 없으면 블록을 안 붙인다 (빈 링크보다 낫다)', () => {
  // 엉뚱한 링크를 받는 것보다 안 받는 것이 낫다. 그 선택이 코드에 남아 있어야 한다.
  assert.deepEqual(이어줄글(아이폰, [근로장려금, 당구, 골프대회]), []);
  assert.equal(블록만들기([]), '');
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/internal-links.mjs'), 'utf8');
  assert.match(src, /엉뚱한 링크를 받는 것보다 안 받는 것이 낫다/);
});

check('카테고리를 실제로 받아온다', () => {
  // 안 받아오면 같은종목인가() 가 늘 false 가 되고 링크가 거의 안 걸린다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/index-audit.mjs'), 'utf8');
  assert.match(src, /categories: Array\.isArray\(p\.categories\)/, '발행글전부가 카테고리를 안 담습니다');
});

// ── 잘려도 이어서 끝낼 수 있다 (2026-10-10) ───────────────
// 633편을 한 번에 쓰다가 워크플로 30분 제한에 걸려 547편에서 잘렸다.
// 다시 돌릴 때 처음부터 또 쓰면 영원히 안 끝난다.
console.log('\n[이어서 돌리기]');

check('이미 블록이 있는 글은 건너뛴다 (기본)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/internal-links.mjs'), 'utf8');
  assert.match(src, /if \(!다시 && 이미있나\(before\)\) \{/, '이미 쓴 글을 또 씁니다');
  assert.match(src, /includes\('--다시'\)/, '갈아 끼울 방법이 없습니다');
});

check('워크플로에 다시 맞추기 모드가 있다', () => {
  // 새 글을 발행하면 **기존 글 → 새 글** 방향 링크가 있어야 구글이 찾는다.
  // 기본 모드는 이미 블록이 있는 글을 건너뛰므로 그 방향이 안 생긴다.
  const yml = fs.readFileSync(path.join(ROOT, '../.github/workflows/sports-news.yml'), 'utf8');
  assert.match(yml, /글끼리 링크 다시 맞추기/, '다시 맞추기 모드가 없습니다');
  assert.match(yml, /how='--apply --다시'/, '--다시 로 이어지지 않습니다');
  // 그 모드도 AI 실행 단계에서는 빠져야 한다 (0원이어야 한다).
  assert.match(yml, /!contains\(inputs\.mode, '글끼리 링크'\)/);
});

check('남은 편수를 알려준다', () => {
  // 몇 편이 남았는지 모르면 다 됐는지 알 수 없다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/internal-links.mjs'), 'utf8');
  assert.match(src, /남은것/, '남은 편수를 세지 않습니다');
  assert.match(src, /한 번 더 돌리면/, '어떻게 끝내는지 알려주지 않습니다');
});

check('바뀔 것이 없는 글을 "남은 것"으로 세지 않는다', () => {
  // 실측 사고 (2026-10-10): 634편을 다시 맞췄더니 21편이 저장되고 613편은
  // 목록이 그대로여서 건너뛰었다. **작업은 끝났는데** 화면에는
  // "613편이 남았습니다 — 30분 제한에 걸렸거나 실패한 글입니다" 가 찍혔다.
  // 그 문구를 보고 다시 돌리면 영원히 끝나지 않는다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/internal-links.mjs'), 'utf8');
  assert.match(src, /그대로 \+= 1;/, '그대로인 글을 세지 않습니다');
  assert.match(src, /할일\.length - 성공 - 이미 - 그대로/, '남은 것 계산에서 빠지지 않습니다');
  assert.match(src, /남은 글은 없습니다/, '다 끝났다는 것을 알려주지 않습니다');
});

check('색인 제외 깃발을 글마다 따로 부르지 않는다', () => {
  // 633번의 공짜 호출이 30분 제한의 원인이었다. 목록 응답에 meta 가 있다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/internal-links.mjs'), 'utf8');
  const at = src.indexOf('async function main()');
  const 몸 = src.slice(at);
  assert.ok(!/_fields: 'meta'/.test(몸), '글마다 meta 를 따로 부릅니다');
  assert.match(몸, /p\.색인제외 = p\.구글제외 === true/, '목록의 깃발을 안 씁니다');
  const audit = fs.readFileSync(path.join(ROOT, 'src/wordpress/index-audit.mjs'), 'utf8');
  assert.match(audit, /구글제외: p\.meta\?\.maumjaro_google_noindex === '1'/,
    '발행글전부가 깃발을 안 담습니다');
});

// ── 새 글은 쓰면서 바로 링크를 받는다 (2026-10-10) ────────
// 손으로 거는 것을 잊어서 633편이 고아 페이지로 쌓였다. 그래서 작성
// 파이프라인 안에서 건다. 그 연결이 끊어지면 같은 일이 또 쌓인다.
console.log('\n[새 글 자동 링크]');

check('작성 파이프라인이 저장 직후에 링크를 건다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main.mjs'), 'utf8');
  assert.match(src, /import \{ 새글에붙이기 \}/, 'main.mjs 가 링크 도구를 안 씁니다');
  assert.match(src, /새글에붙이기\(saved\.id/, '저장한 글에 링크를 걸지 않습니다');
});

check('링크가 실패해도 글을 잃지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main.mjs'), 'utf8');
  const at = src.indexOf('새글에붙이기(saved.id');
  assert.ok(at > 0);
  const 앞 = src.slice(Math.max(0, at - 400), at);
  assert.match(앞, /try \{/, '링크 호출이 try 밖에 있습니다 — 실패하면 실행이 끊깁니다');
  // 저장이 먼저여야 한다. 링크가 먼저면 실패했을 때 글이 사라진다.
  assert.ok(src.indexOf('await saveDraft(') < at, '저장보다 링크가 먼저입니다');
});

check('끄는 손잡이가 있다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/main.mjs'), 'utf8');
  assert.match(src, /env\('INTERNAL_LINKS', 'on'\) !== 'off'/);
});

check('새 글도 같은 안전 확인을 거친다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/internal-links.mjs'), 'utf8');
  const at = src.indexOf('export async function 새글에붙이기');
  assert.ok(at > 0, '새글에붙이기 가 없습니다');
  const 몸 = src.slice(at, src.indexOf('\n}\n', at));
  assert.match(몸, /블록만바뀌었나\(before, after\)/, '본문이 함께 바뀌는지 확인하지 않습니다');
  assert.match(몸, /손대도되는글인가/, '다른 사이트 글을 거르지 않습니다');
  assert.match(몸, /색인제외/, '색인에서 뺀 글로 링크를 보냅니다');
  // 633편 전부의 meta 를 부르면 한 편 저장이 몇 분 걸린다. 좁혀서 부른다.
  assert.match(몸, /넓게/, '후보를 좁히지 않고 전부 조회합니다');
});

check('들어오는 링크는 발행 뒤에 거는 것임을 밝힌다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/internal-links.mjs'), 'utf8');
  // 임시글로 보내는 링크는 독자에게 빈 주소다. 그 이유가 코드에 남아 있어야 한다.
  assert.match(src, /들어오는 링크[\s\S]{0,200}임시글/);
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
