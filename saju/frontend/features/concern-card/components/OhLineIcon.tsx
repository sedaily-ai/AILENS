import type { Oh } from '../lib/ohVisual';

interface Props {
  oh: Oh;
  size?: number;
}

const STROKE = { stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

function Wood() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M32 52V16" {...STROKE} />
      <path d="M32 30l14 -8" {...STROKE} strokeWidth="2" opacity="0.55" />
    </svg>
  );
}

function Fire() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M28 52V22c0-6 6-9 4-16 6 4 8 10 5 15 4-2 6-6 5-10 4 5 4 12-2 17-3 3-4 6-4 10v14" {...STROKE} />
      <path d="M40 52V32c0-3 2-5 4-7" {...STROKE} strokeWidth="2" opacity="0.55" />
    </svg>
  );
}

function Earth() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M16 44c0-11 7-20 16-20s16 9 16 20" {...STROKE} />
      <path d="M12 44h40" {...STROKE} />
    </svg>
  );
}

function Metal() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M16 46l14-28 18 8" {...STROKE} />
    </svg>
  );
}

function Water() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%">
      <path d="M10 26c5-6 9-6 14 0s9 6 14 0 9-6 14 0" {...STROKE} />
      <path d="M10 40c5-6 9-6 14 0s9 6 14 0 9-6 14 0" {...STROKE} strokeWidth="2" opacity="0.55" />
    </svg>
  );
}

const ICONS: Record<Oh, () => React.JSX.Element> = {
  목: Wood, 화: Fire, 토: Earth, 금: Metal, 수: Water,
};

export function OhLineIcon({ oh, size = 56 }: Props) {
  const Icon = ICONS[oh];
  return (
    <span style={{ width: size, height: size, display: 'inline-flex' }}>
      <Icon />
    </span>
  );
}
