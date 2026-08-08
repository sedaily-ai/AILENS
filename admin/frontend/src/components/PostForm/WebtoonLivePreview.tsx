import type { CmsImage } from "@/lib/types";

// 실시간 미리보기(2026-08-07, "오른쪽 빈 공간에 실제로 어떻게 보이는지
// 보여달라" 요청) — 실제 공개 페이지(app/webtoon/view/WebtoonViewClient.tsx)
// 와 같은 마크업·톤을 축소판으로 재현한다. 컷을 카드별로 따로 편집하다 보면
// 전체 흐름이 한눈에 안 들어온다는 문제를 같이 푼다. 스크린샷이 아니라 실제
// React 렌더라 타이핑하는 대로 즉시 갱신된다.
export function WebtoonLivePreview({
  title,
  excerpt,
  panels,
}: {
  title: string;
  excerpt: string;
  panels: CmsImage[];
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden ring-1 ring-gray-200"
      style={{ background: "#f5f5f4" }}
    >
      <div className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 bg-white border-b border-gray-100">
        미리보기 — 실제 화면과 동일한 순서·톤으로 보여줍니다
      </div>
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
        <div style={{ padding: "20px 18px 12px", textAlign: "center" }}>
          <h1
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 18,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 6,
              letterSpacing: "-0.01em",
            }}
          >
            {title || "제목을 입력하세요"}
          </h1>
          {excerpt && (
            <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>{excerpt}</p>
          )}
        </div>

        {panels.length === 0 && (
          <p className="text-center text-[13px] text-gray-400 py-10 px-5">
            컷을 추가하면 여기에 순서대로 나타납니다.
          </p>
        )}

        <div className="flex flex-col">
          {panels.map((p, i) => (
            <div key={i} style={{ background: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본, 컷마다 비율이 달라 next/image 불가 */}
              <img
                src={p.url}
                alt={`컷 ${i + 1}`}
                style={{ display: "block", width: "100%", height: "auto" }}
              />
              {p.caption && (
                <p
                  style={{
                    margin: 0,
                    padding: "10px 16px",
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "#374151",
                    textAlign: "center",
                    background: "#fafaf9",
                    borderTop: "1px solid #f0f0ef",
                    borderBottom: "1px solid #f0f0ef",
                  }}
                >
                  {p.caption}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
