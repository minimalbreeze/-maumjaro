// 구단 유니폼과 등번호. 그림 모델에게 **코드가 직접** 적어 보낸다.
//
// ── 왜 이 파일이 생겼나 (2026-11-07 운영자) ──
//
//   "그럼 유니폼은 어떻게 구현을 하나? 유니폼이 완전 다른 색상이다."
//   "유니폼과 등번호가 같아야 선수임을 뒤만 봐도 알 수 있지 않나.
//    그래야 팬들이 찾아오지 않겠나."
//
// 그 전까지 유니폼은 이렇게 돌아갔다.
//
//   1. 내가 기획 파일의 look 에 "a KIA Tigers uniform in red and black" 을 적는다
//   2. look 은 **장면을 설계하는 AI 의 시스템 프롬프트**로 들어간다
//   3. 그 AI 에게 "생김새 문장을 영어 그대로 베껴 넣어라"고 **부탁**한다
//   4. 그림 프롬프트의 고정 문구는 "the team colours **named in the scene
//      description**" 이라고 적혀 있었다
//
// 즉 **색을 적는 주체가 내가 아니라 설계 AI 였다.** 베끼면 색이 맞고,
// 줄여 쓰거나 다른 말로 바꾸면 그림 모델은 색을 모른 채 그린다. 그래서
// 완전 다른 색이 나왔다. 부탁으로 지켜지는 규칙이 아니었다.
//
// 이제는 코드가 적는다. 사람 기록의 team·number 로 이 파일이 문장을
// 만들고, composeImagePrompt 가 장면 설명 **바로 뒤에** 붙인다. 설계
// AI 가 무엇을 쓰든 유니폼 문장은 반드시 프롬프트에 있다.
//
// ⚠️ 장면 설명 바로 뒤에 붙이는 것이 중요하다. 그림 모델은 프롬프트
//    앞쪽을 무겁게 본다. 고정 스타일 문구(수백 자)가 끝난 뒤에 붙이면
//    색이 또 흐려진다.

// ── 확인한 것과 확인 못 한 것 ──
//
// 2026-11-07 에 찾아봤는데 **KBO 10개 구단을 한 번에 정리한 자료를
// 찾지 못했다.** 이 컨테이너에서 위키백과와 sportslogos 는 막혀 있다.
//
// 그래서 칸마다 어디서 온 값인지 적는다. `확인` 은 출처를 봤다는 뜻이고,
// `통념` 은 내가 아는 값이라는 뜻이다 — 틀릴 수 있다. KBO 를 보는 사람이
// 보면 바로 아니까, 틀린 것은 그 줄만 고치면 된다.
//
// ⚠️ 모르는 팀을 지어내 채우지 않는다. 표에 없는 팀은 아래 uniformClause
//    가 빈 값을 돌려주고, 그러면 전처럼 장면 설명에 적힌 색을 쓴다.
//    지금과 같아질 뿐 더 나빠지지는 않는다.
// ⚠️⚠️ 구단 이름을 프롬프트에 **적지 않는다** (2026-11-11) ⚠️⚠️
//
// 전에는 'a KIA Tigers uniform, ...' 으로 시작했다. 그랬더니 모델이
// 아는 구단으로 바꿔 그렸다 — 김도영 모자에 **B**(보스턴), 다음 샷에
// **K**, 가슴에 또 **B**. 유니폼 색도 남색·금색이 나왔다.
//
// 모델은 KIA 를 **모른다.** 그런데 "KIA Tigers 유니폼" 이라고 하면
// 모르는 채로 비슷한 무언가를 지어낸다. 모자 마크에서 배운 것과 같다 —
// 이름을 부르면 그리려 든다.
//
// 그래서 **색과 무늬만** 적는다. 구단 이름도, 마크도, 글자도 없다.
// 선수를 알아보게 하는 것은 색과 등번호다.
//
// 아래 `ko` 는 사람이 읽는 이름이고 **프롬프트에 안 들어간다.**
export const KBO_UNIFORMS = {
  KIA: {
    ko: 'KIA 타이거즈',
    jersey:
      'a white baseball jersey with bright red piping along the button placket and red trim on the collar and sleeves, black undershirt sleeves',
    cap: 'a solid red cap',
    numberColour: 'black',
    jacketColours: 'red and black',
    확실한가: '확인',
  },
  한화: {
    ko: '한화 이글스',
    jersey:
      'a white baseball jersey with bright orange piping and dark navy trim on the collar and sleeves',
    cap: 'a solid orange cap',
    numberColour: 'dark navy',
    jacketColours: 'orange and dark navy',
    확실한가: '통념',
  },
  KT: {
    ko: 'KT 위즈',
    jersey:
      'a white baseball jersey with black piping and red trim on the collar and sleeves',
    cap: 'a solid black cap',
    numberColour: 'black',
    jacketColours: 'black and red',
    확실한가: '통념',
  },
  삼성: {
    ko: '삼성 라이온즈',
    jersey:
      'a white baseball jersey with navy blue piping along the placket and navy trim on the collar and sleeves',
    cap: 'a solid navy blue cap',
    numberColour: 'navy blue',
    jacketColours: 'navy blue and white',
    확실한가: '통념',
  },
  LG: {
    ko: 'LG 트윈스',
    jersey:
      'a white baseball jersey with thin black pinstripes and red trim on the collar',
    cap: 'a solid black cap',
    numberColour: 'red',
    jacketColours: 'black and red',
    확실한가: '통념',
  },
  두산: {
    ko: '두산 베어스',
    jersey:
      'a white baseball jersey with navy piping and a red accent stripe down the sleeve',
    cap: 'a solid navy cap',
    numberColour: 'navy',
    jacketColours: 'navy and red',
    확실한가: '통념',
  },
  SSG: {
    ko: 'SSG 랜더스',
    jersey:
      'a white baseball jersey with red piping outlined in gold on the collar and sleeves',
    cap: 'a solid red cap',
    numberColour: 'red',
    jacketColours: 'red and gold',
    확실한가: '통념',
  },
  NC: {
    ko: 'NC 다이노스',
    jersey:
      'a white baseball jersey with navy piping and gold trim on the collar and sleeves',
    cap: 'a solid navy cap',
    numberColour: 'navy',
    jacketColours: 'navy and gold',
    확실한가: '통념',
  },
  롯데: {
    ko: '롯데 자이언츠',
    jersey:
      'a white baseball jersey with navy piping and red trim on the collar and sleeves',
    cap: 'a solid navy cap',
    numberColour: 'navy',
    jacketColours: 'navy and red',
    확실한가: '통념',
  },
  키움: {
    ko: '키움 히어로즈',
    jersey:
      'a white baseball jersey with burgundy piping and navy trim on the collar and sleeves',
    cap: 'a solid burgundy cap',
    numberColour: 'burgundy',
    jacketColours: 'burgundy and navy',
    확실한가: '통념',
  },
};

