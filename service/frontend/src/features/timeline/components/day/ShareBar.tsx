'use client';

// 이 날 공유하기 — 그날 지면을 세로형 카드 이미지(1080×1920)와 이 페이지 링크로 보낸다(2026-10-20 개편).
//
// 예전 버튼은 이름과 동작이 달랐다. '카카오톡'은 링크만 복사했고(카카오 SDK 키 없음), '인스타그램'은 이미지만 내려받았고(웹에서 올리는 API 없음),
// '더보기'는 누른 뒤에 카드를 그리고 나서 공유 창을 열어 iOS Safari처럼 사용자 동작 제한이 엄격한 브라우저에서 아무 반응 없이 끝났다.
// 지금은 동작 그대로 이름 붙인 버튼만 둔다 — 공유하기(공유 창을 지원하는 기기만), 이미지 저장, 링크 복사.
// 카드는 이 영역이 화면에 가까워지면 미리 그려 둬서 '공유하기'를 누른 순간 바로 공유 창을 연다(카드용 세리프 글꼴을 모든 방문자에게 미리 받게 하지 않으려고 첫 화면에서는 그리지 않는다).
import { useEffect, useRef, useState } from 'react';
import { Check, Download, Link2, Share } from 'lucide-react';
import { generateShareCardBlob, type ShareCardData } from '@/features/timeline/lib/shareCard';
import { TEXT_STRONG, TEXT_MUTED, BORDER_HAIRLINE, FONT, LEADING, SPACE } from '@/features/timeline/lib/tone';

const COPIED_MS = 2000;

export function ShareBar({ cardData }: { cardData: ShareCardData }) {
  const ref = useRef<HTMLElement>(null);
  const blob = useRef<Blob | null>(null);
  // 브라우저 공유 지원 여부는 마운트 뒤에 정한다. 렌더 중에 navigator를 읽으면 서버(미지원)와 브라우저(지원)의 출력이 달라 하이드레이션 오류(#418)가 난다.
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const fileName = `ailens-timemachine-${cardData.date}.png`;
  // 부모가 렌더마다 새 객체를 넘기므로 내용으로 비교한다.
  const cardKey = JSON.stringify(cardData);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 기능 감지
    setCanShare(typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = true;
    blob.current = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void generateShareCardBlob(JSON.parse(cardKey) as ShareCardData).then((made) => { if (active) blob.current = made; });
    }, { rootMargin: '400px 0px' });
    observer.observe(el);
    return () => { active = false; observer.disconnect(); };
  }, [cardKey]);

  async function copyLink(message?: string) {
    try {
      await navigator.clipboard.writeText(cardData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
      setStatus(message ?? '');
    } catch {
      window.prompt('이 주소를 복사하세요', cardData.url);
    }
  }

  async function save() {
    const made = blob.current ?? await generateShareCardBlob(cardData);
    if (!made) { setStatus('카드 이미지를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.'); return; }
    blob.current = made;
    const url = URL.createObjectURL(made);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('카드 이미지를 저장했어요.');
  }

  // 누른 순간 바로 공유 창을 연다 — 사이에 이미지 생성처럼 오래 걸리는 일을 두면 브라우저가 공유 창을 막는다.
  // 카드가 아직 없으면 링크만 보낸다.
  async function share() {
    const data: ShareData = { title: 'AI LENS 타임머신', text: `${cardData.dateLabel}, 그날의 서울경제`, url: cardData.url };
    const file = blob.current ? new File([blob.current], fileName, { type: 'image/png' }) : null;
    try {
      await navigator.share(file && navigator.canShare?.({ files: [file] }) ? { ...data, files: [file] } : data);
      setStatus('');
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return; // 공유 창을 닫은 경우
      await copyLink('공유 창을 열 수 없어 링크를 복사했어요.');
    }
  }

  return (
    <section
      ref={ref}
      aria-labelledby="tl-share-title"
      style={{ marginTop: SPACE.xxl, paddingTop: SPACE.xl, borderTop: `1px solid ${BORDER_HAIRLINE}` }}
    >
      <h2 id="tl-share-title" style={{ fontSize: FONT.sectionTitle, fontWeight: 700, color: TEXT_STRONG, letterSpacing: '-0.02em' }}>
        이 날 공유하기
      </h2>
      <p style={{ marginTop: SPACE.xs, fontSize: FONT.caption, color: TEXT_MUTED, lineHeight: LEADING.body, wordBreak: 'keep-all' }}>
        세로형 카드 이미지로 저장하거나 링크로 보낼 수 있어요.
      </p>
      {/* 좁은 화면은 세 버튼이 한 줄에 안 들어가 '링크 복사'만 둘째 줄에 떨어졌다 — 공유하기를 한 줄 전체로, 나머지 둘을 반씩 나눈다. */}
      <style>{`
        .tl-share-actions { display:flex; flex-wrap:wrap; gap:${SPACE.sm}px; margin-top:${SPACE.lg}px; }
        @media (max-width:640px) {
          .tl-share-actions { display:grid; grid-template-columns:1fr 1fr; }
          .tl-share-actions .tl-btn { padding:0 ${SPACE.lg}px; }
          .tl-share-actions .tl-btn-primary { grid-column:1 / -1; }
        }
      `}</style>
      <div className="tl-share-actions">
        {canShare && (
          <button type="button" className="tl-btn tl-btn-primary tl-focus" onClick={share}>
            <Share size={16} aria-hidden />공유하기
          </button>
        )}
        <button type="button" className="tl-btn tl-focus" onClick={save}>
          <Download size={16} aria-hidden />이미지 저장
        </button>
        <button type="button" className="tl-btn tl-focus" onClick={() => copyLink()} aria-label={copied ? '링크를 복사했어요' : '이 페이지 링크 복사'}>
          {copied ? <Check size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
          {copied ? '복사했어요' : '링크 복사'}
        </button>
      </div>
      <p role="status" style={{ minHeight: FONT.caption * LEADING.body, marginTop: SPACE.sm, fontSize: FONT.caption, color: TEXT_MUTED, lineHeight: LEADING.body }}>
        {status}
      </p>
    </section>
  );
}
