// 두 문단이 **용접된 자리**를 푼다. AI를 부르지 않으므로 0원이다.
//
//   node src/wordpress/fix-glued.mjs 1693
//   node src/wordpress/fix-glued.mjs 1693 --apply
//
// 무엇을 고치나 (2026-10-19 발견)
//   1693(제일CC 파3) 문단 세 개가 이렇게 생겼다.
//
//     "리베라CC 파3 이용료는 본 코스(비회원 평일 210,000원~ 주말
//      280,000원대)보다 훨씬 저렴해 … 실제 이용자 제일CC 파3 골프장의
//      이용료는 주중과 주말/공휴일로 나뉘어 있으며 …"
//
//   한 문단에 **두 글이 들어 있다.** 앞쪽은 다른 골프장(리베라CC) 이야기가
//   문장 중간에서 끊긴 것이고, 뒤쪽은 이 글의 제대로 된 내용이다.
//
//   용접 자리를 가리는 표식은 둘이다.
//     ① 한글 음절이 시설 이름에 바로 붙어 있다 — "티켓을 받으제일CC",
//        "대기 시간은 약 30분~1시간 발제일CC"
//     ② 앞 토막에 **다른 시설 이름**이 있다 — "리베라CC 파3 이용료는 …
//        실제 이용자 제일CC 파3 골프장의 이용료는 …"
//
//   ①만 보면 셋 중 둘만 잡힌다. 92번째 줄은 띄어쓰기가 살아 있어서
//   ②가 없으면 리베라CC 요금이 그대로 남는다. 실측으로 확인했다.
//
//   제일CC 요금을 보러 온 독자가 **리베라CC 요금(21만/28만원)을 먼저**
//   읽는다. 신뢰를 바로 깎는 오류라 분량을 늘리는 일보다 먼저다.
//
// 어떻게 고치나
//   **앞쪽 토막만 버린다.** 뒤쪽은 이 글의 제대로 된 문장이라 한 글자도
//   건드리지 않는다. 그래서 고친 뒤 문단은 언제나 고치기 전 문단의
//   **뒤 토막 그대로**다 — 검사가 그걸 지킨다.
//
//   새 문장을 쓰지 않는다. 지어낸 글자가 한 자도 들어가지 않으므로
//   AI 도 돈도 들지 않고, 틀릴 여지도 없다.
//
// 지키는 선
//   - content 하나만 보낸다. 제목·슬러그·발행상태는 보내지 않는다.
//   - 미리보기가 기본이다. `--apply` 를 붙여야 저장한다.
//   - 고치기 전 원본 본문을 파일로 남긴다.
//   - 문단 밖(소제목·목록·배너)은 건드리지 않는다.
//   - 버릴 토막이 10글자 미만이면 건너뛴다 — 이름이 우연히 붙은 자리일 수 있다.
//   - wiki 밖의 글은 건드리지 않는다.

import { wpFetch, wpConfig } from './client.mjs';
import { saveContentBackup } from './fix-alt.mjs';
import { 손대도되는글인가 } from './noindex.mjs';
import { 시설이름, 지명뿐인가 } from './facility-mix.mjs';
import { 발행글전부, 글유형 } from './index-audit.mjs';

/** 버릴 토막이 이보다 짧으면 용접이 아니라 우연으로 본다. */
export const 최소버릴길이 = 10;

/** 태그를 떼고 읽을 수 있게 만든다. 보여주기 전용이다. */
export const 글자만 = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/**
 * 문단 하나에서 용접 자리를 찾아 **앞 토막을 버린** 문단을 돌려준다.
 *
 * 못 찾으면 null 이다.
 */
export function 문단에서(문단, 이름, 다른이름 = []) {
  if (!이름) return null;
  const m = /^(<p\b[^>]*>)([\s\S]*)(<\/p>)$/.exec(String(문단 || '').trim());
  if (!m) return null;
  const [, 열기, 안, 닫기] = m;

  // 내 시설 이름이 나오는 자리를 앞에서부터 본다.
  for (let i = 안.indexOf(이름); i > 0; i = 안.indexOf(이름, i + 1)) {
    const 앞 = 안.slice(0, i);
    const 붙었나 = /[가-힣]$/.test(앞);                              // ① 음절이 붙어 있다
    const 남의것 = 다른이름.some((n) => n && n !== 이름 && 앞.includes(n)); // ② 다른 시설 이름
    if (!붙었나 && !남의것) continue;
    const 남길것 = 안.slice(i);
    if (글자만(앞).length < 최소버릴길이) continue;
    if (!글자만(남길것)) continue;
    return {
      문단: `${열기}${남길것}${닫기}`, 버린것: 앞, 남긴것: 남길것,
      표식: 붙었나 ? '문장이 잘린 채 붙었다' : '앞 토막이 다른 시설 이야기다',
    };
  }
  return null;
}

/**
 * 본문 전체에서 용접된 문단을 푼다.
 *
 * @returns {{html: string, 고친것: Array}}
 */
export function 용접푼것(content, 이름, 다른이름 = []) {
  const 고친것 = [];
  const html = String(content || '').replace(/<p\b[^>]*>[\s\S]*?<\/p>/g, (문단) => {
    const r = 문단에서(문단, 이름, 다른이름);
    if (!r) return 문단;
    고친것.push({ 전: 문단, 후: r.문단, 버린것: r.버린것, 표식: r.표식 });
    return r.문단;
  });
  return { html, 고친것 };
}

