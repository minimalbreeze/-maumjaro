// 사이트맵이 구글에 **URL 을 실제로 주고 있는지** 본다. 아무것도 고치지 않는다.
//
//   node src/wordpress/sitemap-check.mjs
//
// 왜 필요한가
//   2026-10-20 서치콘솔: 제출한 /sitemap.xml 의 "발견된 총 페이지 수 0",
//   "읽은 사이트맵 0행". 상태는 "색인 처리 완료" 인데 **URL 이 하나도 없다.**
//   같은 날 발행글은 651편이고 구글이 아는 페이지는 161개뿐이었다.
//   빈 봉투를 제출해 두고 "구글이 안 가져간다" 고 말하고 있던 셈이다.
//
//   워드프레스는 사이트맵 주소가 여럿이다. 플러그인마다 다르고, 어떤 주소는
//   빈 껍데기이거나 다른 주소로 넘긴다. 그래서 **후보를 전부 받아 보고
//   URL 수를 센다.** 어느 주소를 제출해야 하는지가 그걸로 정해진다.
//
// 지키는 선
//   - **읽기만 한다.** POST 가 이 파일에 없다. 서치콘솔에 제출하는 일은
//     사람이 한다 — 우리는 구글 서치콘솔 API 를 쓰지 않는다.
//   - 받은 XML 을 그대로 믿지 않고 <loc> 개수를 직접 센다.
//   - 사이트맵 색인(sitemapindex)이면 하위 사이트맵도 한 단계 따라간다.
//   - 못 받은 주소는 "없음" 이 아니라 **왜 못 받았는지**를 적는다.

import { wpConfig } from './client.mjs';

/** 워드프레스에서 흔히 쓰는 사이트맵 주소들. 앞에 적은 것이 더 흔하다. */
export const 후보주소 = [
  '/sitemap_index.xml',   // Rank Math · Yoast 기본
  '/wp-sitemap.xml',      // 워드프레스 5.5+ 기본
  '/sitemap.xml',         // 지금 서치콘솔에 제출돼 있는 주소
  '/sitemap-index.xml',
  '/post-sitemap.xml',
];

/** XML 에서 <loc> 주소를 뽑는다. 태그 사이 공백·줄바꿈을 견딘다. */
export function loc뽑기(xml) {
  const s = String(xml || '');
  return [...s.matchAll(/<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

/** 사이트맵 색인인가(하위 사이트맵 목록), 아니면 URL 목록인가. */
export function 사이트맵종류(xml) {
  const s = String(xml || '');
  if (/<sitemapindex[\s>]/i.test(s)) return '색인';
  if (/<urlset[\s>]/i.test(s)) return '주소목록';
  return '모름';
}

/** robots.txt 에 적힌 Sitemap: 줄. 구글이 가장 먼저 보는 곳 중 하나다. */
export function robots사이트맵(text) {
  return [...String(text || '').matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)].map((m) => m[1]);
}

async function 받기(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'maumjaro-sitemap-check/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text };
  } catch (err) {
    return { ok: false, status: 0, url, 오류: err.message };
  }
}

async function main() {
  const base = wpConfig().base.replace(/\/+$/, '');
  console.log('\n────────────────────────────────────────────────────────');
  console.log('🗺  사이트맵 점검 (고치지 않음 · 비용 0원)');
  console.log(`   대상: ${new URL(base).host}`);
  console.log('────────────────────────────────────────────────────────');

  // robots.txt 가 가리키는 주소를 먼저 본다 — 구글이 보는 것과 같은 순서다.
  const robots = await 받기(`${base}/robots.txt`);
  const robots적힌것 = robots.ok ? robots사이트맵(robots.text) : [];
  console.log(`\nrobots.txt: ${robots.ok ? `${robots.status} · Sitemap 줄 ${robots적힌것.length}개` : `못 받음 (${robots.오류 || robots.status})`}`);
  for (const u of robots적힌것) console.log(`   → ${u}`);

  const 볼것 = [...new Set([...robots적힌것, ...후보주소.map((p) => base + p)])];
  const 결과 = [];

  for (const url of 볼것) {
    const r = await 받기(url);
    if (!r.ok) {
      결과.push({ url, 상태: `못 받음 (${r.오류 || r.status})`, 수: 0 });
      continue;
    }
    const 종류 = 사이트맵종류(r.text);
    const locs = loc뽑기(r.text);

    if (종류 !== '색인') {
      결과.push({ url, 상태: `${종류} · ${r.status}`, 수: locs.length });
      continue;
    }

    // 색인이면 하위를 한 단계 따라가 URL 을 합친다.
    let 합 = 0;
    const 하위들 = [];
    for (const 하위 of locs) {
      const h = await 받기(하위);
      const n = h.ok ? loc뽑기(h.text).length : 0;
      하위들.push(`${하위.replace(base, '')} ${h.ok ? `${n}개` : `못 받음(${h.오류 || h.status})`}`);
      합 += n;
    }
    결과.push({ url, 상태: `색인 · 하위 ${locs.length}개`, 수: 합, 하위: 하위들 });
  }

  for (const r of 결과) {
    console.log(`\n   ${r.수 ? '✅' : '❌'} ${r.url.replace(base, '') || '/'}`);
    console.log(`      ${r.상태} · 주소 ${r.수}개`);
    for (const h of r.하위 || []) console.log(`        · ${h}`);
  }

  // 숫자를 맨 끝에 다시 찍는다 — GitHub 로그 요약은 tail -60 만 보여준다.
  const 최고 = 결과.reduce((a, b) => (b.수 > (a?.수 ?? -1) ? b : a), null);
  console.log('\n▶ 주소를 가장 많이 담은 사이트맵');
  if (!최고 || !최고.수) {
    console.log('   없습니다. **어떤 주소에서도 URL 을 한 개도 못 찾았습니다.**');
    console.log('   사이트맵이 꺼져 있거나 막혀 있습니다. 구글은 링크로만 글을 찾게 됩니다.');
  } else {
    console.log(`   ${최고.url}  →  ${최고.수}개`);
    console.log('   서치콘솔 Sitemaps 에 **이 주소**를 제출하세요.');
  }
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
