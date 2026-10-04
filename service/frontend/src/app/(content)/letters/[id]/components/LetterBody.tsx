import { Fragment } from 'react';
import { Calendar } from 'lucide-react';
import { InteractiveBlock } from '@/features/news-feed';
import { kstDateTimeLabel } from '@/shared/lib/date/date';
import { GoogleIcon } from '@/shared/ui/icons/SocialShareIcons';
import { ArticleShareButtons } from '@/shared/ui/article/ArticleShareButtons';
import { ArticleFontSizeControl } from '@/shared/ui/article/ArticleFontSizeControl';
import { ArticlePrintButton } from '@/shared/ui/article/ArticlePrintButton';
import type { DisplayLetter } from '@/shared/lib/api/todayLettersApi';
import { cleanSubtitle, letterCategoryLabel, splitBodyHtml, injectImageCaptions } from './letterHtmlUtils';
import { LetterChartBlock } from './LetterChartBlock';
import type { NeighborLetter } from './PrevNextLetterNav';
import { SentenceSelectionPopover } from '@/widgets/SentenceSelectionPopover';
import { LetterBlock } from './LetterBlock';
import { LetterTextExtras } from './LetterTextExtras';
import { LetterSubscribeSection } from './LetterSubscribeSection';
import { SITE_URL } from '@/shared/constants/site';

