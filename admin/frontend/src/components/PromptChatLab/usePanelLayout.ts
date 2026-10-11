"use client";

/** 챗랩 패널 레이아웃 상태 — 사이드바 접기, 우측 설정 패널 폭 드래그, 프로덕션 카드 높이 드래그·실측. PromptChatLab.tsx 에서 분리(리팩토링 7단계, 내용 불변). */
import { useEffect, useRef, useState } from "react";

export function usePanelLayout() {
  // 2026-09-16 — 우측은 항상 이미지 생성 패널(WebtoonCutGenerator)을 보여준다
  // (사용자 요청: "항상 2개 단이 구분되어서 보여지면 좋겠어요" — 텍스트|이미지
  // 두 칸이 탭으로 서로를 가리는 대신 늘 같이 보여야 한다는 뜻).
  //
  // 지침/설명/파일(PromptSectionsPanel)+고정값 설정(WebtoonImageSettingsPanel)은
  // 처음엔 아이콘을 눌러야 뜨는 오버레이 두 개였는데(같은 날 두 번 다시
  // 설계), 사용자가 "왔다갔다 하는 것 자체가 비효율... 프리미어 프로
  // 설정 바처럼 한 화면에서 원클릭으로"라고 다시 요청해 상시 노출되는
  // 3번째 칼럼(아래 layout)으로 최종 정착했다 — 이제 promptPanelOpen 같은
  // 토글 state는 필요 없다.
  //
  // 2026-09-25 — 화풍/인물(STYLE/CHARACTERS) 설정 삭제 결정(사용자 요청,
  // 발행된 webtoon-image 문서에 IMAGE_MODEL 섹션이 없어 실제 자동발행도
  // 기본 모델(sd_ultra)로 떨어지고 있음을 라이브로 확인 — sd_ultra는 이
  // 값들을 아예 안 읽어 실제로도 죽은 설정이었다)에 따라 이 값들을 편집
  // 하던 화면(WebtoonImageLab 히스토리 갤러리·WebtoonStageLab 단계별
  // 생성)도 함께 제거했다 — 삭제된 패널을 여는 유일한 진입점이라 남겨두면
  // 죽은 코드만 된다. "발행 모델"(어떤 모델을 쓸지) 선택 UI는 팟캐스트의
  // podcast-voice·영상의 video-settings와 같은 성격(실제 살아있는 프로덕션
  // 설정)이라 그대로 유지한다.
  // 2026-09-16, 사용자 요청 — "좌측 사이드바는 접혔다 펼 수 있도록":
  // 대화 목록이 당장 필요 없을 때 챗 영역을 넓게 쓸 수 있게 한다.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 2026-09-16, 사용자 요청 — "이미지 생성 부분이 늘렸다 펴졌다.. 직접
  // 손으로 끌고 갈 수 있도록": 우측 패널 폭을 드래그로 조절한다.
  // 2026-09-25 — 중간 "이미지 생성" 칼럼과 우측 "설정" 칼럼을 하나로
  // 합쳤다(사용자 지적: "중간 섹션이랑.. 우측 사이드 섹션.. 이렇게
  // 두개가 있을 이유가 있을까요? 통합하면 어떨까..") — "설정"을
  // "프로덕션" 토글로 감싸고, 그 아래 "결과값" 토글에 컷 이미지 그리드를
  // 담아 한 칼럼에서 스크롤로 다 본다. 폭 state도 하나로 합쳐졌다(이전
  // imagePanelWidth+settingsPanelWidth 두 개 드래그 핸들 → 하나).
  const [settingsPanelWidth, setSettingsPanelWidth] = useState(640);
  const handleSettingsPanelResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = settingsPanelWidth;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const next = Math.min(900, Math.max(320, startWidth + delta));
      setSettingsPanelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  // 2026-09-26, 사용자 요청 — "프로덕션 부분은.. 고정하고 싶네요...
  // 위아래로 잡아당기고 끌 수 있도록" — PromptTextLab.tsx와 동일 패턴,
  // 그 파일 주석 참고.
  const [productionHeight, setProductionHeight] = useState(360);
  // 2026-09-27, 사용자 지적 — "테스트 추가 부분.. 고정해야겠네.. 스크롤
  // 내리면 사라지네": "테스트" 경계 띠(WebtoonCutGenerator.tsx)가 프로덕션
  // 카드 밑 일반 흐름에 있어서, 테스트 카드가 많아 아래로 스크롤하면
  // 화면 밖으로 사라졌다. 프로덕션 카드(sticky top-0)는 이미 고정돼
  // 있으니, 그 바로 아래에 띠도 같이 고정하면 된다 — 다만 프로덕션 카드는
  // 접혔다 펴지거나(CollapsibleSection의 <details>, 여기서 제어 못 함)
  // 드래그로 높이가 바뀌므로(productionHeight) "지금 실제로 화면에서
  // 차지하는 높이"를 고정값으로 가정할 수 없다 — ResizeObserver로 실측해서
  // 그 값을 띠의 top으로 넘긴다(WebtoonCutGenerator에 stickyTop prop).
  const productionCardRef = useRef<HTMLDivElement>(null);
  const [productionCardHeight, setProductionCardHeight] = useState(0);
  useEffect(() => {
    const el = productionCardRef.current;
    if (!el) return;
    // 2026-09-27(후속) — 사용자 리포트: "스크롤했는데 테스트 섹션 행이
    // 프로덕션 카드랑 겹치는데요": ResizeObserver 콜백만 믿었더니, 이
    // 카드 안의 <details>(CollapsibleSection, 접힘↔펼침) 토글이 이
    // 중첩된 flex+overflow-hidden+max-height 조합에서 항상 콜백을
    // 새로 안 태우는 경우가 있었다 — 접힘 상태에서 측정한 작은 높이가
    // 펼친 뒤에도 안 갱신돼서, "테스트" 띠가 그 낡은(작은) top 값에
    // 붙어 펼쳐진 프로덕션 카드 아랫부분을 덮어버린 것. ResizeObserver는
    // 그대로 두되, 이 카드 안의 모든 <details>(중첩 토글 포함)에 직접
    // toggle 리스너를 걸어 접힘/펼침 "그 즉시" 강제로 다시 잰다 —
    // 두 경로 중 하나라도 놓치지 않게 이중 방어.
    const measure = () => setProductionCardHeight(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const detailsEls = Array.from(el.querySelectorAll("details"));
    detailsEls.forEach((d) => d.addEventListener("toggle", measure));
    return () => {
      observer.disconnect();
      detailsEls.forEach((d) => d.removeEventListener("toggle", measure));
    };
  }, []);
  const handleProductionResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = productionHeight;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const next = Math.min(720, Math.max(120, startHeight + delta));
      setProductionHeight(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    settingsPanelWidth,
    handleSettingsPanelResizeStart,
    productionHeight,
    productionCardRef,
    productionCardHeight,
    handleProductionResizeStart,
  };
}
