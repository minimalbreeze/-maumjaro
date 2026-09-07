// AI 프롬프트에 붙일 "사용자 맥락" 요약.
//
// 왜 별도 파일인가
//   app.js / prescriptions.js는 무수정 원칙이고, 이 요약은 fortune.js(AI 맘운),
//   heal-ai.js(주사 직후 한 줄), rx-ai.js(처방 해설) 셋이 똑같이 쓴다.
//   한 군데 두고 셋이 불러 쓴다.
//
// 무엇을 내보내고 무엇을 안 내보내는가 — 이 파일의 존재 이유다
//   보낸다:    "비슷한 마음이 반복되고 있다", "오랜만에 왔다", 연속 일수
//   안 보낸다: 어떤 감정을 골랐는지, 각 감정을 몇 번 골랐는지, 언제 골랐는지
//
//   감정 이력은 민감한 정보다. 외부 API(DeepSeek)로 원본을 넘기지 않고,
//   답변 톤을 정하는 데 필요한 최소한의 신호만 문장으로 바꿔 보낸다.
//   여기에 감정 이름이나 횟수를 추가하고 싶어지면, 그건 사용자 데이터를
//   외부로 더 내보내는 결정이므로 반드시 먼저 상의할 것.
//
// 읽기 전용이다. localStorage에 아무것도 쓰지 않는다.
(() => {
  'use strict';

  const RX_LS_KEY = 'maumjaro:rxRecords';
  const DAY_MS = 86400000;

  // 최근 며칠을 "요즘"으로 볼 것인가. 7일이면 한 주 리듬이 한 번 돈다.
  const WINDOW_DAYS = 7;
  // 같은 처방이 이만큼 나오면 "반복"으로 본다. 2번은 우연일 수 있다.
  const REPEAT_MIN = 3;
  // 이만큼 비어 있다가 오면 "오랜만"으로 본다.
  const AWAY_DAYS = 7;
  // 연속 일수는 이 이상일 때만 말한다. 2일 연속은 굳이 언급할 거리가 아니다.
  const STREAK_MIN = 3;

  function loadRxRecords() {
    try {
      const arr = JSON.parse(localStorage.getItem(RX_LS_KEY) || '[]');
      return Array.isArray(arr) ? arr.filter((r) => r && typeof r.ts === 'number') : [];
    } catch (e) {
      return [];
    }
  }

  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // 오늘(또는 어제)부터 거꾸로 며칠이 끊기지 않고 이어지는가.
  // 어제까지만 있어도 연속으로 쳐준다 — 오늘 아직 안 놓았을 뿐이므로.
  function streakDays(records) {
    if (!records.length) return 0;
    const days = new Set(records.map((r) => dayKey(r.ts)));
    const today = new Date();
    let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!days.has(dayKey(cursor.getTime()))) {
      cursor = new Date(cursor.getTime() - DAY_MS);
      if (!days.has(dayKey(cursor.getTime()))) return 0;
    }
    let n = 0;
    while (days.has(dayKey(cursor.getTime()))) {
      n += 1;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
    return n;
  }

  // 프롬프트에 그대로 붙일 한국어 문장들. 최대 2줄만 돌려준다 —
  // 맥락이 길어지면 정작 질문과 감정이 묻힌다.
  function contextLines() {
    const records = loadRxRecords();
    if (!records.length) return ['이 앱을 오늘 처음 쓰는 사람입니다'];

    const now = Date.now();
    const lines = [];

    // 1) 요즘 같은 처방이 반복되는가 (어떤 처방인지는 보내지 않는다)
    const recent = records.filter((r) => now - r.ts <= WINDOW_DAYS * DAY_MS);
    const byId = {};
    recent.forEach((r) => { byId[r.prescriptionId] = (byId[r.prescriptionId] || 0) + 1; });
    const topCount = Object.keys(byId).reduce((m, k) => Math.max(m, byId[k]), 0);
    if (topCount >= REPEAT_MIN) {
      lines.push('최근 일주일 사이 비슷한 마음이 여러 번 반복되고 있습니다');
    }

    // 2) 오랜만에 돌아왔는가 (오늘 기록은 빼고 본다)
    const todayKey = dayKey(now);
    const before = records.filter((r) => dayKey(r.ts) !== todayKey);
    if (before.length) {
      const lastTs = Math.max.apply(null, before.map((r) => r.ts));
      if (now - lastTs >= AWAY_DAYS * DAY_MS) {
        lines.push('한동안 뜸했다가 오랜만에 다시 왔습니다');
      }
    }

    // 3) 연속으로 이어오고 있는가 (이건 앱이 이미 화면에 보여주는 값이다)
    if (lines.length < 2) {
      const s = streakDays(records);
      if (s >= STREAK_MIN) lines.push(`${s}일 연속 이어오고 있습니다`);
    }

    return lines.slice(0, 2);
  }

  // 프롬프트에 넣기 좋은 한 덩어리. 붙일 게 없으면 빈 문자열이라
  // `${...}` 로 그냥 이어붙여도 빈 줄이 생기지 않는다.
  function contextBlock() {
    const lines = contextLines();
    return lines.length ? lines.map((l) => `- ${l}`).join('\n') : '';
  }

  window.MaumjaroAiContext = { contextLines, contextBlock, streakDays: () => streakDays(loadRxRecords()) };
})();
