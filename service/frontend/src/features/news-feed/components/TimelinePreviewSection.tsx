'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
// 아래 뉴스 목록은 지금은 프론트 목업만 두고, 실시간 데이터 연결(폴링
// 주기 포함)은 백엔드 담당 팀원이 이어서 작업하기로 결정. 각 줄은 실제
// 기사로 개별 링크되는 형태로 만들어뒀다(href는 아직 비어 있음 —
// 실데이터 연결 시 NewsTimeMachine.tsx 의 Article.original_link 를 그대로).
interface TimelineItem {
  id: string;
  time: string;
  title: string;
  /** 실제 기사 URL. 목업 단계라 비어 있음 — 실데이터 연결 시 original_link로 채운다. */
  href: string | null;
}

interface DateOption {
  key: string;
  label: string;
  items: TimelineItem[];
}

// TODO(팀원): 실데이터 연결 — /api/timeline(빅카인즈, 배포 전) 또는
// /api/search 폴백(NewsTimeMachine.tsx 의 fetchDayArticles 참고)으로 교체.
const DATE_OPTIONS: DateOption[] = [
  {
    key: 'today',
    label: '오늘',
    items: [
      { id: 'mock-t1', time: '09:12', title: '코스피, 외국인 순매수에 6,600선 회복', href: null },
      { id: 'mock-t2', time: '10:40', title: '한은, 8월 금통위서 기준금리 동결', href: null },
      { id: 'mock-t3', time: '13:05', title: '반도체 수출 3개월 연속 증가세', href: null },
      { id: 'mock-t4', time: '15:30', title: '원·달러 환율 1,320원대 등락', href: null },
      { id: 'mock-t5', time: '17:20', title: '정부, 5만 가구 추가 공급대책 발표', href: null },
    ],
  },
  {
    key: 'yesterday',
    label: '어제',
    items: [
      { id: 'mock-y1', time: '08:50', title: '美 증시 혼조, 빅테크 실적 발표 앞두고 관망세', href: null },
      { id: 'mock-y2', time: '11:15', title: '수출입은행, 3분기 경기전망지수 발표', href: null },
      { id: 'mock-y3', time: '14:02', title: '2차전지株 반등, 유럽 판매 회복 기대감', href: null },
      { id: 'mock-y4', time: '16:45', title: '금융위, 가계부채 관리방안 발표', href: null },
    ],
  },
  {
    key: 'grace',
    label: '그제',
    items: [
      { id: 'mock-g1', time: '09:30', title: '연준 위원 발언에 국채 금리 소폭 상승', href: null },
      { id: 'mock-g2', time: '12:20', title: '중국 제조업 PMI, 경기 확장 국면 지속', href: null },
      { id: 'mock-g3', time: '18:00', title: '서울 아파트 거래량 두 달 연속 증가', href: null },
    ],
  },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// 고른 날짜와 오늘의 일수 차이로 목업 3종(오늘/어제/그제) 중 하나에 매핑한다.
// 실데이터 연결 전까지는 날짜를 아무리 다양하게 골라도 준비된 3일치 안에서만
// 보여줄 수밖에 없다 — 팀원이 fetchDayArticles(date) 로 교체하면 이 매핑은
// 통째로 필요 없어진다.
function bucketForDate(dateStr: string): DateOption {
  const diffDays = Math.round((new Date(todayStr()).getTime() - new Date(dateStr).getTime()) / 86_400_000);
  if (diffDays <= 0) return DATE_OPTIONS[0];
  if (diffDays === 1) return DATE_OPTIONS[1];
  return DATE_OPTIONS[2];
}

export function TimelinePreviewSection() {
  const router = useRouter();
  const [pickedDate, setPickedDate] = useState(todayStr());
  const selected = bucketForDate(pickedDate);

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
          {DATE_OPTIONS.map((d, i) => {
            const active = bucketForDate(pickedDate).key === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  const t = new Date();
                  t.setDate(t.getDate() - i);
                  setPickedDate(t.toISOString().slice(0, 10));
                }}
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
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 고른 날짜의 미리보기 목록 — 지금은 목업 3종(오늘/어제/그제) 중 매핑. */}
      <div
        style={{
          borderRadius: 14,
          background: '#fff',
          border: '1px solid #f1efe9',
          boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)',
          padding: 'clamp(14px, 3vw, 20px)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {selected.items.map((item) => {
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
    </section>
  );
}
