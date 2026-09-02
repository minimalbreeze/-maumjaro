// 검색용 정적 페이지 생성기
//
// 왜 필요한가
//   맘운자로는 SPA라서 구글이 보는 것은 index.html 한 장, 그것도 버튼 라벨 1,283자뿐이다.
//   MBTI 16유형·타로 22장·별자리 12·띠 12·혈액형 4의 실제 내용은 전부 JS가 클릭 후에
//   그리기 때문에 크롤러에게는 존재하지 않는다. 그래서 구글이 "색인할 가치 없음"으로
//   판단하고 색인을 안 한다(네이버는 문턱이 낮아 되고 있다).
//
//   이 스크립트는 앱이 이미 갖고 있는 데이터로 서버가 바로 내려주는 HTML 페이지를 만든다.
//   페이지 1장 → 66장. 각 페이지는 하나의 검색 의도("INFP 특징", "바보 카드 의미")에
//   답하고, 하단에서 앱으로 보낸다.
//
// 원칙
//   - 내용을 여기에 베껴 쓰지 않는다. 전부 *-data.js에서 읽는다.
//     (베껴 두면 앱과 반드시 어긋난다 — fb-content.mjs와 같은 이유)
//   - 앱 코드는 한 줄도 건드리지 않는다. 읽기만 한다.
//   - 생성물은 리포에 커밋되어 GitHub Pages가 그대로 서빙한다. 빌드 도구 없음.
//
// 실행: node scripts/build-pages.mjs

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SITE = 'https://maumjaro.minimalbreeze.com';

