import type { ReactNode } from 'react';
import { wrapWithTerms } from '@/shared/ui/notice/TermTooltip';

// LetterDetailClient.tsx에서 추출(2026-08-24, God 파일 분해 2라운드).
// ── 본문 블록 위계 렌더 ───────────────────────────────────────────────
// body 는 구조가 텍스트 약속으로만 인코딩된 string[] 이라, 한 줄을
// 분류해 섹션 헤더 / 소제목 / 인사이트 콜아웃 / 아젠다 / Q&A / 본문으로
// 시각 위계를 부여한다. 톤은 기존 레터(여백·헤어라인·세리프 본문)를 유지.
const SERIF = '"Noto Serif KR", serif';

export function LetterBlock({
  text,
  accent,
  accentBg,
  glossary,
}: {
  text: string;
  accent: string;
  accentBg: string;
  glossary?: Array<{ term: string; explain: string }>;
}) {
  const t = text.trim();
  // 본문 텍스트만 wrap. 헤더/라벨/소제목은 그대로.
  const wrap = (s: string): ReactNode => (glossary && glossary.length > 0 ? wrapWithTerms(s, glossary) : s);

  // ![alt](url) — CMS 에디터에서 본문 중 원하는 자리에 끌어놓은 이미지.
  // admin PostForm 이 드래그·붙여넣기 시 이 마커를 그 위치에 그대로 심는다.
  const image = t.match(/^!\[([^\]]*)\]\((\S+)\)$/);
  if (image) {
    const [, alt, url] = image;
    return (
      <figure style={{ margin: '24px 0' }}>
        {/* 외부 S3 이미지 — 정적 export 라 next/image 대신 원본 사용 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          style={{ width: '100%', borderRadius: 14, display: 'block' }}
        />
        {alt && (
          <figcaption style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
            {alt}
          </figcaption>
        )}
      </figure>
    );
  }

  // ■ 섹션 헤더 (핵심 기사 / 참고 기사 / 종합 / 데이터 표 제목)
  const section = t.match(/^■\s*(.+)$/);
  if (section) {
    return (
      <h2
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: '#111827',
          letterSpacing: '-0.02em',
          margin: '40px 0 16px',
          paddingLeft: 12,
          borderLeft: `3px solid ${accent}`,
          lineHeight: 1.35,
        }}
      >
        {section[1]}
      </h2>
    );
  }

  // [라벨] … — 본문 텍스트가 있으면 콜아웃, 라벨만이면 FAQ/섹션 라벨
  const bracket = t.match(/^[[〔]([^\]〕]+)[\]〕]\s*([\s\S]*)$/);
  if (bracket) {
    const label = bracket[1].trim();
    const rest = bracket[2].trim();
    if (!rest) {
      return (
        <p
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: accent,
            letterSpacing: '0.08em',
            margin: '36px 0 14px',
          }}
        >
          {label}
        </p>
      );
    }
    return (
      <div
        style={{
          background: accentBg,
          borderRadius: 12,
          padding: '16px 18px',
          margin: '18px 0',
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: accent,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            margin: '0 0 6px',
          }}
        >
          {label}
        </p>
        <p style={{ fontSize: 'calc(14.5px * var(--letter-font-scale, 1))', lineHeight: 1.75, color: '#374151', margin: 0 }}>
          {wrap(rest)}
        </p>
      </div>
    );
  }

  // Q. … A. … FAQ 항목
  const qa = t.match(/^Q\.\s*([\s\S]+?)\s*A\.\s*([\s\S]+)$/);
  if (qa) {
    return (
      <div style={{ margin: '0 0 20px' }}>
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.6,
            margin: '0 0 8px',
          }}
        >
          Q. {wrap(qa[1].trim())}
        </p>
        <p
          style={{
            fontSize: 'calc(14.5px * var(--letter-font-scale, 1))',
            lineHeight: 1.8,
            color: '#4b5563',
            margin: 0,
            paddingLeft: 14,
            borderLeft: '2px solid #e5e7eb',
          }}
        >
          {wrap(qa[2].trim())}
        </p>
      </div>
    );
  }

  // 1. 제목 — 부제/리드. 번호 줄은 소제목으로, 뒤따르는 리드는 본문으로.
  const num = t.match(/^(\d+)\.\s+([\s\S]+)$/);
  if (num) {
    const [head, ...ledeParts] = num[2].split(/\s—\s/);
    const lede = ledeParts.join(' — ').trim();
    return (
      <div style={{ margin: '28px 0 0' }}>
        <h3
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.45,
            letterSpacing: '-0.01em',
            margin: lede ? '0 0 10px' : 0,
          }}
        >
          <span style={{ color: accent, marginRight: 6 }}>{num[1]}.</span>
          {head.trim()}
        </h3>
        {lede && (
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 'calc(16px * var(--letter-font-scale, 1))',
              lineHeight: 1.9,
              color: '#374151',
              margin: 0,
            }}
          >
            {wrap(lede)}
          </p>
        )}
      </div>
    );
  }

  // ①②③ 아젠다(상단 목차) — 본문보다 한 톤 진하게, 간격 좁게
  if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(t)) {
    return (
      <p
        style={{
          fontSize: 'calc(15.5px * var(--letter-font-scale, 1))',
          fontWeight: 600,
          color: '#1f2937',
          lineHeight: 1.7,
          margin: '0 0 10px',
        }}
      >
        {t}
      </p>
    );
  }

  // 기본 본문
  return (
    <p
      style={{
        fontFamily: SERIF,
        fontSize: 'calc(16px * var(--letter-font-scale, 1))',
        lineHeight: 1.9,
        color: '#374151',
        margin: '0 0 18px',
      }}
    >
      {wrap(t)}
    </p>
  );
}
