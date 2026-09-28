"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminApi } from "@/lib/adminClient";
import { CollapsibleSection } from "./CollapsibleSection";
import { parsePromptLabSections, assemblePromptLabContent } from "@/lib/promptLabSections";
import { formatKstDateTime } from "@/lib/formatDate";
import { useToast } from "@/components/Toast";
import type { PromptHistoryEntry } from "@/lib/types";

/* 테스트 카드의 "생성 프롬프트" — 2026-09-26 신설, 여러 차례 대화를 거쳐
   지금 모양으로 정착했다.

   1차(읽기 전용 참조)는 "생성 프롬프트"라는 같은 이름이 프로덕션 패널
   (설명/지침/파일로 분리된 실제 문서)과 테스트 카드(버전 숫자 하나)에서
   서로 다른 구조라 헷갈린다는 지적으로, 프로덕션과 같은 구조(설명/지침/
   파일)를 읽기 전용으로 재현하는 걸로 시작했다.

   2차 — "그럼 다른 버전 쓰고 싶으면 어떻게 하나요?" 질문에, 왼쪽 채팅과
   공유하는 테스트 버전 드롭다운을 카드 안에도 노출했다(VersionSwitcher.tsx
   와 같은 state).

   3차(최종, 이 버전) — 사용자가 아예 구조를 다시 물었다: "프롬프트
   수정은 프로덕션에서만 하고 와야 하는 거냐"는 지적에, "생성 프롬프트
   부분... 설명, 지침, 파일 구조 똑같이 표출하고 수정 가능하도록 만드는게
   가장 좋을 것 같고... 버전 저장 할 수 있도록" — 읽기 전용을 버리고 카드
   안에서 직접 설명/지침/파일을 고쳐서 "버전 저장"할 수 있게 했다. 다만
   "버전 저장 = 프로덕션 반영"이 되면 안 된다는 걸 명확히 확인받았다:
   "버전 저장을 하면 버전만 저장하는거지, 프로덕션으로 적용하는건.. 다른
   버튼을 눌러야" — 그래서 "버전 저장"(activate=false, 프로덕션 안 건드림)
   과 "프로덕션에 적용"(이미 저장된 버전을 활성화, 새 버전은 안 만듦)을
   완전히 분리된 두 버튼으로 뒀다(service/lens-cms-api::prompts_repo.py
   의 update_prompt(activate=)/activate_version() 참고).

   카드 하나 = 독립된 편집 초안 하나다(음성/영상 설정의 "카드별 독립
   설정"과 같은 원칙) — 새 카드는 지금 프로덕션 내용을 복사해서 시작하고
   ("불러오기" 드롭다운으로 다른 버전을 기준점으로 바꿀 수도 있음), 이후
   편집은 이 카드 로컬 상태에만 머문다("버전 저장"을 눌러야 서버에 새
   버전으로 남는다) — 여러 카드가 서로 다른 프롬프트 아이디어를 동시에
   실험하고 비교할 수 있다. */

interface DraftFile {
  id: string;
  name: string;
  content: string;
}

interface Draft {
  description: string;
  instructions: string;
  files: DraftFile[];
}

function emptyDraft(): Draft {
  return { description: "", instructions: "", files: [] };
}

let fileIdSeq = 0;
function newFileId(): string {
  fileIdSeq += 1;
  return `local-${Date.now()}-${fileIdSeq}`;
}

/* 2026-09-26(후속×6), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
   이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고, 프로덕션
   적용은 테스트 카드에서... 테스트 1 카드에서 바로 보이게": 이 컴포넌트
   자신은 더 이상 "프로덕션에 적용" 버튼을 안 그린다 — 대신 프롬프트 버전
   활성화 능력을 forwardRef로 부모에게 넘긴다. 부모(WebtoonCutGenerator.tsx/
   VoicePreviewGenerator.tsx/VideoCardGenerator.tsx)가 "테스트 N" 카드
   레벨에서 이 ref의 activateIfNeeded()와 부속 설정(이미지 모델 등) 적용을
   한 버튼으로 같이 묶어 부른다. */
export interface PromptVersionReferenceHandle {
  /** 지금 로드된 버전이 이미 프로덕션과 같으면 아무것도 안 하고, 다르면
   *  활성화한다(활성화 성공 시 true). savedVersion이 없으면(저장 안 된
   *  드래프트뿐이면) false. */
  activateIfNeeded: () => Promise<boolean>;
}

