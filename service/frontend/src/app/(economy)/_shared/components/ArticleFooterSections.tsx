import Image from 'next/image';
import { displayHeadline } from '@/shared/lib/displayHeadline';
import Link from 'next/link';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { kstDateTimeLabel } from '@/shared/lib/date';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { lensCategorySlug, lensPath } from '@/shared/lib/lensUrl';

// 기사 하단 구획(2026-10-01) — 영문 사이트(en.sedaily.com) 상세의 "More in 카테고리 /
// Related articles / Most read" 구조를 따른다. 오른쪽 사이드바를 걷어낸 대신 여기서
// 같은 역할(더 읽을거리)을 본문 폭 안에서 한다. 서버 컴포넌트라 JS 없이 초기 HTML에
// 링크가 들어가 크롤러·내부 링크 구조에도 도움이 된다.
//
// 스타일 원칙: 박스·그림자 없이 헤어라인과 타이포 위계만. 제목은 세리프(.af-serif),
// 구역 이름표는 작은 자간 라벨(.af-label).

const SERIF = '"Noto Serif KR", serif';

function dateShort(l: CmsLens): string {
  return kstDateTimeLabel(l.published_at) ?? l.date.replaceAll('-', '.');
}

export function ArticleFooterStyles() {
  return (
    <style>{`
      .af-label { font-size: 12px; font-weight: 800; letter-spacing: 0.08em; color: #6b7280; margin: 0 0 14px; }
      .af-serif { font-family: ${SERIF}; font-weight: 700; color: #111827; letter-spacing: -0.015em;
        word-break: keep-all; text-wrap: balance; }
      .af-meta { font-size: 12.5px; color: #9ca3af; margin-top: 6px; }
      /* 스케치 톤 — 직선 테두리 대신 손으로 그은 획(2026-10-01). */
      .af-sec { background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='0.32' stroke-width='1.7' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") top / 100% 8px no-repeat; padding-top: 26px; margin-top: 56px; }
      .af-sec + .af-sec { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='0.14' stroke-width='1.4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E"); margin-top: 40px; }
      .af-link:hover .af-serif { text-decoration: underline; text-underline-offset: 3px; }
      .af-more-lead { display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: 20px; align-items: start;
        text-decoration: none; padding-bottom: 20px; }
      .af-more-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; }
      .af-more-grid a { display: block; text-decoration: none; padding: 18px 0 14px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='0.14' stroke-width='1.4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") top / 100% 8px no-repeat; }
      .af-all { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; margin-top: 8px;
        font-size: 14px; font-weight: 700; color: #111827; text-decoration: none; }
      .af-all:hover { text-decoration: underline; text-underline-offset: 3px; }
      .af-rel { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; }
      .af-rel a { display: block; text-decoration: none; padding: 18px 0 14px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='0.14' stroke-width='1.4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") top / 100% 8px no-repeat; }
      .af-most a { display: flex; align-items: baseline; gap: 16px; text-decoration: none; padding: 18px 0 14px;
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='0.14' stroke-width='1.4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") top / 100% 8px no-repeat; }
      .af-most-n { flex-shrink: 0; width: 18px; font-size: 15px; font-weight: 800; color: #1d4ed8;
        font-variant-numeric: tabular-nums; }
      .af-tags a { font-size: 14px; color: #1d4ed8; text-decoration: none; margin-right: 14px; }
      .af-tags a:hover { text-decoration: underline; text-underline-offset: 3px; }
      @media (max-width: 640px) {
        .af-more-lead { grid-template-columns: minmax(0, 1fr) 112px; gap: 14px; }
        .af-more-grid, .af-rel { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}

/** 카테고리·하위 카테고리 해시태그 — 각 카테고리 아카이브로 링크. */
export function ArticleTags({ lens }: { lens: CmsLens }) {
  const tags: { label: string; href: string }[] = [];
  if (lens.category) tags.push({ label: lens.category, href: `/${lensCategorySlug(lens.category)}` });
  if (lens.subcategory) tags.push({ label: lens.subcategory, href: `/${lensCategorySlug(lens.category)}` });
  if (tags.length === 0) return null;
  return (
    <nav aria-label="기사 태그" className="af-tags" style={{ marginTop: 28 }}>
      {tags.map((t) => (
        <Link key={t.label} href={t.href}>
          #{t.label}
        </Link>
      ))}
    </nav>
  );
}

/** "{카테고리} 더 보기" — 같은 카테고리 최신 글: 큰 1건 + 작은 2건. */
export function MoreInCategory({ lens, items }: { lens: CmsLens; items: CmsLens[] }) {
  if (items.length === 0 || !lens.category) return null;
  const [lead, ...rest] = items;
  const leadPhoto = pickLensPhoto(lead);
  return (
    <section className="af-sec" aria-labelledby="af-more">
      <h2 id="af-more" className="af-label">
        {lens.category} 더 보기
      </h2>
      <Link href={lensPath(lead)} className="af-more-lead af-link">
        <span>
          <span className="af-serif" style={{ display: 'block', fontSize: 'clamp(19px, 2.6vw, 24px)', lineHeight: 1.35 }}>
            {displayHeadline(lead.headline)}
          </span>
          <span className="af-meta" style={{ display: 'block' }}>
            {lead.subcategory ?? lead.category} · {dateShort(lead)}
          </span>
        </span>
        {leadPhoto && (
          <span style={{ position: 'relative', display: 'block', aspectRatio: '3 / 2', background: '#f3f4f6', overflow: 'hidden' }}>
            <Image src={leadPhoto} alt="" fill sizes="200px" style={{ objectFit: 'cover' }} />
          </span>
        )}
      </Link>
      {rest.length > 0 && (
        <div className="af-more-grid">
          {rest.map((l) => (
            <Link key={l.id} href={lensPath(l)} className="af-link">
              <span className="af-serif" style={{ display: 'block', fontSize: 16, lineHeight: 1.4 }}>
                {displayHeadline(l.headline)}
              </span>
              <span className="af-meta" style={{ display: 'block' }}>
                {l.subcategory ?? l.category} · {dateShort(l)}
              </span>
            </Link>
          ))}
        </div>
      )}
      <Link href={`/${lensCategorySlug(lens.category)}`} className="af-all">
        {lens.category} 전체 보기 <span aria-hidden>→</span>
      </Link>
    </section>
  );
}

/** "관련 기사" — 같은 하위 카테고리 글. */
export function RelatedArticles({ items }: { items: CmsLens[] }) {
  if (items.length === 0) return null;
  return (
    <section className="af-sec" aria-labelledby="af-rel">
      <h2 id="af-rel" className="af-label">
        관련 기사
      </h2>
      <div className="af-rel">
        {items.map((l) => (
          <Link key={l.id} href={lensPath(l)} className="af-link">
            <span className="af-serif" style={{ display: 'block', fontSize: 16, lineHeight: 1.4 }}>
              {displayHeadline(l.headline)}
            </span>
            <span className="af-meta" style={{ display: 'block' }}>
              {dateShort(l)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** "많이 읽은 기사" — 기존 사이드바 "요즘 많이 읽힌 글"을 본문 폭 안으로 옮김. */
export function MostRead({ items }: { items: TodayLetterCardLike[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="af-sec" aria-labelledby="af-most">
      <h2 id="af-most" className="af-label">
        많이 읽은 기사
      </h2>
      <ol className="af-most" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((c, i) => (
          <li key={c.letterId}>
            <Link href={c.href} className="af-link">
              <span className="af-most-n" aria-hidden>
                {i + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="af-serif" style={{ display: 'block', fontSize: 16, lineHeight: 1.4 }}>
                  {c.title}
                </span>
                <span className="af-meta" style={{ display: 'block' }}>
                  {c.dateLabel}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
