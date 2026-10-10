// 제목과 본문의 오타를 고친다.
//
//   node src/wordpress/typo-fix.mjs            바뀔 내용만 보여준다 (기본)
//   node src/wordpress/typo-fix.mjs --apply    실제로 고친다
//   node src/wordpress/typo-fix.mjs --찾기     오타 후보만 찾아 보여준다 (안 고친다)
//
// 2026-10-10 운영자 지시: "글, 제목의 오타는 전부 수정한다"
//
// 설계의 핵심 — **추측으로 고치지 않는다**
//   한국어 맞춤법을 코드가 판단할 수는 없다. 그래서 둘로 나눴다.
//
//   ① 고치는 쪽은 아래 `바로잡기` 표에 적힌 것만 고친다. 표에 없는 말은
//      건드리지 않는다. 글이 633편이라 한 번 잘못 고치면 633편이 틀린다.
//   ② 찾는 쪽(`--찾기`)은 후보만 보여주고 **아무것도 고치지 않는다.**
//      사람이 보고 맞다고 판단한 것만 표를 통해 ① 로 넘어온다.
//
// 왜 이렇게까지 하나 — 실제로 당한 일
//   `구매의도` 가점이 한 글자 패턴을 써서 "김채영"의 채, "화성시"의 화를
//   먹었다. 한국어에서 짧은 조각은 어디에나 들어 있다. '아구'를 '야구'로
//   고치는 것도 "아구찜"에서는 틀린 고침이다. 그래서 표의 항목마다 "여기
//   들어 있으면 건드리지 말 것"(가드)을 함께 적는다.
//
// 지키는 선
//   - 미리보기가 기본이다.
//   - 보내기 전에 **"표에 적힌 것 말고는 아무것도 안 바뀌었는지"** 확인한다.
//   - 제목과 본문만 보낸다. **슬러그는 보내지 않는다** — 주소가 바뀌면
//     네이버가 들고 있는 주소가 깨진다.
//   - wiki 밖의 글은 건너뛴다.

import { 발행글전부 } from './index-audit.mjs';
import { wpFetch, wpConfig } from './client.mjs';
import { 손대도되는글인가, saveBackup } from './noindex.mjs';

/**
 * 고칠 오타 표.
 *
 * 항목마다 적는 것
 *   틀린 : 글에 들어 있는 잘못된 말
 *   맞는 : 바꿀 말
 *   이유 : 왜 오타라고 판단했는지. 나중에 누가 봐도 알 수 있게
 *   가드 : 이 꼴이면 **건드리지 않는다**. 같은 글자가 멀쩡한 낱말에도
 *          들어 있을 때 쓴다. 없으면 생략한다.
 *
 * 새 항목을 넣기 전에 `--찾기` 로 실제 글에서 확인한다. 머릿속에서 만들어
 * 넣지 않는다.
 */
export const 바로잡기 = [
  {
    틀린: '아구', 맞는: '야구',
    이유: '글 제목 "韓 아구 새 역사" — 야구의 오타. 서치콘솔 색인 실패 목록에서 확인',
    // "아구찜"은 음식 이름이라 멀쩡하다. "아구아" 같은 외래어도 건드리지 않는다.
    가드: /아구(?:찜|아|스|야)/,
  },
];

/** 표의 한 항목을 글에 적용한다. 가드에 걸리는 자리는 건너뛴다. */
export function 한항목고치기(text, 항목) {
  const 원본 = String(text || '');
  if (!원본.includes(항목.틀린)) return { after: 원본, 횟수: 0 };

  let 결과 = '';
  let i = 0;
  let 횟수 = 0;
  while (i < 원본.length) {
    const at = 원본.indexOf(항목.틀린, i);
    if (at < 0) { 결과 += 원본.slice(i); break; }
    결과 += 원본.slice(i, at);
    // 가드는 "틀린 말이 시작되는 자리부터"의 앞뒤 몇 글자를 보고 판단한다.
    const 둘레 = 원본.slice(Math.max(0, at - 2), at + 항목.틀린.length + 2);
    if (항목.가드 && 항목.가드.test(둘레)) {
      결과 += 항목.틀린;            // 멀쩡한 낱말이다. 그대로 둔다
    } else {
      결과 += 항목.맞는;
      횟수 += 1;
    }
    i = at + 항목.틀린.length;
  }
  return { after: 결과, 횟수 };
}

