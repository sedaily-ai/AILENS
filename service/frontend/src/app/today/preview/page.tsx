'use client';

/**
 * /today/preview — production today-letters API 결과를 그대로 보여주는 검증 페이지.
 *
 * 디자인은 미니멀. TodayLensClient 정식 디자인 통합은 별도 작업.
 * 사용자가 ailens.sedaily.ai 에 박힌 letter 4편이 production endpoint 응답인지
 * 직접 확인하는 용도.
 */
import { useEffect, useState } from 'react';
import {
  fetchTodayLetters,
  withDisplayMeta,
  type DisplayLetter,
  type ApiTodayLettersResponse,
} from '@/shared/lib/todayLettersApi';

export default function TodayLettersPreviewPage() {
  const [data, setData] = useState<ApiTodayLettersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTodayLetters()
      .then((r) => {
        setData(r);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <main style={styles.container}>
        <p style={styles.muted}>letter 4편 불러오는 중…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={styles.container}>
        <h1 style={styles.h1}>오늘 letter</h1>
        <p style={{ ...styles.muted, color: '#b91c1c' }}>로드 실패: {error}</p>
      </main>
    );
  }

  if (!data || data.letters.length === 0) {
    return (
      <main style={styles.container}>
        <h1 style={styles.h1}>오늘 letter</h1>
        <p style={styles.muted}>아직 발행된 letter가 없어요.</p>
      </main>
    );
  }

  const letters = data.letters.map(withDisplayMeta);

  return (
    <main style={styles.container}>
      <header style={styles.header}>
        <p style={styles.dateLabel}>{data.date} · {data.letters.length} letter · mode {data.mode}</p>
        <h1 style={styles.h1}>오늘의 letter</h1>
        <p style={styles.subtle}>
          서울경제 그날 기사 풀에서 AI 가 골라 쓴 letter.
        </p>
      </header>

      <section style={styles.grid}>
        {letters.map((ltr) => (
          <LetterCard key={ltr.id} letter={ltr} />
        ))}
      </section>
    </main>
  );
}

function LetterCard({ letter }: { letter: DisplayLetter }) {
  return (
    <article style={{ ...styles.card, borderTopColor: letter.accent }}>
      <header style={styles.cardHeader}>
        <div style={{ ...styles.editorChip, background: letter.accentBg, color: letter.accent }}>
          {letter.editorName}
        </div>
        {letter.archetype && <p style={styles.archetype}>{letter.archetype}</p>}
      </header>

      <h2 style={styles.headline}>{letter.headline}</h2>
      {letter.subtitle && <p style={styles.subtitle}>{letter.subtitle}</p>}

      <div style={styles.body}>
        {letter.body.map((p, i) => (
          <p key={i} style={styles.bodyParagraph}>
            {p}
          </p>
        ))}
      </div>

      {letter.key_points.length > 0 && (
        <div style={styles.keyPointsBox}>
          <p style={styles.sectionLabel}>핵심</p>
          <ul style={styles.keyPointsList}>
            {letter.key_points.map((kp, i) => (
              <li key={i} style={styles.keyPoint}>{kp}</li>
            ))}
          </ul>
        </div>
      )}

      {letter.closing_line && <p style={{ ...styles.closing, color: letter.accent }}>→ {letter.closing_line}</p>}

      {letter.keywords.length > 0 && (
        <div style={styles.keywordsBox}>
          <p style={styles.sectionLabel}>단어</p>
          {letter.keywords.map((kw, i) => (
            <div key={i} style={styles.keywordRow}>
              <span style={styles.keywordTerm}>{kw.term}</span>
              <span style={styles.keywordExplain}>{kw.explain}</span>
            </div>
          ))}
        </div>
      )}

      <footer style={styles.cardFooter}>
        <span style={styles.muted}>article_id: {letter.article_id}</span>
      </footer>
    </article>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 920,
    margin: '0 auto',
    padding: '48px 24px 96px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Pretendard", sans-serif',
    color: '#1f2937',
    background: '#fafafa',
    minHeight: '100vh',
  },
  header: { marginBottom: 40 },
  dateLabel: { fontSize: 12, color: '#9ca3af', margin: 0, letterSpacing: 0.5 },
  h1: { fontSize: 28, fontWeight: 700, margin: '8px 0 8px', color: '#111827' },
  subtle: { fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 },
  grid: { display: 'flex', flexDirection: 'column', gap: 24 },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '28px 32px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
    borderTopWidth: 4,
    borderTopStyle: 'solid',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  editorChip: {
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.3,
  },
  archetype: { margin: 0, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  headline: { fontSize: 22, fontWeight: 700, margin: '4px 0 8px', lineHeight: 1.35, color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.6 },
  body: { marginBottom: 20 },
  bodyParagraph: { fontSize: 15, lineHeight: 1.8, margin: '0 0 14px', color: '#374151' },
  keyPointsBox: { background: '#f9fafb', borderRadius: 12, padding: 16, margin: '0 0 16px' },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: '#9ca3af', margin: '0 0 8px', letterSpacing: 1 },
  keyPointsList: { margin: 0, paddingLeft: 20 },
  keyPoint: { fontSize: 13, color: '#374151', lineHeight: 1.7, marginBottom: 4 },
  closing: { fontSize: 14, fontWeight: 500, margin: '0 0 20px', lineHeight: 1.6 },
  keywordsBox: { borderTop: '1px solid #f3f4f6', paddingTop: 16, marginBottom: 12 },
  keywordRow: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 },
  keywordTerm: { fontSize: 12, fontWeight: 600, color: '#111827' },
  keywordExplain: { fontSize: 12, color: '#6b7280', lineHeight: 1.6 },
  cardFooter: { borderTop: '1px solid #f3f4f6', paddingTop: 12 },
  muted: { fontSize: 11, color: '#9ca3af', margin: 0 },
};
