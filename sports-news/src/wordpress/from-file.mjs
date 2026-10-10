#!/usr/bin/env node
// 이미 만들어둔 글을 워드프레스에 임시글로 올린다.
//
//   node src/wordpress/from-file.mjs out/2026-09-28/KBO-....md
//
// AI를 다시 부르지 않는다. 그래서 비용이 들지 않는다.
// 쓰임새 두 가지:
//   1) 미리보기로 만든 글이 마음에 들 때, 다시 만들지 않고 그대로 올린다
//   2) 크레딧이 없을 때도 이미 만든 글은 올릴 수 있다

import fs from 'node:fs';
import path from 'node:path';
import { log } from '../utils/logger.mjs';
import { ROOT } from '../utils/env.mjs';
import { loadSiteCategories, resolveCategory, resolveTagIds, normalizeTags } from './taxonomy.mjs';
import { saveDraft } from './draft.mjs';
import { createHeroImage, createSectionImage } from '../images/provider.mjs';
import { uploadMedia, safeFileName } from '../images/upload.mjs';
import { planPlacements, insertMarks, imageHtml, adHtml } from '../images/embed.mjs';
import { pickWatchLinks, watchBannerHtml } from '../seo/watch-banner.mjs';

/**
 * writeDryRunFile이 만든 .md를 거꾸로 읽는다.
 * 머리말(워드프레스에 넣을 값)과 본문을 분리한다.
 */
export function parseDraftFile(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const title = (lines.find((l) => l.startsWith('# ')) || '').replace(/^#\s*/, '').trim();

  const pick = (label) => {
    const re = new RegExp(`^\\*\\*${label}\\*\\*:\\s*(.+)$`);
    for (const l of lines) { const m = re.exec(l); if (m) return m[1].trim(); }
    return '';
  };

  // 코드 블록에 담긴 SEO 값 (```로 감싼 바로 다음 줄)
  const afterHeading = (heading) => {
    const i = lines.findIndex((l) => l.trim() === `**${heading}**`);
    if (i === -1) return '';
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      if (lines[j].trim() === '```') return (lines[j + 1] || '').trim();
    }
    return '';
  };

  const bodyStart = lines.findIndex((l) => l.trim() === '## ✍️ 본문');
  const body = bodyStart === -1
    ? text.split(/\n---\n/).slice(1).join('\n---\n').trim()
    : lines.slice(bodyStart + 1).join('\n').trim();

  return {
    title,
    body,
    category: pick('카테고리'),
    tags: normalizeTags(pick('태그').split(',').map((t) => t.trim()).filter(Boolean)),
    slug: pick('슬러그'),
    seoTitle: afterHeading('SEO 제목'),
    metaDescription: afterHeading('설명'),
    focusKeyword: afterHeading('대표 키워드'),
  };
}

function loadSiteReport() {
  const f = path.join(ROOT, 'config', 'site.json');
  try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; } catch { return null; }
}

const AD_SNIPPET = (() => {
  const f = path.join(ROOT, 'config', 'ad-coupang.html');
  try { return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : ''; } catch { return ''; }
})();

export async function publishFromFile(filePath, { withImages = true } = {}) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(abs)) throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);

  const parsed = parseDraftFile(fs.readFileSync(abs, 'utf8'));
  if (!parsed.title) throw new Error('제목을 읽지 못했습니다. 이 도구는 이 프로그램이 만든 .md 파일만 읽습니다.');
  if (parsed.body.length < 200) throw new Error(`본문이 너무 짧습니다 (${parsed.body.length}자)`);

  log.section(`📤 기존 글을 워드프레스에 올립니다 (AI 호출 없음)`);
  log.info(`제목: ${parsed.title}`);
  log.info(`본문 ${parsed.body.length}자 · 태그 ${parsed.tags.length}개 · 카테고리 ${parsed.category}`);

  const siteCategories = await loadSiteCategories();
  const cat = resolveCategory(parsed.category, siteCategories);
  log.info(`카테고리: ${cat.name} (id=${cat.id}, ${cat.matched})`);

  // 이미지·광고·중계 배너 자리를 잡는다
  const watch = pickWatchLinks(cat.name || parsed.category);
  if (watch) log.info(`중계 배너: ${watch.primary.url}`);
  const plan = planPlacements(parsed.body, {
    sectionImages: withImages ? 1 : 0,
    withAd: Boolean(AD_SNIPPET),
    withWatch: Boolean(watch),
  });
  const body = insertMarks(parsed.body, plan);
  const blocks = [];
  let featuredId = null;

  if (withImages) {
    const wanted = [
      { role: 'hero', make: () => createHeroImage({ title: parsed.title, topic: parsed.category, focusKeyword: parsed.focusKeyword }) },
      ...plan.sections.map((h) => ({ role: 'section', make: () => createSectionImage({ heading: h.text, topic: parsed.category, focusKeyword: parsed.focusKeyword }) })),
    ];
    for (const [i, w] of wanted.entries()) {
      try {
        const img = await w.make();
        const up = await uploadMedia({
          buffer: img.buffer,
          fileName: safeFileName(`${parsed.category}-${parsed.slug || parsed.title}`),
          alt: img.alt,
        });
        blocks.push({ html: imageHtml({ url: up.url, alt: img.alt }) });
        if (i === 0) featuredId = up.id;
        log.ok(`  ${w.role} 이미지 업로드 (미디어 ID ${up.id})`);
      } catch (err) {
        blocks.push(null);
        log.warn(`  ${w.role} 이미지 실패 — 글은 이미지 없이 저장합니다: ${err.message}`);
      }
    }
  }

  const tagIds = await resolveTagIds(parsed.tags);
  const seoFields = loadSiteReport()?.seoFields || { writable: [] };

  const saved = await saveDraft({
    title: parsed.title,
    body,
    categoryId: cat.id,
    tagIds,
    seo: {
      seoTitle: parsed.seoTitle,
      metaDescription: parsed.metaDescription,
      focusKeyword: parsed.focusKeyword,
      slug: parsed.slug,
    },
    seoFields,
    images: blocks,
    adHtml: AD_SNIPPET ? adHtml(AD_SNIPPET) : '',
    watchHtml: watch ? watchBannerHtml(watch) : '',
    featuredMediaId: featuredId,
  });

  log.ok(`임시글 저장 완료 (ID ${saved.id}, 상태 ${saved.status})`);
  if (saved.adminUrl) log.info(`편집: ${saved.adminUrl}`);
  if (!saved.savedMeta.length && parsed.seoTitle) {
    log.raw('');
    log.raw('    ┌─ Rank Math에 붙여넣을 값 ────────────────────────');
    log.raw(`    │ SEO 제목   : ${parsed.seoTitle}`);
    log.raw(`    │ 설명       : ${parsed.metaDescription}`);
    log.raw(`    │ 대표 키워드 : ${parsed.focusKeyword}`);
    log.raw('    └──────────────────────────────────────────────────');
  }
  return saved;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  // --no-image: 이미지를 만들지 않는다. 한글 폰트가 없는 환경에서 텍스트
  // 카드를 만들면 글씨가 깨져 나오므로, 그럴 때 쓴다.
  const 이미지없이 = args.includes('--no-image');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('사용법: node src/wordpress/from-file.mjs <글 파일.md> [--no-image]');
    process.exit(1);
  }
  try {
    await publishFromFile(file, { withImages: !이미지없이 });
  } catch (err) {
    log.fail('올리기 실패', err);
    process.exitCode = 1;
  }
}
