/**
 * personaVoice — MBTI 페르소나(NT/NF/ST/SF)별 사주 풀이 텍스트 생성기.
 *
 * 같은 사주 데이터를 4명 페르소나가 4가지 화법으로 풀어내는 게 핵심.
 * 정적 템플릿 + 변수 치환 방식. 시드로 안정성 확보 (같은 사람은 같은 풀이).
 *
 * 추후 Bedrock LLM 연결 시 동일 인터페이스 유지하고 내부 구현만 교체.
 */

export type PersonaGroup = 'NT' | 'NF' | 'ST' | 'SF';

export type Step = 'greeting' | 'ilgan' | 'ohaeng' | 'gyeokguk' | 'today' | 'closing';

export interface VoiceContext {
  ilgan: string;            // 일간 한글 (계, 갑, ...)
  ilganHanja: string;       // 일간 한자 (癸, 甲, ...)
  ilganElement: string;     // 일간 오행 (수, 목, ...)
  seasonHint: string;       // 가을, 여름, 봄, 겨울
  strength: 'strong' | 'weak' | 'balanced';  // 신강/신약/중화
  gyeokguk: string;         // 격국 (정인격, 식신격, ...) — 없으면 ''
  yongsin: string;          // 용신 후보 (예: '화·토') — 없으면 ''
  todayPillar: string;      // 오늘 일진 (병술, 정해, ...)
  todaySipsung: string;     // 오늘 일진의 십성 (정재, 편관 등)
  todayUnsung: string;      // 오늘 12운성 (장생, 제왕 등)
  seed: string;             // 생년월일+사용자 식별 (템플릿 선택 시드)
}

export interface VoiceOutput {
  label: string;            // "에디터 노트", "오늘의 흐름" 등 카드 상단 라벨
  title: string;            // 카드 큰 제목
  body: string[];           // 본문 단락 배열
  highlight?: string;       // 강조 한 줄 (옵션, 인용 카드용)
}

// 페르소나 표시용 메타
export const personaMeta: Record<PersonaGroup, { name: string; nickname: string; tone: string; avatar: string }> = {
  NT: { name: '민철', nickname: '분석가', tone: '구조적·데이터 중심', avatar: '/editors/intj.webp' },
  NF: { name: '하은', nickname: '이야기꾼', tone: '성찰적·결을 따라가는', avatar: '/editors/infp.webp' },
  ST: { name: '준서', nickname: '실용주의자', tone: '결론·간결·실용', avatar: '/editors/istj.webp' },
  SF: { name: '소율', nickname: '공감러', tone: '친근·일상 비유', avatar: '/editors/esfp.webp' },
};

// 단계별 라벨
const stepLabels: Record<Step, string> = {
  greeting: '인사',
  ilgan: '일간',
  ohaeng: '오행',
  gyeokguk: '구조',
  today: '오늘',
  closing: '마무리',
};

function seedIndex(seed: string, max: number): number {
  const sum = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return sum % max;
}

const strengthKo = (s: VoiceContext['strength']): string =>
  s === 'strong' ? '신강' : s === 'weak' ? '신약' : '중화';

// ──────────────────────────────────────────────────────────────────
// 4그룹 × 6단계 풀이 템플릿
// ──────────────────────────────────────────────────────────────────

