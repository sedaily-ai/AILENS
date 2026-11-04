export { BirthdayArrivalRoute as default, generateArrivalMetadata as generateMetadata } from '@/widgets/BirthdayMarketPage';

// 그날 신문 카드의 QR이 여는 도착 페이지. 날짜마다 서버가 한 번 만들어 캐시한다(빈 목록을 돌려 두면 요청이 올 때 만든다 — 지난 지면 /paper/[date]와 같은 방식).
// 그날 기사와 사진은 브라우저가 불러오므로 이 페이지의 내용은 날짜가 달라도 같다.
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}
