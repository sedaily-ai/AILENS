'use client';

import { useEffect, useState } from 'react';
import {
  CG_OH,
  REGION_OPTIONS,
  sipsung,
  type Pillar,
  type DaeunEntry,
} from '@saju/features/fortune/lib/engine';
import {
  buildCareerPeriodNote,
  buildMonthCareerSeries,
  computeCurrentPeriodChaeun,
  deriveCareerOverall,
  type WealthPathKey,
} from '@saju/features/fortune/lib/engine-chaeun';
import { SajuInputPanel, type SajuCalcResult } from '@saju/features/fortune/components/SajuInputPanel';
import { SajuTable } from '@saju/features/fortune/components/SajuTable';
import { useLang } from '@saju/shared/lib/LangContext';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';

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

const MAIN_TABS = [
  { id: 'question', name: '오늘의 질문' },
  { id: 'feed', name: '뉴스피드' },
  { id: 'community', name: '커뮤니티' },
  { id: 'archive', name: '내 서랍' },
  { id: 'dna', name: '나의 DNA' },
  { id: 'fortune', name: '오늘의 운세' },
];

function goToMain(tab?: string) {
  window.location.href = tab ? `/?tab=${tab}` : '/';
}

function TopNav({ activeId }: { activeId?: string }) {
  return (
    <header className="sticky top-0 bg-white z-[100] border-b border-gray-100">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex items-center h-[56px] gap-6 sm:gap-10">
          <button
            type="button"
            onClick={() => goToMain()}
            className="text-[20px] font-bold text-gray-900 tracking-tight flex-shrink-0 border-none bg-transparent cursor-pointer"
          >
            AI LENS
          </button>
          <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-hide">
            {MAIN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => goToMain(t.id)}
                className={`px-2.5 lg:px-4 py-2 text-[12px] lg:text-[14px] font-medium rounded-lg transition-colors duration-200 whitespace-nowrap flex-shrink-0 ${
                  activeId === t.id
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {t.name}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

function countCareerSipsung(ilgan: string, pillars: Pillar[]): { gwan: number; sik: number; in_: number } {
  const out = { gwan: 0, sik: 0, in_: 0 };
  if (!ilgan) return out;
  for (let i = 0; i < pillars.length; i++) {
    if (i === 1) continue;
    const c = pillars[i]?.c;
    if (!c) continue;
    const ss = sipsung(ilgan, c);
    if (ss === '편관' || ss === '정관') out.gwan += 1;
    else if (ss === '식신' || ss === '상관') out.sik += 1;
    else if (ss === '편인' || ss === '정인') out.in_ += 1;
  }
  return out;
}

type CareerType = '조직형' | '전문가형' | '학문형' | '유연형';

interface AptitudeEntry { essence: string; fields: string[]; rationale: string; }

const APTITUDE_MATRIX: Record<string, Record<CareerType, AptitudeEntry>> = {
  '목': {
    '조직형': {
      essence: '체계와 성장이 만나는 장기형 커리어에서 실력이 축적돼요',
      fields: ['교육', '행정', '법조', '공공'],
      rationale: '성장의 기운(木) × 위계·체계(관성)의 조합 — 시간이 쌓일수록 커리어가 단단해지는 분야가 잘 맞아요',
    },
    '전문가형': {
      essence: '아이디어를 꾸준히 키워 다듬는 창작·기획 작업과 궁합이 좋아요',
      fields: ['기획', '마케팅', '콘텐츠', '광고'],
      rationale: '성장의 기운(木) × 창작·아웃풋(식상)의 조합 — 아이디어를 오래 다듬어 키우는 일에 잘 맞아요',
    },
    '학문형': {
      essence: '지식이 곧 성장이 되는 연구·학습 트랙에 강점이 있어요',
      fields: ['연구', '교육', '출판', '싱크탱크'],
      rationale: '성장의 기운(木) × 학습·자격(인성)의 조합 — 지식이 누적되는 분야에서 빛을 발해요',
    },
    '유연형': {
      essence: '변화와 성장을 즐기며 여러 환경을 오가는 자유형이 맞아요',
      fields: ['스타트업', '콘텐츠', '여행', '크리에이티브'],
      rationale: '목의 뻗어가는 기운은 한 곳에 묶이지 않는 자유·변화형 일과 잘 맞아요',
    },
  },
  '화': {
    '조직형': {
      essence: '빠른 확산과 리더십이 필요한 조직에서 빛을 발해요',
      fields: ['IT 대기업', '방송', '엔터 경영', '컨설팅'],
      rationale: '확산·리더십(火) × 체계(관성)의 조합 — 빠른 의사결정과 외부 대응이 중요한 조직에서 강해요',
    },
    '전문가형': {
      essence: '표현력·감각으로 실력을 증명하는 분야가 잘 맞아요',
      fields: ['IT 개발', '엔터 제작', '디자인', '방송'],
      rationale: '표현·감각(火) × 아웃풋(식상)의 조합 — 감각이 결과물로 증폭되는 창작·제작 분야에 맞아요',
    },
    '학문형': {
      essence: '직관과 통찰로 흐름을 꿰뚫는 지적 작업에 강해요',
      fields: ['과학 연구', '언론', '강의', '논평'],
      rationale: '직관·통찰(火) × 지식(인성)의 조합 — 흐름을 꿰뚫는 지적 분야에서 경쟁력이 생겨요',
    },
    '유연형': {
      essence: '즉흥과 에너지가 무기인 프로젝트·프리랜서 형태가 맞아요',
      fields: ['크리에이터', '공연', '이벤트', '1인 미디어'],
      rationale: '에너지·즉흥성(火)은 고정 조직보다 프로젝트 기반 자유형 일과 잘 맞아요',
    },
  },
  '토': {
    '조직형': {
      essence: '안정된 기반을 쌓는 공공·대기업 조직이 체질과 맞아요',
      fields: ['공공', '금융', '인프라', '의료'],
      rationale: '안정·기반(土) × 위계·체계(관성)의 조합 — 기반이 단단한 대조직에서 실력이 누적돼요',
    },
    '전문가형': {
      essence: '차곡차곡 신뢰를 쌓는 실무·현장형 일에 강점이 있어요',
      fields: ['건축', '부동산', '식품', '제조 관리'],
      rationale: '쌓임·내구성(土) × 실행 아웃풋(식상)의 조합 — 신뢰·품질이 핵심인 현장·실무 분야에 강해요',
    },
    '학문형': {
      essence: '실용 학문과 자격이 무기가 되는 전문직 트랙이 맞아요',
      fields: ['회계', '세무', '법무', '의약'],
      rationale: '실용성(土) × 자격·전문(인성)의 조합 — 객관 지표로 증명하는 전문직이 유리해요',
    },
    '유연형': {
      essence: '지역·현장 기반의 소규모 사업·자영에 유리해요',
      fields: ['중개', '프랜차이즈', '농식품', '소상공'],
      rationale: '토의 기반 기운은 대규모 조직보다 지역·현장 중심 소규모 사업과 잘 맞아요',
    },
  },
  '금': {
    '조직형': {
      essence: '원칙과 숫자로 움직이는 조직에서 인정받기 좋아요',
      fields: ['금융', '법무', '감사', '군경'],
      rationale: '원칙·결단(金) × 체계(관성)의 조합 — 숫자·규정으로 움직이는 조직에서 신뢰가 쌓여요',
    },
    '전문가형': {
      essence: '정밀함과 실행력이 빛나는 기술·품질 분야와 맞아요',
      fields: ['엔지니어링', '제조', '품질관리', '자동차'],
      rationale: '정밀함(金) × 실행력(식상)의 조합 — 정확도·품질이 곧 평가 기준인 기술 분야에 강해요',
    },
    '학문형': {
      essence: '분석·감정 기반 전문자격이 강한 지렛대가 돼요',
      fields: ['회계사', '애널리스트', '변호사', '감정평가'],
      rationale: '결단·판단(金) × 분석 자격(인성)의 조합 — 전문 자격이 강한 지렛대가 되는 분야가 맞아요',
    },
    '유연형': {
      essence: '단기 프로젝트·거래 중심의 결단형 업무가 맞아요',
      fields: ['트레이딩', '컨설팅', '중개', 'M&A'],
      rationale: '금의 결단 기운은 단기·거래형 일과 궁합이 좋아요',
    },
  },
  '수': {
    '조직형': {
      essence: '유통·물류·네트워크 흐름이 있는 조직에서 역량이 살아나요',
      fields: ['유통 대기업', '해운·항공', '통신', '리테일'],
      rationale: '흐름·이동(水) × 조직(관성)의 조합 — 유통·물류·네트워크가 핵심인 조직에서 역량이 살아나요',
    },
    '전문가형': {
      essence: '커뮤니케이션·영업·마케팅 기반 전문성에 강해요',
      fields: ['영업', '마케팅', 'PR', '리서치'],
      rationale: '소통·흐름 감각(水) × 표현·실행(식상)의 조합 — 사람과 정보의 흐름을 다루는 영업·마케팅에 강해요',
    },
    '학문형': {
      essence: '흐름과 트렌드를 읽는 분석·서술형 일에 어울려요',
      fields: ['경제 분석', '기자', '사회학', '트렌드 리서치'],
      rationale: '유동성(水) × 분석·서술(인성)의 조합 — 트렌드·사회 변화를 읽고 쓰는 일에 잘 맞아요',
    },
    '유연형': {
      essence: '이동과 변화가 자유로운 글로벌·원격형 구조가 맞아요',
      fields: ['여행·MICE', '무역', '해외 업무', '원격 근무'],
      rationale: '이동성(水)은 한 곳에 매이지 않는 글로벌·원격·무역형 구조와 잘 맞아요',
    },
  },
};

const TRAITS_BY_TYPE: Record<CareerType, Array<{ title: string; desc: string }>> = {
  '조직형': [
    { title: '장기 누적', desc: '10년 단위로 실력이 쌓이는 시간 구조' },
    { title: '위계·체계', desc: '역할과 절차가 명확한 환경' },
    { title: '공식 인정', desc: '직책·승진·타이틀이 동기 부여' },
    { title: '원칙 중심', desc: '즉흥보다 정공법·규정이 유리' },
  ],
  '전문가형': [
    { title: '아웃풋 평가', desc: '결과물·포트폴리오로 실력 증명' },
    { title: '전문성 누적', desc: '한 분야를 깊이 파는 1만 시간형' },
    { title: '개인 브랜드', desc: '이름·작품이 자산이 되는 구조' },
    { title: '창작·실행', desc: '만들고 만든 걸 보여주는 일' },
  ],
  '학문형': [
    { title: '지식 자본', desc: '배움·연구·자격이 곧 무기' },
    { title: '느린 숙성', desc: '장기 투자로 실력이 익어가는' },
    { title: '공인된 증명', desc: '자격·학위·논문 같은 객관 지표' },
    { title: '전수·멘토링', desc: '가르치고 조언하는 것도 일' },
  ],
  '유연형': [
    { title: '다각화', desc: '한 축에 묶이지 않는 여러 수입원' },
    { title: '프로젝트 단위', desc: '시작과 끝이 있는 일의 반복' },
    { title: '변주 필요', desc: '반복되면 에너지가 빠지는 체질' },
    { title: '자율 스케줄', desc: '시간 주권이 있을 때 몰입도 ↑' },
  ],
};

const STRENGTHS_BY_TYPE: Record<CareerType, string[]> = {
  '조직형': [
    '장기 누적형 커리어에서 복리 효과가 커요',
    '책임·직책이 커질수록 본래 기량이 드러나요',
    '위계·제도·절차에 대한 감각이 타고나 있어요',
  ],
  '전문가형': [
    '아이디어를 결과물로 전환하는 속도가 빨라요',
    '퍼스널 브랜드·포트폴리오가 자연스럽게 쌓여요',
    '자기 페이스로 깊이 파는 힘이 있어요',
  ],
  '학문형': [
    '지식·자격이 깊게 쌓여 전문가 신뢰가 만들어져요',
    '느린 숙성이지만 오래 가는 커리어 자산이 쌓여요',
    '멘토·조언자·가르침 역할에서 특히 빛나요',
  ],
  '유연형': [
    '상황·역할에 유연하게 적응하는 힘이 있어요',
    '여러 수입원·프로젝트를 병행하는 게 체질에 맞아요',
    '환경 변화를 기회로 바꾸는 순발력이 뛰어나요',
  ],
};

const CAUTIONS_BY_TYPE: Record<CareerType, string[]> = {
  '조직형': [
    '예측 불가 프로젝트·소규모 조직에선 스트레스가 크게 옵니다',
    '제도 밖 결정을 내릴 때 망설임이 길어질 수 있어요',
  ],
  '전문가형': [
    '위계·반복 업무에서 동기 저하가 빠르게 와요',
    '성과가 곧 존재감이라 번아웃·과잉 몰입 주의',
  ],
  '학문형': [
    '실행·아웃풋이 뒤로 밀리기 쉬워요 — 배움을 결과로 잇는 채널 필요',
    '너무 신중해서 기회 타이밍을 놓칠 수 있어요',
  ],
  '유연형': [
    '한 축이 없는 만큼 스스로 루틴·기준을 만들어야 해요',
    '장기 누적 자산이 쉽게 쌓이지 않아 의식적 집중이 필요해요',
  ],
};

/** 유형별 안 맞는 일 (설명형 줄글) */
const MISMATCH_BY_TYPE: Record<CareerType, string> = {
  '조직형': '규칙 없이 즉흥적으로 돌아가는 환경, 매번 새로운 프로젝트를 처음부터 만드는 스타트업 초기 단계, 성과가 숫자로 보이지 않고 개인의 감각·표현으로만 평가되는 일은 에너지 소모가 크고 성취감도 쉽게 오지 않아요. 프리랜서나 1인 크리에이터처럼 스스로 모든 결정을 내려야 하는 구조도 체질과 거리가 있어요.',
  '전문가형': '반복적인 행정·서류 처리, 위계와 절차를 따르는 것이 핵심인 관리직, 개인의 아웃풋이 드러나지 않는 뒷단 지원 업무는 금세 동기가 떨어져요. 성과를 오래 기다려야 하거나, 본인의 이름이 아닌 조직 이름으로만 일이 귀속되는 환경에서는 점점 에너지가 빠져요.',
  '학문형': '빠른 실행·즉각적 성과를 요구하는 영업 중심 환경, 깊이보다 속도가 우선인 일, 체계 없이 감으로 움직이는 조직은 체질과 맞지 않아요. 짧은 주기로 결과물을 쏟아내야 하는 콘텐츠 양산형 업무도 점점 소진으로 이어지기 쉬워요.',
  '유연형': '하나의 역할에 10년 이상 묶이는 구조, 매일 같은 루틴·절차를 반복하는 관리·행정 업무, 변화 없이 꾸준함만 요구되는 환경에서는 몰입도가 빠르게 떨어져요. 승진 트랙이 유일한 보상 수단인 조직에서도 답답함을 느끼기 쉬워요.',
};

const TIPS_BY_TYPE: Record<CareerType, { inJob: string; transition: string }> = {
  '조직형': {
    inJob: '조직 내 공식 트랙(승진·직책)에 적극 뛰어드는 게 체질과 맞아요. 규정 준수와 위계 정비가 결국 실적으로 돌아옵니다.',
    transition: '규모 있는 조직, 명확한 위계와 제도가 있는 곳을 우선 살펴보세요. 공인 자격·타이틀이 문을 여는 지렛대가 됩니다.',
  },
  '전문가형': {
    inJob: '본인의 아웃풋(결과물·포트폴리오)이 드러나는 프로젝트를 맡는 게 유리해요. 전문성 누적이 곧 커리어 자산입니다.',
    transition: '조직 타이틀보다 "무엇을 만들 수 있는가"로 승부하세요. 포트폴리오·작품 기반으로 증명하는 루트가 체질과 맞아요.',
  },
  '학문형': {
    inJob: '학습·자격·연구에 꾸준히 투자하는 게 늦게라도 커리어 자산으로 돌아와요. 사내 교육·자격제도를 적극 활용하세요.',
    transition: '자격증·학위·전문과정이 가장 강한 지렛대예요. 정공법으로 실력을 증명하는 루트가 체질과 맞습니다.',
  },
  '유연형': {
    inJob: '반복보다 변주가 있는 역할을 찾는 게 좋아요. 한 직무에 오래 묶이면 에너지가 빠져나가기 쉬운 구조예요.',
    transition: '여러 수입원·프로젝트를 병행할 수 있는 구조를 권장해요. 고정 고용보다 자율·복합형 구조가 맞을 수 있어요.',
  },
};

const PEAK_ACTIONS: Record<WealthPathKey, string> = {
  '관성': '승진 어필·공식 자리',
  '재성': '연봉 협상·성과 보상',
  '식상': '결과물 공개·포트폴리오 업데이트',
  '인성': '자격 취득·시험 도전',
  '비겁': '네트워킹·동맹 구축',
};

const TROUGH_ACTIONS: Record<WealthPathKey, string> = {
  '관성': '역할·평가 재정비',
  '재성': '지출·예산 점검',
  '식상': '인풋·학습 재충전',
  '인성': '기존 지식·자격 복기',
  '비겁': 'R&R·관계 정비',
};

const PEAK_TEMPLATES: Array<(t: string) => string> = [
  (t) => `이 달엔 ${t}에 힘을 실어보세요.`,
  (t) => `이 달은 ${t}에 과감히 움직여도 좋아요.`,
  (t) => `이 달엔 ${t} 쪽에 시간을 쏟아보세요.`,
  (t) => `${t} — 이 달은 이런 결정을 당길 타이밍이에요.`,
  (t) => `이 달엔 ${t}에 집중하면 성과가 따라와요.`,
];

const TROUGH_TEMPLATES: Array<(t: string) => string> = [
  (t) => `이 달엔 새 결정보다 ${t}에 집중하세요.`,
  (t) => `이 달엔 ${t}에 시간을 써보세요.`,
  (t) => `무리한 결정은 잠시 미루고 ${t} 쪽을 챙기세요.`,
  (t) => `${t} — 이 달엔 이런 정비가 우선이에요.`,
  (t) => `이 달엔 ${t}에 공들이면 다음 상승기에 힘이 실려요.`,
];

const PEAK_EMPTY = [
  '큰 변수가 없는 평온 구간이지만, 꾸준히 쌓아온 실력이 담담히 드러나기 좋아요.',
  '특별한 이벤트는 없지만 본인의 기본기가 안정적으로 발휘되는 달이에요.',
  '눈에 띄는 변수는 적어도, 평소의 리듬이 그대로 성과로 이어지는 구간이에요.',
];

const TROUGH_EMPTY = [
  '큰 변수 없이 잔잔한 달이니, 기존 루틴 안에서 정비하는 정도가 적당해요.',
  '특별한 도전보다 컨디션·관계를 정돈하며 지나가기 좋은 달이에요.',
  '기복이 작은 구간이니 조용히 다음 파도를 준비해두세요.',
];

const PREFERRED_AXIS: Record<CareerType, WealthPathKey | null> = {
  '조직형': '관성',
  '전문가형': '식상',
  '학문형': '인성',
  '유연형': null,
};

const BRIDGE: Record<CareerType, Partial<Record<WealthPathKey, string>>> = {
  '조직형': {
    '식상': '평소 위계·제도에 익숙한 당신에겐 낯설 수 있지만, 이번엔 아이디어·아웃풋을 바깥으로 내놓을 구간이에요.',
    '인성': '당신의 체계형 커리어에 학습 자산을 얹기 좋은 시기 — 자격·전문 과정에 투자하세요.',
    '재성': '조직 내 성과가 실질 보상으로 연결될 타이밍 — 연봉·성과급 협상에 당당하게 나서세요.',
    '비겁': '동료·경쟁 기운이 강해지는 구간이라, 정치보다 실적·문서로 기여도를 남겨두세요.',
  },
  '전문가형': {
    '관성': '평소 자율·창작에 익숙한 당신에겐 조직 리듬이 낯설 수 있지만, 공식 자리로 전문성을 공인화할 기회예요.',
    '인성': '감각만 믿고 달리기보다 자격·지식을 더하는 시기 — 전문성이 한 단계 올라가요.',
    '재성': '결과물을 수익으로 바꿀 타이밍 — 가격·단가·수익 모델을 다시 설계해보세요.',
    '비겁': '협업·경쟁이 강해지는 구간이라, 혼자보다 공동 작업으로 판을 넓혀보세요.',
  },
  '학문형': {
    '관성': '배움을 실전에서 검증할 시기 — 쌓아온 자격·지식을 공식 직책·역할에 연결해보세요.',
    '식상': '쌓아둔 지식을 바깥으로 꺼낼 달 — 글·강의·콘텐츠로 전문성을 드러내기 좋아요.',
    '재성': '축적된 지식이 수익 채널로 전환되기 좋은 시기 — 컨설팅·강연·콘텐츠 수익화를 고려해보세요.',
    '비겁': '학습 커뮤니티·스터디에서 큰 시너지가 만들어지는 구간이에요.',
  },
  '유연형': {},
};

function buildBridge(type: CareerType, categories: WealthPathKey[] | undefined): string | null {
  if (!categories || categories.length === 0) return null;
  const pref = PREFERRED_AXIS[type];
  if (!pref || categories.includes(pref)) return null;
  const bridges = BRIDGE[type];
  for (const cat of categories) {
    if (bridges[cat]) return bridges[cat]!;
  }
  return null;
}

function buildPeakAdvice(
  categories: WealthPathKey[] | undefined,
  kind: 'peak' | 'trough',
  seedMonth: number,
): string {
  if (!categories || categories.length === 0) {
    const pool = kind === 'peak' ? PEAK_EMPTY : TROUGH_EMPTY;
    return pool[seedMonth % pool.length];
  }
  const map = kind === 'peak' ? PEAK_ACTIONS : TROUGH_ACTIONS;
  const items = categories.map((c) => map[c]).filter(Boolean).slice(0, 2);
  if (items.length === 0) {
    return kind === 'peak'
      ? '흐름에 올라타 결정을 당기기 좋은 달이에요.'
      : '무리한 결정보다 정비에 집중할 달이에요.';
  }
  const joined = items.join(', ');
  const templates = kind === 'peak' ? PEAK_TEMPLATES : TROUGH_TEMPLATES;
  return templates[seedMonth % templates.length](joined);
}

function careerTypeLabel(counts: { gwan: number; sik: number; in_: number }): { type: CareerType; desc: string } {
  const { gwan, sik, in_ } = counts;
  const max = Math.max(gwan, sik, in_);
  if (max === 0) {
    return {
      type: '유연형',
      desc: '관성·식상·인성이 원국에 뚜렷이 없어 특정 축에 치우치지 않는 구조예요. 상황에 따라 역할을 유연하게 바꿀 수 있는 것이 강점이고, 스스로 루틴·기준을 만들어야 커리어가 쌓여요.',
    };
  }
  if (gwan === max && gwan >= sik && gwan >= in_) {
    return {
      type: '조직형',
      desc: '관성(官)이 가장 강한 구조예요. 체계 잡힌 조직·공식 지위·위계 안에서 실력이 빛나요. 규칙·제도·직책이 명확한 환경에서 중장기 커리어를 쌓는 것이 가장 잘 맞아요.',
    };
  }
  if (sik === max && sik >= in_) {
    return {
      type: '전문가형',
      desc: '식상(食傷)이 가장 강한 구조예요. 아웃풋·창작·전문 역량으로 인정받는 축이 두드러져요. 조직 안에서도 가능하지만 프리랜서·크리에이터·전문가 트랙이 체질에 맞아요.',
    };
  }
  return {
    type: '학문형',
    desc: '인성(印)이 가장 강한 구조예요. 학습·자격·멘토 관계가 커리어의 토대가 되는 축이에요. 자격증·연구·교육·컨설팅처럼 쌓인 지식이 자산이 되는 분야가 잘 맞아요.',
  };
}

export default function CareerPage() {
  const { t, lang, localePath } = useLang();
  const [saju, setSaju] = useState<CurrentSaju | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

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

  const periodChaeun = saju && ilgan ? computeCurrentPeriodChaeun(ilgan, pillars) : null;
  const careerOverall = deriveCareerOverall(periodChaeun, pillars);
  const monthSeries = saju && ilgan ? buildMonthCareerSeries(ilgan, pillars) : [];
  const counts = saju && ilgan ? countCareerSipsung(ilgan, pillars) : { gwan: 0, sik: 0, in_: 0 };
  const profileType = careerTypeLabel(counts);

  const handleCalculated = (r: SajuCalcResult) => {
    setSaju({
      year: r.year,
      month: r.month,
      day: r.day,
      gender: r.gender,
      timeInput: r.timeInput,
      region: r.region,
      pillars: r.pillars,
      ilgan: r.ilgan,
      correctedTime: r.correctedTime,
      daeuns: r.daeuns,
    });
    setFormOpen(false);
  };

  const initialForm = saju
    ? {
        birthdate: `${saju.year} / ${String(saju.month).padStart(2, '0')} / ${String(saju.day).padStart(2, '0')}`,
        timeInput: saju.timeInput,
        noTime: !saju.timeInput,
        gender: saju.gender as '남' | '여',
        region: saju.region,
      }
    : undefined;

  if (!loaded) return null;

  return (
    <PageShell hanjaRight="官" hanjaLeft="職" maxWidth={720}>
      <PageHeader
        title={t('커리어 운', 'Career')}
        titleAccent={t('운', 'er')}
        sub={t('관·식·인 3축 · 대운 커리어 타임라인 · 4유형 자동 진단',
              'Officer · Output · Resource · 4-type auto-typing')}
      />

      <div className="max-w-[480px] lg:max-w-[1080px] mx-auto px-3 sm:px-[14px] pt-4 pb-10">
        {!saju && (
          <>
            <p className="mb-4 text-center text-[13px] text-gray-500 dark:text-gray-100 dark:text-gray-300 leading-relaxed">
              {lang === 'en' ? (
                <>Enter a birth date below or pick a saved profile<br />to see your career flow.</>
              ) : (
                <>아래에서 생년월일을 입력하거나 저장된 만세력을 선택하면<br />커리어 흐름 분석이 펼쳐져요.</>
              )}
            </p>
            <SajuInputPanel
              initial={initialForm}
              onCalculated={handleCalculated}
              submitLabel={t('커리어 흐름 보기', 'See Career Flow')}
              trackEventName="career_calculate"
            />
          </>
        )}

        {saju && formOpen && (
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="w-full mb-3 py-2.5 text-[13px] text-gray-500 dark:text-gray-100 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 transition-colors border-none cursor-pointer"
            >
              {t('입력 취소하고 돌아가기', 'Cancel and go back')}
            </button>
            <SajuInputPanel
              initial={initialForm}
              onCalculated={handleCalculated}
              submitLabel={t('커리어 흐름 보기', 'See Career Flow')}
              trackEventName="career_calculate"
            />
          </>
        )}

        {saju && !formOpen && (
          <>
            {/* 프로필 요약 카드 */}
            {(() => {
              const ilganOh = CG_OH[ilgan] || '';
              const dateLabel = lang === 'en'
                ? `${saju.year}-${String(saju.month).padStart(2, '0')}-${String(saju.day).padStart(2, '0')}`
                : `${saju.year}년 ${saju.month}월 ${saju.day}일`;
              const regionLabel = REGION_OPTIONS.find((r) => r.value === saju.region)?.label || t('보정 안함', 'No correction');
              const genderLabel = saju.gender === '남' ? t('남', 'Male') : saju.gender === '여' ? t('여', 'Female') : saju.gender;
              const subtitle = [genderLabel, regionLabel].filter(Boolean).join(' · ');
              return (
                <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[16px] font-bold shrink-0"
                      style={{
                        background: EL_BG[ilganOh] || '#F2F4F7',
                        color: EL_SOLID[ilganOh] || '#6B7684',
                      }}
                    >
                      {ilgan || '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">
                        {dateLabel}
                        {saju.timeInput && ` ${saju.timeInput}`}
                      </div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-300 truncate">{subtitle}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormOpen(true)}
                      className="shrink-0 border-none rounded-lg cursor-pointer px-3 py-1.5 text-[12px] font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 transition-colors"
                    >
                      {t('다시 입력', 'Re-enter')}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* 사주 팔자 테이블 */}
            <SajuTable pillars={pillars} ilgan={ilgan} />

            {/* 커리어 유형 한 줄 요약 */}
            {(() => {
              const ilganOh = CG_OH[ilgan] || '';
              const aptitude = APTITUDE_MATRIX[ilganOh]?.[profileType.type];
              const keywords = aptitude?.fields ?? [];
              return (
                <div className="mt-6 mb-4 text-center">
                  <div className="text-[10.5px] font-bold tracking-[0.12em] text-gray-400 dark:text-gray-500 uppercase mb-1">
                    {t('나의 커리어 유형', 'My Career Type')}
                  </div>
                  <div className="text-[18px] font-extrabold text-gray-900 dark:text-gray-100 leading-[1.3] tracking-[-0.01em]">
                    {profileType.type}
                  </div>
                  <div className="mt-1.5 inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900">
                    <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                      {aptitude?.essence ?? profileType.desc}
                    </span>
                  </div>
                  {keywords.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                      {keywords.slice(0, 4).map((kw, i) => {
                        const colors = [
                          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
                          'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
                          'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
                          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
                        ];
                        return (
                          <span key={i} className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10.5px] font-semibold border ${colors[i % colors.length]}`}>
                            #{kw}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ═══════════════════════════════════════════
                ① 커리어 유형 진단 (토글)
            ═══════════════════════════════════════════ */}
            <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('careerType')}
                className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-[15px] font-bold text-indigo-600 dark:text-indigo-400 tracking-wide">
                    {t('내 커리어 기운의 성격', 'Your Career Energy')}
                  </span>
                  {!openSections['careerType'] && (
                    <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 leading-snug truncate italic">
                      {t('관성(官) · 식상(食傷) · 인성(印) 축으로 본 커리어 체질', 'Career constitution via Authority · Output · Resource axes')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}
                  >
                    {profileType.type}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['careerType'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              {openSections['careerType'] && (
                <div className="px-5 pb-5">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-[11px] text-gray-500 dark:text-gray-300 tabular-nums">
                      {t('관성', 'Authority')} {counts.gwan} · {t('식상', 'Output')} {counts.sik} · {t('인성', 'Resource')} {counts.in_}
                    </span>
                  </div>

              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span
                  className="inline-block rounded-full px-3 py-1 text-[12px] font-bold"
                  style={{ background: 'var(--tone-info-bg)', color: 'var(--tone-info-fg)' }}
                >
                  {profileType.type}
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-100 dark:text-gray-300 tabular-nums">
                  {t('관성', 'Authority')} {counts.gwan} · {t('식상', 'Output')} {counts.sik} · {t('인성', 'Resource')} {counts.in_}
                </span>
              </div>

              {/* 유형 판정 매트릭스 */}
              {(() => {
                const axes = [
                  { key: 'gwan', label: t('관성', 'Authority'), sub: t('조직·직책', 'Org · Title'), count: counts.gwan },
                  { key: 'sik', label: t('식상', 'Output'), sub: t('전문성·아웃풋', 'Expertise · Output'), count: counts.sik },
                  { key: 'in_', label: t('인성', 'Resource'), sub: t('학습·자격', 'Learning · Cert'), count: counts.in_ },
                ];
                const max = Math.max(1, ...axes.map((a) => a.count));
                const winKey = profileType.type === '조직형' ? 'gwan'
                  : profileType.type === '전문가형' ? 'sik'
                  : profileType.type === '학문형' ? 'in_'
                  : null;
                const hasTie = axes.filter((a) => a.count === Math.max(...axes.map((x) => x.count))).length > 1 && Math.max(...axes.map((x) => x.count)) > 0;
                return (
                  <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--v3-panel)' }}>
                    <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-2">
                      {t('유형 판정 · 가장 많은 축이 체질이 돼요', 'Type — the highest axis defines your constitution')}
                    </div>
                    <div className="space-y-1.5">
                      {axes.map((a) => {
                        const isWin = a.key === winKey;
                        const pct = (a.count / max) * 100;
                        return (
                          <div key={a.key} className="flex items-center gap-2">
                            <div className="flex items-baseline gap-1 min-w-[88px] shrink-0">
                              <span className={`text-[11.5px] font-bold ${isWin ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                                {a.label}
                              </span>
                              <span className={`text-[9.5px] ${isWin ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                {a.sub}
                              </span>
                            </div>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--v3-line)' }}>
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  background: isWin ? 'var(--tone-info-fg)' : 'var(--v3-sub)',
                                }}
                              />
                            </div>
                            <div className={`text-[11px] font-bold w-[16px] text-right shrink-0 tabular-nums ${
                              isWin ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
                            }`}>
                              {a.count}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {hasTie && (
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 leading-snug">
                        ※ 동률일 땐 <b className="text-gray-500 dark:text-gray-400">관성 → 식상 → 인성</b> 순으로 판정돼요.
                      </div>
                    )}
                  </div>
                );
              })()}

              <p className="text-[14px] text-gray-600 dark:text-gray-300 leading-[1.9] mb-4">{profileType.desc}</p>

              <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-[1.9]">
                {STRENGTHS_BY_TYPE[profileType.type].join(' ')} {t('다만, ', 'However, ')}{CAUTIONS_BY_TYPE[profileType.type].join(' ')}
              </p>
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════
                ② 빛나는 일의 성격 (토글)
            ═══════════════════════════════════════════ */}
            {(() => {
              const ilganOh = CG_OH[ilgan] || '';
              const aptitude = APTITUDE_MATRIX[ilganOh]?.[profileType.type];
              const tips = TIPS_BY_TYPE[profileType.type];
              const traits = TRAITS_BY_TYPE[profileType.type];
              if (!aptitude || !tips || !traits) return null;
              return (<>
                <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection('fitWork')}
                    className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-bold text-emerald-600 dark:text-emerald-400 tracking-wide">
                        {t('나와 잘 맞는 일', 'Work That Fits You')}
                      </span>
                      {!openSections['fitWork'] && (
                        <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 leading-snug truncate italic">
                          {t('일간', 'Day Stem')} {ilganOh} · {profileType.type} {t('기반 적성', 'aptitude')}
                        </p>
                      )}
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['fitWork'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {openSections['fitWork'] && (
                    <div className="px-5 pb-5">
                      <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-[1.9] mb-3">
                        {aptitude.essence} {aptitude.rationale}
                      </p>
                      <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-[1.9] mb-4">
                        {t('구체적으로 보면, ', 'Specifically, ')}{traits.map((tr) => `${tr.title}(${tr.desc})`).join(', ')}{t(' 같은 성격의 일이 당신과 잘 맞아요. ', ' — these traits align well with your energy. ')}
                        {t('추천 분야로는 ', 'Recommended fields include ')}{aptitude.fields.join(', ')}{t('가 있어요.', '.')}
                      </p>
                      <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                        <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-[1.9]">
                          <b className="text-gray-900 dark:text-gray-100">{t('지금 일하고 있다면', 'If currently working')}</b> — {tips.inJob}
                        </p>
                        <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-[1.9]">
                          <b className="text-gray-900 dark:text-gray-100">{t('전환이나 시작을 고민 중이라면', 'If considering a transition')}</b> — {tips.transition}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection('unfitWork')}
                    className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-bold text-rose-600 dark:text-rose-400 tracking-wide">
                        {t('나와 안 맞는 일', 'Work That Drains You')}
                      </span>
                      {!openSections['unfitWork'] && (
                        <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 leading-snug truncate italic">
                          {t('이런 환경에서는 에너지가 빠져요', 'These environments drain your energy')}
                        </p>
                      )}
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['unfitWork'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {openSections['unfitWork'] && (
                    <div className="px-5 pb-5">
                      <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-[1.9]">
                        {MISMATCH_BY_TYPE[profileType.type]}
                      </p>
                    </div>
                  )}
                </div>
              </>);
            })()}

            {/* ═══════════════════════════════════════════
                ③ 시기별 커리어 흐름 (토글)
            ═══════════════════════════════════════════ */}
            {periodChaeun && (periodChaeun.yeonun || periodChaeun.wolun || periodChaeun.iljin) && (() => {
              const rows: Array<{
                key: 'yeonun' | 'wolun' | 'iljin';
                label: string;
                sub: string;
                ganji: string;
                ganjiHanja: string;
                note: string;
                categories: WealthPathKey[];
                score: number;
                tone: 'good' | 'neutral' | 'caution';
              }> = [];
              if (periodChaeun.yeonun && careerOverall.yeonun) {
                rows.push({
                  key: 'yeonun',
                  label: '올해',
                  sub: `${periodChaeun.yeonun.year}`,
                  ganji: periodChaeun.yeonun.ganji,
                  ganjiHanja: periodChaeun.yeonun.ganjiHanja,
                  note: buildCareerPeriodNote(periodChaeun.yeonun.categories),
                  categories: periodChaeun.yeonun.categories,
                  score: careerOverall.yeonun.score,
                  tone: careerOverall.yeonun.tone,
                });
              }
              if (periodChaeun.wolun && careerOverall.wolun) {
                rows.push({
                  key: 'wolun',
                  label: '이번 달',
                  sub: `${periodChaeun.wolun.month}월`,
                  ganji: periodChaeun.wolun.ganji,
                  ganjiHanja: periodChaeun.wolun.ganjiHanja,
                  note: buildCareerPeriodNote(periodChaeun.wolun.categories),
                  categories: periodChaeun.wolun.categories,
                  score: careerOverall.wolun.score,
                  tone: careerOverall.wolun.tone,
                });
              }
              if (periodChaeun.iljin && careerOverall.iljin) {
                rows.push({
                  key: 'iljin',
                  label: '오늘',
                  sub: periodChaeun.iljin.dateLabel,
                  ganji: periodChaeun.iljin.ganji,
                  ganjiHanja: periodChaeun.iljin.ganjiHanja,
                  note: buildCareerPeriodNote(periodChaeun.iljin.categories),
                  categories: periodChaeun.iljin.categories,
                  score: careerOverall.iljin.score,
                  tone: careerOverall.iljin.tone,
                });
              }

              return (
                <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection('periodFlow')}
                    className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-bold text-purple-600 dark:text-purple-400 tracking-wide">
                        {t('시기별 커리어 흐름', 'Career Flow by Period')}
                      </span>
                      {!openSections['periodFlow'] && (
                        <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 leading-snug truncate italic">
                          {t('올해 · 이번 달 · 오늘의 커리어 영향', 'Career influence: this year · month · today')}
                        </p>
                      )}
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['periodFlow'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {openSections['periodFlow'] && (
                    <div className="px-5 pb-5 space-y-4">
                    {rows.map((r, idx) => {
                      const bridge = buildBridge(profileType.type, r.categories);
                      const periodLabel = r.label === '올해' ? t('올해', 'This year') : r.label === '이번 달' ? t('이번 달', 'This month') : t('오늘', 'Today');
                      return (
                        <div key={r.key} className={idx === 0 ? '' : 'border-t border-gray-100 dark:border-gray-800 pt-4'}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[13px] font-bold text-gray-900 dark:text-gray-100">{periodLabel}</span>
                            <span className="text-[11px] text-gray-400 dark:text-gray-300">{r.sub} · {r.ganji}({r.ganjiHanja})</span>
                            <span className="text-[11px] font-bold tabular-nums text-gray-500 dark:text-gray-300 ml-auto">{r.score}/100</span>
                          </div>
                          <p className="text-[14px] text-gray-700 dark:text-gray-300 leading-[1.9]">
                            {r.note && r.note !== '—' ? r.note : ''}{bridge ? ` ${bridge}` : ''}
                          </p>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ═══════════════════════════════════════════
                ④ 올해 월별 커리어 타임라인 (토글)
            ═══════════════════════════════════════════ */}
            {monthSeries.length >= 2 && (() => {
              const currentMonth = periodChaeun?.wolun?.month;
              const best = monthSeries.reduce((b, c) => (c.score > b.score ? c : b), monthSeries[0]);
              const worst = monthSeries.reduce((w, c) => (c.score < w.score ? c : w), monthSeries[0]);
              const chartW = 400;
              const chartH = 110;
              const padL = 10;
              const padR = 10;
              const padT = 14;
              const padB = 22;
              const plotW = chartW - padL - padR;
              const plotH = chartH - padT - padB;
              const max = Math.max(...monthSeries.map((m) => m.score));
              const min = Math.min(...monthSeries.map((m) => m.score));
              const range = max - min || 1;
              const step = plotW / (monthSeries.length - 1);
              const coords = monthSeries.map((m, i) => ({
                x: padL + i * step,
                y: padT + plotH - ((m.score - min) / range) * plotH,
                month: m.month,
                score: m.score,
                tone: m.tone,
              }));
              const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
              const areaD = `${d} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;
              const dotColor = (tone: 'good' | 'neutral' | 'caution') =>
                tone === 'good' ? '#10B981' : tone === 'neutral' ? '#94A3B8' : '#F59E0B';
              return (
                <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 rounded-[16px] mb-3 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection('timeline')}
                    className="w-full flex items-center justify-between px-5 py-4 cursor-pointer bg-transparent border-none text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-bold text-teal-600 dark:text-teal-400 tracking-wide">
                        {t('올해 월별 커리어 타임라인', 'Monthly Career Timeline')}
                      </span>
                      {!openSections['timeline'] && (
                        <p className="text-[12.5px] text-gray-400 dark:text-gray-500 mt-1 leading-snug truncate italic">
                          {t('정점', 'Peak')} {lang === 'en' ? `M${best.month}` : `${best.month}월`} · {t('저점', 'Trough')} {lang === 'en' ? `M${worst.month}` : `${worst.month}월`}
                        </p>
                      )}
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 transition-transform duration-200 ${openSections['timeline'] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {openSections['timeline'] && (
                    <div className="px-5 pb-5">
                  <p className="text-[14px] text-gray-600 dark:text-gray-300 mb-3 leading-[1.9]">
                    {lang === 'en'
                      ? `This year, your career energy peaks in month ${best.month} (score ${best.score}) and dips lowest in month ${worst.month} (score ${worst.score}).`
                      : `올해 커리어 기운은 ${best.month}월에 가장 높고(${best.score}점), ${worst.month}월에 가장 낮아요(${worst.score}점).`}
                  </p>
                  <svg
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    preserveAspectRatio="none"
                    style={{ width: '100%', height: 'auto' }}
                    aria-label="올해 월별 커리어 점수 추이"
                  >
                    <path d={areaD} fill="#10B981" fillOpacity="0.08" />
                    <path
                      d={d}
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {coords.map((c) => {
                      const isCurrent = currentMonth === c.month;
                      return (
                        <g key={c.month}>
                          <circle
                            cx={c.x}
                            cy={c.y}
                            r={isCurrent ? 4 : 2.2}
                            fill={isCurrent ? dotColor(c.tone) : 'var(--v3-subtle)'}
                            stroke="#fff"
                            strokeWidth={isCurrent ? 1.5 : 1}
                          />
                          {isCurrent && (
                            <text
                              x={c.x}
                              y={c.y - 8}
                              textAnchor="middle"
                              fontSize="10"
                              fontWeight="700"
                              fill={dotColor(c.tone)}
                            >
                              {c.score}
                            </text>
                          )}
                          <text
                            x={c.x}
                            y={chartH - 6}
                            textAnchor="middle"
                            fontSize="9"
                            fill={isCurrent ? 'var(--v3-ink)' : 'var(--v3-subtle)'}
                            fontWeight={isCurrent ? 700 : 500}
                          >
                            {c.month}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-[12px] text-gray-700 dark:text-gray-300 leading-[1.9]">
                      {buildPeakAdvice(best.categories, 'peak', best.month)} {buildPeakAdvice(worst.categories, 'trough', worst.month)}
                    </p>
                  </div>
                    </div>
                  )}
                </div>
              );
            })()}

            </>
        )}
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
