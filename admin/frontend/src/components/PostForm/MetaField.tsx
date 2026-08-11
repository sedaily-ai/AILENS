import type { ReactNode } from "react";

// PostFormShell의 메타정보 줄(발행일·분류·라벨 등)에 쓰는 "라벨 + 값" 한 쌍과
// 항목 사이 구분선. 4개 글 유형 탭이 전부 이 두 조각으로 메타 줄을 조립한다
// (2026-08-09, 탭마다 제각각이던 메타 줄 스타일 통일).

export function MetaField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      {label}
      {children}
    </label>
  );
}

export function MetaDivider() {
  return <span className="h-3 w-px bg-gray-200" />;
}
