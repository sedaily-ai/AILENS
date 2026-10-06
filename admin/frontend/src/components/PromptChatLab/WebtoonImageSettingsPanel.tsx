"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { buildImagePromptDoc } from "@/lib/webtoonImagePromptDoc";
import { IMAGE_MODELS } from "@/lib/webtoonImageModels";
import { CustomSelect } from "@/components/CustomSelect";
import type { WebtoonLabDefaults } from "@/lib/types";

export interface WebtoonImageSettingsPanelHandle {
  publish: () => Promise<void>;
  /** 2026-09-26 — "테스트 N" 컷 카드의 "프로덕션에 적용" 버튼(WebtoonCutGenerator.tsx)
   *  이 부른다. 웹툰은 컷마다 모델을 따로 고를 수 있지만 발행 모델은
   *  하나뿐이라, 컷 단위로 "이 컷에 쓴 모델을 발행 모델로" 적용한다.
   *  PodcastVoiceSettingsPanel.tsx::applyFromTest와 동일 원칙 — 값만
   *  채우고 발행은 안 한다. */
  applyFromTest: (imageModel: string) => void;
  /** 2026-09-26(후속), 사용자 지적 — "생성 프롬프트에서도 프로덕션 적용,
   *  이미지 생성 컷에서도 프로덕션 적용 이렇게 따로 있는게 아니고,
   *  프로덕션 적용은 테스트 카드에서... 테스트 1 카드에서 바로 보이게":
   *  applyFromTest(값만 채움)와 handlePublish(현재 imageModel 상태를
   *  발행)를 한 번에 묶는다 — setImageModel이 비동기라 곧바로 publish를
   *  부르면 아직 갱신 안 된 이전 state를 읽는 문제가 있어, override 인자로
   *  값을 직접 넘긴다. 테스트 카드가 이미 확인창을 띄우므로 여기선 더
   *  묻지 않는다. */
  applyAndPublish: (imageModel: string, bubbleDetect?: boolean, bubbleStyle?: boolean) => Promise<void>;
}

/* 발행 모델 선택지(2026-09-20 신설) — "관리자가 CMS에서 저장하면 재배포
   없이 다음 발행부터 자동 반영" 요청으로, 실제 자동 발행 파이프라인이
   쓸 이미지 모델을 여기서 고른다. WebtoonCutGenerator의 컷별 모델
   드롭다운(IMAGE_MODELS 전체, 비교용이라 openai_dalle3도 보여줌)과
   달리 여기는 **실제 프로덕션이 지원하는 모델만** — pipeline.py의
   _PROVIDER_CONFIG에 없는 openai_dalle3(사업상 미사용 확정)을 고르면
   실제로는 아무 효과가 없거나 예상 밖 동작이 나므로 아예 뺀다. */
const PRODUCTION_IMAGE_MODELS = IMAGE_MODELS.filter((m) => !m.notInUse);

