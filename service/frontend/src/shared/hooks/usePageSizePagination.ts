'use client';

import { useState } from 'react';

/**
 * 클라이언트 사이드 페이지 크기 조절 페이지네이션. `/video`·`/listen` 목록 페이지가 공유하는 pageSize/clientPage 상태와
 * totalPages/currentPage/pageHref/pageItems 계산이며, `<ListPagination>`이 그대로 받을 수 있는 형태로 반환한다.
 *
 * webtoon/lens 목록처럼 서버(page/[n] 라우트)가 페이지를 나누는 경우는 대상이 아니다.
 * video/listen처럼 전체를 한 번에 받아 클라이언트에서 페이지 크기를 바꿔가며 slice하는 패턴만 해당한다.
 */
export function usePageSizePagination<T>(
  items: T[],
  defaultPageSize: number,
  basePath: string,
  initialPage: number,
) {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [clientPage, setClientPage] = useState(initialPage);

  const isCustomSize = pageSize !== defaultPageSize;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(clientPage, totalPages);
  const pageHref = (n: number) => (n <= 1 ? basePath : `${basePath}/page/${n}`);
  const pageItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const changePageSize = (n: number) => {
    setPageSize(n);
    setClientPage(1);
  };

  return {
    pageItems,
    currentPage,
    totalPages,
    pageHref,
    isCustomSize,
    pageSize,
    onPageChange: setClientPage,
    onPageSizeChange: changePageSize,
  };
}
