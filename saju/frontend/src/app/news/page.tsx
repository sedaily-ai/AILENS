'use client';

// 뉴스 검색 API (sedaily-mbti-search-dev Lambda) 의 categories 필터 회귀로
// /news 페이지를 점검 안내 화면으로 임시 대체. 복구 시 git revert.

import { useLang } from '@saju/shared/lib/LangContext';
import { PageShell } from '@saju/shared/ui/PageShell';
import { PageHeader } from '@saju/shared/ui/PageHeader';
import { BottomNav } from '@saju/shared/ui/BottomNav';

export default function NewsPage() {
  const { t } = useLang();

  return (
    <PageShell hanjaRight="報" hanjaLeft="聞">
      <PageHeader
        title={t('경제 뉴스', 'News')}
        titleAccent={t('스', 's')}
        sub={t('키워드 기반 경제 뉴스 검색', 'Keyword-based economic news search')}
      />

      <section className="relative z-10 mt-3 mx-3 rounded-[24px] p-8 text-center"
               style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.025)' }}>
        <h2 className="text-[18px] font-bold mb-2" style={{ color: '#1A1A1A' }}>
          {t('뉴스 서비스 점검 중', 'News service under maintenance')}
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: '#4F4F58' }}>
          {t(
            '뉴스 검색 기능을 점검하고 있어 잠시 숨겼어요. 곧 다시 찾아올게요.',
            'The news search feature is temporarily unavailable while we fix an issue. We will be back shortly.',
          )}
        </p>
      </section>

      <BottomNav />
    </PageShell>
  );
}
