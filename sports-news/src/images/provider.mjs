// 대표 이미지를 만든다.
//
// OPENAI_API_KEY가 있으면 AI로 새 그림을 생성하고, 없으면 텍스트 카드를 쓴다.
// 키가 없다고 글 생성이 멈추면 안 되므로, 생성이 실패해도 항상 카드로 떨어진다.
//
// 보도사진을 가져다 쓰지 않는다. 사진을 찍은 쪽의 권리 문제이기도 하고,
// 블로그가 삭제 요청이나 검색 불이익을 받을 수 있다.

import { env } from '../utils/env.mjs';
import { withRetry } from '../utils/retry.mjs';
import { renderCard } from './textcard.mjs';

export function hasAiImage() {
  return Boolean(env('OPENAI_API_KEY'));
}

/**
 * AI에 넘길 장면 묘사를 만든다.
 *
 * 실존 인물을 그리게 하지 않는다. 얼굴이 닮게 나오면 그것대로 초상권 문제가
 * 되고, 애초에 닮게 그려지지도 않는다. 종목의 분위기와 장소를 묘사한다.
 */
export function scenePrompt({ topic, title }) {
  const scenes = {
    KBO: '저녁 조명이 켜진 프로야구 경기장 전경, 텅 빈 마운드와 관중석, 극적인 조명',
    KLPGA: '한국의 골프장 페어웨이, 잔디와 깃대, 맑은 하늘',
    JLPGA: '일본의 골프 코스 전경, 정돈된 그린과 벙커',
    LPGA: '넓은 골프 코스와 갤러리 스탠드, 오후 햇살',
    PGA: '미국식 골프 코스의 18번 홀, 클럽하우스가 보이는 풍경',
    파크골프: '잔디가 넓게 펼쳐진 파크골프장, 완만한 언덕과 깃대',
    배드민턴: '실내 배드민턴 경기장, 코트와 네트, 밝은 조명',
    당구: '당구 경기장의 테이블과 조명, 초록 라사지와 공',
    바둑: '바둑판과 흑백 돌이 놓인 대국장, 차분한 조명',
    축구: '축구 경기장의 잔디와 골대, 야간 조명',
    농구: '실내 농구 코트와 백보드, 관중석 조명',
    배구: '실내 배구 코트와 네트, 경기장 조명',
    볼링: '볼링장의 레인과 핀, 조명이 반사되는 마루',
  };
  const scene = scenes[topic] || `${topic} 경기장 전경`;
  return [
    scene + '.',
    '사람의 얼굴이 보이지 않는 구도.',
    '스포츠 블로그 대표 이미지에 어울리는 선명하고 생동감 있는 사진 느낌.',
    '글자나 로고를 넣지 않는다.',
  ].join(' ');
}

async function generateWithOpenAI({ topic, title }) {
  const key = env('OPENAI_API_KEY');
  const model = env('OPENAI_IMAGE_MODEL', 'dall-e-3');

  const res = await withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: scenePrompt({ topic, title }),
          n: 1,
          size: '1792x1024',
          response_format: 'b64_json',
        }),
        signal: ctrl.signal,
      });
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* HTML 에러 페이지 */ }
      if (!r.ok) {
        const err = new Error(json?.error?.message || `이미지 생성 실패 (${r.status})`);
        err.status = r.status;
        throw err;
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }, { tries: 2, base: 3000, label: 'AI 이미지 생성' });

  const b64 = res?.data?.[0]?.b64_json;
  if (!b64) throw new Error('이미지 데이터를 받지 못했습니다');
  return Buffer.from(b64, 'base64');
}

/**
 * 대표 이미지를 만든다. 무슨 일이 있어도 이미지를 돌려준다.
 * @returns {{ buffer: Buffer, kind: 'ai'|'card', alt: string, note: string }}
 */
export async function createHeroImage({ title, topic, focusKeyword, onFallback }) {
  const alt = buildAlt({ focusKeyword, topic, title });

  if (hasAiImage()) {
    try {
      const buffer = await generateWithOpenAI({ topic, title });
      return { buffer, kind: 'ai', alt, note: 'AI 생성' };
    } catch (err) {
      // 이미지 때문에 글을 날리지 않는다. 카드로 떨어뜨리고 이유만 남긴다.
      onFallback?.(err.message);
    }
  }

  const buffer = await renderCard({ title, label: topic, kind: 'hero', seed: topic });
  return { buffer, kind: 'card', alt, note: hasAiImage() ? '생성 실패 → 텍스트 카드' : '텍스트 카드' };
}

/** 본문 중간에 넣을 카드. 소제목을 그대로 쓴다. */
export async function createSectionImage({ heading, topic, focusKeyword }) {
  const clean = String(heading).replace(/^#+\s*/, '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const buffer = await renderCard({ title: clean, kind: 'section', seed: topic });
  return { buffer, kind: 'card', alt: buildAlt({ focusKeyword, topic, title: clean }), note: '텍스트 카드' };
}

/**
 * alt 텍스트. Rank Math는 대표 키워드가 alt에 들어가 있는지를 점수에 반영한다.
 * 그래서 키워드를 맨 앞에 두되, 읽었을 때 말이 되게 만든다.
 */
export function buildAlt({ focusKeyword, topic, title }) {
  const head = (focusKeyword || topic || '').trim();
  const tail = String(title).replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!head) return tail;
  return tail.includes(head) ? tail : `${head} - ${tail}`;
}
