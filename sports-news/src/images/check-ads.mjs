// 광고 링크가 아직 살아 있는지 확인한다. AI를 부르지 않는다(0원).
//
//   npm run ads:check
//
// 왜 필요한가
//   쿠팡 파트너스 링크는 상품이 품절되거나 판매가 끝나면 죽는다. 죽은 링크는
//   클릭해도 아무것도 안 나오니 그 글의 광고 자리가 통째로 버려진다. 글은
//   수백 편이고 링크는 종목마다 하나뿐이라, 하나가 죽으면 그 종목 글 전체가
//   영향을 받는다.
//
//   운영자가 직접 눌러 보지 않아도 알 수 있게 한다.

import { setTimeout as sleep } from 'node:timers/promises';
import { loadAdConfig } from './ad-category.mjs';
import { log } from '../utils/logger.mjs';
import { env, loadEnv } from '../utils/env.mjs';

/** 사람이 브라우저로 여는 것처럼 보이게 한다. 봇으로 보이면 차단된다. */
const UA = 'Mozilla/5.0 (compatible; MaumjaroAdCheck/1.0; +https://maumjaro.minimalbreeze.com/)';

/**
 * 링크 하나를 확인한다.
 *
 * 쿠팡 단축링크(link.coupang.com/a/...)는 실제 상품 페이지로 넘긴다.
 * 그래서 리다이렉트를 따라가야 살았는지 알 수 있다.
 *
 * 판정이 애매한 경우를 "죽었다"고 단정하지 않는다 — 잘못 알리면 멀쩡한 링크를
 * 갈아 끼우게 된다. 확실히 죽은 것(404/410)과 "확인 못 함"을 나눠서 알린다.
 */
export async function checkOne(url, { timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      signal: ctrl.signal,
    });

    const finalUrl = res.url || url;
    const body = res.ok ? (await res.text()).slice(0, 4000) : '';

    // 쿠팡은 없어진 상품도 200으로 안내 페이지를 준다. 문구로 한 번 더 가른다.
    const 품절문구 = /품절|판매(가)?종료|삭제된 상품|상품을 찾을 수 없|존재하지 않는 상품|일시품절/;
    if (res.ok && 품절문구.test(body)) {
      return { url, ok: false, status: res.status, finalUrl, why: '상품이 없어졌습니다 (페이지에 품절·판매종료 안내)' };
    }

    if (res.status === 404 || res.status === 410) {
      return { url, ok: false, status: res.status, finalUrl, why: `링크가 죽었습니다 (${res.status})` };
    }
    if (!res.ok) {
      // 403·429 등은 쿠팡이 자동 접속을 막은 것일 수 있다. 죽었다고 단정하지 않는다.
      return { url, ok: null, status: res.status, finalUrl, why: `확인하지 못했습니다 (${res.status}) — 차단일 수 있습니다` };
    }
    return { url, ok: true, status: res.status, finalUrl, why: '' };
  } catch (err) {
    return { url, ok: null, status: 0, finalUrl: '', why: `확인하지 못했습니다 (${err.name === 'AbortError' ? '시간 초과' : err.message})` };
  } finally {
    clearTimeout(timer);
  }
}

/** 설정에 있는 링크를 모두 확인한다. */
export async function checkAll({ config = loadAdConfig(), gapMs = 1200 } = {}) {
  const rows = Object.entries(config.categories || {});
  const out = [];

  for (const [category, v] of rows) {
    const url = String(v?.url || '').trim();
    if (!url) {
      out.push({ category, url: '', ok: null, why: '링크를 아직 안 넣었습니다 (일반 캐러셀을 씁니다)', 미설정: true });
      continue;
    }
    const r = await checkOne(url);
    out.push({ category, ...r });
    // 한꺼번에 때리면 차단된다. 사이를 띄운다.
    if (gapMs) await sleep(gapMs);
  }
  return out;
}

async function main() {
  log.section('🔗 광고 링크 점검');
  const results = await checkAll({ gapMs: Number(env('AD_CHECK_GAP_MS', '1200')) });

  const 죽음 = results.filter((r) => r.ok === false);
  const 모름 = results.filter((r) => r.ok === null && !r.미설정);
  const 미설정 = results.filter((r) => r.미설정);
  const 살아있음 = results.filter((r) => r.ok === true);

  for (const r of results) {
    const mark = r.미설정 ? '·' : r.ok === true ? '✅' : r.ok === false ? '❌' : '⚠️';
    log.raw(`   ${mark} ${r.category.padEnd(6)} ${r.why || '살아 있습니다'}`);
  }

  log.raw('');
  log.info(`살아 있음 ${살아있음.length} · 죽음 ${죽음.length} · 확인 못 함 ${모름.length} · 미설정 ${미설정.length}`);

  if (죽음.length) {
    log.raw('');
    log.fail(`${죽음.length}개 링크가 죽었습니다 — 쿠팡 파트너스에서 새로 만들어 config/ad-by-category.json 의 url 을 바꾸세요`, new Error(죽음.map((r) => r.category).join(', ')));
    process.exitCode = 1;   // 실행이 빨간색으로 끝나 알아채기 쉽게
    return;
  }
  if (모름.length) {
    log.warn('확인하지 못한 링크가 있습니다. 쿠팡이 자동 접속을 막았을 수 있으니 직접 한 번 눌러 보세요.');
  }
  log.ok('죽은 링크는 없습니다.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
