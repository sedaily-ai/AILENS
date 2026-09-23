"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminApiError, adminApi } from "@/lib/adminClient";
import { useToast } from "@/components/Toast";
import { buildImagePromptDoc } from "@/lib/webtoonImagePromptDoc";
import { IMAGE_MODELS } from "@/lib/webtoonImageModels";
import { CustomSelect } from "@/components/CustomSelect";
import type {
  WebtoonImageAssetGalleryItem,
  WebtoonImageAssetKind,
  WebtoonImageAssetUrls,
  WebtoonLabDefaults,
} from "@/lib/types";
import { CollapsibleSection } from "./CollapsibleSection";

/* 발행 모델 선택지(2026-09-20 신설) — "관리자가 CMS에서 저장하면 재배포
   없이 다음 발행부터 자동 반영" 요청으로, 이 패널에 "지금 실제 자동
   발행이 쓸 모델" 선택을 추가했다. WebtoonCutGenerator의 컷별 모델
   드롭다운(IMAGE_MODELS 전체, 비교용이라 openai_dalle3도 보여줌)과
   달리 여기는 **실제 프로덕션이 지원하는 모델만** — pipeline.py의
   _PROVIDER_CONFIG에 없는 openai_dalle3(사업상 미사용 확정)을 고르면
   실제로는 아무 효과가 없거나 예상 밖 동작이 나므로 아예 뺀다. */
const PRODUCTION_IMAGE_MODELS = IMAGE_MODELS.filter((m) => !m.notInUse);

/* 2026-09-20, 사용자 지적 — "이미지도 매번 불러올 거 없잖아요": 참조
   이미지(화풍/인물 A/B) URL은 presigned라 호출마다 서명이 달라진다 —
   내용이 똑같아도 브라우저는 매번 "새 리소스"로 보고 이미지 바이트를
   다시 받고, 백엔드도 S3 head_object·list_objects_v2·presign을 실험
   패널을 열 때마다(마운트마다) 다시 계산한다(최대 갤러리 24장×3종=72번
   서명까지). 모듈 스코프 캐시로 같은 탭 세션(새로고침 전까지) 안에서는
   재사용하고, 업로드·선택으로 실제 내용이 바뀐 순간에만 force=true로
   강제 재조회한다. TTL은 presigned URL 서버 만료(routes/webtoon/assets.py
   의 URL_EXPIRES=300초)보다 짧게 잡아 캐시가 만료된 URL을 내보내는
   일이 없게 한다. STYLE/CHARACTERS 텍스트(loadDefaults)는 "관리자가
   저장하면 바로 봐야 한다"는 기존 설계 원칙 그대로 캐시 안 함 — 이미지
   자체가 아니라 presigned URL 재서명 비용·이미지 재다운로드만 문제였다. */
const IMAGE_CACHE_TTL_MS = 4 * 60 * 1000;
let assetsCache: { data: WebtoonImageAssetUrls; fetchedAt: number } | null = null;
const galleryCache: Partial<
  Record<WebtoonImageAssetKind, { items: WebtoonImageAssetGalleryItem[]; fetchedAt: number }>
> = {};

