// /timeline/[date] 최근 구간의 기사 목록 — 순번·분류·제목·"시각 · 기자".
import type { Article } from '@/shared/lib/api/timelineApi';
import { kstTimeLabel } from '@/shared/lib/date/date';
import { FONT, SPACE, LEADING, SR_ONLY, TEXT_STRONG, TEXT_MUTED, BORDER_HAIRLINE } from '@/features/timeline/lib/tone';

/**
 * 제목 아래 꼬리줄 — "09:23 · 이현호 기자".
 * 날짜는 페이지 h1과 목록 범위(하루치)로 이미 정해져 있으므로 행마다 반복하지 않고 시각만 표시한다.
 * 카테고리는 훑을 때의 필터 기준이라 제목 위에 두고, 시각·기자는 기사 선택 후 확인하는 정보로 한 줄에 ` · `로 묶는다.
 */
function ArticleMeta({ article }: { article: Article }) {
  const time = kstTimeLabel(article.published_at);
  // byline 에 "기자"가 이미 붙어 있다(S3Article.author_name) — 덧붙이지 않는다.
  const byline = article.byline?.trim();
  if (!time && !byline) return null;

  return (
    <p
      style={{
        marginTop: SPACE.xs,
        fontSize: FONT.caption,
        color: TEXT_MUTED,
        lineHeight: LEADING.tight,
        wordBreak: 'keep-all',
      }}
    >
      {time && (
        <>
          {/* <time>으로 기계가 읽을 값을 제공하고, 보조기기에는 무엇의 시각인지 알려준다. */}
          <span style={SR_ONLY}>발행 </span>
          <time dateTime={article.published_at} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {time}
          </time>
        </>
      )}
      {time && byline && ' · '}
      {byline}
    </p>
  );
}

export function ArticleList({ items }: { items: Article[] }) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, textAlign: 'center', padding: '40px 0' }}>
        그 날은 보관된 기사가 없어요.
      </p>
    );
  }
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((a, i) => (
        <li key={a.news_id || `${i}`} style={{ borderTop: i === 0 ? 'none' : `1px solid ${BORDER_HAIRLINE}` }}>
          <a
            href={a.original_link || '#'}
            target={a.original_link && a.original_link !== '#' ? '_blank' : undefined}
            rel="noopener noreferrer"
            style={{ display: 'flex', gap: 16, padding: '18px 4px', textDecoration: 'none', color: 'inherit', alignItems: 'baseline' }}
          >
            <span
              style={{
                                fontSize: FONT.body,
                fontWeight: 700,
                color: TEXT_MUTED,
                minWidth: 26,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 5 }}>
                {a.category || '뉴스'}
                {a.provider && a.provider !== '서울경제' && ` · ${a.provider}`}
              </p>
              <p
                style={{
                                    fontSize: FONT.body,
                  fontWeight: 600,
                  color: TEXT_STRONG,
                  lineHeight: 1.5,
                  letterSpacing: '-0.015em',
                }}
              >
                {a.title}
              </p>
              <ArticleMeta article={a} />
            </div>
          </a>
        </li>
      ))}
    </ol>
  );
}