function NT(step: Step, c: VoiceContext): VoiceOutput {
  switch (step) {
    case 'greeting':
      return {
        label: '도입',
        title: '데이터부터 짚어봅시다',
        body: [
          `당신의 사주를 분석하겠습니다. 추측·감정 빼고 변수의 관계만 봅니다.`,
          `오늘 다룰 변수는 다섯입니다. 일간, 오행 분포, 격국, 신강도, 오늘 일진.`,
          `5분이면 핵심이 잡힙니다. 시작합니다.`,
        ],
        highlight: '구조가 모든 답입니다.',
      };
    case 'ilgan':
      return {
        label: stepLabels.ilgan,
        title: `일간 ${c.ilgan}(${c.ilganHanja}) — ${c.seasonHint}의 ${c.ilganElement}`,
        body: [
          `당신의 일간은 ${c.ilgan}${c.ilganHanja}. ${c.ilganElement} 기운이고, ${c.seasonHint}생입니다.`,
          `이 한 글자가 사주 해석의 기준점입니다. 다른 일곱 글자는 모두 일간을 중심으로 작용합니다.`,
          `핵심: ${c.ilgan}일간의 특성은 ${c.ilganElement} 기운의 본질(이성·체계 또는 흐름)을 그대로 가져갑니다.`,
        ],
      };
    case 'ohaeng':
      return {
        label: stepLabels.ohaeng,
        title: '오행 분포 — 강점과 결핍을 동시에 본다',
        body: [
          `오행은 다섯 변수의 분포 문제입니다. 어느 오행이 많고 어느 것이 부족한가.`,
          `다수 오행: 그 영역의 활동성·집착이 높습니다. 결핍 오행: 그 영역에서 의식적 보완이 필요합니다.`,
          `해석 원칙: 균형(중화)이 가장 안정적이지만, 편중도 강점으로 전환할 수 있습니다.`,
        ],
      };
    case 'gyeokguk':
      return {
        label: stepLabels.gyeokguk,
        title: `${c.gyeokguk || '격국 미구성'} · ${strengthKo(c.strength)}`,
        body: [
          c.gyeokguk
            ? `격국은 ${c.gyeokguk}. 이는 사주가 작동하는 핵심 메커니즘입니다.`
            : `명확한 격국이 잡히지 않는 구조입니다. 이런 경우 일간 자체의 힘과 조화를 중점으로 봅니다.`,
          `신강도: ${strengthKo(c.strength)}. ${c.strength === 'strong' ? '주체성·추진력 강하지만 고집·과부하 주의.' : c.strength === 'weak' ? '협력·지원에 유리하지만 결정 지연 주의.' : '균형 잡힌 형태. 상황 변수에 따라 가변적.'}`,
          c.yongsin ? `용신: ${c.yongsin} — 이 오행이 활성화될 때 흐름이 풀립니다.` : `용신은 추후 정밀 분석이 필요한 영역.`,
        ],
        highlight: c.gyeokguk ? `${c.gyeokguk}이 작동하는 조건을 기억하세요.` : undefined,
      };
    case 'today':
      return {
        label: stepLabels.today,
        title: `오늘 일진 ${c.todayPillar} — ${c.todaySipsung}의 날`,
        body: [
          `오늘 일진은 ${c.todayPillar}. 당신의 일간 ${c.ilgan}에 대해 ${c.todaySipsung}의 작용을 합니다.`,
          `12운성: ${c.todayUnsung}. ${unsungComment(c.todayUnsung)}`,
          `결정 변수: ${c.todaySipsung} 영역의 활동에는 유리, 그 외는 평이.`,
        ],
      };
    case 'closing':
      return {
        label: stepLabels.closing,
        title: '한 줄 결론',
        body: [
          `당신의 사주는 ${strengthKo(c.strength)} 구조에 ${c.gyeokguk || '유동적 격'}을 가졌습니다.`,
          `오늘 핵심 액션: ${c.todaySipsung} 관련 활동에 시간을 배분하세요.`,
        ],
        highlight: '데이터는 방향을 가리킵니다. 결정은 당신이 합니다.',
      };
  }
}

