'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';
import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU, SERIF } from '@saju/shared/ui/sajuTokens';

// ── 토정비결 괘 데이터 (간소화된 클라이언트 계산) ──

interface MonthFortune {
  month: number;
  category: '대길' | '길' | '보통' | '소흉' | '흉';
  summaryKo: string;
  summaryEn: string;
}

interface TojeongResult {
  yearSummaryKo: string;
  yearSummaryEn: string;
  wealthKo: string;
  wealthEn: string;
  healthKo: string;
  healthEn: string;
  relationKo: string;
  relationEn: string;
  cautionKo: string;
  cautionEn: string;
  months: MonthFortune[];
}

// 간소화된 토정비결 생성 (날짜 seed 기반)
function generateTojeong(year: number, month: number, day: number): TojeongResult {
  const seed = year * 10000 + month * 100 + day;
  const h = (n: number) => ((seed * 2654435761 + n * 40503) >>> 0) % 100;

  const YEAR_SUMMARIES_KO = [
    '올해는 새로운 시작의 기운이 강합니다. 변화를 두려워하지 마세요.',
    '안정적인 흐름 속에서 내실을 다지는 해입니다. 기초를 튼튼히 하세요.',
    '인복이 터지는 해입니다. 주변 사람들과의 관계에서 행운이 옵니다.',
    '재물운이 상승하는 해입니다. 투자보다 저축에 집중하면 좋습니다.',
    '배움과 성장의 해입니다. 새로운 공부를 시작하면 크게 발전합니다.',
    '큰 결실을 맺는 해입니다. 지금까지의 노력이 열매를 맺습니다.',
    '쉬어가는 것도 전략인 해입니다. 무리하지 않으면 자연히 풀립니다.',
    '변화의 물결이 일어나는 해입니다. 유연하게 대처하면 기회가 됩니다.',
  ];
  const YEAR_SUMMARIES_EN = [
    'This year carries strong energy for new beginnings. Don\'t fear change.',
    'A year for building solid foundations within a stable flow.',
    'A year blessed with good people. Luck comes through relationships.',
    'Financial fortune rises. Focus on saving rather than investing.',
    'A year of learning and growth. Starting new studies leads to great progress.',
    'A year of harvest. Your past efforts bear fruit.',
    'Resting is also strategy this year. Don\'t push too hard.',
    'Waves of change are rising. Flexibility turns challenges into opportunities.',
  ];

  const WEALTH_KO = [
    '상반기에 예상치 못한 수입이 생기고, 하반기에는 지출 관리가 중요합니다.',
    '꾸준한 수입 흐름이 유지됩니다. 큰 투자보다 소소한 저축이 길합니다.',
    '재물이 들어오는 길이 넓어집니다. 부업이나 새 수입원을 고려해보세요.',
    '돈이 들어오는 만큼 나가기 쉬운 해입니다. 절제가 필요합니다.',
  ];
  const WEALTH_EN = [
    'Unexpected income in the first half; expense management matters in the second.',
    'Steady income flow maintained. Small savings beat big investments.',
    'Channels for wealth expand. Consider side income or new revenue.',
    'Money flows in and out easily. Restraint is needed.',
  ];

  const HEALTH_KO = [
    '전반적으로 건강합니다. 규칙적인 생활을 유지하면 활력이 넘칩니다.',
    '과로에 주의하세요. 충분한 수면과 가벼운 운동이 면역력을 높여줍니다.',
    '소화기관에 신경 쓰세요. 식습관 개선이 전체 컨디션을 좌우합니다.',
    '정신 건강에 집중하는 해입니다. 스트레스 관리와 명상이 도움됩니다.',
  ];
  const HEALTH_EN = [
    'Generally healthy. Maintaining routine brings vitality.',
    'Watch for overwork. Sleep and light exercise boost immunity.',
    'Pay attention to digestion. Diet improvement affects overall condition.',
    'Focus on mental health. Stress management and meditation help.',
  ];

  const RELATION_KO = [
    '귀인이 나타나는 해입니다. 새로운 만남에 적극적으로 나서세요.',
    '가족 간의 유대가 깊어집니다. 가까운 사람에게 마음을 표현하세요.',
    '직장·사회 관계에서 인정받는 해입니다. 소통에 힘쓰세요.',
    '오래된 인연이 다시 이어집니다. 과거의 인맥을 소중히 하세요.',
  ];
  const RELATION_EN = [
    'A benefactor appears. Be proactive in new encounters.',
    'Family bonds deepen. Express your heart to those close.',
    'Recognition in work and social circles. Focus on communication.',
    'Old connections reconnect. Cherish past relationships.',
  ];

  const CAUTION_KO = [
    '급한 결정은 삼가세요. 충분히 고민한 뒤 움직이면 실수를 줄일 수 있습니다.',
    '보증이나 큰 금전 거래는 피하세요. 신중함이 재산을 지켜줍니다.',
    '말조심이 필요한 해입니다. 가벼운 한마디가 큰 오해를 부를 수 있습니다.',
    '건강 검진을 미루지 마세요. 작은 증상도 조기에 확인하는 것이 중요합니다.',
  ];
  const CAUTION_EN = [
    'Avoid hasty decisions. Thinking thoroughly reduces mistakes.',
    'Avoid guarantees or large financial transactions. Caution protects assets.',
    'Watch your words. A casual remark can cause big misunderstandings.',
    'Don\'t postpone health checkups. Early detection of small symptoms matters.',
  ];

  const categories: MonthFortune['category'][] = ['대길', '길', '보통', '소흉', '흉'];
  const MONTH_MESSAGES_KO = [
    '새해 기운을 받아 활기차게 시작하는 달입니다.',
    '꾸준히 노력하면 성과가 보이기 시작합니다.',
    '인간관계에서 좋은 소식이 들립니다.',
    '재물 흐름이 좋아지는 시기입니다.',
    '건강에 주의하고 무리하지 마세요.',
    '상반기 결산의 시기. 정리하고 다음을 준비하세요.',
    '새로운 기회가 문을 두드립니다.',
    '안정적인 흐름 속에서 내실을 다지세요.',
    '변화의 바람이 불지만 긍정적입니다.',
    '수확의 달입니다. 노력의 결실을 거둡니다.',
    '마무리를 잘 하면 연말이 빛납니다.',
    '한 해를 되돌아보고 내년을 설계하세요.',
  ];
  const MONTH_MESSAGES_EN = [
    'A month to start with fresh energy of the new year.',
    'Steady effort begins to show results.',
    'Good news comes from relationships.',
    'Financial flow improves during this period.',
    'Take care of health and don\'t overdo it.',
    'Time to wrap up the first half. Organize and prepare.',
    'New opportunities knock on your door.',
    'Build substance within a stable flow.',
    'Winds of change blow, but positively.',
    'A month of harvest. Reap the fruits of effort.',
    'A good finish makes the year-end shine.',
    'Reflect on the year and plan for next.',
  ];

  const months: MonthFortune[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    category: categories[h(i + 1) % 5],
    summaryKo: MONTH_MESSAGES_KO[i],
    summaryEn: MONTH_MESSAGES_EN[i],
  }));

  return {
    yearSummaryKo: YEAR_SUMMARIES_KO[h(0) % YEAR_SUMMARIES_KO.length],
    yearSummaryEn: YEAR_SUMMARIES_EN[h(0) % YEAR_SUMMARIES_EN.length],
    wealthKo: WEALTH_KO[h(1) % WEALTH_KO.length],
    wealthEn: WEALTH_EN[h(1) % WEALTH_EN.length],
    healthKo: HEALTH_KO[h(2) % HEALTH_KO.length],
    healthEn: HEALTH_EN[h(2) % HEALTH_EN.length],
    relationKo: RELATION_KO[h(3) % RELATION_KO.length],
    relationEn: RELATION_EN[h(3) % RELATION_EN.length],
    cautionKo: CAUTION_KO[h(4) % CAUTION_KO.length],
    cautionEn: CAUTION_EN[h(4) % CAUTION_EN.length],
    months,
  };
}

