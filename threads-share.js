// 스레드용 "글로 공유" — 이미지 없이 텍스트 + 링크만 보낸다.
//
// 왜 이미지 공유와 따로 두는가
//   스레드는 글이 본문인 플랫폼이다. 이미지를 붙이면 사진 게시물이 되어 글이
//   보조로 밀리고, 댓글이 붙는 결도 달라진다. 스레드에서 댓글이 많이 달리는 글은
//   대체로 "짧고, 구체적인 상황이고, 질문으로 끝나는" 글이다. 그래서 여기서는
//   이미지를 아예 넘기지 않고(navigator.share에 files를 주지 않는다) 글만 보낸다.
//
// 문구를 AI로 만드는 이유
//   같은 문구를 매일 올리면 스레드에서 금세 스팸처럼 읽힌다. 오늘 나온 결과를
//   재료로 그날의 문구를 새로 만들어, 매일 다른 글이 나가게 한다.
//
// 비용
//   같은 종류·같은 결과는 하루에 한 번만 부른다(localStorage 캐시). 실패하면
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

  function buildPrompts(kind, fact) {
    const systemPrompt = [
      '너는 한국 앱 "맘운자로"의 SNS 담당자다. 스레드(Threads)에 올릴 짧은 글을 쓴다.',
      '스레드에서 댓글이 많이 달리는 글의 특징을 따른다: 구체적인 상황 한 컷, 짧은 줄, 그리고 마지막에 사람들이 답하고 싶어지는 질문.',
      '문체: 반말체 혼잣말이나 친구에게 말하듯 편한 존댓말. 광고 문구처럼 쓰지 않는다.',
      '규칙: 전체 3줄 이내, 90자 이내. 해시태그 금지. 링크 금지(링크는 앱이 따로 붙인다).',
      '이모지는 쓰더라도 한 개까지만.',
      '앱 이름을 직접 홍보하거나 "다운로드", "설치" 같은 말을 쓰지 않는다. 결과 이야기만 한다.',
      '마지막 줄은 반드시 물음표로 끝나는 질문이어야 한다.',
      '의학적·심리학적 진단명은 쓰지 않는다. 불안을 조장하지 않는다.',
    ].join(' ');
    const userPrompt = [
      `콘텐츠 종류: ${kind}`,
      `오늘 나온 결과: ${fact}`,
      '위 결과를 소재로 스레드에 올릴 글을 써줘.',
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
      body: JSON.stringify({ systemPrompt, userPrompt }),
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

  // AI가 실패했을 때 쓸 문구. 종류별로 몇 개씩 두고 날짜로 골라, 네트워크가 죽어도
  // 매일 같은 글이 나가지 않게 한다. AI 문구와 같은 규칙(짧게, 질문으로 끝)을 지킨다.
  const DEFAULT_FALLBACKS = {
    rx: [
      '오늘 나한테 내려진 처방이 좀 웃긴데\n다들 요즘 뭐가 제일 힘들어요?',
      '증상 읽자마자 뜨끔했다\n요즘 제일 미루고 있는 거 뭐예요?',
      '부작용까지 적혀 있는 게 포인트\n다들 오늘 컨디션 어때요?',
    ],
    fortune: [
      '오늘 운세 보고 왔는데 은근 맞더라\n오늘 하루 어땠어요?',
      '별점 낮은 항목이 하필 오늘 신경 쓰이는 거였음\n다들 요즘 뭐가 제일 걱정이에요?',
      '운세는 안 믿는데 이건 좀 찔림\n여러분은 운세 보는 편이에요?',
    ],
    maumun: [
      '오늘 내 마음 상태에 이름이 붙으니까 좀 정리됨\n요즘 기분 한 단어로 하면 뭐예요?',
      '진단명이 너무 정확해서 웃었다\n다들 오늘 어떤 하루였어요?',
    ],
    tarot: [
      '카드 세 장이 생각보다 말을 많이 하네\n요즘 제일 고민되는 거 뭐예요?',
      '세 번째 카드에서 좀 멈칫했다\n다들 요즘 어떤 선택 앞에 있어요?',
    ],
    mbti: [
      '유형 설명 읽는데 왜 내 얘기를 하지\n다들 무슨 유형이에요?',
      '약한 지점이 너무 정확해서 억울함\n본인 유형 잘 맞는 것 같아요?',
    ],
    lucky: [
      '이번 주 번호 받아왔는데 일단 기분은 좋음\n다들 번호 어떻게 고르세요?',
      '되든 안 되든 이게 주말 루틴이 됨\n여러분은 이런 소소한 루틴 있어요?',
    ],
    pharmacy: [
      '모으다 보니 은근 채워지는 재미가 있네\n다들 뭐 모으는 거 있어요?',
      '희귀한 거 하나 떴다고 혼자 신남\n요즘 작게라도 뿌듯했던 일 있어요?',
    ],
  };

  function pickFallback(fallbacks) {
    const list = (fallbacks || []).filter(Boolean);
    if (!list.length) return '';
    // 날짜로 고르므로 같은 날엔 같은 문구, 다음 날엔 다른 문구가 나온다.
    const d = new Date();
    return list[(d.getFullYear() + d.getMonth() + d.getDate()) % list.length];
  }

  async function copyFor(kind, fact, fallbacks) {
    const pool = (fallbacks && fallbacks.length) ? fallbacks
      : (DEFAULT_FALLBACKS[kind] || DEFAULT_FALLBACKS.fortune);
    const cacheId = `${kind}|${fact}`;
    const cache = loadCache();
    if (cache.byKey[cacheId]) return cache.byKey[cacheId];
    try {
      const line = await fetchCopy(kind, fact);
      const c = loadCache();
      c.byKey[cacheId] = line;
      saveCache(c);
      return line;
    } catch (e) {
      return pickFallback(pool);
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