/**
 * 적어 준 팀 이름을 표의 열쇠로 바꾼다.
 *
 * 기획 파일에 뭐라고 적힐지 모른다 — 'KIA', '기아', 'KIA 타이거즈',
 * 'kia tigers' 가 다 올 수 있다. 하나로 모은다.
 *
 * ⚠️ 'KIA' 와 '기아' 를 둘 다 받는다. 대본에서는 자막용으로 'KIA' 라고
 *    쓰고 읽기용으로 '기아' 로 바꾸는데(speech.mjs 의 PRONOUNCE),
 *    기획 파일에 어느 쪽이 적힐지는 그때그때다.
 */
const ALIASES = {
  기아: 'KIA',
  'kia tigers': 'KIA',
  타이거즈: 'KIA',
  이글스: '한화',
  'hanwha eagles': '한화',
  위즈: 'KT',
  'kt wiz': 'KT',
  라이온즈: '삼성',
  'samsung lions': '삼성',
  트윈스: 'LG',
  'lg twins': 'LG',
  베어스: '두산',
  'doosan bears': '두산',
  랜더스: 'SSG',
  'ssg landers': 'SSG',
  다이노스: 'NC',
  'nc dinos': 'NC',
  자이언츠: '롯데',
  'lotte giants': '롯데',
  히어로즈: '키움',
  'kiwoom heroes': '키움',
};

export function teamKey(team) {
  const raw = String(team || '').trim();
  if (!raw) return '';
  if (KBO_UNIFORMS[raw]) return raw;
  // 'KIA 타이거즈' 처럼 팀 이름이 다 적혀 오면 앞 토막이 열쇠다.
  const first = raw.split(/[\s·]+/)[0];
  if (KBO_UNIFORMS[first]) return first;
  const lower = raw.toLowerCase();
  if (ALIASES[raw]) return ALIASES[raw];
  if (ALIASES[lower]) return ALIASES[lower];
  // 'KIA 타이거즈' 의 뒤 토막('타이거즈')으로도 찾는다.
  for (const part of raw.split(/[\s·]+/)) {
    if (KBO_UNIFORMS[part]) return part;
    if (ALIASES[part]) return ALIASES[part];
    const p = part.toLowerCase();
    if (ALIASES[p]) return ALIASES[p];
  }
  return '';
}

