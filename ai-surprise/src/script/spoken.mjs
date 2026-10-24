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

  return { sentences, formalRatio, questions, longest, runs: worstRun, notes };
}
