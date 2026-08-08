import { useState, useEffect } from 'react';
import { isBeforeLichun, getSajuMonth } from '@fullstackfamily/manseryeok';
import { CG_OH, JJ_OH, OH_HJ, JJG, sipsung, unsung, buildStructureAnalysis, detectDayHapChung, evaluateForYongsin, generateDailyInsights, type Pillar, type ChongunResult, type TodayFortuneResult, type DaeunEntry, type YeonunEntry, type WolunEntry, type YongsinRating } from '@/entities/saju';
import { OHAENG_SETS, V3_TOKENS, type Ohaeng } from '../lib/ohaeng';
import { SajuTable } from './SajuTable';
import { DailyCalendar } from './DailyCalendar';
import { SajuStoryReveal } from './SajuStoryReveal';
import type { VoiceContext } from '../lib/personaVoice';
import type { OhaengKey } from './OhaengBars';

type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

const EL_COLORS: Record<string, string> = {
  '목': 'text-green-600', '화': 'text-red-500', '토': 'text-yellow-600',
  '금': 'text-gray-500', '수': 'text-blue-600',
};

// SajuExplore 의 카드 id 와 1:1 매핑되는 결과 섹션 id.
// 'compatibility' 는 별도 /saju-match 라우트로 보내므로 여기엔 포함하지 않음.
type SajuFocus = 'manse' | 'today' | 'chongun' | 'category' | 'daeun' | 'calendar';

