'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ArchiveItem } from '@/shared/lib/content/archiveItems';

// 카테고리 "전체" 첫 화면의 편집형 상단. 영문판(en.sedaily.com) 섹션 홈 구조를 옮겼다:
//   ① 헤드라인 영역: 왼쪽 큰 제목+요약, 가운데 큰 사진(최신 1건) / 오른쪽 보조 기사 3건(제목+작은 사진)
//   ② 카드 3건 줄: 사진 3장 가로 카드(제목+요약)
// 그 아래는 날짜별 목록(ArchiveList). 하위 탭을 고르거나 기간을 걸면 이 영역은 빠지고 목록만 보인다.
// 영문판의 흑백 에디토리얼 구조에 서비스 톤(세리프 굵은 제목, 호버 시 파랑 제목·사진 확대, 눌림)을 입혔다.
const CSS = `
  .cl-card { display: block; text-decoration: none; color: inherit; }
  .cl-card [data-cl-title] { transition: color .18s ease; }
  .cl-card:hover [data-cl-title] { color: #3d70de; }
  .cl-card [data-cl-img] { overflow: hidden; background: #f3f4f6; }
  .cl-card [data-cl-img] img { transition: transform .45s cubic-bezier(.22,.8,.22,1); }
  .cl-card:hover [data-cl-img] img { transform: scale(1.04); }
  .cl-card:active { transform: scale(.992); }
  .cl-card { transition: transform .15s cubic-bezier(.22,.8,.22,1); }
  .cl-lead { display: grid; gap: 32px; grid-template-columns: minmax(0, 1fr); padding: 28px 0 26px; border-bottom: 1px solid #e5e7eb; }
  .cl-lead-main { height: 100%; display: grid; gap: 14px 32px; grid-template-columns: minmax(0, 1fr); align-items: start; }
  .cl-side { display: flex; flex-direction: column; }
  .cl-side { justify-content: space-between; }
  .cl-side > a { padding: 18px 0; border-top: 1px solid #ececec; flex: 1; align-items: center; }
  .cl-side > a:first-child { padding-top: 0; border-top: none; }
  .cl-cards { display: grid; gap: 20px; grid-template-columns: minmax(0, 1fr); padding: 0 0 30px; border-bottom: 1px solid #e5e7eb; margin-bottom: 8px; }
  @media (min-width: 640px) { .cl-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @media (min-width: 768px) { .cl-lead-main { grid-template-columns: minmax(0, 4fr) minmax(0, 6fr); gap: 14px 40px; } }
  @media (max-width: 767px) { .cl-lead-main > [data-cl-img] { order: -1; } }
  @media (prefers-reduced-motion: reduce) { .cl-card, .cl-card [data-cl-img] img { transition: none; } .cl-card:active { transform: none; } }
`;

function Thumb({ item, width, height, sizes, ratio = '3 / 2' }: { item: ArchiveItem; width: number; height: number; sizes: string; ratio?: string }) {
  return (
    <span data-cl-img style={{ display: 'block', borderRadius: 6, aspectRatio: ratio, width: '100%' }}>
      {item.avatarUrl && <Image src={item.avatarUrl} alt="" width={width} height={height} sizes={sizes} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </span>
  );
}

function TimeText({ item, showCategory }: { item: ArchiveItem; showCategory?: boolean }) {
  const t = item.publishedAt ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(item.publishedAt)) : '';
  return (
    <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
      {showCategory && item.category && <b style={{ marginRight: 8, fontWeight: 700, color: '#374151' }}>{item.category}</b>}
      {item.date.replaceAll('-', '.')}
      {t && ` ${t}`}
    </p>
  );
}

const SERIF = '"Noto Serif KR", serif';

/** ① 히어로: 가장 중요한 1건을 전체 폭으로 둔다. 보조 기사 3건은 바로 아래 카드 줄로 내려 위계를 "1 > 3 > 목록" 한 방향으로 정리한다. 모바일에서는 사진이 위, 글이 아래다. */
export function CategoryLead({ lead, showCategory }: { lead: ArchiveItem; showCategory?: boolean }) {
  return (
    <section className="cl-lead" aria-label="주요 기사" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <style>{CSS}</style>
      <Link href={lead.href ?? '#'} className="cl-card cl-lead-main" style={{ alignItems: 'center' }}>
        <div>
          <h2 data-cl-title style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(26px, 3.6vw, 40px)', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em', color: '#111827', wordBreak: 'keep-all', textWrap: 'balance' }}>
            {lead.title}
          </h2>
          {lead.excerpt && (
            <p style={{ margin: '16px 0 0', fontSize: 17, lineHeight: 1.7, color: '#4b5563', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all' }}>{lead.excerpt}</p>
          )}
          <TimeText item={lead} showCategory={showCategory} />
        </div>
        <Thumb item={lead} width={1000} height={667} sizes="(min-width: 1024px) 700px, 100vw" />
      </Link>
    </section>
  );
}

/** ② 카드 3건 줄 */
export function CategoryCards({ items, showCategory }: { items: ArchiveItem[]; showCategory?: boolean }) {
  return (
    <section className="cl-cards" aria-label="이어서 읽을 기사">
      <style>{CSS}</style>
      {items.map((it) => (
        <Link key={it.key} href={it.href ?? '#'} className="cl-card">
          <Thumb item={it} width={600} height={400} sizes="(min-width: 640px) 33vw, 100vw" />
          <h3 data-cl-title style={{ margin: '12px 0 0', fontFamily: SERIF, fontSize: 17, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#111827', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all', textWrap: 'pretty' }}>
            {it.title}
          </h3>
          {it.excerpt && <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.55, color: '#6b7280', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.excerpt}</p>}
          {showCategory && it.category && <p style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: '#374151' }}>{it.category}</p>}
        </Link>
      ))}
    </section>
  );
}
