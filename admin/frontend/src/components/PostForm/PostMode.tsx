import type { Editor } from "@tiptap/react";
import { EditorBody } from "@/components/RichTextEditor";
import { DatePickerField } from "@/components/DatePickerField";
import { CustomSelect } from "@/components/CustomSelect";
import { PostFormShell } from "./PostFormShell";
import { MetaField, MetaDivider } from "./MetaField";
import type { ModeProps } from "./shared";
import { ECON_CATEGORIES } from "@/lib/types";

interface Props extends ModeProps {
  // 리치텍스트 에디터 인스턴스 — 툴바를 페이지 최상단에 따로 두려고
  // (2026-08-09) 페이지(posts/edit/page.tsx)가 useRichTextEditor로 만들어
  // 내려준다. 이 컴포넌트는 본문 영역(EditorBody)만 그린다.
  editor: Editor;
  uploadError?: string | null;
}

// mode="post": 4개 탭의 기준 디자인이었다가(2026-08-07 "미디엄/노션 식",
// 2026-08-09 PostFormShell로 통일) 지금은 레터 글 전용 화면이다. "트렌드·칼럼
// 카드"라는 별도 진입점은 없앴다 — 분류를 머니 트렌드/깊은 이야기로 두고
// 본문을 비워두면 저장 시점에 자동으로 카드 전용 글이 된다(posts/edit/page.tsx
// save() 참조). 그래서 이 컴포넌트엔 더 이상 "카드냐 레터냐"를 고르는 UI가
// 없다 — 쓰고 안 쓰고만 있으면 된다.
export function PostMode({ value, body, patch, patchBody, editor, uploadError }: Props) {
  return (
    <PostFormShell
      // 본문 최소 높이를 줄였더니(RichTextEditor.tsx 참조, 540→180px) 카드가
      // 화면 위쪽에서 짧게 끝나고 그 아래 회색 페이지 여백이 크게 남아
      // "본문 창이 다 안 보이고 허전하다"는 지적을 받았다(2026-08-09) — 카드
      // 자체가 뷰포트 대부분을 채우도록 최소 높이를 준다. 짧은 글은 카드
      // 안쪽에 여백으로 남고, 긴 글은 자연스럽게 넘친다.
      cardClassName="min-h-[70vh]"
      coverImage={{
        value: value.cover_image_url ?? null,
        onChange: (url) => patch({ cover_image_url: url }),
        fallbackHint: "AI LENS 기본 로고가 대신 나갑니다.",
      }}
      headline={value.headline ?? ""}
      onHeadlineChange={(v) => patch({ headline: v })}
      subtitle={value.subtitle ?? ""}
      onSubtitleChange={(v) => patch({ subtitle: v })}
      subtitlePlaceholder="부제 (선택)"
      metaRow={
        <>
          <MetaField label="발행일">
            <DatePickerField
              value={value.publish_date ?? ""}
              onChange={(v) => patch({ publish_date: v })}
            />
          </MetaField>
          <MetaDivider />
          {/* "분류"(형식: 이슈톡톡/인사이트/용어해설)는 2026-08-19 완전
              폐기 — "카테고리"(무슨 주제인가) 하나로 통합했다. 예전엔 형식
              축과 주제 축이 따로 있어서 독자에게도 관리자에게도 구분이
              헷갈렸다("인사이트에서 이슈 톡톡으로 옮기려는데 안 된다" 류
              피드백 반복). 이제 글은 오직 카테고리로만 분류된다 — 증시/
              부동산/산업/금융·정책/국제(ECON_CATEGORIES, 2026-08-17 확정,
              "재테크"는 2026-09-11 제거). "카드 전용 발행"(본문 비우면 상세페이지 없이 홈 카드로만
              나가는 것)은 더 이상 section==="column" 조건이 아니라 "본문이
              비어있는가" 하나로 단순화했다(posts/edit/page.tsx save() 참조). */}
          <MetaField label="카테고리">
            <CustomSelect
              value={body.category ?? ""}
              onChange={(v) => patchBody({ category: v || undefined })}
              options={[
                { value: "", label: "미분류" },
                ...ECON_CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
            />
          </MetaField>
          <MetaDivider />
          {/* 작성자 — "이슈 톡톡"의 정체성(실명 에디터가 쓴 글)을 위해
              추가. 분류와 무관하게 항상 입력 가능 — 다른 분류 글에도 실명
              저작자를 남기고 싶을 수 있어 굳이 안 막는다. */}
          <MetaField label="작성자">
            <input
              value={value.editor_id ?? ""}
              onChange={(e) => patch({ editor_id: e.target.value || null })}
              placeholder="예: 김민준 기자"
              className="ui-input rounded-lg px-2 py-0.5 text-[12.5px]"
              style={{ width: 110 }}
            />
          </MetaField>
          <MetaDivider />
          {/* 원문 URL — 서울경제 원본 취재 기사 링크(2026-08-13, SEO/GEO/AEO
              감사 — "취재된 원본을 바탕으로" 라는 JSON-LD 소개가 검증 가능한
              링크 없이 있던 문제). 없어도 발행은 된다 — 있으면 상세 페이지에
              "원문 보기" 링크와 JSON-LD citation으로 노출된다. */}
          <MetaField label="원문 URL">
            <input
              value={value.source_url ?? ""}
              onChange={(e) => patch({ source_url: e.target.value || null })}
              placeholder="https://www.sedaily.com/..."
              className="ui-input rounded-lg px-2 py-0.5 text-[12.5px]"
              style={{ width: 220 }}
            />
          </MetaField>
          <MetaDivider />
          {/* 배경 음악 링크 — 유튜브 URL(2026-08-16). 있으면 홈 하단 플레이어
              ("오늘의 핵심 뉴스")가 TTS 낭독 대신 이 영상의 소리를 재생한다.
              지금은 유튜브만 지원(TodayNewsPlayer.tsx 참조). */}
          <MetaField label="배경 음악">
            <input
              type="url"
              value={value.media_embed_url ?? ""}
              onChange={(e) => patch({ media_embed_url: e.target.value || null })}
              placeholder="https://www.youtube.com/watch?v=..."
              className="ui-input rounded-lg px-2 py-0.5 text-[12.5px]"
              style={{ width: 220 }}
            />
          </MetaField>
        </>
      }
      // "핵심 정리/키워드/닫는 줄" 안내는 항상 떠 있던 문장이었다가 툴바 끝의
      // 아이콘(hover 툴팁)으로 옮겼다(2026-08-09, "본문 한 글자도 안 썼는데
      // 계속 떠 있다" 지적) — EditorToolbar 참조. 여기 footer엔 지금 상태에서
      // 실제로 의미가 바뀌는 것(카드 전용 발행 여부)만 조건부로 남긴다.
      footer={
        <p className="px-1 text-xs text-gray-400">
          본문을 비워두고 저장하면 상세 페이지 없이 홈 화면 카드로만 발행됩니다 —
          나중에 본문을 채워서 저장하면 정식 글로 바뀝니다.
        </p>
      }
    >
      <EditorBody
        editor={editor}
        placeholder="본문을 써보세요. 이미지는 끌어놓거나 붙여넣으면 그 자리에 들어갑니다."
        uploadError={uploadError}
      />
    </PostFormShell>
  );
}
