import type { SVGProps } from 'react';

// 기사 상세 전용 듀오톤 라인 아이콘 세트(2026-10-01).
//
// 방향: 귀여운 일러스트(예전에 "고급진 신문 디자인과 안 맞는다"는 피드백을 받은 손그림 캐릭터)가 아니라
// 절제된 듀오톤 라인 — 24px 격자, 선 1.6, 둥근 끝, 그리고 도형 일부를 옅은 색 면으로 한 겹 깔아 입체감을 준다
// (Phosphor·Streamline 듀오톤 계열). 한 세트로 일관되게 그려서 모양·두께·여백이 같다.
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

/** 헤드폰 — 듣기. */
export function IconListen(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <rect x="3.2" y="13.5" width="4.6" height="6.8" rx="2" fill={f} fillOpacity={0.16} />
          <rect x="16.2" y="13.5" width="4.6" height="6.8" rx="2" fill={f} fillOpacity={0.16} />
          <path d="M4.2 14.4V12a7.8 7.8 0 0 1 15.6 0v2.4" />
        </>
      )}
    </Base>
  );
}

/** 공유 — 세 점을 잇는 선. */
export function IconShare(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <circle cx="18" cy="5.6" r="2.6" fill={f} fillOpacity={0.18} />
          <circle cx="6" cy="12" r="2.6" fill={f} fillOpacity={0.18} />
          <circle cx="18" cy="18.4" r="2.6" fill={f} fillOpacity={0.18} />
          <path d="m8.3 10.7 7.4-3.9M8.3 13.3l7.4 3.9" />
        </>
      )}
    </Base>
  );
}

/** 프린터 — 인쇄. */
export function IconPrint(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <rect x="7" y="13.4" width="10" height="7" rx="1.4" fill={f} fillOpacity={0.18} />
          <path d="M7 9.2V4.4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4.8" />
          <path d="M7 17H5.4a1.9 1.9 0 0 1-1.9-1.9v-4a1.9 1.9 0 0 1 1.9-1.9h13.2a1.9 1.9 0 0 1 1.9 1.9v4a1.9 1.9 0 0 1-1.9 1.9H17" />
          <path d="M17.2 12.2h.01" />
        </>
      )}
    </Base>
  );
}

/** 글자 크게 — 큰 "A"와 더하기. */
export function IconTextPlus(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <circle cx="17.6" cy="7" r="3.8" fill={f} fillOpacity={0.18} stroke="none" />
          <path d="M3.4 20 9 6.5 14.6 20M5.4 15.4h7.2" />
          <path d="M17.6 4.4v5.2M15 7h5.2" />
        </>
      )}
    </Base>
  );
}

/** 글자 작게 — 작은 "A"와 빼기. */
export function IconTextMinus(props: IconProps) {
  return (
    <Base {...props}>
      {(f) => (
        <>
          <circle cx="17.6" cy="7" r="3.8" fill={f} fillOpacity={0.18} stroke="none" />
          <path d="M3.4 20 9 6.5 14.6 20M5.4 15.4h7.2" />
          <path d="M15 7h5.2" />
        </>
      )}
    </Base>
  );
}
