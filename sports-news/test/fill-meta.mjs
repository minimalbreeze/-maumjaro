// 메타 설명 일괄 채우기 검사.
//
// 발행된 글 수백 개를 건드리는 일이라 "건드리지 않아야 할 것"을 특히 꼼꼼히 본다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startMockWordPress } from './mock-wordpress.mjs';
import { describeFrom, findEmptyDescriptions, fillOne, 인사말빼기,
         앞머리정리, 제목중복빼기, 망친설명인가, 표본고르기, 조사떼고 } from '../src/wordpress/fill-meta.mjs';
import { ROOT } from '../src/utils/env.mjs';

let passed = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
};

console.log('\n[메타 설명 채우기]');

const 본문 = '<!-- wp:paragraph --><p>잠실유수지 파크골프장은 잠실동 1-1에 있습니다. '
  + '9홀 코스이고 이용료는 무료입니다. 예약은 서울시 공공서비스예약에서 합니다. '
  + '주차장이 넓어 차를 가져가기 좋습니다. 봄가을에 특히 붐빕니다.</p><!-- /wp:paragraph -->';

check('본문 첫 문단에서 설명을 뽑는다', () => {
  const d = describeFrom(본문, { focusKeyword: '잠실유수지 파크골프장' });
  assert.ok(d.startsWith('잠실유수지 파크골프장은'), d);
  assert.ok(d.length >= 60, `${d.length}자로 너무 짧습니다`);
});

check('155자를 넘지 않는다', () => {
  const 긴글 = `<p>${'아주 긴 문장입니다. '.repeat(40)}</p>`;
  assert.ok(describeFrom(긴글).length <= 155, describeFrom(긴글).length);
});

check('문장 중간에서 자르지 않는다', () => {
  const 긴글 = `<p>${'파크골프장 이용 안내입니다. '.repeat(20)}</p>`;
  const d = describeFrom(긴글);
  assert.ok(/[.!?]$|다$/.test(d), `어중간하게 끝납니다: ${d}`);
});

check('키워드가 없으면 앞에 붙인다', () => {
  const d = describeFrom(본문, { focusKeyword: '송도 파3' });
  assert.ok(d.includes('송도 파3'), d);
});

check('키워드가 쉼표로 여러 개면 첫 번째만 쓴다', () => {
  // Rank Math는 키워드를 여러 개 넣을 수 있다. 전부 붙이면 설명이 이렇게 된다.
  //   "금석배 전국 고등학생 축구대회,금석배,고등학생 축구대회 정보입니다."
  const d = describeFrom(본문, { focusKeyword: '금석배 전국 고등학생 축구대회,금석배,고등학생 축구대회' });
  assert.ok(!d.includes(',금석배'), d);
  assert.ok(d.startsWith('금석배 전국 고등학생 축구대회 정보입니다.'), d);
});

check('키워드가 이미 있으면 덧붙이지 않는다', () => {
  const d = describeFrom(본문, { focusKeyword: '잠실유수지 파크골프장' });
  assert.ok(!d.includes('정보입니다. 잠실유수지'), d);
});

check('HTML 태그와 구조화 데이터를 걷어낸다', () => {
  const d = describeFrom('<p>본문입니다. 두 번째 문장입니다.</p><script type="application/ld+json">{"@type":"FAQPage"}</script>');
  assert.ok(!d.includes('FAQPage'), d);
  assert.ok(!d.includes('<'), d);
});

check('인사말을 걷어낸다', () => {
  // 155자는 짧다. "안녕하세요, 스포츠 팬 여러분!"이 앞을 잡아먹으면
  // 검색결과에 정작 필요한 정보가 안 보인다.
  assert.equal(
    인사말빼기('안녕하세요, 스포츠 팬 여러분! 제9회 바둑춘향 선발대회가 10월 3일 남원에서 열립니다.'),
    '제9회 바둑춘향 선발대회가 10월 3일 남원에서 열립니다.');
  assert.equal(
    인사말빼기('파크골프 팬 여러분 반갑습니다! 충주 단월파크골프장이 10월 1일 재개장했습니다.'),
    '충주 단월파크골프장이 10월 1일 재개장했습니다.');
});

