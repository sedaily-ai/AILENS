'use client';

// 2026-02-01 이전 날짜의 "펼치기" 결과 화면 — S3 지면 아카이브가 없는 구간이라
// TimelineResultView(발행 시각 있는 최근 지면 전용)를 그대로 못 쓴다. 빅카인즈
// 뉴스 검색(날짜 범위 + provider=서울경제)으로 제목·본문 스니펫·바이라인·원본
// 링크까지 가져온다 — 처음엔 issue_ranking(토픽+키워드만)을 썼는데 그 API의
// news_cluster로 기사 상세를 찾으면 신뢰도가 낮아서(같은 ID인데도 0건/서버오류가
// 섞여 나옴, 당일 날짜조차 그랬음) 날짜 범위 직접 검색으로 교체했다(2026-08-17).
// 발행 "시각"은 이 API가 어느 시대 기사든 항상 자정 고정이라 안 줘서, 시간 대신
// 순번(01, 02...)으로 표시한다 — TimelineResultView의 ArticleList와 같은 패턴.
//
// 화면 설계(2026-08-17, 실사용 피드백 반영):
// - 착지 직후엔 헤드라인(제목+카테고리+기자명)만 훑을 수 있게 — 점진적 노출.
//   본문은 그대로 다 보여주면 정보량이 너무 많아서, 행으로 클릭해야 펼쳐지는
//   아코디언으로 바꿨다(여러 개 동시에 펼쳐도 됨 — 신문 여러 기사 펼쳐놓고
//   보는 느낌).
// - 상위 5건만 보여준다("30개를 다 보여주면 좀 아까울듯요" 피드백).
// - 본문 미리보기는 백엔드가 150자로 다듬어서 내려준다(서명·입력시각 꼬리 정리
//   포함, config/investment_scenarios.py의 이웃 로직 아님 — time_machine_handler.py
//   쪽 _clean_content_preview 참조).
// - "그날 이걸 샀다면"(코스피/비트코인/로또/커피) 카드는 뉴스(팩트)와 성격이
//   달라 별도 섹션(InvestmentScenarioCards, 크림톤 배경)으로 뒤에 배치.
import { useState } from 'react';
import Link from 'next/link';
import type { BigKindsArticle, InvestmentScenario } from '../lib/timelineApi';
import { kdate } from '../lib/timelineApi';
import { InvestmentScenarioCards } from './InvestmentScenarioCards';
import { ShareBar } from './ShareBar';
import { SajuFunnelCard } from './SajuFunnelCard';

const MAX_SHOWN = 5;
const SITE_URL = 'https://ailens.sedaily.ai';

export function TimelineBigkindsView({
  date,
  articles,
  investments,
}: {
  date: string;
  articles: BigKindsArticle[];
  investments: InvestmentScenario[];
}) {
  const shown = articles.slice(0, MAX_SHOWN);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 공유 카드는 코스피를 최우선으로(가장 널리 이해되는 비교 기준), 없으면
  // 있는 첫 시나리오, 그것도 없으면(예: 1994년 이전) 헤드라인만으로 구성.
  const heroScenario = investments.find((s) => s.id === 'kospi') ?? investments[0];
  const shareCardData = {
    date,
    dateLabel: kdate(date),
    heroLabel: heroScenario?.description,
    heroValue: heroScenario?.highlight,
    story: heroScenario?.story,
    headline: shown[0]?.title,
    url: `${SITE_URL}/timeline/${date}`,
  };

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f3' }}>
      <style>{`
        @keyframes tmPaper { from { opacity:0; transform: translateY(20px) scale(.985);} to {opacity:1; transform:none;} }
        @keyframes tmExpand { from { opacity:0; transform: translateY(-4px);} to {opacity:1; transform:none;} }
      `}</style>
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
            {articles.length > MAX_SHOWN && (
              <p style={{ fontSize: 12, color: '#a8a29e', marginTop: 8 }}>
                이 날 보관된 기사 {articles.length}건 중 {MAX_SHOWN}건을 골라 보여드려요
              </p>
            )}
          </div>

          {shown.length === 0 ? (
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
              <p style={{ fontSize: 11.5, color: '#a8a29e', textAlign: 'center', marginBottom: 4 }}>
                제목을 누르면 본문 미리보기가 펼쳐져요
              </p>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {shown.map((a, i) => {
                  const key = a.news_id || `${i}`;
                  const isOpen = expanded.has(key);
                  return (
                    <li key={key} style={{ borderTop: i === 0 ? 'none' : '1px solid #ece6d9' }}>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                        style={{
                          display: 'flex', width: '100%', gap: 16, padding: '18px 4px',
                          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', alignItems: 'baseline',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: '"Noto Serif KR", serif', fontSize: 15, fontWeight: 700,
                            color: '#c4b48f', minWidth: 26, fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {a.category && (
                            <p style={{ fontSize: 11, color: '#b08d57', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 5 }}>
                              {a.category}
                            </p>
                          )}
                          <p
                            style={{
                              fontFamily: '"Noto Serif KR", serif',
                              fontSize: 'clamp(16px, 3.4vw, 18px)',
                              fontWeight: 600,
                              color: '#2a2622',
                              lineHeight: 1.5,
                              letterSpacing: '-0.015em',
                            }}
                          >
                            {a.title}
                          </p>
                          {a.byline && !isOpen && (
                            <p style={{ fontSize: 11.5, color: '#a8a29e', marginTop: 4 }}>{a.byline} 기자</p>
                          )}
                        </div>
                        <span aria-hidden style={{ fontSize: 13, color: '#c4b48f', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }}>
                          ▾
                        </span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 4px 18px 42px', animation: 'tmExpand .2s ease' }}>
                          {a.content && (
                            <p style={{ fontSize: 13.5, color: '#6b6459', lineHeight: 1.65, marginBottom: 8 }}>
                              {a.content}
                            </p>
                          )}
                          <div className="flex items-center" style={{ gap: 12, flexWrap: 'wrap' }}>
                            {a.byline && (
                              <span style={{ fontSize: 11.5, color: '#a8a29e' }}>{a.byline} 기자</span>
                            )}
                            {a.original_link && (
                              <a
                                href={a.original_link}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: 12, fontWeight: 700, color: '#8a6d3f', textDecoration: 'none' }}
                              >
                                원문 보기 →
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              <InvestmentScenarioCards scenarios={investments} />

              <ShareBar cardData={shareCardData} />

              <SajuFunnelCard />

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
