/**
 * ZodiacIcon — 12지지 손그림 스타일 SVG 아이콘 (플랫, 단색, currentColor 기반)
 * 이모지 대신 사용하는 일관된 벡터 일러스트. shared/lib/gapja.ts 의 branch.hanja 로 선택.
 */

interface Props {
  /** 지지 한자 — 子丑寅卯辰巳午未申酉戌亥 */
  branch: string;
  size?: number;
  className?: string;
}

const COMMON = { viewBox: '0 0 48 48', fill: 'none' } as const;
const STROKE = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function Rat() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <circle cx="24" cy="27" r="12" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <circle cx="14" cy="15" r="5.5" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <circle cx="34" cy="15" r="5.5" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <circle cx="19.5" cy="26" r="1.6" fill="currentColor" />
      <circle cx="28.5" cy="26" r="1.6" fill="currentColor" />
      <path d="M22.5 31c.6.7 2.4.7 3 0" {...STROKE} />
      <path d="M8 29h6M8 33h6M34 29h6M34 33h6" {...STROKE} strokeWidth="1.5" />
    </svg>
  );
}

function Ox() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <path d="M9 16c2-4 6-2 6 2M39 16c-2-4-6-2-6 2" {...STROKE} />
      <circle cx="24" cy="27" r="13" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <ellipse cx="24" cy="32" rx="7" ry="5" fill="currentColor" fillOpacity="0.22" {...STROKE} />
      <circle cx="21" cy="32" r="1.2" fill="currentColor" />
      <circle cx="27" cy="32" r="1.2" fill="currentColor" />
      <circle cx="18" cy="24" r="1.6" fill="currentColor" />
      <circle cx="30" cy="24" r="1.6" fill="currentColor" />
    </svg>
  );
}

function Tiger() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <path d="M12 12l4 7M36 12l-4 7" {...STROKE} />
      <circle cx="24" cy="27" r="13" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <path d="M14 22l3 3M34 22l-3 3M13 30l3.5 1M35 30l-3.5 1" {...STROKE} strokeWidth="1.5" />
      <circle cx="19.5" cy="27" r="1.6" fill="currentColor" />
      <circle cx="28.5" cy="27" r="1.6" fill="currentColor" />
      <path d="M21 33c1.4 1.2 4.6 1.2 6 0" {...STROKE} />
    </svg>
  );
}

function Rabbit() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <path d="M17 20c-2-6-1-13 2-13s3 7 2 13M31 20c2-6 1-13-2-13s-3 7-2 13" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <circle cx="24" cy="29" r="12" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <circle cx="19.5" cy="28" r="1.6" fill="currentColor" />
      <circle cx="28.5" cy="28" r="1.6" fill="currentColor" />
      <path d="M22 33c.7.8 2.3.8 3 0" {...STROKE} />
    </svg>
  );
}

function Dragon() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <path d="M15 14l-2-6M33 14l2-6" {...STROKE} />
      <circle cx="24" cy="27" r="13" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <path d="M9 27c-3 1-3 5 0 6M39 27c3 1 3 5 0 6" {...STROKE} strokeWidth="1.5" />
      <circle cx="19" cy="25" r="1.8" fill="currentColor" />
      <circle cx="29" cy="25" r="1.8" fill="currentColor" />
      <path d="M20 33h8M15 21c1.5-1.5 4-1.5 5.5 0M27.5 21c1.5-1.5 4-1.5 5.5 0" {...STROKE} strokeWidth="1.5" />
    </svg>
  );
}

function Snake() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <path
        d="M14 12c8 0 -6 10 4 12 8 1.6 -6 8 6 10"
        fill="none" {...STROKE} strokeWidth="6"
      />
      <path d="M27 33l4 2-1-4.5" {...STROKE} strokeWidth="1.6" fill="currentColor" />
      <circle cx="15" cy="12.5" r="1.4" fill="#fff" />
    </svg>
  );
}

function Horse() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <path d="M14 10c8-2 10 3 9 8" {...STROKE} />
      <ellipse cx="23" cy="26" rx="11" ry="13" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <path d="M31 20c4 0 6 3 5 6" {...STROKE} fill="currentColor" fillOpacity="0.16" />
      <circle cx="19" cy="24" r="1.6" fill="currentColor" />
      <circle cx="27" cy="24" r="1.6" fill="currentColor" />
      <ellipse cx="23" cy="34" rx="5" ry="3" fill="currentColor" fillOpacity="0.22" {...STROKE} />
    </svg>
  );
}

