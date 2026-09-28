// app.js에서 SYMPTOMS(감정 목록)만 꺼내 온다.
//
// app.js는 최상단에서 document를 만지기 때문에 통째로 실행할 수 없다(loadData처럼
// new Function으로 돌리면 ReferenceError가 난다). 그래서 객체 리터럴만 잘라내 평가한다.
//
// build-pages.mjs(감정 페이지)와 utm.mjs(링크표)가 같이 쓴다. 두 군데에 같은 파서를
// 복사해두면 app.js 구조가 바뀔 때 한쪽만 고치고 지나가게 된다.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadSymptoms(root) {
  const src = await readFile(join(root, 'app.js'), 'utf8');
  const head = 'const SYMPTOMS = ';
  const start = src.indexOf(head);
  const end = src.indexOf('\n  };', start);
  if (start < 0 || end < 0) throw new Error('app.js에서 SYMPTOMS를 찾지 못했습니다.');
  const data = new Function('return ' + src.slice(start + head.length, end + 4))();
  if (!data || !Object.keys(data).length) throw new Error('SYMPTOMS가 비어 있습니다.');
  return data;
}
