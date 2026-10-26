// 워크플로 문법 검사.
//
// 왜 필요한가: GitHub은 ${{ }} 를 주석이든 어디든 가리지 않고 먼저 해석한다.
// 셸 주석 안에 써도 소용없다. 안이 비어 있으면 파일 전체를 못 읽고,
// 워크플로 이름조차 표시되지 않은 채 0초 만에 실패한다.
//
// 실제로 그 실수를 했다. run 블록 주석에 "${{ }} 를 바로 쓰면 위험하다"고
// 적어둔 것이 그대로 문법 오류가 됐다.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 워크플로는 리포 구조에 따라 두 자리 중 하나에 있다.
//   맘운자로 안에 있을 때: ../../.github/workflows  (sports-news/ 가 하위 폴더)
//   비공개 리포로 떼어낸 뒤: ../.github/workflows   (sports-news 가 루트)
// 전략 자료를 공개 저장소에 두지 않으려고 떼어내는 중이라, 양쪽에서 다 돌아야 한다.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS = [
  path.resolve(HERE, '../../.github/workflows'),
  path.resolve(HERE, '../.github/workflows'),
].find((d) => fs.existsSync(d)) || path.resolve(HERE, '../.github/workflows');
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
    // 여는 괄호로 시작하는 조건도 정상이다 — 2026-10-10 에 '파일로 올리기'
    // 모드를 넣으면서 폰트 조건이 `(A && B) || C` 꼴이 됐고, 괄호를 안 벗기면
    // 멀쩡한 조건이 "알 수 없는 표현식"으로 걸렸다.
    const bad = exprs.map((m) => m[1].trim().replace(/^[!(\s]+/, '')).filter((e) => !known.test(e));
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
  check('sports-news: 한글 폰트 설치 조건이 이미지를 만드는 단계와 맞는다', () => {
    // 폰트는 텍스트 카드에만 쓴다. 조건이 어긋나면 둘 중 하나가 난다.
    //   더 좁으면 → 글은 쓰는데 폰트가 없어 카드 글씨가 깨진다
    //   더 넓으면 → 0원 방식에서 apt로 2분을 그냥 버린다
    //
    // 2026-10-10: 규칙을 다시 적었다. 예전에는 "실행 단계와 글자 그대로
    // 같다"로 묶었는데, **AI 를 안 부르면서 이미지는 만드는 모드**가
    // 생겼다 — '파일로 올리기'다(이미 만든 글을 임시글로 저장하고, 텍스트
    // 카드는 로컬에서 그린다). 실제 규칙은 "실행 단계와 같다"가 아니라
    // **"이미지를 만드는 단계에서 필요하다"** 였다. 그래서 실행 조건에
    // 그 모드를 OR 로 더한 꼴인지를 본다.
    const 조건 = (이름) => {
      const m = new RegExp(`- name: ${이름}\\n([\\s\\S]*?)(?=\\n {6}- |$)`).exec(text);
      assert.ok(m, `${이름} 단계를 못 찾았습니다`);
      const i = /^\s*if: \$\{\{([\s\S]*?)\}\}/m.exec(m[1]);
      assert.ok(i, `${이름} 단계에 if 조건이 없습니다`);
      return i[1].trim();
    };
    //
    // 2026-10-26: 그런 모드가 둘이 됐다. '카드 이미지 다시 굽기'도 AI 를
    // 안 부르면서 카드를 그린다. 그래서 하나가 아니라 **목록**으로 본다.
    // 여기에 빠진 채 새 모드를 만들면 폰트 없이 카드를 굽게 되고, 그것이
    // 글 11265 에 두부(□) 그림이 올라간 경로다.
    const 이미지모드 = ['파일로 올리기', '카드 이미지 다시 굽기'];
    const 실행 = 조건('실행');
    const 기대 = `(${실행})${이미지모드.map((m) => ` || contains(inputs.mode, '${m}')`).join('')}`;
    assert.equal(조건('한글 폰트 설치'), 기대);
    // 실행 단계는 그 모드들에서 돌지 않아야 한다 — 돌면 AI 를 부르고 돈이 든다.
    for (const m of 이미지모드) {
      assert.ok(실행.includes(`!contains(inputs.mode, '${m}')`), `실행 조건에서 '${m}' 이 빠졌습니다`);
    }
  });
}