function NF(step: Step, c: VoiceContext): VoiceOutput {
  switch (step) {
    case 'greeting':
      return {
        label: '도입',
        title: '당신의 결을 함께 읽어볼게요',
        body: [
          `사주는 결국 한 사람의 이야기입니다. 숫자가 아니라 결을, 운명이 아니라 흐름을 봅니다.`,
          `오늘 우리가 함께 읽을 것은 다섯 가지예요. 일간, 오행, 구조, 오늘, 그리고 한 줄의 마무리.`,
          `천천히 한 페이지씩 넘기듯 따라와 주세요.`,
        ],
        highlight: '결은 늘 작은 곳에서 시작됩니다.',
      };
    case 'ilgan':
      return {
        label: stepLabels.ilgan,
        title: `${c.ilgan}, ${c.seasonHint}의 ${c.ilganElement}`,
        body: [
          `당신의 일간은 ${c.ilgan}이에요. ${c.seasonHint}에 태어난 ${c.ilganElement} 기운.`,
          `${c.seasonHint}의 ${c.ilganElement}을 떠올려 보세요. 그 풍경 안에 당신의 결이 있어요.`,
          `이 한 글자가 당신을 가장 잘 설명하는 출발점이에요. 사람으로 비유하면 — 깊고, 단정하고, 천천히 흐르는 결.`,
        ],
      };
    case 'ohaeng':
      return {
        label: stepLabels.ohaeng,
        title: '다섯 결의 흐름',
        body: [
          `사주의 오행은 다섯 가지 결이에요. 목·화·토·금·수.`,
          `많은 결은 당신의 일상에 자주 등장하는 색깔이고, 적은 결은 가끔 그리워지는 색깔입니다.`,
          `완벽한 균형보다, 자신의 결을 알고 의식하는 게 더 중요해요.`,
        ],
      };
    case 'gyeokguk':
      return {
        label: stepLabels.gyeokguk,
        title: c.gyeokguk ? `${c.gyeokguk} — 당신의 메커니즘` : '유연한 결의 사주',
        body: [
          c.gyeokguk
            ? `당신의 사주에는 ${c.gyeokguk}이라는 결이 흘러요. 이건 당신이 세상과 만나는 방식이에요.`
            : `당신의 사주에는 정해진 격이 단단하게 잡혀있지 않아요. 그래서 더 다양한 흐름을 받아들일 수 있어요.`,
          `신강도는 ${strengthKo(c.strength)}. ${c.strength === 'strong' ? '단단한 중심이 있어요. 가끔은 그 단단함을 잠시 내려놓아도 좋아요.' : c.strength === 'weak' ? '주변의 결을 잘 받아들이는 사주예요. 부드러움이 강점이에요.' : '단단함과 유연함 사이의 균형이 있어요.'}`,
          c.yongsin ? `용신은 ${c.yongsin}. 이 기운이 닿을 때 당신의 결이 가장 잘 살아나요.` : ``,
        ].filter(Boolean) as string[],
        highlight: c.gyeokguk ? `${c.gyeokguk}은 당신이 세상에 닿는 방식이에요.` : '결은 정해진 것이 아니라 발견하는 거예요.',
      };
    case 'today':
      return {
        label: stepLabels.today,
        title: `오늘은 ${c.todayPillar}일이에요`,
        body: [
          `오늘 일진은 ${c.todayPillar}. 당신에게 ${c.todaySipsung}의 결이 닿는 날이에요.`,
          `12운성은 ${c.todayUnsung}. ${unsungComment(c.todayUnsung)}`,
          `오늘은 평소보다 ${c.todaySipsung}의 영역에 마음이 더 머물 거예요. 그 결을 따라가 보세요.`,
        ],
      };
    case 'closing':
      return {
        label: stepLabels.closing,
        title: '오늘의 마음으로',
        body: [
          `당신의 사주는 ${strengthKo(c.strength)} 결을 가진 ${c.gyeokguk || '유연한'} 사주예요.`,
          `오늘은 ${c.todaySipsung}의 결을 따라가는 하루로 두면 좋겠어요.`,
        ],
        highlight: '결을 따라가는 사람이 가장 자기다워집니다.',
      };
  }
}

