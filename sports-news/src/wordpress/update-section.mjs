// 글 본문에서 **소제목 하나의 내용만** 새 내용으로 갈아끼운다. AI를 부르지 않으므로 0원이다.
//
//   node src/wordpress/update-section.mjs 9247 --heading="최근 경기 결과" --file=새내용.md
//   node src/wordpress/update-section.mjs 9247 --heading="최근 경기 결과" --file=새내용.md --apply
//
// 왜 필요한가
//   선수 글을 **경기마다 새로 쓰면 안 된다.** 대회가 끝나면 그 글도 끝나기
//   때문이다. wiki 의 중계 유형 글 357편이 전부 2025년 대회라서 전부 죽어
//   있는 것이 그 결과다(2026-10-18 색인 진단).
//
//   그래서 선수당 글 하나를 영구 주소로 두고, 이슈가 날 때마다 '최근 경기
//   결과'·'다음 경기 일정' 같은 **섹션 하나만** 갈아끼운다. 이미 색인된 글이
//   갱신되는 것이라 새 글보다 빨리 노출되고, 같은 선수 글끼리 서로 잡아먹는
//   일(8592 vs 3460)도 없다.
//
//   왜 기존 도구로 못 하나
//   - typo-fix 는 한 덩어리 문자열 치환이다. 여러 문단을 갈아끼울 수 없고,
//     `글 본문 보기 --raw` 출력으로 여러 줄을 만들면 **0곳**이 된다
//     (raw줄로() 가 `-->` 뒤에서 쪼개고 끝 공백·빈 줄을 버린다).
//   - drop-section 은 섹션을 **빼기만** 한다. 빼고 다시 넣는 2단계로 하면
//     중간에 실패했을 때 섹션이 사라진 채로 남는다.
//
//   그래서 줄을 맞추려 들지 않고, 서버에서 받은 본문 위에서 블록 경계로
//   잘라 끼운다. 경계를 찾는 코드는 drop-section 것을 그대로 쓴다 —
//   두 벌로 만들면 둘이 어긋난다.
//
// 지키는 선
//   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
//   - **소제목은 그대로 둔다.** 바꾸는 것은 그 아래 내용뿐이다.
//   - 갈아끼운 자리 말고 **앞뒤 본문이 글자 하나까지 같아야** 저장한다.
//   - 소제목을 못 찾으면 아무것도 하지 않는다.
//   - 새 내용이 비어 있으면 거부한다 — 지우는 일은 drop-section 이 한다.
//   - 초안 내부 메모('안 쓴 것'·'처리 기록')가 섞여 있으면 거부한다.
//     그게 섞인 채로 올라간 적이 있다(9228·8643).
//   - 고치기 전 원본 본문을 파일로 남긴다.
//   - wiki 밖의 글은 건드리지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { wpFetch, wpConfig } from './client.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { 소제목자리, 섹션끝, 공백빼고 } from './drop-section.mjs';
import { ROOT } from '../utils/env.mjs';

/** 내부 메모에만 쓰는 말. 본문에 들어가면 안 된다. */
export const 내부메모말 = ['안 쓴 것', '처리 기록'];

/**
 * 빈 줄로 나뉜 평문을 워드프레스 문단 블록으로 바꾼다.
 * `- ` 로 시작하는 줄이 이어지면 목록 블록으로 묶는다.
 */
export function 블록으로(글) {
  const 토막 = String(글 || '').replace(/\r/g, '').trim().split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  return 토막.map((t) => {
    const 줄 = t.split('\n').map((l) => l.trim()).filter(Boolean);
    if (줄.length && 줄.every((l) => /^[-*]\s+/.test(l))) {
      const 항목 = 줄.map((l) => `<li>${l.replace(/^[-*]\s+/, '')}</li>`).join('\n');
      return `<!-- wp:list -->\n<ul class="wp-block-list">\n${항목}\n</ul>\n<!-- /wp:list -->`;
    }
    return `<!-- wp:paragraph -->\n<p>${줄.join(' ')}</p>\n<!-- /wp:paragraph -->`;
  }).join('\n\n');
}

/**
 * 본문에서 그 섹션의 내용을 새 블록으로 갈아끼운 결과. 못 찾으면 한일: null.
 */
export function updateSection(html, 말, 새내용) {
  const s = String(html || '');
  // **블록이 아니라 글자 수를 센다.** 처음에 블록 HTML 을 셌는데, 블록 주석만
  // 해도 공백 빼고 40자가 넘어서 '짧다' 두 글자가 통과했다. 검사가 잡았다.
  const 글자수 = 공백빼고(새내용).length;
  if (글자수 < 20) {
    return { html: s, 한일: null, 이유: `새 내용이 너무 짧습니다 (${글자수}자 — 지우는 일은 drop-section 이 합니다)` };
  }
  const 새블록 = 블록으로(새내용);
  const 섞인것 = 내부메모말.find((w) => String(새내용 || '').includes(w));
  if (섞인것) {
    return { html: s, 한일: null, 이유: `새 내용에 내부 메모가 섞여 있습니다 ('${섞인것}')` };
  }

  const h = 소제목자리(s, 말);
  if (!h) return { html: s, 한일: null, 이유: `'${말}' 소제목이 없습니다` };

  const 끝 = 섹션끝(s, h.end, h.level);
  const 앞 = s.slice(0, h.end);
  const 뺀것 = s.slice(h.end, 끝);
  const 뒤 = s.slice(끝);
  const 남은것 = `${앞}\n\n${새블록}\n\n${뒤}`.replace(/\n{3,}/g, '\n\n').trim();

  return {
    html: 남은것,
    한일: '갈아끼움',
    뺀것,
    새블록,
    뺀길이: 공백빼고(뺀것).length,
    새길이: 공백빼고(새블록).length,
  };
}

