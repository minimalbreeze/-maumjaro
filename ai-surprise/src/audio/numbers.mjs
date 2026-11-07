// 숫자를 읽는 글로 바꾼다.
//
// ─────────────────────────────────────────────────────────────
// 왜 필요한가
// ─────────────────────────────────────────────────────────────
//
// 2026-11-07 운영자:
//
//   "5.26은 숫자로 적어야지. 읽을 때는 한글로 읽지만."
//   "42억 이런 것도 숫자로 자막을 만들어야지."
//
// 맞는 말이다. 그동안 대본에 "오 점 이 육", "사십이억"이라고 한글로
// 적었다. 그러면 **자막에도 그대로 나간다.** 눈으로 읽는 사람에게
// "오 점 이 육"은 읽기 어렵다. 숫자는 숫자로 보여야 한다.
//
// KIA 와 같은 원칙이다(speech.mjs 의 PRONOUNCE). 다른 점은 숫자가
// **끝이 없다**는 것이다. 목록으로 적을 수가 없어서 규칙으로 바꾼다.
//
//   대본·자막:  5.26  ·  42억  ·  176개  ·  .273
//   읽는 글:    오 점 이 육  ·  사십이억  ·  백칠십육 개  ·  이 할 칠 푼 삼 리
//
// ─────────────────────────────────────────────────────────────
// 한국어 숫자는 두 벌이다
// ─────────────────────────────────────────────────────────────
//
// 한자어(일·이·삼)와 고유어(하나·둘·셋)가 있고, 뒤에 오는 단위가
// 어느 쪽을 쓸지 정한다.
//
//   한자어   억 만 원 년 월 일 위 점 승 패 이닝 경기 번 회 루 퍼센트
//   고유어   명 개 살 마리 가지 곳
//
// ⚠️ 고유어 단위도 **스물을 넘으면 한자어로 읽는다.** "백칠십육 개"지
//    "백일흔여섯 개"가 아니다. 그래서 20 이하만 고유어로 간다.
//
// ⚠️ '번'은 두 뜻이 있다. "2번 타자"는 한자어(이 번)고 "두 번"은
//    고유어다. 야구 글에서 숫자 뒤의 '번'은 거의 타순이라 **한자어로
//    둔다.** 횟수를 말할 때는 대본에 "두 번"이라고 한글로 적는다.

/** 한자어 한 자리. */
const SINO_DIGIT = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

/** 자리값. */
const SINO_PLACE = ['', '십', '백', '천'];

/** 네 자리씩 끊어 붙이는 단위. */
const SINO_GROUP = ['', '만', '억', '조'];

/**
 * 고유어 수. 단위 앞에 올 때의 꼴이다 — "하나"가 아니라 "한 개".
 *
 * 0은 없다. 고유어에 영이 없어서 "영 개"는 한자어로 간다.
 */
const NATIVE = [
  null, '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열',
  '열한', '열두', '열세', '열네', '열다섯', '열여섯', '열일곱', '열여덟', '열아홉', '스무',
];

/** 고유어로 읽는 단위. 20 이하일 때만 쓴다. */
const NATIVE_UNITS = ['명', '개', '살', '마리', '가지', '곳', '군데', '사람', '경기'];

/**
 * 달 이름에만 있는 예외 둘.
 *
 * 6월은 "육월"이 아니라 **유월**, 10월은 "십월"이 아니라 **시월**이다.
 * 다른 달은 규칙대로 읽는다. 이것만 어긋난다.
 */
const MONTH_EXCEPTION = { 6: '유', 10: '시' };

/**
 * 네 자리 이하를 한자어로 읽는다.
 *
 * 앞자리의 '일'은 떼어 읽는다 — 143은 "백사십삼"이지 "일백사십삼"이
 * 아니다. 다만 **맨 앞자리에서만** 뗀다. 2015의 '십'은 "이천십오"로
 * 그대로다.
 */
function sinoUnder10000(n) {
  if (n === 0) return '';
  let out = '';
  const digits = String(n).split('').map(Number);
  const len = digits.length;
  for (let i = 0; i < len; i += 1) {
    const d = digits[i];
    if (d === 0) continue;
    const place = SINO_PLACE[len - 1 - i];
    // 십·백·천 앞의 1은 안 읽는다. 일의 자리는 읽는다.
    if (d === 1 && place) out += place;
    else out += SINO_DIGIT[d] + place;
  }
  return out;
}

/**
 * 정수를 한자어로 읽는다.
 *
 *   143   → 백사십삼
 *   9723  → 구천칠백이십삼
 *   2026  → 이천이십육
 *   100000000 → 일억
 */
export function sinoNumber(n) {
  const num = Math.trunc(Math.abs(Number(n)));
  if (!Number.isFinite(num)) return '';
  if (num === 0) return '영';
  const groups = [];
  let rest = num;
  while (rest > 0) {
    groups.push(rest % 10000);
    rest = Math.floor(rest / 10000);
  }
  let out = '';
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (groups[i] === 0) continue;
    // ⚠️ 만·억 앞의 1은 **읽는다.** "일억"이지 "억"이 아니다.
    //    십·백·천과 다르다.
    const head = groups[i] === 1 && i > 0 ? '일' : sinoUnder10000(groups[i]);
    out += head + SINO_GROUP[i];
  }
  return out;
}