/* "고정값 설정"(화풍 STYLE + 고정 캐릭터 A/B) — 2026-09-16, 사용자가 화면
   구조가 헷갈린다며("뒤에 고정하고 뭐 하고, 프롬프트는 어디서 바꿔야
   하고") 프리미어 프로 설정 바·일레븐랩스 값 조정 바처럼 "한 화면에서
   원클릭으로 보면서 수정"할 수 있게 요청 — 톱니바퀴(지침 편집)·사람
   아이콘(이미지 실험) 두 개짜리 숨김 오버레이를 걷어내고, PromptSectionsPanel
   (설명/지침/파일) 바로 아래에 이어붙는 상시 노출 패널로 다시 만들었다.

   WebtoonImageLab.tsx의 STYLE/CHARACTERS+참조이미지+발행 로직을 그대로
   가져왔다 — 장면 설명(SCENE)/카메라 지시로 컷 하나 테스트 생성하는 기능과
   히스토리 갤러리는 여기서 뺐다(그건 "이번 한 번 테스트"용이라 상시
   노출할 만큼 자주 안 쓴다는 판단, PromptChatLab.tsx 쪽 "테스트 생성기
   열기" 링크로 기존 WebtoonImageLab 전체 화면을 그대로 열 수 있다).

   2026-09-16 리팩토링 감사 — 문서 조립 포맷(buildImagePromptDoc)은
   WebtoonImageLab.tsx와 완전히 동일해서 `@/lib/webtoonImagePromptDoc`로
   공유한다. defaults/assets fetch·업로드·발행 로직은 그대로 각자 둔다 —
   겹치는 것처럼 보이지만 실제로는 이미 갈라져 있다(이 패널의 참조 이미지
   갤러리 기능은 WebtoonImageLab.tsx엔 없음, 위 문단 참고) — 상태 공유가
   전혀 없는 두 독립 화면인데 억지로 공용 훅 하나로 묶으면 그 안에서
   "갤러리 있음/없음"을 매번 분기해야 해서 오히려 더 복잡해진다. */

/* 캐릭터 프리셋(2026-09-16, 사용자 요청 — "프롬프트도 여러 유형으로 둬주시면
   비교하고 테스트하기에 용이할 것") — 클릭하면 그 텍스트가 textarea에
   바로 채워진다(저장/발행은 안 됨 — 마음에 들면 직접 "발행"을 눌러야
   반영). 지금 발행된 기본값과 같은 구조(나이대·머리/복장 실루엣·표정·역할
   설명 + "매 컷 일관 유지" 문구)를 지켜서 썼다 — 이 마지막 문구는 GPU
   IP-Adapter identity-lock이 기대하는 형식이라 프리셋에서도 유지했다.
   STYLE(화풍) 쪽은 프리셋을 안 뒀다 — 지금 발행된 STYLE 문구엔 "실존
   인물 특정 금지"·"프롭에 지어낸 텍스트 금지" 같은 안전장치 문단이
   섞여 있어서, 제대로 검증 안 된 대체 문구를 프리셋으로 얹으면 그
   안전장치가 조용히 빠질 위험이 있다 — 그건 직접 같이 다듬는 게 낫다고
   판단해 뺐다. */
const CHAR_FEMALE_PRESETS: { label: string; text: string }[] = [
  {
    label: "단발 오피스룩",
    text: "Korean woman, late-20s. Straight shoulder-length bob with blunt bangs, no glasses, no visible badge or logo. Wears a light gray or ivory blazer over a simple blouse — crisp, modern office look. Confident, warm expression — actively gestures while explaining: pointing at documents/charts, open palm gestures, leaning toward materials, sometimes holding a tablet or folder. Keep hair length, hair color, and overall outfit silhouette consistent across every cut — do not switch to long hair or glasses.",
  },
  {
    label: "캐주얼 니트룩",
    text: "Korean woman, mid-20s. Long straight black hair tied in a low ponytail, no glasses, no visible badge or logo. Wears a soft beige or cream knit sweater over simple trousers — approachable, casual-professional look. Friendly, energetic expression — actively gestures while explaining: pointing at documents/charts, open palm gestures, leaning toward materials, sometimes holding a tablet or folder. Keep hair length, hair color, and overall outfit silhouette consistent across every cut — do not switch to short hair or glasses.",
  },
];
const CHAR_MALE_PRESETS: { label: string; text: string }[] = [
  {
    label: "안경 쓴 분석형",
    text: "Korean man, early-30s. Short neat black hair, side part, thin black-framed glasses. Wears a navy cardigan over a simple collared shirt — analytical, thoughtful look. Represents the reader's curiosity — reacts to what's being explained: leaning in to look at materials, tilting forward, resting chin on hand while thinking, looking surprised or curious as the scene calls for. Keep hair style, glasses, and overall outfit silhouette consistent across every cut.",
  },
  {
    label: "캐주얼 후드형",
    text: "Korean man, mid-20s. Short buzzed hair, no glasses. Wears a plain gray hoodie or crewneck under a light jacket — relaxed, casual look. Represents the reader's curiosity — reacts to what's being explained: leaning in to look at materials, tilting forward, resting chin on hand while thinking, looking surprised or curious as the scene calls for. Keep hair style and overall outfit silhouette consistent across every cut.",
  },
];

