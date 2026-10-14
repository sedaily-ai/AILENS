import { useEffect } from 'react';
import { useRouter } from 'expo-router';

// 로그아웃 복귀 지점(`ailens://auth/signout`) — 소셜 로그인 계정의 로그아웃이 브라우저를 거쳐 돌아오는 주소. 라우트가 없으면 Unmatched Route 가 뜬다.
export default function AuthSignOut() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}
