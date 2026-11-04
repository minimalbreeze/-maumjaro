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
      'composed in three layers - a soft out-of-focus object close to the ' +
      'camera, the subject sharp in the middle, and a loosely painted ' +
      'background behind - with gentle atmosphere such as light haze, ' +
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
  // ── 비율 ──
  // 'oversized head on small body' 를 쓰다가 아기 인형이 나왔다.
  // 어른 비율을 숫자로 못 박는다. 비율은 말로 두면 반드시 흐려진다.
  'realistic adult proportions, head about one seventh of total height, ' +
  'an adult athlete in his twenties or thirties, never a child, ' +
  'never chibi, never a toddler or baby face, ' +
  // ── 머리카락 ──
  // 이 줄이 통째로 없어서 **대머리**가 나왔다. 모자를 쓴 샷에서도
  // 모자 밑으로 머리가 보여야 한다.
  'a full head of short black hair, visible even under a cap, never bald, ' +
  // ── 얼굴 ──
  // 1화에서 눈코입 없는 동그라미가 나왔던 적이 있다. 얼굴은 그린다.
  // 다만 'clear large eyes' 는 빼야 한다 — 그게 아기 눈을 만들었다.
  'a face drawn in anime style with defined eyebrows, eyes and mouth, ' +
  // ── 프레이밍 ──
  // 벤치에 앉은 샷에서 **다리가 잘려** 나왔다. 어디까지 담을지 못 박는다.
  'framed as a waist-up or full-body shot with the whole figure inside the frame, ' +
  'never cropping limbs at an awkward point, ' +
  // ── 유니폼 ──
  // 2026-11-03 운영자: "유니폼은 전부 국대 유니폼으로 바꿔라".
  // 전에는 'plain unbranded uniform ... no logos or lettering' 이었다.
  // 그래서 어느 팀인지 읽히지 않는 흰 옷만 나왔다. 참조 그림에서는
  // 가슴 글자가 그림의 중심이다 — 글자를 지우면 야구 그림이 아니게 된다.
  'wearing the South Korea national baseball team uniform: a white or light ' +
  'grey jersey with KOREA across the chest in navy block letters, navy and ' +
  'red trim, a navy cap, dark belt, the lettering and seams painted with ' +
  'the same care as the rest of the picture, ' +
  'unhurried composition with room around the subject, ' +
  'soft depth, stadium or dugout background painted with care, ' +
  'no caption text, no watermark, no subtitles, no sponsor logo';

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
  'no caricature or exaggeration of his features';

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
  'no club team logos, no brand marks, no sponsor text on uniforms, ' +
  'no photorealistic faces, no photograph, ' +
  'no real stadium signage, no league emblem, ' +
  // 3화·4화에서 실제로 나온 것들이다. 하나씩 이름을 적어 막는다.
  'no 3D render, no CGI, no Pixar style, no toy figure, no doll, no figurine, ' +
  'no chibi, no oversized head, no baby face, no toddler, ' +
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
  const list = (Array.isArray(people) ? people : []).filter((p) => p?.name && p?.look);
  if (!list.length) return '';

  const lines = list.map((p) => {
    const head = p.role ? `${p.name} (${p.role})` : p.name;
    const tell = p.tell ? `\n    알아보는 표식: ${p.tell}` : '';
    return `  · ${head}\n    ${p.look}${tell}`;
  });

  return [
    '',
    '━━━ 이 편에 나오는 사람 ━━━',
    '',
    '이 사람이 나오는 샷에는 생김새 문장을 **영어 그대로 베껴** 넣는다.',
    '줄여 쓰거나 말을 바꾸면 샷마다 다른 얼굴이 된다. 이름은 넣지 않는다.',
    '표식이 적힌 사람은 그 표식도 같이 넣는다 — 얼굴만으로는 섞인다.',
    '',
    '그리고 생김새 문장 **맨 앞에 적힌 것이 그 사람의 표식**이다.',
    '그 표식을 또렷하게 그린다 — 안경, 아이블랙, 앞머리, 수염처럼',
    '멀리서도 읽히는 것이다. 그것만 살려 주면 사람이 구분된다.',
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
export function composeImagePrompt(content, era = null, { kind = null, likeness = false, paint = null } = {}) {
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
  if (!body) return `${tone}${style}. ${negative}`;
  return `${body}. ${tone}${style}. ${negative}`;
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
    if (name && /^https?:\/\//.test(String(p?.photo || '').trim())) out.add(name);
  }
  return out;
}

export function mergeVisuals(scene, design, { kind = null, photoNames = null } = {}) {
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
            likeness: Boolean(photoNames && photoNames.has(String(d.person || '').trim())),
          }),
      image_prompt_content: cardText ? '' : d.image_prompt,
      video_prompt: d.video_prompt ? d.video_prompt.trim() : '',
      camera: IMAGE_CAMERA_MOVES.includes(d.camera) ? d.camera : 'zoom in',
      motion_need: clampInt(d.motion_need, 0, 10),
      depicts_real_person: Boolean(d.depicts_real_person),
      // 누구인지. 사진을 받아 둔 사람이면 그 사진을 참조로 그린다.
      person: String(d.person || '').trim(),
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
