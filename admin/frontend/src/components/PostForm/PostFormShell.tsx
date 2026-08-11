import type { ReactNode } from "react";
import { CoverImageField } from "@/components/CoverImageField";

// 4개 글 유형(레터 글/트렌드·칼럼 카드/웹툰/영상) 에디터가 공유하는 문서형
// 뼈대. 원래 mode="post"(레터 글)에만 있던 미디엄/노션 식 레이아웃(큰 무테
// 제목 → 얇은 메타정보 줄 → 본문 슬롯)을 셸로 뽑아 나머지 3개 탭도 같은 걸
// 쓰게 했다(2026-08-09, "디자인 구성이 달라서 어려움" 지적). 유형마다
// 실제로 다른 부분(리치텍스트 본문/웹툰 컷 목록/영상 URL)은 children
// 슬롯에 각자 넣는다 — 공통 부분만 셸이 갖고 있다.
//
// 커버 이미지·제목·메타줄·children이 전부 하나의 카드 안에 있다(2026-08-09
// 풀스크린 리디자인 때 테두리를 없앴다가 "경계가 없으니 어디에 쓸지
// 애매하다"는 피드백으로 다시 넣었고, 그다음엔 커버 이미지가 카드 밖에 혼자
// 떠 있는 게 헷갈린다는 지적으로 카드 안으로 옮겼다). 테두리·그림자를 뺀 뒤
// 페이지-카드 배경색 대비만으로 경계를 표현해봤지만(연회색 페이지 + 순백
// 카드), 카드가 짧을 때 그 아래 회색 여백이 "허전하다"는 지적이 이어져서
// 결국 페이지도 순백으로 통일했다(2026-08-09, "전부 다 화이트로") — 노션처럼
// 경계 없는 캔버스 하나로 최종 정착. `rounded-xl`(다른 화면 카드류와 통일,
// 2026-08-09 톤 정리)은 남아있지만 배경이 같은 흰색이라 시각적으로 드러나진
// 않는다.
// 섹션 사이 구분도 선(border-t) 대신 여백만으로 한다(같은 지적, "메타데이터
// 아래 선이 폼처럼 보인다" — 브런치처럼 크기·색상 위계 + 공백으로 나눈다).
//
// children 슬롯은 패딩을 주지 않는다 — RichTextEditor처럼 이미 자체
// 패딩(px-6 py-5)을 가진 컴포넌트가 있어서, 셸이 또 패딩을 얹으면 이중으로
// 겹친다. 자체 패딩이 없는 콘텐츠(웹툰 컷 목록 등)를 넣는 쪽에서
// `px-6 py-5` 래퍼로 감싸서 넘긴다.

interface CoverImageProps {
  value: string | null;
  onChange: (url: string | null) => void;
  fallbackHint: string;
}

interface Props {
  headline: string;
  onHeadlineChange: (v: string) => void;
  headlinePlaceholder?: string;
  /** undefined면 부제 입력 자체를 렌더링하지 않는다(예: 영상 탭). */
  onSubtitleChange?: (v: string) => void;
  subtitle?: string;
  subtitlePlaceholder?: string;
  /** 지정하면 부제가 <textarea rows={n}>으로 렌더링된다(트렌드 카드·웹툰의
   * 여러 줄 요약용). 기본은 한 줄 <input>(레터 글의 부제). */
  subtitleRows?: number;
  coverImage?: CoverImageProps;
  metaRow?: ReactNode;
  children?: ReactNode;
  /** 카드 아래, 셸 바깥에 붙는 보조 안내문(예: 트렌드 카드의 "대표 이미지 없음" 설명). */
  footer?: ReactNode;
  className?: string;
  /** 카드 자체에 덧붙일 클래스(예: 최소 높이). 레터 글 화면은 본문을 짧게
   * 줄였더니(2026-08-09) 카드가 화면 위쪽에 짧게 끝나고 그 아래로 회색
   * 여백이 크게 남아 "허전하다"는 지적을 받았다 — 카드가 뷰포트 대부분을
   * 채우도록 posts/edit/page.tsx에서 최소 높이를 넘겨준다. */
  cardClassName?: string;
}

export function PostFormShell({
  headline,
  onHeadlineChange,
  headlinePlaceholder = "제목을 입력하세요",
  subtitle,
  onSubtitleChange,
  subtitlePlaceholder = "부제 (선택)",
  subtitleRows,
  coverImage,
  metaRow,
  children,
  footer,
  className = "max-w-[880px] mx-auto space-y-3",
  cardClassName = "",
}: Props) {
  return (
    <div className={className}>
      <div className={`rounded-xl ${cardClassName}`} style={{ background: "var(--surface-card)" }}>
        {coverImage && (
          <div className="px-6 pt-6">
            <CoverImageField
              value={coverImage.value}
              onChange={coverImage.onChange}
              fallbackHint={coverImage.fallbackHint}
            />
          </div>
        )}

        <div className={coverImage ? "px-6 pt-4 pb-2" : "px-6 pt-6 pb-2"}>
          <input
            value={headline}
            onChange={(e) => onHeadlineChange(e.target.value)}
            placeholder={headlinePlaceholder}
            className="font-display w-full border-0 outline-none bg-transparent text-[34px] font-bold leading-[1.15] tracking-tight text-gray-900 placeholder-gray-300"
          />
          {onSubtitleChange &&
            (subtitleRows ? (
              <textarea
                value={subtitle ?? ""}
                onChange={(e) => onSubtitleChange(e.target.value)}
                placeholder={subtitlePlaceholder}
                rows={subtitleRows}
                className="mt-2 w-full resize-none border-0 outline-none bg-transparent text-[15px] leading-relaxed text-gray-500 placeholder-gray-300"
              />
            ) : (
              <input
                value={subtitle ?? ""}
                onChange={(e) => onSubtitleChange(e.target.value)}
                placeholder={subtitlePlaceholder}
                className="mt-2 w-full border-0 outline-none bg-transparent text-[15px] text-gray-500 placeholder-gray-300"
              />
            ))}
        </div>

        {metaRow && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 pb-4 text-[12.5px] text-gray-400">
            {metaRow}
          </div>
        )}

        {/* 메타 정보(발행일 등)와 본문(컷 목록·리치텍스트 등) 사이 경계 —
            2026-08-09, "여기 너무 경계가 없어 보인다" 지적으로 얇은 구분선을
            다시 넣었다. 예전엔 이 자리에 있던 border-t를 "메타데이터 아래
            선이 폼처럼 보인다"는 지적으로 뺐었는데, 실제로 써보니 반대로
            경계가 아예 안 읽힌다는 피드백이라 되돌렸다 — 다만 그때보다 훨씬
            얇게(hairline 톤)만 넣어서 "폼 칸"처럼 보이지 않게 했다. */}
        {metaRow ? (
          <div className="border-t" style={{ borderColor: "var(--border-hairline)" }}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>

      {footer}
    </div>
  );
}
