// 샷마다 화면을 설계한다 (기획서 7·8·9·10번).
//
// 여기만 AI가 한다. 나레이션 글자는 코드가 이미 쪼개 놨고(split.mjs),
// 이미지/영상 배분도 코드가 정한다(assets.mjs). AI는 "이 나레이션에 어떤
// 그림이 어울리나"만 설계한다.
//
// ─────────────────────────────────────────────────────────────
// 보는 사람이 불편한 화면은 만들지 않는다
// ─────────────────────────────────────────────────────────────
//
// 미스터리 소재는 실종·사망·범죄가 자주 나온다. 그대로 두면 AI는
// 시체, 피, 상처, 공포 영화식 점프스케어를 그린다. 그러면 두 가지가 동시에
// 일어난다.
//
//   1) 시청자가 불쾌해서 바로 나간다. 이 채널은 이야기를 보여주는 채널이고
//      충격을 보여주는 채널이 아니다 (기획서 22번).
//   2) 유튜브가 2026년 7월에 "충격을 노린 불쾌한 콘텐츠"를 수익화 제외
//      목록에 명시로 넣었다. 영상이 남아도 돈이 안 벌린다.
//
// 그래서 금지 목록을 프롬프트에 넣고, 돌아온 프롬프트를 코드로 다시 검사한다.
// 긴장은 '보여주지 않음'으로 만든다 — 빈 복도, 열린 문, 꺼진 조명,
// 멈춘 시계. 그게 시체를 보여주는 것보다 무섭고, 아무도 불쾌하지 않다.

import { callForJson, MODELS, isFatalApiError } from '../ai/client.mjs';
import { IMAGE_CAMERA_MOVES, MOODS } from './assets.mjs';
import { KIND } from '../model.mjs';
import { photoOf as mainPhoto, allPhotosOf } from '../assets/photo-of.mjs';
import { uniformClause, teamKey } from './uniforms.mjs';

/**
 * 이 채널의 고정 화면 스타일 (기획서 10번).
 *
 * 모든 이미지 프롬프트 끝에 붙는다. 한 곳에만 두는 이유: 100편의 화면 톤이
 * 같아야 채널로 보인다. 프롬프트마다 다른 스타일을 쓰면 짜깁기처럼 보인다.
 */
export const STYLE_SUFFIX =
  // "영화 스틸컷"이라고 못 박는다. 완전한 포토리얼을 요구하면 두 가지가
  // 나빠진다 — 실존 인물과 닮아버릴 위험이 커지고, 어설프게 사실적인 그림은
  // 오히려 싸구려로 보인다. 스틸컷 느낌이 미스터리 톤에도 더 맞는다.
  'cinematic film still, not photorealistic, 35mm grain, ' +
  // 청록~회색으로 색을 묶는다. 100편의 화면 톤이 같아야 채널로 보인다.
  'cool teal and grey color grade, desaturated, ' +
  // 측광·역광으로 얼굴과 공간에 그림자를 만든다. 긴장은 빛이 만든다.
  'dramatic side lighting and rim light, deep shadows, high contrast, ' +
  'shallow depth of field, anamorphic, ' +
  'no text, no watermark, no captions, no subtitles, no logo';

/**
 * 모든 이미지·영상 프롬프트에 붙는 금지 목록.
 *
 * 이미지 모델에 넘기는 네거티브 프롬프트로도 쓰고, 아래 검사에도 쓴다.
 */
/**
 * 시대·성격별 색감 (기획서에 없던 항목 — 조회수 목적으로 추가).
 *
 * 같은 영상 안에서 과거·현재·미래가 섞이는 소재가 많다. 전부 같은 색으로
 * 가면 시청자가 "지금 언제 이야기지?"를 계속 헷갈린다. 색으로 시대를
 * 구분해 주면 나레이션이 설명하지 않아도 알아본다.
 *
 * 이상 현상(UFO, 빛, 설명 안 되는 것)을 따로 둔 이유는 다르다. **구체적인
 * 물체를 그리지 않기 위해서**다. 빛으로만 표현하면 상상할 여지가 남고,
 * 어설픈 CG처럼 보이지 않으며, 보는 사람이 댓글에서 "저게 뭐였을까"를
 * 이야기한다. 그게 이 장르의 조회수다.
 */
export const ERA_TONES = {
  past: 'warm sepia tone, faded aged photograph quality, slight vignette',
  present: 'cool teal and grey, overcast daylight, modern',
  future: 'cold clean blue-white, glass and fog, sterile',
  anomaly: 'the unexplained thing rendered as light only — a glow, a silhouette, ' +
    'a lens flare — never a detailed object, never a visible craft or creature',
};

/**
 * 창작 동화(KIND.TALE)의 고정 화면 스타일.
 *
 * 실화 쪽의 시네마틱 톤과 정반대로 간다. 저쪽은 "실제로 찍힌 것처럼"이
 * 목적이고, 동화는 **그림책처럼** 보여야 한다.
 *
 * ─────────────────────────────────────────────────────────────
 * 작가 이름을 쓰지 않는다
 * ─────────────────────────────────────────────────────────────
 *
 * "○○풍", "△△ 스타일" 같은 지시를 쓰지 않는다. 화풍 자체는 저작권
 * 대상이 아니지만, 특정 작가나 작품을 지목하는 순간 성격이 달라진다.
 * **인쇄 기법 용어로만** 쓴다 — 아래가 전부 기법 이름이다.
 *
 * ─────────────────────────────────────────────────────────────
 * 이 화풍이 기술적으로도 유리한 이유
 * ─────────────────────────────────────────────────────────────
 *
 * 사실적인 화풍일수록 컷마다 **얼굴이 다른 사람이 된다.** 리소그래프
 * 스타일은 얼굴 디테일이 적어서 그 문제가 훨씬 덜하다. 멋과 실리가 같은
 * 방향인 드문 경우다.
 */
export const TALE_STYLE_SUFFIX =
  // 인쇄 질감. 잉크가 살짝 어긋나 겹치는 느낌이 이 화풍의 핵심이다.
  'risograph print illustration, grainy recycled paper texture, ' +
  'slight ink misregistration, visible halftone dots, ' +
  // 색을 3~4가지로 묶는다. 편마다 바꾸지 않는다 — 바꾸면 채널로 안 보인다.
  'limited 4-color palette: deep indigo ink, sunset orange, muted teal, warm paper white, ' +
  // 굵은 선 + 평면 채색. 그라데이션을 쓰면 리소 느낌이 사라진다.
  'thick rough ink outlines, flat color blocking, minimal gradient, ' +
  'simple stylized faces, storybook composition, ' +
  'no text, no watermark, no captions, no subtitles, no logo';

/**
 * 스포츠 분석(KIND.SPORTS)의 고정 화면 스타일.
 *
 * ─────────────────────────────────────────────────────────────
 * 왜 캐리커처인가 — 멋이 아니라 유일하게 가능한 선택이다
 * ─────────────────────────────────────────────────────────────
 *
 * 이 종류는 **실존 선수**를 다룬다. 그래서 쓸 수 있는 그림이 거의 없다.
 * 실제 경기 사진·중계 화면은 구단과 중계사의 것이고, 사실적인 그림은
 * 특정 선수를 닮는 순간 초상권 문제가 된다.
 *
 * 남는 길은 하나다. **누군지는 상황으로 알리고, 얼굴은 특정하지 않는다.**
 * 팀 색과 등번호와 장면으로 전하고, 이름은 자막과 나레이션이 말한다.
 *
 * ─────────────────────────────────────────────────────────────
 * 이름을 넣어도 그 사람이 나오지 않는다
 * ─────────────────────────────────────────────────────────────
 *
 * 이미지 모델은 KBO 선수 얼굴을 모른다. 이름을 넣어 봐야 "빨간 헬멧 쓴
 * 야구선수"가 나올 뿐이다. 그러니 **애초에 이름을 넣지 않는다** — 넣으면
 * 닮지도 않으면서 닮게 하려 한 흔적만 남는다.
 *
 * 그래서 프롬프트에는 선수 이름 대신 팀 색·등번호·상황만 적는다.
 * 안전한 쪽과 잘 되는 쪽이 같은 방향인, 드문 경우다.
 */
/**
 * 그림체 후보.
 *
 * 2026-11-04 운영자: "잘 그리는 화풍이 있는가? 우리만의 특징이 있어야 한다.
 * 영상을 딱 보면 이건 우리 거다 하는".
 *
 * 맞는 말이고, 지브리 느낌이 실패한 이유이기도 하다. 그건 모델이 가장
 * 평균적으로 아는 화풍이라 **누구나 같은 그림을 받는다.** 우리 것이 될
 * 수가 없다.
 *
 * 그리고 하나 더 있다. 지브리풍은 반쯤 사실적인 그림이라 사진에서 가져온
 * 얼굴이 제일 티가 난다 — 감독 얼굴이 붕 뜬 게 그래서다.
 * **그림체가 평면적이고 질감이 거칠수록 얼굴도 같이 뭉개져서 이질감이
 * 사라진다.** 그림체를 고르는 일이 얼굴 문제까지 같이 푼다.
 *
 * 말로 고르면 또 틀리므로 같은 장면을 후보마다 한 장씩 뽑아서 고른다
 * (`preview --styles`).
 */
export const SPORTS_PAINT_CANDIDATES = {
  // 지금 쓰는 것. 비교 기준으로 남긴다.
  지브리: {
    label: '지브리 느낌 (지금 쓰는 것)',
    why: '부드럽고 따뜻하다. 다만 흔하고, 사진 얼굴이 제일 티가 난다.',
    paint:
      'hand-painted 2D anime illustration in the style of a classic Japanese ' +
      'animated film, gouache and watercolour on paper with visible brush ' +
      'texture and a faint paper grain, soft natural light, ' +
      'muted desaturated palette of creams, dusty blues and warm earth tones, ' +
      'clean confident linework, flat colour with soft hand-painted shading, ' +
      'crowds and distant background painted as loose soft dabs, ' +
      // 층이 셋이어야 썰렁하지 않다 (2026-11-04 운영자 요청).
      // 앞을 흐리게 두는 것이 깊이를 만든다.
      // ── 사진 말을 그림 말로 바꾼다 (2026-11-11) ──
      //
      //   운영자: "그림 많이 좋아졌다. 나중에 이 그림 톤만 맞추면
      //            될 것 같다"
      //
      // 사진에서 그린 샷은 수채 느낌인데 글로 그린 샷만 배경이
      // **사진처럼 뿌옇게** 나왔다. 까닭이 이 줄이다 — 'out-of-focus'
      // 는 렌즈 말이다. **그림에는 초점이 없다.** 붓질이 성근 것뿐이다.
      //
      // 세 겹으로 짜는 것 자체는 좋으니 남기고 말만 바꾼다.
      'composed in three layers - a shape close to the camera painted in ' +
      'a few broad strokes, the subject drawn with the cleanest linework ' +
      'in the middle, and a background washed in with thin flat colour ' +
      'behind - with gentle atmosphere such as light haze, ' +
      'drifting dust or low sun, ' +
      'drawn artwork, never a 3D render, never CGI, never a photograph',
  },
  리소: {
    label: '리소그래프 2~3색',
    why: '색이 두세 개뿐이라 한 번 정하면 그게 채널 색이 된다. 섬네일만 봐도 우리 것이 된다.',
    paint:
      'risograph print illustration using only three ink colours - deep navy, ' +
      'warm red and cream - printed one layer at a time with the layers ' +
      'slightly out of register, visible halftone dot texture, coarse grain, ' +
      'the paper stock showing through, flat areas of solid ink with no ' +
      'gradients, bold simple shapes, heavy black linework, ' +
      'printed artwork on paper, never a 3D render, never CGI, never a photograph',
  },
  야구카드: {
    label: '1970년대 야구 카드 수채',
    why: '야구 채널에 맞는 향수. 다만 "옛날 이야기" 느낌이 강하다 — 우리는 지금 일을 다룬다.',
    paint:
      'vintage 1970s baseball card illustration, watercolour and gouache on ' +
      'aged cream cardstock, soft bleeding edges where the paint meets the ' +
      'paper, faded sun-bleached colours, slight print misalignment and ' +
      'off-register colour, visible paper fibre and light foxing, ' +
      'warm nostalgic palette of butter yellow, dusty red and faded teal, ' +
      'painted artwork, never a 3D render, never CGI, never a photograph',
  },
  르포: {
    label: '신문 르포 스케치 (연필+담채)',
    why: '분석 톤에 가장 맞고 차분하다. 다만 약해서 섬네일에서 눈에 안 띈다.',
    paint:
      'reportage sketch illustration, confident graphite pencil linework with ' +
      'visible construction lines left in, loose watercolour washes laid over ' +
      'the drawing and running slightly past the lines, large areas of bare ' +
      'white paper left unpainted, restrained palette of ink blue, ochre and ' +
      'a single warm red accent, the immediacy of a drawing made on the spot, ' +
      'drawn artwork, never a 3D render, never CGI, never a photograph',
  },
};

/** 지금 쓰는 그림체. 후보를 고르면 이 이름만 바꾼다. */
export const SPORTS_PAINT_KEY = '지브리';

/** 그림체 문장. */
export const SPORTS_PAINT = SPORTS_PAINT_CANDIDATES[SPORTS_PAINT_KEY].paint;

