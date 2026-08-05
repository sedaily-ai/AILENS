// 사주 Explore(flot.wrtn.ai식 콘텐츠 피드) mock 데이터.
// 결제경제(열쇠/가격) 제거 — 뉴스 서비스 내 무료 기능. 디자인-우선, 추후 백엔드 연결.

export type SajuCategory = '종합운' | '애정운' | '재물운' | '직업운' | '건강운';

export const CATEGORY_META: Record<SajuCategory, { color: string; soft: string }> = {
  종합운: { color: '#727cff', soft: '#eef0ff' },
  애정운: { color: '#ed598d', soft: '#ffeef4' },
  재물운: { color: '#22b74c', soft: '#e7f8ec' },
  직업운: { color: '#00afea', soft: '#e6f7fd' },
  건강운: { color: '#12bea5', soft: '#e6f8f5' },
};

export interface SajuCard {
  id: string;
  title: string;
  subtitle: string;
  category: SajuCategory;
  emoji: string; // 썸네일 자리(추후 이미지로 교체)
  badge?: 'NEW' | 'HOT';
  free?: boolean;
}

export interface SajuSection {
  id: string;
  title: string;
  layout: 'carousel' | 'grid'; // carousel=가로 스크롤(3:4 카드), grid=2열(가로 카드)
  cards: SajuCard[];
}

const c = (
  id: string,
  title: string,
  subtitle: string,
  category: SajuCategory,
  emoji: string,
  extra?: Partial<SajuCard>,
): SajuCard => ({ id, title, subtitle, category, emoji, ...extra });

export const QUICK_QUESTIONS: string[] = [
  '오늘 조심해야 하는 상황은?',
  '오늘 추천하는 시간대는 언제야?',
  '오늘 점메추 해줘',
  '오늘 내게 도움이 되는 사람은?',
  '오늘 가장 조심해야 하는 행동은?',
  '오늘 어떤 기회가 내게 올까?',
];

export const TRENDING: SajuCard[] = [
  c('t1', '내 운명의 상대, 언제 나타날까?', '만남의 시간표', '애정운', '💗', { badge: 'NEW' }),
  c('t2', '내 인생의 귀인은 누구일까', '귀인 몽타주', '종합운', '🔮', { badge: 'NEW' }),
  c('t3', '내 매력살은 몇 개일까?', '도화·홍염·화개', '애정운', '🍑', { badge: 'NEW' }),
  c('t4', '2026년 신년운세', '나의 2026년 미리보기', '종합운', '🎰'),
  c('t5', '나는 상위 몇 % 부자가 될까?', '나는 평생 얼마 벌까?', '재물운', '💰'),
  c('t6', '재회운, 언제 연락이 올까?', '재회하기 좋은 날', '애정운', '🌙'),
];

export const TODAY_START: SajuCard[] = [
  c('d1', '오늘의 운세 브리핑', '하루를 여는 한 줄', '종합운', '🌤️', { free: true }),
  c('d2', '오늘의 귀인과 상극', '오늘의 인간관계', '종합운', '🧭', { free: true }),
  c('d3', '오늘 그 사람과 나의 애정운', '그 마음은 어떨까', '애정운', '💞', { free: true }),
  c('d4', '오늘의 점메추', '오행 맞춤 한 끼', '종합운', '🍱', { free: true }),
  c('d5', '오늘만 운세 가챠', '한 번 돌려볼까', '종합운', '🎲', { free: true }),
];

export const EDITOR_PICK: SajuCard[] = [
  c('e1', '사주로 나를 브랜딩하기', '타고난 무기 찾기', '직업운', '🧩'),
  c('e2', '내 인생의 귀인은 누구일까', '귀인 몽타주', '종합운', '🔍'),
  c('e3', '나의 직업 운명 설계도', '10년 성공 플랜', '직업운', '🗺️'),
  c('e4', '평생 성공 시나리오 3가지', '내 인생 멀티엔딩', '종합운', '🎬'),
  c('e5', '내 사주 성공 방정식', '3년 로드맵', '직업운', '📈'),
];

