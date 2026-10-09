'use client';

// 콘텐츠 타입별 전용 페이지(레터/칼럼/영상/카테고리/전체) 공통 리스트 렌더러. 날짜 그룹 + 넉넉한 여백 + 헤드라인 줄바꿈 허용 + 썸네일 우측 배치.
import Link from 'next/link';
import Image from 'next/image';
import type { ArchiveItem } from '@/shared/lib/content/archiveItems';
import { kstDateTimeLabel } from '@/shared/lib/date/date';

// 발행 시각(시:분)만 보여 카테고리 태그를 대체한다. 이 컴포넌트는 카테고리 아카이브 페이지에서만 쓰이고 페이지가 이미 그 카테고리로 필터링돼 있어,
// 항목마다 같은 카테고리명을 붙이는 것은 반복이다. 날짜 그룹 헤더에 없는 정보(시:분)로 같은 날짜 안의 항목을 구분한다.
function timeLabel(isoUtc: string | null | undefined): string | null {
  if (!isoUtc) return null;
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

function dateHeaderLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  return `${y}년 ${m}월 ${d}일`;
}

// 원본 정렬(날짜 내림차순)을 그대로 유지하면서 같은 날짜끼리만 묶는다 —
// 이미 date desc로 정렬돼 들어오므로 같은 날짜는 항상 연속이라 안전하다.
function groupByDate(items: ArchiveItem[]): { date: string; items: ArchiveItem[] }[] {
  const groups: { date: string; items: ArchiveItem[] }[] = [];
  for (const item of items) {
    const key = item.date || '';
    const last = groups[groups.length - 1];
    if (last && last.date === key) {
      last.items.push(item);
    } else {
      groups.push({ date: key, items: [item] });
    }
  }
  return groups;
}

function ArchiveRow({ item, showCategory }: { item: ArchiveItem; showCategory?: boolean }) {
  const content = (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          data-ar-title
          className="font-semibold text-gray-900"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(17px, 3vw, 21px)',
            fontWeight: 700,
            textWrap: 'pretty',
            lineHeight: 1.38,
            letterSpacing: '-0.015em',
            transition: 'color .18s ease',
          }}
        >
          {item.title}
        </p>
        {item.excerpt && (
          <p
            style={{
              fontSize: 14.5,
              color: '#6b7280',
              lineHeight: 1.6,
              marginTop: 8,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.excerpt}
          </p>
        )}
        {(timeLabel(item.publishedAt) || (showCategory && item.category)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            {showCategory && item.category && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', padding: '2px 8px', borderRadius: 999, background: '#f1f2f4' }}>
                {item.subcategory ? `${item.category} · ${item.subcategory}` : item.category}
              </span>
            )}
            {(kstDateTimeLabel(item.publishedAt) ?? timeLabel(item.publishedAt)) && <span style={{ fontSize: 12, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{kstDateTimeLabel(item.publishedAt) ?? timeLabel(item.publishedAt)}</span>}
          </div>
        )}
      </div>
      {item.avatarUrl ? (
        <span
          style={{
            width: 'clamp(96px, 24vw, 184px)',
            aspectRatio: '3 / 2',
            borderRadius: 6,
            flexShrink: 0,
            overflow: 'hidden',
            background: '#f3f4f6',
          }}
        >
          <Image
            src={item.avatarUrl}
            alt={item.title}
            width={368}
            height={245}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </span>
      ) : null /* 사진이 없는 글은 자리를 비우고 글이 폭을 다 쓴다 */}
    </div>
  );

  const rowStyle = { padding: '20px 14px', margin: '0 -14px', textDecoration: 'none' } as const;

  if (item.href && item.external) {
    return (
      <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className="ar-link" style={rowStyle}>
        {content}
      </a>
    );
  }
  if (item.href) {
    return (
      <Link key={item.key} href={item.href} className="ar-link" style={rowStyle}>
        {content}
      </Link>
    );
  }
  return (
    <div key={item.key} style={rowStyle}>
      {content}
    </div>
  );
}

/** firstRowAction: 첫 날짜 라벨과 같은 줄 오른쪽에 놓는 도구(예: 날짜별 보기 버튼). 영문판처럼 "SEP 28, 2026 ··· Browse by date" 한 줄 구성이다. */
export function ArchiveList({ items, emptyLabel, firstRowAction, skipFirstDate, showCategory }: { items: ArchiveItem[]; emptyLabel?: string; firstRowAction?: React.ReactNode; /** 여러 분류가 섞인 목록(/lens 등)에서 각 글의 분류 라벨을 보여 준다. 분류 페이지에선 모두 같아 생략. */ showCategory?: boolean; /** 이 날짜면 첫 그룹의 날짜 줄을 그리지 않는다 — 호출부가 같은 날짜를 목록 위에 따로 보여 줄 때(중복 방지). */ skipFirstDate?: string }) {
  if (items.length === 0) {
    return (
      <>
        {firstRowAction && <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{firstRowAction}</div>}
        <p style={{ fontSize: 14, color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>
          {emptyLabel ?? '아직 콘텐츠가 없어요.'}
        </p>
      </>
    );
  }

  const groups = groupByDate(items);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 줄이 아래서 살짝 올라오며 차례로 나타나고, 올리면 부드러운 배경이 깔리며 사진이 살짝 커지고, 누르는 순간 눌린 듯 작아진다. */}
      <style>{`
        .ar-link { display: block; border-radius: 16px; transition: background .18s ease, transform .18s cubic-bezier(.22,.8,.22,1); }
        .ar-link:hover { background: #f6f8fc; }
        .ar-link:active { transform: scale(.985); background: #eff3fb; }
        .ar-link img { transition: transform .35s cubic-bezier(.22,.8,.22,1); }
        .ar-link:hover img { transform: scale(1.05); }
        .ar-link:hover [data-ar-title] { color: #3d70de; }
        [data-ar-item] { animation: ar-up .45s cubic-bezier(.22,.8,.22,1) both; animation-delay: calc(min(var(--i, 0), 9) * 45ms); }
        @keyframes ar-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { [data-ar-item] { animation: none; } .ar-link, .ar-link img { transition: none; } .ar-link:active { transform: none; } }
      `}</style>
      {groups.map((group, gi) => (
        <div key={group.date || `no-date-${gi}`} style={{ marginTop: gi === 0 ? 0 : 44 }}>
          {!(gi === 0 && skipFirstDate && group.date === skipFirstDate) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              minHeight: gi === 0 && firstRowAction ? 36 : undefined,
              paddingBottom: 6,
            }}
          >
            {/* 날짜는 작고 조용한 라벨로 둔다(영문판 "SEP 28, 2026" 톤). 항목 사이 가는 선만 남긴다. */}
            <span style={{ fontSize: 'clamp(15px, 2.2vw, 16.5px)', fontWeight: 700, letterSpacing: '-0.01em', color: '#374151' }}>
              {group.date ? dateHeaderLabel(group.date) : '날짜 미상'}
            </span>
            {gi === 0 && firstRowAction}
          </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {group.items.map((item, i) => (
              <div key={item.key} data-ar-item style={{ borderTop: i === 0 ? 'none' : '1px solid #f4f4f3', ['--i' as string]: gi * 3 + i }}>
                <ArchiveRow item={item} showCategory={showCategory} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
