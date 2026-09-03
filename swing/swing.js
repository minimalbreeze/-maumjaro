/* 스윙자로 — 화면 로직
 *
 * 영상은 브라우저 안에서만 다룬다(URL.createObjectURL). 서버로 올리지 않는다.
 * 저장은 localStorage 에 'maumjaro:swing:' 접두사로만 한다(기존 키는 건드리지 않는다).
 */
(function () {
  'use strict';

  var D = window.SwingData, F = window.SwingFaults, A = window.SwingAnalyze;
  var LS_LAST = 'maumjaro:swing:last';
  var LS_HIST = 'maumjaro:swing:history';
  var FPS = 60; // 프레임 단위 이동에 쓰는 가정값. 대부분의 폰 영상이 30 또는 60이다.

  var S = {
    club: 'mid', view: 'dtl', sensitivity: 'normal',
    videoURL: null, duration: 0,
    frames: {},          // { P1:{t:초, marks:{head:{x,y},...}}, ... }
    curFrame: null,      // 지금 마킹 중인 프레임 id
    viewFrame: null,     // 지금 화면에 띄워 놓은 프레임 id (진단 화면에서 씀)
    markQueue: [],       // 남은 관절 목록
    report: null
  };

  var $ = function (s) { return document.querySelector(s); };
  var el = {};
  ['steps','club-grid','view-grid','shoot-guide','shoot-guide-2','sens-seg','go-video',
   'file','drop','video','canvas','stage-in','stage-badge','seek','tcode','play','rate-seg',
   'frames','mark-panel','mark-frame','mark-progress','mark-target','mark-undo','mark-copy',
   'mark-clear','mark-done','go-report','mark-need','report','go-fit','flight-grid','traj-seg',
   'contact-seg','carry','go-fitresult','fitreport','btn-reset','main',
   'stage','stage-slot-mark','stage-slot-report','report-frames'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var SCREENS = ['setup','video','mark','report','fit'];
  function show(step) {
    SCREENS.forEach(function (s) {
      var n = document.getElementById('s-' + s);
      if (n) n.hidden = (s !== step);
    });
    var hit = false;
    Array.prototype.forEach.call(el.steps.children, function (li) {
      var s = li.dataset.step;
      li.classList.toggle('on', s === step);
      li.classList.toggle('done', !hit && s !== step);
      if (s === step) hit = true;
    });
    // 무대(영상+캔버스)는 하나뿐이라 필요한 화면으로 옮겨 붙인다.
    var slot = step === 'mark' ? el['stage-slot-mark']
             : step === 'report' ? el['stage-slot-report'] : null;
    if (slot && el.stage.parentNode !== slot) slot.appendChild(el.stage);
    el.stage.hidden = !slot;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (slot) requestAnimationFrame(fitCanvas);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function ytURL(q) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q); }

  /* ── 1. 셋업 화면 ─────────────────────────────────────────────── */
  function buildSetup() {
    el['club-grid'].innerHTML = D.CLUB_ORDER.map(function (id) {
      var c = D.CLUBS[id];
      return '<button type="button" class="pick' + (id === S.club ? ' on' : '') + '" data-club="' + id + '">' +
        '<span class="em">' + c.emoji + '</span>' + esc(c.label) +
        '<span class="sm">플레인 ' + c.planeDeg + '°</span></button>';
    }).join('');

    el['view-grid'].innerHTML = ['dtl','fo'].map(function (id) {
      var v = D.VIEWS[id];
      return '<button type="button" class="pick' + (id === S.view ? ' on' : '') + '" data-view="' + id + '">' +
        '<span class="em">' + v.emoji + '</span>' + esc(v.label) +
        '<span class="sm">' + esc(v.desc) + '</span></button>';
    }).join('');

    renderGuide();
  }

  function renderGuide() {
    var v = D.VIEWS[S.view];
    var html = '<h4>📷 ' + esc(v.label) + ' 촬영 가이드</h4><ul>' +
      v.guide.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') +
      '<li>스윙 시작 1초 전부터 피니시 1초 후까지 넉넉히 담아주세요</li></ul>';
    el['shoot-guide'].innerHTML = html;
    el['shoot-guide-2'].innerHTML = html;
  }

  el['club-grid'].addEventListener('click', function (e) {
    var b = e.target.closest('[data-club]'); if (!b) return;
    S.club = b.dataset.club;
    Array.prototype.forEach.call(this.children, function (n) { n.classList.toggle('on', n === b); });
  });
  el['view-grid'].addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]'); if (!b) return;
    if (S.view !== b.dataset.view) { S.frames = {}; S.report = null; }
    S.view = b.dataset.view;
    Array.prototype.forEach.call(this.children, function (n) { n.classList.toggle('on', n === b); });
    renderGuide(); buildFrames();
  });
  el['sens-seg'].addEventListener('click', function (e) {
    var b = e.target.closest('[data-v]'); if (!b) return;
    S.sensitivity = b.dataset.v;
    Array.prototype.forEach.call(this.children, function (n) { n.classList.toggle('on', n === b); });
  });
  el['go-video'].addEventListener('click', function () { show('video'); });
  el['btn-reset'].addEventListener('click', function () {
    if (!confirm('처음부터 다시 시작할까요? 지금 찍은 점들은 사라집니다.')) return;
    S.frames = {}; S.report = null; S.curFrame = null; S.viewFrame = null;
    buildFrames(); show('setup');
  });

  /* ── 2. 영상 ─────────────────────────────────────────────────── */
  el.drop.addEventListener('click', function () { el.file.click(); });
  el.file.addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (S.videoURL) URL.revokeObjectURL(S.videoURL);
    S.videoURL = URL.createObjectURL(f);
    S.frames = {}; S.report = null; S.curFrame = null; S.viewFrame = null;
    el.video.src = S.videoURL;
    el.video.load();
  });
  el.video.addEventListener('loadedmetadata', function () {
    S.duration = el.video.duration || 0;
    el.seek.value = 0;
    buildFrames(); show('mark');
    setTimeout(function () { seekTo(Math.min(0.05, S.duration)); }, 60);
  });
  el.video.addEventListener('error', function () {
    if (el.video.src) alert('이 영상 형식은 브라우저가 열지 못했습니다. MP4(H.264)로 변환해 다시 시도해 주세요.');
  });

  /* ── 3. 스크러빙 ─────────────────────────────────────────────── */
  function seekTo(t) {
    t = Math.max(0, Math.min(S.duration || 0, t));
    el.video.currentTime = t;
  }
  el.seek.addEventListener('input', function () {
    el.video.pause();
    seekTo((this.value / 1000) * S.duration);
  });
  el.video.addEventListener('timeupdate', syncTime);
  el.video.addEventListener('seeked', function () { syncTime(); draw(); });
  function syncTime() {
    var t = el.video.currentTime || 0;
    el.tcode.textContent = t.toFixed(2) + 's';
    if (S.duration) el.seek.value = Math.round((t / S.duration) * 1000);
  }
  document.querySelectorAll('[data-nudge]').forEach(function (b) {
    b.addEventListener('click', function () {
      el.video.pause();
      seekTo(el.video.currentTime + (+this.dataset.nudge) / FPS);
    });
  });
  el.play.addEventListener('click', function () {
    if (el.video.paused) { el.video.play(); this.textContent = '❚❚ 일시정지'; }
    else { el.video.pause(); this.textContent = '▶ 재생'; }
  });
  el.video.addEventListener('pause', function () { el.play.textContent = '▶ 재생'; });
  el.video.addEventListener('play', function () { el.play.textContent = '❚❚ 일시정지'; });
  el['rate-seg'].addEventListener('click', function (e) {
    var b = e.target.closest('[data-r]'); if (!b) return;
    el.video.playbackRate = +b.dataset.r;
    Array.prototype.forEach.call(this.children, function (n) { n.classList.toggle('on', n === b); });
  });

  /* ── 4. 키프레임 칩 ──────────────────────────────────────────── */
  function jointList() {
    return D.VIEWS[S.view].joints;
  }
  function neededFor(fid) {
    var list = jointList().map(function (j) { return j; });
    if (fid === 'P1') list = list.concat(D.VIEWS[S.view].extra);
    return list;
  }
  function isMarked(fid) {
    var f = S.frames[fid];
    if (!f) return false;
    return neededFor(fid).every(function (j) { return f.marks[j.id]; });
  }
  function buildFrames() {
    el.frames.innerHTML = D.FRAMES.map(function (f) {
      var set = !!S.frames[f.id], done = isMarked(f.id);
      var st = done ? '✓ 완료' : set ? '점 찍기' : '미지정';
      return '<button type="button" class="fchip' + (f.required ? ' req' : '') +
        (set ? ' set' : '') + (done ? ' marked' : '') + (S.curFrame === f.id ? ' cur' : '') +
        '" data-frame="' + f.id + '"><span class="em">' + f.emoji + '</span>' +
        esc(f.label) + '<span class="st">' + st + '</span></button>';
    }).join('');
    updateReady();
  }
  function updateReady() {
    var need = D.FRAMES.filter(function (f) { return f.required; });
    var missing = need.filter(function (f) { return !isMarked(f.id); });
    el['go-report'].disabled = missing.length > 0;
    el['mark-need'].textContent = missing.length
      ? '필수 구간(*)이 남았습니다 — ' + missing.map(function (f) { return f.label; }).join(', ')
      : '선택 구간(테이크백·다운스윙)까지 찍으면 플레인 진단이 더 정확해집니다.';
  }

  el.frames.addEventListener('click', function (e) {
    var b = e.target.closest('[data-frame]'); if (!b) return;
    var fid = b.dataset.frame, def = null;
    D.FRAMES.forEach(function (f) { if (f.id === fid) def = f; });

    if (!S.frames[fid]) {
      // 아직 시각을 안 잡은 구간: 지금 보고 있는 프레임을 그 구간으로 지정한다.
      if (!confirm(def.label + ' 구간을 지금 이 프레임(' + (el.video.currentTime || 0).toFixed(2) + 's)으로 지정할까요?\n\n' + def.cue)) return;
      S.frames[fid] = { t: el.video.currentTime || 0, marks: {} };
    } else {
      seekTo(S.frames[fid].t);
    }
    startMarking(fid);
  });

  /* ── 5. 관절 마킹 ────────────────────────────────────────────── */
  function startMarking(fid) {
    S.curFrame = fid; S.viewFrame = fid;
    seekTo(S.frames[fid].t);
    var have = S.frames[fid].marks;
    S.markQueue = neededFor(fid).filter(function (j) { return !have[j.id]; });
    el['mark-panel'].hidden = false;
    renderMarkPanel();
    buildFrames();
    draw();
  }
  function renderMarkPanel() {
    if (!S.curFrame) { el['mark-panel'].hidden = true; return; }
    var def = null;
    D.FRAMES.forEach(function (f) { if (f.id === S.curFrame) def = f; });
    var total = neededFor(S.curFrame).length, left = S.markQueue.length;
    el['mark-frame'].textContent = def.emoji + ' ' + def.label + ' (' + S.frames[S.curFrame].t.toFixed(2) + 's)';
    el['mark-progress'].textContent = (total - left) + ' / ' + total;
    if (left) {
      var j = S.markQueue[0];
      el['mark-target'].innerHTML = '<span class="dot" style="background:' + j.color + '"></span>' +
        '<b>' + esc(j.label) + '</b> 위치를 영상에서 눌러주세요<small>' + esc(j.hint) + '</small>';
    } else {
      el['mark-target'].innerHTML = '<b>이 구간은 다 찍었습니다 ✓</b><small>점을 끌어서 위치를 미세 조정할 수 있습니다</small>';
    }
    el['mark-undo'].disabled = (total - left) === 0;
    var prev = prevFrameWithMarks(S.curFrame);
    el['mark-copy'].disabled = !prev;
    el['mark-copy'].textContent = prev ? (prev + ' 에서 복사') : '이전 구간에서 복사';
  }
  function prevFrameWithMarks(fid) {
    var order = D.FRAMES.map(function (f) { return f.id; });
    for (var i = order.indexOf(fid) - 1; i >= 0; i--) {
      var f = S.frames[order[i]];
      if (f && Object.keys(f.marks).length) return order[i];
    }
    return null;
  }
  el['mark-undo'].addEventListener('click', function () {
    var fid = S.curFrame; if (!fid) return;
    var all = neededFor(fid), have = S.frames[fid].marks;
    for (var i = all.length - 1; i >= 0; i--) {
      if (have[all[i].id]) { delete have[all[i].id]; break; }
    }
    S.markQueue = all.filter(function (j) { return !have[j.id]; });
    renderMarkPanel(); buildFrames(); draw();
  });
  el['mark-clear'].addEventListener('click', function () {
    if (!S.curFrame) return;
    S.frames[S.curFrame].marks = {};
    S.markQueue = neededFor(S.curFrame);
    renderMarkPanel(); buildFrames(); draw();
  });
  el['mark-copy'].addEventListener('click', function () {
    var prev = prevFrameWithMarks(S.curFrame); if (!prev) return;
    var src = S.frames[prev].marks, dst = S.frames[S.curFrame].marks;
    neededFor(S.curFrame).forEach(function (j) {
      if (!dst[j.id] && src[j.id]) dst[j.id] = { x: src[j.id].x, y: src[j.id].y };
    });
    S.markQueue = neededFor(S.curFrame).filter(function (j) { return !dst[j.id]; });
    renderMarkPanel(); buildFrames(); draw();
  });
  el['mark-done'].addEventListener('click', function () {
    S.viewFrame = S.curFrame;
    S.curFrame = null; S.markQueue = [];
    el['mark-panel'].hidden = true;
    buildFrames(); draw();
  });

  /* ── 6. 캔버스 ───────────────────────────────────────────────── */
  var ctx = el.canvas.getContext('2d');
  var dragging = null;

  function fitCanvas() {
    var r = el.video.getBoundingClientRect();
    if (!r.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.canvas.width = Math.round(r.width * dpr);
    el.canvas.height = Math.round(r.height * dpr);
    el.canvas.style.width = r.width + 'px';
    el.canvas.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  window.addEventListener('resize', fitCanvas);
  el.video.addEventListener('loadeddata', fitCanvas);

  // 정규화 좌표(0~1) ↔ 캔버스 픽셀. 영상이 letterbox 되어도 맞도록 표시 영역 기준으로 계산한다.
  function box() {
    var cw = el.canvas.clientWidth, ch = el.canvas.clientHeight;
    var vw = el.video.videoWidth || 16, vh = el.video.videoHeight || 9;
    var s = Math.min(cw / vw, ch / vh);
    var w = vw * s, h = vh * s;
    return { x: (cw - w) / 2, y: (ch - h) / 2, w: w, h: h };
  }
  function toPx(p) { var b = box(); return { x: b.x + p.x * b.w, y: b.y + p.y * b.h }; }
  function toNorm(px, py) { var b = box(); return { x: (px - b.x) / b.w, y: (py - b.y) / b.h }; }

  function evPos(e) {
    var r = el.canvas.getBoundingClientRect();
    var t = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function hitJoint(pos) {
    if (!S.curFrame) return null;
    var marks = S.frames[S.curFrame].marks, best = null, bd = 18;
    Object.keys(marks).forEach(function (id) {
      var p = toPx(marks[id]), d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < bd) { bd = d; best = id; }
    });
    return best;
  }
  function onDown(e) {
    if (!S.curFrame) return;
    var pos = evPos(e);
    // 찍을 점이 남아 있으면 무조건 "찍기"가 우선이다. 끌기를 먼저 보면
    // 볼처럼 클럽헤드 바로 옆에 오는 점을 찍을 때 옆의 점이 끌려가 버린다.
    if (S.markQueue.length) {
      var j = S.markQueue.shift();
      S.frames[S.curFrame].marks[j.id] = toNorm(pos.x, pos.y);
      e.preventDefault();
      renderMarkPanel(); buildFrames(); draw();
      return;
    }
    var hit = hitJoint(pos);
    if (hit) { dragging = hit; e.preventDefault(); }
  }
  function onMove(e) {
    if (!dragging) return;
    var pos = evPos(e);
    S.frames[S.curFrame].marks[dragging] = toNorm(pos.x, pos.y);
    e.preventDefault(); draw();
  }
  function onUp() { if (dragging) { dragging = null; draw(); } }
  el.canvas.addEventListener('pointerdown', onDown);
  el.canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function draw() {
    if (!ctx) return;
    var cw = el.canvas.clientWidth, ch = el.canvas.clientHeight;
    ctx.clearRect(0, 0, cw, ch);
    if (S.report && S.report.shapes) drawShapes(S.report.shapes);
    drawSkeleton();
    updateBadge();
  }

  function updateBadge() {
    if (S.curFrame && S.markQueue.length) {
      var j = S.markQueue[0];
      el['stage-badge'].textContent = '지금 찍을 곳: ' + j.label + ' (' + j.hint + ')';
      el['stage-badge'].style.display = '';
    } else if (S.report) {
      var lb = null;
      D.FRAMES.forEach(function (f) { if (f.id === S.viewFrame) lb = f; });
      el['stage-badge'].textContent = (lb ? lb.emoji + ' ' + lb.label + ' · ' : '') +
        '초록 = 정상 플레인 · 주황 = 척추선 · 노랑 = 머리 허용 범위';
      el['stage-badge'].style.display = '';
    } else {
      el['stage-badge'].style.display = 'none';
    }
  }

  function drawSkeleton() {
    var fid = S.curFrame || S.viewFrame;
    if (!fid || !S.frames[fid]) return;
    var marks = S.frames[fid].marks;
    var links = S.view === 'dtl'
      ? [['head','shoulder'],['shoulder','hip'],['hip','knee'],['shoulder','hands'],['hands','clubhead']]
      : [['leadShoulder','trailShoulder'],['leadHip','trailHip'],['leadShoulder','leadHip'],
         ['trailShoulder','trailHip'],['head','leadShoulder'],['head','trailShoulder'],['hands','clubhead']];
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
    links.forEach(function (L) {
      if (!marks[L[0]] || !marks[L[1]]) return;
      var a = toPx(marks[L[0]]), b = toPx(marks[L[1]]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    neededFor(fid).forEach(function (j) {
      if (!marks[j.id]) return;
      var p = toPx(marks[j.id]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = j.color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
    });
    ctx.restore();
  }

  function extPts(a, b, k) {
    // a→b 선을 b 너머로 k 배 연장한 두 끝점
    var v = { x: b.x - a.x, y: b.y - a.y };
    return [{ x: a.x - v.x * 0.12, y: a.y - v.y * 0.12 }, { x: a.x + v.x * k, y: a.y + v.y * k }];
  }

  function drawShapes(shapes) {
    ctx.save();
    shapes.forEach(function (sh) {
      ctx.setLineDash(sh.dash || []);
      ctx.lineWidth = sh.width || 2;
      ctx.strokeStyle = sh.color || '#fff';
      if (sh.type === 'line') {
        var e2 = extPts(toPx(sh.from), toPx(sh.to), sh.extend || 1.5);
        ctx.beginPath(); ctx.moveTo(e2[0].x, e2[0].y); ctx.lineTo(e2[1].x, e2[1].y); ctx.stroke();
      } else if (sh.type === 'band') {
        var ap = toPx(sh.apex);
        var p1 = extPts(ap, toPx(sh.a), sh.extend || 2)[1];
        var p2 = extPts(ap, toPx(sh.b), sh.extend || 2)[1];
        ctx.beginPath(); ctx.moveTo(ap.x, ap.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.closePath(); ctx.fillStyle = sh.fill; ctx.fill();
      } else if (sh.type === 'vline') {
        var b = box(), x = b.x + sh.x * b.w;
        ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); ctx.stroke();
      } else if (sh.type === 'circle') {
        // 반지름은 세로 길이 기준으로 넘어온다(가로로 환산하면 세로 영상에서 원이 커진다).
        var c = toPx(sh.center), bb = box();
        ctx.beginPath(); ctx.arc(c.x, c.y, sh.r * bb.h, 0, Math.PI * 2); ctx.stroke();
      } else if (sh.type === 'dot') {
        var d = toPx(sh.at);
        ctx.beginPath(); ctx.arc(d.x, d.y, sh.r || 5, 0, Math.PI * 2);
        ctx.fillStyle = sh.color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (sh.type === 'trace') {
        var key = sh.points[0], pts = [];
        D.FRAMES.forEach(function (f) {
          var fr = S.frames[f.id];
          if (fr && fr.marks[key]) pts.push(toPx(fr.marks[key]));
        });
        if (pts.length > 1) {
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
        pts.forEach(function (p) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = sh.color; ctx.fill();
        });
      }
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ── 7. 진단 리포트 ──────────────────────────────────────────── */
  el['go-report'].addEventListener('click', function () {
    var marks = {};
    Object.keys(S.frames).forEach(function (fid) {
      if (isMarked(fid)) marks[fid] = S.frames[fid].marks;
    });
    // 세로/가로 영상에 따라 x 와 y 의 축척이 다르다. 종횡비를 넘겨 보정하게 한다.
    var aspect = (el.video.videoWidth && el.video.videoHeight)
      ? el.video.videoWidth / el.video.videoHeight : 1;
    S.report = A.analyze({ club: S.club, view: S.view, sensitivity: S.sensitivity,
      marks: marks, aspect: aspect });
    renderReport(S.report);
    saveHistory(S.report);
    S.viewFrame = S.report.framesUsed.indexOf('P7') >= 0 ? 'P7' : S.report.framesUsed[0];
    buildReportFrames();
    seekTo(S.frames[S.viewFrame].t);
    show('report');
    requestAnimationFrame(function () { fitCanvas(); draw(); });
  });

  // 진단 화면에서 구간을 눌러 넘기면 그 순간 영상 위에 오버레이가 다시 그려진다.
  function buildReportFrames() {
    var have = D.FRAMES.filter(function (f) { return isMarked(f.id); });
    el['report-frames'].innerHTML = have.map(function (f) {
      return '<button type="button" class="fchip' + (S.viewFrame === f.id ? ' cur marked' : ' set') +
        '" data-view-frame="' + f.id + '"><span class="em">' + f.emoji + '</span>' +
        esc(f.label) + '<span class="st">' + S.frames[f.id].t.toFixed(2) + 's</span></button>';
    }).join('');
  }
  el['report-frames'].addEventListener('click', function (e) {
    var b = e.target.closest('[data-view-frame]'); if (!b) return;
    S.viewFrame = b.dataset.viewFrame;
    seekTo(S.frames[S.viewFrame].t);
    buildReportFrames(); draw();
  });

  function fmt(v, unit) {
    if (v == null || isNaN(v)) return '–';
    var n = Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
    return n + (unit || '');
  }

  function renderReport(R) {
    var club = D.CLUBS[R.club], view = D.VIEWS[R.view];
    var h = [];

    var grade = R.score >= 85 ? '아주 좋습니다' : R.score >= 70 ? '괜찮습니다' : R.score >= 55 ? '고칠 곳이 보입니다' : '기본부터 다시 잡을 때입니다';
    var col = R.score >= 85 ? 'var(--ok)' : R.score >= 70 ? 'var(--teal)' : R.score >= 55 ? 'var(--warn)' : 'var(--bad)';
    h.push('<div class="score"><div class="score-n" style="color:' + col + '">' + R.score + '<small>점</small></div>' +
      '<div class="score-t"><b>' + esc(club.label) + ' · ' + esc(view.label) + ' — ' + grade + '</b>' +
      '<span>' + R.framesUsed.length + '개 구간을 기준으로 ' + R.faults.length + '개 문제를 찾았습니다. ' +
      '2D 영상 기준 추정치입니다.</span></div></div>');

    h.push('<div class="legend">' +
      '<i style="--sw:#4dd4ac">정상 플레인 밴드</i>' +
      '<i style="--sw:#ffb570">척추선</i>' +
      '<i style="--sw:#ffd166">머리 허용 범위</i>' +
      '<i style="--sw:#ff8fb3">손 궤적</i></div>');

    // 측정치 표
    h.push('<div class="mtable">');
    Object.keys(R.metrics).forEach(function (k) {
      var m = R.metrics[k];
      if (m.v == null || isNaN(m.v)) return;
      var cls = '', range = '';
      if (m.ideal) {
        var ok = m.v >= m.ideal[0] && m.v <= m.ideal[1];
        cls = ok ? ' good' : ' bad';
        range = '정상 ' + fmt(m.ideal[0]) + '~' + fmt(m.ideal[1]);
      }
      h.push('<div class="mrow' + cls + '"><span class="k">' + esc(m.label) + '</span>' +
        '<span class="v">' + fmt(m.v, m.unit) + '</span><span class="r">' + esc(range) + '</span></div>');
    });
    h.push('</div>');

    if (!R.faults.length) {
      h.push('<div class="okbox"><b>이 각도에서는 큰 문제가 잡히지 않았습니다 ⛳</b>' +
        '<span>반대쪽 각도(' + esc(D.VIEWS[R.view === 'dtl' ? 'fo' : 'dtl'].label) + ')로도 한 번 찍어보세요. ' +
        '한 각도에서 안 보이는 문제가 다른 각도에서 드러납니다.</span></div>');
    } else {
      // 구간별로 묶어서 출력
      F.PHASES.forEach(function (ph) {
        var list = R.faults.filter(function (f) { return F.FAULTS[f.faultId].phase === ph.id; });
        if (!list.length) return;
        h.push('<div class="phase"><div class="phase-h">' + ph.emoji + ' ' + esc(ph.label) +
          ' <span class="rng">' + esc(ph.range) + '</span></div>');
        list.forEach(function (f) { h.push(faultCard(f)); });
        h.push('</div>');
      });
    }

    el.report.innerHTML = h.join('');
  }

  function faultCard(f) {
    var d = F.FAULTS[f.faultId], m = f.metric;
    var sevLabel = ['', '경미', '주의', '심각'][f.sev];
    var h = [];
    h.push('<div class="card"><div class="card-h"><span class="em">' + d.emoji + '</span>' +
      '<span class="tt"><b>' + esc(d.title) + '</b><span>' + esc(d.symptom.slice(0, 46)) + '…</span></span>' +
      '<span class="sev sev' + f.sev + '">' + sevLabel + '</span><span class="arrow">›</span></div>' +
      '<div class="card-b">');

    h.push('<div class="meas"><div class="' + (m.sev ? 'ng' : '') + '"><span>측정값</span><b>' +
      fmt(m.value, m.unit) + '</b></div><div><span>정상 범위</span><b>' +
      fmt(m.lo) + ' ~ ' + fmt(m.hi) + '</b></div><div><span>항목</span><b style="font-size:12.5px">' +
      esc(m.label || '') + '</b></div></div>');

    h.push('<p>' + esc(d.symptom) + '</p>');
    if (f.note) h.push('<p style="color:var(--dim)">' + esc(f.note) + '</p>');
    h.push('<div class="sec-t">이대로 두면</div><p>' + esc(d.impact) + '</p>');
    h.push('<div class="sec-t">왜 생기나</div><ul>' +
      d.cause.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>');
    h.push('<div class="sec-t">이렇게 고칩니다</div><ul>' +
      d.fix.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>');
    h.push('<div class="sec-t">연습 드릴</div>' +
      d.drills.map(function (dr) {
        return '<div class="drill"><b>' + esc(dr.name) + '</b><p>' + esc(dr.how) + '</p>' +
          '<span class="reps">' + esc(dr.reps) + '</span></div>';
      }).join(''));
    h.push('<div class="sec-t">참고 영상</div>' +
      d.yt.map(function (y) {
        return '<a class="yt" href="' + esc(ytURL(y.q)) + '" target="_blank" rel="noopener">' +
          '<span class="ico">▶</span><span><b>' + esc(y.title) + '</b>' +
          '<span>유튜브에서 "' + esc(y.q) + '" 검색</span></span></a>';
      }).join(''));
    h.push('</div></div>');
    return h.join('');
  }

  el.report.addEventListener('click', function (e) {
    var head = e.target.closest('.card-h'); if (!head) return;
    head.parentNode.classList.toggle('open');
  });
  el['go-fit'].addEventListener('click', function () { show('fit'); });

  /* ── 8. 장비 피팅 ────────────────────────────────────────────── */
  var FIT = { flight: null, traj: 'mid', contact: 'center' };
  function buildFit() {
    el['flight-grid'].innerHTML = D.FLIGHTS.map(function (f) {
      return '<button type="button" class="pick" data-flight="' + f.id + '">' +
        '<span class="em">' + f.emoji + '</span>' + esc(f.label) +
        '<span class="sm">' + esc(f.path) + '</span></button>';
    }).join('');
    el['traj-seg'].innerHTML = D.TRAJECTORIES.map(function (t) {
      return '<button type="button" data-traj="' + t.id + '"' + (t.id === 'mid' ? ' class="on"' : '') + '>' +
        t.emoji + ' ' + esc(t.label) + '</button>';
    }).join('');
    el['contact-seg'].innerHTML = D.CONTACTS.map(function (c) {
      return '<button type="button" data-contact="' + c.id + '"' + (c.id === 'center' ? ' class="on"' : '') + '>' +
        c.emoji + ' ' + esc(c.label) + '</button>';
    }).join('');
  }
  function segPick(container, attr, key) {
    el[container].addEventListener('click', function (e) {
      var b = e.target.closest('[data-' + attr + ']'); if (!b) return;
      FIT[key] = b.dataset[attr];
      Array.prototype.forEach.call(this.children, function (n) { n.classList.toggle('on', n === b); });
    });
  }
  segPick('flight-grid', 'flight', 'flight');
  segPick('traj-seg', 'traj', 'traj');
  segPick('contact-seg', 'contact', 'contact');

  el['go-fitresult'].addEventListener('click', function () {
    if (!FIT.flight) { alert('평소 구질을 먼저 골라주세요.'); return; }
    var carry = parseFloat(el.carry.value);
    var out = A.fitting({
      club: S.club, flight: FIT.flight, traj: FIT.traj, contact: FIT.contact,
      carry: isNaN(carry) ? 0 : carry
    }, S.report);
    renderFit(out);
    el.fitreport.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function renderFit(out) {
    var h = [];
    if (out.speed) {
      var s = out.speed;
      h.push('<div class="speedbox"><h4>⚡ 추정 헤드 스피드</h4><div class="speedgrid">' +
        '<div><span>이 클럽</span><b>' + s.clubMph + '<small style="font-size:11px"> mph</small></b></div>' +
        '<div><span>드라이버 환산</span><b>' + s.driverMph + '<small style="font-size:11px"> mph</small></b></div>' +
        '<div><span>m/s 환산</span><b>' + s.driverMs + '</b></div>' +
        '<div><span>같은 클럽 평균 대비</span><b>' + (s.gap >= 0 ? '+' : '') + s.gap + '<small style="font-size:11px"> yd</small></b></div>' +
        '</div></div>');
    }
    if (out.flight) {
      h.push('<div class="fit-item"><span class="p">현재 구질</span><div class="s">' +
        out.flight.emoji + ' ' + esc(out.flight.label) + '</div><p class="w">' + esc(out.flight.note) +
        ' · 임팩트 페이스: ' + esc(out.flight.face) + ' · 궤도: ' + esc(out.flight.path) + '</p></div>');
    }
    out.warns.forEach(function (w) {
      h.push('<div class="warnbox"><p>⚠️ ' + esc(w) + '</p></div>');
    });
    h.push('<h3 class="f-title">장비 세팅 제안</h3>');
    out.items.forEach(function (it) {
      h.push('<div class="fit-item"><span class="p">' + esc(it.part) + '</span>' +
        '<div class="s">' + esc(it.suggest) + '</div><p class="w">' + esc(it.why) + '</p></div>');
    });
    h.push('<p class="hint">스펙 변경은 반드시 시타로 확인하세요. 라이각·로프트 조정은 되돌리기 어려운 작업이라 ' +
      '피팅 전문점에서 임팩트 테이프로 실제 접촉 위치를 확인한 뒤 진행하는 것이 안전합니다.</p>');
    el.fitreport.innerHTML = h.join('');
  }

  /* ── 9. 기록 저장 (좌표만, 영상은 저장하지 않는다) ───────────── */
  function saveHistory(R) {
    try {
      var rec = {
        at: Date.now(), club: R.club, view: R.view, score: R.score,
        faults: R.faults.map(function (f) { return { id: f.faultId, sev: f.sev }; })
      };
      var hist = JSON.parse(localStorage.getItem(LS_HIST) || '[]');
      hist.unshift(rec);
      localStorage.setItem(LS_HIST, JSON.stringify(hist.slice(0, 40)));
      localStorage.setItem(LS_LAST, JSON.stringify({ club: R.club, view: R.view, sensitivity: R.sensitivity }));
    } catch (e) { /* 저장 실패는 분석을 막지 않는다 */ }
  }
  function restorePrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(LS_LAST) || 'null');
      if (p && D.CLUBS[p.club]) { S.club = p.club; S.view = p.view || 'dtl'; S.sensitivity = p.sensitivity || 'normal'; }
    } catch (e) { /* 무시 */ }
    Array.prototype.forEach.call(el['sens-seg'].children, function (n) {
      n.classList.toggle('on', n.dataset.v === S.sensitivity);
    });
  }

  /* ── 시작 ────────────────────────────────────────────────────── */
  restorePrefs();
  buildSetup();
  buildFrames();
  buildFit();
  show('setup');
})();
