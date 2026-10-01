// 모의 워드프레스 REST 서버.
//
// 저장 경로를 실제로 실행해 본다. 검증 대상:
//   - 인증 헤더가 제대로 붙는가
//   - status가 정말 draft로 가는가
//   - 카테고리·태그·메타가 올바른 모양으로 실리는가
//   - Rank Math 필드가 "쓸 수 있다고 확인된 것"만 실리는가

import http from 'node:http';

export function startMockWordPress({ rankMathWritable = true, existingPosts = [], posts = {} } = {}) {
  const state = {
    posts: { ...posts },
    updated: [], created: [], tagsCreated: [], authHeaders: [], optionsCalls: 0, media: [], mediaMeta: [] };
  let nextId = 100;
  let nextMediaId = 500;

  // 실제 사이트 구조 그대로 (2026-09-28 확인).
  // 모의 서버가 실제와 다르면 테스트는 통과하는데 운영에서 깨진다.
  const CATEGORIES = [
    { id: 1, name: 'Uncategorized', slug: 'uncategorized', parent: 0, count: 0 },
    { id: 2, name: '골프', slug: '골프', parent: 0, count: 300 },
    { id: 3, name: '골프 스윙', slug: '골프-스윙', parent: 2, count: 40 },
    { id: 4, name: '생활정보', slug: '생활정보', parent: 0, count: 20 },
    { id: 5, name: '스포츠', slug: '스포츠', parent: 0, count: 70 },
    { id: 6, name: '농구', slug: '농구', parent: 5, count: 5 },
    { id: 7, name: '당구', slug: '당구', parent: 5, count: 12 },
    { id: 8, name: '바둑', slug: '바둑', parent: 5, count: 9 },
    { id: 9, name: '배구', slug: '배구', parent: 5, count: 4 },
    { id: 10, name: '배드민턴', slug: '배드민턴', parent: 5, count: 15 },
    { id: 11, name: '볼링', slug: '볼링', parent: 5, count: 3 },
    { id: 12, name: '야구', slug: '야구', parent: 0, count: 90 },
    { id: 13, name: '축구', slug: '축구', parent: 0, count: 6 },
    { id: 14, name: '파크골프', slug: '파크골프', parent: 0, count: 80 },
  ];

  const META_SCHEMA = rankMathWritable
    ? { rank_math_title: { type: 'string' }, rank_math_description: { type: 'string' }, rank_math_focus_keyword: { type: 'string' } }
    : { _some_other_meta: { type: 'string', readonly: true } };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const body = raw.toString('utf8');
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      state.authHeaders.push(req.headers.authorization || '');
      const json = (data, headers = {}) => {
        res.writeHead(200, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(data));
      };

      if (req.method === 'OPTIONS' && p === '/wp-json/wp/v2/posts') {
        state.optionsCalls++;
        return json({ schema: { properties: { meta: { properties: META_SCHEMA } } } });
      }
      if (p === '/wp-json/' || p === '/wp-json') {
        return json({ name: '테스트 블로그', namespaces: ['wp/v2', 'rankmath/v1'] });
      }
      if (p === '/wp-json/wp/v2/users/me') return json({ name: '관리자', roles: ['administrator'] });
      if (p === '/wp-json/wp/v2/categories') return json(CATEGORIES, { 'x-wp-totalpages': '1' });
      // 미디어 업로드. 실제 워드프레스처럼 파일 본문을 그대로 받고,
      // 파일 이름은 Content-Disposition 헤더에서 읽는다.
      if (p === '/wp-json/wp/v2/media' && req.method === 'POST') {
        const cd = req.headers['content-disposition'] || '';
        const name = /filename="([^"]+)"/.exec(cd)?.[1] || '';
        const id = nextMediaId++;
        state.media.push({ id, fileName: name, bytes: raw.length, contentType: req.headers['content-type'] });
        return json({
          id,
          source_url: `http://127.0.0.1:${server.address().port}/wp-content/uploads/${name}`,
          media_type: 'image',
        });
      }
      // alt 텍스트를 나중에 넣는 요청
      if (/^\/wp-json\/wp\/v2\/media\/\d+$/.test(p) && req.method === 'POST') {
        const id = Number(p.split('/').pop());
        state.mediaMeta.push({ id, ...JSON.parse(body || '{}') });
        return json({ id });
      }

      if (p === '/wp-json/wp/v2/tags') {
        if (req.method === 'POST') {
          const { name } = JSON.parse(body);
          state.tagsCreated.push(name);
          return json({ id: 900 + state.tagsCreated.length, name });
        }
        return json([]); // 기존 태그 없음 → 전부 새로 만든다
      }
      // 글 하나 읽기/고치기 — 이미 만든 글의 SEO를 손보는 경로에서 쓴다.
      const one = /^\/wp-json\/wp\/v2\/posts\/(\d+)$/.exec(p);
      if (one) {
        const id = Number(one[1]);
        const stored = state.posts[id];
        if (!stored) {
          res.writeHead(404, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ code: 'rest_post_invalid_id', message: '글이 없습니다' }));
        }
        if (req.method === 'POST') {
          const patch = JSON.parse(body || '{}');
          stored.meta = { ...stored.meta, ...(patch.meta || {}) };
          if (patch.slug) stored.slug = patch.slug;
          // 실제 워드프레스는 보낸 본문을 저장한다. 모의가 이걸 빠뜨리면
          // "고쳤는데 다시 읽으면 예전 내용"이라 테스트가 현실과 어긋난다.
          if (patch.content !== undefined) stored.content = { raw: patch.content };
          if (patch.title !== undefined) stored.title = { raw: patch.title };
          if (patch.status !== undefined) stored.status = patch.status;
          state.updated.push({ id, ...patch });
          return json({ id, ...stored });
        }
        return json({ id, ...stored });
      }

      if (p === '/wp-json/wp/v2/posts' && req.method === 'POST') {
        const payload = JSON.parse(body);
        const post = { ...payload, id: nextId++, link: `http://127.0.0.1:${server.address().port}/?p=${nextId}` };
        state.created.push(payload);
        return json(post);
      }
      if (p === '/wp-json/wp/v2/posts') {
        // 검색 요청이면 미리 넣어둔 기존 글을 돌려준다(중복 검사 경로 검증용)
        const search = url.searchParams.get('search');
        if (search) {
          return json(existingPosts, { 'x-wp-total': String(existingPosts.length || 600), 'x-wp-totalpages': '1' });
        }

        // 검색이 아니면 저장된 글 목록을 돌려준다.
        //
        // 왜 필요한가: 전에는 여기서 무조건 빈 배열을 돌려줬다. 그래서 글 목록을
        // 훑는 코드를 검사해도 항상 빈 목록을 보고 통과했다 — "이미 설명이 있는
        // 글은 건드리지 않는다"는 검사가 아무것도 확인하지 못한 채 초록불이었다.
        const ids = Object.keys(state.posts).map(Number).sort((a, b) => b - a);
        const wantStatus = url.searchParams.get('status');
        const rows = ids
          .map((id) => ({ id, ...state.posts[id] }))
          .filter((row) => !wantStatus || row.status === wantStatus);

        const perPage = Number(url.searchParams.get('per_page') || 10);
        const page = Number(url.searchParams.get('page') || 1);
        const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
        const slice = rows.slice((page - 1) * perPage, page * perPage);
        return json(slice, {
          'x-wp-total': String(rows.length),
          'x-wp-totalpages': String(totalPages),
        });
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 'rest_no_route', message: '경로 없음' }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, state }));
  });
}
