// 배너 카드 한 장을 그린다. 앱 배너와 공식 홈페이지 배너가 같이 쓴다.
//
// 왜 공용인가: 2026-10-07 에 "오래 가는 섹션" 판정이 두 파일에 복사돼 있다가
// 서로 갈라져서, 보완이 "완료"라고 찍은 글이 최종 채점에서는 실패로 저장됐다
// (seo/longevity.mjs 참고). 카드 모양도 복사해 두면 같은 식으로 갈라진다 —
// 한쪽만 색을 고치면 글마다 배너가 다르게 보인다. 그래서 처음부터 한 군데 둔다.
//
// 스타일 규칙 (리포 지시서)
//   - 맘운자로 브랜드 CTA 그라디언트(#b779ef→#ff8fb3)를 쓴다. 새 팔레트를
//     만들지 않는다.
//   - 워드프레스 블록 에디터에서도 그대로 보이게 인라인 스타일만 쓴다.
//     테마 CSS 에 기대면 테마를 바꿀 때 깨진다.
//   - 링크는 현재 창에서 연다. target="_blank" 를 쓰지 않는다 — 새 창으로
//     띄우면 독자가 원래 글로 돌아오는 길을 잃는다. target 이 없으니
//     noopener 도 필요 없다. 바깥 링크이므로 rel="nofollow" 는 남긴다.

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 배너 카드 HTML.
 *
 * url 이 없으면 빈 글을 돌려준다. 주소 없이 "바로가기" 버튼을 거는 것은
 * 독자를 속이는 일이고, 깨진 링크는 검색 순위에도 나쁘다.
 *
 * @param {object} o
 * @param {string} o.표식  카드 맨 위 작은 글귀. 나중에 "이 글에 배너가 있나"를 이걸로 찾는다.
 * @param {string} o.이름  카드 가운데 큰 글씨. 독자가 어디로 가는지 한눈에 알아야 누른다.
 * @param {string} o.cta   버튼 글귀.
 * @param {string} o.url   갈 곳.
 * @param {string} [o.hint] 버튼 아래 한 줄 안내.
 */
export function 배너카드({ 표식, 이름, cta, url, hint = '' }) {
  if (!url) return '';
  return `<!-- wp:html -->
<div style="margin:32px 0;padding:22px 20px;border-radius:16px;background:linear-gradient(135deg,#b779ef,#ff8fb3);text-align:center;">
  <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;margin-bottom:6px;">${esc(표식)}</div>
  <div style="color:#ffffff;font-size:20px;font-weight:800;margin-bottom:12px;">${esc(이름)}</div>
  <a href="${esc(url)}" rel="nofollow"
     style="display:inline-block;padding:13px 28px;border-radius:999px;background:#ffffff;color:#6b2d8f;font-size:17px;font-weight:800;text-decoration:none;">
    ${esc(cta)} →
  </a>
  ${hint ? `<div style="color:#ffffff;font-size:13px;opacity:0.92;margin-top:10px;">${esc(hint)}</div>` : ''}
</div>
<!-- /wp:html -->`;
}
