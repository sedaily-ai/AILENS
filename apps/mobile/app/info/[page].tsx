import { Stack, useLocalSearchParams } from 'expo-router';
import { WebPage } from '../../src/components/WebPage';

// 웹이 정본인 정적 안내 페이지(이용약관·개인정보처리방침·서비스 소개·문의). 웹 (company) 라우트와 같은 주소를 앱 안에서 연다.
const PAGES: Record<string, { title: string; path: string }> = {
  terms: { title: '이용약관', path: '/terms' },
  privacy: { title: '개인정보처리방침', path: '/privacy' },
  about: { title: '서비스 소개', path: '/about' },
  contact: { title: '문의하기', path: '/contact' },
};

export default function InfoPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const info = PAGES[page];
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: info?.title ?? '안내' }} />
      <WebPage path={info?.path ?? '/'} />
    </>
  );
}
