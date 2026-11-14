// archive.org 에서 자유롭게 쓸 수 있는 음원을 받아 온다
//
//   node playlist/scripts/fetch-music.mjs --cc      자유 라이선스 (CC0/BY/BY-SA)
//   node playlist/scripts/fetch-music.mjs --pd      1923~1925 발행 78rpm (미국 PD)
//   node playlist/scripts/fetch-music.mjs --cc --q "lofi jazz piano" --n 10
//   node playlist/scripts/fetch-music.mjs --cc --dry   받지 않고 목록만
//
// 왜 /cors/ 로 받나
//   archive.org/download/ 는 dn721309.ca.archive.org 같은 번호 붙은 노드로
//   넘기는데 그 주소는 계속 바뀌어서 방화벽에 하나씩 열 수가 없다.
//   /cors/ 는 archive.org 가 직접 돌려준다(리다이렉트 없음).
//
// ⚠️ 라이선스를 코드가 거른다
//   NC(비상업) 가 붙은 것은 받지 않는다. 유튜브에 광고가 붙는 순간 상업 이용이라
//   NC 음원은 쓰면 안 된다. ND(변경금지) 도 거른다 — 음량 평준화가 변경에
//   해당하는지 다툼의 여지가 있어 아예 피한다.

import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BGM_ROOT = join(ROOT, 'bgm');
const API = 'https://archive.org';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

/* 집(volume)마다 폴더를 나눈다 — --vol 002 면 bgm/002/ 에 받는다.
 * 1집은 bgm/ 바로 아래였다. --vol 을 안 주면 예전과 같다. */
const VOL = val('--vol', '').replace(/[^\w-]/g, '');
const BGM = VOL ? join(BGM_ROOT, VOL) : BGM_ROOT;

/* 태그만 믿고 받았더니 9초짜리 리프 조각, 13분짜리 DJ 믹스, 크리스마스 곡이
 * 섞여 들어왔다. 태그는 "piano/jazz/chillout" 인데 실제 내용은 달랐다.
 * 소리는 코드가 못 듣지만 길이와 제목은 볼 수 있으므로 그걸로 거른다. */
const MIN_SEC = Number(val('--min', '90'));    // 이보다 짧으면 곡이 아니라 조각
const MAX_SEC = Number(val('--max', '480'));   // 이보다 길면 믹스·라이브 세트
/* 조용한 사무실·카페에 틀어놓을 음악이다. EDM 계열은 BGM 이 안 된다.
 * 태그에 이 중 하나라도 있으면 받지 않는다. 'chillout' 같은 말은 전자음악
 * 쪽에도 붙어 있어서, 장르를 넓게 잡는 대신 이쪽을 확실히 막는다. */
const BAD_SUBJECTS = [
  'electro', 'electronic', 'techno', 'house', 'trance', 'dubstep', 'dub',
  'drum and bass', 'dnb', 'edm', 'dance', 'club', 'rave', 'synthwave',
  'industrial', 'metal', 'rock', 'punk', 'hardcore', 'rap', 'hip hop',
  'hiphop', 'reggae', 'breakbeat', 'trap', 'psytrance', 'goa',
  /* 2집에서 추가(2026-11-11). 1집 뒤 "더 서정적으로" 라는 말을 듣고
   * 2집 후보를 보니 게임·예고편용 음악이 꽤 섞여 있었다. 장르는 맞는데
   * 쓰임이 다르다 — 장면을 띄우려고 만든 곡이라 BGM 으로 깔면 거슬린다. */
  'game', 'videogame', 'video game', 'chiptune', '8bit', 'chip music',
  'trailer', 'horror', 'noise', 'funk', 'disco', 'latin', 'salsa', 'percussion',
];

/* 크리스마스는 평소엔 거른다 — 철 지난 캐럴이 섞이면 사계절 플레이리스트가
 * 망가진다. 다만 크리스마스 집을 만들 때는 풀어야 한다(--mood 크리스마스).
 * 그래서 목록에서 빼내 따로 둔다. */
const XMAS_WORDS = ['christmas', 'xmas', 'carol', 'noel', 'santa', 'jingle bell'];

