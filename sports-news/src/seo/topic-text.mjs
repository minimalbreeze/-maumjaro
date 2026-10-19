// 배너를 고를 때 보는 "이 글의 주제 본문"만 남긴다.
//
// 왜 필요한가 (2026-10-19)
//   공식 배너를 655편에 돌려 보니 바둑 글(119, '제1회 북해신역배 세계바둑오픈')에
//   **당구 PBA 공식 홈페이지**가 붙으려 했다. 바둑 글에 'PBA' 가 있을 자리는
//   하나뿐이다 — 본문 끝의 "🔗 같이 읽을 글" 목록에 PBA 글 제목이 들어 있었다.
//
//   배너 고르기(pickOfficial·pickWatchLinks)는 낱말이 몇 번 나오는지로 고른다.
//   그런데 넘겨받는 글이 `제목 + 본문 전체` 라서, **다른 글 제목이 이 글의
//   배너를 결정하고 있었다.** 이미 들어간 배너 글자와 쿠팡 광고도 같이 세어졌다.
//
//   중계 배너는 카테고리로 한 번 걸러서 이 사고가 덜 났다(119 는 바둑TV 로
//   제대로 갔다). 그래도 골프처럼 한 카테고리에 투어가 여덟 개인 곳에서는
//   "같이 읽을 글"이 투어 선택을 흔들 수 있다. 그래서 두 도구가 같이 쓴다.
//
// ⚠️ 이 함수가 돌려준 글은 **고르는 데만 쓴다. 절대 저장하지 않는다.**
//    블록을 중간에서 자르기 때문에 HTML 로는 깨져 있다. 낱말을 세는 용도다.

import { WATCH_MARK, allWatchLabels, DEFAULT_WATCH_LABEL } from './watch-banner.mjs';
import { OFFICIAL_MARK } from './official-banner.mjs';
import { APP_MARK } from './app-banner.mjs';
import { LINK_SIGN } from '../wordpress/internal-links.mjs';
import { COUPANG_MARK } from '../wordpress/move-coupang.mjs';
import { NOTICE_MARK } from '../wordpress/add-notice.mjs';

/**
 * 본문 끝에서 "다른 글 제목이 모여 있는 꼬리"를 여는 말들.
 *
 * LINK_SIGN 은 internal-links.mjs 가 넣는다. 나머지는 **글을 쓸 때 본문에
 * 직접 적힌 것**이라 코드가 모르고 있었다(2026-10-19 발견). 파3 골프장
 * 글들이 '함께 읽으면 좋은 글' 아래에 다른 골프장 이름을 줄줄이 적어 두는데,
 * 그게 배너 고르기에 투표하고 있었다 — #206 과 같은 사고의 연장이다.
 */
export const 꼬리말들 = [
  LINK_SIGN,
  '함께 읽으면 좋은 글',
  '함께 보면 좋은 글',
  '같이 보면 좋은 글',
  '참고 자료',
];

/** 블록 안에 이 말이 있으면 그 블록은 주제가 아니다. */
export function 걷어낼표식() {
  const 모음 = new Set([
    WATCH_MARK, OFFICIAL_MARK, APP_MARK, COUPANG_MARK, NOTICE_MARK, DEFAULT_WATCH_LABEL,
  ]);
  // 중계 배너 머리글은 설정에서 바뀐다. 설정에 적힌 것을 모두 걷어낸다 —
  // 하나라도 빠지면 그 배너의 글자가 다시 투표권을 갖는다.
  for (const l of allWatchLabels()) if (l) 모음.add(l);
  return [...모음].filter(Boolean);
}

/**
 * 배너를 고를 때 볼 글만 남긴다.
 *
 * 걷어내는 것
 *   ① "🔗 같이 읽을 글" 부터 끝까지 — 전부 **다른 글** 제목이다
 *   ② 배너·광고·안내 블록(wp:html) — 이 글의 주제가 아니다
 */
export function 주제만(html) {
  let s = String(html ?? '');
  if (!s) return '';

  // ① 다른 글 제목이 모여 있는 꼬리를 자른다. **가장 먼저 나오는 꼬리말**
  //    에서 자른다 — '참고 자료' 가 '같이 읽을 글' 보다 위에 오는 글이 있다.
  let 자를곳 = -1;
  for (const 말 of 꼬리말들) {
    const i = s.indexOf(말);
    if (i >= 0 && (자를곳 < 0 || i < 자를곳)) 자를곳 = i;
  }
  if (자를곳 >= 0) s = s.slice(0, 자를곳);

  // ② 배너·광고 블록을 지운다. wp:html 로 감싸진 것만 본다 — 본문 문단을
  //    실수로 지우지 않기 위해서다.
  const 표식 = 걷어낼표식();
  s = s.replace(/<!--\s*wp:html\s*-->[\s\S]*?<!--\s*\/wp:html\s*-->/g,
    (블록) => (표식.some((m) => 블록.includes(m)) ? ' ' : 블록));

  // ③ 안내 블록은 wp:paragraph 로 감싸여 있어 ②가 못 잡는다.
  s = s.replace(new RegExp(`<!--\\s*${NOTICE_MARK}\\s*-->[\\s\\S]*?<!--\\s*/${NOTICE_MARK}\\s*-->`, 'g'), ' ');

  return s;
}

/** 제목과 본문을 합쳐 고르기용 글을 만든다. 두 도구가 같은 것을 쓴다. */
export function 고르기용글(title, content) {
  return `${String(title ?? '')}\n${주제만(content)}`;
}
