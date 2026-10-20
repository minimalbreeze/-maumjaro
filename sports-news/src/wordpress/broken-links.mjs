// 휴지통으로 보낸 글을 가리키는 **깨진 링크**를 센다. 아무것도 고치지 않는다.
//
//   node src/wordpress/broken-links.mjs
//
// 왜 필요한가
//   2026-10-19~20 에 중복 글 5편(1625·415·481·1105·379)을 휴지통으로 보냈다.
//   1625 때는 그 글을 가리키던 글이 4편 있었고, 링크 다시 맞추기와 손수정으로
//   0으로 만들었다. 나머지 4편은 **세어 본 적이 없다.**
//
//   깨진 링크를 그냥 두면 구글이 그 경로로 들어와 404 를 받는다. 구글은
//   주로 다른 페이지의 링크를 통해 새 페이지를 찾는다(sports-news/CLAUDE.md
//   ② 절). 들어오는 길에 404 를 깔아 두는 것은 색인에 가장 나쁜 쪽이다.
//
// 지키는 선
//   - **읽기만 한다.** POST 를 보내는 길이 이 파일에 없다. 고치는 것은
//     '글끼리 링크 다시 맞추기'(자동 상자)와 사람 손(본문에 직접 쓴 링크)이다.
//   - **휴지통에 있는 글의 슬러그만** 본다. "발행 목록에 없는 주소는 다 깨진
//     것" 식으로 세지 않는다 — 카테고리·고정페이지 링크까지 깨진 것으로
//     잡아서 숫자를 못 믿게 된다. 그래서 이 도구는 **휴지통 때문에 깨진 것**만
//     센다. 그 밖의 깨진 링크가 없다는 보장은 없다.
//   - wiki 밖의 글은 세지 않는다.

import { wpFetch, wpConfig } from './client.mjs';
import { 가리키나 } from './delete-post.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

/**
 * 휴지통 글의 슬러그에서 워드프레스가 붙인 꼬리를 뗀다.
 *
 * ⚠️ 2026-10-20 에 이것 때문에 **0편이라고 거짓 보고했다.** 워드프레스는 글을
 *    휴지통에 넣을 때 슬러그 뒤에 `__trashed` 를 붙인다. API 가 돌려주는 것은
 *    그 바뀐 슬러그다:
 *
 *      379  서평택-골프클럽-파3__trashed
 *
 *    그런데 다른 글 본문에 적혀 있는 링크는 **바뀌기 전 주소**다. 꼬리를 달고
 *    찾으면 당연히 한 편도 안 나오고, 도구는 "깨진 링크 0편" 이라고 말한다.
 *    치울 것이 남았는지 보려고 만든 도구가 정반대로 안심시키는 셈이다.
 *
 * 꼬리를 뗀 것과 그대로인 것을 둘 다 본다 — 본문에 어느 쪽이 적혀 있을지는
 * 글에 따라 다르고, 둘 다 보는 쪽이 놓치지 않는다.
 */
export function 꼬리뗀슬러그(slug) {
  const s = String(slug || '').trim();
  const 뗀것 = s.replace(/__trashed(?:-\d+)?$/, '');
  return [...new Set([뗀것, s])].filter(Boolean);
}

/** 휴지통에 있는 글의 번호·슬러그·제목. */
export async function 휴지통글() {
  const { data } = await wpFetch('/wp/v2/posts', {
    query: { per_page: 100, status: 'trash', context: 'edit' },
    timeoutMs: 40000,
  });
  return (Array.isArray(data) ? data : []).map((p) => {
    const 날것 = decodeURIComponent(p.slug || '');
    return {
      id: p.id,
      slug: 날것,
      // 본문에서 찾을 때 쓰는 주소들 (휴지통 꼬리를 뗀 것 포함)
      슬러그들: 꼬리뗀슬러그(날것),
      title: p.title?.raw || p.title?.rendered || '',
    };
  });
}

/**
 * 발행글을 본문과 함께 받는다.
 *
 * index-audit 의 발행글전부() 는 본문을 버린다. 글마다 따로 받으면 633번이
 * 들어 30분 제한에 걸린다(실제로 걸렸다). 목록 응답(context=edit)에 본문이
 * 이미 들어 있으므로 100편씩 7번으로 끝낸다.
 */
