// 경제 버티컬 카테고리(고정 6개). admin/frontend/src/lib/types.ts의 ECON_CATEGORIES와 같은 목록이지만
// 두 앱은 별도 Next.js 앱(각자 package.json)이라 공유 패키지가 없어 의도적으로 중복한다.
// 슬러그는 서울경제 영문사이트(Markets/Property/Business/Finance/International) 섹션 이름을 따라 발행사 브랜드 체계와 맞춘다.
// 원문 최상위 카테고리에 대응 항목이 없는 카테고리는 두지 않는다("재테크"는 이 이유로 제외했다).
export interface EconCategoryConfig {
  slug: string;
  label: string;
  /** 아카이브 페이지 설명(메타 description/헤더 부제) */
  description: string;
  /** 리스트 강조색 — archiveItems.ts의 TREND_ACCENT류와 같은 역할. */
  accent: string;
  /** buildCategoryPageMeta의 title 접미사("{label} — {metaSuffix}"). 생략하면 '경제 뉴스'이며, 문화처럼 경제 범주가 아닌 카테고리가 다르게 지정한다. */
  metaSuffix?: string;
  /** 'paperSection'이면 이 카테고리 아카이브가 글의 category(주제) 대신 paperSection("오늘의 지면" 특별 코너, archiveItems.ts 참조)으로 필터링한다("시그널" 전용). 생략하면 category로 필터링한다. */
  filterBy?: 'paperSection';
}

export const ECON_CATEGORIES: readonly EconCategoryConfig[] = [
  { slug: 'markets', label: '증시', description: '코스피·코스닥부터 개별 종목까지, 시장을 움직이는 오늘의 숫자.', accent: '#dc2626' },
  // 본지 GNB에 "Market Signal"(국내증시/해외증시/IB&Deal/펀드채권/정책/증권일반 하위)이 1차 카테고리로 운영되어 대응시킨다.
  // 이 글(lens.paper_section='시그널')은 category='증시'로도 함께 잡혀 있어 category가 아니라 paperSection으로 걸러야 한다(filterBy 참조).
  // 내용이 가장 가까운 증시 바로 다음에 둔다.
  { slug: 'signal', label: '시그널', description: '지분 매각, M&A, 투자 유치 — 시장을 먼저 움직이는 딜의 신호.', accent: '#0f766e', filterBy: 'paperSection' },
  { slug: 'property', label: '부동산', description: '집값, 전세, 공급대책 — 내 자산과 직결되는 부동산 이슈.', accent: '#b45309' },
  { slug: 'industry', label: '산업', description: '반도체·자동차·플랫폼, 기업들이 만드는 산업의 흐름.', accent: '#1e40af' },
  { slug: 'finance', label: '금융·정책', description: '금리, 세제, 연금까지 — 경제의 룰을 바꾸는 정책 이야기.', accent: '#059669' },
  { slug: 'international', label: '국제', description: '미국·중국·일본, 해외에서 시작해 우리 경제로 번지는 이슈.', accent: '#7c3aed' },
  // 본지에도 문화 섹션이 있고 나머지 경제 카테고리에 맞지 않는 lens 글(여행·트렌드·라이프스타일 등)이 있어 둔다.
  // economy 그룹 폴더 안에 있지만 성격은 경제가 아니므로 metaSuffix로 "경제 뉴스" 대신 다르게 표기한다.
  { slug: 'culture', label: '문화', description: '여행, 트렌드, 라이프스타일 — 일상에 스며든 문화 이슈.', accent: '#db2777', metaSuffix: '문화 뉴스' },
] as const;