check('인사말만 있는 글은 지우지 않는다', () => {
  // 다 지워버리면 설명이 비어버린다. 없는 것보다는 인사말이라도 있는 게 낫다.
  assert.equal(인사말빼기('안녕하세요!'), '안녕하세요!');
  assert.equal(인사말빼기('스포츠 팬 여러분!'), '스포츠 팬 여러분!');
});

check('본문 중간의 인사말은 건드리지 않는다', () => {
  // 앞에서 한 번만 지운다. 문장 안의 말까지 지우면 뜻이 망가진다.
  const t = '김주형은 우승 후 "안녕하세요, 팬 여러분!" 이라고 인사했다. 상금은 2억원이다.';
  assert.equal(인사말빼기(t), t);
});

check('인사말로 시작하는 글도 설명이 정보로 시작한다', () => {
  const d = describeFrom('<p>안녕하세요, 스포츠 팬 여러분! 잠실유수지 파크골프장은 9홀이고 이용료는 무료입니다. 예약은 서울시 공공서비스예약에서 합니다.</p>');
  assert.ok(!d.startsWith('안녕하세요'), d);
  assert.ok(d.startsWith('잠실유수지'), d);
});

// ── 실제로 47개 글을 망친 앞머리들 ────────────────────────────
// 미리보기에서 앞의 5개만 봤다. 그 5개가 모두 최근에 이 도구로 쓴 깨끗한 글이라
// 문제가 안 보였다. 뒤쪽 600개는 손으로 쓴 글이고 앞머리가 전혀 달랐다.

check('쿠팡 파트너스 고지문을 걷어낸다', () => {
  const d = describeFrom('<p>"이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다" 안녕하세요, 골프 팬 여러분! 😊 미국 그린즈버러에서 윈덤 챔피언십이 개막합니다. 페덱스컵 70위 안에 들어야 합니다.</p>',
    { title: '2026 PGA 윈덤 챔피언십 (정규시즌 최종전)' });
  assert.ok(d.startsWith('미국 그린즈버러에서'), d);
  assert.ok(!망친설명인가(d), d);
});

check('앞머리 이모지를 걷어낸다', () => {
  const d = describeFrom('<p>안녕하세요, 당구 팬 여러분! 😊 프로당구 PBA 팀리그 화성특례시 투어가 2라운드에 접어들었습니다. 우리금융캐피탈이 1라운드 우승을 했습니다.</p>',
    { title: '2026-27 PBA 팀리그 화성특례시 투어' });
  assert.ok(d.startsWith('프로당구 PBA'), d);
  assert.ok(!망친설명인가(d), d);
});

check('본문 앞에 제목이 또 적혀 있으면 지운다', () => {
  const d = describeFrom('<p>몽백합배 세계바둑오픈 (신진서 홀로 남았다, 한국 유일 16강 생존!) ♟️ 안녕하세요, 바둑 팬 여러분! 😊 중국 베이징에서 제6회 몽백합배 세계바둑오픈전이 16강에 접어들었습니다.</p>',
    { title: '2026 몽백합배 세계바둑오픈 (신진서 홀로 남았다, 한국 유일 16강 생존!)' });
  assert.ok(d.startsWith('중국 베이징에서'), d);
});

check('"(대회명)" 앞머리를 지운다', () => {
  const d = describeFrom('<p>(동아회원권그룹 오픈)안녕하세요, 골프 팬 여러분! 😊 KPGA 투어가 충남 태안에서 하반기 첫 무대를 엽니다. 상금은 10억원입니다.</p>',
    { title: '2026 KPGA 동아회원권그룹 오픈 (하반기 개막전)' });
  assert.ok(d.startsWith('KPGA 투어가'), d);
});

check('여러 겹으로 쌓여 있어도 전부 걷어낸다', () => {
  // 실측: 제목 중복 → 이모지 → 인사말 → 쿠팡 고지문 → 다시 인사말
  const d = 앞머리정리(
    '대통령배 전국고교야구대회 🏆 안녕하세요, 고교야구 팬 여러분! 😊 "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다" 안녕하세요! 포항에서 열립니다. 세광고가 2관왕에 도전합니다.',
    '2026 대통령배 전국고교야구대회(세광고 2관왕 도전)');
  assert.ok(d.startsWith('포항에서 열립니다'), d);
});

