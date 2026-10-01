// 경제 버티컬 카테고리(2026-08-17) — 발행된 51건을 실제로 다시 읽고 분류해
// 확정한 6개 고정 카테고리. admin/frontend/src/lib/types.ts의 ECON_CATEGORIES와
// 같은 목록이지만, admin/frontend와 service/frontend는 별도 Next.js
// 앱(각자 package.json)이라 공유 패키지가 없다 — 의도적 중복.
//
// 슬러그는 서울경제 영문사이트(Markets/Property/Business/Finance/
// International) 섹션 이름을 그대로 따랐다 — 같은 발행사 브랜드 체계와
// 맞추기 위해서다("증시" 헤드라인 상단 탭 논의 참조). 정치/사회/문화/스포츠는
// 뺐다 — 지금 발행 콘텐츠가 100% 경제/비즈니스라 그 탭들은 계속 비어있게
// 된다.
//
// 2026-09-11 — "재테크"(investing, 본지엔 없던 섹션, 개인 관점 리라이팅
// 차별점으로 신설했었음) 제거. 원문 최상위 카테고리 어디에도 "재테크"가
// 없어(daily-xml 전수조사 확인) 자동 파이프라인이 이 카테고리로 글을 분류할
// 방법이 사실상 없었고, 그 결과 /investing이 처음부터 계속 0건이었다(사용자
// 신고). 하위 태그("투자"/"투자·재무") 기반 보조 매칭을 한 번 시도해봤지만
// 실측 결과 하루 1건 수준으로 여전히 희박해, "굴러다니는 빈 카테고리를
// 유지하느니 없애는 게 낫다"는 판단으로 탭 자체를 없앴다(사용자 확인).
export interface EconCategoryConfig {
  slug: string;
  label: string;
  /** 아카이브 페이지 설명(메타 description/헤더 부제) */
  description: string;
  /** ArchiveHeader kicker·리스트 강조색 — archiveItems.ts의 TREND_ACCENT류와 같은 역할. */
  accent: string;
  /** buildCategoryPageMeta의 title 접미사("{label} — {metaSuffix}"). 안 주면
   *  '경제 뉴스'(경제/비즈니스 6개 카테고리의 기존 기본값). 문화처럼 경제
   *  범주가 아닌 카테고리를 위해 2026-08-20 추가. */
  metaSuffix?: string;
  /** 'paperSection'이면 이 카테고리 아카이브가 글의 category(주제) 대신
   *  paperSection("오늘의 지면" 특별 코너, archiveItems.ts 참조)으로
   *  필터링한다 — "시그널" 전용(2026-10-01). 안 주면 기존처럼 category로
   *  필터링(기본값). */
  filterBy?: 'paperSection';
}

export const ECON_CATEGORIES: readonly EconCategoryConfig[] = [
  { slug: 'markets', label: '증시', description: '코스피·코스닥부터 개별 종목까지, 시장을 움직이는 오늘의 숫자.', accent: '#dc2626' },
  // 2026-10-01 추가 — 본지(sedaily.com) 영문 사이트의 실제 GNB에 "Market
  // Signal"(국내증시/해외증시/IB&Deal/펀드채권/정책/증권일반 하위)이 상단
  // 1차 카테고리로 운영되고 있음을 메뉴구조.html(1_ai_link/globe 참고자료)로
  // 확인하고 신설(사용자 요청: "상단에 카테고리에 시그널 있음 좋겠는데").
  // AI LENS는 이 글(lens.paper_section='시그널')이 전부 category='증시'로도
  // 같이 잡혀 있어(2026-10-01 데이터 확인, 68건 중 64건) category가 아니라
  // paperSection으로 걸러야 한다 — filterBy 참조. 증시 바로 다음에 둔
  // 이유도 같다(내용이 가장 가까운 카테고리).
  // 같은 날 CategoryArchiveClient.tsx에 먼저 만들었던 "증시 안의 시그널
  // 서브탭"은 이 전용 페이지가 생기며 중복이라 제거했다(사용자가 서브탭
  // 방식을 명시로 반대: "그렇게 말구.. 상단에 카테고리에 시그널 있음
  // 좋겠는데").
  { slug: 'signal', label: '시그널', description: '지분 매각, M&A, 투자 유치 — 시장을 먼저 움직이는 딜의 신호.', accent: '#0f766e', filterBy: 'paperSection' },
  { slug: 'property', label: '부동산', description: '집값, 전세, 공급대책 — 내 자산과 직결되는 부동산 이슈.', accent: '#b45309' },
  { slug: 'industry', label: '산업', description: '반도체·자동차·플랫폼, 기업들이 만드는 산업의 흐름.', accent: '#1e40af' },
  { slug: 'finance', label: '금융·정책', description: '금리, 세제, 연금까지 — 경제의 룰을 바꾸는 정책 이야기.', accent: '#059669' },
  { slug: 'international', label: '국제', description: '미국·중국·일본, 해외에서 시작해 우리 경제로 번지는 이슈.', accent: '#7c3aed' },
  // 2026-08-20 추가 — 본지(서울경제)에도 문화 섹션이 있고, 여행·트렌드·
  // 라이프스타일처럼 나머지 6개 경제 카테고리 어디에도 안 맞는 lens 글이
  // 실제로 생겨서(빵지순례) 신설. economy 그룹 폴더 안에 있지만 성격은
  // 경제가 아니다 — 아래 metaSuffix로 "경제 뉴스" 대신 다르게 표기한다.
  { slug: 'culture', label: '문화', description: '여행, 트렌드, 라이프스타일 — 일상에 스며든 문화 이슈.', accent: '#db2777', metaSuffix: '문화 뉴스' },
] as const;

export type EconCategoryLabel = (typeof ECON_CATEGORIES)[number]['label'];

export function econCategoryBySlug(slug: string): EconCategoryConfig | undefined {
  return ECON_CATEGORIES.find((c) => c.slug === slug);
}