export function WebtoonImageSettingsPanel({
  onOpenStageLab,
}: {
  onOpenStageLab: () => void;
}) {
  const toast = useToast();

  const [style, setStyle] = useState("");
  const [charFemale, setCharFemale] = useState("");
  const [charMale, setCharMale] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [defaults, setDefaults] = useState<WebtoonLabDefaults | null>(null);

  const [assets, setAssets] = useState<WebtoonImageAssetUrls | null>(null);
  const [assetUploading, setAssetUploading] = useState<Record<WebtoonImageAssetKind, boolean>>({
    style: false,
    char_female: false,
    char_male: false,
  });
  // 참조 이미지 갤러리(2026-09-16, 사용자 요청 — "사진도 선택할 수 있도록,
  // 여러 샘플들을 둬주실 수 있나요"): asset별 업로드 이력. 업로드하면
  // 정본을 바로 덮어쓰는 대신 갤러리에 쌓이고, 그중 하나를 골라야("선택"
  // 클릭) 실제 생성에 반영된다 — 업로드 직후엔 자동으로 그 자리에서
  // select까지 호출해 "올리면 바로 반영"이던 기존 체감은 그대로 유지한다.
  const [galleries, setGalleries] = useState<Record<WebtoonImageAssetKind, WebtoonImageAssetGalleryItem[]>>({
    style: [],
    char_female: [],
    char_male: [],
  });
  const [selecting, setSelecting] = useState<string | null>(null); // 지금 선택 처리 중인 갤러리 항목의 key

  const loadGallery = useCallback((kind: WebtoonImageAssetKind, force = false) => {
    const cached = galleryCache[kind];
    if (!force && cached && Date.now() - cached.fetchedAt < IMAGE_CACHE_TTL_MS) {
      // 캐시 히트라도 setState는 반드시 .then() 콜백 안에서만 — 이펙트
      // 바디에서 동기 setState하면 react-hooks/set-state-in-effect가 걸린다
      // (이 파일의 다른 load* 함수들과 같은 컨벤션, loadDefaults 참고).
      Promise.resolve(cached.items).then((items) => setGalleries((prev) => ({ ...prev, [kind]: items })));
      return;
    }
    adminApi
      .getWebtoonImageAssetGallery(kind)
      .then((r) => {
        galleryCache[kind] = { items: r.items, fetchedAt: Date.now() };
        setGalleries((prev) => ({ ...prev, [kind]: r.items }));
      })
      .catch(() => {
        /* 갤러리 못 띄워도 지금 쓰는 이미지 미리보기(assets)엔 영향 없음 — 조용히 무시 */
      });
  }, []);

  const loadDefaults = useCallback(() => {
    adminApi
      .getWebtoonImageDefaults()
      .then((d) => {
        setDefaults(d);
        setStyle(d.style);
        setCharFemale(d.char_female);
        setCharMale(d.char_male);
        setImageModel(d.image_model);
      })
      .catch(() => {
        /* 실패해도 조용히 무시 — 생성 자체는 백엔드가 어차피 기본값을 채운다 */
      });
  }, []);

  const loadAssets = useCallback((force = false) => {
    if (!force && assetsCache && Date.now() - assetsCache.fetchedAt < IMAGE_CACHE_TTL_MS) {
      // 캐시 히트라도 setState는 .then() 콜백 안에서만(위 loadGallery와 같은 이유).
      Promise.resolve(assetsCache.data).then(setAssets);
      return;
    }
    adminApi
      .getWebtoonImageAssets()
      .then((data) => {
        assetsCache = { data, fetchedAt: Date.now() };
        setAssets(data);
      })
      .catch(() => {
        /* 미리보기 못 띄워도 영향 없음 — 조용히 무시 */
      });
  }, []);

  useEffect(() => {
    // setState는 .then() 콜백 안에서만 일어나 react-hooks/set-state-in-effect가
    // 안 걸린다(loadDefaults/loadAssets/loadGallery 정의부 참고) — disable
    // 주석 불필요.
    loadDefaults();
    loadAssets();
    (["style", "char_female", "char_male"] as const).forEach((kind) => loadGallery(kind));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만
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
      // 새로 올린 샘플을 곧바로 정본으로 선택 — "올리면 바로 반영"이던
      // 예전 체감을 유지한다(과거 샘플은 갤러리에 그대로 남는다).
      await adminApi.selectWebtoonImageAsset(kind, presign.key);
      toast.show("이미지를 추가하고 선택했습니다 — 다음 생성부터 반영됩니다", "success");
      loadAssets(true); // force — 방금 바뀐 값이니 캐시 무시하고 다시 받는다
      loadGallery(kind, true);
    } catch (err) {
      toast.show(`업로드 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setAssetUploading((prev) => ({ ...prev, [kind]: false }));
    }
  };

  const handleSelectAsset = async (kind: WebtoonImageAssetKind, key: string) => {
    setSelecting(key);
    try {
      await adminApi.selectWebtoonImageAsset(kind, key);
      toast.show("선택했습니다 — 다음 생성부터 반영됩니다", "success");
      loadAssets(true); // force — 방금 바뀐 값이니 캐시 무시하고 다시 받는다
      loadGallery(kind, true);
    } catch (err) {
      toast.show(`선택 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`, "error");
    } finally {
      setSelecting(null);
    }
  };

  const effectiveStyle = style.trim();
  const effectiveCharFemale = charFemale.trim();
  const effectiveCharMale = charMale.trim();
  const changedFromDefaults =
    !!defaults &&
    (effectiveStyle !== defaults.style ||
      effectiveCharFemale !== defaults.char_female ||
      effectiveCharMale !== defaults.char_male ||
      imageModel !== defaults.image_model);

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
        buildImagePromptDoc(effectiveStyle, effectiveCharFemale, effectiveCharMale, imageModel)
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

  return (
    <div className="space-y-4 px-3.5 py-3.5">
      <div>
        <p className="text-[10px] leading-snug text-[var(--text-faint)]">
          컷 이미지가 항상 지키는 모델·화풍·인물 설정입니다. 텍스트는 아래 &ldquo;발행&rdquo;을 눌러야, 참조
          이미지는 파일을 고르는 즉시 반영됩니다.
        </p>
      </div>

      {/* 발행 모델(2026-09-20 신설) — "관리자가 CMS에서 저장하면 재배포
          없이 다음 발행부터 자동 반영" 요청의 핵심 컨트롤이라, 접었다 펴는
          CollapsibleSection이 아니라 상시 노출한다(가장 자주 바뀌고 가장
          영향이 큰 설정). 고른 즉시 저장되는 게 아니라 아래 "발행" 버튼을
          눌러야 반영된다 — STYLE/CHARACTERS와 같은 발행 단위(한 문서)라
          따로 즉시저장을 만들면 오히려 "이건 왜 바로 반영되고 저건 버튼을
          눌러야 하지"라는 혼란만 생긴다. */}
      <div className="ui-card space-y-1.5 rounded-xl border p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p
            className="text-[10px] text-[var(--text-faint)]"
            title="실제 자동 발행 파이프라인(frontpage_auto/mustknow_auto)이 다음 기사부터 이 모델로 컷을 생성합니다."
          >
            발행 모델 — 실제 자동 발행이 다음 기사부터 쓸 모델입니다.
          </p>
          {defaults && imageModel !== defaults.image_model && (
            <span className="shrink-0 text-[10px] font-medium" style={{ color: "var(--accent)" }}>
              변경됨
            </span>
          )}
        </div>
        <CustomSelect
          value={imageModel}
          onChange={setImageModel}
          options={PRODUCTION_IMAGE_MODELS.map((m) => ({
            value: m.id,
            label: m.shortLabel ?? m.label,
            badge: m.badge,
          }))}
        />
      </div>

      <div className="ui-divider divide-y divide-[var(--border-hairline)] rounded-xl border">
        <CollapsibleSection
          title="화풍(STYLE)"
          defaultOpen
          badge={
            defaults && effectiveStyle !== defaults.style ? (
              <span className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>
                변경됨
              </span>
            ) : undefined
          }
        >
          <div className="px-3.5">
            <p
              className="text-[10px] text-[var(--text-faint)]"
              title="그림체 지침(색감·선화·금지 스타일 등)을 문장으로 적습니다. 컷마다 이 문장이 프롬프트 앞부분에 그대로 들어갑니다. 발행해야 실제 생성에 반영돼요."
            >
              그림체 지침 — 발행해야 반영됩니다.{" "}
              <ScopeTag>Style Guide · SD1.5 파이프라인 전용 — Stable Core·SD3.5·Ultra엔 미적용</ScopeTag>
            </p>
            <textarea
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder={defaults ? undefined : "불러오는 중..."}
              rows={5}
              className="ui-input mt-1.5 w-full resize-y rounded-md px-3 py-2 text-[12px]"
            />
            <ImageAssetField
              label={
                <>
                  화풍 레퍼런스 이미지 — Style Transfer가 매번 이 그림의 화풍을 입힙니다{" "}
                  <ScopeTag>SD1.5 파이프라인 · Style Guide 전용</ScopeTag>
                </>
              }
              altText="화풍 레퍼런스 이미지"
              url={assets?.style_url}
              uploading={assetUploading.style}
              onUpload={(file) => void handleUploadAsset("style", file)}
              gallery={galleries.style}
              selecting={selecting}
              onSelect={(key) => void handleSelectAsset("style", key)}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="인물(CHARACTERS)"
          defaultOpen
          badge={
            defaults &&
            (effectiveCharFemale !== defaults.char_female || effectiveCharMale !== defaults.char_male) ? (
              <span className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>
                변경됨
              </span>
            ) : undefined
          }
        >
          <CollapsibleSection
            title="A — 여성 기자"
            indent
            defaultOpen
            badge={
              defaults && effectiveCharFemale !== defaults.char_female ? (
                <span className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>
                  변경됨
                </span>
              ) : undefined
            }
          >
            <div className="px-3.5">
              <p className="text-[10px] text-[var(--text-faint)]">
                A(여성 기자) 외형 묘사 — 발행해야 반영됩니다.{" "}
                <ScopeTag>SD1.5 파이프라인 전용 — Stable Core·SD3.5·Ultra엔 미적용</ScopeTag>
              </p>
              <textarea
                value={charFemale}
                onChange={(e) => setCharFemale(e.target.value)}
                placeholder={defaults ? undefined : "불러오는 중..."}
                rows={4}
                className="ui-input mt-1.5 w-full resize-y rounded-md px-3 py-2 text-[12px]"
              />
              <PresetRow presets={CHAR_FEMALE_PRESETS} onPick={setCharFemale} />
              <ImageAssetField
                label={
                  <>
                    A 참조 사진 — 클로즈업 컷에서 이 얼굴로 identity-lock{" "}
                    <ScopeTag>SD1.5 파이프라인 전용</ScopeTag>
                  </>
                }
                altText="A 참조 사진"
                url={assets?.char_female_url}
                uploading={assetUploading.char_female}
                onUpload={(file) => void handleUploadAsset("char_female", file)}
                gallery={galleries.char_female}
                selecting={selecting}
                onSelect={(key) => void handleSelectAsset("char_female", key)}
              />
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            title="B — 남성 청자"
            indent
            defaultOpen
            badge={
              defaults && effectiveCharMale !== defaults.char_male ? (
                <span className="text-[10px] font-medium" style={{ color: "var(--accent)" }}>
                  변경됨
                </span>
              ) : undefined
            }
          >
            <div className="px-3.5">
              <p className="text-[10px] text-[var(--text-faint)]">
                B(남성 청자) 외형 묘사 — 발행해야 반영됩니다.{" "}
                <ScopeTag>SD1.5 파이프라인 전용 — Stable Core·SD3.5·Ultra엔 미적용</ScopeTag>
              </p>
              <textarea
                value={charMale}
                onChange={(e) => setCharMale(e.target.value)}
                placeholder={defaults ? undefined : "불러오는 중..."}
                rows={4}
                className="ui-input mt-1.5 w-full resize-y rounded-md px-3 py-2 text-[12px]"
              />
              <PresetRow presets={CHAR_MALE_PRESETS} onPick={setCharMale} />
              <ImageAssetField
                label={
                  <>
                    B 참조 사진 — 클로즈업 컷에서 이 얼굴로 identity-lock{" "}
                    <ScopeTag>SD1.5 파이프라인 전용</ScopeTag>
                  </>
                }
                altText="B 참조 사진"
                url={assets?.char_male_url}
                uploading={assetUploading.char_male}
                onUpload={(file) => void handleUploadAsset("char_male", file)}
                gallery={galleries.char_male}
                selecting={selecting}
                onSelect={(key) => void handleSelectAsset("char_male", key)}
              />
            </div>
          </CollapsibleSection>
        </CollapsibleSection>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => void handlePublish()}
          disabled={publishing || !changedFromDefaults}
          className="ui-btn w-full rounded-lg px-4 py-2 text-sm font-semibold"
          style={changedFromDefaults ? { background: "var(--ok)", color: "white" } : undefined}
        >
          {publishing ? "발행 중..." : changedFromDefaults ? "현재 설정 발행 → 프로덕션 반영" : "발행 (변경 사항 없음)"}
        </button>
        {/* 2026-09-21 — "장면 하나로 테스트 생성" 버튼(WebtoonImageLab의
            생성 탭으로 이동)을 없앴다 — 그 탭 자체를 지웠고, 실제 컷
            생성은 우측 WebtoonCutGenerator가 이미 담당한다. 히스토리는
            섹션 헤더 아이콘(PromptChatLab.tsx의 CollapsibleSection
            badge)에서만 연다. */}
        {/* 2026-09-18, 사용자 요청("단계별로 컨트롤 하고 싶은 니즈가 있어서"
            → "그럼 그런 단계들도 프롬프트별로 보이게 하면 안되나요??") —
            SD1.5 파이프라인의 번역/인물/배경/합성/화풍 각 단계를 프롬프트
            보면서 하나씩 실행·재시도할 수 있는 화면. WebtoonStageLab.tsx. */}
        <button
          type="button"
          onClick={onOpenStageLab}
          className="ui-btn ui-btn-ghost w-full rounded-lg px-3 py-1.5 text-[12px] font-semibold"
        >
          단계별 생성(번역·인물·배경·합성·화풍) →
        </button>
      </div>
    </div>
  );
}

/* 캐릭터 텍스트 프리셋 버튼 줄 — 클릭하면 그 프리셋 문구가 textarea에
   바로 채워진다(발행 전까지는 그냥 편집 중인 값과 동일하게 취급, 저장은
   따로 안 함). CHAR_FEMALE_PRESETS/CHAR_MALE_PRESETS 정의부 참고. */
function PresetRow({ presets, onPick }: { presets: { label: string; text: string }[]; onPick: (text: string) => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p.text)}
          title={p.text}
          className="ui-btn ui-btn-ghost rounded-full px-2.5 py-0.5 text-[10px] font-medium"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* 어떤 모델에 적용되는 필드인지 보여주는 작은 태그 — 2026-09-18, 사용자
   요청("프롬프트쪽도 있고 샘플도 있어서 헷갈리거든?? ... 명확하게 구분을
   좀 해주시면"). 껐다 켰다 하는 토글이 아니라 정보 표시다 — 어떤 필드가
   어떤 모델에 쓰이는지는 사용자가 고르는 게 아니라 코드가 고정으로
   정한 사실이라(예: 인물 텍스트는 SD1.5 파이프라인에서 아예 안 읽힘,
   webtoon_image.py의 build_background_prompt/_style_hint_from_db 참고),
   토글을 만들면 "껐는데 왜 그대로 되지?" 같은 새 혼란만 생긴다. */
function ScopeTag({ children }: { children: ReactNode }) {
  return (
    <span
      className="ui-divider inline-block rounded-full border px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--text-muted)]"
      style={{ background: "var(--surface-sunken)" }}
    >
      {children}
    </span>
  );
}

/* 화풍/인물 참조 이미지 미리보기 + 업로드 + 갤러리(선택) — WebtoonImageLab.tsx와
   같은 모양의 작은 컴포넌트를 여기 독립적으로 둔다(두 화면이 서로의 내부
   구현에 의존하지 않게, 위 모듈 docstring 참고). 2026-09-16 후속 — "여러
   샘플 중에서 선택" 요청으로 업로드 이력을 썸네일 줄로 보여주고 클릭해서
   고를 수 있게 했다. */
function ImageAssetField({
  label,
  altText,
  url,
  uploading,
  onUpload,
  gallery,
  selecting,
  onSelect,
}: {
  label: ReactNode;
  /** <img alt>용 순수 텍스트 — label은 ScopeTag(JSX)를 포함할 수 있어 alt로 못 씀. */
  altText: string;
  url: string | null | undefined;
  uploading: boolean;
  onUpload: (file: File) => void;
  gallery: WebtoonImageAssetGalleryItem[];
  /** 지금 선택 처리 중인 갤러리 항목의 key — 그 썸네일만 로딩 표시. */
  selecting: string | null;
  onSelect: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-3">
        <div className="ui-divider h-14 w-14 flex-none overflow-hidden rounded-md border bg-[var(--surface-sunken)]">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL(짧은 만료), next/image 도메인 등록 불필요한 실험 화면
            <img src={url} alt={altText} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[9px] text-[var(--text-faint)]">없음</div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] leading-snug text-[var(--text-faint)]">{label}</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            title="PNG 파일(최대 8MB)을 고르면 갤러리에 추가되고 즉시 선택됩니다 — 이전 샘플들은 아래에 남아 나중에 다시 고를 수 있어요."
            className="ui-btn ui-btn-ghost mt-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
          >
            {uploading ? "업로드 중..." : "새 샘플 추가 (PNG)"}
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
      {gallery.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {gallery.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              disabled={item.active || selecting === item.key}
              title={item.active ? "지금 쓰이는 샘플" : "클릭해서 이 샘플을 선택"}
              className="relative h-10 w-10 flex-none overflow-hidden rounded disabled:cursor-default"
              style={{
                outline: item.active ? "2px solid var(--accent)" : "1px solid var(--border-hairline)",
                outlineOffset: item.active ? "1px" : "0",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL(짧은 만료), next/image 도메인 등록 불필요한 실험 화면 */}
              <img src={item.url} alt="" className="h-full w-full object-cover" />
              {selecting === item.key && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="ui-spinner h-3 w-3" style={{ borderTopColor: "white" }} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
