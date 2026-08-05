export type EditorGroup = 'NT' | 'NF' | 'ST' | 'SF';

export interface EditorDetail {
  id: string;
  group: EditorGroup;
  name: string;
  role: string;
  nickname: string;
  bio: string;
  longBio: string;
  philosophy: string;
  signature: string[];
  picksThisWeek: number;
  totalPicks: number;
  followers: string;
  joinedAt: string;
  avatar: string;
  accent: string;
  accentBg: string;
  accentInk: string;
  tone: string;
  sampleHeadlines: { title: string; comment: string; category: string; date?: string }[];
}

const NT_STYLE = { accent: '#7c3aed', accentBg: '#f5f3ff', accentInk: '#5b21b6' };
const NF_STYLE = { accent: '#e11d48', accentBg: '#fff1f2', accentInk: '#9f1239' };
const ST_STYLE = { accent: '#059669', accentBg: '#ecfdf5', accentInk: '#047857' };
const SF_STYLE = { accent: '#d97706', accentBg: '#fffbeb', accentInk: '#92400e' };

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&scale=110`;

export const editors: EditorDetail[] = [
  // ── NT 전략·논리 ──
  {
    id: 'NT-min', group: 'NT', name: '민철', role: '전략 분석 에디터', nickname: '분석가',
    bio: '데이터로 본질만 짚어드립니다. 감정 빼고 구조만.',
    longBio: '거시경제와 IT·산업 흐름을 비교 분석해 단 한 편을 골라 전합니다. 인과·구조 차이를 데이터로 보여주는 것이 강점입니다.',
    philosophy: '감정은 변수에 넣지 않는다. 변수의 관계가 모든 답이다.',
    signature: ['거시경제', 'IT·산업', '정책'], picksThisWeek: 28, totalPicks: 412, followers: '12.4K',
    joinedAt: '2025.11',
    avatar: '/editors/intj.webp', ...NT_STYLE,
    tone: '구조적·분석적·단정형',
    sampleHeadlines: [
      { title: "'해양수도' 전략은 과거 실패와 뭐가 다른가", category: '전략·정책', comment: '30년 침체의 구조를 분해. 변수 3개.', date: '05.13' },
      { title: 'HBM3E 양산, 메모리 사이클의 변곡점', category: '경제', comment: '핵심 변수 셋. 공급·캡엑스·환율.', date: '05.12' },
      { title: '비메모리 노노갈등의 구조적 원인', category: '경제', comment: '성과급 격차가 드러내는 사업부 경쟁 구도.', date: '05.11' },
      { title: 'K엔비디아 NPU 외면, 왜 위험한가', category: 'IT·과학', comment: '공공기관 도입률이 시그널이 되는 이유.', date: '05.10' },
      { title: '4세 승계 본격화 — 핵심 변수', category: '거버넌스', comment: '재무 구조 개선 + 포트폴리오 조정.', date: '05.09' },
      { title: '연준의 금리 결정, 시나리오별 영향', category: '글로벌', comment: '컨센은 동결. 변동성은 점도표에서.', date: '05.08' },
      { title: 'AI 반도체 시장 점유율 재편', category: 'IT·과학', comment: '엔비디아 의존도 완화의 첫 신호.', date: '05.07' },
      { title: '한·미 AI 데이터센터 협상의 진짜 변수', category: '글로벌', comment: '전력 + 부지 + 인력. 셋 다 한국이 약함.', date: '05.06' },
    ],
  },
  {
    id: 'NT-ji', group: 'NT', name: '지훈', role: 'AI·테크 전략가', nickname: '미래탐험가',
    bio: 'AI·반도체·빅테크 — 다음 10년의 변수를 짚습니다.',
    longBio: '기술 사이클을 단기 변동보다 산업 전체 흐름으로 봅니다. 글로벌 빅테크와 한국 기술 기업 사이의 격차·기회를 정리합니다.',
    philosophy: '오늘의 주가가 아니라 10년의 곡선을 봐야 한다.',
    signature: ['AI', '반도체', '빅테크'], picksThisWeek: 19, totalPicks: 287, followers: '8.7K',
    joinedAt: '2025.12',
    avatar: dicebear('jihoon-tech-NT'), ...NT_STYLE,
    tone: '미래·기술·사이클 관점',
    sampleHeadlines: [
      { title: '엔비디아 차세대 GPU 로드맵 변경', category: 'IT·과학', comment: '단기보다 2027년 캐파 분석이 의미 있다.' },
      { title: 'TSMC 2nm 공정 일정', category: 'IT·과학', comment: '삼성과의 격차가 다시 벌어지는 시점.' },
    ],
  },
  {
    id: 'NT-seo', group: 'NT', name: '서연', role: '정책·거버넌스 분석가', nickname: '제도설계자',
    bio: '제도가 시장을 어떻게 움직이는지 추적합니다.',
    longBio: '정책 입안부터 시행, 시장 반응까지의 사이클을 분석합니다. 규제 변화가 산업 구도에 미치는 영향을 정리합니다.',
    philosophy: '규제는 미래의 가격이다.',
    signature: ['정책', '규제', '거버넌스'], picksThisWeek: 16, totalPicks: 198, followers: '6.3K',
    joinedAt: '2026.01',
    avatar: dicebear('seoyeon-policy-NT'), ...NT_STYLE,
    tone: '제도·법·거버넌스 관점',
    sampleHeadlines: [
      { title: '플랫폼법 입법 동향', category: '정치', comment: '시장 진입 비용을 직접 결정하는 변수.' },
    ],
  },

  // ── NF 의미·공감 ──
  {
    id: 'NF-ha', group: 'NF', name: '하은', role: '오피니언 에디터', nickname: '이야기꾼',
    bio: '숫자 뒤에 있는 사람의 이야기를 함께 읽습니다.',
    longBio: '뉴스 안에 담긴 가치와 의미, 사람의 결을 따라가는 글을 씁니다. 빠른 결론보다 천천히 머무는 시간을 만듭니다.',
    philosophy: '뉴스는 결국 한 사람의 이야기다.',
    signature: ['사회', '문화', '국제'], picksThisWeek: 24, totalPicks: 356, followers: '9.8K',
    joinedAt: '2025.11',
    avatar: '/editors/infp.webp', ...NF_STYLE,
    tone: '성찰적·감성적·여운 있는',
    sampleHeadlines: [
      { title: "'청년이 부산을 떠나지 않는 도시'…30년 침체의 본질", category: '인구·지방', comment: '도시는 누구의 삶을 위해 방향을 정해야 하는가.', date: '05.13' },
      { title: '청년 주거 문제, 통계 너머의 삶', category: '사회', comment: '숫자 한 자리 변화가 누군가에게는 한 해의 무게.', date: '05.12' },
      { title: '저출생 위기, 한 부부의 1년', category: '사회', comment: '정책이 닿지 못한 일상의 결.', date: '05.11' },
      { title: '기후 위기, 작은 마을의 기록', category: '국제', comment: '거대한 이야기 속의 작은 결을 찾았다.', date: '05.10' },
      { title: '교사들이 사라진 학교, 다음 세대의 무게', category: '사회', comment: '제도 변화 뒤에 남은 사람들의 시간.', date: '05.09' },
      { title: 'AI 시대, 우리 아이들에게 묻는 질문', category: '사회', comment: '도구를 배우기 전에 가치를 묻는 순간.', date: '05.08' },
      { title: '한 자영업자의 회복기 — 코로나 5년 후', category: '사회', comment: '통계가 닿지 않는 결을 따라가봤어요.', date: '05.07' },
    ],
  },
  {
    id: 'NF-su', group: 'NF', name: '수빈', role: '문화·사회 에세이스트', nickname: '관찰자',
    bio: '오늘의 뉴스가 우리 삶에 닿는 결을 천천히 적습니다.',
    longBio: '문화와 세대, 가치관의 변화를 에세이 형식으로 풉니다. 빠르지 않게, 깊이 있게.',
    philosophy: '변화는 늘 작은 결로 먼저 온다.',
    signature: ['세대', '문화', '에세이'], picksThisWeek: 18, totalPicks: 234, followers: '11.2K',
    joinedAt: '2025.12',
    avatar: dicebear('subin-culture-NF'), ...NF_STYLE,
    tone: '에세이·문장 호흡',
    sampleHeadlines: [
      { title: '2030 세대의 새로운 소비 결', category: '문화', comment: '소비는 가장 정직한 가치 표현이다.' },
    ],
  },
  {
    id: 'NF-ye', group: 'NF', name: '예린', role: '국제·라이프 에디터', nickname: '세계여행자',
    bio: '먼 나라 이야기 속의 사람을 봅니다.',
    longBio: '국제 뉴스에서 통계와 정책 너머의 일상을 전합니다. 한 도시의 풍경, 한 사람의 결을.',
    philosophy: '먼 나라의 일도 결국 우리 이야기다.',
    signature: ['국제', '인권', '라이프'], picksThisWeek: 21, totalPicks: 267, followers: '7.4K',
    joinedAt: '2026.01',
    avatar: dicebear('yerin-global-NF'), ...NF_STYLE,
    tone: '국제·일상·인간적',
    sampleHeadlines: [
      { title: '유럽 청년 실업, 같은 시대의 다른 풍경', category: '국제', comment: '비교는 위로가 아니라 거울이다.' },
    ],
  },

  // ── ST 팩트·실용 ──
  {
    id: 'ST-jun', group: 'ST', name: '준서', role: '팩트 큐레이터', nickname: '실용주의자',
    bio: '결론부터. 3분 안에 핵심만.',
    longBio: '시간 대비 정보 밀도가 높은 기사만 추립니다. 수식어 빼고 사실과 숫자만 정리합니다.',
    philosophy: '결론이 먼저, 이유는 나중.',
    signature: ['금융·증시', '기업', '실용 정보'], picksThisWeek: 31, totalPicks: 478, followers: '15.2K',
    joinedAt: '2025.10',
    avatar: '/editors/istj.webp', ...ST_STYLE,
    tone: '결론 중심·간결·팩트',
    sampleHeadlines: [
      { title: '주담대 갈아타기 체크리스트 3개', category: '경제', comment: '오늘부터 0.X%p 인하 적용. 즉시 확인.', date: '05.13' },
      { title: '오늘 코스피 마감 핵심', category: '경제', comment: '지수 -0.8%, 외국인 순매도 4일째.', date: '05.12' },
      { title: '실적 발표 일정 정리 — 이번 주 핵심 4개 종목', category: '경제', comment: '컨센 대비 변동성 주의.', date: '05.11' },
      { title: '동전주 병합 러시, 상폐 요건 강화 영향', category: '경제', comment: '5월 안 병합 일정 5개.', date: '05.10' },
      { title: '캠코 새출발기금 손실 1.4조 — 핵심 사실', category: '경제', comment: '63년 누적 이익잉여금보다 많음.', date: '05.09' },
      { title: '인텔 서학개미 최애주 — 진입 체크포인트', category: '경제', comment: '매수 비중 변화. 3개 체크.', date: '05.08' },
      { title: '한화솔루션 유증 신고서 — 정정 가능성', category: '경제', comment: '금감원 보완 요구 — 일정 영향.', date: '05.07' },
    ],
  },
  {
    id: 'ST-do', group: 'ST', name: '도윤', role: '금융·증시 전담', nickname: '시장지킴이',
    bio: '오늘 장 마감, 핵심만 정리해서 드립니다.',
    longBio: '시장 데이터를 빠르고 정확하게. 분석은 길지 않게, 숫자는 정확하게.',
    philosophy: '시장은 짧게 말하고, 길게 듣는다.',
    signature: ['주식', '채권', '환율'], picksThisWeek: 36, totalPicks: 521, followers: '20.1K',
    joinedAt: '2025.10',
    avatar: dicebear('doyoon-finance-ST'), ...ST_STYLE,
    tone: '시장 데이터·간결',
    sampleHeadlines: [
      { title: '원·달러 환율 1,420원대 진입', category: '경제', comment: '단기 박스권 상단 돌파, 모니터링 필요.' },
    ],
  },
  {
    id: 'ST-si', group: 'ST', name: '시우', role: '생활경제 큐레이터', nickname: '체크리스트',
    bio: '오늘 알면 내일 돈 되는 정보만.',
    longBio: '세금·부동산·소비 혜택 등 실생활에 바로 쓰는 정보를 체크리스트로 정리합니다.',
    philosophy: '아는 만큼 손해를 줄인다.',
    signature: ['부동산', '세금', '소비'], picksThisWeek: 14, totalPicks: 178, followers: '13.8K',
    joinedAt: '2025.12',
    avatar: dicebear('siwoo-life-ST'), ...ST_STYLE,
    tone: '체크리스트·실용',
    sampleHeadlines: [
      { title: '청년 주택 청약, 이달 바뀌는 것', category: '경제', comment: '소득 기준 변경 — 본인 적용 여부 확인.' },
    ],
  },

  // ── SF 트렌드·재미 ──
  {
    id: 'SF-soy', group: 'SF', name: '소율', role: '트렌드 캐스터', nickname: '공감러',
    bio: '친근하게, 가볍게 시작해서 깊게 들어갑니다.',
    longBio: '혼자 보기 아까운 뉴스를 친구처럼 전합니다. 가볍지만 알맹이는 빠뜨리지 않습니다.',
    philosophy: '재미는 정보를 가장 멀리 나르는 도구다.',
    signature: ['라이프', 'IT·트렌드', '문화'], picksThisWeek: 22, totalPicks: 298, followers: '18.6K',
    joinedAt: '2025.11',
    avatar: '/editors/esfp.webp', ...SF_STYLE,
    tone: '친근·SNS·공감',
    sampleHeadlines: [
      { title: '친구야 부산이 30년째 내리막이었대 🏙️', category: '라이프', comment: '근데 이번엔 다를 수도 있다는 얘기.', date: '05.13' },
      { title: '오늘 SNS 핫한 브랜드 뉴스', category: '문화', comment: '단톡방 화제로 좋은 주제. 가볍게 시작.', date: '05.12' },
      { title: '엄마한테 보낼 환율 얘기 한 줄', category: '라이프', comment: '1,420원대 진입 — 해외직구 타이밍.', date: '05.11' },
      { title: '북항 돔구장? 야구팬이라면 주목해봐 ⚾', category: '라이프', comment: '비 와도 야구 보는 시대.', date: '05.10' },
      { title: '엽기떡볶이 마라맛, 일주일 만에 동난 이유', category: '문화', comment: '진짜 매워서 그런 거 아님. 마케팅 분석.', date: '05.09' },
      { title: 'K뷰티 ODM 산업 — 친구한테 설명하면', category: '라이프', comment: '아모레·LG생건 말고 진짜 돈 버는 곳.', date: '05.08' },
      { title: '폼 미쳤다 — 요즘 Z세대 한 줄 정리', category: '문화', comment: '단톡방에서 쓰면 알아듣는 친구 = 동기.', date: '05.07' },
    ],
  },
  {
    id: 'SF-yu', group: 'SF', name: '유나', role: '브랜드·라이프 에디터', nickname: '인플루언서',
    bio: '소비자 시각으로 브랜드와 마케팅을 봅니다.',
    longBio: '무엇이 왜 잘 팔리는지, 사람의 언어로 풀어 전합니다.',
    philosophy: '브랜드는 결국 사람의 선택이다.',
    signature: ['브랜드', '소비', 'F&B'], picksThisWeek: 26, totalPicks: 341, followers: '24.3K',
    joinedAt: '2025.10',
    avatar: dicebear('yuna-brand-SF'), ...SF_STYLE,
    tone: '브랜드·소비자·트렌드',
    sampleHeadlines: [
      { title: '신생 카페 브랜드 화제의 이유', category: '문화', comment: '제품이 아니라 동선이 핵심이었다.' },
    ],
  },
  {
    id: 'SF-da', group: 'SF', name: '다은', role: '컬처·엔터 캐스터', nickname: '재미수집가',
    bio: '오늘 사람들이 무엇을 보고 무엇을 말하는지.',
    longBio: '엔터·콘텐츠·SNS 트렌드를 한눈에 정리합니다.',
    philosophy: '오늘의 화제가 내일의 시장이다.',
    signature: ['K팝', '드라마', 'SNS'], picksThisWeek: 33, totalPicks: 487, followers: '31.7K',
    joinedAt: '2025.09',
    avatar: dicebear('daeun-culture-SF'), ...SF_STYLE,
    tone: '컬처·엔터·SNS',
    sampleHeadlines: [
      { title: '주말 박스오피스 깜짝 1위', category: '문화', comment: '입소문이 광고를 이긴 사례.' },
    ],
  },
];

export function getEditor(id: string): EditorDetail | undefined {
  return editors.find((e) => e.id === id);
}
