// 메타 설명이 비어 있는 글을 찾아 본문에서 뽑아 채운다. AI를 부르지 않는다(0원).
//
//   npm run meta:fill -- --dry-run          몇 개가 비었는지, 무엇으로 채울지 미리보기
//   npm run meta:fill -- --limit=50         50개만 채우기
//
// 왜 필요한가
//   Rank Math를 나중에 설치해서, 그 전에 쓴 글은 메타 설명이 비어 있다.
//   비어 있으면 검색엔진이 본문 아무 데나 잘라서 보여준다. 노출은 되는데
//   클릭이 안 되는 큰 이유다. 실측에서 387번 노출에 클릭 4번인 글이 있었다.
//
// 안전장치 (발행된 글을 건드리기 때문에)
//   - 이미 설명이 있는 글은 건드리지 않는다. 덮어쓰지 않는다.
//   - 제목·슬러그·상태·본문을 보내지 않는다. meta 하나만 보낸다.
//   - 고치기 전에 원본을 파일로 남긴다.
//   - --limit으로 조금씩 나눠서 한다. 한 번에 수백 개를 밀지 않는다.

import { wpFetch } from './client.mjs';
import { htmlToText } from './fix-seo.mjs';
import { saveBackup } from './retitle.mjs';
import { loadEnv } from '../utils/env.mjs';
import { log } from '../utils/logger.mjs';

/**
 * 본문에서 메타 설명을 뽑는다.
 *
 * 첫 문단이 보통 글의 요약이다. 문장 중간에서 자르지 않도록 마침표까지만 쓴다.
 * 대표 키워드가 있으면 앞쪽에 들어가 있는지 확인하고, 없으면 앞에 붙인다.
 *
 * 인사말은 걷어낸다. "안녕하세요, 스포츠 팬 여러분!"이 설명의 절반을 잡아먹으면
 * 검색결과에서 정작 필요한 정보가 안 보인다. 155자는 생각보다 짧다.
 */
/**
 * 글 맨 앞의 인사말을 걷어낸다. 한 번만, 앞에서만 지운다.
 *
 * 좁게 잡는 이유: 처음에는 "앞 30자 안에 팬/여러분이 있고 !로 끝나면 인사말"로
 * 잡았다. 그러면 `김주형은 우승 후 "안녕하세요, 팬 여러분!" 이라고 인사했다`의
 * 앞부분까지 먹어서 설명이 따옴표로 시작했다. 그래서 인사 동사(안녕하세요·
 * 반갑습니다)를 반드시 요구하고, 부름말에는 따옴표·마침표가 못 끼게 했다.
 */
export function 인사말빼기(text) {
  let t = String(text || '').trim();
  const 인사 = [
    // "안녕하세요, 스포츠 팬 여러분!" — 인사말로 시작하는 한 문장
    /^(?:안녕하세요|안녕하십니까|반갑습니다)[^.!?]{0,20}[.!?]\s*/,
    // "파크골프 팬 여러분 반갑습니다!" — 부름말 + 인사 동사
    /^[가-힣A-Za-z0-9 ]{0,20}(?:팬|독자)\s*여러분[,\s]*(?:안녕하세요|안녕하십니까|반갑습니다)[!.~]*\s*/,
    // "스포츠 팬 여러분!" — 부름말만
    /^[가-힣A-Za-z0-9 ]{0,20}(?:팬|독자)\s*여러분[!~]+\s*/,
  ];
  for (const re of 인사) {
    const 지운뒤 = t.replace(re, '');
    // 다 지워버리면 원래 글이 인사말뿐이라는 뜻이다. 그땐 그대로 둔다.
    if (지운뒤.trim().length >= 20) t = 지운뒤.trim();
  }
  return t;
}

// 쿠팡 파트너스 고지문. 글 맨 앞에 붙어 있는 글이 많다.
// 이게 메타 설명이 되면 검색결과에 "수수료를 제공받습니다"만 보인다.
const 쿠팡고지 = /^["'“”‘’]?\s*이\s*포스팅은\s*쿠팡\s*파트너스[^"'“”]{0,80}?제공받습니다[.]?\s*["'“”‘’]?\s*/;

