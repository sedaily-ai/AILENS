/**
 * 페이지 번호 목록 — 생략 부호("…") 포함. 총 페이지가 많을 때(예: 52페이지)
 * 전부 나열하면 화면이 깨진다는 걸 실측으로 확인(2026-09-02, /webtoon에서
 * "8 9 10 11 ... 52"가 줄바꿈도 없이 한 줄로 넘쳐 흐르는 스크린샷 — 원인은
 * WebtoonListClient.tsx가 `Array.from({length: totalPages})`로 전체를
 * 그냥 다 렌더링하고 있었던 것). 같은 세션에서 만든 shared/ui/ListPagination.tsx
 * (video/listen용)도 같은 패턴이라 flex-wrap 덕에 안 깨질 뿐 페이지가
 * 많아지면 버튼이 수십 개씩 나열되는 건 똑같았다 — 둘 다 이 함수로 교체.
 *
 * 항상 첫/마지막 페이지를 보여주고, 현재 페이지 좌우로 siblingCount개씩
 * 보여주고, 나머지 구간은 'ellipsis' 하나로 뭉친다. 흔한 페이지네이션
 * UX 패턴(구글 검색 결과 등)과 동일.
 */
export type PageItem = number | 'ellipsis';

export function buildPageItems(current: number, total: number, siblingCount = 1): PageItem[] {
  if (total <= 1) return [1];

  // 생략 부호를 쓸 필요가 없을 만큼 적으면(첫/끝 2개 + 현재 주변 + 여백)
  // 그냥 전부 보여준다 — 어차피 생략 부호 자리 하나 아끼자고 숫자를
  // 감추는 건 페이지 수가 적을 때는 오히려 불친절하다.
  const totalNumbersWhenNoEllipsis = siblingCount * 2 + 5; // 첫+끝+현재+양쪽생략경계
  if (total <= totalNumbersWhenNoEllipsis) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, total);

  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  const items: PageItem[] = [1];

  if (showLeftEllipsis) {
    items.push('ellipsis');
  } else {
    for (let p = 2; p < leftSibling; p += 1) items.push(p);
  }

  for (let p = leftSibling; p <= rightSibling; p += 1) {
    if (p !== 1 && p !== total) items.push(p);
  }

  if (showRightEllipsis) {
    items.push('ellipsis');
  } else {
    for (let p = rightSibling + 1; p < total; p += 1) items.push(p);
  }

  items.push(total);
  return items;
}
