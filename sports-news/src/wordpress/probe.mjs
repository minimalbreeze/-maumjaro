#!/usr/bin/env node
// npm run wp:check
//
// 사이트를 "조사만" 한다. 글을 만들지도 고치지도 않는다.
// 알아내는 것:
//   1) 실제 카테고리 목록(ID·이름·부모·글 수)
//   2) SEO 플러그인이 무엇인지 (Rank Math / Yoast / 없음)
//   3) REST로 SEO 필드를 쓸 수 있는지  ← 여기가 핵심
//
// 지시서 [13]: "Rank Math의 실제 필드 구조를 확인하지 않고 임의의 meta key를 만들어
// 저장하지 않는다." 그래서 OPTIONS 요청으로 워드프레스가 스스로 신고한
// 스키마를 읽는다. 등록되지 않은 meta 키는 REST로 써도 조용히 무시되기 때문에,
// "썼는데 저장이 안 되는" 상황을 미리 잡아내는 유일한 방법이다.

import fs from 'node:fs';
import path from 'node:path';
import { wpFetch, wpFetchAll, wpConfig } from './client.mjs';
import { ROOT } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

const SEO_META_CANDIDATES = {
  rankmath: ['rank_math_title', 'rank_math_description', 'rank_math_focus_keyword'],
  yoast: ['_yoast_wpseo_title', '_yoast_wpseo_metadesc', '_yoast_wpseo_focuskw'],
};

export async function probeSite() {
  const cfg = wpConfig();
  const report = { probedAt: new Date().toISOString(), site: cfg.base };

  log.step('사이트 기본 정보 확인');
  const { data: root } = await wpFetch('/');
  report.siteName = root?.name || '';
  report.namespaces = root?.namespaces || [];
  log.ok(`연결됨: ${report.siteName || cfg.base}`);

  // 플러그인이 REST 네임스페이스를 등록하면 여기 나타난다.
  report.seoPlugin =
    report.namespaces.some((n) => /rankmath/i.test(n)) ? 'rankmath' :
    report.namespaces.some((n) => /yoast/i.test(n)) ? 'yoast' : 'unknown';
  log.info(`SEO 플러그인 흔적: ${report.seoPlugin === 'unknown' ? '네임스페이스에서 확인 안 됨' : report.seoPlugin}`);

  log.step('로그인 계정 권한 확인');
  const { data: me } = await wpFetch('/wp/v2/users/me', { query: { context: 'edit' } });
  report.user = { name: me?.name, roles: me?.roles || [] };
  log.ok(`계정: ${me?.name} (${(me?.roles || []).join(', ') || '역할 미확인'})`);

  log.step('카테고리 목록 수집');
  const cats = await wpFetchAll('/wp/v2/categories', { orderby: 'count', order: 'desc', hide_empty: false });
  const byId = new Map(cats.map((c) => [c.id, c]));
  report.categories = cats.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parent: c.parent || 0,
    parentName: c.parent ? byId.get(c.parent)?.name || '' : '',
    count: c.count,
  }));
  log.ok(`카테고리 ${cats.length}개`);
  for (const c of report.categories) {
    log.info(`  ${c.parentName ? `${c.parentName} └ ` : ''}${c.name} (id=${c.id}, 글 ${c.count}개)`);
  }

  log.step('글 수 확인');
  const { headers } = await wpFetch('/wp/v2/posts', { query: { per_page: 1, status: 'publish' } });
  report.publishedPosts = Number(headers.get('x-wp-total') || 0);
  log.ok(`발행된 글 ${report.publishedPosts}개`);

  log.step('SEO 필드 쓰기 가능 여부 확인 (OPTIONS 스키마 조회)');
  report.seoFields = await probeSeoFields();
  if (report.seoFields.writable.length) {
    log.ok(`REST로 쓸 수 있는 SEO 필드: ${report.seoFields.writable.join(', ')}`);
  } else {
    log.warn('REST로 쓸 수 있는 SEO 메타 필드가 없습니다.');
    log.info('  → SEO 제목/설명은 워드프레스에 저장하지 않고 out/ 파일에만 남깁니다.');
    log.info('  → 임시글을 열어 Rank Math 칸에 복사해 넣으시면 됩니다.');
    log.info('  → 자동 저장을 원하시면 README의 "SEO 필드 열어주기" 항목을 참고하세요.');
  }

  return report;
}

/**
 * OPTIONS /wp/v2/posts 의 스키마에서 등록된 meta 키를 읽는다.
 * 워드프레스는 register_post_meta( show_in_rest ) 된 키만 여기 노출한다.
 */
async function probeSeoFields() {
  const result = { registeredMeta: [], writable: [], plugin: 'unknown', method: 'options-schema' };
  try {
    const { data } = await wpFetch('/wp/v2/posts', { method: 'OPTIONS' });
    const metaProps = data?.schema?.properties?.meta?.properties || {};
    result.registeredMeta = Object.keys(metaProps);

    for (const [plugin, keys] of Object.entries(SEO_META_CANDIDATES)) {
      const found = keys.filter((k) => {
        const prop = metaProps[k];
        return prop && !prop.readonly;
      });
      if (found.length) {
        result.plugin = plugin;
        result.writable = found;
        break;
      }
    }
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

export function saveReport(report) {
  const file = path.join(ROOT, 'config', 'site.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  return file;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  log.section('🔎 워드프레스 사이트 조사 (글은 생성하지 않습니다)');
  try {
    const report = await probeSite();
    const file = saveReport(report);
    log.ok(`결과 저장: ${path.relative(process.cwd(), file)}`);
    log.info('이제 npm run news -- --dry-run 을 실행할 수 있습니다.');
  } catch (err) {
    log.fail('사이트 조사 실패', err);
    if (err.code === 'ENV_MISSING') {
      log.info('sports-news/.env 파일을 만들고 .env.example의 항목을 채워주세요.');
    }
    process.exitCode = 1;
  }
}
