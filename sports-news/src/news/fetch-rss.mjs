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
    const rawTitle = stripTags(tag(b, 'title'));
    if (!rawTitle) continue;
    const { title, trailingSource } = splitSourceSuffix(rawTitle);

    const link = tag(b, 'link') || attr(b, 'link', 'href');
    const dateRaw = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const published = parseDate(dateRaw);

    // 구글뉴스 피드는 <source>에 원매체명이 들어온다. 없으면 링크 도메인으로 대체.
    const source = stripTags(tag(b, 'source')) || trailingSource || sourceLabel || hostOf(link);

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

/**
 * 구글뉴스는 제목 끝에 " - 매체명"을 붙인다.
 *
 * 이게 붙어 있으면 같은 사건을 다룬 기사끼리도 매체명이 달라 유사도가 떨어진다.
 * 실측: 같은 사건 3건이 꼬리표를 떼면 0.36~0.70, 붙은 채로는 0.25~0.47.
 * 임계값 0.34 기준으로 일부가 묶이지 못해 "출처 부족"으로 탈락한다.
 *
 * 떼어낸 매체명은 버리지 않고 source가 비었을 때 쓴다.
 */
export function splitSourceSuffix(title) {
  // 마지막 " - " 뒤가 짧고 줄바꿈 없는 조각이면 매체명으로 본다.
  // 제목 본문에 하이픈이 쓰이는 경우(예: "3-0 승리")를 건드리지 않도록
  // 앞뒤 공백이 있는 " - "만 본다.
  const m = /^(.*\S)\s+-\s+([^\s-][^-]{0,24})$/.exec(title);
  if (!m) return { title, trailingSource: '' };
  const [, head, tail] = m;
  // 본문이 너무 짧아지면 잘못 자른 것이다.
  if (head.length < 8) return { title, trailingSource: '' };
  return { title: head.trim(), trailingSource: tail.trim() };
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
  const stale = [];
  for (const it of items) {
    if (!it.publishedAt) { undated.push({ ...it, dateUnknown: true }); continue; }
    if (new Date(it.publishedAt).getTime() >= cutoff) fresh.push({ ...it, dateUnknown: false });
    else stale.push(it);
  }
  // stale을 따로 세는 이유: "수집은 75건인데 최근 1건"만 보면 원인을 알 수 없다.
  // 오래된 기사가 많은 건지, 날짜를 못 읽은 건지 구분돼야 손을 쓸 수 있다.
  return { fresh, undated, stale };
}

/** 기간 제한 검색어를 만든다. 구글뉴스의 when: 연산자 등. */
export function applyQuerySuffix(query, suffixTemplate, hoursWindow) {
  if (!suffixTemplate) return query;
  const days = Math.max(1, Math.ceil(hoursWindow / 24));
  return query + suffixTemplate.replace('{days}', String(days));
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
