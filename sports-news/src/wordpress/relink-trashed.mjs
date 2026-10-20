// 휴지통으로 보낸 글을 가리키는 링크를, 남긴 쪽 글로 돌려준다.
//
//   node src/wordpress/relink-trashed.mjs            바뀔 것만 보여준다 (기본)
//   node src/wordpress/relink-trashed.mjs --apply    실제로 고친다
//
// 왜 필요한가
//   중복 글 5편을 휴지통으로 보냈고, broken-links 로 세어 보니 아직 4편이
//   그 글들을 가리킨다(전부 본문에 직접 쓴 링크다 — 자동 상자는 '글끼리
//   링크 다시 맞추기' 가 이미 치웠다). 깨진 링크로 들어온 구글은 404 를
//   받는다. 지운 글과 **같은 시설을 다룬 남은 글**이 있으니 거기로 보낸다.
//
// 지키는 선
//   - **짝은 config/relink.json 에 사람이 적는다.** 코드가 "닮았으니 이 글
//     일 것" 이라고 추측하지 않는다. 틀린 글로 보내는 링크는 깨진 링크보다
//     나쁘다 — 읽는 사람이 속는다.
//   - **미리보기가 기본이다.** --apply 가 없으면 아무것도 보내지 않는다.
//   - **href 만 바꾼다.** 앵커 글자(사람이 보는 말)는 건드리지 않는다. 짝은
//     같은 시설을 다룬 글이라 그 말이 그대로 맞다.
//   - 고치기 전에 원래 본문을 파일로 남긴다.
//   - wiki 밖의 글은 건드리지 않는다.
//   - 살릴 글이 발행 상태가 아니면 건너뛴다. 휴지통에서 휴지통으로 보내는
//     링크를 만들지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wpFetch, wpConfig } from './client.mjs';
import { 손대도되는글인가, saveBackup } from './noindex.mjs';
import { 본문과함께, 꼬리뗀슬러그 } from './broken-links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function 짝읽기(파일 = path.join(ROOT, 'config', 'relink.json')) {
  const 날것 = JSON.parse(fs.readFileSync(파일, 'utf8'));
  return Array.isArray(날것?.짝) ? 날것.짝 : [];
}

/**
 * 본문에서 죽은 슬러그로 가는 href 를 새 주소로 바꾼다.
 *
 * href 속성 안에서만 바꾼다. 본문에 글자로 적힌 주소(링크가 아닌 것)까지
 * 바꾸면 사람이 쓴 문장을 건드리는 셈이다.
 *
 * 슬러그는 한글 그대로 적히기도 하고 퍼센트 인코딩으로 적히기도 하므로 둘
 * 다 본다. 대소문자도 맞춰 본다 — encodeURIComponent 는 대문자로 만들고
 * 워드프레스가 적어 둔 것은 소문자다(delete-post 의 가리키나 와 같은 함정).
 */
export function href바꾸기(html, 죽은슬러그들, 새주소) {
  let 본문 = String(html || '');
  if (!새주소) return 본문;
  const 후보 = new Set();
  for (const s of 죽은슬러그들 || []) {
    const 날것 = String(s || '').replace(/^\/+|\/+$/g, '');
    if (!날것) continue;
    후보.add(날것);
    try { 후보.add(encodeURIComponent(날것)); } catch { /* 그대로 둔다 */ }
    try { 후보.add(decodeURIComponent(날것)); } catch { /* 그대로 둔다 */ }
  }
  for (const s of 후보) {
    // href="...(아무것)/<슬러그>/?..." 를 통째로 새 주소로 바꾼다.
    const 패턴 = new RegExp(
      `(href\\s*=\\s*["'])[^"']*/${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?(?:[?#][^"']*)?(["'])`,
      'gi',
    );
    본문 = 본문.replace(패턴, `$1${새주소}$2`);
  }
  return 본문;
}

/** 한 글에서 바꿀 것이 있나. 있으면 바뀐 본문을 돌려준다. */
export function 고칠본문(post, 짝목록) {
  let 본문 = String(post?.content || '');
  const 바꾼것 = [];
  for (const 짝 of 짝목록 || []) {
    if (!짝?.새주소) continue;
    const 전 = 본문;
    본문 = href바꾸기(본문, 짝.슬러그들, 짝.새주소);
    if (본문 !== 전) 바꾼것.push(짝);
  }
  return 바꾼것.length ? { content: 본문, 바꾼것 } : null;
}

async function main() {
  const 적용 = process.argv.includes('--apply');
  const base = wpConfig().base;

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`🔗 휴지통 링크를 남긴 글로 돌려주기 ${적용 ? '(실제 적용)' : '(미리보기 · 비용 0원)'}`);
  console.log(`   대상 사이트: ${new URL(base).host}`);
  console.log('────────────────────────────────────────────────────────');

  const 짝 = 짝읽기();
  if (!짝.length) { console.log('\n   config/relink.json 에 짝이 없습니다.\n'); return; }

  // 살릴 글의 현재 주소를 직접 받아 쓴다. 주소를 손으로 적으면 슬러그가
  // 바뀌었을 때 또 깨진 링크를 만든다.
  const 준비 = [];
  for (const p of 짝) {
    try {
      const { data } = await wpFetch(`/wp/v2/posts/${p.살릴글}`, { query: { context: 'edit' } });
      if (data?.status !== 'publish') {
        console.log(`   ⏭  ${p.죽은슬러그} → ${p.살릴글} 은 발행 상태가 아닙니다(${data?.status}). 건너뜁니다.`);
        continue;
      }
      준비.push({ ...p, 슬러그들: 꼬리뗀슬러그(p.죽은슬러그), 새주소: data.link, 살릴제목: data?.title?.raw || '' });
    } catch (err) {
      console.log(`   ⏭  ${p.죽은슬러그} → ${p.살릴글} 을 받지 못했습니다: ${err.message}`);
    }
  }
  console.log(`\n짝 ${준비.length}개를 쓸 수 있습니다:`);
  for (const p of 준비) console.log(`   ${p.죽은슬러그} → [${p.살릴글}] ${p.살릴제목}`);

  const 발행글 = (await 본문과함께()).filter((p) => 손대도되는글인가(p.link, base));
  const 할일 = [];
  for (const post of 발행글) {
    const r = 고칠본문(post, 준비);
    if (r) 할일.push({ post, ...r });
  }

  for (const { post, 바꾼것 } of 할일) {
    console.log(`\n   [${post.id}] ${post.title}`);
    for (const p of 바꾼것) console.log(`     ${p.죽은슬러그} → ${p.새주소}`);
  }

  if (!적용) {
    console.log('\n실제로 고치려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
    console.log('※ href 만 바꿉니다. 사람이 보는 앵커 글자는 그대로 둡니다.');
    console.log(`\n▶ 고칠 글 ${할일.length}편 · 고칠 링크 ${할일.reduce((n, x) => n + x.바꾼것.length, 0)}개\n`);
    return;
  }

  let 성공 = 0;
  for (const { post, content } of 할일) {
    try {
      saveBackup({ id: post.id, title: post.title, content: post.content });
      await wpFetch(`/wp/v2/posts/${post.id}`, { method: 'POST', body: { content } });
      성공 += 1;
      console.log(`   ✅ ${post.id} 고쳤습니다`);
    } catch (err) {
      console.log(`   ❌ ${post.id} 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n▶ ${성공}편을 고쳤습니다. 원래 본문은 out/backup/ 에 있습니다.`);
  console.log("   '휴지통 때문에 깨진 링크 세기' 로 0편이 되었는지 확인하세요.\n");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
