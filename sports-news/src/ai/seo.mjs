// SEO 제목·메타 설명·키워드·태그 생성.
//
// 지시서 [10]: 낚시성 SEO 금지, 키워드 반복 금지, 메타 설명은 실제 내용 요약.
// 그래서 본문을 다 쓴 뒤에 본문을 읽고 생성한다. 먼저 만들면 본문과 어긋난다.

import { callForJson } from './client.mjs';
import { normalizeTags } from '../wordpress/taxonomy.mjs';
import { buildSlug } from '../seo/rankmath.mjs';
import { mainTokens } from '../news/normalize.mjs';

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
      description: '주소에 쓸 슬러그. 대표 키워드를 그대로 쓰되 공백은 하이픈으로. 이 블로그는 한글 슬러그를 쓴다(예: 야구-타율-3할).',
    },
  },
  required: ['seoTitle', 'metaDescription', 'focusKeyword', 'keywords', 'tags', 'slug'],
  additionalProperties: false,
};

export async function generateSeo({ title, body, topic, category }) {
  let result;
  try {
    result = await callSeoModel({ title, body, topic, category });
  } catch (err) {
    // 여기서 던지면 다 써 놓은 본문이 통째로 사라진다. 실제로 한 번 그랬다.
    // SEO는 나중에 손으로 고칠 수 있지만 본문은 다시 만들려면 돈이 또 든다.
    // 그래서 SEO만큼은 실패해도 글을 살린다.
    console.warn(`    ⚠️  SEO 생성 실패 — 제목에서 뽑아 채웁니다: ${err.message}`);
    result = localSeo({ title, body, topic });
  }

  return {
    ...result,
    tags: normalizeTags(result.tags),
    metaDescription: clamp(result.metaDescription, 160),
    seoTitle: clamp(result.seoTitle, 70),
    slug: buildSlug({ focusKeyword: result.focusKeyword, title: result.slug, fallback: topic }),
  };
}

async function callSeoModel({ title, body, topic, category }) {
  return callForJson({
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
}

/**
 * AI 없이 만드는 SEO 값.
 *
 * 좋은 값은 아니다. 임시글을 열어 Rank Math 칸에서 고치면 된다.
 * 목적은 딱 하나 — 다 쓴 글을 SEO 단계 하나 때문에 잃지 않는 것.
 */
export function localSeo({ title, body, topic }) {
  // 워프양식 제목은 "대회명/이슈 (클릭 유도형 부제목!)" 꼴이다. 괄호 앞이 핵심이다.
  const head = String(title).split('(')[0].trim().replace(/[\/·]/g, ' ').replace(/\s+/g, ' ');
  const focusKeyword = head.length >= 2 ? head.slice(0, 30) : topic;

  const firstLines = String(body)
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('<'))
    .join(' ')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 태그는 5~10개가 원칙이다(지시서 [12]). 제목에서 뽑은 말로 채운다.
  const tags = [...new Set([focusKeyword, topic, ...mainTokens(title)].filter((t) => t && t.length >= 2))].slice(0, 8);

  return {
    seoTitle: head || String(title),
    metaDescription: firstLines.slice(0, 155) || `${focusKeyword} 소식을 정리했습니다.`,
    focusKeyword,
    keywords: [focusKeyword, topic].filter(Boolean),
    tags,
    slug: focusKeyword,
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

