// 카테고리 하위 탭(2단 탭, en.sedaily.com/finance 참고 — "Home | Banking |
// Insurance | Card | Finance | General")용 taxonomy(2026-10-01 신설).
//
// 본지 실제 운영 DB의 메뉴 구조(1_ai_link/globe/ver2/마스터DB/04_기획·
// 요구사항/참고자료/메뉴구조.html, GET /cms/api/menus/tree 추출본)를 그대로
// 가져왔다 — AI LENS 카테고리와 1:1로 안 맞는 것도 있어(본지는 "경제"와
// "금융"이 따로지만 AI LENS는 "금융·정책" 하나) 가장 가까운 쪽을 썼다.
//
// 처음엔 증시·산업만 먼저 뒀다 — 실측 글 수(2026-10-01 기준 channel=lens
// 샘플 1000건) 산업 308 / 증시 303 / 국제 90 / 부동산 51 / 금융·정책 43 /
// 문화 12. 하위 6~7개로 쪼개면 국제·부동산·금융·정책은 하위 탭 하나당
// 10개 안팎, 문화는 거의 빈 탭이 된다 — "재테크" 카테고리를 분량 부족으로
// 없앴던 전례(econCategories.ts 참조)와 같은 문제라 처음엔 보류했는데,
// 사용자 요청으로 2026-10-01에 나머지 4개도 마저 추가했다. 값이 있는
// 탭만 뜨는 구조(CategoryArchiveClient.tsx의 subTabValues 필터)라 글이
// 적어도 UI가 깨지진 않는다 — 다만 문화처럼 분량이 아주 얇은 카테고리는
// 당분간 탭이 1~2개만 보일 수 있다.
//
// 금융·정책의 "가상자산"은 본지 메뉴 ko 라벨이 "금융"이지만 menuKey가
// virtualAssets라 그대로 쓰면 상위 카테고리명(금융·정책)과 하위 탭명이
// 똑같아져 혼동만 준다 — key 의미를 살려 이름만 바꿨다(유일한 편집 변경).
//
// "시그널"(econCategories.ts, filterBy:'paperSection')은 자체 taxonomy가
// 없다 — 이 페이지에 모이는 글은 실제로 증시(94%)·산업 글이 그대로
// paper_section만 "시그널"로 추가 태깅된 것이라(econCategories.ts 주석
// 참조), 그 글들이 markets/industry 백필 때 이미 받은 subcategory를
// 그대로 재사용한다. 그래서 여기엔 markets+industry 전체 값을 합쳐서
// 둔다 — 새로 분류할 필요 없이 값이 있는 탭만 자동으로 뜬다.
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
