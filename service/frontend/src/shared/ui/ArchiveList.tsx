'use client';

// 콘텐츠 타입별 전용 페이지(레터/칼럼/영상/카테고리 6개/전체) 공통 리스트
// 렌더러 — 2026-08-11, /letters 안에 있던 카드 렌더링을 여러 라우트가 같이
// 쓸 수 있게 분리.
//
// 2026-08-17 재설계 — "뉴닉 최신 아티클처럼 날짜별로 묶어서 보여주면
// 깔끔하겠다"는 피드백으로 촘촘한 테두리 카드(제목 한 줄 말줄임, 썸네일
// 왼쪽 56px)를 걷어내고 날짜 그룹 + 넉넉한 여백 + 헤드라인 줄바꿈 허용 +
// 썸네일 우측 배치로 바꿨다. 아이콘은 원래 features/news-feed/components/icons에
// 있어서 shared가 features를 부르는 역방향 의존이었다(단일 출처 유지를 위해
// 의도적으로 감수한 트레이드오프였음) — 2026-08 리팩토링에서 HandDrawnIcons
// 자체를 shared/ui/icons로 승격해 레이어링 위반과 복제 위험을 동시에 해소했다.
import Link from 'next/link';
import Image from 'next/image';
import { LetterMailIcon, StockBullIcon, LightbulbIcon } from '@/shared/ui/icons/HandDrawnIcons';
import type { ArchiveItem, Kind } from '@/shared/lib/archiveItems';

function VideoPlayIcon({ accent, className }: { accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={accent} strokeWidth="1.6" />
      <path d="M10 8.5l6 3.5-6 3.5v-7z" fill={accent} />
    </svg>
  );
}

// 날짜 헤더 대신 각 항목 메타 줄에 붙는 "발행 주체" 라벨 — 뉴닉의 바이라인
// (뉴닉/솔티라이프 등 채널명) 자리에 해당. 우리는 필진명 대신 콘텐츠
// 종류를 쓴다(개별 저자 정보가 없는 항목이 대부분이라).
const KIND_LABEL: Record<Kind, string> = {
  letter: '레터',
  issue_talk: '이슈 톡톡',
  column: '인사이트',
  video: '영상',
  trend: '딥다이브',
};

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

function ArchiveRow({ item }: { item: ArchiveItem }) {
  const Icon =
    item.kind === 'trend' ? StockBullIcon
    : item.kind === 'column' ? LightbulbIcon
    : item.kind === 'video' ? VideoPlayIcon
    : LetterMailIcon;

  const content = (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          className="font-semibold text-gray-900"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(16px, 3vw, 18px)',
            lineHeight: 1.4,
            letterSpacing: '-0.01em',
          }}
        >
          {item.title}
        </p>
        {item.excerpt && (
          <p
            style={{
              fontSize: 13.5,
              color: '#6b7280',
              lineHeight: 1.6,
              marginTop: 6,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.excerpt}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: item.accent }}>{KIND_LABEL[item.kind]}</span>
        </div>
      </div>
      {item.avatarUrl ? (
        <span
          style={{
            width: 132,
            aspectRatio: '3 / 2',
            borderRadius: 10,
            flexShrink: 0,
            overflow: 'hidden',
            background: '#f3f4f6',
          }}
        >
          <Image
            src={item.avatarUrl}
            alt=""
            width={132}
            height={88}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </span>
      ) : (
        <span
          className="hidden sm:flex"
          style={{
            width: 132,
            aspectRatio: '3 / 2',
            borderRadius: 10,
            flexShrink: 0,
            background: `${item.accent}14`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon accent={item.accent} className="w-8 h-8" />
        </span>
      )}
    </div>
  );

  const rowStyle = { padding: '18px 4px', textDecoration: 'none' } as const;

  if (item.href && item.external) {
    return (
      <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className="block transition-opacity hover:opacity-80" style={rowStyle}>
        {content}
      </a>
    );
  }
  if (item.href) {
    return (
      <Link key={item.key} href={item.href} className="block transition-opacity hover:opacity-80" style={rowStyle}>
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

export function ArchiveList({ items, emptyLabel }: { items: ArchiveItem[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 14, color: '#9ca3af', padding: '40px 0', textAlign: 'center' }}>
        {emptyLabel ?? '아직 콘텐츠가 없어요.'}
      </p>
    );
  }

  const groups = groupByDate(items);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {groups.map((group, gi) => (
        <div key={group.date || `no-date-${gi}`} style={{ marginTop: gi === 0 ? 0 : 36 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              borderBottom: '1px solid #ececec',
              paddingBottom: 10,
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
              {group.date ? dateHeaderLabel(group.date) : '날짜 미상'}
            </span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{group.items.length}개의 아티클</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {group.items.map((item, i) => (
              <div key={item.key} style={{ borderTop: i === 0 ? 'none' : '1px solid #f4f4f3' }}>
                <ArchiveRow item={item} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
