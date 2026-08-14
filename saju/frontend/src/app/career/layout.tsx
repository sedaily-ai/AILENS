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
    absolute: '사주 기반 커리어·직업 적성 — 관성·식상 분석 (무료)',
  },
  description:
    '내 사주의 관성·식상·인성 배치를 해석해 어울리는 직업군과 커리어 흐름을 제시합니다. 대운 전환점과 이직·창업 타이밍까지 근거와 함께 안내.',
  keywords: [
    '사주 직업', '사주 커리어', '직업 적성', '관성', '식상',
    '이직 시기', '창업 시기', '대운 전환', '무료 사주 커리어', '사주 진로',
  ],
  alternates: {
    canonical: 'https://saju.sedaily.ai/career/',
    languages: {
      'ko-KR': 'https://saju.sedaily.ai/career/',
      'en': 'https://saju.sedaily.ai/career/',
    },
  },
  openGraph: {
    title: '사주 기반 커리어·직업 적성',
    description: '관성·식상·인성으로 풀어낸 나에게 맞는 일.',
    url: 'https://saju.sedaily.ai/career/',
    type: 'website',
    locale: 'ko_KR',
    siteName: '사주매칭',
  },
  twitter: {
    card: 'summary_large_image',
    title: '사주 기반 커리어·직업 적성',
    description: '관성·식상·인성으로 풀어낸 나에게 맞는 일.',
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

const CAREER_FAQ = [
  {
    q: '사주로 직업 적성을 어떻게 판단하나요?',
    a: '일간을 기준으로 십성 중 관성(규율·조직)·식상(표현·창작)·인성(학습·관리)의 세기와 배치를 봅니다. 관성이 발달하면 조직·공직·전문직이 맞고, 식상이 발달하면 창작·영업·미디어가, 인성이 발달하면 교육·연구·관리 쪽이 맞는 경향을 보입니다. 오행 분포(목·화·토·금·수)로 업종 결을 세분화합니다.',
  },
  {
    q: '이직·창업 타이밍은 어떻게 보나요?',
    a: '대운(10년 주기)과 세운(연 단위)의 천간·지지가 내 일간과 어떤 관계를 맺는지로 판단합니다. 관성 운이 들어오면 조직 내 이동·승진에, 식상 운이 들어오면 독립·창업·전직에 우호적인 흐름으로 해석합니다. 충·형이 강한 해는 큰 결정을 미루는 편이 좋습니다.',
  },
  {
    q: '사주가 안 좋다고 직업을 바꿔야 하나요?',
    a: '아닙니다. 사주는 타고난 성향과 흐름의 경향성을 보여주는 도구일 뿐이며, 직업을 결정하는 유일한 근거가 될 수 없습니다. 본 서비스의 해석은 오락·참고 목적의 정보로, 의료·법률·재무·진로 등 어떠한 판단·결정의 근거로도 사용할 수 없습니다.',
  },
];

export default function CareerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: '사주 기반 커리어·직업 적성',
          description: '관성·식상·인성으로 풀어낸 나에게 맞는 일.',
          path: '/career/',
          topic: ['커리어', '직업 적성', '관성', '식상', '인성', '대운'],
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: '홈', path: '/' },
          { name: '커리어', path: '/career/' },
        ])}
      />
      <JsonLd data={faqSchema(CAREER_FAQ)} />
      {children}
    </>
  );
}
