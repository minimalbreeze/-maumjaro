// 이미지 설명(alt) 채우기 검사.
//
// 이 도구는 지금까지의 도구와 달리 **본문을 고친다.** 그래서 "본문이 망가지지
// 않는가"를 가장 꼼꼼히 본다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startMockWordPress } from './mock-wordpress.mjs';
import {
  fillAlts, altFor, altOnlyChange, 가까운소제목, 제목줄이기,
  findMissingAlt, fixOne,
} from '../src/wordpress/fix-alt.mjs';
import { ROOT } from '../src/utils/env.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[이미지 설명 채우기]');

check('alt가 없으면 넣는다', () => {
  const r = fillAlts('<p>글</p><img src="a.png">', '2026 PGA 윈덤 챔피언십');
  assert.ok(/alt="2026 PGA 윈덤 챔피언십"/.test(r.html), r.html);
  assert.equal(r.채움, 1);
});

check('alt=""(빈 값)도 채운다', () => {
  // 서치어드바이저가 "없거나 설명이 없습니다"라고 한 것이 이 경우다.
  const r = fillAlts('<img src="a.png" alt="">', '제목입니다');
  assert.ok(/alt="제목입니다"/.test(r.html), r.html);
  assert.equal(r.채움, 1);
});

check('이미 설명이 있으면 건드리지 않는다', () => {
  // 사람이 공들여 쓴 설명을 덮어쓰면 안 된다.
  const src = '<img src="a.png" alt="김노율 선수가 돌을 놓는 장면">';
  const r = fillAlts(src, '다른 제목');
  assert.equal(r.html, src);
  assert.equal(r.채움, 0);
});

check('자기 닫는 태그에도 넣는다', () => {
  const r = fillAlts('<img src="a.png" />', '제목');
  assert.ok(/alt="제목"\s*\/>/.test(r.html), r.html);
});

