// 사이트맵 점검 도구 검사.
//
// 이 도구의 숫자가 "어느 주소를 서치콘솔에 제출할지"를 정한다. 0개를 1개로
// 잘못 세면 빈 사이트맵을 그대로 두게 되고, 그러면 구글은 글을 계속 못 찾는다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loc뽑기, 사이트맵종류, robots사이트맵, 볼사이트 } from '../src/wordpress/sitemap-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[사이트맵 점검]');

const 주소목록 = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://wiki.minimalbreeze.com/가/</loc><lastmod>2026-10-20</lastmod></url>
<url>
  <loc>
    https://wiki.minimalbreeze.com/나/
  </loc>
</url>
</urlset>`;

const 색인 = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://wiki.minimalbreeze.com/post-sitemap.xml</loc></sitemap>
</sitemapindex>`;

check('주소를 뽑는다 — 줄바꿈·공백이 끼어도', () => {
  const r = loc뽑기(주소목록);
  assert.deepEqual(r, ['https://wiki.minimalbreeze.com/가/', 'https://wiki.minimalbreeze.com/나/']);
});

check('색인과 주소목록을 가른다', () => {
  assert.equal(사이트맵종류(색인), '색인');
  assert.equal(사이트맵종류(주소목록), '주소목록');
  assert.equal(사이트맵종류('<html><body>404</body></html>'), '모름');
});

check('빈 사이트맵을 0개로 센다 — 이번 일의 핵심', () => {
  // 서치콘솔이 "색인 처리 완료" 라고 적어도 URL 이 0개면 0개다.
  const 빈것 = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
  assert.equal(loc뽑기(빈것).length, 0);
  assert.equal(사이트맵종류(빈것), '주소목록');
});

check('HTML 페이지를 사이트맵으로 세지 않는다', () => {
  // /sitemap.xml 이 404 HTML 을 돌려주는 경우가 흔하다.
  const html = '<html><head><title>없음</title></head><body><a href="/loc">loc</a></body></html>';
  assert.equal(loc뽑기(html).length, 0);
  assert.equal(사이트맵종류(html), '모름');
});

check('robots.txt 의 Sitemap 줄을 읽는다', () => {
  const txt = `User-agent: *\nDisallow: /wp-admin/\n\nSitemap: https://wiki.minimalbreeze.com/sitemap_index.xml\nsitemap: https://wiki.minimalbreeze.com/wp-sitemap.xml\n`;
  assert.deepEqual(robots사이트맵(txt), [
    'https://wiki.minimalbreeze.com/sitemap_index.xml',
    'https://wiki.minimalbreeze.com/wp-sitemap.xml',
  ]);
  assert.deepEqual(robots사이트맵('User-agent: *\nDisallow:\n'), []);
});

check('빈 값에 터지지 않는다', () => {
  for (const v of [undefined, null, '']) {
    assert.deepEqual(loc뽑기(v), []);
    assert.equal(사이트맵종류(v), '모름');
    assert.deepEqual(robots사이트맵(v), []);
  }
});

check('--base 로 다른 사이트도 볼 수 있다 — 읽기만 하는 길이다', () => {
  // 2026-10-20: 서치콘솔 URL 검사가 "속성에 URL이 없음" 이라고 했다.
  // 보던 숫자가 wiki 것이 아닐 수 있어서, 다른 주소도 받아 볼 수 있어야 한다.
  assert.equal(볼사이트(['--base=https://minimalbreeze.com/'], 'https://wiki.minimalbreeze.com'),
    'https://minimalbreeze.com');
  // 안 주면 기본(WORDPRESS_URL)을 본다.
  assert.equal(볼사이트([], 'https://wiki.minimalbreeze.com/'), 'https://wiki.minimalbreeze.com');
  // 경로·쿼리는 떼고 origin 만 쓴다.
  assert.equal(볼사이트(['--base=https://a.example.com/path?x=1'], 'https://b.example.com'),
    'https://a.example.com');
  // 주소가 아니면 조용히 넘어가지 않는다.
  assert.throws(() => 볼사이트(['--base=아무말'], 'https://wiki.minimalbreeze.com'));
  assert.throws(() => 볼사이트([], ''));
});

check('고치는 길이 이 파일에 없다 — 읽기만 한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/wordpress/sitemap-check.mjs'), 'utf8');
  const 코드만 = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/method:\s*['"]POST['"]/.test(코드만), 'POST 를 보냅니다');
  assert.ok(!/--apply/.test(코드만), '적용 길이 있습니다');
  // 서치콘솔에 제출하는 일은 사람이 한다.
  assert.match(src, /제출하세요|사람이 한다/, '사람이 할 일을 적지 않았습니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