function ST(step: Step, c: VoiceContext): VoiceOutput {
  switch (step) {
    case 'greeting':
      return {
        label: '도입',
        title: '핵심만 정리합니다',
        body: [
          `사주 풀이 시작. 5단계로 정리하겠습니다.`,
          `일간 → 오행 → 격국·신강 → 오늘 일진 → 결론.`,
          `각 단계 3문장 이하. 시간 아끼겠습니다.`,
        ],
        highlight: '결론은 마지막 카드에.',
      };
    case 'ilgan':
      return {
        label: stepLabels.ilgan,
        title: `일간 ${c.ilgan}${c.ilganHanja} · ${c.ilganElement} · ${c.seasonHint}생`,
        body: [
          `일간 ${c.ilgan}. 오행 ${c.ilganElement}. ${c.seasonHint}생.`,
          `이게 모든 해석의 기준점.`,
          `다음.`,
        ],
      };
    case 'ohaeng':
      return {
        label: stepLabels.ohaeng,
        title: '오행 분포 — 많고 적음만 본다',
        body: [
          `오행 다섯 개의 개수만 카운팅. 위 차트 확인.`,
          `많은 것 = 강점 영역. 적은 것 = 보완 영역.`,
          `정확한 균형 X. 분포 패턴 O.`,
        ],
      };
    case 'gyeokguk':
      return {
        label: stepLabels.gyeokguk,
        title: `${c.gyeokguk || '격국 미구성'} · ${strengthKo(c.strength)}`,
        body: [
          c.gyeokguk ? `격국: ${c.gyeokguk}.` : `격국 미구성. 일간 중심 해석.`,
          `신강도: ${strengthKo(c.strength)}.`,
          c.yongsin ? `용신: ${c.yongsin}.` : `용신 미구성.`,
        ],
        highlight: c.gyeokguk ? `핵심: ${c.gyeokguk} + ${strengthKo(c.strength)}` : `핵심: 일간 + ${strengthKo(c.strength)}`,
      };
    case 'today':
      return {
        label: stepLabels.today,
        title: `오늘 ${c.todayPillar} · ${c.todaySipsung}`,
        body: [
          `일진: ${c.todayPillar}.`,
          `십성: ${c.todaySipsung}. 12운성: ${c.todayUnsung}.`,
          `행동 가이드: ${c.todaySipsung} 관련 일에 시간 배분.`,
        ],
      };
    case 'closing':
      return {
        label: stepLabels.closing,
        title: '결론',
        body: [
          `구조: ${c.gyeokguk || '유동격'} + ${strengthKo(c.strength)}.`,
          `오늘 액션: ${c.todaySipsung}. 끝.`,
        ],
        highlight: '결정 미루지 말 것.',
      };
  }
}

