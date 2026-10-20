import React from "react";
import { INK } from "./theme";

// PRISM 아이콘 — 샘플 영상처럼 굵은 검은 테두리 + 강조색 면 + 흰 면의 평면 그림. 외부 이미지 없이 SVG로 그린다.
// 이름은 대본의 icon 값. 기존 영상 아이콘 이름(generate_script.py ICON_WHITELIST)도 가장 가까운 그림으로 받는다.

type P = { c: string };
const S = { stroke: INK, strokeWidth: 5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const Rocket: React.FC<P> = ({ c }) => (
  <>
    <path d="M50 8 C68 22 72 48 64 70 L36 70 C28 48 32 22 50 8 Z" fill="#fff" {...S} />
    <circle cx="50" cy="38" r="9" fill={c} {...S} />
    <path d="M36 52 L22 66 L24 80 L36 70 Z" fill={c} {...S} />
    <path d="M64 52 L78 66 L76 80 L64 70 Z" fill={c} {...S} />
    <path d="M42 72 L50 92 L58 72 Z" fill={c} {...S} />
  </>
);
const Building: React.FC<P> = ({ c }) => (
  <>
    <rect x="26" y="10" width="48" height="82" fill={c} {...S} />
    {[0, 1, 2, 3, 4].map((r) => [0, 1, 2].map((k) => <rect key={`${r}${k}`} x={33 + k * 12} y={18 + r * 13} width="8" height="8" fill="#fff" stroke={INK} strokeWidth="3" />))}
    <rect x="44" y="78" width="12" height="14" fill="#fff" {...S} />
  </>
);
const Flask: React.FC<P> = ({ c }) => (
  <>
    <path d="M40 10 L60 10 M43 10 L43 38 L18 84 C16 89 19 92 24 92 L76 92 C81 92 84 89 82 84 L57 38 L57 10" fill="#fff" {...S} />
    <path d="M30 62 L70 62 L82 84 C84 89 81 92 76 92 L24 92 C19 92 16 89 18 84 Z" fill={c} {...S} />
    <path d="M66 22 Q72 28 66 34 M74 18 Q84 28 74 38" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" />
  </>
);
const Chip: React.FC<P> = ({ c }) => (
  <>
    {[0, 1, 2, 3, 4].map((i) => (
      <g key={i}>
        <line x1={26 + i * 12} y1="8" x2={26 + i * 12} y2="20" {...S} />
        <line x1={26 + i * 12} y1="80" x2={26 + i * 12} y2="92" {...S} />
        <line x1="8" y1={26 + i * 12} x2="20" y2={26 + i * 12} {...S} />
        <line x1="80" y1={26 + i * 12} x2="92" y2={26 + i * 12} {...S} />
      </g>
    ))}
    <rect x="20" y="20" width="60" height="60" rx="4" fill={c} {...S} />
    <rect x="34" y="34" width="32" height="32" fill="#fff" {...S} />
  </>
);
const MoneyBag: React.FC<P> = ({ c }) => (
  <>
    <path d="M38 22 L62 22 L56 32 L44 32 Z" fill={c} {...S} />
    <path d="M44 32 C20 44 14 64 20 80 C24 90 36 93 50 93 C64 93 76 90 80 80 C86 64 80 44 56 32 Z" fill={c} {...S} />
    <path d="M38 12 C44 18 56 18 62 12" fill="none" {...S} />
    <text x="50" y="76" textAnchor="middle" fontSize="30" fontWeight="900" fill="#fff" fontFamily="Arial">₩</text>
  </>
);
const Store: React.FC<P> = ({ c }) => (
  <>
    <rect x="16" y="40" width="68" height="52" fill="#fff" {...S} />
    <path d="M12 40 L20 14 L80 14 L88 40 Z" fill={c} {...S} />
    {[0, 1, 2, 3].map((i) => <line key={i} x1={27 + i * 15} y1="14" x2={24 + i * 17} y2="40" {...S} />)}
    <rect x="24" y="54" width="22" height="22" fill={c} {...S} />
    <rect x="56" y="54" width="18" height="38" fill="#fff" {...S} />
  </>
);
const Flag: React.FC<P> = ({ c }) => (
  <>
    <line x1="22" y1="8" x2="22" y2="94" {...S} strokeWidth="6" />
    <path d="M22 12 C40 4 54 22 82 12 L82 50 C54 60 40 42 22 50 Z" fill={c} {...S} />
  </>
);
const Quote: React.FC<P> = ({ c }) => (
  <>
    <path d="M10 14 L90 14 L90 70 L46 70 L28 90 L30 70 L10 70 Z" fill={c} {...S} />
    <path d="M34 30 L44 30 L44 42 L38 52 L32 52 L36 42 L34 42 Z M54 30 L64 30 L64 42 L58 52 L52 52 L56 42 L54 42 Z" fill="#fff" />
  </>
);
const Users: React.FC<P> = ({ c }) => (
  <>
    <circle cx="30" cy="34" r="12" fill="#fff" {...S} />
    <circle cx="70" cy="34" r="12" fill="#fff" {...S} />
    <path d="M8 80 C8 60 22 52 30 52 C38 52 52 60 52 80 Z" fill={c} {...S} />
    <path d="M48 80 C48 60 62 52 70 52 C78 52 92 60 92 80 Z" fill={c} {...S} />
    <circle cx="50" cy="28" r="13" fill="#fff" {...S} />
    <path d="M24 92 C24 66 40 56 50 56 C60 56 76 66 76 92 Z" fill="#fff" {...S} />
  </>
);
const Bank: React.FC<P> = ({ c }) => (
  <>
    <path d="M8 34 L50 10 L92 34 Z" fill={c} {...S} />
    <circle cx="50" cy="25" r="4" fill="#fff" />
    <rect x="14" y="34" width="72" height="8" fill="#fff" {...S} />
    {[0, 1, 2, 3].map((i) => <rect key={i} x={20 + i * 17} y="44" width="9" height="32" fill="#fff" {...S} />)}
    <rect x="10" y="78" width="80" height="14" fill={c} {...S} />
  </>
);
const Calendar: React.FC<P> = ({ c }) => (
  <>
    <rect x="12" y="18" width="76" height="72" rx="6" fill="#fff" {...S} />
    <path d="M12 24 C12 20 15 18 18 18 L82 18 C85 18 88 20 88 24 L88 40 L12 40 Z" fill={c} {...S} />
    <line x1="32" y1="8" x2="32" y2="26" {...S} />
    <line x1="68" y1="8" x2="68" y2="26" {...S} />
    {[0, 1, 2].map((r) => [0, 1, 2, 3].map((k) => <rect key={`${r}${k}`} x={22 + k * 15} y={48 + r * 13} width="9" height="7" fill={INK} />))}
  </>
);
const ChartUp: React.FC<P> = ({ c }) => (
  <>
    <path d="M12 10 L12 90 L92 90" fill="none" {...S} />
    <rect x="22" y="58" width="14" height="32" fill="#fff" {...S} />
    <rect x="44" y="44" width="14" height="46" fill="#fff" {...S} />
    <rect x="66" y="28" width="14" height="62" fill={c} {...S} />
    <path d="M20 46 L46 26 L60 34 L86 10 M72 10 L86 10 L86 24" fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </>
);
const ChartDown: React.FC<P> = ({ c }) => (
  <>
    <path d="M12 10 L12 90 L92 90" fill="none" {...S} />
    <rect x="22" y="30" width="14" height="60" fill="#fff" {...S} />
    <rect x="44" y="48" width="14" height="42" fill="#fff" {...S} />
    <rect x="66" y="64" width="14" height="26" fill={c} {...S} />
    <path d="M20 14 L46 36 L60 30 L86 54 M86 40 L86 54 L72 54" fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </>
);
const Robot: React.FC<P> = ({ c }) => (
  <>
    <line x1="50" y1="6" x2="50" y2="18" {...S} />
    <circle cx="50" cy="6" r="4" fill={c} {...S} />
    <rect x="18" y="18" width="64" height="48" rx="10" fill="#fff" {...S} />
    <circle cx="36" cy="40" r="7" fill={c} {...S} />
    <circle cx="64" cy="40" r="7" fill={c} {...S} />
    <line x1="38" y1="56" x2="62" y2="56" {...S} />
    <rect x="28" y="70" width="44" height="22" rx="4" fill={c} {...S} />
  </>
);
const Briefcase: React.FC<P> = ({ c }) => (
  <>
    <path d="M36 26 L36 16 L64 16 L64 26" fill="none" {...S} />
    <rect x="10" y="26" width="80" height="62" rx="6" fill={c} {...S} />
    <line x1="10" y1="52" x2="90" y2="52" {...S} />
    <rect x="42" y="46" width="16" height="12" fill="#fff" {...S} />
  </>
);
const Factory: React.FC<P> = ({ c }) => (
  <>
    <rect x="66" y="10" width="14" height="40" fill="#fff" {...S} />
    <path d="M10 92 L10 46 L32 34 L32 46 L54 34 L54 46 L90 34 L90 92 Z" fill={c} {...S} />
    {[0, 1, 2].map((i) => <rect key={i} x={20 + i * 22} y="62" width="12" height="12" fill="#fff" {...S} />)}
  </>
);
const Shield: React.FC<P> = ({ c }) => (
  <>
    <path d="M50 8 L86 20 L86 48 C86 70 70 86 50 94 C30 86 14 70 14 48 L14 20 Z" fill={c} {...S} />
    <path d="M34 50 L46 62 L68 38" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
  </>
);
const Phone: React.FC<P> = ({ c }) => (
  <>
    <rect x="26" y="6" width="48" height="88" rx="8" fill={c} {...S} />
    <rect x="32" y="16" width="36" height="58" fill="#fff" {...S} />
    <circle cx="50" cy="84" r="4" fill="#fff" />
  </>
);
const Coins: React.FC<P> = ({ c }) => (
  <>
    {[0, 1, 2].map((i) => <ellipse key={i} cx="40" cy={78 - i * 14} rx="28" ry="10" fill={i === 2 ? c : "#fff"} {...S} />)}
    <circle cx="70" cy="40" r="22" fill={c} {...S} />
    <text x="70" y="50" textAnchor="middle" fontSize="28" fontWeight="900" fill="#fff" fontFamily="Arial">₩</text>
  </>
);
const Alert: React.FC<P> = ({ c }) => (
  <>
    <path d="M50 8 L94 88 L6 88 Z" fill={c} {...S} />
    <line x1="50" y1="36" x2="50" y2="60" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
    <circle cx="50" cy="74" r="5" fill="#fff" />
  </>
);
const Megaphone: React.FC<P> = ({ c }) => (
  <>
    <path d="M14 38 L40 38 L80 14 L80 86 L40 62 L14 62 Z" fill={c} {...S} />
    <rect x="24" y="62" width="14" height="26" fill="#fff" {...S} />
    <path d="M88 38 Q94 50 88 62" fill="none" {...S} />
  </>
);
const Pin: React.FC<P> = ({ c }) => (
  <>
    <path d="M50 94 C30 64 18 50 18 36 C18 18 32 6 50 6 C68 6 82 18 82 36 C82 50 70 64 50 94 Z" fill={c} {...S} />
    <circle cx="50" cy="36" r="12" fill="#fff" {...S} />
  </>
);
const Scale: React.FC<P> = ({ c }) => (
  <>
    <line x1="50" y1="10" x2="50" y2="86" {...S} />
    <line x1="18" y1="24" x2="82" y2="24" {...S} />
    <path d="M6 56 L18 26 L30 56 Z M70 56 L82 26 L94 56 Z" fill="none" {...S} />
    <path d="M6 56 C10 68 26 68 30 56 Z M70 56 C74 68 90 68 94 56 Z" fill={c} {...S} />
    <rect x="30" y="84" width="40" height="10" fill={c} {...S} />
  </>
);
const Car: React.FC<P> = ({ c }) => (
  <>
    <path d="M10 70 L10 52 L22 30 L78 30 L90 52 L90 70 Z" fill={c} {...S} />
    <path d="M26 50 L32 36 L68 36 L74 50 Z" fill="#fff" {...S} />
    <circle cx="28" cy="72" r="10" fill="#fff" {...S} />
    <circle cx="72" cy="72" r="10" fill="#fff" {...S} />
  </>
);
const Info: React.FC<P> = ({ c }) => (
  <>
    <circle cx="50" cy="50" r="40" fill={c} {...S} />
    <circle cx="50" cy="30" r="6" fill="#fff" />
    <line x1="50" y1="46" x2="50" y2="72" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
  </>
);

const ICONS: Record<string, React.FC<P>> = {
  rocket: Rocket,
  building: Building,
  office: Building,
  flask: Flask,
  science: Flask,
  chip: Chip,
  cpu: Chip,
  moneybag: MoneyBag,
  "money-bag": MoneyBag,
  store: Store,
  shop: Store,
  flag: Flag,
  quote: Quote,
  users: Users,
  people: Users,
  bank: Bank,
  landmark: Bank,
  calendar: Calendar,
  "trending-up": ChartUp,
  chart: ChartUp,
  "trending-down": ChartDown,
  robot: Robot,
  bot: Robot,
  briefcase: Briefcase,
  factory: Factory,
  shield: Shield,
  "shield-alert": Shield,
  smartphone: Phone,
  phone: Phone,
  "phone-call": Phone,
  coins: Coins,
  coin: Coins,
  "credit-card": Coins,
  "alert-triangle": Alert,
  alert: Alert,
  "file-warning": Alert,
  megaphone: Megaphone,
  "map-pin": Pin,
  pin: Pin,
  scale: Scale,
  car: Car,
  info: Info,
};

/** 대본에 쓸 수 있는 아이콘 이름(별칭 포함). generate_script.py가 PRISM 테마에서 이 목록으로 검사한다. */
export const PRISM_ICON_NAMES = Object.keys(ICONS);

export const PrismIcon: React.FC<{ name?: string; color: string; size: number }> = ({ name, color, size }) => {
  const Comp = name ? ICONS[name] : undefined;
  if (!Comp) return null;
  return (
    <svg width={size} height={size} viewBox="-4 -4 108 108" style={{ overflow: "visible" }}>
      <Comp c={color} />
    </svg>
  );
};

export const hasPrismIcon = (name?: string): boolean => !!name && name in ICONS;