// 글 앞머리의 이모지·기호. 😊 ♟️ 같은 것들.
// 설명이 이모지로 시작하면 검색결과에서 가장 중요한 첫 자리를 버린다.
const 선행이모지 = /^(?:[\p{Extended_Pictographic}\p{So}\uFE0F\u200D]\s*)+/u;

/** 비교용으로 다듬는다 — 연도·공백·기호를 지워 제목과 본문 앞머리를 맞춰본다. */
function 비교형(v) {
  return String(v || '')
    .replace(/^\s*20\d\d[-\s]*(?:\d\d)?\s*/, '')
    .replace(/[\s\u2013\u2014·,.!?"'“”‘’()[\]]/g, '')
    .toLowerCase();
}

/**
 * 본문 맨 앞에 제목이 한 번 더 적혀 있으면 지운다.
 *
 * 실측 사례:
 *   "몽백합배 세계바둑오픈 (신진서 홀로 남았다, 한국 유일 16강 생존!) ♟️ 안녕하세요..."
 *   "(동아회원권그룹 오픈)안녕하세요, 골프 팬 여러분!..."
 *
 * 추측으로 자르지 않는다. 지우려는 앞머리가 제목과 실제로 맞을 때만 지운다 —
 * 괄호 안의 말이 제목에 들어 있거나, 앞머리가 제목 자체일 때만.
 */
export function 제목중복빼기(text, title) {
  const t = String(text || '').trim();
  const 제목 = 비교형(title);
  if (!제목) return t;

  // ① "(대회명)" 으로 시작하고, 괄호 안의 말이 제목에 들어 있을 때
  const 괄호 = /^\(([^)]{2,40})\)\s*/.exec(t);
  if (괄호) {
    const 안 = 비교형(괄호[1]);
    if (안.length >= 2 && 제목.includes(안)) {
      const 지운뒤 = t.slice(괄호[0].length).trim();
      if (지운뒤.length >= 20) return 지운뒤;
    }
  }

  // ② 앞머리가 제목 그 자체일 때
  for (let n = Math.min(t.length, String(title).length + 12); n >= 8; n--) {
    const 앞 = 비교형(t.slice(0, n));
    if (앞.length >= 8 && (앞 === 제목 || 제목.endsWith(앞) || 제목.startsWith(앞))) {
      const 지운뒤 = t.slice(n).trim();
      if (지운뒤.length >= 20) return 지운뒤;
      break;
    }
  }
  return t;
}

/**
 * 설명이 될 수 없는 앞머리를 전부 걷어낸다.
 *
 * 왜 반복하는가: 한 글에 여러 겹으로 쌓여 있다. 실측에서 이렇게 나왔다.
 *   제목 중복 → 이모지 → 인사말 → 쿠팡 고지문 → 다시 인사말
 * 한 번씩 순서대로 돌리면 순서가 다른 글에서 또 남는다. 더 지울 게 없을 때까지
 * 돌리면 순서를 몰라도 된다.
 *
 * 매번 "지우고 20자 이상 남는가"를 본다. 지울 게 글의 전부면 그대로 둔다 —
 * 빈 설명보다는 허술한 설명이 낫다.
 */
export function 앞머리정리(text, title = '') {
  let t = String(text || '').trim();
  for (let i = 0; i < 8; i++) {
    const 전 = t;
    for (const re of [쿠팡고지, 선행이모지]) {
      const 지운뒤 = t.replace(re, '').trim();
      if (지운뒤.length >= 20) t = 지운뒤;
    }
    t = 제목중복빼기(t, title);
    t = 인사말빼기(t);
    if (t === 전) break;
  }
  return t;
}

/** 설명이 이 꼴이면 우리가 잘못 채운 것이다 — 사람은 이렇게 쓰지 않는다. */
export function 망친설명인가(description) {
  const d = String(description || '').trim();
  if (!d) return false;
  if (쿠팡고지.test(d)) return true;
  if (선행이모지.test(d)) return true;
  if (/이\s?포스팅은\s?쿠팡\s?파트너스/.test(d)) return true;
  if (/안녕하세요/.test(d) && /여러분|팬/.test(d)) return true;
  if (/정보입니다\.\s*["'“”]/.test(d)) return true;
  return false;
}

export function describeFrom(content, { title = '', focusKeyword = '', max = 155 } = {}) {
  const text = 앞머리정리(htmlToText(content), title).trim();
  if (!text) return '';

  // 문장 단위로 모으다가 길이를 넘기기 직전에 멈춘다.
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of sentences) {
    if (!s.trim()) continue;
    if (out && (out + ' ' + s).length > max) break;
    out = out ? `${out} ${s}` : s;
    // 검색결과에 보이는 길이는 120~155자다. 너무 짧으면 자리를 낭비한다.
    if (out.length >= max * 0.85) break;
  }
  if (!out) out = text.slice(0, max);

  // 키워드가 설명 안에 없으면 앞에 붙인다. 검색결과에서 굵게 표시되는 부분이다.
  const kw = String(focusKeyword || '').trim();
  if (kw && !out.includes(kw)) {
    const 붙임 = `${kw} 정보입니다. ${out}`;
    out = 붙임.length <= max + 20 ? 붙임 : out;
  }

  if (out.length > max) {
    const cut = out.slice(0, max);
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '));
    out = (stop > max * 0.6 ? cut.slice(0, stop) : cut).trim();
  }
  return out.trim();
}

/**
 * 발행된 글을 훑어 손봐야 할 것을 모은다.
 *
 *   empty  — 메타 설명이 비어 있다. 채울 대상.
 *   broken — 설명이 있지만 우리가 잘못 채운 것이다(쿠팡 고지문·인사말·이모지로
 *            시작). 덮어쓸 대상. 사람이 쓴 설명은 이 꼴이 되지 않는다.
 *
 * 사람이 쓴 멀쩡한 설명은 어느 쪽에도 들어가지 않는다 — 덮어쓰지 않는다.
 */
export async function findEmptyDescriptions({ maxPages = 30, perPage = 50 } = {}) {
  const empty = [];
  const broken = [];
  let scanned = 0;

  for (let page = 1; page <= maxPages; page++) {
    const { data, headers } = await wpFetch('/wp/v2/posts', {
      query: { per_page: perPage, page, context: 'edit', status: 'publish', orderby: 'date', order: 'desc' },
    });
    if (!Array.isArray(data) || !data.length) break;
    scanned += data.length;

    for (const p of data) {
      const 현재 = String(p.meta?.rank_math_description || '').trim();
      const 망침 = 현재 ? 망친설명인가(현재) : false;
      // 사람이 쓴 멀쩡한 설명이면 건드리지 않는다.
      if (현재 && !망침) continue;
      const row = {
        id: p.id,
        title: p.title?.raw || p.title?.rendered || '',
        slug: decodeURIComponent(p.slug || ''),
        status: p.status,
        focusKeyword: p.meta?.rank_math_focus_keyword || '',
        seoTitle: p.meta?.rank_math_title || '',
        description: 현재,
        content: p.content?.raw || p.content?.rendered || '',
      };
      (망침 ? broken : empty).push(row);
    }

    const totalPages = Number(headers.get('x-wp-totalpages') || 1);
    if (page >= totalPages) break;
  }
  return { empty, broken, scanned };
}

/** 한 글의 메타 설명을 채운다. meta 하나만 보낸다. */
export async function fillOne(post, { apply = true } = {}) {
  const description = describeFrom(post.content, { title: post.title, focusKeyword: post.focusKeyword });
  if (!description) return { id: post.id, title: post.title, description: '', changed: false };

  let backup = null;
  if (apply) {
    backup = saveBackup({
      id: post.id, status: post.status, title: post.title, slug: post.slug,
      seoTitle: post.seoTitle, description: post.description || '', focusKeyword: post.focusKeyword,
    });
    // 제한시간을 넉넉히 둔다. 20초로는 세 글이 시간을 넘겨 실패했다
    // (6961·6953·6946). 이 호스팅은 쓰기 한 번에 5~8초가 걸린다.
    await wpFetch(`/wp/v2/posts/${post.id}`, {
      method: 'POST',
      body: { meta: { rank_math_description: description } },
      timeoutMs: 45000,
    });
  }
  return { id: post.id, title: post.title, description, changed: true, backup };
}

/**
 * 미리보기 표본을 목록 전체에 걸쳐 고른다.
 *
 * 왜 이렇게 하는가 — 실제로 당한 일이다. 앞의 5개만 보여줬더니 그 5개가 모두
 * 최근에 이 도구로 쓴 깨끗한 글이었다. "깨끗하다"고 판단해서 47개를 밀었는데,
 * 뒤쪽 600개는 손으로 쓴 글이라 쿠팡 고지문·인사말·이모지가 앞머리에 쌓여
 * 있었다. 47개를 망친 뒤에야 알았다.
 *
 * 앞·중간·뒤에서 고루 뽑는다. 글이 쓰인 시기마다 양식이 다르기 때문이다.
 */
export function 표본고르기(list, n = 12) {
  if (list.length <= n) return list.slice();
  const out = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    // 0 ~ 마지막까지 고르게 벌린다. 끝도 반드시 포함한다.
    const idx = Math.round((i * (list.length - 1)) / (n - 1));
    if (!seen.has(idx)) { seen.add(idx); out.push(list[idx]); }
  }
  return out;
}

async function main() {
  const apply = !process.argv.includes('--dry-run');
  const 고치기 = process.argv.includes('--repair');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;

  const 무슨일 = 고치기 ? '잘못 채운 설명 고치기' : '메타 설명 채우기';
  log.section(`📝 ${무슨일} ${apply ? `(최대 ${limit}개)` : '(미리보기 — 저장하지 않습니다)'}`);

  const { empty, broken, scanned } = await findEmptyDescriptions();
  log.info(`발행된 글 ${scanned}개 — 설명이 빈 글 ${empty.length}개, 잘못 채운 글 ${broken.length}개`);

  const 전체 = 고치기 ? broken : empty;
  if (!전체.length) { log.ok(고치기 ? '고칠 것이 없습니다.' : '채울 것이 없습니다.'); return; }

  // 미리보기는 목록 전체에 걸쳐 고른다. 앞쪽만 보면 뒤쪽 양식을 놓친다.
  const 대상 = apply ? 전체.slice(0, limit) : 표본고르기(전체, 12);
  if (!apply) log.info(`아래는 ${전체.length}개 중 앞·중간·뒤에서 고루 뽑은 ${대상.length}개입니다.`);
  log.raw('');

  let 채움 = 0;
  let 남은문제 = 0;
  for (const post of 대상) {
    try {
      const r = await fillOne(post, { apply });
      if (!r.changed) { log.warn(`[${post.id}] 본문에서 뽑을 내용이 없습니다 — ${post.title.slice(0, 40)}`); continue; }
      채움++;
      log.info(`[${r.id}] ${r.title.slice(0, 44)}`);
      if (고치기 && post.description) log.raw(`      전: ${post.description.slice(0, 70)}`);
      // 아직 걸러지지 않은 앞머리가 있으면 눈에 띄게 알린다. 조용히 넘기지 않는다.
      if (망친설명인가(r.description)) {
        남은문제++;
        log.warn(`      → ${r.description}`);
        log.warn('        ⚠ 아직 앞머리가 남아 있습니다');
      } else {
        log.ok(`      → ${r.description}`);
      }
    } catch (err) {
      log.fail(`[${post.id}] 실패`, err);
    }
  }

  log.raw('');
  if (남은문제) {
    log.warn(`${남은문제}개는 앞머리가 아직 남아 있습니다. 적용하기 전에 걸러내는 규칙을 고쳐야 합니다.`);
  }
  if (apply) {
    log.ok(`${채움}개 ${고치기 ? '고쳤습니다' : '채웠습니다'}. 남은 글 ${Math.max(0, 전체.length - 채움)}개`);
    if (전체.length > 채움) log.info('  다시 돌리면 이어서 합니다.');
  } else {
    log.info(`미리보기입니다. 실제로는 ${전체.length}개가 대상입니다.`);
    if (남은문제) log.fail('미리보기에 문제가 보입니다 — 이대로 적용하지 마세요.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnv();
  await main();
}
