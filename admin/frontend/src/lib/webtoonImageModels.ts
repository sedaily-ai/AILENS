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
  //
  // 2026-09-25 — 배지를 "현재 사용"→"기본값"으로 정정했다. 발행된
  // webtoon-image 문서를 라이브로 조회해보니 IMAGE_MODEL 섹션 자체가
  // 없었고(get_active_image_model()이 이럴 때 쓰는 값이 바로 이 모델),
  // WebtoonImageSettingsPanel.tsx에서 "발행 모델"을 언제든 admin이 바꿀
  // 수 있게 된 지금은 "현재 사용"이 고정 사실이 아니라 "아무것도 발행
  // 안 됐을 때의 기본값"이라고 말하는 게 정확하다.
  { id: "sd_ultra", label: "Stable Image Ultra (GPU 없음)", shortLabel: "Stable Ultra", badge: "기본값" },
  // 2026-09-25, 사용자 결정 — pipeline(Stable Diffusion 1.5 IP-Adapter +
  // Style Transfer, GPU) 삭제. 처음엔 "유일하게 인물·화풍 고정을 지원"
  // 이라는 이유로 남겼는데, 사용자가 "인물/화풍 고정은 지금 없는거
  // 아닌가요?"라고 반문 — 맞는 지적이었다: 발행 문서에 IMAGE_MODEL이
  // 없어 실제 자동발행은 sd_ultra(위)로 떨어지고 있고, pipeline이 실제로
  // 발행된 적이 없어 "지원 가능한 기능"과 "지금 쓰이는 기능"을 착각한
  // 판단이었다. "사용하지 않으면 삭제" 원칙에 따라 뺀다. 뒷단 GPU
  // EC2(`webtoon-ipadapter-gpu`, i-02313c8c8285f9d91, 2026-09-25 기준
  // running)·`gpu_ipadapter.py`·`pipeline.py`의 `_PROVIDER_CONFIG["pipeline"]`
  // 등 백엔드/인프라 쪽은 아직 안 건드렸다 — EC2 종료·IAM 삭제는 별도
  // 확인 후 진행하기로 함(2026-09-20 워크로그에 "1~2주 안정화 확인 후
  // 삭제" 계획이 있었으나 이 프론트 변경 시점엔 아직 유효 여부 미확인).
  // 2026-09-25, 사용자 요청("몇개 색출해주시고.. 좋은걸로... 3개정도?") —
  // stable_image_core·sd35_large를 목록에서 뺐다. 둘 다 왜 남겨야 하는지
  // 근거를 찾아봤지만(worklog·코드 주석·git log 전수 조사) stable_image_core는
  // "Ultra 나오기 전 예전 기본값"이라는 것 말곤 품질·비용 비교 기록이
  // 없고, sd35_large는 "AWS에 모델이 추가되면 좋겠다"는 요청으로만 들어와
  // 다른 모델 대비 우위가 한 번도 검증된 적이 없다(2026-09-18 실제
  // 비교 테스트는 sd_ultra만 승자로 남겼다).
  //
  // 2026-09-25(후속) — style_guide도 뺐다. 처음엔 "화풍 레퍼런스 이미지로
  // Stable Image Core의 반실사 문제를 고친 유일한 경로"라 남기려 했는데,
  // 그 레퍼런스 이미지 업로드 UI를 이미 걷어낸 상태였다(위 pipeline 삭제
  // 때 STYLE/CHARACTERS 패널 전체를 지우며 같이 빠짐)는 걸 알게 되자
  // 사용자가 "뺴기로 한거 아녀? 스타일 가이드 모델 빼죠. 걍 ultra로만
  // 계속"이라고 정리 — sd_ultra 단일 모델 + openai(업무상 남겨둠)만
  // 남는다.
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