export const SPORTS_STYLE_SUFFIX =
  // ── 2D 만화다. 3D 렌더가 아니다 (2026-11-03 운영자 지시) ──
  //
  // 3화·4화에서 **머리가 몸보다 큰 대머리 인형**이 나왔다. 운영자 말로
  // "영상 퀄리티가 너무 떨어진다". 원인은 여기 적혀 있던 세 마디였다.
  //
  //   'stylized 3D caricature render, oversized head on small body'
  //   'glossy toy-figure look'
  //   'expressive cartoon face with clear large eyes'
  //
  // 사진으로 오해받지 않으려고 넣은 말인데, 그 값이 너무 컸다.
  //
  // 왜 2D인가
  //   3D 캐릭터 렌더는 조금만 어긋나도 싸구려로 보인다. 선으로 그리는
  //   2D는 어긋날 구석이 적어 같은 돈으로 더 안정적으로 나온다. 그리고
  //   선 그림은 특징을 과장해도 자연스럽다 — 안경·턱수염·아이블랙 같은
  //   표식이 또렷하게 살아난다. 3D에서는 그게 뭉개졌다.
  //   야구 만화는 이미 있는 화법이라 내용과도 맞는다.
  // 운영자가 지브리 느낌을 원한다(2026-11-03). 스튜디오 이름을 적는
  // 대신 **그 느낌을 만드는 것들을 직접 적는다.** 이름으로 부르면
  // 모델이 그걸 어떻게 이해하는지 우리가 통제할 수 없다. 요소로 적으면
  // 결과가 고르고, 어디를 고칠지도 분명하다.
  //
  // 2026-11-03 운영자가 참조 그림 두 장을 줬다. 거기서 **보이는 것**을
  // 그대로 적는다 — 느낌말로 적으면 모델이 제 맘대로 해석한다.
  //   · 종이 결이 비치는 과슈·수채. 번들거리지 않는다.
  //   · 색이 가라앉아 있다. 크림·먼지 낀 파랑·흙색.
  //   · 관중은 또렷하게 그리지 않고 붓 자국으로 뭉갠다.
  //   · 그런데 유니폼 글자와 솔기는 오히려 또렷하다.
  `${SPORTS_PAINT}, ` +
  // ── 한 편의 그림은 한 결이다 (2026-11-07 운영자) ──
  //
  //   "앞으로 전체 그림톤이 유사하게 지브리 톤으로 맞춰줘"
  //   "전체 그림톤은 통일이다. 지브리다. 달라지면 안 된다"
  //
  // 바탕 모델을 맞춘 것(images.mjs)이 큰 몫이지만, 글로도 못 박는다.
  // 한 샷만 결이 달라도 거기서 눈이 걸린다.
  'every picture in this series shares one look: the same hand-painted ' +
  '2D film-animation finish, the same muted palette, the same line weight, ' +
  'never switching to another medium or rendering style mid-series, ' +
  // ── 비율 ──
  // 'oversized head on small body' 를 쓰다가 아기 인형이 나왔다.
  // 어른 비율을 숫자로 못 박는다. 비율은 말로 두면 반드시 흐려진다.
  // ⚠️ 2026-11-07 운영자: "그림의 비율이 이상하면 안 된다."
  //    머리 크기만 적어 뒀더니 어깨가 좁거나 팔이 짧은 그림이 나왔다.
  //    비율은 **재는 자리마다** 적어야 지켜진다. 말로 'realistic' 만
  //    적으면 모델이 제 평균으로 돌아간다.
  'realistic adult proportions, head about one seventh of total height, ' +
  'shoulders about two head-widths across, the arms long enough that the ' +
  'fingertips reach mid-thigh when they hang down, the legs about half the ' +
  'total height, hands and feet sized to the body, ' +
  'an adult athlete in his twenties or thirties, never a child, ' +
  'a grown adult face with a defined jawline, ' +
  'never a small head on a huge body or a huge head on a small body, ' +
  'never arms shorter than the torso, never a torso longer than the legs, ' +
  // ── 머리카락 ──
  // 이 줄이 통째로 없어서 **대머리**가 나왔다. 모자를 쓴 샷에서도
  // 모자 밑으로 머리가 보여야 한다.
  'a full head of short black hair, visible even under a cap, never bald, ' +
  // ── 얼굴 ──
  // 1화에서 눈코입 없는 동그라미가 나왔던 적이 있다. 얼굴은 그린다.
  // 다만 'clear large eyes' 는 빼야 한다 — 그게 아기 눈을 만들었다.
  //
  // ⚠️ 2026-11-07. 여기에 조건이 붙었다. 전에는 얼굴을 **무조건** 그리라고
  //    했는데, 그 줄이 뒷모습·옆모습 샷에서 목을 꺾어 놨다. 운영자 말:
  //    "뒷모습으로 달리는데 얼굴 정면, 옆으로 달리는데 얼굴 정면이나
  //     뒤통수 등등 동작과 얼굴이 안 맞아 어색하다".
  //    그래서 "얼굴이 카메라를 향한 자세일 때"로 범위를 좁힌다.
  'when the face is turned toward the camera it is drawn in anime style ' +
  'with defined eyebrows, eyes and mouth, ' +
  // ── 머리 방향은 몸이 정한다 (2026-11-07 운영자 지시) ──
  //
  // "뒷모습으로 달리는데 얼굴 정면, 옆으로 달리는데 얼굴 정면이나
  //  뒤통수 등등 동작과 얼굴이 안 맞아 어색하다."
  //
  // 원인은 우리 프롬프트였다. 얼굴을 무조건 그리라고 했고, 참조 사진이
  // 붙은 샷에는 "사진과 같은 얼굴"까지 요구했다. 모델은 두 지시를 다
  // 지키려다 **몸은 뒤를 보는데 머리만 앞으로 돌려** 놓는다.
  //
  // 고치는 법은 우선순위를 정하는 것이다. **몸의 동작이 먼저고, 머리는
  // 거기 따라간다.** 얼굴을 보여야 하면 애초에 얼굴이 보이는 자세를
  // 고르면 된다 — 그건 아래 SPORTS_VISUALS_RULES 가 설계 단계에서 한다.
  'the head faces the same way the body is moving: if the figure is seen ' +
  'from behind, draw the back of the head and no face at all; if the figure ' +
  'runs or throws across the frame, draw the head in profile or ' +
  'three-quarter view; only draw a front-facing face when the body itself ' +
  'faces the camera, ' +
  'never twist the neck to show the face against the direction of the body, ' +
  'never a front-facing face on a figure seen from behind, ' +
  // 2026-11-07 운영자: "선수 동작이 이상하게 팔이 3개인 경우도 있구나."
  // 움직이는 장면을 늘리면서 생긴 일이다. 팔다리 개수를 못 박는다.
  // ⚠️⚠️ 2026-11-11. 여기 'no third arm, no spare hand' 가 있었는데도
  //    또 **팔이 셋** 나왔다(5:43 샷). 9화에 이어 두 번째다.
  //
  //    운영자: "그림도 어색한데 팔이 3개다"
  //
  //    금지로는 개수를 못 막는다. 모자 마크·아기 얼굴에서 배운 것과
  //    같다 — 'third arm' 이라고 적으면 그 낱말이 모델에게 간다.
  //    **어디에 몇 개가 붙어 있는지를 그릴 것으로 적는다.**
  'one head on one neck, one left arm attached at the left shoulder and ' +
  'one right arm attached at the right shoulder and nothing else growing ' +
  'from the torso, each arm ending in one hand of five fingers, ' +
  'one left leg and one right leg attached at the hips, ' +
  // ⚠️ 2026-11-09. 여기까지만 적었더니 **팔이 빠진** 그림이 나왔다.
  //    개수를 못 박는 것과 "빠뜨리지 마라"는 다른 말이다. 둘 다 적는다.
  //    야구는 특히 그렇다 — 던지는 팔만 그리고 글러브 낀 팔을 잊는다.
  'and none of them missing: both arms are drawn, the throwing arm and ' +
  'the glove arm, even when one is turned away from the camera, ' +
  'a batter holds the bat with both hands, ' +
  'anatomically correct neck and shoulders, ' +
  // ── 동작은 자연스러워야 한다 (2026-11-07 운영자) ──
  //
  //   "선수 동작 그림을 만들 때 그림이 자연스러워야 한다.
  //    어색한 동작이 나오면 안 된다. 꼭! 기억해라."
  //
  // D-4 에서 던지고·치고·달리는 장면을 넣으라고 했는데, 움직임을
  // 넣으면 어색해질 자리도 같이 늘어난다. 팔이 반대로 꺾이거나,
  // 발이 땅에서 떠 있거나, 몸은 왼쪽인데 공은 오른쪽으로 가거나.
  //
  // **어색한 동작은 정적인 화면보다 나쁘다.** 보는 사람이 거기서
  // 멈춘다. 그래서 움직임을 요구한 만큼 자연스러움도 요구한다.
  // ── 상체와 하체가 **한 동작**이다 (2026-11-09 운영자) ──
  //
  //   "동작도 이상한데..."
  //
  // 상체는 공을 던지는 자세인데 하체는 두 발을 벌리고 **그냥 서 있는**
  // 그림이 나왔다. 위아래가 따로 논다.
  //
  // 우리가 '자세'를 한 덩어리로만 적어서다. 모델은 읽은 동작을 상체에
  // 적용하고 다리는 기본 자세로 둔다. **온몸이 같은 동작에 참여한다**고
  // 따로 적어야 한다.
  'the whole body is in one single action: hips, legs and feet take part ' +
  'in the same motion as the arms and shoulders, never a throwing upper ' +
  'body on legs that merely stand still, ' +
  'a pitcher strides toward the plate with the front leg while the arm ' +
  'comes through, a batter rotates the hips and back foot with the swing, ' +
  'the pose is a real moment a human body can hold: joints bend the way ' +
  'they actually bend, the weight is on a foot that touches the ground, ' +
  'the arms and legs follow through in the direction of the motion, ' +
  'never a limb bent backwards, never a body twisted past what is possible, ' +
  'never floating above the ground when the pose is a standing or running one, ' +
  // ⚠️ 2026-11-09. 투수가 **두 발을 다 띄운 채** 공중에 뜬 그림이
  //    나왔다. 위의 '서 있거나 달리는 자세' 라는 단서가 투구 동작을
  //    빠져나가게 했다. 야구 동작을 하나씩 적어 못 박는다.
  //    실제로 투수는 뒷발이 투수판에 닿아 있거나 앞발이 막 닿는다.
  'a pitcher always keeps contact with the ground: the back foot on the ' +
  'rubber or the front foot landing on the mound, never both feet in the ' +
  'air at once, ' +
  'a batter keeps both feet in the batter box through the swing, ' +
  // ── 프레이밍 ──
  // 벤치에 앉은 샷에서 **다리가 잘려** 나왔다. 어디까지 담을지 못 박는다.
  //
  // ⚠️ 2026-11-07 운영자: "그림 위에 얼굴을 얹지 말고, 머리부터 발끝까지
  //    그려서 넣어라." 전신을 기본으로 올린다. 허리 위 샷은 얼굴만 큰
  //    그림이 되기 쉽고, 그럴수록 얼굴이 따로 노는 게 눈에 띈다.
  'drawn as one whole figure from head to feet, the complete body inside ' +
  'the frame with the feet and the ground visible, ' +
  'never a floating head or a face pasted onto a scene, ' +
  // ── 앞에 둔 물건이 몸을 가리지 않는다 (2026-11-07 운영자) ──
  //
  // "이건 왜 목만 둥둥 떠 있나?"
  //
  // 실행 #65 의 한 샷에서 클립보드가 화면 아래 절반을 덮어, 머리와
  // 어깨만 그 위에 떠 있는 그림이 나왔다. 몸이 통째로 가려졌다.
  //
  // 원인은 우리가 적은 "앞에 가까이 있는 것 하나"(SPORTS_VISUALS_RULES
  // E 의 세 층)다. 그 물건을 **사람 앞에** 두라고만 했지 얼마나 크게
  // 두라고는 안 했다. 모델이 화면 반을 채우는 크기로 그린다.
  //
  // 소품은 깊이를 만들라고 넣은 것이지 주인공을 가리라고 넣은 게
  // 아니다. 크기와 자리를 못 박는다.
  'any foreground object stays small and to one side, never covering the ' +
  'body: the torso, arms and legs of the person remain fully visible, ' +
  'a held object such as a clipboard, ball or glove is held at natural ' +
  'size in one hand and never enlarged to fill the lower half of the frame, ' +
  'never a head and shoulders sitting on top of a large object, ' +
  // ── 앉은 사람도 다리를 그린다 (2026-11-07 운영자) ──
  //
  // "다리는 어디 가고? 유니폼이 의자에 걸려 있는 것 같나."
  //
  // 실행 #65. 의자에 앉은 뒷모습을 그렸는데 **다리가 통째로 없었다.**
  // 점퍼만 의자 등받이에 걸쳐 둔 것처럼 보였다.
  //
  // 우리가 "머리부터 발끝까지"라고만 적어서 생긴 일이다. 앉으면 발이
  // 의자에 가려지니, 모델이 둘을 다 맞추려다 사람을 지우고 옷만
  // 남겼다. 앉은 자세를 따로 적어야 한다.
  'a seated figure still has legs: thighs, knees and feet are drawn and ' +
  'the body fills the clothing, ' +
  'never an empty jacket or uniform draped over a chair in place of a person, ' +
  // ⚠️ 옷걸이에 걸린 유니폼에 머리만 얹힌 그림도 나왔다(실행 #65,
  //    라커룸 샷). 사람과 걸어 둔 옷은 **다른 것**이라고 적어야 한다.
  //    라커룸처럼 옷이 여러 벌 걸린 배경에서 특히 잘 섞인다.
  'a person and a hanging garment are never merged: if a person stands ' +
  'among hanging uniforms, he has his own shoulders, arms, torso and legs ' +
  'in front of them, never a head on top of a jersey on a hanger, ' +
  // ── 물건은 손에 들거나 바닥에 놓는다 (2026-11-07 운영자) ──
  //
  // "이건 왜 등에 걸려 있나?"
  //
  // 실행 #65. 뒷모습 샷에서 클립보드가 **점퍼 등판에 붙어** 있었다.
  // 들고 있는 것도 아니고 걸린 것도 아니고, 그냥 등에 얹혀 있었다.
  //
  // 앞의 두 줄이 "앞에 크게 두지 마라"까지만 말해서, 모델이 자리를
  // 못 찾고 아무 데나 붙였다. **어디에 두는지**를 적어야 한다.
  'objects are held in a hand, tucked under an arm, or resting on a ' +
  'surface such as a bench, rail or ground, ' +
  'never stuck to the back or chest of a jacket, never floating against ' +
  'the body with nothing holding it, ' +
  'never cropping limbs at an awkward point, ' +
  // ── 유니폼 ──
  // 2026-11-03 운영자: "유니폼은 전부 국대 유니폼으로 바꿔라".
  // 전에는 'plain unbranded uniform ... no logos or lettering' 이었다.
  // 그래서 어느 팀인지 읽히지 않는 흰 옷만 나왔다. 참조 그림에서는
  // 가슴 글자가 그림의 중심이다 — 글자를 지우면 야구 그림이 아니게 된다.
  // ── 유니폼은 그 선수의 팀 것이어야 한다 (2026-11-07 운영자) ──
  //
  //   "그림에 팀 로고와 이름 등번호 등은 진짜 선수 등번호와 구단
  //    유니폼으로 만들어라. 이 부분이 어색하다.
  //    갑자기 뉴욕양키즈가 나오는 건 뭐냐?"
  //   "전혀 팀과 관련이 없는 로고와 유니폼이다"
  //
  // 내 탓이다. 2026-11-03 에 "유니폼은 전부 국대 유니폼으로"라고
  // 적어 뒀는데, 그러면 모델이 **야구 유니폼처럼 생긴 아무것**을
  // 그린다. 미국 야구 사진을 훨씬 많이 봤으니 양키스 모자가 나온다.
  //
  // 이제는 샷마다 **그 선수의 팀 색**을 적는다. 아래 「이 편에 나오는
  // 사람」의 team_colors 를 프롬프트에 그대로 넣는다.
  //
  // ⚠️ 그래도 **미국 구단 표시는 막는다.** 양키스의 겹친 NY, 다저스의
  //    흘림체, 레드삭스의 B — 이름을 적어 막아야 안 나온다.
  // ── 2026-11-07. 이 줄을 다시 고쳤다 ──
  //
  //   "그럼 유니폼은 어떻게 구현을 하나? 유니폼이 완전 다른 색상이다."
  //
  // 아침에 "the team colours **named in the scene description**" 으로
  // 바꿔 놓은 그 줄이 문제였다. 색을 적는 주체가 내가 아니라 **장면을
  // 설계하는 AI** 였다. look 문장을 베껴 넣어 달라고 부탁해 뒀는데,
  // 베끼면 색이 맞고 줄여 쓰면 색이 사라진다. 부탁으로 지켜지는 규칙이
  // 아니다.
  //
  // 이제 유니폼 문장은 **코드가 쓴다.** uniforms.mjs 의 구단 표에서
  // 만들어 composeImagePrompt 가 장면 설명 바로 뒤에 꽂는다. 설계 AI 가
  // 무엇을 쓰든 유니폼은 프롬프트에 있다.
  //
  // 여기 남는 것은 **표에 없는 팀**을 위한 밑줄이다.
  'wearing a Korean professional baseball uniform, the cap and jersey in ' +
  'the team colours given for this figure, and when a jersey number is ' +
  'given for this figure that exact number on the back — never an ' +
  'invented number, and no number at all when none is given, ' +
  // ⚠️⚠️ 가슴에 **글자를 그리라고 하지 않는다** (2026-11-09) ⚠️⚠️
  //
  // 여기에 'the team wordmark across the chest ... legible' 이라고
  // 적어 뒀었다. 그래서 모델이 고영표 가슴에 **읽을 수 없는 글자꼴**을
  // 그렸다 — "읽가ㅅㅍ大". 운영자가 워터마크로 봤고 나도 그렇게 보고
  // 자르기를 붙들고 한 시간을 썼다. 워터마크가 아니라 **내가 "읽을 수
  // 있게 써라"고 시킨 글자**였다.
  //
  // Flux 는 한글을 못 쓰고 영문도 두세 글자가 한계다. 그런데 글자를
  // 쓰라고 하면 글자 비슷한 것을 반드시 그린다.
  //
  // 뒤에서 알아보게 하는 것은 **등번호**다. 숫자는 한두 자리라 제대로
  // 나온다. 가슴 글자는 없어도 아무것도 안 잃는다.
  'the number across the back large and clear, so the figure is ' +
  'identifiable from behind as well as from the front, ' +
  'the seams and stitching painted with the same care as the rest of ' +
  'the picture, ' +
  'the front of the jersey is smooth plain fabric, ' +
  // ── 좌우가 같아야 한다 (2026-11-09 운영자) ──
  //
  //   "양말 색이 짝짝이다"
  //
  // 뒷모습 샷에서 한쪽 다리는 남색 양말인데 다른 쪽은 빨간 바지가
  // 그대로 발목까지 내려와 있었다. 유니폼 색은 적어 뒀는데 **양쪽이
  // 같아야 한다**는 말을 안 적어서, 모델이 다리를 따로 그렸다.
  //
  // 야구 유니폼은 좌우 대칭이 눈에 가장 잘 띄는 옷이다 — 양말이
  // 길고 색이 진해서 한쪽만 달라도 바로 보인다.
  // ── 자세가 자리와 맞아야 한다 (2026-11-11 운영자) ──
  //
  //   "홈베이스에서 도루 자세는 또 무엇인가?"
  //
  // 홈플레이트를 밟고 선 선수가 리드오프 자세를 하고 있었다. 야구에서
  // 일어날 수 없는 그림이다. 자세만 적고 **어디서** 하는지를 안 적으면
  // 모델이 둘을 아무렇게나 붙인다.
  'the stance matches the place: a lead-off crouch happens off first, ' +
  'second or third base and never on home plate, a batter stands in the ' +
  'batter box beside home plate, a fielder stands on the dirt or grass ' +
  'of his position, ' +
  'left and right match exactly: both socks the same colour and the same ' +
  'height, both shoes the same colour, both sleeves the same length, ' +
  'never one leg bare where the other has a sock, ' +
  // ⚠️ 2026-11-09 운영자: "이건 누구고 모자에 C는 무슨 마크인가?"
  //    이범호 감독 모자에 **C** 가 붙어 나왔다 — 신시내티나 컵스 마크다.
  //
  //    원인은 내가 미국 구단 **셋만 이름으로** 적어 둔 것이다(양키스·
  //    다저스·보스턴). 모델은 그 셋만 피하고 빨간 모자에 어울리는
  //    다른 글자를 가져왔다. 금지를 하나씩 세는 방식으로는 못 막는다.
  //
  //    그래서 **무엇을 그릴지**로 뒤집는다. 모자에는 그 구단의 표시만
  //    올라간다. 뜻 모를 알파벳 한 글자는 안 된다.
  // ⚠️⚠️ 2026-11-09. 여기 있던 금지 목록을 **전부 들어냈다.** ⚠️⚠️
  //
  //    'no interlocking NY, no Dodgers script, no Boston B,
  //     no Cincinnati C, no Chicago C, no American team wordmark'
  //
  //    이 줄들이 금지로 작동한다고 믿었는데 **그런 적이 없다.**
  //    flux-schnell 과 flux-dev 는 negative_prompt 를 아예 안 받는다.
  //    그래서 이 말들은 전부 **프롬프트 본문**에 붙어 모델에게 갔다.
  //    모델이 받은 것은 "NY, Dodgers, Boston B, Cincinnati C, Chicago C"
  //    라는 **낱말 목록**이었다. 그래서 C 가 나왔고, 한 글자를 막으니
  //    STL 이 나왔다. 막을수록 목록이 길어지고 목록이 길어질수록 더 나왔다.
  //
  //    남기는 것은 **무엇을 그릴지** 한 줄뿐이다.
  // ⚠️⚠️ 2026-11-11. 여기 "그 구단의 마크를 올려라" 라고 적혀 있었다.
  //    모델은 KIA 마크를 **모른다.** 그래서 아는 것을 가져왔다 —
  //    김도영 모자에 보스턴 **B** 가 나왔다. 금지 목록을 지웠는데도
  //    나온 까닭이 이것이다. 지우는 것만으로는 모자랐다. 여전히
  //    **마크를 그리라고 시키고 있었다.**
  //
  //    운영자: "모자와 가슴에 로고, 유니폼이 해당 소속 팀 같지 않다"
  //
  //    그래서 마크 이야기를 아예 안 한다. 모자는 **한 색으로 칠한 천**이다.
  'the cap is plain fabric in one solid colour all over, the front and ' +
  'the sides the same, nothing printed or stitched on it, ' +
  'unhurried composition with room around the subject, ' +
  // ⚠️ 'soft depth' 도 렌즈 말이다. 같이 바꾼다.
  'the stadium or dugout behind painted with care in flatter colour than ' +
  'the subject, ' +
  // ⚠️ 여기 있던 'no caption text, no watermark, no subtitles,
  //    no sponsor logo' 를 뺐다. 금지가 아니라 **그릴 것의 목록**으로
  //    모델에게 갔다(위 설명). 대신 "면이 매끈하다"는 긍정문으로 적는다 —
  //    repaint.mjs 에서 같은 결론에 이미 도달했는데 여기엔 안 옮겼다.
  'every surface is painted plain and unmarked: the uniform, the wall and ' +
  'the ground carry colour and texture only';

