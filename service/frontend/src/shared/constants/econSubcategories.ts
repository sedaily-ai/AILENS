// 카테고리 하위 탭(2단 탭)용 taxonomy. 본지 운영 DB의 메뉴 구조(1_ai_link/globe/ver2/마스터DB/04_기획·요구사항/참고자료/메뉴구조.html,
// GET /cms/api/menus/tree 추출본)를 가져왔으며, AI LENS 카테고리와 1:1로 맞지 않는 항목(본지는 "경제"와 "금융"이 분리,
// AI LENS는 "금융·정책" 하나)은 가장 가까운 쪽을 썼다.
// 값이 있는 탭만 뜨는 구조(CategoryArchiveClient.tsx의 subTabValues 필터)라 글이 적어도 UI가 깨지지 않는다.
// 다만 문화처럼 분량이 얇은 카테고리는 탭이 1~2개만 보일 수 있다.
// 금융·정책의 "가상자산"은 본지 메뉴 ko 라벨이 "금융"이지만 menuKey가 virtualAssets라, 상위 카테고리명과 같아지지 않도록 이름만 바꿨다.
// "시그널"(econCategories.ts, filterBy:'paperSection')은 자체 taxonomy가 없다. 이 페이지의 글은 증시·산업 글에
// paper_section만 "시그널"로 추가 태깅된 것이라 이미 받은 subcategory를 재사용하므로, markets+industry 값을 합쳐 둔다.
const ECON_SUBCATEGORIES: Readonly<Record<string, readonly string[]>> = {
  markets: ['국내증시', '해외증시', 'IB&Deal', '펀드·채권', '정책', '증권일반'],
  industry: ['대기업', '중기·IT', '유통·생활', '바이오', '기업인', '투자·재무', '기업일반'],
  property: ['정책', '부동산일반', '건설업계'],
  finance: ['은행', '보험', '카드', '가상자산', '금융일반'],
  international: ['미국·중남미', '일본·중국', '아시아·호주', '유럽', '중동·아프리카'],
  culture: ['전시·공연', '영화·미디어', '출판', '여행·레저', '문화일반', '아트씽'],
  signal: ['국내증시', '해외증시', 'IB&Deal', '펀드·채권', '정책', '증권일반', '대기업', '중기·IT', '유통·생활', '바이오', '기업인', '투자·재무', '기업일반'],
};

export function econSubcategoriesFor(slug: string): readonly string[] {
  return ECON_SUBCATEGORIES[slug] ?? [];
}
