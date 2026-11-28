import pw from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pw;
let pass=0, fail=0;
const ok=(n,c,e)=>{c?(pass++,console.log('  PASS',n)):(fail++,console.log('  FAIL',n,e??''));};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:390,height:844} });
const page = await ctx.newPage();
page.on('pageerror', e=>{fail++;console.log('  FAIL pageerror:',e.message);});

// ⚠️ 코드가 localhost 에서는 GA 를 아예 안 켠다(내 방문 빼기). 그래서 gtag 를
//    미리 심어 두고, 그 호출을 가로채 이벤트가 실제로 나가는지 본다.
await ctx.addInitScript(`
  window.__ev = [];
  window.gtag = function(){ window.__ev.push([].slice.call(arguments)); };
  // ⚠️ 여기서 한 번 틀렸다. 클릭하면 바로 페이지가 넘어가 __ev 가 날아가서
  //    "이벤트가 안 나간다"로 보였다. 측정 코드는 capture 단계라 먼저 돌므로,
  //    버블 단계에서 이동만 막으면 이벤트는 그대로 잡힌다.
  addEventListener('DOMContentLoaded', function(){
    document.addEventListener('click', function(e){
      if (e.target.closest && e.target.closest('a[data-cta]') && !window.__letGo) e.preventDefault();
    });
  });
`);

console.log('\n[1] 큰 버튼을 누르면 이벤트가 나간다');
await page.goto('http://localhost:8099/animal/year/1940/',{waitUntil:'load'});
await page.waitForTimeout(400);
const cta = await page.$('a.cta[data-cta]');
ok('CTA 에 꼬리표가 붙어 있다', !!cta);
ok('href 에 from 이 있다', (await cta.getAttribute('href')) === '/?from=year', await cta.getAttribute('href'));
await page.evaluate(()=>document.querySelector('a.cta[data-cta]').click());
await page.waitForTimeout(300);
let ev = await page.evaluate(()=>window.__ev.filter(a=>a[1]==='app_cta_click'));
ok('app_cta_click 이 나갔다', ev.length===1, JSON.stringify(ev));
ok('kind=year', ev[0] && ev[0][2].kind==='year', JSON.stringify(ev[0]));
ok('spot=main', ev[0] && ev[0][2].spot==='main', JSON.stringify(ev[0]));

console.log('\n[2] 푸터 링크는 따로 잡힌다');
await page.goto('http://localhost:8099/emotion/depression/',{waitUntil:'load'});
await page.waitForTimeout(400);
await page.evaluate(()=>document.querySelector('footer a[data-cta]').click());
await page.waitForTimeout(300);
ev = await page.evaluate(()=>window.__ev.filter(a=>a[1]==='app_cta_click'));
ok('감정 페이지에서도 나간다', ev.length===1, JSON.stringify(ev));
ok('kind=emotion', ev[0] && ev[0][2].kind==='emotion', JSON.stringify(ev[0]));
ok('spot=footer', ev[0] && ev[0][2].spot==='footer', JSON.stringify(ev[0]));

console.log('\n[3] 링크를 막지 않는다 — 실제로 앱에 도착한다');
await page.goto('http://localhost:8099/animal/tiger/lucky/',{waitUntil:'load'});
await page.waitForTimeout(400);
await page.evaluate(()=>{ window.__letGo = true; });
await Promise.all([page.waitForNavigation({timeout:8000}), page.click('a.cta[data-cta]')]);
ok('앱으로 넘어갔다', new URL(page.url()).pathname === '/', page.url());
ok('주소에 from 이 남는다', page.url().includes('from=lucky'), page.url());
await page.waitForTimeout(2200);
ok('앱이 정상으로 뜬다 (오류 없음)', !!(await page.$('#app')));

console.log('\n[4] from 이 앱 동작을 안 바꾼다');
// ⚠️ 여기서도 한 번 틀렸다. 같은 브라우저로 두 주소를 연달아 열면 스플래시
//    30분 규칙(maumjaro:splashAt)에 걸려 두 번째가 안 뜬다. from 탓이 아니다.
//    그래서 **완전히 새 브라우저 창 두 개**로 따로 잰다.
const look = async (u) => {
  const c = await browser.newContext({ viewport:{width:390,height:844} });
  const pg = await c.newPage();
  await pg.goto(u, { waitUntil:'load' });
  await pg.waitForTimeout(400);
  const r = await pg.evaluate(()=>({
    nosplash: document.documentElement.classList.contains('mj-nosplash'),
    ob: !!document.querySelector('.ob'),
  }));
  await c.close();
  return r;
};
const withFrom = await look('http://localhost:8099/?from=lucky');
const plain    = await look('http://localhost:8099/');
ok('스플래시 규칙이 같다', withFrom.nosplash === plain.nosplash, `from=${withFrom.nosplash} / 그냥=${plain.nosplash}`);
ok('온보딩 규칙이 같다', withFrom.ob === plain.ob, `from=${withFrom.ob} / 그냥=${plain.ob}`);

console.log('\n[5] GA 가 꺼져 있으면 조용히 지나간다');
const c2 = await browser.newContext({ viewport:{width:390,height:844} });
const p3 = await c2.newPage();
let err=0; p3.on('pageerror',()=>err++);
await p3.goto('http://localhost:8099/animal/year/1940/',{waitUntil:'load'});
await p3.waitForTimeout(300);
await p3.evaluate(()=>{ window.gtag = undefined; });
await p3.evaluate(()=>document.querySelector('a.cta[data-cta]').click());
await p3.waitForTimeout(300);
ok('gtag 없어도 오류 안 난다', err===0, err);

console.log(`\n=== ${pass} pass / ${fail} fail ===`);
await browser.close();
process.exit(fail?1:0);
