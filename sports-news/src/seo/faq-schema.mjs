// 자주 묻는 질문을 구조화 데이터(JSON-LD)로 만든다.
//
// 왜 필요한가
//   구글 서치콘솔은 글을 HTML로만 읽는다. "이건 질문이고 저건 답이다"를
//   알려주면 검색결과에서 질문 그대로 노출될 가능성이 생기고, AI 검색도
//   답을 그대로 떼어 인용하기 쉬워진다.
//
// 주의
//   본문에 실제로 적힌 질문과 답만 넣는다. 구조화 데이터와 본문이 다르면
//   구글이 스팸으로 본다. 그래서 여기서는 본문에서 읽어내기만 하고,
//   새로 만들어 붙이지 않는다.

/**
 * 본문 마크다운에서 Q/A 쌍을 읽어낸다.
 * 형식: `**Q. 질문?**` 다음에 오는 문단이 답.
 */
export function extractFaq(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const faqs = [];
  let current = null;

  const flush = () => {
    if (!current) return;
    const answer = current.answer.join(' ').replace(/\s+/g, ' ').trim();
    if (current.question && answer) faqs.push({ question: current.question, answer });
    current = null;
  };

  for (const line of lines) {
    const t = line.trim();
    const q = /^\*\*\s*Q[.．:]?\s*(.+?)\s*\*\*$/.exec(t);
    if (q) {
      flush();
      current = { question: stripMarks(q[1]), answer: [] };
      continue;
    }
    // 소제목을 만나면 그 앞까지가 답이다.
    if (/^#{1,6}\s/.test(t)) { flush(); continue; }
    if (!current) continue;
    if (!t) { if (current.answer.length) flush(); continue; }
    current.answer.push(stripMarks(t.replace(/^\*\*\s*A[.．:]?\s*/, '')));
  }
  flush();

  return faqs;
}

function stripMarks(s) {
  return String(s).replace(/\*\*/g, '').replace(/^[-*✅✔•]\s*/, '').trim();
}

/**
 * 워드프레스 본문 끝에 붙일 JSON-LD 블록을 만든다.
 * 질문이 2개 미만이면 아무것도 만들지 않는다 — 빈약한 구조화 데이터는 안 넣느니만 못하다.
 */
export function faqSchemaBlock(md) {
  const faqs = extractFaq(md);
  if (faqs.length < 2) return '';

  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };

  // </script>가 값 안에 들어가면 스크립트가 거기서 끊긴다.
  const json = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');

  return `<!-- wp:html -->\n<script type="application/ld+json">\n${json}\n</script>\n<!-- /wp:html -->`;
}
