"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import type {
  WebtoonImageAssetKind,
  WebtoonImageAssetUrls,
  WebtoonLabDefaults,
  WebtoonLabHistoryItem,
  WebtoonLabJob,
} from "@/lib/types";

/* 웹툰 3단계(이미지 생성) 프롬프트 실험 패널 — 웹툰 목록 화면의 "이미지 실험"
   버튼이 연다(PromptDrawer와 같은 우측 슬라이드 패턴, 다만 이미지 미리보기 +
   히스토리 갤러리가 있어 더 넓다).

   2026-09-05 신설. 저희는 스테이블 디퓨전(Bedrock)만 쓴다는 제약이라 GPT
   image_generation 같은 대안은 없다 — 프롬프트/파라미터를 바꿔가며 실제
   생성 결과를 바로 보는 게 유일한 튜닝 방법이라 이 패널을 만들었다.

   백엔드(admin/backend/routes/webtoon_lab.py)는 API Gateway 30초 타임아웃
   때문에 동기 응답이 없다 — POST generate로 job을 만들고 GET {job_id}를
   폴링한다(_POLL_INTERVAL_MS). 완료된 생성은 전부 히스토리에 쌓여
   공용 갤러리로 남는다(이 admin 계정을 쓰는 모두가 같이 본다).

   2026-09-04 — "실험만 하지 말고 여기서 고친 프롬프트가 실제로 서비스에
   나가게 해달라"는 피드백으로 "발행" 버튼을 추가했다. STYLE/CHARACTERS는
   이제 admin DDB(`PROMPT#webtoon-image/published`, 1·2단계 프롬프트와
   완전히 같은 구조)가 정본이라, 여기서 발행하면 새 백엔드 라우트 없이
   기존 범용 프롬프트 저장 API(`POST /admin/prompts/{category}/{name}`)를
   그대로 불러 새 버전을 만든다 — pipelines/common/webtoon_image.py가 다음
   생성부터 바로 그 값을 읽는다(캐시 없음). content 조립 포맷은 백엔드
   파서(webtoon_image.py의 parse_prompt_doc/_DOC_HEADINGS)와 정확히 맞아야
   해서 아래 buildImagePromptDoc()에 그 포맷을 그대로 미러링해뒀다. */

const _POLL_INTERVAL_MS = 4000;
const _MAX_SCENE_CHARS = 1200; // 백엔드 _MAX_SCENE_BYTES(4000바이트)에 여유를 둔 UTF-8 대략치

/** webtoon_image.py::serialize_prompt_doc()과 정확히 같은 포맷이어야 한다
 *  (## STYLE / ## CHARACTER_FEMALE / ## CHARACTER_MALE 헤딩) — 한쪽만
 *  고치면 발행한 프롬프트를 파이프라인이 못 읽는다. */
function buildImagePromptDoc(style: string, charFemale: string, charMale: string): string {
  return [
    `## STYLE\n${style.trim()}`,
    `## CHARACTER_FEMALE\n${charFemale.trim()}`,
    `## CHARACTER_MALE\n${charMale.trim()}`,
  ].join("\n\n");
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** true면 자기 backdrop/aside/닫기 버튼 없이 헤더+본문만 렌더한다 — 상위
   *  화면이 PromptDrawer와 한 aside 안에 이어 붙여 보여줄 때 쓴다
   *  (2026-09-04, webtoon/page.tsx). 기본 false. */
  embedded?: boolean;
}

type PanelTab = "generate" | "history";