/**
 * 참조 사진이 **없는** 샷에 붙이는 줄.
 *
 * 글만으로 그릴 때는 실존 인물을 닮히려 하면 안 된다. 닮지도 않으면서
 * 닮은 척하는 얼굴이 제일 나쁘다.
 */
export const SPORTS_INVENTED_CLAUSE =
  'an invented character, not resembling any specific real person';

/**
 * 참조 사진이 **있는** 샷에 붙이는 줄.
 *
 * 2026-11-03 운영자: "실제 이미지를 기반으로 지브리 스타일로 그리면
 * 문제가 안 될 것 같다", "캐리커처 할 필요 없다", "준 사진을 참고하라".
 * 과장하지 말라는 것이 핵심이다 — 닮게, 그러나 그림으로.
 */
export const SPORTS_LIKENESS_CLAUSE =
  // ⚠️ 2026-11-04 에 고쳤다. 전에는 "닮게 그려라"만 적었더니 **사진
  //    얼굴이 그대로** 들어왔다. 몸과 배경은 그림인데 얼굴만 사진이라
  //    따로 놀았다. 운영자 말: "감독 얼굴이 그냥 얼굴이잖아".
  //
  //    닮는 것과 그림체를 지키는 것은 서로 싸운다. 그래서 **어느 쪽이
  //    이겨야 하는지를 글로 못 박는다** — 그림체가 먼저고, 닮음은 그
  //    안에서다. 힘 조절은 replicate.mjs 의 id_weight 가 따로 한다.
  'recognisably the same person as in the reference photograph - same face ' +
  'shape, hairline, eyebrows and eye shape - but redrawn completely as a ' +
  'hand-painted 2D anime character: flat cel-shaded skin with no ' +
  'photographic texture or skin pores, inked linework around the eyes and ' +
  'brows, a simplified painted nose and mouth, the face finished in exactly ' +
  'the same painting style as the rest of the picture, ' +
  'never a photographic face, never a photo head on a drawn body, ' +
  // ── 문지른 얼굴을 막는다 (2026-11-07 운영자) ──
  //
  //   "선수 얼굴 부분이 만화 같지 않고 어색하다"
  //   "여기도 얼굴이 너무 만화 같지 않아 어색하다"
  //
  // 실행 #65 에서 얼굴만 에어브러시로 문지른 것처럼 부드럽게 나왔다.
  // 빛과 그늘이 서서히 섞이고 윤곽선이 없어서, 납작하게 칠한 몸·배경
  // 위에 혼자 입체로 떠 보인다.
  //
  // 위의 'flat cel-shaded' 만으로는 부족했다. **무엇을 하지 말라고**
  // 적어야 한다 — 그라데이션과 살갗 질감이 범인이다.
  'the face shaded in two or three flat tones with a hard edge between ' +
  'light and shadow, a visible ink outline along the jaw, nose and eyelids, ' +
  'the same line weight and brush quality as the hands and the uniform, ' +
  'no soft airbrushed gradient on the skin, no smooth rounded 3D shading ' +
  'on the cheeks or nose, no semi-realistic portrait rendering, ' +
  // "너무 번들번들" (2026-11-23 아님 — 2026-11-07 운영자). 살갗에 윤이
  // 나면 그림이 아니라 렌더처럼 보인다. 종이에 칠한 결이어야 한다.
  'matte skin with the grain of the paper showing through, no specular ' +
  'highlight or shine on the forehead, nose or cheeks, ' +
  'no caricature or exaggeration of his features, ' +
  // ⚠️ 2026-11-07. 이 줄이 없어서 목이 꺾였다. "사진과 같은 얼굴"은
  //    얼굴이 보일 때만 적용되는 말인데, 그렇게 안 적었더니 모델이
  //    뒷모습 샷에서도 얼굴을 돌려 끼워 넣었다.
  'this likeness applies only when the pose actually shows his face: ' +
  'if the body is seen from behind, draw the back of his head and do not ' +
  'show his face at all rather than turning it toward the camera';

