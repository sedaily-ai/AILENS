'use client';

import { useEffect, useRef, useState } from 'react';
import {
  buildStructureAnalysis,
  CG_OH,
  REGION_OPTIONS,
  type Pillar,
  type DaeunEntry,
} from '@saju/features/fortune/lib/engine';
import {
  calculateChaeseongProfile,
  calculateWealthPaths,
  computeCurrentPeriodChaeun,
  diagnoseChaeun,
  evaluateDaeunChaeun,
} from '@saju/features/fortune/lib/engine-chaeun';
import { SajuInputPanel, type SajuCalcResult } from '@saju/features/fortune/components/SajuInputPanel';
import { SajuTable } from '@saju/features/fortune/components/SajuTable';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { useLang } from '@saju/shared/lib/LangContext';

interface CurrentSaju {
  year: number;
  month: number;
  day: number;
  gender: string;
  timeInput: string;
  region: string;
  pillars: Pillar[];
  ilgan: string;
  correctedTime?: { hour: number; minute: number };
  daeuns: DaeunEntry[];
}

const EL_BG: Record<string, string> = {
  '목': '#ECFDF5', '화': '#FEE2E2', '토': '#FEF9C3', '금': '#F5F5F5', '수': '#F3F4F6',
};
const EL_SOLID: Record<string, string> = {
  '목': '#34D399', '화': '#FD0002', '토': '#EDCE01', '금': '#EAEAEA', '수': '#000000',
};
const PATH_COLOR: Record<string, string> = {
  '재성': '#D97706', '인성': '#3182F6', '식상': '#2D7A1F', '관성': '#7C3AED', '비겁': '#C33A1F',
};

// ── 도넛 게이지 SVG 컴포넌트 ──
function DonutGauge({ score, size = 88 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(score, 0), 100);
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 70 ? '#059669' : pct >= 40 ? '#D97706' : '#DC2626';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F2F4F7" strokeWidth={10} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={20} fontWeight={800} fill={color}>
        {pct}
      </text>
    </svg>
  );
}

// ── 체크인 선택지 타입 ──
type CheckInChoice = 'invest' | 'transition' | 'flow';

function getCheckInTip(choice: CheckInChoice, diagType: string, currentRating: string): string {
  if (choice === 'invest') {
    if (currentRating === 'strong') return '지금은 재성 에너지가 활발한 구간이에요. 소액부터 실행해보되, 레버리지는 삼가세요.';
    if (currentRating === 'caution') return '수비 구간이에요. 새 투자보다 기존 포지션 점검과 현금 비중 확보가 먼저예요.';
    return '변동이 적은 중립 구간. 공부·리서치에 시간을 쓰고 다음 기회를 준비하세요.';
  }
  if (choice === 'transition') {
    if (diagType === '확장형' || diagType === '기회형') return '당신의 체질은 새로운 도전에 강해요. 다만 이번 달은 준비 기간으로 쓰고, 다음 달 움직여보세요.';
    if (diagType === '관리형') return '안정형 체질이라 큰 변화보다 조직 내 이동·역할 전환이 리스크가 적어요.';
    return '지금 구간의 에너지를 보면, 정보 수집과 네트워킹에 집중하는 게 현명해요.';
  }
  // flow
  if (currentRating === 'strong') return '좋은 흐름이에요. 크게 힘쓰지 않아도 자연스럽게 기회가 보이는 시기예요.';
  if (currentRating === 'caution') return '잠시 숨 고르는 구간이에요. 컨디션 관리와 루틴 정비에 집중하세요.';
  return '평온한 흐름이에요. 일상을 유지하면서 작은 기쁨에 투자해보세요.';
}

