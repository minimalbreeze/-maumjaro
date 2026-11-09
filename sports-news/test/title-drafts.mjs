// `제목초안/*.json` 이 워크플로가 읽는 형식인지 본다.
//
// 2026-11-09: 형식을 `{"posts":[{"id":10725,...}]}` 로 써서 run 이
// **"10725 에 해당하는 값이 파일에 없습니다"** 로 죽었다. 워크플로는
// `f[id]` 로 꺼내므로 **글 번호가 최상위 키**여야 한다.
//
// 오늘 두 번째로 같은 종류의 빚이다 — 아침에는 단계 env 에 IN_FILE 을
// 안 넣어 파일 분기가 조용히 건너뛰어졌다. 파일로 넘기는 길을 만들었으면
// 그 파일이 맞는 모양인지도 검사가 봐야 한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, '제목초안');

let passed = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed += 1; }
  catch (err) { console.log(`  ❌ ${name}\n     ${err.message}`); process.exitCode = 1; }
}

console.log('\n[제목초안 파일 형식]');

const 파일들 = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  : [];

check('제목초안 폴더에 파일이 있다', () => {
  assert.ok(파일들.length > 0, `${DIR} 에 json 이 없습니다`);
});

// 워크플로가 꺼내는 칸. 하나라도 있어야 그 글을 고칠 수 있다.
const 칸 = ['title', 'desc', 'keyword', 'seo_title'];

for (const f of 파일들) {
  const p = path.join(DIR, f);
  check(`${f} — 글 번호가 최상위 키이고 아는 칸이 들어 있다`, () => {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(typeof d, 'object');
    assert.ok(!Array.isArray(d), '배열이 아니라 객체여야 합니다');

    // ⚠️ 이것이 run 1037 을 죽인 모양이다. 사람이 읽기엔 자연스럽지만
    //    워크플로는 `f[id]` 로만 꺼낸다.
    assert.ok(!('posts' in d), "'posts' 배열 형식은 워크플로가 못 읽습니다 — 글 번호를 최상위 키로 쓰세요");

    const 번호들 = Object.keys(d).filter((k) => /^\d+$/.test(k));
    assert.ok(번호들.length > 0, `글 번호 키가 없습니다 (키: ${Object.keys(d).join(', ')})`);

    for (const id of 번호들) {
      const o = d[id];
      assert.equal(typeof o, 'object', `${id} 의 값이 객체가 아닙니다`);
      const 있는칸 = 칸.filter((k) => String(o[k] || '').trim());
      assert.ok(있는칸.length > 0, `${id} 에 ${칸.join('·')} 중 아무것도 없습니다`);
    }

    // 번호가 아닌 키는 메모(`_왜`·`_주의`)나 `*`(모든 글 공통)만 허용한다.
    for (const k of Object.keys(d)) {
      if (/^\d+$/.test(k) || k.startsWith('_') || k === '*') continue;
      assert.fail(`모르는 최상위 키: ${k} — 글 번호나 _메모 여야 합니다`);
    }
  });
}

console.log(`\n  ${passed}개 통과`);
