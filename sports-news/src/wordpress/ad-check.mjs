// 광고가 실제로 페이지에 나가는지 들여다본다. 읽기만 한다 — 아무것도 고치지 않는다.
//
// 왜 필요한가
//   2026-10-09 에 운영자가 애드센스 게재율 63.04% 를 보고 "노출이 안 되는 것
//   같다"고 했다. 이 리포는 쿠팡 광고만 넣고 애드센스 코드는 넣지 않는다
//   (테마나 플러그인에 깔려 있다). 그래서 코드만 봐서는 알 수 없고, 실제로
//   발행된 페이지를 받아서 눈으로 확인해야 한다.
//
//   이 컨테이너는 바깥 주소가 막혀 있지만 GitHub Actions 러너는 사이트에 닿는다.
//
// 무엇을 하지 않는가
//   광고 코드를 넣거나 고치거나 지우지 않는다. 운영자가 "광고 관련해서는
//   건들지 말아줘"라고 했고, 이 파일은 그 선을 지킨다. 보기만 한다.

import { wpFetch } from './client.mjs';

const UA = 'Mozilla/5.0 (compatible; maumjaro-adcheck/1.0)';

async function 받기(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  return { status: res.status, ok: res.ok, text: res.ok ? await res.text() : '' };
}

/** ads.txt 를 본다. 없거나 비면 일부 광고 수요처가 입찰을 건너뛴다. */
export function readAdsTxt(text) {
  const 줄 = String(text || '').split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
  const google = 줄.filter((l) => /^google\.com\s*,/i.test(l));
  return {
    줄수: 줄.length,
    구글줄수: google.length,
    DIRECT: google.filter((l) => /\bDIRECT\b/i.test(l)).length,
    RESELLER: google.filter((l) => /\bRESELLER\b/i.test(l)).length,
    // 게시자 ID 는 ads.txt 가 원래 공개하는 값이지만, 로그에 통째로 흘리지 않는다.
    게시자ID있음: google.some((l) => /pub-\d{10,}/i.test(l)),
  };
}