export const PromptVersionReference = forwardRef<PromptVersionReferenceHandle, {
  category: string;
  name: string;
  /** 지금 프로덕션 활성 버전 — 새 카드가 여기서 초안을 복사해 시작한다. */
  serverVersion: number | null;
  promptHistory: PromptHistoryEntry[];
  /** 왼쪽 채팅이 "다음 기사 생성"에 지금 쓰고 있는 테스트 버전
   *  (VersionSwitcher.tsx와 공유하는 값) — 이 카드의 savedVersion과 같으면
   *  "활성화" 배지를 켠다. 2026-09-26 후속, 사용자 지적: "테스트 케이스가
   *  여러개 있을때... 어떤 테스트 케이스의 생성 프롬프트를 써야할지 알
   *  수가 없다... 테스트 4를 클릭하면 활성화되고... 테스트 5를 누르면
   *  그쪽이 활성화" — 카드마다 독립된 초안을 갖게 되면서, "여러 카드 중
   *  지금 채팅이 실제로 쓰는 건 어느 카드냐"가 안 보이는 문제가 새로
   *  생겼다. */
  testVersion: number | null;
  /** "버전 저장" 직후, 또는 "활성화" 배지를 눌렀을 때 왼쪽 채팅의 "테스트"
   *  버전을 이 카드의 저장된 버전으로 맞춘다. 다음 채팅 생성부터 바로 이
   *  초안으로 시험할 수 있게. */
  onTestVersionChange: (version: number | null) => void;
  /** "프로덕션에 적용" 성공 시 부모의 scriptServerVersion을 갱신한다. */
  onServerVersionChange?: (version: number) => void;
  /** "버전 저장" 성공 시 부모가 버전 목록(promptHistory)을 다시 불러오게. */
  onPromptHistoryRefresh?: () => void;
  /** 2026-09-26 신설, 사용자 지적 — "테스트 카드에 해당 테스트에서 어떤
   *  버전을 활성화 했는지 미리보기처럼 있으면... 지금 테스트 1, 테스트 2
   *  이런식으로만 되어있으니 정보가 부족": 이 카드가 지금 로드해 둔 버전을
   *  부모(카드 바깥의 "테스트 N" 토글 헤더)에게 알려서, 토글을 펼치지
   *  않아도 어느 버전을 쓰는 카드인지 한눈에 보이게 한다. */
  onActiveInfoChange?: (info: { version: number; label: string | null } | null) => void;
  /** 2026-09-26, 사용자 요청 — "각 카드안에.. 토글들로 위치했는데.. 이거를
   *  탭구조로 바꾸는거 어떤가요? ... 웹툰은.. 생성 프롬프트.. 먼저 출력하고,
   *  이미지 하니까": 카드가 StepTabs로 바뀌면서 "생성 프롬프트"는 스스로
   *  토글을 그리지 않아도 되는(부모 탭이 이미 보임/숨김을 책임지는) 스텝
   *  하나가 된다 — true면 CollapsibleSection 래퍼 없이 편집 영역만
   *  반환한다(배지 두 개는 콘텐츠 맨 위 한 줄로 옮겨서 정보는 그대로 유지). */
  bare?: boolean;
}>(function PromptVersionReference({
  category,
  name,
  serverVersion,
  promptHistory,
  testVersion,
  onTestVersionChange,
  onServerVersionChange,
  onPromptHistoryRefresh,
  onActiveInfoChange,
  bare = false,
}, ref) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  // 지금 draft 내용을 마지막으로 저장한 버전 — 수정하면 즉시 null로
  // 리셋된다("저장 안 된 수정 있음"과 "이 버전으로 저장됨"을 구분).
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  // 2026-09-26, 사용자 요청 — "버전 저장... 사용자가 직접 버전 네이밍을
  // 입력하고 저장할 수 있도록 하는게 자유도가 높지 않을까": 버전 번호
  // (v17)는 그대로 자동 증가 — 사용자가 붙이는 건 그 옆의 별명뿐이다.
  // 버전을 불러올 때 그 버전에 붙어있던 이름을 시작값으로 채운다(계속
  // 같은 이름으로 갈지, 다듬어서 새로 저장할지 사용자가 정함).
  // 2026-09-26(후속×7), 사용자 지적 — "버전저장, 휴지통, 제목 수정하는
  // 부분... 필요없겠는데요? 좌측 쓰레드 사이드쪽에서 다 컨트롤 할 수
  // 있도록... 제목도 거기서 쓰고 수정도 하고, 삭제도 하고": 이름 입력칸을
  // 우측 패널에서 완전히 없앴다 — 이름은 항상 왼쪽 사이드바의 연필
  // 아이콘으로만 짓거나 고친다(renameVersion). 지금 로드된 버전에 실제로
  // 저장돼 있는 이름만 여기 상태로 들고 있으면 된다(사이드바가 바꾸면
  // 같이 갱신됨).
  const [loadedLabel, setLoadedLabel] = useState("");
  const toast = useToast();
  const [renamingLabel, setRenamingLabel] = useState(false);
  const [loadingVersion, setLoadingVersion] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"description" | "instructions" | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  // 2026-09-26(후속×3) — 왼쪽 버전 사이드바 안에서 바로 이름을 고치는
  // 인라인 편집(연필 아이콘) 상태. CustomSelect 내부 구현과 별개로,
  // 이제 이 목록은 팝업이 아니라 항상 펼쳐진 자체 목록이라 여기서 직접
  // 관리한다.
  const [sidebarEditingVersion, setSidebarEditingVersion] = useState<number | null>(null);
  const [sidebarEditDraft, setSidebarEditDraft] = useState("");

  // onActiveInfoChange는 부모(WebtoonCutGenerator.tsx 등)의 .map() 안에서
  // 매 렌더 새 클로저로 넘어오므로, 이걸 그대로 effect 의존성에 넣으면
  // "새 함수 → effect 재실행 → 부모 setState → 새 함수..." 무한 루프가
  // 생긴다. ref에 최신 함수만 담아두고 effect는 실제 값(savedVersion/
  // loadedLabel)에만 반응하게 한다.
  const onActiveInfoChangeRef = useRef(onActiveInfoChange);
  useEffect(() => {
    onActiveInfoChangeRef.current = onActiveInfoChange;
  });
  useEffect(() => {
    onActiveInfoChangeRef.current?.(
      savedVersion !== null ? { version: savedVersion, label: loadedLabel.trim() || null } : null
    );
  }, [savedVersion, loadedLabel]);

  // 2026-09-26(후속×4), 사용자 지적 — "v15를 누르고, 프로덕션에 적용을
  // 눌렀거든요? ... 적용이 안된느낌": 실제 원인은 race condition이었다
  // — 사이드바에서 버전을 클릭하면 loadVersion()이 비동기로 savedVersion을
  // 나중에 채우는데, 바로 이어서 부모(프로덕션 카드)의 "프로덕션에 적용"
  // 버튼이 ref.activateIfNeeded()를 부르면 그 순간 아직 옛 savedVersion
  // (심지어 null일 수도 있음)을 읽어 "적용할 게 없다"며 조용히 아무 일도
  // 안 하고 끝났다(에러도 안 남아 사용자는 원인을 알 길이 없었다). 지금
  // 불러오는 중인 요청을 pendingLoadRef에 저장해두고, activateIfNeeded가
  // 이걸 먼저 기다린 뒤 "가장 최신 savedVersion"을 ref(savedVersionRef)로
  // 읽게 해서 이 경쟁 상태를 없앤다.
  const pendingLoadRef = useRef<Promise<void> | null>(null);
  const savedVersionRef = useRef(savedVersion);
  useEffect(() => {
    savedVersionRef.current = savedVersion;
  });
  // 사용자가 사이드바에서 직접 버전을 골랐으면(아래 loadVersion) 그
  // 순간부터 "이미 초기화 끝난 카드"로 취급한다 — 안 그러면 뒤에 나오는
  // 마운트 effect가 나중에(예: 다른 카드가 프로덕션에 적용해서
  // serverVersion이 바뀔 때) 다시 돌면서 사용자가 방금 고른 걸 초기값으로
  // 덮어써버릴 수 있다.
  const hasLoadedOnceRef = useRef(false);

  const loadVersion = (version: number) => {
    // 2026-09-27, 사용자 리포트 — "설명/지침/파일 수정 후 저장 시 변경 잘
    // 안됨 -> 다른 버전 눌렀을때, 수정한 버전이 변경 안되어있음.. 로컬이라
    // 그런가요?": 정확한 진단이었다. 모달의 "저장"은 이 카드의 draft(로컬
    // 상태)에만 반영되고(DraftFieldModal 독스트링 참고), 실제 서버에 새
    // 버전으로 남기려면 "+ 새 버전"을 따로 눌러야 한다 — 근데 이 함수가
    // 그 사실을 모르고 무조건 draft를 덮어써서, 로컬 편집만 해둔 채로
    // 다른 버전을 봤다가 되돌아오면 편집이 조용히 사라졌다. markDirty()가
    // savedVersion을 null로 만드는 게 "지금 draft가 아직 어떤 버전으로도
    // 저장 안 된 상태"라는 신호다(hasLoadedOnceRef로 "아직 한 번도 안
    // 불러온" 초기 null과 구분 — 그건 편집이 아니라 그냥 로딩 전이다).
    if (hasLoadedOnceRef.current && savedVersion === null) {
      const ok = window.confirm("저장하지 않은 변경사항이 있습니다 — 지금 다른 버전을 불러오면 사라집니다. 계속할까요?");
      if (!ok) return;
    }
    setLoadingVersion(version);
    const p = adminApi
      .getPromptVersion(category, name, version)
      .then((v) => {
        const parsed = parsePromptLabSections(v.sections);
        if (parsed) {
          setDraft({
            description: parsed.description,
            instructions: parsed.instructions,
            files: parsed.files.map((f) => ({ id: newFileId(), name: f.name, content: f.content })),
          });
        } else {
          // 예전 발행분(설명/지침/파일 구분 없음) — 지침 칸 하나에 통째로.
          setDraft({ description: "", instructions: v.content, files: [] });
        }
        hasLoadedOnceRef.current = true;
        setSavedVersion(version);
        setLoadedLabel(parsed?.label ?? "");
        setDeleteError(null);
      })
      .catch((err) => console.error("버전 불러오기 실패", err))
      .finally(() => setLoadingVersion(null));
    pendingLoadRef.current = p;
  };

  // 카드가 처음 뜰 때 지금 프로덕션 내용을 복사해서 시작한다("빈 화면"이
  // 아니라 수정할 기준점이 있게) — serverVersion이 나중에 바뀌어도(다른
  // 카드가 프로덕션에 적용) 이미 시작한 이 카드의 편집은 그대로 둔다.
  // loadVersion()을 그대로 안 쓰는 이유 — 그 함수는 맨 앞에서
  // setLoadingVersion을 동기 호출하는데(불러오기 드롭다운 클릭처럼 이벤트
  // 핸들러에서 부를 땐 문제없음), 마운트 effect 본문에서 그 함수를 그대로
  // 부르면 "effect 안에서 동기 setState" 린트에 걸린다(react-hooks/
  // set-state-in-effect) — 초기 로드는 로딩 표시 없이 .then 안에서만
  // 상태를 바꾼다(어차피 카드가 뜨자마자라 체감 지연이 거의 없음).
  // 2026-09-26(후속×4) — 원래 deps가 []("마운트 시 1회만")였는데, 이
  // 컴포넌트가 마운트되는 바로 그 순간 부모의 serverVersion이 아직
  // null이면(예: 프로덕션 카드는 자기 활성 버전을 별도 API로 늦게
  // 가져온다) 이 effect가 그냥 조용히 포기하고 다시는 재시도하지 않았다
  // — savedVersion이 계속 null로 남아, 나중에 "프로덕션에 적용"을 눌러도
  // "적용할 버전이 없다"며 아무 일도 안 하는 원인이 됐다(사용자 리포트:
  // "v15를 누르고 프로덕션에 적용을 눌렀는데... 적용이 안된느낌"). 이제
  // serverVersion이 바뀔 때마다 이 effect가 다시 돌되, hasLoadedOnceRef
  // (위에서 선언, loadVersion도 같이 씀)로 "아직 한 번도 초기 로드를 못
  // 한 경우"에만 실제로 draft를 채운다 — 그래서 "이후엔 이 카드 안에서만
  // 편집"이라는 원래 의도는 그대로 지켜진다.
  useEffect(() => {
    if (serverVersion === null || hasLoadedOnceRef.current) return;
    let cancelled = false;
    adminApi
      .getPromptVersion(category, name, serverVersion)
      .then((v) => {
        if (cancelled) return;
        hasLoadedOnceRef.current = true;
        const parsed = parsePromptLabSections(v.sections);
        if (parsed) {
          setDraft({
            description: parsed.description,
            instructions: parsed.instructions,
            files: parsed.files.map((f) => ({ id: newFileId(), name: f.name, content: f.content })),
          });
        } else {
          setDraft({ description: "", instructions: v.content, files: [] });
        }
        setSavedVersion(serverVersion);
        setLoadedLabel(parsed?.label ?? "");
      })
      .catch((err) => console.error("초기 버전 불러오기 실패", err));
    return () => {
      cancelled = true;
    };
  }, [category, name, serverVersion]);

  const markDirty = () => {
    setSavedVersion(null);
  };

  const addFile = () => {
    const id = newFileId();
    setDraft((prev) => ({ ...prev, files: [...prev.files, { id, name: "새 파일", content: "" }] }));
    setEditingFileId(id);
  };

  const removeFile = (id: string) => {
    setDraft((prev) => ({ ...prev, files: prev.files.filter((f) => f.id !== id) }));
    markDirty();
  };

  // 2026-09-26(후속×7), 사용자 제안 — "새 버전 + 이렇게 쓰레드 상단에
  // 두어서 새로운거를 만들도록 하면 더 편리한 구조 아닐까요": 사이드바
  // 맨 위의 "+ 새 버전"이 이 함수를 그대로 부른다(기존 "버전 저장"과 완전히
  // 같은 동작 — 지금 우측에 펼쳐진 초안을 새 버전으로 저장) — 이름은
  // 입력칸이 없어졌으니 지금 로드해서 편집 중이던 버전의 이름(loadedLabel)
  // 을 그대로 물려받고, 새로 짓고 싶으면 저장 직후 사이드바 맨 위(방금
  // 생긴 항목)의 연필 아이콘으로 고치면 된다.
  // 2026-09-27, 사용자 재지적 — "그냥.. 설명, 지침, 파일 부분 수정하고
  // 모달에서 저장누르면, 버전 업데이트 되는거 아닌가요?": 원래는 모달의
  // "저장"이 이 카드의 로컬 draft에만 반영되고, 실제 서버에 새 버전으로
  // 남기려면 "+ 새 버전"을 따로 눌러야 했다(2026-09-26에 "저장 버튼이
  // 있어야 안정적일 것 같다"는 요청으로 모달 저장 버튼 자체는 생겼지만,
  // "로컬에만 반영"은 그때 구현이 임의로 얹은 방식이었다) — 그 2단계
  // 구조가 "저장했는데 다른 버전 갔다 오니 사라짐" 버그(직전 리포트)의
  // 근본 원인이었다. 이제 모달 "저장"이 곧바로 이 함수를 불러 새 버전을
  // 만든다 — draftOverride를 받는 이유는, setDraft는 비동기라 modal의
  // onSave 안에서 setDraft 직후 바로 handleSaveVersion()을 부르면 아직
  // 안 바뀐(stale) draft를 읽어버리기 때문 — 호출부가 "이번에 반영될
  // draft"를 직접 조립해서 넘긴다. */
  const handleSaveVersion = async (draftOverride?: Draft) => {
    const effectiveDraft = draftOverride ?? draft;
    const content = assemblePromptLabContent(effectiveDraft);
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      const trimmedLabel = loadedLabel.trim();
      const sections = {
        kind: "prompt_lab" as const,
        ...(trimmedLabel ? { label: trimmedLabel } : {}),
        description: effectiveDraft.description,
        instructions: effectiveDraft.instructions,
        files: effectiveDraft.files.map((f) => ({ name: f.name, content: f.content })),
      };
      const r = await adminApi.updatePrompt(category, name, content, sections, false);
      setSavedVersion(r.new_version);
      setLoadedLabel(trimmedLabel);
      onTestVersionChange(r.new_version);
      onPromptHistoryRefresh?.();
      // 2026-09-27 — 모달 "저장"이 이제 곧바로 이 함수를 부르는데, 그
      // 요청은 모달이 이미 닫힌 뒤 백그라운드로 진행된다 — 성공/실패를
      // 눈으로 못 보면(특히 실패 시 console.error만으론) "저장했다고
      // 생각했는데 사실 안 됐다"는 예전과 똑같은 문제가 형태만 바뀌어
      // 재발한다. 토스트로 결과를 분명히 알린다.
      toast.show(`v${r.new_version}으로 저장됐습니다`, "success");
    } catch (err) {
      console.error("버전 저장 실패", err);
      toast.show("버전 저장 실패 — 다시 시도해 주세요", "error");
    } finally {
      setSaving(false);
    }
  };

  // 2026-09-26(후속×7), 사용자 지적 — "버전저장, 휴지통, 제목 수정하는
  // 부분... 필요없겠는데요? 좌측... 사이드쪽에서 다 컨트롤... 제목도
  // 거기서 쓰고 수정도 하고": 이름 수정은 이제 사이드바 목록의 연필
  // 아이콘이 유일한 진입점이다(번호는 그대로 두고 sections.label만 갈아
  // 끼운다 — prompts_repo.rename_version, 새 버전을 만들지 않음).
  const renameVersion = async (version: number, newLabel: string) => {
    setRenamingLabel(true);
    try {
      await adminApi.renamePromptVersion(category, name, version, newLabel);
      if (version === savedVersion) {
        setLoadedLabel(newLabel);
      }
      onPromptHistoryRefresh?.();
    } catch (err) {
      console.error("버전 이름 변경 실패", err);
    } finally {
      setRenamingLabel(false);
    }
  };

  const handleActivate = async (versionOverride?: number): Promise<boolean> => {
    const version = versionOverride ?? savedVersion;
    if (version === null || activating) return false;
    setActivating(true);
    try {
      await adminApi.activatePromptVersion(category, name, version);
      onServerVersionChange?.(version);
      return true;
    } catch (err) {
      console.error("프로덕션 적용 실패", err);
      return false;
    } finally {
      setActivating(false);
    }
  };

  // 2026-09-26(후속×6) — "프로덕션에 적용" 버튼을 이 카드에서 뗀 대신,
  // 부모(테스트 카드)가 프롬프트+부속 설정을 한 번에 적용할 수 있게
  // 활성화 능력만 ref로 내보낸다. savedVersion이 이미 프로덕션과 같으면
  // (활성화할 게 없으면) 아무 일도 안 하고 true를 돌려준다.
  // 2026-09-26(후속×7) — 방금 사이드바에서 다른 버전을 클릭한 직후 바로
  // 호출되는 경우를 대비해, 아직 불러오는 중인 요청이 있으면 먼저
  // 기다리고 나서 "가장 최신" savedVersion(ref로 읽음, 클로저 아님)을
  // 기준으로 판단한다 — 위 pendingLoadRef/savedVersionRef 주석 참고.
  useImperativeHandle(ref, () => ({
    activateIfNeeded: async () => {
      if (pendingLoadRef.current) {
        await pendingLoadRef.current;
      }
      const current = savedVersionRef.current;
      if (current === null) return false;
      if (current === serverVersion) return true;
      return handleActivate(current);
    },
  }));

  // 2026-09-26, 사용자 요청 — "버전을 삭제하는 방법도 있어야 할 것
  // 같고": 지금 로드된 버전(savedVersion)을 삭제한다. 활성(프로덕션)
  // 버전이면 서버가 400을 주는데, 그 에러 메시지를 그대로 보여준다
  // (adminApi.ts::deletePromptVersion 참고, AdminApiError.message에
  // 서버가 만든 사람이 읽을 문장이 그대로 들어있다). 성공하면 이 카드를
  // "저장 전" 상태로 되돌리고(savedVersion=null) 부모의 버전 목록을
  // 새로고침한다 — 방금 지운 버전이 드롭다운에서도 사라지게.
  // 2026-09-26 — "버전 삭제" 버튼(지금 로드된 savedVersion 대상)과 "불러
  // 오기" 드롭다운의 휴지통 아이콘(클릭한 그 옵션의 버전 대상, 지금 로드된
  // 것과 다를 수 있음) 둘 다 이 공통 코어를 쓴다 — 사용자 요청: "드롭다운
  // 에.. 휴지통 아이콘이 있어야 할 것 같은데요"(로드하지 않고도 바로
  // 지울 수 있게).
  const deleteVersion = async (version: number) => {
    if (deleting) return;
    if (!window.confirm(`v${version} 버전을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await adminApi.deletePromptVersion(category, name, version);
      if (savedVersion === version) {
        setSavedVersion(null);
      }
      onPromptHistoryRefresh?.();
    } catch (err) {
      console.error("버전 삭제 실패", err);
      setDeleteError(err instanceof Error ? err.message : "버전 삭제 실패");
    } finally {
      setDeleting(false);
    }
  };

  const editingFile = draft.files.find((f) => f.id === editingFileId) ?? null;
  const isActiveForChat = savedVersion !== null && savedVersion === testVersion;
  // 2026-09-26, 사용자 지적 — "버전 저장 버튼을 누르면... 어떤 버전이름
  // 으로 저장이 되는거죠? 그걸 모르겠네": 클릭하기 전엔 결과가 뭐가 될지
  // 버튼 어디에도 안 보였다(누른 뒤 아래 상태 문구에서만 확인 가능). 실제
  // 채번 규칙(service/lens-cms-api::prompts_repo.update_prompt — "지금까지
  // 나온 최대 버전+1")과 똑같이 미리 계산해서 버튼 옆에 보여준다 — 두 곳이
  // 갈라지면 안 되므로 이 규칙을 바꿀 땐 반드시 그 파이썬 함수도 같이
  // 볼 것. 아주 드물게 다른 카드가 그 사이에 먼저 저장하면 실제 번호가
  // 1 어긋날 수 있지만(동시성), 저장 직후 상태 문구가 실제 결과로 다시
  // 맞춰준다 — 이건 "지금 누르면 대략 몇 번이 될지" 미리 알려주는
  // 용도이지 서버의 최종 결정을 대체하지 않는다.
  const nextVersionPreview =
    Math.max(serverVersion ?? 0, ...promptHistory.map((h) => h.version), 0) + 1;

  // 2026-09-26, 사용자 지적 — "테스트 카드 컴포넌트 UI/UX가 너무 복잡한거
  // 아닌가요? 버전 불러오기는... 생성 프롬프트 토글... 같은 줄에 위치해도
  // 되지 않나요? 그래서 토글 펼치지 않고도 버전 선택 가능하도록": "조회
  // (지금 몇 버전인지)"와 "전환(다른 버전 고르기·채팅에 활성화)"은 카드를
  // 훑어볼 때 매번 필요한 정보라 토글 헤더로 올리고, "편집(설명/지침/파일
  // 수정)"과 "커밋(버전 저장·프로덕션 적용)"만 펼쳤을 때 보이는 본문에
  // 남긴다 — 점진적 공개(progressive disclosure): 자주 보는 건 항상
  // 보이게, 가끔 하는 작업만 펼쳐야 보이게.
  // 2026-09-26(후속) — 조회·전환용 컨트롤은 제목 바로 옆(titleExtra, 왼쪽
  // 무리)에, "채팅에서 사용 중" 상태 표시만 badge(오른쪽 끝)에 남겼다.
  // (드롭다운이었던 시절의 위치·클리핑 관련 결정은 후속×3 커밋으로 왼쪽
  // 사이드바 목록으로 대체되며 더 이상 해당 안 됨 — 아래 참고.)
  // 활성화 버튼은 onClick에서 preventDefault를 호출한다 — 안 그러면
  // 클릭이 네이티브 <details> 토글까지 같이 트리거된다.
  const serverVersionCreatedAtLabel = formatKstDateTime(
    promptHistory.find((h) => h.version === serverVersion)?.created_at ?? null
  );
  const serverVersionLabel = promptHistory.find((h) => h.version === serverVersion)?.label || undefined;
  // 2026-09-26(후속×3), 사용자 지적 — "버전 드롭다운... 뭔가 유의미한
  // 디자인으로 안보여지더라고... 사이드바 느낌처럼... 설명/지침/파일
  // 섹션 크기 안에만 넣어지도록... 그 버전의 프롬프트가 어떻게 설정됐는지
  // 빠르게 훑어보면서 파악하기 어렵겠더라고": 매번 열고 닫아야 하는 팝업
  // 드롭다운(CustomSelect) 대신, 채팅 스레드 사이드바(ChatThreadSidebar.tsx)
  // 처럼 항상 펼쳐진 목록을 왼쪽에 고정해두고 클릭 한 번으로 바로 그
  // 버전의 설명/지침/파일이 오른쪽에 뜨도록 — 훑어보기(browse)와 미리보기
  // (preview)가 클릭 한 번으로 합쳐진다. CustomSelect는 팝업 특성상 "여러
  // 버전을 빠르게 넘겨보며 비교"에는 안 맞는 컴포넌트라 여기서만 전용
  // 목록으로 새로 짰다(VersionSwitcher.tsx의 드롭다운은 용도가 달라 — 채팅이
  // 쓸 버전을 잠깐 고르는 것뿐이라 그대로 둔다).
  const sidebarVersions: { version: number; label: string | null; isProduction: boolean; dateLabel: string }[] = [
    ...(serverVersion !== null
      ? [{ version: serverVersion, label: serverVersionLabel ?? null, isProduction: true, dateLabel: serverVersionCreatedAtLabel }]
      : []),
    ...promptHistory
      .filter((h) => h.version !== serverVersion)
      .map((h) => ({ version: h.version, label: h.label ?? null, isProduction: false, dateLabel: formatKstDateTime(h.created_at) })),
  ];
  // 토글을 접었을 때도(점진적 공개 원칙 — "자주 보는 건 항상 보이게")
  // 지금 어느 버전이 로드돼 있는지는 계속 보이게, 조작은 못 하는 순수
  // 표시용 배지로 남긴다(예전엔 이 자리가 CustomSelect 트리거 자체였음).
  const versionSummaryBadge =
    savedVersion !== null ? (
      <span
        className="flex-none truncate rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
        style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
      >
        v{savedVersion}
        {loadedLabel.trim() ? ` · ${loadedLabel.trim()}` : ""}
      </span>
    ) : undefined;

  // 2026-09-26(후속×4), 사용자 제안 — "채팅 활성화 버튼도... 버전별
  // 쓰레드 목록 쪽에 둘 수 있지 않을까요? 효율을 생각한다면": 예전엔 이
  // 자리(토글 헤더 오른쪽 끝)의 버튼이 "지금 카드에 로드된 버전"을
  // 활성화했다 — 그러려면 먼저 사이드바에서 버전을 "불러오기" 한 다음
  // 여기를 또 눌러야 했다(클릭 두 번). 사이드바 각 행에 활성화 점을
  // 직접 둬서(아래) 불러오기 없이 바로 그 버전을 활성화할 수 있게
  // 됐으므로, 여기는 순수 상태 표시(지금 로드된 버전이 활성 중일 때만)
  // 로 남기고 클릭 동작은 뗐다 — 점진적 공개 원칙상 토글을 접어도
  // "이 카드가 지금 채팅에서 쓰이는 중"이라는 사실만큼은 계속 보여야
  // 하기 때문에 완전히 없애진 않았다.
  const activateBadge = isActiveForChat ? (
    <span
      className="flex-none rounded-lg px-2 py-1 text-[10.5px] font-semibold"
      style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
    >
      ● 채팅에서 사용 중
    </span>
  ) : undefined;

  const editorBody = (
      <div>
        {/* 2026-09-26, 사용자 지적(1차) — "버전 저장, 프로덕션에 적용
            버튼은.. 위가 아니고 아래에 있어야하지 않을까? ... 지금은
            뭔가 경계가 없어서 수정해야하는 곳이랑 저장하고 뭔가 해야하는
            곳이 경계가 없어서 아쉬움이 느껴지네": 편집 영역(설명/지침/
            파일)을 위로, 커밋 영역(버전 저장·프로덕션 적용·상태 문구)을
            아래로 옮겼다.
            2026-09-26(후속) — "설명, 지침, 파일 부분을 둘러싼 경계가
            있으면 더 안정적이지 않을려나? 얇은 스트로크로라도.. 버전저장도
            그 경계 내부에 포함이 되어야.. 이 한 세트를 버전으로 저장
            하려면 이 버튼을 클릭해야겠구나 라고 명확히 느낄 것 같아서":
            구분선만으론 "이게 하나의 묶음"이라는 게 안 느껴진다는
            지적 — 편집 영역+구분선+커밋 영역 전체를 얇은 테두리 박스
            하나로 감쌌다.

            2026-09-27, 사용자 지적(후속) — "패딩 자체가 없었으면 좋겠고..
            프로덕션 카드.. 모서리에 딱 붙으면 좋겠어요.. 애초에 리디자인
            하자는거지": 위 박스(자기 테두리+그림자+배경을 가진 ui-card)가
            바깥 CollapsibleSection 카드 "안에 또 카드"를 만들고, 그 둘레마다
            padding이 겹겹이 쌓여서 "여백 틈"으로 보였다는 게 최종 진단 —
            바깥 카드가 이미 테두리를 갖고 있으니 안쪽 박스는 그게 필요
            없었다. ui-card(테두리·그림자·둥근 모서리)와 감싸던 padding을
            통째로 뺐다 — 사이드바|본문이 바깥 카드 모서리에 직접 맞닿고,
            구분은 sidebarVersions 칼럼의 border-r 하나로만 한다. */}
        <div className="flex overflow-hidden" style={{ maxHeight: 360 }}>
          {/* 2026-09-26(후속×3) — 왼쪽 버전 사이드바. 채팅 스레드
              사이드바(ChatThreadSidebar.tsx)처럼 목록이 항상 펼쳐져 있고,
              길어지면 이 칸 안에서만 세로 스크롤된다(카드 전체가 늘어나지
              않음). 행 하나를 클릭하면 오른쪽이 곧바로 그 버전의 설명/
              지침/파일로 바뀐다 — "훑어보기"와 "불러오기"가 한 클릭.
              2026-09-26(후속×7), 사용자 제안 — "새 버전 + 이렇게 쓰레드
              상단에 두어서 새로운거를 만들도록 하면 더 편리한 구조 아닐까
              요?": "+ 새 대화"/"+ 테스트 추가"와 같은 관용구로, 목록 맨
              위에 "+ 새 버전"을 고정해뒀다 — 지금 우측에 펼쳐진 초안을
              그대로 새 버전으로 저장한다(기존 "버전 저장"과 동일 동작,
              위치·이름만 바꿨다). */}
          <div
            className="flex w-[112px] flex-none flex-col border-r"
            style={{ borderColor: "var(--border-hairline)" }}
          >
            <button
              type="button"
              onClick={() => void handleSaveVersion()}
              disabled={saving || !assemblePromptLabContent(draft).trim()}
              title={`저장하면 v${nextVersionPreview}로 남습니다`}
              className="flex-none border-b px-2 py-1 text-left text-[11px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-40"
              style={{ borderColor: "var(--border-hairline)" }}
            >
              {saving ? "저장 중..." : "+ 새 버전"}
            </button>
            <div className="flex-1 overflow-y-auto">
            {sidebarVersions.map((v) => {
              const selected = loadingVersion === null && savedVersion === v.version;
              const isEditingThis = sidebarEditingVersion === v.version;
              return (
                <div key={v.version} className="group relative border-b last:border-b-0" style={{ borderColor: "var(--border-hairline)" }}>
                  {isEditingThis ? (
                    <div className="flex flex-col gap-1 p-1.5">
                      <input
                        autoFocus
                        type="text"
                        value={sidebarEditDraft}
                        onChange={(e) => setSidebarEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void renameVersion(v.version, sidebarEditDraft.trim());
                            setSidebarEditingVersion(null);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setSidebarEditingVersion(null);
                          }
                        }}
                        className="ui-input w-full rounded px-1.5 py-1 text-[10.5px]"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setSidebarEditingVersion(null)}
                          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--text-faint)] hover:bg-[var(--surface-sunken)]"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          disabled={renamingLabel}
                          onClick={() => {
                            void renameVersion(v.version, sidebarEditDraft.trim());
                            setSidebarEditingVersion(null);
                          }}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
                        >
                          {renamingLabel ? "저장 중..." : "저장"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => loadVersion(v.version)}
                      className="block w-full py-1 pl-5 pr-8 text-left transition-colors hover:bg-[var(--surface-sunken)]"
                      style={{ background: selected ? "var(--surface-sunken)" : undefined }}
                    >
                      {/* 2026-09-27, 사용자 지적 — "프로덕션 카드에.. 색상이
                          들어가있는데.. 색상 들어간거 걍 빼주시면": 이 좁은
                          버전 목록 안에서 파란색이 "지금 에디터에 로드된
                          버전"(이 행 배경+텍스트+체크)·"프로덕션 버전"(태그)·
                          "채팅이 쓰는 버전"(아래 점)까지 서로 다른 의미
                          3가지를 전부 같은 색으로 칠하고 있어서 오히려
                          뭘 가리키는 색인지 헷갈리는 게 진짜 문제였다 —
                          "채팅이 지금 이 버전을 쓴다"(dot·activateBadge)
                          하나만 액센트 블루로 남기고, 나머지(선택 표시·
                          프로덕션 태그)는 중립 회색으로 낮췄다. */}
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-primary)]">
                        {selected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-none" aria-hidden="true">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                        <span className="truncate">v{v.version}</span>
                      </span>
                      {v.label && <span className="mt-0.5 block truncate text-[10px] text-[var(--text-muted)]">{v.label}</span>}
                      {v.isProduction && (
                        <span
                          className="mt-0.5 inline-block rounded-full border px-1.5 py-[1px] text-[9px] font-medium"
                          style={{ borderColor: "var(--border-input)", color: "var(--text-secondary)" }}
                        >
                          프로덕션
                        </span>
                      )}
                      {v.dateLabel && <span className="mt-0.5 block truncate text-[9px] text-[var(--text-faint)]">{v.dateLabel}</span>}
                    </button>
                  )}
                  {!isEditingThis && (
                    // 2026-09-26(후속×4), 사용자 제안 — "채팅 활성화 버튼도
                    // 버전별 쓰레드 목록 쪽에 둘 수 있지 않을까요? 효율을
                    // 생각한다면": 예전엔 "불러오기"로 카드에 로드한 뒤에만
                    // 활성화 버튼이 눌렸다(클릭 두 번) — 이 점은 목록의
                    // 어느 버전이든(불러오지 않아도) 눌러서 바로 채팅이
                    // 쓰는 버전을 바꾼다(클릭 한 번). 왼쪽 위에 항상
                    // 보이게 둔 건 호버로 숨겨지는 연필/휴지통과 달리 "지금
                    // 채팅이 어느 버전을 쓰는지"는 자주 확인하는 정보라서.
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTestVersionChange(v.version);
                      }}
                      aria-label={testVersion === v.version ? `v${v.version} 채팅에서 사용 중` : `v${v.version}을 채팅에서 사용`}
                      title={testVersion === v.version ? "채팅에서 사용 중인 버전" : "채팅이 이 버전을 쓰게 하기"}
                      className="absolute left-1.5 top-2 flex h-3 w-3 flex-none items-center justify-center rounded-full"
                    >
                      <span
                        className="block h-1.5 w-1.5 flex-none rounded-full"
                        style={{ background: testVersion === v.version ? "var(--accent)" : "var(--border-input)" }}
                      />
                    </button>
                  )}
                  {!isEditingThis && (
                    <div className="absolute right-1 top-1 hidden items-center gap-0.5 group-hover:flex">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSidebarEditingVersion(v.version);
                          setSidebarEditDraft(v.label || `v${v.version}`);
                        }}
                        aria-label={`v${v.version} 이름 수정`}
                        title="이름 수정"
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-faint)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)]"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      {!v.isProduction && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteVersion(v.version);
                          }}
                          aria-label={`v${v.version} 삭제`}
                          title="삭제"
                          className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-faint)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
            {deleteError && (
              <p className="flex-none border-t px-2 py-1.5 text-[9.5px] font-medium text-[var(--danger)]" style={{ borderColor: "var(--border-hairline)" }}>
                {deleteError}
              </p>
            )}
          </div>

          {/* 2026-09-26(후속×7), 사용자 지적 — "버전저장, 휴지통, 제목
              수정하는 부분... 필요없겠는데요? 좌측... 사이드쪽에서 다
              컨트롤... 제목도 거기서 쓰고 수정도 하고, 삭제도 하고, 버전
              저장.. 그런것도 의미없구요": 버전 저장·삭제·이름 수정을 전부
              왼쪽 사이드바로 옮겼다(저장="+ 새 버전", 이름 수정="연필",
              삭제="휴지통" — 전부 사이드바 안에 이미 있음). 우측은 순수
              편집 영역(설명/지침/파일)만 남는다 — "지금 상태" 요약 문구도
              사이드바의 체크 표시·"프로덕션" 태그·날짜로 이미 다 보이는
              정보라 같이 뗐다. */}
          <div className="min-w-0 flex-1 overflow-y-auto p-2">
          <div className="flex flex-col gap-1.5">
        <section className="space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-[10.5px] font-semibold text-[var(--text-faint)]">설명</h4>
            <button
              type="button"
              onClick={() => setEditingField("description")}
              aria-label="설명 편집"
              title="편집"
              className="ui-btn flex h-4.5 w-4.5 flex-none items-center justify-center rounded"
            >
              {/* 2026-09-27, 사용자 지적 — "'+'가 이미 있는 내용을 수정하는
                  버튼인데 '추가'로 읽힌다": 연필 아이콘(이 화면의 "이름 수정"
                  버튼과 동일 path)으로 교체 — "+"는 아래 "파일"처럼 진짜
                  새로 추가하는 곳에만 남긴다. */}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
          {draft.description.trim() ? (
            <p className="truncate text-[11px] text-[var(--text-muted)]">{draft.description}</p>
          ) : (
            <p className="text-[11px] text-[var(--text-faint)]">이 프롬프트가 무엇인지 짧게 추가</p>
          )}
        </section>

        <section className="space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-[10.5px] font-semibold text-[var(--text-faint)]">
              지침 <span className="font-normal">({draft.instructions.length.toLocaleString()}자)</span>
            </h4>
            <button
              type="button"
              onClick={() => setEditingField("instructions")}
              aria-label="지침 편집"
              className="ui-btn flex h-4.5 w-4.5 flex-none items-center justify-center rounded text-[11px] font-bold leading-none"
            >
              +
            </button>
          </div>
          {draft.instructions.trim() ? (
            <p className="truncate text-[11px] text-[var(--text-muted)]">{draft.instructions.slice(0, 80)}</p>
          ) : (
            <p className="text-[11px] text-[var(--text-faint)]">이 프롬프트의 동작 지침 추가</p>
          )}
        </section>

        <section className="space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-[10.5px] font-semibold text-[var(--text-faint)]">
              파일 <span className="font-normal">({draft.files.length})</span>
            </h4>
            <button
              type="button"
              onClick={addFile}
              aria-label="파일 추가"
              className="ui-btn flex h-4.5 w-4.5 flex-none items-center justify-center rounded text-[11px] font-bold leading-none"
            >
              +
            </button>
          </div>
          {draft.files.length === 0 ? (
            <p className="text-[11px] text-[var(--text-faint)]">비어 있음</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.files.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setEditingFileId(f.id)}
                  className="ui-card rounded-md px-2 py-1 text-left text-[10.5px] font-medium text-[var(--text-primary)]"
                  title={`${f.content.length.toLocaleString()}자`}
                >
                  {f.name || "(제목 없음)"}
                </button>
              ))}
            </div>
          )}
        </section>
          </div>
          </div>
        </div>
      </div>
  );

  const modals = (
    <>
      {editingField && (
        <DraftFieldModal
          title={editingField === "description" ? "설명 설정" : "지침 설정"}
          fieldKey={editingField}
          value={draft[editingField]}
          rows={editingField === "description" ? 4 : 16}
          category={category}
          name={name}
          compareCandidates={sidebarVersions.filter((v) => v.version !== savedVersion)}
          currentDateLabel={sidebarVersions.find((v) => v.version === savedVersion)?.dateLabel ?? null}
          onSave={(v) => {
            const nextDraft: Draft = { ...draft, [editingField]: v };
            setDraft(nextDraft);
            setEditingField(null);
            void handleSaveVersion(nextDraft);
          }}
          onCancel={() => setEditingField(null)}
        />
      )}
      {editingFile && (
        <DraftFileModal
          file={editingFile}
          category={category}
          promptName={name}
          compareCandidates={sidebarVersions.filter((v) => v.version !== savedVersion)}
          currentDateLabel={sidebarVersions.find((v) => v.version === savedVersion)?.dateLabel ?? null}
          onSave={(patch) => {
            const nextDraft: Draft = {
              ...draft,
              files: draft.files.map((f) => (f.id === editingFile.id ? { ...f, ...patch } : f)),
            };
            setDraft(nextDraft);
            setEditingFileId(null);
            void handleSaveVersion(nextDraft);
          }}
          onRemove={() => {
            removeFile(editingFile.id);
            setEditingFileId(null);
          }}
          onCancel={() => setEditingFileId(null)}
        />
      )}
    </>
  );

  if (bare) {
    return (
      <>
        {/* 2026-09-27, 사용자 지적 — "프로덕션 카드에.. 배경이 색상이
            들어가있는데.. 그거 없어지면 좋겠고.. 패딩 자체가 없었으면..
            모서리에 딱 붙으면 좋겠어요": 여기 있던 versionSummaryBadge
            ("v15" 회색 배경 알약)는 왼쪽 버전 목록의 체크 표시가 이미
            똑같은 정보를 보여주고 있어서 순수 중복이었다 — 뺐다.
            activateBadge("채팅에서 사용 중")만 남기고, 그 배지 자체가
            필요로 하는 최소 여백(px-3.5 pt-1.5) 외엔 editorBody를 바로
            이어붙여 탭바 바로 아래부터 카드 모서리까지 내용이 채운다. */}
        {activateBadge && <div className="flex items-center gap-1.5 px-3.5 pt-1.5 pb-1">{activateBadge}</div>}
        {editorBody}
        {modals}
      </>
    );
  }

  return (
    <CollapsibleSection title="생성 프롬프트" indent titleExtra={versionSummaryBadge} badge={activateBadge}>
      {editorBody}
      {modals}
    </CollapsibleSection>
  );
});

/* 2026-09-27, 사용자 요청 — "설명,지침,파일 프롬프트 좌측에 목차처럼
   보이도록(마크다운 문법 활용)... 해당 부분 클릭하면 바로 넘어갈 수
   있도록": 처음엔 "# 제목"/"## 0. Role..." 마크다운 헤딩만 인식했는데,
   사용자 재지적 — "xml 태그같은거는 읽기 어렵겠죠?": 실제로 이 프롬프트의
   "지침" 필드는 마크다운이 아니라 <role>/<context>/<final_deliverable>
   같은 XML 스타일 태그로 섹션을 나누고 있어서(사용자가 스크린샷으로 보여준
   실제 내용), 마크다운만 보는 목차는 이 필드에서 통째로 안 떴다(헤딩
   0개로 판정 — 목차 칼럼 자체가 안 그려짐). 여는 태그가 한 줄에 단독으로
   있는 경우(`<tag>`)도 같이 인식하도록 넓혔다 — 두 관례가 프롬프트마다
   섞여 있어서 어느 쪽이든 목차가 뜨게. */
interface MdHeading {
  level: number;
  text: string;
  offset: number;
  lineLength: number;
}
function parseHeadingLine(line: string): { level: number; text: string } | null {
  const md = /^(#{1,6})\s+(.+)/.exec(line);
  if (md) return { level: md[1].length, text: md[2].trim() };
  const xml = /^<([a-zA-Z][\w-]*)>\s*$/.exec(line.trim());
  if (xml) return { level: 1, text: xml[1] };
  return null;
}
function parseMdHeadings(text: string): MdHeading[] {
  const headings: MdHeading[] = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const parsed = parseHeadingLine(line);
    if (parsed) headings.push({ ...parsed, offset, lineLength: line.length });
    offset += line.length + 1;
  }
  return headings;
}
/** 비교(왼쪽) 텍스트에서 같은 제목의 헤딩을 찾는다 — 버전마다 레벨(#
 *  개수)이나 표기 방식(마크다운 ↔ XML 태그)이 바뀌었을 수 있어 텍스트만
 *  맞춘다(못 찾으면 그 버전엔 이 섹션이 없었다는 뜻 — 조용히 무시). */
function findHeadingByText(text: string, headingText: string): { offset: number; lineLength: number } | null {
  let offset = 0;
  for (const line of text.split("\n")) {
    const parsed = parseHeadingLine(line);
    if (parsed && parsed.text === headingText) return { offset, lineLength: line.length };
    offset += line.length + 1;
  }
  return null;
}
/** 목차를 눌렀을 때 그 줄이 눈에 띄게 화면 위쪽으로 오도록 직접 스크롤한
 *  다음, 정확한 위치 확인용으로 그 줄을 선택 상태로 만든다 — 2026-09-27,
 *  사용자 재요청: "목차에 뜬 부분을 누르면.. 해당 부분으로 넘어가면
 *  가장 좋을듯요". 처음엔 setSelectionRange+focus만으로 브라우저가 알아서
 *  스크롤해주는 데 맡겼는데, 그건 "선택 영역이 보이기만 하면" 멈춰서 —
 *  이미 살짝 보이는 위치면 거의 안 움직이거나, 화면 아무 데나(맨 아래
 *  등) 걸치는 식으로 스크롤돼 "눌렀는데 그대로인 것 같다"는 인상을 줬다.
 *  줄바꿈(wrap) 렌더와 100% 일치하진 않지만(긴 줄이 여러 줄로 접히면
 *  살짝 어긋날 수 있음), 실제 컴포넌트 라인하이트를 읽어 계산하므로
 *  대부분의 경우 목표 줄을 화면 위쪽 여유 있게 보여준다. */
function jumpTextareaToHeading(el: HTMLTextAreaElement | null, fullText: string, h: { offset: number; lineLength: number }) {
  if (!el) return;
  const lineNumber = fullText.slice(0, h.offset).split("\n").length - 1;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
  const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
  el.scrollTop = Math.min(maxScroll, Math.max(0, lineNumber * lineHeight - lineHeight * 2));
  el.focus();
  el.setSelectionRange(h.offset, h.offset + h.lineLength);
}

/** 프로덕션 패널(PromptSectionsPanel.tsx)의 FieldModal과 똑같이 "취소/저장"
 *  두 버튼을 둔다 — 2026-09-26, 사용자 지적: "설명, 지침, 파일 부분에
 *  저장 버튼이 있어야 안정적일 것 같네요.. 지금은 저장 버튼이 없어서..
 *  뭔가 안정적이지 않아." (전엔 "닫기" 하나뿐이라 타이핑하는 족족 즉시
 *  반영돼 "저장했다"는 확신을 주는 지점이 없었다). 이 모달 안에서만
 *  로컬로 값을 들고 있다가, "저장"을 눌러야 카드의 draft에 반영된다 —
 *  "취소"를 누르거나 바깥을 클릭하면 편집 내용이 버려진다(카드 draft는
 *  안 바뀜). 그래도 이건 여전히 카드 로컬 상태일 뿐이다 — 서버에 실제로
 *  남기려면 카드의 "버전 저장" 버튼을 한 번 더 눌러야 한다.
 *
 *  2026-09-27, 사용자 지적(후속) — 1차로는 편집 영역 하단에 읽기 전용
 *  색깔 diff 패널(VersionDiffPanel.tsx)을 붙였는데, "지금 같은 구조를
 *  말한게 아니긴 한데... 여기에서, 프롬프트를 수정하려고 해도, 이전
 *  버전이랑 비교하거나, 다른 버전들이랑 비교하면서 수정하면 좋으니깐..
 *  지금 수정하려는 건 오른쪽, 비교하려는건 왼쪽으로"라는 재지적으로
 *  방향이 바뀌었다 — "수정하는 그 순간" 옆에 참고할 과거 버전을
 *  띄워달라는 것. 왼쪽에 버전 칩(쓰레드 목록과 같은 구조 — 눌러서 바로
 *  다른 버전 참고 내용으로 전환)+읽기 전용 텍스트, 오른쪽에 지금
 *  고치는 중인 편집 가능한 textarea. 왼쪽은 그냥 "보기용"이라 저장에
 *  영향 없다. 이 모달 안 비교가 진짜 요구였다고 확인돼(뒤이은 지적:
 *  "기존에 만들어주신 버전 비교 부분은 삭제해주시고요, edit 부분 눌러서
 *  모달에서만 보여줄거"), VersionDiffPanel.tsx는 더 안 쓰고 파일 자체를
 *  지웠다(PromptVersionReference.tsx의 이 모달들이 정본). */
function DraftFieldModal({
  title,
  fieldKey,
  value,
  onSave,
  onCancel,
  rows,
  category,
  name,
  compareCandidates,
  currentDateLabel,
}: {
  title: string;
  /** 비교 참고용 콘텐츠를 어느 필드에서 뽑을지 — parsePromptLabSections
   *  결과의 같은 키를 그대로 읽는다. */
  fieldKey: "description" | "instructions";
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  rows: number;
  category: string;
  name: string;
  /** 왼쪽 비교 칩에 띄울 버전 목록 — 지금 로드된 버전은 이미 오른쪽에서
   *  보고 있으니 호출부가 미리 걸러서 넘긴다. */
  compareCandidates: { version: number; label: string | null; isProduction: boolean; dateLabel: string }[];
  /** "지금 수정 중"(=지금 로드된 버전)이 언제 저장됐는지 — 2026-09-27,
   *  사용자 요청: "변경이력? 그런것도 뜨면 좋긴할듯요.. 언제 변경했고
   *  그런". 버전 목록엔 이미 있던 정보(sidebarVersions.dateLabel)를
   *  모달 안에도 그대로 보여준다. */
  currentDateLabel: string | null;
}) {
  const [draft, setDraft] = useState(value);
  const [compareVersion, setCompareVersion] = useState<number | null>(compareCandidates[0]?.version ?? null);
  const [compareText, setCompareText] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const compareRef = useRef<HTMLTextAreaElement>(null);
  // 목차는 "지금 수정 중"(draft) 기준으로 뽑는다 — 이게 정본이고, 비교
  // 참고 쪽은 버전마다 구조가 다를 수 있어 클릭 시 findHeadingByText로
  // 그때그때 찾는다(위 모듈 함수 참고).
  const headings = parseMdHeadings(draft);

  useEffect(() => {
    if (compareVersion === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompareText(null);
      return;
    }
    let cancelled = false;
    setCompareLoading(true);
    adminApi
      .getPromptVersion(category, name, compareVersion)
      .then((v) => {
        if (cancelled) return;
        const parsed = parsePromptLabSections(v.sections);
        setCompareText(parsed ? parsed[fieldKey] : fieldKey === "instructions" ? v.content : "");
      })
      .catch((err) => console.error("비교 버전 조회 실패", err))
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, name, compareVersion, fieldKey]);

  // 2026-09-27, 사용자 지적 — "설명, 지침, 파일 부분 열면.. 테스트 /
  // 테스트 추가 부분이 보이넹... 중앙모달 쪽에 겹치는데?": 이 모달이
  // z-[70]인데도 그보다 z-10인 "테스트" 경계 띠한테 덮였다 — 원인은
  // 프로덕션 카드 래퍼가 position: sticky + 명시적 z-index를 갖고 있어서
  // 그 자체로 새 스태킹 컨텍스트를 만들고, 이 모달이 그 안에 중첩
  // 렌더되는 바람에 z-[70]이 "그 컨텍스트 안에서만" 유효해졌기 때문이다
  // (바깥에서 보면 사실상 z-10 취급) — 그 컨텍스트 바로 다음 형제인
  // "테스트" 띠(마찬가지로 z-10)가 DOM 순서상 나중이라 위에 그려졌다.
  // 포털로 document.body에 바로 붙여서 어떤 조상의 스태킹 컨텍스트에도
  // 안 갇히게 한다(react-dom createPortal).
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onCancel} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-[var(--surface-card)] p-5 shadow-2xl"
      >
        <h3 className="flex-none text-[16px] font-semibold text-[var(--text-primary)]">{title}</h3>
        <div className="mt-3 flex min-h-0 flex-1 gap-3">
          {/* 2026-09-27, 사용자 요청 — "좌측에 목차처럼... 마크다운 문법
              활용... 클릭하면 바로 넘어갈 수 있도록": 헤딩이 있을 때만
              보인다(설명처럼 짧은 산문엔 보통 헤딩이 없다 — 빈 칼럼을
              굳이 안 그림). */}
          {headings.length > 0 && (
            <div
              className="w-40 flex-none space-y-0.5 overflow-y-auto border-r pr-2.5"
              style={{ borderColor: "var(--border-hairline)" }}
            >
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">목차</p>
              {headings.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    jumpTextareaToHeading(draftRef.current, draft, h);
                    if (compareText) {
                      const match = findHeadingByText(compareText, h.text);
                      if (match) jumpTextareaToHeading(compareRef.current, compareText, match);
                    }
                  }}
                  className="block w-full truncate rounded py-0.5 pr-1 text-left text-[10.5px] transition-colors hover:bg-[var(--surface-sunken)]"
                  style={{ paddingLeft: `${(h.level - 1) * 10 + 6}px`, color: "var(--text-secondary)" }}
                  title={h.text}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">
                  비교 참고 (읽기 전용){compareText !== null && !compareLoading && ` · ${compareText.length.toLocaleString()}자`}
                  {/* 2026-09-27, 사용자 요청 — "변경이력? 그런것도 뜨면
                      좋긴할듯요.. 언제 변경했고 그런": 버전 목록에 이미
                      있던 저장 시각을 여기서도 보여준다. */}
                  {compareCandidates.find((v) => v.version === compareVersion)?.dateLabel &&
                    ` · ${compareCandidates.find((v) => v.version === compareVersion)!.dateLabel}`}
                </span>
                {compareCandidates.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto">
                    {compareCandidates.map((v) => (
                      <button
                        key={v.version}
                        type="button"
                        onClick={() => setCompareVersion(v.version)}
                        title={v.dateLabel}
                        className="flex-none rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
                        style={
                          v.version === compareVersion
                            ? { background: "var(--accent-soft)", color: "var(--accent)" }
                            : { background: "var(--surface-sunken)", color: "var(--text-faint)" }
                        }
                      >
                        v{v.version}
                        {v.isProduction ? " · 프로덕션" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <textarea
                ref={compareRef}
                readOnly
                value={compareLoading ? "불러오는 중..." : (compareText ?? "")}
                rows={rows}
                className="ui-input min-h-[45vh] w-full flex-1 resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
                style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
              />
            </div>
            <div className="flex min-h-0 flex-col gap-1.5">
              <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">
                지금 수정 중 · {draft.length.toLocaleString()}자{currentDateLabel && ` · 마지막 저장 ${currentDateLabel}`}
              </span>
              <textarea
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={rows}
                spellCheck={false}
                autoFocus
                className="ui-input min-h-[45vh] w-full flex-1 resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-none justify-end gap-2">
          <button type="button" onClick={onCancel} className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold">
            취소
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="ui-btn ui-btn-primary rounded-lg px-3.5 py-1.5 text-[12px] font-semibold"
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DraftFileModal({
  file,
  onSave,
  onRemove,
  onCancel,
  category,
  promptName,
  compareCandidates,
  currentDateLabel,
}: {
  file: DraftFile;
  onSave: (patch: Pick<DraftFile, "name" | "content">) => void;
  onRemove: () => void;
  onCancel: () => void;
  category: string;
  promptName: string;
  /** 왼쪽 비교 칩에 띄울 버전 목록(DraftFieldModal과 동일 원칙). */
  compareCandidates: { version: number; label: string | null; isProduction: boolean; dateLabel: string }[];
  /** "지금 수정 중"이 언제 저장됐는지(DraftFieldModal과 동일 원칙). */
  currentDateLabel: string | null;
}) {
  const [name, setName] = useState(file.name);
  const [content, setContent] = useState(file.content);
  const [compareVersion, setCompareVersion] = useState<number | null>(compareCandidates[0]?.version ?? null);
  const [compareText, setCompareText] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareMissing, setCompareMissing] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const compareRef = useRef<HTMLTextAreaElement>(null);
  const headings = parseMdHeadings(content);

  useEffect(() => {
    if (compareVersion === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompareText(null);
      setCompareMissing(false);
      return;
    }
    let cancelled = false;
    setCompareLoading(true);
    adminApi
      .getPromptVersion(category, promptName, compareVersion)
      .then((v) => {
        if (cancelled) return;
        const parsed = parsePromptLabSections(v.sections);
        // 파일은 "이름"으로 매칭한다 — 같은 이름의 파일이 그 버전엔
        // 없었을 수 있다(새로 추가한 파일이거나 그때는 다른 이름이었거나).
        const match = parsed?.files.find((f) => f.name === name);
        setCompareText(match?.content ?? null);
        setCompareMissing(!match);
      })
      .catch((err) => console.error("비교 버전 조회 실패", err))
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, promptName, compareVersion, name]);

  // 위 DraftFieldModal과 동일한 이유로 포털 사용.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onCancel} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-[var(--surface-card)] p-5 shadow-2xl"
      >
        <h3 className="flex-none text-[16px] font-semibold text-[var(--text-primary)]">파일 설정</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="파일명"
          className="ui-input mt-3 w-full flex-none rounded-lg px-3 py-2 text-[13px]"
          autoFocus
        />
        {/* 2026-09-27, 사용자 지적 — "프롬프트를 수정하려고 해도, 이전
            버전이랑 비교하거나.. 다른 버전들이랑 비교하면서 수정하면
            좋으니깐.. 지금 수정하려는 건 오른쪽, 비교하려는건 왼쪽으로":
            DraftFieldModal과 동일 구조, 다만 파일은 이름으로 다른 버전의
            같은 파일을 찾는다(없으면 "이 버전엔 없음"). */}
        <div className="mt-2 flex min-h-0 flex-1 gap-3">
          {headings.length > 0 && (
            <div
              className="w-40 flex-none space-y-0.5 overflow-y-auto border-r pr-2.5"
              style={{ borderColor: "var(--border-hairline)" }}
            >
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">목차</p>
              {headings.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    jumpTextareaToHeading(contentRef.current, content, h);
                    if (compareText) {
                      const match = findHeadingByText(compareText, h.text);
                      if (match) jumpTextareaToHeading(compareRef.current, compareText, match);
                    }
                  }}
                  className="block w-full truncate rounded py-0.5 pr-1 text-left text-[10.5px] transition-colors hover:bg-[var(--surface-sunken)]"
                  style={{ paddingLeft: `${(h.level - 1) * 10 + 6}px`, color: "var(--text-secondary)" }}
                  title={h.text}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-h-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">
                  비교 참고 (읽기 전용){compareText !== null && !compareLoading && ` · ${compareText.length.toLocaleString()}자`}
                  {compareCandidates.find((v) => v.version === compareVersion)?.dateLabel &&
                    ` · ${compareCandidates.find((v) => v.version === compareVersion)!.dateLabel}`}
                </span>
                {compareCandidates.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto">
                    {compareCandidates.map((v) => (
                      <button
                        key={v.version}
                        type="button"
                        onClick={() => setCompareVersion(v.version)}
                        title={v.dateLabel}
                        className="flex-none rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
                        style={
                          v.version === compareVersion
                            ? { background: "var(--accent-soft)", color: "var(--accent)" }
                            : { background: "var(--surface-sunken)", color: "var(--text-faint)" }
                        }
                      >
                        v{v.version}
                        {v.isProduction ? " · 프로덕션" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {compareMissing ? (
                <p
                  className="flex min-h-[45vh] w-full flex-1 items-center justify-center rounded-lg text-[11px]"
                  style={{ background: "var(--surface-sunken)", color: "var(--text-faint)" }}
                >
                  이 버전엔 &ldquo;{name || "이름 없음"}&rdquo; 파일이 없습니다
                </p>
              ) : (
                <textarea
                  ref={compareRef}
                  readOnly
                  value={compareLoading ? "불러오는 중..." : (compareText ?? "")}
                  rows={14}
                  className="ui-input min-h-[45vh] w-full flex-1 resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
                  style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
                />
              )}
            </div>
            <div className="flex min-h-0 flex-col gap-1.5">
              <span className="text-[10.5px] font-semibold text-[var(--text-faint)]">
                지금 수정 중 · {content.length.toLocaleString()}자{currentDateLabel && ` · 마지막 저장 ${currentDateLabel}`}
              </span>
              <textarea
                ref={contentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                spellCheck={false}
                placeholder="파일 내용"
                className="ui-input min-h-[45vh] w-full flex-1 resize-y rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
              />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-none justify-between gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-[var(--danger)]"
          >
            삭제
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="ui-btn rounded-lg px-3.5 py-1.5 text-[12px] font-semibold">
              취소
            </button>
            <button
              type="button"
              onClick={() => onSave({ name, content })}
              className="ui-btn ui-btn-primary rounded-lg px-3.5 py-1.5 text-[12px] font-semibold"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
