'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import {
  fetchTodayLetters,
  toTodayLetterCard,
  type TodayLetterCardLike,
} from '@/shared/lib/todayLettersApi';
import { letterHref } from '@/shared/lib/letterHref';

interface Props {
  selectedGroup: MbtiGroupId;
}

// 오늘(2026-08-05) 발행 4편에 한해 기사 내용 매칭 사진으로 교체 — letterId 기준
// 수동 매핑(PoC). 매일 자동 반영하려면 백엔드 letter 응답에 썸네일 필드가 필요.
// sf: 中 AI/Kimi·DeepSeek, st: 中 반도체 웨이퍼, nt: 스페이스X. nf(엔화 방어)는
// 사진 미수령 — 받는 대로 추가, 그전까진 에디터 아바타로 폴백.
const TODAY_ARTICLE_THUMBNAILS: Record<string, string> = {
  'sf-2026-08-05': '/news-p.v1.20260728.ced959ada08d49a3bd2d78cb19aeca4a_P1.jpg',
  'st-2026-08-05': '/news-p.v1.20260722.3ffb9035d2504ccaa23d7dd26a98961e_P1.jpg',
  'nt-2026-08-05': '/news-p.v1.20260804.c2e7a8ece8db4f40919ad85d53e9790f_P1.jpg',
};

// API 응답 letter 4편을 mock 의 "매칭된 사람 먼저" 정렬로 재배치.
function orderByMain(letters: TodayLetterCardLike[], mainGroup: MbtiGroupId): TodayLetterCardLike[] {
  const main = letters.find((l) => l.group === mainGroup);
  const others = letters.filter((l) => l.group !== mainGroup);
  return main ? [main, ...others] : letters;
}

// KST 기준 오늘. Intl 로 timezone 안정 처리 — en-CA 로케일이 YYYY-MM-DD 형식 반환.
function todayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

// "2026-05-24" → "5월 24일 토요일" (오늘/어제 상대 표현 안 씀, 항상 절대 날짜)
function formatHeaderLabel(isoDate: string): string {
  const [yy, mm, dd] = isoDate.split('-').map((s) => parseInt(s, 10));
  const dow = DOW_KO[new Date(yy, mm - 1, dd).getDay()];
  return `${mm}월 ${dd}일 ${dow}요일`;
}

