// 레터 에디터(목업, 2026-10-10). 이전 서비스(MBTI 에디터)의 이름·MBTI 그룹·담당 분야·이미지·목소리를 그대로 이어 쓴다 — 출처: legacy/dev_v1/service/frontend/src/app/editors/[id]/editorsData.ts.
// 8명으로 줄였다(2026-10-11): 담당 분야가 겹치던 수빈·도윤·다은·유나는 하은·준서·소율에 합쳤다.
// 이미지(public/editors)가 있는 4명(민철 INTJ·하은 INFP·준서 ISTJ·소율 ESFP)을 앞에 두고, 나머지 4명(지훈·서연·예린·시우)은 손그림풍 졸라맨 선화(scripts/draw_editor_sketches.py)를 임시로 쓴다.
// 소개 음성(옛 기록: ElevenLabs eleven_multilingual_v2) voiceId — 민철 RU7aSi6lT4uQBXMLgDxK(TeddyNote), 하은 AW5wrnG1jVizOYY7R1Oo(JiYoung), 준서 5XgfKMHL4qnyg2mabE5t(Deck), 소율 QPFsEL6IBxlT15xfiD6C(Hana Lee).
// 에디터는 "누구의 관심 영역을 맡는가"로 나뉘고, 레터 본문은 모두 같은 중립 편집 원칙(주관·유도·권유 금지)을 따른다. 에디터는 AI 에디터이며 화면에 그렇게 표시한다.
// 한 레터는 주제가 에디터의 담당 분야와 겹치면 여러 에디터에 속한다. 독자는 에디터를 여러 명 팔로우한다.
import type { InterestItem } from './interestApi';
import type { IssueLetter } from './letterTypes';

export interface EditorTopic {
  /** 주제 사전 slug. */
  slug: string;
  name: string;
}

export interface LetterEditor {
  id: string;
  name: string;
  /** 옛 MBTI 4그룹(NT 전략·논리, NF 가치·의미, ST 실용·팩트, SF 공감·트렌드). */
  group: 'NT' | 'NF' | 'ST' | 'SF';
  /** 대표 4명만 MBTI가 정해져 있다. */
  mbti?: 'INTJ' | 'INFP' | 'ISTJ' | 'ESFP';
  nickname: string;
  /** 역할명(독자가 이 에디터를 찾는 이유). */
  role: string;
  /** "이런 분께" 한 줄. */
  forWhom: string;
  /** 자기소개(화면에 보이고 음성으로도 재생). */
  intro: string;
  /** 프로필 이미지(public 경로). 없으면 이니셜 아바타. */
  image?: string;
  /** 자기소개 음성(public 경로, 미리 생성한 mp3). 없으면 "소개 듣기" 버튼을 숨긴다. */
  voice?: string;
  topics: EditorTopic[];
  tone: { bg: string; fg: string };
}

