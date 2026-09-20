// 아티팩트(단일 HTML) 번들러
//
// 왜 필요한가
//   "맘운자로 테스트" 아티팩트는 claude.ai에 올라가는 한 장짜리 HTML이다.
//   이 앱은 index.html + CSS 1개 + JS 21개 + 타로 이미지 22장으로 되어 있어서,
//   그대로 올리면 로컬 파일을 못 찾아 아무것도 안 뜬다. 전부 한 파일로 말아넣는다.
//
//   예전에는 이 작업을 손으로 했다. 그래서 앱을 고쳐도 아티팩트는 옛날 것으로 남았고,
//   실제로 그렇게 어긋난 적이 있다(2026-09-20). 스크립트로 박아 재현 가능하게 만든다.
//
// 규칙
//   - index.html을 그대로 읽어서 변환만 한다. 내용을 여기에 베껴 쓰지 않는다.
//   - 아티팩트 환경이 허용하는 CDN(cdnjs, cdn.jsdelivr.net/npm)은 손대지 않는다.
//     lz-string·lunar-javascript·html2canvas가 전부 여기에 해당한다.
//   - 허용 목록 밖(GA4, Cloudflare beacon)은 어차피 차단되므로 아예 뺀다.
//   - 이미지는 원본을 그대로 base64로 넣는다. 압축 도구가 없는 환경에서도 돌아야 한다.
//     (약 7MB. 아티팩트 한도 16MB 안쪽이다)
//
// 실행: node scripts/build-artifact.mjs
// 결과: scripts/.artifact/maumjaro.html

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const read = (f) => readFile(join(ROOT, f), 'utf8');

async function main() {
  let html = await read('index.html');

  // ---------- 1. 아티팩트 래퍼가 주는 것들을 걷어낸다 ----------
  // 래퍼가 doctype/html/head/body와 charset·viewport를 이미 넣어준다.
  html = html
    .replace(/^<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*$/i, '')
    .replace(/<\/?head>\s*/gi, '')
    .replace(/<body[^>]*>\s*/i, '')
    .replace(/<\/body>\s*/i, '')
    .replace(/<meta charset=[^>]*>\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');

  // ---------- 2. 아티팩트에서 못 쓰는 것들을 뺀다 ----------
  // manifest·아이콘은 로컬 파일이라 404가 난다(동작에는 영향 없지만 콘솔이 지저분해진다).
  html = html.replace(/<link rel="(manifest|apple-touch-icon|icon)"[^>]*>\s*/gi, '');
  // GA4: googletagmanager는 아티팩트 CSP 허용 목록에 없다. 통째로 뺀다.
  html = html.replace(/<script>\s*\(function \(\) \{[\s\S]*?googletagmanager[\s\S]*?\}\)\(\);\s*<\/script>\s*/i, '');
  // Cloudflare beacon: 역시 차단된다.
  html = html.replace(/<script defer src="https:\/\/static\.cloudflareinsights\.com[^>]*><\/script>\s*/i, '');

  // ---------- 2-1. 아티팩트 이름 고정 ----------
  // 아티팩트 이름은 HTML의 <title>이 정한다(publish의 title 파라미터보다 우선한다).
  // index.html의 제목은 검색용이라 길다. 갤러리에서 찾기 쉽게 짧은 이름으로 바꾼다.
  html = html.replace(/<title>[\s\S]*?<\/title>/i, () => '<title>맘운자로 테스트</title>');

  // ---------- 3. CSS 인라인 ----------
  const css = await read('style.css');
  html = html.replace(
    /<link rel="stylesheet" href="style\.css[^"]*"\s*\/?>/i,
    `<style>\n${css}\n</style>`
  );

  // ---------- 4. 타로 이미지 22장을 data URI로 ----------
  // tarot-data.js의 img: 'tarot/xxx.jpg' 를 바꿔치기한다.
  let tarotJs = await read('tarot-data.js');
  const imgRefs = [...tarotJs.matchAll(/img:\s*'(tarot\/[^']+)'/g)];
  let inlined = 0;
  for (const [, path] of imgRefs) {
    const buf = await readFile(join(ROOT, path));
    const uri = `data:image/jpeg;base64,${buf.toString('base64')}`;
    // 치환 문자열을 그대로 넘기면 $1·$& 같은 패턴이 특수 취급된다. 함수로 넘겨 막는다.
    tarotJs = tarotJs.replace(`img: '${path}'`, () => `img: '${uri}'`);
    inlined++;
  }

  // ---------- 5. 로컬 JS 전부 인라인 ----------
  // 순서가 중요하다(app.js가 데이터 파일보다 뒤에 와야 한다). index.html의 순서를 그대로 쓴다.
  const localScript = /<script src="([^"]+?)(\?v=\d+)?"><\/script>/g;
  const jobs = [];
  html.replace(localScript, (m, file) => {
    if (!/^https?:/.test(file)) jobs.push({ m, file });
    return m;
  });
  for (const { m, file } of jobs) {
    const src = file === 'tarot-data.js' ? tarotJs : await read(file);
    // </script>가 문자열 안에 들어 있으면 태그가 조기 종료된다. 안전하게 쪼갠다.
    // ⚠️ 치환 문자열을 그대로 넘기면 안 된다. JS 안의 .replace(/x/, '$1') 같은 코드가
    //    치환 패턴으로 해석돼 소스가 조용히 망가진다(실제로 SyntaxError가 났다).
    //    함수로 넘기면 문자열이 있는 그대로 들어간다.
    const body = `<script>\n${src.replace(/<\/script>/g, () => '<\\/script>')}\n</script>`;
    html = html.replace(m, () => body);
  }

  const outDir = join(HERE, '.artifact');
  await mkdir(outDir, { recursive: true });
  const out = join(outDir, 'maumjaro.html');
  await writeFile(out, html, 'utf8');

  const mb = (Buffer.byteLength(html, 'utf8') / 1048576).toFixed(2);
  console.log(`번들 완료: ${out}`);
  console.log(`  JS ${jobs.length}개 인라인 / 타로 이미지 ${inlined}장 인라인 / CSS 1개`);
  console.log(`  크기 ${mb}MB (아티팩트 한도 16MB)`);
  const left = html.match(/src="(?!https?:)[^"]+\.js/g);
  if (left) console.log('  ⚠️ 인라인 안 된 스크립트:', left);
}

main().catch((e) => { console.error(e); process.exit(1); });
