'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useCutViewTracking } from '@/shared/lib/tracking/useCutViewTracking';
import { webtoonVariant } from '@/shared/lib/tracking/webtoonVariant';

// lens/[slug]/LensViewClient.tsx에 갇혀있던 걸 shared/ui로 추출(2026-08-24,
// God 파일 분해). KPI 계측(2026-08-23) — 웹툰 완주율("컷 몇까지 봤는가").
// 컷 목록을 감싸는 컨테이너에 ref를 걸고 IntersectionObserver로 컷별
// 노출을 잡는다 — 역시 hooks는 .map() 루프 안에서 못 써서 별도 컴포넌트로
// 뺐다.
//
// 2026-08-24(웹툰 릴론치 PR #10 반영) — "이미지 + 그 아래 캡션"을 8번
// 반복하던 형태(컷마다 18px 여백으로 끊김 → 만화가 아니라 그림 목록을
// 스크롤하는 느낌, 컷 안 말풍선 대사와 캡션이 같은 말을 두 번 함)를
// **이어지는 한 줄기**로 바꿨다. 컷을 2px 간격으로만 붙여 세로로 이어
// 붙인다(웹툰의 기본 읽기 방식) — 캡션은 화면에서 사라진 게 아니라
// 호출부(LensFormatPanel의 "대사로 읽기" 접이식 목록)로 자리를 옮긴 것
// 뿐이라 접근성·SEO 손실이 없다. 그래서 이 컴포넌트는 이제 caption을
// 렌더하지 않는다 — alt 텍스트로만 남긴다.
// 컷 사이 흰 여백(2026-10-04, 사용자 요청 — "너무 짧아서 아쉽다, 스크롤을 더 하게 해도 된다"): 붙여 놓던 컷 사이에 56~140px(화면 폭에 비례)의 흰 간격을 둔다.
// 사진(LensViewClient PHOTO_SHADOW)과 같은 결의 그림자 — 컷 묶음이 페이지 위에 살짝 떠 있는 한 장처럼 보이게.
const WEBTOON_SHADOW =
  '0 1px 2px rgba(17,24,39,0.06), 0 6px 16px -4px rgba(17,24,39,0.12), 0 22px 44px -14px rgba(17,24,39,0.18)';

// 나레이션 글자 안의 숫자를 강조색(서울경제 CI 파랑)으로 — 예전 검정 띠 안에서 숫자만 파랗게 칠하던 것과 같은 규칙.
const NUM_RE = /(\d[\d,.]*\s?(?:조|억|만)?\s?(?:원|%|퍼센트|개사|개|곳|명|년|월|일|배|bp|포인트)?)/g;
function highlightNumbers(text: string) {
  const parts = text.split(NUM_RE);
  return parts.map((t, i) =>
    i % 2 === 1 ? (
      <span key={i} style={{ color: '#5b8def', fontWeight: 800 }}>
        {t}
      </span>
    ) : (
      <span key={i}>{t}</span>
    ),
  );
}

