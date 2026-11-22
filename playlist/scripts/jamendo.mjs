// Jamendo 공식 API 에서 음원을 찾는다.
//
// 왜 archive.org 대신 이쪽인가
//   지금까지 쓰던 음악이 전부 Jamendo 곡이었다. archive.org 가 Jamendo
//   앨범의 일부를 미러링해 둔 것을 긁고 있었을 뿐이다. 공식 API 로 가면
//   같은 음악을 훨씬 좋은 조건으로 고를 수 있다.
//
//     정렬      없음(아무거나)        → 인기순(popularity_total)
//     보컬      모름                  → vocalinstrumental=instrumental
//     템포      못 쟀다               → speed=low|medium|high
//     라이선스  받고 나서 확인        → ccnc/ccnd/ccsa=false 로 질의에서 거름
//     길이      메타데이터를 뒤져야   → durationbetween 으로 질의에서 거름
//
//   표본 100곡을 재 보니 79곡이 읽히는 CC BY 였다. archive.org 에서는
//   200곡 중 4곡(2%)이었다. 템포는 특히 중요하다 — BPM 을 직접 재려다
//   실패했는데(가장 느린 곡이 144, 가장 빠른 곡이 65 로 나왔다) Jamendo 는
//   자기 메타데이터를 들고 있다.
//
// ⚠️ 0건이 "없다"는 뜻이 아니다
//   같은 질의가 0건과 12건을 오간다. 에러도 경고도 없이 results 가 빈
//   배열로 온다. 다섯 번 연속 0건을 받고서야 없다고 판단한다.
//
// ⚠️ 약관에서 지킬 것 (devportal.jamendo.com/api_terms_of_use)
//   3.3 — 비상업 용도는 무료. "상업적 이용" 에는 광고 수익이 포함된다.
//         채널에 수익화를 켜는 날 licensing@jamendo.com 에 연락해야 한다.
//   3.3 — 콘텐츠를 캐싱하거나 오프라인 접근을 제공하도록 설계하면 안 된다.
//         그래서 API 는 '찾는 데'만 쓴다. 파일을 받아 보관하는 근거는
//         API 약관이 아니라 그 곡의 CC BY 라이선스다.
//   4.1 — 아티스트를 창작자로, Jamendo 를 제공자로 표기하고, 곡마다
//         Jamendo 의 해당 곡 페이지로 직접 링크해야 한다. credit 문구가
//         그 세 가지를 모두 담는다.

import { execFileSync } from 'node:child_process';

const API = 'https://api.jamendo.com/v3.0/tracks/';

/* ⚠️ tags 는 AND 다. OR 가 아니다.
 *   tags=jazz,piano      → 둘 다 달린 곡 (35곡)
 *   tags=jazz,piano,lounge → 셋 다 달린 곡 (0곡)
 * 그래서 무드는 태그 '묶음의 목록' 으로 적고, 묶음마다 따로 물어서 합친다.
 * 한 묶음 안의 쉼표는 AND 다.
 *
 * 합칠 때는 번갈아 가져온다. 각 질의가 이미 인기순이므로, 묶음마다
 * 1등을 먼저 모으면 품질도 지키고 한 장르로 쏠리지도 않는다. */