/**
 * 스포츠 편에만 더 붙이는 금지 목록.
 *
 * 공통 금지 목록에 이미 "no real identifiable public figures" 가 있다.
 * 그 줄이 이 종류에서는 가장 중요한 줄이라 **빼지 않는다.** 아래는 상표와
 * 실사 쪽을 한 겹 더 막는 것이다.
 */
export const SPORTS_NEGATIVE_EXTRA =
  // ⚠️ 'no team names, no readable jersey text' 가 여기 있었다. 그 두 줄이
  //    가슴 글자를 지웠다. 국대 유니폼을 그리라면서 글자를 막으면 모델은
  //    글자 쪽을 버린다. 뺀다. 구단 로고와 스폰서 글자만 계속 막는다.
  // ⚠️ 2026-11-07 에 'no club team logos' 를 뺐다. 그 줄 때문에 모델이
  //    "야구 유니폼처럼 생긴 아무것"을 그렸고, 거기서 양키스 모자가
  //    나왔다. 이제는 **한국 구단 색을 적어 주고** 미국 구단만 막는다.
  // ⚠️ 2026-11-09. 'no Major League Baseball logos, no foreign team
  //    wordmarks, no sponsor text on uniforms' 를 뺐다. flux-schnell·dev
  //    는 negative_prompt 를 안 받아서 이 말들이 **프롬프트 본문**에
  //    붙어 갔다. 막으려던 낱말을 모델에게 읽어 준 셈이다.
  //    유니폼은 uniforms.mjs 가 한국 구단 색으로 적어 준다.
  // ⚠️ 2026-11-11. 'no extra arms, no extra legs, no duplicated limbs' 를
  //    뺐다. 그 줄이 있는데도 팔이 셋 나왔다. 팔다리 개수는 위의
  //    **긍정문**(어깨에 하나씩, 엉덩이에 하나씩)이 맡는다.
  'no malformed hands, ' +
  // ── 팔다리가 **빠지는** 것도 막는다 (2026-11-09 운영자) ──
  //
  //   "이 장면 무엇인가? 외팔이에 뭔가 이상하다"
  //
  // 실행 #67 에서 투수의 **글러브 낀 왼팔이 통째로 없는** 그림이
  // 나왔다. 그리고 두 발이 다 땅에서 떠 있었다.
  //
  // 내가 한쪽만 봤다. 9화에서 팔이 셋 나온 걸 고치면서
  // `no extra arms`(더 많은 것)만 적고 **빠진 것**은 안 적었다.
  // 모델은 팔을 더 그리지 않았을 뿐, 덜 그리는 것은 막히지 않았다.
  // ⚠️ 2026-11-11. 'no missing arm, no one-armed figure' 도 뺐다.
  //    같은 까닭이다. 아래 긍정문만 남긴다.
  'both arms drawn and attached at the shoulders even when one is ' +
  'behind the body, ' +
  // ── 선수를 뚱뚱하게 그리지 않는다 (2026-11-09 운영자) ──
  //
  //   "이 돼지는 누구인가? 올러는 이렇게 뚱뚱하지 않다"
  //   "올러가 돼지가 되었다"
  //
  // 실행 #67 에서 **193cm 102kg** 인 투수가 비만 체형으로 나왔다.
  // 원인은 모델이 아니라 **내가 look 에 적은 말**이다 —
  // `a heavy thick build` 라고만 적고 숫자를 안 적었다. 숫자가 없으면
  // 'heavy' 는 비만으로 읽힌다.
  //
  // look 쪽은 숫자를 박아 고쳤지만, 금지 목록에도 넣는다. 프로 선수는
  // 어떤 체격이든 **운동선수**다.
  'no obese or overweight body, no large belly hanging over the belt, ' +
  'no double chin, a professional athlete body even when heavily built, ' +
  // 수염도 같은 자리에서 터졌다. look 에 'covering the jaw'(턱을 덮는)라고
  // 적었더니 가슴까지 내려오는 산적 수염이 나왔다.
  'no long bushy lumberjack beard reaching the chest, ' +
  'no photorealistic faces, no photograph, ' +
  // 실행 #65 에서 얼굴만 문질러진 채 나왔다. 이름을 적어 막는다.
  'no airbrushed face, no soft gradient skin shading, no glossy skin, ' +
  'no semi-realistic face on a flat drawn body, ' +
  'no real stadium signage, no league emblem, ' +
  // 3화·4화에서 실제로 나온 것들이다. 하나씩 이름을 적어 막는다.
  'no 3D render, no CGI, no Pixar style, no toy figure, no doll, no figurine, ' +
  // 2026-11-07 운영자: "갑자기 3D 사람 영상이 있는데 이건 뭐지.
  // 이런 것은 다음부터 안 된다." 한 샷이 통째로 다른 매체로 나왔다.
  // 위의 'no 3D render' 만으로는 안 걸렸으니 이름을 더 적는다.
  'no video game cutscene, no game engine render, no Unreal Engine, ' +
  'no realistic 3D character model, no motion capture figure, ' +
  'no live-action footage, no photographic person, ' +
  // ⚠️ 2026-11-11. 'no chibi, no oversized head, no baby face, no toddler'
  //    가 있었는데도 김도영(24세)이 **중학생**으로 나왔다. 시라카와 때와
  //    같다. 금지로 적은 낱말이 오히려 그쪽으로 끈다.
  'adult body proportions with an adult neck and shoulders, ' +
  'no bald head, no hairless character, ' +
  'no cropped legs, no cut-off limbs';

export const NEGATIVE_SUFFIX =
  'no blood, no gore, no corpses, no wounds, no injury, no violence, ' +
  'no weapons pointed at people, no distressed or crying faces, ' +
  'no horror creatures, no jump scare imagery, no children in danger, ' +
  'no real identifiable public figures, no nudity';

/**
 * 돌아온 프롬프트에서 걸러낼 말.
 *
 * AI가 금지 목록을 읽고도 "a bloodstained floor" 같은 걸 쓰는 일이 있다.
 * 프롬프트에 적어두는 것만으로는 부족해서 코드로 한 번 더 본다.
 *
 * 영어 단어만 넣는다 — 이미지 프롬프트는 영어로 받는다(이미지 모델이
 * 영어에서 훨씬 안정적이다).
 */
export const BANNED_PROMPT_WORDS = [
  'blood', 'bloody', 'bloodstain', 'gore', 'gory',
  'corpse', 'corpses', 'dead body', 'dead bodies', 'cadaver',
  'wound', 'wounded', 'injury', 'injured', 'mutilat',
  'dismember', 'decapitat', 'severed',
  'stabbing', 'shooting at', 'strangl', 'torture',
  'screaming', 'terrified face', 'crying child',
  // 2026-03 충격적인 콘텐츠 가이드라인 업데이트:
  // 어려 보이는 피사체가 괴로워하는 장면 + 충격·혐오 요소는 광고 불가.
  // 'crying child' 하나로는 좁아서 넓혔다.
  'distressed child', 'frightened child', 'child in pain', 'injured child',
  'child crying', 'infant in distress', 'minor in distress',
  'zombie', 'demon', 'monster', 'ghost face', 'jump scare',
  'nude', 'naked', 'sexual',
  'hanging body', 'noose',
];

export const VISUALS_SYSTEM = `당신은 다큐멘터리 재연 영상의 미술 감독이다.
나레이션을 보고 그 장면에 쓸 화면을 설계한다.

이 채널의 화면 원칙:

1. 보는 사람이 불편한 화면은 만들지 않는다. 이게 가장 중요하다.
   시체, 피, 상처, 폭력, 겁에 질린 얼굴, 공포 영화식 연출을 쓰지 않는다.
   사건이 실종이나 사망이어도 그렇다.

   긴장은 "보여주지 않음"으로 만든다. 이게 이 채널의 방식이다.
     - 아무도 없는 복도
     - 반쯤 열린 문
     - 치우지 않은 식탁
     - 멈춘 시계
     - 꺼진 전등
     - 빈 의자
     - 바닥에 떨어진 열쇠
   시체를 보여주는 것보다 이게 더 무섭고, 아무도 불쾌하지 않다.

2. 실존 인물을 사실적으로 그리지 않는다.
   실명이 나오는 사람은 얼굴이 보이지 않게 설계한다 — 뒤돌아선 모습,
   실루엣, 어깨 아래만, 오래된 서류 위의 손. 또는 사람 대신 그 사람의
   물건이나 기록을 보여준다.
   이건 명예훼손을 피하기 위한 것이고, 유튜브 합성 콘텐츠 정책에서도
   가장 민감한 부분이다.

3. 영화 스틸컷을 만든다. 사진이 아니다.
   완전한 포토리얼을 노리지 않는다. 두 가지 이유다 —
   어설프게 사실적인 그림은 오히려 싸구려로 보이고, 실존 인물과 닮아버릴
   위험이 커진다. 색이 빠진 청록·회색 톤에 측광과 역광으로 그림자를 만든다.
   긴장은 빛이 만든다.

4. 시대를 색으로 구분한다 (era).
   한 영상 안에 과거·현재·미래가 섞이는 소재가 많다. 샷마다 era를 고르면
   시스템이 색감을 붙인다. 나레이션이 설명하지 않아도 시청자가 알아본다.
     past    회상, 오래된 기록, 사건 당시
     present 지금 시점, 조사·취재·현재의 장소
     future  미래를 말하는 화면
     anomaly 설명되지 않는 현상이 화면의 중심인 샷

5. 설명되지 않는 것은 빛으로만 그린다 (era: anomaly).
   UFO, 이상한 물체, 정체 불명의 형체를 구체적으로 그리지 않는다.
   빛, 실루엣, 렌즈 플레어로만 표현한다. 세 가지가 동시에 좋아진다 —
   어설픈 CG처럼 보이지 않고, 보는 사람이 상상할 여지가 남고,
   "저게 뭐였을까"가 댓글로 간다.

6. 이야기를 전달하는 화면을 고른다.
   예쁜 화면보다 "지금 나레이션이 말하는 것"이 보이는 화면이 우선이다.

7. 프롬프트는 영어로 쓴다. 이미지 모델이 영어에서 훨씬 안정적이다.
   스타일 문구와 색감은 시스템이 자동으로 붙이므로 쓰지 않는다.
   장면의 내용만 쓴다.`;

/**
 * 스포츠 분석 편에만 더 붙이는 화면 지시.
 *
 * 공통 지시는 "실존 인물을 사실적으로 그리지 않는다"까지만 말한다.
 * 이 종류는 거기서 두 걸음 더 가야 한다.
 */
