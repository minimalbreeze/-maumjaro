// 글 본문에서 **소제목 하나와 그 아래 내용**을 통째로 뺀다. AI를 부르지 않으므로 0원이다.
//
//   node src/wordpress/drop-section.mjs 9228 8643                 (미리보기)
//   node src/wordpress/drop-section.mjs 9228 8643 --apply         (적용)
//   node src/wordpress/drop-section.mjs 9228 --heading="안 쓴 것"  (소제목 지정)
//
// 왜 필요한가
//   초안 양식에서 '안 쓴 것'(무엇을 왜 안 썼는지 적은 **내부 메모**)을
//   `## ✍️ 본문` 아래에 뒀더니, 파서가 본문 이후 전부를 넘기는 탓에
//   그대로 글에 실려 올라갔다(2026-10-17). 9228·8643 이 그렇다.
//
//   왜 typo-fix 로 못 하나
//   typo-fix 는 **한 덩어리 문자열**을 찾아 바꾼다. 그런데 빼야 할 것이
//   소제목 블록 + 문단 블록이라 여러 줄에 걸친다. 그 여러 줄을 손에 넣으려면
//   `글 본문 보기 --raw` 출력을 이어 붙여야 하는데, 그 출력은 저장된 줄이
//   아니다 — raw줄로() 가 `-->` 뒤에서 또 쪼개고, 끝 공백을 버리고, 빈 줄을
//   버린다. 이어 붙이면 원본과 달라져서 **0곳**이 된다. 실제로 그렇게 됐다.
//
//   그래서 줄을 맞추려 들지 않고, 서버에서 받은 본문 위에서 블록 경계로
//   잘라낸다.
//
// 지키는 선
//   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
//   - 뺀 섹션 말고 **나머지 본문이 글자 하나까지 같아야** 저장한다.
//   - 소제목을 못 찾으면 아무것도 하지 않는다. 두 번 돌려도 안전하다.
//   - 고치기 전 원본 본문을 파일로 남긴다.
//   - wiki 밖의 글은 건드리지 않는다.

import { wpFetch, wpConfig } from './client.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

/** 기본으로 빼는 소제목. 초안 양식이 쓰던 말이다. */
export const DEFAULT_HEADING = '안 쓴 것';

/**
 * 소제목이 들어간 `<h2>` 를 찾아, 그 소제목이 담긴 **블록 주석째로** 집는다.
 *
 * 워드프레스 블록은 이렇게 생겼다.
 *
 *     <!-- wp:heading -->
 *     <h2>안 쓴 것 (의도적으로 뺐다)</h2>
 *     <!-- /wp:heading -->
 *
 * 여는 주석이 없을 수도 있어(옛 글) h2 자리부터로 물러선다.
 */
export function 소제목자리(html, 말) {
  const s = String(html || '');
  const re = new RegExp(`<h([1-6])[^>]*>(?:(?!</h\\1>).)*${말.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:(?!</h\\1>).)*</h\\1>`, 'is');
  const m = re.exec(s);
  if (!m) return null;

  let start = m.index;
  const 여는주석 = s.lastIndexOf('<!-- wp:heading', start);
  if (여는주석 !== -1 && s.slice(여는주석, start).trim().endsWith('-->')) start = 여는주석;

  let end = m.index + m[0].length;
  const 닫는주석 = s.indexOf('<!-- /wp:heading -->', end);
  if (닫는주석 !== -1 && !s.slice(end, 닫는주석).trim()) end = 닫는주석 + '<!-- /wp:heading -->'.length;

  return { start, end, level: Number(m[1]) };
}

/**
 * 그 소제목 아래 내용이 어디서 끝나는지. **다음 소제목이나 다음 블록**
 * 앞까지다. 자주 묻는 질문 구조화 데이터(wp:html) 를 삼키면 안 된다.
 */
export function 섹션끝(html, 시작, level) {
  const s = String(html || '');
  const 후보 = [];
  const 다음소제목 = new RegExp(`<h[1-${level}][^>]*>`, 'i').exec(s.slice(시작));
  if (다음소제목) 후보.push(시작 + 다음소제목.index);
  for (const 표식 of ['<!-- wp:html -->', '<!-- wp:heading']) {
    const i = s.indexOf(표식, 시작);
    if (i !== -1) 후보.push(i);
  }
  if (!후보.length) return s.length;
  let 끝 = Math.min(...후보);
  // 바로 앞의 여는 블록 주석까지 물러선다 — 주석만 덩그러니 남으면 안 된다.
  const 앞주석 = s.lastIndexOf('<!-- wp:', 끝);
  if (앞주석 > 시작 && 앞주석 === 끝) 끝 = 앞주석;
  return 끝;
}