export function FollowingFeed({ selectedGroup }: Props) {
  const today = useMemo(() => todayKST(), []);
  const [selectedDate, setSelectedDate] = useState<string>(today);

  // 라이브 단일 소스 — 첫 응답 전까지 로딩(mock 즉시렌더 제거 2026-07-24).
  const [letters, setLetters] = useState<TodayLetterCardLike[]>([]);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);

  // 오늘 발행 전이면 자동으로 직전 발행일까지 거슬러 찾아 보여준다.
  // 사용자가 화살표로 직접 이동하면 자동 폴백을 멈춘다(사용자 의도 우선).
  const autoFallback = useRef(true);
  const lookback = useRef(0);
  const MAX_LOOKBACK = 14;

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 새 날짜 조회 시작 시 빈 상태 리셋(정당한 케이스)
    setEmpty(false);
    // 이 날짜가 비었거나 실패하면 직전 발행일까지 거슬러 찾는다(공통 처리).
    const stepBackOrEmpty = () => {
      if (autoFallback.current && lookback.current < MAX_LOOKBACK) {
        lookback.current += 1;
        setSelectedDate((d) => shiftDate(d, -1));
        return;
      }
      setEmpty(true);
      setLetters([]);
      setLoading(false);
    };
    fetchTodayLetters(selectedDate)
      .then((res) => {
        if (cancelled) return;
        if (!res.letters || res.letters.length === 0) {
          stepBackOrEmpty();
          return;
        }
        autoFallback.current = false; // 발행본 찾음 — 폴백 종료
        // 이 카드 행은 4명의 MBTI 에디터 레터 전용 — CMS(편집팀 명의, mbti_group
        // 없음) 글이 섞이면 5장이 되어 4열 한 줄이 깨진다. 여기서 제외.
        const mbtiOnly = res.letters.filter((l) => l.mbti_group);
        const mapped = mbtiOnly.map((l) => toTodayLetterCard(l, res.date));
        setLetters(orderByMain(mapped, selectedGroup));
        setLoading(false);
      })
      .catch(() => {
        // API 실패 → mock 없이 직전 발행일 탐색(라이브 단일 소스)
        if (!cancelled) stepBackOrEmpty();
      });
    return () => {
      cancelled = true;
    };
  }, [selectedGroup, selectedDate]);

  const headerLabel = formatHeaderLabel(selectedDate);

  return (
    <section
      style={{
        // 우측 사이드바와 나란히 배치되는 좌측 컬럼 폭을 그대로 채움 — 부모 grid가
        // 이미 좌우 여백을 주고 있어서 여기서 또 캡·패딩을 주면 카드 폭이 좁아짐.
        padding: 'clamp(8px, 2vw, 16px) 0 0',
      }}
    >
      <header style={{ marginBottom: 10 }}>
        <p
          className="text-gray-400"
          style={{
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Letter
        </p>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <h2
            className="font-medium text-gray-900"
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(22px, 5vw, 28px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.35,
            }}
          >
            {headerLabel}의 한 통 {loading || empty ? '' : `${letters.length}편`}
          </h2>
          {/* /?tab=feed 는 홈과 상태가 같아 클릭해도 화면이 안 바뀌는 문제가 있었음 —
              캘린더 페이지가 정확히 "다른 날짜 레터 둘러보기"를 담당하는 실제 목적지. */}
          <Link
            href="/calendar"
            className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            더보기 →
          </Link>
        </div>
        <p className="text-gray-500 mt-1" style={{ fontSize: 13, letterSpacing: '-0.005em' }}>
          {`${selectedDate.replace(/-/g, '.')} 발행분`}
        </p>
      </header>

      {empty && (
        <div
          style={{
            padding: '64px 20px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          이 날은 발행된 letter가 없어요.
          <br />
          다른 날짜를 골라보세요.
        </div>
      )}

      {/* 한 행 4열 고정 — 스크롤 없이 항상 한 줄에 다 보이게 (좁아지면 카드 자체가 줄어듦) */}
      <ol
        className="grid"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 'clamp(6px, 1.5vw, 10px)',
        }}
      >
        {letters.map((l) => (
          <li key={l.letterId} style={{ minWidth: 0 }}>
            <Link
              href={letterHref(l.letterId)}
              prefetch
              className="group flex flex-col h-full overflow-hidden transition-all duration-200 hover:-translate-y-1"
              style={{
                borderRadius: 16,
                background: '#fff',
                border: '1px solid #f1f1f0',
                boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 8px 24px rgba(17,24,39,0.05)',
                textDecoration: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* 썸네일 — 기사 내용 매칭 사진(오늘자 3편), 없으면 에디터 포트레이트 폴백 */}
              <div
                className="aspect-square overflow-hidden"
                style={{ background: l.accentBg }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={TODAY_ARTICLE_THUMBNAILS[l.letterId] ?? l.editorAvatar}
                  alt={l.title}
                  className="w-full h-full transition-transform duration-300 group-hover:scale-[1.04]"
                  style={{ objectFit: 'cover' }}
                />
              </div>

              <div style={{ padding: 'clamp(8px, 2vw, 12px)', display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                {/* 작가 라벨 */}
                <p
                  className="font-semibold truncate"
                  style={{ fontSize: 10.5, color: l.accent, letterSpacing: '0.01em', marginBottom: 4 }}
                >
                  {l.editorName} · {l.archetype}
                </p>

                {/* 글 제목 */}
                <h3
                  className="font-medium text-gray-900 group-hover:opacity-80 transition-opacity"
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 13,
                    lineHeight: 1.4,
                    letterSpacing: '-0.02em',
                    marginBottom: 4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {l.title}
                </h3>

                {/* 설명글 — subtitle 없으면 본문 첫 문장으로 폴백(최대 200자), 카드 폭에 맞춰 일부만 노출 */}
                <p
                  className="text-gray-500"
                  style={{
                    fontSize: 11,
                    lineHeight: 1.5,
                    letterSpacing: '-0.005em',
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    marginBottom: 4,
                  }}
                >
                  {l.excerpt}
                </p>

                {/* 읽기 시간 */}
                <p className="text-gray-400" style={{ fontSize: 10, marginTop: 'auto' }}>
                  {l.readMinutes}분 읽기
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
