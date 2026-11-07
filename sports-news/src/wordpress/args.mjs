// 명령줄 인자를 읽는 작은 도우미.
//
// 왜 따로 두나 (2026-11-07 에 당했다)
//   `node fix-lead.mjs --한번에 10` 을 돌렸더니 **10번 글**을 고치려 했다.
//
//     ❌ 10 경로를 찾을 수 없음(404)
//
//   글 번호를 `args.filter((a) => /^\d+$/.test(a))` 로 골랐는데, 그 걸러내기가
//   `--한번에` 의 값 `10` 까지 글 번호로 집어간 것이다. 숫자를 값으로 받는
//   옵션이 하나라도 있으면 늘 나는 실수라 한 군데로 모아 둔다.

/** 숫자 값을 받는 옵션. 값을 돌려주고, 그 값은 글 번호로 세지 않는다. */
export function 숫자옵션(args, 이름, 기본값) {
  const i = args.indexOf(이름);
  if (i < 0) return 기본값;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : 기본값;
}

/**
 * 글 번호만 고른다. **숫자 값을 받는 옵션의 값은 빼고** 고른다.
 *
 * @param 숫자옵션들 예: ['--한번에', '--limit']
 */
export function 글번호들(args, 숫자옵션들 = []) {
  const 값자리 = new Set();
  for (const 이름 of 숫자옵션들) {
    const i = args.indexOf(이름);
    if (i >= 0) 값자리.add(i + 1);
  }
  return args.filter((a, i) => /^\d+$/.test(a) && !값자리.has(i));
}
