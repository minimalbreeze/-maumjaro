// SEO 제목·메타 설명·키워드·태그 생성.
//
// 지시서 [10]: 낚시성 SEO 금지, 키워드 반복 금지, 메타 설명은 실제 내용 요약.
// 그래서 본문을 다 쓴 뒤에 본문을 읽고 생성한다. 먼저 만들면 본문과 어긋난다.

import { callForJson } from './client.mjs';
import { normalizeTags } from '../wordpress/taxonomy.mjs';

const SYSTEM = `당신은 한국어 블로그 SEO 담당자입니다.

원칙:
- 메타 설명은 실제 글 내용을 정확히 요약합니다. 글에 없는 내용을 넣지 않습니다.
- 같은 키워드를 억지로 반복하지 않습니다.
- 자극적인 낚시 문구를 쓰지 않습니다.
- 태그는 그 글에서만 통하는 구체적인 키워드로 채웁니다. "뉴스", "정보"처럼
  변별력 없는 태그는 넣지 않습니다.`;

const SEO_SCHEMA = {
  type: 'object',
  properties: {
    seoTitle: {
      type: 'string',
      description: '검색엔진용 제목. 핵심 키워드를 앞에 두고 60자 이내로. 블로그 제목과 달라도 된다.',
    },
    metaDescription: {
      type: 'string',
      description: '메타 설명. 글 내용을 정확히 요약한 한국어 문장. 100~155자.',
    },
    focusKeyword: {
      type: 'string',
      description: '이 글의 대표 검색 키워드 하나',
    },
    keywords: {
      type: 'array',
      description: '부가 키워드 3~6개',
      items: { type: 'string' },
    },
    tags: {
      type: 'array',
      description: '워드프레스 태그 5~10개. # 기호를 쓰지 않는다. 대표 키워드 + 실제 검색할 법한 조합 키워드 + 종목명.',
      items: { type: 'string' },
    },
    slug: {
      type: 'string',
      description: '영문 소문자와 하이픈으로 된 URL 슬러그. 한글을 쓰지 않는다.',
    },
  },
  required: ['seoTitle', 'metaDescription', 'focusKeyword', 'keywords', 'tags', 'slug'],
  additionalProperties: false,
};

export async function generateSeo({ title, body, topic, category }) {
  const result = await callForJson({
    system: SYSTEM,
    prompt: `다음은 방금 작성한 블로그 글입니다.

종목: ${topic}
카테고리: ${category}
제목: ${title}

본문:
${body.slice(0, 12000)}

이 글에 맞는 SEO 정보를 generate_seo 도구로 만들어주세요.`,
    toolName: 'generate_seo',
    description: '블로그 글의 SEO 제목·메타 설명·키워드·태그를 생성합니다.',
    schema: SEO_SCHEMA,
    maxTokens: 8000,
    effort: 'medium',
  });

  return {
    ...result,
    tags: normalizeTags(result.tags),
    metaDescription: clamp(result.metaDescription, 160),
    seoTitle: clamp(result.seoTitle, 70),
    slug: sanitizeSlug(result.slug, topic),
  };
}

function clamp(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  // 문장 중간에서 자르지 않도록 마지막 구두점까지만 남긴다.
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'), cut.lastIndexOf(' '));
  return (lastStop > max * 0.6 ? cut.slice(0, lastStop) : cut).trim();
}

function sanitizeSlug(slug, fallback) {
  const s = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || `${String(fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
}
