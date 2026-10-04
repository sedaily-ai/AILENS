import Link from 'next/link';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';

/**
 * 영상·웹툰 상세에 붙이는 "이 이슈 한눈에 보기" 텍스트 섹션(2026-10-01).
 *
 * 왜: 영상 페이지는 제목+excerpt(수십 자)만, 웹툰은 컷 캡션만 초기 HTML에
 * 있어 검색봇·AI 크롤러가 읽을 텍스트가 얇았다(로컬 실측 영상 약 570자,
 * 웹툰 약 1,180자). 같은 이슈를 다룬 lens 글(슬러그 동일)이 이미 요약·
 * 30초 핵심·용어·대본을 갖고 있어서, 그걸 서버에서 가져와 눈에 보이는
 * 텍스트로 그대로 렌더한다(숨김 텍스트 아님 — 클로킹 방지). 서버
 * 컴포넌트라 JS 없이도 초기 HTML에 포함된다.
 *
 * 중복 콘텐츠 우려로 분량은 의도적으로 제한 — 4포맷 전문(레터 본문·팟캐스트
 * 대본)은 lens 페이지에 두고, 여기는 요약·핵심·용어·(영상일 때) 영상 대본만
 * 싣고 lens 페이지로 링크한다.
 */
export function IssueContextSection({
  lens,
  format,
  tone,
}: {
  lens: CmsLens | null;
  format: '영상' | '웹툰';
  tone: 'light' | 'dark';
}) {
  if (!lens) return null;

  const letter = lens.lenses.find((l) => l.label === '레터');
  const own = lens.lenses.find((l) => l.label === format);
  const points = (letter?.bullets ?? []).filter(Boolean);
  const terms = (letter?.keywords ?? []).filter((k) => k.term);
  const transcript = format === '영상' ? own?.transcript?.trim() : null;

  const dark = tone === 'dark';
  const c = {
    bg: dark ? '#0b0b0d' : '#ffffff',
    border: dark ? 'rgba(255,255,255,0.08)' : '#ececec',
    h: dark ? '#f4f4f5' : '#111827',
    body: dark ? '#a1a1aa' : '#4b5563',
    sub: dark ? '#71717a' : '#9ca3af',
    link: dark ? '#fde047' : '#111827',
  };

  return (
    <section
      aria-labelledby="issue-context-heading"
      style={{
        background: c.bg,
        borderTop: `1px solid ${c.border}`,
        padding: '28px clamp(20px, 5vw, 32px) 40px',
        maxWidth: 780,
        margin: '0 auto',
      }}
    >
      <h2
        id="issue-context-heading"
        style={{ fontSize: 15, fontWeight: 700, color: c.h, marginBottom: 12, letterSpacing: '-0.01em' }}
      >
        이 이슈, 한눈에 보기
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.75, color: c.body, marginBottom: 6 }}>{displayHeadline(lens.headline)}</p>
      {lens.context && <p style={{ fontSize: 13.5, lineHeight: 1.75, color: c.body }}>{lens.context}</p>}

      {points.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: c.h, margin: '20px 0 8px' }}>30초 핵심</h3>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13.5, lineHeight: 1.75, color: c.body }}>
            {points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}

      {transcript && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: c.h, margin: '20px 0 8px' }}>영상 대본</h3>
          <p style={{ fontSize: 13.5, lineHeight: 1.75, color: c.body, whiteSpace: 'pre-line' }}>{transcript}</p>
        </>
      )}

      {terms.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: c.h, margin: '20px 0 8px' }}>핵심 용어</h3>
          <dl style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: c.body }}>
            {terms.map((k) => (
              <div key={k.term} style={{ marginBottom: 4 }}>
                <dt style={{ display: 'inline', fontWeight: 700, color: c.h }}>{k.term}</dt>
                {k.explain && <dd style={{ display: 'inline', margin: 0 }}> — {k.explain}</dd>}
              </div>
            ))}
          </dl>
        </>
      )}

      <p style={{ marginTop: 22, fontSize: 12.5, color: c.sub, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        <Link href={lensPath(lens)} style={{ color: c.link, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          레터·웹툰·팟캐스트·영상 4가지 시선으로 보기
        </Link>
        {lens.source_url && (
          <a
            href={lens.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: c.sub, textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            서울경제 원문 기사
          </a>
        )}
      </p>
    </section>
  );
}
