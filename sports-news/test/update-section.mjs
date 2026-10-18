// 소제목 하나의 내용만 갈아끼우는 경로 검사.
//
// 왜 이 도구가 있나
//   선수 글을 경기마다 새로 쓰면 대회가 끝나는 순간 글도 끝난다. wiki 의
//   중계 유형 글 357편이 그렇게 죽어 있다. 그래서 선수당 글 하나를 두고
//   '최근 경기 결과' 섹션만 갈아끼운다.
//
// 가장 중요한 검사: **그 섹션 말고는 본문이 그대로다.**
// 이미 색인된 발행 글을 건드리는 일이라, 앞뒤가 틀어지면 순위째로 잃는다.
//
// 두 번째: **자주 묻는 질문 구조화 데이터를 삼키지 않는다.**
// drop-section 과 같은 경계 코드를 쓰므로 여기서도 확인해 둔다 — 한쪽만
// 고쳐 놓고 다른 쪽이 깨지는 일을 막는다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  블록으로, updateSection, 그섹션만바뀌었나, 내부메모말,
} from '../src/wordpress/update-section.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[소제목 내용 갈아끼우기]');

// 선수 글의 모양. 갈아끼울 섹션이 가운데 있고, 뒤에 FAQ JSON-LD 가 붙어 있다.
const 본문 = `<!-- wp:paragraph -->
<p>안세영은 2026시즌 61승 1패를 기록했습니다.</p>
<!-- /wp:paragraph -->
<!-- wp:heading -->
<h2>최근 경기 결과</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>덴마크 오픈 8강에서 야마구치 아카네를 눌렀습니다.</p>
<!-- /wp:paragraph -->
<!-- wp:heading -->
<h2>다음 경기 일정</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>프랑스 오픈이 다음 대회입니다.</p>
<!-- /wp:paragraph -->
<!-- wp:html -->
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "FAQPage" }
</script>
<!-- /wp:html -->`;

const 새내용 = `덴마크 오픈 결승에서 왕즈이를 2-0으로 눌러 우승했습니다. 시즌 성적은 62승 1패가 됐습니다.

- 8강: 야마구치 아카네 2-1 승
- 4강: 오쿠하라 노조미 2-0 승
- 결승: 왕즈이 2-0 승`;

check('문단과 목록을 블록으로 만든다', () => {
  const html = 블록으로(새내용);
  assert.match(html, /<!-- wp:paragraph -->/, '문단 블록이 없습니다');
  assert.match(html, /<!-- wp:list -->/, '목록 블록이 없습니다');
  assert.match(html, /<li>8강: 야마구치 아카네 2-1 승<\/li>/, '목록 항목이 어긋났습니다');
  assert.ok(!html.includes('<li>덴마크 오픈 결승'), '문단을 목록으로 만들었습니다');
});

check('그 섹션의 내용만 바뀐다', () => {
  const r = updateSection(본문, '최근 경기 결과', 새내용);
  assert.equal(r.한일, '갈아끼움', r.이유);
  assert.ok(r.html.includes('<h2>최근 경기 결과</h2>'), '소제목이 사라졌습니다');
  assert.ok(r.html.includes('왕즈이를 2-0으로'), '새 내용이 안 들어갔습니다');
  assert.ok(!r.html.includes('야마구치 아카네를 눌렀습니다'), '옛 내용이 남았습니다');
  // 앞뒤는 그대로
  assert.ok(r.html.includes('61승 1패를 기록했습니다'), '앞 문단이 바뀌었습니다');
  assert.ok(r.html.includes('<h2>다음 경기 일정</h2>'), '뒤 소제목이 사라졌습니다');
  assert.ok(r.html.includes('프랑스 오픈이 다음 대회입니다'), '뒤 문단이 바뀌었습니다');
});

check('자주 묻는 질문 구조화 데이터를 삼키지 않는다', () => {
  const r = updateSection(본문, '다음 경기 일정', '프랑스 오픈은 10월 28일에 시작합니다. 중계는 BWF 유튜브에서 봅니다.');
  assert.equal(r.한일, '갈아끼움', r.이유);
  assert.ok(r.html.includes('application/ld+json'), 'JSON-LD 가 사라졌습니다');
  assert.ok(r.html.includes('"@type": "FAQPage"'), 'FAQ 구조화 데이터가 깨졌습니다');
});