/* 크리스마스 집에서 막을 장르. 확실히 아닌 것만 남긴다. */
const XMAS_BAD_SUBJECTS = [
  'techno', 'trance', 'dubstep', 'drum and bass', 'dnb', 'edm', 'rave',
  'metal', 'punk', 'hardcore', 'rap', 'hip hop', 'hiphop', 'trap',
  'psytrance', 'goa', 'industrial', 'noise',
];

const BAD_WORDS = [
  'mix', 'remix', 'megamix', 'dj set', 'live', 'concert', 'interview',
  'podcast', 'radio show', 'intro', 'outro',
  'demo', 'sketch', 'riff', 'loop', 'test', 'untitled',
  // 기능성·광고용 음악. 제목에서 티가 난다. 서정적인 것과 정반대다.
  'corporate', 'business', 'motivational', 'upbeat', 'energetic',
  'advertising', 'commercial', 'tutorial', 'background music',
  /* 2집에서 추가. 제목만 봐도 '장면에 붙이는 음악' 인 것들. */
  'documentary', 'epic', 'cinematic', 'trailer', 'soundtrack',
  'battle', 'siege', 'dungeon', 'cursed', 'horror', 'chiptune',
  'logo', 'ident', 'stinger', 'fanfare',
  'wav', 'mp3', 'flac',                       // "SWEET FRANCE wav" 같은 꼬리
  /* 공포·죽음 쪽. 2집 1차에 "Night Of The Living Dead", "Dissection",
   * "Dark Life Note" 가 서정 태그를 달고 들어왔다. 일하면서 트는 음악이다. */
  'dead', 'death', 'zombie', 'blood', 'grave', 'ghost', 'nightmare',
  'doom', 'evil', 'demon', 'dissection', 'corpse',
  /* 명상·수면용. 음악이라기보다 소리라서 BGM 으로 깔면 멍해진다.
   * 효성님: "너무 쳐지는 식의 음악이 아닌 음악으로". */
  'ambient', 'drone', 'meditation', 'sleep', 'healing', 'yoga', 'spa',
  'hypnosis', 'binaural', 'relaxation',
];

/* 무드 프리셋.
 *
 * 매번 검색어를 손으로 쓰면 지난번에 뭐가 좋았는지가 날아간다.
 * 들어보고 "이쪽이 좋더라" 한 것을 여기에 남긴다.
 *
 *   node playlist/scripts/fetch-music.mjs --mood 서정
 */
const MOODS = {
  // 2026-11-11 효성님: "다음엔 더 서정적이었으면 좋겠다"
  // 재즈·피아노만 잡으면 Corporate Tech 같은 밋밋한 것이 섞인다.
  // 감정이 실린 태그를 같이 요구한다.
  서정: 'subject:(piano OR jazz OR acoustic OR guitar OR strings) '
      + 'AND subject:(melancholic OR emotional OR nostalgic OR sad OR tender '
      + 'OR romantic OR dreamy OR melodic OR sentimental OR soft)',
  /* 2026-11-11 효성님: "너무 쳐지는 식의 음악이 아닌 음악으로".
   *
   * '서정' 은 sad·melancholic 을 요구해서 처지는 쪽으로 쏠린다.
   * 이쪽은 감정은 살리되 가라앉는 말을 빼고, 움직임이 있는 장르
   * (보사·스윙·라운지)를 같이 잡는다. 1집 다음으로 쓸 기본값이다. */
  늦가을: 'subject:(jazz OR piano OR acoustic OR guitar OR bossa OR swing OR lounge) '
      + 'AND subject:(warm OR gentle OR mellow OR smooth OR romantic '
      + 'OR nostalgic OR melodic OR tender OR hopeful OR uplifting)',
  /* 3집(초겨울). 늦가을보다 조금 더 조용하고 맑은 쪽으로 가되,
   * 가라앉는 말(sad·melancholic)은 여전히 안 쓴다. 현악을 더 잡는다. */
  초겨울: 'subject:(piano OR jazz OR strings OR acoustic OR guitar OR bossa OR harp) '
      + 'AND subject:(calm OR gentle OR warm OR tender OR peaceful '
      + 'OR nostalgic OR melodic OR soft OR dreamy OR beautiful)',
  /* 4집(크리스마스). 이 무드에서만 christmas 계열 단어를 거르지 않는다.
   * 캐럴 원곡은 대부분 퍼블릭 도메인이지만 녹음은 아니므로, 라이선스는
   * 평소와 똑같이 CC BY / CC0 만 받는다. */
  크리스마스: 'subject:(christmas OR xmas OR carol OR noel OR holiday)',
  /* 5집(연말). 파티라고 해서 EDM 으로 가지 않는다 — 조용한 사무실·카페에
   * 틀어두는 BGM 이라는 전제는 그대로다. 스윙·빅밴드·라운지·보사처럼
   * 몸이 조금 움직이는 재즈 계열에서 고른다. */
/* 장르와 분위기를 둘 다 요구했더니 18곡 중 2곡만 나왔다. jamendo 의
 * CC BY 안에서 스윙·라운지 자체가 드물어서, 조건을 겹치면 남는 게 없다.
 * 장르만 걸고 나머지는 제목·태그·밝기 거르개에 맡긴다. */
  연말: 'subject:(swing OR "big band" OR lounge OR cocktail OR bossa '
      + 'OR soul OR funk OR blues OR jazz)',
  재즈: 'subject:jazz OR subject:swing OR subject:bossa OR subject:blues',
  피아노: 'subject:piano AND subject:(calm OR peaceful OR slow OR soft)',
  차분: 'subject:(ambient OR calm OR peaceful OR relaxed OR mellow) AND subject:(piano OR acoustic OR guitar)',
};

