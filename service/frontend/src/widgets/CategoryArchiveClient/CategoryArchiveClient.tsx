'use client';

// 경제 버티컬 카테고리(증시/부동산/산업/금융·정책/국제) 아카이브. ColumnListClient.tsx와 같은 패턴(Header+ArchiveHeader+ArchiveList)을 쓰며,
// 카테고리마다 페이지 구조가 같고 설정값만 달라 하나의 클라이언트 컴포넌트로 공유한다. 형식(kind)과 무관하게 category(주제) 하나로만 필터링한다.
import { useEffect, useState } from 'react';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { ArchiveList } from '@/shared/ui/list/ArchiveList';
import { ListPagination } from '@/shared/ui/list/ListPagination';
import { CategoryLead, CategoryCards } from '@/shared/ui/list/CategoryLead';
import type { RailItem } from '@/shared/ui/list/HotLettersRail';
import { DateRangeFilter, type DateRange } from '@/shared/ui/list/DateRangeFilter';
import { kstTodayStr } from '@/shared/lib/date/date';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { buildHeaderTabs, type HeaderTabKey } from '@/shared/lib/headerTabs';
import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/content/archiveItems';
import { usePageSizePagination } from '@/shared/hooks/usePageSizePagination';
import { categoryMatches, type EconCategoryConfig } from '@/shared/constants/econCategories';
import { econSubcategoriesFor } from '@/shared/constants/econSubcategories';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

// 카테고리 아카이브 페이지 크기. video(24)·listen(30)과 같은 급의 목록이지만 ArchiveList는 사진 없이 텍스트 행만 그려 한 화면에 더 들어가도 부담이 적어 20으로 잡는다.
const CATEGORY_PAGE_SIZE = 20;

function dateHeaderText(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  return y && m && d ? `${y}년 ${m}월 ${d}일` : iso;
}
const PAGE_SIZE_OPTIONS = [20, 50, 100];

