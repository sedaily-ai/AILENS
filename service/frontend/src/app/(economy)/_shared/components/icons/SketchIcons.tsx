// 도구 레일 스케치 아이콘 — 면은 채우지 않고 연필로 한 번 쓱 그은 선만 쓴다: 가는 선(1.3) + 같은 모양을 살짝 어긋나게 한 번 더 그은 옅은 보조선.
// 선 끝은 둥글고 모서리는 일부러 완전히 맞물리지 않게 열어 두었다(손으로 그린 느낌). 색은 currentColor이며 레일 CSS가 정한다.
type P = { size?: number };

function Sketch({ size = 24, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="sk"
    >
      {children}
    </svg>
  );
}

// 보조선: 같은 선을 한 칸 옮겨 옅게 — 연필을 두 번 겹쳐 그은 자국.
const G = { strokeWidth: 0.7, opacity: 0.45 } as const;

export function SketchListen({ size }: P) {
  return (
    <Sketch size={size}>
      <path d="M4.3 15.2V12.4C4.3 7.9 7.7 4.4 12 4.4c4.3 0 7.8 3.5 7.7 8" />
      <path d="M4.6 15.6C4.5 14.4 4.4 13 4.6 12" {...G} />
      <path d="M4.2 14.6 5.9 14.2c.7-.1 1.2.4 1.3 1l.3 3c.1.7-.4 1.3-1.1 1.4l-.8.1c-.8.1-1.5-.5-1.6-1.2Z" />
      <path d="M19.8 14.6 18.1 14.2c-.7-.1-1.2.4-1.3 1l-.3 3c-.1.7.4 1.3 1.1 1.4l.8.1c.8.1 1.5-.5 1.6-1.2Z" />
    </Sketch>
  );
}

export function SketchTextPlus({ size }: P) {
  return (
    <Sketch size={size}>
      <path d="M3.6 19 8.6 5.6 13.8 19" />
      <path d="M4.2 19.4 9 6.4" {...G} />
      <path d="M5.8 14.4c2.2-.3 4.3-.2 6.2.1" />
      <path d="M17.6 6v6.2M14.6 9.1h6.1" />
    </Sketch>
  );
}

export function SketchTextMinus({ size }: P) {
  return (
    <Sketch size={size}>
      <path d="M3.6 19 8.6 5.6 13.8 19" />
      <path d="M4.2 19.4 9 6.4" {...G} />
      <path d="M5.8 14.4c2.2-.3 4.3-.2 6.2.1" />
      <path d="M14.6 9.1h6.1" />
    </Sketch>
  );
}

export function SketchShare({ size }: P) {
  return (
    <Sketch size={size}>
      <path d="M12 15V4.6" />
      <path d="M8.2 8.2 12 4.4l3.9 3.8" />
      <path d="M7.6 11H6.4c-.9 0-1.5.6-1.5 1.5v6c0 .9.6 1.5 1.5 1.5h11.2c.9 0 1.5-.6 1.5-1.5v-6c0-.9-.6-1.5-1.5-1.5h-1.2" />
      <path d="M5.2 12.6v5.8" {...G} />
    </Sketch>
  );
}

export function SketchPrint({ size }: P) {
  return (
    <Sketch size={size}>
      <path d="M7.4 9.2V4.6c0-.4.3-.7.7-.7h7.8c.4 0 .7.3.7.7v4.6" />
      <path d="M7.4 16.4H5.7c-.9 0-1.5-.6-1.5-1.5v-4.2c0-.9.6-1.5 1.5-1.5h12.6c.9 0 1.5.6 1.5 1.5v4.2c0 .9-.6 1.5-1.5 1.5h-1.7" />
      <path d="M7.4 13.6h9.2v6.2c0 .3-.2.5-.5.5H7.9c-.3 0-.5-.2-.5-.5Z" />
      <path d="M9.6 16.4h4.8M9.6 18.3h3" {...G} />
    </Sketch>
  );
}