/** 공백만 다른 것은 같은 것으로 본다. 블록 사이 줄바꿈이 한 줄 줄어들 수 있다. */
export function 공백빼고(s) {
  return String(s ?? '').replace(/\s+/g, '');
}

/**
 * 본문에서 그 섹션을 뺀 결과. 못 찾으면 한일: null.
 */
export function dropSection(html, 말 = DEFAULT_HEADING) {
  const s = String(html || '');
  const h = 소제목자리(s, 말);
  if (!h) return { html: s, 한일: null, 이유: `'${말}' 소제목이 없습니다` };

  const 끝 = 섹션끝(s, h.end, h.level);
  const 뺀것 = s.slice(h.start, 끝);
  const 남은것 = (s.slice(0, h.start) + s.slice(끝)).replace(/\n{3,}/g, '\n\n').trim();
  return { html: 남은것, 한일: '뺌', 뺀것, 뺀길이: 공백빼고(뺀것).length };
}

/**
 * 뺀 섹션 말고는 본문이 그대로인지. 보내기 전 마지막 방어선이다.
 *
 * 섹션은 본문 **중간**에서 빠진다. 그래서 `뒤 + 뺀것` 으로 이어 붙여
 * 비교하면 안 된다 — 순서가 어긋난다. 원본에서 뺀 자리를 찾아 그 자리만
 * 들어낸 것과 비교한다. (처음에 틀리게 짰고 검사가 잡았다.)
 */
export function 섹션만빠졌나(before, after, 뺀것) {
  const b = 공백빼고(before);
  const a = 공백빼고(after);
  const x = 공백빼고(뺀것);
  if (!x) return false;
  const i = b.indexOf(x);
  if (i === -1) return false;
  return b.slice(0, i) + b.slice(i + x.length) === a;
}

/** 글 하나에서 섹션을 뺀다. apply 가 false 면 저장하지 않는다. */
export async function dropSectionInPost(postId, { apply = false, 소제목 = DEFAULT_HEADING } = {}) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const title = post?.title?.raw || post?.title?.rendered || '';
  const base = { id: postId, title, status: post?.status, changed: false, backup: null };

  if (!손대도되는글인가(post?.link, wpConfig().base)) {
    return { ...base, skip: `wiki 밖의 글입니다 (${post?.link || '주소 없음'})` };
  }

  const content = post?.content?.raw ?? post?.content?.rendered ?? '';
  const { html, 한일, 이유, 뺀것, 뺀길이 } = dropSection(content, 소제목);
  if (!한일) return { ...base, skip: 이유 };

  if (!섹션만빠졌나(content, html, 뺀것)) {
    throw new Error('뺀 섹션 말고 다른 내용이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = null;
  if (apply) {
    backup = saveContentBackup({ id: postId, status: post?.status, title: post?.title, slug: post?.slug, content: post?.content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: html }, timeoutMs: 45000 });
  }
  return { ...base, 한일, changed: true, backup, 뺀것, 뺀길이, 미리보기: !apply };
}

function 값(args, 이름) {
  const p = `--${이름}=`;
  const hit = args.find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : '';
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply') && !args.includes('--dry-run');
  const 소제목 = 값(args, 'heading') || DEFAULT_HEADING;
  const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);

  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`🧹 '${소제목}' 소제목과 그 아래 내용을 뺍니다${apply ? '' : ' (미리보기 — 저장하지 않습니다)'}`);
  console.log(`   대상 사이트: ${wpConfig().base.replace(/^https?:\/\//, '')}  ← 여기 글만 손댑니다`);
  console.log(`────────────────────────────────────────────────────────`);

  if (!ids.length) {
    console.error('글 번호를 적으세요. 예: node src/wordpress/drop-section.mjs 9228 8643');
    process.exit(1);
  }

  let 바꿀것 = 0; let 그대로 = 0;
  for (const id of ids) {
    try {
      const r = await dropSectionInPost(id, { apply, 소제목 });
      if (r.skip) { 그대로 += 1; console.log(`[${id}] 건너뜀 — ${r.skip}`); continue; }
      바꿀것 += 1;
      console.log(`${apply ? '✅' : '  '} [${r.id}] ${r.status} · ${r.title.slice(0, 40)}`);
      console.log(`      뺀 분량: ${r.뺀길이}자(공백 제외)`);
      console.log(`      뺀 것 앞부분: ${r.뺀것.replace(/\s+/g, ' ').slice(0, 120)}…`);
      if (apply) console.log(`      원본 백업: ${r.backup}`);
    } catch (err) {
      console.log(`❌ [${id}] ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\n뺄 글 ${바꿀것}편 · 그대로 둘 글 ${그대로}편`);
  if (!apply && 바꿀것) console.log('실제로 빼려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
  console.log('※ 본문만 보냅니다. 제목·주소·발행상태는 건드리지 않습니다.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
