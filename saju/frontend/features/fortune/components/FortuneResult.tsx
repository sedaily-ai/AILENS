import { useState, useEffect, useRef } from 'react';
import { isBeforeLichun, getSajuMonth } from '@fullstackfamily/manseryeok';
import { toPng } from 'html-to-image';
import { CG_OH, OH_HJ, buildStructureAnalysis, detectDayHapChung, generateDailyInsights, SS_MEANING, US_MEANING, type Pillar, type ChongunResult, type TodayFortuneResult, type YearlyFortuneResult, type DaeunEntry, type YeonunEntry, type WolunEntry } from '../lib/engine';
import cheonganDB from '../lib/cheongan_db.json';
import { buildDetailedFortune } from '../lib/buildDetailedFortune';
import { OHAENG_SETS, V3_TOKENS, type Ohaeng } from '../lib/ohaeng';
import { SajuTable } from './SajuTable';
import { UnFlowSection } from './UnFlowSection';

import { useLang } from '@saju/shared/lib/LangContext';
import { withBasePath } from '@saju/shared/lib/basePath';

type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

const EL_COLORS: Record<string, string> = {
  '목': 'text-emerald-400', '화': 'text-red-600', '토': 'text-yellow-500',
  '금': 'text-gray-400 dark:text-gray-300', '수': 'text-gray-900 dark:text-gray-100',
};

// 오행별 보충 배지 테두리·배경
const EL_BADGE: Record<string, string> = {
  '목': 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40',
  '화': 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40',
  '토': 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/40',
  '금': 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800',
  '수': 'border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-900',
};

interface Props {
  data: {
    pillars: Pillar[]; ilgan: string;
    year: number; month: number; day: number; gender: string;
    chongun: ChongunResult | null;
    todayFortune: TodayFortuneResult | null;
    yearlyFortune: YearlyFortuneResult | null;
    daeuns: DaeunEntry[]; yeonuns: YeonunEntry[]; woluns: WolunEntry[];
    correctedTime?: { hour: number; minute: number };
  };
  mbtiGroup?: MbtiGroup;
  onMbtiChange?: (g: MbtiGroup) => void;
  mode?: 'full' | 'today' | 'yearly';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl p-4 sm:p-5 mb-4 break-words">
      <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 mb-3">{title}</h3>
      <div className="text-[14px] text-gray-600 dark:text-gray-100 leading-relaxed">{children}</div>
    </div>
  );
}