export const JAMENDO_MOODS = {
  늦가을: { groups: ['jazz,piano', 'bossanova', 'lounge', 'acoustic,instrumental'], speed: 'medium' },
  /* acoustic: true 는 Jamendo 가 분류해 둔 acousticelectric 을 쓴다.
   * "EDM 사운드가 세다" 던 문제를 질의 단계에서 막는다 — 받아서 재는
   * 밝기 거르개보다 먼저 걸러지니 헛걸음이 준다.
   * 재즈 계열은 켜지 않는다. 일렉 피아노·일렉 기타가 원래 그 음악의 일부라,
   * 켜면 재즈가 아니라 포크만 남는다. */
  서정: { groups: ['piano', 'classical,piano', 'newage', 'acoustic'], speed: 'medium', acoustic: true },
  초겨울: { groups: ['piano', 'classical', 'newage', 'acoustic,calm'], speed: 'medium', acoustic: true },
  재즈: { groups: ['jazz', 'swing', 'bossanova', 'blues'], speed: 'medium' },
  피아노: { groups: ['piano', 'classical,piano'], speed: 'medium', acoustic: true },
  차분: { groups: ['piano', 'newage', 'lounge', 'acoustic'], speed: 'low', acoustic: true },
  연말: { groups: ['lounge', 'jazz', 'bossanova', 'swing', 'soul'], speed: 'medium' },
  // 캐럴은 템포로 거르지 않는다. 종이 들어가면 speed 가 high 로 잡힌다.
  크리스마스: { groups: ['christmas', 'xmas'], speed: '' },

  /* 악기로 뽑는 무드. 장르 태그만 쓰면 jazz 안에서 뭐가 나올지 모르는데,
   * 악기로 뽑으면 집마다 색이 분명해진다. 검색어로도 쓸 수 있다
   * ("색소폰 재즈", "첼로 연주곡"). 2026-11-18 에 재 본 곡 수를 적어 둔다. */
  색소폰: { groups: ['saxophone', 'saxophone,jazz'], speed: 'medium' },          // 48곡
  현악: { groups: ['violin', 'cello', 'strings'], speed: 'medium', acoustic: true }, // 181·91
  하프: { groups: ['harp'], speed: '', acoustic: true },                         // 200곡
  플루트: { groups: ['flute'], speed: 'medium', acoustic: true },                 // 167곡
  기타: { groups: ['guitar,acoustic', 'guitar,classical'], speed: 'medium', acoustic: true },

  /* 노래가 들어가는 무드. 2026-11-21 에 한 편씩만 만들어 보기로 했다.
   *
   * ⚠️ 이 무드는 vocalinstrumental=vocal 로 질의한다. 지금까지 모든 집이
   *    연주곡이었던 것과 정반대다. 작업·공부용 BGM 이 아니라는 뜻이므로
   *    다른 집에 섞어 쓰지 않는다.
   *
   * 2026-11-21 에 재 본 곡 수(CC BY/CC0 · 2~7분 · 인기순):
   *   남성  재즈 101 · 소울 102 · R&B 200+ · 보사노바 33 · 포크 200+
   *   여성  재즈 29 · 소울 31 · R&B 62 · 보사노바 5 · 포크 31
   * 남성 쪽은 서너 집이 나오고 여성 쪽은 한 편이면 바닥난다. 그래서
   * 시리즈가 아니라 한 편씩이다.
   *
   * ⚠️ 보컬 재즈는 스탠더드 천지다. 재 보는 중에 Estate(1960)와
   *    Quiet Nights of Quiet Stars(1960)가 상위에 바로 나왔다. 연주곡보다
   *    COPYRIGHTED_SONGS 가 훨씬 많이 일한다. */
  /* ⚠️ rnb 는 넣지 않는다. 2026-11-21 에 남성보컬로 16곡을 받아 보니
   *    절반이 랩·힙합이었다 — Da Rockwilder Freestyle · Like Im Broke
   *    Feat. King Ski · Tremont (prod. ηoM∩D). Jamendo 에서 R&B 태그는
   *    힙합과 거의 한 덩이다. "감미로운 보컬" 과는 다른 물건이다. */
  남성보컬: { groups: ['soul', 'jazz', 'bossanova', 'singersongwriter'], speed: 'medium', vocal: true, gender: 'male' },
  여성보컬: { groups: ['jazz', 'soul', 'bossanova', 'folk'], speed: 'medium', vocal: true, gender: 'female' },
};

function curlJson(params) {
  const a = ['-sS', '--max-time', '45', '-A', 'minimalbreeze-playlist/1.0', '-G'];
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v != null) a.push('--data-urlencode', `${k}=${v}`);
  }
  a.push(API);
  const out = execFileSync('curl', a, { encoding: 'utf8', maxBuffer: 1 << 26 });
  const d = JSON.parse(out);
  if (d.headers && d.headers.status !== 'success') {
    throw new Error(`Jamendo: ${d.headers.error_message || '알 수 없는 오류'}`);
  }
  return d.results || [];
}