/**
 * 그림 프롬프트에 넣을 유니폼 문장.
 *
 * 반환: 영어 한 문장. 팀을 모르면 빈 문자열.
 *
 * ── 등번호를 왜 뒤에 크게 적게 하나 ──
 *
 * 2026-11-07 운영자: "유니폼과 등번호가 같아야 선수임을 뒤만 봐도 알
 * 수 있지 않나. 그래야 팬들이 찾아오지 않겠나."
 *
 * 그리고 우리 그림에는 뒷모습이 많다. 머리 방향 규칙(SPORTS_STYLE_SUFFIX)이
 * "몸이 뒤를 보면 얼굴을 그리지 마라"로 되어 있어서, 뒷모습 샷에서는
 * **얼굴로 사람을 가릴 수가 없다.** 거기서 사람을 말해 주는 것은
 * 등번호와 유니폼 색뿐이다.
 *
 * ⚠️ 번호를 모르는 사람에게는 번호 얘기를 아예 안 한다. 빈 칸을 남기면
 *    모델이 채우려고 아무 번호나 그린다 — 틀린 번호는 번호가 없는 것보다
 *    나쁘다. 등번호를 못 찾은 사람(엄상백·류지현·이강철)이 실제로 있다.
 */
export function uniformClause({ team, number, role } = {}) {
  const key = teamKey(team);
  if (!key) return '';
  const u = KBO_UNIFORMS[key];

  // 감독·코치는 유니폼 위에 팀 재킷을 입는다. 등번호는 보통 안 보인다.
  const isStaff = /감독|코치|단장/.test(String(role || ''));

  // ⚠️⚠️ 가슴에 **글자를 적지 않는다.** ⚠️⚠️
  //
  // 2026-11-09. 열 팀 전부 'white jersey with black lettering' 처럼
  // 적어 뒀다. 그랬더니 모델이 고영표의 가슴에 **읽을 수 없는 글자꼴**을
  // 그렸다 — "읽가ㅅㅍ大". 운영자가 워터마크로 봤고 나도 그렇게 보고
  // 자르기를 붙들고 한 시간을 썼다. **워터마크가 아니라 내가 그리라고
  // 시킨 글자였다.**
  //
  // Flux 는 한글을 못 쓴다. 영문도 두세 글자가 한계다. 그런데 "글자를
  // 써라"고 하면 글자 **비슷한 것**을 반드시 그린다.
  //
  // 모자 마크에서 이미 배운 것과 같은 자리다 — 거기서는
  // "그 구단 표시만 올리고 모르면 아무것도 안 올린다. 지어낸 마크보다
  // 민무늬가 낫다"로 뒤집었는데, 가슴에는 그 교훈을 안 옮겼다.
  //
  // 선수를 알아보게 하는 것은 **색과 등번호**다. 숫자는 한두 자리라
  // 모델이 제대로 그린다. 가슴 글자는 없어도 아무것도 안 잃는다.
  // ⚠️⚠️ 차례가 중요하다 (2026-11-11) ⚠️⚠️
  //
  // 전에는 이 차례였다 —
  //   유니폼 → 모자 → "가슴은 민무늬" → (감독이면) 재킷
  //
  // 그래서 **재킷이 민무늬 규칙 밖에 있었다.** 이범호 감독 그림에
  // 재킷 가슴 한가운데 빨간 마크가 그려져 나왔다. 규칙은 '유니폼'
  // 가슴만 말하고 있었고, 그 사람은 재킷을 입고 있었다.
  //
  // 운영자: "모자와 가슴에 로고, 유니폼이 해당 소속 팀 같지 않다"
  //
  // 그래서 **입는 것을 전부 먼저 적고, 민무늬 규칙을 맨 뒤에** 둔다.
  const parts = [`wearing ${u.jersey}`, u.cap];
  if (isStaff) {
    // ⚠️ "같은 색" 으로 적었더니 회색 재킷이 나왔다. 색을 다시 적는다.
    // ⚠️ 구단 이름(u.ko)을 넣지 않는다. 색만 적는다.
    parts.push(`a team jacket in ${u.jacketColours} over the uniform`);
  }
  // 입는 것을 다 적은 **뒤에** 민무늬를 말한다. 재킷까지 덮는다.
  parts.push(
    isStaff
      ? 'the front of the jacket and the jersey is smooth plain fabric in one solid colour'
      : 'the front of the jersey is smooth plain fabric'
  );

  const n = String(number ?? '').trim();
  if (n && !isStaff) {
    parts.push(
      `the number ${n} in large ${u.numberColour} figures across the back ` +
        `of the jersey, the same number ${n} on the sleeve or chest where ` +
        `the uniform carries it`,
    );
  }

  return parts.join(', ');
}
