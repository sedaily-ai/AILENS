/**
 * 페이지 번호 목록 — 생략 부호("…") 포함. 총 페이지가 많을 때(예: 52페이지)
 * 전부 나열하면 화면이 깨진다는 걸 실측으로 확인(2026-09-02, /webtoon에서
 * "8 9 10 11 ... 52"가 줄바꿈도 없이 한 줄로 넘쳐 흐르는 스크린샷 — 원인은
 * WebtoonListClient.tsx가 `Array.from({length: totalPages})`로 전체를
 * 그냥 다 렌더링하고 있었던 것). 같은 세션에서 만든 shared/ui/ListPagination.tsx
 * (video/listen용)도 같은 패턴이라 flex-wrap 덕에 안 깨질 뿐 페이지가
 * 많아지면 버튼이 수십 개씩 나열되는 건 똑같았다 — 둘 다 이 함수로 교체.
 *
 * 2026-09-30 — 현재 페이지 좌우 sibling만 보여주던 방식(구글 검색 결과
 * 스타일, "1 2 … 16")에서 "1~10칸씩 통째로 보여주는" 방식(국내 뉴스
 * 사이트 게시판 관례, 카테고리 페이지네이션 신설 때 사용자가 직접
 * 지적: "번호를 1,2,3,4,5,6,7,8,9,10 이 다 보이도록")으로 교체. 현재
 * 페이지가 속한 blockSize(기본 10)개 구간을 항상 통째로 보여주고, 그
 * 구간 밖에 더 있으면 첫/끝 페이지 + 생략 부호로 표시.
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