/**
 * 타율·승률처럼 점으로 시작하는 세 자리를 할·푼·리로 읽는다.
 *
 *   .273 → 이 할 칠 푼 삼 리
 *   .407 → 사 할 영 푼 칠 리
 *   .400 → 사 할
 *   .000 → 영 할
 *
 * 뒤에서부터 0이면 떼고 읽는다. "사 할 영 푼 영 리"라고는 안 한다.
 */
export function rateNumber(digits) {
  const d = String(digits).padEnd(3, '0').slice(0, 3).split('').map(Number);
  const parts = [`${SINO_DIGIT[d[0]]} 할`];
  if (d[1] !== 0 || d[2] !== 0) parts.push(`${SINO_DIGIT[d[1]]} 푼`);
  if (d[2] !== 0) parts.push(`${SINO_DIGIT[d[2]]} 리`);
  return parts.join(' ');
}

/**
 * 소수점 아래는 **한 자씩** 읽는다.
 *
 *   5.26  → 오 점 이 육
 *   3.88  → 삼 점 팔 팔
 *   219.1 → 이백십구 점 일
 *
 * "오 점 이십육"이라고는 안 읽는다. 평균자책점도 승률도 그렇다.
 */
function decimalTail(digits) {
  return String(digits)
    .split('')
    .map((c) => SINO_DIGIT[Number(c)])
    .join(' ');
}

/**
 * 글 안의 숫자를 읽는 글로 바꾼다.
 *
 * 자막에는 숫자가 그대로 남는다 — 이 함수는 **읽을 글에만** 쓴다.
 */
export function readNumbers(text) {
  let out = String(text ?? '');

  // ⓪ 달 이름 예외를 먼저 뗀다. 뒤의 규칙이 "십월"로 만들기 전에.
  out = out.replace(/(^|[^\d])(\d{1,2})월/g, (m, pre, mm) => {
    const n = Number(mm);
    return MONTH_EXCEPTION[n] ? `${pre}${MONTH_EXCEPTION[n]}월` : m;
  });

  // 퍼센트 기호는 글자로 바꾼다. 그냥 두면 음성이 안 읽고 지나간다.
  out = out.replace(/%/g, ' 퍼센트');

  // ① 더하기. "4+2년" → "사 플러스 이 년" (2026-11-07 운영자).
  //
  //    계약을 "4+2년"이라고 적는 것은 야구 글의 관행이다 — 4년을
  //    보장하고 2년을 더 붙일 수 있다는 뜻이다. 눈에는 그 꼴이
  //    익었으니 자막에는 그대로 두고, 읽을 때만 풀어 준다.
  //
  //    ⚠️ 숫자 규칙보다 **먼저** 본다. 뒤로 미루면 4 와 2 가 따로
  //       바뀌고 '+' 만 남아서 음성이 그냥 지나간다.
  out = out.replace(/(\d+)\s*\+\s*(\d+)/g, (_m, a, b) => `${sinoNumber(a)} 플러스 ${sinoNumber(b)}`);

  // ② 분수. "3분의 1" → "삼분의 일". 다른 규칙보다 먼저 본다 —
  //    안 그러면 "3분"이 시간으로 읽힌다.
  out = out.replace(/(\d+)분의\s*(\d+)/g, (_m, a, b) => `${sinoNumber(a)}분의 ${sinoNumber(b)}`);

  // ③ 타율·승률. 점으로 시작하는 세 자리다.
  //    ⚠️ 앞에 숫자가 붙어 있으면 소수점이지 타율이 아니다 — 5.26 을
  //       여기서 잡으면 안 된다. 그래서 앞을 본다.
  out = out.replace(/(^|[^\d.])\.(\d{3})(?!\d)/g, (_m, pre, d) => `${pre}${rateNumber(d)}`);

  // ④ 소수. 1,234.56 처럼 자릿점이 든 것도 받는다.
  out = out.replace(/(\d[\d,]*)\.(\d+)/g, (_m, whole, frac) => {
    const w = sinoNumber(whole.replace(/,/g, ''));
    return `${w} 점 ${decimalTail(frac)}`;
  });

  // ⑤ 정수. 뒤에 붙은 단위를 보고 고유어로 갈지 정한다.
  const nativeUnit = NATIVE_UNITS.join('|');
  out = out.replace(new RegExp(`(\\d[\\d,]*)\\s*(${nativeUnit})?`, 'g'), (m, num, unit) => {
    const n = Number(String(num).replace(/,/g, ''));
    if (!Number.isFinite(n)) return m;
    // 고유어 단위이면서 1~20 이면 고유어로 읽는다.
    if (unit && n >= 1 && n <= 20) return `${NATIVE[n]} ${unit}`;
    if (unit) return `${sinoNumber(n)} ${unit}`;
    return sinoNumber(n);
  });

  // ⑥ 겹친 공백을 하나로.
  return out.replace(/[ \t]{2,}/g, ' ');
}
