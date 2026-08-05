'use client';

import { useEffect, useRef, useState } from 'react';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { API_URL } from '@/shared/config/api';

/**
 * 뉴스 타임머신 — 날짜를 입력하면 '서울경제' 신문이 그 날짜로 되감기는
 * 모션 그래픽이 재생되고, 해당 일자의 기사가 펼쳐진다.
 * 톤: 활자·신문지 — 미색 종이, 세리프 제호, 절제.
 */

interface Article {
  news_id: string;
  title: string;
  published_at: string;
  category: string;
  original_link: string;
}

type Phase = 'input' | 'rewinding' | 'result';

const MOCK_FALLBACK: Article[] = [
  { news_id: 'm1', title: '한국은행, 기준금리 0.25%p 인하 결정', published_at: '', category: '경제', original_link: '#' },
  { news_id: 'm2', title: '반도체 수출 48%↑…회복 흐름 속 고용은 16개월 만 최저', published_at: '', category: '경제', original_link: '#' },
  { news_id: 'm3', title: '국고채 3년물 3.766%…정부 구두개입에도 약세', published_at: '', category: '경제', original_link: '#' },
  { news_id: 'm4', title: '서울 아파트값 0.28% 상승…강남 12주 만에 플러스', published_at: '', category: '부동산', original_link: '#' },
];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function kdate(s: string) {
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

export function NewsTimeMachine({ userGroup }: { userGroup: MbtiGroupId }) {
  void userGroup;
  const today = ymd(new Date());
  const [phase, setPhase] = useState<Phase>('input');
  const [date, setDate] = useState('');
  const [target, setTarget] = useState('');
  const [tick, setTick] = useState(today); // 되감기 중 표시되는 날짜
  const [articles, setArticles] = useState<Article[]>([]);
  const [offline, setOffline] = useState(false);
  const rafRef = useRef<number | null>(null);

  function start() {
    if (!date) return;
    setTarget(date);
    setPhase('rewinding');
  }

  // 되감기 모션 — 오늘 → 목표일까지 날짜를 거꾸로 흘리고, 그 사이 fetch
  useEffect(() => {
    if (phase !== 'rewinding' || !target) return;
    const from = new Date(today).getTime();
    const to = new Date(target).getTime();
    const DUR = 2200;
    const t0 = performance.now();

    const fetchPromise = (async () => {
      try {
        const next = new Date(target);
        next.setDate(next.getDate() + 1);
        const res = await fetch(`${API_URL}/api/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: '*',
            filters: { published_from: target, published_until: ymd(next) },
            page: 1,
            page_size: 30,
          }),
        });
        const data = await res.json();
        const list: Article[] = (data.articles || []).map((a: Article) => ({
          news_id: a.news_id, title: a.title, published_at: a.published_at,
          category: a.category, original_link: a.original_link,
        }));
        return { list, offline: false };
      } catch {
        return { list: MOCK_FALLBACK.map(a => ({ ...a, published_at: target })), offline: true };
      }
    })();

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR);
      const eased = 1 - Math.pow(1 - p, 3);
      setTick(ymd(new Date(from + (to - from) * eased)));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fetchPromise.then(({ list, offline }) => {
          setArticles(list);
          setOffline(offline);
          setPhase('result');
        });
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase, target, today]);

  const reset = () => { setPhase('input'); setArticles([]); setOffline(false); };

  return (
    <div style={{ minHeight: 'calc(100vh - 56px)', background: '#faf8f3' }}>
      <style>{`
        @keyframes tmSheet {
          0%   { opacity: 0; transform: translateY(40px) rotate(.6deg) scale(1); }
          12%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-120%) rotate(-7deg) scale(.92); }
        }
        @keyframes tmRise { from { opacity:0; transform: translateY(14px);} to {opacity:1; transform:none;} }
        @keyframes tmPaper { from { opacity:0; transform: translateY(20px) scale(.985);} to {opacity:1; transform:none;} }
      `}</style>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(40px, 8vw, 88px) clamp(20px, 5vw, 32px)' }}>

        {/* ── 입력 ───────────────────────────── */}
        {phase === 'input' && (
          <div style={{ textAlign: 'center', animation: 'tmRise .4s ease' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', color: '#b08d57', marginBottom: 18 }}>
              NEWS TIME MACHINE
            </p>
            <h1
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(26px, 6vw, 38px)',
                fontWeight: 700,
                color: '#2a2622',
                letterSpacing: '-0.025em',
                lineHeight: 1.3,
                marginBottom: 12,
              }}
            >
              그 날의 서울경제로 돌아갑니다
            </h1>
            <p style={{ fontSize: 14, color: '#8a8378', marginBottom: 38, lineHeight: 1.7 }}>
              날짜를 고르면 그 날 신문이 그대로 펼쳐져요.
            </p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 8px 8px 20px',
                background: '#fff',
                border: '1px solid #e6e0d4',
                borderRadius: 9999,
                boxShadow: '0 1px 2px rgba(80,60,30,0.04)',
              }}
            >
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 15,
                  color: '#2a2622',
                  fontFamily: 'inherit',
                  width: 'clamp(140px, 40vw, 180px)',
                }}
              />
              <button
                onClick={start}
                disabled={!date}
                style={{
                  padding: '10px 22px',
                  borderRadius: 9999,
                  border: 'none',
                  background: date ? '#2a2622' : '#d9d3c6',
                  color: '#fff',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: date ? 'pointer' : 'default',
                  transition: 'background .2s',
                  whiteSpace: 'nowrap',
                }}
              >
                그 날 신문 펼치기
              </button>
            </div>
          </div>
        )}

        {/* ── 되감기 모션 ───────────────────────────── */}
        {phase === 'rewinding' && (
          <div style={{ textAlign: 'center', position: 'relative', minHeight: 360 }}>
            <div style={{ position: 'relative', height: 240, marginBottom: 28 }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    margin: '0 auto',
                    width: 'min(320px, 80%)',
                    height: 220,
                    background: '#fffdf7',
                    border: '1px solid #e6e0d4',
                    borderRadius: 6,
                    boxShadow: '0 10px 30px rgba(80,60,30,0.10)',
                    animation: `tmSheet 1.5s cubic-bezier(.5,0,.7,.4) ${i * 0.28}s infinite`,
                  }}
                >
                  <div style={{ padding: '18px 22px', textAlign: 'left' }}>
                    <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, fontWeight: 800, color: '#2a2622', letterSpacing: '-0.02em' }}>
                      서울經濟
                    </p>
                    <div style={{ height: 1, background: '#e6e0d4', margin: '10px 0' }} />
                    {[88, 70, 80].map((w, k) => (
                      <div key={k} style={{ height: 7, width: `${w}%`, background: '#eee7d8', borderRadius: 2, marginBottom: 7 }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, letterSpacing: '0.18em', color: '#b08d57', marginBottom: 8 }}>
              REWINDING
            </p>
            <p
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(22px, 5vw, 30px)',
                fontWeight: 700,
                color: '#2a2622',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
              }}
            >
              {kdate(tick)}
            </p>
          </div>
        )}

        {/* ── 결과: 그 날의 신문 ───────────────────────────── */}
        {phase === 'result' && (
          <div style={{ animation: 'tmPaper .5s ease' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #2a2622', paddingBottom: 16, marginBottom: 28 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.2em', color: '#b08d57', marginBottom: 8 }}>
                SEOUL ECONOMIC DAILY · 보관본
              </p>
              <h1
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 'clamp(24px, 5.4vw, 34px)',
                  fontWeight: 800,
                  color: '#2a2622',
                  letterSpacing: '-0.02em',
                }}
              >
                {kdate(target)}자 서울경제
              </h1>
            </div>

            {articles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 18, fontWeight: 700, color: '#2a2622', marginBottom: 8 }}>
                  그 날의 신문은 아직 보관되지 않았어요
                </p>
                <p style={{ fontSize: 13, color: '#8a8378', marginBottom: 22 }}>다른 날짜로 다시 돌려볼까요?</p>
                <button onClick={reset} style={{ padding: '10px 22px', borderRadius: 9999, border: '1px solid #2a2622', background: 'transparent', color: '#2a2622', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  다른 날짜 고르기
                </button>
              </div>
            ) : (
              <>
                {offline && (
                  <p style={{ fontSize: 11.5, color: '#b08d57', textAlign: 'center', marginBottom: 18 }}>
                    (오프라인 미리보기 — 실제 보관본은 연결 시 표시됩니다)
                  </p>
                )}
                <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {articles.map((a, i) => (
                    <li key={a.news_id} style={{ borderTop: i === 0 ? 'none' : '1px solid #ece6d9' }}>
                      <a
                        href={a.original_link || '#'}
                        target={a.original_link && a.original_link !== '#' ? '_blank' : undefined}
                        rel="noreferrer"
                        style={{ display: 'flex', gap: 16, padding: '18px 4px', textDecoration: 'none', color: 'inherit', alignItems: 'baseline' }}
                      >
                        <span style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 15, fontWeight: 700, color: '#c4b48f', minWidth: 26, fontVariantNumeric: 'tabular-nums' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11, color: '#b08d57', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 5 }}>
                            {a.category || '뉴스'}
                          </p>
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
                        </div>
                      </a>
                    </li>
                  ))}
                </ol>
                <div style={{ textAlign: 'center', marginTop: 36 }}>
                  <button onClick={reset} style={{ padding: '10px 22px', borderRadius: 9999, border: '1px solid #2a2622', background: 'transparent', color: '#2a2622', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    다른 날짜로 또 돌아가기
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
