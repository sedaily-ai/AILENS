// 레터 에디터(목업, 2026-10-09). 에디터는 "문체나 성향"이 아니라 "담당 분야"로만 나눈다 — 모든 레터는 같은 중립 편집 원칙을 따른다(주관·유도·권유 금지).
// 에디터는 AI 에디터이며 카드에 그렇게 표시한다. 담당 분야는 레터의 주 분류(categories[0])로 정해지고, 구독하면 담당 분야·주제와 겹치는 새 레터가 온다.
import type { InterestItem } from './interestApi';
import type { IssueLetter } from './letterTypes';

export interface LetterEditor {
  id: string;
  name: string;
  title: string;
  bio: string;
  /** 화면에 보이는 분류 이름(레터의 categories[0] 과 비교). */
  categories: string[];
  /** 대표 주제(주제 사전 slug). 구독하면 분류와 함께 관심으로 저장된다. */
  topics: { slug: string; name: string }[];
  tone: { bg: string; fg: string };
  /** 구독 시 관심으로 저장되는 분류 slug. */
  categorySlugs: string[];
}

export const EDITORS: readonly LetterEditor[] = [
  {
    id: 'hajun', name: '하준', title: '시장·경제 에디터', categories: ['시그널', '경제', '금융'], categorySlugs: ['markets', 'economy', 'finance'],
    bio: '증시와 금리·환율, 물가와 성장 지표를 보도 기준으로 짚어요. 숫자가 어떻게 움직였는지를 먼저 보여 드려요.',
    topics: [{ slug: 'rates', name: '금리' }, { slug: 'fx', name: '환율' }, { slug: 'kospi', name: '코스피' }, { slug: 'earnings', name: '기업 실적' }],
    tone: { bg: '#e8f0ff', fg: '#1f56c0' },
  },
  {
    id: 'seoyun', name: '서윤', title: '부동산·상권 에디터', categories: ['부동산'], categorySlugs: ['property'],
    bio: '전세, 청약, 재건축과 상권의 변화를 다뤄요. 제도가 바뀌면 무엇이 달라지는지를 정리해요.',
    topics: [{ slug: 'rent', name: '임대료' }, { slug: 'redevelopment', name: '재건축·재개발' }, { slug: 'commercial-district', name: '상권' }, { slug: 'jeonse', name: '전세' }],
    tone: { bg: '#fdf1e2', fg: '#8f4f0a' },
  },
  {
    id: 'doyun', name: '도윤', title: '산업·기업 에디터', categories: ['산업'], categorySlugs: ['industry'],
    bio: '반도체와 플랫폼, 소비재까지 기업이 움직이는 방향을 살펴요. 실적과 전략 발표를 나란히 놓고 읽어요.',
    topics: [{ slug: 'semiconductor', name: '반도체' }, { slug: 'ai', name: '인공지능' }, { slug: 'k-beauty', name: 'K뷰티' }, { slug: 'global-rebalancing', name: '글로벌 리밸런싱' }],
    tone: { bg: '#e5f5f2', fg: '#0b6b60' },
  },
  {
    id: 'jia', name: '지아', title: '글로벌·정책 에디터', categories: ['국제', '정치'], categorySlugs: ['international', 'politics'],
    bio: '해외에서 시작해 우리 경제로 번지는 소식과 정책 변화를 다뤄요. 어느 나라에서 무슨 결정이 나왔는지부터 짚어요.',
    topics: [{ slug: 'us', name: '미국' }, { slug: 'china', name: '중국' }, { slug: 'trade', name: '무역·통상' }, { slug: 'regulation', name: '규제' }],
    tone: { bg: '#efe9ff', fg: '#5b36c4' },
  },
  {
    id: 'narin', name: '나린', title: '생활·문화 에디터', categories: ['사회', '문화'], categorySlugs: ['national', 'culture'],
    bio: '동네와 소비, 여행과 일터의 변화를 다뤄요. 일상에서 보이는 현상을 보도로 풀어 드려요.',
    topics: [{ slug: 'travel', name: '여행·관광' }, { slug: 'neighborhood', name: '도시·동네' }, { slug: 'labor', name: '노동' }, { slug: 'consumption', name: '소비' }],
    tone: { bg: '#fde8ee', fg: '#b4234f' },
  },
];

export function editorOfLetter(letter: Pick<IssueLetter, 'categories'>): LetterEditor | undefined {
  const primary = letter.categories[0];
  return EDITORS.find((e) => e.categories.includes(primary));
}

export function findEditor(id: string): LetterEditor | undefined {
  return EDITORS.find((e) => e.id === id);
}

export function editorInterests(e: LetterEditor): InterestItem[] {
  return [...e.categorySlugs.map((key) => ({ type: 'category' as const, key })), ...e.topics.map((t) => ({ type: 'topic' as const, key: t.slug }))];
}
