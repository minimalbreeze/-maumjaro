/**
 * 야포츠 채널 로고 후보 뽑기.
 *
 * 2026-11-18 효성님이 방향을 정했다 — "검정 바탕에 판화로 찍은 듯한 제비,
 * 입에는 박씨 대신 작은 야구공. 그 아래 YAPORTS."
 *
 * ⚠️ **글자는 모델에게 맡기지 않는다.** 로고에서 가장 흔한 실패가 그것이다.
 *    확산 모델은 글자를 그림으로 그리기 때문에 YAPORTS 가 YAPQRTS 나
 *    YAP0RT5 로 나온다. 그래서 여기서는 **제비만** 뽑고, YAPORTS 는
 *    `스포츠영상/로고/sheet.html` 에서 SVG 로 얹는다. 자간·굵기를 나중에
 *    고칠 수 있다는 이점도 따라온다.
 *
 * ⚠️ 왜 이 파일이 생겼나. SVG 로 손수 여섯 번 그렸는데 사람·별·비행기·가위가
 *    나왔다(2026-11-18). 좌표를 글로 쓰고 결과를 보는 되풀이로는 새 실루엣이
 *    안 맞는다. 모양을 모델에게 받아서, 쓸 만한 것을 보고 SVG 로 다시 그린다.
 *    최종 로고는 벡터여야 한다 — 유튜브 프로필·워터마크·썸네일이 서로 다른
 *    크기를 쓰므로 래스터 한 장으로는 못 버틴다.
 *
 * ⚠️ 프롬프트에 금지를 적지 않는다(CLAUDE.md 13번). flux-schnell·dev 는
 *    negative_prompt 가 없어서 "no text" 가 **긍정 프롬프트에 그대로 붙는다** —
 *    모델은 그 낱말을 보고 글자를 그린다. 무엇을 그릴지로만 적는다.
 *
 * ⚠️ 렌즈 말을 쓰지 않는다(CLAUDE.md 14번). 판화에는 초점이 없다.
 */

import fs from 'node:fs';
import path from 'node:path';

import { createClient as createReplicate, modelFor } from './assets/replicate.mjs';
import { log } from './utils/logger.mjs';

/**
 * 판화·타투 톤.
 *
 * 2026-11-18 효성님이 참고 사진을 줬다 — 검정 철판에 흰 잉크로 찍은 제비.
 * 보고 나서 목표가 분명해졌다. 내가 쫓던 "진짜 제비 실루엣"이 아니라
 * **올드스쿨 타투 제비**다. 날개 두 장을 다 펼치고, 가슴이 통통하고,
 * 점묘로 음영을 넣은 그 모양.
 *
 * ⚠️ **그 사진은 'SEASON COFFEE&BAKE' 라는 가게의 실제 간판이다.**
 *    결(검정 바탕·흰 잉크·타투 판화·아래 두 줄 글자)만 가져오고 제비 모양은
 *    우리 것으로 뽑는다. 남의 로고를 베끼지 않는다 — 로또·책 규칙과 같은 선이다.
 *    그리고 우리에게는 저쪽에 없는 것이 하나 있다. **입에 문 야구공**이다.
 *
 * 여섯 장이 서로 다른 것은 **자세**뿐이고 결은 같아야 한다. 결이 흔들리면
 * 나란히 놓고 자세만 비교할 수가 없다.
 */
const PRINT =
  'drawn in the old-school traditional tattoo style, printed in a single ' +
  'warm off-white ink on a solid black background, a bold clean outline with ' +
  'stippled dot shading inside the wings and the breast, flat graphic shapes ' +
  'in one ink with no gradient, the emblem sits centered with an even black ' +
  'margin on all four sides and open black space below it, the shape stays ' +
  'readable when the whole image is shrunk to the size of a fingernail';

