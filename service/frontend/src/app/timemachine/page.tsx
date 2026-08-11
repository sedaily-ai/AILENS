import { TimeMachineClient } from './TimeMachineClient';

// 메타데이터는 layout.tsx 하나로 통일(SEO 감사 2026-08-11) — page.tsx와
// layout.tsx 둘 다 metadata를 export하고 있었고 canonical도 서로 달라서
// (여긴 상대경로 '/timemachine', layout.tsx는 절대경로) 어느 쪽이 최종
// 반영되는지 불분명했다. 더 완전한 layout.tsx(OG 포함) 쪽만 남긴다.

export default function TimeMachinePage() {
  return <TimeMachineClient />;
}
