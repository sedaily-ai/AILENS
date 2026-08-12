// 콘텐츠 타입별 전용 페이지(레터/트렌드/칼럼/영상/전체) 공통 헤더 —
// kicker + 세리프 타이틀 + 타입별 accent 포인트 + 한 줄 설명. 예전엔
// "지금까지의 모든 콘텐츠" 하나만 4가지 타입에 다 붙어 있었는데, 타입별로
// 페이지를 쪼갠 김에(2026-08-11) 각자 무슨 페이지인지 한눈에 구분되게
// 타이포도 같이 다듬었다.
export function ArchiveHeader({
  kicker,
  title,
  titleAccent,
  accentColor,
  description,
}: {
  kicker: string;
  title: string;
  /** 타이틀 안에서 accentColor로 강조할 부분(선택) — 예: "인기 칼럼"의 "칼럼". */
  titleAccent?: string;
  accentColor: string;
  description: string;
}) {
  return (
    <header style={{ marginBottom: 20 }}>
      <p
        style={{
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 6,
          color: accentColor,
        }}
      >
        {kicker}
      </p>
      <h1
        className="font-medium text-gray-900"
        style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em', marginBottom: 8 }}
      >
        {titleAccent && title.includes(titleAccent) ? (
          <>
            {title.split(titleAccent)[0]}
            <span style={{ color: accentColor }}>{titleAccent}</span>
            {title.split(titleAccent).slice(1).join(titleAccent)}
          </>
        ) : (
          title
        )}
      </h1>
      <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, maxWidth: 480 }}>{description}</p>
    </header>
  );
}
