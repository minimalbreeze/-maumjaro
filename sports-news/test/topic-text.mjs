// 배너를 고를 때 보는 글에서 "다른 글 제목"을 걷어내는지 검사.
//
// 2026-10-19: 공식 배너를 655편에 돌려 보니 바둑 글(119)에 당구 PBA 공식
// 홈페이지가 붙으려 했다. 본문 끝 "🔗 같이 읽을 글" 목록에 PBA 글 제목이
// 들어 있었기 때문이다. 다른 글 제목이 이 글의 배너를 결정하던 셈이다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { 주제만, 고르기용글, 걷어낼표식 } from '../src/seo/topic-text.mjs';
import { pickOfficial } from '../src/seo/official-banner.mjs';
import { pickWatchLinks } from '../src/seo/watch-banner.mjs';

const 검사 = [];
const check = (이름, fn) => 검사.push([이름, fn]);

check('같이 읽을 글부터 끝까지 걷어낸다', () => {
  const 글 = '<p>신진서 바둑</p><h2>🔗 같이 읽을 글</h2><p>PBA-LPBA 챔피언십 다시보기</p>';
  const r = 주제만(글);
  assert.ok(r.includes('신진서'), '본문이 사라졌습니다');
  assert.ok(!r.includes('PBA'), '다른 글 제목이 남았습니다');
});

check('실제 사고를 재현하고 막는다 — 바둑 글에 PBA 가 붙지 않는다', () => {
  const 제목 = '2025년 제1회 북해신역배 세계바둑오픈 4강: 시청 바로가기(신진서)';
  const 본문 = [
    '<p>신진서 선수가 4강에 올랐습니다. 바둑 중계를 어디서 보는지 정리했습니다.</p>',
    '<h2>🔗 같이 읽을 글</h2>',
    '<p>2025 PBA-LPBA 챔피언십 중계 다시보기</p>',
    '<p>웰컴저축은행 PBA 팀리그 5라운드</p>',
    '<p>하림 PBA-LPBA 챔피언십 개막</p>',
  ].join('');
  // 고치기 전: 본문 전체를 넘기면 PBA 가 여러 번 나와 당구로 간다.
  const 고치기전 = pickOfficial(`${제목}\n${본문}`);
  assert.match(String(고치기전?.이름 || ''), /PBA/, '재현이 안 됩니다 — 이 검사가 무의미해집니다');
  // 고친 뒤: 주제만 보면 PBA 가 없다.
  const 고친뒤 = pickOfficial(고르기용글(제목, 본문));
  assert.ok(!/PBA/.test(String(고친뒤?.이름 || '')), `여전히 당구로 갑니다: ${고친뒤?.이름}`);
});

check('이미 들어간 배너 글자를 세지 않는다', () => {
  const 본문 = [
    '<p>KLPGA 챔피언십 경기일정입니다.</p>',
    '<!-- wp:html -->',
    '<div>📺 경기 보러가기 <a href="https://www.youtube.com/@TV-ou4mv">PBA LIVE 에서 경기 보기 →</a> 프로당구 공식 중계 채널</div>',
    '<!-- /wp:html -->',
  ].join('');
  const r = 주제만(본문);
  assert.ok(r.includes('KLPGA'), '본문이 사라졌습니다');
  assert.ok(!r.includes('PBA LIVE'), '배너 글자가 남았습니다');
  assert.ok(!r.includes('프로당구'), '배너 힌트가 남았습니다');
});

check('쿠팡 광고 블록을 걷어낸다', () => {
  const 본문 = '<p>골프장 예약</p><!-- wp:html --><script src="https://ads-partners.coupang.com/g.js"></script><!-- /wp:html -->';
  assert.ok(!주제만(본문).includes('coupang'));
});