/* 2026-09-25 — 화풍(STYLE)·인물(CHARACTERS) 설정 UI를 삭제했다(사용자
   요청: "화풍 인물 설정이... 거의 효과가 없는것 같아서.. 걍 삭제"). 라이브
   확인 결과 발행된 webtoon-image 문서에 IMAGE_MODEL 섹션 자체가 없어
   실제 자동발행도 기본 모델(sd_ultra)로 떨어지고 있었고, sd_ultra는
   STYLE/CHARACTERS를 아예 안 읽는다(webtoon_image.py::_generate_cut_once,
   2026-09-20 결정 — "프롬프트로만 제어 가능하게") — 관리자 실험 화면
   뿐 아니라 실제 발행에도 적용되지 않는 죽은 설정이었다. style/charFemale/
   charMale은 여전히 state로 들고 있는데(발행 문서 포맷은 이 세 필드가
   있어야 한다, buildImagePromptDoc 참고 — style_guide/pipeline 모델은
   지금도 이 값을 실제로 쓴다), 편집 UI만 없앴다: 발행 시 방금 fetch한
   기존 값을 그대로 실어 보내 데이터가 조용히 비워지지 않게 한다. 이
   값을 편집하던 WebtoonImageLab(히스토리 갤러리)·WebtoonStageLab(단계별
   생성) 화면도 이 패널이 유일한 진입점이라 함께 삭제했다 — "발행 모델"
   선택만 남았고, 이는 팟캐스트 podcast-voice·영상 video-settings와 같은
   성격의 살아있는 프로덕션 설정이라 유지한다.

   2026-09-25(후속) — UI/UX 통일 요청("우측 사이드바... 일관성있게")으로
   레이아웃을 PodcastVoiceSettingsPanel.tsx/VideoRenderSettingsPanel.tsx와
   완전히 같은 골격으로 맞췄다: 로딩 중엔 같은 문구의 플레이스홀더,
   필드는 카드로 감싸지 않고 라벨(`mb-1.5 text-[11px] font-semibold
   text-[var(--text-muted)]`) + 컨트롤만, 발행 버튼은 `ui-btn-primary`
   (녹색 인라인 스타일 아님) + "발행"/"발행 중..." 짧은 라벨, 변경 없음
   상태는 버튼 라벨을 바꾸는 대신 버튼 아래 회색 캡션 한 줄로 통일. 이
   패널은 필드가 하나뿐이라 "변경됨" 배지도 다른 두 패널엔 없어 뺐다.

   2026-09-25(세 번째 후속) — 사용자 지적: "발행 버튼이 두 개로 나뉘어
   있는데 하나로 합치는게 좋지 않나요? ... 내부 로직도 합치라는건 아닌데."
   발행 문서(webtoon-image/published) 자체는 그대로 독립 유지하되(생성
   프롬프트 문서와 섞으면 안 됨 — 부모 PromptChatLab.tsx 주석 참고), 이
   패널 자체의 발행 "버튼"만 없애고 forwardRef로 publish()를 부모에
   노출한다 — 부모가 SettingsPublishBar로 렌더한다.
   2026-09-25(네 번째 후속) — 통합 버튼을 실제로 써보고 사용자가 "버전
   관리도 애매하고"라며 다시 분리 결정 — 지금은 부모가 이 패널 전용
   SettingsPublishBar를 별도로 하나 더 그린다(대본 프롬프트 발행과는
   완전히 독립). forwardRef 구조 자체는 안 바뀌어서 이 패널 코드는
   그대로다. */

