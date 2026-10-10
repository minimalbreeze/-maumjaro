/* 맞춤 명당 추천 — 데이터 기반 단순 가중합(지시서 19번).
   AI를 쓰지 않는다. 나중에 AI로 바꾸더라도 이 모듈만 교체하면 되도록 분리해 둔다.

   점수 규약: 모든 점수는 5점 만점이고 "높을수록 좋다".
   sunScore 5 = 햇빛 영향이 적다, weatherScore 5 = 비바람 영향이 적다. */
(function () {
  const PREFS = [
    { id: 'focus',  label: '경기 집중', emoji: '⚾', weights: { gameScore: 3, viewScore: 3 } },
    { id: 'cheer',  label: '응원',     emoji: '🔥', weights: { cheerScore: 4, gameScore: 1 } },
    { id: 'family', label: '가족',     emoji: '👨‍👩‍👧', weights: { facilityScore: 3, sunScore: 2, valueScore: 1 } },
    { id: 'couple', label: '커플',     emoji: '💑', weights: { viewScore: 2, photoScore: 2, facilityScore: 1 } },
    { id: 'photo',  label: '사진',     emoji: '📸', weights: { photoScore: 4, viewScore: 2 } },
    { id: 'value',  label: '가성비',   emoji: '💰', weights: { valueScore: 4, viewScore: 1 } }
  ];

  function weightsFor(prefIds) {
    const total = {};
    (prefIds || []).forEach((id) => {
      const p = PREFS.find((x) => x.id === id);
      if (!p) return;
      Object.keys(p.weights).forEach((k) => { total[k] = (total[k] || 0) + p.weights[k]; });
    });
    return total;
  }

  /* 점수가 하나도 없는 구역은 추천 대상에서 뺀다 —
     비어 있는 데이터를 0점으로 세어 "비추천"처럼 보이게 하면 안 된다. */
  function scoreSection(section, weights) {
    let sum = 0, wsum = 0, used = 0;
    Object.keys(weights).forEach((k) => {
      const v = section[k];
      if (typeof v !== 'number') return;
      sum += v * weights[k];
      wsum += weights[k];
      used += 1;
    });
    if (!used || !wsum) return null;
    return { value: sum / wsum, coverage: used / Object.keys(weights).length };
  }

  function rank(sections, prefIds, limit) {
    const weights = weightsFor(prefIds);
    if (!Object.keys(weights).length) return [];
    const scored = (sections || [])
      .map((s) => {
        const r = scoreSection(s, weights);
        return r ? { section: s, score: Math.round(r.value * 20), coverage: r.coverage } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit == null ? 3 : limit);
  }

  window.KboRecommend = { PREFS, rank, weightsFor };
})();
