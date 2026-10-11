// 레터 에디터(목업, 2026-10-10). 에디터는 "분류 담당"이 아니라 "누구의 관심 영역을 맡는가"(독자 페르소나 × 세부 분야)로 나눈다.
// 말투·입장은 모두 같다 — 모든 레터는 같은 중립 편집 원칙(주관·유도·권유 금지)을 따른다. 에디터는 AI 에디터이며 카드·프로필에 그렇게 표시한다.
// 한 레터는 여러 에디터에 속할 수 있다(레터의 주제가 에디터의 세부 분야와 겹치면). 독자는 에디터를 여러 명 팔로우한다.
import type { InterestItem } from './interestApi';
import type { IssueLetter } from './letterTypes';

export interface EditorTopic {
  /** 주제 사전 slug. soon=true 면 사전에 아직 없는 주제(표시만 하고 관심 저장에서는 뺀다). */
  slug: string;
  name: string;
  soon?: boolean;
}

export interface LetterEditor {
  id: string;
  name: string;
  /** 역할명(독자가 이 에디터를 찾는 이유). */
  role: string;
  /** "이런 분께" 한 줄. */
  forWhom: string;
  /** 자기소개(화면에 보이고 음성으로도 재생). 말투는 모든 에디터가 같다 — 중립 원칙. */
  intro: string;
  /** 프로필 이미지(public 경로). 없으면 이니셜 아바타. */
  image?: string;
  topics: EditorTopic[];
  tone: { bg: string; fg: string };
}

