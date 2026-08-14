// next.config.ts의 basePath: "/saju"와 동일한 값 — next/image src나 fetch()
// URL처럼 Next가 basePath를 자동으로 붙여주지 않는 곳에서 수동으로 붙일 때 씀
// (next/link·router.push는 Next가 자동 처리하므로 여기 안 씀).
export const BASE_PATH = "/saju";

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
