// 카테고리(대분류) 9개 — 시그널·부동산·경제·금융·산업·정치·사회·국제·문화. 2026-10-09 분류 개편으로 정해졌다(docs/product/분류체계/README.md).
// 이름·순서는 영문 사이트(EN Daily)의 카테고리 체계(260929_카테고리체계_v0.4)를 따르고, 글이 없는 스포츠·오피니언은 두지 않는다.
// admin/frontend/src/lib/types.ts의 ECON_CATEGORIES와 같은 목록이지만 두 앱은 별도 Next.js 앱(각자 package.json)이라 공유 패키지가 없어 의도적으로 중복한다.
//
// label은 화면에 보이는 이름이고, dataLabels는 글(post.category)에 저장돼 있을 수 있는 값 전부다.
// 개편 전 글에는 옛 이름('증시', '금융·정책')이 저장돼 있어, 재분류가 끝날 때까지 두 이름을 같은 분류로 본다.
// 글의 분류를 비교할 때는 label과 직접 비교하지 말고 categoryMatches()/categoryForDataLabel()을 쓴다.
export interface EconCategoryConfig {
  slug: string;
  label: string;
  /** 글의 category 필드에 들어 있을 수 있는 값(새 이름 + 옛 이름). */
  dataLabels: readonly string[];
  /** 아카이브 페이지 설명(메타 description/헤더 부제) */
  description: string;
  /** 리스트 강조색 — archiveItems.ts의 TREND_ACCENT류와 같은 역할. */
  accent: string;
  /** buildCategoryPageMeta의 title 접미사("{label} — {metaSuffix}"). 생략하면 '경제 뉴스'이며, 문화처럼 경제 범주가 아닌 카테고리가 다르게 지정한다. */
  metaSuffix?: string;
}

export const ECON_CATEGORIES: readonly EconCategoryConfig[] = [
  // 영문 Market Signal. 옛 증시와 시그널(지면 코너)을 하나로 합쳤다. 주소는 색인된 글 약 700건을 지키려고 /markets를 그대로 쓴다.
  { slug: 'markets', label: '시그널', dataLabels: ['시그널', '증시'], description: '코스피·코스닥부터 개별 종목, 딜과 투자 소식까지 — 시장을 움직이는 신호.', accent: '#dc2626' },
  { slug: 'property', label: '부동산', dataLabels: ['부동산'], description: '집값, 전세, 공급대책 — 내 자산과 직결되는 부동산 이슈.', accent: '#b45309' },
  { slug: 'economy', label: '경제', dataLabels: ['경제'], description: '성장률·물가·세금·통상·에너지 — 나라 살림과 경제 흐름을 읽는 이슈.', accent: '#0369a1' },
  { slug: 'finance', label: '금융', dataLabels: ['금융', '금융·정책'], description: '은행·보험·카드·가상자산, 금리와 금융 정책까지 — 돈의 흐름을 바꾸는 이야기.', accent: '#059669' },
  { slug: 'industry', label: '산업', dataLabels: ['산업'], description: '반도체·자동차·플랫폼, 기업들이 만드는 산업의 흐름.', accent: '#1e40af' },
  { slug: 'politics', label: '정치', dataLabels: ['정치'], description: '대통령실·국회·외교안보 — 경제에 닿는 정치 이슈.', accent: '#9333ea' },
  { slug: 'national', label: '사회', dataLabels: ['사회'], description: '노동·교육·법조·지방자치 — 일상과 경제를 잇는 사회 이슈.', accent: '#b91c1c' },
  { slug: 'international', label: '국제', dataLabels: ['국제'], description: '미국·중국·일본, 해외에서 시작해 우리 경제로 번지는 이슈.', accent: '#7c3aed' },
  // 본지에도 문화 섹션이 있고 나머지 카테고리에 맞지 않는 lens 글(여행·트렌드·라이프스타일 등)이 있어 둔다.
  // economy 그룹 폴더 안에 있지만 성격은 경제가 아니므로 metaSuffix로 "경제 뉴스" 대신 다르게 표기한다.
  { slug: 'culture', label: '문화', dataLabels: ['문화'], description: '여행, 트렌드, 라이프스타일 — 일상에 스며든 문화 이슈.', accent: '#db2777', metaSuffix: '문화 뉴스' },
] as const;

const BY_DATA_LABEL: ReadonlyMap<string, EconCategoryConfig> = new Map(ECON_CATEGORIES.flatMap((c) => c.dataLabels.map((l) => [l, c] as const)));

/** 글의 category 값(새 이름이든 옛 이름이든)이 속한 카테고리. 없거나 모르는 값이면 undefined. */
export function categoryForDataLabel(value: string | null | undefined): EconCategoryConfig | undefined {
  return value ? BY_DATA_LABEL.get(value) : undefined;
}

/** 글의 category 값이 이 카테고리에 속하는가. */
export function categoryMatches(config: EconCategoryConfig, value: string | null | undefined): boolean {
  return !!value && config.dataLabels.includes(value);
}

/** 화면·검색용으로 글의 category 값을 새 이름으로 맞춘다. 모르는 값은 그대로(없으면 빈 문자열). */
export function displayCategoryLabel(value: string | null | undefined): string {
  return categoryForDataLabel(value)?.label ?? value ?? '';
}
