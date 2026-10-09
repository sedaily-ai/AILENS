// 전체 메뉴(shared/ui/search/SearchOverlay.tsx)가 그리는 분류표.
// 대분류 9개(2026-10-09 결정): 시그널 · 부동산 · 경제 · 금융 · 산업 · 정치 · 사회 · 국제 · 문화. 국문·영문 사이트에 모두 있는 사회를 포함한다. 스포츠·오피니언은 글이 없어 두지 않는다.
// 이름과 순서는 영문 사이트(서울경제 EN Daily)의 카테고리 체계를 따른다(260929_카테고리체계_v0.4.html, 운영 DB 메뉴 2026-09-28 추출).
// 하위 카테고리는 영문 메뉴를 그대로 옮기지 않고, 지금 AI LENS에 글이 한 건이라도 있는 것만 둔다(2026-10-09 글 수 집계 기준). 개편 계획은 docs/product/분류체계/README.md.
//
// status
//   'live'    지금 페이지가 있다. href로 연결하고, subs는 글의 subcategory 값(econSubcategories.ts)과 같은 이름이라 ?sub= 로 거를 수 있다.
//   'planned' 아직 페이지·데이터가 없다(파이프라인이 이 분류를 붙이지 않는다). 메뉴에는 보이지 않는다. 분류 개편 2단계에서 live로 바꾼다.
//
// 분류 개편 1단계에서는 헤더 탭·분류 필터(ECON_CATEGORIES)를 건드리지 않는다. 글에 저장된 분류 값('증시' 등)과 이름이 달라지는 항목은 이 표에서만 새 이름을 쓴다.
export interface MenuCategory {
  slug: string;
  /** 메뉴에 보이는 이름(개편 후 이름). */
  label: string;
  /** 지금 연결되는 주소. planned면 빈 문자열. */
  href: string;
  /** 하위 카테고리. live면 글의 subcategory 값과 같은 이름만 둔다. */
  subs: readonly string[];
  status: 'live' | 'planned';
}

export const MENU_TAXONOMY: readonly MenuCategory[] = [
  // 영문 Market Signal. 증시와 시그널을 하나로 합친 분류. 지금은 /markets가 이 역할을 한다(글의 분류 값은 '증시').
  { slug: 'markets', label: '시그널', href: '/markets', subs: ['국내증시', '해외증시', 'IB&Deal', '펀드·채권', '정책', '증권일반'], status: 'live' },
  { slug: 'property', label: '부동산', href: '/property', subs: ['정책', '부동산일반', '건설업계'], status: 'live' },
  // 경제·정치는 지금 분류 값 자체가 없다(분류 없음 글 637건 안에 섞여 있음). 하위 분류는 재분류 뒤 글이 있는 것만 채운다.
  { slug: 'economy', label: '경제', href: '', subs: [], status: 'planned' },
  // 영문의 하위는 '금융'이지만 글에는 '가상자산'으로 저장돼 있어 데이터 이름을 쓴다(개편 2단계에서 맞춘다).
  { slug: 'finance', label: '금융', href: '/finance', subs: ['은행', '보험', '카드', '가상자산', '금융일반'], status: 'live' },
  { slug: 'industry', label: '산업', href: '/industry', subs: ['대기업', '중기·IT', '유통·생활', '바이오', '기업인', '투자·재무', '기업일반'], status: 'live' },
  { slug: 'politics', label: '정치', href: '', subs: [], status: 'planned' },
  // 사회(영문 National)도 분류 값이 없다. 분류 없음 글 중 약 15%로 추정(키워드 기준)이라 재분류 시험 실행 뒤 건수로 하위 분류를 정한다.
  { slug: 'national', label: '사회', href: '', subs: [], status: 'planned' },
  { slug: 'international', label: '국제', href: '/international', subs: ['미국·중남미', '일본·중국', '아시아·호주', '유럽', '중동·아프리카'], status: 'live' },
  // 전시·공연, 영화·미디어, 출판, 아트씽은 글이 한 건도 없어 뺐다.
  { slug: 'culture', label: '문화', href: '/culture', subs: ['문화일반', '여행·레저'], status: 'live' },
];

/** 메뉴에 보이는(페이지가 있는) 분류만. */
export function liveMenuCategories(): MenuCategory[] {
  return MENU_TAXONOMY.filter((c) => c.status === 'live');
}
