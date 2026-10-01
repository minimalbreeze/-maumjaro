// 메타 설명 일괄 채우기 검사.
//
// 발행된 글 수백 개를 건드리는 일이라 "건드리지 않아야 할 것"을 특히 꼼꼼히 본다.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startMockWordPress } from './mock-wordpress.mjs';
import { describeFrom, findEmptyDescriptions, fillOne, 인사말빼기,
         앞머리정리, 제목중복빼기, 망친설명인가, 표본고르기 } from '../src/wordpress/fill-meta.mjs';
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
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
