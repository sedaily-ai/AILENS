import type { LensFormat } from '@/shared/constants/lensPerspectives';

/**
 * 4개 형식 탭(레터/웹툰/팟캐스트/영상)용 픽토그램 — 2026-08-24 (재작업).
 * 사용자가 첨부한 무드(네이버 앱 런처식 컬러 픽토그램: 둥근 사각 타일 안에
 * 채워진 심볼 + 흰 여백으로 판 디테일)에 맞춰 다시 그렸다.
 *
 * 타일은 currentColor를 따른다 — 비활성 탭은 회색, 활성 탭은 그 형식 색으로
 * 물들어 "선택하면 켜지는 앱 타일"처럼 보인다. 안쪽 심볼은 흰색이라 두 상태
 * 모두에서 보인다(회색 타일에서도 흰 심볼이 드러남). aria-hidden 장식이라
 * 대비 기준 대상은 아니고, 탭 식별은 텍스트 라벨이 담당한다.
 */

/** 타일 — 모든 형식 공통. */
function Tile() {
  return <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />;
}

/** 레터 — 봉투. */
function LetterArt() {
  return (
    <>
      <Tile />
      <rect x="6.4" y="8.2" width="11.2" height="7.6" rx="1.4" fill="#fff" />
      <path
        d="M7.1 9l4.2 3c.4.3 1 .3 1.4 0l4.2-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** 웹툰 — 말풍선(대화). */
function WebtoonArt() {
  return (
    <>
      <Tile />
      <path
        fill="#fff"
        d="M7.5 8h9c.8 0 1.5.7 1.5 1.5v3.5c0 .8-.7 1.5-1.5 1.5h-3l-2.6 2.2c-.3.3-.9.1-.9-.4v-1.8h-2.5C6.7 14.5 6 13.8 6 13V9.5C6 8.7 6.7 8 7.5 8z"
      />
      <circle cx="10.4" cy="11.2" r="0.95" fill="currentColor" />
      <circle cx="14" cy="11.2" r="0.95" fill="currentColor" />
    </>
  );
}

/** 팟캐스트 — 마이크. */
function PodcastArt() {
  return (
    <>
      <Tile />
      <rect x="10.3" y="6.4" width="3.4" height="6.8" rx="1.7" fill="#fff" />
      <path d="M8.2 11.4a3.8 3.8 0 0 0 7.6 0" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 15.2v2.3" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10.2 17.7h3.6" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </>
  );
}

/** 영상 — 재생. */
function VideoArt() {
  return (
    <>
      <Tile />
      <path
        fill="#fff"
        d="M10 8.9c0-.6.6-.95 1.1-.62l4.3 2.98c.47.32.47 1.02 0 1.34l-4.3 2.98c-.5.34-1.1-.02-1.1-.62z"
      />
    </>
  );
}

const ART: Record<LensFormat, () => React.ReactElement> = {
  letter: LetterArt,
  webtoon: WebtoonArt,
  podcast: PodcastArt,
  video: VideoArt,
};

export function LensFormatArt({ format, size = 22 }: { format: LensFormat; size?: number }) {
  const Art = ART[format];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <Art />
    </svg>
  );
}
