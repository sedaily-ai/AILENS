// 2026-02-01 이전 날짜의 "펼치기" 결과 화면 — S3 지면 아카이브가 없는 구간이라
// TimelineResultView(전체 기사/그날의 이슈, 기사 단위 링크 필요)를 그대로 못 쓴다.
// 빅카인즈 issue_ranking은 토픽+키워드까지만 주고 클러스터 안 개별 기사 상세조회는
// 지금 신뢰도가 낮아(같은 news_id에 0건/서버오류가 섞여 나옴, 2026-08-17 확인)
// 붙이지 않았다 — 있는 데이터만 정직하게 보여주는 가벼운 뷰.
import Link from 'next/link';
import type { BigKindsTopic } from '../lib/timelineApi';
import { kdate } from '../lib/timelineApi';

export function TimelineTopicsView({ date, topics }: { date: string; topics: BigKindsTopic[] }) {
  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#faf8f3' }}>
      <style>{`@keyframes tmPaper { from { opacity:0; transform: translateY(20px) scale(.985);} to {opacity:1; transform:none;} }`}</style>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 8vw, 88px) clamp(20px, 5vw, 32px)' }}>
        <div style={{ animation: 'tmPaper .5s ease' }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #2a2622', paddingBottom: 16, marginBottom: 12 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.2em', color: '#b08d57', marginBottom: 8 }}>
              빅카인즈 뉴스빅데이터 · 그날의 이슈
            </p>
            <h1
              style={{
                fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 5.4vw, 34px)',
                fontWeight: 800, color: '#2a2622', letterSpacing: '-0.02em',
              }}
            >
              {kdate(date)}
            </h1>
          </div>
          <p style={{ fontSize: 12, color: '#8a8378', textAlign: 'center', marginBottom: 28, lineHeight: 1.7 }}>
            이 구간은 서울경제 지면 원문 대신, 여러 언론사 보도를 묶은 빅카인즈 이슈
            데이터로 보여드려요. 개별 기사 링크는 아직 연결돼 있지 않습니다.
          </p>

          {topics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 18, fontWeight: 700, color: '#2a2622', marginBottom: 8 }}>
                이 날은 집계된 이슈가 없어요
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
                {topics.map((t, i) => (
                  <li key={`${t.topic}-${i}`} style={{ borderTop: i === 0 ? 'none' : '1px solid #ece6d9', padding: '20px 4px' }}>
                    <div style={{ display: 'flex', gap: 16 }}>
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
                            fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(15px, 3.4vw, 17px)', fontWeight: 700,
                            color: '#2a2622', lineHeight: 1.5, letterSpacing: '-0.015em', marginBottom: 8,
                          }}
                        >
                          {t.topic}
                        </p>
                        {t.keywords.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {t.keywords.map((kw) => (
                              <span key={kw} style={{ fontSize: 11, color: '#6b6459', background: '#f2eee3', borderRadius: 4, padding: '3px 7px' }}>
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
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
