'use client';

import { createPortal } from 'react-dom';
import { resolveVideo } from '@/shared/lib/media/videoEmbed';
import type { CmsVideo } from '@/shared/lib/api/cmsPostsApi';

// lens 영상은 YouTube/네이버TV 임베드가 아니라 S3에 올린 mp4 원본 파일이라
// resolveVideo()가 못 알아본다(둘 다 URL 패턴 기반 판별). iframe 대신 그냥
// <video> 태그로 재생 — 직접 파일 URL 전반에 쓸 수 있는 범용 분기(2026-08-20).
const DIRECT_FILE_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

/**
 * 영상 재생 모달 — 홈 "영상으로 보는 이슈"(VideoPreviewSection)와 /video
 * 목록(VideoListClient) 둘 다 공유(2026-08-20, 사용자 요청 — "영상 카테고리
 * 페이지 안에서도 동일하게 모달 뜨도록"). ArchiveCalendarModal.tsx와 같은
 * 관례(fixed inset-0 flex items-center justify-center, 배경 클릭·Esc로
 * 닫기, transform 정렬 안 씀). 영상 콘텐츠라 배경은 카드보다 더 어둡게
 * (black/80).
 *
 * document.body에 포털로 띄운다(실사용 버그 — 헤더·하단 오디오 플레이어가
 * 안 가려지고 영상도 화면에 안 보이는 걸 사용자가 스크린샷으로 발견).
 * 원인: FeedPage.tsx의 탭 전환 애니메이션이 `.tab-fade-in { animation: ...
 * translateY(0) ... both }`으로 main 콘텐츠 래퍼에 transform을 남겨두는데,
 * transform이 있는 조상은(값이 translateY(0)이라도) position:fixed 자손의
 * containing block이 된다 — 그러면 모달의 "fixed"가 뷰포트가 아니라 그
 * 래퍼(문서 전체 높이) 기준으로 계산돼, 어둡게 덮는 배경은 넓어서 눈에
 * 보이지만 가운데 정렬된 실제 내용(닫기 버튼·영상)은 문서 중간 어딘가로
 * 밀려나 현재 스크롤 위치 밖으로 사라진다. 헤더·오디오바는 그 래퍼 밖(더
 * 상위)에 있어 이 문제를 안 겪고 그대로 위에 뜬다. createPortal로 body
 * 최상위에 붙이면 어떤 조상의 transform과도 무관해진다.
 */
export function VideoLightbox({ video, onClose }: { video: CmsVideo; onClose: () => void }) {
  const resolved = resolveVideo(video.video_url);
  const isDirectFile = !resolved && DIRECT_FILE_RE.test(video.video_url);
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80"
      style={{ padding: 'clamp(16px, 4vw, 40px)', zIndex: 200 }}
      onClick={onClose}
    >
      <div
        className="relative w-full"
        style={{ maxWidth: 960 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ top: -44, right: 0, width: 36, height: 36, borderRadius: '50%', color: '#fff' }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="aspect-video w-full overflow-hidden" style={{ borderRadius: 12, background: '#000' }}>
          {resolved ? (
            <iframe
              src={resolved.embedUrl}
              title={video.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : isDirectFile ? (
            <video src={video.video_url} controls autoPlay className="w-full h-full" style={{ objectFit: 'contain' }} />
          ) : null}
        </div>
        <p
          className="text-white"
          style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 16, fontWeight: 700, marginTop: 14, lineHeight: 1.45 }}
        >
          {video.title}
        </p>
      </div>
    </div>,
    document.body,
  );
}