// production letter inline 렌더 — 한 페이지에서 헤더 → 본문 → 핵심 정리/닫는 줄/단어 → 구독 순으로 흐른다.
export function LetterBody({
  letter,
  nextLetter,
  prevLetter,
}: {
  letter: DisplayLetter;
  nextLetter?: NeighborLetter | null;
  prevLetter?: NeighborLetter | null;
}) {
  // 본문은 한 흐름으로 렌더한다.
  const body = letter.body;

  // 시각 v2 — 2026-05-23 이후 발행분에만 적용 (용어 툴팁 + 클로징 풀쿼트).
  // letter.id 'l-YYYYMMDD-XX' 에서 날짜 추출 → lexical 비교.
  const dateStr = letter.id.match(/l-(\d{8})/)?.[1] ?? '';
  const isModern = dateStr >= '20260523';
  // 헤더 메타줄 발행일 — ApiLetter엔 개별 date 필드가 없다(date는 배치 응답 ApiTodayLettersResponse에만 있음).
  // id의 'l-YYYYMMDD-XX' 패턴에서 뽑은 dateStr을 재사용하고, 이 패턴을 안 쓰는 CMS 글은 published_at(시:분까지) → publish_date(날짜만) 순으로 폴백한다.
  const displayDate = dateStr.length === 8
    ? `${dateStr.slice(0, 4)}.${dateStr.slice(4, 6)}.${dateStr.slice(6, 8)}`
    : kstDateTimeLabel(letter.published_at) ?? letter.publish_date?.replaceAll('-', '.') ?? null;
  // 본문에서 어떤 키워드 단어들을 underline + tooltip 으로 감쌀지.
  // explain 가 비어있으면 적용 안 함 (구버전 letter 자동 제외).
  const glossary = isModern
    ? letter.keywords.filter((k) => k.term.length >= 2 && k.explain.trim().length > 0)
    : [];

  return (
    <article
      id="letter-top"
      data-letter-body
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 0',
        scrollMarginTop: 80,
      }}
    >
      {/* 마우스로 문장을 긁으면 '서랍에 담기' 플로팅 버튼 등장 */}
      <SentenceSelectionPopover letter={letter} />

      <header style={{ marginBottom: 24 }}>
        {/* 역할 라벨(archetype)은 두지 않는다. 에디터 이름 배지 아래 바로 제목이 온다. */}
        <h1
          data-speakable="headline"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(24px, 4.5vw, 32px)',
            fontWeight: 600,
            color: '#111827',
            margin: '0 0 12px',
            lineHeight: 1.35,
            letterSpacing: '-0.02em',
          }}
        >
          {letter.headline}
        </h1>
        {letter.subtitle && (
          <p
            data-speakable="summary"
            style={{
              fontSize: 14,
              color: '#6b7280',
              margin: '0 0 16px',
              lineHeight: 1.55,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {cleanSubtitle(letter.subtitle)}
          </p>
        )}

        {/* 배지·발행일·구글 선호 출처 링크 + 공유·글자크기·인쇄 툴바 — lens 상세와 같은 구성·순서이다. 제목 바로 아래에 메타줄 → 공유 툴바가 이어지고 부제는 툴바 아래에 둔다. */}
        <div className="flex items-center flex-wrap" style={{ gap: 12, marginBottom: 16 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: 999,
              background: letter.accentBg,
              color: letter.accent,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.3,
            }}
          >
            {letterCategoryLabel(letter)}
          </span>
          {displayDate && (
            <p className="flex items-center" style={{ gap: 5, fontSize: 13, color: '#6b7280', fontWeight: 600, margin: 0 }}>
              <Calendar className="w-4 h-4" aria-hidden />
              입력 {displayDate}
            </p>
          )}
          <a
            href={`https://www.google.com/preferences/source?q=${new URL(SITE_URL).host}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
            style={{ gap: 5, fontSize: 11.5, color: '#9ca3af', textDecoration: 'none' }}
          >
            <GoogleIcon className="w-3 h-3" />
            구글 검색 선호 출처로 추가
          </a>
        </div>
        <div
          className="flex items-center justify-between flex-wrap"
          style={{ gap: 12, padding: '10px 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}
        >
          <div className="flex items-center" style={{ gap: 8 }}>
            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>공유하기</span>
            <ArticleShareButtons title={letter.headline} url={`${SITE_URL}/letters/${letter.id}`} />
          </div>
          <div className="flex items-center border border-gray-200 rounded" style={{ padding: 2 }}>
            <ArticleFontSizeControl cssVar="--letter-font-scale" storageKey="letter-font-size" />
            <div style={{ width: 1, alignSelf: 'stretch', background: '#e5e7eb' }} aria-hidden />
            <ArticlePrintButton />
          </div>
        </div>

      </header>

      {/* 본문 — 한 흐름. CMS 글(body_html 있음)은 Tiptap 리치텍스트를 그대로
          렌더 — admin 에서 굵게/글머리/이미지를 넣은 위치 그대로 나온다.
          AI 레터는 body_html 이 없어 기존 ■/[라벨]/Q.A./![]() 마커 파싱으로. */}
      <div style={{ marginBottom: 28 }}>
        {letter.body_html ? (
          <div style={{ fontSize: 'calc(16px * var(--letter-font-scale, 1))', color: '#374151' }}>
            {splitBodyHtml(letter.body_html).map((part, i) =>
              part.type === 'html' ? (
                <div
                  key={`h-${i}`}
                  className="prose prose-neutral max-w-none prose-headings:font-bold prose-img:rounded-2xl prose-p:leading-[1.9]"
                  dangerouslySetInnerHTML={{ __html: injectImageCaptions(part.content) }}
                />
              ) : (
                <InteractiveBlock key={`q-${i}`} data={part.data} />
              ),
            )}
          </div>
        ) : (
          body.map((p, i) => (
            <Fragment key={`b-${i}`}>
              <LetterBlock text={p} accent={letter.accent} accentBg={letter.accentBg} glossary={glossary} />
              {/* 차트는 도입부 문단 바로 다음에 한 번만 — 원문 배치(배경 설명 → 데이터
                  시각화 → 본격 분석)를 따라가되, 그림은 AI LENS 자체 스타일로 새로 그린다. */}
              {i === 0 && letter.chart && <LetterChartBlock chart={letter.chart} accent={letter.accent} />}
            </Fragment>
          ))
        )}
      </div>

      {/* 핵심 정리 / 닫는 줄 / 단어 */}
      <div id="letter-extras" style={{ scrollMarginTop: 80 }}>
        <LetterTextExtras letter={letter} modern={isModern} nextLetter={nextLetter} prevLetter={prevLetter} />
      </div>

      {/* 뉴스레터 구독 — 그 페르소나로 고정, 메일받기 인라인 */}
      <LetterSubscribeSection letter={letter} />
    </article>
  );
}
