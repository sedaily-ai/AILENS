// 웹툰 전용 카테고리 — 2026-08-21에 "경제/금융/기업/정치/사회/국제/문화"
// 7개로 독립시켰다가(웹툰 소재가 좁은 금융 버티컬 밖으로 자주 나간다는
// 이유), 같은 날 사용자가 "경제 레터(ECON_CATEGORIES)와 같은 라벨 세트로
// 통일해 달라"고 확정을 뒤집어 econCategories.ts와 동일한 세트로 되돌렸다.
// 2026-09-11 — "재테크" 카테고리 자체를 제거(econCategories.ts 참조)하며
// 여기서도 같이 뺐다.
//
// admin/frontend/src/lib/types.ts의 WEBTOON_CATEGORIES와 라벨이 반드시
// 일치해야 한다 — admin이 저장하는 값(body_inline.category)을 이 목록이
// 그대로 필터링하기 때문이다. service/frontend와 admin/frontend는 별도
// Next.js 앱(각자 package.json)이라 공유 패키지가 없다 — 의도적 중복
// (econCategories.ts 상단 주석과 같은 이유).
export const WEBTOON_CATEGORIES = ['증시', '부동산', '산업', '금융·정책', '국제', '문화'] as const;
export type WebtoonCategory = (typeof WEBTOON_CATEGORIES)[number];
