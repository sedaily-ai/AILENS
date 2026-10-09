// 카테고리 하위 탭(2단 탭)용 taxonomy. 영문 사이트(EN Daily) 카테고리 체계(260929_카테고리체계_v0.4, 본지 운영 DB 메뉴 구조)의 하위 메뉴를
// 한국어 이름으로 가져왔고, 2026-10-09 분류 개편에서 대분류 9개에 맞췄다(docs/product/분류체계/README.md).
// 값이 있는 탭만 뜨는 구조(CategoryArchiveClient.tsx의 subTabValues 필터)이고 전체 메뉴(SearchOverlay)도 글이 있는 하위만 보여 주므로,
// 여기에는 후보를 넉넉히 두어도 UI가 깨지지 않는다. 다만 영문 메뉴에만 있고 AI LENS에는 글이 없는 항목(스포츠·오피니언 계열 등)은 처음부터 넣지 않았다.
// 금융의 "가상자산"은 본지 메뉴 ko 라벨이 "금융"이지만 menuKey가 virtualAssets라, 상위 카테고리명과 같아지지 않도록 이름만 바꿨다.
// 이 목록은 pipelines/common/publish_utils.py의 SUBCATEGORY_MAP과 같은 값이다(의도적 복제).
const ECON_SUBCATEGORIES: Readonly<Record<string, readonly string[]>> = {
  markets: ['국내증시', '해외증시', 'IB&Deal', '펀드·채권', '정책', '증권일반'],
  property: ['정책', '부동산일반', '건설업계'],
  economy: ['경제분석', '세금·재정', '통상', '기후에너지', '경제일반'],
  finance: ['은행', '보험', '카드', '가상자산', '금융일반'],
  industry: ['대기업', '중기·IT', '유통·생활', '바이오', '기업인', '투자·재무', '기업일반'],
  politics: ['청와대', '국회', '총리실', '통일·외교·안보', '정치일반'],
  national: ['사회일반', '사건사고', '법조', '교육', '노동·고용', '행정', '지방자치'],
  international: ['미국·중남미', '일본·중국', '아시아·호주', '유럽', '중동·아프리카'],
  culture: ['전시·공연', '영화·미디어', '출판', '여행·레저', '문화일반', '아트씽'],
};

export function econSubcategoriesFor(slug: string): readonly string[] {
  return ECON_SUBCATEGORIES[slug] ?? [];
}
