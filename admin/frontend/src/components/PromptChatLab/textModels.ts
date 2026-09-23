/* 좌측 채팅창 텍스트 모델 선택지 — PromptChatLab.tsx(웹툰)과
   PromptTextLab.tsx(레터·팟캐스트·영상) 공용. admin/backend/routes/
   prompts.py::TEXT_MODELS와 정확히 같은 키를 써야 한다(한쪽만 고치면
   서버가 모르는 값이 와서 기본값으로 조용히 폴백한다 — resolve_text_model
   참고). 2026-09-22 — PromptChatLab.tsx에 있던 걸 공용 파일로 뺐다(내용
   변경 없음, 두 파일이 서로 다른 배열을 들고 있다가 갈라지는 걸 막는다). */
export const TEXT_MODELS: { id: string; label: string }[] = [
  { id: "sonnet-46", label: "Claude Sonnet 4.6 (기존)" },
  { id: "opus-5", label: "Claude Opus 5 (느릴 수 있음)" },
];
export const DEFAULT_TEXT_MODEL = "sonnet-46";