/**
 * 그 줄이 "영문 아닌 셸 변수명에 값을 넣는 줄"인가.
 *
 * bash 변수명은 영문·숫자·밑줄만 된다. 주제="..." 는 할당이 아니라 명령으로
 * 해석되어 'command not found' 로 죽는다. 실제로 '공식 페이지 받아보기'
 * 스텝이 그래서 죽었다. YAML 문법 검사로는 안 잡히므로 따로 본다.
 *
 * 걸리면 그 토큰을, 멀쩡하면 null 을 돌려준다.
 */
export function 나쁜변수명(line) {
  // run 블록 안쪽은 깊게 들여쓰여 있다. 줄 맨 앞 토큰이 곧바로 = 를 만나면 할당이다.
  // args+=("x") 같은 배열 추가도 정상 할당이므로 += 를 허용한다.
  const m = /^\s{6,}([^\s=#|>&$'"]+?)\+?=(?!=)/.exec(line);
  if (!m) return null;
  // 여러 줄로 이어진 명령의 인자 줄은 할당이 아니다. bash 변수명은 '-' 로
  // 시작할 수 없으므로 --flag=값 은 애초에 할당일 수가 없다.
  // 실측 2026-10-12: ai-surprise.yml 의 `--image-model="$IN_IMAGE_MODEL"` 가
  // 걸려 main 의 자체 검사가 빨개졌고, 그 바람에 모든 모드가 돌지 못했다.
  if (m[1].startsWith('-')) return null;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(m[1])) return null;
  return m[1];
}

check('셸 변수명에 한글을 쓰지 않는다', () => {
  const 나쁜것 = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
    text.split('\n').forEach((line, i) => {
      const 토큰 = 나쁜변수명(line);
      if (토큰) 나쁜것.push(`${file}:${i + 1} "${토큰}"`);
    });
  }
  assert.equal(나쁜것.length, 0, `셸 변수명에 영문 아닌 글자: ${나쁜것.join(' / ')}`);
});

check('명령의 --flag=값 줄을 변수 할당으로 보지 않는다', () => {
  // 잡아야 하는 것
  assert.equal(나쁜변수명('        주제="오늘의 글감"'), '주제');
  assert.equal(나쁜변수명('        제목2="x"'), '제목2');
  // 잡으면 안 되는 것
  assert.equal(나쁜변수명('          --image-model="$IN_IMAGE_MODEL" --max-usd="$IN_MAX_USD"'), null);
  assert.equal(나쁜변수명('          --resume="$tale_id" \\'), null);
  assert.equal(나쁜변수명('        TOPIC="야구"'), null);
  assert.equal(나쁜변수명('        args+=("--dry-run")'), null);
  assert.equal(나쁜변수명('        echo "a == b"'), null);
});

