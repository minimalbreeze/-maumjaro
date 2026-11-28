/* 설명란 생성기 2 — 한도(5000자) 안에 출처를 지켜 넣는다.
 *
 * 2026-11-28. 4시간 영상은 설명란이 7800~8900자가 되어 등록이 안 됐다.
 * 출처를 빼면 CC BY 위반이라(그리고 Jamendo 약관 4.1 은 곡마다 직접
 * 링크를 요구한다) 뺄 수 없다. 대신 **챕터 줄에 링크를 붙여 한 줄로
 * 합친다** — 챕터와 출처를 두 번 적던 것을 한 번만 적는다.
 *
 *   전:  0:00  Georgetown Cafe — Popoi          (챕터)
 *        · Georgetown Cafe — Popoi              (출처)
 *          CC BY · Provided by Jamendo · https://...
 *   후:  0:00 Georgetown Cafe — Popoi · https://www.jamendo.com/track/1892348
 *
 * 곡이 적어 자리가 남으면(4600자 미만) 예전처럼 따로 적는다.
 *
 * 사용법:
 *   node playlist/scripts/desc2.mjs --vol 020 --lang ko
 *   node playlist/scripts/desc2.mjs --name 그루브-4시간 --vols 021,022,020,023 --lang en
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const pick = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const VOL  = pick('--vol', '');
const NAME = pick('--name', VOL);
const VOLS = pick('--vols', VOL).split(',').map((x) => x.trim()).filter(Boolean);
const LANG = pick('--lang', 'ko');
const LIMIT = 5000;
const GAP = 1.5;   // build.mjs 의 GAP_SEC 과 같아야 한다

const dur = (f) => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f],
  { encoding: 'utf8' }).trim());
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hhmm = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* 곡을 모은다. 여러 집을 붙인 긴 영상도 같은 방식이다. */
const tracks = [];
for (const v of VOLS) {
  const bgm = join(ROOT, 'bgm', v);
  const list = JSON.parse(readFileSync(join(bgm, '목록.json'), 'utf8'));
  for (const t of (list.tracks || [])) {
    const f = join(bgm, t.file);
    if (!existsSync(f)) continue;
    tracks.push({ ...t, _sec: dur(f) });
  }
}
if (!tracks.length) { console.error('곡이 없습니다'); process.exit(1); }

/* 집 사이에도 곡 사이와 같은 1.5초가 들어간다(이어 붙이기는 집 끝에서
 * 끊기므로 실제로는 집 경계에서 조금 어긋날 수 있다. 챕터는 ±2초다). */
let at = 0;
const rows = tracks.map((t) => {
  const r = { ...t, _at: at };
  at += t._sec + GAP;
  return r;
});
const total = at - GAP;

const T = LANG === 'en'
  ? { src: 'Music credits', all: 'All tracks are Creative Commons, cleared for commercial use.',
      mod: '⚠️ Tracks were given a vinyl tone (EQ and light compression). The performances and lengths are unchanged.',
      lic: 'Licence: https://creativecommons.org/licenses/by/4.0', tot: 'Total',
      point: 'Every track is credited with its artist and a direct Jamendo link in the pinned comment.',
      ai: ['🎻 This is not AI-generated music.',
           '   Only music made by people and released under CC BY.'] }
  : { src: '음원 출처 (Creative Commons)', all: '모든 음원은 상업적 이용이 허용된 라이선스로만 골랐습니다.',
      mod: '⚠️ 원곡에 LP 질감(이퀄라이저·약한 압축)을 입혔습니다. 연주와 길이는 그대로입니다.',
      lic: '라이선스 전문: https://creativecommons.org/licenses/by/4.0', tot: '전체',
      point: '곡마다 아티스트와 Jamendo 링크를 고정 댓글에 적어 두었습니다.',
      /* 2026-11-28. 예전 문구는 "실제 연주자가 녹음한 음원만 씁니다" 였다.
       * 앰비언트·일렉트로닉을 쓰기로 하면서 그 말이 사실과 어긋나게 됐다 —
       * 전자음악은 연주해서 녹음한 것이 아니다. 우리 차별점은 "연주" 가
       * 아니라 "AI 가 아니고 출처가 분명하다" 였으므로 그쪽으로 고친다. */
      ai: ['🎻 AI가 만든 음악이 아닙니다.',
           '   사람이 만들고 CC BY 로 공개한 음원만 씁니다.'] };

const head = readFileSync(pick('--head', ''), 'utf8').trimEnd();

function chapters(out) {
  rows.forEach((t) => out.push(`${mmss(t._at)}  ${t.title} — ${t.artist}`));
  out.push('', `${T.tot} ${hhmm(total)}`, '');
}

/* 설명란 — 출처는 고정 댓글로 보낸다.
 * 2026-11-28. 4시간 영상은 출처까지 넣으면 7800~8900자가 되어 등록이
 * 안 된다(한도 5000). 출처를 빼면 CC BY 위반이고 Jamendo 약관 4.1 은
 * 곡마다 직접 링크를 요구하므로, 지우는 대신 **고정 댓글로 옮긴다**.
 * 댓글 한도는 10000자라 전부 들어간다. 설명란에는 어디 있는지 적는다. */
function buildDesc() {
  const out = [head, '', ...T.ai, '', '━━━━━━━━━━━━━━━━', ''];
  chapters(out);
  out.push('━━━━━━━━━━━━━━━━', '', `${T.src} — Jamendo · CC BY`, '', T.point, T.all, T.lic, T.mod,
    '', '━━━━━━━━━━━━━━━━', '', 'minimalbreeze', pick('--tags', ''));
  return out.join('\n') + '\n';
}

/* 고정 댓글 — 곡마다 아티스트와 Jamendo 직접 링크를 적는다. */
function buildPin() {
  const out = [];
  const pin = pick('--pin', '');
  if (pin) { pin.split('|').forEach((x) => { out.push(x.trim()); out.push(''); }); out.push('━━━━━━━━━━━━━━━━', ''); }
  if (!pin) { out.push(...T.ai, ''); }
  out.push(`${T.src} — ${rows.length}${LANG === 'en' ? ' tracks' : '곡'}`, '');
  rows.forEach((t) => {
    const jam = /(^|\.)jamendo\.com\//.test(String(t.source || ''));
    out.push(`· ${t.title} — ${t.artist}`);
    out.push(`  ${t.license || 'CC BY'}${jam ? ' · Provided by Jamendo' : ''}${t.source ? ` · ${t.source}` : ''}`);
  });
  out.push('', T.all, T.lic, T.mod);
  return out.join('\n') + '\n';
}

const desc = buildDesc();
const pinTxt = buildPin();
const suffix = LANG === 'en' ? 'EN-' : '';
const d1 = join(ROOT, 'out', `설명란-${suffix}${NAME}.txt`);
const d2 = join(ROOT, 'out', `고정댓글-${suffix}${NAME}.txt`);
writeFileSync(d1, desc);
writeFileSync(d2, pinTxt);
const ok1 = desc.length <= LIMIT, ok2 = pinTxt.length <= 10000;
console.log(`${ok1 ? '✅' : '❌'} 설명란 ${desc.length}자 / ${LIMIT}   ${ok2 ? '✅' : '❌'} 고정댓글 ${pinTxt.length}자 / 10000   (곡 ${rows.length})`);
