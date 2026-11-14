#!/usr/bin/env node
/**
 * 하단 바의 접기 띠가 **실제 페이지에서** 보이고 눌리는지 잰다. (2026-11-14)
 *
 * ── 왜 ─────────────────────────────────────────────────────
 * 닫기 버튼을 네 번 고쳤다. 세 번은 틀렸고, 매번 **추측**으로 고쳤다.
 * 운영자가 캡처를 보내 주면 그걸 보고 가설을 세웠을 뿐, 실제 페이지에서
 * 무엇이 클릭을 먹는지 **잰 적이 없다.**
 *
 * 내 컨테이너는 wiki 에 못 닿지만 **러너는 네트워크가 열려 있다.**
 * 그래서 러너에서 실제 글을 열어 직접 본다.
 *
 * ── 무엇을 재나 ─────────────────────────────────────────────
 *   1. 접기 띠가 DOM 에 있나
 *   2. 화면 안에 있나 (좌표가 뷰포트 밖이면 3차 실패와 같은 상황이다)
 *   3. **그 자리를 눌렀을 때 손에 잡히는 것이 접기 띠인가**
 *      (elementFromPoint — 무엇이 덮고 있는지 이름을 돌려준다)
 *   4. 눌러 보고 광고가 접히나
 *   5. 다시 눌러 펴지나
 *
 * 아무것도 고치지 않는다. 읽고 찍기만 한다.
 */
import { log } from '../utils/logger.mjs';

const 인자 = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const 모바일 = !process.argv.includes('--pc');

/** 글 번호를 주면 워드프레스에서 공개 주소를 받아 온다. 주소를 손으로 적지 않는다. */
async function 주소찾기(것) {
  if (/^https?:\/\//.test(것)) return 것;
  if (!/^\d+$/.test(것)) return 'https://wiki.minimalbreeze.com/';
  const { wpFetch } = await import('./client.mjs');
  const { data } = await wpFetch(`/wp/v2/posts/${것}`, { query: { _fields: 'id,link' } });
  return data?.link;
}

async function main() {
  const 기본주소 = await 주소찾기(인자[0] || '');
  if (!기본주소) {
    log.warn('주소를 찾지 못했습니다');
    process.exitCode = 1;
    return;
  }
  const { chromium, devices } = await import('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext(모바일 ? devices['iPhone 13'] : {});
  const page = await ctx.newPage();
  log.section(`🔎 하단 바를 실제 페이지에서 잽니다 — ${모바일 ? '모바일' : 'PC'}`);
  log.info(`   ${기본주소}`);

  // 콘텐츠 보호 플러그인이 띄우는 경고를 잡는다.
  const 알림 = [];
  page.on('dialog', async (d) => { 알림.push(d.message()); await d.dismiss().catch(() => {}); });

  try {
    await page.goto(기본주소, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (err) {
    log.warn(`열지 못했습니다 — ${err.message}`);
    process.exitCode = 1;
    await browser.close();
    return;
  }
  // 캐러셀이 늦게 그려진다. 넉넉히 기다린다.
  await page.waitForTimeout(6000);

  const 잰것 = await page.evaluate(() => {
    const 바 = document.getElementById('cpst');
    const 띠 = document.getElementById('cpst-x');
    const 속 = document.getElementById('cpst-in');
    if (!바) return { 바없음: true };
    const 이름 = (el) => {
      if (!el) return '(없음)';
      let s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
      return s;
    };
    const r = 띠 ? 띠.getBoundingClientRect() : null;
    let 손에잡히는것 = null;
    let 띠가잡히나 = false;
    if (r && r.width && r.height) {
      // 띠 한가운데를 눌렀을 때 무엇이 잡히는가.
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      손에잡히는것 = 이름(el);
      for (let t = el; t; t = t.parentElement) if (t === 띠) { 띠가잡히나 = true; break; }
    }
    return {
      바있나: true,
      띠있나: !!띠,
      띠글자: 띠 ? (띠.textContent || '').trim() : null,
      띠자리: r ? { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null,
      화면안: r ? (r.top >= 0 && r.bottom <= innerHeight && r.width > 0 && r.height > 0) : false,
      화면높이: innerHeight,
      바높이: Math.round(바.getBoundingClientRect().height),
      바보임: getComputedStyle(바).visibility !== 'hidden' && getComputedStyle(바).display !== 'none',
      속보임: 속 ? getComputedStyle(속).display !== 'none' : null,
      손에잡히는것,
      띠가잡히나,
    };
  });

  if (잰것.바없음) {
    log.warn('이 글에는 하단 바가 없습니다');
    await browser.close();
    return;
  }

  log.info(`   바 높이 ${잰것.바높이}px · 화면 ${잰것.화면높이}px · 바 보임 ${잰것.바보임}`);
  log.info(`   접기 띠 ${잰것.띠있나 ? '있음' : '없음'} — "${잰것.띠글자}"`);
  if (잰것.띠자리) {
    const z = 잰것.띠자리;
    log.info(`   자리 top ${z.top} · left ${z.left} · ${z.w}×${z.h} · 화면 안 ${잰것.화면안}`);
  }
  log.info(`   그 자리를 누르면 잡히는 것: ${잰것.손에잡히는것}`);

  if (!잰것.띠있나) { log.warn('❌ 접기 띠가 DOM 에 없습니다'); process.exitCode = 1; }
  else if (!잰것.화면안) { log.warn('❌ 접기 띠가 화면 밖에 있습니다'); process.exitCode = 1; }
  else if (!잰것.띠가잡히나) { log.warn(`❌ 접기 띠가 ${잰것.손에잡히는것} 에 덮여 있습니다`); process.exitCode = 1; }
  else log.info('   ✅ 띠가 화면 안에 있고 그 자리에서 띠가 잡힙니다');

  // 실제로 눌러 본다.
  if (잰것.띠있나 && 잰것.화면안) {
    try {
      await page.click('#cpst-x', { timeout: 5000 });
      await page.waitForTimeout(600);
      const 접힌뒤 = await page.evaluate(() => {
        const 속 = document.getElementById('cpst-in');
        const 띠 = document.getElementById('cpst-x');
        return { 속보임: 속 ? getComputedStyle(속).display !== 'none' : null, 글자: 띠 ? (띠.textContent || '').trim() : null };
      });
      if (접힌뒤.속보임 === false) log.info(`   ✅ 눌렀더니 접혔습니다 — 띠 글자 "${접힌뒤.글자}"`);
      else { log.warn(`   ❌ 눌렀는데 안 접힙니다 (속보임 ${접힌뒤.속보임})`); process.exitCode = 1; }

      await page.click('#cpst-x', { timeout: 5000 });
      await page.waitForTimeout(600);
      const 편뒤 = await page.evaluate(() => {
        const 속 = document.getElementById('cpst-in');
        return 속 ? getComputedStyle(속).display !== 'none' : null;
      });
      if (편뒤 === true) log.info('   ✅ 다시 눌렀더니 펴졌습니다');
      else { log.warn(`   ❌ 다시 눌렀는데 안 펴집니다 (${편뒤})`); process.exitCode = 1; }
    } catch (err) {
      log.warn(`   ❌ 누르지 못했습니다 — ${err.message}`);
      process.exitCode = 1;
    }
  }

  if (알림.length) log.warn(`   ⚠️ 페이지가 띄운 알림: ${알림.join(' / ')}`);
  await browser.close();
}

await main();
