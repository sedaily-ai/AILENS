'use client';

import { useEffect } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';

/**
 * /about/ 는 / 로 통합되었습니다. (2026-04-30)
 * static export 환경이라 서버 301이 불가능하므로,
 * 클라이언트 redirect + <meta refresh> + <link rel="canonical"> 세 겹으로 처리.
 */
export default function AboutRedirect() {
  const { t, localePath } = useLang();
  const home = localePath('/');

  useEffect(() => {
    window.location.replace(home);
  }, [home]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center px-6">
      <div className="max-w-[480px] lg:max-w-[1080px] text-center">
        <p className="text-[13px] font-semibold tracking-[0.12em] text-slate-500 uppercase mb-3">
          Moved
        </p>
        <h1 className="text-[22px] font-bold mb-3">{t('이 페이지는 홈으로 통합되었어요.', 'This page has moved to the home.')}</h1>
        <p className="text-[14px] text-slate-600 leading-relaxed mb-6">
          {t('잠시 후 자동으로 이동합니다. 이동되지 않으면 아래 링크를 눌러 주세요.', 'You will be redirected shortly. If not, tap the link below.')}
        </p>
        <a
          href={home}
          className="inline-flex items-center justify-center h-10 px-5 rounded-full bg-slate-900 text-white text-[14px] font-semibold hover:bg-slate-800 transition-colors no-underline"
        >
          {t('사주매칭 홈으로 이동 →', 'Go to Saju home →')}
        </a>
      </div>
    </main>
  );
}
