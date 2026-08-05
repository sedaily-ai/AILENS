'use client';

import Link from 'next/link';

type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

// 결과 페이지의 섹션 id — onOpen(intent) 로 넘기면 결과 렌더 후 해당 섹션으로 자동 스크롤.
export type SajuIntent = 'manse' | 'today' | 'chongun' | 'category' | 'daeun' | 'calendar';

interface Props {
  group?: MbtiGroup;
  onAsk: () => void;
  onOpen: (intent?: SajuIntent) => void;
}

const ACCENT: Record<MbtiGroup, string> = {
  NT: '#7c3aed', NF: '#e11d48', ST: '#059669', SF: '#d97706',
};

const REAL_SECTIONS: { id: SajuIntent; title: string; subtitle: string; emoji: string }[] = [
  { id: 'manse',    title: '만세력 사주표',   subtitle: '연·월·일·시 4기둥 + 천간·지지',  emoji: '📜' },
  { id: 'today',    title: '오늘의 운세',     subtitle: '일진 × 일간 — 십성·12운성 풀이', emoji: '🌅' },
  { id: 'chongun',  title: '총운',           subtitle: 'MBTI 톤별 인생 흐름 해석',       emoji: '🪄' },
  { id: 'category', title: '분야별 운세',     subtitle: '재물·건강·연애·직장·학업',       emoji: '🎯' },
  { id: 'daeun',    title: '대운 흐름',       subtitle: '10년 단위 인생 사이클',          emoji: '📈' },
  { id: 'calendar', title: '일진 달력',       subtitle: '이번 달 날짜별 일진 히트맵',      emoji: '🗓️' },
];

// 외부 라우트(/saju-match) 로 보내는 카드 — 메인 피드와 같은 화면 공유.
const EXTERNAL_CARD = { href: '/saju-match', title: '내 짝꿍 에디터', subtitle: '사주로 보는 나의 에디터 궁합', emoji: '💞' } as const;

export function SajuExplore({ group = 'NF', onOpen }: Props) {
  const accent = ACCENT[group];

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <div className="max-w-[720px] mx-auto px-4 sm:px-5" style={{ paddingTop: 36, paddingBottom: 56 }}>
        <div className="flex flex-col gap-8">
          {/* 메인 CTA — 전체 풀이 (모든 섹션 노출) */}
          <button
            onClick={() => onOpen()}
            className="w-full rounded-[18px] text-left p-5 flex items-center gap-4 transition-transform duration-200 hover:-translate-y-0.5"
            style={{
              background: `${accent}0d`,
              boxShadow: '0 1px 2px rgba(17,24,39,0.04), 0 14px 30px -20px rgba(17,24,39,0.25)',
            }}
          >
            <div className="flex-1">
              <div className="text-[10.5px] font-extrabold tracking-[0.14em]" style={{ color: accent }}>MY SAJU</div>
              <div className="text-[17px] font-extrabold text-gray-900 mt-1.5 tracking-[-0.02em]">내 사주, 제대로 풀어보기</div>
              <p className="text-[12.5px] text-gray-500 mt-1">생년월일만 입력하면 아래 6가지를 한눈에</p>
            </div>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#ffffff', boxShadow: '0 4px 14px -8px rgba(17,24,39,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }} aria-hidden>
              <span style={{ filter: 'drop-shadow(0 4px 6px rgba(17,24,39,0.12))' }}>🪄</span>
            </div>
          </button>

          {/* 섹션별 진입 — 같은 입력 폼이지만 제출 후 해당 섹션으로 자동 스크롤 */}
          <section>
            <div className="flex items-center gap-2 mb-3.5">
              <h2 className="flex-1 text-[15px] font-extrabold text-gray-900 tracking-[-0.01em]">먼저 보고 싶은 게 있다면</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {REAL_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onOpen(s.id)}
                  className="flex gap-3.5 items-center p-3.5 rounded-[16px] text-left transition-all duration-200 hover:-translate-y-0.5"
                  style={{ background: '#f7f8f9' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f2f4'; e.currentTarget.style.boxShadow = '0 6px 18px -10px rgba(17,24,39,0.18)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#f7f8f9'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: '#ffffff',
                      boxShadow: 'inset 0 0 0 1px rgba(31,29,26,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                      flexShrink: 0,
                    }}
                    aria-hidden
                  >
                    {s.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-bold text-gray-900 truncate">{s.title}</div>
                    <div className="text-[12px] text-gray-500 truncate mt-0.5">{s.subtitle}</div>
                  </div>
                </button>
              ))}
              {/* 외부 라우트 — 메인 피드의 짝꿍 페이지와 동일 화면 */}
              <Link
                href={EXTERNAL_CARD.href}
                className="flex gap-3.5 items-center p-3.5 rounded-[16px] text-left transition-all duration-200 hover:-translate-y-0.5"
                style={{ background: '#f7f8f9' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f2f4'; e.currentTarget.style.boxShadow = '0 6px 18px -10px rgba(17,24,39,0.18)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f7f8f9'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: '#ffffff',
                    boxShadow: 'inset 0 0 0 1px rgba(31,29,26,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {EXTERNAL_CARD.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-gray-900 truncate">{EXTERNAL_CARD.title}</div>
                  <div className="text-[12px] text-gray-500 truncate mt-0.5">{EXTERNAL_CARD.subtitle}</div>
                </div>
              </Link>
            </div>
          </section>

          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-[11.5px] text-gray-300 text-center">본 서비스는 명리학과 생성형 AI를 결합해 제공됩니다</p>
          </div>
        </div>
      </div>
    </div>
  );
}
