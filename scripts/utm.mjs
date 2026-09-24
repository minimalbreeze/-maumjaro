// 대표님이 직접 올리는 글에 붙일 UTM 링크표를 만든다.
//
// 왜 필요한가
//   share-utm.js는 "앱 안에서 사용자가 공유 버튼으로 내보낸 링크"를 담당한다.
//   그런데 블로그·스레드에 사람이 직접 붙여넣는 링크에는 아무 표가 없어서,
//   GA4에서 전부 Direct 아니면 referral로 뭉뚱그려진다.
//   그러면 "어떤 종류의 글이 사람을 데려오는가"를 끝내 알 수 없다.
//
// 설계
//   utm_source  = 채널 (naver / threads / tistory)
//   utm_medium  = 매체 (blog / social)
//   utm_content = 글의 종류 ← 이게 핵심이다. 이 값으로 유형을 비교한다.
//
//   utm_campaign은 일부러 비워 둔다. 지금은 상시 운영이지 캠페인이 아니고,
//   칸을 만들어두면 채우려다 값이 제각각이 된다.
//
//   랜딩은 대부분 홈(/)이다. 감정 페이지는 검색으로 들어오는 사람을 위한 것이고,
//   글을 보고 오는 사람은 주사를 놓으러 오는 것이라 홈이 맞다(브랜드 원칙 1).
//   특정 감정을 주제로 쓴 글에만 그 감정 페이지를 쓴다.
//
// 실행: node scripts/utm.mjs
// 결과: UTM-링크표.md

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadSymptoms } from './lib/symptoms.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SITE = 'https://maumjaro.minimalbreeze.com';

const CHANNELS = [
  // medium은 GA4가 기본 채널로 인정하는 값만 쓴다. 그 밖의 값(blog, sns, rx …)은
  // 전부 Unassigned로 떨어져서 채널 보고서가 무용지물이 된다.
  // 인정값: organic · cpc · email · social · paid-social · referral · affiliate · display
  // 블로그에서 넘어오는 링크는 말 그대로 referral이 맞다.
  { key: 'naver',   label: '네이버 블로그', medium: 'referral' },
  { key: 'threads', label: '스레드',        medium: 'social' },
  { key: 'tistory', label: '티스토리',      medium: 'referral' },
];

// 글의 종류. 새로 만들고 싶은 유형이 생기면 여기에만 추가한다.
const TYPES = [
  { key: 'empathy',   label: '감정 공감형',     eg: '"괜찮은 척하기 지친 날"처럼 상황을 먼저 말하는 글' },
  { key: 'checklist', label: '체크리스트형',    eg: '"오늘 이런 사람은 들어오세요" + 해당 항목 나열' },
  { key: 'fortune',   label: '운세형',          eg: '오늘의 맘운 / 띠·별자리 운세' },
  { key: 'tarot',     label: '타로형',          eg: '오늘의 타로 3장' },
  { key: 'quiz',      label: '참여형',          eg: '"오늘 당신의 마음은 몇 번?" 번호 고르기' },
  { key: 'sports',    label: '스포츠 멘탈',     eg: '응원팀 진 날 감정 정리' },
  { key: 'diet',      label: '다이어트 멘탈',   eg: '한 끼 망쳤을 때 / 정체기' },
];

function link(path, source, medium, content) {
  const u = new URL(SITE + path);
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_content', content);
  return u.toString();
}