export const SPORTS_VISUALS_RULES = `

━━━ 스포츠 분석 편에서 더 지킬 것 ━━━

A. 선수 이름을 프롬프트에 쓰지 않는다. **생김새를 쓴다.**
   이미지 모델은 이 선수들의 얼굴을 모른다. 이름을 넣어도 닮지 않고,
   닮게 하려 한 흔적만 남는다.
     나쁨: "Won Tae-in pitching for Samsung Lions"

   아래 「이 편에 나오는 사람」에 생김새가 적혀 있으면, 그 사람이 나오는
   샷에는 **그 문장을 그대로 베껴 넣는다.** 고쳐 쓰지 말고 그대로다 —
   말을 바꾸면 샷마다 다른 얼굴이 나온다.
     좋음: "<생김새 문장 그대로>, in a plain navy uniform, mid-windup,
            facing the camera"

B. 구단 로고·팀 이름·스폰서 글자를 넣지 않는다.
   유니폼은 색으로만 말한다. 상표를 그리면 쓸 수 없는 그림이 된다.

C. **주요 인물은 반드시 한 번씩 넣는다. 다만 한 번씩만.**

   2026-11-04 운영자: "화면은 대본 내용과 연관이 충실한 그림을 사용한다.
   **주요 인물들은 꼭 들어가야 하고.**"

   전에는 "얼굴은 아껴 쓴다"까지만 적혀 있었다. 아끼라고만 하면 아예
   안 그리게 된다 — 그러면 이름만 나오고 얼굴은 없는 영상이 된다.
   아래 「이 편에 나오는 사람」에 적힌 사람은 **편마다 적어도 한 번**
   얼굴이 나와야 한다. 한 명도 빠뜨리지 않는다.

   어디에 넣는가 — 그 사람의 이름이 처음 나오는 대목, 또는 그 사람의
   성적·처지를 말하는 대목이다. 그 사람 이야기를 하는데 다른 그림이
   올라가 있으면 안 된다.

   그 대신 **그 사람이 주인이 아닌 문장에는 그리지 않는다.**

   3화에서 얼굴을 너무 많이 그렸다가 운영자에게 이런 말을 들었다 —
   "동작이랑 얼굴 방향도 안 맞다", "얼굴이 영상에서 붕 떠있다",
   "도저히 볼 수가 없다". 그림 모델은 같은 사람을 여러 번 그리면
   매번 다른 사람을 그린다. **많이 그릴수록 많이 틀린다.**

   그러니 얼굴이 꼭 필요한 자리만 고른다.

     반드시   — 그 사람을 처음 꺼낼 때 한 번
     반드시   — 그 사람의 성적·처지를 말하는 대목에서 한 번
     안 그린다 — 제도·규정·구단·시장을 말하는 대목
     안 그린다 — 이미 바로 앞 장면에서 그 사람을 그렸을 때

   **한 사람에 한 장면이 기본이다.** 같은 사람을 여러 장면에 그리면
   그릴 때마다 다른 사람이 나온다 — 3화를 망친 것이 이것이다.

   참조 사진을 받아 둔 사람은 사정이 다르다. 그 사람은 샷마다 같은
   얼굴로 나오므로 여러 장면에 그려도 된다. 다만 **그래도 아껴 쓴다** —
   아래 D 를 먼저 읽는다.

D. **얼굴을 안 쓰는 샷에는 야구장을 그린다.** 빈 화면이 아니다.

   2026-11-04 운영자 말이다 —
   "사람 정면만 넣지 말고, 수비 보는 장면, 타격하는 장면 등등 뭔가
    야구장 같은 현장감을 넣어서 만들어 줘."
   "관련도 없는 부분에 그런 영상을 넣지 말고, 이야기랑 관련 있게
    영상과 그림을 만들어 넣어야지. 선수들 이미지는 중요한 부분에
    선수임을 구분할 수 있게 하라는 거고."

   두 가지를 말하고 있다.

   ① **그림은 그 문장이 말하는 것을 보여야 한다.** 아무 선수 얼굴을
      채워 넣는 것이 아니다. 문장이 불펜 이야기면 불펜을 그리고,
      수비 이야기면 수비를 그린다.
   ② 선수 얼굴은 **누구인지 구분해야 하는 대목**에서만 쓴다.

   문장이 말하는 것 → 그릴 것

     마무리·불펜      불펜에서 몸 푸는 투수, 마운드에 오르는 뒷모습,
                      포수 미트에 꽂히는 공, 9회 전광판
     선발·로테이션    와인드업 중간, 더그아웃 난간의 투수들,
                      교체되어 내려오는 뒷모습
     수비·유격수      타구를 쫓는 내야수, 더블플레이 중계 동작,
                      글러브로 받는 순간, 흙먼지
     타격             스윙 궤적, 공을 따라가는 시선, 배트를 던지고
                      1루로 뛰는 뒷모습, 관중석
     포수             마스크 너머 사인 내는 손, 투수와 마주 보는 구도
     중견수 수비      외야 깊은 곳에서 달려 들어오는 몸,
                      펜스 앞 점프
     입대·이적·계약   비어 있는 라커, 벗어 둔 유니폼, 가방,
                      밤의 빈 구장
     숫자·제도        전광판, 기록지, 라인업 카드 (사람 없이)

   얼굴이 없어도 **야구장 안**이다. 회의실·사무실·추상적인 그림으로
   때우지 않는다. 지금 일어나는 일을 다루는 채널이라, 현장이 보여야 한다.

   뒷모습·손·발·실루엣은 얼굴이 아니다. 마음껏 쓴다 — 얼굴이
   안 나오면 틀릴 일도 없다.

D-2. **자세와 얼굴 방향을 한 문장 안에서 맞춘다.** (2026-11-07)

   운영자가 잡은 것이다 —
   "뒷모습으로 달리는데 얼굴 정면, 옆으로 달리는데 얼굴 정면이나
    뒤통수 등등 동작과 얼굴이 안 맞아 어색하다."

   프롬프트를 쓸 때 **몸이 어디를 보는지와 머리가 어디를 보는지를
   한 번에 정한다.** 둘을 따로 적으면 모델이 목을 꺾어서 둘 다
   맞추려 든다.

   샷을 둘 중 하나로만 쓴다. 섞지 않는다.

     ① 얼굴 샷 — 몸이 카메라를 향한다
        서 있다, 더그아웃에 기대 있다, 타석에 들어서며 정면을 본다,
        마운드에서 포수를 보다 고개를 든다, 모자를 고쳐 쓴다.
        **사진을 받아 둔 사람은 여기서만 쓴다.** 누구인지 보여야
        하는 대목이 이 샷이다.

     ② 동작 샷 — 몸이 움직인다. 얼굴을 요구하지 않는다
        뒤에서 본 달리기, 옆에서 본 투구, 스윙 뒤 1루로 뛰는 뒷모습,
        펜스 앞 점프.
        이런 샷에는 **"from behind, back of the head"** 또는
        **"in profile"** 이라고 못 박는다. 얼굴 이야기는 아예 꺼내지
        않는다 — 꺼내는 순간 모델이 돌려 끼운다.

     나쁨: "a pitcher running toward the bullpen seen from behind,
            his face determined"
            → 뒤를 보는 몸에 앞을 보는 얼굴이 붙는다
     좋음: "a pitcher running toward the bullpen seen from behind,
            the back of his head and his number visible, no face"

   그리고 **머리부터 발끝까지 그린다**(운영자, 같은 날). 얼굴만 크게
   잡은 샷은 쓰지 않는다. 몸 전체가 보여야 자세가 읽히고, 자세가
   읽혀야 얼굴 방향이 맞는지도 보인다.

D-3. **카드와 자막의 숫자는 숫자로 적는다.** (2026-11-07)

   운영자가 잡은 것이다 —
   "151억 7천 1백 8만원 이렇게 표기 되어야지, 한글로 다 나오잖아."
   "계약 8년이다. 이것도 다 한글이다."
   "79승 2무 63패 이런 것도 자막이 숫자로 되어야지."
   "3위 이런 순위도 숫자로 해야지."

   **눈으로 보는 글자와 귀로 듣는 말은 다르다.**

     카드·자막   151억 1,709만 원 · 8년 · 79승 2무 63패 · 3위 · 5.26
     읽는 말     백오십일억 천칠백구만 원 · 팔 년 · 칠십구 승 …

   읽는 쪽은 speech.mjs 가 알아서 바꾼다(numbers.mjs). 그러니
   **card_text 와 대본에는 숫자를 숫자로 적는다.** 한글로 적으면
   화면에 "백오십일억 천칠백구만 원"이 뜬다 — 읽기 어렵다.

   ⚠️ 큰 돈은 **자릿점을 찍는다.** 1709만이 아니라 1,709만이다.
      숫자가 길수록 자릿점이 있어야 한눈에 읽힌다.

   ⚠️ **세는 말도 숫자로 쓴다.** (2026-11-07 운영자 —
      "다섯 명이면 5명으로 써야지", "한 명은 1명으로 자막에 표기하고")

      처음엔 "적게 세는 것은 한글로 두라"고 적었는데 운영자가 뒤집었다.
      자막은 **눈에 익은 쪽**이고, 눈에 익은 것은 숫자다.

        자막   5명 · 1명 · 2경기 · 3년
        읽기   다섯 명 · 한 명 · 두 경기 · 삼 년

      읽기는 numbers.mjs 가 알아서 고유어로 바꾼다(20 이하의 명·개·
      경기 같은 단위). 그러니 대본에는 숫자만 쓰면 된다.

D-4. **야구가 움직이는 장면을 넣는다.** (2026-11-07)

   운영자가 실행 #65 를 보고 말했다 —
   "공 던지는 장면, 치는 장면, 도루하는 장면, 홈쇄도하는 장면,
    외야 수비, 내야 수비 등등 역동적인 장면들을 더 넣자.
    이거 너무 정적이다."

   맞는 말이다. #65 는 **서 있거나 앉아 있는 사람**과 **글자 카드**로
   가득했다. 야구 영상인데 공이 날아가는 장면이 거의 없었다.

   그래서 **한 단락에 적어도 한 장은 움직이는 장면**을 넣는다.

     던진다    와인드업 꼭대기, 공을 놓는 순간, 다리를 끌며 마무리,
               포수 미트에 꽂히는 공
     친다      배트에 맞는 순간, 끝까지 돌아간 몸, 공을 따라가는 시선,
               배트를 던지고 1루로
     달린다    2루로 몸을 던지는 슬라이딩, 흙먼지, 홈으로 파고드는 몸,
               태그하려 내려오는 미트
     지킨다    타구를 쫓아 담장으로 달리는 외야수, 펜스 앞 점프,
               몸을 날리는 내야수, 2루 베이스 위 중계 동작, 더블플레이

   ⚠️ 움직이는 장면에서는 **얼굴을 요구하지 않는다.** 뒷모습·측면·
      실루엣으로 간다 (D-2 의 ② 동작 샷). 얼굴을 넣으려다 목이 꺾인다.

   ⚠️ **어색한 동작은 정적인 화면보다 나쁘다.** (2026-11-07 운영자 —
      "선수 동작 그림을 만들 때 그림이 자연스러워야 한다. 어색한
       동작이 나오면 안 된다. 꼭!")

      그러니 **한순간을 고른다.** 동작의 가운데가 아니라 멈추는 자리다.

        좋음: 와인드업 꼭대기 · 공을 놓기 직전 · 배트가 공에 닿는 순간 ·
              2루에 손이 닿는 순간 · 점프의 꼭대기
        나쁨: 팔다리가 한창 돌아가는 중간 · 공중에서 몸이 꼬인 자세 ·
              여러 명이 뒤엉킨 장면

      멈춘 자리는 몸이 어떻게 놓여야 하는지가 분명해서 덜 틀린다.
      한창 움직이는 중간은 모델이 팔을 반대로 꺾어 놓는다.

   ⚠️ 그래도 **대본이 말하는 것**과 이어져야 한다. 불펜 이야기에
      홈 쇄도를 넣지 않는다. 움직임을 넣으려고 아무 장면이나 붙이는
      것이 정적인 화면보다 나쁘다.

   ⚠️ 그 사람의 **본업**을 그린다. 2026-11-07 운영자 —
      "그래서 내가 사진을 투수는 던지는 장면, 타자는 치는 장면,
       수비 잘하는 선수는 수비 장면을 같이 주지 않았나."

      맞는 말이다. 아래 「이 편에 나오는 사람」의 role 을 보고 정한다.

        투수   던지는 장면
        타자   치는 장면, 달리는 장면
        내야수·외야수  수비 장면
        감독   더그아웃 난간, 사인, 마운드로 걸어 나가는 뒷모습

      투수를 타석에 세우거나 타자를 마운드에 올리지 않는다.

E. **화면을 채우되 과하지 않게.**

   2026-11-04 운영자 말이다 —
   "너무 썰렁하지도 너무 과하지도 않게, 적당한 구성과 배경과 배경
    흐리기 등등의 다양한 효과를 넣어서 화면을 풍성하게 만든다."

   한 그림에 **층이 셋** 있어야 한다. 하나뿐이면 썰렁하고, 전부
   또렷하면 눈이 쉴 데가 없다.

     앞     가까이 있는 것 하나. 더그아웃 난간, 그물, 벗어 둔 글러브,
            기둥, 흙더미. 살짝 흐리게 — 깊이를 만드는 것은 이것이다
     가운데 이야기의 주인. 여기만 또렷하다
     뒤     관중, 전광판, 조명탑, 담장 광고 자리, 하늘.
            **붓 자국으로 뭉갠다** — 또렷하게 그리면 주인을 가린다

   그리고 공기를 채운다. 빛줄기, 흙먼지, 숨, 비, 조명 번짐, 그림자.
   한 그림에 **하나만** 쓴다 — 전부 넣으면 탁해진다.

   ⚠️ 과하게 하지 않는다. 폭발·불꽃·번개·속도선·만화 효과음은 쓰지
      않는다. 이 채널은 차분하게 설명하는 채널이고, 화려하게 만들수록
      싸구려로 보인다. **풍성함은 층과 공기에서 나오지 요란함에서
      나오지 않는다.**

   ⚠️ 빈 화면도 쓸 데가 있다. 사람이 떠나는 대목(입대·이적)에서는
      일부러 비운다. 다만 그때도 **야구장 안**이다 — 빈 라커, 벗어 둔
      유니폼, 불 꺼진 관중석.
   숫자 자체보다 이 규칙이 중요하다.

   한 편에 얼굴이 보이는 장면은 **많아야 여섯**으로 둔다. 적힌 사람이
   그보다 적으면 그 수만큼만 그린다.

   얼굴을 안 그리는 자리는 이렇게 채운다. 전부 사람보다 안전하고,
   야구 이야기에서 오히려 할 말이 많은 그림이다.

     · 덕아웃 난간, 벤치에 놓인 배트와 헬멧, 걸려 있는 유니폼
     · 전광판, 라커룸 이름표, 명단이 붙은 게시판, 서류 한 장
     · 텅 빈 2군 구장, 불 꺼진 타석, 관중석, 비 오는 더그아웃
     · 뒷모습·실루엣·손·발 — 얼굴이 안 보이는 사람
     · 짐 가방, 공항, 버스, 캠프 짐을 싣는 장면

   얼굴을 그릴 때는 **얼굴이 화면의 주인이 되게** 그린다. 멀리 서 있는
   작은 사람으로 그리면 얼굴이 뭉개져서 안 그린 것만 못하다.

D. 표와 숫자는 그림으로 그리지 말고 **카드로 넘긴다** (card_text).
   일정표, 등급표, 금액, 규정, 한 문장 강조 — 이런 화면은 이미지 모델이
   한글을 또렷하게 못 그린다. card_text 를 채우면 시스템이 글자를 직접
   그려 준다. 그 샷은 이미지 모델을 부르지 않으므로 **돈도 들지 않는다.**

   card_text 를 채운 샷은 image_prompt 를 빈 문자열로 둔다.

   표로 쓸 때 — 첫 줄이 제목, 다음 줄부터 \`항목|값\`:
     FA 보상 규정
     A등급|보호 20명 밖 1명 + 연봉 200%
     B등급|보호 25명 밖 1명 + 연봉 100%

   한 문장을 강조할 때 — 칸(|) 없이 1~2줄만:
     백억짜리 선수의 실제 영입 비용은
     백억이 아닙니다

   한 줄은 24자 안쪽, 줄은 6줄 안쪽으로 한다. 넘으면 글자가 작아져 안 읽힌다.

   ⚠️ **한 장면에 카드는 0장이 기본이다.** (2026-11-07)

   전에는 "한 편에 6~10장"이라고 적었다. 그런데 당신은 **장면 하나만**
   보고 설계한다 — 편 전체가 몇 장인지 알 수가 없다. 그래서 장면마다
   한 장씩 넣었고, 실행 #65 에서 24장이 나왔다. 운영자 말로
   **"글씨가 너무 많다, 사진이 더 많았으면 좋겠다"**.

   그러니 장면 기준으로 말한다.

     · 이 장면의 카드는 **0장이 기본**이다
     · 숫자가 **셋 이상 맞서는 표**일 때만 1장 넣는다
       (390억 대 42억, 상한 대 하한, 세 팀 계약 비교처럼)
     · 숫자가 하나뿐이면 카드로 만들지 않는다. 그림으로 간다
     · 한 장면에 2장은 **없다**

   편 전체로 6~10장이 되게 하려면 장면 넷 중 셋은 카드가 없어야 한다.

   **한 편에 6~10장만 쓴다** (2026-11-03 운영자 지시).

   3화·4화에서 30~41장을 썼다가 글자만 보는 영상이 됐다. 운영자 말로
   "어차피 설명이 다 있다 — 중요한 숫자를 제외하고는 다 이미지로 간다".
   맞는 말이다. 내용은 나레이션과 자막에 이미 다 있다. 카드가 그걸
   한 번 더 적으면 화면이 두 번 같은 말을 한다.

   **카드로 남길 것** — 글로 들으면 놓치는 것만이다.
     · 서로 맞세우는 숫자 두 개 (11년 307억 ↔ 3년 402억)
     · 줄이 셋 이상인 표 (FA 보상 규정, 1군/2군 성적)
     · 날짜와 기간 (11월 1일~24일, 30일 창)

   **카드로 쓰지 말 것** — 그림으로 간다.
     · 한 문장 강조. 자막이 이미 그 문장을 보여 준다
     · 사람 말 인용. 말하는 장면을 그리는 쪽이 낫다
     · 설명을 풀어 쓴 것. 나레이션이 읽고 있다

   연달아 두 장을 넘기지 않는다.`;

