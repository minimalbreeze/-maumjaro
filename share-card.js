/* 공유 카드 — 9:16 세로 이미지를 만들어 네이티브 공유 시트로 넘긴다.
 *
 * 왜 만들었나
 *   처방전·타로·마음약은 이미지로 공유되는데, MBTI 결과와 행운번호는 텍스트+링크만
 *   나갔다(Rx.shareOrCopy). 인스타 스토리·릴스는 이미지가 없으면 아예 올릴 수가 없어서,
 *   소셜에서 가장 잘 퍼지는 콘텐츠(MBTI 결과)가 정작 공유되지 못하는 상태였다.
 *
 * 왜 별도 파일인가
 *   같은 캡처·공유 로직을 mbti.js와 lucky.js에 두 번 복사하지 않기 위해서다.
 *   기존 파일에는 이 모듈을 부르는 몇 줄만 더한다.
 *
 * iOS 제스처 제약 (타로 공유에서 이미 겪은 것)
 *   navigator.share()는 "사용자가 누른 직후"에만 열린다. html2canvas가 몇 초 걸리면
 *   그 사이 권한이 만료돼 공유 시트가 아예 안 뜨고 버튼이 멈춘 채로 남는다.
 *   그래서 결과 화면이 그려지는 즉시 prepare()로 이미지를 미리 만들어 두고,
 *   버튼을 누르는 순간에는 기다리지 않고 곧바로 공유 시트를 연다.
 */
