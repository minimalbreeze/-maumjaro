// 유튜브 설명란에 그대로 붙여넣을 글을 만든다
//
//   node playlist/scripts/description.mjs > playlist/out/설명란.txt
//
// ⚠️ CC BY 는 출처를 밝혀야 한다. 안 밝히면 라이선스 위반이다.
//    목록.json 의 credit 을 모아 설명란 문구로 뽑는다.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* 집(volume). --vol 002 면 bgm/002/ 를 읽는다. build.mjs 와 같은 규칙. */
const argv = process.argv.slice(2);
const pick = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const VOL = pick('--vol', '').replace(/[^\w-]/g, '');
const BGM = VOL ? join(ROOT, 'bgm', VOL) : join(ROOT, 'bgm');
const INTRO = pick('--intro', '가을 저녁, 창이 큰 어느 로비에서.');
/* 해시태그. 집마다 색이 다르면(빗소리·현악 같은) --tags 로 바꾼다.
 * 앞의 세 개는 채널 공통이라 고정하고, 뒤만 갈아 끼운다. */
const TAGS = pick('--tags', '#작업할때듣는음악 #재즈 #lofi #공부할때듣는음악');
/* 맨 첫 줄. 구글·유튜브 검색 결과에 보이는 것은 설명란 첫 두 줄이다.
 * 7집은 외부 유입이 Google Search 100% 였는데, 그 자리에 "틀어두고 하던
 * 일을 하세요" 가 있었다. 검색어가 거기 있어야 한다.
 * 길이는 자동으로 붙는다 — 곡 길이를 재서 쓰므로 손으로 적을 일이 없다. */
const LEAD = pick('--lead', '');

const list = JSON.parse(readFileSync(join(BGM, '목록.json'), 'utf8'));
const tracks = (list.tracks || []).filter((t) => existsSync(join(BGM, t.file)));

/* ⚠️ build.mjs 의 GAP_SEC 과 반드시 같아야 한다.
 * 1집 때 여기가 1.2, build.mjs 가 1.5 여서 곡마다 0.3초씩 밀렸다.
 * 18곡이면 마지막 챕터가 5초 어긋난다. 한쪽을 고치면 다른 쪽도 고칠 것. */
const GAP = 1.5;
const dur = (f) => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', join(BGM, f)],
  { encoding: 'utf8' }).trim());
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* --story 로 준 몇 줄을 맨 앞에 둔다.
 * 2026-11-23: 상위 플레이리스트 채널(Hickive 39만·good day flow 13만·
 * Yurimood 10만)을 보니 설명란이 전부 이야기로 시작한다. 안내문으로
 * 시작하는 곳은 우리뿐이었다. 사람은 안내문을 안 읽는다. */
const STORY = pick('--story', '').split('|').map((x) => x.trim()).filter(Boolean);
/* --en : 영어 한 줄. Yurimood 댓글에 외국인이 있었다 — 영어를 적어 두면 온다. */
const EN = pick('--en', '');
/* --real : "AI 아님, 진짜 연주" 를 밝힌다.
 * 본 채널들이 전부 AI 음원이었다(ⓘ AI 배지). 우리만 실제 연주자의 CC BY
 * 녹음을 쓰고 곡마다 이름을 적는다. 이게 유일한 차별점이라 숨기지 않는다. */
const REAL = argv.includes('--real');

const out = [];
/* LEAD 는 전체 길이를 알아야 해서 맨 마지막에 맨 앞으로 끼워 넣는다. */
if (STORY.length) { out.push(...STORY); out.push(''); }
out.push(INTRO);
/* 둘째 줄. 기본은 작업용 문구지만 수면집처럼 안 맞는 집이 있다
 * ("잠들기 전"에 "하던 일을 하세요"는 말이 안 된다). --line2 로 바꾼다. */
out.push(pick('--line2', '틀어두고 하던 일을 하세요.'));
if (EN) { out.push(''); out.push(EN); }
if (REAL) {
  out.push('');
  out.push('🎻 AI가 만든 음악이 아닙니다.');
  out.push('   사람이 만들고 CC BY 로 공개한 음원만 씁니다. 곡마다 이름을 아래에 적어 두었습니다.');
}
out.push('');
out.push('━━━━━━━━━━━━━━━━');
out.push('');

let at = 0;
const rows = [];
tracks.forEach((t, i) => {
  const s = dur(t.file);
  rows.push(`${mmss(at)}  ${t.title} — ${t.artist}`);
  at += s + (i < tracks.length - 1 ? GAP : 0);
});
out.push(...rows);
out.push('');
out.push(`전체 ${mmss(at)}`);
out.push('');
out.push('━━━━━━━━━━━━━━━━');
out.push('');

/* 출처 표기. CC BY 는 이걸 안 적으면 위반이다. */
const credits = tracks.filter((t) => t.credit || /CC BY/i.test(t.license || ''));
if (credits.length) {
  out.push('음원 출처 (Creative Commons)');
  out.push('');
  /* Jamendo 약관 4.1 — 아티스트를 창작자로, Jamendo 를 제공자로 표기하고
   * 곡마다 Jamendo 의 해당 곡 페이지로 직접 링크해야 한다.
   * archive.org 에서 받은 1~5집 곡은 그 조항의 대상이 아니라 그대로 둔다. */
  credits.forEach((t) => {
    const fromJamendo = /(^|\.)jamendo\.com\//.test(String(t.source || ''));
    out.push(`· ${t.title} — ${t.artist}`);
    out.push(`  ${t.license || 'CC BY'}${fromJamendo ? ' · Provided by Jamendo' : ''}`
      + `${t.source ? ` · ${t.source}` : ''}`);
  });
  out.push('');
  out.push('모든 음원은 상업적 이용이 허용된 라이선스로만 골랐습니다.');
  out.push('');
  out.push('━━━━━━━━━━━━━━━━');
  out.push('');
}
out.push('minimalbreeze');
/* 앞의 두 개는 채널 공통이라 고정한다. 다만 --tags 에 이미 들어 있으면
 * 두 번 찍히므로 중복을 걷어낸다. 유튜브에서 같은 태그가 두 번 보이면
 * 성의 없어 보인다. */
const tagList = `#플레이리스트 #playlist ${TAGS}`.split(/\s+/).filter(Boolean);
const seenTag = new Set();
out.push(tagList.filter((t) => {
  const k = t.toLowerCase();
  if (seenTag.has(k)) return false;
  seenTag.add(k); return true;
}).join(' '));

if (LEAD) out.unshift(`${LEAD} · ${Math.round(at / 60)}분`, '');

console.log(out.join('\n'));
