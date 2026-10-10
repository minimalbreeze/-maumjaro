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