export const WebtoonImageSettingsPanel = forwardRef<WebtoonImageSettingsPanelHandle, {
  /** 2026-09-25 — changed(발행 가능 여부)가 바뀔 때마다 부모에 알린다.
   *  PromptSectionsPanel.tsx의 onDirtyChange와 같은 패턴. */
  onDirtyChange?: (dirty: boolean) => void;
  /** 2026-09-25 — 사용자 지적: "대본 버전만 있는 것은 아니잖아요?? 프로덕션
   *  버전... 이런식이 맞지 않나" — 이 문서(webtoon-image/published)도
   *  독립된 버전이 있다는 걸 부모가 VersionSwitcher.tsx 상단 바에
   *  "이미지 모델 vN"으로 같이 보여준다. listPrompts()에서 이
   *  카테고리의 active_version만 가볍게 찾아 올려보낸다(PromptSectionsPanel
   *  의 serverVersion 조회와 같은 패턴). */
  onServerVersionChange?: (version: number | null) => void;
  /** 2026-09-26, 사용자 지적 — "처음 들어갈때... 프로덕션에 적용 카드가
   *  활성화되어있는데, 고치지 않았으면, 활성화가 되지 않아야하는거
   *  아닌가요? ... 테스트 카드도 마찬가지": 테스트 카드가 지금 실제
   *  발행된 모델이 뭔지 알아야 "이 카드는 이미 프로덕션과 같은 모델을
   *  쓰고 있다"를 판단할 수 있다 — 방금 fetch한 defaults.image_model을
   *  그대로 올려보낸다(방금 발행 직후엔 imageModel과 같아진다). */
  onProductionModelChange?: (model: string | null) => void;
  /** 발행돼 있는 말풍선 얼굴 회피 값 — 테스트 카드가 "프로덕션과 같은가"를 판단하고 새 테스트의 초기값으로 쓴다 */
  onProductionBubbleDetectChange?: (on: boolean) => void;
  /** 체크박스의 현재 상태(발행 전 포함) — 프로덕션 컷 생성 그리드가 바로 쓴다 */
  onBubbleDetectDraftChange?: (on: boolean) => void;
  /** 발행돼 있는 웹툰식 말풍선 값 / 체크박스 현재 상태(발행 전 포함) */
  onProductionBubbleStyleChange?: (on: boolean) => void;
  onBubbleStyleDraftChange?: (on: boolean) => void;
}>(function WebtoonImageSettingsPanel({ onDirtyChange, onServerVersionChange, onProductionModelChange, onProductionBubbleDetectChange, onBubbleDetectDraftChange, onProductionBubbleStyleChange, onBubbleStyleDraftChange }, ref) {
  const toast = useToast();

  const [style, setStyle] = useState("");
  const [charFemale, setCharFemale] = useState("");
  const [charMale, setCharMale] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [bubbleDetect, setBubbleDetect] = useState(false);
  const [bubbleStyle, setBubbleStyle] = useState(false);
  const [defaults, setDefaults] = useState<WebtoonLabDefaults | null>(null);
  const [serverVersion, setServerVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const loadDefaults = useCallback(() => {
    Promise.all([
      adminApi.getWebtoonImageDefaults(),
      adminApi.listPrompts().catch(() => ({ prompts: [] })),
    ])
      .then(([d, promptList]) => {
        setDefaults(d);
        setStyle(d.style);
        setCharFemale(d.char_female);
        setCharMale(d.char_male);
        setImageModel(d.image_model);
        setBubbleDetect(!!d.bubble_detect);
        setBubbleStyle(!!d.bubble_style);
        const listed = promptList.prompts.find((p) => p.id === "webtoon-image/published");
        setServerVersion(listed ? listed.active_version : null);
      })
      .catch(() => {
        /* 실패해도 조용히 무시 — 생성 자체는 백엔드가 어차피 기본값을 채운다 */
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // setState는 .then()/.finally() 콜백 안에서만 일어나 react-hooks/set-state-in-effect가
    // 안 걸린다 — disable 주석 불필요.
    loadDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
  }, []);

  const changed = !!defaults && (imageModel !== defaults.image_model || bubbleDetect !== !!defaults.bubble_detect || bubbleStyle !== !!defaults.bubble_style);

  // 2026-09-26(후속) — overrideModel이 있으면 changed 체크·확인창 둘 다
  // 건너뛴다(테스트 카드가 이미 확인받고 직접 값을 넘기는 경로). 사람이
  // 드롭다운을 만져서 부르는 기존 경로(overrideModel 없음)는 그대로
  // confirm + changed 가드를 유지한다.
  const handlePublish = async (overrideModel?: string, overrideBubble?: boolean, overrideStyle?: boolean) => {
    const modelToUse = overrideModel ?? imageModel;
    const bubbleToUse = overrideBubble ?? bubbleDetect;
    const styleToUse = overrideStyle ?? bubbleStyle;
    if (publishing) return;
    if (overrideModel === undefined) {
      if (!changed || !defaults) return;
      if (
        !window.confirm(
          "이 설정을 발행하면 다음 실제 웹툰 생성부터 프로덕션에 바로 적용됩니다. 발행할까요?"
        )
      ) {
        return;
      }
    }
    setPublishing(true);
    try {
      const r = await adminApi.updatePrompt(
        "webtoon-image",
        "published",
        buildImagePromptDoc(style.trim(), charFemale.trim(), charMale.trim(), modelToUse, bubbleToUse, styleToUse)
      );
      setImageModel(modelToUse);
      setBubbleDetect(bubbleToUse);
      setBubbleStyle(styleToUse);
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

  useImperativeHandle(ref, () => ({
    publish: () => handlePublish(),
    applyAndPublish: (model, bubble, style) => handlePublish(model, bubble, style),
    applyFromTest: (model) => {
      setImageModel(model);
      toast.show("테스트에서 쓴 모델을 적용했습니다 — 확인 후 발행해 주세요", "success");
    },
  }));

  useEffect(() => {
    onDirtyChange?.(changed);
  }, [changed, onDirtyChange]);

  useEffect(() => {
    onServerVersionChange?.(serverVersion);
  }, [serverVersion, onServerVersionChange]);

  useEffect(() => {
    onProductionModelChange?.(defaults?.image_model ?? null);
  }, [defaults, onProductionModelChange]);

  useEffect(() => {
    onBubbleStyleDraftChange?.(bubbleStyle);
  }, [bubbleStyle, onBubbleStyleDraftChange]);

  useEffect(() => {
    onProductionBubbleStyleChange?.(!!defaults?.bubble_style);
  }, [defaults, onProductionBubbleStyleChange]);

  useEffect(() => {
    onBubbleDetectDraftChange?.(bubbleDetect);
  }, [bubbleDetect, onBubbleDetectDraftChange]);

  useEffect(() => {
    onProductionBubbleDetectChange?.(!!defaults?.bubble_detect);
  }, [defaults, onProductionBubbleDetectChange]);

  if (loading) {
    return <p className="px-3.5 py-3 text-[11px] text-[var(--text-faint)]">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4 px-3.5 py-3">
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">발행 모델</p>
        <CustomSelect
          value={imageModel}
          onChange={setImageModel}
          options={PRODUCTION_IMAGE_MODELS.map((m) => ({
            value: m.id,
            label: m.shortLabel ?? m.label,
            badge: m.badge,
          }))}
        />
        <p
          className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-faint)]"
          title="실제 자동 발행 파이프라인(frontpage_auto/mustknow_auto)이 다음 기사부터 이 모델로 컷을 생성합니다."
        >
          실제 자동 발행이 다음 기사부터 쓸 컷 이미지 모델입니다.
        </p>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">말풍선 얼굴 회피</p>
        <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={bubbleDetect}
            onChange={(e) => setBubbleDetect(e.target.checked)}
            className="cursor-pointer"
          />
          {bubbleDetect ? "켜짐" : "꺼짐"}
        </label>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-faint)]">
          켜면 AWS Rekognition이 그림 속 인물·얼굴 위치를 찾아, 말풍선이 얼굴을 덮지 않는 자리에 놓고 꼬리를 화자 쪽으로 맞춥니다. 컷 한 장당 약 $0.002(기사 하나 약 $0.016)가 듭니다. 끄면 고정 배치로 돌아가고 비용이 없습니다. 인식에 실패해도 고정 배치로 진행하므로 발행은 막히지 않습니다.
        </p>
      </div>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">웹툰식 말풍선</p>
        <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={bubbleStyle}
            onChange={(e) => setBubbleStyle(e.target.checked)}
            className="cursor-pointer"
          />
          {bubbleStyle ? "켜짐" : "꺼짐"}
        </label>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-faint)]">
          켜면 네이버 웹툰처럼 얇은 선의 타원 말풍선을 쓰고, 컷 위에 흰 여백을 붙여 말풍선을 거기에 놓습니다(그림을 가리지 않음). 컷 이미지가 3:2보다 세로로 길어집니다. 끄면 기존 스타일입니다. 비용은 없습니다.
        </p>
      </div>
      {publishing && <p className="text-[10.5px] text-[var(--text-faint)]">발행 중...</p>}
    </div>
  );
});
