// 2026-02-01 이전 날짜의 "펼치기" 결과 화면 — S3 지면 아카이브가 없는 구간이라
// TimelineResultView(발행 시각 있는 최근 지면 전용)를 그대로 못 쓴다. 빅카인즈
// 뉴스 검색(날짜 범위 + provider=서울경제)으로 제목·본문 스니펫·바이라인·원본
// 링크까지 가져온다 — 처음엔 issue_ranking(토픽+키워드만)을 썼는데 그 API의
// news_cluster로 기사 상세를 찾으면 신뢰도가 낮아서(같은 ID인데도 0건/서버오류가
// 섞여 나옴, 당일 날짜조차 그랬음) 날짜 범위 직접 검색으로 교체했다(2026-08-17).
// 발행 "시각"은 이 API가 어느 시대 기사든 항상 자정 고정이라 안 줘서, 시간 대신
// 순번(01, 02...)으로 표시한다 — TimelineResultView의 ArticleList와 같은 패턴.
import Link from 'next/link';
import type { BigKindsArticle } from '../lib/timelineApi';
import { kdate } from '../lib/timelineApi';

export function TimelineBigkindsView({ date, articles }: { date: string; articles: BigKindsArticle[] }) {
  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#faf8f3' }}>
      <style>{`@keyframes tmPaper { from { opacity:0; transform: translateY(20px) scale(.985);} to {opacity:1; transform:none;} }`}</style>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 8vw, 88px) clamp(20px, 5vw, 32px)' }}>
        <div style={{ animation: 'tmPaper .5s ease' }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #2a2622', paddingBottom: 16, marginBottom: 12 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.2em', color: '#b08d57', marginBottom: 8 }}>
              빅카인즈 뉴스빅데이터 · 발행 시각 정보 없음
            </p>
            <h1
              style={{
                fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 5.4vw, 34px)',
                fontWeight: 800, color: '#2a2622', letterSpacing: '-0.02em',
              }}
            >
              {kdate(date)}자 서울경제
            </h1>
          </div>

          {articles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 18, fontWeight: 700, color: '#2a2622', marginBottom: 8 }}>
                이 날은 보관된 기사가 없어요
              </p>
              <p style={{ fontSize: 13, color: '#8a8378', marginBottom: 22 }}>다른 날짜로 다시 돌려볼까요?</p>
              <Link
                href="/timeline"
                style={{
                  display: 'inline-block', padding: '10px 22px', borderRadius: 9999, border: '1px solid #2a2622',
                  background: 'transparent', color: '#2a2622', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                }}
              >
                다른 날짜 고르기
              </Link>
            </div>
          ) : (
            <>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {articles.map((a, i) => {
                  const row = (
                    <>
                      <span
                        style={{
                          fontFamily: '"Noto Serif KR", serif', fontSize: 15, fontWeight: 700,
                          color: '#c4b48f', minWidth: 26, fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontFamily: '"Noto Serif KR", serif',
                            fontSize: 'clamp(16px, 3.4vw, 18px)',
                            fontWeight: 600,
                            color: '#2a2622',
                            lineHeight: 1.5,
                            letterSpacing: '-0.015em',
                            marginBottom: 6,
                          }}
                        >
                          {a.title}
                        </p>
                        {a.content && (
                          <p
                            style={{
                              fontSize: 13.5, color: '#6b6459', lineHeight: 1.6, marginBottom: 4,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}
                          >
                            {a.content}
                          </p>
                        )}
                        {a.byline && (
                          <p style={{ fontSize: 11.5, color: '#a8a29e' }}>{a.byline} 기자</p>
                        )}
                      </div>
                    </>
                  );
                  const rowStyle = { display: 'flex', gap: 16, padding: '18px 4px', textDecoration: 'none', color: 'inherit', alignItems: 'baseline' as const };
                  return (
                    <li key={a.news_id || `${i}`} style={{ borderTop: i === 0 ? 'none' : '1px solid #ece6d9' }}>
                      {a.original_link ? (
                        <a href={a.original_link} target="_blank" rel="noreferrer" style={rowStyle}>{row}</a>
                      ) : (
                        <div style={rowStyle}>{row}</div>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div style={{ textAlign: 'center', marginTop: 36 }}>
                <Link
                  href="/timeline"
                  style={{
                    display: 'inline-block', padding: '10px 22px', borderRadius: 9999, border: '1px solid #2a2622',
                    background: 'transparent', color: '#2a2622', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                  }}
                >
                  다른 날짜로 또 돌아가기
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