/** 이 종류의 화면 설계 지시. */
/**
 * 이 편에 나오는 사람들의 생김새를 화면 지시에 붙인다.
 *
 * 이게 없으면 모델이 샷마다 다른 사람을 그린다. 노리는 것은 **닮음이 아니라
 * 일관성**이다 — 같은 선수가 같은 얼굴로 나오고, 둘이 한 화면에 있을 때
 * 누가 누군지 보이면 된다.
 *
 * 생김새가 없으면 아무것도 붙이지 않는다. 빈 제목만 남으면 모델이 빈 칸을
 * 채우려고 엉뚱한 말을 지어낸다.
 */
export function peopleRules(people) {
  // ── 사진이 있는 사람은 생김새를 **글로 적지 않는다** (2026-11-12) ──
  //
  //   운영자: "자꾸 생김새로 만들지 마라"
  //           "생김새 글로 적는 건 아예 삭제해라. 또 할 것 같다"
  //
  // 사진이 있는데 얼굴을 글로 또 적으면 둘이 싸운다. 글이 이기면
  // 사진 속 사람이 아닌 사람이 나오고, 사진이 이기면 글이 낭비된다.
  // 12화에서 김도영·하주석·이범호가 전부 안 닮게 나온 까닭 중 하나다.
  //
  // **사진이 있으면 얼굴은 사진이 말한다.** 여기서는 아예 뺀다.
  // 사진이 없는 사람만 글로 적는다 — 그 사람은 글 말고 기댈 데가 없다.
  const list = (Array.isArray(people) ? people : []).filter(
    (p) => p?.name && p?.look && !allPhotosOf(p).length
  );
  if (!list.length) return '';

  const lines = list.map((p) => {
    const head = p.role ? `${p.name} (${p.role})` : p.name;
    const tell = p.tell ? `\n    알아보는 표식: ${p.tell}` : '';
    return `  · ${head}\n    ${p.look}${tell}`;
  });

  // ── 유니폼은 여기 적지 않는다 (2026-11-07) ──
  //
  //   "유니폼이 완전 다른 색상이다."
  //
  // 전에는 look 문장 안에 "a KIA Tigers uniform in red and black" 을
  // 적어 두고, 설계 AI 에게 베껴 달라고 **부탁**했다. 안 베끼면 색이
  // 사라진다. 그게 색이 틀린 까닭이었다.
  //
  // 이제 유니폼은 uniforms.mjs 가 만들고 코드가 프롬프트에 직접 꽂는다.
  // 그래서 설계 AI 에게는 **적지 말라고** 한다 — 양쪽이 다 적으면
  // "red and black uniform" 과 "white jersey with black wordmark" 가
  // 서로 싸워 모델이 하나를 버린다.
  return [
    '',
    '━━━ 이 편에 나오는 사람 ━━━',
    '',
    '⚠️ **유니폼 색과 등번호는 적지 않는다.** 그건 코드가 샷마다 구단',
    '표에서 꺼내 붙인다. 여기서 또 적으면 두 지시가 싸워서 색이 틀어진다.',
    '얼굴·몸집·머리·표식만 적는다.',
    '',
    '⚠️ **한 사람에게 샷이 둘 이상이면 하나는 뒷모습이나 뒤쪽 3/4 로',
    '잡는다.** 등번호가 읽혀야 뒤만 봐도 누구인지 안다 — 우리 그림에는',
    '뒷모습이 많고, 거기서는 얼굴로 사람을 가릴 수가 없다(머리 방향',
    '규칙이 뒷모습에 얼굴을 못 그리게 한다). 그 샷에서 사람을 말해',
    '주는 것은 등번호와 유니폼 색뿐이다.',
    '',
    '이 사람이 나오는 샷에는 생김새 문장을 **영어 그대로 베껴** 넣는다.',
    '줄여 쓰거나 말을 바꾸면 샷마다 다른 얼굴이 된다. 이름은 넣지 않는다.',
    '표식이 적힌 사람은 그 표식도 같이 넣는다 — 얼굴만으로는 섞인다.',
    '',
    '그리고 생김새 문장 **맨 앞에 적힌 것이 그 사람의 표식**이다.',
    '그 표식을 또렷하게 그린다 — 안경, 아이블랙, 앞머리, 수염처럼',
    '멀리서도 읽히는 것이다. 그것만 살려 주면 사람이 구분된다.',
    '',
    '━━ 자세를 고르는 법 (2026-11-09 운영자) ━━',
    '',
    '운영자 말 그대로다.',
    '  "전달해 준 이미지를 최대한 활용할 수 있는 건 활용해 그리되,',
    '   없는 장면 중에 중요 장면은 그린다."',
    '  "이런 샷이 안 되겠으면 전달해 준 이미지 중에 하나를 차라리',
    '   워터마크 빼고 지브리 스타일로 그려라."',
    '',
    '**두 쪽이 다 있는 말이다. 한쪽만 들으면 안 된다.**',
    '',
    '1) **사진에 있는 자세를 먼저 쓴다.** 받아 둔 참조 사진은 대개',
    '   세트 포지션, 공을 놓기 직전, 타격 직후 배트를 든 채, 더그아웃',
    '   난간에 선 모습이다. 그런 자세는 모델이 안정적으로 그린다.',
    '   한창 돌아가는 투구·타격 **중간**을 고르면 팔이 꺾이고 하체가',
    '   따로 논다. 정적인 자세라도 **어색한 동작보다 낫다.**',
    '',
    '2) **그렇다고 중요한 장면을 피하지는 않는다.** 그 편의 심장인',
    '   장면은 사진에 없어도 그린다 — 실책이 난 순간, 홈런을 친 순간,',
    '   보상선수로 넘어가는 자리 같은 것이다. 거기서는 **멈추는 자리**를',
    '   고른다: 와인드업 꼭대기, 공을 놓기 직전, 배트가 공에 닿는 순간,',
    '   2루에 손이 닿는 순간. 그 사이의 한창 돌아가는 중간은 피한다.',
    '',
    '⚠️ 1)만 들으면 영상이 전부 가만히 선 사람이 된다. 2)만 들으면',
    '   팔이 꺾인다. **중요한 곳에만 움직임을 쓰고 나머지는 사진 자세로**',
    '   가는 것이 이 말의 뜻이다.',
    '',
    '⚠️ **체격을 바꿔 적지 않는다.** 아래 생김새에 키와 몸무게가 숫자로',
    '적혀 있으면 그 숫자를 **그대로** 넣는다. "덩치 큰", "마른" 같은 말로',
    '바꾸지 않는다. 숫자가 빠지면 모델이 비만이나 아이 체형으로 그린다 —',
    '2026-11-09 에 193cm 102kg 투수가 돼지처럼 나왔다.',
    '',
    '⚠️ **과장하지 않는다.** 전에는 exaggerated 같은 말을 붙여 특징을',
    '밀라고 적었는데(사진으로 오해받을까 봐 넣은 장치였다), 그 바람에',
    '얼굴이 일그러졌다. 보이는 대로 그린다 — 적힌 생김새를 그대로',
    '옮기고, 없는 말을 더하지 않는다.',
    '',
    ...lines,
    '',
    '여기 없는 사람(단장, 기자, 관중 등)은 지어내도 된다.',
    '',
    '⚠️ **위 사람은 한 명도 빠뜨리지 않는다.** 편 전체에서 적어도 한 번은',
    '얼굴이 나와야 하고, 그 샷의 person 칸에 이름을 적어야 한다. 이름을',
    '적어야 받아 둔 사진을 참조로 쓸 수 있고, 그래야 실제로 닮게 나온다.',
  ].join('\n');
}

export function visualsSystemFor(kind, { people = [] } = {}) {
  if (kind !== KIND.SPORTS) return VISUALS_SYSTEM;
  return VISUALS_SYSTEM + SPORTS_VISUALS_RULES + peopleRules(people);
}

export const VISUALS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mood', 'visual_description', 'shots'],
  properties: {
    mood: {
      type: 'string',
      enum: MOODS,
      description:
        'mystery=설명 안 되는 상황, tension=긴장이 올라감, twist=전제가 뒤집힘, record=기록·서류, calm=차분한 설명, somber=가라앉은 분위기',
    },
    visual_description: {
      type: 'string',
      description: '이 장면의 화면을 한국어 한두 문장으로. 사람이 읽고 판단할 설명이다.',
    },
    shots: {
      type: 'array',
      description: '샷 목록. 주어진 샷 개수와 정확히 같아야 한다.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'shot_id',
          'image_prompt',
          'video_prompt',
          'era',
          'camera',
          'motion_need',
          'depicts_real_person',
          'person',
        ],
        properties: {
          shot_id: { type: 'string', description: '주어진 샷 번호를 그대로' },
          image_prompt: {
            type: 'string',
            description:
              '영어. 이 화면의 내용만. 스타일·금지 문구는 시스템이 붙인다. 20~45단어.',
          },
          video_prompt: {
            type: 'string',
            description:
              '영어. 이 화면이 짧은 영상이라면 무엇이 움직이는가. 움직임이 필요 없는 화면이면 빈 문자열.',
          },
          era: {
            type: 'string',
            enum: Object.keys(ERA_TONES),
            description:
              '이 화면이 언제인가. past=과거 회상, present=현재 시점, future=미래, ' +
              'anomaly=설명되지 않는 현상이 화면의 중심인 샷. 색감이 여기서 갈린다.',
          },
          camera: {
            type: 'string',
            enum: IMAGE_CAMERA_MOVES,
            description: '이미지로 만들 때 걸 카메라 움직임',
          },
          motion_need: {
            type: 'integer',
            description:
              '이 샷에 실제 움직임이 얼마나 필요한가 0~10. 걷는 사람·열리는 문·지나가는 차=높음. 오래된 사진·서류·빈 방=낮음. 예산 안에서 높은 것부터 AI 영상으로 만든다.',
          },
          depicts_real_person: {
            type: 'boolean',
            description:
              '실존 인물의 얼굴이 알아볼 수 있게 나오는가. true면 AI 영상으로 만들지 않는다.',
          },
          person: {
            type: 'string',
            description:
              '이 샷에 나오는 사람의 이름. 「이 편에 나오는 사람」에 있는 이름을 ' +
              '그대로 쓴다. 사람이 안 나오거나 누구인지 정해지지 않았으면 빈 문자열. ' +
              '사진을 받아 둔 사람이면 그 사진을 참조로 그려서 실제로 닮게 나온다. ' +
              '⚠️ 그 사람 이야기를 하는 대목인데 이 칸을 비우면 엉뚱한 얼굴이 ' +
              '올라간다. 누구 이야기인지 분명하면 반드시 적는다.',
          },
        },
      },
    },
  },
};

