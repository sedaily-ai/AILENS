import Link from 'next/link';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';

/**
 * 기사 하단 AI 생성 콘텐츠 고지 박스. 왼쪽 파란 보더 + ⓘ 아이콘 + 2줄 고지문 + 링크 구성이다.
 * 문구는 이용약관 제6조(콘텐츠에 대한 면책)와 같은 취지이며, "이용 정책" 링크가 그 조항으로 바로 스크롤되도록
 * `/terms#content-disclaimer`를 쓴다(terms/page.tsx의 h2에 id).
 *
 * lens(`LensViewClient.tsx`)·letters(`LetterDetailClient.tsx`)는 기사 하단의 "원문 보기" 링크 대신 이 박스를 쓴다
 * (source_url이 있으면 이 박스 안 링크로 충분하다).
 *
 * KPI 계측("신뢰" 축): articleId/format을 넘기면 클릭 시 source_link_click을 보낸다. 이 이벤트만으로는 요약이 부실해 원문으로 갔는지
 * 검증하러 갔는지 가를 수 없으며(별도 정성 신호 필요), 원문으로 이탈하는 빈도를 잡는 용도다.
 */
export function AiDisclaimer({
  sourceUrl,
  articleId,
  format,
}: {
  sourceUrl?: string | null;
  articleId?: string;
  format?: string;
}) {
  const handleSourceClick = () => {
    if (articleId) trackEvent('source_link_click', { article_id: articleId, format: format ?? null });
  };
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '14px 16px',
        background: '#f6f7f9',
        borderRadius: '16px 12px 17px 11px / 12px 17px 11px 16px',
      }}
    >
      <span aria-hidden style={{ flexShrink: 0, color: '#9ca3af', marginTop: 1 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <path strokeLinecap="round" d="M12 11v5M12 8v.01" />
        </svg>
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.6, wordBreak: 'keep-all', margin: 0 }}>
          이 콘텐츠는 서울경제신문 원문 기사를 AI가 레터·웹툰·팟캐스트·영상 형식으로 재구성해 만들었습니다.
        </p>
        <p style={{ fontSize: 12.5, color: '#9ca3af', lineHeight: 1.6, wordBreak: 'keep-all', margin: '4px 0 0' }}>
          AI 생성 과정에서 표현이나 세부 내용이 원문과 다를 수 있어요. 투자 등 중요한 판단 전에는 원문을 확인해 주세요.
        </p>
        <div className="flex items-center flex-wrap" style={{ gap: 12, marginTop: 8 }}>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleSourceClick}
              style={{ fontSize: 12.5, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}
            >
              원문 기사 보기 ↗
            </a>
          )}
          <Link href="/terms#content-disclaimer" style={{ fontSize: 12.5, fontWeight: 600, color: '#6b7280', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            이용 정책
          </Link>
          {/* 약관 조항뿐 아니라 편집 프로세스(AI 초안 → 사람 검수)를 설명하는 /about 페이지도 안내해 "누가·어떻게 만들었는지"를 공개한다(E-E-A-T 저자 페이지 링크). */}
          <Link href="/about" style={{ fontSize: 12.5, fontWeight: 600, color: '#6b7280', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            AI LENS 소개
          </Link>
        </div>
      </div>
    </div>
  );
}