check('올해 글 안내 블록을 걷어낸다 — wp:paragraph 라 따로 잡는다', () => {
  const 본문 = '<p>본문</p>\n<!-- maumjaro:notice -->\n<!-- wp:paragraph -->\n<p>📅 <a href="https://x/y">2026 PBA 챔피언십 보러가기</a> ›</p>\n<!-- /wp:paragraph -->\n<!-- /maumjaro:notice -->';
  const r = 주제만(본문);
  assert.ok(r.includes('본문'));
  assert.ok(!r.includes('PBA'), '안내 문구가 남았습니다');
});

check('배너가 아닌 wp:html 블록은 건드리지 않는다', () => {
  // 자주 묻는 질문 구조화 데이터도 wp:html 이다. 통째로 지우면 주제 낱말을 잃는다.
  const 본문 = '<!-- wp:html --><script type="application/ld+json">{"name":"KLPGA 챔피언십 우승자는?"}</script><!-- /wp:html -->';
  assert.ok(주제만(본문).includes('KLPGA'), 'JSON-LD 가 지워졌습니다');
});

check('중계 배너 머리글을 설정에서 모두 모아 걷어낸다', () => {
  // 하나라도 빠지면 그 배너 글자가 다시 투표권을 갖는다.
  const 표식 = 걷어낼표식();
  assert.ok(표식.includes('📺 경기 보러가기'), '기본 머리글이 빠졌습니다');
  assert.ok(표식.includes('🏟️ 공식 홈페이지'));
  assert.ok(표식.includes('ads-partners.coupang.com'));
  assert.ok(표식.length >= 6, `표식이 너무 적습니다: ${표식.length}`);
});

check('빈 값·없는 값에도 던지지 않는다', () => {
  for (const v of [undefined, null, '', 0]) assert.equal(typeof 주제만(v), 'string');
  assert.equal(typeof 고르기용글(undefined, undefined), 'string');
});

check('중계 고르기도 같은 글을 쓴다', () => {
  // 골프는 투어가 여덟 개라 '같이 읽을 글'이 투어 선택을 흔들 수 있다.
  const 제목 = '2026 KLPGA 챔피언십 중계 경기일정';
  const 본문 = '<p>KLPGA 대회입니다.</p><h2>🔗 같이 읽을 글</h2><p>LPGA 투어 LPGA 투어 LPGA 투어 LPGA 투어</p>';
  const r = pickWatchLinks('골프', { text: 고르기용글(제목, 본문) });
  assert.ok(r, '배너가 안 붙었습니다');
  assert.match(r.primary.url, /KLPGA/i, `다른 투어로 갔습니다: ${r.primary.url}`);
});

check('두 배너 도구가 고르기용글을 쓴다 — 본문 전체를 넘기지 않는다', () => {
  for (const f of ['add-watch.mjs', 'add-banner.mjs']) {
    const src = fs.readFileSync(new URL(`../src/wordpress/${f}`, import.meta.url), 'utf8');
    assert.match(src, /고르기용글\(/, `${f} 가 고르기용글을 쓰지 않습니다`);
    assert.ok(!/\$\{title\}\\n\$\{content\}/.test(src),
      `${f} 가 아직 본문 전체를 넘깁니다`);
  }
});

check('주제만 결과를 저장에 쓰지 않는다', () => {
  // 블록을 중간에서 자르므로 HTML 로는 깨져 있다. 저장하면 글이 망가진다.
  for (const f of ['add-watch.mjs', 'add-banner.mjs']) {
    const src = fs.readFileSync(new URL(`../src/wordpress/${f}`, import.meta.url), 'utf8');
    assert.ok(!/body:\s*\{\s*content:\s*(주제만|고르기용글)/.test(src),
      `${f} 가 고르기용 글을 저장합니다`);
  }
});

export default async function run() {
  console.log('\n[배너 고르기용 본문]');
  let 실패 = 0;
  for (const [이름, fn] of 검사) {
    try { await fn(); console.log(`  ✅ ${이름}`); } catch (e) { 실패 += 1; console.log(`  ❌ ${이름}\n     ${e.message}`); }
  }
  if (실패) { console.log(`\n❌ ${실패}개 실패`); process.exitCode = 1; } else console.log(`\n✅ ${검사.length}개 항목 통과`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
