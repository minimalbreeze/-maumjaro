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

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BGM = join(ROOT, 'bgm');
const API = 'https://archive.org';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const MODE = has('--pd') ? 'pd' : 'cc';
const WANT = Math.max(1, Math.min(40, Number(val('--n', '8'))));
const DRY = has('--dry');
const QUERY = val('--q', MODE === 'pd' ? 'piano' : 'lofi jazz piano');

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
    q, 'fl[]': ['identifier', 'title', 'creator', 'date', 'licenseurl'],
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

/* 파일 이름에서 진짜 제목만 꺼낸다.
 *   "02-1277237-Joel Dos Santos-Great.mp3"           → "Great"
 *   "1610710-Ambient Samurai-___________181202-2-1"  → (쓰레기라 빈 문자열)
 */
function cleanTitle(fileName, artist) {
  let t = String(fileName).replace(/\.[^.]+$/, '');
  t = t.replace(/^\d{1,3}\s*[-._]\s*/, '');        // 앞의 트랙 번호
  t = t.replace(/^\d{5,}\s*[-._]\s*/, '');         // Jamendo 내부 ID
  if (artist) {                                     // 앞에 붙은 아티스트 이름
    const a = String(artist).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`^${a}\\s*[-._]\\s*`, 'i'), '');
  }
  t = t.replace(/_{3,}/g, ' ').replace(/[_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // 숫자와 기호만 남았으면 제목으로 못 쓴다
  if (!/[A-Za-z가-힣]/.test(t)) return '';
  return t;
}

async function main() {
  console.log('─'.repeat(60));
  console.log(`archive.org 에서 음원 찾기 — ${MODE === 'pd' ? '1923~1925 퍼블릭 도메인' : '자유 라이선스'}`);
  console.log(`검색어: ${QUERY} · 목표 ${WANT}곡`);
  console.log('─'.repeat(60));

  const docs = search();
  if (!docs.length) fail('검색 결과가 없습니다. --q 를 바꿔 보세요.');

  mkdirSync(BGM, { recursive: true });
  const listFile = join(BGM, '목록.json');
  const list = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf8')) : { tracks: [] };
  list.note = '자유롭게 쓸 수 있는 음원만 넣는다. fetch-music.mjs 가 라이선스를 걸러 적는다.';
  list.tracks = list.tracks || [];
  const already = new Set(list.tracks.map((t) => t.file));

  let got = 0, skipped = 0;
  for (const doc of docs) {
    if (got >= WANT) break;

    const lic = MODE === 'pd'
      ? { ok: true, name: `퍼블릭 도메인 (${String(doc.date || '').slice(0, 4)} 발행)`, credit: false }
      : licenseOK(doc.licenseurl);
    if (!lic.ok) { skipped++; continue; }

    let info;
    try { info = filesOf(doc.identifier); } catch { skipped++; continue; }
    if (!info.files.length) { skipped++; continue; }

    const f = info.files[0];
    const safe = `${doc.identifier}`.replace(/[^\w.-]/g, '_').slice(0, 70) + '.mp3';
    if (already.has(safe)) continue;

    const artist = Array.isArray(doc.creator) ? doc.creator[0] : (doc.creator || info.meta.creator || '미상');
    // Jamendo 파일 이름은 "02-1277237-Joel Dos Santos-Great.mp3" 꼴이다.
    // 트랙번호·내부ID·아티스트가 앞에 붙어 있어 그대로 쓰면 제목이 쓰레기가 된다.
    const title = cleanTitle(f.name, artist) || String(doc.title);

    console.log(`  ${String(got + 1).padStart(2, '0')}. ${title.slice(0, 44)}`);
    console.log(`      ${String(artist).slice(0, 40)} · ${lic.name}`);

    if (!DRY) {
      try {
        const n = download(doc.identifier, f.name, join(BGM, safe));
        console.log(`      ↓ ${(n / 1048576).toFixed(1)} MB`);
      } catch (e) { console.log(`      ✗ 실패: ${e.message}`); skipped++; continue; }
    }

    list.tracks.push({
      file: safe, title, artist,
      recorded: String(doc.date || info.meta.date || '').slice(0, 4) || '?',
      license: lic.name,
      // CC BY 는 출처를 밝혀야 한다. 설명란에 넣을 문구를 미리 적어 둔다.
      credit: lic.credit ? `${title} — ${artist} (${lic.name}) · archive.org/details/${doc.identifier}` : '',
      source: `https://archive.org/details/${doc.identifier}`,
    });
    got++;
  }

  if (!DRY) writeFileSync(listFile, `${JSON.stringify(list, null, 2)}\n`);
  console.log('─'.repeat(60));
  console.log(`✅ ${got}곡${DRY ? ' (dry — 받지 않음)' : ' 받음'} · 거름 ${skipped}곡`);
  console.log(`   목록: playlist/bgm/목록.json (현재 ${list.tracks.length}곡)`);
  if (list.tracks.some((t) => t.credit)) {
    console.log('\n⚠️ CC BY 곡이 있습니다. 유튜브 설명란에 아래를 넣어야 합니다:');
    list.tracks.filter((t) => t.credit).forEach((t) => console.log(`   ${t.credit}`));
  }
}

main().catch((e) => fail(e.stack || String(e)));
