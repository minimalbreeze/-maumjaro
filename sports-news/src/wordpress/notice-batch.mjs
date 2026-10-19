// 안내를 **여러 쌍에 한 번에** 넣는다. AI를 부르지 않으므로 0원이다.
//
//   node src/wordpress/notice-batch.mjs 짝목록.tsv            (미리보기)
//   node src/wordpress/notice-batch.mjs 짝목록.tsv --apply    (적용)
//
// 왜 필요한가
//   add-notice.mjs 는 한 번에 **한 곳**만 가리킨다(--to 가 하나다). 겹치는
//   글을 정리하려면 쌍마다 가리킬 곳이 달라서, 222쌍이면 깃허브 액션을
//   222번 돌려야 한다. 현실적이지 않다.
//
//   그래서 쌍 목록을 파일로 받아 한 번에 돈다. 안전선은 add-notice 의 것을
//   **그대로 재사용한다** — 새로 만들지 않는다.
//
// 목록 파일 (탭으로 나눈다. # 로 시작하는 줄과 빈 줄은 건너뛴다)
//
//   옛글번호 <TAB> 새글번호 <TAB> 안내 문구
//   3664	3707	이 대회는 끝났습니다. 결과와 다시보기는 여기로

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../utils/env.mjs';
import { addNoticeToPost, 가리킬곳 } from './add-notice.mjs';

/** 목록 파일을 읽어 쌍으로 바꾼다. 줄 번호를 남겨 잘못된 줄을 짚을 수 있게 한다. */
export function 목록읽기(글) {
  const 쌍 = [];
  const 나쁜줄 = [];
  String(글 || '').replace(/\r/g, '').split('\n').forEach((줄, i) => {
    const t = 줄.trim();
    if (!t || t.startsWith('#')) return;
    const [옛, 새, ...나머지] = 줄.split('\t');
    const 문구 = 나머지.join('\t').trim();
    const 옛번호 = Number(String(옛).trim());
    const 새번호 = Number(String(새).trim());
    // **0 보다 커야 한다.** 빈 칸은 Number('') 로 0 이 되고 0 은 정수라
    // 그냥 통과한다 — 검사에서 잡혔다. 글 번호에 0 은 없다.
    if (!(옛번호 > 0) || !(새번호 > 0) || !Number.isInteger(옛번호)
        || !Number.isInteger(새번호) || !문구) {
      나쁜줄.push({ 줄번호: i + 1, 줄: t.slice(0, 60) });
      return;
    }
    if (옛번호 === 새번호) {
      나쁜줄.push({ 줄번호: i + 1, 줄: `${t.slice(0, 40)} — 자기 자신을 가리킵니다` });
      return;
    }
    쌍.push({ 옛글: 옛번호, 새글: 새번호, 문구 });
  });
  return { 쌍, 나쁜줄 };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply') && !args.includes('--dry-run');
  const 파일 = args.find((a) => !a.startsWith('--'));
  if (!파일) {
    console.error('사용법: node src/wordpress/notice-batch.mjs <짝목록.tsv> [--apply]');
    process.exit(1);
  }
  const abs = path.isAbsolute(파일) ? 파일 : path.join(ROOT, 파일);
  if (!fs.existsSync(abs)) { console.error(`파일을 찾을 수 없습니다: ${파일}`); process.exit(1); }

  const { 쌍, 나쁜줄 } = 목록읽기(fs.readFileSync(abs, 'utf8'));

  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`📌 안내를 ${쌍.length}쌍에 넣습니다${apply ? '' : ' (미리보기 — 저장하지 않습니다)'}`);
  console.log(`────────────────────────────────────────────────────────`);

  if (나쁜줄.length) {
    console.log(`\n⚠️  읽지 못한 줄 ${나쁜줄.length}개`);
    for (const b of 나쁜줄) console.log(`   ${b.줄번호}줄: ${b.줄}`);
    console.log('');
  }
  if (!쌍.length) { console.log('넣을 것이 없습니다.'); return; }

  // 가리킬 글의 주소는 **한 번만** 받아 둔다. 같은 글을 여러 쌍이 가리킬 수
  // 있는데 그때마다 물으면 호출만 늘어난다.
  const 주소 = new Map();
  const 주소받기 = async (id) => {
    if (!주소.has(id)) 주소.set(id, await 가리킬곳(id));
    return 주소.get(id);
  };

  let 넣음 = 0; let 그대로 = 0; let 실패 = 0;
  for (const { 옛글, 새글, 문구 } of 쌍) {
    try {
      const 대상 = await 주소받기(새글);
      if (대상.status !== 'publish') {
        // 발행 안 된 글을 가리키면 독자가 못 본다. 넣지 않는다.
        그대로 += 1;
        console.log(`[${옛글}] 건너뜀 — 가리킬 글 ${새글}이 발행 상태가 아닙니다(${대상.status})`);
        continue;
      }
      const r = await addNoticeToPost(옛글, { apply, text: 문구, url: 대상.url });
      if (r.skip) { 그대로 += 1; console.log(`[${옛글}] 건너뜀 — ${r.skip}`); continue; }
      넣음 += 1;
      console.log(`${apply ? '✅' : '  '} ${옛글} → ${새글}  ${String(r.title || '').slice(0, 44)}`);
    } catch (err) {
      실패 += 1;
      console.log(`❌ ${옛글} → ${새글} 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\n넣은 글 ${넣음}편 · 그대로 둔 글 ${그대로}편 · 실패 ${실패}편`);
  if (!apply && 넣음) console.log('실제로 넣으려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
  console.log('※ 본문만 보냅니다. 제목·주소·발행상태는 건드리지 않습니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
