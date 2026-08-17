'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/shared/config/apiClient';
import { kstTodayStr } from '@/shared/lib/date';
import { PocketWatchIcon } from '@/shared/ui/icons/HandDrawnIcons';

// 통합 타임머신 섹션(2026-08-17) — 원래 "그날의 지면"(TimelinePreviewSection,
// 최근 몇 달치 서울경제 실시간 지면)과 "생일 뉴스 타임머신"
// (BirthdayTimeMachineSection, 빅카인즈 1990~ 이슈)이 홈에 나란히 있었는데,
// 둘 다 "날짜 고르면 그날 뉴스" 패턴이 똑같아 보여서(사용자 확인:
// "통합해야죠. 두 개 다 있으면 안 됩니다") 하나로 합쳤다.
//
// 병합 원칙: 아무 값도 새로 지어내지 않는다 — 최근 날짜(2026-02-01~오늘)는
// 이미 검증된 실시간 S3 지면 데이터(fetchDayArticles, 3분 자동 폴링 포함,
// TimelinePreviewSection.tsx에서 그대로 가져옴)를 쓰고, 그 이전 날짜는
// 빅카인즈 issue_ranking 실 응답 캡처(FALLBACK_TOPICS, 1995-03-15 실제
// 조회 결과) 예시를 보여준다 — 백엔드 연결(2단계) 전까지는 예시라는 걸
// 명확히 안내한다.
interface TimelineItem {
  id: string;
  time: string;
  title: string;
  href: string | null;
}

interface S3ArticleListItem {
  news_id: string;
  title: string;
  published_at: string;
  original_link?: string;
}

interface BigKindsTopic {
  topic: string;
  keywords: string[];
}

const todayStr = kstTodayStr;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
}

async function fetchDayArticles(dateStr: string): Promise<TimelineItem[]> {
  const res = await fetch(`${API_URL}/s3-articles?date=${dateStr.replaceAll('-', '')}&limit=30`);
  if (!res.ok) throw new Error(`s3-articles ${res.status}`);
  const data: { articles?: S3ArticleListItem[] } = await res.json();
  const list = data.articles ?? [];
  return list
    .slice()
    .filter((a) => !a.title.includes('[시그널]'))
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, 8)
    .map((a) => ({
      id: a.news_id,
      time: formatTime(a.published_at),
      title: a.title,
      href: a.original_link ?? null,
    }));
}

const QUICK_PICKS = ['오늘', '어제', '그제'];

// S3 지면 아카이브가 실제로 커버하는 최소 날짜(2026-08-17 실측). 이보다
// 이전은 실시간 지면 데이터가 없어 빅카인즈 예시로 대체한다.
const ARCHIVE_MIN_DATE = '2026-02-01';
// 빅카인즈 issue_ranking이 공식 지원하는 최소 날짜(OpenAPI 사용자지침서
// V1.5 §4 "제공되는 조회일자는 1990-01-01부터").
const BIGKINDS_MIN_DATE = '1990-01-01';

const SAMPLE_DATE = '1995-03-15';
const FALLBACK_TOPICS: BigKindsTopic[] = [
  { topic: '기초 선거 공천 협상 타결', keywords: ['여야 벼랑 대치', '통합선거법 극적 타결', '무혈승리'] },
  { topic: '대통령 수행 순방 결산 간담', keywords: ['통일 대비', '세일즈 외교', '순방 결산'] },
  { topic: '연립 여당 방북 논의', keywords: ['자민', '연립', '방북 연기'] },
  { topic: '세계화 인재 양성 간담회', keywords: ['교육개혁', '핵합의 파기 대응책'] },
];