export default function ChaeunPage() {
  const { t, lang, localePath } = useLang();
  const [saju, setSaju] = useState<CurrentSaju | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [checkInChoice, setCheckInChoice] = useState<CheckInChoice | null>(null);
  const [expandedAct, setExpandedAct] = useState<number | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    try {
      const raw = localStorage.getItem('saju_current');
      if (raw) setSaju(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  const pillars = saju?.pillars ?? [];
  const ilgan = saju?.ilgan ?? '';
  const daeuns = saju?.daeuns ?? [];
  const year = saju?.year ?? 0;

  const structure = saju ? buildStructureAnalysis(pillars) : null;
  const chaeseong = saju ? calculateChaeseongProfile(pillars) : null;
  const wealthPaths = saju ? calculateWealthPaths(pillars) : null;
  const periodChaeun = saju && ilgan ? computeCurrentPeriodChaeun(ilgan, pillars) : null;
  const diagnosis = structure?.singangyak && chaeseong ? diagnoseChaeun(structure.singangyak, chaeseong, pillars) : null;
  const timeline = saju ? evaluateDaeunChaeun(daeuns, ilgan) : [];

  const now = new Date();
  const currentAge = year > 0 ? now.getFullYear() - year : 0;
  const currentIdx = timeline.findIndex(s => currentAge >= s.age && currentAge < s.age + 10);

  // 대운 3막 그룹핑
  const acts = (() => {
    if (timeline.length === 0) return [];
    const result: { label: string; labelEn: string; segments: typeof timeline; isCurrent: boolean }[] = [];
    const third = Math.ceil(timeline.length / 3);
    const act1 = timeline.slice(0, third);
    const act2 = timeline.slice(third, third * 2);
    const act3 = timeline.slice(third * 2);
    const act1Current = act1.some((s, i) => {
      const idx = i;
      return currentAge >= s.age && currentAge < s.age + 10;
    });
    const act2Current = act2.some((s) => currentAge >= s.age && currentAge < s.age + 10);
    const act3Current = act3.some((s) => currentAge >= s.age && currentAge < s.age + 10);
    if (act1.length) result.push({ label: '1막 · 유년~청년', labelEn: 'Act 1 · Youth', segments: act1, isCurrent: act1Current });
    if (act2.length) result.push({ label: '2막 · 중년', labelEn: 'Act 2 · Middle', segments: act2, isCurrent: act2Current });
    if (act3.length) result.push({ label: '3막 · 확장기', labelEn: 'Act 3 · Expansion', segments: act3, isCurrent: act3Current });
    return result;
  })();

  // 오늘 재운 점수 (hero용)
  const todayScore = periodChaeun?.iljin?.overall.score ?? periodChaeun?.wolun?.overall.score ?? 0;
  const todayTone = periodChaeun?.iljin?.overall.tone ?? periodChaeun?.wolun?.overall.tone ?? 'neutral';
  const todayLabel = periodChaeun?.iljin?.overall.label ?? periodChaeun?.wolun?.overall.label ?? '';

  // 현재 대운 rating
  const currentRating = currentIdx >= 0 ? timeline[currentIdx].rating : 'mixed';

  // 럭키 컬러·아이템 (일간 오행 기반)
  const luckyMap: Record<string, { color: string; colorEn: string; item: string; itemEn: string }> = {
    '목': { color: '초록', colorEn: 'Green', item: '나무 소재 액세서리', itemEn: 'Wooden accessory' },
    '화': { color: '빨강', colorEn: 'Red', item: '캔들·조명', itemEn: 'Candle / Lighting' },
    '토': { color: '노랑', colorEn: 'Yellow', item: '도자기·흙 소재', itemEn: 'Ceramic item' },
    '금': { color: '흰색', colorEn: 'White', item: '금속 반지·시계', itemEn: 'Metal ring / watch' },
    '수': { color: '검정', colorEn: 'Black', item: '수정·유리 소재', itemEn: 'Crystal / glass item' },
  };
  const ilganOh = CG_OH[ilgan] || '목';
  const lucky = luckyMap[ilganOh] || luckyMap['목'];

  const handleCalculated = (r: SajuCalcResult) => {
    setSaju({
      year: r.year, month: r.month, day: r.day, gender: r.gender,
      timeInput: r.timeInput, region: r.region,
      pillars: r.pillars, ilgan: r.ilgan,
      correctedTime: r.correctedTime, daeuns: r.daeuns,
    });
    setFormOpen(false);
    setCheckInChoice(null);
  };

  const initialForm = saju ? {
    birthdate: `${saju.year} / ${String(saju.month).padStart(2, '0')} / ${String(saju.day).padStart(2, '0')}`,
    timeInput: saju.timeInput,
    noTime: !saju.timeInput,
    gender: saju.gender as '남' | '여',
    region: saju.region,
  } : undefined;

  if (!loaded) return null;

  const total = chaeseong ? (chaeseong.totalCount || 1) : 1;
  const pyeonPct = chaeseong ? (chaeseong.pyeonJae / total) * 100 : 0;
  const jeongPct = chaeseong ? (chaeseong.jeongJae / total) * 100 : 0;

  return (
    <PageShell hanjaRight="財" hanjaLeft="富" maxWidth={720}>
      <PageHeader
        title={t('재운', 'Wealth')}
        titleAccent={t('운', 'lth')}
        sub={t('사주 기반 재물 흐름 분석', 'Saju-based wealth flow analysis')}
      />

      <div className="max-w-[480px] lg:max-w-[1080px] mx-auto px-3 sm:px-[14px] pt-4 pb-10">

        {/* 입력 폼 (saju 없을 때) */}
        {!saju && (
          <>
            <p className="mb-4 text-center text-[13px] text-gray-500 dark:text-gray-300 leading-relaxed">
              {lang === 'en' ? (
                <>Enter birth info to see your wealth flow.</>
              ) : (
                <>생년월일을 입력하면 재운 흐름을 분석해드려요.</>
              )}
            </p>
            <SajuInputPanel initial={initialForm} onCalculated={handleCalculated} submitLabel={t('재운 흐름 보기', 'See Wealth Flow')} trackEventName="chaeun_calculate" />
          </>
        )}

        {saju && formOpen && (
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="w-full mb-3 py-2.5 text-[13px] text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 transition-colors border-none cursor-pointer"
            >
              {t('취소', 'Cancel')}
            </button>
            <SajuInputPanel initial={initialForm} onCalculated={handleCalculated} submitLabel={t('재운 흐름 보기', 'See Wealth Flow')} trackEventName="chaeun_calculate" />
          </>
        )}

        {saju && !formOpen && chaeseong && (<>

        {/* ═══════════════════════════════════════════
            프로필 카드
        ═══════════════════════════════════════════ */}
        <div className="bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 rounded-[16px] p-4 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px] font-bold shrink-0"
              style={{ background: EL_BG[CG_OH[ilgan] || ''] || '#F2F4F7', color: EL_SOLID[CG_OH[ilgan] || ''] || '#6B7684' }}
            >
              {ilgan || '—'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-gray-900 truncate">
                {lang === 'en'
                  ? `${saju.year}-${String(saju.month).padStart(2, '0')}-${String(saju.day).padStart(2, '0')}`
                  : `${saju.year}년 ${saju.month}월 ${saju.day}일`}
                {saju.timeInput && ` ${saju.timeInput}`}
              </div>
              <div className="text-[11px] text-gray-400 truncate">
                {saju.gender === '남' ? t('남', 'Male') : saju.gender === '여' ? t('여', 'Female') : ''}
                {saju.region && ` · ${REGION_OPTIONS.find(r => r.value === saju.region)?.label || ''}`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="shrink-0 border-none rounded-lg cursor-pointer px-3 py-1.5 text-[12px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              {t('다시 입력', 'Re-enter')}
            </button>
          </div>
        </div>

        {/* 사주 팔자 — 테두리 없이 바로 노출 */}
        <SajuTable pillars={pillars} ilgan={ilgan} />

        {/* 재물 유형 한 줄 요약 */}
        {diagnosis && (
          <div className="mt-6 mb-4 text-center">
            <div className="text-[10.5px] font-bold tracking-[0.12em] text-gray-400 dark:text-gray-500 uppercase mb-1">
              {t('나의 재물유형', 'My Wealth Type')}
            </div>
            <div className="text-[18px] font-extrabold text-gray-900 dark:text-gray-100 leading-[1.3] tracking-[-0.01em]">
              {diagnosis.headline}
            </div>
            <div className="mt-1.5 inline-flex items-center px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900">
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                {diagnosis.type}
              </span>
            </div>
            {diagnosis.strengths.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                {diagnosis.strengths.slice(0, 3).map((s, i) => {
                  const keyword = s.split(/[,·—]/)[0].trim().slice(0, 14);
                  const colors = [
                    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
                    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
                    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
                  ];
                  return (
                    <span key={i} className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10.5px] font-semibold border ${colors[i % colors.length]}`}>
                      #{keyword}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            ④ 돈맥 지도 — 이미지 참고 레이아웃
        ═══════════════════════════════════════════ */}
        {wealthPaths && (() => {
          const maxStr = Math.max(...wealthPaths.paths.map(p => p.strength), 1);
          const dom = wealthPaths.dominant;
          const weakest = wealthPaths.paths[wealthPaths.paths.length - 1];
          return (
            <>
              <div className="mb-3 mt-2">
                <div className="text-[15px] font-bold text-amber-700 dark:text-amber-400 tracking-wide">
                  {t('돈맥 지도', 'Money Flow Map')}
                </div>
              </div>

              {/* 요약 2칸 — 가장 강한 흐름 / 지금은 주의 */}
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <div className="rounded-[14px] bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-3.5">
                  <div className="text-[11px] font-semibold text-green-700 dark:text-green-400 mb-1">{t('가장 강한 흐름', 'Strongest flow')}</div>
                  <div className="text-[15px] font-extrabold text-green-900 dark:text-green-100 mb-0.5">{dom.label}</div>
                  <div className="text-[12.5px] text-green-700 dark:text-green-400 leading-snug">{dom.desc.split('(')[0].trim().slice(0, 20)}</div>
                </div>
                <div className="rounded-[14px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3.5">
                  <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1">{t('지금은 주의', 'Watch out')}</div>
                  <div className="text-[15px] font-extrabold text-amber-900 dark:text-amber-100 mb-0.5">{weakest.label}</div>
                  <div className="text-[12.5px] text-amber-700 dark:text-amber-400 leading-snug">{t('큰 지출·투자는 신중히', 'Be careful with big spending')}</div>
                </div>
              </div>

              {/* 토글 카드 — 막대그래프 */}
              <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('moneymap')}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
                >
                  <span className="text-[15px] font-bold text-gray-500 dark:text-gray-400 tracking-wide">
                    {t('돈맥 상세 분석', 'Flow Detail')}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['moneymap'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {openSections['moneymap'] && (
                  <div className="px-5 pb-5 space-y-4">
                    {wealthPaths.paths.map((p) => {
                      const barPct = maxStr > 0 ? (p.strength / maxStr) * 100 : 0;
                      return (
                        <div key={p.key}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{p.key} · {p.label}</span>
                            <span className="text-[13px] font-bold text-gray-700 dark:text-gray-300 tabular-nums">{p.strength}</span>
                          </div>
                          <div className="h-[6px] rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: '#3182F6' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          );
        })()}

        {/* ═══════════════════════════════════════════
            ④-b 돈을 버는 방식 — attitude (토글)
        ═══════════════════════════════════════════ */}
        {diagnosis && diagnosis.attitude.length > 0 && (
          <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('attitude')}
              className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
            >
              <div className="flex-1 min-w-0">
                <span className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wide">
                  {t('돈을 버는 방식', 'How You Earn')}
                </span>
                {!openSections['attitude'] && (
                  <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 leading-snug truncate italic">
                    {t('당신에게 맞는 수익 창출 스타일', 'Your natural earning style')}
                  </p>
                )}
              </div>
              <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['attitude'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openSections['attitude'] && (
              <div className="px-5 pb-5">
                <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
                  {diagnosis.attitudeProse}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            ④-c 투자 성향 — investmentStyle (토글)
        ═══════════════════════════════════════════ */}
        {diagnosis && diagnosis.investmentStyle.length > 0 && (
          <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('invest')}
              className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
            >
              <div className="flex-1 min-w-0">
                <span className="text-[15px] font-bold text-indigo-600 dark:text-indigo-400 tracking-wide">
                  {t('투자 성향', 'Investment Style')}
                </span>
                {!openSections['invest'] && (
                  <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 leading-snug truncate italic">
                    {t('사주가 말해주는 투자 체질', 'Your Saju-based investment profile')}
                  </p>
                )}
              </div>
              <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['invest'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openSections['invest'] && (
              <div className="px-5 pb-5">
                <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
                  {diagnosis.investmentProse}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            ④-d 재물 축적 능력 — strengths + cautions (토글)
        ═══════════════════════════════════════════ */}
        {diagnosis && (diagnosis.strengths.length > 0 || diagnosis.cautions.length > 0) && (
          <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('accumulate')}
              className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
            >
              <div className="flex-1 min-w-0">
                <span className="text-[15px] font-bold text-purple-600 dark:text-purple-400 tracking-wide">
                  {t('재물 축적 능력', 'Wealth Accumulation')}
                </span>
                {!openSections['accumulate'] && (
                  <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 leading-snug truncate italic">
                    {t('강점과 주의점으로 보는 축적 역량', 'Strengths & cautions for building wealth')}
                  </p>
                )}
              </div>
              <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['accumulate'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openSections['accumulate'] && (
              <div className="px-5 pb-5">
                <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
                  {diagnosis.accumulationProse}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════
            ⑤ 인생 재물 3막 — 각 막을 개별 카드로 분리
        ═══════════════════════════════════════════ */}
        {acts.length > 0 && (<>
          <div className="mb-3 mt-2">
            <div className="text-[15px] font-bold text-teal-600 dark:text-teal-400 tracking-wide">
              {t('인생 재물 3막', 'Wealth in 3 Acts')}
            </div>
            <div className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1">
              {t('대운 흐름을 3개 시기로 나눠 봤어요', 'Your major cycles grouped into 3 life phases')}
            </div>
          </div>

          {acts.map((act, actIdx) => {
            const isOpen = expandedAct === actIdx;
            const ratingColor = (r: string) =>
              r === 'strong' ? '#2D7A1F' : r === 'caution' ? '#C33A1F' : '#64748B';

            return (
              <div key={actIdx} className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedAct(isOpen ? null : actIdx)}
                  className={`w-full flex items-center justify-between px-5 py-4 cursor-pointer border-none text-left transition-colors ${
                    act.isCurrent ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-gray-900 dark:text-gray-100">
                      {t(act.label, act.labelEn)}
                    </span>
                    {act.isCurrent && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-600 text-white">
                        {t('지금 여기', 'NOW')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12.5px] text-gray-400 dark:text-gray-500">
                      {act.segments[0]?.age}~{act.segments[act.segments.length - 1]?.age + 9}{t('세', '')}
                    </span>
                    <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-2">
                    {act.segments.map((seg, segIdx) => {
                      const isCurrent = currentAge >= seg.age && currentAge < seg.age + 10;
                      return (
                        <div
                          key={segIdx}
                          className={`rounded-lg p-3 border ${
                            isCurrent ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[14px] font-extrabold">{seg.ganji}</span>
                            <span className="text-[10px] text-gray-400 font-mono">{seg.ganjiHanja}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white ml-auto"
                              style={{ background: ratingColor(seg.rating) }}>
                              {seg.theme}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                                {t('현재', 'Now')}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 mb-1">
                            {lang === 'en' ? `Age ${seg.age}–${seg.age + 9}` : `${seg.age}세~${seg.age + 9}세`}
                          </div>
                          {seg.note && <p className="text-[11px] text-gray-600 leading-relaxed">{seg.note}</p>}
                          {seg.actions && seg.actions.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {seg.actions.slice(0, 2).map((a, ai) => (
                                <li key={ai} className="text-[10px] text-gray-500 pl-2 relative leading-relaxed">
                                  <span className="absolute left-0 top-[5px] w-1 h-1 rounded-full bg-gray-400" />
                                  {a}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>)}

        {/* ═══════════════════════════════════════════
            ⑥ 이번 주 돈 처방전 — 토글
        ═══════════════════════════════════════════ */}
        {diagnosis && (
          <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('moneyRx')}
              className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
            >
              <div className="flex-1 min-w-0">
                <span className="text-[15px] font-bold text-rose-600 dark:text-rose-400 tracking-wide">
                  {t('이번 주 돈 처방전', "This Week's Money Rx")}
                </span>
              </div>
              <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['moneyRx'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {openSections['moneyRx'] && (
              <div className="px-5 pb-5">
                {/* 해야 할 것 */}
                <div className="space-y-2 mb-3">
                  {diagnosis.strengths.slice(0, 2).map((item, i) => (
                    <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
                      <input type="checkbox" className="mt-0.5 w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 accent-amber-600" />
                      <span className="text-[14px] text-gray-700 dark:text-gray-200 leading-relaxed group-has-[:checked]:text-gray-400 group-has-[:checked]:line-through transition-colors">
                        {item}
                      </span>
                    </label>
                  ))}
                </div>

                {/* 하지 말아야 할 것 */}
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                  {diagnosis.avoid.slice(0, 1).map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="mt-0.5 w-4 h-4 rounded border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 flex items-center justify-center text-[10px] text-red-500 font-bold shrink-0">✕</span>
                      <span className="text-[14px] text-red-600 dark:text-red-400 leading-relaxed line-through decoration-red-300">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}



        {/* ═══════════════════════════════════════════
            푸터 — 럭키 컬러/아이템 한 줄
        ═══════════════════════════════════════════ */}
        <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] p-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2" style={{
              borderColor: EL_SOLID[ilganOh] || '#D97706',
              background: EL_BG[ilganOh] || '#FEF9C3',
            }} />
            <div>
              <span className="text-[13px] font-bold text-gray-700 dark:text-gray-200">
                {t('럭키 컬러', 'Lucky Color')}: {t(lucky.color, lucky.colorEn)}
              </span>
              <span className="text-[13px] text-gray-400 dark:text-gray-500 ml-2">
                {t('아이템', 'Item')}: {t(lucky.item, lucky.itemEn)}
              </span>
            </div>
          </div>
        </div>
        </>)}
      </div>

      {/* === 채팅 CTA 배너 === */}
      <div className="relative z-10 px-3 mb-4">
        <a
          href={localePath('/chat')}
          className="group flex items-center gap-4 rounded-2xl p-4 no-underline transition-transform active:scale-[0.99]"
          style={{ background: '#E8F8F0' }}
        >
          <span
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: '#86D4B5', color: '#1B5B45' }}
          >
            💬
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-bold leading-tight tracking-tight" style={{ color: '#1A1A1A' }}>
              {t('더 궁금한 게 있나요?', 'Want to know more?')}
            </p>
            <p className="text-[12.5px] mt-1" style={{ color: '#4F4F58' }}>
              {t('채팅하러 가기', 'Chat with Saju AI')}
            </p>
          </div>
          <span className="text-[20px] shrink-0 group-hover:translate-x-0.5 transition-transform" style={{ color: '#A0A0A8' }} aria-hidden>›</span>
        </a>
      </div>

      <BottomNav />
    </PageShell>
  );
}
