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
    absolute: '커플 궁합 — 두 사람 사주 실제 궁합 점수 (무료)',
  },
  description:
    '두 사람의 생년월일시를 입력하면 일간 관계·일지 합충·오행 보완·배우자궁 일치·연령차를 종합해 10점 만점 커플 궁합 점수를 계산해 드립니다. 근거와 팁까지 보여주는 고전 명리학 기반 무료 커플 궁합.',
  keywords: [
    '커플 궁합', '두 사람 궁합', '사주 궁합', '일간합', '일지합', '일지충',
    '오행 보완', '배우자궁', '명리 궁합', '무료 커플 궁합', '천간합', '지지 삼합',
  ],
  alternates: {
    canonical: 'https://saju.sedaily.ai/couple/',
    languages: {
      'ko-KR': 'https://saju.sedaily.ai/couple/',
      'en': 'https://saju.sedaily.ai/couple/',
    },
  },
  openGraph: {
    title: '커플 궁합 — 두 사람 사주 실제 궁합 점수',
    description: '두 사람의 생년월일시로 일간·일지·오행·배우자궁을 비교한 실제 궁합 해석.',
    url: 'https://saju.sedaily.ai/couple/',
    type: 'website',
    locale: 'ko_KR',
    siteName: '사주매칭',
  },
  twitter: {
    card: 'summary_large_image',
    title: '커플 궁합 — 두 사람 사주 실제 궁합 점수',
    description: '두 사람의 생년월일시로 계산한 커플 궁합.',
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

const COUPLE_FAQ = [
  {
    q: '커플 궁합은 어떻게 계산되나요?',
    a: '두 사람의 생년월일시로 각자의 사주 원국을 계산한 뒤 다섯 축을 종합합니다. (1) 일간 관계 — 천간합(+5)·상생(+3)·동일 오행(+1)·상극(-2). (2) 일지 관계 — 삼합(+4)·육합(+3)·충(-4). (3) 오행 보완 — 상대가 내 부족 오행을 공급하는가(최대 +4). (4) 배우자궁 일치 — 남자는 재성, 여자는 관성이 상대 일간과 맞는가(+3). (5) 연령차 10년 이상 -1. 기준점 5.0에 포인트당 ±0.5를 합산해 10점 만점 점수로 환산합니다.',
  },
  {
    q: '점수가 낮으면 헤어져야 하나요?',
    a: '아닙니다. 낮은 점수는 "자동으로 잘 맞는 요소가 적다"는 뜻이며, 서로의 리듬을 맞추는 노력이 더 필요하다는 신호일 뿐입니다. 명리학에서도 극·충이 있는 궁합은 빠른 동거·결혼보다 긴 연애 기간을 권합니다. 결과에 제공되는 실천 팁을 참고하세요.',
  },
  {
    q: '태어난 시간을 모르면 계산할 수 있나요?',
    a: '가능합니다. 시간 입력란의 "시간 모름" 옵션을 체크하면 시주를 제외한 年·月·日 세 기둥으로 계산합니다. 이 경우 일간·일지는 정확하게 잡히지만 시주 기반 해석 정밀도는 다소 떨어집니다.',
  },
  {
    q: '일간합(천간합)은 무엇인가요?',
    a: '두 사람의 일간(日干)이 甲己·乙庚·丙辛·丁壬·戊癸 다섯 쌍 중 하나에 해당하는 관계입니다. 명리학에서 가장 강한 감정적 끌림으로 해석하며, 처음부터 "편안하면서 설렘도 함께" 느껴지는 커플에게서 자주 나타납니다. 계산에서 +5점으로 가장 높은 가중치를 부여합니다.',
  },
  {
    q: '일지 충(沖)이 있으면 관계가 깨지나요?',
    a: '아니요. 일지 충은 子-午·丑-未·寅-申·卯-酉·辰-戌·巳-亥 여섯 쌍처럼 생활 리듬·가치관·가족 관계에서 어긋나기 쉬운 조합을 뜻합니다. 대화로 기본 루틴(수면·식사·돈·가족)을 합의하면 충분히 풀리지만, 방치하면 작은 갈등이 누적됩니다. 결과에 나오는 "24시간 룰"·"기본 생활 규칙 문서화" 같은 팁이 이 충을 완화하는 방향이에요.',
  },
  {
    q: '이 서비스는 무료인가요? 회원가입이 필요하나요?',
    a: '공개 프리뷰 기간 동안 완전 무료이며 회원가입이 필요 없습니다. 두 사람의 생년월일시만 입력하면 즉시 결과를 볼 수 있고, 결과는 서버에 저장되지 않습니다.',
  },
];

const COUPLE_HOWTO = [
  {
    name: '내 생년월일시 입력',
    text: '양력/음력을 선택하고 본인의 생년·월·일·시를 입력합니다. 태어난 시간을 모르면 "시간 모름" 옵션을 체크하세요.',
  },
  {
    name: '상대의 생년월일시 입력',
    text: '같은 방식으로 상대방의 정보를 입력합니다. 성별은 배우자궁 계산에 쓰이니 가능하면 선택해 주세요.',
  },
  {
    name: '궁합 점수·근거·팁 확인',
    text: '10점 만점 점수, 일간·일지·오행 근거, 이 조합을 위한 맞춤 실천 팁을 확인합니다. 서버에 정보가 저장되지 않으며 결과는 링크로 공유할 수 있습니다.',
  },
];

export default function CoupleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd
        data={webPageSchema({
          name: '커플 궁합 — 두 사람 사주 실제 궁합 점수',
          description: '일간 관계·일지 합충·오행 보완·배우자궁을 종합한 커플 궁합 해석.',
          path: '/couple/',
          topic: ['커플 궁합', '일간합', '일지합', '오행 보완', '배우자궁', '천간합', '지지 삼합'],
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: '홈', path: '/' },
          { name: '커플 궁합', path: '/couple/' },
        ])}
      />
      <JsonLd data={faqSchema(COUPLE_FAQ)} />
      <JsonLd
        data={howToSchema({
          name: '커플 궁합 보는 법',
          description: '두 사람의 생년월일시로 사주 기반 커플 궁합을 확인하는 방법.',
          totalTime: 'PT2M',
          steps: COUPLE_HOWTO,
        })}
      />
      {children}
    </>
  );
}
