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
    absolute: '궁합 추천 — 나와 잘 맞는 사람의 사주 역산 (무료)',
  },
  description:
    '내 사주의 결핍·과잉 오행을 보완하는 이상적인 상대의 원국을 역산해 드립니다. 추천 일간·지지·태어난 해·달·띠·배우자궁까지 한 번에 제시하는 무료 사주 궁합 추천.',
  keywords: [
    '궁합', '사주 궁합', '궁합 추천', '이상형 사주', '배우자궁',
    '천간합', '지지 삼합', '오행 보완', '무료 궁합', '띠 궁합', '이상형 테스트',
  ],
  alternates: {
    canonical: 'https://saju.sedaily.ai/compatibility/',
    languages: {
      'ko-KR': 'https://saju.sedaily.ai/compatibility/',
      'en': 'https://saju.sedaily.ai/compatibility/',
    },
  },
  openGraph: {
    title: '궁합 추천 — 나와 잘 맞는 사람의 사주 역산',
    description: '오행 보완·천간합·지지 삼합·배우자궁까지 종합한 이상형 사주.',
    url: 'https://saju.sedaily.ai/compatibility/',
    type: 'website',
    locale: 'ko_KR',
    siteName: '사주매칭',
  },
  twitter: {
    card: 'summary_large_image',
    title: '궁합 추천 — 나와 잘 맞는 사람의 사주 역산',
    description: '오행 보완·천간합·지지 삼합·배우자궁까지 종합한 이상형 사주.',
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

const COMPAT_FAQ = [
  {
    q: '사주로 이상형을 어떻게 역산하나요?',
    a: '상대 정보 없이 내 원국만으로 계산합니다. (1) 내가 부족한 오행 +4, (2) 내가 과한 오행을 통제해 줄 오행 +2, (3) 내 일간과 천간합을 이루는 상대 일간 +3, (4) 성별 배우자궁 가중(남자는 재성, 여자는 관성) +2를 합산해 가장 점수 높은 일간 오행을 "추천 일간"으로 제시합니다. 여기에 삼합·육합으로 잘 맞는 지지를 더해 "추천 태어난 해·달·띠"까지 역산합니다.',
  },
  {
    q: '"현실 궁합"과 "오행 보완" 모드는 뭐가 다른가요?',
    a: '현실 궁합은 배우자궁(관성·재성)과 천간합에 가중을 둔, 실제로 자주 만나게 되는 상대를 찾는 모드입니다. 오행 보완은 말 그대로 내 원국의 결핍을 채워주는 오행에 가중을 둔, 장기적 안정에 유리한 모드입니다. 둘 다 보면서 공통으로 추천되는 상대를 찾는 게 가장 신뢰도 높은 읽기예요.',
  },
  {
    q: '점수(적합도)는 무슨 의미인가요?',
    a: '점수는 "이 추천이 내 사주의 결핍·과잉을 얼마나 잘 보완하는가"를 보여주는 적합도입니다. 상대와의 궁합 점수가 아니라, 추천이 내 사주에 얼마나 맞는지에 대한 수치예요. 상대 실제 궁합이 궁금하다면 /couple에서 두 사람 생년월일로 계산해 보세요.',
  },
  {
    q: '태어난 시간을 모르면 이상형 추천이 가능할까요?',
    a: '가능합니다. "시간 모름" 옵션으로 年·月·日 세 기둥만으로도 일간·일지가 확정되므로 추천 일간·띠는 그대로 계산됩니다. 다만 배우자궁은 시주까지 볼 때 더 정밀해지므로 가능하면 시간을 입력하시길 권합니다.',
  },
];

export default function CompatibilityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: '궁합 추천 — 나와 잘 맞는 사람의 사주 역산',
          description: '오행 보완·천간합·지지 삼합·배우자궁까지 종합한 이상형 사주.',
          path: '/compatibility/',
          topic: ['궁합', '오행 보완', '천간합', '지지 삼합', '배우자궁', '이상형 사주'],
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: '홈', path: '/' },
          { name: '궁합', path: '/compatibility/' },
        ])}
      />
      <JsonLd data={faqSchema(COMPAT_FAQ)} />
      {children}
    </>
  );
}
