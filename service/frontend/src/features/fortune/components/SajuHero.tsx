'use client';

type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

interface Props {
  group: MbtiGroup;
  onChange: (g: MbtiGroup) => void;
  todayLabel: string;
}

export function SajuHero({ todayLabel }: Props) {
  return (
    <div className="relative max-w-[720px] mx-auto px-5 md:px-8 pt-10 md:pt-14 pb-4">
      {/* 라벨 + 날짜 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-bold tracking-[0.14em] uppercase" style={{ color: '#9f1239' }}>
          Today&apos;s Fortune
        </span>
        <span className="text-[11px] text-gray-300">·</span>
        <span className="text-[11px] text-gray-500">{todayLabel}</span>
      </div>

      {/* 메인 타이틀 */}
      <h2
        className="text-[28px] md:text-[34px] font-black text-gray-900 tracking-[-0.03em] leading-[1.2] mb-2"
        style={{ fontFamily: 'Pretendard Variable, Noto Serif KR, serif' }}
      >
        오늘, 당신의 운은 어떨까요?
      </h2>
      <p className="text-[13px] md:text-[14px] text-gray-500 leading-relaxed mb-2">
        오늘 당신의 결을, 천천히 함께 따라가 볼게요.
      </p>
    </div>
  );
}
