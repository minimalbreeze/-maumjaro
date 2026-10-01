// 키워드 검색수를 직접 찾아보는 명령. AI를 부르지 않으므로 비용이 0이다.
//
//   npm run keywords -- 박신자컵 여자농구 WKBL
//
// 글을 쓰기 전에 "이 말이 실제로 얼마나 검색되는지" 눈으로 보려고 만들었다.
// 연관 키워드까지 함께 나오므로 제목을 정할 때도 쓸 수 있다.

import { fetchKeywordStats, hasNaverKeywords } from './naver-keywords.mjs';
import { loadEnv } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

async function main() {
  const words = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (!hasNaverKeywords()) {
    log.fail('네이버 검색광고 키가 없습니다', new Error(
      'NAVER_AD_API_KEY · NAVER_AD_SECRET · NAVER_AD_CUSTOMER_ID 세 개가 필요합니다. '
      + 'sports-news/docs/naver-keyword-api.md 를 보세요',
    ));
    process.exitCode = 1;
    return;
  }
  if (!words.length) {
    log.fail('찾아볼 키워드를 적어주세요', new Error('예: npm run keywords -- 박신자컵 여자농구'));
    process.exitCode = 1;
    return;
  }

  log.section(`🔍 월간 검색수 (최대 5개까지 한 번에)`);

  const stats = await fetchKeywordStats(words);
  if (!stats || !stats.size) {
    log.warn('결과가 없습니다. 키워드를 바꿔 보세요.');
    return;
  }

  const rows = [...stats.values()].sort((a, b) => b.total - a.total);
  for (const r of rows) {
    const 자리 = r.total >= 1000 && r.total <= 30000 && r.competition === '낮음';
    log.info(
      `${자리 ? '⭐' : '  '} ${r.keyword.padEnd(16)} `
      + `월 ${String(r.total.toLocaleString('ko-KR')).padStart(9)}회  `
      + `(PC ${r.pc.toLocaleString('ko-KR')} · 모바일 ${r.mobile.toLocaleString('ko-KR')})  `
      + `경쟁 ${r.competition || '미상'}`,
    );
  }
  log.info('');
  log.info('  ⭐ = 월 1,000~30,000회 + 경쟁 낮음 — 개인 블로그가 노릴 구간');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
