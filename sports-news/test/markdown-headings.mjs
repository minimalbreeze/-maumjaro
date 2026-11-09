// 마크다운 소제목 → 워드프레스 블록 검사.
import assert from 'node:assert/strict';
import { markdownToBlocks } from '../src/wordpress/draft.mjs';

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[마크다운 소제목 변환]');

// ⚠️ h2 는 `{"level":2}` 를 적지 않는다. 워드프레스 기본값이고, 배너·섹션
//    도구가 "배너 말고 바뀐 게 없는지" 를 글자 하나까지 비교하기 때문에
//    예전에 저장된 글과 모양이 달라지면 저장을 거부당한다.
check('h2 는 level 속성을 적지 않는다 — 예전 저장분과 같아야 한다', () => {
  assert.equal(
    markdownToBlocks('## 소제목'),
    '<!-- wp:heading -->\n<h2>소제목</h2>\n<!-- /wp:heading -->',
  );
});

check('h3 는 level 3 을 적는다', () => {
  assert.ok(markdownToBlocks('### 소제목').includes('<!-- wp:heading {"level":3} -->'));
  assert.ok(markdownToBlocks('### 소제목').includes('<h3>소제목</h3>'));
});

// ⚠️ 이 검사가 생긴 이유. 5762(KBO 허브)의 한국시리즈 블록에서 h3 하나
//    아래에 `###` 로 소제목을 더 적었더니 h3 넷이 **나란히** 생겼다.
//    update-section 은 같은 레벨 앞까지를 한 절로 보므로 첫 h3 를
//    갈아끼워도 나머지가 옛 내용으로 남는다. 경기가 끝난 뒤 소제목에
//    "KT 1승 3패" 가 그렇게 남아 있었다.
check('h4 가 글자로 새어 나가지 않는다 — 절 안의 소제목을 묶는 자리다', () => {
  const out = markdownToBlocks('#### 하위 소제목');
  assert.ok(out.includes('<h4>하위 소제목</h4>'), out);
  assert.ok(!out.includes('<p>####'), '문단으로 새어 나갔습니다');
});

check('h5·h6 도 받는다 — 하나만 더하면 그다음에서 또 샌다', () => {
  assert.ok(markdownToBlocks('##### 다섯').includes('<h5>다섯</h5>'));
  assert.ok(markdownToBlocks('###### 여섯').includes('<h6>여섯</h6>'));
});

check('h1 은 일부러 받지 않는다 — 글 제목이 h1 이다', () => {
  const out = markdownToBlocks('# 하나');
  assert.ok(!out.includes('<h1>'), 'h1 이 본문에 들어갔습니다');
  assert.ok(out.includes('<p># 하나</p>'), out);
});

check('# 다음에 공백이 없으면 소제목이 아니다 (해시태그)', () => {
  const out = markdownToBlocks('##해시태그아님');
  assert.ok(!out.includes('<h2>'), out);
});

check('소제목 안의 굵게·링크가 살아 있다', () => {
  const out = markdownToBlocks('## **굵은** 소제목');
  assert.ok(out.includes('<strong>굵은</strong>'), out);
});

check('소제목과 본문이 섞여도 순서를 지킨다', () => {
  const out = markdownToBlocks('## 둘\n\n본문 한 줄\n\n#### 넷');
  const 순서 = [out.indexOf('<h2>'), out.indexOf('<p>본문 한 줄</p>'), out.indexOf('<h4>')];
  assert.deepEqual([...순서].sort((a, b) => a - b), 순서, out);
  assert.ok(순서.every((i) => i >= 0), out);
});

console.log(`\n  ${passed}개 통과`);
