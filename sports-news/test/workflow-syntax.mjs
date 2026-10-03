// 워크플로 문법 검사.
//
// 왜 필요한가: GitHub은 ${{ }} 를 주석이든 어디든 가리지 않고 먼저 해석한다.
// 셸 주석 안에 써도 소용없다. 안이 비어 있으면 파일 전체를 못 읽고,
// 워크플로 이름조차 표시되지 않은 채 0초 만에 실패한다.
//
// 실제로 그 실수를 했다. run 블록 주석에 "${{ }} 를 바로 쓰면 위험하다"고
// 적어둔 것이 그대로 문법 오류가 됐다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOWS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.github/workflows');
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[워크플로 문법]');

const files = fs.existsSync(WORKFLOWS)
  ? fs.readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))
  : [];

check('워크플로 파일을 찾는다', () => assert.ok(files.length > 0, WORKFLOWS));

for (const file of files) {
  const text = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
  const exprs = [...text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)];

  check(`${file}: 빈 표현식이 없다`, () => {
    const empty = exprs.filter((m) => !m[1].trim());
    assert.equal(empty.length, 0, `${empty.length}개 — GitHub이 파일 전체를 못 읽게 됩니다`);
  });

  check(`${file}: 표현식이 알려진 컨텍스트만 쓴다`, () => {
    const known = /^(secrets|inputs|github|env|vars|matrix|needs|steps|job|runner|strategy|always|success|failure|cancelled|hashFiles|format|toJSON|fromJSON|contains|startsWith|endsWith|join)\b/;
    // 부정(!)으로 시작하는 조건도 정상이다: if: ${{ !contains(inputs.mode, '...') }}
    const bad = exprs.map((m) => m[1].trim().replace(/^!+\s*/, '')).filter((e) => !known.test(e));
    assert.equal(bad.length, 0, `알 수 없는 표현식: ${bad.join(' / ')}`);
  });
}

const sports = path.join(WORKFLOWS, 'sports-news.yml');
if (fs.existsSync(sports)) {
  const text = fs.readFileSync(sports, 'utf8');
  check('sports-news: 자동 실행(cron)이 걸려 있지 않다', () => {
    assert.ok(!/^\s*schedule:/m.test(text), '사람이 누를 때만 돌아야 합니다');
  });
  check('sports-news: 기본값이 미리보기다', () => {
    assert.ok(/default: '미리보기/.test(text), '실수로 눌렀을 때 저장되면 안 됩니다');
  });
  check('sports-news: 입력값을 run 블록에 직접 끼워 넣지 않는다', () => {
    const runBlocks = [...text.matchAll(/run: \|([\s\S]*?)(?=\n {6}- |\n {6}\w|$)/g)].map((m) => m[1]);
    const injected = runBlocks.filter((b) => /\$\{\{\s*inputs\./.test(b));
    assert.equal(injected.length, 0, '입력값은 env로 넘겨야 합니다');
  });
  check('sports-news: 리포에 쓰기 권한을 요구하지 않는다', () => {
    assert.ok(/contents: read/.test(text));
  });
  check('sports-news: 한글 폰트 설치 조건이 실행 단계와 같다', () => {
    // 폰트는 텍스트 카드에만 쓴다. 조건이 어긋나면 둘 중 하나가 난다.
    //   더 좁으면 → 글은 쓰는데 폰트가 없어 카드 글씨가 깨진다
    //   더 넓으면 → 0원 방식에서 apt로 2분을 그냥 버린다
    const 조건 = (이름) => {
      const m = new RegExp(`- name: ${이름}\\n([\\s\\S]*?)(?=\\n {6}- |$)`).exec(text);
      assert.ok(m, `${이름} 단계를 못 찾았습니다`);
      const i = /^\s*if: \$\{\{([\s\S]*?)\}\}/m.exec(m[1]);
      assert.ok(i, `${이름} 단계에 if 조건이 없습니다`);
      return i[1].trim();
    };
    assert.equal(조건('한글 폰트 설치'), 조건('실행'));
  });
}

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);

// 워크플로가 부르는 CLI 형태가 실제 스크립트와 맞는지.
//
// 실측 사고: retitle.mjs 는 `set <글번호>` 를 받는데(argv[2]=set, argv[3]=id)
// 워크플로가 `retitle.mjs <글번호>` 로 불러서 "글 번호를 적어주세요"로 죽었다.
if (fs.existsSync(sports)) {
  const text = fs.readFileSync(sports, 'utf8');
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/wordpress/retitle.mjs');

  check('retitle 을 부를 때 서브커맨드를 빠뜨리지 않는다', () => {
    // 워크플로는 retitle 을 두 군데서 부른다 — 글 찾기(find)와 제목 고치기(set).
    // 둘 다 서브커맨드가 첫 인자여야 한다.
    const 부름들 = [...text.matchAll(/node src\/wordpress\/retitle\.mjs\s+(\S+)/g)].map((m) => m[1]);
    assert.ok(부름들.length > 0, '워크플로가 retitle 을 부르지 않습니다');
    for (const 첫인자 of 부름들) {
      assert.ok(['find', 'set'].includes(첫인자),
        `retitle.mjs 를 "${첫인자}" 로 부르고 있습니다 — find 나 set 이어야 합니다`);
    }
    assert.ok(부름들.includes('set'), '제목 고치기(set) 호출이 없습니다');
  });

  check('retitle 이 실제로 argv[3]에서 글 번호를 읽는다', () => {
    // 위 검사가 의미를 가지려면 스크립트 쪽 약속도 같이 확인해야 한다.
    const code = fs.readFileSync(src, 'utf8');
    assert.ok(/process\.argv\[3\]/.test(code), 'retitle.mjs 의 인자 위치가 바뀌었습니다');
  });
}