export const SECTIONS: SajuSection[] = [
  { id: 'love', title: '나는 언제 연애할 수 있을까?', layout: 'carousel', cards: [
    c('lv1', '결혼운 종결 패키지', '한 권으로 결혼 끝!', '애정운', '💍'),
    c('lv2', '내 운명의 상대, 언제 나타날까?', '만남의 시간표', '애정운', '⏳'),
    c('lv3', '내 매력살은 몇 개일까?', '도화·홍염·화개', '애정운', '🍑'),
    c('lv4', '앞으로 3개월, 설렘이 올까?', '설렘 카운트다운', '애정운', '✨'),
    c('lv5', '일간별 연애 공략법', '플러팅 하는 법', '애정운', '💘'),
  ]},
  { id: 'reunion', title: '재회가 고민인 당신에게', layout: 'carousel', cards: [
    c('r1', '재회운, 언제 연락이 올까?', '재회하기 좋은 날', '애정운', '📞'),
    c('r2', '환승연애, X와 New 사이', '전남친·현썸남 궁합', '애정운', '🔀'),
    c('r3', '재회 D-DAY 카운트다운', '다시 만날 날은?', '애정운', '📆'),
    c('r4', 'X는 나한테 왜 그랬을까?', '그 사람 본성', '애정운', '🕵️'),
    c('r5', '재회 vs 새 인연', '그 사람 잡아야 할까?', '애정운', '⚖️'),
  ]},
  { id: 'money', title: '나는 부자가 될 수 있을까?', layout: 'grid', cards: [
    c('m1', '월급쟁이 탈출 사주 진단', '나만의 돈길은?', '재물운', '🚪'),
    c('m2', '내 투자 성향 DNA', '나만의 투자법', '재물운', '🧬'),
    c('m3', '사업 시작 시뮬레이터', '창업 사전분석', '재물운', '🚀'),
    c('m4', '나는 상위 몇 % 부자가 될까?', '평생 얼마 벌까', '재물운', '💵'),
  ]},
  { id: 'career', title: '취업·이직이 고민이라면', layout: 'carousel', cards: [
    c('cr1', '5년 이직 로드맵', '연봉 앞자리 바꾸기', '직업운', '🪜'),
    c('cr2', '나의 천직 발견 리포트', '타고난 업의 길', '직업운', '🎯'),
    c('cr3', '퇴사 타이밍 시뮬레이터', '지금 나가도 될까', '직업운', '🚪'),
    c('cr4', 'MBTI 직업 적성 가이드', '사주 X MBTI', '직업운', '🧭'),
    c('cr5', '내 첫 월급날 시뮬레이션', '합격 D-DAY', '직업운', '🗓️'),
  ]},
  { id: 'psych', title: '심리학 기반으로 나 알아보기', layout: 'grid', cards: [
    c('p1', '나의 내면아이 치유 리포트', '안의 나에게', '종합운', '🫧'),
    c('p2', '내 애착 유형 리포트', '불안형 vs 회피형', '애정운', '🔗'),
    c('p3', '나의 사랑언어 완전 분석', '내 사랑의 주파수', '애정운', '📡'),
    c('p4', '나의 번아웃 위험도 진단', '지금 나, 괜찮을까', '건강운', '🪫'),
  ]},
];

export const ALL_FORTUNE: SajuCard[] = [
  ...TRENDING, ...EDITOR_PICK, ...SECTIONS.flatMap((s) => s.cards),
  c('f1', '본능적으로 끌리는 운명의 상대는?', '내 운명의 짝', '애정운', '🧲', { free: true }),
  c('f2', 'MBTI보다 소름 돋는 핵심 성향', '나의 본질', '종합운', '🪞', { free: true }),
  c('f3', '나는 월급쟁이 팔자? 자본가 팔자?', '내 돈그릇', '재물운', '🏺', { free: true }),
  c('f4', '사주로 찾는 내 인생 운동은?', '몸에 맞는 길', '건강운', '🏃', { free: true }),
];