const MODE = has('--pd') ? 'pd' : 'cc';
const WANT = Math.max(1, Math.min(40, Number(val('--n', '8'))));
const DRY = has('--dry');
const MOOD = val('--mood', '');
if (MOOD && !MOODS[MOOD]) {
  console.error(`\n❌ 모르는 무드: ${MOOD}\n   고를 수 있는 것: ${Object.keys(MOODS).join(' / ')}\n`);
  process.exit(1);
}
const QUERY = MOOD ? MOODS[MOOD] : val('--q', MODE === 'pd' ? 'piano' : MOODS.서정);

function fail(m) { console.error(`\n❌ ${m}\n`); process.exit(1); }

/* 쓸 수 있는 라이선스인가. 모르면 안 쓴다. */
function licenseOK(url) {
  if (!url) return { ok: false, why: '라이선스 표기 없음' };
  const u = String(url).toLowerCase();
  if (u.includes('/publicdomain/') || u.includes('zero/1.0')) return { ok: true, name: 'CC0 / 퍼블릭 도메인', credit: false };
  if (u.includes('/nc')) return { ok: false, why: 'NC — 상업 이용 금지. 유튜브 광고가 붙으면 위반' };
  if (u.includes('-nc')) return { ok: false, why: 'NC — 상업 이용 금지' };
  if (u.includes('/nd') || u.includes('-nd')) return { ok: false, why: 'ND — 변경 금지. 음량 평준화가 걸릴 수 있음' };
  // SA(동일조건변경허락)는 기본으로 뺀다. 영상에 깔면 영상 전체를 같은
  // 라이선스로 풀어야 한다는 해석이 가능해, 수익 내는 채널에는 위험하다.
  // 감수하겠다면 --sa 를 붙인다.
  if (u.includes('/by-sa')) return has('--sa')
    ? { ok: true, name: 'CC BY-SA', credit: true }
    : { ok: false, why: 'SA — 영상 전체를 같은 라이선스로 풀어야 할 수 있음 (--sa 로 허용)' };
  if (u.includes('/by')) return { ok: true, name: 'CC BY', credit: true };
  return { ok: false, why: `모르는 라이선스: ${url}` };
}

/* Node 의 fetch 는 이 환경의 프록시를 타지 않는다(TypeError: fetch failed).
 * curl 은 HTTPS_PROXY 를 읽으므로 curl 로 부른다. */
