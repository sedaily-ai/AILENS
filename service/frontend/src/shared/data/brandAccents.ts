// 콘텐츠 카드 섹션(트렌드/칼럼/웹툰 등)이 순서대로 카드에 배정하는 강조색.
// AI LENS의 4가지 관점(민철·하은·준서·소율 = NT/NF/ST/SF)이 SideRail·DNA 페이지 등에서 쓰는 브랜드 컬러를 그대로 재사용해,
// 섹션마다 색을 새로 정하지 않고 "이 콘텐츠도 네 가지 시선 중 하나"라는 의미를 싣는다.
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
