/* 공유 — Web Share API 우선, 안 되면 링크 복사(지시서 34·37번).
   iOS는 navigator.share()를 "사용자가 누른 직후"에만 열어준다. 그래서 이 함수는
   클릭 핸들러 안에서 await 없이 바로 불려야 하고, 링크는 url 필드로 따로 넘기지 않고
   text 안에 넣는다(카카오·스레드에서 url 필드가 버려지는 경우가 있다). */
(function () {
  function currentUrl(extra) {
    const u = new URL(location.href);
    if (extra) Object.keys(extra).forEach((k) => {
      if (extra[k] == null) u.searchParams.delete(k);
      else u.searchParams.set(k, extra[k]);
    });
    return u.toString();
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function share(text, url) {
    const full = text + '\n' + url;
    if (navigator.share) {
      navigator.share({ text: full }).catch((e) => {
        if (e && e.name === 'AbortError') return;   // 사용자가 공유 시트를 닫음
        copy(full);
      });
      return;
    }
    copy(full);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast('링크를 복사했어요 🔗'))
        .catch(() => prompt('아래 링크를 복사하세요', text));
    } else {
      prompt('아래 링크를 복사하세요', text);
    }
  }

  window.KboShare = { share, copy, currentUrl, toast };
})();
