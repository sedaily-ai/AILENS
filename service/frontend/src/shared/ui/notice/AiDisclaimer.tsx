import Link from 'next/link';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';

/**
 * 기사 하단 AI 생성 콘텐츠 고지 박스(2026-08-21, 사용자 요청 — 서울경제
 * 영문 CMS(en.sedaily.com)의 "AI-translated from Korean... View Korean
 * original" 박스를 레퍼런스로 제시하며 "면책조항 걸어주세요"). 왼쪽
 * 파란 보더 + ⓘ 아이콘 + 2줄 고지문 + 링크 구성을 그대로 가져왔다.
 * 문구는 이용약관 제6조(콘텐츠에 대한 면책)와 같은 취지 — "이용 정책"
 * 링크가 그 조항으로 바로 스크롤되도록 `/terms#content-disclaimer`를
 * 쓴다(terms/page.tsx의 h2에 id 추가).
 *
 * lens(`LensViewClient.tsx`)·letters(`LetterDetailClient.tsx`) 둘 다
 * 기사 하단에 있던 "원문 보기" 링크 한 줄을 이 박스가 대체 —
 * source_url이 있으면 이 박스 안 링크로 충분해서 별도로 남겨두지 않는다.
 *
 * KPI 계측(2026-08-23) — "신뢰" 축. articleId/format을 넘기면 클릭 시
 * source_link_click을 쏜다. 이 클릭이 "AI 요약이 부실해서 원문 갔다"인지
 * "AI 요약이 맘에 들어 검증하러 갔다"인지는 이 이벤트 하나로는 못 가른다
 * — 그건 별도 정성 신호(1탭 피드백 등)가 필요하다는 걸 KPI 메모에도
 * 명시해뒀다. 지금은 일단 "얼마나 자주 원문으로 이탈하는가"부터 잡는다.
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
          {/* 2026-08-21 GEO 감사 — E-E-A-T "저자 페이지 링크" 권장사항
              (Google Search Central) 보강. 약관 조항뿐 아니라 편집 프로세스
              (AI 초안 → 사람 검수)를 설명하는 /about 페이지도 같이 안내해
              "누가·어떻게 만들었는지"를 더 명확히 공개한다. */}
          <Link href="/about" style={{ fontSize: 12.5, fontWeight: 600, color: '#6b7280', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            AI LENS 소개
          </Link>
        </div>
      </div>
    </div>
  );
}
