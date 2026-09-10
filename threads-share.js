// 스레드용 "글로 공유" — 이미지 없이 텍스트 + 링크만 보낸다.
//
// 왜 이미지 공유와 따로 두는가
//   스레드는 글이 본문인 플랫폼이다. 이미지를 붙이면 사진 게시물이 되어 글이
//   보조로 밀리고, 댓글이 붙는 결도 달라진다. 스레드에서 댓글이 많이 달리는 글은
//   대체로 "짧고, 구체적인 상황이고, 질문으로 끝나는" 글이다. 그래서 여기서는
//   이미지를 아예 넘기지 않고(navigator.share에 files를 주지 않는다) 글만 보낸다.
//
// 글이 왜 앱 자랑이 아닌가
//   목적이 "앱 소개"가 아니라 "유입"이기 때문이다. 앱 자랑 글은 광고로 읽혀서
//   댓글이 안 붙고, 댓글이 안 붙으면 스레드가 글을 퍼뜨리지 않아서 아무도 못 본다.
//   그래서 결과는 이야기를 여는 한 줄로만 쓰고, 본문의 무게는 질문 쪽에 둔다.
//   링크는 맨 끝에 한 줄로만 붙인다. 글이 퍼지면 링크도 같이 퍼진다.
//
// 그래도 주제는 공유한 것과 맞아야 한다
//   처음에는 공통 소재 풀 하나로 아무 질문이나 뽑았는데, 그러면 운세를 공유하든
//   로또 번호를 공유하든 "배달비 얼마까지 참아요?" 같은 글이 나갔다. 무엇을
//   공유했는지 구분이 안 되고, 링크를 눌러 들어온 사람도 기대한 것과 다른 걸 본다.
//   그래서 소재 풀을 콘텐츠 종류별로 나눴다(TOPICS_BY_KIND).
//
// 문구를 AI로 만드는 이유
//   같은 문구를 매일 올리면 스레드에서 금세 스팸으로 읽히고 계정이 눌린다.
//   소재를 (날짜 + 콘텐츠 종류)로 골라 넘겨서, 콘텐츠마다·날마다 다른 글이 나가게 한다.
//
// 선을 그은 곳
//   정치·젠더·지역·종교·비방은 프롬프트에서 막았다. 댓글은 붙지만 신고가 같이 붙고,
//   계정이 제한되면 유입이 0이 된다. 어그로의 상한은 "계정이 살아있는 선"이다.
//
// 비용
//   종류당 하루 3개까지만 새로 만들고 그 뒤로는 돌려쓴다(localStorage 캐시). 실패하면
//   미리 써둔 문구로 조용히 떨어지므로 네트워크가 죽어도 버튼은 늘 동작한다.
(() => {
  'use strict';

  const CACHE_KEY = 'maumjaro:threadsCopyCache';
  const REQUEST_TIMEOUT_MS = 6000;

  function proxyUrl() {
    // 주소는 fortune.js가 갖고 있다. 여기서 또 적으면 둘이 어긋난다.
    const F = window.MaumjaroFortune;
    return (F && F.AI_PROXY_URL) || '';
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // 캐시는 오늘 것만 남긴다. 날짜가 바뀌면 통째로 버려서 매일 새 문구가 나오게 한다.
  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return c && c.date === todayKey() ? c : { date: todayKey(), byKey: {} };
    } catch (e) {
      return { date: todayKey(), byKey: {} };
    }
  }
  function saveCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) { /* 저장 실패는 무시 */ }
  }

  // 링크는 한 줄로 깔끔하게 끝나야 한다. 파라미터를 여러 개 달면 글 끝이 지저분해지고
  // 스레드에서 링크 미리보기도 어수선해진다. 이 버튼은 대상이 스레드로 정해져 있으므로
  // utm_source 하나로 충분하다(GA4가 이것만으로 유입원을 분류한다).
  function threadsUrl() {
    return 'https://maumjaro.minimalbreeze.com/?utm_source=threads';
  }

  // 소재 풀 — 콘텐츠 종류마다 따로 둔다.
  //
  // 왜 종류별로 나누는가
  //   처음에는 공통 풀 하나만 두고 아무 소재나 뽑았는데, 그러면 운세를 공유하든
  //   로또 번호를 공유하든 "배달비 얼마까지 참아요?" 같은 글이 나갔다. 무엇을
  //   공유했는지 구분이 안 되고, 링크를 눌러 들어온 사람도 기대한 것과 다른 걸 본다.
  //   그래서 소재를 그 콘텐츠가 놓인 자리로 좁혔다.
  //
  // 그래도 앱 자랑 글은 아니다
  //   "맘운자로 해보세요"가 아니라 "그 주제로 사람들이 떠들 만한 질문"을 쓴다.
  //   광고로 읽히면 댓글이 안 붙고, 댓글이 안 붙으면 스레드가 글을 퍼뜨리지 않는다.
  //   결과는 이야기의 도입부로만 쓰고, 본문의 무게는 질문 쪽에 둔다.
  //
  // 선을 그은 곳
  //   정치·젠더·지역·종교·비방은 프롬프트에서 막았다. 댓글은 붙지만 신고가 같이
  //   붙고, 계정이 제한되면 유입 자체가 0이 된다.
  const TOPICS_BY_KIND = {
    // 처방 계열 — 요즘 힘든 것, 버티는 법
    rx: [
      '요즘 제일 미루고 있는 일',
      '퇴근하고 나면 아무것도 하기 싫은 상태',
      '남들은 별거 아니라는데 나만 힘든 것',
      '스트레스 풀려고 하는데 정작 더 지치는 행동',
      '월요일 아침에 제일 견디기 힘든 순간',
      '괜찮은 척하다가 들킨 적',
    ],
    result: [
      '오늘 하루 중 제일 버거웠던 순간',
      '요즘 내 상태를 한 단어로 하면',
      '아무한테도 말 안 했는데 사실 힘든 것',
      '쉬는 날인데 더 피곤한 이유',
      '남들 다 하는데 나는 잘 안 되는 것',
    ],
    slip: [
      '누가 처방 좀 내려줬으면 하는 상황',
      '요즘 나한테 제일 필요한 것 한 가지',
      '몸이 아니라 마음이 지쳤을 때 하는 행동',
      '주변에서 제일 많이 듣는 걱정하는 말',
    ],
    custom: [
      '친구한테 해주고 싶은데 못 한 말',
      '힘들 때 들었던 말 중 제일 도움 된 것',
      '위로한다고 했는데 오히려 상처 준 말',
      '나한테 해주고 싶은 한마디',
    ],
    // 운세 계열 — 믿음, 징크스, 오늘 하루
    fortune: [
      '운세 보는 편인지 아닌지',
      '오늘 아침 기분이 하루를 좌우한다는 말',
      '나만 있는 이상한 징크스',
      '안 좋은 예감이 맞았던 경험',
      '새해에 운세 챙겨보는 사람 vs 아닌 사람',
      '운이 좋다고 느꼈던 순간',
    ],
    maumun: [
      '요즘 내 기분을 한 단어로 하면',
      '기분이 안 좋을 때 티가 나는 편인지',
      '내 감정에 이름 붙이기 어려웠던 순간',
      '오늘 하루 몇 점인지',
      '감정 표현 잘 하는 편인지',
    ],
    tarot: [
      '지금 제일 고민되는 선택',
      '직감대로 갔다가 잘된 적 vs 망한 적',
      '고민될 때 결정하는 나만의 방법',
      '그때 다른 선택을 했다면 싶은 순간',
      '점 보러 간 적 있는지',
    ],
    // 유형·궁합 계열
    mbti: [
      '본인 유형 잘 맞는다고 생각하는지',
      'MBTI 믿는 편인지 아닌지',
      '나랑 제일 안 맞는 유형',
      '유형 설명 중에 제일 찔렸던 문장',
      '첫인상이랑 실제 성격이 다른 편인지',
    ],
    match: [
      '나랑 잘 맞는 사람의 조건',
      '성격 반대인 사람이랑 잘 지내본 적',
      '궁합 안 좋다는 말 신경 쓰이는지',
      '친구로는 좋은데 연인은 아닌 유형',
      '오래 가는 관계의 비결',
    ],
    // 수집·운 계열
    lucky: [
      '번호 고르는 나만의 방법',
      '복권 사본 적 있는지, 얼마나 자주',
      '당첨되면 제일 먼저 할 일',
      '숫자에 미신 있는 편인지',
      '되든 안 되든 계속 하는 주말 루틴',
    ],
    pharmacy: [
      '뭔가 모으는 거 있는지',
      '수집욕 터졌던 순간',
      '컴플리트 못 하면 찝찝한 편인지',
      '뽑기에 돈 써본 적 있는지',
      '어릴 때 모았던 것',
    ],
    reward: [
      '뽑기 운 좋은 편인지',
      '첫판에 좋은 거 나왔던 경험',
      '희귀템 떴을 때 제일 먼저 하는 행동',
      '운 없다고 느낀 순간',
    ],
    // 기록·통계
    report: [
      '한 달 돌아보면 기억나는 게 있는지',
      '기록하는 습관 있는지 (일기, 가계부, 운동)',
      '작심삼일 몇 번 해봤는지',
      '올해 그래도 잘한 것 하나',
      '연속으로 며칠까지 해본 게 최고 기록인지',
    ],
  };

  // 종류를 못 찾았을 때 쓸 공통 풀. 어느 콘텐츠에 붙여도 어색하지 않은 것들만 둔다.
  const TOPICS_FALLBACK = [
    '요즘 제일 신경 쓰이는 일',
    '오늘 하루 어땠는지',
    '스트레스 푸는 법',
    '요즘 기분 한 단어로 하면',
  ];

  // 날짜 + 종류를 섞어 번호 하나를 만든다. 글자 코드를 그냥 더하면 서로 다른 종류가
  // 같은 값으로 몰려서 섞이지 않는다. 자리마다 33을 곱해 굴리는 방식(djb2)을 쓴다.
  function seedFor(kind) {
    const d = new Date();
    let h = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) >>> 0;
    const k = String(kind || '');
    for (let i = 0; i < k.length; i++) h = (h * 33 + k.charCodeAt(i)) >>> 0;
    return h;
  }

  function pickTopic(kind) {
    const pool = TOPICS_BY_KIND[kind] || TOPICS_FALLBACK;
    return pool[seedFor(kind) % pool.length];
  }

  function buildPrompts(kind, fact) {
    const systemPrompt = [
      '너는 한국 스레드(Threads)에서 댓글이 많이 달리는 글을 쓰는 사람이다.',
      '목표는 단 하나다: 읽은 사람이 "나는 이런데" 하고 댓글을 달고 싶어지게 만드는 것.',
      '',
      '글의 구조:',
      '- 첫 줄: 방금 겪은 일을 혼잣말처럼 툭 던진다. 주어진 "방금 본 결과"를 여기서 쓴다.',
      '- 마지막 줄: 주어진 소재에 대한 질문. 반드시 물음표로 끝난다.',
      '',
      '댓글이 붙는 조건:',
      '- 질문은 답하기 쉬워야 한다. 둘 중 고르기, 한 단어로 답하기, 자기 경험 한 줄 꺼내기.',
      '- 의견이 갈리거나 다들 할 말이 있는 지점을 건드린다. 모두가 동의할 이야기는 댓글이 안 달린다.',
      '- 본인 입장을 슬쩍 하나 정해서 말한다. 중립적으로 쓰면 반박할 거리가 없다.',
      '',
      '문체: 혼잣말하듯 편한 반말이나 가벼운 존댓말. 광고 문구나 카피라이터 말투는 절대 금지.',
      '형식: 전체 3줄 이내, 90자 이내. 해시태그 금지. 링크 금지(링크는 앱이 따로 붙인다). 이모지는 최대 1개.',
      '',
      // 결과 이야기는 도입부일 뿐이다. 여기가 길어지면 앱 자랑 글이 되고 댓글이 끊긴다.
      '중요: 특정 앱이나 서비스를 홍보하지 않는다. 앱 이름, "다운로드", "설치", "해보세요", "추천" 같은 말을 쓰지 않는다.',
      '결과는 이야기를 여는 한 줄로만 쓰고, 그 결과를 설명하거나 자랑하지 않는다. 글의 무게는 질문 쪽에 있어야 한다.',
      '결과가 어디서 나온 건지 밝히지 않는다. 그냥 "봤는데", "나왔는데" 정도로 넘긴다.',
      '',
      '절대 쓰지 않을 소재: 정치, 선거, 특정 정당·정치인, 젠더 갈등, 남녀 대립, 지역 비하, 종교, 인종, 장애, 특정 인물이나 회사 비방, 확인되지 않은 사실 주장, 성적인 내용, 자해·자살·폭력.',
      '누군가를 깎아내리거나 싸움을 붙이는 글이 아니라, 사람들이 웃으면서 자기 얘기를 하게 되는 글을 쓴다.',
      '의학적·심리학적 진단명은 쓰지 않는다. 불안을 조장하지 않는다.',
    ].join('\n');

    const userPrompt = [
      `방금 본 결과: ${fact}`,
      `질문할 소재: ${pickTopic(kind)}`,
      '',
      '위 결과로 글을 열고, 위 소재에 대한 질문으로 끝내는 스레드 글을 써줘.',
      '댓글이 많이 달리는 게 유일한 목표다.',
      '글만 출력해. 설명이나 따옴표는 붙이지 마.',
    ].join('\n');
    return { systemPrompt, userPrompt };
  }

  // 모델이 지시를 어겨도 글이 깨지지 않게 여기서 한 번 더 다듬는다.
  function sanitize(raw) {
    if (typeof raw !== 'string') return '';
    let s = raw.replace(/\r/g, '').trim();
    s = s.replace(/^["'「『]|["'」』]$/g, '');
    s = s.replace(/#\S+/g, '').trim();          // 해시태그가 섞여 오면 뺀다
    s = s.replace(/https?:\/\/\S+/g, '').trim(); // 링크는 우리가 붙인다
    const lines = s.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
    s = lines.join('\n');
    if (!s || s.length > 120) return '';         // 너무 길면 미리 써둔 문구를 쓴다
    return s;
  }

  function fetchCopy(kind, fact) {
    const url = proxyUrl();
    if (!url) return Promise.reject(new Error('no proxy'));
    const { systemPrompt, userPrompt } = buildPrompts(kind, fact);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 문구는 짧아야 하므로 길이는 낮게, 대신 온도를 올려 매번 다른 소리가 나오게 한다.
      // (프록시가 범위 밖 값은 깎으므로 여기 값이 그대로 과금이 되지는 않는다.)
      body: JSON.stringify({ systemPrompt, userPrompt, maxTokens: 220, temperature: 1.2 }),
      signal: ac.signal,
    })
      .then((r) => { if (!r.ok) throw new Error('proxy error'); return r.json(); })
      .then((d) => {
        const line = sanitize(d && d.answer);
        if (!line) throw new Error('empty');
        return line;
      })
      .finally(() => clearTimeout(timer));
  }

  // AI가 실패했을 때 쓸 문구.
  //
  // 소재 풀과 같은 이유로 종류별로 나눈다. AI가 죽었다고 운세 공유에서 배달비
  // 이야기가 나가면, 그게 오히려 제일 티가 나는 실패다. 형식은 AI에게 시킨 것과
  // 같다 — 겪은 일 한 줄로 열고, 답하기 쉬운 질문으로 닫는다.
  const FALLBACKS_BY_KIND = {
    rx: [
      '증상 읽자마자 뜨끔했다\n다들 요즘 제일 미루고 있는 거 뭐예요?',
      '오늘 나한테 필요한 게 뭔지 알겠는데 그걸 못 하는 중\n여러분은 지칠 때 뭐 하세요?',
      '남들은 별거 아니라는데 나만 힘든 거 있잖아요\n다들 그런 거 하나씩 있죠?',
    ],
    result: [
      '오늘 상태에 이름 붙이니까 좀 정리됨\n요즘 기분 한 단어로 하면 뭐예요?',
      '괜찮은 척하고 있었는데 안 괜찮았나 봄\n다들 오늘 하루 몇 점이에요?',
      '쉬는 날인데 왜 더 피곤하지\n이거 저만 그런 거 아니죠?',
    ],
    slip: [
      '처방전까지 받으니까 괜히 진지해짐\n요즘 누가 처방 좀 내려줬으면 싶은 상황 있어요?',
      '주의사항이 제일 뼈 때림\n다들 알면서도 계속 하는 거 뭐예요?',
    ],
    custom: [
      '친구한테 해주고 싶은 말 적다가 내가 위로받음\n힘들 때 들었던 말 중 제일 좋았던 거 뭐예요?',
      '위로한다고 한 말이 오히려 상처였던 적 있어서 조심스러움\n다들 그런 경험 있어요?',
    ],
    fortune: [
      '오늘 운세 봤는데 은근 맞아서 좀 찔림\n다들 운세 보는 편이에요?',
      '별점 낮은 항목이 하필 오늘 신경 쓰이던 거였음\n이런 거 믿는 편이세요?',
      '안 믿는다면서 매일 보는 중\n여러분만의 징크스 있어요?',
    ],
    maumun: [
      '오늘 내 마음에 이름이 붙으니까 좀 정리됨\n요즘 기분 한 단어로 하면 뭐예요?',
      '진단명이 너무 정확해서 웃었다\n다들 기분 안 좋을 때 티 나는 편이에요?',
    ],
    tarot: [
      '세 번째 카드에서 좀 멈칫했다\n요즘 제일 고민되는 선택 뭐예요?',
      '직감대로 가라는데 그게 제일 어렵지\n다들 고민될 때 어떻게 정하세요?',
    ],
    mbti: [
      '유형 설명 읽는데 왜 내 얘기를 하지\n다들 본인 유형 잘 맞는 것 같아요?',
      '약한 지점이 너무 정확해서 억울함\nMBTI 믿는 편이에요 아니에요?',
    ],
    match: [
      '궁합 결과가 생각보다 냉정하네\n다들 나랑 잘 맞는 사람 조건이 뭐예요?',
      '성격 반대인데 잘 지내는 사람도 있긴 하잖아요\n여러분은 어떤 편이에요?',
    ],
    lucky: [
      '이번 주 번호 받아왔는데 일단 기분은 좋음\n다들 번호 어떻게 고르세요?',
      '되든 안 되든 이게 주말 루틴이 됨\n당첨되면 제일 먼저 뭐 하실 거예요?',
    ],
    pharmacy: [
      '모으다 보니 은근 채워지는 재미가 있네\n다들 뭐 모으는 거 있어요?',
      '컴플리트 못 하면 찝찝한 편이라 큰일임\n여러분도 이런 편이에요?',
    ],
    reward: [
      '희귀한 거 하나 떴다고 혼자 신남\n다들 뽑기 운 좋은 편이에요?',
      '첫판에 좋은 거 나오면 그날 하루가 다름\n이런 경험 있으세요?',
    ],
    report: [
      '한 달 기록 보니까 생각보다 잘 버텼네\n다들 기록하는 습관 있어요?',
      '연속 기록 끊길까 봐 억지로 하는 중\n최고 며칠까지 해보셨어요?',
    ],
  };

  const FALLBACKS_COMMON = [
    '오늘 하루가 유난히 길었다\n다들 오늘 어땠어요?',
    '요즘 왜 이렇게 지치지\n여러분은 스트레스 어떻게 푸세요?',
  ];

  function pickFallback(fallbacks, kind) {
    const list = (fallbacks && fallbacks.length) ? fallbacks.filter(Boolean)
      : (FALLBACKS_BY_KIND[kind] || FALLBACKS_COMMON);
    if (!list.length) return '';
    // 소재를 고르는 방식과 똑같이 (날짜 + 종류)로 고른다. 그래야 AI가 죽은 날에도
    // 콘텐츠마다 다른 글이 나가고, 다음 날엔 바뀐다.
    return list[seedFor(kind) % list.length];
  }

  // 하루에 종류당 몇 개까지 새로 만들지. 한 번 누르고 마는 사람이 대부분이라 1개면
  // 충분하지만, 같은 날 두 번 공유하는 사람에게 같은 글이 또 나가면 티가 난다.
  // 3개까지만 만들고 그 뒤로는 만들어 둔 것을 돌려쓴다.
  const VARIANTS_PER_DAY = 3;

  function bumpUsed(kind) {
    const c = loadCache();
    c.used = c.used || {};
    c.used[kind] = (Number(c.used[kind]) || 0) + 1;
    saveCache(c);
  }

  async function copyFor(kind, fact, fallbacks) {
    const cache = loadCache();
    // 소재는 (날짜 + 종류)로 정해지므로 캐시도 그 단위로 잡는다. 처방 하나하나로 나누면
    // 같은 소재의 글을 처방 수만큼 새로 사게 된다.
    const made = [];
    for (let i = 0; i < VARIANTS_PER_DAY; i++) {
      const v = cache.byKey[`${kind}#${i}`];
      if (v) made.push(v);
    }
    const used = Number(cache.used && cache.used[kind]) || 0;

    // 이미 한도만큼 만들어 뒀으면 새로 사지 않고 돌려쓴다.
    if (made.length >= VARIANTS_PER_DAY) {
      bumpUsed(kind);
      return made[used % made.length];
    }
    try {
      const line = await fetchCopy(kind, fact);
      const c = loadCache();
      c.byKey[`${kind}#${made.length}`] = line;
      saveCache(c);
      bumpUsed(kind);
      return line;
    } catch (e) {
      // 오늘 만들어 둔 게 있으면 미리 써둔 문구보다 그게 낫다(오늘 소재에 맞는 글이므로).
      if (made.length) { bumpUsed(kind); return made[used % made.length]; }
      return pickFallback(fallbacks, kind);
    }
  }

  function shareText(text) {
    const url = threadsUrl();
    const full = `${text}\n\n${url}`;
    if (navigator.share) {
      // files를 주지 않는 것이 이 버튼의 핵심이다. 이미지가 붙으면 사진 게시물이 된다.
      return navigator.share({ text: full }).catch((e) => {
        if (e && e.name === 'AbortError') return;   // 사용자가 취소함
        return copyToClipboard(full);
      });
    }
    return copyToClipboard(full);
  }

  function copyToClipboard(full) {
    const C = window.MaumjaroCore;
    return navigator.clipboard.writeText(full)
      .then(() => { if (C && C.showToast) C.showToast('글을 복사했어요. 스레드에 붙여넣기 하세요 💬'); })
      .catch(() => { if (C && C.showToast) C.showToast('복사에 실패했어요. 직접 선택해서 복사해주세요'); });
  }

  /* opts: { anchor, after, kind, fact, fallbacks }
   *   anchor    버튼을 붙일 요소(맨 뒤에 붙는다)
   *   after     이 요소 바로 뒤에 끼워 넣는다. 이미지 공유 버튼 옆에 두고 싶을 때 쓴다.
   *             anchor보다 우선한다.
   *   kind      콘텐츠 종류(프롬프트와 캐시 키에 쓰인다)
   *   fact      오늘 나온 결과 한 줄 — 이걸 재료로 문구를 만든다
   *   fallbacks AI가 실패했을 때 쓸 미리 써둔 문구들
   */
  function mountButton(opts) {
    if (!opts) return null;
    const after = opts.after;
    if (!after && !opts.anchor) return null;
    const btn = document.createElement('button');
    btn.className = 'rx-friend-quick-btn';
    btn.type = 'button';
    btn.style.cssText = 'width:100%;margin-top:8px;';
    btn.textContent = '💬 글로 공유 (스레드)';
    if (after && after.parentNode) after.parentNode.insertBefore(btn, after.nextSibling);
    else opts.anchor.appendChild(btn);

    btn.addEventListener('click', async () => {
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = '문구 만드는 중...';
      try {
        const text = await copyFor(opts.kind, opts.fact, opts.fallbacks);
        if (!text) return;
        await shareText(text);
        const G = window.MaumjaroGame;
        if (G && typeof G.track === 'function') G.track('threads_text_shared', { kind: opts.kind });
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
    // 약국처럼 버튼을 한 번만 붙이고 내용은 열 때마다 바뀌는 화면을 위해,
    // 나중에 재료만 갈아 끼울 수 있게 해둔다(버튼을 다시 만들면 중복으로 쌓인다).
    btn.setFact = (fact) => { opts.fact = fact; };
    return btn;
  }

  window.MaumjaroThreads = { mountButton, copyFor, threadsUrl };
})();
