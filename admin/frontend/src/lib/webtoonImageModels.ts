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
  /** 2026-09-20, 사용자 요청 — "사용하지 않기로 한 모델이랑 사용하는거랑
   *  구분을 좀 해주시고... 비활성화된 색상을 좀 놔두거나": 모델 자체가
   *  기술적으로 막힌 게 아니라(그런 경우는 Nova Canvas처럼 목록에서 아예
   *  뺀다) "쓸 수는 있지만 정책상 안 쓰기로 확정한" 경우에만 켠다 —
   *  지금은 OpenAI(사업적 사용 불가, 2026-09-18 확정)뿐. CustomSelect가
   *  이 값을 보고 흐리게 렌더한다(선택 자체는 막지 않음 — 비교용으로는
   *  여전히 볼 수 있어야 하므로). */
  notInUse?: boolean;
}

export const IMAGE_MODELS: WebtoonImageModel[] = [
  // 2026-09-18, 사용자 결정 — 인물고정·화풍고정(GPU) 없이도 된다고 판단,
  // 새 프롬프트 구조(장면 중심·캐릭터 재서술 없음)로 여러 모델 비교 테스트
  // 후 Stable Image Ultra로 확정("울트라로 하는걸로 하시죠"). 목록 맨
  // 위 = 이제 이게 1순위 선택지라 WebtoonCutGenerator.tsx의 기본 선택값
  // (IMAGE_MODELS[0])도 자동으로 이걸로 바뀐다.
  { id: "sd_ultra", label: "Stable Image Ultra (GPU 없음)", shortLabel: "Stable Ultra", badge: "현재 사용" },
  // "운영 중" — 실제 발행 파이프라인(pipelines/webtoon/pipeline.py)이
  // 지금 쓰는 것과 동일한 경로. 위 결정 이후에도 프로덕션 파이프라인
  // 자체는 아직 이 GPU 경로 그대로라(별도 마이그레이션 작업 전) 배지는
  // 그대로 둔다 — "운영 중" 표시는 admin 실험 도구 선호도가 아니라
  // pipeline.py가 실제로 쓰는 경로를 가리킨다.
  {
    id: "pipeline",
    label: "Stable Diffusion 1.5 (IP-Adapter) + Stable Style Transfer",
    shortLabel: "Stable Diffusion 1.5",
    badge: "운영 중",
  },
  { id: "stable_image_core", label: "Stable Image Core (GPU 없음)", shortLabel: "Stable Core" },
  { id: "sd35_large", label: "Stable Diffusion 3.5 Large (GPU 없음)", shortLabel: "SD3.5 Large" },
  { id: "style_guide", label: "Style Guide (레퍼런스 기반)", shortLabel: "Style Guide" },
  {
    id: "openai_dalle3",
    label: "OpenAI (gpt-image-1)",
    badge: "사업상 미사용",
    notInUse: true,
  },
  // Nova Canvas — 2026-09-18 목록에서 제외(사용자 확인). amazon.nova-canvas-v1:0
  // 자체가 AWS Bedrock에서 LEGACY로 지정돼 있고, "최근 30일 미사용 시 호출
  // 차단"이라는 모델 단위(계정 권한과 무관) 제약에 걸려있다 — 직접 모델 ID
  // 호출·리전 변경으로도 재현 확인, CLI/API로 재활성화하는 방법이 없다
  // (콘솔 Playground에서 직접 호출해야 풀릴 가능성). 후속 버전(v2 등)도
  // 없어 당장은 복구 전망이 없다. 백엔드(routes/webtoon_lab.py의
  // _IMAGE_MODELS, webtoon_image.py의 generate_nova_canvas_image_bytes)는
  // 그대로 남겨뒀다 — 나중에 콘솔에서 재활성화되면 이 배열에 다시 넣기만
  // 하면 된다.
];