/* 빈 배열이 와도 바로 포기하지 않는다. 위의 ⚠️ 참고. */
function callWithRetry(params, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const r = curlJson(params);
    if (r.length) return r;
    if (i < tries - 1) execFileSync('sleep', ['2']);
  }
  return [];
}

/* 한 무드(또는 직접 준 태그)로 후보를 긁어 온다.
 * 돌려주는 모양은 fetch-music.mjs 가 쓰던 것과 같게 맞춘다. */
export function searchJamendo({ clientId, mood, tags, speed, acoustic, vocal, gender,
  offset = 0, limit = 60, minSec = 90, maxSec = 480 }) {
  if (!clientId) throw new Error('Jamendo client_id 가 없습니다');
  const preset = JAMENDO_MOODS[mood] || {};
  const groups = tags ? [tags] : preset.groups;
  if (!groups || !groups.length) throw new Error(`Jamendo 태그를 정할 수 없습니다 (무드: ${mood || '없음'})`);
  const useSpeed = speed !== undefined ? speed : (preset.speed || '');
  const useAcoustic = acoustic !== undefined ? acoustic : !!preset.acoustic;
  const useVocal = vocal !== undefined ? vocal : !!preset.vocal;
  const useGender = gender !== undefined ? gender : (preset.gender || '');
  /* 넉넉히 받아 둔다. 이미 쓴 곡·뺀 곡을 걸러내고 나면 얼마 안 남기 때문이다.
   * 적게 받으면 늘 인기 상위 몇십 곡만 보게 되고, 같은 아티스트가 집마다
   * 되풀이된다 — 8집까지 Christian Zell 이 다섯 집에 나왔다. */
  const per = Math.min(200, Math.max(60, Math.ceil(limit / groups.length) * 6));

  const lists = groups.map((g) => callWithRetry({
    client_id: clientId,
    format: 'json',
    limit: String(per),
    offset: String(offset),
    order: 'popularity_total',          // 인기순 — 이것 하나로 품질이 확 달라진다
    include: 'musicinfo licenses',
    audioformat: 'mp32',
    tags: g,
    // 기본은 연주곡이다. BGM 이라 가사가 있으면 일하는 데 방해된다.
    // 보컬 무드만 vocal 로 뒤집고 목소리 성별까지 고른다.
    vocalinstrumental: useVocal ? 'vocal' : 'instrumental',
    gender: useGender,
    speed: useSpeed,
    acousticelectric: useAcoustic ? 'acoustic' : '',
    durationbetween: `${minSec}_${maxSec}`,
    // NC(비상업)·ND(변경금지)·SA(동일조건)를 질의에서 뺀다.
    // 남는 것은 CC BY 와 CC0 뿐이다.
    ccnc: 'false', ccnd: 'false', ccsa: 'false',
  }));

  // 묶음끼리 번갈아 뽑아 섞는다. 같은 곡이 여러 묶음에 걸리면 한 번만.
  const rows = [];
  const seen = new Set();
  for (let i = 0; i < Math.max(...lists.map((l) => l.length), 0); i++) {
    for (const l of lists) {
      const t = l[i];
      if (t && !seen.has(t.id)) { seen.add(t.id); rows.push(t); }
    }
  }

  return rows.map((t) => ({
    id: String(t.id),
    title: String(t.name || ''),
    artist: String(t.artist_name || '미상'),
    seconds: Number(t.duration || 0),
    licenseUrl: String(t.license_ccurl || ''),
    // audiodownload 가 막히는 경우가 있어 스트리밍 주소를 예비로 들고 간다.
    downloadUrl: String(t.audiodownload || t.audio || ''),
    // 4.1 조가 요구하는 '해당 곡 페이지' 주소
    pageUrl: String(t.shareurl || `https://www.jamendo.com/track/${t.id}`),
    year: String(t.releasedate || '').slice(0, 4),
    speed: (t.musicinfo || {}).speed || '',
    genres: ((t.musicinfo || {}).tags || {}).genres || [],
  }));
}