/** 표 전체를 글에 적용한다. */
export function 고치기(text, 표 = 바로잡기) {
  let 결과 = String(text || '');
  const 바뀐것 = [];
  for (const 항목 of 표) {
    const r = 한항목고치기(결과, 항목);
    결과 = r.after;
    if (r.횟수) 바뀐것.push({ 틀린: 항목.틀린, 맞는: 항목.맞는, 횟수: r.횟수 });
  }
  return { after: 결과, 바뀐것 };
}

/**
 * 표에 적힌 것 말고는 아무것도 안 바뀌었나. 보내기 전 마지막 확인.
 *
 * 원래 글에 표를 한 번 더 적용해서 보낼 글과 **글자 하나까지 같은지** 본다.
 * 다르면 그 글은 건너뛴다 — 내가 모르는 변화가 섞였다는 뜻이다.
 */
export function 오타만바뀌었나(before, after, 표 = 바로잡기) {
  return 고치기(before, 표).after === after;
}

// ── 오타 후보 찾기 (고치지 않는다) ─────────────────────────
//
// 생각 — 오타는 **딱 한 번만 나오고, 자주 나오는 말과 한 글자만 다르다.**
// "아구"는 633편에 한 번, "야구"는 수십 번 나온다. 한 글자 차이다.
// 맞춤법 지식이 없어도 이 모양만으로 후보를 꽤 건진다.
//
// 이건 후보일 뿐이고 **틀릴 수 있다.** 그래서 고치지 않고 보여만 준다.

/** 한 글자 고쳐서 같아지는 거리(최대 2까지만 센다. 그 이상은 다른 말이다). */
export function 글자거리(a, b) {
  const A = String(a); const B = String(b);
  if (Math.abs(A.length - B.length) > 1) return 9;
  const 표 = Array.from({ length: A.length + 1 }, (_, i) => [i, ...Array(B.length).fill(0)]);
  for (let j = 0; j <= B.length; j += 1) 표[0][j] = j;
  for (let i = 1; i <= A.length; i += 1) {
    for (let j = 1; j <= B.length; j += 1) {
      표[i][j] = A[i - 1] === B[j - 1]
        ? 표[i - 1][j - 1]
        : 1 + Math.min(표[i - 1][j - 1], 표[i - 1][j], 표[i][j - 1]);
    }
  }
  return 표[A.length][B.length];
}

/** 제목들을 낱말로 쪼갠다. 숫자·영문은 오타 판단 대상이 아니다. */
export function 한글낱말(text) {
  return String(text || '').match(/[가-힣]{2,}/g) || [];
}

/**
 * 오타 후보를 찾는다.
 *
 * @param 글       제목을 가진 글 목록
 * @param 드문것   이 횟수까지를 "드물다"고 본다 (기본 1 = 딱 한 번)
 * @param 흔한것   이 횟수부터를 "흔하다"고 본다 (기본 5)
 */
export function 오타후보(글 = [], { 드문것 = 1, 흔한것 = 5 } = {}) {
  const 셈 = new Map();
  const 어디 = new Map();
  for (const p of 글) {
    for (const w of 한글낱말(p.title)) {
      셈.set(w, (셈.get(w) || 0) + 1);
      if (!어디.has(w)) 어디.set(w, []);
      if (어디.get(w).length < 3) 어디.get(w).push(p);
    }
  }
  const 흔한 = [...셈.entries()].filter(([, n]) => n >= 흔한것).map(([w]) => w);
  const 후보 = [];
  for (const [w, n] of 셈) {
    if (n > 드문것) continue;
    for (const 기준 of 흔한) {
      if (w === 기준) continue;
      if (글자거리(w, 기준) === 1) {
        후보.push({ 낱말: w, 횟수: n, 닮은말: 기준, 닮은말횟수: 셈.get(기준), 글: 어디.get(w) || [] });
        break;
      }
    }
  }
  return 후보.sort((a, b) => b.닮은말횟수 - a.닮은말횟수);
}

