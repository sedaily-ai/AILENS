'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { kstTodayStr } from '@/shared/lib/date/date';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { LENS_CARD_BORDER, LENS_CARD_SHADOW, READING_ACCENT, lensFormatAt, lensPerspectiveAt, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { FORMAT_CTA, MBTI_GROUP_INFO, issueHref, issuesDateLabel, pickTodayIssues, sectionLabel, type TodayIssuesPick } from '../lib/mbtiCorner';

type State = { status: 'loading' } | { status: 'ready'; pick: TodayIssuesPick<CmsLens> };

// 홈 '오늘의 이슈'와 같은 데이터(fetchLensPosts, 실패하면 재시도 후 빈 배열)에서 4건을 고른다(설계 2-④).
// 0건과 실패는 같은 안내로 처리한다 — 로딩 문구에 멈추지 않게.
export function TodayIssues({ group }: { group: MbtiGroupId }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const { formatIndex } = MBTI_GROUP_INFO[group];
  const p = lensPerspectiveAt(formatIndex);

  useEffect(() => {
    let alive = true;
    fetchLensPosts(100)
      .catch(() => [] as CmsLens[])
      .then((posts) => {
        if (alive) setState({ status: 'ready', pick: pickTodayIssues(posts, kstTodayStr()) });
      });
    return () => {
      alive = false;
    };
  }, []);

  const empty = state.status === 'ready' && state.pick.issues.length === 0;

  return (
    <section aria-labelledby="mbti-issues-title" style={{ marginTop: 36 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <h2 id="mbti-issues-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
          오늘의 이슈
        </h2>
        {state.status === 'ready' && !empty && (
          <span style={{ fontSize: 12.5, color: '#94a3b8' }}>{issuesDateLabel(state.pick)}</span>
        )}
      </div>

      {state.status === 'loading' && (
        <p role="status" style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>
          오늘의 이슈를 불러오는 중이에요…
        </p>
      )}

      {empty && (
        <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
          지금은 이슈를 불러오지 못했어요.{' '}
          <Link href="/lens" style={{ color: READING_ACCENT, fontWeight: 700 }}>
            전체 이슈 보기 →
          </Link>
        </p>
      )}

      {state.status === 'ready' && !empty && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {state.pick.issues.map((post) => {
            const photo = pickLensPhoto(post);
            return (
              <li key={post.id}>
                <Link
                  href={issueHref(lensPath(post), group)}
                  prefetch={false}
                  onClick={() => trackEvent('mbti_issue_click', { group, article_id: post.id, format: lensFormatAt(formatIndex) })}
                  style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 12, borderRadius: 16, border: LENS_CARD_BORDER, boxShadow: LENS_CARD_SHADOW, background: '#ffffff', textDecoration: 'none', color: 'inherit' }}
                >
                  {photo && (
                    <span style={{ position: 'relative', flex: '0 0 auto', width: 96, height: 72, borderRadius: 10, overflow: 'hidden', background: '#f1f5f9' }}>
                      <Image src={photo} alt="" fill sizes="96px" style={{ objectFit: 'cover' }} />
                    </span>
                  )}
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>{sectionLabel(post.paper_section)}</span>
                    <span style={{ display: 'block', margin: '4px 0 6px', fontSize: 15, fontWeight: 700, lineHeight: 1.45, color: '#0f172a' }}>
                      {displayHeadline(post.headline)}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: p.color }}>
                      {FORMAT_CTA[formatIndex]} · {p.duration}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
