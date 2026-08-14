import type { Metadata } from 'next';
import {
  JsonLd,
  breadcrumbSchema,
  webPageSchema,
  faqSchema,
  howToSchema,
} from '@saju/shared/lib/jsonLd';

export const metadata: Metadata = {
  metadataBase: new URL('https://saju.sedaily.ai'),
  title: {
    absolute: '사주팔자 무료 풀이 — 원국·십성 분석·대운 타임라인',
  },
  description:
    '생년월일시만 입력하면 천간·지지·대운·십성·오행 분포를 한 장에 정리. 궁통보감·삼명통회·자평진전 3대 고전과 KASI 만세력 기반의 무료 사주팔자 서비스.',
  keywords: [
    '사주팔자', '무료 사주', '원국',
    '십성', '오행', '천간', '지지', '만세력', 'KASI 만세력', '대운',
  ],
  alternates: {
    canonical: 'https://saju.sedaily.ai/saju/',
    languages: {
      'ko-KR': 'https://saju.sedaily.ai/saju/',
      'en': 'https://saju.sedaily.ai/saju/',
    },
  },
  openGraph: {
    title: '사주팔자 무료 풀이 — 원국·대운·십성',
    description: '생년월일시로 원국·대운·십성까지 한 번에.',
    url: 'https://saju.sedaily.ai/saju/',
    type: 'website',
    locale: 'ko_KR',
    siteName: '사주매칭',
  },
  twitter: {
    card: 'summary_large_image',
    title: '사주팔자 무료 풀이 — 원국·대운·십성',
    description: '생년월일시로 원국·대운·십성까지 한 번에.',
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

const SAJU_FAQ = [
  {
    q: '사주팔자는 무엇인가요?',
    a: '사주팔자(四柱八字)는 태어난 年·月·日·時의 네 기둥(四柱)을 각각 천간(天干)과 지지(地支) 두 글자로 표현해 총 여덟 글자(八字)로 정리한 것입니다. 이 여덟 글자에 담긴 오행(목·화·토·금·수)의 분포와 십성(十星) 관계로 타고난 기질과 시기별 흐름을 해석하는 것이 명리학의 기본 방법입니다.',
  },
  {
    q: '사주는 어떻게 풀이되나요?',
    a: '① 생년월일시로 만세력을 조회해 네 기둥의 천간·지지를 확정합니다. ② 日干(일간)을 기준으로 나머지 일곱 글자의 관계(십성)를 계산합니다. ③ 원국 전체 오행 분포로 강약·중화 여부를 판단합니다. ④ 10년 단위 대운과 연·월·일 단위의 운을 원국에 대입해 시기별 흐름을 해석합니다. 본 서비스는 궁통보감·삼명통회·자평진전 3대 고전 문헌과 KASI 만세력을 결합해 이 과정을 자동화합니다.',
  },
  {
    q: '오늘의 운세(일진)는 어떻게 계산되나요?',
    a: '오늘 날짜에 해당하는 천간·지지(일진)와 내 일간의 관계를 십성으로 풀어 해석합니다. 예: 甲 일간에게 오늘이 丙(식신)이면 표현·활동이 유리한 날, 庚(편관)이면 압박·결단이 중심인 날로 읽습니다. 일지와 내 일지의 합·충 여부까지 함께 봅니다. 일진 분석은 별도 페이지(/today)에서 확인할 수 있습니다.',
  },
  {
    q: '태어난 시간을 모르면 사주를 볼 수 없나요?',
    a: '"시간 모름" 옵션을 체크하면 시주(時柱)를 제외한 年·月·日 세 기둥으로 해석합니다. 일간·일지는 정확하게 확정되므로 성향·대운·재운·커리어 해석은 충분히 가능하며, 배우자궁이 필요한 정밀 궁합만 정확도가 조금 떨어집니다.',
  },
  {
    q: '사주 결과를 판단 근거로 써도 되나요?',
    a: '아니요. 본 서비스의 해석은 고전 명리학 문헌을 참고한 데이터 기반 콘텐츠로, 오락·참고 목적의 정보입니다. 의료·법률·재무·진로 등 어떠한 판단·결정의 근거로도 사용할 수 없습니다.',
  },
];

const SAJU_HOWTO = [
  {
    name: '생년월일시 입력',
    text: '양력/음력을 선택하고 생년·월·일·시를 입력합니다. 시간을 모르면 "시간 모름" 옵션을 체크합니다.',
  },
  {
    name: '성별·출생 지역 확인',
    text: '대운 방향과 경도 보정을 위해 성별과 출생 지역을 선택합니다. KASI 만세력 기반으로 분·초 단위까지 보정됩니다.',
  },
  {
    name: '원국·십성·오행 확인',
    text: '네 기둥(年月日時)과 십성, 오행 분포를 한 화면에서 확인합니다. 강한 기운과 부족한 기운이 자동으로 표시됩니다.',
  },
  {
    name: '대운·재운·커리어·궁합 탐색',
    text: '결과 화면에서 대운 타임라인, 재운 흐름, 커리어 적성, 이상형 궁합 탭으로 바로 이동해 깊이 있는 해석을 확인합니다.',
  },
];

export default function SajuLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: '사주팔자 무료 풀이 — 원국·대운·십성',
          description: '생년월일시로 원국·대운·십성까지 한 번에.',
          path: '/saju/',
          topic: ['사주팔자', '십성', '오행', '대운'],
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: '홈', path: '/' },
          { name: '사주', path: '/saju/' },
        ])}
      />
      <JsonLd data={faqSchema(SAJU_FAQ)} />
      <JsonLd
        data={howToSchema({
          name: '사주팔자 보는 법',
          description: '생년월일시로 사주 원국·십성·대운까지 확인하는 방법.',
          totalTime: 'PT1M',
          steps: SAJU_HOWTO,
        })}
      />
      {children}
    </>
  );
}
