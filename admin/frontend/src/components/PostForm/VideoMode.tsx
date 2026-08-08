import { CoverImageField } from "@/components/CoverImageField";
import { LABEL, type ModeProps } from "./shared";

// 영상 콘텐츠(2026-08-06) — 썸네일 미리보기용. watch?v=, youtu.be/, embed/
// 세 형태 전부 지원. 프론트 shared/lib/videoEmbed.ts 와 로직 동일(중복이지만
// admin과 frontend가 별도 빌드라 공유 불가 — cms_posts_ddb_client.py 같은
// 이유로 이미 이 저장소 전체가 감수하는 패턴).
function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

// mode="video" — 영상 콘텐츠(2026-08-06). URL 하나만 있으면 되는 가장 가벼운
// 포맷 — YouTube 링크를 그대로 붙여넣으면 프론트가 임베드로 바꾼다.
export function VideoMode({ value, body, patch, patchBody }: ModeProps) {
  const videoId = extractYouTubeId(body.video_url ?? "");
  return (
    <div className="max-w-[640px] mx-auto space-y-4">
      <div className="ui-card rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <label className="flex items-center gap-1.5 text-gray-400">
            발행일
            <input
              type="date"
              value={value.publish_date ?? ""}
              onChange={(e) => patch({ publish_date: e.target.value })}
              className="border-0 bg-transparent font-medium text-gray-700 outline-none"
            />
          </label>
        </div>

        <div>
          <label className={LABEL}>제목 *</label>
          <input
            value={value.headline ?? ""}
            onChange={(e) => patch({ headline: e.target.value })}
            placeholder="예: 3분으로 보는 이번 주 금리 이슈"
            className="ui-input w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className={LABEL}>영상 URL</label>
          <input
            value={body.video_url ?? ""}
            onChange={(e) => patchBody({ video_url: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=... 또는 youtu.be/..."
            className="ui-input w-full rounded-lg px-3 py-2 text-sm"
          />
          {videoId ? (
            <div className="mt-3 aspect-video w-full max-w-[360px] overflow-hidden rounded-lg bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          ) : body.video_url ? (
            <p className="mt-2 text-xs text-amber-600">YouTube 링크가 아니면 썸네일 미리보기가 안 뜰 수 있어요 — 저장은 그대로 됩니다.</p>
          ) : null}
        </div>

        <div>
          <label className={LABEL}>
            커버 이미지
            <span className="ml-2 font-normal text-gray-500">비워두면 YouTube 썸네일을 자동으로 씁니다</span>
          </label>
          <CoverImageField
            value={value.cover_image_url ?? null}
            onChange={(url) => patch({ cover_image_url: url })}
            fallbackHint="유튜브 원본 썸네일이 자동으로 쓰입니다."
          />
        </div>
      </div>
    </div>
  );
}
