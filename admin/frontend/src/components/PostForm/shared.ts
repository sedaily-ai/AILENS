import type { CmsPostBody, CmsPostInput } from "@/lib/types";

export const LABEL = "block text-xs font-semibold text-gray-700 mb-1.5";

export interface ModeProps {
  value: CmsPostInput;
  body: CmsPostBody;
  patch: (p: Partial<CmsPostInput>) => void;
  patchBody: (p: Partial<CmsPostBody>) => void;
}

// body_inline.category("카테고리"/"연재명" 입력)는 2026-08-09에 없앴다 —
// 공개 사이트 쪽 표시(홈 카드 킥커 라벨 등)를 전부 걷어내기로 하면서
// (service/frontend 쪽 변경, 같은 날) 이 값을 입력할 이유가 없어졌다.
// PostMode.tsx의 분류(section) 선택은 그대로 남는다 — 없어진 건 그 아래
// 나오던 하위 라벨 입력창뿐.