check('제목과 안 맞는 앞머리는 지우지 않는다', () => {
  // 추측으로 자르면 멀쩡한 첫 문장을 잃는다.
  const t = '(단독) 김주형이 코치를 교체했다. 상금은 2억원이다.';
  assert.equal(제목중복빼기(t, '전혀 다른 제목입니다'), t);
});

check('지울 게 글의 전부면 그대로 둔다', () => {
  // 빈 설명보다는 허술한 설명이 낫다.
  assert.equal(앞머리정리('안녕하세요!', '제목'), '안녕하세요!');
  assert.equal(앞머리정리('😊', '제목'), '😊');
});

check('망친 설명을 알아낸다', () => {
  assert.ok(망친설명인가('"이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다" 안녕하세요'));
  assert.ok(망친설명인가('😊 프로당구 PBA 팀리그가 열립니다'));
  assert.ok(망친설명인가('안녕하세요, 골프 팬 여러분! 대회가 열립니다'));
  // 사람이 쓴 멀쩡한 설명은 망친 것이 아니다 — 덮어쓰면 안 된다.
  assert.ok(!망친설명인가('잠실유수지 파크골프장은 9홀이고 이용료는 무료입니다.'));
  assert.ok(!망친설명인가('어스몬다민컵 우승상금은 2억원입니다.'));
  assert.ok(!망친설명인가(''));
});

check('미리보기 표본을 목록 전체에서 고른다', () => {
  // 앞의 5개만 보고 "깨끗하다"고 판단해서 47개를 망쳤다. 끝도 반드시 본다.
  const list = Array.from({ length: 612 }, (_, i) => i);
  const 표본 = 표본고르기(list, 12);
  assert.equal(표본[0], 0, '처음이 빠졌습니다');
  assert.equal(표본.at(-1), 611, '마지막이 빠졌습니다');
  assert.ok(표본.some((v) => v > 250 && v < 400), `중간이 빠졌습니다: ${표본.join(',')}`);
  assert.ok(표본.length >= 10, 표본.length);
});

check('표본이 목록보다 많으면 전부 돌려준다', () => {
  assert.deepEqual(표본고르기([1, 2, 3], 12), [1, 2, 3]);
});

check('본문이 비면 빈 값을 돌려준다', () => {
  assert.equal(describeFrom(''), '');
  assert.equal(describeFrom('<p></p>'), '');
});

