// 발행된 글의 카테고리를 바꾼다. **사람이 글을 보고 지목했을 때만 쓴다.**
//
//   node src/wordpress/set-category.mjs 23969 --분류=생활정보          무엇이 바뀌는지 보여준다 (기본)
//   node src/wordpress/set-category.mjs 23969 --분류=생활정보 --apply  실제로 바꾼다
//
// 왜 이 도구가 생겼나
//   2026-11-18 에 최민정(쇼트트랙) 글이 **당구**로 분류됐다. 주제 분류는
//   AI 가 하는데, 종목 목록에 쇼트트랙이 없으니 가장 가까워 보이는 칸을
//   골랐다. 효성님: "최민정 카테고리가 왜 당구지? 차라리 생활정보에 넣어라".
//
//   글을 다시 쓰면 300원이 들고 주소가 바뀐다. 카테고리 하나만 고치는
//   길이 없어서 만들었다.
//
// 지키는 선
//   - **미리보기가 기본이다.** --apply 가 없으면 아무것도 보내지 않는다.
//   - **글 번호를 적어야 돈다.** `전체`·`all` 같은 길은 만들지 않았다.
//   - **`categories` 하나만 보낸다.** 제목·본문·슬러그·메타는 손대지 않는다.
//     주소가 바뀌면 색인이 끊긴다.
//   - **있는 카테고리만 쓴다.** 이름이 안 맞으면 멈추고 목록을 보여준다.
//     새 카테고리를 자동으로 만들지 않는다 — 오타 하나가 분류를 늘린다.
//   - **바꾸기 전 카테고리를 찍어 둔다.** 되돌릴 때 그 번호를 그대로 쓴다.
//   - wiki 밖의 글은 건너뛴다.

import { wpFetch, wpConfig } from './client.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

/** 한 번에 받는 글 수의 상한. */
export const 한번에최대 = 20;

/** 사이트의 카테고리를 이름 → 번호로 모은다. */
export async function 카테고리목록() {
  const 모음 = new Map();
  for (let page = 1; page <= 5; page += 1) {
    const { data } = await wpFetch('/wp/v2/categories', {
      query: { per_page: 100, page, _fields: 'id,name,count' },
    });
    if (!Array.isArray(data) || !data.length) break;
    for (const c of data) 모음.set(String(c.name || '').trim(), { id: c.id, count: c.count });
    if (data.length < 100) break;
  }
  return 모음;
}

/** `--분류=생활정보` 에서 이름만 꺼낸다. */
export function 분류이름뽑기(args) {
  for (const a of args) {
    const m = /^--분류=(.+)$/.exec(String(a));
    if (m) return m[1].trim();
  }
  return '';
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const 번호들 = [...new Set(args.filter((a) => /^\d+$/.test(a)).map(Number))];
  const 분류 = 분류이름뽑기(args);

  console.log('');
  console.log(`🗂  글의 카테고리를 바꿉니다${apply ? '' : ' (미리보기 — 아무것도 바꾸지 않습니다)'}`);

  if (!번호들.length) {
    console.error('글 번호를 적어주세요. 예: node src/wordpress/set-category.mjs 23969 --분류=생활정보');
    process.exitCode = 1;
    return;
  }
  if (번호들.length > 한번에최대) {
    console.error(`한 번에 ${한번에최대}편까지만 받습니다 (받은 것: ${번호들.length}편).`);
    process.exitCode = 1;
    return;
  }
  if (!분류) {
    console.error('바꿀 카테고리를 적어주세요. 예: --분류=생활정보');
    process.exitCode = 1;
    return;
  }

  const { base } = wpConfig();
  console.log(`   대상 사이트: ${new URL(base).host}  ← 여기 글만 손댑니다`);

  const 목록 = await 카테고리목록();
  const 고른것 = 목록.get(분류);
  if (!고른것) {
    console.error(`\n❌ "${분류}" 라는 카테고리가 없습니다. 새로 만들지 않습니다.`);
    console.error('   있는 카테고리:');
    for (const [이름, v] of 목록) console.error(`     ${이름} (id=${v.id}, 글 ${v.count}개)`);
    process.exitCode = 1;
    return;
  }
  const 번호로이름 = new Map([...목록].map(([이름, v]) => [v.id, 이름]));

  let 바꾼수 = 0;
  for (const 번호 of 번호들) {
    let 글;
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${번호}`, {
        query: { context: 'edit', _fields: 'id,link,title,categories,status' },
      });
      글 = data;
    } catch (err) {
      console.log(`   ❌ ${번호} 조회 실패 — ${err.message}`);
      process.exitCode = 1;
      continue;
    }

    if (!손대도되는글인가(글?.link, base)) {
      console.log(`   ⏭  ${번호} 다른 사이트의 글입니다 — 건너뜁니다`);
      continue;
    }

    const 지금 = Array.isArray(글?.categories) ? 글.categories : [];
    const 지금이름 = 지금.map((id) => 번호로이름.get(id) || `#${id}`).join(', ') || '(없음)';
    const 제목 = String(글?.title?.raw || 글?.title?.rendered || '').slice(0, 44);

    if (지금.length === 1 && 지금[0] === 고른것.id) {
      console.log(`   ⏭  ${번호} 이미 ${분류} 입니다 — ${제목}`);
      continue;
    }

    console.log(`   [${번호}] ${글?.status} · ${제목}`);
    console.log(`        전: ${지금이름}   (되돌릴 때 쓸 번호: ${지금.join(' ') || '없음'})`);
    console.log(`        후: ${분류} (id=${고른것.id})`);

    if (!apply) { 바꾼수 += 1; continue; }

    try {
      await wpFetch(`/wp/v2/posts/${번호}`, { method: 'POST', body: { categories: [고른것.id] } });
      console.log('        ✅ 바꿨습니다');
      바꾼수 += 1;
    } catch (err) {
      console.log(`        ❌ 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('');
  console.log(apply ? `${바꾼수}편의 카테고리를 바꿨습니다. 주소는 그대로입니다.`
                    : `${바꾼수}편이 바뀝니다. 실제로 바꾸려면 --apply 를 붙이세요.`);
  console.log('※ 카테고리만 보냅니다. 제목·본문·주소·발행상태는 건드리지 않습니다.');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