export function WebtoonImageLab({ open, onClose, embedded = false }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<PanelTab>("generate");

  const [scene, setScene] = useState("");
  // 실제 파이프라인(pipelines/webtoon/pipeline.py 2단계)이 쓰는 카메라 지시는
  // 영어 촬영 용어가 아니라 이런 한국어 용어다(오버숄더/클로즈업/와이드/
  // 부감 와이드/인서트 등, Claude가 장면마다 다르게 골라 씀) — 예전엔 제가
  // 지어낸 영어식 기본값("medium shot, eye level")이었는데, 실제 사용
  // 관례와 맞지 않아 혼란을 줄 수 있어 실제 예시로 바꿨다.
  const [camera, setCamera] = useState("오버숄더");
  const [style, setStyle] = useState("");
  const [charFemale, setCharFemale] = useState("");
  const [charMale, setCharMale] = useState("");
  const [sceneReinforce, setSceneReinforce] = useState(true);
  const [charReinforce, setCharReinforce] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<WebtoonLabJob | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [history, setHistory] = useState<WebtoonLabHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 기본 STYLE/FIXED_CHARACTERS(백엔드 pipelines/common/webtoon_image.py가 정본).
  // 2026-09-16까지는 "직접 입력" 체크박스를 켜야만 textarea가 나타나고, 꺼져
  //있으면 지금 실제로 발행돼 있는 값이 화면 어디에도 안 보이는 채로 "기본값을
  // 그대로 씁니다"라는 문구만 있었다 — 사용자 지적("지금 설정된 값들이 화면에
  // 보여지도록 한거죠? 작업자가 커스텀이 가능해야해요")으로 체크박스를 없애고
  // 발행된 값을 항상 그대로 채워서 보여준다(=늘 편집 가능한 상태). 사용자가
  // 안 건드리면 그 값 그대로 생성/발행에 쓰이고, 고치면 changedFromDefaults가
  // 감지해 발행 버튼이 켜진다.
  const [defaults, setDefaults] = useState<WebtoonLabDefaults | null>(null);

  // 화풍·인물 참조 이미지(2026-09-16) — 텍스트(STYLE/CHARACTER)와 같은 이유로
  // "코드에 고정된 건 전부 화면에서 커스터마이징 가능해야" 요청에 따라
  // 실제 생성이 쓰는 이미지 파일 자체를 여기서 업로드/교체한다. presigned
  // URL만 들고 있고 실제 업로드는 handleUploadAsset이 브라우저→S3 직접
  // PUT으로 한다(routes/media.py와 같은 패턴).
  const [assets, setAssets] = useState<WebtoonImageAssetUrls | null>(null);
  const [assetUploading, setAssetUploading] = useState<Record<WebtoonImageAssetKind, boolean>>({
    style: false,
    char_female: false,
    char_male: false,
  });

  const loadAssets = useCallback(() => {
    adminApi
      .getWebtoonImageAssets()
      .then(setAssets)
      .catch(() => {
        /* 미리보기 못 띄워도 생성 자체엔 영향 없음 — 조용히 무시 */
      });
  }, []);

  const handleUploadAsset = async (kind: WebtoonImageAssetKind, file: File) => {
    if (file.type !== "image/png") {
      toast.show("PNG 파일만 업로드할 수 있어요", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.show("파일이 너무 큽니다 (최대 8MB)", "error");
      return;
    }
    setAssetUploading((prev) => ({ ...prev, [kind]: true }));
    try {
      const presign = await adminApi.presignWebtoonImageAsset(kind, file.size);
      const putRes = await fetch(presign.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`업로드 실패 (HTTP ${putRes.status})`);
      toast.show("이미지를 교체했습니다 — 다음 생성부터 반영됩니다", "success");
      loadAssets();
    } catch (err) {
      toast.show(`업로드 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setAssetUploading((prev) => ({ ...prev, [kind]: false }));
    }
  };

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    adminApi
      .getWebtoonImageHistory()
      .then((r) => setHistory(r.items))
      .catch((err) =>
        setHistoryError(err instanceof AdminApiError ? err.message : "히스토리 조회 실패")
      )
      .finally(() => setHistoryLoading(false));
  }, []);

  const loadDefaults = useCallback(() => {
    adminApi
      .getWebtoonImageDefaults()
      .then((d) => {
        setDefaults(d);
        // 항상 발행된 현재 값으로 채운다(체크박스로 숨기지 않음) — 위 defaults
        // state 선언부 주석 참고. handlePublish 성공 뒤에도 이 함수가 다시
        // 불려서 방금 발행한 값으로 재동기화된다(사용자가 방금 입력한 값과
        // 같으므로 화면상 변화는 없다).
        setStyle(d.style);
        setCharFemale(d.char_female);
        setCharMale(d.char_male);
      })
      .catch(() => {
        /* 실패해도 조용히 무시 — generate는 백엔드가 어차피 기본값을 채운다 */
      });
  }, []);

  useEffect(() => {
    if (!open) {
      clearPoll();
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (history === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 패널이 열릴 때 최초 1회 히스토리 fetch(정당한 케이스, admin/frontend/CLAUDE.md의 drivers/page.tsx와 같은 패턴)
      loadHistory();
    }
    if (defaults === null) {
      // loadDefaults는 loadHistory와 달리 setState를 .then() 콜백 안에서만 호출해
      // 이펙트 본문에서 동기적으로 부르는 게 아니라 react-hooks/set-state-in-effect가
      // 안 걸린다 — disable 주석 불필요.
      loadDefaults();
    }
    if (assets === null) {
      loadAssets();
    }
    return () => {
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열릴 때 1회만: history/defaults를 deps에 넣으면 매 갱신마다 재실행된다
  }, [open]);

  useEffect(() => clearPoll, [clearPoll]);

  // useCallback이 아니라 일반 함수 선언 — setTimeout 콜백에서 자기 자신을 다시
  // 부르는 재귀 폴링이라 useCallback으로 감싸면 "선언 전에 참조" 린트 에러가 난다
  // (함수 선언은 호이스팅되므로 재귀 참조가 안전하다). 훅 의존성 배열에 넣을 일이
  // 없어 메모이제이션이 필요하지도 않다 — handleGenerate(이벤트 핸들러)에서만 호출.
  function pollJob(jobId: string) {
    adminApi
      .getWebtoonImageJob(jobId)
      .then((j) => {
        setJob(j);
        if (j.status === "pending") {
          pollTimerRef.current = setTimeout(() => pollJob(jobId), _POLL_INTERVAL_MS);
        } else if (j.status === "done") {
          loadHistory();
        }
      })
      .catch((err) => {
        setJobError(err instanceof AdminApiError ? err.message : "상태 조회 실패");
      });
  }

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose는 onClose 참조만 바뀌면 재바인딩되면 됨
  }, [open, onClose]);

  const handleGenerate = async () => {
    if (submitting) return;
    if (!scene.trim()) {
      toast.show("장면 설명을 입력해 주세요", "error");
      return;
    }
    if (!camera.trim()) {
      toast.show("카메라 지시를 입력해 주세요", "error");
      return;
    }
    clearPoll();
    setJob(null);
    setJobError(null);
    setSubmitting(true);
    try {
      const r = await adminApi.generateWebtoonImage({
        scene: scene.trim(),
        camera: camera.trim(),
        style: style.trim() || undefined,
        char_female: charFemale.trim() || undefined,
        char_male: charMale.trim() || undefined,
        scene_reinforce: sceneReinforce,
        char_reinforce: charReinforce,
      });
      setJob({
        job_id: r.job_id,
        status: "pending",
        image_url: null,
        error: null,
        scene: scene.trim(),
        camera: camera.trim(),
        style: null,
        char_female: null,
        char_male: null,
        scene_reinforce: sceneReinforce,
        char_reinforce: charReinforce,
        prompt_preview: null,
        created_at: null,
      });
      pollTimerRef.current = setTimeout(() => pollJob(r.job_id), _POLL_INTERVAL_MS);
    } catch (err) {
      toast.show(
        `생성 요청 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`,
        "error"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // 필드는 항상 편집 가능한 상태로 defaults가 채워준다(loadDefaults 참고) —
  // 사용자가 안 건드렸으면 그대로 defaults와 동일한 값이라 changedFromDefaults가 false.
  const effectiveStyle = style.trim();
  const effectiveCharFemale = charFemale.trim();
  const effectiveCharMale = charMale.trim();
  const changedFromDefaults =
    !!defaults &&
    (effectiveStyle !== defaults.style ||
      effectiveCharFemale !== defaults.char_female ||
      effectiveCharMale !== defaults.char_male);

  const handlePublish = async () => {
    if (publishing || !changedFromDefaults || !defaults) return;
    if (
      !window.confirm(
        "이 설정을 발행하면 다음 실제 웹툰 생성부터 프로덕션에 바로 적용됩니다. 발행할까요?"
      )
    ) {
      return;
    }
    setPublishing(true);
    try {
      const r = await adminApi.updatePrompt(
        "webtoon-image",
        "published",
        buildImagePromptDoc(effectiveStyle, effectiveCharFemale, effectiveCharMale)
      );
      toast.show(`발행했습니다 — v${r.new_version}부터 다음 생성에 적용됩니다`, "success");
      loadDefaults();
    } catch (err) {
      toast.show(
        `발행 실패: ${err instanceof AdminApiError ? err.message : "알 수 없는 오류"}`,
        "error"
      );
    } finally {
      setPublishing(false);
    }
  };

  const applyHistoryItem = (item: WebtoonLabHistoryItem) => {
    setScene(item.scene ?? "");
    setCamera(item.camera ?? "");
    // 그 생성이 커스텀 값을 안 썼으면(당시 기본값 그대로) 지금 발행된 기본값으로
    // 되돌린다 — 필드가 항상 채워져 있는 지금 구조에서 빈 칸으로 두면 안 된다.
    setStyle(item.style ?? defaults?.style ?? "");
    setCharFemale(item.char_female ?? defaults?.char_female ?? "");
    setCharMale(item.char_male ?? defaults?.char_male ?? "");
    setSceneReinforce(item.scene_reinforce ?? true);
    setCharReinforce(item.char_reinforce ?? true);
    setTab("generate");
    toast.show("이 생성의 설정을 폼에 불러왔습니다", "info");
  };

  const headerNode = (
    <div className="ui-divider space-y-3 border-b px-5 pb-3 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="webtoon-lab-title"
            className="font-display text-[19px] font-bold text-[var(--text-primary)]"
          >
            이미지 실험
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
            Bedrock Stable Diffusion · 프롬프트/파라미터를 바꿔 실제 생성 결과를 확인
          </p>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={handleClose}
            className="-mr-1.5 cursor-pointer rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-sunken)]"
            aria-label="닫기"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex gap-1">
            {(
              [
                { id: "generate" as const, label: "생성" },
                { id: "history" as const, label: `히스토리${history ? ` (${history.length})` : ""}` },
              ]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  tab === t.id
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                {t.label}
              </button>
            ))}
      </div>
    </div>
  );

  const bodyNode = (
    <div className={embedded ? "px-5 py-5" : "flex-1 overflow-y-auto px-5 py-5"}>
          {tab === "generate" && (
            <div className="space-y-4">
              {/* 2026-09-16 — 사용자 요청("처음 볼 때 구조를 이해하기 힘들다,
                  위쪽에 설명서 + 각 요소에 어떻게 반영되는지"): 이 패널을
                  처음 여는 사람도 두 영역의 성격이 다르다는 걸 바로 알 수
                  있게 항상 보이는 요약을 맨 위에 둔다. 필드별 title
                  속성(호버 툴팁)은 아래 각 라벨에 추가돼 있다 — 네이티브
                  브라우저 툴팁이라 새 의존성 없이 바로 된다. */}
              <div
                className="rounded-xl border p-3 text-[12px] leading-relaxed"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-sunken)" }}
              >
                <p className="font-semibold text-[var(--text-secondary)]">이 화면 사용법</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[var(--text-muted)]">
                  <li>
                    <strong className="text-[var(--text-secondary)]">장면 설명·카메라 지시</strong>는 이번 테스트
                    한 번에만 쓰입니다 — 저장되지 않고, 실제 서비스에는 영향이 없어요. 자유롭게 바꿔가며
                    &ldquo;생성&rdquo;을 눌러보세요.
                  </li>
                  <li>
                    <strong className="text-[var(--text-secondary)]">스타일·캐릭터 텍스트</strong>는 실제
                    프로덕션 설정입니다. 항상 지금 발행된 값이 채워져 있고 직접 고칠 수 있어요 — 단, 아래
                    &ldquo;발행&rdquo;을 눌러야만 다음 실제 웹툰 생성부터 반영됩니다(안 누르면 이번 테스트에서만
                    쓰이고 사라져요).
                  </li>
                  <li>
                    <strong className="text-[var(--text-secondary)]">참조 이미지(화풍·인물 A/B 사진)</strong>는
                    텍스트와 다르게 &ldquo;발행&rdquo; 단계가 없어요 — 파일을 고르는 즉시 바로 업로드되고
                    바로 반영됩니다(되돌리기 없음, 신중하게 골라주세요).
                  </li>
                  <li>각 항목에 마우스를 올리면(호버) 짧은 설명이 더 나옵니다.</li>
                </ul>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              {/* 왼쪽 — 입력 폼 */}
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="wl-scene"
                    title="이번 테스트 생성 한 번에만 쓰입니다 — 저장 안 되고 실제 서비스엔 영향 없어요."
                    className="text-[13px] font-semibold text-[var(--text-secondary)]"
                  >
                    장면 설명 (SCENE)
                  </label>
                  <textarea
                    id="wl-scene"
                    value={scene}
                    onChange={(e) => setScene(e.target.value.slice(0, _MAX_SCENE_CHARS))}
                    // 실제 파이프라인이 만들어낸 진짜 장면 지시문 예시(로컬 배치
                    // 실행 결과, pipelines/webtoon/output/반도체팹/2_scenes.json
                    // 2번 컷) — A/B 표기가 우리 고정 캐릭터(FIXED_CHARACTERS)
                    // 키와 그대로 맞아떨어져서 예시로 그대로 가져왔다. 지어낸
                    // 문장이 아니라 실제로 쓰인 프롬프트다.
                    placeholder="예: A가 책상에 앉아 서류를 보고 있다. B가 옆에 서서 서류를 같이 보고 있다. A가 서류를 가리키며 대화하는 장면."
                    rows={4}
                    className="ui-input mt-1 w-full resize-y rounded-lg px-3 py-2 text-[13px]"
                  />
                  <p className="mt-0.5 text-right text-[11px] text-[var(--text-faint)]">
                    {scene.length.toLocaleString("ko-KR")} / {_MAX_SCENE_CHARS}자
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="wl-camera"
                    title="이번 테스트 생성 한 번에만 쓰입니다 — 저장 안 되고 실제 서비스엔 영향 없어요. 오버숄더/클로즈업/와이드처럼 실제 2단계가 쓰는 한국어 용어를 그대로 넣으면 됩니다."
                    className="text-[13px] font-semibold text-[var(--text-secondary)]"
                  >
                    카메라 지시
                  </label>
                  <input
                    id="wl-camera"
                    type="text"
                    value={camera}
                    onChange={(e) => setCamera(e.target.value)}
                    placeholder="예: medium shot, eye level"
                    className="ui-input mt-1 w-full rounded-lg px-3 py-2 text-[13px]"
                  />
                </div>

                <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)" }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      title="그림체 지침(색감·선화·금지 스타일 등)을 문장으로 적습니다. 컷마다 이 문장이 프롬프트 앞부분에 그대로 들어갑니다. 발행해야 실제 생성에 반영돼요."
                      className="text-[13px] font-semibold text-[var(--text-secondary)]"
                    >
                      스타일(STYLE)
                    </span>
                    {defaults && effectiveStyle !== defaults.style && (
                      <span className="text-[10.5px] font-medium" style={{ color: "var(--accent)" }}>
                        발행된 값과 다름
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-faint)]">지금 발행돼 있는 값이 아래 그대로 채워져 있습니다 — 직접 고치면 됩니다.</p>
                  <textarea
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    placeholder={defaults ? undefined : "불러오는 중..."}
                    title="발행해야 실제 웹툰 생성에 반영됩니다. 지금은 자유롭게 고쳐서 왼쪽 '생성'으로 테스트만 해볼 수도 있어요."
                    rows={6}
                    className="ui-input mt-2 w-full resize-y rounded-lg px-3 py-2 text-[13px]"
                  />
                  <ImageAssetField
                    label="화풍 레퍼런스 이미지 — Style Transfer가 매번 이 그림의 화풍을 입힙니다"
                    url={assets?.style_url}
                    uploading={assetUploading.style}
                    onUpload={(file) => void handleUploadAsset("style", file)}
                  />
                </div>

                <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)" }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      title="두 고정 진행자(A/B)의 외형 묘사입니다. 헤어·복장 등 문장으로 적으면 매 컷 프롬프트에 [CHARACTERS] 블록으로 들어갑니다. 발행해야 실제 생성에 반영돼요."
                      className="text-[13px] font-semibold text-[var(--text-secondary)]"
                    >
                      캐릭터(CHARACTERS)
                    </span>
                    {defaults &&
                      (effectiveCharFemale !== defaults.char_female || effectiveCharMale !== defaults.char_male) && (
                        <span className="text-[10.5px] font-medium" style={{ color: "var(--accent)" }}>
                          발행된 값과 다름
                        </span>
                      )}
                  </div>
                  <p className="text-[11px] text-[var(--text-faint)]">고정 캐릭터 A(여성 기자)/B(남성 청자)의 지금 발행된 묘사입니다 — 직접 고치면 됩니다.</p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <span
                        title="A(여성 기자) 외형 묘사 — 발행해야 반영됩니다."
                        className="text-[11px] font-semibold text-[var(--text-muted)]"
                      >
                        A — 여성 기자
                      </span>
                      <textarea
                        value={charFemale}
                        onChange={(e) => setCharFemale(e.target.value)}
                        placeholder={defaults ? undefined : "불러오는 중..."}
                        title="발행해야 실제 웹툰 생성에 반영됩니다."
                        rows={4}
                        className="ui-input mt-0.5 w-full resize-y rounded-lg px-3 py-2 text-[13px]"
                      />
                      <ImageAssetField
                        label="A 참조 사진 — 클로즈업 컷에서 이 얼굴로 identity-lock"
                        url={assets?.char_female_url}
                        uploading={assetUploading.char_female}
                        onUpload={(file) => void handleUploadAsset("char_female", file)}
                      />
                    </div>
                    <div>
                      <span
                        title="B(남성 청자) 외형 묘사 — 발행해야 반영됩니다."
                        className="text-[11px] font-semibold text-[var(--text-muted)]"
                      >
                        B — 남성 청자
                      </span>
                      <textarea
                        value={charMale}
                        onChange={(e) => setCharMale(e.target.value)}
                        placeholder={defaults ? undefined : "불러오는 중..."}
                        title="발행해야 실제 웹툰 생성에 반영됩니다."
                        rows={4}
                        className="ui-input mt-0.5 w-full resize-y rounded-lg px-3 py-2 text-[13px]"
                      />
                      <ImageAssetField
                        label="B 참조 사진 — 클로즈업 컷에서 이 얼굴로 identity-lock"
                        url={assets?.char_male_url}
                        uploading={assetUploading.char_male}
                        onUpload={(file) => void handleUploadAsset("char_male", file)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border-hairline)" }}>
                  <CheckboxField
                    label="장면 재강조 문구 추가"
                    hint="STRICT: 현대 배경·불필요한 인물 추가 금지 문구"
                    checked={sceneReinforce}
                    onChange={setSceneReinforce}
                  />
                  <CheckboxField
                    label="캐릭터 재강조 문구 추가"
                    hint="STRICT: 고정 캐릭터 외모를 그대로 유지하라는 문구"
                    checked={charReinforce}
                    onChange={setCharReinforce}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={submitting || job?.status === "pending"}
                  className="ui-btn ui-btn-primary w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
                >
                  {submitting
                    ? "요청 중..."
                    : job?.status === "pending"
                      ? "생성 중..."
                      : "이미지 생성"}
                </button>

                <div
                  className="space-y-1.5 rounded-xl border p-3"
                  style={{ borderColor: "var(--border-hairline)" }}
                >
                  <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
                    &ldquo;이미지 생성&rdquo;은 테스트일 뿐 프로덕션에 영향 없습니다. 위
                    스타일/캐릭터가 마음에 들면 <strong>발행</strong>을 눌러야
                    다음 실제 웹툰 생성부터 반영됩니다.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handlePublish()}
                    disabled={publishing || !changedFromDefaults}
                    className="ui-btn w-full rounded-lg px-4 py-2 text-sm font-semibold"
                    style={
                      changedFromDefaults
                        ? { background: "var(--ok)", color: "white" }
                        : undefined
                    }
                  >
                    {publishing
                      ? "발행 중..."
                      : changedFromDefaults
                        ? "현재 설정 발행 → 프로덕션 반영"
                        : "발행 (변경 사항 없음)"}
                  </button>
                </div>
              </div>

              {/* 오른쪽 — 미리보기 */}
              <div className="space-y-3">
                <JobPreview job={job} error={jobError} />
              </div>
              </div>
            </div>
          )}

          {tab === "history" && (
            <HistoryGallery
              items={history}
              loading={historyLoading}
              error={historyError}
              onRetry={loadHistory}
              onApply={applyHistoryItem}
            />
          )}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col">
        {headerNode}
        {bodyNode}
      </div>
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] animate-[ui-fade-up_160ms_ease-out]"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="webtoon-lab-title"
        inert={!open}
        className={`fixed right-0 top-0 z-50 flex h-full w-full transform flex-col border-l border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[880px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {headerNode}
        {bodyNode}
      </aside>
    </>
  );
}

function CheckboxField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="block text-[13px] font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="block text-[11px] text-[var(--text-faint)]">{hint}</span>
      </span>
    </label>
  );
}

/* 화풍/인물 참조 이미지 미리보기 + 교체(2026-09-16) — STYLE/CHARACTERS
   텍스트 필드 바로 밑에 붙는다. 실제 생성이 지금 쓰는 파일 그대로를
   presigned URL로 보여주고, 파일 선택하면 바로 업로드까지 한 번에 —
   숨긴 <input type=file>을 버튼 클릭으로 열어준다(흔한 패턴). */
function ImageAssetField({
  label,
  url,
  uploading,
  onUpload,
}: {
  label: string;
  url: string | null | undefined;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-2 flex items-center gap-3">
      <div
        className="h-16 w-16 flex-none overflow-hidden rounded-lg border bg-[var(--surface-sunken)]"
        style={{ borderColor: "var(--border-hairline)" }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL(짧은 만료), next/image 도메인 등록 불필요한 실험 화면
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] text-[var(--text-faint)]">없음</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] leading-snug text-[var(--text-faint)]">{label}</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          title="PNG 파일(최대 8MB)을 고르면 즉시 업로드됩니다 — 별도 '발행' 없이 바로 이 자리를 덮어씁니다."
          className="ui-btn ui-btn-ghost mt-1 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-50"
        >
          {uploading ? "업로드 중..." : "이미지 교체 (PNG)"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onUpload(file);
          }}
        />
      </div>
    </div>
  );
}

function JobPreview({ job, error }: { job: WebtoonLabJob | null; error: string | null }) {
  if (error) {
    return (
      <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
        {error}
      </div>
    );
  }
  if (!job) {
    return (
      <div
        className="flex aspect-[3/2] items-center justify-center rounded-xl text-[13px]"
        style={{ background: "var(--surface-sunken)", color: "var(--text-faint)" }}
      >
        왼쪽에서 장면을 입력하고 생성을 눌러 보세요
      </div>
    );
  }
  if (job.status === "pending") {
    return (
      <div
        className="flex aspect-[3/2] flex-col items-center justify-center gap-2 rounded-xl text-[13px]"
        style={{ background: "var(--surface-sunken)", color: "var(--text-muted)" }}
      >
        <div className="ui-spinner h-6 w-6" />
        생성 중... (최대 몇 분 걸릴 수 있습니다)
      </div>
    );
  }
  if (job.status === "error") {
    return (
      <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
        생성 실패: {job.error ?? "알 수 없는 오류"}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {job.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- S3 원본 URL, next/image 최적화 대상 아님(실험 도구)
        <img
          src={job.image_url}
          alt="생성된 웹툰 배경 이미지"
          className="w-full rounded-xl border"
          style={{ borderColor: "var(--border-hairline)" }}
        />
      )}
      {job.prompt_preview && (
        <details className="rounded-lg border p-2 text-[11px]" style={{ borderColor: "var(--border-hairline)" }}>
          <summary className="cursor-pointer font-semibold text-[var(--text-muted)]">
            실제 전송된 프롬프트 보기
          </summary>
          <pre className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-faint)]">
            {job.prompt_preview}
          </pre>
        </details>
      )}
    </div>
  );
}

function HistoryGallery({
  items,
  loading,
  error,
  onRetry,
  onApply,
}: {
  items: WebtoonLabHistoryItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onApply: (item: WebtoonLabHistoryItem) => void;
}) {
  if (error) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          {error}
        </div>
        <button type="button" onClick={onRetry} className="ui-btn ui-btn-ghost rounded-lg px-3 py-1.5 text-sm">
          다시 시도
        </button>
      </div>
    );
  }
  if (loading && !items) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ui-skeleton aspect-[3/2] rounded-xl" />
        ))}
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-[var(--text-faint)]">
        아직 완료된 생성이 없습니다
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.job_id}
          type="button"
          onClick={() => onApply(item)}
          className="group text-left"
          title="이 설정을 생성 폼에 불러오기"
        >
          {item.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- S3 원본 URL, next/image 최적화 대상 아님(실험 도구)
            <img
              src={item.image_url}
              alt={item.scene ?? "웹툰 실험 이미지"}
              className="aspect-[3/2] w-full rounded-xl border object-cover transition-transform group-hover:scale-[1.02]"
              style={{ borderColor: "var(--border-hairline)" }}
            />
          )}
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
            {item.scene ?? "-"}
          </p>
        </button>
      ))}
    </div>
  );
}
