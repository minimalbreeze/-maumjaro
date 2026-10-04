// 공식 페이지를 직접 받아온다. 웹검색 한도와 무관하게 사실을 얻는 길이다.
//
// 왜 필요한가
//   틈새 글(시설 요금·예약방법)은 뉴스에 안 나온다. 그래서 --research 경로는
//   웹검색이 유일한 출처였고, 계정 한도(Server tool use limit exceeded)에 걸리면
//   한 건도 못 가져왔다. 2026-10-04 에 파3 골프장 글이 그 때문에 두 번 연속
//   실패했다(각 4원). 돈이 되는 글일수록 이 한도에 걸린다.
//
//   GitHub Actions 러너는 네트워크가 열려 있다. config/facilities.json 에 사람이
//   확인해 적어둔 공식 주소를 직접 받아오면 웹검색 없이도 요금표를 읽을 수 있다.
//
// 지키는 것
//   - 설정에 적힌 주소만 받아온다. 주소를 만들어내지 않는다.
//   - 한 번만 받아온다. 같은 사이트를 반복해 긁지 않는다.
//   - 받아온 내용을 그대로 사실로 쓰지 않는다. 출처 주소와 받은 시각을 함께
//     넘겨서, 사실 확인 단계가 "공식 페이지에 이렇게 적혀 있다"로 다루게 한다.
//   - 실패를 조용히 넘기지 않는다. 무엇이 왜 안 됐는지 남긴다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../utils/env.mjs';

let cache = null;
export function loadFacilities() {
  if (cache) return cache;
  const file = path.join(ROOT, 'config', 'facilities.json');
  try {
    cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { 시설: [] };
  } catch {
    cache = { 시설: [] };
  }
  if (!Array.isArray(cache.시설)) cache.시설 = [];
  return cache;
}

/**
 * 주제에 들어 있는 시설을 고른다. 이름이나 별칭이 주제 글자에 있으면 고른다.
 *
 * 공백을 지우고 견준다 — 사람은 "남서울CC 파3"와 "남서울cc파3"를 같은 말로 쓴다.
 */
export function pickFacilities(subject, { config = loadFacilities(), limit = 3 } = {}) {
  const 글 = String(subject || '').toLowerCase().replace(/\s+/g, '');
  if (!글) return [];
  const 골라진 = [];
  for (const f of config.시설) {
    if (!f?.공식) continue;
    const 이름들 = [f.이름, ...(f.별칭 || [])].filter(Boolean);
    const 걸림 = 이름들.some((n) => 글.includes(String(n).toLowerCase().replace(/\s+/g, '')));
    if (걸림) 골라진.push(f);
    if (골라진.length >= limit) break;
  }
  return 골라진;
}

/** HTML에서 사람이 읽는 글자만 남긴다. 스크립트·스타일은 통째로 버린다. */
export function textFromHtml(html) {
  let t = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // 표의 칸 구분이 사라지면 요금표가 숫자 뭉치가 된다. 구분자를 남긴다.
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/(tr|p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 금액처럼 보이는 숫자를 문맥과 함께 뽑는다.
 *
 * 숫자만 뽑으면 쓸 수 없다 — "13,000"이 무엇의 값인지 알아야 한다. 그래서 그
 * 숫자가 들어 있는 줄을 그대로 돌려준다. 판단은 사실 확인 단계가 한다.
 */
export function 금액줄찾기(text, { limit = 25 } = {}) {
  const 줄 = String(text || '').split('\n');
  const 돈 = /(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+\s*(?:원|만원))/;
  const out = [];
  for (const l of 줄) {
    const s = l.trim();
    if (s.length < 2 || s.length > 300) continue;
    if (!돈.test(s)) continue;
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 공식 페이지 한 곳을 받아온다. 실패해도 던지지 않는다 — 글은 그대로 나가야 한다.
 */
export async function fetchOfficial(url, { timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const 받은시각 = new Date().toISOString();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ac.signal,
      headers: {
        // 사람이 브라우저로 보는 것과 같은 공개 페이지를 한 번 읽는다.
        'user-agent': 'Mozilla/5.0 (compatible; sports-news/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return { url, ok: false, 받은시각, why: `HTTP ${res.status}` };
    const html = await res.text();
    const text = textFromHtml(html);
    if (text.length < 40) return { url, ok: false, 받은시각, why: '읽을 글자가 거의 없습니다 (스크립트로 그리는 페이지일 수 있습니다)' };
    return { url, ok: true, 받은시각, text, 금액줄: 금액줄찾기(text) };
  } catch (err) {
    return { url, ok: false, 받은시각, why: err.name === 'AbortError' ? `${timeoutMs}ms 안에 응답이 없었습니다` : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** 고른 시설들의 공식 페이지를 받아온다. 하나씩 차례로 — 몰아서 긁지 않는다. */
export async function gatherOfficial(facilities, opts = {}) {
  const out = [];
  for (const f of facilities) {
    const r = await fetchOfficial(f.공식, opts);
    out.push({ 이름: f.이름, 지역: f.지역 || '', note: f.note || '', 확인일: f.확인일 || '', ...r });
  }
  return out;
}

/**
 * 사실 확인 단계에 넘길 글을 만든다.
 *
 * 받아온 내용을 "사실"이라고 단정하지 않는다. 어디서 언제 받았는지 밝히고,
 * 그 페이지에 적혀 있는 것만 쓰라고 못 박는다. 페이지가 바뀌었을 수도 있고
 * 우리가 잘못 긁었을 수도 있다.
 */
export function officialBlock(received, { maxChars = 2500 } = {}) {
  const 성공 = received.filter((r) => r.ok);
  if (!성공.length) return '';

  const 조각 = 성공.map((r) => {
    const 금액 = r.금액줄?.length
      ? `\n  금액이 적힌 줄:\n${r.금액줄.map((l) => `    ${l}`).join('\n')}`
      : '\n  (금액처럼 보이는 줄을 찾지 못했습니다)';
    const 본문 = r.text.slice(0, maxChars);
    return `### ${r.이름}${r.지역 ? ` (${r.지역})` : ''}
  출처: ${r.url}
  받은 시각: ${r.받은시각}${r.note ? `\n  설정에 적힌 메모: ${r.note}` : ''}${금액}
  페이지 글자(앞 ${Math.min(maxChars, r.text.length)}자):
${본문}`;
  }).join('\n\n');

  return `## 공식 페이지에서 직접 받아온 내용

아래는 설정(config/facilities.json)에 사람이 확인해 적어둔 공식 주소에서 **코드가
직접 받아온** 글자다. 웹검색 결과가 아니다.

${조각}

이 내용을 쓸 때 지킬 것:
- **여기 적혀 있는 것만** confirmed 에 넣는다. 적혀 있지 않은 요금·시간을 추측하지 않는다.
- sources 에 위 출처 주소를 그대로 적는다.
- 표를 잘못 읽었을 수 있다. 숫자가 무엇의 값인지 줄 문맥으로 분명히 판단되는 것만 쓴다.
- 페이지가 바뀌었을 수 있으므로 글에는 "확인일" 기준임을 밝힌다.`;
}
