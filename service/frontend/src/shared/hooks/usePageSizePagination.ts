'use client';

import { useState } from 'react';

/**
 * 전체 목록을 페이지 크기에 맞춰 나누는 공용 계산.
 * 카테고리 목록은 URL에서 복원한 controlled 상태·동작을 전달한다.
 * 인자를 생략한 호출은 기존 로컬 상태를 사용한다.
 */
export function usePageSizePagination<T>(
  items: T[],
  defaultPageSize: number,
  basePath: string,
  initialPage: number,
  controlled?: {
    pageSize: number;
    page: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageHref: (page: number) => string;
  },
) {
  const [localPageSize, setPageSize] = useState(defaultPageSize);
  const [localPage, setClientPage] = useState(initialPage);
  const pageSize = controlled?.pageSize ?? localPageSize;
  const clientPage = controlled?.page ?? localPage;

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
    pageHref: controlled?.pageHref ?? pageHref,
    isCustomSize,
    pageSize,
    onPageChange: controlled?.onPageChange ?? setClientPage,
    onPageSizeChange: controlled?.onPageSizeChange ?? changePageSize,
  };
}
