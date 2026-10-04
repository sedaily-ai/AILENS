import type { SVGProps } from 'react';

// 기사 상세 전용 듀오톤 라인 아이콘 세트.
//
// 24px 격자, 선 1.6, 둥근 끝, 도형 일부를 옅은 색 면으로 한 겹 깔아 입체감을 준다(Phosphor·Streamline 듀오톤 계열). 한 세트로 모양·두께·여백을 통일한다.
// 색: 선은 currentColor(부모 글자색), 면은 tint(기본 currentColor 14%) — 부모 색만 바꾸면 전체가 물든다.

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number; tint?: string };

function Base({ size = 24, tint, children, ...rest }: IconProps & { children: (fill: string) => React.ReactNode }) {
  const fill = tint ?? 'currentColor';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children(fill)}
    </svg>
  );
}

/** 스톱워치 — 오른쪽 절반을 칠해 "30초(= 60초의 절반)"를 표현. */
export function IconStopwatch(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <path d="M12 13.5V6a7.5 7.5 0 0 1 0 15Z" fill={f} fillOpacity={0.18} stroke="none" />
          <circle cx="12" cy="13.5" r="7.5" />
          <path d="M9.5 3h5M12 3v3" />
          <path d="M12 13.5V9.2" />
          <path d="m18.4 7.2 1.4-1.4" />
        </>
      )}
    </Base>
  );
}

/** 레터 — 봉투. */
function IconLetter(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <rect x="3.4" y="5.6" width="17.2" height="12.8" rx="2.8" fill={f} fillOpacity={0.16} />
          <path d="m4.6 8.4 6.2 4.6a2 2 0 0 0 2.4 0l6.2-4.6" />
        </>
      )}
    </Base>
  );
}

/** 웹툰 — 세 컷의 칸. */
function IconWebtoon(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <rect x="3.6" y="3.8" width="16.8" height="7.4" rx="2" fill={f} fillOpacity={0.16} />
          <rect x="3.6" y="14" width="7.8" height="6.2" rx="2" />
          <rect x="14" y="14" width="6.4" height="6.2" rx="2" />
        </>
      )}
    </Base>
  );
}

/** 팟캐스트 — 마이크. */
function IconPodcast(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <rect x="8.8" y="3.4" width="6.4" height="11.4" rx="3.2" fill={f} fillOpacity={0.16} />
          <path d="M5.4 11.6a6.6 6.6 0 0 0 13.2 0M12 18.2v2.6M9 20.8h6" />
        </>
      )}
    </Base>
  );
}

/** 영상 — 재생. */
function IconVideo(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <rect x="3.4" y="5.2" width="17.2" height="13.6" rx="3.4" fill={f} fillOpacity={0.16} />
          <path d="M10.4 9.6v4.8l4.2-2.4Z" fill="currentColor" fillOpacity={0.9} />
        </>
      )}
    </Base>
  );
}

/** 형식 이름 → 아이콘. */
export function FormatIcon({ format, ...props }: IconProps & { format: string }) {
  if (format === 'letter') return <IconLetter {...props} />;
  if (format === 'webtoon') return <IconWebtoon {...props} />;
  if (format === 'podcast') return <IconPodcast {...props} />;
  return <IconVideo {...props} />;
}