export const EDITORS: readonly LetterEditor[] = [
  {
    id: 'mincheol', name: '민철', role: '개인 투자 에디터', forWhom: '삼성전자·ETF 등 직접 투자하는 분',
    intro: '안녕하세요, 민철이에요. 저는 삼성전자 실적이나 금리, 환율처럼 직접 투자하는 분들이 확인하는 숫자를 보도 기준으로 정리해요. 해석보다 발표된 사실을 먼저 보여 드릴게요.',
    image: '/editors/intj.webp',
    topics: [{ slug: 'samsung-electronics', name: '삼성전자' }, { slug: 'sk-hynix', name: 'SK하이닉스' }, { slug: 'etf', name: 'ETF' }, { slug: 'rates', name: '금리' }, { slug: 'fx', name: '환율' }, { slug: 'ipo', name: '공모주·IPO' }, { slug: 'theme-stock', name: '테마주' }],
    tone: { bg: '#e8f0ff', fg: '#1f56c0' },
  },
  {
    id: 'soyul', name: '소율', role: '취업·경제 입문 에디터', forWhom: '경제를 처음 공부하거나 취업을 준비하는 분',
    intro: '안녕하세요, 소율이에요. 경제 뉴스가 처음이거나 취업을 준비하는 분들을 위해 어려운 용어와 기업 소식을 쉽게 풀어요. 모르는 말이 나오면 먼저 뜻부터 짚을게요.',
    image: '/editors/esfp.webp',
    topics: [{ slug: 'consumption', name: '소비' }, { slug: 'employment', name: '고용' }, { slug: 'platform', name: '플랫폼' }, { slug: 'content', name: '콘텐츠' }, { slug: 'recruit', name: '대기업 채용', soon: true }, { slug: 'terms', name: '경제 용어', soon: true }],
    tone: { bg: '#e5f5f2', fg: '#0b6b60' },
  },
  {
    id: 'ujin', name: '우진', role: '자영업·상권 에디터', forWhom: '가게를 운영하거나 동네 상권을 보는 분',
    intro: '안녕하세요, 우진이에요. 가게를 운영하는 분들이 마주하는 임대료와 상권, 최저임금 소식을 다뤄요. 제도가 바뀌면 무엇이 달라지는지 정리해 드려요.',
    topics: [{ slug: 'rent', name: '임대료' }, { slug: 'commercial-district', name: '상권' }, { slug: 'gentrification', name: '젠트리피케이션' }, { slug: 'seongsu', name: '성수동' }, { slug: 'minimum-wage', name: '최저임금' }, { slug: 'food-service', name: '외식업' }, { slug: 'retail', name: '유통' }, { slug: 'neighborhood', name: '도시·동네' }],
    tone: { bg: '#fdf1e2', fg: '#8f4f0a' },
  },
  {
    id: 'dajeong', name: '다정', role: '내 집 마련·교육 에디터', forWhom: '전세·청약·대출과 교육비를 따지는 분',
    intro: '안녕하세요, 다정이에요. 전세와 청약, 주택 대출, 교육과 육아 정책을 다뤄요. 제도가 바뀌는 시점과 기준을 먼저 보여 드릴게요.',
    image: '/editors/infp.webp',
    topics: [{ slug: 'jeonse', name: '전세' }, { slug: 'housing-subscription', name: '청약' }, { slug: 'loan', name: '대출' }, { slug: 'education', name: '교육' }, { slug: 'low-birth', name: '저출생' }, { slug: 'rates', name: '금리' }],
    tone: { bg: '#fde8ee', fg: '#b4234f' },
  },
  {
    id: 'jihu', name: '지후', role: '창업·스타트업 에디터', forWhom: '창업하거나 투자 흐름을 추적하는 분',
    intro: '안녕하세요, 지후예요. 벤처투자와 인공지능, 플랫폼 산업의 흐름을 따라가요. 시장 구조가 어떻게 바뀌는지 사례로 보여 드릴게요.',
    topics: [{ slug: 'startup', name: '스타트업' }, { slug: 'venture-investment', name: '벤처투자' }, { slug: 'ai', name: '인공지능' }, { slug: 'platform', name: '플랫폼' }, { slug: 'semiconductor', name: '반도체' }, { slug: 'k-beauty', name: 'K뷰티' }, { slug: 'amorepacific', name: '아모레퍼시픽' }],
    tone: { bg: '#efe9ff', fg: '#5b36c4' },
  },
  {
    id: 'siu', name: '시우', role: '부동산·규제 에디터', forWhom: '금리와 규제 속에서 부동산을 살피는 분',
    intro: '안녕하세요, 시우예요. 부동산 시세와 거래, 재건축, 규제 변화를 다뤄요. 금리와 정책이 시장에서 어떻게 확인됐는지 정리해요.',
    image: '/editors/istj.webp',
    topics: [{ slug: 'real-estate', name: '부동산 시장' }, { slug: 'redevelopment', name: '재건축·재개발' }, { slug: 'auction', name: '경매' }, { slug: 'regulation', name: '규제' }, { slug: 'tax', name: '세금' }, { slug: 'rates', name: '금리' }],
    tone: { bg: '#fff1d6', fg: '#8a5a00' },
  },
  {
    id: 'eunseo', name: '은서', role: '연금·노후 에디터', forWhom: '노후 현금흐름과 자산을 관리하는 분',
    intro: '안녕하세요, 은서예요. 연금 개편과 배당, 보험, 고령화 정책을 다뤄요. 제도가 수령액과 세금에 닿는 부분을 숫자로 정리해 드려요.',
    topics: [{ slug: 'pension', name: '연금' }, { slug: 'dividend', name: '배당' }, { slug: 'insurance', name: '보험' }, { slug: 'aging', name: '고령화' }, { slug: 'tax', name: '세금' }, { slug: 'medical', name: '의료비', soon: true }],
    tone: { bg: '#e7f3e8', fg: '#2f6b35' },
  },
  {
    id: 'daon', name: '다온', role: '글로벌·정책 에디터', forWhom: '해외 소식과 통화·통상 정책을 따라가는 분',
    intro: '안녕하세요, 다온이에요. 연준과 주요국 정책, 무역과 공급망 소식을 다뤄요. 어느 나라에서 무슨 결정이 나왔는지부터 짚을게요.',
    topics: [{ slug: 'fed', name: '연준' }, { slug: 'us', name: '미국' }, { slug: 'china', name: '중국' }, { slug: 'india', name: '인도' }, { slug: 'philippines', name: '필리핀' }, { slug: 'trade', name: '무역·통상' }, { slug: 'tariff', name: '관세' }, { slug: 'global-rebalancing', name: '글로벌 리밸런싱' }],
    tone: { bg: '#e3f2fb', fg: '#0d5f8f' },
  },
];

/** 레터의 주제 이름이 에디터의 세부 분야와 하나라도 겹치는 에디터들(겹침이 많은 순). */
export function editorsOfLetter(letter: Pick<IssueLetter, 'topics'>): LetterEditor[] {
  const names = new Set(letter.topics ?? []);
  return EDITORS.map((e) => ({ e, n: e.topics.filter((t) => names.has(t.name)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.e);
}

export function findEditor(id: string): LetterEditor | undefined {
  return EDITORS.find((e) => e.id === id);
}

/** 팔로우·구독 때 관심으로 저장되는 항목(주제 사전에 있는 주제만). */
export function editorInterests(e: LetterEditor): InterestItem[] {
  return e.topics.filter((t) => !t.soon).map((t) => ({ type: 'topic' as const, key: t.slug }));
}

export function unionInterests(editors: LetterEditor[]): InterestItem[] {
  const seen = new Set<string>();
  const out: InterestItem[] = [];
  for (const e of editors) for (const i of editorInterests(e)) if (!seen.has(i.key)) { seen.add(i.key); out.push(i); }
  return out;
}
