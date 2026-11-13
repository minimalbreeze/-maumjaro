import { PRONOUNCE, SUBTITLE_SPELLING, FA_GRADE } from '../audio/speech.mjs';

// 대본이 **귀로 들을 때** 자연스러운지 본다.
//
// ─────────────────────────────────────────────────────────────
// 왜 이 파일이 있나
// ─────────────────────────────────────────────────────────────
//
// 1화를 다 만들고 나서 운영자가 말했다 — "읽어 주는 워딩이 보다 더
// 자연스러웠으면 좋겠다"(2026-10-24).
//
// 대본을 세어 보니 이유가 숫자로 나왔다.
//
//   문장 123개 중 69개(56%)가 「-습니다 / -입니다」로 끝난다
//   물음표·구어체 종결은 5개뿐
//   같은 어미가 최대 4문장 연속
//
// 글로 읽으면 멀쩡하다. 단정하고 깔끔하다. 그런데 **소리로 바꾸면**
// 같은 높이의 종소리를 백 번 치는 것이 된다. 중계 캐스터는 그렇게
// 말하지 않는다 — 묻고, 끊고, 되짚는다.
//
// 목소리를 Puck 으로 바꾸고 속도를 1.08 로 올린 것은 **말투**를 고친
// 것이지 **문장**을 고친 것이 아니다. 문장이 전부 같은 꼴이면 어떤
// 목소리로 읽어도 같은 가락이 나온다. 그래서 여기를 고친다.
//
// ─────────────────────────────────────────────────────────────
// 왜 오류가 아니라 경고인가
// ─────────────────────────────────────────────────────────────
//
// 이건 맞고 틀림이 아니라 **정도**의 문제다. 규정을 읽는 대목은 딱딱한
// 쪽이 오히려 믿음직하고, 숫자를 세는 대목에서 말끝을 흐리면 안 된다.
// 기계가 "56%는 많다"고 막아 버리면 좋은 대본도 같이 막힌다.
//
// 그래서 **세어서 보여 주기만** 한다. 고칠지는 사람이 정한다.

/** 「-습니다 / -입니다」 비율이 이보다 높으면 알려 준다. */
export const FORMAL_ENDING_MAX = 0.55;

/** 같은 어미가 이만큼 잇따르면 알려 준다. */
export const SAME_ENDING_RUN_MAX = 3;

/** 한 문장이 이보다 길면 귀로 따라가기 어렵다. */
export const SENTENCE_CHARS_MAX = 60;

/** 물음·되묻기가 이보다 적으면 읽어 주는 느낌이 안 난다 (문장 100개 기준). */
export const QUESTION_PER_100_MIN = 5;

/**
 * 대본에서 실제로 **소리가 되는 문장만** 뽑는다.
 *
 * 제목(##)과 태그([FACT] 따위)는 읽지 않는다. 그것까지 세면 비율이
 * 엉뚱해진다.
 */
