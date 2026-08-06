'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchCmsPosts, type CmsLetter } from '@/shared/lib/cmsPostsApi';
import { toLetterIdFromApi } from '@/shared/lib/todayLettersApi';
import { letterHref } from '@/shared/lib/letterHref';
import { GiftBoxIcon } from './GiftBoxIcon';

// 미니보험처럼 "부담 없이" 헤드라인만 묶어서 패키징 — 무료 묶음으로 체류를
// 늘리고, 유료 묶음은 200원 결제 컨셉만 보여준다(2026-08-06). 실제 결제는
// PG 연동·정산 계약이 먼저 필요한 별도 트랙이라, 지금은 잠금 UI만.
// "무료 묶음도 헤드라인이 처음부터 보이면 안 된다, 상자 4개만 있다가 누르면
// 두근두근하다 팡 터지면서 헤드라인이 나와야 한다"는 피드백(같은 날)으로 —
// 텍스트 리스트를 걷어내고 클릭 전엔 진짜 아무 정보도 없는 선물상자 4개로.
const TOSS_BLUE = '#3182F6';

// 분야별 유료 묶음 — "반도체 하나만 있냐, 코인 정도는 넣어서 수익화하자"는
// 요청(2026-08-06). 실제 헤드라인에 해당 키워드가 없으면(예: 지금 코인 관련
// 기사가 없는 날) 가짜로 채우지 않고 "준비 중" 상태로 보여준다 — 카테고리
// 자체는 노출하되 없는 헤드라인을 지어내진 않는다는 원칙(이 세션 내내 유지).
const PAID_TOPICS: { label: string; keywords: string[] }[] = [
  { label: '반도체', keywords: ['반도체', 'HBM'] },
  { label: '코인', keywords: ['코인', '비트코인', '가상자산', '암호화폐'] },
  { label: '부동산', keywords: ['부동산', '주택', '아파트', '가로주택정비'] },
];

function hrefFor(l: CmsLetter): string {
  return letterHref(l.mbti_group ? toLetterIdFromApi(l.mbti_group, l.publish_date ?? '') : l.id);
}

const cardStyle = {
  borderRadius: 20,
  background: '#fff',
  border: '1px solid #f0f0f0',
  boxShadow: '0 2px 16px rgba(17,24,39,0.04)',
  padding: 'clamp(18px, 3vw, 22px)',
};

type BoxStage = 'closed' | 'shaking' | 'revealed';

function GiftHeadlineBox({ letter }: { letter: CmsLetter }) {
  const [stage, setStage] = useState<BoxStage>('closed');

  const open = () => {
    if (stage !== 'closed') return;
    setStage('shaking');
    setTimeout(() => setStage('revealed'), 620);
  };

  if (stage === 'revealed') {
    return (
      <Link
        href={hrefFor(letter)}
        className="gift-reveal"
        style={{
          ...cardStyle,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          minHeight: 128,
          textDecoration: 'none',
          padding: 'clamp(14px, 2.6vw, 18px)',
        }}
      >
        <span className="gift-burst-ring" aria-hidden />
        <p
          style={{
            position: 'relative',
            fontSize: 13,
            fontWeight: 700,
            color: '#191f28',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {letter.headline}
        </p>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={stage === 'shaking'}
      className={stage === 'shaking' ? 'gift-shake' : ''}
      style={{
        ...cardStyle,
        position: 'relative',
        // 유료 카드(흰 배경)와 헷갈리지 않도록 무료 상자는 옅은 파란 톤으로 —
        // "코인 준비 중" 회색 카드랑도 확실히 구분되게 (2026-08-06 피드백).
        background: '#f3f8ff',
        border: '1px solid #e3eeff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 128,
        width: '100%',
        cursor: stage === 'closed' ? 'pointer' : 'default',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          fontSize: 10,
          fontWeight: 800,
          color: '#fff',
          background: TOSS_BLUE,
          padding: '2px 7px',
          borderRadius: 999,
        }}
      >
        무료
      </span>
      <GiftBoxIcon accent={TOSS_BLUE} wrapped className="w-9 h-9" />
      <span style={{ fontSize: 11, fontWeight: 700, color: '#5b7ab8' }}>
        {stage === 'shaking' ? '두근두근...' : '눌러서 열어보기'}
      </span>
    </button>
  );
}

// "준비 중" 카드 — 눌러질 것 같은 회색 버튼을 아예 안 만든다(고장난 버튼처럼
// 보였던 문제, 2026-08-06). 점선 테두리로 "아직 비어있는 자리"임을 명확히
// 하고, 배지 하나로 상태만 알린다.
function EmptyTopicCard({ label }: { label: string }) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: '1.5px dashed #e3e1db',
        padding: 'clamp(18px, 3vw, 22px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 8,
        minHeight: 170,
      }}
    >
      <GiftBoxIcon accent="#c1c7cd" wrapped className="w-7 h-7" />
      <p style={{ fontSize: 13, fontWeight: 700, color: '#b0aaa0' }}>{label} 헤드라인</p>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: '#a8a29e',
          background: '#f5f4f1',
          padding: '3px 9px',
          borderRadius: 999,
        }}
      >
        아직 준비 중
      </span>
    </div>
  );
}