export const EDITORS: readonly LetterEditor[] = [
  {
    id: 'mincheol', name: '민철', group: 'NT', mbti: 'INTJ', nickname: '분석가',
    role: '전략 분석 에디터', forWhom: '거시경제와 산업 흐름을 구조로 보고 싶은 분',
    intro: '안녕하세요. 민철입니다. 저는요, 뉴스를 볼 때 항상 숫자부터 봐요. 데이터가 뭐라고 하는지, 그게 중요하거든요. 핵심만 딱 전해드릴게요.',
    image: '/editors/intj.webp',
    voice: '/editors/voice/mincheol.mp3',
    topics: [{ slug: 'growth', name: '경제성장률' }, { slug: 'inflation', name: '물가' }, { slug: 'semiconductor', name: '반도체' }, { slug: 'platform', name: '플랫폼' }, { slug: 'regulation', name: '규제' }, { slug: 'fiscal', name: '재정' }],
    tone: { bg: '#f5f3ff', fg: '#5b21b6' },
  },
  {
    id: 'haeun', name: '하은', group: 'NF', mbti: 'INFP', nickname: '이야기꾼',
    role: '오피니언 에디터', forWhom: '숫자 뒤의 사람과 사회의 변화가 궁금한 분',
    intro: '안녕하세요, 하은이에요. 저는 뉴스 읽을 때, 그 뒤에 있는 사람들 이야기가 자꾸 눈에 들어오더라고요. 천천히, 같이 읽어봐요.',
    image: '/editors/infp.webp',
    voice: '/editors/voice/haeun.mp3',
    topics: [{ slug: 'low-birth', name: '저출생' }, { slug: 'labor', name: '노동' }, { slug: 'education', name: '교육' }, { slug: 'aging', name: '고령화' }, { slug: 'neighborhood', name: '도시·동네' }, { slug: 'climate', name: '환경·기후' }],
    tone: { bg: '#fff1f2', fg: '#9f1239' },
  },
  {
    id: 'junseo', name: '준서', group: 'ST', mbti: 'ISTJ', nickname: '실용주의자',
    role: '팩트 큐레이터', forWhom: '금융·증시와 기업 소식을 핵심만 보고 싶은 분',
    intro: '준서입니다. 저는 팩트만 전달해요. 언제, 어디서, 뭐가 있었는지. 그게 젤 중요하니까요.',
    image: '/editors/istj.webp',
    voice: '/editors/voice/junseo.mp3',
    topics: [{ slug: 'kospi', name: '코스피' }, { slug: 'samsung-electronics', name: '삼성전자' }, { slug: 'sk-hynix', name: 'SK하이닉스' }, { slug: 'earnings', name: '기업 실적' }, { slug: 'rates', name: '금리' }, { slug: 'bank', name: '은행' }],
    tone: { bg: '#ecfdf5', fg: '#047857' },
  },
  {
    id: 'soyul', name: '소율', group: 'SF', mbti: 'ESFP', nickname: '공감러',
    role: '트렌드 캐스터', forWhom: '어려운 경제 뉴스를 가볍게 시작하고 싶은 분',
    intro: '안녕! 소율이야. 경제뉴스 어렵지? 나도 처음엔 그랬어. 근데 쉽게 풀면 진짜 재밌거든. 같이 보자!',
    image: '/editors/esfp.webp',
    voice: '/editors/voice/soyul.mp3',
    topics: [{ slug: 'consumption', name: '소비' }, { slug: 'platform', name: '플랫폼' }, { slug: 'content', name: '콘텐츠' }, { slug: 'travel', name: '여행·관광' }, { slug: 'theme-stock', name: '테마주' }, { slug: 'neighborhood', name: '도시·동네' }, { slug: 'k-beauty', name: 'K뷰티' }, { slug: 'retail', name: '유통' }],
    tone: { bg: '#fffbeb', fg: '#92400e' },
  },
  {
    id: 'jihoon', name: '지훈', group: 'NT', nickname: '미래탐험가',
    role: 'AI·테크 전략가', forWhom: 'AI·반도체·빅테크의 다음 흐름을 따라가는 분',
    intro: 'AI·반도체·빅테크 — 다음 10년의 변수를 짚습니다. 기술 사이클을 단기 변동보다 산업 전체 흐름으로 봅니다. 글로벌 빅테크와 한국 기술 기업 사이의 격차·기회를 정리합니다.',
    image: '/editors/jihoon.svg',
    topics: [{ slug: 'ai', name: '인공지능' }, { slug: 'semiconductor', name: '반도체' }, { slug: 'platform', name: '플랫폼' }, { slug: 'startup', name: '스타트업' }, { slug: 'venture-investment', name: '벤처투자' }],
    tone: { bg: '#f5f3ff', fg: '#5b21b6' },
  },
  {
    id: 'seoyeon', name: '서연', group: 'NT', nickname: '제도설계자',
    role: '정책·거버넌스 분석가', forWhom: '정책과 규제가 시장에 닿는 경로가 궁금한 분',
    intro: '제도가 시장을 어떻게 움직이는지 추적합니다. 정책 입안부터 시행, 시장 반응까지의 사이클을 분석합니다. 규제 변화가 산업 구도에 미치는 영향을 정리합니다.',
    image: '/editors/seoyeon.svg',
    topics: [{ slug: 'regulation', name: '규제' }, { slug: 'national-assembly', name: '국회' }, { slug: 'tax', name: '세금' }, { slug: 'fiscal', name: '재정' }, { slug: 'diplomacy', name: '외교·안보' }],
    tone: { bg: '#f5f3ff', fg: '#5b21b6' },
  },
  {
    id: 'yerin', name: '예린', group: 'NF', nickname: '세계여행자',
    role: '국제·라이프 에디터', forWhom: '먼 나라의 소식을 사람의 이야기로 읽고 싶은 분',
    intro: '먼 나라 이야기 속의 사람을 봅니다. 국제 뉴스에서 통계와 정책 너머의 일상을 전합니다. 한 도시의 풍경, 한 사람의 결을.',
    image: '/editors/yerin.svg',
    topics: [{ slug: 'us', name: '미국' }, { slug: 'china', name: '중국' }, { slug: 'japan', name: '일본' }, { slug: 'india', name: '인도' }, { slug: 'philippines', name: '필리핀' }, { slug: 'europe', name: '유럽' }],
    tone: { bg: '#fff1f2', fg: '#9f1239' },
  },
  {
    id: 'siu', name: '시우', group: 'ST', nickname: '체크리스트',
    role: '생활경제 큐레이터', forWhom: '세금·부동산·소비 정보를 실생활에 쓰는 분',
    intro: '오늘 알면 내일 돈 되는 정보만. 세금·부동산·소비 혜택 등 실생활에 바로 쓰는 정보를 체크리스트로 정리합니다.',
    image: '/editors/siu.svg',
    topics: [{ slug: 'real-estate', name: '부동산 시장' }, { slug: 'rent', name: '임대료' }, { slug: 'tax', name: '세금' }, { slug: 'consumption', name: '소비' }, { slug: 'jeonse', name: '전세' }, { slug: 'loan', name: '대출' }],
    tone: { bg: '#ecfdf5', fg: '#047857' },
  },
];

/** 레터의 주제 이름이 에디터의 담당 분야와 하나라도 겹치는 에디터들(겹침이 많은 순). */
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

/** 팔로우·구독 때 관심으로 저장되는 항목(주제 사전의 주제). */
export function editorInterests(e: LetterEditor): InterestItem[] {
  return e.topics.map((t) => ({ type: 'topic' as const, key: t.slug }));
}

export function unionInterests(editors: LetterEditor[]): InterestItem[] {
  const seen = new Set<string>();
  const out: InterestItem[] = [];
  for (const e of editors) for (const i of editorInterests(e)) if (!seen.has(i.key)) { seen.add(i.key); out.push(i); }
  return out;
}