interface Props {
  data: {
    pillars: Pillar[]; ilgan: string;
    year: number; month: number; day: number; gender: string;
    chongun: ChongunResult | null; todayFortune: TodayFortuneResult | null;
    daeuns: DaeunEntry[]; yeonuns: YeonunEntry[]; woluns: WolunEntry[];
    correctedTime?: { hour: number; minute: number };
  };
  mbtiGroup?: MbtiGroup;
  onMbtiChange?: (group: MbtiGroup) => void;
  focusSection?: SajuFocus | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="bg-white border border-gray-100 rounded-[16px] p-5 md:p-6 mb-4"
      style={{ boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' }}
    >
      <h3 className="text-[15px] font-extrabold text-gray-900 mb-3 tracking-tight">{title}</h3>
      <div className="text-[14px] text-gray-700 leading-[1.75]">{children}</div>
    </div>
  );
}

/** 접힘 가능한 섹션 (기본 접힘) */
function CollapsibleSection({ title, subtitle, children, defaultOpen = false }: {
  title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="bg-white border border-gray-100 rounded-[16px] mb-4 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' }}
    >
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 md:px-6 py-4 hover:bg-gray-50/60 transition-colors">
        <div className="text-left">
          <h3 className="text-[15px] font-extrabold text-gray-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-[12px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <svg
          className={`text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-5 md:px-6 pb-5 md:pb-6 text-[14px] text-gray-700 leading-[1.75] border-t border-gray-50 pt-5">
          {children}
        </div>
      )}
    </div>
  );
}

// 일반 사용자용 십성 풀이 (한 줄 설명)
const SS_MEANING: Record<string, string> = {
  '비견': '동료·경쟁자 기운',
  '겁재': '경쟁·지출 기운',
  '식신': '표현·여유 기운',
  '상관': '재능·비판 기운',
  '편재': '활동적 재물 기운',
  '정재': '성실한 재물 기운',
  '편관': '압박·도전 기운',
  '정관': '명예·규율 기운',
  '편인': '직관·영감 기운',
  '정인': '학문·지혜 기운',
};

// 12운성 한 줄 풀이
const US_MEANING: Record<string, string> = {
  '장생': '새로운 시작',
  '목욕': '불안정한 변화',
  '관대': '자신감·성장',
  '건록': '전성기 시작',
  '제왕': '에너지의 정점',
  '쇠': '기운이 쇠약해짐',
  '병': '쇠약한 상태',
  '사': '정체와 막힘',
  '묘': '내면의 회고',
  '절': '단절과 전환',
  '태': '잉태와 준비',
  '양': '조용한 성장',
};

const SS_DETAIL: Record<string, string> = {
  '비견': '나와 같은 기운이 작용합니다. 동료, 형제와의 관계가 부각되고 자립심이 강해집니다. 경쟁 속에서 성장하되 독선을 경계하세요.',
  '겁재': '경쟁과 도전의 기운입니다. 재물 지출에 주의하고 승부욕을 긍정적으로 활용하세요. 공동 사업보다 단독 판단이 유리합니다.',
  '식신': '여유와 창의력의 시기입니다. 먹을 복이 있고 취미가 잘 풀리며 표현력이 좋아집니다. 안정적인 수입과 건강이 따릅니다.',
  '상관': '표현욕과 재능이 폭발하는 시기입니다. 예술, 글쓰기에 좋으나 날카로운 말로 갈등이 생길 수 있으니 언행에 주의하세요.',
  '편재': '활동적 재물운과 사교의 시기입니다. 사업 기회가 오고 인맥이 넓어지지만 과욕을 부리면 손실이 생깁니다.',
  '정재': '안정적인 재물 축적의 시기입니다. 성실한 노력이 결실을 맺고, 가정 경제가 안정됩니다. 저축과 재테크에 유리합니다.',
  '편관': '변화와 도전의 시기입니다. 갑작스러운 업무나 책임이 주어지지만, 잘 넘기면 큰 성장으로 이어집니다. 건강 관리 필요.',
  '정관': '질서와 인정의 시기입니다. 사회적 지위가 올라가고 공식적인 성과가 나타납니다. 규칙을 지키면 좋은 결과가 옵니다.',
  '편인': '직관과 영감의 시기입니다. 학문이나 연구에 몰입하기 좋고 새로운 시각이 열립니다. 다만 고독감이나 건강 이상에 주의.',
  '정인': '학습과 성장의 시기입니다. 자격증, 학위 등 배움의 결실이 맺어지고 윗사람의 도움이 있습니다. 내적 성숙의 시간.',
};

const US_DETAIL: Record<string, string> = {
  '장생': '새로운 출발의 에너지입니다. 시작한 일이 순조롭게 성장하며 희망적인 기운이 감돕니다.',
  '목욕': '변화와 불안정의 시기입니다. 감정 기복이 심하고 유혹이 많으니 신중하게 행동하세요.',
  '관대': '자신감과 사회 활동이 최고조입니다. 적극적으로 나서면 인정받고 기회를 잡을 수 있습니다.',
  '건록': '실력이 완전히 발휘되는 시기입니다. 독립적으로 일을 추진하면 큰 성과를 거둡니다.',
  '제왕': '모든 기운이 정점에 달합니다. 리더십을 발휘하기 좋으나 정점 이후 하락에 대비하세요.',
  '쇠': '기운이 서서히 빠지는 시기입니다. 새로운 일보다 기존 일을 정리하고 체력을 관리하세요.',
  '병': '쇠약함의 시기입니다. 건강 관리에 집중하고 무리한 계획은 피하세요. 휴식이 최선입니다.',
  '사': '정체와 막힘의 시기입니다. 억지로 밀어붙이면 손해가 커지니 때를 기다리세요.',
  '묘': '내면을 돌아보는 시기입니다. 과거를 정리하고 다음을 준비하는 잠복기로 활용하세요.',
  '절': '단절과 전환의 시기입니다. 낡은 것을 과감히 버리고 새 방향을 모색하세요.',
  '태': '새로운 가능성이 잉태되는 시기입니다. 눈에 보이지 않지만 씨앗이 뿌려지고 있습니다.',
  '양': '성장을 준비하는 시기입니다. 조용하지만 확실한 발전이 이루어지고 있습니다.',
};

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
      elements.push(<h5 key={i} className="text-[13px] font-bold text-gray-700 mt-3 mb-1.5">{parseBold(trimmed.slice(4).trim())}</h5>);
    }
    // ## 제목
    else if (trimmed.startsWith('## ')) {
      elements.push(<h4 key={i} className="text-[14px] font-bold text-gray-800 mt-4 mb-2">{parseBold(trimmed.slice(3).trim())}</h4>);
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

type CacheData = Record<MbtiGroup, string>;

interface CategoryToneBuckets {
  default?: string[];
  favor?: string[];
  caution?: string[];
}

interface TodayPartsCache {
  ss: Record<MbtiGroup, Record<string, string>>;
  us: Record<MbtiGroup, Record<string, string>>;
  // 카테고리는 톤 버킷 구조 또는 기존 array/string (하위 호환)
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

// 십성 → 오늘 흐름이 두드러지는 주 영역 매핑
// (정인일인데 재물운만 주의 뜨는 '맥락 단절' 문제를 줄이기 위해 상단에 요약 노출)
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

type UnVariant = 'daeun' | 'yeonun' | 'wolun';

interface UnCol { c: string; j: string; ck: string; jk: string; label: string }

function UnCard({ title, subtitle, cols, ilgan, activeCheck, variant, yongsinOh }: {
  title: string;
  subtitle?: string;
  cols: UnCol[];
  ilgan: string;
  activeCheck?: (col: UnCol) => boolean;
  variant: UnVariant;
  yongsinOh?: string;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const periodName = variant === 'daeun' ? '10년' : variant === 'yeonun' ? '1년' : '1개월';

  // 스크린샷 규격: 대운 넓게, 연운 중간, 월운 좁게
  const tileWidth = variant === 'daeun' ? 62 : variant === 'yeonun' ? 58 : 52;
  const charFont = variant === 'wolun' ? 14 : 16;
  const showSipsung = variant !== 'wolun'; // 월운은 하단 십성 생략 (스크린샷 기준)

  return (
    <div
      className="bg-white border border-gray-100 rounded-[16px] p-5 mb-4"
      style={{ boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' }}
    >
      <div className="text-[15px] font-extrabold text-gray-900 tracking-tight">{title}</div>
      {subtitle && <div className="text-[11px] text-gray-400 mt-0.5 mb-3">{subtitle}</div>}
      {!subtitle && <div className="mb-3" />}

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-2 min-w-max pb-1">
          {cols.map((col, i) => {
            const isActive = activeCheck ? activeCheck(col) : false;
            const isOpen = expandedIdx === i;
            const cgOh = (CG_OH[col.c] || '금') as Ohaeng;
            const jjOh = (JJ_OH[col.j] || '금') as Ohaeng;
            const cgSS = ilgan ? sipsung(ilgan, col.c) : '';
            const yEval = yongsinOh ? evaluateForYongsin(col.c, col.j, yongsinOh) : null;
            const rateColor: Record<YongsinRating, string> = {
              favor: '#2D7A1F', neutral: V3_TOKENS.line, caution: '#C33A1F',
            };
            const edgeColor = isActive || isOpen
              ? V3_TOKENS.accent
              : yEval && yEval.rating !== 'neutral'
                ? rateColor[yEval.rating]
                : V3_TOKENS.line;

            return (
              <button
                key={i}
                type="button"
                onClick={() => setExpandedIdx(isOpen ? null : i)}
                className="flex flex-col items-center rounded-[14px] cursor-pointer text-center flex-shrink-0"
                style={{
                  width: tileWidth,
                  padding: variant === 'wolun' ? '6px 4px' : '10px 6px',
                  background: isOpen ? '#F3F7FF' : V3_TOKENS.panel,
                  color: V3_TOKENS.ink,
                  border: `2px solid ${edgeColor}`,
                  transition: 'all .15s',
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.7 }}>{col.label}</div>
                <div
                  className="w-full my-1"
                  style={{
                    color: OHAENG_SETS.default[cgOh].text,
                    fontSize: charFont, fontWeight: 800, padding: '3px 0',
                  }}
                >
                  {col.c}
                </div>
                <div
                  className="w-full"
                  style={{
                    color: OHAENG_SETS.default[jjOh].text,
                    fontSize: charFont, fontWeight: 800, padding: '3px 0',
                  }}
                >
                  {col.j}
                </div>
                {showSipsung && cgSS && (
                  <div style={{ fontSize: 9, opacity: 0.7, marginTop: 3 }}>{cgSS}</div>
                )}
                {yEval && yEval.rating !== 'neutral' && (
                  <div
                    style={{
                      fontSize: 9, fontWeight: 700, marginTop: 2,
                      color: yEval.rating === 'favor' ? '#2D7A1F' : '#C33A1F',
                    }}
                  >
                    {yEval.rating === 'favor' ? '용신↑' : '용신↓'}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {expandedIdx !== null && (() => {
        const col = cols[expandedIdx];
        const cgOh = (CG_OH[col.c] || '금') as Ohaeng;
        const jjOh = (JJ_OH[col.j] || '금') as Ohaeng;
        const cgSS = ilgan ? sipsung(ilgan, col.c) : '';
        const us = ilgan ? unsung(ilgan, col.j) : '';
        const hidden = (col.j && JJG[col.j]) || [];
        const hiddenItems = hidden.map((h, i) => {
          const weight = hidden.length === 1 ? '본기' : hidden.length === 2 ? (i === 0 ? '여기' : '본기') : (i === 0 ? '여기' : i === 1 ? '중기' : '본기');
          return { hanja: h, ss: sipsung(ilgan, h), weight };
        });
        return (
          <div className="mt-3 p-3.5 rounded-xl text-[12px] text-gray-600 leading-relaxed" style={{ background: V3_TOKENS.panel }}>
            <div className="font-semibold text-gray-800 mb-2">
              {col.label}
              <span className="text-[11px] text-gray-400 ml-1.5">({periodName} 기간)</span>
              <span className="ml-2">
                <span style={{ color: OHAENG_SETS.default[cgOh].text }}>{col.ck}{col.c}</span>{' '}
                <span style={{ color: OHAENG_SETS.default[jjOh].text }}>{col.jk}{col.j}</span>
              </span>
            </div>
            {cgSS && (
              <p className="mb-2">
                <span className="font-medium text-gray-700">천간 십성 · {cgSS}</span>
                <span className="text-[11px] text-gray-400 ml-1">({SS_MEANING[cgSS] || ''})</span>
                <br />{SS_DETAIL[cgSS] || ''}
              </p>
            )}
            {us && (
              <p className="mb-2">
                <span className="font-medium text-gray-700">12운성 · {us}</span>
                <span className="text-[11px] text-gray-400 ml-1">({US_MEANING[us] || ''})</span>
                <br />{US_DETAIL[us] || ''}
              </p>
            )}
            {hiddenItems.length > 0 && (
              <div className="border-t border-gray-200 pt-2 mt-2">
                <div className="text-[11px] text-gray-500 mb-1">지지({col.j}) 속 숨은 기운:</div>
                <div className="flex flex-wrap gap-1">
                  {hiddenItems.map((h, i) => (
                    <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded border ${h.weight === '본기' ? 'border-gray-400 bg-white font-medium' : 'border-gray-200 text-gray-500'}`}>
                      <span className="text-gray-400">{h.weight}</span>{' '}
                      <span>{h.hanja}</span>{' '}
                      <span className="text-gray-600">{h.ss}</span>
                      <span className="text-gray-400 ml-0.5">· {SS_MEANING[h.ss] || ''}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {variant === 'wolun' && yongsinOh && (() => {
              const y = evaluateForYongsin(col.c, col.j, yongsinOh);
              if (y.rating === 'neutral') return null;
              return (
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <span className={y.rating === 'favor' ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                    {y.rating === 'favor' ? '✓ 용신 작용' : '! 기신 작용'}
                  </span>
                  <span className="text-gray-500 ml-1.5">{y.reason}</span>
                </div>
              );
            })()}
          </div>
        );
      })()}
    </div>
  );
}