function Goat() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <path d="M11 15c-3 2-3 6 0 8M37 15c3 2 3 6 0 8" {...STROKE} />
      <circle cx="24" cy="27" r="12" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <path d="M17 18c-2-4 0-8 3-6M31 18c2-4 0-8-3-6" {...STROKE} strokeWidth="1.5" />
      <circle cx="19.5" cy="27" r="1.6" fill="currentColor" />
      <circle cx="28.5" cy="27" r="1.6" fill="currentColor" />
      <path d="M21.5 33h5" {...STROKE} />
    </svg>
  );
}

function Monkey() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <circle cx="11" cy="22" r="5.5" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <circle cx="37" cy="22" r="5.5" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <circle cx="24" cy="27" r="12" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <ellipse cx="24" cy="30" rx="7" ry="6" fill="currentColor" fillOpacity="0.24" {...STROKE} />
      <circle cx="20" cy="26" r="1.4" fill="currentColor" />
      <circle cx="28" cy="26" r="1.4" fill="currentColor" />
    </svg>
  );
}

function Rooster() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <path d="M17 12c1-3 3-3 3 0-1-2 3-4 4-1-1-3 4-3 3 0" fill="currentColor" fillOpacity="0.4" {...STROKE} strokeWidth="1.5" />
      <circle cx="23" cy="27" r="11" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <path d="M34 28l6 3-6 2z" fill="currentColor" fillOpacity="0.3" {...STROKE} strokeWidth="1.5" />
      <path d="M22 34c0 2.5-3 3-3 1" {...STROKE} strokeWidth="1.5" fill="currentColor" />
      <circle cx="19" cy="26" r="1.6" fill="currentColor" />
    </svg>
  );
}

function Dog() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <path d="M10 14c6 1 5 9 2 12-4 1-7-3-6-8 0-2 2-4 4-4zM38 14c-6 1-5 9-2 12 4 1 7-3 6-8 0-2-2-4-4-4z" fill="currentColor" fillOpacity="0.2" {...STROKE} />
      <circle cx="24" cy="28" r="11" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <ellipse cx="24" cy="32" rx="5" ry="3.5" fill="currentColor" fillOpacity="0.24" {...STROKE} />
      <circle cx="20" cy="26" r="1.5" fill="currentColor" />
      <circle cx="28" cy="26" r="1.5" fill="currentColor" />
    </svg>
  );
}

function Pig() {
  return (
    <svg {...COMMON} width="100%" height="100%">
      <circle cx="12.5" cy="18" r="3.5" fill="currentColor" fillOpacity="0.2" {...STROKE} strokeWidth="1.5" />
      <circle cx="35.5" cy="18" r="3.5" fill="currentColor" fillOpacity="0.2" {...STROKE} strokeWidth="1.5" />
      <circle cx="24" cy="27" r="12" fill="currentColor" fillOpacity="0.16" {...STROKE} />
      <ellipse cx="24" cy="30" rx="6" ry="4.5" fill="currentColor" fillOpacity="0.24" {...STROKE} />
      <circle cx="21.5" cy="30" r="1" fill="currentColor" />
      <circle cx="26.5" cy="30" r="1" fill="currentColor" />
      <circle cx="19" cy="24" r="1.5" fill="currentColor" />
      <circle cx="29" cy="24" r="1.5" fill="currentColor" />
    </svg>
  );
}

const ICONS: Record<string, () => React.JSX.Element> = {
  '子': Rat, '丑': Ox, '寅': Tiger, '卯': Rabbit, '辰': Dragon, '巳': Snake,
  '午': Horse, '未': Goat, '申': Monkey, '酉': Rooster, '戌': Dog, '亥': Pig,
};

export function ZodiacIcon({ branch, size = 32, className }: Props) {
  const Icon = ICONS[branch];
  if (!Icon) return null;
  return (
    <span
      className={className}
      style={{ width: size, height: size, display: 'inline-flex' }}
    >
      <Icon />
    </span>
  );
}
