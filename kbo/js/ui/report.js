/* 정보 제보.
   불꽃축제 명당지도는 사용자 제보로 데이터를 채웠다. 우리도 같은 길을 가되,
   서버 없이 오늘 당장 동작하는 방법으로 시작한다 — 앱 안에서 폼을 채우면
   정리된 글이 만들어지고, 이미 있는 공유 3단 폴백으로 운영자에게 보낸다.
   로그인도, 외부 계정도, 백엔드도 필요 없다.

   config.report.url(구글폼 등)이나 email이 채워지면 그 경로가 추가로 열린다. */
(function () {
  const R = window.KboRender;
  const CFG = window.KBO_CONFIG;
  const DRAFT_KEY = 'kbo:reportDraft';

  function loadDraft() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveDraft(d) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  /* 폼 내용을 사람이 읽을 수 있는 글로 만든다.
     운영자가 그대로 읽고 데이터 파일에 옮길 수 있는 모양이어야 한다. */
  function compose(ctx, form) {
    const lines = ['[KBO 명당지도 제보]'];
    lines.push('구장: ' + (ctx.stadiumName || '-'));
    lines.push('구역: ' + (form.zone || '전체'));
    const topics = CFG.report.topics
      .filter((t) => form.topics.includes(t.id))
      .map((t) => t.label.replace(/^\S+\s/, ''));
    lines.push('종류: ' + (topics.length ? topics.join(', ') : '-'));
    lines.push('');
    lines.push(form.text || '');
    if (form.contact) { lines.push(''); lines.push('연락처: ' + form.contact); }
    return lines.join('\n');
  }

  function render(ctx) {
    const draft = loadDraft();
    // 같은 등급이 여러 도형으로 나뉜 경우(EV석 1루/3루 등)가 있으므로 이름으로 중복을 없앤다.
    const zones = [];
    (ctx.zones || []).forEach((z) => {
      if (!zones.some((x) => x.name === z.name)) zones.push(z);
    });
    const selected = ctx.zone ? ctx.zone.name : (draft.zone || '');

    let html = '<h2>📍 정보 제보</h2>' +
      '<p style="margin:0 0 14px;color:var(--dim);font-size:14.5px">' +
      '이 지도는 아직 비어 있는 곳이 많습니다. 직접 가보고 아신 것을 알려주시면 채워집니다.</p>';

    // 구역
    html += '<label class="fld"><span>어느 구역인가요?</span><select id="rp-zone">' +
      '<option value="">구역 전체 / 해당 없음</option>' +
      zones.map((z) => '<option' + (z.name === selected ? ' selected' : '') + '>' +
        R.esc(z.name) + '</option>').join('') +
      '</select></label>';

    // 종류
    html += '<fieldset class="fld"><legend>무엇을 알려주실 수 있나요?</legend><div class="chips">' +
      CFG.report.topics.map((t) =>
        '<button class="chip" type="button" data-topic="' + t.id + '" aria-pressed="' +
        ((draft.topics || []).includes(t.id) ? 'true' : 'false') + '">' +
        R.esc(t.label) + '</button>').join('') +
      '</div></fieldset>';

    // 내용
    html += '<label class="fld"><span>자세히 적어주세요</span>' +
      '<textarea id="rp-text" rows="5" placeholder="예) K8석 120블록에서 봤는데 응원단상이 바로 앞이라 소리가 크고, 3회쯤부터 햇빛이 완전히 사라집니다. 성인 1매 OO원이었어요.">' +
      R.esc(draft.text || '') + '</textarea></label>';

    html += '<label class="fld"><span>연락처 <em>(선택)</em></span>' +
      '<input id="rp-contact" type="text" inputmode="email" placeholder="확인이 필요할 때만 연락드립니다" value="' +
      R.esc(draft.contact || '') + '" /></label>';

    html += '<p class="meta" id="rp-photo">📸 사진은 이 글을 보낸 뒤 같은 대화에 그대로 첨부해 주세요.</p>';

    // 보내기
    html += '<div class="sheet-actions"><button class="btn btn-primary btn-block" id="rp-send" type="button">보내기</button></div>';
    if (CFG.report.url) {
      html += '<p style="margin-top:10px"><a class="btn btn-ghost btn-block" href="' +
        R.esc(CFG.report.url) + '" target="_blank" rel="noopener">웹 폼으로 제보하기 ›</a></p>';
    }
    if (CFG.report.email) {
      html += '<p style="margin-top:8px"><button class="btn btn-ghost btn-block" id="rp-mail" type="button">메일로 보내기</button></p>';
    }

    html += '<p class="disclaimer" style="margin-top:16px">' + R.esc(CFG.report.policy) + '</p>';
    return html;
  }

  /* 시트에 그려진 뒤 동작을 붙인다. */
  function wire(root, ctx) {
    const draft = loadDraft();
    let topics = (draft.topics || []).slice();

    const read = () => ({
      zone: root.querySelector('#rp-zone').value,
      topics: topics,
      text: root.querySelector('#rp-text').value.trim(),
      contact: root.querySelector('#rp-contact').value.trim()
    });
    const remember = () => saveDraft(read());

    root.querySelectorAll('[data-topic]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.topic;
        const on = topics.includes(id);
        topics = on ? topics.filter((x) => x !== id) : topics.concat(id);
        b.setAttribute('aria-pressed', String(!on));
        remember();
      });
    });
    root.querySelector('#rp-zone').addEventListener('change', remember);
    root.querySelector('#rp-text').addEventListener('input', remember);
    root.querySelector('#rp-contact').addEventListener('input', remember);

    root.querySelector('#rp-send').addEventListener('click', () => {
      const form = read();
      if (!form.text && !form.topics.length) {
        window.KboShare.toast('알려주실 내용을 적어주세요');
        root.querySelector('#rp-text').focus();
        return;
      }
      // 공유 시트가 열리면 사진을 이어서 첨부할 수 있다.
      window.KboShare.share(compose(ctx, form), location.href);
      window.KboAnalytics.track('seat_report', {
        stadium: ctx.stadiumId || '', zone: form.zone || '', topics: form.topics.join(',')
      });
      clearDraft();
    });

    const mail = root.querySelector('#rp-mail');
    if (mail) {
      mail.addEventListener('click', () => {
        const form = read();
        const subject = '[KBO 명당지도 제보] ' + (ctx.stadiumName || '') + ' ' + (form.zone || '');
        location.href = 'mailto:' + encodeURIComponent(CFG.report.email) +
          '?subject=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(compose(ctx, form) + '\n\n' + location.href);
        window.KboAnalytics.track('seat_report', { stadium: ctx.stadiumId || '', via: 'mail' });
      });
    }
  }

  window.KboReport = { render, wire, compose };
})();
