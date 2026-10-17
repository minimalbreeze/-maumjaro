// 소제목 하나와 그 아래 내용을 빼는 경로 검사.
//
// 가장 중요한 검사: **뺀 섹션 말고는 본문이 그대로다.**
// 발행된 글(8643)을 건드리는 일이라, 본문이 틀어지면 순위째로 잃는다.
//
// 두 번째: **자주 묻는 질문 구조화 데이터를 삼키지 않는다.**
// 빼야 할 섹션 바로 뒤에 wp:html 로 JSON-LD 가 붙어 있다. 같이 지우면
// 구글이 읽던 FAQ 가 사라진다.

import assert from 'node:assert/strict';
import {
  소제목자리, 섹션끝, dropSection, 섹션만빠졌나, 공백빼고, DEFAULT_HEADING,
} from '../src/wordpress/drop-section.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[소제목 섹션 빼기]');

// 실제 9228·8643 의 모양 그대로
const 본문 = `<!-- wp:paragraph -->
<p>44년은 한 세대가 바뀌는 시간입니다.</p>
<!-- /wp:paragraph -->
<!-- wp:heading -->
<h2>안 쓴 것 (의도적으로 뺐다)</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>- <strong>월드시리즈 일정·중계 채널</strong>: 기사에 없다.<br>- <strong>ALCS 전적</strong>: 기사에 없다.</p>
<!-- /wp:paragraph -->
<!-- wp:html -->
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "FAQPage" }
</script>
<!-- /wp:html -->`;

check('소제목 블록을 여는 주석째로 집는다', () => {
  const h = 소제목자리(본문, DEFAULT_HEADING);
  assert.ok(h, '못 찾았습니다');
  assert.ok(본문.slice(h.start).startsWith('<!-- wp:heading'), '여는 주석이 빠졌습니다');
  assert.ok(본문.slice(0, h.end).endsWith('<!-- /wp:heading -->'), '닫는 주석이 빠졌습니다');
  assert.equal(h.level, 2);
});

check('없는 소제목이면 null', () => {
  assert.equal(소제목자리(본문, '있지도 않은 말'), null);
  assert.equal(소제목자리('', DEFAULT_HEADING), null);
  assert.equal(소제목자리(null, DEFAULT_HEADING), null);
});

check('섹션은 다음 블록 앞에서 끝난다', () => {
  const h = 소제목자리(본문, DEFAULT_HEADING);
  const 끝 = 섹션끝(본문, h.end, h.level);
  const 뺀것 = 본문.slice(h.start, 끝);
  assert.ok(뺀것.includes('ALCS 전적'), '메모 문단이 안 들어왔습니다');
  assert.ok(!뺀것.includes('FAQPage'), '구조화 데이터까지 삼켰습니다');
});

check('구조화 데이터(JSON-LD)가 살아남는다', () => {
  const { html } = dropSection(본문);
  assert.ok(html.includes('FAQPage'), '자주 묻는 질문 구조화 데이터가 사라졌습니다');
  assert.ok(html.includes('<!-- wp:html -->'), 'wp:html 블록이 깨졌습니다');
});

check('메모가 사라진다', () => {
  const { html, 한일 } = dropSection(본문);
  assert.equal(한일, '뺌');
  assert.ok(!html.includes('안 쓴 것'), '소제목이 남았습니다');
  assert.ok(!html.includes('ALCS 전적'), '메모 문단이 남았습니다');
});

check('앞 문단은 글자 하나까지 그대로다', () => {
  const { html } = dropSection(본문);
  assert.ok(html.includes('<p>44년은 한 세대가 바뀌는 시간입니다.</p>'), '앞 문단이 바뀌었습니다');
  assert.ok(html.includes('<!-- /wp:paragraph -->'), '앞 문단 닫는 주석이 사라졌습니다');
});

check('뺀 섹션 말고는 본문이 그대로다', () => {
  const { html, 뺀것 } = dropSection(본문);
  assert.ok(섹션만빠졌나(본문, html, 뺀것), '본문이 함께 바뀌었습니다');
});

check('두 번 돌려도 더 빠지지 않는다', () => {
  const 한번 = dropSection(본문).html;
  const { html: 두번, 한일 } = dropSection(한번);
  assert.equal(한일, null, '두 번째에도 뺐습니다');
  assert.equal(두번, 한번, '두 번째에 본문이 바뀌었습니다');
});

check('소제목이 없는 글은 건드리지 않는다', () => {
  const 깨끗 = '<!-- wp:paragraph -->\n<p>본문뿐입니다.</p>\n<!-- /wp:paragraph -->';
  const { html, 한일, 이유 } = dropSection(깨끗);
  assert.equal(한일, null);
  assert.equal(html, 깨끗);
  assert.ok(이유.includes('없습니다'), `이유가 다릅니다: ${이유}`);
});

check('본문이 함께 바뀌면 걸러낸다', () => {
  const { html, 뺀것 } = dropSection(본문);
  const 망가진것 = html.replace('44년은', '엉뚱한 말이');
  assert.ok(!섹션만빠졌나(본문, 망가진것, 뺀것), '본문이 바뀐 것을 못 걸렀습니다');
});

check('공백빼고 는 줄바꿈 차이를 무시한다', () => {
  assert.equal(공백빼고('<p>가</p>\n\n<p>나</p>'), 공백빼고('<p>가</p>\n<p>나</p>'));
  assert.notEqual(공백빼고('<p>가</p>'), 공백빼고('<p>나</p>'));
});

// ── 소스에 박아 두는 검사 ──────────────────────────────────
check('content 말고 다른 필드를 보내지 않는다', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/wordpress/drop-section.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('body: { content: html }'), 'content 만 보내는 호출이 아닙니다');
  assert.ok(!/body:\s*\{[^}]*slug/.test(src), '슬러그를 보내고 있습니다');
  assert.ok(!/body:\s*\{[^}]*status/.test(src), '발행 상태를 보내고 있습니다');
  assert.ok(!/body:\s*\{[^}]*title/.test(src), '제목을 보내고 있습니다');
});

check('wiki 밖의 글을 거른다', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/wordpress/drop-section.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('손대도되는글인가(post?.link, wpConfig().base)'),
    '손대도되는글인가 를 (주소, 기준주소) 로 부르지 않습니다');
});

check('고치기 전에 원본을 남긴다', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/wordpress/drop-section.mjs', import.meta.url), 'utf8');
  assert.ok(/saveContentBackup\(/.test(src), '백업을 남기지 않습니다');
  const i = src.indexOf('saveContentBackup(');
  const j = src.indexOf("method: 'POST'", i);
  assert.ok(j > i, '백업보다 저장이 먼저입니다');
});

console.log(`\n  ${passed}개 통과`);
