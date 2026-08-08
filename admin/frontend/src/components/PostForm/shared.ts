import type { CmsPostBody, CmsPostInput } from "@/lib/types";

export const LABEL = "block text-xs font-semibold text-gray-700 mb-1.5";

export interface ModeProps {
  value: CmsPostInput;
  body: CmsPostBody;
  patch: (p: Partial<CmsPostInput>) => void;
  patchBody: (p: Partial<CmsPostBody>) => void;
}