// ── 도구 출력이 로그 꼬리에서 읽히는가 (2026-10-19) ──────────
// 깃허브 잡 로그를 꼬리부터 읽는데 아티팩트 업로드 단계가 수십 줄을
// 쏟아내서, 정작 도구가 찍은 결과가 꼬리 밖으로 밀려났다. 2026-10-18
// 하루에만 여섯 번 넘게 "run 은 성공했는데 몇 편이 바뀌었는지는 못
// 읽었다"로 끝났다. 그래서 도구 출력을 파일에 남기고 잡의 맨 마지막
// 단계에서 다시 찍는다. 이 장치가 조용히 없어지면 같은 일이 반복된다.
check('도구 출력을 로그 파일에 함께 남긴다', () => {
  const wf = fs.readFileSync(sports, 'utf8');
  // node 호출은 `\\` 로 여러 줄에 걸칠 수 있다. 줄 단위가 아니라
  // **명령 단위**로 이어 붙여서 본다.
  const 줄들 = wf.split('\n');
  const 명령 = [];
  for (let i = 0; i < 줄들.length; i++) {
    // **들여쓰기로 거르지 않는다.** 2026-10-19 에 이 검사가 `^ {10}` 이어서
    // if/case/for 안에 있는 호출 8개(28개 중)를 통째로 못 보고 있었다. 그래서
    // "로그 꼬리에서 읽게 했다"고 적어 둔 뒤에도 제목 고치기 결과를 못 읽었다.
    if (!/^\s*node src\//.test(줄들[i])) continue;
    let cmd = 줄들[i];
    while (cmd.trimEnd().endsWith('\\') && i + 1 < 줄들.length) { i += 1; cmd += '\n' + 줄들[i]; }
    명령.push(cmd);
  }
  assert.ok(명령.length >= 10, `node 호출을 찾지 못했습니다 (${명령.length}개)`);
  for (const c of 명령) {
    assert.match(c, /\| tee -a "\$RUNNER_TEMP\/sn\.log"/,
      `tee 가 빠진 호출이 있습니다: ${c.trim().split('\n')[0].slice(0, 60)}`);
  }
});

check('node 호출 줄에서 백슬래시가 줄 끝에만 온다', () => {
  // **2026-10-19 에 내가 낸 사고를 잡는 검사다.** node 호출 뒤에 tee 를
  // 붙이는 치환을 돌렸는데, add-notice 호출은 `\\` 로 줄을 잇고 있었다.
  // 그 줄 끝에 tee 를 붙이니 `\\` 가 **줄바꿈이 아니라 공백을 이스케이프**
  // 하게 되고, 뒷줄(`${IN_TEXT:+--text=...}`)이 떨어져 나가 그것만으로 한
  // 명령이 됐다. 돌렸으면 "--text=...: command not found" 로 죽는다.
  //
  // **bash -n 은 이것을 못 잡는다** — 문법은 맞고 뜻만 틀렸기 때문이다.
  // 실제로 확인했다. 그래서 모양을 직접 본다.
  const wf = fs.readFileSync(sports, 'utf8');
  for (const [i, l] of wf.split('\n').entries()) {
    if (!/^\s*node src\//.test(l)) continue;
    const 백슬래시 = l.indexOf('\\');
    if (백슬래시 === -1) continue;
    assert.equal(백슬래시, l.trimEnd().length - 1,
      `${i + 1}줄: 백슬래시가 줄 끝이 아닙니다 — ${l.trim().slice(0, 70)}`);
  }
});

check('파이프를 걸어도 종료 코드를 잃지 않는다', () => {
  const wf = fs.readFileSync(sports, 'utf8');
  // node ... | tee 로 끝내면 tee 의 종료 코드가 남아 **실패가 성공으로
  // 찍힌다.** PIPESTATUS 로 node 의 코드를 되살려야 한다.
  // 되살리는 길은 둘이다 — 호출 바로 뒤의 `exit "${PIPESTATUS[0]}"`, 또는
  // 블록 맨 위의 `set -o pipefail`. **if/case/for 안에서는 뒤쪽만 쓸 수 있다**:
  // for 루프 안에 exit 를 넣으면 첫 글만 처리하고 멈춘다(2026-10-19).
  // 그래서 `run: |` 블록 단위로, tee 를 쓰면 둘 중 하나가 있는지 본다.
  const 블록들 = [];
  const 줄들 = wf.split('\n');
  for (let i = 0; i < 줄들.length; i++) {
    if (!/^\s*run: \|/.test(줄들[i])) continue;
    const 들여 = 줄들[i].search(/\S/);
    const 몸통 = [];
    for (let j = i + 1; j < 줄들.length; j++) {
      const l = 줄들[j];
      if (l.trim() !== '' && l.search(/\S/) <= 들여) break;
      몸통.push(l);
    }
    블록들.push({ 줄: i + 1, 글: 몸통.join('\n') });
  }
  assert.ok(블록들.length >= 20, `run 블록을 찾지 못했습니다 (${블록들.length}개)`);
  for (const b of 블록들) {
    if (!b.글.includes('| tee -a "$RUNNER_TEMP/sn.log"')) continue;
    const exit있나 = b.글.includes('exit "${PIPESTATUS[0]}"');
    const pipefail있나 = /set -o pipefail/.test(b.글);
    assert.ok(exit있나 || pipefail있나,
      `${b.줄}줄 run 블록: tee 를 쓰는데 PIPESTATUS 되살림도 set -o pipefail 도 없습니다`);
  }
});

check('잡의 맨 마지막 단계가 도구 출력을 다시 찍는다', () => {
  const wf = fs.readFileSync(sports, 'utf8');
  const 단계들 = [...wf.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1]);
  const 마지막 = 단계들[단계들.length - 1];
  assert.match(마지막, /도구가 찍은 것 다시 보기/,
    `맨 마지막 단계가 요약이 아닙니다: ${마지막}`);
  assert.match(wf, /tail -60 "\$RUNNER_TEMP\/sn\.log"/, '요약이 로그를 찍지 않습니다');
  assert.match(wf, /if: always\(\)\n        run: \|\n          echo "════════ 도구 출력 요약/,
    '요약 단계가 실패했을 때도 돌지 않습니다');
});

check('run 블록이 전부 bash 문법에 맞는다', () => {
  const wf = fs.readFileSync(sports, 'utf8');
  // **2026-10-19 에 내가 낸 사고를 잡는 검사다.** node 호출 뒤에 tee 를
  // 붙이는 치환을 돌렸는데, add-notice 호출은 원래 `\\` 로 줄을 잇고
  // 있었다. 그 줄 끝에 tee 를 붙이니 `\\` 가 **줄바꿈이 아니라 공백을
  // 이스케이프**하게 되고, 뒷줄(`${IN_TEXT:+--text=...}`)이 떨어져 나가
  // 그것만으로 한 명령이 됐다. 돌렸으면 "--text=...: command not found"
  // 로 죽었을 것이다.
  //
  // YAML 문법은 멀쩡했다. 깨진 것은 **셸 쪽**이라 yaml 검사로는 안 잡힌다.
  const 블록 = [...wf.matchAll(/^ {8}run: \|\n((?: {10}.*\n|\n)+)/gm)].map((m) => m[1]);
  assert.ok(블록.length >= 10, `run 블록을 찾지 못했습니다 (${블록.length}개)`);
  for (const [i, b] of 블록.entries()) {
    const 코드 = b.split('\n').map((l) => (l.startsWith(' '.repeat(10)) ? l.slice(10) : l)).join('\n');
    const r = spawnSync('bash', ['-n'], { input: 코드, encoding: 'utf8' });
    assert.equal(r.status, 0, `run 블록 ${i + 1} 문법 오류: ${String(r.stderr).trim().slice(0, 150)}`);
  }
});

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

// ── "비용 0원" 이라고 적은 모드가 정말 0원인가 (2026-10-19) ─────
//
// 글을 쓰는 단계는 **제외 목록(블랙리스트)** 으로 걸러진다. 0원 모드를
// 새로 넣을 때 그 목록에 이름을 넣는 것을 잊으면, "비용 0원" 이라고 적힌
// 모드가 AI 를 불러 글을 쓴다.
//
// 2026-10-19 에 '중복 글 휴지통으로 보내기 (미리보기 · 비용 0원)' 를 넣으며
// 그 목록에 '휴지통' 을 빠뜨렸다. 미리보기를 한 번 돌렸는데 글쓰기가 돌아
// **362원과 웹검색 3회**를 썼다. 이름이 거짓말을 한 것이다.
//
// 사람이 긴 블랙리스트를 손으로 맞추는 한 또 일어난다. 그래서 검사가 맞춘다.
check('"비용 0원" 모드는 전부 글쓰기 단계에서 빠져 있다', () => {
  const text = fs.readFileSync(sports, 'utf8');

  // ① mode 선택지에서 "비용 0원" 이 적힌 것만 모은다.
  const 공짜모드 = [...text.matchAll(/^ {10}- '([^']*비용 0원[^']*)'$/gm)].map((m) => m[1]);
  assert.ok(공짜모드.length > 5, `0원 모드를 못 찾았습니다 (${공짜모드.length}개)`);

  // ② 글쓰기로 가는 단계들의 조건에서 제외 낱말을 모은다.
  //    두 군데가 같은 목록을 들고 있다(준비 단계와 '실행' 단계).
  const 조건줄 = text.split('\n').filter((줄) => 줄.includes("!contains(inputs.mode, '사이트 조사만')"));
  assert.equal(조건줄.length, 2, `글쓰기 제외 목록이 2개가 아닙니다 (${조건줄.length}개)`);

  for (const [i, 줄] of 조건줄.entries()) {
    const 제외낱말 = [...줄.matchAll(/!contains\(inputs\.mode, '([^']+)'\)/g)].map((m) => m[1]);
    const 안빠진것 = 공짜모드.filter((모드) => !제외낱말.some((낱말) => 모드.includes(낱말)));
    assert.deepEqual(
      안빠진것, [],
      `${i + 1}번째 글쓰기 조건에서 안 빠진 0원 모드: ${안빠진것.join(' / ')}`,
    );
  }
});

// ── 테스트가 npm test 에서 실제로 돌고 있나 (2026-10-17) ────────
//
// move-coupang 과 show-post 의 검사를 만들어 놓고 package.json 의 test
// 목록에 넣지 않아, **한 번도 돌지 않은 채로** 있었다. 541편을 건드린
// 도구의 검사였다. 파일만 만들고 끝내지 않게 여기서 막는다.
check('test/ 의 모든 검사가 npm test 에 들어 있다', () => {
  const dir = HERE;
  const 도우미 = new Set(['mock-anthropic.mjs', 'mock-wordpress.mjs']);
  const 파일 = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !도우미.has(f));
  const cmd = JSON.parse(fs.readFileSync(path.resolve(HERE, '../package.json'), 'utf8')).scripts.test;
  const 빠진것 = 파일.filter((f) => !cmd.includes(`test/${f}`));
  assert.deepEqual(빠진것, [], `npm test 에서 빠진 검사: ${빠진것.join(', ')}`);
});


  // ── env: 를 두 번 쓰면 비밀값이 통째로 사라진다 (2026-10-20) ──
  //
  // '사이트맵 점검' 단계에 env 블록을 하나 더 붙였더니, WORDPRESS_URL 과
  // 비밀번호가 들어 있던 앞 블록이 통째로 날아갔다. YAML 은 같은 키가 둘이면
  // 뒤엣것만 남긴다. 돌려보기 전에는 모르는 종류라 여기서 막는다.
  check('sports-news: 한 단계에 env: 를 두 번 쓰지 않는다', () => {
    const 단계들 = text.split(/\n      - name: /).slice(1);
    const 겹친것 = 단계들
      .filter((b) => (b.match(/^        env:$/gm) || []).length > 1)
      .map((b) => b.split('\n')[0].trim());
    assert.deepEqual(겹친것, [], `env: 가 두 번 나오는 단계: ${겹친것.join(' / ')}`);
  });

  // 2026-10-25: new_seo_title 을 넣으면서 앞 입력(new_desc)의 required/default
  // **앞에** 끼워 넣었다. 그 결과 required 와 default 가 한 블록에 두 번 나왔다.
  // GitHub 은 422 로 거부했지만 파이썬 yaml.safe_load 는 조용히 삼켰다 —
  // **돌려보기 전에는 못 잡는 종류다.** 그래서 여기서 막는다.
  //
  // 위의 env: 검사와 같은 병이다. 다만 그쪽은 단계(step) 안을 보고,
  // 이쪽은 workflow_dispatch 입력 하나하나를 본다.
  check('sports-news: 한 입력에 같은 칸을 두 번 쓰지 않는다', () => {
    const 입력부 = text.split(/\n    inputs:\n/)[1] || '';
    const 끝 = 입력부.search(/\n\S/);
    const 입력들 = (끝 === -1 ? 입력부 : 입력부.slice(0, 끝)).split(/\n      (?=\S)/);
    const 겹친것 = [];
    for (const 덩이 of 입력들) {
      const 이름 = 덩이.split('\n')[0].replace(':', '').trim();
      for (const 칸 of ['description', 'required', 'default', 'type', 'options']) {
        const 횟수 = (덩이.match(new RegExp(`^        ${칸}:`, 'gm')) || []).length;
        if (횟수 > 1) 겹친것.push(`${이름}.${칸}`);
      }
    }
    assert.deepEqual(겹친것, [], `같은 칸이 두 번 나오는 입력: ${겹친것.join(' / ')}`);
  });

}
