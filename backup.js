// 전체 백업 · 복원 — 기기를 옮겨도 기록이 따라오게
//
// 왜 만들었나:
// 효성님이 아이콘을 바꾸려면 홈 화면에서 지웠다 다시 추가해야 하는데,
// "그럼 그동안 출석 데이터가 날아가는 것 아니냐"고 물었다. 맞는 걱정이다.
//   - iOS 홈 화면 웹앱은 추가하는 순간의 아이콘을 복사해 두므로, 다시 추가하지 않으면
//     아이콘이 바뀌지 않는다.
//   - 그런데 지웠을 때 저장소가 같이 비워지는지는 애플 공식 문서로 확인되지 않는다.
//     "네이티브 앱처럼 지워진다"가 통설이지만 근거 문서를 못 찾았다.
//   - 확인되지 않은 것에 사용자 기록을 걸 수는 없다.
//
// 기존에도 백업이 있었지만 사주 프로필 하나만 담았다(fortune.js의 buildProfileBackupCode).
// 출석·마음약·처방·타로 기록은 전부 빠져 있었다. 여기서 전부 담는다.
//
// 이건 효성님만의 문제가 아니다. 폰을 바꾸거나 브라우저 저장소가 정리되면
// 누구든 기록을 잃는다. 재방문이 이 앱의 제일 약한 고리인데, 기록이 날아가는 건
// 재방문할 이유 자체가 사라지는 일이다.
(() => {
  'use strict';

  // 담지 않는 것: 다시 만들어지는 캐시뿐이다. 용량만 키우고 의미가 없다.
  const SKIP = [
    'maumjaro:fortuneAiCache',
    'maumjaro:healAiCache',
    'maumjaro:rxAiCache',
    'maumjaro:threadsCopyCache',
  ];
  const PREFIX = 'maumjaro:';
  const VERSION = 1;

  function collect() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(PREFIX) !== 0 || SKIP.indexOf(k) !== -1) continue;
        out[k] = localStorage.getItem(k);
      }
    } catch (e) { /* 저장소를 못 읽으면 빈 것으로 본다 */ }
    return out;
  }

  // LZString은 CDN에서 온다. 막혀 있거나 늦게 오는 경우에도 백업은 되어야 하므로
  // 그때는 base64로 떨어진다. 코드 앞의 한 글자가 어느 쪽인지를 말해 준다.
  function encode(obj) {
    const json = JSON.stringify({ v: VERSION, at: Date.now(), d: obj });
    if (window.LZString && typeof window.LZString.compressToEncodedURIComponent === 'function') {
      return 'L' + window.LZString.compressToEncodedURIComponent(json);
    }
    return 'B' + btoa(unescape(encodeURIComponent(json)));
  }

  function decode(code) {
    const t = String(code || '').trim();
    if (!t) return null;
    let json = null;
    try {
      if (t[0] === 'L' && window.LZString) json = window.LZString.decompressFromEncodedURIComponent(t.slice(1));
      else if (t[0] === 'B') json = decodeURIComponent(escape(atob(t.slice(1))));
    } catch (e) { return null; }
    if (!json) return null;
    try {
      const o = JSON.parse(json);
      if (!o || typeof o !== 'object' || !o.d || typeof o.d !== 'object') return null;
      // 남의 저장소를 덮어쓰지 않도록 우리 키만 받는다.
      const keys = Object.keys(o.d).filter((k) => k.indexOf(PREFIX) === 0);
      if (!keys.length) return null;
      return { at: o.at, keys, data: o.d };
    } catch (e) {
      return null;
    }
  }

  // 복원은 덮어쓰되 지우지 않는다. 백업에 없는 키는 그대로 둔다 —
  // 오래된 코드를 넣었을 때 최근 기록까지 사라지면 복원이 아니라 사고다.
  function restore(parsed) {
    let n = 0;
    parsed.keys.forEach((k) => {
      try {
        if (typeof parsed.data[k] === 'string') { localStorage.setItem(k, parsed.data[k]); n++; }
      } catch (e) { /* 한 칸이 막혀도 나머지는 복원한다 */ }
    });
    return n;
  }

  function track(name, params) {
    const G = window.MaumjaroGame;
    if (G && typeof G.track === 'function') G.track(name, params || {});
  }
  function toast(msg) {
    const C = window.MaumjaroCore;
    if (C && typeof C.showToast === 'function') C.showToast(msg);
  }

  // ---------- 설정 안의 입구 ----------
  function mount() {
    const card = document.querySelector('#settings-overlay .settings-card');
    if (!card || card.querySelector('#backup-row')) return;

    const row = document.createElement('div');
    row.id = 'backup-row';
    row.className = 'sound-row';
    row.innerHTML = '<span>🔐 기록 백업 · 복원</span><button class="toggle-btn" type="button" id="backup-open">열기</button>';

    const panel = document.createElement('div');
    panel.id = 'backup-panel';
    panel.className = 'backup-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <p class="backup-note">폰을 바꾸거나 홈 화면 아이콘을 다시 추가하기 <b>전에</b> 코드를 복사해 두세요.</p>
      <button class="action-btn backup-copy" id="backup-copy" type="button">📋 백업 코드 복사</button>
      <textarea class="backup-input" id="backup-input" rows="3" placeholder="복원하려면 백업 코드를 붙여넣으세요"></textarea>
      <button class="rx-friend-quick-btn" id="backup-restore" type="button">기록 복원하기</button>
      <p class="backup-note backup-warn">복원은 덮어쓰기만 해요. 지금 기록을 지우지는 않아요.</p>`;

    const reset = document.getElementById('settings-reset-btn');
    if (reset && reset.parentNode) {
      reset.parentNode.insertBefore(row, reset);
      reset.parentNode.insertBefore(panel, reset);
    } else {
      card.appendChild(row); card.appendChild(panel);
    }

    document.getElementById('backup-open').addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      document.getElementById('backup-open').textContent = panel.hidden ? '열기' : '닫기';
      if (!panel.hidden) track('backup_panel_opened', {});
    });

    document.getElementById('backup-copy').addEventListener('click', async () => {
      const data = collect();
      const count = Object.keys(data).length;
      if (!count) { toast('백업할 기록이 아직 없어요'); return; }
      const code = encode(data);
      track('backup_copied', { keys: count, len: code.length });
      try {
        await navigator.clipboard.writeText(code);
        toast('백업 코드를 복사했어요. 메모장에 붙여넣어 보관하세요 🔐');
      } catch (e) {
        // 클립보드 권한이 없으면 입력칸에 넣어 직접 복사하게 한다.
        const ta = document.getElementById('backup-input');
        ta.value = code; ta.select();
        toast('입력칸의 코드를 길게 눌러 복사해주세요');
      }
    });

    document.getElementById('backup-restore').addEventListener('click', () => {
      const parsed = decode(document.getElementById('backup-input').value);
      if (!parsed) { toast('백업 코드를 다시 확인해주세요'); return; }
      const when = parsed.at ? new Date(parsed.at).toLocaleDateString('ko-KR') : '알 수 없는 날짜';
      if (!window.confirm(`${when}에 만든 백업이에요.\n기록 ${parsed.keys.length}칸을 되돌릴까요?`)) return;
      const n = restore(parsed);
      track('backup_restored', { keys: n });
      toast(`기록 ${n}칸을 되돌렸어요. 새로고침할게요`);
      setTimeout(() => location.reload(), 900);
    });
  }

  // 설정은 눌러야 열린다. 열리고 나서 붙인다(gate.js가 쓰는 방식과 같다).
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#settings-btn')) setTimeout(mount, 140);
  });

  // 다른 곳에서도 쓸 수 있게 열어 둔다(테스트 포함).
  window.MaumjaroBackup = { collect, encode, decode, restore };
})();
