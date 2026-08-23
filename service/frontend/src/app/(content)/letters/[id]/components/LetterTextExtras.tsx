import Link from 'next/link';
import { AiDisclaimer } from '@/shared/ui/AiDisclaimer';
import type { DisplayLetter } from '@/shared/lib/api/todayLettersApi';
import { PrevNextLetterNav, type NeighborLetter } from './PrevNextLetterNav';

// LetterDetailClient.tsx에서 추출(2026-08-24, God 파일 분해 2라운드).
// ── 본문 본체 이후 — 핵심 정리 + 닫는 줄 + 단어 (LetterBody 가 직접 호출) ──
export function LetterTextExtras({
  letter,
  modern,
  nextLetter,
  prevLetter,
}: {
  letter: DisplayLetter;
  modern?: boolean;
  nextLetter?: NeighborLetter | null;
  prevLetter?: NeighborLetter | null;
}) {
  return (
    <>
      {letter.key_points.length > 0 && (
        <div data-speakable="qa" style={{ background: '#f9fafb', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: 1.2, margin: '0 0 12px', textTransform: 'uppercase' }}>
            핵심 정리
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {letter.key_points.map((kp, i) => (
              <li key={i} style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, marginBottom: 6 }}>
                {kp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {letter.closing_line && (
        modern ? (
          <figure style={{ margin: '32px 0 40px', padding: '24px 0 0', borderTop: `2px solid ${letter.accent}` }}>
            <blockquote
              style={{
                margin: 0,
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(20px, 3.8vw, 26px)',
                fontWeight: 600,
                lineHeight: 1.55,
                letterSpacing: '-0.02em',
                color: '#111827',
              }}
            >
              {letter.closing_line}
            </blockquote>
            <figcaption
              style={{
                marginTop: 14,
                fontSize: 12,
                fontWeight: 700,
                color: letter.accent,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              {letter.editorName} 에디터
            </figcaption>
          </figure>
        ) : (
          <p
            style={{
              fontSize: 16, fontWeight: 500, color: letter.accent, lineHeight: 1.6,
              margin: '0 0 32px', paddingTop: 16, borderTop: '1px solid #f3f4f6',
            }}
          >
            → {letter.closing_line}
          </p>
        )
      )}

      {/* AI 생성 콘텐츠 고지(2026-08-21, 사용자 요청 — 서울경제 영문
          CMS의 "AI-translated from Korean..." 박스를 레퍼런스로 "면책조항
          걸어주세요"). 기존 "원문 보기 — 서울경제 →" 링크는 이 박스 안
          "원문 기사 보기" 링크로 흡수. */}
      <div style={{ marginBottom: 24 }}>
        <AiDisclaimer sourceUrl={letter.source_url} articleId={letter.id} format="letter" />
      </div>

      {letter.keywords.length > 0 && (
        <section style={{ borderTop: '1px solid #f3f4f6', paddingTop: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: 1.2, margin: 0, textTransform: 'uppercase' }}>
              단어
            </p>
            <Link href="/words" style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
              전체 용어 해설 보기 →
            </Link>
          </div>
          {letter.keywords.map((kw, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: '0 0 2px' }}>{kw.term}</p>
              {kw.explain && (
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.65 }}>{kw.explain}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {(nextLetter || prevLetter) && (
        <PrevNextLetterNav next={nextLetter} prev={prevLetter} accent={letter.accent} accentBg={letter.accentBg} />
      )}
    </>
  );
}
