/* 화면 그리기 공통 도구. */
(function () {
  const EMPTY = window.KBO_CONFIG.emptyText;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 값이 없으면 "정보 준비 중". 절대로 빈칸이나 지어낸 값을 보여주지 않는다. */
  function textOr(v, suffix) {
    if (v == null || v === '') return '<span class="empty-inline">' + EMPTY + '</span>';
    return esc(v) + (suffix ? esc(suffix) : '');
  }

  function emptyBox(msg) {
    return '<div class="empty">' + esc(msg || EMPTY) + '</div>';
  }

  /* 색만으로 뜻을 전하지 않기 위해 별과 숫자를 함께 낸다(지시서 15·60번). */
  function stars(n) {
    if (typeof n !== 'number') return '<span class="empty-inline">' + EMPTY + '</span>';
    const full = Math.round(n);
    return '<span aria-label="5점 만점에 ' + full + '점">' +
           '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full)) +
           ' <b>' + full + '</b>/5</span>';
  }

  function meta(updatedAt, sources) {
    const bits = [];
    if (updatedAt) bits.push('정보 업데이트: ' + esc(updatedAt));
    if (sources && sources.length) {
      bits.push('출처: ' + sources.map((s) =>
        s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>'
              : esc(s.name)).join(', '));
    }
    return bits.length ? '<p class="meta">' + bits.join(' · ') + '</p>' : '';
  }

  function mount(el, html) { if (el) el.innerHTML = html; }

  window.KboRender = { esc, textOr, emptyBox, stars, meta, mount, EMPTY };
})();
