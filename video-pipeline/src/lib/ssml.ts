// narration 평문 텍스트를 SSML로 변환한다. 문장 종결 부호(. ? !) 뒤마다
// <break>를 넣어 TTS가 문장 사이에 자연스러운 쉼을 두게 한다.
// 어미(다/요)로 구분하지 않는 이유: "그렇다 해도"처럼 문장 중간에 다/요로
// 끝나는 어절이 있으면 조용히 과분절되어 부자연스러운 쉼이 생긴다.
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=\S)/g;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSsml(narration: string, breakMs = 350): string {
  const sentences = narration
    .trim()
    .split(SENTENCE_BOUNDARY)
    .map((s) => s.trim())
    .filter(Boolean);

  const body =
    sentences.length > 0
      ? sentences.map(escapeXml).join(`<break time="${breakMs}ms"/> `)
      : escapeXml(narration.trim());

  return `<speak>${body}</speak>`;
}
