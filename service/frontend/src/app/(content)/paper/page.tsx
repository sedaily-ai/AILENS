import { notFound, redirect } from 'next/navigation';
import { fetchPaperDates } from '@/shared/lib/api/cmsPostsApi';
import { paperPath } from './paperShared';

// /paper — 가장 최근에 지면이 편성된 날로 보낸다. 최신 날짜가 매일 바뀌므로 영구(308)가 아니라 임시 이동이다.
export const revalidate = 300;

export default async function PaperIndexPage() {
  const dates = await fetchPaperDates();
  if (dates.length === 0) notFound();
  redirect(paperPath(dates[0]));
}