/** 야구공은 솔기를 적어야 야구공으로 읽힌다. 안 적으면 그냥 흰 점이다. */
const BALL =
  'a small baseball held in its beak, the baseball drawn with its two curved ' +
  'seams so it reads as a baseball';

/**
 * 자세만 다른 여섯 가지.
 *
 * 손으로 그릴 때 어디서 무너졌는지를 그대로 후보로 바꿨다 — 위에서 본 형태는
 * 사람이 됐고, 수평 측면은 비행기가 됐다. 어느 쪽이 모델에게서 살아남는지를
 * 본다.
 */
export const LOGO_POSES = [
  {
    key: '타투정면',
    why: '참고 사진에 가장 가까운 자세. 날개 두 장을 활짝 펴고 몸을 비튼다.',
    subject:
      'a swallow in flight seen from the side with its body turned toward the ' +
      'viewer, both wings spread wide and open, one wing sweeping up and back ' +
      'while the other reaches forward across the body, a full rounded breast, ' +
      'a deeply forked tail fanned out behind, ' +
      BALL,
  },
  {
    key: '상승',
    why: '위로 솟는 자세. 아래에 글자 자리가 가장 넓게 남는다.',
    subject:
      'a swallow climbing upward with both wings spread wide and open, the ' +
      'wing tips pointing up and back, a full rounded breast, a deeply forked ' +
      'tail streaming below, ' +
      BALL,
  },
  {
    key: '급강하',
    why: '내려오는 자세. 덩어리가 하나로 뭉쳐 작은 크기에 강하다.',
    subject:
      'a swallow diving downward with both wings spread and swept back, the ' +
      'head low and the deeply forked tail open above, ' +
      BALL,
  },
  {
    key: '원테두리',
    why: '얇은 원 테두리 안에 넣은 엠블럼. 프로필이 원형이라 맞아떨어진다.',
    subject:
      'a swallow in flight with both wings spread wide, a full rounded breast ' +
      'and a deeply forked tail, enclosed in a thin circular frame drawn in the ' +
      'same ink, ' +
      BALL,
  },
  {
    key: '단순',
    why: '가장 적은 획. 24px 에서 살아남는지를 보는 안이다.',
    subject:
      'a bold simple swallow in flight with both wings spread, drawn with a ' +
      'clean heavy outline and almost no shading so that only three shapes ' +
      'read at a glance: the two open wings and the forked tail, ' +
      BALL,
  },
  {
    key: '점묘',
    why: '점묘 음영을 가장 세게 준 안. 판화 느낌이 제일 진하다.',
    subject:
      'a swallow in flight with both wings spread wide, the wings and breast ' +
      'filled with dense stippled dots so the ink reads as carved texture, a ' +
      'deeply forked tail behind, ' +
      BALL,
  },
];

/** 로고 후보 한 장의 프롬프트. 자세를 **앞**에, 판화 결을 뒤에 둔다. */
export function logoPrompt(pose) {
  // ⚠️ 자리가 중요하다(CLAUDE.md 13번). 뒤에 붙은 고정 문구가 앞말을
  //    이기므로, 바뀌면 안 되는 **판화 결**을 뒤에 둔다. 자세는 장마다
  //    다르니 앞이다.
  return `${pose.subject}. ${PRINT}.`;
}

