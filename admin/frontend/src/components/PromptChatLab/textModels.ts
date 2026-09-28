/* 좌측 채팅창 텍스트 모델 선택지 — PromptChatLab.tsx(웹툰)과
   PromptTextLab.tsx(레터·팟캐스트·영상) 공용. admin/backend/routes/
   prompts.py::TEXT_MODELS와 정확히 같은 키를 써야 한다(한쪽만 고치면
   서버가 모르는 값이 와서 기본값으로 조용히 폴백한다 — resolve_text_model
   참고). 2026-09-22 — PromptChatLab.tsx에 있던 걸 공용 파일로 뺐다(내용
   변경 없음, 두 파일이 서로 다른 배열을 들고 있다가 갈라지는 걸 막는다). */
// 2026-09-24 — Bedrock list-foundation-models로 실제 계정에 있는 모델을
// 직접 확인해 추가(사용자 요청: "opus 5.5나... sonnet도... 최신모델들은
// 항상 가져오면 좋겠어요", "gpt는 없나? 아스트라나 sol이나" — 둘 다 실제
// 계정에 있었다. "Opus 5.1"은 존재하지 않는 버전이라 안 넣었다). GPT/
// Opus 5.5는 admin/backend/routes/prompts.py::TEXT_MODELS에 새
// application inference profile로 등록, temperature 미지원도 같이 반영.
// 2026-09-24(후속) — 사용자 요청: "기존, 느릴 수 있음... 이런 텍스트도
// 빼면 안되나요?" 목록 옆 배지는 이제 헤더 배지가 실제 현재값을 보여주니
// 여기 라벨엔 모델명만 남긴다.
// 2026-09-27, 사용자 요청 — "클로드 4.6sonnet 빼시고요... 드롭다운에서도
// 삭제": sonnet-46 항목 제거 + 기본값을 opus-5로(admin/backend/routes/
// prompts.py::TEXT_MODELS/DEFAULT_TEXT_MODEL과 반드시 같은 키를 유지할 것).
export const TEXT_MODELS: { id: string; label: string }[] = [
  { id: "opus-5", label: "Claude Opus 5" },
  { id: "sonnet-5", label: "Claude Sonnet 5" },
  { id: "opus-5-5", label: "Claude Opus 5.5" },
  { id: "gpt-6-astra", label: "GPT-6 Astra" },
  { id: "gpt-6-sol", label: "GPT-6 Sol" },
];
export const DEFAULT_TEXT_MODEL = "opus-5";