export function WebtoonCutGallery({
  cuts,
  articleId,
  category,
}: {
  cuts: { url: string; caption?: string; text_caption?: boolean }[];
  articleId?: string | null;
  category?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 로딩 우선순위(2026-10-04, 웹툰 탭이 느리다는 문의) — 탭을 열면 컷 7~8장이 한꺼번에 받아져 대역폭을 나눠 먹는 바람에
  // 첫 컷이 느린 모바일에서 ~2초 늦게 떴다(측정: 1.6Mbps·CPU 4x, 컷당 ~50KB × 7장). 그래서
  //  · 첫 두 컷은 높은 우선순위, 나머지는 낮은 우선순위(fetchPriority)로 받아 앞 컷이 먼저 끝나게 한다.
  //  · 웹툰 탭이 숨겨진 채(다른 탭이 기본)로 페이지가 뜨면, 로드가 끝난 뒤 한가할 때 첫 두 컷을 미리 받아 둔다(탭을 누르면 이미 캐시에 있다).
  const [warm, setWarm] = useState(false);
  const [visibleNow, setVisibleNow] = useState(false);
  // 탭이 열려 화면에 들어오면(미리 받기 전에 눌렀어도) 앞 컷을 높은 우선순위로 올린다.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setVisibleNow(true);
        setWarm(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const kick = () => {
      setVisibleNow(el.offsetParent !== null); // 숨겨진 패널(display:none)이면 null
      setWarm(true);
    };
    if (document.readyState === 'complete') {
      const id = window.setTimeout(kick, 0);
      return () => window.clearTimeout(id);
    }
    const onLoad = () => {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(kick, { timeout: 2500 });
      else window.setTimeout(kick, 800);
    };
    window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);
  useCutViewTracking(containerRef, articleId, cuts.length, webtoonVariant(cuts), category);

  // 몰입(2026-10-01) — 컷이 화면에 들어올 때 살짝 떠오르며 나타난다. 한 번만, 모션 줄이기면 처음부터 보임.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !('IntersectionObserver' in window)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const figs = Array.from(root.querySelectorAll<HTMLElement>('figure[data-cut-index]'));
    figs.forEach((f) => f.setAttribute('data-pre', ''));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // 화면에 들어왔거나, 이미 위로 지나친 컷(빠르게 건너뛴 경우)은 바로 보이게 한다 — 빈 공백이 남지 않도록.
          if (e.isIntersecting || e.boundingClientRect.bottom < 0) {
            (e.target as HTMLElement).removeAttribute('data-pre');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    figs.forEach((f) => io.observe(f));
    // IntersectionObserver는 화면을 거치지 않고 건너뛴(아래→위로 지나친) 컷엔 반응하지 않으므로, 스크롤 때 위로 지나친 컷도 보이게 한다.
    let raf = 0;
    const revealPassed = () => {
      raf = 0;
      figs.forEach((f) => {
        if (f.hasAttribute('data-pre') && f.getBoundingClientRect().bottom < 0) f.removeAttribute('data-pre');
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(revealPassed);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [cuts.length]);

  return (
    <div
      ref={containerRef}
      className="lm wcut"
      style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(56px, 12vw, 140px)', borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: WEBTOON_SHADOW }}
    >
      <style>{`
        /* 이미지에 집중(2026-10-01) — 웹툰은 본문 칼럼 폭을 벗어나 화면 가운데에서 넓게 보여 준다(최대 920px). */
        .lm.wcut { max-width: none; width: min(calc(100vw - 32px), 920px); margin-left: 50%; transform: translateX(-50%); }
        .wcut figure { transition: opacity .5s ease, transform .5s ease; }
        .wcut figure[data-pre] { opacity: 0; transform: translateY(14px); }
      `}</style>
      {cuts.map((cut, ci) => (
        <figure key={ci} data-cut-index={ci + 1} style={{ margin: 0 }}>
          {/* 컷 비율이 컷마다 다를 수 있다(웹툰식 말풍선 여백이 붙은 컷은 3:2보다 세로로 길다, 2026-10-02) —
              비율을 고정하지 않고 이미지 자신의 비율로 높이를 정한다. width/height 속성은 로딩 전 자리(3:2)를 잡는 용도. */}
          <div style={{ position: 'relative', width: '100%', background: '#fff' }}>
            <Image
              src={cut.url}
              alt={cut.caption || `${ci + 1}번째 컷`}
              width={1824}
              height={1752}
              sizes="(min-width: 952px) 920px, calc(100vw - 32px)"
              quality={85}
              // 앞 두 컷만 일찍·우선(보이는 중이면 high, 숨겨진 탭이면 한가할 때 low로 미리), 나머지는 low로 뒤에서 받는다.
              loading={ci < 2 && warm ? 'eager' : 'lazy'}
              fetchPriority={ci < 2 ? (visibleNow ? 'high' : 'low') : 'low'}
              style={{ display: 'block', width: '100%', height: 'auto' }}
            />
          </div>
          {/* 흰 여백에 나레이션 글자(2026-10-04, 사용자 선택 B — 검정 띠를 없애고 컷 아래 여백에 글씨로). 띠가 이미지에 박힌 옛 컷은 이 줄이 없다. */}
          {cut.text_caption && cut.caption ? (
            <figcaption
              style={{
                margin: '0 auto',
                padding: 'clamp(22px, 4.5vw, 40px) clamp(20px, 6vw, 72px) 0',
                maxWidth: 780,
                textAlign: 'center',
                color: '#111827',
                fontSize: 'clamp(18px, 2.4vw, 25px)',
                fontWeight: 700,
                lineHeight: 1.6,
                letterSpacing: '-0.01em',
                wordBreak: 'keep-all',
              }}
            >
              {highlightNumbers(cut.caption)}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