check('마지막 섹션도 갈아끼운다', () => {
  const 짧은글 = `<!-- wp:heading -->
<h2>최근 경기 결과</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>옛 결과입니다.</p>
<!-- /wp:paragraph -->`;
  const r = updateSection(짧은글, '최근 경기 결과', '새 결과입니다. 결승에서 이겼습니다. 시즌 62승 1패.');
  assert.equal(r.한일, '갈아끼움', r.이유);
  assert.ok(!r.html.includes('옛 결과입니다'), '옛 내용이 남았습니다');
  assert.ok(r.html.includes('새 결과입니다'), '새 내용이 없습니다');
});

check('앞뒤가 틀어지면 저장하지 않는다', () => {
  // 마지막 방어선. 이 검사가 통과해야 발행된 글을 건드릴 수 있다.
  const r = updateSection(본문, '최근 경기 결과', 새내용);
  assert.equal(그섹션만바뀌었나(본문, r.html, r.뺀것, r.새블록), true, '정상인데 막았습니다');
  // 앞 문단을 한 글자 지운 결과를 들이대면 거짓이어야 한다
  const 망친것 = r.html.replace('61승 1패', '61승');
  assert.equal(그섹션만바뀌었나(본문, 망친것, r.뺀것, r.새블록), false, '본문이 바뀐 것을 못 잡았습니다');
});

check('소제목이 없으면 아무것도 안 한다', () => {
  const r = updateSection(본문, '없는 소제목', 새내용);
  assert.equal(r.한일, null);
  assert.equal(r.html, 본문, '본문을 건드렸습니다');
});

check('빈 내용으로 섹션을 비우지 않는다', () => {
  // 지우는 일은 drop-section 이 한다. 실수로 빈 파일을 넘겼을 때를 막는다.
  for (const 빈것 of ['', '   ', '\n\n', '짧다']) {
    const r = updateSection(본문, '최근 경기 결과', 빈것);
    assert.equal(r.한일, null, `'${빈것}' 을 받아들였습니다`);
  }
});

check('초안 내부 메모가 섞이면 거부한다', () => {
  // 9228·8643 이 '안 쓴 것' 메모를 실은 채 올라갔다. 같은 일을 반복하지 않는다.
  for (const 말 of 내부메모말) {
    const r = updateSection(본문, '최근 경기 결과', `${말}\n\n덴마크 오픈 결승에서 왕즈이를 눌러 우승했습니다.`);
    assert.equal(r.한일, null, `'${말}' 이 섞인 내용을 받아들였습니다`);
  }
});

check('두 번 돌려도 같은 결과다', () => {
  const 한번 = updateSection(본문, '최근 경기 결과', 새내용).html;
  const 두번 = updateSection(한번, '최근 경기 결과', 새내용).html;
  assert.equal(두번, 한번, '두 번 돌리면 결과가 달라집니다');
});

check('본문만 보낸다 — 제목·주소·발행상태는 보내지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/update-section.mjs'), 'utf8');
  const 보내는곳 = /body:\s*\{([^}]*)\}/g;
  const 보내는것 = [...src.matchAll(보내는곳)].map((m) => m[1].trim());
  assert.deepEqual(보내는것, ['content: r.html'], `본문 말고 다른 것을 보냅니다: ${보내는것.join(' / ')}`);
  assert.match(src, /손대도되는글인가/, 'wiki 밖 글을 막지 않습니다');
  assert.match(src, /saveContentBackup/, '원본을 백업하지 않습니다');
});

check('경계 코드를 drop-section 에서 가져다 쓴다', () => {
  // 두 벌로 만들면 한쪽만 고쳐 놓고 다른 쪽이 깨진다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/update-section.mjs'), 'utf8');
  assert.match(src, /from '\.\/drop-section\.mjs'/, 'drop-section 의 경계 코드를 쓰지 않습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
