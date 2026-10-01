// 키워드 검색수를 직접 찾아보는 명령. AI를 부르지 않으므로 비용이 0이다.
//
//   npm run keywords -- 박신자컵 여자농구 WKBL
//
// 글을 쓰기 전에 "이 말이 실제로 얼마나 검색되는지" 눈으로 보려고 만들었다.
// 연관 키워드까지 함께 나오므로 제목을 정할 때도 쓸 수 있다.

import { fetchKeywordStats, hasNaverKeywords } from './naver-keywords.mjs';
import { fetchTrends, hasNaverTrend } from './naver-trend.mjs';
import { loadEnv } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

async function main() {
  const words = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (!hasNaverKeywords() && !hasNaverTrend()) {
    log.fail('네이버 키가 없습니다', new Error(
      '데이터랩(NAVER_CLIENT_ID·NAVER_CLIENT_SECRET) 또는 '
      + '검색광고(NAVER_AD_API_KEY·NAVER_AD_SECRET·NAVER_AD_CUSTOMER_ID)가 필요합니다. '
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

  log.section('🔍 키워드 살펴보기 (최대 5개까지 한 번에)');

  // 데이터랩 — 추이. 광고 계정 없이도 쓸 수 있다.
  if (hasNaverTrend()) {
    const trends = await fetchTrends(words);
    if (trends?.size) {
      log.info('');
      log.info('📈 최근 30일 검색 추이 (0~100 상대지수 — 이 목록 안에서만 비교됩니다)');
      for (const t of [...trends.values()].sort((a, b) => b.peak - a.peak)) {
        log.info(
          `${t.rising ? '⭐' : '  '} ${t.keyword.padEnd(16)} `
          + `지수 ${String(t.peak).padStart(5)}  `
          + `${t.rising ? `상승 중 (최근이 평소의 ${t.ratio}배)` : '평탄'}`,
        );
      }
      log.info('  ⭐ = 관심이 올라오는 중 — 지금 쓰면 좋은 주제');
    } else {
      log.warn('데이터랩 결과가 없습니다. 키워드를 바꿔 보세요.');
    }
  }

  // 검색광고 — 절대 검색수. 광고 계정이 있을 때만.
  if (hasNaverKeywords()) {
    const stats = await fetchKeywordStats(words);
    if (stats?.size) {
      log.info('');
      log.info('📊 월간 검색수');
      for (const r of [...stats.values()].sort((a, b) => b.total - a.total)) {
        const 자리 = r.total >= 1000 && r.total <= 30000 && r.competition === '낮음';
        log.info(
          `${자리 ? '⭐' : '  '} ${r.keyword.padEnd(16)} `
          + `월 ${String(r.total.toLocaleString('ko-KR')).padStart(9)}회  `
          + `(PC ${r.pc.toLocaleString('ko-KR')} · 모바일 ${r.mobile.toLocaleString('ko-KR')})  `
          + `경쟁 ${r.competition || '미상'}`,
        );
      }
      log.info('  ⭐ = 월 1,000~30,000회 + 경쟁 낮음 — 개인 블로그가 노릴 구간');
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
