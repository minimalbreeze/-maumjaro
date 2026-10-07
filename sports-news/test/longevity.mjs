// "오래 가는 섹션" 판정이 두 검사에서 같은지 본다.
//
// 2026-10-07 글 7793 에서 로그가 스스로 모순됐다.
//
//   ⚠️ 배경·원리·비교 섹션이 없습니다
//   ▶  오래 검색되는 섹션 보완 중
//   ✅ 보완 완료 — 본문 3668자          ← 고쳤다고 말하고
//   ❌ ⑤ 오래 가는 내용으로 확장했다     ← 안 고쳐졌다
//
// 두 검사가 각자 낱말 목록을 들고 있었다. 보완이 '## 📌 역대 우승자 계보'를
// 만들면 lintArticle 은 통과시키고 checkFlow 는 떨어뜨린다. 돈을 들여 보완을
// 돌리고도 고쳐졌는지 아무도 확인하지 못했다.
//
// 이 검사가 막는 것: **두 목록이 다시 갈라지는 것.**

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LONGEVITY_WORDS, LONGEVITY_HEADING, 오래가는소제목인가, 오래가는소제목찾기 } from '../src/seo/longevity.mjs';
import { checkFlow } from '../src/seo/flow.mjs';
import { lintArticle } from '../src/ai/write.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[오래 가는 섹션 — 두 검사가 같은 자를 쓰는가]');

const 글 = (소제목) => `머리말입니다. 통산 기록을 짚어 봅니다.

## 첫 소제목
내용 한 줄.

## ${소제목}
역대 우승자를 비교해 보면 규칙이 보입니다. 통산 성적 10승 20패.

## 자주 묻는 질문
**Q.** 언제인가요?
A. 2026년 10월입니다.

## 다음은
2026년 10월 7일 경기를 보면 됩니다. 다음 대회도 이어집니다.`;

const 수명문제있나 = (body) => lintArticle({ title: '제목', body })
  .issues.some((i) => /배경·원리·비교 섹션이 없습니다/.test(i));
const 확장통과하나 = (body) => checkFlow({ title: '제목', body })
  .items.find((i) => i.id === 'evergreen')?.ok === true;

// ── 핵심: 두 검사가 갈라지지 않는다 ────────────────────────
check('어떤 소제목에도 두 검사가 같은 답을 낸다', () => {
  // 7793 을 깨뜨린 '계보', 반대쪽에만 있던 '기록'·'데이터'를 모두 넣는다.
  const 소제목들 = [
    '📌 역대 우승자 계보',       // 7793 을 깨뜨린 낱말. 예전엔 lint 만 통과했다
    '📌 기록으로 보는 흐름',      // 예전엔 flow 만 통과했다 — 이제 둘 다 떨어뜨린다
    '📌 데이터로 본 추세',        // 위와 같다
    '📌 배경과 원리, 비슷한 사례 비교',
    '📌 대회 규칙과 역사',
    '📌 알고 보면 더 보이는 것들',
    '📌 오늘 경기 결과',
  ];
  for (const h of 소제목들) {
    const body = 글(h);
    const lint통과 = !수명문제있나(body);
    const flow통과 = 확장통과하나(body);
    assert.equal(lint통과, flow통과,
      `"${h}" — lintArticle ${lint통과 ? '통과' : '실패'} / checkFlow ${flow통과 ? '통과' : '실패'}`);
  }
});

check('지시서가 정한 낱말을 모두 받는다', () => {
  // sports-news/CLAUDE.md 의 흐름 표가 ⑤ 를 "규칙·원리·역사·비교"로 정한다.
  // 계보는 '역대 우승자 계보'처럼 내년에도 검색되므로 함께 둔다.
  for (const w of ['배경', '원리', '비교', '역사', '규칙', '계보']) {
    assert.ok(오래가는소제목인가(`📌 ${w} 이야기`), `${w} 가 빠졌습니다`);
  }
});

check('기록·데이터 나열은 오래 가는 섹션으로 쳐주지 않는다', () => {
  // flow.mjs 가 이 둘을 받아 주고 있었는데 지시서보다 느슨한 쪽이었다.
  // 홈런·타점만 적어 둔 '기록과 데이터' 섹션은 뉴스지 오래 가는 내용이 아니다.
  for (const h of ['📊 기록과 데이터', '📊 데이터로 본 추세']) {
    assert.equal(오래가는소제목인가(h), false, `"${h}" 가 통과했습니다`);
  }
});

check('뉴스성 소제목은 걸러낸다', () => {
  // 다 통과시키면 검사가 아무 일도 안 하는 것과 같다.
  for (const h of ['오늘 경기 결과', '알고 보면 더 보이는 것들', '선수 인터뷰', '마지막으로']) {
    assert.equal(오래가는소제목인가(h), false, `"${h}" 가 통과했습니다`);
  }
});

check('소제목 목록에서 찾아 돌려준다', () => {
  assert.equal(오래가는소제목찾기(['첫 소제목', '📌 역대 계보', '끝']), '📌 역대 계보');
  assert.equal(오래가는소제목찾기(['첫 소제목', '끝']), null);
  assert.equal(오래가는소제목찾기([]), null);
  assert.equal(오래가는소제목찾기(), null);
});

check('보완이 만드는 기본 소제목은 반드시 통과한다', () => {
  // 이게 깨지면 보완을 돌려도 영원히 ⑤ 를 못 넘는다.
  assert.ok(오래가는소제목인가(LONGEVITY_HEADING), `${LONGEVITY_HEADING} 이 목록에 안 걸립니다`);
  assert.ok(확장통과하나(글(LONGEVITY_HEADING.replace(/^##\s*/, ''))), 'checkFlow ⑤ 를 못 넘습니다');
  assert.ok(!수명문제있나(글(LONGEVITY_HEADING.replace(/^##\s*/, ''))), 'lintArticle 을 못 넘습니다');
});

// ── 목록이 한 군데에만 있는가 ──────────────────────────────
check('낱말 목록을 다른 파일이 따로 들고 있지 않다', () => {
  // 이게 이 버그의 원인이었다. 복사본이 생기면 또 갈라진다.
  for (const rel of ['src/ai/write.mjs', 'src/seo/flow.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!/\/배경\|원리\|비교/.test(src), `${rel} 가 낱말 목록을 따로 들고 있습니다`);
    assert.match(src, /longevity\.mjs/, `${rel} 가 공용 목록을 쓰지 않습니다`);
  }
});

check('보완 성공 판정이 최종 채점 기준도 본다', () => {
  // lintArticle 만 보고 "보완 완료"라고 찍은 것이 7793 의 사고였다.
  const src = fs.readFileSync(path.join(ROOT, 'src/main.mjs'), 'utf8');
  const 시작 = src.indexOf('오래 검색되는 섹션 보완 중');
  const 끝 = src.indexOf('result.article = article', 시작);
  assert.ok(시작 > 0 && 끝 > 시작, '보완 구간을 못 찾았습니다');
  const 본문 = src.slice(시작, 끝);
  assert.match(본문, /checkFlow\(/, '보완 뒤 최종 기준으로 확인하지 않습니다');
  assert.match(본문, /evergreen/, '⑤ 항목을 보지 않습니다');
  assert.match(본문, /여전히 통과하지 못했습니다/, '못 고쳤을 때 알려주지 않습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