export function CategoryArchiveClient({
  config,
  tabKey,
  initialItems,
  initialHotLetters,
  initialPage = 1,
}: {
  config: EconCategoryConfig;
  tabKey: HeaderTabKey;
  initialItems: ArchiveItem[];
  // 홈(app/page.tsx)과 같은 서버 프리페치 패턴. 없으면 HotLettersRail이 클라이언트 fetch 완료 전까지 비어 인기글 섹션이 없는 것처럼 보이므로 첫 페인트부터 채운다.
  initialHotLetters?: TodayLetterCardLike[];
  /** /{category}/page/[n] 라우트가 넘기는 초기 페이지. */
  initialPage?: number;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>(initialItems);
  // 하위 카테고리 탭. econSubcategories.ts에 taxonomy가 있는 카테고리(현재 증시·산업)에서, 실제로 글이 있는 값만 탭으로 뜬다.
  const [activeSub, setActiveSub] = useState<string>('all');
  // 전체 메뉴(SearchOverlay)의 하위 카테고리 링크는 /{category}?sub=국내증시 로 온다. 서버가 searchParams를 읽으면 이 라우트가 통째로 동적이 되어 캐시가 깨지므로,
  // 마운트 뒤에 주소를 읽어 탭만 맞춘다(서버 렌더 HTML은 그대로 "전체").
  useEffect(() => {
    const sub = new URLSearchParams(window.location.search).get('sub');
    if (!sub || !econSubcategoriesFor(config.slug).includes(sub)) return;
    void Promise.resolve().then(() => setActiveSub(sub));
  }, [config.slug]);
  // 날짜별 보기: 고른 기간(KST 날짜)에 발행된 글만 남긴다. 불러온 글 안에서 거른다.
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [today] = useState(() => kstTodayStr());

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCmsPosts('letters', undefined, PAGE_SIZE), fetchLensPosts()]).then(
      ([letters, lens]) => {
        if (cancelled) return;
        // EconomyCategoryPage.tsx(서버 최초 fetch)와 같은 규칙 — 새 이름과 옛 이름이 섞여 있어 categoryMatches로 비교한다.
        const all = buildArchiveItems(letters, [], [], lens).filter((it) => categoryMatches(config, it.category));
        if (all.length > 0) setItems(all);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [config]);

  const subTabValues = econSubcategoriesFor(config.slug).filter((sub) =>
    items.some((it) => it.subcategory === sub),
  );
  const bySub = activeSub === 'all' ? items : items.filter((it) => it.subcategory === activeSub);
  const filteredItems = dateRange ? bySub.filter((it) => it.date >= dateRange.from && it.date <= dateRange.to) : bySub;

  // 영문판(en.sedaily.com) 섹션 홈과 같은 구조: [제목·하위 탭] → [편집형 상단: 큰 헤드라인+사진 / 보조 3건] → [카드 3건 + 날짜별 목록 | 우측 레일].
  // 편집형 상단·카드는 "전체" 탭이고 기간 필터가 없을 때만 보인다(하위 탭·기간을 고르면 목록만). 사진이 있는 최신 7건을 쓰고 아래 목록에서는 겹치지 않게 뺀다.
  const editorial = activeSub === 'all' && !dateRange;
  // 히어로 1건 + 카드 3건 = 4건. 사진 있는 최신 글에서 고른다.
  const featured = editorial ? filteredItems.filter((it) => it.avatarUrl && it.href).slice(0, 4) : [];
  const showLead = featured.length >= 1;
  const showCards = featured.length >= 4;
  const used = new Set(showLead ? featured.map((it) => it.key) : []);
  const listItems = showLead ? filteredItems.filter((it) => !used.has(it.key)) : filteredItems;

  const {
    pageItems, currentPage, totalPages, pageHref, isCustomSize, pageSize, onPageChange, onPageSizeChange,
  } = usePageSizePagination(listItems, CATEGORY_PAGE_SIZE, `/${config.slug}`, initialPage);
  const firstPage = currentPage === 1;
  const leadMode = showLead && firstPage;
  // 하위 탭이 있는 카테고리는 하위 탭에서만, 하위 탭이 없는 카테고리(국제 등)는 항상(날짜로 거를 길이 이 줄뿐이라).
  const showDateRow = activeSub !== 'all' || subTabValues.length === 0;
  const headDate = pageItems[0]?.date ?? '';
  // 우측 레일 "{분류} 많이 읽은 글": 지금 보는 분류(하위 탭 포함)의 글 10건. 조회수 집계가 없어 최신 글을 쓴다.
  const railItems: RailItem[] = bySub.filter((it) => it.href).slice(0, 10).map((it) => ({ key: it.key, href: it.href as string, title: it.title, thumb: it.avatarUrl, label: it.category ?? config.label }));
  const railHeading = `${activeSub === 'all' ? config.label : activeSub} 많이 읽은 글`;

  const dateRow = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 0 4px', minHeight: 44 }}>
      <span style={{ fontSize: 'clamp(15px, 2.2vw, 16.5px)', fontWeight: 700, letterSpacing: '-0.01em', color: '#374151' }}>{headDate ? dateHeaderText(headDate) : ''}</span>
      <DateRangeFilter
        value={dateRange}
        today={today}
        onChange={(v) => {
          setDateRange(v);
          onPageChange(1);
        }}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs(tabKey)} frosted section={{ label: config.label, href: '/' }} />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        {/* 영문판처럼 헤더 블록(큰 제목·밑줄·안내 문구) 없이 탭 줄만 둔다. 제목은 검색·스크린리더용으로만 남긴다. */}
        <h1 className="sr-only">{config.label}</h1>
        {(
          <div className="flex items-center" style={{ gap: 6, borderBottom: '1px solid #d3d6db', flexWrap: 'wrap', marginTop: 10 }}>
            {['all', ...subTabValues].map((key) => {
              const active = activeSub === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveSub(key);
                    onPageChange(1);
                  }}
                  style={{
                    padding: '10px 12px',
                    marginBottom: -1,
                    fontSize: 14.5,
                    fontWeight: active ? 700 : 500,
                    color: active ? '#111827' : '#6b7280',
                    background: 'none',
                    border: 'none',
                    borderBottom: active ? '3px solid #5b8def' : '3px solid transparent',
                    borderRadius: '2px 2px 0 0',
                    transition: 'color .15s ease, border-color .15s ease',
                    cursor: 'pointer',
                  }}
                >
                  {key === 'all' ? '전체' : key}
                </button>
              );
            })}
          </div>
        )}

        {showLead && firstPage && <CategoryLead lead={featured[0]} />}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]" style={{ columnGap: 40, paddingTop: leadMode ? 24 : 24 }}>
          <main style={{ padding: '0 0 80px' }}>
            {/* 날짜 줄은 하위 탭에서만 보인다("전체(홈)"에서는 어색하고 영문판 편집형 홈에도 날짜 버튼이 없다). */}
            {showDateRow && !(showCards && firstPage) && dateRow}
            {showCards && firstPage && <CategoryCards items={featured.slice(1, 4)} />}
            {showDateRow && showCards && firstPage && dateRow}
            <ArchiveList
              items={pageItems}
              skipFirstDate={showDateRow ? headDate : undefined}
              emptyLabel={dateRange ? '이 기간에 발행된 글이 없어요. 기간을 넓혀 보세요.' : `아직 ${config.label} 글이 없어요.`}
            />
            <ListPagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageHref={pageHref}
              isCustomSize={isCustomSize}
              onPageChange={onPageChange}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={onPageSizeChange}
              accentColor="#1f2937"
              totalCount={listItems.length}
            />
          </main>

          <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} railHeading={railHeading} railItems={railItems} />
        </div>
      </div>
    </div>
  );
}