export async function 본문과함께({ perPage = 100, max = 2000 } = {}) {
  const 모음 = [];
  for (let page = 1; 모음.length < max; page += 1) {
    const { data } = await wpFetch('/wp/v2/posts', {
      query: {
        per_page: perPage, page, status: 'publish', context: 'edit',
        orderby: 'date', order: 'desc',
      },
      timeoutMs: 60000,
    });
    const 목록 = Array.isArray(data) ? data : [];
    if (!목록.length) break;
    for (const p of 목록) {
      모음.push({
        id: p.id,
        title: p.title?.raw || p.title?.rendered || '',
        link: p.link || '',
        content: p.content?.raw || p.content?.rendered || '',
      });
    }
    if (목록.length < perPage) break;
  }
  return 모음;
}

/**
 * 어느 글이 어느 휴지통 글을 가리키는가.
 *
 * 돌려주는 모양: [{ post, 가리킨것: [{ id, slug, title }] }]
 */
export function 깨진것찾기(발행글, 휴지통) {
  const 결과 = [];
  for (const p of Array.isArray(발행글) ? 발행글 : []) {
    const 가리킨것 = (Array.isArray(휴지통) ? 휴지통 : [])
      .filter((t) => {
        // 슬러그들 이 없으면 slug 에서 직접 만든다 — 손으로 만든 값도 받는다.
        const 후보 = Array.isArray(t.슬러그들) && t.슬러그들.length ? t.슬러그들 : 꼬리뗀슬러그(t.slug);
        return 후보.some((s) => s && 가리키나(p.content, s));
      });
    if (가리킨것.length) 결과.push({ post: p, 가리킨것 });
  }
  return 결과;
}

async function main() {
  const base = wpConfig().base;
  console.log('\n────────────────────────────────────────────────────────');
  console.log('🔗 휴지통 글을 가리키는 깨진 링크 세기 (고치지 않음 · 비용 0원)');
  console.log(`   대상 사이트: ${new URL(base).host}`);
  console.log('────────────────────────────────────────────────────────');

  const 휴지통 = await 휴지통글();
  if (!휴지통.length) {
    console.log('\n   휴지통이 비어 있습니다. 셀 것이 없습니다.\n');
    return;
  }
  console.log(`\n휴지통 ${휴지통.length}편:`);
  for (const t of 휴지통) console.log(`   [${t.id}] ${t.슬러그들.join(' / ')}  ${t.title}`);

  const 발행글 = (await 본문과함께()).filter((p) => 손대도되는글인가(p.link, base));
  console.log(`\n발행글 ${발행글.length}편의 본문을 봤습니다.`);

  const 깨진것 = 깨진것찾기(발행글, 휴지통);
  for (const { post, 가리킨것 } of 깨진것) {
    console.log(`\n   ❌ [${post.id}] ${post.title}`);
    for (const t of 가리킨것) console.log(`        → ${t.slug} (휴지통 ${t.id})`);
  }

  // 휴지통 글마다 몇 편이 걸렸는지. 어느 삭제가 아직 안 치워졌는지 보려는 것이다.
  const 글마다 = 휴지통.map((t) => ({
    t, 수: 깨진것.filter((x) => x.가리킨것.some((y) => y.id === t.id)).length,
  }));

  // 숫자를 맨 끝에 찍는다 — GitHub 로그 요약은 tail -60 만 보여준다.
  console.log('\n▶ 휴지통 글별 걸린 링크');
  for (const { t, 수 } of 글마다) console.log(`   ${t.id} ${t.slug} → ${수}편`);
  console.log(`\n▶ 깨진 링크가 있는 글 ${깨진것.length}편`);
  if (!깨진것.length) {
    console.log('   깨진 링크가 없습니다. (휴지통 때문에 깨진 것만 셌습니다 —');
    console.log('   그 밖의 깨진 링크가 없다는 보장은 아닙니다.)');
  } else {
    console.log("   자동 상자는 '글끼리 링크 다시 맞추기' 로, 본문에 직접 쓴");
    console.log('   링크는 사람 손으로 고칩니다. 이 도구는 고치지 않습니다.');
  }
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