async function main() {
  const S = await loadSymptoms(ROOT);
  const out = [];

  out.push('# UTM 링크표');
  out.push('');
  out.push('> 이 파일은 `node scripts/utm.mjs`가 만든다. 손으로 고치면 덮어써진다.');
  out.push('');
  out.push('글을 올릴 때 **아래 링크를 그대로 복사해서** 쓰세요. 주소가 길어 보여도 그대로 붙여야');
  out.push('나중에 어떤 종류의 글이 사람을 데려왔는지 갈라서 볼 수 있습니다.');
  out.push('');
  out.push('링크는 반드시 **실제 하이퍼링크로** 걸어주세요. 텍스트로만 두면 클릭이 안 되고');
  out.push('백링크로도 안 잡힙니다.');
  out.push('');

  out.push('## 글의 종류');
  out.push('');
  out.push('| 값 | 종류 | 어떤 글인가 |');
  out.push('|---|---|---|');
  TYPES.forEach((t) => out.push(`| \`${t.key}\` | ${t.label} | ${t.eg} |`));
  out.push('');

  CHANNELS.forEach((c) => {
    out.push(`## ${c.label}`);
    out.push('');
    out.push('| 글의 종류 | 붙여넣을 링크 |');
    out.push('|---|---|');
    TYPES.forEach((t) => {
      out.push(`| ${t.label} | \`${link('/', c.key, c.medium, t.key)}\` |`);
    });
    out.push('');
  });

  out.push('## 특정 감정을 주제로 쓴 글');
  out.push('');
  out.push('그 감정 하나만 다룬 글이라면 홈 대신 아래를 쓰세요. 글과 도착 화면이 맞아떨어져서');
  out.push('바로 나가는 사람이 줄어듭니다. 채널은 네이버 블로그 기준이고, 스레드에 쓸 때는');
  out.push('`utm_source=naver`를 `threads`로, `utm_medium=referral`을 `social`로 바꾸면 됩니다.');
  out.push('');
  out.push('| 감정 | 링크 |');
  out.push('|---|---|');
  Object.keys(S).forEach((k) => {
    out.push(`| ${S[k].emoji} ${S[k].label} | \`${link(`/emotion/${k}/`, 'naver', 'referral', 'empathy')}\` |`);
  });
  out.push('');

  out.push('## GA4에서 어디를 보나');
  out.push('');
  out.push('**보고서 → 획득 → 트래픽 획득**으로 들어가서, 표 왼쪽 위의 차원 드롭다운을');
  out.push('`세션 수동 광고 콘텐츠`(Session manual ad content)로 바꾸면 `utm_content` 값별로');
  out.push('갈라져 보입니다. 채널까지 같이 보려면 그 옆 `+`를 눌러 `세션 소스`를 더하세요.');
  out.push('');
  out.push('### 숫자를 읽을 때 주의할 것');
  out.push('');
  out.push('- **유형 하나당 최소 5~7회**는 올려야 비교가 됩니다. 1~2회 올린 숫자는 그날 요일·시간대');
  out.push('  차이에 묻혀서 의미가 없습니다.');
  out.push('- 요일을 돌려가며 다른 유형을 올리면 **요일 효과와 유형 효과가 섞여** 분리가 안 됩니다.');
  out.push('  한 유형을 여러 번 반복한 뒤 다음 유형으로 넘어가세요.');
  out.push('- 내 방문은 홈에서 `?noga=1`을 한 번 열어 빼두세요.');
  out.push('');
  out.push('## 앱 안에서 공유된 링크는 따로 잡힙니다');
  out.push('');
  out.push('사용자가 앱의 공유 버튼으로 내보낸 링크에는 `share-utm.js`가 `utm_source=share`를');
  out.push('붙입니다. 위 표의 링크(`naver`/`threads`/`tistory`)와 섞이지 않으니,');
  out.push('**내가 올린 글로 온 사람**과 **사용자가 퍼뜨려서 온 사람**을 구분해서 볼 수 있습니다.');
  out.push('');

  const path = join(ROOT, 'UTM-링크표.md');
  await writeFile(path, out.join('\n'), 'utf8');
  console.log(`UTM-링크표.md 생성`);
  console.log(`  채널 ${CHANNELS.length} × 종류 ${TYPES.length} = ${CHANNELS.length * TYPES.length}개 링크`);
  console.log(`  감정별 링크 ${Object.keys(S).length}개`);
}

main().catch((e) => { console.error(e); process.exit(1); });