function SF(step: Step, c: VoiceContext): VoiceOutput {
  switch (step) {
    case 'greeting':
      return {
        label: '도입',
        title: '가볍게 풀어볼게요',
        body: [
          `사주가 어렵다고 생각하셨다면, 오늘은 친근하게 풀어드릴게요.`,
          `다섯 단계로 정리했어요. 일간, 오행, 구조, 오늘 일진, 마무리.`,
          `읽고 나면 본인을 더 잘 이해하게 될 거예요.`,
        ],
      };
    case 'ilgan':
      return {
        label: stepLabels.ilgan,
        title: `${c.ilgan}일간, 이런 사람이에요`,
        body: [
          `당신의 일간은 ${c.ilgan}이에요. 오행으로는 ${c.ilganElement}이고, ${c.seasonHint}에 태어났어요.`,
          `${c.seasonHint}의 ${c.ilganElement}을 떠올려 보세요. 그게 당신이에요.`,
          `사주에서 가장 중요한 한 글자라서, 이 한 글자만 알아도 70%는 잡혀요.`,
        ],
      };
    case 'ohaeng':
      return {
        label: stepLabels.ohaeng,
        title: '오행 다섯 가지, 본인은 어디에?',
        body: [
          `목·화·토·금·수 다섯 가지 기운으로 사주를 봐요.`,
          `위 차트를 보면 본인에게 어떤 기운이 많고 적은지 한눈에 보여요.`,
          `많은 건 자연스러운 강점, 적은 건 의식하면 좋은 영역이에요.`,
        ],
      };
    case 'gyeokguk':
      return {
        label: stepLabels.gyeokguk,
        title: c.gyeokguk ? `${c.gyeokguk}, 당신의 핵심 성향` : '유연한 성향의 사주',
        body: [
          c.gyeokguk
            ? `당신은 ${c.gyeokguk}이라는 구조를 가졌어요. 쉽게 말하면 본인의 가장 큰 동기·기질이에요.`
            : `당신의 사주는 한 가지 격에 고정돼 있지 않아요. 그래서 더 유연하게 살 수 있는 타입.`,
          `신강도는 ${strengthKo(c.strength)}예요. ${c.strength === 'strong' ? '자기 주장이 분명한 편. 가끔 한 발 물러나면 더 좋아요.' : c.strength === 'weak' ? '주변과 잘 어울리는 타입. 결정할 땐 의식적으로 본인 마음을 챙기세요.' : '균형 잡힌 편. 상황에 맞게 잘 적응해요.'}`,
          c.yongsin ? `용신은 ${c.yongsin}. 이 기운이 들어올 때 본인이 가장 빛나요.` : ``,
        ].filter(Boolean) as string[],
      };
    case 'today':
      return {
        label: stepLabels.today,
        title: `오늘 일진 ${c.todayPillar}`,
        body: [
          `오늘은 ${c.todayPillar}일이에요. 본인에게 ${c.todaySipsung}의 영향이 있는 날이에요.`,
          `12운성은 ${c.todayUnsung}. ${unsungComment(c.todayUnsung)}`,
          `오늘은 ${c.todaySipsung} 영역에 마음을 쓰면 흐름이 잘 풀려요.`,
        ],
      };
    case 'closing':
      return {
        label: stepLabels.closing,
        title: '오늘 한 줄로',
        body: [
          `${strengthKo(c.strength)} 사주에, ${c.gyeokguk || '유연한 구조'}.`,
          `오늘은 ${c.todaySipsung}의 영역에 자연스럽게 손이 가는 날이에요.`,
        ],
        highlight: '본인의 결을 알면 결정이 가벼워져요.',
      };
  }
}

// 12운성 한 줄 해설
function unsungComment(us: string): string {
  const map: Record<string, string> = {
    장생: '새로운 시작에 좋은 기운입니다.',
    목욕: '변화 폭이 있는 날입니다. 흐름에 맡기되 결정은 신중히.',
    관대: '자신감·성장의 기운. 도전에 유리.',
    건록: '전성기 시작점. 핵심 일에 집중하면 좋습니다.',
    제왕: '에너지의 정점. 추진력 발휘 가능.',
    쇠: '기운이 한 박자 늦춰지는 날. 무리하지 마세요.',
    병: '쇠약·정체. 회복과 점검에 시간을.',
    사: '단절·막힘. 결정·확장은 다음 날로.',
    묘: '내면 회고에 좋은 기운.',
    절: '단절·전환의 시기. 정리에 유리.',
    태: '새 흐름의 잉태. 준비에 적합.',
    양: '서서히 자라나는 기운. 차분히 키우는 일에 좋음.',
  };
  return map[us] || '평이한 흐름의 날입니다.';
}

// ──────────────────────────────────────────────────────────────────
// 메인 export
// ──────────────────────────────────────────────────────────────────

export function voiceFor(group: PersonaGroup, step: Step, ctx: VoiceContext): VoiceOutput {
  switch (group) {
    case 'NT': return NT(step, ctx);
    case 'NF': return NF(step, ctx);
    case 'ST': return ST(step, ctx);
    case 'SF': return SF(step, ctx);
  }
}

export const STEPS: Step[] = ['greeting', 'ilgan', 'ohaeng', 'gyeokguk', 'today', 'closing'];