// ── 실제 경로 ──────────────────────────────────────────────
const wp = await startMockWordPress({
  posts: {
    1495: {
      status: 'publish', slug: '잠실유수지-파크골프장',
      title: { raw: '잠실유수지 파크골프장: 이용료 및 이용방법' },
      content: { raw: 본문 },
      meta: { rank_math_description: '', rank_math_focus_keyword: '잠실유수지 파크골프장' },
    },
    1500: {
      status: 'publish', slug: '서울-파크골프장',
      title: { raw: '서울 파크골프장' },
      content: { raw: 본문 },
      meta: { rank_math_description: '이미 설명이 있습니다', rank_math_focus_keyword: '서울 파크골프장' },
    },
    1510: {
      // 우리가 잘못 채운 글. 덮어써서 고쳐야 한다.
      status: 'publish', slug: '윈덤-챔피언십',
      title: { raw: '2026 PGA 윈덤 챔피언십' },
      content: { raw: 본문 },
      meta: {
        rank_math_description: '"이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다" 안녕하세요, 골프 팬 여러분!',
        rank_math_focus_keyword: '윈덤 챔피언십',
      },
    },
  },
});
process.env.WORDPRESS_URL = `http://127.0.0.1:${wp.port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

const 대상 = [{
  id: 1495, status: 'publish', slug: '잠실유수지-파크골프장',
  title: '잠실유수지 파크골프장: 이용료 및 이용방법',
  focusKeyword: '잠실유수지 파크골프장', seoTitle: '', content: 본문,
}];

const 미리 = await fillOne(대상[0], { apply: false });
check('미리보기는 저장하지 않는다', () => {
  assert.ok(미리.changed);
  assert.equal(wp.state.updated.length, 0);
  assert.equal(미리.backup, null);
});

const r = await fillOne(대상[0]);
const patch = () => wp.state.updated.find((u) => u.id === 1495);

check('메타 설명을 채운다', () => {
  assert.ok(r.changed);
  assert.ok(patch().meta.rank_math_description.startsWith('잠실유수지'), JSON.stringify(patch()));
});

check('meta 말고 아무것도 보내지 않는다', () => {
  // 제목·슬러그·상태·본문이 섞이면 발행된 글이 망가진다.
  assert.deepEqual(Object.keys(patch()).sort(), ['id', 'meta']);
  assert.deepEqual(Object.keys(patch().meta), ['rank_math_description']);
});

check('고치기 전에 원본을 남긴다', () => {
  assert.ok(r.backup && fs.existsSync(r.backup), r.backup);
  const saved = JSON.parse(fs.readFileSync(r.backup, 'utf8'));
  assert.equal(saved.id, 1495);
  assert.equal(saved.description, '', '원본은 비어 있었어야 합니다');
});

const { empty, broken } = await findEmptyDescriptions();
check('이미 설명이 있는 글은 대상에서 뺀다', () => {
  // 사람이 공들여 쓴 설명을 덮어쓰면 안 된다.
  const ids = [...empty, ...broken].map((e) => e.id);
  assert.ok(!ids.includes(1500), `1500번을 건드리려 합니다: ${ids.join(',')}`);
});

check('잘못 채운 글은 고칠 대상으로 따로 모은다', () => {
  assert.deepEqual(broken.map((b) => b.id), [1510], JSON.stringify(broken.map((b) => b.id)));
  // 빈 글과 섞이면 안 된다 — 채우기와 고치기는 다른 일이다.
  assert.ok(!empty.some((e) => e.id === 1510));
});

check('고칠 때 원본 설명을 백업에 남긴다', () => {
  // 덮어쓰기 전 값이 남아야 되돌릴 수 있다.
  const 나쁜글 = broken.find((b) => b.id === 1510);
  assert.ok(나쁜글.description.includes('쿠팡 파트너스'), 나쁜글.description);
});

fs.rmSync(path.join(ROOT, 'out', 'backup'), { recursive: true, force: true });
wp.server.close();
// ── 제목을 걷어낸 자리에 조사가 남던 것 (2026-10-20) ────────────
//
// 1667(파주 파인빌)·1678(일산 중산힐스)의 **실제 메타 설명**이다.
// 메타 설명은 검색 결과에 그대로 보이는 글이라, "은" 으로 시작하는 문장을
// 보고 누를 사람이 없다. CTR 이 낮던 이유 중 하나다.
const 깨진설명_1667 = '파인빌 파3 정보입니다. 은 서울과 가까운 경기도 파주시 탄현면에 위치한 인기 있는 골프 연습장으로, 초보자부터 숙련된 골퍼까지 다양한 플레이어들에게 사랑받는 곳입니다.';
const 깨진설명_1678 = '중산힐스 파3 정보입니다. 은 경기도 고양시 일산동구에 위치한 서울 근교의 대표적인 파3 골프장으로, 초보자부터 숙련된 골퍼까지 누구나 즐길 수 있는 곳입니다.';

check('실제로 깨진 설명을 잡는다 — 따옴표만 보던 규칙은 놓쳤다', () => {
  assert.equal(망친설명인가(깨진설명_1667), true, '1667 을 못 잡습니다');
  assert.equal(망친설명인가(깨진설명_1678), true, '1678 을 못 잡습니다');
});

check('멀쩡한 설명은 잡지 않는다 — 7071 의 실제 설명이다', () => {
  const 멀쩡 = '대만에서 열리고 있는 윌리엄 존스컵에서 원주 DB가 결승에 진출하며 한국 팀 역대 세 번째 우승에 도전합니다. 4강에서 홈팀 대만 화이트를 21점 차로 완파하며 압도적인 경기력을 보여줬는데요, 대회 소식 정리해 드릴게요.';
  assert.equal(망친설명인가(멀쩡), false);
});

check('"정보입니다" 뒤에 보통 문장이 오면 잡지 않는다', () => {
  const 보통 = '남서울 파3 정보입니다. 판교에서 가까워 접근성이 좋고 그린 상태가 우수합니다.';
  assert.equal(망친설명인가(보통), false, '멀쩡한 글을 망친 것으로 봅니다');
});

check('제목을 걷어낸 뒤 조사를 떼어낸다 — 근본 원인', () => {
  const 본문 = '파주 파인빌 파3 골프장은 서울과 가까운 경기도 파주시 탄현면에 위치한 인기 있는 골프 연습장입니다.';
  const 제목 = '파주 파인빌 파3 골프장 이용료·예약 방법 (새오리로 250)';
  const 결과 = 제목중복빼기(본문, 제목);
  assert.ok(!/^은\s/.test(결과), `조사가 남았습니다: ${결과.slice(0, 30)}`);
  assert.match(결과, /^서울과 가까운/);
});

check('조사떼고 는 떼고도 쓸 만큼 남을 때만 뗀다', () => {
  assert.equal(조사떼고('은 서울과 가까운 경기도 파주시 탄현면에 있습니다.'), '서울과 가까운 경기도 파주시 탄현면에 있습니다.');
  // 떼면 20자 미만이면 그대로 둔다 — 짧은 토막을 더 깎지 않는다.
  assert.equal(조사떼고('은 짧다'), '은 짧다');
});

check('조사가 아닌 말은 떼지 않는다', () => {
  const t = '이용료는 주중 48,000원이고 주말에는 58,000원입니다.';
  assert.equal(조사떼고(t), t, '멀쩡한 문장의 앞을 깎았습니다');
});

check('빈 값에도 던지지 않는다', () => {
  assert.equal(조사떼고(''), '');
  assert.equal(조사떼고(null), '');
  assert.equal(망친설명인가(null), false);
});

// ── 고쳐서 더 나빠지는 글은 저장하지 않는다 (2026-10-20) ────────
//
// 미리보기에서 두 편이 걸렸다. 그런데 그 검사는 **로그에서만** 하고 있어서,
// --apply 로 돌리면 둘 다 저장될 상태였다.
//
//   금시세 글 — 본문이 "안녕하세요, … 여러분!" 으로 시작해 새 설명도 인사말
//   985      — 쿠팡 고지문이 통째로 들어갔다
check('고친 결과가 여전히 망친 설명이면 저장하지 않는다', async () => {
  // 본문 전체가 인사말이라 어떻게 뽑아도 인사말이 된다.
  const 인사말글 = {
    id: 9001, title: '금시세 오늘 금값 시세',
    content: '<p>안녕하세요, 황금 투자(금시세)를 고민하시는 여러분! 최근 글로벌 경제 불안정과 인플레이션 압박으로 인해 안전자산으로서 금의 가치가 더욱 부각되고 있습니다.</p>',
    focusKeyword: '금시세', description: '',
  };
  // apply: true 인데도 저장하러 가지 않아야 한다 — wpFetch 를 부르면 네트워크가 없어 던진다.
  const r = await fillOne(인사말글, { apply: true });
  assert.equal(r.changed, false, '망친 설명을 저장하러 갔습니다');
  assert.match(r.건너뜀 || '', /앞머리/);
});

check('멀쩡하게 고쳐지는 글은 건너뛰지 않는다', async () => {
  const 멀쩡 = {
    id: 9002, title: '일산 중산힐스 파3 골프장 이용료·예약 방법 (고봉로 467-68)',
    content: '<p>일산 중산힐스 파3 골프장은 경기도 고양시 일산동구에 위치한 서울 근교의 대표적인 파3 골프장으로, 초보자부터 숙련된 골퍼까지 누구나 즐길 수 있는 곳입니다.</p>',
    focusKeyword: '일산 중산힐스 파3 골프장', description: '',
  };
  const r = await fillOne(멀쩡, { apply: false });
  assert.ok(!r.건너뜀, `건너뛰면 안 됩니다: ${r.건너뜀}`);
  assert.equal(r.changed, true);
  assert.ok(!/정보입니다\.\s*(?:은|는)\s/.test(r.description), `조사가 남았습니다: ${r.description}`);
});

check('저장 전에 막는다 — 로그가 아니라 fillOne 에서', () => {
  const src = fs.readFileSync(new URL('../src/wordpress/fill-meta.mjs', import.meta.url), 'utf8');
  const 막는자리 = src.indexOf('if (망친설명인가(description))');
  const 저장자리 = src.indexOf("method: 'POST'");
  assert.ok(막는자리 > -1, 'fillOne 에서 막지 않습니다');
  assert.ok(막는자리 < 저장자리, '막는 자리가 저장보다 뒤입니다');
});

console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
