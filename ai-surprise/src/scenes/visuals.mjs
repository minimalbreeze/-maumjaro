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

import { callForJson, MODELS } from '../ai/client.mjs';
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
export const SPORTS_STYLE_SUFFIX =
  // 큰 머리 작은 몸. 캐리커처라는 걸 한눈에 알게 해서 "사진인 줄 알았다"는
  // 오해를 처음부터 막는다.
  'stylized 3D caricature render, oversized head on small body, ' +
  'glossy toy-figure look, soft studio lighting, clean rim light, ' +
  // 얼굴을 단순하게. 디테일이 올라갈수록 누군가를 닮기 시작한다.
  'simplified generic face, no particular likeness, ' +
  // 유니폼은 색으로만. 로고·구단명·스폰서 글자를 넣지 않는다.
  'plain unbranded uniform with solid team colors only, no logos or lettering, ' +
  'shallow depth of field, dark office or stadium background, ' +
  'no text, no watermark, no captions, no subtitles, no logo';

/**
 * 스포츠 편에만 더 붙이는 금지 목록.
 *
 * 공통 금지 목록에 이미 "no real identifiable public figures" 가 있다.
 * 그 줄이 이 종류에서는 가장 중요한 줄이라 **빼지 않는다.** 아래는 상표와
 * 실사 쪽을 한 겹 더 막는 것이다.
 */
export const SPORTS_NEGATIVE_EXTRA =
  'no team logos, no team names, no brand marks, no sponsor text on uniforms, ' +
  'no readable jersey text, no photorealistic faces, no photograph, ' +
  'no real stadium signage, no league emblem';

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

A. 선수 이름을 프롬프트에 쓰지 않는다.
   이미지 모델은 이 선수들의 얼굴을 모른다. 이름을 넣어도 닮지 않고,
   닮게 하려 한 흔적만 남는다. 대신 **팀 색·등번호·상황**으로 쓴다.
     나쁨: "Won Tae-in pitching for Samsung Lions"
     좋음: "a pitcher in a plain navy uniform, number 18, mid-windup, seen from behind"

B. 구단 로고·팀 이름·스폰서 글자를 넣지 않는다.
   유니폼은 색으로만 말한다. 상표를 그리면 쓸 수 없는 그림이 된다.

C. 얼굴이 필요하면 단순한 캐리커처로 둔다.
   정면 클로즈업보다 뒷모습·옆모습·손·책상 위가 낫다. 디테일이 올라갈수록
   누군가를 닮기 시작하고, 닮는 순간 못 쓰는 그림이 된다.

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
   **한 편에 6~10장**이 적당하다. 너무 많으면 글자만 보는 영상이 된다.`;

/** 이 종류의 화면 설계 지시. */
export function visualsSystemFor(kind) {
  return kind === KIND.SPORTS ? VISUALS_SYSTEM + SPORTS_VISUALS_RULES : VISUALS_SYSTEM;
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
export function composeImagePrompt(content, era = null, { kind = null } = {}) {
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
  const style = isTale ? TALE_STYLE_SUFFIX : isSports ? SPORTS_STYLE_SUFFIX : STYLE_SUFFIX;
  const negative = isSports ? `${NEGATIVE_SUFFIX}, ${SPORTS_NEGATIVE_EXTRA}` : NEGATIVE_SUFFIX;
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
export function mergeVisuals(scene, design, { kind = null } = {}) {
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
        : composeImagePrompt(d.image_prompt, ERA_TONES[d.era] ? d.era : 'present', { kind }),
      image_prompt_content: cardText ? '' : d.image_prompt,
      video_prompt: d.video_prompt ? d.video_prompt.trim() : '',
      camera: IMAGE_CAMERA_MOVES.includes(d.camera) ? d.camera : 'zoom in',
      motion_need: clampInt(d.motion_need, 0, 10),
      depicts_real_person: Boolean(d.depicts_real_person),
    };
  });

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
  const system = visualsSystemFor(kind);
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

  const merged = mergeVisuals(scene, design, { kind: item?.kind });
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
    }
  }

  return { scenes: out, problems };
}

function clampInt(n, lo, hi) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}
