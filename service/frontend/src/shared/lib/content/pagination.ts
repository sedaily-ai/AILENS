/**
 * 페이지 번호 목록(생략 부호 "…" 포함). 총 페이지가 많을 때(예: 52페이지) 전부 나열하면 화면이 깨지므로 일부만 보여 준다.
 * 현재 페이지가 속한 blockSize(기본 10)개 구간을 항상 통째로 보여 주고(국내 뉴스 사이트 게시판 관례),
 * 그 구간 밖에 더 있으면 첫/끝 페이지 + 생략 부호로 표시한다.
 */
export type PageItem = number | 'ellipsis';

export function buildPageItems(current: number, total: number, blockSize = 10): PageItem[] {
  if (total <= 1) return [1];

  const blockStart = Math.floor((current - 1) / blockSize) * blockSize + 1;
  const blockEnd = Math.min(blockStart + blockSize - 1, total);

  const items: PageItem[] = [];

  if (blockStart > 1) {
    items.push(1);
    if (blockStart > 2) items.push('ellipsis');
  }

  for (let p = blockStart; p <= blockEnd; p += 1) items.push(p);

  if (blockEnd < total) {
    if (blockEnd < total - 1) items.push('ellipsis');
    items.push(total);
  }

  return items;
}