/** 발행된 페이지 HTML 에서 광고 흔적을 센다. */
export function readAdMarkup(html) {
  const h = String(html || '');
  const 세기 = (re) => (h.match(re) || []).length;
  return {
    길이: h.length,
    애드센스스크립트: 세기(/adsbygoogle\.js/gi),
    광고슬롯: 세기(/<ins[^>]*class="[^"]*adsbygoogle/gi),
    push호출: 세기(/adsbygoogle\s*=\s*window\.adsbygoogle\s*\|\|\s*\[\]/gi),
    클라이언트ID있음: /data-ad-client\s*=|client=ca-pub-/i.test(h),
    쿠팡: 세기(/ads-partners\.coupang\.com/gi),
    // fix-links.mjs 와 같은 모양으로 쓴다. 공백이 끼어도 잡고(target = "_blank"),
    // "링크를 만들 때 target 을 쓰지 않는다"는 검사에도 걸리지 않는다 — 이 줄은
    // 링크를 만드는 게 아니라 세는 것이다.
    새창링크: 세기(/<a\s[^>]*target\s*=\s*["']\s*_blank/gi),
    // 본문이 거의 없으면 광고를 붙일 자리가 없어 게재율이 떨어진다.
    본문글자수: (h.replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ').trim()).length,
  };
}

/**
 * 테마 이름과 광고 플러그인 흔적을 HTML 에서 읽는다.
 *
 * "애드센스 가서 고쳐"는 답이 아니다. 어디에 어떻게 깔려 있는지를 알아야
 * 어느 스위치인지 말할 수 있다.
 */
export function readInstallHints(html) {
  const h = String(html || '');
  const 테마 = [...h.matchAll(/\/wp-content\/themes\/([^/'"?]+)/gi)].map((m) => m[1]);
  const 플러그인 = [...h.matchAll(/\/wp-content\/plugins\/([^/'"?]+)/gi)].map((m) => m[1]);
  const uniq = (a) => [...new Set(a)];
  // 광고를 넣는 흔한 플러그인들. 이 중 하나가 있으면 거기 설정에 스위치가 있다.
  const 광고플러그인후보 = /(google-site-kit|ad-inserter|advanced-ads|quick-adsense|wp-quads|easy-ads|adsense|ezoic|adrotate|insert-headers-and-footers|header-footer-code-manager|wpcode)/i;
  return {
    테마: uniq(테마),
    플러그인: uniq(플러그인),
    광고플러그인: uniq(플러그인).filter((n) => 광고플러그인후보.test(n)),
    사이트킷: /googlesitekit/i.test(h),
    구글소유확인: /google-site-verification/i.test(h),
  };
}

/** 글 하나를 공개 주소로 받아 광고 흔적을 센다. */
export async function checkPost(postId) {
  const { data: post } = await wpFetch(`/wp/v2/posts/${postId}`, { query: { context: 'edit' } });
  const link = post?.link;
  const title = post?.title?.raw || post?.title?.rendered || '';
  if (!link) return { id: postId, title, error: '공개 주소를 찾지 못했습니다' };
  const r = await 받기(link);
  if (!r.ok) return { id: postId, title, link, error: `페이지를 받지 못했습니다 (HTTP ${r.status})` };
  return { id: postId, title, link, status: post?.status, ...readAdMarkup(r.text) };
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);

  console.log('\n────────────────────────────────────────────────────────');
  console.log('📊 광고가 페이지에 실제로 나가는지 (읽기만 함 · 비용 0원)');
  console.log('────────────────────────────────────────────────────────');

  // ① ads.txt
  const base = (process.env.WORDPRESS_URL || '').replace(/\/+$/, '');
  if (!base) {
    console.log('\n[ads.txt] WORDPRESS_URL 이 없어 건너뜁니다');
  } else {
    try {
      const r = await 받기(`${base}/ads.txt`);
      if (!r.ok) {
        console.log(`\n[ads.txt] ❌ 없습니다 (HTTP ${r.status})`);
        console.log('   일부 광고 수요처가 ads.txt 없는 사이트에 입찰하지 않습니다.');
      } else {
        const a = readAdsTxt(r.text);
        console.log(`\n[ads.txt] ✅ 있습니다 — 전체 ${a.줄수}줄 · google.com ${a.구글줄수}줄`);
        console.log(`   DIRECT ${a.DIRECT} · RESELLER ${a.RESELLER} · 게시자 ID ${a.게시자ID있음 ? '있음' : '❌ 없음'}`);
        if (!a.구글줄수) console.log('   ⚠️  google.com 줄이 없습니다 — 애드센스가 이 사이트를 자기 것으로 못 봅니다.');
      }
    } catch (err) {
      console.log(`\n[ads.txt] 확인 실패 — ${err.message}`);
    }
  }

  // ② 첫 화면 — 글 페이지에만 없는 건지, 사이트 전체에 없는 건지 가른다.
  //    이 구분이 "어디를 고쳐야 하나"를 정한다.
  if (base) {
    try {
      const r = await 받기(`${base}/`);
      if (!r.ok) {
        console.log(`\n[첫 화면] 받지 못했습니다 (HTTP ${r.status})`);
      } else {
        const m = readAdMarkup(r.text);
        const i = readInstallHints(r.text);
        console.log(`\n[첫 화면] 애드센스 스크립트 ${m.애드센스스크립트}개 · 광고 슬롯 ${m.광고슬롯}개 · 쿠팡 ${m.쿠팡}개`);
        console.log(`   테마: ${i.테마.join(', ') || '못 찾음'}`);
        console.log(`   광고 넣는 플러그인: ${i.광고플러그인.join(', ') || '없음'}`);
        console.log(`   사이트킷 ${i.사이트킷 ? '있음' : '없음'} · 구글 소유확인 메타 ${i.구글소유확인 ? '있음' : '없음'}`);
        if (i.플러그인.length) console.log(`   (앞단에서 보이는 플러그인 ${i.플러그인.length}개: ${i.플러그인.slice(0, 12).join(', ')})`);
      }
    } catch (err) {
      console.log(`\n[첫 화면] 확인 실패 — ${err.message}`);
    }
  }

  // ③ 설치된 플러그인 — 앞단에 흔적을 안 남기는 것도 있어서 관리자 API 로 본다.
  try {
    const { data } = await wpFetch('/wp/v2/plugins', { query: { context: 'edit' } });
    const 목록 = Array.isArray(data) ? data : [];
    const 광고 = 목록.filter((pl) => /(adsense|site-kit|ad-inserter|advanced-ads|quads|ads|ezoic|header|footer|code)/i
      .test(`${pl.plugin} ${pl.name}`));
    console.log(`\n[플러그인] 전체 ${목록.length}개 · 광고/코드 삽입 관련 ${광고.length}개`);
    for (const pl of 광고) console.log(`   ${pl.status === 'active' ? '✅ 켜짐' : '⬜ 꺼짐'} — ${pl.name}`);
    if (!광고.length) console.log('   광고를 넣어 주는 플러그인이 보이지 않습니다.');
  } catch (err) {
    console.log(`\n[플러그인] 목록을 못 읽었습니다 — ${err.message}`);
    console.log('   (앱 비밀번호로는 막혀 있을 수 있습니다. 워드프레스 관리자에서 직접 보세요.)');
  }

  // ④ 글마다 광고 흔적
  if (!ids.length) {
    console.log('\n글 번호를 적으면 그 글의 광고 흔적도 셉니다. 예: node src/wordpress/ad-check.mjs 7797 7801');
    return;
  }
  for (const id of ids) {
    try {
      const r = await checkPost(id);
      console.log(`\n[${r.id}] ${r.status || ''} · ${r.title}`);
      if (r.error) { console.log(`   ${r.error}`); continue; }
      console.log(`   애드센스 스크립트 ${r.애드센스스크립트}개 · 광고 슬롯(<ins>) ${r.광고슬롯}개 · 클라이언트 ID ${r.클라이언트ID있음 ? '있음' : '❌ 없음'}`);
      console.log(`   쿠팡 광고 ${r.쿠팡}개 · 새 창으로 여는 링크 ${r.새창링크}개`);
      console.log(`   페이지 ${r.길이.toLocaleString()}바이트 · 글자 ${r.본문글자수.toLocaleString()}자`);
      if (!r.애드센스스크립트) console.log('   ⚠️  이 페이지에 애드센스 코드가 아예 없습니다.');
      else if (!r.광고슬롯) console.log('   ℹ️  스크립트는 있는데 <ins> 슬롯이 없습니다 — 자동 광고만 쓰는 상태일 수 있습니다.');
      if (r.새창링크) console.log('   ⚠️  새 창 링크가 다시 생겼습니다 (전에 걷어낸 문제입니다).');
    } catch (err) {
      console.log(`\n[${id}] 실패 — ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
