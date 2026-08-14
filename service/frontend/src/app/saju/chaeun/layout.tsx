import type { Metadata } from 'next';
import {
  JsonLd,
  breadcrumbSchema,
  webPageSchema,
  faqSchema,
} from '@saju/shared/lib/jsonLd';

export const metadata: Metadata = {
  metadataBase: new URL('https://saju.sedaily.ai'),
  title: {
    absolute: '재운 흐름 보기 — 사주 기반 재물운·대운 타임라인 (무료)',
  },
  description:
    '내 사주의 재성·식상·관성을 분석해 올해·이번 달·오늘의 재물 흐름과 대운 타임라인을 시각화해 드립니다. 고전 명리학 기반 무료 재운 해석.',
  keywords: [
    '재운', '재물운', '재성', '식상', '관성', '대운',
    '사주 재운', '올해 재운', '무료 재운', '돈 들어오는 해', '세운 재운',
  ],
  alternates: {
    canonical: 'https://saju.sedaily.ai/chaeun/',
    languages: {
      'ko-KR': 'https://saju.sedaily.ai/chaeun/',
      'en': 'https://saju.sedaily.ai/chaeun/',
    },
  },
  openGraph: {
    title: '재운 흐름 보기 — 사주 기반 재물운 분석',
    description: '내 사주 기준 올해·이번 달·오늘의 재물 흐름을 한눈에.',
    url: 'https://saju.sedaily.ai/chaeun/',
    type: 'website',
    locale: 'ko_KR',
    siteName: '사주매칭',
  },
  twitter: {
    card: 'summary_large_image',
    title: '재운 흐름 보기 — 사주 기반 재물운 분석',
    description: '내 사주 기준 올해·이번 달·오늘의 재물 흐름을 한눈에.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
    },
  },
};

const CHAEUN_FAQ = [
  {
    q: '사주 재운은 어떻게 계산되나요?',
    a: '일간을 기준으로 십성 중 재성(내가 극하는 오행)·식상(내가 생하는 오행)·관성(나를 극하는 오행)의 배치를 먼저 봅니다. 원국 재성이 많으면 "재물 창출 성향"이, 식상이 강하면 "재물의 원천(아이디어·노동·영업)"이 풍부합니다. 여기에 대운(10년)·세운(연)·월운의 천간·지지가 들어오며 재성을 자극/통제하는 흐름을 합쳐 해·달·일 단위 재운 곡선을 그립니다.',
  },
  {
    q: '"돈 들어오는 해"는 언제인가요?',
    a: '개인마다 다르지만 일반적으로 내 일간 기준 세운(그해 천간)이 재성 또는 식상 오행일 때 재운이 강하다고 봅니다. 예: 甲(목) 일간이면 戊·己(토)가 재성, 丙·丁(화)이 식상이라 이 기운이 들어오는 해가 유리합니다. 본인 사주를 입력하면 10년치 대운·세운을 한 번에 시각화해 드립니다.',
  },
  {
    q: '재운이 안 좋은 해는 투자를 피해야 하나요?',
    a: '본 해석은 오락·참고 목적이며 투자·재무 판단의 근거로 사용할 수 없습니다. 다만 명리학적으로 충·형이 심한 해는 큰 결정보다 현상 유지를 권하는 전통적 해석이 있다는 점은 참고하실 수 있습니다.',
  },
];

export default function ChaeunLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: '재운 흐름 보기 — 사주 기반 재물운 분석',
          description: '내 사주의 재성·식상·관성을 분석한 대운 타임라인.',
          path: '/chaeun/',
          topic: ['재운', '재성', '식상', '대운', '세운'],
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: '홈', path: '/' },
          { name: '재운', path: '/chaeun/' },
        ])}
      />
      <JsonLd data={faqSchema(CHAEUN_FAQ)} />
      {children}
    </>
  );
}