// 브라우저용 IIFE를 가짜 window 위에서 실행해 데이터만 꺼낸다.
// 우리 리포의 파일만 대상으로 하며, 외부에서 받아온 코드는 실행하지 않는다.
async function loadData(file, key) {
  const src = await readFile(join(ROOT, file), 'utf8');
  const w = {};
  new Function('window', src)(w);
  const data = w[key];
  if (!data) throw new Error(`${file}에서 ${key}를 읽지 못했습니다.`);
  return data;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------- 페이지 껍데기 ----------
// 앱과 같은 팔레트를 쓰되 CSS는 이 파일 안에 인라인으로 둔다.
// style.css(80KB)를 불러오면 내용 없는 페이지에 앱 전체 스타일이 딸려와 느려진다.
function shell({ url, title, desc, h1, sub, body, breadcrumb, keywords }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
${keywords ? `<meta name="keywords" content="${esc(keywords)}" />` : ''}
<link rel="canonical" href="${SITE}${url}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${SITE}${url}" />
<meta property="og:image" content="${SITE}/og-image.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<style>
:root{--bg:#fff8f3;--card:#fff;--line:#efe2d6;--tx:#3d3324;--dim:#8a7355;--a:#ff9166;--b:#b779ef}
*{box-sizing:border-box}
body{margin:0;background:linear-gradient(180deg,#fff8f3,#ffeef5 60%,#f2ecfb);color:var(--tx);
 font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
 line-height:1.8;font-size:16px}
.wrap{max-width:720px;margin:0 auto;padding:20px 18px 60px}
nav.bc{font-size:13px;color:var(--dim);margin-bottom:18px}
nav.bc a{color:var(--dim)}
h1{font-size:26px;line-height:1.35;margin:0 0 6px}
.sub{color:var(--dim);font-size:15px;margin:0 0 24px}
h2{font-size:19px;margin:32px 0 10px;padding-top:4px}
h3{font-size:16px;margin:22px 0 8px}
p{margin:0 0 14px;word-break:keep-all}
ul{margin:0 0 16px;padding-left:20px}
li{margin-bottom:6px;word-break:keep-all}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin:18px 0}
.card .k{font-size:12.5px;font-weight:800;color:var(--a);margin:0 0 4px}
.tells{background:rgba(183,121,239,.07);border-radius:12px;padding:12px 16px 12px 30px;margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin:14px 0}
.grid a{display:block;padding:11px 12px;border-radius:12px;background:var(--card);
 border:1px solid var(--line);color:var(--tx);text-decoration:none;font-size:14px;font-weight:600}
.cta{display:block;text-align:center;margin:30px 0 10px;padding:16px;border-radius:14px;
 background:linear-gradient(135deg,var(--a),#ffc66b);color:#fff;font-weight:800;
 text-decoration:none;font-size:17px}
.note{font-size:13px;color:var(--dim);margin-top:26px}
footer{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);font-size:13px;color:var(--dim)}
footer a{color:var(--dim)}
</style>
</head>
<body>
<div class="wrap">
<nav class="bc">${breadcrumb}</nav>
<h1>${esc(h1)}</h1>
<p class="sub">${esc(sub)}</p>
${body}
<a class="cta" href="/">💉 맘운자로에서 직접 해보기</a>
<p class="note">설치도 가입도 없이 30초. 무료입니다.</p>
<footer>
  <p><a href="/">맘운자로 홈</a> · <a href="/guide/">전체 목록</a></p>
  <p>재미로 보는 콘텐츠입니다. 의학적·심리학적 진단이 아닙니다.</p>
</footer>
</div>
</body>
</html>`;
}

// ---------- 각 페이지 ----------
const pages = []; // { url, html }

function mbtiPages(D) {
  const { MBTI_TYPES, MBTI_MATCH, TYPE_TELLS, TYPE_GROUPS } = D;
  const groupOf = {};
  TYPE_GROUPS.forEach((g) => g.types.forEach((t) => { groupOf[t] = g; }));

  Object.keys(MBTI_TYPES).forEach((k) => {
    const t = MBTI_TYPES[k];
    const m = MBTI_MATCH[k] || { best: [], grow: [] };
    const tells = TYPE_TELLS[k] || [];
    const g = groupOf[k];
    const url = `/mbti/${k.toLowerCase()}/`;

    const body = `
<div class="card">
  <p class="k">${esc(k)} 한 줄 요약</p>
  <p style="margin:0;font-size:17px;font-weight:700;">${esc(t.trait)}</p>
</div>

<h2>${esc(k)} 성격 특징</h2>
<p>${esc(t.name)}. ${esc(t.trait)} ${g ? `${esc(g.label)} 기질군(${esc(g.types.join(', '))})에 속하며, ${esc(g.desc)}입니다.` : ''}</p>
<ul>
  <li><strong>강점</strong> — ${esc(t.strong)}</li>
  <li><strong>약한 지점</strong> — ${esc(t.weak)}</li>
</ul>

<h2>${esc(k)}는 이런 게 보입니다</h2>
<p>성격 설명은 본인이 읽을 때만 쓸모가 있습니다. 주변 사람이 ${esc(k)}인지 알아보려면 말이 아니라 행동을 봐야 합니다.</p>
<div class="tells"><ul style="margin:0">${tells.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>

<h2>${esc(k)}가 자주 앓는 것</h2>
<p>${esc(t.ache)}</p>
<p>${esc(t.name)}에게 이 지점은 성격의 부작용에 가깝습니다. 강점이 세게 작동할수록 같이 따라옵니다.</p>

<h2>${esc(k)} 궁합</h2>
<p><strong>잘 맞는 유형</strong> — ${m.best.map((x) => `<a href="/mbti/${x.toLowerCase()}/">${esc(x)}</a>(${esc(MBTI_TYPES[x].name)})`).join(', ')}</p>
<p><strong>부딪히지만 배우는 유형</strong> — ${m.grow.map((x) => `<a href="/mbti/${x.toLowerCase()}/">${esc(x)}</a>(${esc(MBTI_TYPES[x].name)})`).join(', ')}</p>
<p>맘운자로에서는 상대 유형을 직접 골라 16×16 궁합을 볼 수 있습니다. E/I·S/N·T/F·J/P 축마다 무엇이 맞고 무엇이 부딪히는지 나눠서 알려줍니다.</p>

<h2>다른 유형 보기</h2>
${TYPE_GROUPS.map((gr) => `
<h3>${esc(gr.emoji)} ${esc(gr.label)} — ${esc(gr.desc)}</h3>
<div class="grid">${gr.types.map((x) => `<a href="/mbti/${x.toLowerCase()}/">${esc(x)} ${esc(MBTI_TYPES[x].name)}</a>`).join('')}</div>`).join('')}

<p class="note">재미로 보는 간이 유형 설명입니다. 공식 MBTI® 검사와는 무관합니다.</p>`;

    pages.push({
      url,
      html: shell({
        url,
        title: `${k} 특징과 궁합 — ${t.name} | 맘운자로`,
        desc: `${k}(${t.name})의 성격 특징, 강점과 약점, 주변에서 알아보는 단서, 잘 맞는 유형까지. 무료 간이 유형 테스트도 함께.`,
        keywords: `${k}, ${k} 특징, ${k} 성격, ${k} 궁합, MBTI, MBTI 테스트, 무료 MBTI`,
        h1: `${k} — ${t.name}`,
        sub: t.trait,
        breadcrumb: `<a href="/">맘운자로</a> › <a href="/guide/">전체 목록</a> › MBTI › ${esc(k)}`,
        body,
      }),
    });
  });
}

function tarotPages(D) {
  const { TAROT_MAJOR } = D;
  TAROT_MAJOR.forEach((c) => {
    const slug = c.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const url = `/tarot/${slug}/`;
    const up = c.up || {};
    const rev = c.rev || {};
    const body = `
<div class="card">
  <p class="k">${esc(c.emoji)} ${esc(c.en)} · 메이저 아르카나 ${c.id}번</p>
  <p style="margin:0;font-size:17px;font-weight:700;">정방향 ${esc(up.keyword)} · 역방향 ${esc(rev.keyword)}</p>
</div>

<h2>${esc(c.name)} 정방향 의미 — ${esc(up.keyword)}</h2>
<p>${esc(up.line)}</p>
<p>${esc(c.name)}가 바로 선 채로 나왔다면 <strong>${esc(up.keyword)}</strong>이 지금 상황의 열쇠라는 뜻입니다. 카드가 재촉하는 쪽으로 한 걸음만 옮겨보라는 신호로 읽습니다.</p>

<h2>${esc(c.name)} 역방향 의미 — ${esc(rev.keyword)}</h2>
<p>${esc(rev.line)}</p>
<p>역방향은 나쁜 카드라는 뜻이 아닙니다. 같은 힘이 <strong>안쪽으로 향하거나 아직 덜 익었다</strong>는 표시에 가깝습니다.</p>

<h2>이 카드가 나왔다면</h2>
<p>타로는 한 장으로 답을 내지 않습니다. 맘운자로에서는 <strong>지금 내 마음 / 우리 사이의 흐름 / 내가 할 수 있는 것</strong> 세 자리로 3장을 뽑아 함께 읽습니다. ${esc(c.name)}가 어느 자리에 오느냐에 따라 읽는 방향이 달라집니다.</p>

<h2>다른 카드 보기</h2>
<div class="grid">${TAROT_MAJOR.map((x) => {
  const s = x.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `<a href="/tarot/${s}/">${esc(x.name)}</a>`;
}).join('')}</div>

<p class="note">카드 그림은 1909년 라이더-웨이트 판(퍼블릭 도메인)을 사용합니다.</p>`;

    pages.push({
      url,
      html: shell({
        url,
        title: `타로 ${c.name} 카드 의미 (정방향·역방향) | 맘운자로`,
        desc: `${c.name}(${c.en}) 카드의 정방향과 역방향 의미. 무료 타로 3장 뽑기도 함께.`,
        keywords: `${c.name}, ${c.name} 타로, ${c.name} 의미, 타로카드, 무료 타로, 타로점`,
        h1: `${c.name} · ${c.en}`,
        sub: `타로 메이저 아르카나 ${c.id}번 카드`,
        breadcrumb: `<a href="/">맘운자로</a> › <a href="/guide/">전체 목록</a> › 타로 › ${esc(c.name)}`,
        body,
      }),
    });
  });
}

function zodiacPages(Z) {
  const { ZODIAC_SIGNS, CHINESE_ZODIAC, ZODIAC_PAIR_LINES } = Z;

  ZODIAC_SIGNS.forEach((s) => {
    const url = `/zodiac/${s.key}/`;
    const pairs = ZODIAC_SIGNS.map((o) => {
      const l = ZODIAC_PAIR_LINES[`${s.element}-${o.element}`] || ZODIAC_PAIR_LINES[`${o.element}-${s.element}`];
      return l ? { o, l } : null;
    }).filter(Boolean);
    const best = pairs.filter((p) => p.l.stars >= 5).slice(0, 4);

    const body = `
<div class="card">
  <p class="k">${esc(s.range)} · ${esc(s.element)}의 별자리</p>
  <p style="margin:0;font-size:17px;font-weight:700;">${esc(s.trait)}</p>
</div>

<h2>${esc(s.name)} 성격</h2>
<p>${esc(s.name)}는 ${esc(s.range)} 사이에 태어난 사람입니다. 원소는 <strong>${esc(s.element)}</strong>, 핵심 키워드는 <strong>${esc(s.keyword)}</strong>입니다.</p>
<p>${esc(s.trait)}</p>

<h2>${esc(s.name)}와 잘 맞는 별자리</h2>
<p>서양 점성술은 원소 관계로 궁합을 봅니다. 불과 바람, 흙과 물이 서로를 살리는 조합입니다.</p>
<ul>${best.map((p) => `<li><a href="/zodiac/${p.o.key}/">${esc(p.o.name)}</a> — ${esc(p.l.line)}</li>`).join('')}</ul>

<h2>${esc(s.name)} 오늘의 운세</h2>
<p>맘운자로에서 ${esc(s.name)}의 오늘 기운을 무료로 볼 수 있습니다. 생년월일만 한 번 넣으면 되고, 태어난 시간은 몰라도 됩니다. 다른 별자리도 눌러서 비교할 수 있습니다.</p>

<h2>12별자리 전체</h2>
<div class="grid">${ZODIAC_SIGNS.map((x) => `<a href="/zodiac/${x.key}/">${esc(x.emoji)} ${esc(x.name)}</a>`).join('')}</div>`;

    pages.push({
      url,
      html: shell({
        url,
        title: `${s.name} 성격과 궁합 (${s.range}) | 맘운자로`,
        desc: `${s.name}(${s.range})의 성격 특징과 잘 맞는 별자리. 무료 오늘의 운세도 함께.`,
        keywords: `${s.name}, ${s.name} 성격, ${s.name} 궁합, ${s.name} 운세, 별자리 운세, 무료 운세`,
        h1: `${s.emoji} ${s.name}`,
        sub: `${s.range} · ${s.element}의 별자리 · ${s.keyword}`,
        breadcrumb: `<a href="/">맘운자로</a> › <a href="/guide/">전체 목록</a> › 별자리 › ${esc(s.name)}`,
        body,
      }),
    });
  });

  // 띠
  const inSam = (a, b) => Z.SAMHAP.some((g) => g.includes(a) && g.includes(b));
  const pk = (a, b) => [a, b].sort().join('-');
  const inList = (l, a, b) => l.some((p) => pk(p[0], p[1]) === pk(a, b));

  CHINESE_ZODIAC.forEach((z) => {
    const url = `/animal/${z.key}/`;
    const rel = CHINESE_ZODIAC.map((o) => {
      if (o.zhi === z.zhi) return null;
      let k = null;
      if (inSam(z.zhi, o.zhi)) k = 'samhap';
      else if (inList(Z.YUKHAP, z.zhi, o.zhi)) k = 'yukhap';
      else if (inList(Z.CHUNG, z.zhi, o.zhi)) k = 'chung';
      else if (inList(Z.WONJIN, z.zhi, o.zhi)) k = 'wonjin';
      return k ? { o, d: Z.ANIMAL_PAIR_LINES[k] } : null;
    }).filter(Boolean);
    const good = rel.filter((r) => r.d.stars >= 5);
    const bad = rel.filter((r) => r.d.stars <= 2);

    const body = `
<div class="card">
  <p class="k">십이지 ${esc(z.zhi)} · ${esc(z.keyword)}</p>
  <p style="margin:0;font-size:17px;font-weight:700;">${esc(z.trait)}</p>
</div>

<h2>${esc(z.name)} 성격</h2>
<p>${esc(z.name)}는 십이지의 <strong>${esc(z.zhi)}</strong>에 해당합니다. 핵심 키워드는 <strong>${esc(z.keyword)}</strong>이고, ${esc(z.trait)}</p>

<h2>${esc(z.name)}와 잘 맞는 띠</h2>
<p>띠 궁합은 임의로 정하는 것이 아니라 <strong>삼합·육합</strong>이라는 전통 규칙을 씁니다.</p>
<ul>${good.map((r) => `<li><a href="/animal/${r.o.key}/">${esc(r.o.name)}</a> (${esc(r.d.label)}) — ${esc(r.d.line)}</li>`).join('')}</ul>

<h2>${esc(z.name)}가 조심할 띠</h2>
<p><strong>충</strong>은 정면으로 부딪히는 자리, <strong>원진</strong>은 이유 없이 껄끄러운 자리로 봅니다.</p>
<ul>${bad.map((r) => `<li><a href="/animal/${r.o.key}/">${esc(r.o.name)}</a> (${esc(r.d.label)}) — ${esc(r.d.line)}</li>`).join('')}</ul>

<h2>${esc(z.name)} 오늘의 운세</h2>
<p>맘운자로에서 ${esc(z.name)}의 오늘 기운을 무료로 볼 수 있습니다. 생년월일을 넣으면 띠가 자동으로 계산됩니다.</p>

<h2>12띠 전체</h2>
<div class="grid">${CHINESE_ZODIAC.map((x) => `<a href="/animal/${x.key}/">${esc(x.emoji)} ${esc(x.name)}</a>`).join('')}</div>`;

    pages.push({
      url,
      html: shell({
        url,
        title: `${z.name} 성격과 띠 궁합 (삼합·육합·충) | 맘운자로`,
        desc: `${z.name}의 성격과 잘 맞는 띠, 조심할 띠. 삼합·육합·충·원진 전통 규칙 기준. 무료 띠별 운세도 함께.`,
        keywords: `${z.name}, ${z.name} 성격, ${z.name} 궁합, 띠 궁합, 띠별 운세, 삼합, 육합, 무료 운세`,
        h1: `${z.emoji} ${z.name}`,
        sub: `십이지 ${z.zhi} · ${z.keyword}`,
        breadcrumb: `<a href="/">맘운자로</a> › <a href="/guide/">전체 목록</a> › 띠 › ${esc(z.name)}`,
        body,
      }),
    });
  });
}

// 전체 목록 페이지 — 크롤러가 66장을 한 번에 발견하는 입구
function indexPage(M, T, Z) {
  const url = '/guide/';
  const slug = (c) => c.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const body = `
<p>맘운자로가 다루는 내용을 한곳에 모았습니다. 전부 앱에서 무료로 직접 볼 수 있습니다.</p>

<h2>MBTI 16유형</h2>
<div class="grid">${Object.keys(M.MBTI_TYPES).map((k) => `<a href="/mbti/${k.toLowerCase()}/">${esc(k)} ${esc(M.MBTI_TYPES[k].name)}</a>`).join('')}</div>

<h2>타로 메이저 아르카나 ${T.TAROT_MAJOR.length}장</h2>
<div class="grid">${T.TAROT_MAJOR.map((c) => `<a href="/tarot/${slug(c)}/">${esc(c.name)}</a>`).join('')}</div>

<h2>별자리 12</h2>
<div class="grid">${Z.ZODIAC_SIGNS.map((s) => `<a href="/zodiac/${s.key}/">${esc(s.emoji)} ${esc(s.name)}</a>`).join('')}</div>

<h2>띠 12</h2>
<div class="grid">${Z.CHINESE_ZODIAC.map((z) => `<a href="/animal/${z.key}/">${esc(z.emoji)} ${esc(z.name)}</a>`).join('')}</div>`;

  pages.push({
    url,
    html: shell({
      url,
      title: '무료 타로·MBTI·별자리·띠 전체 목록 | 맘운자로',
      desc: 'MBTI 16유형, 타로 메이저 아르카나, 별자리 12, 띠 12 전체 목록. 전부 무료로 볼 수 있습니다.',
      keywords: '무료 타로, MBTI 테스트, 별자리 운세, 띠별 운세, 무료 운세, 타로카드 의미',
      h1: '전체 목록',
      sub: 'MBTI · 타로 · 별자리 · 띠',
      breadcrumb: '<a href="/">맘운자로</a> › 전체 목록',
      body,
    }),
  });
}

// ---------- 실행 ----------
async function main() {
  const M = await loadData('mbti-data.js', 'MAUMJARO_MBTI_DATA');
  const T = await loadData('tarot-data.js', 'MAUMJARO_TAROT_DATA');
  const Z = await loadData('zodiac-data.js', 'MAUMJARO_ZODIAC_DATA');

  mbtiPages(M);
  tarotPages(T);
  zodiacPages(Z);
  indexPage(M, T, Z);

  // ⚠️ 여기서 폴더를 통째로 지우면 안 된다.
  //    처음엔 rm('tarot', {recursive:true})로 지웠는데, tarot/ 안에는 앱이 쓰는
  //    타로 카드 이미지 22장(tarot/fool.jpg …)이 이미 살고 있었다. 그걸 전부 날렸다.
  //    생성물과 원본 자산이 같은 폴더를 공유할 수 있으므로,
  //    "지난번에 내가 만든 것"만 정확히 지운다. 그 목록을 매니페스트로 남긴다.
  const MANIFEST = join(ROOT, 'scripts', '.pages-manifest.json');
  let prev = [];
  try { prev = JSON.parse(await readFile(MANIFEST, 'utf8')); } catch (e) { prev = []; }

  const nowUrls = new Set(pages.map((p) => p.url));
  for (const oldUrl of prev) {
    if (nowUrls.has(oldUrl)) continue;           // 이번에도 만드는 페이지는 건드리지 않는다
    const dir = join(ROOT, oldUrl.replace(/^\/|\/$/g, ''));
    // 우리가 만든 index.html 하나만 지우고, 폴더가 비면 폴더도 지운다.
    // 다른 파일(이미지 등)이 남아 있으면 폴더는 그대로 둔다.
    await rm(join(dir, 'index.html'), { force: true });
    try { await rm(dir, { recursive: false }); } catch (e) { /* 비어 있지 않으면 남긴다 */ }
  }

  for (const p of pages) {
    const dir = join(ROOT, p.url.replace(/^\/|\/$/g, ''));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), p.html, 'utf8');
  }
  await writeFile(MANIFEST, JSON.stringify(pages.map((p) => p.url), null, 2), 'utf8');

  // 사이트맵도 같이 갱신한다(따로 관리하면 반드시 어긋난다)
  const d = today();
  const urls = [
    `  <url>\n    <loc>${SITE}/</loc>\n    <lastmod>${d}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    ...pages.map((p) => {
      const pri = p.url === '/guide/' ? '0.9' : '0.7';
      return `  <url>\n    <loc>${SITE}${p.url}</loc>\n    <lastmod>${d}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
    }),
  ];
  await writeFile(join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<!--\n  이 파일은 scripts/build-pages.mjs가 생성한다. 손으로 고치면 덮어써진다.\n-->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
    'utf8');

  console.log(`페이지 ${pages.length}장 생성 + 사이트맵 ${pages.length + 1}개 URL`);
  const byKind = {};
  pages.forEach((p) => { const k = p.url.split('/')[1]; byKind[k] = (byKind[k] || 0) + 1; });
  console.log(byKind);
}

main().catch((e) => { console.error(e); process.exit(1); });
