// 이미 만든 글을 워드프레스에 올리는 경로 검사.
//
// AI를 부르지 않는 경로이므로 모의 Claude 서버가 필요 없다.
// 파일을 거꾸로 읽어 제목·본문·태그·SEO 값을 제대로 뽑는지,
// 그리고 draft로 저장되는지 확인한다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startMockWordPress } from './mock-wordpress.mjs';
import { parseDraftFile, publishFromFile } from '../src/wordpress/from-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};
const checkAsync = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[기존 글 올리기]');

const SAMPLE = `# 2027 KBO 신인 드래프트 (하현승 1순위 키움행!)

## 📋 워드프레스에 넣을 값

**카테고리**: 야구
**태그**: KBO 신인 드래프트, 하현승, 키움 히어로즈, 야구, KBO
**슬러그**: kbo-신인-드래프트

### Rank Math 칸에 붙여넣기

**SEO 제목**
\`\`\`
2027 KBO 신인 드래프트 결과 정리
\`\`\`

**설명**
\`\`\`
2027 KBO 신인 드래프트에서 하현승이 전체 1순위로 지명됐습니다.
\`\`\`

**대표 키워드**
\`\`\`
KBO 신인 드래프트
\`\`\`

### 처리 기록

- 종목: KBO
- 중복 판정: A — 비슷한 기존 글을 찾지 못했습니다.

---

## ✍️ 본문

안녕하세요, 스포츠 팬 여러분!

${'2027 KBO 신인 드래프트 이야기입니다. '.repeat(20)}

## ✨ 드래프트 개요

**일시**: 2026년 9월 21일

${'내용입니다. '.repeat(30)}

## 🌟 주목할 선수

${'내용입니다. '.repeat(30)}

## 🎯 분석

${'내용입니다. '.repeat(30)}

## 👀 관전 포인트

✅ 계약금 규모
✅ 보직 결정

## 🔥 누가 웃을까?

지켜봐 주시기 바랍니다.`;

const parsed = parseDraftFile(SAMPLE);

check('제목을 읽는다', () => assert.ok(parsed.title.includes('하현승'), parsed.title));
check('카테고리를 읽는다', () => assert.equal(parsed.category, '야구'));
check('태그를 읽는다', () => {
  assert.ok(parsed.tags.includes('하현승'), parsed.tags.join(','));
  assert.ok(parsed.tags.length >= 4);
});
check('슬러그를 읽는다', () => assert.equal(parsed.slug, 'kbo-신인-드래프트'));
check('코드 블록의 SEO 값을 읽는다', () => {
  assert.ok(parsed.seoTitle.includes('2027 KBO'), parsed.seoTitle);
  assert.ok(parsed.metaDescription.includes('하현승'), parsed.metaDescription);
  assert.equal(parsed.focusKeyword, 'KBO 신인 드래프트');
});
check('본문만 뽑아낸다 (머리말 제외)', () => {
  assert.ok(parsed.body.startsWith('안녕하세요'), parsed.body.slice(0, 40));
  assert.ok(!parsed.body.includes('워드프레스에 넣을 값'), '머리말이 본문에 섞였습니다');
  assert.ok(parsed.body.includes('## ✨ 드래프트 개요'));
});

const wp = await startMockWordPress({ rankMathWritable: false });
const tmp = path.join(os.tmpdir(), `draft-${Date.now()}.md`);
fs.writeFileSync(tmp, SAMPLE);

const prevEnv = { ...process.env };
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'aaaa bbbb cccc dddd';

await checkAsync('워드프레스에 draft로 저장된다', async () => {
  const saved = await publishFromFile(tmp, { withImages: true });
  assert.equal(saved.status, 'draft');
  assert.equal(wp.state.created.length, 1);
});

