// 이미 만든 임시글의 대표 키워드를 고치는 경로 검사.
//
// 실제로 당한 일: SEO 단계가 본문에 한 번도 나오지 않는 긴 구절
// "피트 알론소 양대 리그 타점왕"을 대표 키워드로 골라 밀도가 0.00%가 됐다.
// 본문은 멀쩡한데 점수만 0이 된다. 본문을 다시 만들지 않고 키워드만 고친다.

import assert from 'node:assert/strict';
import { startMockWordPress } from './mock-wordpress.mjs';
import { htmlToText, keywordCandidates, fixPostSeo } from '../src/wordpress/fix-seo.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[임시글 SEO 손보기]');

check('블록 HTML에서 사람이 읽는 글만 남긴다', () => {
  const t = htmlToText('<!-- wp:paragraph --><p>피트 <strong>알론소</strong>가 기록을&nbsp;세웠다</p><!-- /wp:paragraph -->');
  assert.equal(t, '피트 알론소가 기록을 세웠다');
});

check('낱말 안에 끼인 태그가 낱말을 쪼개지 않는다', () => {
  // 실측 사고: 메타 설명이 "3할 타자 를 바라보는" 으로 나왔다. 글이 허술해 보인다.
  assert.equal(htmlToText('<p>요즘 <strong>3할 타자</strong>를 보는 눈</p>'), '요즘 3할 타자를 보는 눈');
  assert.equal(htmlToText('<p><a href="#">잠실 파크골프장</a>은 무료다</p>'), '잠실 파크골프장은 무료다');
  assert.equal(htmlToText('<p>기록<sup>1</sup>을 세웠다</p>'), '기록1을 세웠다');
});

check('문단·목록 사이는 공백으로 띄운다', () => {
  // 인라인이 아닌 태그는 여전히 띄워야 한다. 안 띄우면 문장이 붙어버린다.
  assert.equal(htmlToText('<p>첫 문단이다.</p><p>둘째 문단이다.</p>'), '첫 문단이다. 둘째 문단이다.');
  assert.equal(htmlToText('<ul><li>상금</li><li>일정</li></ul>'), '상금 일정');
  assert.equal(htmlToText('<h2>관전 포인트</h2><p>본문이다.</p>'), '관전 포인트 본문이다.');
});

check('구조화 데이터 스크립트를 본문으로 세지 않는다', () => {
  const t = htmlToText('<p>본문</p><script type="application/ld+json">{"@type":"FAQPage"}</script>');
  assert.ok(!t.includes('FAQPage'), t);
});

check('제목에서 키워드 후보를 뽑는다', () => {
  const c = keywordCandidates({
    title: "메츠 왜 버렸을까, '131-113' 기록 (피트 알론소, 양대 리그 타점왕 최초!)",
    currentKeyword: '피트 알론소 양대 리그 타점왕',
  });
  assert.ok(c.includes('피트 알론소'), c.join(' / '));
});

const 본문 = [
  '<!-- wp:paragraph --><p>',
  '피트 알론소가 또 하나의 기록을 세웠습니다. '.repeat(13),
  '메이저리그 정규시즌이 막을 내렸습니다. '.repeat(90),
  '</p><!-- /wp:paragraph -->',
].join('');

const wp = await startMockWordPress({
  posts: {
    7246: {
      status: 'draft',
      title: { raw: "메츠 왜 버렸을까 (피트 알론소, 양대 리그 타점왕 최초!)" },
      content: { raw: 본문 },
      meta: { rank_math_focus_keyword: '피트 알론소 양대 리그 타점왕' },
      slug: '피트-알론소-양대-리그-타점왕',
    },
    7248: {
      status: 'draft',
      title: { raw: '메츠 왜 버렸을까 (피트 알론소, 양대 리그 타점왕 최초!)' },
      content: { raw: 본문 },
      meta: { rank_math_focus_keyword: '피트 알론소 양대 리그 타점왕' },
      slug: '피트-알론소-양대-리그-타점왕',
    },
    7247: {
      status: 'draft',
      title: { raw: '삼성화재배 8강 (신진서 vs 커제)' },
      content: { raw: `<p>${'삼성화재배 8강 대진이 나왔습니다. '.repeat(8)}${'바둑 소식입니다. '.repeat(200)}</p>` },
      meta: { rank_math_focus_keyword: '삼성화재배 8강' },
      slug: '삼성화재배-8강',
    },
  },
});