export function FortuneResult({ data, mbtiGroup, onMbtiChange, focusSection }: Props) {
  const { pillars, ilgan, year, month, day, gender, chongun, todayFortune, daeuns, yeonuns, woluns, correctedTime } = data;
  const oh = CG_OH[ilgan] || '';
  const now = new Date();
  const currentAge = now.getFullYear() - year;
  // 사주 연도/월은 절기 기준: 입춘 전이면 전년도, 월주는 절기 기반 사주월
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  const sajuYear = isBeforeLichun(currentMonth, currentDay) ? now.getFullYear() - 1 : now.getFullYear();
  // calcWolun은 각 달력 월 15일 기준이라 사주월 N(인월=1)이 label "N+1월"과 매칭됨
  // (예: 입춘 후~경칩 전 = 사주월 1 = 인월 = 캘린더 2월 15일 월주)
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
    fetch('/saju-cache/chongun.json')
      .then(r => r.ok ? r.json() : null)
      .then(all => { if (all && all[key]) setChongunCache(all[key]); })
      .catch(() => setChongunCache(null));
  }, [ilgan, pillars]);

  // 오늘의 운세 파트별 리라이팅 JSON (한번만 로드)
  useEffect(() => {
    fetch('/saju-cache/today-parts.json')
      .then(r => r.ok ? r.json() : null)
      .then(d => setTodayParts(d))
      .catch(() => setTodayParts(null));
  }, []);

  const structure = buildStructureAnalysis(pillars);
  const dayHapChung = todayFortune?.dayPillarHanja ? detectDayHapChung(pillars, todayFortune.dayPillarHanja) : [];
  const dailyInsights = generateDailyInsights(pillars, structure, todayFortune);
  const categoryNoteMap: Record<string, { note: string; tone: string }[]> = {};
  for (const n of dailyInsights.categoryNotes) {
    if (!categoryNoteMap[n.category]) categoryNoteMap[n.category] = [];
    categoryNoteMap[n.category].push({ note: n.note, tone: n.tone });
  }

  const chongunText = mbtiGroup && chongunCache?.[mbtiGroup] ? chongunCache[mbtiGroup] : null;
  const ssReadingText = mbtiGroup && todayParts?.ss?.[mbtiGroup]?.[todayFortune?.ss || ''] || todayFortune?.ssReading || '';
  const usReadingText = mbtiGroup && todayParts?.us?.[mbtiGroup]?.[todayFortune?.us || ''] || todayFortune?.usReading || '';
  // 날짜 기반 variant 선택 — 같은 날엔 같은 variant, 날이 바뀌면 다른 variant
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const getCategoryDesc = (catLabel: string, ss: string, fallback: string) => {
    const entry = mbtiGroup ? todayParts?.category?.[catLabel]?.[mbtiGroup]?.[ss] : undefined;
    if (!entry) return fallback;
    if (typeof entry === 'string') return entry;
    if (Array.isArray(entry)) {
      if (entry.length === 0) return fallback;
      return entry[dayOfYear % entry.length];
    }
    // 톤 버킷 구조: 오늘 12운성에 따라 favor/caution/default 선택
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

  // ── VoiceContext 빌드 (페르소나 풀이 컨테이너에 전달) ──
  const strengthLevel = structure?.singangyak?.level || '중화';
  const strength: 'strong' | 'weak' | 'balanced' =
    strengthLevel === '극신강' || strengthLevel === '신강'
      ? 'strong'
      : strengthLevel === '극신약' || strengthLevel === '신약'
        ? 'weak'
        : 'balanced';

  const monthForSeason = month;
  const seasonHint =
    monthForSeason >= 3 && monthForSeason <= 5
      ? '봄'
      : monthForSeason >= 6 && monthForSeason <= 8
        ? '여름'
        : monthForSeason >= 9 && monthForSeason <= 11
          ? '가을'
          : '겨울';

  const voiceCtx: VoiceContext = {
    ilgan: ilgan || '—',
    ilganHanja: pillars[1].ck || '—',
    ilganElement: oh || '—',
    seasonHint,
    strength,
    gyeokguk: structure?.gyeokguk?.name || '',
    yongsin: structure?.yongsin?.primary || '',
    todayPillar: todayFortune?.dayPillar || '—',
    todaySipsung: todayFortune?.ss || '—',
    todayUnsung: todayFortune?.us || '—',
    seed: `${year}${month}${day}-${now.toISOString().slice(0, 10)}`,
  };

  const ohaengCounts: Record<OhaengKey, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  if (structure?.distribution?.counts) {
    for (const k of ['목', '화', '토', '금', '수'] as const) {
      ohaengCounts[k] = structure.distribution.counts[k] || 0;
    }
  } else {
    // fallback: pillars에서 직접 카운트
    pillars.forEach((p) => {
      if (p.co && p.co in ohaengCounts) ohaengCounts[p.co as OhaengKey] += 1;
      if (p.jo && p.jo in ohaengCounts) ohaengCounts[p.jo as OhaengKey] += 1;
    });
  }

  // focusSection 이 있으면 해당 섹션만 렌더 (잘게 쪼개진 진입).
  // null 이면 전체 (MY SAJU CTA 경유).
  const showAll = !focusSection;
  const show = (s: SajuFocus) => showAll || focusSection === s;

  return (
    <div className="mt-8">
      {/* ── 페르소나 사주꾼과의 만남 (메인 인터랙션) ── */}
      {show('chongun') && mbtiGroup && (
        <div id="saju-section-chongun" className="mb-8 scroll-mt-20">
          <SajuStoryReveal
            group={mbtiGroup}
            onChangeGroup={onMbtiChange}
            context={voiceCtx}
            ohaengCounts={ohaengCounts}
          />
        </div>
      )}

      {show('manse') && (<>
      {/* "전체 사주 상세" 접힘 영역 제거 — 풀이 안에 핵심 다 포함됨.
          단 사주표·일진 달력은 정통 데이터로 가치 유지. id anchor만 두고 인라인. */}
      <div id="saju-section-manse" className="scroll-mt-20" />
      <div id="saju-table" />
      <SajuTable pillars={pillars} ilgan={ilgan} />

      {/* 일간 + 진태양시 */}
      <div
        className="bg-white rounded-[16px] mb-3 border border-gray-100"
        style={{ padding: '16px 18px', boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' }}
      >
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 11, color: V3_TOKENS.sub, fontWeight: 600, marginBottom: 6 }}>
              일간
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
              {correctedTime ? '진태양시' : '양력 출생'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: V3_TOKENS.ink, letterSpacing: '0.02em' }}>
              {correctedTime
                ? `${String(correctedTime.hour).padStart(2, '0')}:${String(correctedTime.minute).padStart(2, '0')}`
                : `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`}
            </div>
            {correctedTime && (
              <div style={{ fontSize: 10, color: V3_TOKENS.sub, marginTop: 2 }}>
                경도 보정 적용
              </div>
            )}
          </div>
        </div>
      </div>
      </>)}

      {/* TODAY */}
      {show('today') && (<>
      <div id="saju-section-today" className="scroll-mt-20" />
      {todayFortune && (
        <div
          className="rounded-[16px] mb-4 relative overflow-hidden"
          style={{
            background: '#F4F7FB',
            padding: '20px 22px',
          }}
        >
          <div className="relative">
            <div
              style={{
                fontSize: 11, color: '#6B7684', fontWeight: 700,
                letterSpacing: '0.1em', marginBottom: 10,
              }}
            >
              TODAY
            </div>
            <div
              className="mb-4"
              style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.7, letterSpacing: '-0.01em', color: '#191F28' }}
            >
              오늘은 <b>{todayFortune.dayPillar}</b>일이에요.
              {ilganPhrase && <> 당신의 <b>{ilganPhrase}</b>에게</>} 오늘은{' '}
              <b>{SS_FLOW[todayFortune.ss] || todayFortune.ss}</b>의 날, 그리고{' '}
              <b>{US_FLOW[todayFortune.us] || todayFortune.us}</b>의 하루랍니다.
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: '일진', v: todayFortune.dayPillar },
                { k: '십성', v: todayFortune.ss },
                { k: '운성', v: todayFortune.us },
              ].map((x, i) => (
                <div
                  key={i}
                  className="rounded-xl"
                  style={{ background: '#ffffff', padding: '10px 12px' }}
                >
                  <div style={{ fontSize: 10, color: '#6B7684', marginBottom: 3, fontWeight: 600 }}>{x.k}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#191F28' }}>{x.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* [섹션 1] 오늘의 운세 — 설명 */}
      {todayFortune && (
        <Section title="오늘의 운세">
          <p className="mb-3">
            오늘은 <strong className={EL_COLORS[todayFortune.dayOh]}>{todayFortune.dayPillar}({todayFortune.dayPillarHanja})</strong>일입니다.
            나의 일간 기준 <strong>{todayFortune.ss}</strong>
            <span className="text-[11px] text-gray-400">({SS_MEANING[todayFortune.ss]})</span>의 날이며,
            12운성은 <strong>{todayFortune.us}</strong>
            <span className="text-[11px] text-gray-400">({US_MEANING[todayFortune.us]})</span>입니다.
          </p>
          {ssReadingText && <p className="mb-3">{ssReadingText}</p>}
          <p className={todayFortune.sinsal.length ? 'mb-3' : ''}>
            12운성 <strong>{todayFortune.us}</strong>
            <span className="text-[11px] text-gray-400 ml-1">— {US_MEANING[todayFortune.us]}</span>
            <br />{usReadingText}
          </p>

          {/* 원국 결핍 오행 ↔ 오늘 일진 지장간 보충 분석 */}
          {dailyInsights.complements.length > 0 && (
            <div className="border-t border-gray-100 pt-3 mb-3">
              <div className="text-[11px] font-semibold text-gray-600 mb-1.5">원국 부족 기운 보충</div>
              <div className="space-y-1.5">
                {dailyInsights.complements.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span className={`inline-block shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-blue-300 bg-blue-50 ${EL_COLORS[c.lackingOh] || 'text-blue-700'}`}>
                      {c.lackingOh} 보충
                    </span>
                    <span className="text-gray-600 leading-snug">{c.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 일진 ↔ 원국 합충: 오늘 기운과 내 사주의 상호작용 */}
          {dayHapChung.length > 0 && (
            <div className="border-t border-gray-100 pt-3 mb-3">
              <div className="text-[11px] font-semibold text-gray-600 mb-1.5">오늘 기운과 내 사주의 만남</div>
              <div className="space-y-2">
                {dayHapChung.map((hc, i) => {
                  const boxCls = hc.good === true
                    ? 'border-green-200 bg-green-50'
                    : hc.good === false
                      ? 'border-red-200 bg-red-50'
                      : 'border-gray-200 bg-gray-50';
                  const badgeCls = hc.good === true
                    ? 'border-green-300 text-green-700 bg-white'
                    : hc.good === false
                      ? 'border-red-300 text-red-700 bg-white'
                      : 'border-gray-300 text-gray-600 bg-white';
                  const label = hc.type === '충' ? '충돌' : hc.type === '삼합' ? '삼합' : '친화';
                  return (
                    <div key={i} className={`p-2.5 rounded-lg border ${boxCls}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badgeCls}`}>
                          {label} · {hc.with}
                        </span>
                        <span className="text-[11px] text-gray-400">{hc.chars}</span>
                      </div>
                      <div className="text-[12px] font-semibold text-gray-800 mb-0.5">{hc.headline}</div>
                      <p className="text-[11px] text-gray-600 leading-snug">{hc.meaning}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {todayFortune.sinsal.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              {todayFortune.sinsal.map((s, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1.5 border ${s.good === true ? 'text-green-600 border-green-200' : s.good === false ? 'text-red-500 border-red-200' : 'text-yellow-600 border-yellow-200'}`}>
                    {s.name}
                  </span>
                  <span className="text-[12px] text-gray-500">{s.desc}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* [섹션 2] 지지 속 숨은 기운 */}
      {todayFortune && todayFortune.hiddenSipsung && todayFortune.hiddenSipsung.length > 0 && (
        <div
          className="bg-white border border-gray-100 rounded-[16px] p-5 md:p-6 mb-4"
          style={{ boxShadow: '0 1px 3px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' }}
        >
          <h3 className="text-[15px] font-extrabold text-gray-900 tracking-tight">지지 속 숨은 기운</h3>
          <div className="text-[11px] text-gray-400 mt-0.5 mb-4">
            지지 {todayFortune.dayPillarHanja[1]} · 지장간
          </div>
          <p className="text-[12px] text-gray-500 leading-relaxed mb-4">
            천간({todayFortune.dayPillarHanja[0]})뿐 아니라 지지({todayFortune.dayPillarHanja[1]}) 안에도 숨은 기운이 있어요.
          </p>
          <div className="space-y-4">
            {todayFortune.hiddenSipsung.map((h, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="shrink-0 w-7 rounded-md bg-gray-100 py-1.5 text-center text-[11px] font-semibold text-gray-500"
                  style={{ lineHeight: 1.25 }}
                >
                  {h.weight.split('').map((c, idx) => <div key={idx}>{c}</div>)}
                </div>
                <div className={`shrink-0 w-7 text-center text-[24px] font-bold ${EL_COLORS[CG_OH[h.hanja] || ''] || 'text-gray-800'}`}>
                  {h.hanja}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-blue-600 mb-0.5">{h.ss}</div>
                  <div className="text-[12px] text-gray-500 leading-snug">{SS_MEANING[h.ss] || ''}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-5 leading-relaxed">
            <span className="font-semibold text-gray-500">본기</span>가 가장 강하고 <span className="font-semibold text-gray-500">여기</span>는 약한 보조 기운입니다.
          </p>
        </div>
      )}
      </>)}

      {/* [섹션 3] 분야별 운세 */}
      {show('category') && (<>
      <div id="saju-section-category" className="scroll-mt-20" />
      {todayFortune && todayFortune.categories && todayFortune.categories.length > 0 && (
        <Section title="분야별 운세">
          {/* 십성 → 주 영역 테마 요약 (정인일 = 학업 등 맥락 연결) */}
          {(() => {
            const domain = SS_DOMAIN_MAP[todayFortune.ss];
            if (!domain) return null;
            return (
              <div
                className="rounded-[10px] mb-4"
                style={{
                  padding: '10px 14px',
                  background: '#EFF4FF',
                  borderLeft: '3px solid #3B82F6',
                }}
              >
                <div style={{ fontSize: 11, color: '#3B82F6', fontWeight: 700, marginBottom: 2 }}>
                  오늘의 흐름
                </div>
                <div style={{ fontSize: 12, color: '#1E3A8A', lineHeight: 1.55 }}>
                  <b>{todayFortune.ss}({domain.primary})</b> 중심의 하루입니다. {domain.theme}이라,
                  아래 카테고리 중 <b>{domain.primary}</b> 영역이 먼저 두드러지고 나머지는 이 흐름 안에서 해석하시면 됩니다.
                </div>
              </div>
            );
          })()}
          {todayFortune.categories.map((cat, idx) => {
            const tone =
              cat.score >= 80 ? { text: '매우 유리', bg: '#2D7A1F', color: '#fff' } :
              cat.score >= 65 ? { text: '유리', bg: '#E8F5E5', color: '#2D7A1F' } :
              cat.score >= 45 ? { text: '무난', bg: '#EDE9FE', color: '#6B7280' } :
              cat.score >= 30 ? { text: '주의', bg: '#FEF3C7', color: '#92400E' } :
                                { text: '강한 주의', bg: '#C33A1F', color: '#fff' };
            return (
              <div
                key={cat.label}
                className={idx > 0 ? 'border-t border-gray-100 pt-4 mt-4' : ''}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[14px] font-bold text-gray-900">{cat.label}</span>
                  <span
                    className="inline-block rounded-full"
                    style={{
                      padding: '4px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      background: tone.bg,
                      color: tone.color,
                    }}
                  >
                    {tone.text}
                  </span>
                </div>
                <p className="text-[12px] text-gray-600 leading-relaxed">
                  {getCategoryDesc(cat.label, todayFortune.ss, cat.desc)}
                </p>
                {(() => {
                  // 카테고리 pill 톤과 매칭되는 노트만 노출
                  const notes = categoryNoteMap[cat.label] || [];
                  const visible = notes.filter(n => {
                    if (n.tone === 'positive') return cat.score >= 45;  // 무난 이상
                    if (n.tone === 'negative') return cat.score < 65;   // 무난 이하
                    return true;
                  });
                  if (visible.length === 0) return null;
                  const isMild = cat.score >= 45 && cat.score < 65; // 무난 구간
                  return (
                    <div className="mt-2.5 space-y-1.5">
                      {visible.map((n, i) => {
                        const isMildNegative = n.tone === 'negative' && isMild;
                        const nc = n.tone === 'positive'
                          ? { bg: '#E8F5E5', color: '#2D7A1F', icon: '✓' }
                          : n.tone === 'negative'
                            ? (isMildNegative
                                ? { bg: '#FEF3C7', color: '#92400E', icon: 'i' }
                                : { bg: '#FEE7E2', color: '#C33A1F', icon: '!' })
                            : { bg: '#F3F4F6', color: '#4E5968', icon: '·' };
                        const lbl = n.tone === 'positive'
                          ? '오늘 플러스'
                          : n.tone === 'negative'
                            ? (isMild ? '오늘 참고' : '오늘 주의')
                            : '오늘';
                        return (
                          <div
                            key={i}
                            className="rounded-[10px]"
                            style={{
                              padding: '10px 12px',
                              fontSize: 12,
                              background: nc.bg,
                              color: nc.color,
                              lineHeight: 1.5,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{nc.icon} {lbl}:</span> {n.note}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </Section>
      )}
      </>)}

      {/* 총운 — 오늘의 운세 다음 */}
      {show('chongun') && (<>
      {chongun && (
        <Section title="총운">
          {chongunText ? (
            <div>{renderMarkdown(chongunText)}</div>
          ) : (
            <>
              <p className="mb-3">
                <strong className={EL_COLORS[chongun.element]}>{chongun.symbol}</strong>의 기운을 타고난 <strong>{chongun.yinyang}{chongun.element}</strong> 일간입니다. {chongun.nature}
              </p>
              {chongun.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {chongun.keywords.map((kw, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] rounded-full">{kw}</span>
                  ))}
                </div>
              )}
              {chongun.season && (
                <p className="mb-3">
                  <strong>{chongun.season.name}</strong>에 태어났습니다. {chongun.season.desc} {chongun.seasonRelation}
                </p>
              )}
              {chongun.iljuReading && <p className="mb-3">{chongun.iljuReading}</p>}
            </>
          )}
        </Section>
      )}

      {/* 상세 해석 — 총운 캐시가 있으면 숨김 (캐시에 포함됨) */}
      {!chongunText && chongun?.detail && (
        <Section title="상세 해석">
          <p className="mb-3">{chongun.detail.summary}</p>
          <div className="mb-3">
            <div className="text-[12px] font-semibold text-gray-700 mb-1">표현/행동 양식</div>
            <p>{chongun.detail.behavior}</p>
          </div>
          <div className="mb-3">
            <div className="text-[12px] font-semibold text-gray-700 mb-1">대인 관계</div>
            <p>{chongun.detail.social}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[12px] font-semibold text-green-600 mb-1">강점</div>
              <ul className="list-disc list-inside text-[12px] space-y-0.5">
                {chongun.detail.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-red-400 mb-1">약점</div>
              <ul className="list-disc list-inside text-[12px] space-y-0.5">
                {chongun.detail.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
          <div className="mb-3">
            <div className="text-[12px] font-semibold text-gray-700 mb-1">개선 방안</div>
            <p>{chongun.detail.improvement}</p>
          </div>
          {chongun.detail.jobs.length > 0 && (
            <div className="mb-3">
              <div className="text-[12px] font-semibold text-gray-700 mb-1">추천 직업</div>
              <div className="space-y-1.5">
                {chongun.detail.jobs.map((j, i) => (
                  <div key={i} className="text-[12px]"><strong>{j.field}</strong> — {j.role} <span className="text-gray-400">({j.reason})</span></div>
                ))}
              </div>
            </div>
          )}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-[12px] italic text-gray-500">{chongun.detail.conclusion}</p>
          </div>
        </Section>
      )}

      {/* 일지 상세 — 총운 캐시가 있으면 숨김 */}
      {!chongunText && chongun?.iljiDetail && (
        <Section title="일지(日支) 해석">
          <p className="mb-3">{chongun.iljiDetail.summary}</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[12px] font-semibold text-green-600 mb-1">강점</div>
              <ul className="list-disc list-inside text-[12px] space-y-0.5">
                {chongun.iljiDetail.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-[12px] font-semibold text-red-400 mb-1">약점</div>
              <ul className="list-disc list-inside text-[12px] space-y-0.5">
                {chongun.iljiDetail.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
          <p className="text-[12px] italic text-gray-500">{chongun.iljiDetail.conclusion}</p>
        </Section>
      )}
      </>)}

      {/* 대운 */}
      {show('daeun') && (<>
      <div id="saju-section-daeun" className="scroll-mt-20" />
      {ilgan && daeuns.length > 0 && (
        <UnCard
          title="대운"
          subtitle="10년 주기로 보는 큰 흐름"
          variant="daeun"
          cols={daeuns.map(x => ({ ...x, label: `${x.age}세` }))}
          ilgan={ilgan}
          activeCheck={col => {
            const age = (col as unknown as DaeunEntry).age;
            return currentAge >= age && currentAge < age + 10;
          }}
        />
      )}

      {/* 연운 */}
      {ilgan && yeonuns.length > 0 && (
        <UnCard
          title="세운"
          subtitle="1년 단위로 바뀌는 그해의 흐름"
          variant="yeonun"
          cols={yeonuns.map(x => ({ ...x, label: `${x.year}` }))}
          ilgan={ilgan}
          activeCheck={col => (col as unknown as YeonunEntry).year === sajuYear}
        />
      )}

      {/* 월운 */}
      {ilgan && woluns.length > 0 && (
        <>
          <UnCard
            title="월운"
            subtitle="한 달 단위의 세부 흐름"
            variant="wolun"
            cols={woluns.map(x => ({ ...x, label: `${String(x.month).padStart(2, '0')}월` }))}
            ilgan={ilgan}
            yongsinOh={structure?.yongsin?.primary}
            activeCheck={col => (col as unknown as WolunEntry).month === wolunActiveMonth}
          />
          {structure?.yongsin && (
            <div className="-mt-3 mb-4 px-5 text-[11px] text-gray-500">
              <span className="text-green-600 font-semibold">용신↑</span> 내 필요한 기운이 강해지는 달 ·
              <span className="text-red-500 font-semibold ml-1">용신↓</span> 용신이 약해지는 달
              (용신: <strong className={EL_COLORS[structure.yongsin.primary]}>{structure.yongsin.primary}</strong>)
            </div>
          )}
        </>
      )}
      </>)}

      {/* 일진 달력 */}
      {show('calendar') && (<>
      <div id="saju-section-calendar" className="scroll-mt-20" />
      {ilgan && <DailyCalendar ilgan={ilgan} />}
      </>)}


      {/* 사주 구조 진단 — V3 디자인 */}
      {show('manse') && structure && (
        <CollapsibleSection
          title="사주 구조 진단"
          subtitle="오행 균형 · 신강/신약 · 격국 · 용신 · 관계"
          defaultOpen
        >
          {/* 오행 균형 — bar chart */}
          <div className="mb-6">
            <div className="text-[13px] font-bold text-gray-900 mb-3">오행 균형</div>
            {(() => {
              const oh = OHAENG_SETS.default;
              const entries = (['목', '화', '토', '금', '수'] as const).map(o => ({
                o,
                n: structure.distribution.counts[o],
              }));
              const maxCount = Math.max(2, ...entries.map(e => e.n));
              const maxH = 70;
              const statusLabel = (n: number) =>
                n === 0 ? '없음' : n === 1 ? '적음' : n === 2 ? '적정' : '많음';
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
              ? { bg: '#FEE7E2', text: '#C33A1F' }
              : lv === '중화'
                ? { bg: '#E8F5E5', text: '#2D7A1F' }
                : { bg: '#E8F2FF', text: '#3182F6' };
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
                <p className="text-[12px] text-gray-600 leading-relaxed mb-3">{desc}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      name: '득령',
                      ok: structure.singangyak.deukryeong,
                      okNote: '월지가 일간을 도움',
                      noNote: '절기가 일간에 돕지 않음',
                    },
                    {
                      name: '득지',
                      ok: structure.singangyak.deukji,
                      okNote: '일지가 일간의 뿌리',
                      noNote: '일지가 일간을 돕지 않음',
                    },
                    {
                      name: '득세',
                      ok: structure.singangyak.deukse >= 3,
                      okNote: `세력 ${structure.singangyak.deukse}/5 — 우호적`,
                      noNote: `세력 ${structure.singangyak.deukse}/5 — 부족`,
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
                격국 (格局)
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
              <p className="text-[12px] text-gray-600 leading-relaxed">
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
                    용신 (用神)
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
                          className="rounded-lg bg-white"
                          style={{
                            padding: '7px 14px',
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
                <p className="text-[12px] text-gray-600 leading-relaxed mt-2.5 px-1">
                  {structure.yongsin.description}
                </p>
              </div>
            );
          })()}

          {/* 지지 관계 (합·충) */}
          {structure.hapChung.length > 0 && (
            <div>
              <div className="text-[13px] font-bold text-gray-900 mb-3">지지 관계</div>
              <div className="space-y-3">
                {structure.hapChung.map((hc, i) => {
                  const isChung = hc.type === '지지충';
                  const pillBg = isChung ? '#FEE7E2' : '#E8F2FF';
                  const pillText = isChung ? '#C33A1F' : '#3182F6';
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