/** 장면 하나의 화면 설계 프롬프트. 순수 함수 — 테스트로 검증한다. */
export function buildVisualsPrompt(scene, { item = null, totalScenes = 0 } = {}) {
  const lines = [];

  lines.push(`장면 ${scene.scene_number}${totalScenes ? `/${totalScenes}` : ''}의 화면을 설계해 주세요.`);
  lines.push('');

  if (item?.title) {
    lines.push(`사건: ${item.title}`);
    if (item.summary) lines.push(`배경: ${item.summary}`);
    lines.push('');
  }

  lines.push(`대본 위치: ${scene.section}`);
  lines.push(`장면 길이: ${scene.duration}초`);
  lines.push('');
  lines.push('나레이션:');
  for (const p of scene.paragraphs || []) {
    lines.push(`  [${p.tag}] ${p.text}`);
  }
  lines.push('');

  // 태그를 화면 설계에 반영시킨다. 이게 이 프로젝트의 핵심 규칙과 이어진다.
  const tags = scene.tags || [];
  if (tags.includes('FACT')) {
    lines.push('※ [FACT] 문단이 있습니다. 기록으로 확인된 내용이므로 화면도 기록에 있는 것만 보여주세요.');
  }
  if (tags.includes('RECONSTRUCTION')) {
    lines.push('※ [RECONSTRUCTION] 문단이 있습니다. 재현 장면이라 연출 여지가 있습니다.');
  }
  if (tags.includes('THEORY')) {
    lines.push('※ [THEORY] 문단이 있습니다. 가설이므로 단정적인 화면을 만들지 마세요. 흐릿하거나 여러 가능성을 암시하는 화면이 맞습니다.');
  }
  if (tags.includes('UNKNOWN')) {
    lines.push('※ [UNKNOWN] 문단이 있습니다. 확인되지 않은 부분이므로 비어 있는 화면, 끊긴 기록, 빠진 자리를 보여주세요.');
  }
  lines.push('');

  lines.push(`샷 ${(scene.shots || []).length}개를 설계해 주세요. 샷 번호를 그대로 쓰세요:`);
  for (const shot of scene.shots || []) {
    lines.push(`  ${shot.shot_id} — ${shot.duration}초`);
  }
  lines.push('');
  lines.push('다시 한 번: 시체·피·상처·폭력·겁에 질린 얼굴을 쓰지 않습니다.');
  lines.push('긴장은 빈 공간과 사라진 것으로 만듭니다.');

  return lines.join('\n');
}

/** 완성된 이미지 프롬프트. 내용 + 고정 스타일 + 금지 목록. */
export function composeImagePrompt(content, era = null, { kind = null, likeness = false, paint = null, uniform = '' } = {}) {
  // AI가 문장을 마침표로 끝내 줄 때가 있고 아닐 때가 있다. 그대로 이으면
  // "...a single empty bench.. documentary reenactment still" 처럼 점이 두 개
  // 찍힌다. 실행 #5의 프롬프트 절반이 이랬다.
  //
  // 이미지 모델이 이걸로 그림을 못 그리는 건 아니지만, 우리가 100편 내내
  // 똑같이 붙이는 고정 문구라 틀린 채로 두면 100편 내내 틀린다.
  const body = String(content || '').trim().replace(/[.,;:\s]+$/, '');
  // 시대 색감은 고정 스타일 **앞**에 붙인다. 뒤에 붙이면 공통 색상 지시와
  // 충돌해서 모델이 둘 중 하나를 버린다.
  //
  // 동화는 **시대 색감을 쓰지 않는다.** 팔레트가 고정이라 era 색을 더하면
  // 그 고정이 깨지고, 편마다 색이 달라 보인다.
  //
  // 스포츠도 시대 색감을 쓰지 않는다. 전부 현재 이야기라 구분할 시대가 없다.
  const isTale = kind === KIND.TALE;
  const isSports = kind === KIND.SPORTS;
  const fixed = isTale || isSports;
  let style = isTale ? TALE_STYLE_SUFFIX : isSports ? SPORTS_STYLE_SUFFIX : STYLE_SUFFIX;
  // 그림체만 갈아 끼운다. 사람 규칙(비율·머리카락·얼굴·프레이밍·유니폼)은
  // 그대로 둔다 — 그게 바뀌면 무엇 때문에 달라졌는지 가를 수가 없다.
  if (isSports && paint && paint !== SPORTS_PAINT) {
    style = style.replace(SPORTS_PAINT, paint);
  }
  // 사진을 받아 둔 사람이면 닮게 그리라고 하고, 아니면 지어내라고 한다.
  // 두 줄을 같이 붙이면 서로 반대라 모델이 하나를 버린다.
  if (isSports) {
    style += `, ${likeness ? SPORTS_LIKENESS_CLAUSE : SPORTS_INVENTED_CLAUSE}`;
  }
  let negative = isSports ? `${NEGATIVE_SUFFIX}, ${SPORTS_NEGATIVE_EXTRA}` : NEGATIVE_SUFFIX;
  // ⚠️ 공통 금지 목록의 'no real identifiable public figures' 는 닮게
  //    그리라는 줄과 **정반대**다. 둘을 같이 보내면 모델이 하나를 버리고,
  //    어느 쪽을 버렸는지는 그림이 나와야 안다. 닮게 그리는 샷에서만 뺀다.
  //    사진을 안 준 샷에서는 그대로 남는다.
  if (likeness) negative = negative.replace('no real identifiable public figures, ', '');
  const tone = !fixed && ERA_TONES[era] ? `${ERA_TONES[era]}. ` : '';
  // ── 유니폼은 장면 설명 **바로 뒤**다 (2026-11-07) ──
  //
  // 고정 스타일 문구가 수백 자다. 그 뒤에 색을 적으면 모델이 앞쪽만
  // 무겁게 보고 색을 흘린다. 장면 바로 뒤, 스타일 앞에 둔다.
  //
  // 글자 카드 샷에는 사람이 없으니 uniform 이 빈 값으로 온다.
  const uni = String(uniform || '').trim().replace(/[.,;:\s]+$/, '');
  const dressed = uni ? `${uni}. ` : '';
  if (!body) return `${dressed}${tone}${style}. ${negative}`;
  return `${body}. ${dressed}${tone}${style}. ${negative}`;
}

/**
 * 돌아온 프롬프트를 검사한다.
 *
 * 반환: { ok, violations }
 *   violations: [{ shot_id, field, word, excerpt }]
 *
 * 걸린 샷은 다시 설계시킨다. 조용히 통과시키면 Phase 3에서 돈을 써서
 * 불쾌한 이미지를 만들어 놓고 나서야 알게 된다.
 */
/**
 * 한 편에 글자 카드가 몇 장인지 센다.
 *
 * 2026-11-07 운영자: "글씨가 너무 많다, 사진이 더 많았으면 좋겠다."
 * 실행 #65 가 74 샷 중 24장이 카드였다.
 *
 * 규칙은 전부터 "한 편에 6~10장"이었는데, 장면을 하나씩 설계하는
 * AI 는 편 전체를 못 본다. 그래서 **다 모인 뒤에** 센다.
 *
 * 막지는 않는다 — 여기서 실패시키면 이미 돈을 쓴 설계를 버리게 된다.
 * 사람에게 보이게만 한다. 넘치면 기획을 고치거나 다시 설계시킨다.
 */
export const CARD_MAX = 10;

export function countCards(shots) {
  const list = Array.isArray(shots) ? shots : [];
  const cards = list.filter((x) => String(x?.card_text || '').trim()).length;
  return {
    cards,
    total: list.length,
    tooMany: cards > CARD_MAX,
    note:
      cards > CARD_MAX
        ? `글자 카드가 ${cards}장입니다 (샷 ${list.length}개 중). ` +
          `한 편에 ${CARD_MAX}장까지가 좋습니다 — 글씨가 많으면 보는 사람이 읽기만 합니다. ` +
          '숫자가 셋 이상 맞서는 자리만 카드로 두고 나머지는 그림으로 바꾸세요.'
        : '',
  };
}

