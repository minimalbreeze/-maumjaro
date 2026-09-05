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
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:14.5px;background:var(--card);
 border-radius:12px;overflow:hidden}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;word-break:keep-all}
th{background:#faf5ef;font-weight:800;font-size:13.5px;white-space:nowrap}
td a{color:var(--tx)}
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

// 네 글자가 각각 무엇을 가리키는지. 유형 페이지에서 글자별로 풀어 쓸 때 쓴다.
// 이건 MBTI 이론 자체의 정의라 앱 데이터가 아니라 여기 둔다(앱과 어긋날 일이 없다).
const AXIS_DEF = {
  E: { name: '외향', line: '에너지가 밖으로 향합니다. 사람을 만나고 나면 채워지는 쪽입니다.' },
  I: { name: '내향', line: '에너지가 안으로 향합니다. 혼자 있는 시간에 채워지는 쪽입니다.' },
  S: { name: '감각', line: '실제로 보고 겪은 것에서 출발합니다. 구체적인 예시가 있어야 이해가 됩니다.' },
  N: { name: '직관', line: '가능성과 의미에서 출발합니다. 큰 그림을 먼저 잡아야 이해가 됩니다.' },
  T: { name: '사고', line: '판단 기준이 논리와 일관성입니다. 맞고 틀림을 먼저 봅니다.' },
  F: { name: '감정', line: '판단 기준이 사람과 관계입니다. 누가 어떻게 느낄지를 먼저 봅니다.' },
  J: { name: '판단', line: '정해두고 움직여야 편합니다. 마무리를 지어야 마음이 놓입니다.' },
  P: { name: '인식', line: '열어두고 움직여야 편합니다. 상황을 보며 정하는 쪽입니다.' },
};
const AXIS_PAIR = [['E', 'I'], ['S', 'N'], ['T', 'F'], ['J', 'P']];

function mbtiPages(D) {
  const { MBTI_TYPES, MBTI_MATCH, TYPE_TELLS, TYPE_GROUPS, BLOOD_TYPES, BLOOD_MBTI_MIX,
    MBTI_QUESTION_POOL, MATCH_AXIS_LINES, MATCH_CAUTION } = D;
  const groupOf = {};
  TYPE_GROUPS.forEach((g) => g.types.forEach((t) => { groupOf[t] = g; }));
  const AXIS_KEY = ['EI', 'SN', 'TF', 'JP'];

  Object.keys(MBTI_TYPES).forEach((k) => {
    const t = MBTI_TYPES[k];
    const m = MBTI_MATCH[k] || { best: [], grow: [] };
    const tells = TYPE_TELLS[k] || [];
    const g = groupOf[k];
    const url = `/mbti/${k.toLowerCase()}/`;
    const letters = k.split('');

    // 상대 유형 15개 전부에 대해 축이 몇 개나 같은지로 관계를 설명한다.
    const others = Object.keys(MBTI_TYPES).filter((x) => x !== k);
    const rows = others.map((x) => {
      const same = letters.filter((c, i) => x[i] === c).length;
      let tag = '';
      if (m.best.includes(x)) tag = '잘 맞음';
      else if (m.grow.includes(x)) tag = '배우는 사이';
      else if (same >= 3) tag = '비슷함';
      else if (same <= 1) tag = '많이 다름';
      else tag = '보통';
      return { x, same, tag };
    });

    const body = `
<div class="card">
  <p class="k">${esc(k)} 한 줄 요약</p>
  <p style="margin:0;font-size:17px;font-weight:700;">${esc(t.trait)}</p>
</div>

<h2>${esc(k)} 성격 특징</h2>
<p><strong>${esc(k)}</strong>는 맘운자로에서 <strong>${esc(t.name)}</strong>이라고 부릅니다. ${esc(t.trait)}</p>
${g ? `<p>${esc(k)}는 <strong>${esc(g.emoji)} ${esc(g.label)}</strong> 기질군에 속합니다. 이 무리는 ${esc(g.desc)}이고, ${esc(g.types.filter((x) => x !== k).map((x) => `${x}(${MBTI_TYPES[x].name})`).join(', '))}가 같은 결을 공유합니다.</p>` : ''}
<ul>
  <li><strong>강점</strong> — ${esc(t.strong)}</li>
  <li><strong>약한 지점</strong> — ${esc(t.weak)}</li>
</ul>
<p>강점과 약점은 따로 있는 게 아닙니다. ${esc(t.strong)}는 성격이 잘 작동할 때의 모습이고, ${esc(t.weak)}는 같은 성격이 과하게 돌 때의 모습입니다. 하나를 없애려 하면 다른 하나도 같이 사라집니다.</p>

<h2>${esc(k)} 네 글자 뜻</h2>
<p>${esc(k)}를 한 글자씩 뜯어보면 이 유형이 왜 그렇게 움직이는지가 보입니다.</p>
${letters.map((c, i) => {
  const opp = AXIS_PAIR[i][0] === c ? AXIS_PAIR[i][1] : AXIS_PAIR[i][0];
  return `<h3>${esc(c)} — ${esc(AXIS_DEF[c].name)}</h3>
<p>${esc(AXIS_DEF[c].line)} 반대쪽인 ${esc(opp)}(${esc(AXIS_DEF[opp].name)})는 ${esc(AXIS_DEF[opp].line)}</p>`;
}).join('')}

<h2>${esc(k)}는 이런 게 보입니다</h2>
<p>성격 설명은 본인이 읽을 때만 쓸모가 있습니다. 주변 사람이 ${esc(k)}인지 알아보려면 말이 아니라 <strong>행동</strong>을 봐야 합니다. 맘운자로가 정리한 관찰 단서는 이렇습니다.</p>
<div class="tells"><ul style="margin:0">${tells.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
<p>이 두 가지가 동시에 보이면 ${esc(k)}일 가능성이 꽤 높습니다. 다만 사람을 네 글자로 다 알 수는 없으니 대화의 실마리 정도로만 쓰세요.</p>

<h2>${esc(k)}가 자주 앓는 것</h2>
<p>${esc(t.ache)}</p>
<p>${esc(t.name)}에게 이 지점은 병이라기보다 <strong>성격의 부작용</strong>에 가깝습니다. ${esc(t.strong)}가 세게 작동하는 날일수록 같이 따라옵니다. 맘운자로에서는 이럴 때 어떤 마음 처방이 맞는지까지 이어서 알려줍니다.</p>

<h2>${esc(k)} 궁합 — 16유형 전부</h2>
<p><strong>가장 잘 맞는 유형</strong>은 ${m.best.map((x) => `<a href="/mbti/${x.toLowerCase()}/">${esc(x)}</a>(${esc(MBTI_TYPES[x].name)})`).join(', ')}입니다. ${m.best[0] ? esc(MBTI_TYPES[m.best[0]].trait) : ''}</p>
<p><strong>부딪히지만 배우는 유형</strong>은 ${m.grow.map((x) => `<a href="/mbti/${x.toLowerCase()}/">${esc(x)}</a>(${esc(MBTI_TYPES[x].name)})`).join(', ')}입니다. 편하지는 않아도 서로에게 없는 걸 갖고 있습니다.</p>
<div class="tw"><table>
  <thead><tr><th>상대 유형</th><th>같은 글자</th><th>관계</th></tr></thead>
  <tbody>${rows.map((r) => `<tr><td><a href="/mbti/${r.x.toLowerCase()}/">${esc(r.x)}</a> ${esc(MBTI_TYPES[r.x].name)}</td><td>${r.same}/4</td><td>${esc(r.tag)}</td></tr>`).join('')}</tbody>
</table></div>

<h2>축이 다를 때 무슨 일이 생기나</h2>
<p>궁합은 "잘 맞는다/안 맞는다"보다 <strong>어느 축이 다른가</strong>로 보는 게 정확합니다. 축마다 부딪히는 지점이 다릅니다.</p>
${AXIS_KEY.map((ax) => `<h3>${esc(ax[0])}/${esc(ax[1])}가 다를 때</h3>
<p>${esc(MATCH_AXIS_LINES[`${ax}-diff`] || '')}</p>
<p><strong>조심할 점</strong> — ${esc(MATCH_CAUTION[ax] || '')}</p>`).join('')}

<h2>${esc(k)}와 혈액형 조합</h2>
<p>혈액형 성격론은 과학적 근거가 없습니다. 다만 같은 ${esc(k)}라도 결이 조금씩 달라 보이는 이유를 설명하는 재미로는 쓸 만합니다.</p>
<ul>${BLOOD_TYPES.map((b) => {
  const mix = g ? BLOOD_MBTI_MIX[`${b.key}-${g.key}`] : null;
  return mix ? `<li><strong>${esc(b.name)} × ${esc(k)}</strong> — ${esc(mix)}</li>` : '';
}).join('')}</ul>

<h2>내 유형이 ${esc(k)}인지 확인하려면</h2>
<p>맘운자로의 마음유형 시험지는 <strong>한 장에 한 문제씩</strong>, 총 12문제입니다. 심리검사 문투 대신 실제로 겪는 상황으로 묻습니다. 예를 들면 이렇습니다.</p>
<ul>${AXIS_KEY.map((ax) => {
  const q = (MBTI_QUESTION_POOL[ax] || [])[0];
  return q ? `<li>"${esc(q.q)}" → ${esc(q.ao)} / ${esc(q.bo)}</li>` : '';
}).join('')}</ul>
<p>32문항 풀에서 매번 12개를 새로 뽑기 때문에 <strong>볼 때마다 다른 문제</strong>가 나옵니다. 무료이고 가입도 필요 없습니다.</p>

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

// 카드가 어느 처방 카테고리로 이어지는지 → 사람이 읽을 말로 바꾼다.
const RX_LABEL = {
  emotion: '마음이 흔들릴 때', work: '일이 안 풀릴 때', love: '연애가 어려울 때',
  money: '돈 걱정이 있을 때', food: '먹는 걸로 푸는 날', travel: '떠나고 싶을 때',
  daily: '평범한 하루에', sleep: '쉬어야 할 때', social: '사람이 힘들 때',
  study: '집중이 안 될 때', fun: '재미가 필요할 때', random: '무엇이든 좋을 때',
};

function tarotPages(D) {
  const { TAROT_MAJOR, TAROT_TOPICS } = D;
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

<h2>세 자리 중 어디에 나왔는가</h2>
<p>타로는 한 장으로 답을 내지 않습니다. 맘운자로는 <strong>3장</strong>을 뽑아 자리별로 읽습니다. 같은 ${esc(c.name)}라도 어느 자리에 오느냐에 따라 뜻이 달라집니다.</p>
<h3>첫째 자리 — 지금 내 마음</h3>
<p>여기에 ${esc(c.name)}가 왔다면, 지금 내 안에서 <strong>${esc(up.keyword)}</strong>이 이미 작동하고 있다는 뜻입니다. 스스로는 아직 이름을 못 붙였을 수 있습니다.</p>
<h3>둘째 자리 — 우리 사이의 흐름</h3>
<p>상황이나 관계가 <strong>${esc(up.keyword)}</strong> 쪽으로 흐르고 있습니다. 내가 만든 흐름이 아니라 이미 굴러가고 있는 것이라, 막기보다 올라타는 편이 낫습니다.</p>
<h3>셋째 자리 — 내가 할 수 있는 것</h3>
<p>가장 실천에 가까운 자리입니다. ${esc(up.line)} 맘운자로는 이 세 번째 카드를 실제 <strong>마음 처방</strong>으로 이어줍니다.</p>

<h2>주제별로 ${esc(c.name)} 읽기</h2>
<p>맘운자로에서는 ${TAROT_TOPICS.length}가지 주제 중에 골라 카드를 뽑습니다. 같은 카드도 무엇을 물었는지에 따라 초점이 달라집니다.</p>
<ul>
  <li><strong>연애</strong> — ${esc(up.keyword)}가 관계에서 어떻게 드러나는지를 봅니다. ${esc(up.line)}</li>
  <li><strong>직업</strong> — 일에서의 ${esc(up.keyword)}입니다. 역방향이면 ${esc(rev.keyword)} 쪽을 점검할 때입니다.</li>
  <li><strong>재물</strong> — 돈의 흐름을 ${esc(up.keyword)}의 관점으로 봅니다.</li>
  <li><strong>마음</strong> — 지금 감정 상태 그 자체에 대한 답입니다.</li>
</ul>
<p>전체 주제는 ${esc(TAROT_TOPICS.map((t) => t.label).join(' · '))}입니다.</p>

<h2>${esc(c.name)}와 마음 처방</h2>
<p>맘운자로는 타로를 보고 끝내지 않습니다. ${esc(c.name)}가 세 번째 자리에 오면 <strong>${esc(RX_LABEL[c.rxCategory] || '오늘의')}</strong> 쓰는 마음 처방으로 이어집니다. 카드가 말한 것을 오늘 실제로 해볼 수 있는 한 가지로 바꿔주는 단계입니다.</p>

<h2>타로를 처음 보신다면</h2>
<p>메이저 아르카나는 22장으로, 인생의 큰 흐름을 다루는 카드들입니다. 0번 바보에서 시작해 21번 세계로 끝나는 하나의 이야기로 읽기도 합니다. ${esc(c.name)}는 그중 <strong>${c.id}번</strong>입니다.</p>
<p>맘운자로에서는 카드를 <strong>3번 섞고</strong>, 부채꼴로 펼쳐진 9장 중에서 <strong>직접 3장을 고릅니다</strong>. 고른 카드는 봉인되어 있다가 주사를 놓으면 열립니다. 무료이고 가입도 필요 없습니다.</p>

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

<h2>${esc(s.element)}의 별자리라는 것</h2>
<p>서양 점성술은 12별자리를 <strong>불·흙·바람·물</strong> 네 원소로 나눕니다. 원소가 그 사람이 세상을 대하는 기본 태도를 정합니다.</p>
<p>${esc(s.name)}가 속한 <strong>${esc(s.element)}</strong> 무리에는 ${esc(ZODIAC_SIGNS.filter((x) => x.element === s.element && x.key !== s.key).map((x) => x.name).join(', '))}가 함께 있습니다. 이 셋은 서로 다른 시기에 태어났지만 움직이는 방식이 닮아 있습니다.</p>

<h2>${esc(s.name)} 궁합 — 12별자리 전부</h2>
<p>원소 관계로 봅니다. <strong>불과 바람</strong>, <strong>흙과 물</strong>이 서로를 살리는 조합이고, <strong>불과 물</strong>, <strong>흙과 바람</strong>은 부딪힙니다. 같은 원소끼리는 편하지만 정체될 수 있고, 정반대 자리(6칸 차이)는 끌림과 긴장이 함께 옵니다.</p>
<div class="tw"><table>
  <thead><tr><th>상대</th><th>원소</th><th>궁합</th></tr></thead>
  <tbody>${ZODIAC_SIGNS.map((o) => {
    const l = ZODIAC_PAIR_LINES[`${s.element}-${o.element}`] || ZODIAC_PAIR_LINES[`${o.element}-${s.element}`];
    const mi = ZODIAC_SIGNS.indexOf(s), oi = ZODIAC_SIGNS.indexOf(o);
    let label = l ? `${'★'.repeat(l.stars)}${'☆'.repeat(5 - l.stars)}` : '-';
    if (o.key === s.key) label = '같은 별자리';
    else if (Math.abs(mi - oi) === 6) label = '정반대 자리 ★★★★☆';
    return `<tr><td><a href="/zodiac/${o.key}/">${esc(o.emoji)} ${esc(o.name)}</a></td><td>${esc(o.element)}</td><td>${label}</td></tr>`;
  }).join('')}</tbody>
</table></div>
<h3>가장 잘 맞는 조합</h3>
<ul>${best.map((p) => `<li><a href="/zodiac/${p.o.key}/">${esc(p.o.name)}</a> — ${esc(p.l.line)}</li>`).join('')}</ul>

<h2>${esc(s.name)} 오늘의 운세</h2>
<p>맘운자로에서 ${esc(s.name)}의 오늘 기운을 무료로 볼 수 있습니다. 생년월일만 한 번 넣으면 되고, <strong>태어난 시간은 몰라도 됩니다</strong>. 다른 별자리도 눌러서 비교할 수 있습니다.</p>
<p>하루의 기운은 ${Z.SIGN_DAY_SEED.length}가지 유형 중 하나로 나옵니다. 예를 들면 이런 날들입니다.</p>
<ul>${Z.SIGN_DAY_SEED.slice(0, 5).map((d) => `<li><strong>${esc(d.emoji)} ${esc(d.title)}</strong> — ${esc(d.advice)}</li>`).join('')}</ul>
<p>같은 별자리인 사람은 같은 날 같은 결과를 봅니다. 그래야 "나도 ${esc(s.name)}인데!" 하고 서로 얘기가 되기 때문입니다.</p>

<h2>${esc(s.name)}에게 맞는 마음 처방</h2>
<p>맘운자로는 운세를 보여주고 끝내지 않습니다. 오늘의 기운과 지금 마음을 합쳐 <strong>오늘 실제로 해볼 수 있는 한 가지</strong>를 처방으로 줍니다. ${esc(s.trait)}는 강점이지만, 그게 과하게 도는 날에 필요한 것도 함께 알려줍니다.</p>

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

<h2>띠 궁합은 어떻게 보는가</h2>
<p>띠 궁합은 기분으로 정하는 게 아닙니다. 십이지에는 <strong>삼합·육합·충·원진</strong>이라는 오래된 규칙이 있고, 맘운자로는 그걸 그대로 씁니다.</p>
<ul>
  <li><strong>삼합(三合)</strong> — 열두 지지를 넷씩 묶은 세 무리. 같은 무리끼리는 예로부터 최고 궁합으로 봅니다. ${esc(z.name)}는 ${esc(Z.SAMHAP.find((gg) => gg.includes(z.zhi)) ? Z.SAMHAP.find((gg) => gg.includes(z.zhi)).map((x) => CHINESE_ZODIAC.find((c) => c.zhi === x).name).join('·') : '')} 무리입니다.</li>
  <li><strong>육합(六合)</strong> — 둘씩 짝지어 서로를 돕는 여섯 쌍.</li>
  <li><strong>충(沖)</strong> — 정반대(여섯 칸 차이). 정면으로 부딪힙니다.</li>
  <li><strong>원진(怨嗔)</strong> — 큰 이유 없이 껄끄럽다고 보는 여섯 쌍.</li>
</ul>

<h2>${esc(z.name)} 궁합 — 12띠 전부</h2>
<div class="tw"><table>
  <thead><tr><th>상대</th><th>관계</th><th>궁합</th></tr></thead>
  <tbody>${CHINESE_ZODIAC.map((o) => {
    let k = 'plain';
    if (o.zhi === z.zhi) k = 'same';
    else if (inSam(z.zhi, o.zhi)) k = 'samhap';
    else if (inList(Z.YUKHAP, z.zhi, o.zhi)) k = 'yukhap';
    else if (inList(Z.CHUNG, z.zhi, o.zhi)) k = 'chung';
    else if (inList(Z.WONJIN, z.zhi, o.zhi)) k = 'wonjin';
    const d = Z.ANIMAL_PAIR_LINES[k];
    return `<tr><td><a href="/animal/${o.key}/">${esc(o.emoji)} ${esc(o.name)}</a></td><td>${esc(d.label)}</td><td>${'★'.repeat(d.stars)}${'☆'.repeat(5 - d.stars)}</td></tr>`;
  }).join('')}</tbody>
</table></div>

<h3>${esc(z.name)}와 잘 맞는 띠</h3>
<ul>${good.map((r) => `<li><a href="/animal/${r.o.key}/">${esc(r.o.name)}</a> (${esc(r.d.label)}) — ${esc(r.d.line)}</li>`).join('')}</ul>

<h3>${esc(z.name)}가 조심할 띠</h3>
<ul>${bad.map((r) => `<li><a href="/animal/${r.o.key}/">${esc(r.o.name)}</a> (${esc(r.d.label)}) — ${esc(r.d.line)}</li>`).join('')}</ul>
<p>충이나 원진이라고 해서 만나면 안 되는 사이는 아닙니다. 부딪히는 지점이 어디인지 미리 알고 있으면 대부분 넘어갑니다.</p>

<h2>${esc(z.name)} 오늘의 운세</h2>
<p>맘운자로에서 ${esc(z.name)}의 오늘 기운을 무료로 볼 수 있습니다. 생년월일을 넣으면 <strong>띠가 자동으로 계산</strong>됩니다. 태어난 시간은 몰라도 됩니다.</p>
<p>하루의 기운은 ${Z.SIGN_DAY_SEED.length}가지 유형 중 하나로 나옵니다.</p>
<ul>${Z.SIGN_DAY_SEED.slice(5, 10).map((d) => `<li><strong>${esc(d.emoji)} ${esc(d.title)}</strong> — ${esc(d.advice)}</li>`).join('')}</ul>

<h2>사주 궁합은 또 다릅니다</h2>
<p>띠 궁합은 태어난 <strong>해</strong>만 봅니다. 더 정확히 보려면 태어난 <strong>날</strong>까지 봐야 합니다. 맘운자로의 생년월일 궁합은 두 사람의 일간(태어난 날의 천간) 오행 관계를 보고, 띠 관계는 보조 점수로만 씁니다.</p>
<p>서로를 살리는 사이인지, 한쪽이 끌고 가는 사이인지까지 방향을 구분해서 알려줍니다.</p>

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
