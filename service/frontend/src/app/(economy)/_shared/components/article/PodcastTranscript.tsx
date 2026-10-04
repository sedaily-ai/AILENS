// 팟캐스트 대본 — 재생 화면과 같은 "요즘 앱" 톤.
// - 제목은 본문과 같은 고딕 "대본", 설명 한 줄
// - 첫 문단만 조금 굵고 크게(도입), 나머지는 읽기 좋은 폭(38em)과 넉넉한 줄 간격
// - 맨 끝 "같은 뉴스, 네 가지 시선…" 같은 마무리 멘트는 옅은 작은 글씨
// 장식(선·드롭캡·세리프·색 띠)은 쓰지 않는다. 서버 컴포넌트(상태 없음), 본문 전체는 항상 HTML에 들어 있다(접근성·검색·AI 읽기).
const SIGN_OFF = /(같은 뉴스|AILENS|AI LENS)/;

export function PodcastTranscript({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;

  const last = paragraphs[paragraphs.length - 1];
  const hasSignOff = paragraphs.length > 2 && last.length < 60 && SIGN_OFF.test(last);
  const body = hasSignOff ? paragraphs.slice(0, -1) : paragraphs;

  return (
    <section aria-label="팟캐스트 대본" className="ptx" style={{ marginTop: 36 }}>
      <style>{`
        .ptx-h { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.02em; color: #0f172a; }
        .ptx-sub { margin: 6px 0 22px; font-size: 13.5px; color: #64748b; }
        .ptx-body { max-width: 38em; }
        .ptx-p { margin: 0 0 1.2em; font-size: 16.5px; line-height: 1.95; color: #1f2937; word-break: keep-all; white-space: pre-wrap; }
        .ptx-lead { font-size: 18.5px; font-weight: 600; line-height: 1.85; color: #0f172a; margin-bottom: 1.5em; }
        .ptx-sign { margin: 28px 0 0; font-size: 13.5px; color: #94a3b8; line-height: 1.8; }
      `}</style>
      <h3 className="ptx-h">대본</h3>
      <p className="ptx-sub">소리를 못 듣는 분도 같은 내용을 읽을 수 있어요</p>
      <div className="ptx-body">
        {body.map((p, i) => (
          <p key={i} className={i === 0 ? 'ptx-p ptx-lead' : 'ptx-p'}>
            {p}
          </p>
        ))}
        {hasSignOff && <p className="ptx-sign">{last}</p>}
      </div>
    </section>
  );
}