/**
 * 그 섹션 말고는 앞뒤 본문이 그대로인지. 보내기 전 마지막 방어선이다.
 *
 * 우리가 직접 이어 붙인 결과이지만 `\n{3,}` 줄이기와 trim 이 끼어든다.
 * 그 정리가 **본문을 먹지 않았는지**를 공백 뺀 글자열로 확인한다.
 */
export function 그섹션만바뀌었나(before, after, 뺀것, 새블록) {
  const b = 공백빼고(before);
  const x = 공백빼고(뺀것);
  const n = 공백빼고(새블록);
  const i = x ? b.indexOf(x) : -1;
  // 뺀 것이 비어 있던 경우(소제목만 있고 내용이 없던 섹션)는 자리를 못 집으므로
  // 앞뒤가 모두 남아 있는지로만 본다.
  if (!x) {
    return 공백빼고(after).includes(n) && 공백빼고(after).length === b.length + n.length;
  }
  if (i === -1) return false;
  return b.slice(0, i) + n + b.slice(i + x.length) === 공백빼고(after);
}

/** 글 하나의 섹션을 갈아끼운다. apply 가 false 면 저장하지 않는다. */
export async function updateSectionInPost(postId, { apply = false, 소제목, 새내용 } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const title = post?.title?.raw || post?.title?.rendered || '';
  const base = { id: postId, title, status: post?.status, changed: false, backup: null };

  if (!손대도되는글인가(post?.link, wpConfig().base)) {
    return { ...base, skip: `wiki 밖의 글입니다 (${post?.link || '주소 없음'})` };
  }

  const content = post?.content?.raw ?? post?.content?.rendered ?? '';
  const r = updateSection(content, 소제목, 새내용);
  if (!r.한일) return { ...base, skip: r.이유 };

  if (!그섹션만바뀌었나(content, r.html, r.뺀것, r.새블록)) {
    throw new Error('그 섹션 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = null;
  if (apply) {
    backup = saveContentBackup({ id: postId, status: post?.status, title: post?.title, slug: post?.slug, content: post?.content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: r.html }, timeoutMs: 45000 });
  }
  return { ...base, 한일: r.한일, changed: true, backup, 뺀길이: r.뺀길이, 새길이: r.새길이, 뺀것: r.뺀것, 미리보기: !apply };
}

function 값(args, 이름) {
  const p = `--${이름}=`;
  const hit = args.find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : '';
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply') && !args.includes('--dry-run');
  const 소제목 = 값(args, 'heading');
  const 파일 = 값(args, 'file');
  const 글 = 값(args, 'text');
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  if (!ids.length || !소제목 || (!파일 && !글)) {
    console.error('사용법: node src/wordpress/update-section.mjs <글 번호> --heading="소제목" --file=<새 내용.md> [--apply]');
    console.error('        (--file 대신 --text="..." 로 바로 적어도 됩니다)');
    process.exit(1);
  }

  let 새내용 = 글;
  if (파일) {
    const abs = path.isAbsolute(파일) ? 파일 : path.join(ROOT, 파일);
    if (!fs.existsSync(abs)) { console.error(`파일을 찾을 수 없습니다: ${파일}`); process.exit(1); }
    새내용 = fs.readFileSync(abs, 'utf8');
  }

  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`🔄 '${소제목}' 섹션의 내용을 갈아끼웁니다${apply ? '' : ' (미리보기 — 저장하지 않습니다)'}`);
  console.log(`   대상 사이트: ${wpConfig().base.replace(/^https?:\/\//, '')}  ← 여기 글만 손댑니다`);
  console.log(`────────────────────────────────────────────────────────`);

  let 바꿀것 = 0; let 그대로 = 0;
  for (const id of ids) {
    try {
      const r = await updateSectionInPost(id, { apply, 소제목, 새내용 });
      if (r.skip) { 그대로 += 1; console.log(`[${id}] 건너뜀 — ${r.skip}`); continue; }
      바꿀것 += 1;
      console.log(`${apply ? '✅' : '  '} [${r.id}] ${r.status} · ${r.title.slice(0, 40)}`);
      console.log(`      ${r.뺀길이}자 → ${r.새길이}자 (공백 제외)`);
      console.log(`      빠지는 것: ${r.뺀것.replace(/\s+/g, ' ').slice(0, 120)}…`);
      if (apply) console.log(`      원본 백업: ${r.backup}`);
    } catch (err) {
      console.log(`❌ [${id}] ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\n갈아끼울 글 ${바꿀것}편 · 그대로 둘 글 ${그대로}편`);
  if (!apply && 바꿀것) console.log('실제로 바꾸려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
  console.log('※ 본문만 보냅니다. 소제목·제목·주소·발행상태는 건드리지 않습니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
