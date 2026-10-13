'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';
import { displayHeadline, seoHeadline } from '@ailens/domain';
import Link from 'next/link';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { kstDateTimeLabel } from '@/shared/lib/date/date';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import {
  lensFormatAt,
  lensPerspectiveAt,
  pickLensPhoto,
  READING_ACCENT,
} from '@/shared/constants/lensPerspectives';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { GoogleIcon } from '@/shared/ui/icons/SocialShareIcons';
import { ArticleShareButtons } from '@/shared/ui/article/ArticleShareButtons';
import { ArticleFontSizeControl } from '@/shared/ui/article/ArticleFontSizeControl';
import { ArticlePrintButton } from '@/shared/ui/article/ArticlePrintButton';
import { AiDisclaimer } from '@/shared/ui/notice/AiDisclaimer';
import { coreSummaryBullets, FormatPicker, LensFormatPanel } from './components';
import { useLensFormatTabs } from './hooks/useLensFormatTabs';
import { SITE_URL } from '@/shared/constants/site';
import { lensCategorySlug, lensPath } from '@ailens/domain';
import { categoryForDataLabel, displayCategoryLabel } from '@ailens/domain';
import { ArticleChapterNav } from './components/article/ArticleChapterNav';
import { IconStopwatch } from './components/icons/LensIcons';
import { ArticleReveal } from './components/article/ArticleReveal';
import { letterChapters } from './components/format/lensChapters';
import { readMinutes } from './components/format/lensSamples';
import { renderInline } from './components/format/renderInline';
import { ArticleStickyBar } from './components/article/ArticleStickyBar';
import { ArticleToTop } from './components/article/ArticleToTop';
import { ArticleToolRail } from './components/article/ArticleToolRail';
import { CompareCardButton } from './components/article/CompareCardButton';
import { ArticleNeighborLinks, ArticleNeighborNav, type ArticleNeighbor } from './components/article/ArticleNeighborNav';
import { LENS_VIEW_CSS } from './lensViewStyles';
import {
  ArticleFooterStyles,
  ArticleTags,
  MoreInCategory,
  MostRead,
  RelatedArticles,
} from './components/article/ArticleFooterSections';

// "오늘의 이슈, 4가지 시선" 상세.
// 박스 대신 타이포 위계(헤드라인 40 > 질문 32 > 역할명 24 > 리드 18 > 본문 16 > 메타 13)와 헤어라인으로 구조를 만든다.
// 색은 서수·액센트 바·불릿 같은 작은 표식에만 쓰고, 구획은 그림자 카드 대신 헤어라인으로 나눈다.
//
// SEO: 비활성 시선도 DOM에는 항상 렌더하고 hidden으로만 감춘다.
// 조건부 렌더로 빼면 page.tsx의 NewsArticle articleBody / mainEntity(Question+acceptedAnswer 4쌍)와 실제 본문이 어긋난다.

// 대표 사진 그림자 — 가까운(윤곽)·중간·멀리 퍼지는 그림자 3겹으로 사진이 종이 위에 놓인 듯 보이게 한다. 반경은 크고 색은 옅게 쓴다.
const PHOTO_SHADOW =
  '0 1px 2px rgba(17,24,39,0.06), 0 6px 16px -4px rgba(17,24,39,0.12), 0 22px 44px -14px rgba(17,24,39,0.18)';