process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

const fixed = await fixPostSeo(7246);

check('본문에 없는 키워드였다는 것을 알아낸다', () => {
  assert.equal(fixed.before.count, 0, JSON.stringify(fixed.before));
  assert.equal(fixed.before.density, 0);
});
check('본문에 실제로 있는 말로 바꾼다', () => {
  assert.equal(fixed.after.keyword, '피트 알론소', JSON.stringify(fixed.after));
  assert.ok(fixed.after.count > 0);
  assert.ok(fixed.changed);
});
check('워드프레스에 대표 키워드를 저장한다', () => {
  const patch = wp.state.updated.find((u) => u.id === 7246);
  assert.ok(patch, '저장 요청이 없습니다');
  assert.equal(patch.meta.rank_math_focus_keyword, '피트 알론소');
});
check('슬러그도 같이 맞춘다', () => {
  const patch = wp.state.updated.find((u) => u.id === 7246);
  assert.ok(decodeURIComponent(patch.slug).includes('피트-알론소'), patch.slug);
});
check('본문은 건드리지 않는다', () => {
  const patch = wp.state.updated.find((u) => u.id === 7246);
  assert.equal(patch.content, undefined, '본문을 덮어썼습니다');
  assert.equal(patch.title, undefined, '제목을 덮어썼습니다');
});
check('발행 상태를 바꾸지 않는다', () => {
  const patch = wp.state.updated.find((u) => u.id === 7246);
  assert.equal(patch.status, undefined, '상태를 건드렸습니다');
});

const already = await fixPostSeo(7247);
check('이미 권장 구간이면 그대로 둔다', () => {
  assert.equal(already.changed, false, JSON.stringify(already));
  assert.ok(already.before.density >= 1.25 && already.before.density <= 2.5, `${already.before.density}%`);
  assert.ok(!wp.state.updated.some((u) => u.id === 7247), '건드리지 말아야 합니다');
});

const preview = await fixPostSeo(7248, { apply: false });
check('미리보기는 고칠 내용을 알려주되 저장하지 않는다', () => {
  assert.ok(preview.changed, JSON.stringify(preview));
  assert.equal(preview.after.keyword, '피트 알론소');
  assert.ok(!wp.state.updated.some((u) => u.id === 7248), '미리보기가 저장했습니다');
});

wp.server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);

// ── 껍데기 붙은 키워드는 밀도와 무관하게 고친다 ─────────────
// 글 7276: 키워드가 "'2026 우리할매떡볶이 어린이" 인데 밀도 1.26%로 권장 구간
// 안이라 "이미 괜찮다"고 판단해 그대로 통과했다. 밀도를 셀 때는 구두점을
// 무시하고 세니 껍데기가 붙은 키워드는 영원히 멀쩡해 보인다.
{
  const 본문2 = '<p>' + '2026 우리할매떡볶이 어린이 바둑왕 결승. 김노율이 박준우를 꺾었다. '.repeat(3)
    + '바둑 이야기입니다. '.repeat(70) + '</p>';

  const wp2 = await startMockWordPress({
    posts: {
      7276: {
        status: 'draft', slug: '2026-우리할매떡볶이-어린이',
        title: { raw: "2026 우리할매떡볶이 어린이 바둑왕 우승 김노율, 박준우 꺾고 정상에" },
        content: { raw: 본문2 },
        meta: { rank_math_focus_keyword: "'2026 우리할매떡볶이 어린이" },
      },
    },
  });
  process.env.WORDPRESS_URL = `http://127.0.0.1:${wp2.port}`;

  const r2 = await fixPostSeo(7276, { apply: true });
  const patch2 = () => wp2.state.updated.find((u) => u.id === 7276);

  check('밀도가 권장 구간이어도 껍데기는 고친다', () => {
    assert.ok(r2.changed, `안 고쳤습니다: ${r2.reason || ''}`);
    assert.ok(!/^['"‘’“”]/.test(patch2().meta.rank_math_focus_keyword),
      JSON.stringify(patch2().meta.rank_math_focus_keyword));
  });

  check('고친 뒤에도 본문과 상태는 그대로다', () => {
    assert.ok(!('content' in patch2()), '본문을 보냈습니다');
    assert.ok(!('status' in patch2()), '상태를 보냈습니다');
  });

  wp2.server.close();
}
