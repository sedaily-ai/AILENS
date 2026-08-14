// 이 vendored 사본은 AILENS 안에 항상 /saju 아래에서만 렌더된다(독립 배포
// saju.sedaily.ai 였을 때 next.config.ts의 basePath가 하던 일을 여기서 고정값으로 대신함).
export const BASE_PATH = "/saju";

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
