// 경제 버티컬 카테고리(2026-08-17) — 발행된 51건을 실제로 다시 읽고 분류해
// 확정한 6개 고정 카테고리. admin/frontend/src/lib/types.ts의 ECON_CATEGORIES와
// 같은 목록이지만, admin/frontend와 service/frontend는 별도 Next.js
// 앱(각자 package.json)이라 공유 패키지가 없다 — 의도적 중복.
//
// 슬러그는 서울경제 영문사이트(Markets/Property/Business/Finance/
// International) 섹션 이름을 그대로 따랐다 — 같은 발행사 브랜드 체계와
// 맞추기 위해서다("증시" 헤드라인 상단 탭 논의 참조). "재테크"(investing)만
// 본지엔 없는 섹션 — 개인 관점 리라이팅이라는 AI LENS 자체 차별점이라
// 남겨뒀다. 정치/사회/문화/스포츠는 뺐다 — 지금 발행 콘텐츠가 100%
// 경제/비즈니스라 그 탭들은 계속 비어있게 된다.
export interface EconCategoryConfig {
  slug: string;
  label: string;
  /** 아카이브 페이지 설명(메타 description/헤더 부제) */
  description: string;
  /** ArchiveHeader kicker·리스트 강조색 — archiveItems.ts의 TREND_ACCENT류와 같은 역할. */
  accent: string;
}

export const ECON_CATEGORIES: readonly EconCategoryConfig[] = [
  { slug: 'markets', label: '증시', description: '코스피·코스닥부터 개별 종목까지, 시장을 움직이는 오늘의 숫자.', accent: '#dc2626' },
  { slug: 'property', label: '부동산', description: '집값, 전세, 공급대책 — 내 자산과 직결되는 부동산 이슈.', accent: '#b45309' },
  { slug: 'industry', label: '산업', description: '반도체·자동차·플랫폼, 기업들이 만드는 산업의 흐름.', accent: '#1e40af' },
  { slug: 'finance', label: '금융·정책', description: '금리, 세제, 연금까지 — 경제의 룰을 바꾸는 정책 이야기.', accent: '#059669' },
  { slug: 'international', label: '국제', description: '미국·중국·일본, 해외에서 시작해 우리 경제로 번지는 이슈.', accent: '#7c3aed' },
  { slug: 'investing', label: '재테크', description: '예금, ETF, 대출까지 — 내 지갑에 바로 쓸 수 있는 투자 상식.', accent: '#0891b2' },
] as const;

export type EconCategoryLabel = (typeof ECON_CATEGORIES)[number]['label'];

export function econCategoryBySlug(slug: string): EconCategoryConfig | undefined {
  return ECON_CATEGORIES.find((c) => c.slug === slug);
}
