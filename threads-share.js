// 스레드용 "글로 공유" — 이미지 없이 텍스트 + 링크만 보낸다.
//
// 왜 이미지 공유와 따로 두는가
//   스레드는 글이 본문인 플랫폼이다. 이미지를 붙이면 사진 게시물이 되어 글이
//   보조로 밀리고, 댓글이 붙는 결도 달라진다. 스레드에서 댓글이 많이 달리는 글은
//   대체로 "짧고, 구체적인 상황이고, 질문으로 끝나는" 글이다. 그래서 여기서는
//   이미지를 아예 넘기지 않고(navigator.share에 files를 주지 않는다) 글만 보낸다.
//
// 문구는 왜 앱 이야기가 아닌가
//   목적이 "앱 소개"가 아니라 "유입"이기 때문이다. 앱 자랑 글은 광고로 읽혀서
//   댓글이 안 붙고, 댓글이 안 붙으면 스레드가 글을 퍼뜨리지 않아서 아무도 못 본다.
//   그래서 글 본문은 누구나 한마디 얹고 싶어지는 생활 밀착 질문으로 가고,
//   링크는 맨 끝에 한 줄로만 붙인다. 글이 퍼지면 링크도 같이 퍼진다.
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

  // 어그로용 소재 풀.
  //
  // 왜 소재를 우리가 정해서 주는가
  //   "댓글 달릴 글 써줘"라고만 하면 모델은 매번 비슷한 데로 수렴한다(대체로 날씨·월요일).
  //   날짜와 콘텐츠 종류로 소재를 하나 집어 넘기면, 콘텐츠마다·날마다 다른 주제가 나온다.
  //
  // 왜 하필 이런 주제들인가
  //   한국 SNS에서 댓글이 제일 많이 붙는 건 "누구나 한마디 얹을 수 있고, 답이 갈리는"
  //   생활 밀착 주제다. 정치·젠더·지역·종교처럼 진짜 논란이 되는 주제는 댓글은 붙지만
  //   신고가 같이 붙는다. 계정이 제한되면 유입 자체가 0이 되므로 그쪽은 프롬프트에서 막았다.
  const BAIT_TOPICS = [
    '음식 취향이 갈리는 것 (민트초코, 탕수육 부먹찍먹, 라면에 계란, 회식 메뉴)',
    '직장에서 사소하게 눈치 보이는 것 (점심시간, 퇴근 인사, 단톡방 답장 속도)',
    '카톡·연락 예절 (읽씹, 답장 속도, 전화 vs 메시지, 새벽 연락)',
    '돈 쓰는 기준이 갈리는 것 (택시비, 커피값, 배달비, 구독료, 경조사비 액수)',
    '집안일 습관 (설거지 바로 하기 vs 모아 하기, 이불 개기, 빨래 개는 시점)',
    '친구 사이의 선 (더치페이, 약속 취소, 빌린 돈, 갑자기 연락 오는 친구)',
    '여행·휴가 스타일 (계획형 vs 즉흥형, 혼자 vs 같이, 사진 찍는 양)',
    '잠과 아침 (알람 개수, 주말 기상 시간, 낮잠, 밤새우기)',
    '요즘 사람들 피로도 (월요일, 출퇴근길, 야근, 번아웃)',
    '나이 들면서 달라진 것 (체력, 취향, 술, 사람 만나는 횟수)',
    '사소한 공공 매너 (엘리베이터, 지하철 자리, 계산대 줄)',
    '연애에서 갈리는 기준 (연락 빈도, 기념일, 전 애인 사진, 소개팅)',
    '집순이 vs 밖순이 (주말 계획, 약속 취소했을 때 기분)',
    '스트레스 푸는 법 (매운 거, 잠, 쇼핑, 운동, 아무것도 안 하기)',
    '해봤자 소용없는데 계속 하는 것 (미루기, 폰 보기, 장바구니만 담기)',
  ];

  // 날짜 + 종류를 섞어 번호 하나를 만든다. 글자 코드를 그냥 더하면 서로 다른 종류가
  // 같은 값으로 몰려서(rx와 pharmacy가 같은 소재로 나오는 식) 섞이지 않는다.
  // 자리마다 33을 곱해 굴리는 방식(djb2)이라야 짧은 단어들도 고르게 흩어진다.
  function seedFor(kind) {
    const d = new Date();
    let h = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) >>> 0;
    const k = String(kind || '');
    for (let i = 0; i < k.length; i++) h = (h * 33 + k.charCodeAt(i)) >>> 0;
    return h;
  }

  function pickTopic(kind) {
    return BAIT_TOPICS[seedFor(kind) % BAIT_TOPICS.length];
  }

  function buildPrompts(kind, fact) {
    const systemPrompt = [
      '너는 한국 스레드(Threads)에서 댓글이 많이 달리는 글을 쓰는 사람이다.',
      '목표는 단 하나다: 읽은 사람이 "나는 이런데" 하고 댓글을 달고 싶어지게 만드는 것.',
      '',
      '댓글이 붙는 글의 조건:',
      '- 누구나 겪어본 아주 구체적인 장면 한 컷으로 시작한다. 추상적인 감상으로 시작하지 않는다.',
      '- 의견이 갈리는 지점을 건드린다. 모두가 동의할 이야기는 댓글이 안 달린다.',
      '- 본인 입장을 슬쩍 하나 정해서 말한다. 중립적으로 쓰면 반박할 거리가 없어서 댓글이 안 붙는다.',
      '- 마지막 줄은 반드시 물음표로 끝나는 질문이다. 답하기 쉬워야 한다(둘 중 고르기, 한 단어로 답하기 등).',
      '',
      '문체: 혼잣말하듯 편한 반말이나 가벼운 존댓말. 광고 문구나 카피라이터 말투는 절대 금지.',
      '형식: 전체 3줄 이내, 90자 이내. 해시태그 금지. 링크 금지(링크는 앱이 따로 붙인다). 이모지는 최대 1개.',
      '',
      '중요: 특정 앱이나 서비스를 홍보하지 않는다. 앱 이름, "다운로드", "설치", "테스트 해보세요" 같은 말을 쓰지 않는다.',
      '주어진 소재를 살리되, 억지로 다 쓰지 말고 그중 하나만 골라 구체적으로 파고든다.',
      '',
      // 어그로를 요청받았지만, 계정이 제한되면 유입이 0이 된다. 실제로 신고가 붙는
      // 주제만 빼고 나머지는 열어둔다. 이건 톤을 순화하라는 뜻이 아니다.
      '절대 쓰지 않을 소재: 정치, 선거, 특정 정당·정치인, 젠더 갈등, 남녀 대립, 지역 비하, 종교, 인종, 장애, 특정 인물이나 회사 비방, 확인되지 않은 사실 주장, 성적인 내용, 자해·자살·폭력.',
      '누군가를 깎아내리거나 싸움을 붙이는 글이 아니라, 사람들이 웃으면서 자기 얘기를 하게 되는 글을 쓴다.',
    ].join('\n');

    const userPrompt = [
      `오늘의 소재: ${pickTopic(kind)}`,
      // fact(오늘 나온 결과)는 참고만 시킨다. 사용자가 "앱과 무관해도 된다"고 정한 방향이라,
      // 소재가 우선이고 결과는 어울릴 때만 한 스푼 섞인다.
      `참고(써도 되고 안 써도 됨): 글쓴이는 방금 "${fact}" 라는 결과를 봤다.`,
      '',
      '위 소재로 스레드에 올릴 글을 써줘. 댓글이 많이 달리는 게 유일한 목표다.',
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
  // 예전에는 콘텐츠 종류별로("처방이 웃긴데", "운세가 맞더라") 써뒀는데, 어그로 방식으로
  // 바꾸면서 앱 이야기를 뺐다. 실패했을 때 갑자기 앱 냄새 나는 글이 나가면 오히려 튄다.
  // 위 BAIT_TOPICS와 같은 결의 생활 밀착 질문만 둔다.
  const BAIT_FALLBACKS = [
    '탕수육 시켰는데 소스 부어서 온 거 실화냐\n이건 부먹파도 화낼 일 아니에요?',
    '점심시간 끝나기 5분 전에 자리 돌아오는 사람\n다들 몇 분 전에 들어가세요?',
    '카톡 읽고 3시간 뒤에 답장 오는 거\n이거 기분 나빠하면 예민한 건가요?',
    '집에 오자마자 설거지 하는 사람 진짜 존경함\n다들 언제 하세요?',
    '택시비 만원 넘어가면 손이 떨림\n여러분 마지노선은 얼마예요?',
    '여행 가기 전날까지 아무 계획 안 세우는 편\n계획파 즉흥파 어느 쪽이에요?',
    '알람 5개 맞춰놓고 다 끄고 다시 잠\n다들 알람 몇 개예요?',
    '주말 약속 취소되면 솔직히 좀 기쁨\n저만 그런 거 아니죠?',
    '30대 되니까 술 마신 다음 날이 이틀 감\n다들 언제부터 이랬어요?',
    '엘리베이터에서 닫힘 버튼 연타하는 사람\n이거 급한 거예요 습관이에요?',
    '스트레스 받으면 무조건 매운 거 찾는 편\n여러분은 뭐로 푸세요?',
    '장바구니에 담아두고 3개월째 안 사는 중\n다들 이런 거 몇 개 있어요?',
    '배달비 3천원 보고 그냥 앱 끔\n여러분은 얼마까지 참아요?',
    '친구가 약속 30분 전에 취소하면\n화내도 되는 거 맞죠?',
    '월요일 아침에 눈 뜨는 순간이 제일 힘듦\n다들 하루 중 언제가 제일 힘들어요?',
  ];

  function pickFallback(fallbacks, kind) {
    const list = (fallbacks && fallbacks.length) ? fallbacks.filter(Boolean) : BAIT_FALLBACKS;
    if (!list.length) return '';
    // 소재를 고르는 방식과 똑같이 (날짜 + 종류)로 고른다. 그래야 AI가 죽은 날에도
    // 콘텐츠마다 다른 글이 나가고, 다음 날엔 전부 바뀐다.
    // 소재 풀과 길이가 달라 같은 씨앗이라도 다른 글이 걸린다.
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