export function checkPrompts(shots) {
  const violations = [];
  for (const shot of Array.isArray(shots) ? shots : []) {
    for (const field of ['image_prompt', 'video_prompt']) {
      const text = String(shot?.[field] || '').toLowerCase();
      if (!text) continue;
      for (const word of BANNED_PROMPT_WORDS) {
        const at = text.indexOf(word);
        if (at === -1) continue;
        violations.push({
          shot_id: shot.shot_id,
          field,
          word,
          excerpt: text.slice(Math.max(0, at - 25), at + word.length + 25),
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * 돌아온 설계를 샷에 합친다.
 *
 * AI가 샷을 빠뜨리거나 없는 샷 번호를 보내는 경우를 여기서 흡수한다.
 * 합치지 못한 샷은 problems로 알린다.
 */
/**
 * 참조 사진을 받아 둔 사람 이름.
 *
 * `people[].photo` 가 http(s) 주소일 때만 센다. 로컬 경로는 이미지 모델이
 * 열 수 없다 — 적어 놓고 안 쓰면 닮지 않은 그림이 나오는데 왜 그런지
 * 알 길이 없다.
 *
 * ⚠️ 여기 넘어오는 `item` 은 **이미 research 다**(main.mjs 가
 *    `item: loaded.research` 로 넘긴다). 처음에 `item.research.people` 을
 *    봤는데 그건 항상 비어 있었다 — 사진을 넣어도 한 장도 안 붙는다.
 *    조용히 실패하는 종류라, 두 모양을 다 받아 둔다.
 */
export function photoNamesOf(item) {
  const out = new Set();
  const people = item?.people || item?.research?.people || [];
  for (const p of people) {
    const name = String(p?.name || '').trim();
    if (name && /^https?:\/\//.test(mainPhoto(p))) out.add(name);
  }
  return out;
}

/**
 * 이름 → 유니폼 문장.
 *
 * 2026-11-07 운영자: "유니폼이 완전 다른 색상이다."
 *
 * 유니폼을 설계 AI 에게 맡기지 않고 **코드가 프롬프트에 적기 위한** 지도다.
 * photoNamesOf 와 같은 자리에서 같은 모양으로 만든다 — 둘 다 `item` 의
 * 사람 목록을 보고, 샷의 `person` 칸으로 꺼내 쓴다.
 *
 * 표에 없는 팀이거나 team 을 안 적은 사람은 **넣지 않는다.** 그러면
 * composeImagePrompt 가 유니폼 문장 없이 그리고, 고정 문구의 밑줄만
 * 적용된다 — 지금과 같아진다.
 */
/**
 * 이 편에 팀이 **하나뿐이면** 그 팀의 유니폼 문장.
 *
 * ── 왜 필요한가 (2026-11-11) ──
 *
 * 사람 이름이 아예 안 붙은 샷이 있다. 3:47 의 "안에서 누구를 어디에
 * 세우나" 샷이 그랬다 — 야구 선수가 나오는데 누구인지는 안 적혀 있다.
 * 그러면 유니폼 문장이 안 붙고, 모델이 **노란 유니폼**을 지어냈다.
 *
 * 운영자: "동작이 어색하다. 이건 무슨 동작인가?"
 *
 * 12화처럼 나오는 사람이 전부 한 팀이면 답은 분명하다. 그 팀으로
 * 입힌다. 두 팀 이상이면 알 수 없으므로 아무것도 하지 않는다 —
 * 틀린 유니폼은 유니폼이 없는 것보다 나쁘다.
 */
export function soleTeamUniform(item) {
  const people = item?.people || item?.research?.people || [];
  const teams = new Set();
  let clause = '';
  for (const p of people) {
    const key = teamKey(p?.team);
    if (!key) continue;
    teams.add(key);
    // 등번호는 넣지 않는다. 누구인지 모르는 샷이라 번호를 달면 거짓이 된다.
    if (!clause) clause = uniformClause({ team: p.team });
  }
  return teams.size === 1 ? clause : '';
}

export function uniformsOf(item) {
  const out = new Map();
  const people = item?.people || item?.research?.people || [];
  for (const p of people) {
    const name = String(p?.name || '').trim();
    if (!name) continue;
    const clause = uniformClause({ team: p?.team, number: p?.number, role: p?.role });
    if (clause) out.set(name, clause);
  }
  return out;
}

/**
 * 이 샷에 **누가 나오는가**.
 *
 * ── 왜 person 칸만 믿으면 안 되나 (2026-11-11) ──
 *
 * 유니폼과 등번호는 코드가 적는다. 그런데 **어느 표를 찾을지는**
 * 설계 AI 가 적어 준 `person` 칸에 달려 있었다. 그 칸이 비면 구단을
 * 못 찾고, 못 찾으면 모델이 아무 유니폼이나 그린다.
 *
 * 12화에서 그 일이 났다 —
 *   · 김도영 모자에 보스턴 **B**
 *   · 등번호가 **1** (김도영은 5다)
 *   · 유니폼이 남색·금색 (KIA 는 빨강·검정이다)
 *
 * 운영자: "이게 어디가 김도영인가?" / "김도영 등번호가 틀리다"
 *
 * CLAUDE.md 에 **"유니폼과 등번호는 코드가 적는다. 설계 AI 에게
 * 맡기지 않는다"** 고 적어 두고, 어느 사람인지는 아직 맡기고 있었다.
 * 부탁으로 지켜지는 규칙이 아니라는 것을 또 확인한 셈이다.
 *
 * 그래서 person 칸이 비면 **샷의 글에서 이름을 찾는다.** 설계 AI 가
 * 화면 설명에 "김도영이 유격수 자리에 선다" 라고 썼다면 거기서 집는다.
 */
/**
 * 이 샷에 **얼굴이 보이는가**.
 *
 * ── 왜 보나 (2026-11-11) ──
 *
 * 12화에서 실사로 나온 샷이 셋 있었는데 **전부 뒷모습**이었다.
 * 하주석 뒷모습, 김도영 등번호 5 뒷모습, 슬라이딩 뒷모습.
 *
 * 운영자: "그림톤이 왜 또 안 맞나" / "이것도 톤이 안 맞다"
 *
 * 까닭이 분명하다. 화풍을 붙잡는 문구(SPORTS_LIKENESS_CLAUSE)가
 * **거의 전부 얼굴 이야기**다 — 납작하게 칠한 살갗, 눈과 눈썹의
 * 잉크 선, 턱선의 윤곽. 뒷모습에는 얼굴이 없으니 그 문구가 하나도
 * 안 걸린다. 그런데 사진 참조는 그대로 들어간다. 붙잡는 것 없이
 * 사진만 보여 주니 사진 쪽으로 끌려간 것이다.
 *
 * 그리고 뒷모습에는 참조가 **필요 없다.** 거기서 사람을 말해 주는
 * 것은 등번호와 유니폼 색뿐이고, 그 둘은 코드가 적는다.
 * (2026-11-07 운영자: "유니폼과 등번호가 같아야 뒤만 봐도 알 수 있다")
 *
 * 돈도 덜 든다 — 참조 모델은 장당 $0.05, 보통 모델은 $0.025 다.
 */
export function facesCamera(d) {
  const t = `${d?.image_prompt || ''} ${d?.video_prompt || ''}`.toLowerCase();
  // 뒤에서 본다고 적혀 있으면 얼굴이 없다.
  return !/(from behind|seen from the back|back view|rear view|facing away|over the shoulder from behind|뒷모습)/.test(t);
}

export function personOfShot(d, names) {
  const direct = String(d?.person || '').trim();
  if (direct && names.has(direct)) return direct;
  const text = `${d?.image_prompt || ''} ${d?.card_text || ''} ${d?.video_prompt || ''}`;
  // 긴 이름부터 본다 — 짧은 이름이 긴 이름 안에 들어 있을 수 있다.
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    if (n && text.includes(n)) return n;
  }
  return direct;
}

export function mergeVisuals(
  scene,
  design,
  { kind = null, photoNames = null, uniforms = null, fallbackUniform = '' } = {}
) {
  const byId = new Map(
    (design?.shots || []).filter((s) => s?.shot_id).map((s) => [s.shot_id, s])
  );
  const problems = [];

  const shots = (scene.shots || []).map((shot) => {
    const d = byId.get(shot.shot_id);
    if (!d) {
      problems.push(`샷 ${shot.shot_id}의 화면 설계가 없습니다.`);
      return shot;
    }
    byId.delete(shot.shot_id);
    // ⚠️ 유니폼·등번호를 찾을 이름. person 칸이 비어도 글에서 집는다.
    const who = personOfShot(d, new Set([...(uniforms?.keys() || []), ...(photoNames || [])]));
    // 카드 샷은 이미지 모델을 부르지 않는다. 그래서 image_prompt 를
    // **비워 둔다** — 채워 두면 나중에 누가 그걸로 그림을 만들어서 돈이
    // 나가고, 화면에는 카드가 올라가 그림은 버려진다.
    const cardText = String(d.card_text || '').trim();
    return {
      ...shot,
      era: ERA_TONES[d.era] ? d.era : 'present',
      card_text: cardText,
      image_prompt: cardText
        ? ''
        : composeImagePrompt(d.image_prompt, ERA_TONES[d.era] ? d.era : 'present', {
            kind,
            // ⚠️ 뒷모습이면 참조를 쓰지 않는다. 붙잡을 얼굴이 없어서
            //    화풍이 사진 쪽으로 끌려간다(2026-11-11).
            likeness: Boolean(photoNames && photoNames.has(who)) && facesCamera(d),
            // 이 샷에 누가 나오는지는 person 칸을 **먼저** 보고, 비어
            // 있으면 샷의 글에서 이름을 찾는다(personOfShot). 그 이름으로
            // 구단 표를 찾아 유니폼과 등번호를 **코드가** 적는다.
            uniform: (uniforms && uniforms.get(who)) || fallbackUniform || '',
          }),
      image_prompt_content: cardText ? '' : d.image_prompt,
      video_prompt: d.video_prompt ? d.video_prompt.trim() : '',
      camera: IMAGE_CAMERA_MOVES.includes(d.camera) ? d.camera : 'zoom in',
      motion_need: clampInt(d.motion_need, 0, 10),
      depicts_real_person: Boolean(d.depicts_real_person),
      // 누구인지. 사진을 받아 둔 사람이면 그 사진을 참조로 그린다.
      // ⚠️ 뒷모습 샷은 사람 이름을 비운다 — images.mjs 가 이 칸을 보고
      //    참조 모델을 고르기 때문이다. 유니폼·등번호는 그대로 붙는다.
      person: facesCamera(d) ? who || String(d.person || '').trim() : '',
    };
  });

  // ── 사람 얼굴이 든 샷을 다듬는다 (3화를 보고 넣었다, 2026-11-01)
  //
  // 3화에서 운영자가 본 것 두 가지다.
  //   "동작이랑 얼굴 방향도 안 맞다"
  //   "얼굴이 영상에서 붕 떠있다"
  //
  // 원인은 하나다. 한 장면이 샷 두세 개로 쪼개지고, **샷마다 그림을
  // 따로 그린다.** 같은 사람을 따로 그리면 얼굴도 방향도 자세도 다
  // 다르게 나온다. 18초 동안 세 사람이 지나가는 셈이다.
  //
  // 글로 설명을 더 붙여서 풀 수 있는 문제가 아니다 — 한 번 해 봤고
  // 안 됐다. 그려 달라는 장 수를 줄이는 것만 통한다.
  //
  // 그래서 둘을 한다.
  //   ① 한 장면 안의 인물 샷은 **그림 한 장을 나눠 쓴다**
  //      (얼굴이 바뀔 수가 없어진다. 돈도 그만큼 덜 든다)
  //   ② 인물 샷의 카메라를 `hold` 로 고정한다
  //      (가로 이동·큰 확대가 "붕 뜨는" 느낌을 만들었다)
  //
  // ⚠️ 2026-11-04 에 조건을 달았다. 이 묶기는 **참조 사진이 없을 때만**
  //    한다. 사진이 있으면 샷마다 같은 얼굴이 나오므로 묶을 이유가
  //    없고, 묶으면 한 장면이 통째로 정지 그림 한 장이 된다.
  //    운영자가 "야구장 같은 현장감을 넣어 달라"고 했는데 이 코드가
  //    바로 그 반대를 하고 있었다.
  const hasPhoto = (name) =>
    Boolean(photoNames && photoNames.has(String(name || '').trim()));

  let faceSource = null;
  for (const shot of shots) {
    if (!shot.depicts_real_person || shot.card_text) continue;
    if (hasPhoto(shot.person)) continue; // 사진이 있으면 그대로 둔다
    // 얼굴은 움직이지 않는다. 모델이 pan 을 골랐어도 덮어쓴다.
    shot.camera = 'hold';
    if (!faceSource) {
      faceSource = shot.shot_id;
      continue;
    }
    // 두 번째 인물 샷부터는 첫 장을 가리킨다. 프롬프트를 비워서
    // 이미지 모델을 부르지 않게 한다 — 채워 두면 돈이 나가고 그림은
    // 버려진다(카드 샷과 같은 이유다).
    shot.same_image_as = faceSource;
    shot.image_prompt = '';
    shot.image_prompt_content = '';
    shot.video_prompt = '';
  }

  for (const leftover of byId.keys()) {
    problems.push(`대본에 없는 샷 번호가 돌아왔습니다: ${leftover}`);
  }

  return {
    scene: {
      ...scene,
      mood: MOODS.includes(design?.mood) ? design.mood : 'mystery',
      visual_description: String(design?.visual_description || '').trim(),
      shots,
    },
    problems,
  };
}

/**
 * 스포츠 분석 편의 화면 설계 스키마.
 *
 * 공통 스키마에 `card_text` 한 칸을 더한다. 다른 종류에는 더하지 않는다 —
 * 쓸 일이 없는 칸을 보여 주면 거기에도 뭔가를 채워 넣기 때문이다.
 *
 * strict 모드라서 **선택 필드를 둘 수 없다.** 그래서 "항상 있는 문자열"로
 * 두고, 비어 있으면 보통 그림이라는 뜻으로 쓴다.
 */
export const SPORTS_VISUALS_SCHEMA = (() => {
  const base = JSON.parse(JSON.stringify(VISUALS_SCHEMA));
  const shot = base.properties.shots.items;
  shot.required = [...shot.required, 'card_text'];
  shot.properties.card_text = {
    type: 'string',
    description:
      '이 샷을 글자 카드로 보여줄 때의 내용. 보통 그림이면 빈 문자열. ' +
      '첫 줄이 제목이고 다음 줄부터 "항목|값". 칸(|) 없이 1~2줄만 쓰면 강조 문장이 된다. ' +
      '채우면 image_prompt 는 빈 문자열로 둔다.',
  };
  return base;
})();

/** 이 종류의 화면 설계 스키마. */
export function visualsSchemaFor(kind) {
  return kind === KIND.SPORTS ? SPORTS_VISUALS_SCHEMA : VISUALS_SCHEMA;
}

/**
 * 장면 하나의 화면을 설계한다.
 *
 * 금지 목록에 걸리면 걸린 말을 알려주고 한 번 다시 시킨다.
 * 두 번 다 걸리면 그 장면을 문제로 표시해 사람이 보게 한다.
 */
export async function designScene(scene, { item = null, totalScenes = 0, model = MODELS.script } = {}) {
  const basePrompt = buildVisualsPrompt(scene, { item, totalScenes });
  // 종류는 소재 레코드가 들고 있다. 화면 지시와 스키마가 여기서 갈린다.
  const kind = item?.kind || null;
  const system = visualsSystemFor(kind, { people: item?.people || [] });
  const schema = visualsSchemaFor(kind);

  let design = await callForJson({
    system,
    prompt: basePrompt,
    toolName: 'submit_shots',
    description: '장면의 화면 설계를 제출한다',
    schema,
    model,
    maxTokens: 8000,
  });

  let check = checkPrompts(design?.shots);
  if (!check.ok) {
    const retryPrompt = [
      basePrompt,
      '',
      '━━━ 이전 설계에 쓸 수 없는 표현이 있었습니다 ━━━',
      ...check.violations.map((v) => `- ${v.shot_id} ${v.field}: "${v.word}" (…${v.excerpt}…)`),
      '',
      '이 화면들을 다시 설계해 주세요. 사건을 직접 보여주지 말고,',
      '그 사건이 지나간 자리를 보여주세요 — 비어 있는 공간, 남겨진 물건, 끊긴 기록.',
    ].join('\n');

    design = await callForJson({
      system,
      prompt: retryPrompt,
      toolName: 'submit_shots',
      description: '장면의 화면 설계를 제출한다',
      schema,
      model,
      maxTokens: 8000,
    });
    check = checkPrompts(design?.shots);
  }

  const merged = mergeVisuals(scene, design, {
    kind: item?.kind,
    photoNames: photoNamesOf(item),
    uniforms: uniformsOf(item),
    // 이름이 안 붙은 샷에도 유니폼을 입힌다 — 편에 팀이 하나뿐일 때만.
    fallbackUniform: soleTeamUniform(item),
  });
  const problems = [...merged.problems];
  if (!check.ok) {
    problems.push(
      `장면 ${scene.scene_number}: 쓸 수 없는 표현이 두 번 다 남았습니다 ` +
        `(${[...new Set(check.violations.map((v) => v.word))].join(', ')}). 사람이 확인해야 합니다.`
    );
  }

  return { scene: merged.scene, problems };
}

/** 장면 전체. 하나가 실패해도 나머지는 계속 진행한다. */
export async function designAllScenes(scenes, { item = null, model = MODELS.script, onProgress } = {}) {
  const out = [];
  const problems = [];

  for (const scene of scenes) {
    onProgress?.(`화면 설계 ${scene.scene_number}/${scenes.length} (${scene.section}, 샷 ${scene.shots.length}개)`);
    try {
      const r = await designScene(scene, { item, totalScenes: scenes.length, model });
      out.push(r.scene);
      problems.push(...r.problems);
    } catch (err) {
      out.push(scene);
      problems.push(`장면 ${scene.scene_number} 화면 설계 실패: ${err?.message || err}`);
      // 계정 한도나 인증 문제는 다음 장면에서도 똑같이 난다. 남은 장면을
      // 마저 때려 봐야 같은 400 을 스물세 번 더 받을 뿐이고, 그 뒤 그림
      // 단계가 쓸 수 없는 편에 돈을 쓴다. 여기서 멈춘다.
      if (isFatalApiError(err)) {
        err.designedScenes = out.length;
        err.problems = problems;
        throw err;
      }
    }
  }

  return { scenes: out, problems };
}

function clampInt(n, lo, hi) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
