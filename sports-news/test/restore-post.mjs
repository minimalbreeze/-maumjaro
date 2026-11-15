#!/usr/bin/env node
/** 휴지통 복원 검사. (2026-11-15) */
import { 꼬리뗀슬러그 } from '../src/wordpress/restore-post.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/utils/env.mjs';

let 통과 = 0;
let 실패 = 0;
function ok(이름, 참인가) {
  if (참인가) { 통과 += 1; console.log(`  ✅ ${이름}`); }
  else { 실패 += 1; console.log(`  ❌ ${이름}`); }
}

console.log('\n[1] 휴지통 꼬리를 뗀다');
{
  // 워드프레스는 휴지통에 넣을 때 슬러그 끝에 __trashed 를 붙인다.
  // 상태만 되돌리면 주소가 그대로 남아 링크가 전부 깨진다.
  ok('__trashed 를 뗀다', 꼬리뗀슬러그('노시환-포스팅-307억__trashed') === '노시환-포스팅-307억');
  ok('꼬리가 없으면 그대로', 꼬리뗀슬러그('노시환-포스팅-307억') === '노시환-포스팅-307억');
  ok('끝에 있을 때만 뗀다', 꼬리뗀슬러그('__trashed-글') === '__trashed-글');
  ok('빈 값에 터지지 않는다', 꼬리뗀슬러그('') === '' && 꼬리뗀슬러그(null) === '');
  // 두 번 붙은 경우는 한 번만 뗀다 — 워드프레스가 그렇게 만들지 않지만
  // 터지지 않는지 본다.
  ok('두 번 붙어도 터지지 않는다', 꼬리뗀슬러그('글__trashed__trashed') === '글__trashed');
}

console.log('\n[2] 지키는 선');
{
  const s = fs.readFileSync(path.join(ROOT, 'src/wordpress/restore-post.mjs'), 'utf8');
  ok('미리보기가 기본이다', /const apply = args\.includes\('--apply'\)/.test(s) && /if \(!apply\) continue;/.test(s));
  // 되살리는 것과 다시 내보내는 것은 다른 결정이다.
  ok('임시글로 되살린다 — 발행하지 않는다', /status: 'draft'/.test(s) && !/status: 'publish'/.test(s));
  ok('휴지통에 있는 글만 건드린다', /post\?\.status !== 'trash'/.test(s));
  ok('wiki 밖은 건너뛴다', /손대도되는글인가/.test(s));
  // 본문·제목을 보내면 되살리기가 아니라 덮어쓰기가 된다.
  ok('본문을 보내지 않는다', !/body:[^}]*content/.test(s));
  // ⚠️ 2026-11-15. { status, slug } 를 한 번에 보냈더니 200 이 왔는데
  //    **상태가 trash 그대로**였다. 워드프레스가 휴지통 글의 슬러그를
  //    스스로 관리해서(__trashed), 같은 요청에서 슬러그를 손대면 상태
  //    변경이 묻힌다. 두 번에 나눠 보낸다.
  ok('상태를 따로 보낸다', /body: \{ status: 'draft' \}/.test(s));
  ok('슬러그를 따로 보낸다', /body: \{ slug: 지금슬러그 \}/.test(s));
  ok('한 번에 묶어 보내지 않는다', !/body: \{ status: 'draft', slug/.test(s));
  // ⚠️ 보내고 끝내지 않는다. 처음 판은 응답을 보지 않아 "되살렸습니다" 를
  //    찍고도 실제로는 아무것도 안 바뀌어 있었다.
  ok('보낸 뒤 상태를 읽어 확인한다', /확인\?\.status !== 'draft'/.test(s));
  ok('안 바뀌었으면 경고하고 멈춘다', /상태가 바뀌지 않았습니다/.test(s) && /process\.exitCode = 1/.test(s));
  ok('슬러그도 읽어 확인한다', /끝\?\.slug !== 지금슬러그/.test(s));
}

console.log(`\n  ${통과}개 통과${실패 ? ` · ${실패}개 실패` : ''}`);
if (실패) process.exit(1);