const CATEGORY_COLOR: Record<string, { bg: string; fg: string }> = {
  '대길': { bg: '#D1FAE5', fg: '#059669' },
  '길': { bg: '#ECFDF5', fg: '#34D399' },
  '보통': { bg: '#F3F4F6', fg: '#6B7280' },
  '소흉': { bg: '#FEF3C7', fg: '#D97706' },
  '흉': { bg: '#FEE2E2', fg: '#DC2626' },
};

export default function TojeongPage() {
  const { t } = useLang();
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [result, setResult] = useState<TojeongResult | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  const handleSubmit = () => {
    const y = parseInt(year);
    const m = parseInt(month);
    const d = parseInt(day);
    if (!y || !m || !d || y < 1920 || y > 2025 || m < 1 || m > 12 || d < 1 || d > 31) return;
    setResult(generateTojeong(y, m, d));
  };

  const currentYear = new Date().getFullYear();

  return (
    <PageShell hanjaRight="卜" hanjaLeft="占">
      <PageHeader
        title={t('토정비결', 'Tojeong Bigyeol')}
        titleAccent={t('비결', 'Bigyeol')}
        sub={t(
          `${currentYear}년 나의 신수 — 월별 운세를 한눈에`,
          `Your ${currentYear} fortune — monthly outlook at a glance`,
        )}
      />

      <div className="relative z-10 px-3 mt-3">
        {/* 입력 폼 */}
        {!result && (
          <div className="rounded-[24px] bg-white p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} strokeWidth={2.2} style={{ color: '#059669' }} />
              <p className="text-[14px] font-bold" style={{ color: SAJU.ink }}>
                {t('생년월일을 입력하세요 (양력)', 'Enter your birth date (solar)')}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: SAJU.inkSub }}>
                  {t('년', 'Year')}
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  placeholder="1990"
                  className="w-full rounded-xl px-3 py-2.5 text-[14px] outline-none"
                  style={{ background: '#F7F5F2', color: SAJU.ink }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: SAJU.inkSub }}>
                  {t('월', 'Month')}
                </label>
                <input
                  type="number"
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  placeholder="6"
                  min={1}
                  max={12}
                  className="w-full rounded-xl px-3 py-2.5 text-[14px] outline-none"
                  style={{ background: '#F7F5F2', color: SAJU.ink }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1" style={{ color: SAJU.inkSub }}>
                  {t('일', 'Day')}
                </label>
                <input
                  type="number"
                  value={day}
                  onChange={e => setDay(e.target.value)}
                  placeholder="15"
                  min={1}
                  max={31}
                  className="w-full rounded-xl px-3 py-2.5 text-[14px] outline-none"
                  style={{ background: '#F7F5F2', color: SAJU.ink }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!year || !month || !day}
              className="w-full py-3 rounded-full text-[14px] font-bold text-white transition-all hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #059669 0%, #34D399 100%)' }}
            >
              {t('토정비결 보기', 'See My Tojeong Fortune')}
            </button>
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div className="space-y-4">
            {/* 다시 보기 버튼 */}
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-[12.5px] font-semibold px-3 py-1.5 rounded-full transition-colors"
              style={{ color: SAJU.inkSub, background: '#F3F4F6' }}
            >
              ← {t('다시 입력', 'Re-enter')}
            </button>

            {/* 총운 카드 */}
            <div className="rounded-[24px] bg-white p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} strokeWidth={2.2} style={{ color: '#059669' }} />
                <h3 className="text-[16px] font-black" style={{ color: SAJU.ink, fontFamily: SERIF }}>
                  {t(`${currentYear}년 총운`, `${currentYear} Overall Fortune`)}
                </h3>
              </div>
              <p className="text-[14px] leading-relaxed" style={{ color: SAJU.inkSoft }}>
                {t(result.yearSummaryKo, result.yearSummaryEn)}
              </p>
            </div>

            {/* 주제별 카드들 */}
            <div className="grid grid-cols-2 gap-3">
              <TopicCard
                title={t('재물운', 'Wealth')}
                emoji="💰"
                text={t(result.wealthKo, result.wealthEn)}
                bg="#ECFDF5"
              />
              <TopicCard
                title={t('건강운', 'Health')}
                emoji="💪"
                text={t(result.healthKo, result.healthEn)}
                bg="#EFF6FF"
              />
              <TopicCard
                title={t('대인관계', 'Relations')}
                emoji="🤝"
                text={t(result.relationKo, result.relationEn)}
                bg="#FEF3C7"
              />
              <TopicCard
                title={t('주의사항', 'Caution')}
                emoji="⚠️"
                text={t(result.cautionKo, result.cautionEn)}
                bg="#FEE2E2"
              />
            </div>

            {/* 월별 운세 */}
            <div className="rounded-[24px] bg-white p-5" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 className="text-[16px] font-black mb-4" style={{ color: SAJU.ink, fontFamily: SERIF }}>
                {t('월별 운세', 'Monthly Fortune')}
              </h3>
              <div className="space-y-2">
                {result.months.map(m => {
                  const cat = CATEGORY_COLOR[m.category];
                  const isOpen = expandedMonth === m.month;
                  return (
                    <button
                      key={m.month}
                      type="button"
                      onClick={() => setExpandedMonth(isOpen ? null : m.month)}
                      className="w-full text-left rounded-2xl p-3.5 transition-all hover:bg-gray-50"
                      style={{ background: isOpen ? cat.bg : undefined }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-[13px] font-black tabular-nums" style={{ color: SAJU.ink }}>
                            {m.month}{t('월', '')}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                            style={{ background: cat.bg, color: cat.fg }}
                          >
                            {m.category}
                          </span>
                        </div>
                        {isOpen
                          ? <ChevronUp size={16} style={{ color: SAJU.inkSub }} />
                          : <ChevronDown size={16} style={{ color: SAJU.inkSub }} />
                        }
                      </div>
                      {isOpen && (
                        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: SAJU.inkSoft }}>
                          {t(m.summaryKo, m.summaryEn)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomNav active="saju" />
    </PageShell>
  );
}

function TopicCard({ title, emoji, text, bg }: { title: string; emoji: string; text: string; bg: string }) {
  return (
    <div className="rounded-[18px] p-4" style={{ background: bg }}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[16px]">{emoji}</span>
        <h4 className="text-[13px] font-black" style={{ color: SAJU.ink }}>{title}</h4>
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: SAJU.inkSoft }}>
        {text}
      </p>
    </div>
  );
}
