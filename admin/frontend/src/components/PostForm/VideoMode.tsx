import { DatePickerField } from "@/components/DatePickerField";
import { PostFormShell } from "./PostFormShell";
import { MetaField } from "./MetaField";
import { MediaDownloadButton } from "@/components/MediaDownloadButton";
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
// 포맷 — YouTube 링크를 그대로 붙여넣으면 프론트가 임베드로 바꾼다. 다른
// 탭과 같은 PostFormShell을 쓴다(2026-08-09 디자인 통일) — 커버 이미지도
// 카드 안 필드가 아니라 다른 탭과 같은 위치(카드 위 배너)로 옮겼다.
export function VideoMode({ value, body, patch, patchBody }: ModeProps) {
  const videoId = extractYouTubeId(body.video_url ?? "");
  return (
    <PostFormShell
      coverImage={{
        value: value.cover_image_url ?? null,
        onChange: (url) => patch({ cover_image_url: url }),
        fallbackHint: "유튜브 원본 썸네일이 자동으로 쓰입니다.",
      }}
      headline={value.headline ?? ""}
      onHeadlineChange={(v) => patch({ headline: v })}
      headlinePlaceholder="예: 3분으로 보는 이번 주 금리 이슈"
      metaRow={
        <MetaField label="발행일">
          <DatePickerField
            value={value.publish_date ?? ""}
            onChange={(v) => patch({ publish_date: v })}
          />
        </MetaField>
      }
    >
      <div className="px-6 py-5">
        <label className={LABEL}>영상 URL</label>
        <input
          value={body.video_url ?? ""}
          onChange={(e) => patchBody({ video_url: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=... 또는 youtu.be/..."
          className="ui-input w-full rounded-lg px-3 py-2 text-sm"
        />
        {videoId ? (
          <div className="mt-3 aspect-video w-full max-w-[360px] overflow-hidden rounded-lg bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title="미리보기"
              className="h-full w-full"
              allow="accelerate-compute; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : body.video_url ? (
          // 2026-09-28 — YouTube가 아니면(자동 파이프라인이 채우는 S3 mp4
          // 직링크 등, LensMode.tsx의 같은 날짜 주석 참고) 썸네일 대신
          // 네이티브 <video>로 직접 재생한다.
          <video controls src={body.video_url} className="mt-3 w-full max-w-[360px] rounded-lg bg-black">
            영상을 재생할 수 없습니다.
          </video>
        ) : null}
        <MediaDownloadButton url={body.video_url ?? ""} className="mt-2" />
      </div>
    </PostFormShell>
  );
}