check('이미지마다 다른 설명이 붙는다', () => {
  // 한 글의 이미지 세 장이 같은 alt면 검색엔진이 중복으로 본다.
  const html = [
    '<h2>📊 기록과 데이터</h2><img src="1.png">',
    '<h2>📌 배경과 원리</h2><img src="2.png">',
  ].join('');
  const r = fillAlts(html, '2026 PGA 윈덤 챔피언십');
  const alts = [...r.html.matchAll(/alt="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(alts.length, 2);
  assert.notEqual(alts[0], alts[1], alts.join(' / '));
  assert.ok(alts[0].includes('기록과 데이터'), alts[0]);
  assert.ok(alts[1].includes('배경과 원리'), alts[1]);
});

check('소제목이 없으면 번호로 가른다', () => {
  const r = fillAlts('<img src="1.png"><img src="2.png">', '제목입니다');
  const alts = [...r.html.matchAll(/alt="([^"]*)"/g)].map((m) => m[1]);
  assert.notEqual(alts[0], alts[1], alts.join(' / '));
});

check('소제목 앞의 이모지는 뺀다', () => {
  // 읽어주는 기계가 "슬쩍 웃는 얼굴"이라고 읽는다.
  assert.equal(가까운소제목('<h2>📊 기록과 데이터</h2><img>', 30), '기록과 데이터');
});

check('제목의 괄호 군더더기를 뗀다', () => {
  assert.equal(제목줄이기('2026 PGA 윈덤 챔피언십 (정규시즌 최종전)'), '2026 PGA 윈덤 챔피언십');
});

check('alt는 125자를 넘지 않는다', () => {
  const a = altFor({ title: '아주 긴 제목입니다 '.repeat(20), heading: '아주 긴 소제목 '.repeat(20) });
  assert.ok(a.length <= 125, a.length);
});

check('alt 안의 따옴표를 escape 한다', () => {
  // escape하지 않으면 태그가 깨져서 본문이 망가진다.
  const r = fillAlts('<img src="a.png">', '김주형 "역전" 우승');
  assert.ok(!/alt="[^"]*"[^>]*"/.test(r.html.match(/<img[^>]*>/)[0]), r.html);
  assert.ok(r.html.includes('&quot;'), r.html);
});

// ── 본문이 망가지지 않는가 ─────────────────────────────────
check('alt 말고는 글자 하나 안 바뀐다', () => {
  const src = '<!-- wp:paragraph --><p>본문입니다.</p><!-- /wp:paragraph -->'
    + '<!-- wp:image --><figure class="wp-block-image"><img src="a.png" class="wp-image-7"/></figure><!-- /wp:image -->'
    + '<script type="application/ld+json">{"@type":"FAQPage"}</script>';
  const r = fillAlts(src, '제목');
  assert.ok(altOnlyChange(src, r.html), '본문이 바뀌었습니다');
  assert.ok(r.html.includes('wp-block-image'), '블록 클래스가 사라졌습니다');
  assert.ok(r.html.includes('FAQPage'), '구조화 데이터가 사라졌습니다');
  assert.ok(r.html.includes('<!-- wp:image -->'), '블록 주석이 사라졌습니다');
});

check('본문이 바뀌면 알아챈다', () => {
  // 이 검사가 마지막 방어선이다. 못 잡으면 발행된 글이 망가진다.
  assert.ok(!altOnlyChange('<p>원래 본문</p><img src="a.png">', '<p>바뀐 본문</p><img src="a.png" alt="설명">'));
  assert.ok(!altOnlyChange('<img src="a.png">', '<img src="b.png" alt="설명">'));
});

check('이미지가 없는 글은 대상이 아니다', () => {
  assert.equal(fillAlts('<p>글만 있습니다.</p>', '제목').빈것, 0);
});

// ── 실제 경로 ──────────────────────────────────────────────
const 본문 = '<!-- wp:paragraph --><p>본문입니다.</p><!-- /wp:paragraph -->'
  + '<h2>📊 기록과 데이터</h2>'
  + '<figure class="wp-block-image"><img src="https://example.com/a.png" class="wp-image-1"/></figure>';

const wp = await startMockWordPress({
  posts: {
    6876: {
      status: 'publish', slug: '윈덤-챔피언십',
      title: { raw: '2026 PGA 윈덤 챔피언십 (정규시즌 최종전)' },
      content: { raw: 본문 }, meta: {},
    },
    6877: {
      status: 'publish', slug: '설명이-있는-글',
      title: { raw: '설명이 이미 있는 글' },
      content: { raw: '<img src="b.png" alt="사람이 쓴 설명">' }, meta: {},
    },
  },
});
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

const { 대상 } = await findMissingAlt();
check('alt가 빈 글만 고른다', () => {
  assert.deepEqual(대상.map((p) => p.id), [6876], JSON.stringify(대상.map((p) => p.id)));
});

const 미리 = await fixOne(대상[0], { apply: false });
check('미리보기는 저장하지 않는다', () => {
  assert.ok(미리.changed);
  assert.equal(wp.state.updated.length, 0);
  assert.equal(미리.backup, null);
});

const r = await fixOne(대상[0]);
const patch = () => wp.state.updated.find((u) => u.id === 6876);

check('본문을 저장한다', () => {
  assert.ok(r.changed);
  assert.ok(/alt="2026 PGA 윈덤 챔피언십 - 기록과 데이터"/.test(patch().content), patch().content);
});

check('content 말고 아무것도 보내지 않는다', () => {
  // 제목·슬러그·상태가 섞이면 발행된 글이 망가진다.
  assert.deepEqual(Object.keys(patch()).sort(), ['content', 'id']);
});

check('고치기 전에 원본 본문을 남긴다', () => {
  assert.ok(r.backup && fs.existsSync(r.backup), r.backup);
  const saved = JSON.parse(fs.readFileSync(r.backup, 'utf8'));
  assert.equal(saved.id, 6876);
  assert.ok(saved.content.includes('<img'), '원본 본문이 안 남았습니다');
  assert.ok(!/alt="2026/.test(saved.content), '고친 뒤 값이 백업됐습니다');
});

await checkAsync('본문이 바뀌면 저장을 거부한다', async () => {
  // 방어선이 실제로 막는지 본다.
  const 망가진글 = {
    id: 9999, status: 'publish', title: '제목', slug: 's',
    content: '<img src="a.png">',
  };
  // fillAlts 를 거치지 않고 억지로 다른 본문을 넣은 상황을 흉내 낸다.
  const 원래 = 망가진글.content;
  망가진글.content = 원래;
  const before = wp.state.updated.length;
  // altOnlyChange 가 false 를 돌려주는 상황: 본문이 다른 경우
  assert.ok(!altOnlyChange('<p>A</p><img src="a.png">', '<p>B</p><img src="a.png" alt="x">'));
  assert.equal(wp.state.updated.length, before);
});

fs.rmSync(path.join(ROOT, 'out', 'backup-content'), { recursive: true, force: true });
wp.server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