/** 접힘 가능한 섹션 (기본 접힘) */
function CollapsibleSection({ title, subtitle, children, defaultOpen = false, titleClassName }: {
  title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean;
  titleClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-xl mb-4 overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        <div className="text-left">
          <h3 className={`text-[14px] font-bold ${titleClassName || 'text-gray-900 dark:text-gray-100'}`}>{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-400 dark:text-gray-300 mt-0.5">{subtitle}</p>}
        </div>
        <svg
          className={`text-gray-400 dark:text-gray-300 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 text-[13px] text-gray-600 dark:text-gray-100 dark:text-gray-300 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

// 일반 사용자용 십성 풀이 (한 줄 설명)
/** 마크다운 텍스트를 간단한 HTML로 변환 */
function parseBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={j}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // 빈 줄은 건너뜀 (단락 간격은 CSS mb로 처리)
    if (!trimmed) continue;
    // ### 소제목
    if (trimmed.startsWith('### ')) {
      elements.push(<h5 key={i} className="text-[13px] font-bold text-gray-700 dark:text-gray-300 mt-3 mb-1.5">{parseBold(trimmed.slice(4).trim())}</h5>);
    }
    // ## 제목
    else if (trimmed.startsWith('## ')) {
      elements.push(<h4 key={i} className="text-[14px] font-bold text-gray-800 dark:text-gray-100 mt-4 mb-2">{parseBold(trimmed.slice(3).trim())}</h4>);
    }
    // - 리스트
    else if (trimmed.startsWith('- ')) {
      elements.push(<li key={i} className="ml-4 list-disc text-[13px] mb-0.5">{parseBold(trimmed.slice(2))}</li>);
    }
    // 일반 문단
    else {
      elements.push(<p key={i} className="mb-2">{parseBold(trimmed)}</p>);
    }
  }

  return elements;
}

type CacheData = Record<MbtiGroup, string | Record<string, string>>;

interface CategoryToneBuckets {
  default?: string[];
  favor?: string[];
  caution?: string[];
}

interface TodayPartsCache {
  ss: Record<MbtiGroup, Record<string, string>>;
  us: Record<MbtiGroup, Record<string, string>>;
  category: Record<string, Record<MbtiGroup, Record<string, string | string[] | CategoryToneBuckets>>>;
}

// 12운성 → 톤 버킷 매핑
const US_TONE_BUCKET: Record<string, 'favor' | 'caution' | 'default'> = {
  '장생': 'favor', '관대': 'favor', '건록': 'favor', '제왕': 'favor', '양': 'favor', '태': 'favor',
  '쇠': 'caution', '병': 'caution', '사': 'caution', '묘': 'caution', '절': 'caution', '목욕': 'caution',
};

// TODAY 헤드라인용 자연어 수식 (십성)
const SS_FLOW: Record<string, string> = {
  '비견': '나와 나란히 선 동료 같은 비견',
  '겁재': '든든한 형제 같은 겁재',
  '식신': '여유롭게 풀어내는 식신',
  '상관': '재능이 빛나는 상관',
  '편재': '활기차게 움직이는 편재',
  '정재': '꾸준히 쌓아가는 정재',
  '편관': '도전과 압박을 주는 편관',
  '정관': '질서와 명예의 정관',
  '편인': '영감이 번뜩이는 편인',
  '정인': '학문과 지혜의 정인',
};

// 오늘의 총운세 — 비유적 한줄 요약 (십성 기반)
const SS_SUMMARY: Record<string, string> = {
  '비견': '어깨 나란히, 함께 달리는 하루',
  '겁재': '마음 놓고 기대어도 괜찮은 하루',
  '식신': '여유로운 강물처럼 흘러가는 하루',
  '상관': '재능에 날개가 돋는 하루',
  '편재': '바람처럼 활기가 도는 하루',
  '정재': '씨앗 하나가 뿌리내리는 하루',
  '편관': '파도를 헤치며 나아가는 하루',
  '정관': '세상이 가지런해지는 하루',
  '편인': '번개처럼 영감이 내리는 하루',
  '정인': '책 한 권이 마음에 쌓이는 하루',
};
const SS_SUMMARY_EN: Record<string, string> = {
  '비견': 'A day of running side by side',
  '겁재': 'A day to lean on someone steady',
  '식신': 'A day flowing like a gentle river',
  '상관': 'A day your talents take flight',
  '편재': 'A day breezing with energy',
  '정재': 'A day of quiet, rooted growth',
  '편관': 'A day of pushing through waves',
  '정관': 'A day things fall into place',
  '편인': 'A day struck by lightning insight',
  '정인': 'A day wisdom settles in the heart',
};

// 분야별 운세 — 비유적 한줄 요약 (카테고리 × 점수대)
const CAT_SUMMARY: Record<string, Record<string, string>> = {
  '재물운': { high: '지갑이 두툼해지는 흐름', mid: '물 흐르듯 드나드는 재물', low: '주머니를 꼭 쥐어야 할 때' },
  '건강운': { high: '생기가 온몸에 차오르는 날', mid: '무리하지 않으면 괜찮은 날', low: '몸이 쉬고 싶다 말하는 날' },
  '연애운': { high: '설렘이 바람에 실려오는 날', mid: '잔잔한 호수 같은 인연', low: '마음의 문을 닫아두는 날' },
  '직장운': { high: '어떤 무대든 빛나는 하루', mid: '묵묵히 쌓아가는 하루', low: '갑옷을 입고 버텨야 할 하루' },
  '학업운': { high: '스펀지처럼 빨아들이는 날', mid: '한 줄 한 줄 새겨지는 날', low: '머리가 안개 속인 날' },
};
const CAT_SUMMARY_EN: Record<string, Record<string, string>> = {
  '재물운': { high: 'Wealth flowing in like a tide', mid: 'Money ebbing and flowing gently', low: 'A day to hold your wallet tight' },
  '건강운': { high: 'Vitality blooming from within', mid: 'Steady as long as you rest well', low: 'Your body whispers: take a break' },
  '연애운': { high: 'Romance carried in on the breeze', mid: 'A calm lake of connection', low: 'A day the heart stays guarded' },
  '직장운': { high: 'Shining on any stage today', mid: 'Quietly building brick by brick', low: 'Armor up and hold the line' },
  '학업운': { high: 'Absorbing like a sponge', mid: 'Every line etching into memory', low: 'Mind lost in the fog today' },
};

// 올해 총운세 — 비유적 한줄 요약 (십성 기반)
const SS_SUMMARY_YEARLY: Record<string, string> = {
  '비견': '나란히 걷는 이가 많아지는 한 해',
  '겁재': '힘을 모아 돌파하는 한 해',
  '식신': '무르익은 과일이 떨어지듯 풍요로운 해',
  '상관': '숨겨둔 재능이 꽃피는 한 해',
  '편재': '바람을 타고 넓은 세상으로 나가는 해',
  '정재': '한 알 한 알 곳간이 차오르는 해',
  '편관': '큰 산을 하나 넘는 해',
  '정관': '왕관이 어울리기 시작하는 해',
  '편인': '직감이 나침반이 되는 해',
  '정인': '뿌리가 깊어지는 한 해',
};
const SS_SUMMARY_YEARLY_EN: Record<string, string> = {
  '비견': 'A year more companions walk beside you',
  '겁재': 'A year to gather strength and break through',
  '식신': 'A year of ripe fruit falling into your hands',
  '상관': 'A year hidden talents bloom',
  '편재': 'A year riding the wind into wider horizons',
  '정재': 'A year the storehouse fills grain by grain',
  '편관': 'A year of climbing one great mountain',
  '정관': 'A year the crown starts to fit',
  '편인': 'A year intuition becomes your compass',
  '정인': 'A year roots grow ever deeper',
};

// 올해 분야별 운세 — 비유적 한줄 요약 (카테고리 × 점수대)
const CAT_SUMMARY_YEARLY: Record<string, Record<string, string>> = {
  '재물운': { high: '곳간이 넘치는 한 해', mid: '들어오고 나가며 균형 잡히는 해', low: '허리띠를 졸라매야 할 해' },
  '건강운': { high: '몸과 마음 모두 활짝 피는 해', mid: '무리만 않으면 무탈한 해', low: '몸이 쉼표를 요구하는 해' },
  '연애운': { high: '인연의 실이 붉게 빛나는 해', mid: '잔잔히 흐르는 물 같은 인연', low: '마음의 정원을 가꾸는 해' },
  '직장운': { high: '무대가 넓어지는 해', mid: '벽돌 한 장씩 성을 쌓는 해', low: '인내가 갑옷이 되는 해' },
  '학업운': { high: '배움이 날개가 되는 해', mid: '한 겹씩 지식이 쌓이는 해', low: '안개 속을 걷는 듯한 해' },
};
const CAT_SUMMARY_YEARLY_EN: Record<string, Record<string, string>> = {
  '재물운': { high: 'A year the storehouse overflows', mid: 'Income and outgo find balance', low: 'A year to tighten the belt' },
  '건강운': { high: 'Body and mind in full bloom', mid: 'Smooth sailing if you don\'t overdo it', low: 'A year the body asks for rest' },
  '연애운': { high: 'The red thread of fate glowing bright', mid: 'A gentle stream of connection', low: 'A year to tend your inner garden' },
  '직장운': { high: 'A year the stage expands', mid: 'Building a castle brick by brick', low: 'A year patience becomes armor' },
  '학업운': { high: 'A year learning becomes wings', mid: 'Knowledge layering one coat at a time', low: 'Walking through fog all year' },
};

// YEARLY 헤드라인용 자연어 수식 (십성)
const SS_FLOW_YEARLY: Record<string, string> = {
  '비견': '자립과 경쟁 속 성장의 비견',
  '겁재': '도전과 지출을 관리하는 겁재',
  '식신': '창의와 여유가 꽃피는 식신',
  '상관': '재능이 빛을 발하는 상관',
  '편재': '활동적 재물 기운의 편재',
  '정재': '성실한 축적의 정재',
  '편관': '책임과 변화의 편관',
  '정관': '명예와 질서의 정관',
  '편인': '탐구와 영감의 편인',
  '정인': '배움과 지혜의 정인',
};

// 십성 → 오늘 흐름이 두드러지는 주 영역 매핑
const SS_DOMAIN_MAP: Record<string, { primary: string; theme: string }> = {
  '비견': { primary: '관계·활동', theme: '동료·경쟁 기운이 도는 날' },
  '겁재': { primary: '관계·지출', theme: '형제·동료 기운과 함께 지출 주의가 있는 날' },
  '식신': { primary: '학업·여가', theme: '여유롭게 풀어내는 표현의 흐름' },
  '상관': { primary: '학업·창의', theme: '재능과 표현력이 빛나는 흐름' },
  '편재': { primary: '재물', theme: '활동적으로 움직이는 재물 기운' },
  '정재': { primary: '재물', theme: '꾸준히 쌓아가는 재물 기운' },
  '편관': { primary: '직장', theme: '책임과 도전이 주어지는 흐름' },
  '정관': { primary: '직장', theme: '질서와 명예가 드러나는 흐름' },
  '편인': { primary: '학업', theme: '직관과 영감으로 배우는 흐름' },
  '정인': { primary: '학업', theme: '학문과 지혜가 무르익는 흐름' },
};

// 십성 → 올해 흐름이 두드러지는 주 영역 매핑
const SS_DOMAIN_MAP_YEARLY: Record<string, { primary: string; theme: string }> = {
  '비견': { primary: '관계·활동', theme: '동료·경쟁 기운이 도는 한 해' },
  '겁재': { primary: '관계·지출', theme: '형제·동료 기운과 함께 지출 관리가 중요한 한 해' },
  '식신': { primary: '학업·여가', theme: '여유와 창의력이 빛나는 흐름' },
  '상관': { primary: '학업·창의', theme: '재능과 표현력이 폭발하는 흐름' },
  '편재': { primary: '재물', theme: '활동적으로 움직이는 재물 기운' },
  '정재': { primary: '재물', theme: '꾸준히 쌓아가는 재물 기운' },
  '편관': { primary: '직장', theme: '책임과 도전이 주어지는 흐름' },
  '정관': { primary: '직장', theme: '질서와 명예가 빛나는 흐름' },
  '편인': { primary: '학업', theme: '직관과 영감으로 성장하는 흐름' },
  '정인': { primary: '학업', theme: '학문과 지혜가 깊어지는 흐름' },
};

// TODAY 헤드라인용 자연어 수식 (12운성)
const US_FLOW: Record<string, string> = {
  '장생': '새롭게 출발하는 장생',
  '목욕': '출렁이는 변화의 목욕',
  '관대': '자신감이 차오르는 관대',
  '건록': '실력이 꽃피는 건록',
  '제왕': '기운이 가장 차오르는 제왕',
  '쇠': '기운이 서서히 잦아드는 쇠',
  '병': '잠시 쉬어가야 할 병',
  '사': '정체를 겪는 사',
  '묘': '내면을 돌아보는 묘',
  '절': '매듭을 짓는 절',
  '태': '조용히 잉태하는 태',
  '양': '차분히 자라는 양',
};

// YEARLY 헤드라인용 자연어 수식 (12운성)
const US_FLOW_YEARLY: Record<string, string> = {
  '장생': '새 출발의 기운이 가득한 장생',
  '목욕': '변화와 탈피의 목욕',
  '관대': '자신감 넘치는 성장의 관대',
  '건록': '전성기가 시작되는 건록',
  '제왕': '절정의 에너지가 흐르는 제왕',
  '쇠': '정리와 안배가 필요한 쇠',
  '병': '쉬어가며 충전하는 병',
  '사': '내실을 다지는 사',
  '묘': '돌아보며 정리하는 묘',
  '절': '전환을 준비하는 절',
  '태': '가능성이 잉태되는 태',
  '양': '조용한 성장의 양',
};

export function FortuneResult({ data, mbtiGroup, onMbtiChange, mode = 'full' }: Props) {
  const { t, lang } = useLang();
  const { pillars, ilgan, year, month, day, gender, chongun, todayFortune, yearlyFortune, daeuns, yeonuns, woluns, correctedTime } = data;
  const oh = CG_OH[ilgan] || '';
  const now = new Date();
  const currentAge = now.getFullYear() - year;
  // 사주 연도/월은 절기 기준: 입춘 전이면 전년도, 월주는 절기 기반 사주월
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const sajuYear = isBeforeLichun(currentMonth, currentDay) ? now.getFullYear() - 1 : now.getFullYear();
  // calcWolun은 각 달력 월 15일 기준이라 사주월 N(인월=1)이 label "N+1월"과 매칭됨
  const wolunActiveMonth = (getSajuMonth(currentMonth, currentDay) % 12) + 1;

  // 캐시 JSON fetch
  const [chongunCache, setChongunCache] = useState<CacheData | null>(null);
  const [todayParts, setTodayParts] = useState<TodayPartsCache | null>(null);

  useEffect(() => {
    if (!ilgan) return;
    const ilji = pillars[1].j;
    const wolji = pillars[2].j;
    if (!ilji || !wolji) return;
    const key = `${ilgan}_${ilji}_${wolji}`;
    fetch(withBasePath(lang === 'en' ? '/saju-cache/chongun-en.json' : '/saju-cache/chongun.json'))
      .then(r => r.ok ? r.json() : null)
      .then(all => { if (all && all[key]) setChongunCache(all[key]); })
      .catch(() => setChongunCache(null));
  }, [ilgan, pillars, lang]);

  // 오늘의 운세 파트별 리라이팅 JSON (today 모드에서만 로드)
  useEffect(() => {
    if (mode !== 'today') return;
    fetch(withBasePath(lang === 'en' ? '/saju-cache/today-parts-en.json' : '/saju-cache/today-parts.json'))
      .then(r => r.ok ? r.json() : null)
      .then(d => setTodayParts(d))
      .catch(() => setTodayParts(null));
  }, [lang, mode]);

  const structure = buildStructureAnalysis(pillars);
  const dayHapChung = todayFortune?.dayPillarHanja ? detectDayHapChung(pillars, todayFortune.dayPillarHanja) : [];
  const dailyInsights = generateDailyInsights(pillars, structure, todayFortune);
  const categoryNoteMap: Record<string, { note: string; tone: string }[]> = {};
  for (const n of dailyInsights.categoryNotes) {
    if (!categoryNoteMap[n.category]) categoryNoteMap[n.category] = [];
    categoryNoteMap[n.category].push({ note: n.note, tone: n.tone });
  }

  const CATEGORY_LABEL_EN: Record<string, string> = {
    '재물운': 'Wealth', '건강운': 'Health', '연애운': 'Love',
    '직장운': 'Career', '학업운': 'Study',
  };
  const catLabel = (ko: string) => lang === 'en' ? (CATEGORY_LABEL_EN[ko] || ko) : ko;

  const chongunRaw = mbtiGroup && chongunCache?.[mbtiGroup] ? chongunCache[mbtiGroup] : null;
  const chongunText = typeof chongunRaw === 'string' ? chongunRaw : (chongunRaw as Record<string, string> | null)?.text ?? null;
  const ssReadingText = mbtiGroup && todayParts?.ss?.[mbtiGroup]?.[todayFortune?.ss || ''] || todayFortune?.ssReading || '';
  const usReadingText = mbtiGroup && todayParts?.us?.[mbtiGroup]?.[todayFortune?.us || ''] || todayFortune?.usReading || '';
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const getCategoryDesc = (catLbl: string, ss: string, fallback: string) => {
    const entry = mbtiGroup ? todayParts?.category?.[catLbl]?.[mbtiGroup]?.[ss] : undefined;
    if (!entry) return fallback;
    if (typeof entry === 'string') return entry;
    if (Array.isArray(entry)) {
      if (entry.length === 0) return fallback;
      return entry[dayOfYear % entry.length];
    }
    const us = todayFortune?.us || '';
    const bucket = US_TONE_BUCKET[us] || 'default';
    const buckets = entry as CategoryToneBuckets;
    const arr = buckets[bucket] && buckets[bucket]!.length > 0
      ? buckets[bucket]!
      : (buckets.default && buckets.default.length > 0 ? buckets.default : []);
    if (arr.length === 0) return fallback;
    return arr[dayOfYear % arr.length];
  };

  const ilganOh = (oh || '금') as Ohaeng;
  const ilganPhrase = `${pillars[1].ck || ''}${oh || ''}`;

  return (
    <div className="mt-8">
      <SajuTable pillars={pillars} ilgan={ilgan} />

      {/* 일간 + 진태양시 */}
      <div className="bg-white dark:bg-gray-900 rounded-[16px] mb-3" style={{ padding: '16px 18px' }}>
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 11, color: V3_TOKENS.sub, fontWeight: 600, marginBottom: 6 }}>
              {t('일간', 'Day Master')}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span style={{ fontSize: 18, fontWeight: 800, color: OHAENG_SETS.default[ilganOh].text }}>
                {pillars[1].ck || '—'}
              </span>
              {ilgan && (
                <span
                  style={{ fontSize: 14, fontWeight: 700, color: OHAENG_SETS.default[ilganOh].text }}
                >
                  {ilgan}
                </span>
              )}
              {oh && (
                <span style={{ fontSize: 13, fontWeight: 700, color: OHAENG_SETS.default[ilganOh].text }}>
                  · {oh}({OH_HJ[oh]})
                </span>
              )}
            </div>
          </div>
          <div style={{ width: 1, background: '#F2F4F7' }} />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 11, color: V3_TOKENS.sub, fontWeight: 600, marginBottom: 6 }}>
              {correctedTime ? t('진태양시', 'True Solar Time') : t('양력 출생', 'Solar Birth')}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: V3_TOKENS.ink, letterSpacing: '0.02em' }}>
              {correctedTime
                ? `${String(correctedTime.hour).padStart(2, '0')}:${String(correctedTime.minute).padStart(2, '0')}`
                : `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`}
            </div>
            {correctedTime && (
              <div style={{ fontSize: 10, color: V3_TOKENS.sub, marginTop: 2 }}>
                {t('경도 보정 적용', 'Longitude correction applied')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 캐릭터 카드 — 일간·진태양시 아래, 풀이스타일 위 (today/yearly 모드에서는 숨김) */}
      {mode === 'full' && <CharacterCard dayPillar={pillars[1]} ilgan={ilgan} />}

      {/* 상세 사주 해석 — 성격·운·재미 */}
      {mode === 'full' && (
        <DetailedFortuneSection
          pillars={pillars}
          ilgan={ilgan}
          chongun={chongun}
          daeuns={daeuns}
          yeonuns={yeonuns}
          woluns={woluns}
          chongunCache={chongunCache}
          mbtiGroup={mbtiGroup ?? null}
        />
      )}

      {/* ── TODAY 모드 전용 섹션 — /saju/chart 디자인시스템 적용 ── */}

      {mode === 'today' && todayFortune && (
        <div className="mt-4 mb-4 space-y-5">
          {/* ═══ 오늘의 총운세 (日) — 하나의 토글, 줄글 설명 ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-[12px] font-bold text-blue-400 dark:text-blue-500 tracking-wider">日</span>
              <h3 className="text-[16px] font-bold text-blue-700 dark:text-blue-300">
                {t('오늘의 총운세', "Today's Overall Fortune")}
              </h3>
            </div>
            <div className="space-y-2">
              <CollapsibleSection
                title={t('오늘 하루 읽기', "Reading Today")}
                subtitle={lang === 'en' ? (SS_SUMMARY_EN[todayFortune.ss] || 'Reading today\'s energy') : (SS_SUMMARY[todayFortune.ss] || '오늘 기운을 읽어드립니다')}
                titleClassName="text-blue-600 dark:text-blue-400"
                defaultOpen
              >
                {/* 줄글 설명 */}
                <div className="text-[14px] text-gray-700 dark:text-gray-300 leading-[1.85] space-y-3">
                  {ssReadingText && <p>{ssReadingText}</p>}
                  <p>
                    {t('12운성', '12 Stages')} <strong>{todayFortune.us}</strong>
                    <span className="text-[11px] text-gray-400 dark:text-gray-400 ml-1">— {US_MEANING[todayFortune.us]}</span>
                    {usReadingText && <><br />{usReadingText}</>}
                  </p>

                  {dayHapChung.length > 0 && (
                    <div className="space-y-2 pt-2">
                      {dayHapChung.map((hc, i) => {
                        const boxCls = hc.good === true
                          ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40'
                          : hc.good === false
                            ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40'
                            : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900';
                        const badgeCls = hc.good === true
                          ? 'border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 bg-white dark:bg-gray-900'
                          : hc.good === false
                            ? 'border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 bg-white dark:bg-gray-900'
                            : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900';
                        const label = hc.type === '충' ? '충돌' : hc.type === '삼합' ? '삼합' : '친화';
                        return (
                          <div key={i} className={`p-2.5 rounded-lg border ${boxCls}`}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badgeCls}`}>
                                {label} · {hc.with}
                              </span>
                              <span className="text-[11px] text-gray-400 dark:text-gray-300">{hc.chars}</span>
                            </div>
                            <div className="text-[12px] font-semibold text-gray-800 dark:text-gray-100 mb-0.5">{hc.headline}</div>
                            <p className="text-[11px] text-gray-600 dark:text-gray-200 leading-snug">{hc.meaning}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {dailyInsights.complements.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <div className="text-[12px] font-semibold text-gray-600 dark:text-gray-300 mb-1">{t('원국 부족 기운 보충', 'Supplement for Lacking Elements')}</div>
                      {dailyInsights.complements.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12px]">
                          <span className={`inline-block shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${EL_BADGE[c.lackingOh] || 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40'} ${EL_COLORS[c.lackingOh] || 'text-blue-700 dark:text-blue-300'}`}>
                            {c.lackingOh} {t('보충', 'supplement')}
                          </span>
                          <span className="text-gray-600 dark:text-gray-300 leading-snug">{c.desc}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {todayFortune.sinsal.length > 0 && (
                    <div className="pt-2">
                      {todayFortune.sinsal.map((s, i) => (
                        <div key={i} className="mb-2 last:mb-0">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1.5 border ${s.good === true ? 'text-green-600 border-green-200' : s.good === false ? 'text-red-500 border-red-200' : 'text-yellow-600 border-yellow-200'}`}>
                            {s.name}
                          </span>
                          <span className="text-[12px] text-gray-500 dark:text-gray-300">{s.desc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </div>
          </div>


          {/* 분야별 운세 — CollapsibleSection 패턴 적용 */}
          {todayFortune.categories && todayFortune.categories.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-[12px] font-bold text-teal-400 dark:text-teal-500 tracking-wider">運</span>
              <h3 className="text-[16px] font-bold text-teal-700 dark:text-teal-300">
                {t('분야별 운세', 'Fortune by Category')}
              </h3>
            </div>
            {(() => {
              const domain = SS_DOMAIN_MAP[todayFortune.ss];
              if (!domain) return null;
              return (
                <div
                  className="rounded-r-[10px] mb-3 mx-1"
                  style={{
                    padding: '10px 14px',
                    background: 'var(--accent-blue-bg)',
                    borderLeft: '3px solid var(--accent-blue-border)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--accent-blue-title)', fontWeight: 700, marginBottom: 2 }}>
                    {t('오늘의 흐름', "Today's Flow")}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--accent-blue-body)', lineHeight: 1.55 }}>
                    <b>{todayFortune.ss}({domain.primary})</b> {t('중심의 하루입니다.', 'is the focus of today.')} {domain.theme}{t('이라, ', '. ')}
                    {t('아래 카테고리 중', 'Among the categories below,')} <b>{domain.primary}</b> {t('영역이 먼저 두드러지고 나머지는 이 흐름 안에서 해석하시면 됩니다.', 'stands out first; interpret the rest within this flow.')}
                  </div>
                </div>
              );
            })()}
            <div className="space-y-2">
              {todayFortune.categories.map((cat) => {
                const tone =
                  cat.score >= 80 ? { text: t('매우 유리', 'Very Good'), bg: '#2D7A1F', color: '#fff' } :
                  cat.score >= 65 ? { text: t('유리', 'Good'), bg: 'var(--tone-positive-bg)', color: 'var(--tone-positive-fg)' } :
                  cat.score >= 45 ? { text: t('무난', 'Neutral'), bg: 'var(--tone-neutral-bg)', color: 'var(--tone-neutral-fg)' } :
                  cat.score >= 30 ? { text: t('주의', 'Caution'), bg: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)' } :
                                    { text: t('강한 주의', 'Warning'), bg: '#C33A1F', color: '#fff' };
                const notes = categoryNoteMap[cat.label] || [];
                const visible = notes.filter(n => {
                  if (n.tone === 'positive') return cat.score >= 45;
                  if (n.tone === 'negative') return cat.score < 65;
                  return true;
                });
                const isMild = cat.score >= 45 && cat.score < 65;
                return (
                  <CollapsibleSection
                    key={cat.label}
                    title={catLabel(cat.label)}
                    subtitle={(() => {
                      const tier = cat.score >= 65 ? 'high' : cat.score >= 40 ? 'mid' : 'low';
                      const summaryMap = lang === 'en' ? CAT_SUMMARY_EN : CAT_SUMMARY;
                      return summaryMap[cat.label]?.[tier] || getCategoryDesc(cat.label, todayFortune.ss, cat.desc).slice(0, 35);
                    })()}
                    titleClassName="text-teal-600 dark:text-teal-400"
                    defaultOpen={cat.score >= 65 || cat.score < 30}
                  >
                    <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
                      {getCategoryDesc(cat.label, todayFortune.ss, cat.desc)}
                    </p>
                    {visible.length > 0 && (
                      <div className="mt-2.5 space-y-1.5">
                        {visible.map((n, i) => {
                          const isMildNegative = n.tone === 'negative' && isMild;
                          const nc = n.tone === 'positive'
                            ? { bg: 'var(--tone-positive-bg)', color: 'var(--tone-positive-fg)', icon: '✓' }
                            : n.tone === 'negative'
                              ? (isMildNegative
                                  ? { bg: 'var(--tone-caution-bg)', color: 'var(--tone-caution-fg)', icon: 'i' }
                                  : { bg: 'var(--tone-negative-bg)', color: 'var(--tone-negative-fg)', icon: '!' })
                              : { bg: 'var(--tone-neutral-bg)', color: 'var(--tone-neutral-fg)', icon: '·' };
                          const lbl = n.tone === 'positive'
                            ? t('오늘 플러스', 'Today Plus')
                            : n.tone === 'negative'
                              ? (isMild ? t('오늘 참고', 'Today Note') : t('오늘 주의', 'Today Caution'))
                              : t('오늘', 'Today');
                          return (
                            <div
                              key={i}
                              className="rounded-[10px]"
                              style={{ padding: '10px 12px', fontSize: 12, background: nc.bg, color: nc.color, lineHeight: 1.5 }}
                            >
                              <span style={{ fontWeight: 600 }}>{nc.icon} {lbl}:</span> {n.note}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CollapsibleSection>
                );
              })}
            </div>
          </div>
          )}

        </div>
      )}

      {/* ── YEARLY 모드 전용 섹션 — /saju/chart 디자인시스템 적용 ── */}

      {mode === 'yearly' && yearlyFortune && (
        <div className="mt-4 mb-4 space-y-5">
          {/* ═══ 올해의 총운세 (年) — 하나의 토글, 줄글 설명 ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-[12px] font-bold text-amber-400 dark:text-amber-500 tracking-wider">年</span>
              <h3 className="text-[16px] font-bold text-amber-700 dark:text-amber-300">
                {t('올해의 총운세', "This Year's Overall Fortune")}
              </h3>
            </div>
            <div className="space-y-2">
              <CollapsibleSection
                title={t('올해 흐름 읽기', "Reading This Year")}
                subtitle={lang === 'en' ? (SS_SUMMARY_YEARLY_EN[yearlyFortune.ss] || 'Reading this year\'s energy') : (SS_SUMMARY_YEARLY[yearlyFortune.ss] || '올해 기운을 읽어드립니다')}
                titleClassName="text-amber-600 dark:text-amber-400"
                defaultOpen
              >
                {/* 줄글 설명 */}
                <div className="text-[14px] text-gray-700 dark:text-gray-300 leading-[1.85] space-y-3">
                  {yearlyFortune.ssReading && <p>{yearlyFortune.ssReading}</p>}
                  <p>
                    {t('12운성', '12 Stages')} <strong>{yearlyFortune.us}</strong>
                    <span className="text-[11px] text-gray-400 dark:text-gray-400 ml-1">— {US_MEANING[yearlyFortune.us]}</span>
                    {yearlyFortune.usReading && <><br />{yearlyFortune.usReading}</>}
                  </p>

                  {yearlyFortune.sinsal.length > 0 && (
                    <div className="pt-2">
                      {yearlyFortune.sinsal.map((s, i) => (
                        <div key={i} className="mb-2 last:mb-0">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1.5 border ${s.good === true ? 'text-green-600 border-green-200' : s.good === false ? 'text-red-500 border-red-200' : 'text-yellow-600 border-yellow-200'}`}>
                            {s.name}
                          </span>
                          <span className="text-[12px] text-gray-500 dark:text-gray-300">{s.desc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            </div>
          </div>

          {/* ═══ 분야별 운세 (運) ═══ */}
          {yearlyFortune.categories && yearlyFortune.categories.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-[12px] font-bold text-teal-400 dark:text-teal-500 tracking-wider">運</span>
              <h3 className="text-[16px] font-bold text-teal-700 dark:text-teal-300">
                {t('분야별 운세', 'Fortune by Category')}
              </h3>
            </div>
            {(() => {
              const domain = SS_DOMAIN_MAP_YEARLY[yearlyFortune.ss];
              if (!domain) return null;
              return (
                <div
                  className="rounded-r-[10px] mb-3 mx-1"
                  style={{
                    padding: '10px 14px',
                    background: 'var(--accent-blue-bg)',
                    borderLeft: '3px solid var(--accent-blue-border)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--accent-blue-title)', fontWeight: 700, marginBottom: 2 }}>
                    {t('올해의 흐름', "This Year's Flow")}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--accent-blue-body)', lineHeight: 1.55 }}>
                    <b>{yearlyFortune.ss}({domain.primary})</b> {t('중심의 한 해입니다.', 'is the focus of this year.')} {domain.theme}{t('이라, ', '. ')}
                    {t('아래 카테고리 중', 'Among the categories below,')} <b>{domain.primary}</b> {t('영역이 먼저 두드러지고 나머지는 이 흐름 안에서 해석하시면 됩니다.', 'stands out first; interpret the rest within this flow.')}
                  </div>
                </div>
              );
            })()}
            <div className="space-y-2">
              {yearlyFortune.categories.map((cat) => {
                const tier = cat.score >= 65 ? 'high' : cat.score >= 40 ? 'mid' : 'low';
                const summaryMap = lang === 'en' ? CAT_SUMMARY_YEARLY_EN : CAT_SUMMARY_YEARLY;
                return (
                  <CollapsibleSection
                    key={cat.label}
                    title={catLabel(cat.label)}
                    subtitle={summaryMap[cat.label]?.[tier] || cat.desc.slice(0, 35)}
                    titleClassName="text-teal-600 dark:text-teal-400"
                    defaultOpen={cat.score >= 65 || cat.score < 30}
                  >
                    <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed">
                      {cat.desc}
                    </p>
                  </CollapsibleSection>
                );
              })}
            </div>
          </div>
          )}

        </div>
      )}

      {/* 대운·세운·월운 — 필터 탭 + 흐름 그래프 하나로 통합 */}
      {mode === 'full' && ilgan && daeuns.length > 0 && (
        <UnFlowSection
          daeuns={daeuns}
          yeonuns={yeonuns}
          woluns={woluns}
          ilgan={ilgan}
          yongsinOh={structure?.yongsin?.primary}
          currentAge={currentAge}
          sajuYear={sajuYear}
          wolunActiveMonth={wolunActiveMonth}
          lang={lang}
        />
      )}

      {/* 사주 구조 진단 — V3 디자인 */}
      {mode === 'full' && structure && (
        <CollapsibleSection
          title={t('사주 구조 진단', 'Chart Structure Analysis')}
          subtitle={t('오행 균형 · 신강/신약 · 격국 · 용신 · 관계', 'Five Elements · Strength · Structure · Yongsin · Relations')}
          defaultOpen
        >
          {/* 오행 균형 — bar chart */}
          <div className="mb-6">
            <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 mb-3">{t('오행 균형', 'Five Elements Balance')}</div>
            {(() => {
              const oh = OHAENG_SETS.default;
              const entries = (['목', '화', '토', '금', '수'] as const).map(o => ({
                o,
                n: structure.distribution.counts[o],
              }));
              const maxCount = Math.max(2, ...entries.map(e => e.n));
              const maxH = 70;
              const statusLabel = (n: number) =>
                n === 0 ? t('없음', 'None') : n === 1 ? t('적음', 'Low') : n === 2 ? t('적정', 'Balanced') : t('많음', 'High');
              return (
                <div>
                  <div className="flex gap-2 items-end px-1" style={{ height: maxH + 18 }}>
                    {entries.map(({ o, n }) => {
                      const h = n === 0 ? 4 : Math.max(12, (n / maxCount) * maxH);
                      return (
                        <div key={o} className="flex-1 flex flex-col items-center gap-1">
                          <div style={{ fontSize: 11, fontWeight: 700, color: oh[o].text, minHeight: 14 }}>
                            {n > 0 ? n : ' '}
                          </div>
                          <div
                            className="w-full rounded-md"
                            style={{
                              height: h,
                              background: oh[o].bg,
                              border: `1px solid ${oh[o].border}`,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 px-1 mt-2">
                    {entries.map(({ o, n }) => (
                      <div key={o} className="flex-1 flex flex-col items-center gap-0.5">
                        <div style={{ fontSize: 13, fontWeight: 700, color: oh[o].text }}>{o}</div>
                        <div style={{ fontSize: 10, color: V3_TOKENS.sub }}>{statusLabel(n)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 신강/신약 */}
          {structure.singangyak && (() => {
            const lv = structure.singangyak.level;
            const label =
              lv === '극신강' ? '극신강 경향' :
              lv === '신강' ? '신강 경향' :
              lv === '중화' ? '중화' :
              lv === '신약' ? '신약 경향' : '극신약 경향';
            const toneBg = lv.includes('강')
              ? { bg: 'var(--tone-negative-bg)', text: 'var(--tone-negative-fg)' }
              : lv === '중화'
                ? { bg: 'var(--tone-positive-bg)', text: 'var(--tone-positive-fg)' }
                : { bg: 'var(--tone-info-bg)', text: 'var(--tone-info-fg)' };
            const desc =
              lv === '극신강' ? '일간이 과하게 강한 구조. 세력·인성이 모두 힘을 실어주어 조절이 필요한 형국.'
              : lv === '신강' ? '일간이 강한 편. 월지·일지·세력 중 다수가 일간을 받쳐주는 구조.'
              : lv === '중화' ? '일간의 세력과 주변 기운이 적절히 균형 잡힌 구조.'
              : lv === '신약' ? '월지와 세력이 일간을 충분히 도와주지 못하는 형국. 다만 득지 여부에 따라 극단적 약은 아닐 수 있음.'
              : '월지·일지·세력이 모두 일간을 돕지 않는 형국. 도움 기운을 적극적으로 구해야 하는 구조.';
            return (
              <div className="mb-6">
                <div className="inline-flex items-center mb-3">
                  <span
                    className="inline-block rounded-full"
                    style={{
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      background: toneBg.bg,
                      color: toneBg.text,
                    }}
                  >
                    {label}
                  </span>
                </div>
                <p className="text-[12px] text-gray-600 dark:text-gray-100 dark:text-gray-300 leading-relaxed mb-3">{desc}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      name: t('득령', 'Season'),
                      ok: structure.singangyak.deukryeong,
                      okNote: t('월지가 일간을 도움', 'Month branch supports Day Master'),
                      noNote: t('절기가 일간에 돕지 않음', 'Season does not support Day Master'),
                    },
                    {
                      name: t('득지', 'Root'),
                      ok: structure.singangyak.deukji,
                      okNote: t('일지가 일간의 뿌리', 'Day branch roots the Day Master'),
                      noNote: t('일지가 일간을 돕지 않음', 'Day branch does not support'),
                    },
                    {
                      name: t('득세', 'Support'),
                      ok: structure.singangyak.deukse >= 3,
                      okNote: t(`세력 ${structure.singangyak.deukse}/5 — 우호적`, `Power ${structure.singangyak.deukse}/5 — Favorable`),
                      noNote: t(`세력 ${structure.singangyak.deukse}/5 — 부족`, `Power ${structure.singangyak.deukse}/5 — Lacking`),
                    },
                  ].map((c, i) => (
                    <div
                      key={i}
                      className="rounded-xl text-center"
                      style={{ background: V3_TOKENS.panel, padding: '14px 10px' }}
                    >
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: c.ok ? '#2D7A1F' : '#C33A1F',
                          lineHeight: 1,
                        }}
                      >
                        {c.ok ? '○' : '×'}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: V3_TOKENS.ink,
                          marginTop: 8,
                        }}
                      >
                        {c.name}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: V3_TOKENS.sub,
                          marginTop: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        {c.ok ? c.okNote : c.noNote}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 격국 */}
          {structure.gyeokguk && (
            <div className="mb-6">
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: V3_TOKENS.accent,
                  marginBottom: 4,
                }}
              >
                {t('격국 (格局)', 'Structure (格局)')}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: V3_TOKENS.ink,
                  marginBottom: 6,
                }}
              >
                {structure.gyeokguk.name.replace(/\([^)]+\)/g, '').trim()}
              </div>
              <p className="text-[12px] text-gray-600 dark:text-gray-100 dark:text-gray-300 leading-relaxed">
                {structure.gyeokguk.description}
              </p>
            </div>
          )}

          {/* 용신 */}
          {structure.yongsin && (() => {
            const yOh = structure.yongsin.primary as Ohaeng;
            const oh = OHAENG_SETS.default;
            return (
              <div className="mb-6">
                <div
                  className="rounded-[14px]"
                  style={{ background: oh[yOh].bg, padding: '14px 16px' }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: oh[yOh].text,
                      marginBottom: 10,
                    }}
                  >
                    {t('용신 (用神)', 'Yongsin (用神)')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div
                      className="rounded-lg"
                      style={{
                        padding: '7px 14px',
                        background: oh[yOh].solid,
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {structure.yongsin.primary}(
                      <span style={{ fontSize: 11 }}>{OH_HJ[structure.yongsin.primary] || ''}</span>
                      ) · {structure.yongsin.role}
                    </div>
                    {structure.yongsin.supportElements.map(e => {
                      const sOh = e as Ohaeng;
                      return (
                        <div
                          key={e}
                          className="rounded-lg"
                          style={{
                            padding: '7px 14px',
                            background: oh[sOh].bg,
                            color: oh[sOh].text,
                            fontSize: 13,
                            fontWeight: 700,
                            border: `1px solid ${oh[sOh].border}`,
                          }}
                        >
                          보조 · {e}(
                          <span style={{ fontSize: 11 }}>{OH_HJ[e] || ''}</span>
                          ) · 비겁
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="text-[12px] text-gray-600 dark:text-gray-100 dark:text-gray-300 leading-relaxed mt-2.5 px-1">
                  {structure.yongsin.description}
                </p>
              </div>
            );
          })()}

          {/* 지지 관계 (합·충) */}
          {structure.hapChung.length > 0 && (
            <div>
              <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 mb-3">{t('지지 관계', 'Branch Relations')}</div>
              <div className="space-y-3">
                {structure.hapChung.map((hc, i) => {
                  const isChung = hc.type === '지지충';
                  const pillBg = isChung ? 'var(--tone-negative-bg)' : 'var(--tone-info-bg)';
                  const pillText = isChung ? 'var(--tone-negative-fg)' : 'var(--tone-info-fg)';
                  const shortType = hc.type === '지지충'
                    ? '충'
                    : hc.type === '지지삼합'
                      ? '삼합'
                      : hc.type === '지지육합'
                        ? '육합'
                        : '천간합';
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div style={{ width: 42, flexShrink: 0 }}>
                        <span
                          className="inline-block rounded-full text-center w-full"
                          style={{
                            padding: '4px 0',
                            fontSize: 11,
                            fontWeight: 700,
                            background: pillBg,
                            color: pillText,
                          }}
                        >
                          {shortType}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: V3_TOKENS.ink,
                            marginBottom: 3,
                          }}
                        >
                          {hc.headline}
                        </div>
                        <div style={{ fontSize: 12, color: V3_TOKENS.sub, lineHeight: 1.55 }}>
                          {hc.meaning}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}

/** 상세 사주 해석 — 성격(性) · 운(運) · 재미 콘텐츠 */
function DetailedFortuneSection({ pillars, ilgan, chongun, daeuns, yeonuns, woluns, chongunCache, mbtiGroup }: {
  pillars: Pillar[];
  ilgan: string;
  chongun: ChongunResult | null;
  daeuns: DaeunEntry[];
  yeonuns: YeonunEntry[];
  woluns: WolunEntry[];
  chongunCache: CacheData | null;
  mbtiGroup: MbtiGroup | null;
}) {
  const { t } = useLang();
  // MBTI 그룹에 해당하는 섹션별 캐시 추출
  const raw = mbtiGroup && chongunCache?.[mbtiGroup] || null;
  const cacheSections = raw && typeof raw === 'object' && ('personality' in raw || 'temperament' in raw)
    ? (raw as import('../lib/buildDetailedFortune').ChongunCacheSections)
    : null;
  const data = buildDetailedFortune(pillars, ilgan, chongun, daeuns, yeonuns, woluns, cacheSections);
  if (!data) return null;

  const { personality, fortune, fun } = data;

  return (
    <div className="mt-4 mb-4 space-y-5">
      {/* ═══ 1. 성격 (性) ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-[12px] font-bold text-indigo-400 dark:text-indigo-500 tracking-wider">性</span>
          <h3 className="text-[16px] font-bold text-indigo-700 dark:text-indigo-300">
            {t('성격', 'Personality')}
          </h3>
        </div>
        <div className="space-y-2">
          <CollapsibleSection
            title={t('타고난 기질', 'Innate Temperament')}
            subtitle={personality.temperamentSummary}
            titleClassName="text-indigo-600 dark:text-indigo-400"
            defaultOpen
          >
            <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-relaxed">
              {personality.temperament}
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            title={t('스트레스 받을 때', 'Under Stress')}
            subtitle={personality.stressPatternSummary}
            titleClassName="text-indigo-600 dark:text-indigo-400"
          >
            <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-relaxed">
              {personality.stressPattern}
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            title={t('잘 맞는 환경/역할', 'Best Fit Environment')}
            subtitle={personality.bestEnvironmentSummary}
            titleClassName="text-indigo-600 dark:text-indigo-400"
          >
            <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-relaxed">
              {personality.bestEnvironment}
            </p>
          </CollapsibleSection>
        </div>
      </div>

      {/* ═══ 2. 운 (運) ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-[12px] font-bold text-violet-400 dark:text-violet-500 tracking-wider">運</span>
          <h3 className="text-[16px] font-bold text-violet-700 dark:text-violet-300">
            {t('운', 'Fortune')}
          </h3>
        </div>
        <div className="space-y-2">
          {[
            { label: t('애정운 / 인연운', 'Love & Relationships'), text: fortune.love, summary: fortune.loveSummary },
            { label: t('재물운', 'Wealth'), text: fortune.wealth, summary: fortune.wealthSummary },
            { label: t('직업운 / 커리어', 'Career'), text: fortune.career, summary: fortune.careerSummary },
            { label: t('건강운', 'Health'), text: fortune.health, summary: fortune.healthSummary },
            { label: t('인간관계운', 'Social'), text: fortune.relationships, summary: fortune.relationshipsSummary },
          ].map((item, idx) => (
            <CollapsibleSection
              key={idx}
              title={item.label}
              subtitle={item.summary}
              titleClassName="text-violet-600 dark:text-violet-400"
            >
              <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-relaxed">
                {item.text}
              </p>
            </CollapsibleSection>
          ))}
        </div>
      </div>

      {/* ═══ 3. 재미 콘텐츠 ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-[12px] font-bold text-teal-400 dark:text-teal-500 tracking-wider">FUN</span>
          <h3 className="text-[16px] font-bold text-teal-700 dark:text-teal-300">
            {t('재미 콘텐츠', 'Fun Content')}
          </h3>
        </div>
        <div className="space-y-2">
          <CollapsibleSection
            title={t('이달의 행운 아이템', 'Lucky Items This Month')}
            subtitle={`${fun.luckyItems.color} · ${fun.luckyItems.number} · ${fun.luckyItems.item}`}
            titleClassName="text-teal-600 dark:text-teal-400"
            defaultOpen
          >
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: t('컬러', 'Color'), value: fun.luckyItems.color },
                { label: t('숫자', 'Number'), value: fun.luckyItems.number },
                { label: t('아이템', 'Item'), value: fun.luckyItems.item },
              ].map((item, i) => (
                <div key={i} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-2.5 text-center">
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold mb-1">{item.label}</div>
                  <div className="text-[13px] text-gray-800 dark:text-gray-200 font-bold leading-snug">{item.value}</div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={t('나랑 잘 맞는 사주 유형', 'Best Match Type')}
            subtitle={fun.bestMatch.slice(0, 40) + (fun.bestMatch.length > 40 ? '…' : '')}
            titleClassName="text-teal-600 dark:text-teal-400"
          >
            <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-relaxed">
              {fun.bestMatch}
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            title={t('조심해야 할 시기 / 액땜 포인트', 'Caution Period')}
            subtitle={fun.cautionPeriod.slice(0, 40) + (fun.cautionPeriod.length > 40 ? '…' : '')}
            titleClassName="text-teal-600 dark:text-teal-400"
          >
            <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-relaxed">
              {fun.cautionPeriod}
            </p>
          </CollapsibleSection>

          <CollapsibleSection
            title={t('오늘의 한 줄 조언', "Today's Advice")}
            subtitle={fun.dailyAdvice}
            titleClassName="text-teal-600 dark:text-teal-400"
            defaultOpen
          >
            <div
              className="rounded-xl p-3"
              style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)' }}
            >
              <p className="text-[14px] font-semibold text-green-800 dark:text-green-200 leading-relaxed text-center">
                {fun.dailyAdvice}
              </p>
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}

/** 오행별 캐릭터 카드 배경색 */
const OH_CARD_BG: Record<string, { gradient: string; accent: string; lightBg: string }> = {
  '목': { gradient: 'linear-gradient(145deg, #E8FFF4 0%, #F0FDF9 100%)', accent: '#059669', lightBg: '#F0FDF4' },
  '화': { gradient: 'linear-gradient(145deg, #FFF0F0 0%, #FEF2F2 100%)', accent: '#DC2626', lightBg: '#FEF2F2' },
  '토': { gradient: 'linear-gradient(145deg, #FFF9E6 0%, #FFFBEB 100%)', accent: '#A16207', lightBg: '#FFFBEB' },
  '금': { gradient: 'linear-gradient(145deg, #F5F5F5 0%, #FAFAFA 100%)', accent: '#525252', lightBg: '#F5F5F5' },
  '수': { gradient: 'linear-gradient(145deg, #EBF5FF 0%, #EFF6FF 100%)', accent: '#1D4ED8', lightBg: '#EFF6FF' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CHEONGAN_DATA = cheonganDB.CHEONGAN as Record<string, { 한글: string; 음양: string; 오행: string; 상징: string; 성향: string; 키워드: string[] }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ILGAN_DETAIL_DATA = cheonganDB.ILGAN_DETAIL as Record<string, { 강점?: string[]; 약점?: string[]; 특성_총평?: string }>;

/** 사주 캐릭터 카드 — 앞면: 캐릭터 이미지, 뒷면: 특징 (클릭으로 플립) */
function CharacterCard({ dayPillar, ilgan }: { dayPillar: Pillar; ilgan: string }) {
  const { t } = useLang();
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [hasImg, setHasImg] = useState(false);

  // 일주 갑자 ID (천간+지지 한자, e.g. "甲子")
  const gapjaId = dayPillar.c && dayPillar.j ? `${dayPillar.c}${dayPillar.j}` : '';
  const imgSrc = gapjaId ? `/saju/characters/${gapjaId}.png` : '';

  // 일간 데이터
  const stemInfo = CHEONGAN_DATA[dayPillar.c];
  const detailInfo = ILGAN_DETAIL_DATA[dayPillar.c];
  const ilganOh = stemInfo?.오행 || '금';
  const theme = OH_CARD_BG[ilganOh] || OH_CARD_BG['금'];

  // 캐릭터 이름: "갑자(甲子) · 큰 나무"
  const characterName = stemInfo
    ? `${dayPillar.ck}${dayPillar.jk}(${dayPillar.c}${dayPillar.j}) · ${stemInfo.상징.split(',')[0].trim()}`
    : gapjaId;

  // 성향 요약 (첫 문장)
  const personality = stemInfo?.성향?.split('.')[0] || '';

  // 장점/단점 (ILGAN_DETAIL에서 상위 3개)
  const strengths = (detailInfo?.강점 || []).slice(0, 3);
  const weaknesses = (detailInfo?.약점 || []).slice(0, 3);

  // 이미지 존재 여부 확인
  useEffect(() => {
    if (!imgSrc) return;
    const img = new Image();
    img.onload = () => setHasImg(true);
    img.onerror = () => setHasImg(false);
    img.src = imgSrc;
  }, [imgSrc]);

  const handleSave = async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#FFFFFF',
      });
      const link = document.createElement('a');
      link.download = `my-saju-character-${gapjaId || 'card'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('character card export failed', err);
      alert(t('이미지 저장에 실패했어요. 잠시 후 다시 시도해주세요.', 'Failed to save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#FFFFFF',
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `my-saju-character-${gapjaId}.png`, { type: 'image/png' });
      const canShare = typeof navigator !== 'undefined' && 'share' in navigator
        && 'canShare' in navigator
        && (navigator as Navigator & { canShare: (d: ShareData) => boolean }).canShare({ files: [file] });
      if (canShare) {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          files: [file],
          title: t('나의 사주 캐릭터', 'My Saju Character'),
          text: t(`나는 ${characterName}이래요!`, `I'm ${characterName}!`),
        });
      } else {
        await handleSave();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('native share failed', err);
      }
    } finally {
      setSaving(false);
    }
  };

  const cardW = 280;
  const cardH = 360;

  return (
    <div className="mb-4 flex flex-col items-center">
      {/* 제목: 카드 위에 표시 */}
      <div style={{ fontSize: 16, fontWeight: 900, color: '#1A1A1A', textAlign: 'center', lineHeight: 1.4, fontFamily: '"Noto Serif KR", serif', marginBottom: 12 }}>
        {t('당신은 ', 'You are ')}
        <span style={{ color: theme.accent }}>{characterName}</span>
        {t('입니다', '')}
      </div>

      {/* 플립 카드 컨테이너 */}
      <div
        style={{ width: cardW, height: cardH, perspective: 1000 }}
        onClick={() => setFlipped(f => !f)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setFlipped(f => !f); }}
        aria-label={t('카드를 뒤집으려면 클릭하세요', 'Click to flip the card')}
      >
        <div
          ref={cardRef}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* ===== 앞면: 캐릭터 이미지 가득 ===== */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              borderRadius: 24,
              background: theme.gradient,
              boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {hasImg ? (
              <img
                src={imgSrc}
                alt={`${gapjaId} ${t('캐릭터', 'character')}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 24 }}
              />
            ) : (
              <div style={{ fontSize: 72, lineHeight: 1, fontWeight: 700, color: theme.accent }}>
                {dayPillar.c}{dayPillar.j}
              </div>
            )}
            {/* 하단 힌트 오버레이 */}
            <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#FFFFFF', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
              {t('탭하여 특징 보기 →', 'Tap to see details →')}
            </div>
          </div>

          {/* ===== 뒷면: 특징/장단점 ===== */}
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              borderRadius: 24,
              background: '#FFFFFF',
              boxShadow: '0 2px 24px rgba(0,0,0,0.06)',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 18px',
              overflow: 'hidden',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: theme.accent, fontFamily: '"Noto Serif KR", serif' }}>
                {characterName}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, lineHeight: 1.4 }}>
                {personality}
              </div>
            </div>
            {strengths.length > 0 && (
              <div style={{ background: theme.lightBg, borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: theme.accent, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>✦</span> {t('장점', 'Strengths')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {strengths.map((item, i) => (
                    <span key={i} style={{ color: '#1F2937', fontSize: 10.5, fontWeight: 500, lineHeight: 1.4 }}>· {item}</span>
                  ))}
                </div>
              </div>
            )}
            {weaknesses.length > 0 && (
              <div style={{ background: '#FFF5F5', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>✦</span> {t('단점', 'Weaknesses')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {weaknesses.map((item, i) => (
                    <span key={i} style={{ color: '#1F2937', fontSize: 10.5, fontWeight: 500, lineHeight: 1.4 }}>· {item}</span>
                  ))}
                </div>
              </div>
            )}
            {stemInfo?.키워드 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 'auto' }}>
                {stemInfo.키워드.map((kw, i) => (
                  <span key={i} style={{ fontSize: 9.5, fontWeight: 600, color: theme.accent, background: `${theme.accent}10`, padding: '3px 8px', borderRadius: 6 }}>#{kw}</span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#B0B0B0', textAlign: 'center', marginTop: 8 }}>
              {t('← 탭하여 캐릭터 보기', '← Tap to see character')}
            </div>
          </div>
        </div>
      </div>

      {/* 저장/공유 버튼 */}
      <div className="flex gap-2 mt-3 w-[280px]">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleShare(); }}
          disabled={saving}
          className="flex-1 h-9 rounded-full text-[11.5px] font-bold transition-colors disabled:opacity-50"
          style={{ background: '#FFFFFF', color: '#1A1A1A', border: '1px solid #E5E7EB' }}
        >
          {saving ? t('생성 중…', 'Generating…') : t('공유하기', 'Share')}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleSave(); }}
          disabled={saving}
          className="flex-1 h-9 rounded-full text-[11.5px] font-bold transition-colors disabled:opacity-50"
          style={{ background: theme.accent, color: '#FFFFFF' }}
        >
          {t('이미지 저장', 'Save image')}
        </button>
      </div>
    </div>
  );
}

