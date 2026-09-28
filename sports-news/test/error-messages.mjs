// 오류 안내가 원인별로 정확한지 검사한다.
//
// 왜 필요한가: 401/403은 워드프레스만 내는 게 아니다. 방화벽·보안 플러그인·
// Cloudflare·회사 프록시도 같은 코드를 낸다. 그걸 전부 "계정 권한 문제"라고
// 안내하면 사용자가 멀쩡한 계정을 붙잡고 시간을 버린다.
//
// 실제로 개발 중에 이 문제를 겪었다. 원격 환경의 방화벽이 낸 403을
// "이 계정에 글 작성 권한이 있는지 확인하세요"라고 안내했다.

import assert from 'node:assert/strict';
import http from 'node:http';
import { wpFetch } from '../src/wordpress/client.mjs';

const CASES = [
  {
    name: '방화벽이 낸 403을 계정 문제로 안내하지 않는다',
    status: 403, contentType: 'text/plain',
    body: 'Host not in allowlist: example.com',
    expect: ['워드프레스가 아닌 곳에서', '네트워크 정책'],
    reject: ['계정에 글 작성 권한'],
  },
  {
    name: '보안 플러그인 차단을 알아본다',
    status: 403, contentType: 'text/html',
    body: '<html><body>Blocked by Wordfence</body></html>',
    expect: ['보안 플러그인이 차단'],
    reject: ['계정에 글 작성 권한'],
  },
  {
    name: 'Cloudflare 차단을 알아본다',
    status: 403, contentType: 'text/html',
    body: '<html><title>Attention Required! | Cloudflare</title></html>',
    expect: ['Cloudflare가 차단'],
    reject: ['계정에 글 작성 권한'],
  },
  {
    name: '진짜 워드프레스 401에는 이메일/아이디 힌트를 준다',
    status: 401, contentType: 'application/json',
    body: JSON.stringify({ code: 'incorrect_password', message: '비밀번호가 올바르지 않습니다.' }),
    expect: ['인증 실패(401)', '로그인 아이디'],
    reject: ['워드프레스가 아닌 곳'],
  },
  {
    name: '진짜 워드프레스 403은 권한 문제로 안내한다',
    status: 403, contentType: 'application/json',
    body: JSON.stringify({ code: 'rest_cannot_create', message: '권한 없음' }),
    expect: ['권한 없음(403)'],
    reject: ['워드프레스가 아닌 곳'],
  },
  {
    name: '진짜 워드프레스 404는 주소 확인으로 안내한다',
    status: 404, contentType: 'application/json',
    body: JSON.stringify({ code: 'rest_no_route', message: '경로 없음' }),
    expect: ['404', 'WORDPRESS_URL'],
    reject: ['워드프레스가 아닌 곳'],
  },
];

let current = 0;
const server = http.createServer((req, res) => {
  const c = CASES[current];
  res.writeHead(c.status, { 'content-type': c.contentType });
  res.end(c.body);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

process.env.WORDPRESS_URL = `http://127.0.0.1:${port}`;
process.env.WORDPRESS_USERNAME = 'tester';
process.env.WORDPRESS_APP_PASSWORD = 'xxxx xxxx xxxx xxxx';

console.log('\n[오류 안내 문구]');
let passed = 0;

for (current = 0; current < CASES.length; current++) {
  const c = CASES[current];
  try {
    await wpFetch('/wp/v2/posts');
    console.log(`  ❌ ${c.name}\n     오류가 발생하지 않았습니다`);
    process.exitCode = 1;
    continue;
  } catch (err) {
    try {
      for (const kw of c.expect) assert.ok(err.message.includes(kw), `"${kw}"가 없습니다: ${err.message}`);
      for (const kw of c.reject) assert.ok(!err.message.includes(kw), `"${kw}"가 잘못 들어갔습니다: ${err.message}`);
      console.log(`  ✅ ${c.name}`);
      passed++;
    } catch (assertion) {
      console.log(`  ❌ ${c.name}\n     ${assertion.message}`);
      process.exitCode = 1;
    }
  }
}

server.close();
console.log(`\n${process.exitCode ? '❌ 실패한 항목이 있습니다' : `✅ ${passed}개 항목 통과`}\n`);
