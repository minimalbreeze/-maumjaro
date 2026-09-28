// 모의 워드프레스 REST 서버.
//
// 저장 경로를 실제로 실행해 본다. 검증 대상:
//   - 인증 헤더가 제대로 붙는가
//   - status가 정말 draft로 가는가
//   - 카테고리·태그·메타가 올바른 모양으로 실리는가
//   - Rank Math 필드가 "쓸 수 있다고 확인된 것"만 실리는가

import http from 'node:http';

export function startMockWordPress({ rankMathWritable = true, existingPosts = [] } = {}) {
  const state = { created: [], tagsCreated: [], authHeaders: [], optionsCalls: 0 };
  let nextId = 100;

  const CATEGORIES = [
    { id: 2, name: '골프', slug: 'golf', parent: 0, count: 300 },
    { id: 7, name: '골프 스윙', slug: 'swing', parent: 2, count: 40 },
    { id: 3, name: '파크골프', slug: 'parkgolf', parent: 0, count: 80 },
    { id: 4, name: '야구', slug: 'baseball', parent: 0, count: 90 },
    { id: 5, name: '스포츠', slug: 'sports', parent: 0, count: 70 },
    { id: 6, name: '생활정보', slug: 'life', parent: 0, count: 20 },
  ];

  const META_SCHEMA = rankMathWritable
    ? { rank_math_title: { type: 'string' }, rank_math_description: { type: 'string' }, rank_math_focus_keyword: { type: 'string' } }
    : { _some_other_meta: { type: 'string', readonly: true } };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
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
      if (p === '/wp-json/wp/v2/tags') {
        if (req.method === 'POST') {
          const { name } = JSON.parse(body);
          state.tagsCreated.push(name);
          return json({ id: 900 + state.tagsCreated.length, name });
        }
        return json([]); // 기존 태그 없음 → 전부 새로 만든다
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
        const hits = search ? existingPosts : [];
        return json(hits, { 'x-wp-total': String(existingPosts.length || 600), 'x-wp-totalpages': '1' });
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 'rest_no_route', message: '경로 없음' }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, state }));
  });
}
