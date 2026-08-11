'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/shared/config/api';

// 타임라인 홈 티저(2026-08-07) — 최상단(단어 퀴즈 위) 배치.
//
// 처음엔 시간·제목만 나열하는 자체 리스트 UI였는데, "타임라인 UI가
// 나와야 하는데 지금 다르다, '그 날 신문 펼치기' UI가 없다"는 피드백
// (2026-08-07)으로 /timeline(NewsTimeMachine.tsx) 입력 화면의 생김새
// (NEWS TIME MACHINE 카피·종이톤·알약형 날짜입력+버튼)를 그대로 축약해
// 가져왔다 — "미리보기"가 실제 기능과 다르게 생기면 미리보기의 의미가
// 없다는 지적. 날짜를 고르고 버튼을 누르면 실제로 /timeline?date=... 로
// 이동해서 그 날짜로 바로 되감기가 시작된다(NewsTimeMachine.tsx 쪽에
// ?date= 쿼리를 읽어 자동 시작하는 useEffect 추가 완료).
//
// 실데이터 연결(2026-08-10) — NewsTimeMachine.tsx가 의존하는 /api/timeline은
// 아직 Lambda 자체가 없어(404) 매번 /api/search로 폴백하는 구조라, 여기서는
// 대신 이미 살아있는 공개 GET /s3-articles?date=YYYYMMDD(지면 원문 피드,
// 인증 불필요)를 직접 붙였다 — "그 날의 서울경제로 돌아간다"는 컨셉과도
// 더 맞는 실제 지면 데이터.
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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

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
    // '시그널' 유료 IB/M&A 코너 기사 제외 — 지면 시간대(06:00) 태그가 같아 최신순
    // 정렬 시 상위를 통째로 차지해버리는 문제(2026-08-10 발견). '마켓시그널'처럼
    // 다른 이름의 코너는 그대로 둔다 — 정확히 "[시그널]" 태그만 걸러낸다.
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

export function TimelinePreviewSection() {
  const router = useRouter();
  const [pickedDate, setPickedDate] = useState(todayStr());
  const [items, setItems] = useState<TimelineItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
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

    // '실시간 News' 이름값대로, 오늘 날짜를 보는 동안엔 3분마다 조용히
    // 다시 불러온다(2026-08-10) — 과거 날짜는 지면이 안 바뀌니 폴링 불필요.
    // silent=true라 폴링 중 에러가 나도 이미 떠 있는 목록을 비우지 않는다.
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (pickedDate === todayStr()) {
      intervalId = setInterval(() => load(true), 3 * 60 * 1000);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [pickedDate]);

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
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
            Timeline
          </p>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            실시간 News
          </h2>
        </div>
        <Link
          href="/timeline"
          className="text-gray-500 hover:text-gray-900"
          style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          타임라인 보기
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </header>

      {/* /timeline 입력 화면 축약판 — 종이톤 배경 + NEWS TIME MACHINE 카피 +
          알약형 날짜입력·버튼. 실제 화면과 같은 생김새로 "이게 그 기능"임을
          바로 알아보게 한다. */}
      <div
        style={{
          textAlign: 'center',
          background: '#fdfcf9',
          border: '1px solid #ede7d9',
          borderRadius: 18,
          padding: 'clamp(22px, 4vw, 30px) clamp(16px, 4vw, 24px)',
          marginBottom: 16,
        }}
      >
        <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.2em', color: '#b08d57', marginBottom: 8 }}>
          NEWS TIME MACHINE
        </p>
        <p
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(17px, 3.4vw, 20px)',
            fontWeight: 700,
            color: '#2a2622',
            letterSpacing: '-0.02em',
            marginBottom: 16,
          }}
        >
          그 날의 서울경제로 돌아갑니다
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 6px 6px 16px',
            background: '#fff',
            border: '1px solid #e6e0d4',
            borderRadius: 9999,
            boxShadow: '0 1px 2px rgba(80,60,30,0.04)',
          }}
        >
          <input
            type="date"
            value={pickedDate}
            max={todayStr()}
            onChange={(e) => e.target.value && setPickedDate(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13.5,
              color: '#2a2622',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={() => router.push(`/timeline?date=${pickedDate}`)}
            style={{
              padding: '9px 18px',
              borderRadius: 9999,
              border: 'none',
              background: '#2a2622',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            그 날 신문 펼치기
          </button>
        </div>
        <div className="flex justify-center" style={{ gap: 6, marginTop: 12 }}>
          {QUICK_PICKS.map((label, i) => {
            const t = new Date();
            t.setDate(t.getDate() - i);
            const dateForPick = t.toISOString().slice(0, 10);
            const active = pickedDate === dateForPick;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setPickedDate(dateForPick)}
                style={{
                  padding: '5px 14px',
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
        </div>
      </div>

      {/* 고른 날짜의 미리보기 목록 — /s3-articles?date=... 실데이터. 로딩 중엔
          자리 안 차지(스켈레톤 제거 방침, WebtoonPreviewSection과 동일). */}
      {items !== null && (
        <div
          style={{
            borderRadius: 14,
            background: '#fff',
            border: '1px solid #f1efe9',
            boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)',
            padding: 'clamp(14px, 3vw, 20px)',
          }}
        >
          {items.length === 0 && (
            <p style={{ textAlign: 'center', padding: '20px 8px', fontSize: 13, color: '#a8a29e' }}>
              이 날은 보관된 기사가 없어요.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item) => {
            const row = (
              <>
                <span
                  className="flex-shrink-0"
                  style={{ width: 44, fontSize: 11.5, fontWeight: 700, color: '#a8a29e', fontVariantNumeric: 'tabular-nums' }}
                >
                  {item.time}
                </span>
                <p
                  className="text-gray-800"
                  style={{
                    fontSize: 14,
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {item.title}
                </p>
              </>
            );
            const rowStyle = {
              gap: 12,
              padding: '8px 6px',
              borderRadius: 8,
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
      )}
    </section>
  );
}