(() => {
  'use strict';

  const NODE_ID = 'mj-share-card';
  const CAPTURE_TIMEOUT_MS = 12000;

  function Core() { return window.MaumjaroCore; }
  function Rx() { return window.MaumjaroRx; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg) {
    const C = Core();
    if (C && typeof C.showToast === 'function') C.showToast(msg);
  }

  // 거부가 아니라 null로 "시간 초과"를 알린다 — 어떤 경우에도 버튼이 멈추지 않게 한다.
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  }

  function cardHtml(spec) {
    const rows = (spec.rows || [])
      .filter((r) => r && r.v)
      .map((r) => `
        <div class="mj-share-row">
          <span class="mj-share-k">${esc(r.k)}</span>
          <span class="mj-share-v">${esc(r.v)}</span>
        </div>`)
      .join('');

    // 로또처럼 숫자를 공으로 보여줘야 읽히는 경우가 있다.
    // 항목은 숫자 배열이거나 { label, nums } 둘 다 받는다 — 앱 화면이 A·B·C로 부르면
    // 공유 카드도 같은 이름이어야 "내가 본 그 번호"로 읽힌다.
    const balls = (spec.balls || [])
      .map((set, i) => {
        const nums = Array.isArray(set) ? set : (set && set.nums) || [];
        const label = Array.isArray(set) ? String(i + 1) : (set && set.label) || String(i + 1);
        return `
        <div class="mj-share-ballrow">
          <span class="mj-share-ballno">${esc(label)}</span>
          ${nums.map((n) => `<span class="mj-share-ball">${esc(n)}</span>`).join('')}
        </div>`;
      })
      .join('');

    // 헤드라인은 'ENFP'(4자)부터 '이번 주 행운번호'(9자)까지 길이 차이가 크다.
    // 한 크기로 두면 긴 쪽이 줄바꿈돼 마지막 글자만 다음 줄로 떨어진다(실측 확인).
    const hl = String(spec.headline || '');
    const hlClass = hl.length <= 5 ? '' : (hl.length <= 10 ? ' is-mid' : ' is-long');

    return `
      <div class="mj-share-badge">${esc(spec.badge || '맘운자로')}</div>
      <div class="mj-share-body">
        ${spec.emoji ? `<div class="mj-share-emoji">${esc(spec.emoji)}</div>` : ''}
        <div class="mj-share-headline${hlClass}">${esc(hl)}</div>
        ${spec.subhead ? `<div class="mj-share-subhead">${esc(spec.subhead)}</div>` : ''}
        ${spec.lead ? `<p class="mj-share-lead">${esc(spec.lead)}</p>` : ''}
        ${rows || balls ? `<div class="mj-share-panel">${balls}${rows}</div>` : ''}
      </div>
      <div class="mj-share-foot">
        <div class="mj-share-url">maumjaro.minimalbreeze.com</div>
        ${spec.note ? `<div class="mj-share-note">${esc(spec.note)}</div>` : ''}
      </div>
    `;
  }

  function mountNode(spec) {
    let node = document.getElementById(NODE_ID);
    if (!node) {
      node = document.createElement('div');
      node.id = NODE_ID;
      node.className = 'mj-share-card';
      document.body.appendChild(node);
    }
    node.innerHTML = cardHtml(spec);
    return node;
  }

  async function buildBlob(spec) {
    // 캡처 라이브러리는 첫 화면 이후에 받으므로 여기서 준비를 기다린다.
    if (typeof window.html2canvas !== 'function' && window.MaumjaroLib) {
      await window.MaumjaroLib.html2canvas();
    }
    if (typeof window.html2canvas !== 'function') return null;

    const node = mountNode(spec);
    // 이모지 폰트가 늦게 붙으면 두부(□)로 찍힌다. 한 프레임 양보해 레이아웃을 확정시킨다.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const canvas = await window.html2canvas(node, {
        backgroundColor: null,
        scale: 2,
        width: 540,
        height: 960,
        windowWidth: 540,
        windowHeight: 960,
      });
      return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch (e) {
      return null;
    }
  }

  // 미리 만들어 두기. 결과 화면을 그린 직후에 부른다.
  let pending = null;   // Promise<Blob|null>
  let ready = null;     // Blob|null

  function prepare(spec) {
    ready = null;
    pending = buildBlob(spec)
      .then((b) => { ready = b; return b; })
      .catch(() => null);
    return pending;
  }

  // 여기서 await를 하지 않고 promise를 그대로 돌려주는 게 핵심이다.
  // navigator.share()가 클릭 핸들러 안에서 "동기적으로" 불려야 iOS가 제스처로 인정한다.
  function shareBlobNow(blob, filename, text, url, title) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return null;
    return navigator.share({ files: [file], text: `${text}\n${url}`, title });
  }

  function textFallback(text, url) {
    const R = Rx();
    if (R && typeof R.shareOrCopy === 'function') R.shareOrCopy(text, url);
  }

  /* opts: { spec, filename, text, url, title, btn }
   * spec은 prepare()를 못 했거나 결과가 없을 때 다시 만들기 위한 것이다. */
  async function share(opts) {
    const { spec, filename, text, url, title, btn } = opts;

    // 준비된 이미지가 있으면 기다리지 않고 곧바로 공유 시트를 연다.
    if (ready) {
      const sharing = shareBlobNow(ready, filename, text, url, title);
      if (sharing) {
        try {
          await sharing;
        } catch (e) {
          if (!e || e.name !== 'AbortError') textFallback(text, url);
        }
        return;
      }
    }

    if (typeof window.html2canvas !== 'function' && !window.MaumjaroLib) {
      textFallback(text, url);
      return;
    }

    // 아직 준비 전이거나 파일 공유를 못 쓰는 환경.
    // 상한을 둬서 어떤 경우에도 버튼이 "준비 중..."에 갇히지 않게 한다.
    const label = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = '준비 중...'; }
    try {
      const blob = await withTimeout(pending || buildBlob(spec), CAPTURE_TIMEOUT_MS);
      if (!blob) {
        toast('이미지 준비가 늦어져서 텍스트로 보낼게요');
        textFallback(text, url);
        return;
      }
      ready = blob;
      const sharing = shareBlobNow(blob, filename, text, url, title);
      if (sharing) {
        await sharing;
        return;
      }
      // 파일 공유 미지원(주로 데스크톱): 이미지를 내려받고 텍스트는 따로 처리한다.
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = filename;
      a.href = objUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
      toast('이미지를 저장했어요 🖼️');
      textFallback(text, url);
    } catch (e) {
      if (e && e.name === 'AbortError') return; // 사용자가 공유 시트를 취소함
      textFallback(text, url);
    } finally {
      if (btn) { btn.disabled = false; if (label) btn.textContent = label; }
    }
  }

  window.MaumjaroShare = { prepare, share };
})();
