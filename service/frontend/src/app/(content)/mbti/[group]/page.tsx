import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaticPageShell } from '@/widgets/StaticPageShell';
import { MbtiResult, MBTI_GROUP_INFO, MBTI_GROUP_ORDER, groupSlug, parseGroupSlug } from '@/features/mbti';
import { lensPerspectiveAt } from '@/shared/constants/lensPerspectives';
import { SITE_URL } from '@/shared/constants/site';

const CORNER = 'MBTI로 보는 오늘의 뉴스';

// 4개 그룹만 정적으로 만든다. 그 밖의 주소(/mbti/xx, 대문자 /mbti/NT 포함)는 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return MBTI_GROUP_ORDER.map((g) => ({ group: groupSlug(g) }));
}

export async function generateMetadata({ params }: { params: Promise<{ group: string }> }): Promise<Metadata> {
  const { group: slug } = await params;
  const group = parseGroupSlug(slug);
  if (!group) return {};
  const info = MBTI_GROUP_INFO[group];
  const title = `${group}형 — ${info.title} · ${CORNER}`;
  const description = `${info.summary}. MBTI 인지유형 ${group}형에게 맞는 ${lensPerspectiveAt(info.formatIndex).short} 형식으로 오늘의 이슈를 골라 드려요.`;
  return { title, description, alternates: { canonical: `${SITE_URL}/mbti/${groupSlug(group)}` } };
}

export default async function MbtiGroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group: slug } = await params;
  const group = parseGroupSlug(slug);
  if (!group) notFound();
  return (
    <StaticPageShell title={CORNER}>
      <MbtiResult group={group} />
    </StaticPageShell>
  );
}
