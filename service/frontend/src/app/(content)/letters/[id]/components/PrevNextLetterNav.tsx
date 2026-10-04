import Link from 'next/link';
import { letterHref } from '@/shared/lib/content/letterHref';

// LetterDetailClient.tsx에서 추출(2026-08-24, God 파일 분해). 이전/다음
// 레터 내비게이션(2026-08-21, GEO 재감사에서 새로 구현) — 예전 버전(MBTI
// 페르소나 체계, l-YYYYMMDD-XX id 파싱 + mbti_group 매칭)은 그 체계 폐지로
// 이미 죽어있었다. page.tsx의 findNeighbors()가 서버에서 미리 조회해
// 내려준 데이터를 그대로 그리기만 하면 돼서 클라이언트 fetch/useEffect
// 자체가 필요 없다.

export interface NeighborLetter {
  id: string;
  headline: string;
  date: string;
}

export function PrevNextLetterNav({
  next,
  prev,
  accent,
  accentBg,
}: {
  next?: NeighborLetter | null;
  prev?: NeighborLetter | null;
  accent: string;
  accentBg: string;
}) {
  return (
    <nav
      aria-label="이전·다음 레터"
      style={{
        marginTop: 24,
        paddingTop: 24,
        borderTop: '1px solid #f3f4f6',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}
    >
      {prev ? (
        <PrevNextCard direction="prev" letter={prev} accent={accent} accentBg={accentBg} />
      ) : (
        <div />
      )}
      {next ? (
        <PrevNextCard direction="next" letter={next} accent={accent} accentBg={accentBg} />
      ) : (
        <div />
      )}
    </nav>
  );
}

function PrevNextCard({
  direction,
  letter,
  accent,
  accentBg,
}: {
  direction: 'prev' | 'next';
  letter: NeighborLetter;
  accent: string;
  accentBg: string;
}) {
  const isPrev = direction === 'prev';
  const label = isPrev ? '이전 레터' : '다음 레터';
  const [y, m, d] = letter.date.split('-').map((s) => parseInt(s, 10));
  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = DOW_KO[new Date(y, m - 1, d).getDay()];
  const dateLabel = `${m}월 ${d}일 ${dow}요일`;

  return (
    <Link
      href={letterHref(letter.id)}
      prefetch
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '16px 18px',
        background: '#fff',
        border: '1px solid #f1f1f0',
        borderRadius: 14,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'box-shadow 0.18s, transform 0.18s, border-color 0.18s',
        boxShadow: '0 1px 2px rgba(17,24,39,0.03)',
        textAlign: isPrev ? 'left' : 'right',
        minHeight: 84,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 6px 18px ${accent}22`;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.borderColor = `${accent}55`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(17,24,39,0.03)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = '#f1f1f0';
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: accent,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          justifyContent: isPrev ? 'flex-start' : 'flex-end',
        }}
      >
        {isPrev && <span aria-hidden>←</span>}
        {label}
        {!isPrev && <span aria-hidden>→</span>}
      </span>
      <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>{dateLabel}</span>
      <span
        style={{
          fontFamily: '"Noto Serif KR", serif',
          fontSize: 14.5,
          fontWeight: 600,
          color: '#1f2937',
          lineHeight: 1.45,
          letterSpacing: '-0.01em',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginTop: 2,
          background: accentBg,
          padding: '2px 6px',
          borderRadius: 4,
          alignSelf: isPrev ? 'flex-start' : 'flex-end',
          maxWidth: '100%',
        }}
      >
        {letter.headline}
      </span>
    </Link>
  );
}
