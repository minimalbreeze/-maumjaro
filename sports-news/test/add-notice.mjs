// 작년 글 맨 위에 "올해 글로 가는 안내 한 줄" 넣는 경로 검사.
//
// 가장 중요한 검사: **안내 말고는 본문이 바뀌지 않는다.** 이미 색인이 붙어
// 노출을 받고 있는 글을 건드리는 일이라, 본문이 틀어지면 순위째로 잃는다.
//
// 두 번째로 중요한 검사: **두 번 돌려도 안내가 둘이 되지 않는다.** 미리보기와
// 적용을 번갈아 돌리는 흐름이라 같은 글에 여러 번 닿는다.

import assert from 'node:assert/strict';
import {
  noticeHtml, findNotice, withoutNotice, applyNotice, noticeOnlyChange, NOTICE_MARK,
} from '../src/wordpress/add-notice.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[작년 글에 올해 글 안내 넣기]');

const 본문 = `<!-- wp:paragraph --><p>2025 서울세계불꽃축제는 9월 27일 열렸습니다.</p><!-- /wp:paragraph -->

<!-- wp:heading --><h2>관람 장소</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>여의도 한강공원 일대입니다.</p><!-- /wp:paragraph -->`;

const 안내 = noticeHtml({ text: '2026 서울세계불꽃축제 다시보기는 여기로', url: 'https://wiki.minimalbreeze.com/2026-서울세계불꽃축제' });

// ── 블록 만들기 ────────────────────────────────────────────
check('문구와 주소가 있으면 블록을 만든다', () => {
  assert.ok(안내.includes(NOTICE_MARK), '표식이 없습니다');
  assert.ok(안내.includes('2026 서울세계불꽃축제 다시보기는 여기로'), '문구가 없습니다');
  assert.ok(안내.includes('wp:paragraph'), '워드프레스 블록 주석이 없습니다');
});

check('링크는 현재 창에서 연다', () => {
  assert.ok(!안내.includes('target='), 'target 이 들어갔습니다');
  assert.ok(!안내.includes('noopener'), 'target 없이 noopener 를 붙였습니다');
  // 내 블로그 안으로 가는 링크라 nofollow 를 붙이지 않는다.
  assert.ok(!안내.includes('nofollow'), '내부 링크에 nofollow 가 붙었습니다');
});

check('문구나 주소가 비면 블록을 만들지 않는다', () => {
  assert.equal(noticeHtml({ text: '', url: 'https://example.com' }), '');
  assert.equal(noticeHtml({ text: '올해 글', url: '' }), '');
  assert.equal(noticeHtml({ text: '올해 글', url: '   ' }), '');
});

check('http(s) 가 아닌 주소는 거절한다', () => {
  // 코드가 주소를 만들어내지 않는다. 운영자가 적은 주소만 쓴다.
  assert.equal(noticeHtml({ text: '올해 글', url: 'javascript:alert(1)' }), '');
  assert.equal(noticeHtml({ text: '올해 글', url: '/2026-글' }), '');
});

check('문구에 든 꺾쇠·따옴표는 HTML 로 새지 않는다', () => {
  const h = noticeHtml({ text: '<script>x</script>', url: 'https://wiki.minimalbreeze.com/a' });
  assert.ok(!h.includes('<script>'), '스크립트 태그가 그대로 들어갔습니다');
  assert.ok(h.includes('&lt;script&gt;'), '이스케이프가 안 됐습니다');
});

// ── 넣기 ───────────────────────────────────────────────────
check('본문 맨 위에 넣는다', () => {
  const { html, 한일 } = applyNotice(본문, 안내);
  assert.equal(한일, '넣음');
  assert.ok(html.startsWith(`<!-- ${NOTICE_MARK} -->`), '맨 위가 아닙니다');
  assert.ok(html.includes('2025 서울세계불꽃축제는 9월 27일'), '원래 본문이 사라졌습니다');
});

check('안내 말고는 본문이 그대로다', () => {
  const { html } = applyNotice(본문, 안내);
  assert.ok(noticeOnlyChange(본문, html), '안내 밖이 바뀌었습니다');
  assert.equal(withoutNotice(html).trim(), 본문.trim());
});

check('두 번 넣어도 안내는 하나다', () => {
  const 한번 = applyNotice(본문, 안내).html;
  const { html: 두번, 한일 } = applyNotice(한번, 안내);
  assert.equal(한일, '갈아끼움');
  assert.equal(두번, 한번, '같은 안내인데 본문이 바뀌었습니다');
  assert.equal(두번.split(`<!-- ${NOTICE_MARK} -->`).length - 1, 1, '안내가 둘이 됐습니다');
});

check('문구를 고치면 그 자리를 갈아낀다', () => {
  const 한번 = applyNotice(본문, 안내).html;
  const 새안내 = noticeHtml({ text: '2026 풀영상 다시보기', url: 'https://wiki.minimalbreeze.com/2026-b' });
  const { html, 한일 } = applyNotice(한번, 새안내);
  assert.equal(한일, '갈아끼움');
  assert.equal(html.split(`<!-- ${NOTICE_MARK} -->`).length - 1, 1, '안내가 둘이 됐습니다');
  assert.ok(html.includes('2026 풀영상 다시보기'), '새 문구가 없습니다');
  assert.ok(!html.includes('다시보기는 여기로'), '옛 문구가 남았습니다');
  assert.ok(noticeOnlyChange(한번, html), '안내 밖이 바뀌었습니다');
});

check('안내를 찾아낸다 / 없으면 null', () => {
  assert.equal(findNotice(본문), null);
  const f = findNotice(applyNotice(본문, 안내).html);
  assert.ok(f, '넣은 안내를 못 찾았습니다');
  assert.ok(f.url.includes('2026'), `주소를 잘못 읽었습니다: ${f.url}`);
});

// ── 마지막 방어선 ──────────────────────────────────────────
check('본문이 함께 바뀌면 안내만 바뀐 것으로 보지 않는다', () => {
  const 망가진것 = applyNotice(본문.replace('여의도 한강공원 일대입니다.', '엉뚱한 문장.'), 안내).html;
  assert.ok(!noticeOnlyChange(본문, 망가진것), '본문이 바뀐 것을 못 걸렀습니다');
});

console.log(`\n  ${passed}개 통과`);