async function main() {
  const 적용 = process.argv.includes('--apply');
  const 찾기만 = process.argv.includes('--찾기');
  const base = wpConfig().base;

  console.log('\n────────────────────────────────────────────────────────');
  console.log(찾기만
    ? '🔤 오타 후보 찾기 (아무것도 고치지 않습니다 · 비용 0원)'
    : `🔤 제목·본문 오타 고치기 ${적용 ? '(실제 적용)' : '(미리보기 · 비용 0원)'}`);
  console.log(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);
  console.log('────────────────────────────────────────────────────────');

  const 글 = await 발행글전부();
  console.log(`\n발행 ${글.length}편`);

  if (찾기만) {
    const 후보 = 오타후보(글);
    console.log(`\n오타 후보 ${후보.length}개`);
    console.log('   (딱 한 번만 나오고, 자주 나오는 말과 한 글자만 다른 낱말)');
    console.log('   ※ 후보일 뿐입니다. 맞다고 판단한 것만 바로잡기 표에 넣으세요.\n');
    for (const c of 후보) {
      console.log(`   "${c.낱말}" (${c.횟수}회)  ←→  "${c.닮은말}" (${c.닮은말횟수}회)`);
      for (const p of c.글) console.log(`      [${p.id}] ${p.title}`);
    }
    console.log('');
    return;
  }

  console.log(`   바로잡기 표: ${바로잡기.length}개 항목`);
  for (const 항목 of 바로잡기) {
    console.log(`      "${항목.틀린}" → "${항목.맞는}"  (${항목.이유})`);
  }

  // 제목은 목록에 있고, 본문은 글마다 따로 읽어야 한다. 제목에서 먼저 걸러
  // 후보를 좁히지 않는다 — 제목은 멀쩡하고 본문에만 오타가 있는 글이 있다.
  const 할일 = [];
  for (const p of 글) {
    if (!손대도되는글인가(p.link, base)) continue;
    let content = '';
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${p.id}`, {
        query: { context: 'edit', _fields: 'content' },
      });
      content = data?.content?.raw || '';
    } catch (err) {
      console.log(`   ⏭  ${p.id} 본문을 못 읽었습니다 — ${err.message}`);
      continue;
    }
    const 제목 = 고치기(p.title);
    const 본문 = 고치기(content);
    if (!제목.바뀐것.length && !본문.바뀐것.length) continue;
    할일.push({ post: p, content, 제목, 본문 });
  }

  console.log(`\n고칠 글 ${할일.length}편`);
  if (!할일.length) { console.log('   오타가 없습니다.\n'); return; }

  for (const t of 할일) {
    console.log(`\n   [${t.post.id}]`);
    if (t.제목.바뀐것.length) {
      console.log(`      제목 전: ${t.post.title}`);
      console.log(`      제목 후: ${t.제목.after}`);
    }
    if (t.본문.바뀐것.length) {
      const 몇 = t.본문.바뀐것.map((b) => `"${b.틀린}"→"${b.맞는}" ${b.횟수}곳`).join(', ');
      console.log(`      본문: ${몇}`);
    }
  }

  if (!적용) {
    console.log('\n실제로 고치려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ 제목과 본문만 보냅니다. 주소(슬러그)는 건드리지 않습니다.\n');
    return;
  }

  const 백업 = saveBackup(할일.map((t) => ({
    id: t.post.id, title: t.post.title, 새제목: t.제목.after,
  })));
  console.log(`\n원래 제목을 남겼습니다: ${백업}`);

  let 성공 = 0;
  for (const t of 할일) {
    try {
      const body = {};
      if (t.제목.바뀐것.length) {
        if (!오타만바뀌었나(t.post.title, t.제목.after)) {
          console.log(`   ❌ ${t.post.id} 제목에서 표 밖의 것이 바뀝니다 — 건너뜁니다`);
          process.exitCode = 1;
          continue;
        }
        body.title = t.제목.after;
      }
      if (t.본문.바뀐것.length) {
        if (!오타만바뀌었나(t.content, t.본문.after)) {
          console.log(`   ❌ ${t.post.id} 본문에서 표 밖의 것이 바뀝니다 — 건너뜁니다`);
          process.exitCode = 1;
          continue;
        }
        body.content = t.본문.after;
      }
      // 슬러그는 넣지 않는다. 주소가 바뀌면 네이버가 들고 있는 주소가 깨진다.
      await wpFetch(`/wp/v2/posts/${t.post.id}`, { method: 'POST', body });
      성공 += 1;
      console.log(`   ✅ ${t.post.id} ${(body.title || t.post.title).slice(0, 40)}`);
    } catch (err) {
      console.log(`   ❌ ${t.post.id} 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${성공}편의 오타를 고쳤습니다. 주소는 그대로입니다.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
