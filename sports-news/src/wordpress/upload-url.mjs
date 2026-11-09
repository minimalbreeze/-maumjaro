// 인터넷 주소의 이미지를 받아 **우리 워드프레스 미디어**에 올린다.
//
//   node src/wordpress/upload-url.mjs --alt="잠실 더 라스트 이닝 출전 선수 명단" https://...jpg
//   node src/wordpress/upload-url.mjs --alt="..." --apply https://...jpg
//
// 왜 필요한가 (2026-11-09)
//   효성님이 기사 이미지 주소를 주며 "이미지 그대로 끼워 넣으면 안 되나" 고
//   물었다. 넣는 것이 맞다 — 내가 명단을 글자로 옮기면 이름 한 글자가
//   틀릴 수 있고, 이미지는 원본 그대로다.
//
//   그런데 두 가지가 걸린다.
//   1. **내 컨테이너는 뉴스 사이트를 막는다**(프록시 403). 받을 수가 없다.
//      GitHub 러너는 다른 네트워크라 거기서는 받아진다.
//   2. **남의 서버 주소를 글에 그대로 쓰면 언제든 끊긴다.** 뉴스 CDN 주소는
//      기사가 내려가면 같이 죽는다. 우리 미디어에 올려야 안 끊긴다.
//      (루트 지시서가 야포츠 참조 사진에서 같은 판단을 적어 두었다 —
//       "저장소 안에 있어야 안 끊긴다")
//
// 지키는 선
//   - **미리보기가 기본이다.** --apply 가 없으면 받아만 보고 올리지 않는다.
//   - **alt 를 적어야 올린다.** 빈 alt 로 올라간 이미지는 나중에 고치는 일이
//     따로 생긴다(`이미지 설명` 모드가 그 빚을 갚는 도구다).
//   - **이미지가 맞는지 확인하고 올린다.** 받은 것이 HTML 오류 페이지면
//     거부한다 — 실제로 403 을 JPG 로 착각해 올리면 깨진 그림이 글에 박힌다.
//   - 한 번에 5개까지. 되돌리려면 워드프레스 미디어에서 지운다.
//   - 받는 쪽은 **읽기만** 한다. 남의 서버에 아무것도 보내지 않는다.

import { uploadMedia, safeFileName } from '../images/upload.mjs';
import { log } from '../utils/logger.mjs';

/** 한 번에 받는 이미지 수의 상한. */
export const 한번에최대 = 5;

/** 우리가 올릴 수 있는 그림 종류와 확장자. */
export const 그림종류 = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * 받은 바이트가 **진짜 그림인지** 가린다.
 *
 * ⚠️ Content-Type 만 믿지 않는다. 막힌 요청이 `text/html` 오류 페이지를
 *    200 으로 돌려주는 일이 흔하고, 그것을 그대로 올리면 깨진 그림이
 *    글에 박힌다. 파일 머리 몇 바이트(매직 넘버)를 함께 본다.
 */
export function 그림인가(buffer) {
  const b = buffer;
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

/** 주소에서 이미지를 받는다. 돌려주는 것은 { buffer, ext } 또는 던진다. */
export async function 받기(url, { timeoutMs = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      // 사람이 보는 것과 같은 것을 받으려고 흔한 브라우저 UA 를 쓴다.
      // 우리 신원을 속이려는 것이 아니라, 봇 차단 페이지(HTML)를 그림으로
      // 착각해 올리는 일을 막기 위해서다. 아래 `그림인가` 가 한 번 더 본다.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sports-news-image-fetch)' },
    });
    if (!res.ok) throw new Error(`받지 못했습니다 (HTTP ${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = 그림인가(buffer);
    if (!ext) {
      const 앞 = buffer.slice(0, 80).toString('utf8').replace(/\s+/g, ' ').trim();
      throw new Error(`그림이 아닙니다 (${buffer.length}바이트, 앞부분: ${앞.slice(0, 60)})`);
    }
    return { buffer, ext };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const altArg = args.find((a) => a.startsWith('--alt='));
  const alt = altArg ? altArg.slice('--alt='.length).trim() : '';
  const 주소들 = args.filter((a) => /^https?:\/\//i.test(a));

  log.section(`🖼  주소의 이미지를 우리 미디어에 올립니다${apply ? '' : ' (미리보기 — 올리지 않습니다)'}`);

  if (!주소들.length) {
    log.warn('이미지 주소를 적어주세요. 예: node src/wordpress/upload-url.mjs --alt="설명" https://...jpg');
    process.exitCode = 1;
    return;
  }
  if (주소들.length > 한번에최대) {
    log.warn(`한 번에 ${한번에최대}개까지만 받습니다 (받은 것: ${주소들.length}개).`);
    process.exitCode = 1;
    return;
  }
  if (!alt) {
    log.warn('--alt="이미지 설명" 을 적어주세요. 빈 alt 로 올리면 나중에 고치는 일이 따로 생깁니다.');
    process.exitCode = 1;
    return;
  }

  const 올린것 = [];
  for (const [i, url] of 주소들.entries()) {
    const 이름 = 주소들.length > 1 ? `${alt} (${i + 1})` : alt;
    try {
      const { buffer, ext } = await 받기(url);
      log.info(`[${i + 1}] 받았습니다 — ${ext.toUpperCase()} ${(buffer.length / 1024).toFixed(0)}KB`);
      if (!apply) {
        log.info('    실제로 올리려면 --apply 를 붙이세요.');
        continue;
      }
      const up = await uploadMedia({
        buffer,
        fileName: safeFileName(이름, ext),
        alt: 이름,
      });
      log.ok(`    올렸습니다 — 미디어 ${up.id}`);
      log.info(`    ${up.url}`);
      올린것.push(up);
    } catch (err) {
      log.warn(`[${i + 1}] 실패 — ${err?.message || err}`);
      process.exitCode = 1;
    }
  }

  if (apply && 올린것.length) {
    log.raw('');
    log.raw('본문에 넣을 블록:');
    for (const up of 올린것) {
      log.raw('');
      log.raw(`<!-- wp:image {"id":${up.id},"sizeSlug":"large"} -->`);
      log.raw(`<figure class="wp-block-image size-large"><img src="${up.url}" alt="${alt}" class="wp-image-${up.id}"/></figure>`);
      log.raw('<!-- /wp:image -->');
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    log.warn(err?.message || err);
    process.exitCode = 1;
  });
}
