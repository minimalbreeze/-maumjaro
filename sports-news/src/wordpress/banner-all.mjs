// 배너 도구(add-watch·add-banner)를 **발행글 전체**에 돌리는 드라이버다.
// AI 를 부르지 않으므로 0원이다.
//
// 왜 필요한가
//   배너 설정(config/watch-links.json·official-links.json)은 운영자가 주소를
//   줄 때마다 늘어난다. 10-17 에 배드민턴, 10-18 에 골프 8개 투어와 아시안투어가
//   들어왔다. 그런데 **설정을 늘려도 이미 올린 글은 바뀌지 않는다.** 두 도구가
//   글 번호를 하나씩 받게 돼 있어서, 357편 중계 글에 돌릴 길이 없었다.
//   그래서 "설정에는 있는데 글에는 없는" 배너가 쌓여 있다.
//
// 안전선
//   - 넣는 일 자체는 두 도구가 그대로 한다. **여기서 새로 만들지 않는다.**
//     본문만 보내기·저장 전 확인·백업·두 번 돌려도 안 겹침은 그쪽 것이다.
//   - **글마다 공개 주소의 호스트를 확인한다.** 여러 글을 한 번에 고치는
//     도구가 됐으므로 지시서가 요구하는 검사다 — wiki 밖은 건너뛴다.
//     (in.minimalbreeze.com 은 이미 돈을 버는 사이트다)
//   - 미리보기(apply=false)가 기본이다.

import { 발행글전부, 글유형 } from './index-audit.mjs';
import { 손대도되는글인가 } from './noindex.mjs';

/**
 * 손댈 글만 고른다. **순수 함수다** — 네트워크를 쓰지 않아 테스트가 쉽다.
 *
 * @param {Array} 글      발행글전부() 가 준 목록
 * @param {string} 유형   '중계'·'시설' 처럼 한 유형만. 비우면 전부
 * @param {string} base   WORDPRESS_URL
 */
export function 고를글(글, { 유형 = '', base = '' } = {}) {
  const 목록 = Array.isArray(글) ? 글 : [];
  const 뽑힌것 = [];
  const 버린것 = { 남의사이트: 0, 다른유형: 0 };
  for (const p of 목록) {
    if (!손대도되는글인가(p?.link, base)) { 버린것.남의사이트 += 1; continue; }
    if (유형 && 글유형(p?.title) !== 유형) { 버린것.다른유형 += 1; continue; }
    뽑힌것.push(p);
  }
  return { 뽑힌것, 버린것 };
}

/** `--유형=중계` 같은 꼬리말을 읽는다. 없으면 빈 문자열. */
export function 유형읽기(argv) {
  const m = (Array.isArray(argv) ? argv : []).map(String)
    .find((a) => a.startsWith('--유형='));
  return m ? m.slice('--유형='.length).trim() : '';
}

/** `--limit=120` 을 읽는다. 없거나 이상하면 0(제한 없음). */
export function 제한읽기(argv) {
  const m = (Array.isArray(argv) ? argv : []).map(String)
    .find((a) => a.startsWith('--limit='));
  const n = m ? Number(m.slice('--limit='.length)) : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * 발행글 전체에 배너 넣기를 돌린다.
 *
 * @param {Function} 넣기  글 하나를 처리하는 함수. (id, opts) => {skip?, 한일?, …}
 * @param {object}   opts
 */
export async function 전수(넣기, {
  유형 = '',
  limit = 0,
  apply = false,
  base = process.env.WORDPRESS_URL || '',
  넣기옵션 = {},
  글목록 = null,
  찍기 = console.log,
} = {}) {
  const 글 = 글목록 || await 발행글전부();
  찍기(`\n발행된 글 ${글.length}편`);

  const { 뽑힌것, 버린것 } = 고를글(글, { 유형, base });
  if (버린것.남의사이트) 찍기(`   wiki 밖이라 건너뜀 ${버린것.남의사이트}편`);
  if (유형) 찍기(`   '${유형}' 유형 ${뽑힌것.length}편 (다른 유형 ${버린것.다른유형}편 건너뜀)`);

  const 할것 = limit ? 뽑힌것.slice(0, limit) : 뽑힌것;
  찍기(`   손댈 글 ${할것.length}편${apply ? '' : ' (미리보기 — 저장하지 않습니다)'}\n`);

  const 센것 = { 넣음: 0, 건너뜀: 0, 실패: 0 };
  const 건너뛴이유 = new Map();
  for (const p of 할것) {
    try {
      const r = await 넣기(p.id, { ...넣기옵션, apply });
      if (r?.skip) {
        센것.건너뜀 += 1;
        건너뛴이유.set(r.skip, (건너뛴이유.get(r.skip) || 0) + 1);
        continue;
      }
      센것.넣음 += 1;
      찍기(`   ${apply ? '✅' : '•'} ${p.id}  ${r?.한일 || '넣음'}: ${r?.url || ''}  ${String(p.title).slice(0, 40)}`);
    } catch (err) {
      센것.실패 += 1;
      찍기(`   ❌ ${p.id}  실패: ${err?.message || err}`);
    }
  }

  찍기(`\n${apply ? '넣은' : '넣을'} 글 ${센것.넣음}편 · 건너뛴 글 ${센것.건너뜀}편 · 실패 ${센것.실패}편`);
  if (건너뛴이유.size) {
    찍기('   건너뛴 이유:');
    for (const [이유, n] of [...건너뛴이유].sort((a, b) => b[1] - a[1])) {
      찍기(`     ${String(n).padStart(4)}편  ${이유}`);
    }
  }
  if (!apply) 찍기('   실제로 넣으려면 --apply 를 붙이세요. 지금은 아무것도 바꾸지 않았습니다.');
  찍기('   ※ 본문만 보냅니다. 제목·주소·발행상태는 건드리지 않습니다.\n');
  if (센것.실패) process.exitCode = 1;
  return 센것;
}
