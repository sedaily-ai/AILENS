import type { Metadata } from 'next';
import { buildCompareCard } from '@/shared/lib/content/compareCard';
import { fetchLensBySlug, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { pickTopArticle } from '@/shared/lib/content/topArticle';
import { OnboardingClient, type OnboardingGlance } from './OnboardingClient';

export const metadata: Metadata = {
  title: '소개',
  description:
    '서울경제신문 기자가 취재한 기사를 AI가 읽기·웹툰·팟캐스트·영상으로 자동 재구성해 발행하고, 편집팀이 발행 후 점검해요.',
  alternates: { canonical: '/onboarding' },
};

// 비교 카드 공유 페이지(card/[id])와 같은 주기로 다시 만든다. 첫 화면에 들어가는 오늘 1면이 빈 칸으로 깜빡이지 않게 서버에서 채운다.
export const revalidate = 300;

// 형식별 첫 부분 글자 수 — 비교 카드 세로 이미지(CARD_TEXT_MAX.story)와 같은 값. 렌더러(next/og) 모듈을 이 페이지로 끌어오지 않으려고 값만 둔다.
const GLANCE_TEXT_MAX = 110;

async function loadGlance(): Promise<OnboardingGlance | null> {
  try {
    const top = pickTopArticle(await fetchLensPosts(100));
    if (!top) return null;
    const lens = await fetchLensBySlug(top.id);
    if (!lens) return null;
    const card = buildCompareCard(lens, GLANCE_TEXT_MAX);
    if (card.entries.length === 0) return null;
    return { card, articleHref: lensPath(lens) };
  } catch (e) {
    // 비교 카드가 없어도 소개 화면은 그대로 보여 준다(빈 상태 안내). 원인은 로그로 남긴다.
    console.error('[onboarding] 오늘 1면 비교 카드를 만들지 못했어요', e);
    return null;
  }
}

export default async function OnboardingAboutPage() {
  return <OnboardingClient glance={await loadGlance()} />;
}
