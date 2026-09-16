/** 컷 이미지 생성 모델 선택지 — PromptChatLab(텍스트 페이지)과
 *  WebtoonCutGenerator(이미지 페이지, 2026-09-16 신설) 둘 다 쓴다.
 *  원래 PromptChatLab.tsx 안에만 있던 걸 공용으로 뺐다(2026-09-15,
 *  사용자 요청 — "다양하게 테스트를 해보려는게 목적.. 입력창쪽에..
 *  모델 선택가능하도록"). id는 routes/webtoon_lab.py::_IMAGE_MODELS와
 *  맞춘다. Nova Canvas는 예전 다른 기능에서 접근 거부로 막힌 전례가
 *  있어 제외 — 전부 이미 코드로 존재하고 같은 IAM 권한 범위 안이라
 *  바로 쓸 수 있는 것만 올렸다. */
export interface WebtoonImageModel {
  id: string;
  label: string;
  /** 좁은 컨테이너(WebtoonCutGenerator의 컷 카드 <select>)용 축약 라벨 —
   *  없으면 label을 그대로 쓴다(2026-09-16, UI 디테일 정리 — 긴 라벨이
   *  340px 폭 카드 안에서 잘려 보이던 문제 수정). 이미지 미리보기 배지
   *  (PromptChatLab.tsx의 CutImagePreview)는 폭 제약이 없어 계속 label을
   *  그대로 쓴다. */
  shortLabel?: string;
  badge?: string;
}

export const IMAGE_MODELS: WebtoonImageModel[] = [
  // "운영 중" — 실제 발행 파이프라인(pipelines/webtoon/pipeline.py)이
  // 지금 쓰는 것과 동일한 경로(2026-09-15 사용자 요청: "현재 사용중인것은
  // 무엇인지도 같이 넣어줘야합니다").
  { id: "pipeline", label: "현재 파이프라인 (GPU+Style Transfer)", shortLabel: "파이프라인 (GPU)", badge: "운영 중" },
  { id: "stable_image_core", label: "Stable Image Core (GPU 없음)", shortLabel: "Stable Core" },
  { id: "style_guide", label: "Style Guide (레퍼런스 기반)", shortLabel: "Style Guide" },
  // Nova Canvas — 실측(2026-09-15)해보니 이 계정에서 LEGACY 모델 취급이라
  // 호출이 간헐적으로 성공/실패를 오간다(AWS 쪽 엔타이틀먼트 자체가
  // 불안정 — 프롬프트·해상도와 무관하게 같은 요청도 됐다 안 됐다 함).
  // 코드/권한은 다 갖춰놨지만 실패해도 코드 버그가 아니라는 걸 알 수
  // 있게 라벨에 명시해 둔다.
  { id: "nova_canvas", label: "Nova Canvas", badge: "불안정(간헐적 실패)" },
  { id: "openai_dalle3", label: "OpenAI (gpt-image-1)" },
];