function curl(args) {
  return execFileSync('curl', ['-sS', '--max-time', '120', '-A', 'minimalbreeze-playlist/1.0', ...args],
    { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
}

function jget(path, params) {
  const a = [];
  Object.entries(params || {}).forEach(([k, v]) => {
    (Array.isArray(v) ? v : [v]).forEach((x) => a.push('--data-urlencode', `${k}=${x}`));
  });
  const out = curl(['-G', ...a, `${API}${path}`]).toString('utf8');
  try { return JSON.parse(out); } catch { throw new Error(`${path} 응답을 읽지 못했습니다: ${out.slice(0, 160)}`); }
}

function search() {
  /* 자유 라이선스 모드는 jamendo-albums 만 본다.
   *
   * 처음엔 mediatype:audio 전체를 뒤졌는데 팟캐스트·라디오 녹음이 대부분이라
   * BGM 으로 쓸 게 거의 없었다. jamendo-albums 는 실제 음악가가 올린 앨범이다.
   *
   * 라이선스를 쿼리에서 정확히 지정한다. 와일드카드로 'by' 를 찾으면
   * by-nc-nd 까지 걸린다 — 표본 200곡 중 146곡이 NC-ND 였다.
   * 쓸 수 있는 CC BY 는 2% 뿐이라, 거르는 게 아니라 처음부터 그것만 찾는다. */
  const CC_BY = 'licenseurl:("http://creativecommons.org/licenses/by/3.0/" '
    + 'OR "https://creativecommons.org/licenses/by/4.0/" '
    + 'OR "http://creativecommons.org/publicdomain/zero/1.0/")';
  const q = MODE === 'pd'
    // 1923~1925 발행만. 미국은 이 해까지 음반이 퍼블릭 도메인이다(2026 기준).
    ? `collection:georgeblood AND date:[1923-01-01 TO 1925-12-31] AND (${QUERY})`
    : `collection:jamendo-albums AND ${CC_BY} AND (${QUERY})`;
  const d = jget('/advancedsearch.php', {
    q, 'fl[]': ['identifier', 'title', 'creator', 'date', 'licenseurl', 'subject'],
    rows: String(WANT * 5), output: 'json',
  });
  return d.response.docs || [];
}

function filesOf(id) {
  const d = jget(`/metadata/${id}`);
  const m = d.metadata || {};
  const audio = (d.files || []).filter((f) => /\.(mp3|flac|ogg)$/i.test(f.name));
  // 같은 곡의 mp3 를 고른다(flac 은 10배 크고 우리는 어차피 aac 로 다시 뽑는다)
  const mp3 = audio.filter((f) => /\.mp3$/i.test(f.name));
  return { meta: m, files: mp3 };
}

function download(id, name, to) {
  // /download/ 는 번호 붙은 노드로 넘기고 그 주소는 계속 바뀐다. /cors/ 는 직접 준다.
  const buf = curl([`${API}/cors/${id}/${encodeURIComponent(name)}`]);
  if (buf.length < 10000) throw new Error(`너무 작습니다 (${buf.length}B) — 받지 못했습니다`);
  writeFileSync(to, buf);
  return buf.length;
}

/* 파일 이름 앞에 붙은 아티스트 이름을 떼어낸다.
 *
 * 글자를 그대로 맞추면 안 떨어진다. archive.org 가 파일 이름의 비ASCII
 * 글자를 '_' 로 바꿔 두기 때문이다.
 *   creator "Michal Jalochowski"(l 은 획 그은 l) → 파일 "Micha_Ja_ochowski-Canon For Piano No.2"
 *   creator "Tino Gomez"(o 는 악센트)            → 파일 "Tino Gomez-Crazy Blues"
 * 1집에서 이 두 곡이 아티스트 이름을 제목에 달고 화면에 나왔다.
 *
 * 그래서 이름을 '영문·숫자 토막'으로 쪼갠 뒤 토막 사이를 '글자 아닌 것
 * 아무거나(없어도 됨)'로 맞춘다. 악센트는 NFD 로 떼고 비교하되,
 * 몇 글자를 자를지는 원본 기준으로 센다. */
/* archive.org 메타데이터에는 "Anima &amp; Animus" 처럼 HTML 엔티티가 그대로
 * 들어 있다. 그냥 두면 파일 이름의 "Anima & Animus" 와 안 맞아서 아티스트
 * 이름이 제목에 남는다 — 2집 1차에 "Anima amp Animus-A Melody..." 로 나왔다. */
function unent(x) {
  return String(x || '')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&#0*39;/g, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function stripArtist(title, artist) {
  const parts = unent(artist).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parts.length) return title;
  const body = parts.join('[^A-Za-z0-9]*');
  const flat = [...title].map((ch) => ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const joined = flat.join('');

  // 앞에 붙은 경우: "Dave Lockyer - New Love"
  const head = joined.match(new RegExp(`^${body}\\s*[-._]\\s*`, 'i'));
  if (head) {
    let n = 0, cut = 0;
    while (cut < flat.length && n < head[0].length) { n += flat[cut].length; cut++; }
    return title.slice(cut);
  }
  // 뒤에 붙은 경우: "Tu m oublies-Jacky Daniel" (3집에서 나왔다)
  const tail = joined.match(new RegExp(`\\s*[-._]\\s*${body}\\s*$`, 'i'));
  if (tail) {
    const keep = joined.length - tail[0].length;
    let n = 0, cut = 0;
    while (cut < flat.length && n < keep) { n += flat[cut].length; cut++; }
    return title.slice(0, cut);
  }
  return title;
}

/* 파일 이름에서 진짜 제목만 꺼낸다.
 *   "02-1277237-Joel Dos Santos-Great.mp3"           → "Great"
 *   "1610710-Ambient Samurai-___________181202-2-1"  → (쓰레기라 빈 문자열)
 */
function cleanTitle(fileName, artist) {
  let t = unent(fileName).replace(/\.[^.]+$/, '');
  t = t.replace(/^\d{1,3}\s*[-._]\s*/, '');        // 앞의 트랙 번호
  t = t.replace(/^\d{5,}\s*[-._]\s*/, '');         // Jamendo 내부 ID
  if (artist) t = stripArtist(t, artist);           // 앞에 붙은 아티스트 이름
  t = t.replace(/_{3,}/g, ' ').replace(/[_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // 괄호 안 설명과 날짜를 떼어낸다. 화면을 넘치게 만드는 주범이다.
  //   "Song for Self-Breaking Man(ぼくが…という歌）2018/12/02 part 2" → "Song for Self-Breaking Man"
  t = t.replace(/[（(［\[][^）)］\]]*[）)］\]]/g, ' ');
  t = t.replace(/\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/g, ' ');
  t = t.replace(/\bpart\s*\d+\b/gi, ' ');
  return finalize(t);
}

/* 어떤 경로로 얻은 제목이든 마지막엔 여기를 지난다.
 * 전에는 정리에 실패하면 원본 앨범 제목으로 되돌아가면서 이 단계를 통째로
 * 건너뛰었다 — 그래서 일본어와 날짜가 붙은 긴 제목이 화면을 넘쳤다. */
function finalize(raw) {
  let t = unent(raw);
  // "Young Jazzmans Grin CC0", "... CC BY" 처럼 라이선스가 제목에 붙어 온다.
  t = t.replace(/[\s._-]*\bCC\s*(0|BY(\s*-?\s*SA)?)\b[\s._-]*$/i, ' ');
  // 화면에 쓰는 Inter 는 한자·가나·키릴을 못 그린다. 빈칸으로 나오므로 떼어낸다.
  t = t.replace(/[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef\u0400-\u04ff]/g, ' ');
  t = t.replace(/\s{2,}/g, ' ').replace(/[\s\-–—_·]+$/, '').replace(/^[\s\-–—_·]+/, '').trim();
  // "SWEET FRANCE wav" 처럼 확장자가 제목에 남아 오는 것이 있다.
  t = t.replace(/[\s._-]+(wav|mp3|flac|ogg|aiff?)$/i, '').trim();
  if (!/[A-Za-z]/.test(t)) return '';          // 쓸 글자가 안 남았다
  // "I 2018" 처럼 글자 한두 개에 숫자만 붙은 것은 제목이 아니다.
  if (t.replace(/[^A-Za-z]/g, '').length < 3) return '';
  /* 전부 대문자인 긴 제목은 화면에서 소리 지르는 것처럼 보인다.
   * "LAS FLORES LLORAN UNA CANCION DE AMOR" 가 그렇게 들어왔다.
   * 짧은 것(NEW VIP)은 약자일 수 있으니 그냥 둔다. */
  if (t.length > 15 && t === t.toUpperCase() && /[A-Z]/.test(t)) {
    t = t.toLowerCase().replace(/(^|[\s(\[-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  }
  if (t.length > 42) t = `${t.slice(0, 41).trimEnd()}…`;
  return t;
}

/* 받아 놓고 소리를 재 본다.
 *
 * 태그와 제목으로는 타악기가 센 곡을 못 거른다. 1집 14곡을 재 보니
 * 3kHz 위쪽 에너지가 전체보다 13.4dB 낮은 BAILARINA 가 가장 밝았고,
 * 피아노·재즈 쪽은 -17 ~ -30dB 였다. 그래서 -14dB 를 선으로 잡는다.
 * 이보다 밝으면 드럼이 앞에 나와 있다는 뜻이고, 조용한 사무실에 깔기 어렵다.
 *
 * ⚠️ 다이내믹 레인지(LRA)로는 거르지 않는다. 처음엔 "큰 곡 = 영화음악"
 * 이라 보고 상한을 두려 했는데, 1집에서 LRA 가 가장 큰 곡(17.3)이
 * 하필 제일 서정적인 Funeral piano melody 였다. 솔로 피아노가 원래 그렇다. */
/* 크리스마스 집은 기준을 낮춘다.
 * 캐럴에는 종·글로켄슈필·탬버린이 들어가서 고역이 원래 밝다. -14 로 재면
 * 19곡 중 15곡이 "너무 밝다"로 지워진다 — 거르려던 것은 EDM 이지 종이
 * 아니다. -9 로 두면 종은 통과하고 드럼이 앞에 선 곡은 여전히 걸린다. */
/* 무드마다 밝기 기준이 다르다. 캐럴은 종 때문에, 스윙은 브러시와 심벌
 * 때문에 고역이 원래 밝다. 같은 자로 재면 장르째로 지워진다. */
const BRIGHT_BY_MOOD = { 크리스마스: '-9', 연말: '-12' };
const MAX_BRIGHT = Number(val('--bright', BRIGHT_BY_MOOD[MOOD] || '-14'));

function rmsOf(file, af) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', '20', '-t', '90',
    '-i', file, '-af', `${af ? `${af},` : ''}astats=measure_perchannel=none`, '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = `${r.stdout || ''}${r.stderr || ''}`.match(/RMS level dB:\s*(-?[\d.]+|-?inf)/);
  return m ? (/inf/.test(m[1]) ? -120 : Number(m[1])) : null;
}

/* 고역이 전체보다 몇 dB 낮은가. 낮을수록 어둡고 차분하다. */
function brightness(file) {
  const full = rmsOf(file, null);
  const hi = rmsOf(file, 'highpass=f=3000');
  return (full === null || hi === null) ? null : hi - full;
}

/* 제목에 걸러야 할 말이 있나.
 * 크리스마스 집에서는 캐럴 단어를 통과시킨다. */
function badTitle(t) {
  const low = ` ${String(t).toLowerCase()} `;
  const words = MOOD === '크리스마스' ? BAD_WORDS : [...BAD_WORDS, ...XMAS_WORDS];
  return words.find((w) => low.includes(` ${w} `) || low.includes(`${w} `) && low.trim().startsWith(w));
}

/* 이미 쓴 곡과 한 번 뺀 곡은 또 받지 않는다. bgm/ 아래 모든 목록.json 을 본다.
 *
 * 2집에 1집 곡이 다시 들어오면 구독자가 바로 알아챈다.
 * rejected 도 같이 보는 이유: 3집에서 합창곡 두 개를 목록에서 지웠더니,
 * '쓴 곡' 명단에서도 같이 빠져서 다음 내려받기에 그대로 다시 들어왔다.
 * 뺀 것은 뺐다고 적어 둬야 한다. */
function usedElsewhere() {
  const seen = new Set();
  if (!existsSync(BGM_ROOT)) return seen;
  const dirs = [BGM_ROOT, ...readdirSync(BGM_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => join(BGM_ROOT, d.name))];
  for (const d of dirs) {
    const f = join(d, '목록.json');
    if (!existsSync(f)) continue;
    try {
      const j = JSON.parse(readFileSync(f, 'utf8'));
      (j.tracks || []).forEach((t) => {
        if (t.source) seen.add(String(t.source).split('/').pop());
      });
      (j.rejected || []).forEach((id) => seen.add(String(id)));
    } catch { /* 읽히지 않으면 없는 셈 친다 */ }
  }
  return seen;
}

async function main() {
  console.log('─'.repeat(60));
  console.log(`archive.org 에서 음원 찾기 — ${MODE === 'pd' ? '1923~1925 퍼블릭 도메인' : '자유 라이선스'}`);
  console.log(`${MOOD ? `무드: ${MOOD}` : `검색어: ${QUERY.slice(0, 60)}`} · 목표 ${WANT}곡`);
  console.log('─'.repeat(60));

  const docs = search();
  if (!docs.length) fail('검색 결과가 없습니다. --q 를 바꿔 보세요.');

  mkdirSync(BGM, { recursive: true });
  const listFile = join(BGM, '목록.json');
  const list = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf8')) : { tracks: [] };
  list.note = '자유롭게 쓸 수 있는 음원만 넣는다. fetch-music.mjs 가 라이선스를 걸러 적는다.';
  list.tracks = list.tracks || [];
  const already = new Set(list.tracks.map((t) => t.file));
  const used = usedElsewhere();

  /* 같은 사람 곡이 세 곡씩 들어오면 플레이리스트가 얇아 보인다.
   * 3집 1차에 Christian Zell 이 3곡이었다. 한 집에 둘까지만 받는다. */
  const perArtist = new Map();
  const seenBy = (a) => perArtist.get(String(a).toLowerCase().trim()) || 0;
  list.tracks.forEach((t) => {
    const k = String(t.artist).toLowerCase().trim();
    perArtist.set(k, (perArtist.get(k) || 0) + 1);
  });
  const MAX_PER_ARTIST = Number(val('--per-artist', '2'));

  let got = 0, skipped = 0;
  for (const doc of docs) {
    if (got >= WANT) break;

    const lic = MODE === 'pd'
      ? { ok: true, name: `퍼블릭 도메인 (${String(doc.date || '').slice(0, 4)} 발행)`, credit: false }
      : licenseOK(doc.licenseurl);
    if (!lic.ok) { skipped++; continue; }
    if (used.has(doc.identifier)) { skipped++; continue; }   // 다른 집에 이미 있다

    let info;
    try { info = filesOf(doc.identifier); } catch { skipped++; continue; }
    if (!info.files.length) { skipped++; continue; }

    // 길이를 먼저 본다. 메타데이터에 있으므로 받기 전에 거를 수 있다.
    const sized = info.files
      .map((f) => ({ f, sec: Number(f.length || 0) }))
      .filter((x) => x.sec >= MIN_SEC && x.sec <= MAX_SEC);
    if (!sized.length) {
      const any = Number((info.files[0] || {}).length || 0);
      console.log(`  — 건너뜀: ${String(doc.title).slice(0, 36)} (${any ? `${Math.round(any)}초` : '길이 불명'})`);
      skipped++; continue;
    }
    const f = sized[0].f;
    const safe = `${doc.identifier}`.replace(/[^\w.-]/g, '_').slice(0, 70) + '.mp3';
    if (already.has(safe)) continue;

    const artist = Array.isArray(doc.creator) ? doc.creator[0] : (doc.creator || info.meta.creator || '미상');
    // Jamendo 파일 이름은 "02-1277237-Joel Dos Santos-Great.mp3" 꼴이다.
    // 트랙번호·내부ID·아티스트가 앞에 붙어 있어 그대로 쓰면 제목이 쓰레기가 된다.
    // 파일 이름에서 못 건지면 앨범 제목으로 가되, 그것도 반드시 finalize 를 지난다.
    // 앨범 제목으로 되돌아갈 때도 아티스트 이름을 뗀다.
    // 안 떼면 "Dave Lockyer - New Love" 처럼 이름이 제목에 남는다.
    const title = cleanTitle(f.name, artist) || finalize(stripArtist(unent(doc.title), artist));
    if (!title) { console.log(`  — 건너뜀: 화면에 쓸 수 있는 제목이 없음 (${doc.identifier})`); skipped++; continue; }

    /* 제목이 아티스트 이름과 같으면 제목이 아니다 — 앨범 제목이 사람 이름인
     * 경우가 있다("Svetlana Sorokina"). 화면에 두 줄 같은 이름이 뜬다. */
    const same = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (same(title) === same(artist)) {
      console.log(`  — 건너뜀: 제목이 아티스트 이름과 같음 (${title.slice(0, 30)})`);
      skipped++; continue;
    }

    if (seenBy(artist) >= MAX_PER_ARTIST) {
      console.log(`  — 건너뜀: ${title.slice(0, 30)} (${String(artist).slice(0, 20)} 곡이 이미 ${MAX_PER_ARTIST}개)`);
      skipped++; continue;
    }

    const bad = badTitle(title);
    if (bad) { console.log(`  — 건너뜀: ${title.slice(0, 36)} ("${bad}")`); skipped++; continue; }

    // 태그로 EDM 계열을 막는다. 제목만 봐서는 알 수 없다 — "Full Moon Dub" 이
    // 그렇게 들어왔다.
    const subs = (Array.isArray(doc.subject) ? doc.subject : [doc.subject || ''])
      .map((x) => String(x).toLowerCase());
    /* 크리스마스 집에서는 장르 태그를 느슨하게 본다.
     * Jamendo 는 캐럴에 rock 태그를 헐겁게 붙여 놔서, 평소 목록 그대로
     * 쓰면 18곡 중 2곡만 남는다. 대신 확실히 아닌 것만 막고, 타악기가
     * 센 곡은 받아서 소리를 재는 쪽(고역 -14dB)으로 거른다. */
    /* 연말은 funk·latin·percussion 을 막지 않는다 — 라운지·보사의 결이다.
     * 전자음악 계열은 그대로 막는다. */
    const subjectBlock = MOOD === '크리스마스' ? XMAS_BAD_SUBJECTS
      : MOOD === '연말' ? BAD_SUBJECTS.filter((b) => !['funk', 'latin', 'salsa', 'percussion', 'disco'].includes(b))
      : BAD_SUBJECTS;
    const hitSub = subjectBlock.find((b) => subs.some((x) => x === b || x.includes(b)));
    if (hitSub) { console.log(`  — 건너뜀: ${title.slice(0, 34)} (태그 "${hitSub}")`); skipped++; continue; }

    console.log(`  ${String(got + 1).padStart(2, '0')}. ${title}  (${Math.floor(sized[0].sec / 60)}:${String(Math.round(sized[0].sec % 60)).padStart(2, '0')})`);
    console.log(`      ${String(artist).slice(0, 40)} · ${lic.name}`);

    if (!DRY) {
      const to = join(BGM, safe);
      try {
        const n = download(doc.identifier, f.name, to);
        console.log(`      ↓ ${(n / 1048576).toFixed(1)} MB`);
      } catch (e) { console.log(`      ✗ 실패: ${e.message}`); skipped++; continue; }

      const br = brightness(to);
      if (br !== null && br > MAX_BRIGHT) {
        console.log(`      ✗ 너무 밝습니다 (고역 ${br.toFixed(1)}dB > ${MAX_BRIGHT}) — 지웁니다`);
        try { unlinkSync(to); } catch { /* 이미 없으면 그만 */ }
        skipped++; continue;
      }
      if (br !== null) console.log(`      고역 ${br.toFixed(1)}dB`);
    }

    list.tracks.push({
      file: safe, title, artist,
      recorded: String(doc.date || info.meta.date || '').slice(0, 4) || '?',
      license: lic.name,
      // CC BY 는 출처를 밝혀야 한다. 설명란에 넣을 문구를 미리 적어 둔다.
      credit: lic.credit ? `${title} — ${artist} (${lic.name}) · archive.org/details/${doc.identifier}` : '',
      source: `https://archive.org/details/${doc.identifier}`,
    });
    perArtist.set(String(artist).toLowerCase().trim(), seenBy(artist) + 1);
    got++;
  }

  if (!DRY) writeFileSync(listFile, `${JSON.stringify(list, null, 2)}\n`);
  console.log('─'.repeat(60));
  console.log(`✅ ${got}곡${DRY ? ' (dry — 받지 않음)' : ' 받음'} · 거름 ${skipped}곡`);
  console.log(`   목록: ${listFile.replace(ROOT, 'playlist')} (현재 ${list.tracks.length}곡)`);
  if (list.tracks.some((t) => t.credit)) {
    console.log('\n⚠️ CC BY 곡이 있습니다. 유튜브 설명란에 아래를 넣어야 합니다:');
    list.tracks.filter((t) => t.credit).forEach((t) => console.log(`   ${t.credit}`));
  }
}

main().catch((e) => fail(e.stack || String(e)));
