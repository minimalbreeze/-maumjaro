// 중계 배너 검사.
//
// 가장 중요한 원칙: 주소를 만들어내지 않는다.
// 설정에 없는 종목은 배너를 아예 넣지 않는다. 없는 링크를 배너로 거는 것은
// 독자를 속이는 일이고, 깨진 링크는 검색 순위에도 나쁘다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickWatchLinks, watchBannerHtml, loadWatchLinks, 낱말로있나, WATCH_MARK } from '../src/seo/watch-banner.mjs';
import { planPlacements, insertMarks } from '../src/images/embed.mjs';
import { markdownToBlocks } from '../src/wordpress/draft.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[중계 배너]');

check('설정에 있는 종목은 배너 링크를 찾는다', () => {
  const e = pickWatchLinks('농구');
  assert.ok(e?.primary?.url, '농구 링크가 없습니다');
  assert.ok(/^https:\/\//.test(e.primary.url), e.primary.url);
});

check('설정에 없는 종목은 배너를 넣지 않는다', () => {
  assert.equal(pickWatchLinks('바둑'), null);
  assert.equal(pickWatchLinks('존재하지않는종목'), null);
  assert.equal(watchBannerHtml(null), '');
});

check('설정의 모든 링크가 https 절대주소다', () => {
  const cfg = loadWatchLinks();
  for (const [name, e] of Object.entries(cfg.byCategory || {})) {
    const urls = [e.primary?.url, ...(e.secondary || []).map((s) => s.url)].filter(Boolean);
    assert.ok(urls.length, `${name}: 링크가 없습니다`);
    for (const u of urls) assert.ok(/^https:\/\/[^\s"']+$/.test(u), `${name}: ${u}`);
  }
});

check('설정의 모든 항목에 확인일이 적혀 있다', () => {
  // 링크는 시간이 지나면 죽는다. 언제 확인했는지 남겨두지 않으면
  // 아무도 다시 확인하지 않는다.
  const cfg = loadWatchLinks();
  for (const [name, e] of Object.entries(cfg.byCategory || {})) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(e.확인일 || ''), `${name}: 확인일이 없습니다`);
  }
});

const 배너 = watchBannerHtml(pickWatchLinks('농구'));

check('배너가 워드프레스 html 블록으로 나온다', () => {
  assert.ok(배너.startsWith('<!-- wp:html -->'), 배너.slice(0, 40));
  assert.ok(배너.trimEnd().endsWith('<!-- /wp:html -->'));
});

check('바깥 링크에 nofollow를 붙인다', () => {
  const links = 배너.match(/<a [^>]*>/g) || [];
  assert.ok(links.length >= 1, '링크가 없습니다');
  for (const a of links) assert.ok(/rel="[^"]*nofollow/.test(a), a);
});

check('링크를 현재 창에서 연다', () => {
  // 새 창으로 띄우면 독자가 원래 글로 돌아오는 길을 잃는다.
  assert.ok(!/target=/.test(배너), 배너.match(/<a [^>]*>/g)?.join('\n'));
  // target이 없으면 noopener도 필요 없다 — 그건 새 창을 띄울 때만 쓰는 것이다.
  assert.ok(!/noopener/.test(배너), '쓸모없는 noopener가 남아 있습니다');
});