export function LensViewClient({
  slug,
  initialLens = undefined,
  otherLens = [],
  relatedLens = [],
  neighbors,
  initialHotLetters,
}: {
  slug: string;
  initialLens?: CmsLens | null;
  otherLens?: CmsLens[];
  relatedLens?: CmsLens[];
  neighbors?: { prev: ArticleNeighbor | null; next: ArticleNeighbor | null };
  initialHotLetters?: TodayLetterCardLike[];
}) {
  const { lens, active, count, dir, showDesc, mediaDur, noteDur, tabRefs, select, onTabKeyDown } = useLensFormatTabs(slug, initialLens);

  if (!slug || lens === null) {
    return (
      <ArticlePageShell>
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center" style={{ color: '#6b7280' }}>
          <p>이슈를 찾을 수 없어요.</p>
          <Link href="/lens" className="mt-4 inline-block text-sm underline underline-offset-4" style={{ color: '#6b7280' }}>
            시선 목록으로
          </Link>
        </div>
      </ArticlePageShell>
    );
  }

  if (!lens) {
    return <ArticlePageShell>{null}</ArticlePageShell>;
  }

  const photo = pickLensPhoto(lens);
  const lenses = lens.lenses ?? [];
  // 레일 "듣기" — 팟캐스트 시선 탭으로 이동(없으면 항목 숨김).
  // 원문 링크 — 사진이 있으면 캡션 줄 오른쪽, 없으면 단독 줄.
  const sourceLink = lens.source_url ? (
    <a
      href={lens.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="lnk"
      style={{ minHeight: 28, fontSize: 13 }}
      onClick={() => trackEvent('source_link_click', { article_id: lens.id, format: lensFormatAt(active), ...(lens.category ? { category: lens.category } : {}) })}
    >
      기사 원문 보기
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </svg>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        (새 창으로 열립니다)
      </span>
    </a>
  ) : null;
  // 레터 본문의 소제목 → 오른쪽 구간 목차(레터 탭일 때만 보임).
  // 레터 예상 읽기 시간(분) — 형식 탭의 "약 N분"과 같은 계산(readMinutes, 분당 500자).
  const letterParas = lenses.find((l) => l.label === '레터')?.paragraphs;
  const readMin = letterParas && letterParas.length > 0 ? readMinutes(letterParas.join('').length) : null;
  const chapters = letterChapters(lenses.find((l) => l.label === '레터')?.paragraphs);
  const podcastIdx = lenses.findIndex((l) => l.label === '팟캐스트');
  // 지금 고른 형식 — 형식 설명 토스트(#lens-desc)가 쓴다.
  const activeP = lensPerspectiveAt(active);
  const ActiveIcon = activeP.icon;

  // Header·검색 오버레이·그리드·사이드바 배선은 ArticlePageShell에서 공통 처리한다.
  return (
    <ArticlePageShell>
      {/* <style> 내부 주석은 CSS 문자열이라 SSR 응답에 그대로 실리므로 한 줄 힌트만 둔다. 설계 근거는 이 파일과 components/의 JSX 주석에 있다. */}
      <style>{LENS_VIEW_CSS}</style>

      <main id="main-content" className="art-main">
        <ArticleToTop />
        <ArticleStickyBar
          category={lens.category ? displayCategoryLabel(lens.category) : null}
          categoryHref={categoryForDataLabel(lens.category) ? `/${lensCategorySlug(lens.category)}` : null}
          title={lens.headline}
          readMin={readMin}
        />
        {neighbors && <ArticleNeighborNav articleId={lens.id} prev={neighbors.prev} next={neighbors.next} />}
        <ArticleReveal />
        {/* 왼쪽 도구 레일(≥1100px) — 듣기·글자 크기·공유·인쇄. */}
        {/* 웹툰 탭에서는 도구 레일을 숨겨 이미지에만 집중하게 한다. */}
        <div className="rail-host" hidden={lensFormatAt(active) === 'webtoon'}>
          <nav className="rail" aria-label="기사 도구">
            <ArticleToolRail
              title={seoHeadline(lens.headline)}
              url={`${SITE_URL}${lensPath(lens)}`}
              cssVar="--lens-font-scale"
              storageKey="lens-font-size"
              onListen={podcastIdx >= 0 ? () => select(podcastIdx) : undefined}
            />
          </nav>
        </div>

        <ArticleChapterNav
          chapters={chapters}
          show={lensFormatAt(active) === 'letter'}
          accent={READING_ACCENT}
        />

        {/* ── 기사 머리 ── 카테고리 아이브로우 → 세리프 헤드라인 → 부제 → 바이라인/발행시각 → 헤어라인 */}
        <div className="lw" style={{ paddingTop: 'clamp(8px, 2vw, 16px)' }}>
          <p className="eyebrow">
            {categoryForDataLabel(lens.category) ? <Link href={`/${lensCategorySlug(lens.category)}`}>{displayCategoryLabel(lens.category)}</Link> : lens.category}
            {lens.subcategory && <> · {lens.subcategory}</>}
            <span className="badge">4가지 시선</span>
          </p>
          <h1
            id="art-h1"
            data-speakable="headline"
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(28px, 4vw, 40px)',
              fontWeight: 700,
              color: '#111827',
              letterSpacing: '-0.025em',
              lineHeight: 1.35,
              marginBottom: 14,
              textWrap: 'balance',
              wordBreak: 'keep-all',
            }}
          >
            {displayHeadline(lens.headline)}
          </h1>
          {lens.context && (
            <p
              data-speakable="summary"
              style={{ fontSize: 'calc(18px * var(--lens-font-scale, 1))', lineHeight: 1.65, color: '#374151', margin: '0 0 18px', whiteSpace: 'pre-line', wordBreak: 'keep-all' }}
            >
              {lens.context}
            </p>
          )}
          <div className="flex items-center justify-between flex-wrap" style={{ gap: 10, paddingBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
              <strong style={{ color: '#111827', fontWeight: 700 }}>AI LENS 편집팀</strong>
              <span aria-hidden> · </span>
              입력 <time dateTime={lens.published_at ?? lens.date}>{kstDateTimeLabel(lens.published_at) ?? lens.date.replaceAll('-', '.')}</time>
              {readMin && (
                <>
                  <span aria-hidden> · </span>약 {readMin}분 읽기
                </>
              )}
            </p>
            <a
              href={`https://www.google.com/preferences/source?q=${new URL(SITE_URL).host}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pill"
            >
              <GoogleIcon className="w-3.5 h-3.5" />
              구글 검색 선호 출처로 추가
            </a>
          </div>

          <div className="rule" />

          {/* 좁은 화면(<1100px) 도구 줄 — 넓은 화면에서는 왼쪽 레일로 대체. */}
          <div
            className="tools-inline flex items-center justify-between flex-wrap"
            style={{ marginTop: 14, gap: 12, paddingBottom: 14 }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>공유하기</span>
              <ArticleShareButtons title={seoHeadline(lens.headline)} url={`${SITE_URL}${lensPath(lens)}`} />
            </div>
            <div className="flex items-center border border-gray-200 rounded" style={{ padding: 2 }}>
              <ArticleFontSizeControl cssVar="--lens-font-scale" storageKey="lens-font-size" />
              <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} aria-hidden />
              <ArticlePrintButton />
            </div>
          </div>
        </div>

        {photo && (
          <div className="lw" style={{ paddingTop: 20 }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: '#f6f7f9', lineHeight: 0, borderRadius: 16, boxShadow: PHOTO_SHADOW }}>
              <Image
                src={photo}
                alt={seoHeadline(lens.headline)}
                fill
                sizes="(min-width: 760px) 720px, 100vw"
                priority
                style={{ objectFit: 'cover', objectPosition: 'center' }}
              />
            </div>
            <div className="flex items-center justify-between" style={{ gap: 12, marginTop: 8 }}>
              <p style={{ fontSize: 11.5, color: '#9ca3af', margin: 0 }}>
                {lens.source_url ? (
                  <>
                    사진 ·{' '}
                    <a href={lens.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      서울경제
                    </a>
                  </>
                ) : (
                  '사진 · 서울경제'
                )}
              </p>
              {sourceLink}
            </div>
          </div>
        )}

        {/* ── 리드 + 원문 링크 + 30초 핵심 ──
            "30초 핵심" 카드는 count > 0 게이트 밖(리드와 같은 .lw 블록)에 둔다. 원문 링크가 게이트 안에 있으면 lenses가 빈 글에서 원문 링크가 사라진다.
            카드 자체는 coreSummaryBullets()가 lenses를 읽으므로 lenses가 비면 그려지지 않는다. */}
        <div className="lw" style={{ paddingTop: 'clamp(20px, 3.4vw, 28px)' }}>
        <div>
          {!photo && sourceLink && <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{sourceLink}</div>}

          {coreSummaryBullets(lens).length > 0 && (
            <div data-speakable="summary" className="sum" style={{ ['--sum-accent' as string]: READING_ACCENT }}>
              <div className="sum-head">
                <IconStopwatch size={22} className="sum-ico" />
                <p className="sum-title">30초 핵심</p>
              </div>
              <p className="sum-sub">바쁘시면 여기까지만 읽어도 돼요</p>
              <ol className="sum-list">
                {coreSummaryBullets(lens).map((t, si) => (
                  <li key={si} className="sum-item">
                    <span className="sum-n" aria-hidden>
                      {si + 1}
                    </span>
                    <span className="sum-t">{renderInline(t, [], { numbers: true })}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        </div>

        {count > 0 && (
          <div className="lw" style={{ paddingTop: 32 }}>
          <div>
            <div className="rule" />

            {/* ── 형식 선택 ── sticky 세그먼트 탭 + 실측 분량(FormatPicker.tsx 참조).
                형식 차이 모달(LensFormatGuide)은 탭과 설명줄이 같은 정보를 주므로 이 페이지에서는 쓰지 않는다(홈 티저 LensPreviewSection에서는 사용). */}
            <div style={{ margin: '36px 0 6px' }}>
              <h2 className="ovl" style={{ margin: 0 }}>
                어떻게 볼까요?
              </h2>
              <p className="fmt-sub">취향대로 골라보세요 — 같은 기사를 네 가지 방식으로 만나요</p>
            </div>

            <FormatPicker lens={lens} lenses={lenses} active={active} mediaDur={mediaDur} select={select} onTabKeyDown={onTabKeyDown} tabRefs={tabRefs} />

            {/* 형식 설명 — 탭을 누르면 나타나 다음 탭을 고르기 전까지 유지한다. 자동 소멸시키면 본문이 당겨져 화면이 흔들린다. */}
            {showDesc && (
              <p key={active} id="lens-desc" role="status" className="fmt-toast" style={{ '--c': activeP.color } as CSSProperties}>
                <ActiveIcon size={16} aria-hidden style={{ flexShrink: 0, marginTop: 2, color: activeP.color }} />
                <span>{activeP.content}</span>
              </p>
            )}

            {/* ── 선택된 시선 ── 박스 없이 위계로만 구성 */}
            {lenses.map((l, i) => (
              <LensFormatPanel
                key={i}
                lens={lens}
                l={l}
                i={i}
                active={active}
                photo={photo}
                dir={dir}
                noteDur={noteDur}
              />
            ))}

            {/* 구획 마감 — 네 시선이 같은 기사에서 나왔음을 출처 한 줄로 닫는다. */}
            <div style={{ marginTop: 32 }}>
              <div className="rule" />
              <p style={{ marginTop: 32, fontSize: 14, color: '#4b5563', lineHeight: 1.65, wordBreak: 'keep-all' }}>
                네 형식 모두 같은 기사를 바탕으로 만들었어요. 위에서 형식을 바꿔도 다루는 사실은 같습니다.
              </p>
              {/* 비교 카드(모듈 F) — 네 형식의 첫 마디를 한 장에 모아 저장·공유. */}
              <CompareCardButton articleId={lens.id} title={seoHeadline(lens.headline)} date={lens.date} />
            </div>

            {/* AI 생성 콘텐츠 고지 */}
            <AiDisclaimer sourceUrl={lens.source_url} articleId={lens.id} format={lensFormatAt(active)} />
          </div>
          </div>
        )}

        {/* ── 하단 구획 ── 태그 → {카테고리} 더 보기 → 관련 기사 → 많이 읽은 기사. */}
        <div className="lw" style={{ paddingTop: 8, paddingBottom: 100 }}>
          <ArticleFooterStyles />
          {neighbors && <ArticleNeighborLinks articleId={lens.id} prev={neighbors.prev} next={neighbors.next} />}
          <ArticleTags lens={lens} />
          <MoreInCategory lens={lens} items={otherLens} />
          <RelatedArticles items={relatedLens} />
          <MostRead items={initialHotLetters ?? []} />

          <div style={{ marginTop: 56, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 4px', lineHeight: 1.5 }}>
              일상 속의 모든 소식, 신속하고 정확한 전달
            </p>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>통찰력 있는 이야기 · 인스타그램 @lens.sedaily</p>
          </div>
        </div>
      </main>
    </ArticlePageShell>
  );
}
