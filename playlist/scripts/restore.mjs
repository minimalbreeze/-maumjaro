// 사라진 집의 음원을 목록.json 만 보고 다시 받는다.
//
//   node playlist/scripts/restore.mjs --vol 001
//
// 1~4집은 mp3 와 mp4 가 모두 사라졌다. 다만 목록.json 에 archive.org 의
// 아이템 주소(https://archive.org/details/jamendo-245999)가 남아 있어서
// 거기서 다시 받으면 **같은 녹음**이 복원된다. 곡을 새로 고르는 게 아니다 —
// 이미 발행된 영상과 같은 음악이어야 하기 때문이다.
//
// ⚠️ 받은 뒤에 build.mjs 로 다시 렌더해야 영상이 생긴다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const pick = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const fail = (m) => { console.error(`\n❌ ${m}\n`); process.exit(1); };

const VOL = pick('--vol', '').replace(/[^\w-]/g, '');
if (!VOL) fail('사용법: --vol 001');
const BGM = join(ROOT, 'bgm', VOL);
const listFile = join(BGM, '목록.json');
if (!existsSync(listFile)) fail(`${listFile} 가 없습니다.`);

const API = 'https://archive.org';
/* Node 의 fetch 는 이 환경의 프록시를 안 탄다. curl 은 HTTPS_PROXY 를 읽는다. */
const curl = (args) => execFileSync('curl',
  ['-sS', '--max-time', '180', '-A', 'minimalbreeze-playlist/1.0', ...args],
  { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });

const list = JSON.parse(readFileSync(listFile, 'utf8'));
const tracks = list.tracks || [];
mkdirSync(BGM, { recursive: true });

console.log('─'.repeat(60));
console.log(`${VOL}집 음원 복원 — ${tracks.length}곡`);
console.log('─'.repeat(60));

let got = 0; const missing = [];
for (const t of tracks) {
  const to = join(BGM, t.file);
  if (existsSync(to)) { console.log(`  = ${t.title} (이미 있음)`); got++; continue; }
  // 목록에 적힌 archive 아이템 식별자. source 가 없으면 파일명에서 뽑는다.
  const id = (t.source || '').split('/details/')[1] || t.file.replace(/\.mp3$/, '');
  try {
    const meta = JSON.parse(curl([`${API}/metadata/${id}`]).toString('utf8'));
    const mp3 = (meta.files || []).filter((f) => /\.mp3$/i.test(f.name));
    if (!mp3.length) throw new Error('이 아이템에 mp3 가 없습니다');
    // 가장 큰 mp3 를 고른다 — 미리듣기용 짧은 파일이 섞여 있을 수 있다
    mp3.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
    // /download/ 는 번호 붙은 노드로 넘기고 그 주소가 계속 바뀐다. /cors/ 는 직접 준다.
    const buf = curl([`${API}/cors/${id}/${encodeURIComponent(mp3[0].name)}`]);
    if (buf.length < 10000) throw new Error(`너무 작습니다 (${buf.length}B)`);
    writeFileSync(to, buf);
    console.log(`  ↓ ${t.title} — ${t.artist}  (${(buf.length / 1048576).toFixed(1)} MB)`);
    got++;
  } catch (e) {
    console.log(`  ✗ ${t.title} — ${e.message}`);
    missing.push(t);
  }
}

console.log('─'.repeat(60));
console.log(`✅ ${got}/${tracks.length}곡`);
if (missing.length) {
  console.log(`\n⚠️  못 받은 곡 ${missing.length}개 — 이대로 렌더하면 영상이 짧아집니다.`);
  missing.forEach((t) => console.log(`   ${t.title} — ${t.artist}  ${t.source || ''}`));
  console.log('\n   build.mjs 는 파일이 없는 곡을 알아서 건너뜁니다.');
}
