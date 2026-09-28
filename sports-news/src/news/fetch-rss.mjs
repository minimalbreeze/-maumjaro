// RSS 수집.
//
// 저작권 원칙: 기사 전문을 저장하지 않는다. 제목·요약(피드가 주는 한 줄)·링크·발행일·
// 매체명만 가져온다. 이 데이터는 "무슨 일이 있었는지 알아내기 위한 단서"로만 쓰이고,
// 최종 글은 사실 확인을 거친 내용으로 새로 쓴다.
//
// 외부 라이브러리를 쓰지 않는다. RSS 2.0 / Atom은 구조가 단순해서
// 정규식 기반 파서로 충분하고, 의존성이 늘면 그만큼 관리 비용이 든다.

import { withRetry } from '../utils/retry.mjs';

const UA = 'Mozilla/5.0 (compatible; SportsNewsDraftBot/0.1; +personal blog research)';

/* ── XML 유틸 ───────────────────────────────────────────── */

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&apos;': "'", '&#39;': "'", '&nbsp;': ' ',
};

export function decodeEntities(s = '') {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

export function stripTags(s = '') {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const cdata = new RegExp(`<${name}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${name}>`, 'i').exec(block);
  if (cdata) return cdata[1].trim();
  const plain = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return plain ? decodeEntities(plain[1]).trim() : '';
}

function attr(block, name, key) {
  const m = new RegExp(`<${name}[^>]*\\b${key}=["']([^"']+)["']`, 'i').exec(block);
  return m ? m[1] : '';
}

/* ── 파서 ───────────────────────────────────────────────── */

/** RSS 2.0과 Atom을 모두 받아 공통 형태로 돌려준다. */
export function parseFeed(xml, { sourceLabel = '' } = {}) {
  const blocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map((m) => m[0]);

  const items = [];
  for (const b of blocks) {
    const title = stripTags(tag(b, 'title'));
    if (!title) continue;

    const link = tag(b, 'link') || attr(b, 'link', 'href');
    const dateRaw = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const published = parseDate(dateRaw);

    // 구글뉴스 피드는 <source>에 원매체명이 들어온다. 없으면 링크 도메인으로 대체.
    const source = stripTags(tag(b, 'source')) || sourceLabel || hostOf(link);

    items.push({
      title,
      link: link.trim(),
      source,
      publishedAt: published ? published.toISOString() : null,
      // 요약은 한 줄로 잘라 보관한다. 전문 저장 금지 원칙에 따라 길이를 제한한다.
      summary: stripTags(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 300),
    });
  }
  return items;
}

export function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/* ── 수집 ───────────────────────────────────────────────── */

export async function fetchFeed(url, { timeoutMs = 15000 } = {}) {
  return withRetry(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: ctrl.signal });
      if (!res.ok) {
        const err = new Error(`피드 응답 ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }, { tries: 3, label: 'RSS 수집' });
}

export function buildQueryUrl(template, query) {
  return template.replace('{query}', encodeURIComponent(query));
}

/** 발행일이 창(window) 안인 것만 남긴다. 날짜를 못 읽은 건은 따로 표시해 통과시킨다. */
export function filterRecent(items, hoursWindow) {
  const cutoff = Date.now() - hoursWindow * 3600 * 1000;
  const fresh = [];
  const undated = [];
  for (const it of items) {
    if (!it.publishedAt) { undated.push({ ...it, dateUnknown: true }); continue; }
    if (new Date(it.publishedAt).getTime() >= cutoff) fresh.push({ ...it, dateUnknown: false });
  }
  return { fresh, undated };
}

/** 같은 기사가 여러 검색어에 걸리므로 링크 기준으로 중복을 없앤다. */
export function dedupeItems(items) {
  const seen = new Map();
  for (const it of items) {
    const key = canonicalLink(it.link) || it.title;
    const prev = seen.get(key);
    // 같은 기사라면 발행일이 있는 쪽을 남긴다.
    if (!prev || (!prev.publishedAt && it.publishedAt)) seen.set(key, it);
  }
  return [...seen.values()];
}

export function canonicalLink(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|oc$)/i.test(p)) u.searchParams.delete(p);
    }
    return u.toString();
  } catch { return url || ''; }
}