// 2단계(백엔드 연결) 전까지는 과거 구간이 전부 동일한 FALLBACK_TOPICS 샘플이라,
// 빅카인즈 전체 범위(1990~)에서 뽑으면 거의 항상 똑같은 화면만 나와 "고장난
// 것처럼" 보인다(2026-08-17 실사용 확인) — 그래서 지금은 실데이터가 있는
// 아카이브 구간으로 한정한다. 실 연동 후엔 BIGKINDS_MIN_DATE로 다시 넓힐 것.
function randomDateInRange(): string {
  const start = new Date(ARCHIVE_MIN_DATE).getTime();
  const end = Date.now();
  const picked = new Date(start + Math.random() * (end - start));
  const y = picked.getFullYear();
  const m = String(picked.getMonth() + 1).padStart(2, '0');
  const d = String(picked.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function NewsTimeMachineSection() {
  const router = useRouter();
  const [pickedDate, setPickedDate] = useState(todayStr());
  const [items, setItems] = useState<TimelineItem[] | null>(null);

  const isRecent = pickedDate >= ARCHIVE_MIN_DATE;
  const isLive = pickedDate === todayStr();

  // pickedDate가 바뀌면 렌더 중 동기 조정으로 이전 목록을 지운다(React 공식
  // "Adjusting state when a prop changes" 패턴).
  const [prevPickedDate, setPrevPickedDate] = useState(pickedDate);
  if (pickedDate !== prevPickedDate) {
    setPrevPickedDate(pickedDate);
    setItems(null);
  }

  useEffect(() => {
    if (!isRecent) return; // 과거 구간은 빅카인즈 예시라 fetch 불필요
    let cancelled = false;
    const load = (silent: boolean) => {
      fetchDayArticles(pickedDate)
        .then((rows) => {
          if (!cancelled) setItems(rows);
        })
        .catch(() => {
          if (!cancelled && !silent) setItems([]);
        });
    };
    load(false);

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (isLive) {
      intervalId = setInterval(() => load(true), 3 * 60 * 1000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pickedDate, isRecent, isLive]);

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        @keyframes ntm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .ntm-livedot { animation: ntm-pulse 1.8s ease-in-out infinite; }
        @keyframes ntm-pageturn {
          0% { opacity: 0; transform: translateX(10px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .ntm-pageturn { animation: ntm-pageturn 260ms ease-out; }
      `}</style>

      <header
        style={{
          marginBottom: 14,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            타임머신
          </p>
          <div className="flex items-center" style={{ gap: 8 }}>
            <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
              그날로 떠나요
            </h2>
            {isLive && (
              <span className="inline-flex items-center" style={{ gap: 5 }}>
                <span aria-hidden className="ntm-livedot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#8a6d3f', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#8a6d3f', letterSpacing: '0.02em' }}>
                  실시간 업데이트 중
                </span>
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/timeline/${todayStr()}`}
          className="text-gray-500 hover:text-gray-900"
          style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          타임라인 보기
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </header>

      <div
        style={{
          borderRadius: 14,
          background: '#fff',
          border: '1px solid #f1efe9',
          boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)',
          overflow: 'hidden',
        }}
      >
        {/* 인트로 — "오늘 뭐 있었지"와 "내 생일엔 뭐 있었지"를 한 카피로. */}
        <div style={{ textAlign: 'center', padding: 'clamp(20px, 4vw, 28px) clamp(16px, 4vw, 24px) 4px', background: '#fdfcf9' }}>
          <div className="flex justify-center" style={{ marginBottom: 8 }}>
            <PocketWatchIcon accent="#8a6d3f" className="w-8 h-8" />
          </div>
          <p
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(16px, 3.2vw, 19px)',
              fontWeight: 700,
              color: '#2a2622',
              letterSpacing: '-0.02em',
            }}
          >
            오늘이든, 내가 태어난 날이든 — 그날 세상은 이랬어요
          </p>
        </div>

        {/* 날짜 컨트롤 툴바 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 6,
            padding: '14px clamp(14px, 3vw, 20px)',
            background: '#fdfcf9',
            borderBottom: '1px solid #f1efe9',
          }}
        >
          {QUICK_PICKS.map((label, i) => {
            const [ty, tm, td] = todayStr().split('-').map((s) => parseInt(s, 10));
            const dateForPick = new Date(Date.UTC(ty, tm - 1, td - i)).toISOString().slice(0, 10);
            const active = pickedDate === dateForPick;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setPickedDate(dateForPick)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  background: active ? '#2a2622' : '#f3f0e8',
                  color: active ? '#fff' : '#78716c',
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                }}
              >
                {label}
              </button>
            );
          })}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 3px 3px 10px',
              background: '#fff',
              border: '1px solid #e6e0d4',
              borderRadius: 9999,
            }}
          >
            <input
              type="date"
              value={pickedDate}
              min={BIGKINDS_MIN_DATE}
              max={todayStr()}
              onChange={(e) => e.target.value && setPickedDate(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 12.5,
                color: '#2a2622',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              disabled={!isRecent}
              title={isRecent ? undefined : '아직 예시 데이터라 펼쳐볼 지면이 없어요'}
              onClick={() => isRecent && router.push(`/timeline/${pickedDate}`)}
              style={{
                padding: '6px 12px',
                borderRadius: 9999,
                border: 'none',
                background: isRecent ? '#2a2622' : '#e6e0d4',
                color: isRecent ? '#fff' : '#a8a29e',
                fontSize: 12,
                fontWeight: 700,
                cursor: isRecent ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              펼치기
            </button>
          </div>
          {/* "생일이 기억 안 나거나 그냥 궁금해서" 눌러보는 진입점
              (2026-08-17 피드백) — 빅카인즈가 실제 지원하는 범위 전체에서 뽑는다. */}
          <button
            type="button"
            onClick={() => setPickedDate(randomDateInRange())}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: '#96876f',
              padding: '5px 6px',
            }}
          >
            🎲 아무 날이나
          </button>
        </div>

        {/* 결과 — 최근 구간(2026-02-01~오늘)은 실시간 S3 지면, 그 이전은
            빅카인즈 예시. */}
        {isRecent ? (
          items !== null && (
            <div key={pickedDate} className="ntm-pageturn" style={{ padding: 'clamp(14px, 3vw, 20px)' }}>
              {items.length === 0 && (
                <p style={{ textAlign: 'center', padding: '20px 8px', fontSize: 13, color: '#a8a29e' }}>
                  이 날은 보관된 기사가 없어요.
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {items.map((item, i) => {
                  const row = (
                    <>
                      <span
                        className="flex-shrink-0"
                        style={{ width: 44, fontSize: 11.5, fontWeight: 700, color: '#96876f', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {item.time}
                      </span>
                      <p
                        className="text-gray-800"
                        style={{
                          fontSize: 14,
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          minWidth: 0,
                        }}
                      >
                        {item.title}
                      </p>
                    </>
                  );
                  const rowStyle = {
                    gap: 12,
                    padding: '10px 6px',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)',
                    cursor: item.href ? ('pointer' as const) : ('default' as const),
                  };
                  return item.href ? (
                    <a
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-baseline transition-colors hover:bg-gray-50"
                      style={rowStyle}
                    >
                      {row}
                    </a>
                  ) : (
                    <div key={item.id} className="flex items-baseline" style={rowStyle}>
                      {row}
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          // 2단계(백엔드 연결) 전 — 빅카인즈 issue_ranking 실 응답 캡처
          // (1995-03-15). 어떤 과거 날짜를 골라도 지금은 이 예시가 뜨고,
          // 실제 그 날짜로 안 바뀐다는 걸 명확히 안내한다.
          <div key={pickedDate} className="ntm-pageturn" style={{ padding: 'clamp(14px, 3vw, 20px)' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#78716c' }}>
                {pickedDate} (예정 — 아직 예시 데이터예요)
              </span>
              <span style={{ fontSize: 11, color: '#a8a29e' }}>빅카인즈 뉴스빅데이터 제공 · 예시: {SAMPLE_DATE}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {FALLBACK_TOPICS.map((t, i) => (
                <div key={t.topic} style={{ padding: '12px 4px', borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)' }}>
                  <p className="text-gray-900" style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.01em' }}>
                    {t.topic}
                  </p>
                  <p style={{ fontSize: 12.5, color: '#96876f' }}>{t.keywords.join(' · ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