export function spokenSentences(markdown) {
  const out = [];
  for (const rawLine of String(markdown || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const body = line.replace(/^\[[A-Z_]+\]\s*/, '').trim();
    if (!body || body === line.trim() && /^\[/.test(line)) continue;
    if (!/^\[[A-Z_]+\]/.test(line)) continue;
    for (const piece of body.split(/(?<=[.?!])\s+/)) {
      const s = piece.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/** 문장의 끝 꼴. 「-습니다」처럼 어미만 본다. */
function endingOf(sentence) {
  const bare = String(sentence).replace(/[.?!…]+$/, '');
  return bare.slice(-4);
}

/**
 * 귀로 들었을 때 걸리는 곳을 센다.
 *
 * 반환: { sentences, formalRatio, questions, longest, runs, notes }
 *   notes 는 사람이 읽을 한 줄짜리 말들이다. 비어 있으면 손댈 데가 없다.
 */
/**
 * 따옴표가 **눈으로만** 되는 자리.
 *
 * 듣는 사람은 따옴표를 못 본다. 그래서 따옴표 안이 **문장**인데 닫은
 * 뒤에 조사가 바로 붙으면 귀로는 말이 엉킨다.
 *
 *   눈: "미국이 노린다"와 "그렇게 썼다"는 전혀 다른 말이죠
 *   귀: 미국이 노린다와 그렇게 썼다는 전혀 다른 말이죠
 *
 * 음성 모델이 그 자리에서 쉬어 버리는 것도 같은 문제의 다른 얼굴이다.
 * 기호를 떼는 것으로는 안 되고, **대본에서 말로 묶어 줘야** 한다.
 *
 * 따옴표 안이 **명사**면 괜찮다. 조사가 자연스럽게 붙는다.
 *
 *   "가능성"은      → 가능성은        ✅
 *   "안 쓴다"의     → 안 쓴다의       ❌
 *
 * 묶어 주는 말이 뒤에 있으면 그것도 괜찮다.
 *
 *   "이 군이니까"라고   → 이 군이니까라고       ✅
 *   "버린다"는 말도     → 버린다는 말도         ✅
 */

/** 문장이 끝났다는 신호가 되는 끝 글자. 이 뒤에 조사가 붙으면 엉킨다. */
export const SENTENCE_END_SYLLABLE = /[다라나까요자냐니군로]$/;

/** 따옴표 뒤에 바로 붙으면 문제가 되는 조사. */
const CASE_PARTICLE = '(?:와|과|의|가|이|은|는|에|도|만|부터|에게|으로|로)';

/** 따옴표가 하던 일을 대신 해 주는 말. 이게 있으면 괜찮다. */
const QUOTE_MARKER = /^(?:라고|이라고|라는|이라는|고 |는 말|라는 말|이라는 말|던|이던)/;

/** `"…"` + 조사 를 모두 찾는 정규식. */
const QUOTED_THEN_PARTICLE = new RegExp(
  `[\\u0022\\u201C]([^\\u0022\\u201C\\u201D]{2,})[\\u0022\\u201D](${CASE_PARTICLE})`,
  'g'
);

/**
 * 한 문장에서 따옴표가 눈으로만 되는 자리를 찾는다.
 *
 * 되돌려주는 것: 문제가 있는 문장만 (없으면 빈 배열)
 */
export function bareQuoteSpots(sentences) {
  const out = [];
  for (const raw of sentences || []) {
    const text = String(raw);
    for (const m of text.matchAll(QUOTED_THEN_PARTICLE)) {
      const inside = m[1].trim();
      // 따옴표 안이 명사로 끝나면 조사가 자연스럽게 붙는다.
      if (!SENTENCE_END_SYLLABLE.test(inside)) continue;
      // 조사 뒤에 묶어 주는 말이 오면 괜찮다 ("버린다"는 말도).
      const after = text.slice(m.index + m[0].length - m[2].length);
      if (QUOTE_MARKER.test(after)) continue;
      out.push(text);
      break;
    }
  }
  return out;
}

/**
 * 읽을 글에 **영어 글자**가 있는가.
 *
 * 음성 모델은 알파벳을 만나면 철자로 읽는다. "OPS" 는 "오 피 에스",
 * "FA" 는 "에프 에이" 가 된다. 눈으로는 멀쩡한데 귀로는 뚝 끊긴다.
 * 운영자가 잡았다(2026-11-03) — "영어는 되도록 넣지 말고, 영어
 * 스펠로 읽는 경우가 많더라".
 *
 * ── 2026-11-07 에 고치는 법이 바뀌었다 ──
 *
 * 전에는 "대본에 한글로 적어라"였다. 그러면 **자막까지 한글**로 나간다.
 * 운영자가 그걸 뒤집었다.
 *
 *   "영어가 어색하게 읽히면 한글로 해서 읽는다. 그리고 자막에는 보는
 *    사람을 위해 익숙한 영어로 적는다."
 *
 * 맞는 말이다. 보는 사람에게 익은 글자는 'FA' 지 '에프에이' 가 아니다.
 * 그래서 이제는 대본에 **영어 그대로 쓰고**, speech.mjs 의 PRONOUNCE 에
 * 한글 읽기를 등록한다. 자막은 영어, 음성은 한글이 된다.
 *
 *   대본·자막:  FA 시장
 *   읽는 글:    에프에이 시장
 *
 * 그래서 이 검사는 **PRONOUNCE 에 등록된 낱말을 걸지 않는다.** 이미
 * 해결된 것을 계속 지적하면 진짜 문제가 묻힌다.
 */
export function latinSpots(sentences) {
  // PRONOUNCE 에 든 낱말은 읽기가 이미 정해져 있다. 대소문자를 가리지
  // 않고 비교한다 — 대본에 'Fa' 로 적힐 일은 없지만, 검사가 표기에
  // 흔들려서 통과·실패가 갈리면 안 된다.
  const known = new Set([...PRONOUNCE.keys()].map((k) => String(k).toLowerCase()));
  const out = [];
  for (const raw of sentences || []) {
    // FA 등급(A등급·B등급·C등급)은 읽기가 이미 정해져 있다
    // (speech.mjs 의 FA_GRADE). 다만 'A' 한 글자를 아는 낱말로
    // 등록하면 문장 속 아무 A 까지 통과해 버린다. 그래서 낱말이
    // 아니라 **'A등급' 이라는 덩어리만** 문장에서 덜어내고 본다.
    const text = String(raw);
    let look = text;
    for (const k of FA_GRADE.keys()) look = look.split(k).join('');
    const hits = [
      ...new Set((look.match(/[A-Za-z]{1,}/g) || []).filter((w) => !known.has(w.toLowerCase()))),
    ];
    // 알려 줄 때는 원문을 그대로 보여 준다 — 덜어낸 글을 보여 주면
    // 운영자가 자기 대본에서 그 문장을 못 찾는다.
    if (hits.length) out.push({ text, hits });
  }
  return out;
}

/**
 * 자막에 **영문으로 적는 쪽이 익숙한데** 한글로 적어 둔 자리.
 *
 * 2026-11-07 운영자: "자막을 전부 영어로 하는 게 아니고, FA나 KIA 이런
 * 부분은 영문으로 표기하고 에프에이·기아 이렇게 읽으라는 이야기다."
 *
 * 방향이 둘 다 있다는 게 핵심이다.
 *
 *   KIA 라고 적으면  → 음성이 "케이 아이 에이"로 읽는다   (PRONOUNCE 가 고친다)
 *   기아 라고 적으면 → 자막에 낯선 글자가 나간다          (이 검사가 잡는다)
 *
 * 그래서 대본에는 **영문으로 적는다.** 자막은 영문 그대로 나가고,
 * speechText() 가 읽기만 한글로 바꾼다.
 *
 * ⚠️ 자동으로 바꾸지 않고 알려 주기만 한다. 한글 쪽이 맞는 자리가
 *    있을 수 있어서다 — '기아자동차'를 KIA 로 바꾸면 안 된다.
 *    사람이 보고 고친다.
 */
export function subtitleSpellingSpots(sentences) {
  const out = [];
  for (const raw of sentences || []) {
    const text = String(raw);
    const hits = [];
    for (const [hangul, latin] of SUBTITLE_SPELLING) {
      if (text.includes(hangul)) hits.push({ hangul, latin });
    }
    if (hits.length) out.push({ text, hits });
  }
  return out;
}

/**
 * 이름을 쉼표로 줄줄이 이어 놓은 자리.
 *
 * 2026-11-06 운영자: "이재현, 류지혁, 김지찬 이렇게 선수가 연속으로
 * 나오면 말이 어색하다. 사람마다 좀 끊어서 읽어라."
 *
 * 맞는 말이다. 쉼표는 눈으로 읽을 때는 목록으로 보이는데, 귀로는 한
 * 덩어리로 지나간다. 이름이 셋이면 셋 다 안 들린다.
 *
 * 고치는 법은 **마침표로 끊는 것**이다. narrate.mjs 의 pauseAfter 는
 * 문단이 바뀔 때 쉼을 주지, 문장 안의 쉼표는 음성 모델에 맡긴다.
 * 그래서 쉼표를 아무리 찍어도 우리가 쉼을 못 늘린다.
 *
 *   나쁨: 이재현, 류지찬, 김지찬에게 연속으로 볼넷을 줬어요.
 *   좋음: 이재현에게 볼넷. 류지혁에게 볼넷. 김지찬에게도 볼넷이었습니다.
 *
 * ⚠️ 두 개까지는 넘어간다. "최원준과 이정훈을 잡고"는 자연스럽다.
 *    셋부터 걸린다.
 *
 * ⚠️ 이름인지 아닌지를 가리지 않는다. 두세 글자 한글 낱말이 쉼표로
 *    셋 이상 이어지면 걸린다 — 이름이 아니어도 귀로는 똑같이
 *    한 덩어리로 지나가기 때문이다.
 */
export function nameListSpots(sentences) {
  const out = [];
  // 두세 글자 한글 낱말 + 쉼표가 두 번, 그리고 세 번째 낱말.
  const re = /([가-힣]{2,4}), ?([가-힣]{2,4}), ?([가-힣]{2,4})/;
  for (const raw of sentences || []) {
    const text = String(raw);
    const m = re.exec(text);
    if (m) out.push({ text, names: [m[1], m[2], m[3]] });
  }
  return out;
}

export function checkSpoken(markdown) {
  const sentences = spokenSentences(markdown);
  const notes = [];

  if (!sentences.length) {
    return { sentences: [], formalRatio: 0, questions: 0, longest: 0, runs: 1, notes };
  }

  // 1) 말끝이 한 가지로 쏠리는가
  const formal = sentences.filter((s) => /(습니다|입니다)[.?!…]?$/.test(s)).length;
  const formalRatio = formal / sentences.length;
  if (formalRatio > FORMAL_ENDING_MAX) {
    notes.push(
      `문장 ${sentences.length}개 중 ${formal}개(${Math.round(formalRatio * 100)}%)가 ` +
        '「-습니다 / -입니다」로 끝납니다. 읽어 주면 같은 가락이 되풀이됩니다 — ' +
        '일부를 「-죠 / -거든요 / -는데요」나 짧은 토막으로 바꿔 보세요.'
    );
  }

  // 1-b) 이름을 쉼표로 줄줄이 이었는가
  const nameLists = nameListSpots(sentences);
  for (const spot of nameLists) {
    notes.push(
      `이름이 쉼표로 셋 이상 이어집니다 (${spot.names.join(' / ')}). ` +
        '귀로는 한 덩어리로 지나가서 셋 다 안 들립니다 — ' +
        '마침표로 끊어 주세요. 예: 「가에게 볼넷. 나에게 볼넷. 다에게도 볼넷이었습니다.」 ' +
        `본문: ${spot.text.slice(0, 40)}…`
    );
  }

  // 2) 같은 어미가 잇따르는가
  //    비율이 괜찮아도 한 대목에 몰려 있으면 거기서 늘어진다.
  let run = 1;
  let worstRun = 1;
  let worstAt = 0;
  for (let i = 1; i < sentences.length; i++) {
    run = endingOf(sentences[i]) === endingOf(sentences[i - 1]) ? run + 1 : 1;
    if (run > worstRun) {
      worstRun = run;
      worstAt = i;
    }
  }
  if (worstRun > SAME_ENDING_RUN_MAX) {
    notes.push(
      `같은 말끝이 ${worstRun}문장 잇따릅니다: "${sentences[worstAt].slice(0, 30)}…" 언저리. ` +
        '한 문장만 바꿔도 가락이 살아납니다.'
    );
  }

  // 3) 묻는 말이 있는가
  //    캐스터는 설명만 하지 않는다. 묻고 스스로 답한다.
  const questions = sentences.filter((s) => /[?]$/.test(s) || /(까요|을까|ㄹ까)[.?!…]?$/.test(s)).length;
  const per100 = (questions / sentences.length) * 100;
  if (per100 < QUESTION_PER_100_MIN) {
    notes.push(
      `묻는 문장이 ${questions}개뿐입니다(문장 100개당 ${per100.toFixed(1)}개). ` +
        '"이게 왜 중요할까요", "그럼 얼마가 드는 걸까요" 처럼 한 번 묻고 답하면 ' +
        '듣는 사람이 따라옵니다.'
    );
  }

  // 4) 귀로 따라가기 힘든 긴 문장
  //    글은 되돌아가 읽을 수 있지만 소리는 지나가면 끝이다.
  const long = sentences.filter((s) => s.length > SENTENCE_CHARS_MAX);
  const longest = sentences.reduce((m, s) => Math.max(m, s.length), 0);
  for (const s of long.slice(0, 5)) {
    notes.push(`${s.length}자 문장입니다 — 귀로는 깁니다. 둘로 끊어 보세요: "${s.slice(0, 40)}…"`);
  }
  if (long.length > 5) {
    notes.push(`${SENTENCE_CHARS_MAX}자 넘는 문장이 ${long.length}개 더 있습니다.`);
  }


  // 따옴표가 눈으로만 되는 자리. 경고만 한다 — 고치는 건 사람이
  // 문장을 다시 쓰는 일이라 자동으로 할 수 없다.
  const bare = bareQuoteSpots(sentences);
  if (bare.length) {
    notes.push(
      `따옴표 뒤에 조사가 바로 붙은 문장이 ${bare.length}개 있습니다. ` +
        '듣는 사람은 따옴표를 못 보므로 귀로는 말이 엉킵니다. ' +
        '"…" 뒤에 `라는 말`·`고 했습니다` 처럼 말로 묶어 주세요: ' +
        `"${bare[0].slice(0, 46)}…"`
    );
  }


  // 영어 글자. 음성 모델이 철자로 읽어서 흐름이 끊긴다.
  // PRONOUNCE 에 등록된 것(FA·MLB·KBO…)은 이미 해결됐으므로 걸지 않는다.
  const latin = latinSpots(sentences);
  if (latin.length) {
    const words = [...new Set(latin.flatMap((x) => x.hits))].join(', ');
    notes.push(
      `읽기가 정해지지 않은 영어가 ${latin.length}개 문장에 있습니다 (${words}). ` +
        '음성 모델이 철자로 읽습니다 — "OPS" 는 "오 피 에스" 가 됩니다. ' +
        '대본은 영어 그대로 두고(자막에 그대로 나갑니다), ' +
        'src/audio/speech.mjs 의 PRONOUNCE 에 한글 읽기를 등록하세요.'
    );
  }

  // 반대 방향. 자막에 영문이 익숙한 것을 한글로 적어 뒀는가.
  const spelling = subtitleSpellingSpots(sentences);
  if (spelling.length) {
    const pairs = [
      ...new Map(
        spelling.flatMap((x) => x.hits).map((h) => [h.hangul, `${h.hangul}→${h.latin}`])
      ).values(),
    ].join(', ');
    notes.push(
      `자막에 영문으로 적는 쪽이 익숙한 이름이 한글로 적혀 있습니다 (${pairs}). ` +
        '대본에 영문으로 적으면 자막은 영문으로 나가고 읽기만 한글이 됩니다. ' +
        '(한글이 맞는 자리면 그냥 두세요 — 기아자동차 같은 것.)'
    );
  }

  return { sentences, formalRatio, questions, longest, runs: worstRun, notes };
}
