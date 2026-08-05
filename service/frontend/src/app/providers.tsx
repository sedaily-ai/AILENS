'use client';

import { Suspense } from 'react';
import { AuthProvider } from '@/features/auth';
import { NavProgress } from '@/widgets/NavProgress/NavProgress';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {/* useSearchParams 사용 — 정적 export 빌드에서 Suspense 경계 필수 */}
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      {children}
    </AuthProvider>
  );
}