const post = wp.state.created[0] || {};
check('카테고리가 야구(id=12)로 간다', () => assert.deepEqual(post.categories, [12]));
check('태그가 붙는다', () => assert.ok((post.tags || []).length >= 4));
check('본문이 블록으로 변환된다', () => {
  assert.ok(post.content.includes('<!-- wp:heading -->'));
  assert.ok(post.content.includes('<!-- wp:list -->'));
});
check('쿠팡 광고가 들어간다', () => {
  assert.ok(post.content.includes('ads-partners.coupang.com'), '광고 블록이 없습니다');
  assert.ok(post.content.includes('쿠팡 파트너스 활동의 일환'), '고지 문구가 없습니다');
});
check('이미지가 맘운자로로 링크된다', () => {
  assert.ok(post.content.includes('maumjaro.minimalbreeze.com'), '이미지 링크가 없습니다');
});
check('대표 이미지가 지정된다', () => assert.ok(post.featured_media > 0, String(post.featured_media)));
check('이미지가 실제로 업로드된다', () => {
  assert.ok(wp.state.media.length >= 1, `업로드 ${wp.state.media.length}건`);
  assert.ok(wp.state.media[0].bytes > 1000, `${wp.state.media[0].bytes}바이트 — 빈 파일입니다`);
});
check('파일 이름이 헤더에 담을 수 있는 문자만 쓴다', () => {
  for (const m of wp.state.media) {
    assert.ok(/^[\x20-\x7E]+$/.test(m.fileName), `ASCII가 아닙니다: ${m.fileName}`);
    assert.ok(m.fileName.endsWith('.png'), m.fileName);
  }
});
check('이미지 alt에 키워드가 들어간다', () => {
  const alts = wp.state.mediaMeta.map((m) => m.alt_text || '');
  assert.ok(alts.some((a) => a.includes('KBO')), alts.join(' / '));
});
check('슬러그가 실린다', () => assert.equal(post.slug, 'kbo-신인-드래프트'));
check('publish로 저장되지 않는다', () => assert.notEqual(post.status, 'publish'));

fs.rmSync(tmp, { force: true });
wp.server.close();
Object.assign(process.env, prevEnv);

// ── 앱 배너가 빠지지 않는다 (2026-10-10) ──────────────────
// 페이드캠 글(8521)을 이 도구로 올렸는데 **다운로드 링크가 안 들어갔다.**
// main.mjs 는 앱 배너를 넣는데 from-file.mjs 만 빠져 있었다. 앱을 소개하는
// 글에 받는 곳이 없으면 글의 목적이 사라진다.
console.log('\n[앱 배너]');

check('from-file 이 앱·공식 배너를 넣는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/from-file.mjs'), 'utf8');
  assert.match(src, /import \{ pickApp, appBannerHtml \}/, '앱 배너 도구를 안 씁니다');
  assert.match(src, /import \{ pickOfficial, officialBannerHtml \}/, '공식 배너 도구를 안 씁니다');
  assert.match(src, /withApp: Boolean\(appHtml\)/, '배너 자리를 잡지 않습니다');
  assert.match(src, /^\s*appHtml,$/m, 'saveDraft 에 배너를 안 넘깁니다');
});

check('앱이 먼저다 (main.mjs 와 같은 순서)', () => {
  // 운영자가 만든 앱 글에 구단 링크를 걸 일은 없다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/from-file.mjs'), 'utf8');
  assert.match(src, /const official = app \? null : pickOfficial\(글전체\)/);
});

check('제목과 본문을 함께 보고 고른다', () => {
  // 앱 이름이 제목에만 있는 글이 있다. 본문만 보면 놓친다.
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/from-file.mjs'), 'utf8');
  assert.match(src, /const 글전체 = `\$\{parsed\.title\}/);
});

check('페이드캠 글이 실제로 배너를 받는다', async () => {
  const { pickApp, appBannerHtml } = await import('../src/seo/app-banner.mjs');
  const 글 = '중고거래 사진 정리, 당근 거래가 끝난 사진은 왜 안 지워질까 (페이드캠 7일 자동 삭제)';
  const app = pickApp(글);
  assert.ok(app, '페이드캠을 못 찾습니다');
  assert.equal(app.이름, '페이드캠');
  const html = appBannerHtml(app);
  assert.ok(html.includes('id6818920687'), '앱 주소가 배너에 없습니다');
  assert.ok(!/target=/.test(html), '새 창으로 엽니다 (리포 규칙 위반)');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
