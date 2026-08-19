(() => {
  'use strict';

  const Core = window.MaumjaroCore;
  const { RX_CATEGORIES, PRESCRIPTIONS_SEED, CUSTOM_TEMPLATES } = window.MAUMJARO_RX_DATA;

  // 처방을 친구에게 보낼 때 운세 기능으로도 자연스럽게 유입되도록 붙이는 후킹 문구.
  // 처방을 받은 사람이 앱의 다른 무료 기능까지 알게 하는 유입 문구.
  // 링크 미리보기와 함께 잘리지 않도록 한 줄로 짧게 유지한다.
  const FORTUNE_HOOK_LINE = '\n\n🔮 오늘의 운세 · 🎴 타로도 전부 무료로 볼 수 있어요!';

  // ---------- DOM refs (다른 모든 코드보다 먼저 선언 — TDZ 방지) ----------
  const appEl = document.getElementById('app');
  const actionBtn = document.getElementById('action-btn');
  const syringeSvg = document.getElementById('syringe-svg');
  const plungerRod = document.getElementById('plunger-rod');
  const plungerHead = document.getElementById('plunger-head');
  const liquid = document.getElementById('liquid');
  const droplet = document.getElementById('droplet');

  const todayRxCard = document.getElementById('today-rx-card');
  const todayRxEmoji = document.getElementById('today-rx-emoji');
  const todayRxTitle = document.getElementById('today-rx-title');
  const todayRxDiagnosis = document.getElementById('today-rx-diagnosis');
  const todayRxBtn = document.getElementById('today-rx-btn');

  const doseTag = document.getElementById('dose-tag');
  const doseTagMg = document.getElementById('dose-tag-mg');
  const doseTagLabel = document.getElementById('dose-tag-label');
  const doseCaption = document.getElementById('dose-caption');

  const rxResultOverlay = document.getElementById('rx-result-overlay');
  const rxResultEmoji = document.getElementById('rx-result-emoji');
  const rxResultTitle = document.getElementById('rx-result-title');
  const rxResultDiagnosis = document.getElementById('rx-result-diagnosis');
  const rxStat1Label = document.getElementById('rx-stat1-label');
  const rxStat1Fill = document.getElementById('rx-stat1-fill');
  const rxStat1Value = document.getElementById('rx-stat1-value');
  const rxStat2Label = document.getElementById('rx-stat2-label');
  const rxStat2Fill = document.getElementById('rx-stat2-fill');
  const rxStat2Value = document.getElementById('rx-stat2-value');
  const rxResultSideeffect = document.getElementById('rx-result-sideeffect');
  const rxCtaSlip = document.getElementById('rx-cta-slip');
  const rxCtaFriend = document.getElementById('rx-cta-friend');
  const rxCtaAnother = document.getElementById('rx-cta-another');

  const rxSlipOverlay = document.getElementById('rx-slip-overlay');
  const rxSlipPatient = document.getElementById('rx-slip-patient');
  const rxSlipDiagnosis = document.getElementById('rx-slip-diagnosis');
  const rxSlipPrescription = document.getElementById('rx-slip-prescription');
  const rxSlipWarning = document.getElementById('rx-slip-warning');
  const rxSlipDate = document.getElementById('rx-slip-date');
  const rxSlipContent = document.getElementById('rx-slip-content');
  const rxSlipSaveBtn = document.getElementById('rx-slip-save');
  const rxSlipCloseBtn = document.getElementById('rx-slip-close');
  const rxSlipBannerEmoji = document.getElementById('rx-slip-banner-emoji');
  const rxSlipBannerDiagnosis = document.getElementById('rx-slip-banner-diagnosis');
  const rxSlipPhotoImg = document.getElementById('rx-slip-photo-img');
  const rxSlipPhotoBtn = document.getElementById('rx-slip-photo-btn');
  const rxSlipPhotoInput = document.getElementById('rx-slip-photo-input');
  const rxSlipNoteInput = document.getElementById('rx-slip-note-input');

  const rxImageOverlay = document.getElementById('rx-image-overlay');
  const rxImageOverlayEmoji = document.getElementById('rx-image-overlay-emoji');

  const rxFriendOverlay = document.getElementById('rx-friend-overlay');
  const rxFriendResult = document.getElementById('rx-friend-result');
  const rxFriendShareText = document.getElementById('rx-friend-share-text');
  const rxFriendLink = document.getElementById('rx-friend-link');
  const rxFriendCloseBtn = document.getElementById('rx-friend-close');
  const rxFriendShareBtn = document.getElementById('rx-friend-share-btn');
  const rxFriendCapture = document.getElementById('rx-friend-capture');
  const rxFriendBannerEmoji = document.getElementById('rx-friend-banner-emoji');
  const rxFriendBannerDiagnosis = document.getElementById('rx-friend-banner-diagnosis');
  const rxFriendPhotoImg = document.getElementById('rx-friend-photo-img');
  const rxFriendPhotoBtn = document.getElementById('rx-friend-photo-btn');
  const rxFriendPhotoInput = document.getElementById('rx-friend-photo-input');
  const rxFriendVideoPreview = document.getElementById('rx-friend-video-preview');
  const rxFriendVideoBtn = document.getElementById('rx-friend-video-btn');
  const rxFriendVideoInput = document.getElementById('rx-friend-video-input');
  const rxFriendNoteInput = document.getElementById('rx-friend-note-input');
  const rxFriendRecipientInput = document.getElementById('rx-friend-recipient-input');

  const rxSentHistoryOverlay = document.getElementById('rx-sent-history-overlay');
  const rxSentHistoryList = document.getElementById('rx-sent-history-list');
  const rxSentHistoryCloseBtn = document.getElementById('rx-sent-history-close');

  const customIncomingCard = document.getElementById('custom-incoming-card');
  const customIncomingTitle = document.getElementById('custom-incoming-title');
  const customIncomingBtn = document.getElementById('custom-incoming-btn');
  const customIncomingEyebrow = document.getElementById('custom-incoming-eyebrow');

  // 공유 이미지 하단 훅에 타로 카드 뒷면 세 장을 채운다.
  // tarot-data.js가 이 파일보다 먼저 로드되므로 그대로 읽어 쓴다(없으면 훅은 텍스트만 남는다).
  (function fillHookCards() {
    const box = document.getElementById('rx-hook-cards');
    const svg = window.MAUMJARO_TAROT_DATA && window.MAUMJARO_TAROT_DATA.TAROT_BACK_SVG;
    if (!box || !svg) return;
    box.innerHTML = [0, 1, 2].map(() => `<div class="tarot-card-back">${svg}</div>`).join('');
  })();

  const rxRevealOverlay = document.getElementById('rx-custom-reveal-overlay');
  const rxRevealDiagnosis = document.getElementById('rx-reveal-diagnosis');
  const rxRevealPatient = document.getElementById('rx-reveal-patient');
  const rxRevealPrescription = document.getElementById('rx-reveal-prescription');
  const rxRevealWarning = document.getElementById('rx-reveal-warning');
  const rxRevealDoctor = document.getElementById('rx-reveal-doctor');
  const rxRevealMakeBtn = document.getElementById('rx-reveal-make-btn');
  const rxRevealCloseBtn = document.getElementById('rx-reveal-close');

  const rxStoryCapture = document.getElementById('rx-story-capture');
  const rxStoryDiagnosis = document.getElementById('rx-story-diagnosis');
  const rxStoryPatient = document.getElementById('rx-story-patient');
  const rxStoryPrescription = document.getElementById('rx-story-prescription');
  const rxStoryWarning = document.getElementById('rx-story-warning');
  const rxStoryDoctor = document.getElementById('rx-story-doctor');

  const RX_LS_KEY = 'maumjaro:rxRecords';
  const RX_SCHEMA_KEY = 'maumjaro:rxSchemaVersion';
  if (!localStorage.getItem(RX_SCHEMA_KEY)) localStorage.setItem(RX_SCHEMA_KEY, '1');

  // ---------- rx record storage (separate key, never touches maumjaro:records) ----------
  function loadRxRecords() {
    try {
      const raw = localStorage.getItem(RX_LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function recordRx({ prescriptionId, category, ts }) {
    const list = loadRxRecords();
    list.push({ id: `rx_${ts}_${Math.random().toString(36).slice(2, 8)}`, prescriptionId, category, ts });
    localStorage.setItem(RX_LS_KEY, JSON.stringify(list));
  }

  // ---------- 친구에게 보낸 처방 기록 (별도 키) ----------
  const FRIEND_SENT_LS_KEY = 'maumjaro:friendSentRecords';
  function loadFriendSentRecords() {
    try {
      const raw = localStorage.getItem(FRIEND_SENT_LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function recordFriendSend({ recipient, prescriptionId, category, title, emoji, ts }) {
    const list = loadFriendSentRecords();
    list.push({
      id: `fs_${ts}_${Math.random().toString(36).slice(2, 8)}`,
      recipient: recipient || '친구',
      prescriptionId, category, title, emoji, ts,
    });
    localStorage.setItem(FRIEND_SENT_LS_KEY, JSON.stringify(list));
  }
  // 감정 처방은 app.js가 기존 방식대로 completeInjection()에서 처리하고,
  // 완료 시 이 이벤트만 추가로 쏴준다 (app.js 로직 자체는 무변경).
  document.addEventListener('maumjaro:emotion-injected', (e) => {
    const { key, ts } = e.detail || {};
    if (!key) return;
    recordRx({ prescriptionId: `emotion-${key}`, category: 'emotion', ts });
  });

  // ---------- emotion -> Prescription 어댑터 (SYMPTOMS 원본은 건드리지 않음) ----------
  function buildEmotionPrescriptions() {
    return Object.entries(Core.SYMPTOMS).map(([key, s]) => ({
      id: `emotion-${key}`,
      category: 'emotion',
      title: `${s.label} 처방`,
      diagnosis: `${s.label} ${s.mg}`,
      symptom: s.caption,
      prescription: s.messages[0],
      sideEffect: '개인차가 있을 수 있어요',
      warning: '실제 의약품이 아닙니다',
      emoji: s.emoji,
      color: s.color,
      rarity: 'common',
      shareText: `오늘 ${s.label} 처방 받았어요 ${s.emoji}`,
      isPremium: false,
      _legacyKey: key,
    }));
  }

  const ALL_PRESCRIPTIONS = [...buildEmotionPrescriptions(), ...PRESCRIPTIONS_SEED];

  function getCategoryMeta(id) {
    return RX_CATEGORIES.find((c) => c.id === id) || null;
  }

  // ---------- 처방 결과 화면: 카테고리별 스탯 문구 + id 기반 결정론적 % ----------
  const STAT_TEMPLATES = {
    emotion: ['마음 안정도', '오늘 하루 컨디션'],
    work: ['업무 의욕', '퇴근까지 생존 확률'],
    love: ['마음 진정도', '오늘의 평온함'],
    money: ['지출 자제력', '통장 회복력'],
    food: ['식욕 만족도', '참을성 게이지'],
    daily: ['움직일 힘', '오늘 하루 완주율'],
    travel: ['탈출 욕구 해소도', '설렘 지수'],
    default: ['회복도', '오늘의 컨디션'],
  };
  function statPercent(id, salt) {
    return 40 + (hashStr(`${id}:${salt}`) % 41); // 40~80%
  }

  // ---------- 처방 결과 화면 렌더 ----------
  function showResultScreen(p, ts) {
    const [stat1Label, stat2Label] = STAT_TEMPLATES[p.category] || STAT_TEMPLATES.default;
    const stat1 = statPercent(p.id, 1);
    const stat2 = statPercent(p.id, 2);

    rxResultEmoji.textContent = p.emoji;
    rxResultTitle.textContent = p.title;
    rxResultDiagnosis.textContent = p.diagnosis;
    rxStat1Label.textContent = stat1Label;
    rxStat1Value.textContent = `${stat1}%`;
    rxStat2Label.textContent = stat2Label;
    rxStat2Value.textContent = `${stat2}%`;
    rxResultSideeffect.textContent = `오늘의 부작용: ${p.sideEffect}`;

    rxResultOverlay.classList.add('show');
    // 바 애니메이션을 위해 한 프레임 뒤에 width를 채운다 (0% -> 실제값 트랜지션)
    rxStat1Fill.style.width = '0%';
    rxStat2Fill.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rxStat1Fill.style.width = `${stat1}%`;
        rxStat2Fill.style.width = `${stat2}%`;
      });
    });

    rxCtaSlip.onclick = () => {
      closeResultScreen();
      showSlipScreen(p, ts);
    };
    rxCtaFriend.onclick = () => {
      closeResultScreen();
      openFriendShareOverlay(p);
    };
    rxCtaAnother.onclick = () => {
      closeResultScreen();
      runRandomPrescription();
    };
  }
  function closeResultScreen() {
    rxResultOverlay.classList.remove('show');
  }
  rxResultOverlay.addEventListener('click', (e) => {
    if (e.target === rxResultOverlay) closeResultScreen();
  });

  // ---------- 처방 완료 순간, 그 처방을 상징하는 큰 이미지가 떴다가 페이드아웃 ----------
  function showRxImageFade(p, onDone) {
    if (localStorage.getItem('maumjaro:imageFadeOn') === 'off') {
      if (onDone) onDone();
      return;
    }
    rxImageOverlayEmoji.textContent = p.emoji;
    document.body.style.setProperty('--dose-color', p.color || '');
    rxImageOverlay.classList.remove('fade-out');
    rxImageOverlay.classList.add('show');
    setTimeout(() => {
      rxImageOverlay.classList.add('fade-out');
      setTimeout(() => {
        rxImageOverlay.classList.remove('show', 'fade-out');
        if (onDone) onDone();
      }, 2600);
    }, 1400);
  }

  // ---------- 처방전 (공유 슬립) ----------
  function formatSlipDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }
  function formatSentDateTime(ts) {
    const d = new Date(ts);
    const h = d.getHours();
    const ampm = h < 12 ? '오전' : '오후';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${formatSlipDate(ts)} ${ampm} ${h12}:${m}`;
  }
  function getPatientName() {
    const name = (localStorage.getItem('maumjaro:username') || '').trim();
    return name ? `${name}님` : '오늘의 나';
  }
  function showSlipScreen(p, ts) {
    document.body.style.setProperty('--dose-color', p.color || '');
    rxSlipBannerEmoji.textContent = p.emoji || '💊';
    rxSlipBannerDiagnosis.textContent = p.diagnosis;
    rxSlipPatient.textContent = getPatientName();
    rxSlipDiagnosis.textContent = p.diagnosis;
    rxSlipPrescription.textContent = p.prescription;
    rxSlipWarning.textContent = p.warning;
    rxSlipDate.textContent = formatSlipDate(ts || Date.now());

    // 첨부 사진/한마디는 처방마다 새로 시작한다 (이전 처방 내용이 남지 않도록)
    rxSlipPhotoImg.style.backgroundImage = '';
    rxSlipPhotoImg.hidden = true;
    rxSlipPhotoBtn.textContent = '📷 사진 추가';
    rxSlipPhotoInput.value = '';
    rxSlipNoteInput.textContent = '';

    rxSlipOverlay.classList.add('show');
  }
  function closeSlipScreen() {
    rxSlipOverlay.classList.remove('show');
  }
  rxSlipOverlay.addEventListener('click', (e) => {
    if (e.target === rxSlipOverlay) closeSlipScreen();
  });
  rxSlipCloseBtn.addEventListener('click', closeSlipScreen);

  rxSlipPhotoBtn.addEventListener('click', () => rxSlipPhotoInput.click());
  rxSlipPhotoInput.addEventListener('change', () => {
    const file = rxSlipPhotoInput.files && rxSlipPhotoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      rxSlipPhotoImg.style.backgroundImage = `url(${reader.result})`;
      rxSlipPhotoImg.hidden = false;
      rxSlipPhotoBtn.textContent = '📷 사진 변경';
    };
    reader.onerror = () => Core.showToast('사진을 불러오지 못했어요');
    reader.readAsDataURL(file);
  });

  async function saveSlipAsImage() {
    if (typeof window.html2canvas !== 'function') {
      Core.showToast('이미지 저장을 사용할 수 없어요. 화면을 캡처해주세요');
      return;
    }
    rxSlipSaveBtn.disabled = true;
    const originalLabel = rxSlipSaveBtn.textContent;
    rxSlipSaveBtn.textContent = '저장 중...';
    const filename = `맘운자로_처방전_${formatSlipDate(Date.now())}.png`;
    try {
      const canvas = await window.html2canvas(rxSlipContent, { backgroundColor: '#fffdf9', scale: 2 });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('canvas.toBlob returned null');

      // iOS Safari 등은 <a download>가 사실상 동작하지 않으므로,
      // 파일 공유가 가능하면(주로 모바일) 공유 시트를 통해 저장하도록 우선 시도한다.
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '맘운자로 처방전' });
        Core.showToast('공유 시트에서 "저장"을 선택해보세요 🖼️');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      Core.showToast('처방전 이미지를 저장했어요 (안 보이면 화면을 캡처해주세요) 🖼️');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // 사용자가 공유 시트를 취소함
      Core.showToast('이미지 저장에 실패했어요. 화면을 캡처해주세요');
    } finally {
      rxSlipSaveBtn.disabled = false;
      rxSlipSaveBtn.textContent = originalLabel;
    }
  }
  rxSlipSaveBtn.addEventListener('click', saveSlipAsImage);

  // ---------- 친구에게 처방하기 ----------
  function buildShareUrl(prescriptionId) {
    const base = `${location.origin}${location.pathname}?rx=${encodeURIComponent(prescriptionId)}`;
    // 받는 사람 화면에 "OO님이 보냈어요"를 띄우기 위해 보낸 사람 이름을 같이 실어보낸다.
    // 설정에서 이름을 넣지 않았다면 파라미터 자체를 붙이지 않는다(기존 링크 형태 그대로).
    let sender = '';
    try {
      sender = (localStorage.getItem('maumjaro:username') || '').trim().slice(0, 12);
    } catch (e) {
      sender = '';
    }
    return sender ? `${base}&from=${encodeURIComponent(sender)}` : base;
  }

  // ---------- 커스텀 처방전 링크 인코딩/디코딩 (서버 없이 URL에 압축 저장) ----------
  function buildCustomShareUrl(payload) {
    const json = JSON.stringify(payload);
    const encoded = window.LZString
      ? window.LZString.compressToEncodedURIComponent(json)
      : encodeURIComponent(json);
    return `${location.origin}${location.pathname}?custom=${encoded}`;
  }
  function decodeCustomPayload(raw) {
    if (!raw || !window.LZString) return null;
    try {
      const json = window.LZString.decompressFromEncodedURIComponent(raw);
      if (!json) return null;
      const payload = JSON.parse(json);
      if (!payload || typeof payload !== 'object' || !payload.d || !payload.rx) return null;
      return payload;
    } catch (e) {
      return null;
    }
  }

  // ---------- 공유(Web Share API 우선, 실패 시 클립보드 폴백) ----------
  let pickedShareText = '';
  let pickedShareUrl = '';
  let pickedPrescription = null;
  async function shareOrCopy(text, url) {
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // 사용자가 공유 시트를 취소함
        // 그 외 실패는 클립보드 폴백으로 계속 진행
      }
    }
    const fullText = `${text}\n${url}`;
    try {
      await navigator.clipboard.writeText(fullText);
      Core.showToast('링크를 복사했어요 📋');
    } catch (e) {
      Core.showToast('복사에 실패했어요. 직접 선택해서 복사해주세요');
    }
  }
  let pickedVideoFile = null;
  function resetFriendAttachments() {
    rxFriendPhotoImg.style.backgroundImage = '';
    rxFriendPhotoImg.hidden = true;
    rxFriendPhotoBtn.textContent = '📷 사진 추가';
    rxFriendPhotoInput.value = '';
    rxFriendNoteInput.textContent = '';
    rxFriendRecipientInput.value = '';
    pickedVideoFile = null;
    if (rxFriendVideoPreview.src) URL.revokeObjectURL(rxFriendVideoPreview.src);
    rxFriendVideoPreview.src = '';
    rxFriendVideoPreview.hidden = true;
    rxFriendVideoBtn.textContent = '🎥 동영상 추가';
    rxFriendVideoInput.value = '';
  }
  rxFriendPhotoBtn.addEventListener('click', () => rxFriendPhotoInput.click());
  rxFriendPhotoInput.addEventListener('change', () => {
    const file = rxFriendPhotoInput.files && rxFriendPhotoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      rxFriendPhotoImg.style.backgroundImage = `url(${reader.result})`;
      rxFriendPhotoImg.hidden = false;
      rxFriendPhotoBtn.textContent = '📷 사진 변경';
    };
    reader.onerror = () => Core.showToast('사진을 불러오지 못했어요');
    reader.readAsDataURL(file);
  });

  const FRIEND_VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 카톡 등으로 공유하기에 무리 없는 상한선
  rxFriendVideoBtn.addEventListener('click', () => rxFriendVideoInput.click());
  rxFriendVideoInput.addEventListener('change', () => {
    const file = rxFriendVideoInput.files && rxFriendVideoInput.files[0];
    if (!file) return;
    if (file.size > FRIEND_VIDEO_MAX_BYTES) {
      Core.showToast('동영상 용량이 너무 커요 (50MB 이하로 선택해주세요)');
      rxFriendVideoInput.value = '';
      return;
    }
    pickedVideoFile = file;
    if (rxFriendVideoPreview.src) URL.revokeObjectURL(rxFriendVideoPreview.src);
    rxFriendVideoPreview.src = URL.createObjectURL(file);
    rxFriendVideoPreview.hidden = false;
    rxFriendVideoBtn.textContent = '🎥 동영상 변경';
  });

  // 동영상은 캔버스로 합성할 수 없으니, 파일 그대로 공유 시트에 실어 보낸다.
  // 카카오톡 등 파일 공유를 지원하는 앱으로 보내면 링크를 누르지 않아도 바로 재생 미리보기가 뜬다.
  async function shareVideoFile(file, text, url) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: `${text}\n${url}`, title: '맘운자로 처방' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        // 공유 실패 시 아래 다운로드 폴백으로 이어간다.
      }
    }
    const objUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.download = file.name || '맘운자로_친구처방.mp4';
    link.href = objUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      Core.showToast('동영상 저장 + 링크 복사 완료 🎥');
    } catch (e) {
      Core.showToast('동영상을 저장했어요. 링크도 함께 보내주세요 🎥');
    }
  }

  // 사진/동영상/메모 중 하나라도 추가했으면 파일로(이미지는 캡처, 동영상은 원본 그대로) 공유하고,
  // 아무것도 없으면 기존처럼 텍스트+링크로 보낸다.
  async function sendFriendPrescription() {
    if (pickedPrescription) {
      recordFriendSend({
        recipient: rxFriendRecipientInput.value.trim(),
        prescriptionId: pickedPrescription.id,
        category: pickedPrescription.category,
        title: pickedPrescription.title,
        emoji: pickedPrescription.emoji,
        ts: Date.now(),
      });
    }
    const hasPhoto = !rxFriendPhotoImg.hidden;
    const hasNote = rxFriendNoteInput.textContent.trim().length > 0;
    const hasVideo = !!pickedVideoFile;

    if (!hasPhoto && !hasNote && !hasVideo) {
      shareOrCopy(pickedShareText, pickedShareUrl);
      return;
    }
    // 동영상만 있고 사진/메모가 없으면 슬립 이미지를 합성할 필요 없이 영상 파일 자체를 바로 공유한다.
    if (hasVideo && !hasPhoto && !hasNote) {
      rxFriendShareBtn.disabled = true;
      const label = rxFriendShareBtn.textContent;
      rxFriendShareBtn.textContent = '준비 중...';
      try {
        await shareVideoFile(pickedVideoFile, pickedShareText, pickedShareUrl);
      } finally {
        rxFriendShareBtn.disabled = false;
        rxFriendShareBtn.textContent = label;
      }
      return;
    }
    if (typeof window.html2canvas !== 'function') {
      Core.showToast('사진 포함 공유를 사용할 수 없어요. 텍스트로 보낼게요');
      shareOrCopy(pickedShareText, pickedShareUrl);
      return;
    }
    rxFriendShareBtn.disabled = true;
    const originalLabel = rxFriendShareBtn.textContent;
    rxFriendShareBtn.textContent = '준비 중...';
    // 메모를 안 썼으면 안내용 placeholder 문구("친구에게 하고 싶은 말을...")가
    // 그대로 이미지에 박혀버리므로, 캡처 순간에만 잠깐 숨겼다가 되돌린다.
    if (!hasNote) rxFriendNoteInput.style.display = 'none';
    try {
      const canvas = await window.html2canvas(rxFriendCapture, { backgroundColor: '#fffdf9', scale: 2 });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('canvas.toBlob returned null');
      const imgFile = new File([blob], '맘운자로_친구처방.png', { type: 'image/png' });
      const filesToShare = hasVideo ? [imgFile, pickedVideoFile] : [imgFile];
      if (navigator.canShare && navigator.canShare({ files: filesToShare })) {
        await navigator.share({ files: filesToShare, text: `${pickedShareText}\n${pickedShareUrl}`, title: '맘운자로 처방' });
        return;
      }
      if (hasVideo) {
        // 이미지+동영상 동시 공유가 안 되는 환경: 이미지는 캡처 경로로, 동영상은 별도 경로로 보낸다.
        await shareVideoFile(pickedVideoFile, pickedShareText, pickedShareUrl);
      }
      // 파일 공유 미지원 환경: 이미지 다운로드 + 텍스트는 클립보드로 폴백
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = '맘운자로_친구처방.png';
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      try {
        await navigator.clipboard.writeText(`${pickedShareText}\n${pickedShareUrl}`);
        Core.showToast('이미지 저장 + 링크 복사 완료 🖼️');
      } catch (e) {
        Core.showToast('이미지를 저장했어요. 링크도 함께 보내주세요 🖼️');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      Core.showToast('전송 준비에 실패했어요. 텍스트로 보낼게요');
      shareOrCopy(pickedShareText, pickedShareUrl);
    } finally {
      if (!hasNote) rxFriendNoteInput.style.display = '';
      rxFriendShareBtn.disabled = false;
      rxFriendShareBtn.textContent = originalLabel;
    }
  }
  rxFriendShareBtn.addEventListener('click', sendFriendPrescription);

  // 카테고리를 따로 고르게 하지 않고, 지금 보고 있는(또는 방금 받은) 처방 p를 그대로
  // 친구에게 보내기 결과 화면으로 바로 연다. 처방 목록 -> 상세("처방받기") 흐름 안에서
  // "친구에게 보내기" 버튼을 누르는 순간 호출된다.
  function openFriendShareOverlay(p) {
    pickedPrescription = p;
    pickedShareText = p.shareText + FORTUNE_HOOK_LINE;
    pickedShareUrl = buildShareUrl(p.id);
    document.body.style.setProperty('--dose-color', p.color || '');
    rxFriendBannerEmoji.textContent = p.emoji || '💊';
    rxFriendBannerDiagnosis.textContent = p.diagnosis;
    // 이미지 안에는 처방 문구만 넣는다. 유입 훅은 아래 카드 그림 띠가 시각적으로 담당하고,
    // 텍스트 훅은 카톡 메시지 본문(pickedShareText)으로 나가므로 이미지에서 중복시키지 않는다.
    rxFriendShareText.textContent = p.shareText;
    rxFriendLink.textContent = pickedShareUrl;
    resetFriendAttachments();
    rxFriendResult.hidden = false;
    rxFriendOverlay.classList.add('show');
  }
  function closeFriendPicker() {
    rxFriendOverlay.classList.remove('show');
  }
  rxFriendOverlay.addEventListener('click', (e) => {
    if (e.target === rxFriendOverlay) closeFriendPicker();
  });
  rxFriendCloseBtn.addEventListener('click', closeFriendPicker);

  // ---------- 보낸 처방 기록 보기 ----------
  let sentHistoryFilter = 'all'; // all | library | custom
  function renderSentHistoryList() {
    const all = loadFriendSentRecords().slice().sort((a, b) => b.ts - a.ts);
    const list = all.filter((rec) => {
      if (sentHistoryFilter === 'library') return rec.category !== 'custom';
      if (sentHistoryFilter === 'custom') return rec.category === 'custom';
      return true;
    });
    if (!list.length) {
      rxSentHistoryList.innerHTML = '<p class="rx-empty-msg">아직 보낸 처방이 없어요</p>';
      return;
    }
    rxSentHistoryList.innerHTML = list.map((rec) => {
      const isCustom = rec.category === 'custom';
      return `
        <div class="rx-sent-item">
          <span class="rx-sent-emoji">${rec.emoji || '💌'}</span>
          <div class="rx-sent-body">
            <div class="rx-sent-title">${rec.title || '처방'} → <strong>${rec.recipient}</strong>님</div>
            <div class="rx-sent-date">${formatSentDateTime(rec.ts)}</div>
          </div>
          <span class="rx-sent-tag${isCustom ? ' custom' : ''}">${isCustom ? '커스텀' : '라이브러리'}</span>
        </div>`;
    }).join('');
  }
  function openSentHistory() {
    sentHistoryFilter = 'all';
    rxSentHistoryOverlay.querySelectorAll('.rx-sent-filter-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.filter === 'all');
    });
    renderSentHistoryList();
    rxSentHistoryOverlay.classList.add('show');
  }
  function closeSentHistory() {
    rxSentHistoryOverlay.classList.remove('show');
  }
  rxSentHistoryOverlay.addEventListener('click', (e) => {
    if (e.target === rxSentHistoryOverlay) closeSentHistory();
  });
  rxSentHistoryCloseBtn.addEventListener('click', closeSentHistory);
  rxSentHistoryOverlay.querySelectorAll('.rx-sent-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sentHistoryFilter = btn.dataset.filter;
      rxSentHistoryOverlay.querySelectorAll('.rx-sent-filter-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderSentHistoryList();
    });
  });

  // ---------- 오늘의 처방: 날짜 시드 결정론적 선택 ----------
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
  function pickTodaysPrescription() {
    const idx = hashStr(todayKey()) % ALL_PRESCRIPTIONS.length;
    return ALL_PRESCRIPTIONS[idx];
  }

  // ---------- syringe geometry (index.html의 SVG와 동일한 값, app.js와 독립적으로 유지) ----------
  const HEAD_Y_IDLE = 104;
  const HEAD_Y_READY = 246;
  const HEAD_H = 16;
  const LIQUID_TOP = 106;
  const ROD_BOTTOM = 336;

  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeInCubic(t) { return t * t * t; }

  function tween(duration, easingFn, onUpdate, onDone) {
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      onUpdate(easingFn(t));
      if (t < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  function setSyringeByHeadY(headY) {
    const liquidHeight = Math.max(0, headY - LIQUID_TOP);
    plungerHead.setAttribute('y', headY);
    liquid.setAttribute('y', LIQUID_TOP);
    liquid.setAttribute('height', liquidHeight);
    plungerRod.setAttribute('y', headY + HEAD_H);
    plungerRod.setAttribute('height', Math.max(0, ROD_BOTTOM - (headY + HEAD_H)));
  }

  // ---------- 다른 플로우와의 상호 배제 ----------
  function appHasOtherFlowActive() {
    return appEl.classList.contains('state-preparing')
      || appEl.classList.contains('state-ready')
      || appEl.classList.contains('state-injecting');
  }

  let genericState = 'idle'; // idle | preparing | ready | injecting
  let currentGeneric = null;
  let currentOnComplete = null; // 준비/주사 애니메이션이 끝났을 때 호출할 완료 콜백 (기본: completeGenericInjection)
  // null = 어떤 버튼도 "일반 처방 플로우"를 소유하고 있지 않음(감정 플로우 중이거나 완전 유휴).
  // 일반 플로우를 시작시킨 버튼만 이 값을 가지며, 그 버튼의 disabled/텍스트는
  // startGenericPrepare/Inject/complete가 직접 관리한다(관찰자와의 레이스 방지).
  let activeTriggerBtn = null;

  // "activeTriggerBtn이 아닌" 트리거 버튼만 동기화한다.
  function syncOtherTriggerButtons() {
    const blocked = genericState !== 'idle' || appHasOtherFlowActive();
    if (todayRxBtn !== activeTriggerBtn) todayRxBtn.disabled = blocked;
    const detailBtn = document.getElementById('rx-detail-action-btn');
    if (detailBtn && detailBtn !== activeTriggerBtn) detailBtn.disabled = blocked;
  }
  new MutationObserver(syncOtherTriggerButtons).observe(appEl, { attributes: true, attributeFilter: ['class'] });

  // ---------- 일반(비감정) 처방 실행 ----------
  // app.js가 소유한 홈 화면 요소들. 감정 플로우에서 쓰는 것과 같은 팔 그림/상태 문구를
  // 처방·타로·맘운 등 일반 플로우에서도 재사용해, 동작 인식 없이 탭으로도 주사를 놓게 한다.
  const genericArmTarget = document.getElementById('arm-target');
  const genericStatusText = document.getElementById('status-text');
  if (genericArmTarget) {
    // app.js에도 같은 요소의 클릭 리스너가 있지만 그쪽은 자기 state('ready')만 검사하므로
    // 두 리스너는 서로 배타적으로 동작한다(감정 플로우 / 일반 플로우 동시 진행 불가).
    genericArmTarget.addEventListener('click', () => {
      if (genericState === 'ready') startGenericInject();
    });
  }

  function startGenericPrepare(prescription, triggerBtn, onComplete) {
    if (genericState !== 'idle' || appHasOtherFlowActive()) return;
    activeTriggerBtn = triggerBtn || todayRxBtn;
    currentGeneric = prescription;
    currentOnComplete = onComplete || completeGenericInjection;
    genericState = 'preparing';
    actionBtn.disabled = true;
    activeTriggerBtn.disabled = true;
    activeTriggerBtn.textContent = '준비 중...';
    appEl.classList.add('rx-preparing');
    syncOtherTriggerButtons();

    // 처방 카테고리 색으로 주사약/뱃지를 물들인다 (기존 감정 플로우의 dose-tag/--dose-color 재사용)
    document.body.style.setProperty('--dose-color', prescription.color || '');
    liquid.style.fill = prescription.color || '';
    doseTagMg.textContent = prescription.emoji;
    doseTagLabel.textContent = `${prescription.title}`;
    doseCaption.textContent = prescription.diagnosis;
    doseTag.hidden = false;
    doseCaption.hidden = false;
    Core.playPrepareSound(1300);

    tween(1300, easeInOutCubic, (t) => {
      setSyringeByHeadY(HEAD_Y_IDLE + (HEAD_Y_READY - HEAD_Y_IDLE) * t);
    }, () => {
      genericState = 'ready';
      appEl.classList.remove('rx-preparing');
      appEl.classList.add('rx-ready');
      activeTriggerBtn.disabled = false;
      activeTriggerBtn.textContent = '주사 놓기';
      // 준비가 끝나면 홈 화면에 팔 그림(탭 영역)과 안내 문구를 띄운다.
      // 이게 없으면 처방센터/타로/맘운처럼 다른 탭에서 시작한 주사는, 홈 탭으로 옮겨진 뒤
      // 정작 누를 대상이 없어져(트리거 버튼은 숨겨진 탭에 있고 홈 버튼은 비활성) 동작 인식
      // 외에는 주사를 놓을 방법이 없었다.
      if (genericArmTarget) genericArmTarget.hidden = false;
      if (genericStatusText) genericStatusText.textContent = '준비되었어요. 팔을 눌러도 되고, 폰을 콕 찌르듯 움직여도 돼요';
      Core.playReadyChime();
    });
  }

  function startGenericInject() {
    if (genericState !== 'ready') return;
    genericState = 'injecting';
    appEl.classList.remove('rx-ready');
    appEl.classList.add('rx-injecting');
    activeTriggerBtn.disabled = true;
    activeTriggerBtn.textContent = '주사 중...';
    if (genericArmTarget) genericArmTarget.hidden = true;
    if (genericStatusText) genericStatusText.textContent = '마음에 천천히 전달되고 있어요';
    Core.playInjectPress();

    let dropletTriggered = false;
    tween(1100, easeInCubic, (t) => {
      setSyringeByHeadY(HEAD_Y_READY + (HEAD_Y_IDLE - HEAD_Y_READY) * t);
      if (t > 0.75 && !dropletTriggered) {
        dropletTriggered = true;
        droplet.setAttribute('r', 4.5);
        droplet.style.opacity = '1';
      }
    }, () => {
      appEl.classList.remove('rx-injecting');
      setTimeout(() => {
        droplet.setAttribute('r', 0);
        droplet.style.opacity = '0';
      }, 250);
      Core.playHealingChime();
      currentOnComplete();
    });
  }

  function resetGenericFlowState(triggerLabel) {
    genericState = 'idle';
    currentGeneric = null;
    actionBtn.disabled = false;
    // 흐름이 끝나거나 중단되어도 팔 그림과 안내 문구가 남아있지 않게 한다.
    if (genericArmTarget) genericArmTarget.hidden = true;
    Core.refreshSummary(); // 상태 문구를 평상시("오늘 마음 주사를 맞았어요")로 되돌린다
    if (activeTriggerBtn) {
      activeTriggerBtn.disabled = appHasOtherFlowActive();
      activeTriggerBtn.textContent = triggerLabel;
    }
    activeTriggerBtn = null;
    syncOtherTriggerButtons();
  }

  function completeGenericInjection() {
    const p = currentGeneric;
    const now = Date.now();
    recordRx({ prescriptionId: p.id, category: p.category, ts: now });
    // 게임 레이어(game.js)가 출석을 붙일 수 있도록 알린다.
    // app.js가 감정 처방 완료 때 쏘는 'maumjaro:emotion-injected'와 같은 역할이다.
    document.dispatchEvent(new CustomEvent('maumjaro:rx-injected', {
      detail: { prescriptionId: p.id, category: p.category, ts: now },
    }));

    doseTag.hidden = true;
    doseCaption.hidden = true;
    liquid.style.fill = '';

    showRxImageFade(p, () => showResultScreen(p, now));

    resetGenericFlowState('처방받기');
  }

  // ---------- 일반 처방용 모션 제스처 (app.js의 감정 플로우와 독립적인 리스너) ----------
  const GENERIC_MOTION_THRESHOLD = 28;
  const GENERIC_MOTION_COOLDOWN_MS = 1500;
  let lastGenericMotionTs = 0;
  window.addEventListener('devicemotion', (e) => {
    if (localStorage.getItem('maumjaro:motionOn') === 'off') return;
    if (genericState !== 'ready') return;
    const acc = (e.acceleration && e.acceleration.x !== null) ? e.acceleration : e.accelerationIncludingGravity;
    if (!acc || acc.x === null || acc.x === undefined) return;
    const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
    const now = performance.now();
    if (mag > GENERIC_MOTION_THRESHOLD && now - lastGenericMotionTs > GENERIC_MOTION_COOLDOWN_MS) {
      lastGenericMotionTs = now;
      if (navigator.vibrate) navigator.vibrate(40);
      startGenericInject();
    }
  });

  // ---------- 트리거 버튼 공용 배선 (오늘의 카드 / 처방센터 상세에서 공유) ----------
  function switchToHomeTab() {
    const homeTabBtn = document.querySelector('.tab-btn[data-view="home"]');
    if (homeTabBtn) homeTabBtn.click();
  }

  function wireGenericTrigger(btnEl, p) {
    btnEl.onclick = () => {
      // 이 버튼이 이미 자기 자신의 "준비 완료" 상태를 소유하고 있으면
      // 아래의 "다른 처방 진행 중" 가드보다 먼저 주사를 놓는다.
      if (p.category !== 'emotion' && activeTriggerBtn === btnEl && genericState === 'ready') {
        startGenericInject();
        return;
      }
      if (genericState !== 'idle' || appHasOtherFlowActive()) {
        Core.showToast('지금 다른 처방이 진행 중이에요');
        return;
      }
      // 처방센터/랜덤 등 어디서 눌렀든, 주사는 항상 눈에 보이는 홈(주사기) 화면에서 진행한다.
      switchToHomeTab();
      Core.requestMotionPermission();
      if (p.category === 'emotion') {
        Core.launchEmotionFlow(p._legacyKey);
      } else {
        startGenericPrepare(p, btnEl);
      }
    };
  }

  // ---------- 커스텀 처방전 수신(공개) 화면 ----------
  function openCustomReveal(payload) {
    document.body.style.setProperty('--dose-color', '#b779ef');
    rxRevealDiagnosis.textContent = payload.d;
    rxRevealPatient.textContent = payload.p || '누군가';
    rxRevealPrescription.textContent = payload.rx;
    rxRevealWarning.textContent = payload.w || '개인차가 있을 수 있어요';
    rxRevealDoctor.textContent = payload.dr || '맘운자로';
    rxRevealOverlay.classList.add('show');
  }
  function closeCustomReveal() {
    rxRevealOverlay.classList.remove('show');
  }
  rxRevealOverlay.addEventListener('click', (e) => {
    if (e.target === rxRevealOverlay) closeCustomReveal();
  });
  rxRevealCloseBtn.addEventListener('click', closeCustomReveal);
  rxRevealMakeBtn.addEventListener('click', () => {
    closeCustomReveal();
    const rxTabBtn = document.querySelector('.tab-btn[data-view="rx"]');
    if (rxTabBtn) rxTabBtn.click();
    renderCustomForm();
  });

  // ---------- 커스텀 처방전 수신자 플로우: 주사를 놓아야 내용이 공개된다 ----------
  // 받는 사람 쪽엔 감정/카테고리 개념이 없으므로 recordRx는 절대 호출하지 않는다
  // (조회만으로는 기록이 남지 않는다는 기존 ?rx= 딥링크 원칙과 동일).
  function wireCustomIncomingTrigger(payload) {
    const syntheticP = {
      id: 'custom-incoming',
      category: 'custom',
      title: '저격 처방전',
      diagnosis: payload.p ? `${payload.p}님을 위한 처방` : '누군가를 위한 처방',
      emoji: '🎯',
      color: '#b779ef',
    };
    customIncomingEyebrow.textContent = '긴급 처방전 도착';
    customIncomingTitle.textContent = payload.p ? `${payload.p}님을 위한 처방전` : '나를 위한 처방전';
    customIncomingCard.hidden = false;

    function completeCustomReception() {
      doseTag.hidden = true;
      doseCaption.hidden = true;
      liquid.style.fill = '';
      customIncomingCard.hidden = true;
      showRxImageFade(syntheticP, () => openCustomReveal(payload));
      resetGenericFlowState('처방받기');
    }

    customIncomingBtn.onclick = () => {
      if (activeTriggerBtn === customIncomingBtn && genericState === 'ready') {
        startGenericInject();
        return;
      }
      if (genericState !== 'idle' || appHasOtherFlowActive()) {
        Core.showToast('지금 다른 처방이 진행 중이에요');
        return;
      }
      switchToHomeTab();
      Core.requestMotionPermission();
      startGenericPrepare(syntheticP, customIncomingBtn, completeCustomReception);
    };
  }

  // ---------- 외부 모듈(fortune.js 등)이 기존 주사 인터랙션을 재사용하기 위한 공용 배선 ----------
  // wireGenericTrigger/wireCustomIncomingTrigger와 완전히 동일한 준비→주사 로직이며,
  // 사주 계산 엔진 등 다른 기능이 이 UI를 대체하지 않고 그대로 재사용할 수 있도록 노출한다.
  function wireExternalTrigger(btnEl, syntheticPrescription, onComplete) {
    btnEl.onclick = () => {
      if (activeTriggerBtn === btnEl && genericState === 'ready') {
        startGenericInject();
        return;
      }
      if (genericState !== 'idle' || appHasOtherFlowActive()) {
        Core.showToast('지금 다른 처방이 진행 중이에요');
        return;
      }
      switchToHomeTab();
      Core.requestMotionPermission();
      startGenericPrepare(syntheticPrescription, btnEl, onComplete);
    };
  }

  // ---------- 오늘의 처방 카드 렌더 ----------
  function renderTodayCard() {
    const p = pickTodaysPrescription();
    todayRxEmoji.textContent = p.emoji;
    todayRxTitle.textContent = p.title;
    todayRxDiagnosis.textContent = p.diagnosis;
    todayRxCard.hidden = false;
    wireGenericTrigger(todayRxBtn, p);
  }

  renderTodayCard();

  // ---------- 통합 기록(기존 감정 기록 + 새 처방 기록, 일/월/년) ----------
  // app.js의 renderHistory/renderDayView 등은 무변경으로 그대로 두고,
  // 기록 탭이 열릴 때/세그먼트를 바꿀 때 이 렌더러가 #history-content를 덮어써서 통합 화면을 보여준다.
  const historyContentEl = document.getElementById('history-content');
  const DOW_KR = ['일', '월', '화', '수', '목', '금', '토'];
  let unifiedPeriod = 'day';
  let unifiedMonthCursor = uStartOfMonth(new Date());
  let unifiedYearCursor = new Date().getFullYear();
  let unifiedSelectedDayKey = null;

  function uDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function uStartOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function uFormatDayLabel(d) {
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    if (Core.sameDay(d, today)) return `오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일`;
    if (Core.sameDay(d, yest)) return `어제 · ${d.getMonth() + 1}월 ${d.getDate()}일`;
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KR[d.getDay()]})`;
  }
  function uFormatTime(d) {
    let h = d.getHours();
    const ampm = h < 12 ? '오전' : '오후';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${ampm} ${h12}:${m}`;
  }
  function uBuildBarChart(items, opts) {
    const compact = opts && opts.compact;
    const max = Math.max(1, ...items.map((it) => it.count));
    const barsHtml = items.map((it) => {
      const h = it.count === 0 ? 3 : Math.max(6, Math.round((it.count / max) * (compact ? 100 : 140)));
      return `
        <div class="year-bar-col${it.count === 0 ? ' zero' : ''}${it.highlight ? ' highlight' : ''}">
          <span class="year-bar-count">${it.count > 0 ? it.count : ''}</span>
          <div class="year-bar" style="height:${h}px"></div>
          <span class="year-bar-label">${it.label}</span>
        </div>`;
    }).join('');
    return `<div class="year-bars${compact ? ' compact' : ''}">${barsHtml}</div>`;
  }

  function getUnifiedRecords() {
    const rx = loadRxRecords();
    const rxTsSet = new Set(rx.map((r) => r.ts));
    // maumjaro:records엔 있지만 rxRecords엔 없는 것 = 처방 시스템 도입 이전의 예전 감정 기록.
    // 어떤 감정이었는지는 알 수 없으므로 일반 "감정 처방"으로 표시한다.
    const legacy = Core.loadRecords()
      .filter((ts) => !rxTsSet.has(ts))
      .map((ts) => ({ id: `legacy_${ts}`, prescriptionId: null, category: 'emotion', ts }));
    return [...rx, ...legacy];
  }
  function resolveRecordDisplay(rec) {
    const p = rec.prescriptionId ? ALL_PRESCRIPTIONS.find((x) => x.id === rec.prescriptionId) : null;
    if (p) return { emoji: p.emoji, title: p.title };
    if (rec.category === 'emotion') return { emoji: '💉', title: '감정 처방' };
    return { emoji: '💊', title: '처방' };
  }

  function renderUnifiedHistory() {
    const records = getUnifiedRecords();
    if (unifiedPeriod === 'day') renderUnifiedDayView(records);
    else if (unifiedPeriod === 'month') renderUnifiedMonthView(records);
    else renderUnifiedYearView(records);
  }

  function renderUnifiedDayView(records) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last14 = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      last14.push(d);
    }
    const countMap = new Map();
    records.forEach((r) => {
      const k = uDateKey(new Date(r.ts));
      countMap.set(k, (countMap.get(k) || 0) + 1);
    });
    const chartItems = last14.map((d) => ({
      label: String(d.getDate()),
      count: countMap.get(uDateKey(d)) || 0,
      highlight: Core.sameDay(d, today),
    }));
    const chartTotal = chartItems.reduce((a, b) => a + b.count, 0);
    const chartHtml = `
      <div class="chart-section">
        <div class="chart-title">최근 14일 <strong>${chartTotal}</strong>번</div>
        ${uBuildBarChart(chartItems)}
      </div>`;

    if (records.length === 0) {
      historyContentEl.innerHTML = chartHtml + '<p class="empty-msg">아직 기록이 없어요.<br/>첫 처방을 받아보세요.</p>';
      return;
    }
    const groups = new Map();
    records.forEach((r) => {
      const key = uDateKey(new Date(r.ts));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const keys = Array.from(groups.keys()).sort().reverse();
    let html = '';
    keys.forEach((key) => {
      const list = groups.get(key).slice().sort((a, b) => a.ts - b.ts);
      const label = uFormatDayLabel(new Date(list[0].ts));
      const chips = list.map((r) => {
        const { emoji } = resolveRecordDisplay(r);
        return `<span class="time-chip">${emoji} ${uFormatTime(new Date(r.ts))}</span>`;
      }).join('');
      html += `
        <div class="day-group">
          <div class="day-group-head">
            <span class="date">${label}</span>
            <span class="count">${list.length}회</span>
          </div>
          <div class="time-chips">${chips}</div>
        </div>`;
    });
    historyContentEl.innerHTML = chartHtml + html;
  }

  function renderUnifiedMonthView(records) {
    const y = unifiedMonthCursor.getFullYear();
    const m = unifiedMonthCursor.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const countByDate = new Map();
    records.forEach((r) => {
      const d = new Date(r.ts);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const k = uDateKey(d);
        countByDate.set(k, (countByDate.get(k) || 0) + 1);
      }
    });
    const monthTotal = Array.from(countByDate.values()).reduce((a, b) => a + b, 0);

    let dowHtml = DOW_KR.map((d) => `<div class="cal-dow">${d}</div>`).join('');
    let cellsHtml = '';
    for (let i = 0; i < firstDow; i++) cellsHtml += '<div class="cal-cell blank"></div>';
    const today = new Date();
    const chartItems = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(y, m, day);
      const key = uDateKey(cellDate);
      const cnt = countByDate.get(key) || 0;
      const isToday = Core.sameDay(cellDate, today);
      cellsHtml += `<div class="cal-cell${cnt > 0 ? ' has-record' : ''}${isToday ? ' today' : ''}" data-key="${key}">
          <span>${day}</span>
          ${cnt > 0 ? '<span class="badge"></span>' : ''}
        </div>`;
      const showLabel = day === 1 || day === daysInMonth || day % 5 === 0;
      chartItems.push({ label: showLabel ? String(day) : '', count: cnt, highlight: isToday });
    }

    historyContentEl.innerHTML = `
      <div class="period-nav">
        <button id="u-month-prev">‹</button>
        <span class="period-label">${y}년 ${m + 1}월</span>
        <button id="u-month-next">›</button>
      </div>
      <div class="period-total">이번 달 <strong>${monthTotal}</strong>번</div>
      <div class="chart-section">${uBuildBarChart(chartItems, { compact: true })}</div>
      <div class="calendar-grid">${dowHtml}${cellsHtml}</div>
      <div id="u-day-detail-slot"></div>
    `;

    document.getElementById('u-month-prev').addEventListener('click', () => {
      unifiedMonthCursor = new Date(y, m - 1, 1);
      renderUnifiedMonthView(getUnifiedRecords());
    });
    document.getElementById('u-month-next').addEventListener('click', () => {
      unifiedMonthCursor = new Date(y, m + 1, 1);
      renderUnifiedMonthView(getUnifiedRecords());
    });

    historyContentEl.querySelectorAll('.cal-cell.has-record').forEach((cell) => {
      cell.addEventListener('click', () => {
        unifiedSelectedDayKey = cell.dataset.key;
        renderUnifiedDayDetail(records, unifiedSelectedDayKey);
      });
    });

    if (unifiedSelectedDayKey && countByDate.has(unifiedSelectedDayKey)) {
      renderUnifiedDayDetail(records, unifiedSelectedDayKey);
    }
  }

  function renderUnifiedDayDetail(records, key) {
    const slot = document.getElementById('u-day-detail-slot');
    if (!slot) return;
    const list = records.filter((r) => uDateKey(new Date(r.ts)) === key).sort((a, b) => a.ts - b.ts);
    if (list.length === 0) { slot.innerHTML = ''; return; }
    const label = uFormatDayLabel(new Date(list[0].ts));
    const chips = list.map((r) => {
      const { emoji } = resolveRecordDisplay(r);
      return `<span class="time-chip">${emoji} ${uFormatTime(new Date(r.ts))}</span>`;
    }).join('');
    slot.innerHTML = `
      <div class="day-detail">
        <div class="date">${label} · ${list.length}회</div>
        <div class="time-chips">${chips}</div>
      </div>`;
  }

  function renderUnifiedYearView(records) {
    const y = unifiedYearCursor;
    const counts = new Array(12).fill(0);
    records.forEach((r) => {
      const d = new Date(r.ts);
      if (d.getFullYear() === y) counts[d.getMonth()]++;
    });
    const total = counts.reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...counts);

    let barsHtml = '';
    for (let i = 0; i < 12; i++) {
      const c = counts[i];
      const h = c === 0 ? 3 : Math.max(6, Math.round((c / max) * 140));
      barsHtml += `
        <div class="year-bar-col${c === 0 ? ' zero' : ''}">
          <span class="year-bar-count">${c > 0 ? c : ''}</span>
          <div class="year-bar" style="height:${h}px"></div>
          <span class="year-bar-label">${i + 1}월</span>
        </div>`;
    }

    historyContentEl.innerHTML = `
      <div class="period-nav">
        <button id="u-year-prev">‹</button>
        <span class="period-label">${y}년</span>
        <button id="u-year-next">›</button>
      </div>
      <div class="period-total">올해 총 <strong>${total}</strong>번</div>
      <div class="year-bars">${barsHtml}</div>
    `;

    document.getElementById('u-year-prev').addEventListener('click', () => {
      unifiedYearCursor = y - 1;
      renderUnifiedYearView(getUnifiedRecords());
    });
    document.getElementById('u-year-next').addEventListener('click', () => {
      unifiedYearCursor = y + 1;
      renderUnifiedYearView(getUnifiedRecords());
    });
  }

  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      unifiedPeriod = btn.dataset.period;
      renderUnifiedHistory();
    });
  });

  // ---------- 처방센터 ----------
  const viewRx = document.getElementById('view-rx');
  const rxCenterContent = document.getElementById('rx-center-content');
  const RARITY_LABEL = { common: '흔함', rare: '레어', epic: '에픽' };

  function rxCategoryCount(catId) {
    return ALL_PRESCRIPTIONS.filter((p) => p.category === catId).length;
  }

  function renderRxGrid() {
    const tiles = RX_CATEGORIES.map((c) => {
      if (c.id === 'random') {
        return `
          <div class="rx-category-tile" data-cat="random">
            <span class="rx-category-emoji">${c.emoji}</span>
            <span class="rx-category-label">${c.label}</span>
            <span class="rx-category-count">탭해서 뽑기</span>
          </div>`;
      }
      const count = rxCategoryCount(c.id);
      return `
        <div class="rx-category-tile${count === 0 ? ' empty' : ''}" data-cat="${c.id}">
          <span class="rx-category-emoji">${c.emoji}</span>
          <span class="rx-category-label">${c.label}</span>
          <span class="rx-category-count">${count > 0 ? `${count}개` : '곧 추가돼요'}</span>
        </div>`;
    }).join('');
    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <span class="rx-nav-title">🏥 처방센터</span>
        <button class="rx-friend-quick-btn" id="rx-sent-history-btn" type="button">📋 보낸 기록</button>
      </div>
      <button class="rx-custom-cta" id="rx-custom-cta-btn" type="button">
        <span class="rx-custom-cta-emoji">✍️</span>
        <span class="rx-custom-cta-text">
          <span class="rx-custom-cta-title">커스텀 진료실</span>
          <span class="rx-custom-cta-sub">친구를 저격하는 나만의 처방전 만들기</span>
        </span>
        <span class="rx-custom-cta-arrow">›</span>
      </button>
      <div class="rx-category-grid">${tiles}</div>`;

    document.getElementById('rx-sent-history-btn').addEventListener('click', openSentHistory);
    document.getElementById('rx-custom-cta-btn').addEventListener('click', renderCustomForm);

    rxCenterContent.querySelectorAll('.rx-category-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const catId = tile.dataset.cat;
        if (catId === 'random') {
          runRandomPrescription();
          return;
        }
        if (rxCategoryCount(catId) === 0) {
          Core.showToast('이 카테고리는 곧 추가돼요 🚧');
          return;
        }
        renderRxList(catId);
      });
    });
  }

  // ---------- 커스텀 진료실 (UGC 처방전 만들기, Phase 1: 폼 + 미리보기만) ----------
  const CUSTOM_FIELD_LIMITS = { p: 10, d: 15, rx: 30, w: 30, dr: 10 };
  function renderCustomForm() {
    const myName = (localStorage.getItem('maumjaro:username') || '').trim();
    const templateBtns = CUSTOM_TEMPLATES.map((t, i) => `
      <button class="rx-custom-template-btn" type="button" data-idx="${i}">${t.label}</button>`).join('');

    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="rx-custom-back" type="button">‹</button>
        <span class="rx-nav-title">✍️ 커스텀 진료실</span>
      </div>

      <p class="rx-custom-hint">💛 상대방이 속상해할 만한 내용은 피해주세요. 재미로 웃고 넘길 수 있는 선까지만!</p>

      <div class="rx-custom-templates">${templateBtns}</div>

      <div class="rx-custom-field">
        <label class="rx-slip-key" for="rx-custom-p">환자명</label>
        <input type="text" id="rx-custom-p" class="rx-custom-input" maxlength="${CUSTOM_FIELD_LIMITS.p}" placeholder="예: 민지" />
        <span class="rx-custom-counter" id="rx-custom-p-count">0/${CUSTOM_FIELD_LIMITS.p}</span>
      </div>
      <div class="rx-custom-field">
        <label class="rx-slip-key" for="rx-custom-d">진단명</label>
        <input type="text" id="rx-custom-d" class="rx-custom-input" maxlength="${CUSTOM_FIELD_LIMITS.d}" placeholder="예: 야식 참을성 결핍증" />
        <span class="rx-custom-counter" id="rx-custom-d-count">0/${CUSTOM_FIELD_LIMITS.d}</span>
      </div>
      <div class="rx-custom-field">
        <label class="rx-slip-key" for="rx-custom-rx">처방 내용</label>
        <input type="text" id="rx-custom-rx" class="rx-custom-input" maxlength="${CUSTOM_FIELD_LIMITS.rx}" placeholder="예: 오늘 저녁은 굶는 셈 치기" />
        <span class="rx-custom-counter" id="rx-custom-rx-count">0/${CUSTOM_FIELD_LIMITS.rx}</span>
      </div>
      <div class="rx-custom-field">
        <label class="rx-slip-key" for="rx-custom-w">주의사항</label>
        <input type="text" id="rx-custom-w" class="rx-custom-input" maxlength="${CUSTOM_FIELD_LIMITS.w}" placeholder="예: 내일 더 배고파질 수 있음" />
        <span class="rx-custom-counter" id="rx-custom-w-count">0/${CUSTOM_FIELD_LIMITS.w}</span>
      </div>
      <div class="rx-custom-field">
        <label class="rx-slip-key" for="rx-custom-dr">처방의</label>
        <input type="text" id="rx-custom-dr" class="rx-custom-input" maxlength="${CUSTOM_FIELD_LIMITS.dr}" placeholder="예: 맘운자로" value="${myName}" />
        <span class="rx-custom-counter" id="rx-custom-dr-count">${myName.length}/${CUSTOM_FIELD_LIMITS.dr}</span>
      </div>

      <div class="rx-custom-preview" id="rx-custom-preview">
        <div class="rx-slip-header"><span class="rx-slip-hospital">🏥 맘운자로 처방전</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key">환자명</span><span class="rx-slip-value" id="rx-custom-preview-p">-</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key">진단명</span><span class="rx-slip-value" id="rx-custom-preview-d">-</span></div>
        <p class="rx-slip-text" id="rx-custom-preview-rx">-</p>
        <p class="rx-slip-text" id="rx-custom-preview-w">-</p>
        <div class="rx-slip-row"><span class="rx-slip-key">처방의</span><span class="rx-slip-value" id="rx-custom-preview-dr">-</span></div>
      </div>

      <button class="action-btn rx-custom-submit-btn" id="rx-custom-submit-btn" type="button">💉 처방전 완성하고 공유하기</button>
    `;

    document.getElementById('rx-custom-back').addEventListener('click', renderRxGrid);

    const fields = ['p', 'd', 'rx', 'w', 'dr'];
    fields.forEach((key) => {
      const input = document.getElementById(`rx-custom-${key}`);
      const counter = document.getElementById(`rx-custom-${key}-count`);
      const previewEl = document.getElementById(`rx-custom-preview-${key}`);
      const updatePreview = () => {
        const val = input.value.trim();
        counter.textContent = `${input.value.length}/${CUSTOM_FIELD_LIMITS[key]}`;
        previewEl.textContent = val || '-';
      };
      input.addEventListener('input', updatePreview);
      updatePreview();
    });

    rxCenterContent.querySelectorAll('.rx-custom-template-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = CUSTOM_TEMPLATES[Number(btn.dataset.idx)];
        if (!t) return;
        ['d', 'rx', 'w'].forEach((key) => {
          const input = document.getElementById(`rx-custom-${key}`);
          input.value = t[key];
          input.dispatchEvent(new Event('input'));
        });
      });
    });

    document.getElementById('rx-custom-submit-btn').addEventListener('click', () => {
      const p = document.getElementById('rx-custom-p').value.trim();
      const d = document.getElementById('rx-custom-d').value.trim();
      const rx = document.getElementById('rx-custom-rx').value.trim();
      const w = document.getElementById('rx-custom-w').value.trim();
      const dr = document.getElementById('rx-custom-dr').value.trim();
      if (!p || !d || !rx) {
        Core.showToast('환자명·진단명·처방 내용은 꼭 입력해주세요');
        return;
      }
      const payload = { p, d, rx, w, dr: dr || '맘운자로', ts: Date.now() };
      const url = buildCustomShareUrl(payload);
      recordFriendSend({
        recipient: p,
        prescriptionId: null,
        category: 'custom',
        title: d,
        emoji: '🎯',
        ts: payload.ts,
      });
      renderCustomShareResult(payload, url);
    });
  }

  // ---------- 인스타 스토리용 9:16 이미지 저장 (화면 밖 전용 컨테이너를 캡처) ----------
  async function saveCustomStoryImage(payload, btnEl) {
    if (typeof window.html2canvas !== 'function') {
      Core.showToast('이미지 저장을 사용할 수 없어요. 화면을 캡처해주세요');
      return;
    }
    rxStoryDiagnosis.textContent = payload.d;
    rxStoryPatient.textContent = payload.p;
    rxStoryPrescription.textContent = payload.rx;
    rxStoryWarning.textContent = payload.w || '개인차가 있을 수 있어요';
    rxStoryDoctor.textContent = payload.dr;

    const originalLabel = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = '준비 중...';
    const filename = `맘운자로_저격처방전_${formatSlipDate(Date.now())}.png`;
    try {
      const canvas = await window.html2canvas(rxStoryCapture, { width: 540, height: 960, scale: 2, backgroundColor: '#fffdf9' });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('canvas.toBlob returned null');
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '맘운자로 저격 처방전' });
        Core.showToast('공유 시트에서 인스타 스토리에 올려보세요 📸');
        return;
      }
      const objUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = objUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
      Core.showToast('이미지를 저장했어요. 스토리에 올려보세요 📸');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      Core.showToast('이미지 저장에 실패했어요. 화면을 캡처해주세요');
    } finally {
      btnEl.disabled = false;
      btnEl.textContent = originalLabel;
    }
  }

  function renderCustomShareResult(payload, url) {
    const shareText = `🚨 ${payload.p}님을 위한 맞춤 처방전이 도착했어요! 지금 확인해보세요` + FORTUNE_HOOK_LINE;
    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="rx-custom-share-back" type="button">‹</button>
        <span class="rx-nav-title">✅ 처방전 완성!</span>
      </div>

      <div class="rx-custom-preview">
        <div class="rx-slip-header"><span class="rx-slip-hospital">🏥 맘운자로 처방전</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key">환자명</span><span class="rx-slip-value">${payload.p}</span></div>
        <div class="rx-slip-row"><span class="rx-slip-key">진단명</span><span class="rx-slip-value">${payload.d}</span></div>
        <p class="rx-slip-text">${payload.rx}</p>
        <p class="rx-slip-text">${payload.w || ''}</p>
        <div class="rx-slip-row"><span class="rx-slip-key">처방의</span><span class="rx-slip-value">${payload.dr}</span></div>
      </div>

      <p class="rx-friend-link">${url}</p>
      <button class="action-btn rx-custom-submit-btn" id="rx-custom-share-send-btn" type="button">📤 친구에게 보내기</button>
      <button class="rx-cta-btn" id="rx-custom-share-story-btn" type="button">📸 스토리 이미지로 저장</button>
      <button class="rx-cta-btn" id="rx-custom-share-copy-btn" type="button">🔗 링크만 복사하기</button>
    `;

    document.getElementById('rx-custom-share-back').addEventListener('click', renderRxGrid);
    document.getElementById('rx-custom-share-send-btn').addEventListener('click', () => shareOrCopy(shareText, url));
    document.getElementById('rx-custom-share-story-btn').addEventListener('click', (e) => {
      saveCustomStoryImage(payload, e.currentTarget);
    });
    document.getElementById('rx-custom-share-copy-btn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        Core.showToast('링크를 복사했어요 📋');
      } catch (e) {
        Core.showToast('복사에 실패했어요. 직접 선택해서 복사해주세요');
      }
    });
  }

  function renderRxList(catId) {
    const meta = getCategoryMeta(catId);
    const items = ALL_PRESCRIPTIONS.filter((p) => p.category === catId);
    const cards = items.map((p) => `
      <div class="rx-list-card" data-id="${p.id}">
        <span class="rx-list-emoji">${p.emoji}</span>
        <div class="rx-list-body">
          <div class="rx-list-title-row">
            <span class="rx-list-title">${p.title}</span>
            <span class="rx-rarity-badge rx-rarity-${p.rarity}">${RARITY_LABEL[p.rarity] || p.rarity}</span>
          </div>
          <div class="rx-list-desc">${p.diagnosis}</div>
        </div>
      </div>`).join('');
    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="rx-list-back" type="button">‹</button>
        <span class="rx-nav-title">${meta ? `${meta.emoji} ${meta.label}` : '처방 목록'}</span>
      </div>
      ${cards || '<p class="rx-empty-msg">아직 처방이 없어요</p>'}`;

    document.getElementById('rx-list-back').addEventListener('click', renderRxGrid);
    rxCenterContent.querySelectorAll('.rx-list-card').forEach((card) => {
      card.addEventListener('click', () => renderRxDetail(card.dataset.id, catId));
    });
  }

  function renderRxDetail(prescriptionId, fromCatId, opts) {
    const p = ALL_PRESCRIPTIONS.find((x) => x.id === prescriptionId);
    if (!p) { renderRxGrid(); return; }
    const fromRandom = !!(opts && opts.fromRandom);
    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="rx-detail-back" type="button">‹</button>
        <span class="rx-nav-title">${p.title}</span>
      </div>
      <div class="rx-detail-card">
        <div class="rx-detail-emoji">${p.emoji}</div>
        <div class="rx-detail-title">${p.title}</div>
        <div class="rx-detail-diagnosis">${p.diagnosis}</div>
        <p class="rx-detail-symptom">${p.symptom}</p>
        <button class="action-btn rx-detail-action-btn" id="rx-detail-action-btn" type="button">처방받기</button>
        <button class="rx-friend-quick-btn" id="rx-detail-friend-btn" type="button" style="width:100%;margin-top:10px;">💌 친구에게 보내기</button>
      </div>`;

    document.getElementById('rx-detail-back').addEventListener('click', () => {
      if (fromRandom) renderRxGrid();
      else renderRxList(fromCatId);
    });
    const detailBtn = document.getElementById('rx-detail-action-btn');
    wireGenericTrigger(detailBtn, p);
    syncOtherTriggerButtons();
    document.getElementById('rx-detail-friend-btn').addEventListener('click', () => openFriendShareOverlay(p));
  }

  // ---------- 랜덤 처방 (슬롯머신) ----------
  function renderRxRandomSpin() {
    rxCenterContent.innerHTML = `
      <div class="rx-nav-header">
        <button class="rx-back-btn" id="rx-random-back" type="button">‹</button>
        <span class="rx-nav-title">🎰 오늘의 랜덤 처방</span>
      </div>
      <div class="rx-random-spin">
        <div class="rx-random-spin-emoji">🎲</div>
        <p class="rx-random-spin-text">오늘 당신에게 필요한 것은...</p>
      </div>`;
    document.getElementById('rx-random-back').addEventListener('click', renderRxGrid);
  }

  let lastRandomAttemptTs = 0;
  function runRandomPrescription() {
    const now = performance.now();
    if (now - lastRandomAttemptTs < 1500) return; // 연타 방지
    lastRandomAttemptTs = now;
    if (!ALL_PRESCRIPTIONS.length) {
      Core.showToast('처방 데이터를 불러오지 못했어요');
      return;
    }

    const rxTabBtn = document.querySelector('.tab-btn[data-view="rx"]');
    if (rxTabBtn) rxTabBtn.click();
    renderRxRandomSpin();

    setTimeout(() => {
      const idx = Math.floor(Math.random() * ALL_PRESCRIPTIONS.length);
      const p = ALL_PRESCRIPTIONS[idx];
      if (!p) return;
      renderRxDetail(p.id, p.category, { fromRandom: true });
    }, 1100);
  }

  // ---------- 탭 전환 시 처방센터 뷰 노출 (app.js의 기존 탭 리스너는 무변경, 별도 리스너 추가) ----------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      viewRx.hidden = view !== 'rx';
      if (view === 'rx') renderRxGrid();
      if (view === 'history') renderUnifiedHistory();
    });
  });

  // ---------- 공유 딥링크 진입 처리 (?rx=<id>&from=<보낸사람>) ----------
  // 카톡 링크 미리보기(og:title/og:description)가 "누군가 당신을 위한 처방전을 보냈습니다 /
  // 주사를 놓아야 확인할 수 있습니다"라고 약속하므로, 받는 사람 경험도 그 약속과 일치시킨다.
  // 커스텀 처방전(?custom=)과 완전히 같은 방식이며, 기존 주사 인터랙션을 그대로 재사용한다.
  // 조회만으로는 기록을 남기지 않는다는 기존 원칙은 유지한다(recordRx 호출 없음).
  function wireSharedRxIncoming(shared, senderName) {
    const syntheticP = {
      id: 'shared-incoming',
      category: shared.category,
      title: shared.title,
      diagnosis: senderName ? `${senderName}님이 보낸 처방` : '누군가 보낸 처방',
      emoji: shared.emoji,
      color: shared.color || '',
    };
    customIncomingEyebrow.textContent = '💌 친구가 보낸 처방';
    customIncomingTitle.textContent = senderName ? `${senderName}님이 보냈어요` : '나를 위한 처방전';
    customIncomingCard.hidden = false;

    wireExternalTrigger(customIncomingBtn, syntheticP, () => {
      doseTag.hidden = true;
      doseCaption.hidden = true;
      liquid.style.fill = '';
      customIncomingCard.hidden = true;
      // 받는 사람에게도 평소와 같은 결과 화면을 보여준다. 이 화면의
      // "💌 친구에게 처방하기" 버튼을 통해 바이럴 루프가 그대로 이어진다.
      showRxImageFade(shared, () => showResultScreen(shared));
      resetGenericFlowState('처방받기');
    });
  }

  try {
    const params = new URLSearchParams(location.search);
    const sharedId = params.get('rx');
    // ?custom= 링크가 우선이다 — 두 수신 카드가 같은 DOM을 쓰므로 동시에 띄우지 않는다.
    if (sharedId && !params.get('custom')) {
      const shared = ALL_PRESCRIPTIONS.find((p) => p.id === sharedId);
      if (shared) {
        switchToHomeTab();
        wireSharedRxIncoming(shared, (params.get('from') || '').trim().slice(0, 12));
      }
    }
  } catch (e) {
    // 잘못된 URL 형식이어도 앱은 정상적으로 계속 동작해야 한다.
  }

  // ---------- 커스텀 처방전 딥링크 진입 처리 (?custom=<LZString>) ----------
  // 손상되었거나 LZString 로딩에 실패한 링크는 조용히 무시하고 평소처럼 홈이 보인다.
  try {
    const customRaw = new URLSearchParams(location.search).get('custom');
    if (customRaw) {
      const payload = decodeCustomPayload(customRaw);
      if (payload) {
        switchToHomeTab();
        wireCustomIncomingTrigger(payload);
      }
    }
  } catch (e) {
    // 손상된 링크여도 앱은 정상적으로 계속 동작해야 한다.
  }

  // ---------- 설정 확장: 동작 센서 on/off, 완료 효과 on/off, 기록 초기화 ----------
  const motionToggleBtn = document.getElementById('motion-toggle');
  const fadeToggleBtn = document.getElementById('fade-toggle');
  const settingsResetBtn = document.getElementById('settings-reset-btn');

  let motionOn = localStorage.getItem('maumjaro:motionOn') !== 'off';
  let imageFadeOn = localStorage.getItem('maumjaro:imageFadeOn') !== 'off';

  function updateMotionToggleUI() {
    motionToggleBtn.textContent = motionOn ? '📳 켜짐' : '📴 꺼짐';
    motionToggleBtn.setAttribute('aria-pressed', String(motionOn));
  }
  function updateFadeToggleUI() {
    fadeToggleBtn.textContent = imageFadeOn ? '✨ 켜짐' : '⭕ 꺼짐';
    fadeToggleBtn.setAttribute('aria-pressed', String(imageFadeOn));
  }
  updateMotionToggleUI();
  updateFadeToggleUI();

  motionToggleBtn.addEventListener('click', () => {
    motionOn = !motionOn;
    localStorage.setItem('maumjaro:motionOn', motionOn ? 'on' : 'off');
    updateMotionToggleUI();
  });
  fadeToggleBtn.addEventListener('click', () => {
    imageFadeOn = !imageFadeOn;
    localStorage.setItem('maumjaro:imageFadeOn', imageFadeOn ? 'on' : 'off');
    updateFadeToggleUI();
  });

  settingsResetBtn.addEventListener('click', () => {
    const ok = window.confirm('정말 모든 기록을 초기화할까요? 감정·처방·보낸 기록이 전부 사라지고 되돌릴 수 없어요.');
    if (!ok) return;
    localStorage.removeItem('maumjaro:records');
    localStorage.removeItem(RX_LS_KEY);
    localStorage.removeItem(FRIEND_SENT_LS_KEY);
    localStorage.removeItem(RX_SCHEMA_KEY);
    localStorage.removeItem('maumjaro:maumunLog'); // 4.0-E 맘운 기록 — 사주 프로필(설정성)과 달리 "기록"이라 함께 초기화
    Core.refreshSummary();
    renderUnifiedHistory();
    Core.showToast('모든 기록을 초기화했어요 🗑️');
  });

  // ---------- 외부 모듈 export (fortune.js가 기존 주사 인터랙션을 재사용하기 위함, app.js의 Core 패턴과 동일) ----------
  window.MaumjaroRx = {
    wireExternalTrigger,
    showRxImageFade,
    shareOrCopy,
    // wireExternalTrigger에 직접 onComplete를 넘긴 흐름(맘운·타로 등)은 기본 완료 처리를
    // 타지 않으므로, 자기 후처리를 끝낸 뒤 이걸 호출해 주사 상태를 idle로 되돌려야 한다.
    // 호출하지 않으면 genericState가 'injecting'에 머물러 이후 모든 주사가 막힌다.
    resetGenericFlowState,
    goToRxCategory(catId) {
      const rxTabBtn = document.querySelector('.tab-btn[data-view="rx"]');
      if (rxTabBtn) rxTabBtn.click();
      if (catId === 'random') runRandomPrescription();
      else renderRxList(catId);
    },
  };
})();
