// 한 집을 올릴 때 필요한 것을 한 파일로 묶는다.
//
//   node playlist/scripts/upload.mjs --vol 015 \
//     --title "..." --tags "a, b, c" --pin "줄1|줄2|줄3"
//
// 설명란(설명란-VVV.txt)은 유튜브 설명 칸에 **그대로** 붙여넣는 파일이라
// 제목·태그를 섞으면 안 된다. 그래서 따로 업로드-VVV.txt 를 만든다.
//
// 2026-11-23: 제목·태그·고정 댓글을 채팅으로만 건네다가 매번 다시 찾게 됐다.
// 글은 파일로 남긴다 — 홍보 글을 초안 폴더에 남기는 것과 같은 이유다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out');
const argv = process.argv.slice(2);
const pick = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const fail = (m) => { console.error(`\n❌ ${m}\n`); process.exit(1); };

const VOL = pick('--vol', '');
const TITLE = pick('--title', '');
const TAGS = pick('--tags', '');
/* ⚠️ filter(Boolean) 을 쓰면 안 된다. 빈 칸(||)은 **문단 사이 빈 줄**이라
 * 지워 버리면 고정 댓글이 한 덩어리로 붙는다. 앞뒤 빈 줄만 걷어낸다. */
const PIN = (() => {
  const a = pick('--pin', '').split('|').map((x) => x.trim());
  while (a.length && !a[0]) a.shift();
  while (a.length && !a[a.length - 1]) a.pop();
  return a;
})();
if (!VOL || !TITLE) fail('사용법: --vol 015 --title "..." --tags "a, b" --pin "줄1|줄2"');

const descFile = join(OUT, `설명란-${VOL}.txt`);
if (!existsSync(descFile)) fail(`설명란이 없습니다: ${descFile}`);
const desc = readFileSync(descFile, 'utf8').trimEnd();

/* 유튜브 태그 칸은 전체 500자 제한이다. 넘으면 뒤가 잘린다. */
const tagLen = TAGS.length;
if (tagLen > 500) fail(`태그가 ${tagLen}자입니다. 유튜브 제한은 500자입니다.`);

/* 제목은 100자 제한. 다만 검색 결과에 보이는 것은 앞 60자 정도다. */
if (TITLE.length > 100) fail(`제목이 ${TITLE.length}자입니다. 유튜브 제한은 100자입니다.`);

const out = [
  '════════ 제목 ════════',
  TITLE,
  `  (${TITLE.length}자 / 100자 제한 · 검색 결과엔 앞 60자쯤 보인다)`,
  '',
  '════════ 태그 ════════',
  TAGS,
  `  (${tagLen}자 / 500자 제한 · 앞쪽 태그에 가중치가 실린다)`,
  '',
  '════════ 고정 댓글 ════════',
  ...PIN,
  '',
  '════════ 설명란 (아래 전부 그대로 붙여넣기) ════════',
  desc,
  '',
];
const f = join(OUT, `업로드-${VOL}.txt`);
writeFileSync(f, `${out.join('\n')}\n`);
console.log(`✅ ${f.replace(ROOT, 'playlist')}`);
console.log(`   제목 ${TITLE.length}자 · 태그 ${tagLen}자 · 고정 댓글 ${PIN.filter(Boolean).length}줄`);