export async function cmdLogo(flags) {
  const modelKey = String(flags.model || 'dev');
  modelFor(modelKey); // 모르는 이름이면 돈 쓰기 전에 여기서 막힌다

  const only = String(flags.only || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const poses = only.length ? LOGO_POSES.filter((p) => only.includes(p.key)) : LOGO_POSES;
  if (!poses.length) {
    log.error(`그런 자세가 없습니다: ${only.join(', ')}`);
    log.info(`쓸 수 있는 것: ${LOGO_POSES.map((p) => p.key).join(', ')}`);
    process.exit(1);
  }

  const per = modelFor(modelKey).usdPerImage;
  log.section(`🐦 야포츠 로고 후보  |  ${poses.length}장  |  ${modelKey}`);
  log.info('검정 바탕 · 판화 · 공을 문 제비. 글자는 여기서 안 넣습니다.');
  log.info('YAPORTS 는 뽑힌 모양을 보고 SVG 로 얹습니다 — 모델이 쓰면 깨집니다.');
  for (const p of poses) log.raw(`  · ${p.key} — ${p.why}`);
  log.info(`예상 비용 약 $${Math.round(poses.length * per * 10000) / 10000}`);

  if (flags['dry-run']) {
    log.raw('');
    log.info('미리보기입니다. 돈을 쓰지 않고 여기서 멈춥니다.');
    log.raw(`  ${logoPrompt(poses[0]).slice(0, 200)}…`);
    return;
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    log.error('REPLICATE_API_TOKEN 이 없습니다.');
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), 'preview', '로고');
  fs.mkdirSync(outDir, { recursive: true });
  const api = createReplicate({ token });

  let spent = 0;
  const made = [];
  const urls = [];
  for (const [i, pose] of poses.entries()) {
    log.step(`${i + 1}/${poses.length} — ${pose.key}`);
    try {
      const r = await api.generate(logoPrompt(pose), {
        modelKey,
        // 프로필이 원형이라 정사각으로 뽑는다. 16:9 로 뽑으면 좌우가 잘린다.
        aspectRatio: '1:1',
      });
      spent += r.usdEstimate ?? per;
      const bytes = await api.download(r.url);
      const file = `제비-${pose.key}.png`;
      fs.writeFileSync(path.join(outDir, file), bytes);
      made.push(file);
      // ⚠️ 주소를 로그에 찍는다. 아티팩트는 이 컨테이너에서 못 받으므로
      //    (Azure 가 403) 결과를 보려면 이 주소뿐이다.
      urls.push(`${pose.key}: ${r.url}`);
      log.raw(`    ${r.url}`);
    } catch (e) {
      log.error(`${pose.key}: ${e.message}`);
    }
  }

  fs.writeFileSync(
    path.join(outDir, '보는-법.md'),
    [
      '# 야포츠 로고 후보 — 제비',
      '',
      '검정 바탕 · 판화 · 입에 야구공(박씨 대신). **글자는 들어 있지 않습니다.**',
      'YAPORTS 는 고른 모양을 SVG 로 다시 그린 뒤 얹습니다.',
      '',
      `쓴 돈 약 $${Math.round(spent * 10000) / 10000} (추정치)`,
      '',
      '## 고를 때',
      '',
      '- **손톱만 하게 줄여도 제비로 읽히는가.** 로고의 유일한 절대 조건이다',
      '- 비행기나 사람으로 보이지 않는가 (손으로 그렸을 때 여섯 번 다 그렇게 됐다)',
      '- 공이 부리에 **붙어** 있는가, 따로 떠 있지 않은가',
      '- 아래에 YAPORTS 가 들어갈 자리가 비어 있는가',
      '',
      '## 자세',
      '',
      ...poses.map((p) => `- **${p.key}** — ${p.why}`),
      '',
      '## 주소 (아티팩트를 못 받을 때)',
      '',
      ...urls.map((u) => `- ${u}`),
    ].join('\n') + '\n',
    'utf8'
  );

  log.raw('');
  if (!made.length) {
    log.error(`한 장도 만들지 못했습니다 — ${poses.length}장 모두 실패`);
    log.info('위의 ❌ 줄에 이유가 있습니다.');
    process.exitCode = 1;
    return;
  }
  if (made.length < poses.length) {
    log.warn(`${poses.length - made.length}장 실패 (${made.length}/${poses.length} 성공)`);
  }
  log.ok(`로고 후보 ${made.length}장 — preview/로고/`);
  log.info('다음: 쓸 만한 모양을 골라 SVG 로 다시 그리고 YAPORTS 를 얹습니다.');
}