check('태그 속성이 깨지지 않았다', () => {
  // 실제로 당한 일: 수정하다가 style=""display:... 로 따옴표가 겹쳐
  // 버튼 스타일이 통째로 날아갔다. 눈으로 보기 전에는 몰랐다.
  assert.ok(!/=""[^>]/.test(배너), '빈 따옴표 뒤에 값이 붙어 있습니다');
  for (const tag of 배너.match(/<(a|div|p)\s[^>]*>/g) || []) {
    const quotes = (tag.match(/"/g) || []).length;
    assert.equal(quotes % 2, 0, `따옴표 짝이 안 맞습니다: ${tag.slice(0, 120)}`);
  }
});

check('버튼에 스타일이 살아 있다', () => {
  const 버튼 = /<a [^>]*display:inline-block[^>]*>/.test(배너);
  assert.ok(버튼, '버튼 스타일이 사라졌습니다');
});

check('글 제목을 배너 안에 다시 쓰지 않는다', () => {
  // 글 제목이 길면 카드 안에서 두세 줄로 접혀 어색하고, 바로 그 글을 읽는
  // 중이라 같은 말이 두 번 나오는 셈이었다. 운영자가 "이상해"라고 짚었다.
  // 무엇의 중계인지는 CTA 글귀와 hint 가 말해 준다.
  const e = pickWatchLinks('농구');
  assert.ok(배너.includes(e.primary.text), 'CTA 글귀가 없습니다');
  assert.ok(배너.includes(e.primary.hint), 'hint 가 없습니다');
  assert.equal(watchBannerHtml(e, { title: '2026 KB국민은행 박신자컵' }).includes('박신자컵'), false,
    '제목을 넘기면 아직 실립니다');
});

check('설정에 든 따옴표·태그가 HTML을 깨지 않는다', () => {
  const b = watchBannerHtml({
    primary: { text: '"따옴표" & <태그> 보기', url: 'https://example.com/?a=1&b=2', hint: '<b>굵게</b>' },
    secondary: [{ text: '<i>기울임</i>', url: 'https://example.com/x?y=1&z=2' }],
  });
  assert.ok(!/<태그>|<b>굵게|<i>기울임/.test(b), '태그가 그대로 들어갔습니다');
  assert.ok(b.includes('&quot;따옴표&quot;'), b.slice(0, 400));
  assert.ok(b.includes('a=1&amp;b=2'), '주소의 &가 안 바뀌었습니다');
});

// ── 본문 어디에 들어가는가 ─────────────────────────────────
const 본문 = [
  '핵심 요약입니다.',
  '## ✨ 개요', '개요 내용',
  '## 🌟 선수', '선수 내용',
  '## 📌 배경', '배경 내용',
  '## 🎯 분석', '분석 내용',
  '## ❓ 자주 묻는 질문', '**Q. 언제?**', '10월 3일입니다.',
  '## 🔥 누가 웃을까', '끝',
].join('\n\n');

check('배너를 글 중간(두 번째 소제목 앞)에 넣는다', () => {
  const plan = planPlacements(본문, { sectionImages: 1, withAd: true, withWatch: true });
  const marked = insertMarks(본문, plan);
  const lines = marked.split('\n');
  const at = lines.findIndex((l) => l === WATCH_MARK);
  assert.ok(at > 0, '배너 자리가 없습니다');
  const 앞 = lines.slice(0, at).filter((l) => /^##\s/.test(l)).length;
  assert.equal(앞, 1, `소제목 ${앞}개 뒤에 들어갔습니다 (두 번째 소제목 앞이어야 합니다)`);
});

check('광고와 같은 자리에 겹치지 않는다', () => {
  const plan = planPlacements(본문, { sectionImages: 1, withAd: true, withWatch: true });
  assert.notEqual(plan.watchBeforeLine, plan.adBeforeLine, '배너와 광고가 같은 자리입니다');
});

check('본문 카드와도 겹치지 않는다', () => {
  const plan = planPlacements(본문, { sectionImages: 1, withAd: true, withWatch: true });
  const 자리 = [plan.adBeforeLine, plan.watchBeforeLine, ...plan.sections.map((h) => h.index)];
  assert.equal(new Set(자리).size, 자리.length, `겹칩니다: ${자리.join(',')}`);
});

check('배너를 안 넣으면 자리도 잡지 않는다', () => {
  const plan = planPlacements(본문, { sectionImages: 1, withAd: true, withWatch: false });
  assert.equal(plan.watchBeforeLine, null);
  assert.ok(!insertMarks(본문, plan).includes(WATCH_MARK));
});

check('링크가 없는 종목이면 자리표시자가 조용히 사라진다', () => {
  const plan = planPlacements(본문, { sectionImages: 0, withAd: false, withWatch: true });
  const html = markdownToBlocks(insertMarks(본문, plan), { watchHtml: '' });
  assert.ok(!html.includes('WATCH'), '자리표시자가 본문에 남았습니다');
});

check('배너가 최종 HTML에 실린다', () => {
  const plan = planPlacements(본문, { sectionImages: 0, withAd: false, withWatch: true });
  const html = markdownToBlocks(insertMarks(본문, plan), { watchHtml: 배너 });
  assert.ok(html.includes('youtube.com/@WKBL_official'), '링크가 없습니다');
  assert.ok(!html.includes('&lt;!--WATCH--&gt;'), '자리표시자가 글자로 새어나왔습니다');
});

check('설정 파일이 주석으로 원칙을 남겨둔다', () => {
  const raw = fs.readFileSync(path.join(HERE, '..', 'config', 'watch-links.json'), 'utf8');
  assert.ok(/만들어내지 않는다|확인한/.test(raw), '원칙 설명이 빠졌습니다');
});

// ── 한 카테고리에 리그가 둘일 때 ────────────────────────────
// '농구'에는 KBL(남자)과 WKBL(여자)이 같이 들어가고 중계처가 다르다.
// 카테고리만 보고 고르면 KBL 글에 여자농구 배너가 붙는다 — 눌러도 그 경기가 없다.
{
  const 설정 = {
    byCategory: {
      농구: {
        match: [{
          keywords: ['KBL', '부산 KCC', '창원 LG'],
          primary: { text: 'tvN SPORTS', url: 'https://tvnsports.cjenm.com/ko/' },
        }],
        primary: { text: '여농티비', url: 'https://www.youtube.com/@WKBL_official/streams' },
      },
      바둑: { note: '중계 링크 없음' },
    },
  };

  check('KBL 글에는 KBL 중계처가 붙는다', () => {
    const r = pickWatchLinks('농구', { config: 설정, text: '2026-27 KBL 부산 KCC 경기일정' });
    assert.ok(r.primary.url.includes('tvnsports'), r.primary.url);
  });

  check('여자농구 글에는 기본값이 붙는다', () => {
    const r = pickWatchLinks('농구', { config: 설정, text: '박신자컵 여자농구 결승' });
    assert.ok(r.primary.url.includes('WKBL'), r.primary.url);
  });

  check('글 내용을 안 주면 기본값으로 간다', () => {
    const r = pickWatchLinks('농구', { config: 설정 });
    assert.ok(r.primary.url.includes('WKBL'), r.primary.url);
  });

  check('primary 가 없는 카테고리는 배너를 안 넣는다', () => {
    assert.equal(pickWatchLinks('바둑', { config: 설정, text: '바둑 대회' }), null);
    assert.equal(pickWatchLinks('없는종목', { config: 설정, text: 'x' }), null);
  });

  check('실제 설정에서 KBL과 WKBL이 갈린다', () => {
    const kbl = pickWatchLinks('농구', { text: '2026-27 KBL 창원 LG 중계' });
    const wkbl = pickWatchLinks('농구', { text: '박신자컵 여자농구' });
    assert.notEqual(kbl.primary.url, wkbl.primary.url, '둘이 같은 곳을 가리킵니다');
  });
}

check('KBL은 WKBL 안에 들어 있다 — 낱말로만 본다', () => {
  // 글자 포함으로 보면 여자농구(WKBL) 글이 남자농구 항목에 걸려 tvN SPORTS
  // 배너가 붙는다. 독자가 눌러도 그 경기가 없다.
  assert.ok(!낱말로있나('WKBL 개막 일정', 'KBL'));
  assert.ok(낱말로있나('2026-27 KBL이 개막했다', 'KBL'));
  assert.ok(낱말로있나('창원 LG가 이겼다', '창원 LG'));
  assert.ok(!낱말로있나('', 'KBL'));
});

check('WKBL 글에는 여농티비가 붙는다', () => {
  const r = pickWatchLinks('농구', { text: 'WKBL 청주 KB 개막 일정·중계' });
  assert.match(r.primary.url, /WKBL_official/, r.primary.url);
});

check('KBL 글에는 tvN SPORTS가 붙는다', () => {
  const r = pickWatchLinks('농구', { text: '2026-27 KBL 부산 KCC 경기일정·중계' });
  assert.equal(r.primary.url, 'https://tvnsports.cjenm.com/ko/');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
