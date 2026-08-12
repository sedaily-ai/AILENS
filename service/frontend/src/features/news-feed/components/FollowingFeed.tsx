'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchFollowingLetters, type TodayLetterCardLike } from '@/shared/lib/todayLettersApi';
import { letterHref } from '@/shared/lib/letterHref';

interface Props {
  // 빌드타임(app/page.tsx)에 fetchFollowingLetters()로 미리 가져온 값 — 정적
  // HTML에 실제 카드가 바로 박히게 한다(2026-08-07, 홈 SSG 감사). 없으면
  // (레거시 mount 후 클라이언트 전용 재조회 경로) 기존처럼 로딩부터 시작.
  initialLetters?: TodayLetterCardLike[];
}

export function FollowingFeed({ initialLetters }: Props) {
  const [letters, setLetters] = useState<TodayLetterCardLike[]>(initialLetters ?? []);
  const [empty, setEmpty] = useState((initialLetters ?? []).length === 0 && initialLetters !== undefined);
  const [loading, setLoading] = useState(initialLetters === undefined);

  useEffect(() => {
    let cancelled = false;
    fetchFollowingLetters().then((collected) => {
      if (cancelled) return;
      setLetters(collected);
      setEmpty(collected.length === 0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
          {/* "OO월 OO일의 한 통 N편" + "발행분" 날짜 표기를 뺐다 — 매일 새로
              발행되는 걸 강조하기보다, 계속 쌓이는 콘텐츠 더미처럼 보이게
              (2026-08-06 피드백). 날짜가 궁금하면 카드 안 날짜로 충분하다. */}
          {/* 섹션 제목 타이포 통일(2026-08-06) — 웹툰만 굵은 산세리프라 튀어
              보인다는 지적으로, 홈 화면 섹션 제목을 전부 Pretendard Bold로
              맞췄다(개별 레터 제목은 에디토리얼 느낌을 남기려 세리프 유지). */}
          <h2
            className="text-gray-900"
            style={{
              fontSize: 'clamp(22px, 5vw, 28px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.35,
            }}
          >
            이슈 톡톡
          </h2>
          {/* 지금까지 발행된 전체 레터 목록 — 경제 캘린더로 잘못 연결돼 있던 걸
              2026-08-06 수정(캘린더 페이지 자체를 폐기). */}
          <Link
            href="/letters"
            className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            더보기 →
          </Link>
        </div>
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

      {/* 모바일 2열·데스크톱 4열 고정(2026-08-12) — 웹툰 섹션(WebtoonPreviewSection)과
          그리드를 통일. 예전엔 auto-fill(minmax 160~240px)로 카드 개수에 맞춰
          열 수가 자동으로 정해지게 했는데, 실제 모바일 폭(~330px, 좌우 패딩
          제외)에서는 2열이 겨우 들어맞는 수준이라 패딩·스크롤바 오차로 1열로
          허물어지는 경우가 실제로 있었다(사용자 스크린샷으로 확인) — 웹툰처럼
          열 수를 아예 고정해 이 문제를 원천 차단. */}
      <ol
        className="grid grid-cols-2 sm:grid-cols-4"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
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
                // "매거진 고급짐" 카드 톤(2026-08-06) — 정보성 카드(이슈 톡톡·트렌드·칼럼)만
                // 이 톤으로: 둥근 라운드(16)는 앱스러운 느낌이라 액자처럼 각지게(8) 줄이고,
                // 테두리는 없애 그림자만으로 경계를 주고, 그림자도 옅고 촘촘하게(뜬 느낌 대신
                // 얹힌 느낌). 웹툰·스타일 등 "재미" 섹션은 원래 톤(둥근 라운드·팝코믹) 유지 —
                // 정보엔 신뢰, 재미엔 텐션으로 톤을 나누기로 함(사용자 확인).
                borderRadius: 8,
                background: '#fff',
                boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)',
                // 그림자만으로는 가장자리가 흐릿해 보일 수 있어 아주 옅은 헤어라인을
                // 같이 준다(노션·리니어식 패턴) — 두꺼우면 촌스럽지만 이 정도 옅기는 괜찮다.
                border: '1px solid rgba(0,0,0,0.06)',
                textDecoration: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* 상단 컬러 바를 시도했다가 카드마다 다른 원색이 나란히 있으니 무지개
                  줄무늬처럼 촌스러워 보였다(2026-08-06 피드백) — 뺐다. 매거진 고급짐은
                  색을 아예 거의 안 쓰는 쪽이 맞다, 사진·타이포만으로 절제되게. */}

              {/* 썸네일 — CMS 지정 썸네일 > 기본 아바타 폴백 */}
              <div
                className="aspect-square overflow-hidden"
                style={{ background: l.accentBg }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img loading="lazy"
                  src={l.thumbnailUrl ?? l.editorAvatar}
                  alt={l.title}
                  className="w-full h-full transition-transform duration-300 group-hover:scale-[1.04]"
                  style={{ objectFit: 'cover' }}
                />
              </div>

              <div style={{ padding: 'clamp(8px, 2vw, 12px)', display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                {/* 작가 라벨 — 색 있는 굵은 글씨 대신, 섹션 이거브로우(Trend/Letter)와
                    같은 무채색 소문자 킥커 톤으로(2026-08-06, "매거진 고급짐" 통일). */}
                <p
                  className="truncate text-gray-400"
                  style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}
                >
                  {l.archetype}
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

                {/* 설명글 — subtitle 없으면 본문 첫 문장으로 폴백(최대 200자), 카드 폭에 맞춰 일부만 노출.
                    4줄 클램프라 빽빽한 브리핑처럼 보였다("웹툰은 짧고 이야기하듯 쓰는데 이슈 톡톡은
                    설명이 너무 빽빽하다", 2026-08-06) — 2줄로 줄여 더 가볍게. */}
                <p
                  className="text-gray-500"
                  style={{
                    fontSize: 11,
                    lineHeight: 1.5,
                    letterSpacing: '-0.005em',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
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
