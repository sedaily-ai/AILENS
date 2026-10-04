// /timeline/[date] 최근 구간의 기사 목록 — 순번·분류·제목·"시각 · 기자".
import type { Article } from '@/shared/lib/api/timelineApi';
import { kstTimeLabel } from '@/shared/lib/date/date';
import { FONT, SPACE, LEADING, SR_ONLY, TEXT_STRONG, TEXT_MUTED, BORDER_HAIRLINE } from '@/features/timeline/lib/tone';

/**
 * 제목 아래 꼬리줄 — "09:23 · 이현호 기자".
 *
 * 2026-08-24 추가. 백엔드는 published_at(초 단위)과 byline 을 처음부터 보내고
 * 있었는데 화면이 안 쓰고 있었다(byline 은 타입에 없어서 toArticles 가 버렸다).
 *
 * ── 왜 날짜 없이 시각만인가 ──────────────────────────────────────
 * 이 페이지 h1 이 "2026년 8월 24일자 서울경제"고, 목록은 그 날짜 기사만
 * 나온다(S3 는 하루치 파일 단위). 행마다 "2026-08-24"를 붙이면 최대 30번
 * 같은 값을 반복하는 셈이고, 그 줄에서 새로운 정보는 시:분뿐이다.
 *
 * 카테고리는 제목 위에 그대로 둔다 — 분야는 훑을 때 걸러내는 기준이라 제목보다
 * 먼저 읽혀야 하고, 시각·기자는 그 기사를 고른 다음에 확인하는 정보다.
 *
 * 시각과 기자를 각각 다른 줄에 두지 않고 ` · ` 로 묶은 이유: 13px 두 단어에
 * 한 줄을 더 쓰면 375px 에서 행이 그만큼 길어진다(빅카인즈 화면에서 바이라인을
 * 뺐던 것과 같은 판단 — TimelineBigkindsView.ArticleRow 주석 참조).
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
          {/* 맨 숫자만 읽히면 무슨 시각인지 알 수 없다. <time> 으로 기계가 읽을
              값을 주고, 보조기기에는 무엇의 시각인지 말해준다. */}
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