/**
 * 고친 뒤 본문이 **앞 토막을 버린 것뿐인지** 확인한다.
 *
 * 문단 밖이 바뀌었거나, 남긴 토막이 원래 문단의 뒤 토막이 아니면 거짓이다.
 */
export function 앞토막만버렸나(전, 후, 고친것) {
  let 기대 = String(전 || '');
  for (const c of 고친것) {
    if (!c.전.endsWith(c.후.slice(c.후.indexOf('>') + 1))) return false;  // 뒤 토막 그대로인가
    if (!기대.includes(c.전)) return false;
    기대 = 기대.replace(c.전, c.후);
  }
  return 기대 === String(후 || '');
}

/**
 * 가를 수 있는 시설 이름을 모은다. 지명 한 덩어리는 뺀다 —
 * '서울' 을 넣으면 "서울에서 40분" 문장이 전부 용접으로 잡힌다.
 */
export async function 시설이름들() {
  const 글 = await 발행글전부();
  return [...new Set(
    글.filter((p) => 글유형(p.title) === '시설').map((p) => 시설이름(p.title))
      .filter((n) => n && !지명뿐인가(n)),
  )];
}

/** 글 하나를 고친다. */
export async function fixOne(postId, { apply = false, 이름: 준이름 = '', 다른이름 = [] } = {}) {
  const { data } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const title = data?.title?.raw ?? data?.title?.rendered ?? '';
  const content = data?.content?.raw ?? data?.content?.rendered ?? '';
  const 결과 = { id: postId, title };

  // 두 번째 인자(우리 사이트 주소)를 빼면 **모든 글이 남의 글**이 된다.
  // 2026-10-19 에 그래서 미리보기가 5편 전부 건너뛰고 0편으로 끝났다.
  if (!손대도되는글인가(data?.link, wpConfig().base)) {
    return { ...결과, skip: 'wiki 밖의 글입니다 — 건드리지 않습니다' };
  }

  const 이름 = 준이름 || 시설이름(title);
  if (!이름) return { ...결과, skip: '제목에서 시설 이름을 못 뽑았습니다' };

  const { html, 고친것 } = 용접푼것(content, 이름, 다른이름);
  if (!고친것.length) return { ...결과, 이름, skip: '용접된 문단이 없습니다' };
  if (!앞토막만버렸나(content, html, 고친것)) {
    throw new Error('앞 토막 버리기 말고 다른 것이 바뀌었습니다 — 저장하지 않습니다');
  }

  let backup = '';
  if (apply) {
    backup = saveContentBackup({ id: postId, status: data?.status, title, slug: data?.slug, content });
    await wpFetch(`/wp/v2/posts/${postId}`, { method: 'POST', body: { content: html } });
  }
  return { ...결과, 이름, 고친것, backup, applied: apply };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const 이름플래그 = args.find((a) => a.startsWith('--이름='));
  const ids = args.filter((a) => /^\d+$/.test(a));

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🩹 용접된 문단 풀기 (${apply ? '실제 적용' : '미리보기'} · 비용 0원)`);
  console.log('────────────────────────────────────────────────────────');

  if (!ids.length) {
    console.log('\n글 번호를 적어 주세요. 예: node src/wordpress/fix-glued.mjs 1693\n');
    process.exitCode = 1;
    return;
  }

  const 다른이름 = await 시설이름들();
  console.log(`\n가를 수 있는 시설 이름 ${다른이름.length}개를 모았습니다 (지명 한 덩어리는 제외)`);

  let 바뀐글 = 0;
  let 바뀐문단 = 0;
  for (const id of ids) {
    let r;
    try {
      r = await fixOne(Number(id), { apply, 다른이름, 이름: 이름플래그 ? 이름플래그.split('=')[1] : '' });
    } catch (e) {
      console.log(`\n   ${id}  ❌ ${e.message}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`\n   ${r.id}  ${String(r.title).slice(0, 50)}`);
    if (r.skip) { console.log(`        ⏭️  ${r.skip}`); continue; }
    console.log(`        시설 이름: ${r.이름}  ·  용접된 문단 ${r.고친것.length}개`);
    바뀐글 += 1;
    바뀐문단 += r.고친것.length;
    r.고친것.forEach((c, i) => {
      console.log(`\n        [${i + 1}] ${c.표식} · 버릴 앞 토막 ${글자만(c.버린것).length}자`);
      console.log(`            ❌ ${글자만(c.버린것)}`);
      console.log(`        [${i + 1}] 남길 뒤 토막 — 한 글자도 안 바꿉니다`);
      console.log(`            ✅ ${글자만(c.후).slice(0, 160)}${글자만(c.후).length > 160 ? '…' : ''}`);
    });
    if (r.backup) console.log(`\n        💾 원본 보관: ${r.backup}`);
  }

  console.log(`\n${apply ? '적용했습니다' : '미리보기입니다 — 적용하려면 --apply 를 붙입니다'}.`);
  console.log(`\n▶ 글 ${바뀐글}편에서 용접된 문단 ${바뀐문단}개를 ${apply ? '풀었습니다' : '풀 수 있습니다'}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (await import('../utils/env.mjs')).loadEnv();
  await main();
}
