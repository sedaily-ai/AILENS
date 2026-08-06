// 콘텐츠 카드 섹션(트렌드/칼럼/웹툰 등)이 순서대로 카드에 배정하는 강조색.
// 처음엔 섹션마다 각자 색을 새로 지어냈다 — 트렌드는 빨강/청록/보라/주황,
// 웹툰은 황토/더스티블루/브릭/플럼, 칼럼은 초록/보라/주황(rose 없이 3개)
// 식으로 제각각이었다("색상을 섹션마다 즉흥적으로 골랐다", 2026-08-06 디자인
// 감사). AI LENS의 4가지 관점(민철·하은·준서·소율 = NT/NF/ST/SF)이 이미
// SideRail·DNA 페이지 등에서 쓰는 브랜드 컬러라, 새로 만들지 않고 그대로
// 재사용한다 — "이 콘텐츠도 네 가지 시선 중 하나"라는 의미도 자연히 실린다.
export interface BrandAccent {
  accent: string;
  soft: string;
}

export const BRAND_ACCENTS: BrandAccent[] = [
  { accent: '#7c3aed', soft: '#f0edf7' }, // 민철 · NT
  { accent: '#e11d48', soft: '#fdeeee' }, // 하은 · NF
  { accent: '#059669', soft: '#e6f4ef' }, // 준서 · ST
  { accent: '#d97706', soft: '#f7f0e3' }, // 소율 · SF
];