function TopicBundleCard({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 14 }}>
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 40, height: 40, borderRadius: 12, background: '#eef4ff' }}
        >
          <GiftBoxIcon accent={TOSS_BLUE} wrapped className="w-6 h-6" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: '#191f28' }}>
            {label} 헤드라인 {count}
          </p>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#8b95a1' }}>포장을 안 뜯었어요</span>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: '#8b95a1', lineHeight: 1.6, marginBottom: 16, flex: 1 }}>
        {label} 이슈만 골라 묶었어요. 열어보기 전까진 제목이 안 보여요.
      </p>

      <div className="flex items-center justify-between">
        <span style={{ fontSize: 18, fontWeight: 800, color: '#191f28' }}>
          200<span style={{ fontSize: 12.5, fontWeight: 700, color: '#8b95a1', marginLeft: 2 }}>원</span>
        </span>
        <button
          type="button"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            background: TOSS_BLUE,
            border: 0,
            borderRadius: 999,
            padding: '9px 18px',
            cursor: 'not-allowed',
          }}
        >
          열어보기
        </button>
      </div>
      <p style={{ fontSize: 10.5, color: '#c1c7cd', marginTop: 6, textAlign: 'right' }}>결제 연동 준비 중이에요</p>
    </div>
  );
}

export function MiniHeadlinesSection() {
  const [letters, setLetters] = useState<CmsLetter[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCmsPosts('letters', undefined, 50).then((rows) => {
      if (!cancelled) setLetters(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (letters === null || letters.length === 0) return null;

  const freeBundle = letters.slice(0, 4);
  const paidBundles = PAID_TOPICS.map((topic) => ({
    ...topic,
    letters: letters.filter((l) => topic.keywords.some((k) => l.headline?.includes(k))),
  }));

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        @keyframes giftShake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          15% { transform: translateX(-3px) rotate(-4deg); }
          30% { transform: translateX(3px) rotate(4deg); }
          45% { transform: translateX(-4px) rotate(-5deg); }
          60% { transform: translateX(4px) rotate(5deg); }
          75% { transform: translateX(-2px) rotate(-2deg); }
          90% { transform: translateX(1px) rotate(1deg); }
        }
        .gift-shake { animation: giftShake 0.6s ease-in-out; }

        @keyframes giftBurstRing {
          0% { transform: translate(-50%, -50%) scale(0.2); opacity: 0.5; }
          100% { transform: translate(-50%, -50%) scale(3.2); opacity: 0; }
        }
        .gift-burst-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 60px;
          height: 60px;
          border-radius: 999px;
          background: ${TOSS_BLUE};
          opacity: 0;
          animation: giftBurstRing 0.55s ease-out both;
          pointer-events: none;
        }

        @keyframes giftRevealIn {
          0% { transform: scale(0.82); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .gift-reveal { animation: giftRevealIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
      `}</style>

      <header style={{ marginBottom: 14 }}>
        <p
          className="text-gray-400"
          style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
        >
          Mini Headlines
        </p>
        {/* 섹션 제목 타이포 통일(2026-08-06) — 홈 화면 섹션 제목을 전부
            Pretendard Bold로(웹툰만 튀어 보이던 문제). */}
        <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
          미니 헤드라인
        </h2>
        <p style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 4 }}>
          선물 상자 안에 오늘의 헤드라인이 하나씩 들어있어요. 눌러서 열어보세요.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 'clamp(10px, 2vw, 14px)', marginBottom: 22 }}>
        {freeBundle.map((l) => (
          <GiftHeadlineBox key={l.id} letter={l} />
        ))}
      </div>

      {/* 무료/유료 구간이 그냥 이어져서 어디부터 유료인지 안 보인다는
          피드백(2026-08-06) — 작은 구분선 겸 소제목을 끼워넣었다. */}
      <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8b95a1', whiteSpace: 'nowrap' }}>분야별로 묶은 유료 패키지</span>
        <span style={{ flex: 1, height: 1, background: '#eee' }} />
      </div>

      {/* 유료 묶음(컨셉) — 분야별로 여러 개. 포장을 아예 안 뜯는 상태로 고정.
          블러 처리로 "숨겼다"를 티내는 대신, 애초에 포장된 선물이라 안이 안
          보이는 게 자연스럽다는 쪽으로. */}
      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 'clamp(10px, 2vw, 14px)' }}>
        {paidBundles.map((bundle) =>
          bundle.letters.length > 0 ? (
            <TopicBundleCard key={bundle.label} label={bundle.label} count={bundle.letters.length} />
          ) : (
            <EmptyTopicCard key={bundle.label} label={bundle.label} />
          )
        )}
      </div>
    </section>
  );
}
