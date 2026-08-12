import type { Editor } from "@tiptap/react";
import { EditorBody } from "@/components/RichTextEditor";
import { DatePickerField } from "@/components/DatePickerField";
import { CustomSelect } from "@/components/CustomSelect";
import { PostFormShell } from "./PostFormShell";
import { MetaField, MetaDivider } from "./MetaField";
import type { ModeProps } from "./shared";

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
          <MetaField label="분류">
            <CustomSelect
              value={body.section ?? ""}
              onChange={(v) => patchBody({ section: (v || undefined) as "trend" | "column" | "glossary" | undefined })}
              // 워딩은 공개 사이트 나브 라벨과 동일하게 맞춘다(2026-08-12,
              // posts/page.tsx CHANNEL_FILTERS 주석 참조).
              options={[
                { value: "", label: "오늘의 이슈" },
                { value: "trend", label: "딥다이브" },
                { value: "column", label: "인사이트" },
                { value: "glossary", label: "용어 해설" },
              ]}
            />
          </MetaField>
        </>
      }
      // "핵심 정리/키워드/닫는 줄" 안내는 항상 떠 있던 문장이었다가 툴바 끝의
      // 아이콘(hover 툴팁)으로 옮겼다(2026-08-09, "본문 한 글자도 안 썼는데
      // 계속 떠 있다" 지적) — EditorToolbar 참조. 여기 footer엔 지금 상태에서
      // 실제로 의미가 바뀌는 것(카드 전용 발행 여부)만 조건부로 남긴다.
      footer={
        (body.section === "trend" || body.section === "column") && (
          <p className="px-1 text-xs text-gray-400">
            본문을 비워두고 저장하면 상세 페이지 없이 홈 화면 카드로만 발행됩니다 —
            나중에 본문을 채워서 저장하면 정식 글로 바뀝니다.
          </p>
        )
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
