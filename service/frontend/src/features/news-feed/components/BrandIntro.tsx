'use client';

import Link from 'next/link';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { letterHref } from '@/shared/lib/letterHref';
import { useLatestLetters } from '@/shared/lib/useLatestLetters';

/**
 * 레터 페이지 최상단(네비 바로 아래) 브랜드 인트로.
 * 구성: ① lens.png 히어로(슬로건+로고) → ② LENS 의미 → ③ 4 인지양식 2x2(클릭→레터).
 * 톤: 종이·절제, 이모지 없음.
 */

// 완성형 카드 이미지(제목·카피·버튼·캐릭터 포함) — 자르지 말고 원본 비율 그대로.
const LENS_CARDS: { id: MbtiGroupId; img: string; alt: string }[] = [
  { id: 'NT', img: '/type-nt.jpg', alt: 'NT 민철 — 팩트와 데이터 중심' },
  { id: 'NF', img: '/type-nf.jpg', alt: 'NF 하은 — 스토리와 맥락 중심' },
  { id: 'ST', img: '/type-st.jpg', alt: 'ST 준서 — 실용 정보 중심' },
  { id: 'SF', img: '/type-sf.jpg', alt: 'SF 소율 — 쉽고 재미있게' },
];

export function BrandIntro() {
  const { date } = useLatestLetters();
  // 최신 발행일의 그룹별 레터로 이동. 아직 발행 전이면 피드로.
  const hrefFor = (g: MbtiGroupId): string =>
    date ? letterHref(`${g.toLowerCase()}-${date}`) : '/?tab=feed';
  return (
    <section
      style={{
        // 우측 사이드바와 나란히 배치되는 좌측 컬럼 폭을 그대로 채움 —
        // 예전엔 760으로 캡을 씌워서 넓은 화면에서 좌우 여백이 생겼었음.
        padding: 'clamp(18px, 3vw, 34px) 0 clamp(20px, 4vw, 32px)',
      }}
    >
      {/* ① 히어로 — lens.png. 4.6:1 타이트 띠로 헤드라인만 노출(잔여 여백 최소).
          초점 47%, 로고 락업·서브슬로건 여백 제외. 모바일 300% / 데스크탑 200% 줌.
          컨테이너 폭 100% 채움 — 우측 사이드바와 나란히 배치되므로 뷰포트 기준
          bleed(94vw)를 쓰면 사이드바를 덮어버려서 컬럼 폭 기준으로 바꿈. */}
      <div
        className="aspect-[4.6/1]"
        style={{
          position: 'relative',
          width: '100%',
          overflow: 'hidden',
          marginBottom: 'clamp(2px, 0.8vw, 6px)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy"
          src="/lens.png"
          alt="AI LENS — Let's Enjoy News in your Style / 뉴스를 내 스타일로"
          className="top-[47%] w-[300%] sm:w-[200%]"
          style={{
            position: 'absolute',
            left: '50%',
            height: 'auto',
            transform: 'translate(-50%, -50%)',
            display: 'block',
          }}
        />
      </div>

      {/* ② LENS 의미 */}
      <div style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto', padding: 'clamp(4px,1vw,10px) 0 clamp(26px,4.5vw,40px)' }}>
        <p
          style={{
            fontSize: 'clamp(15px, 3.2vw, 17px)',
            lineHeight: 1.85,
            color: '#374151',
            letterSpacing: '-0.01em',
            wordBreak: 'keep-all',
          }}
        >
          {/* 의미 단위(절)별 블록 — 절 안에서만 자연 줄바꿈, 절끼리는 안 섞임 */}
          <span style={{ display: 'block', textWrap: 'balance' }}>
            같은 뉴스를 <strong style={{ fontWeight: 700, color: '#1a1a1a' }}>네 개의 렌즈</strong>로 다시 봅니다.
          </span>
          <span style={{ display: 'block', textWrap: 'balance' }}>
            팩트·스토리·실용·공감 — 읽는 사람의 인지양식에 맞춰
          </span>
          <span style={{ display: 'block', textWrap: 'balance' }}>
            네 명의 AI 에디터가 같은 사건을 각자의 결로 다시 씁니다.
          </span>
        </p>
      </div>

      {/* ③ 4 인지양식 2x2 — 완성형 카드 이미지(타이틀·카피·버튼까지 래스터에 다
          박혀있음) 원본 비율 그대로. 4열로 쪼개면 카드 폭이 줄어 이미지 안에
          박힌 작은 카피가 읽기 힘들어져서 2열 유지 — 대신 메인 컬럼이 넓어진
          만큼 카드가 무한정 커지지 않도록 섹션 자체에 최대폭만 걸어 중앙 정렬. */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-[26px] items-start mx-auto"
        style={{ marginBottom: 'clamp(8px, 3vw, 16px)', maxWidth: 880 }}
      >
        {LENS_CARDS.map((l) => (
          <Link
            key={l.id}
            href={hrefFor(l.id)}
            aria-label={`${l.alt} — 레터 보기`}
            style={{ display: 'block', borderRadius: 16 }}
            className="shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_-12px_rgba(0,0,0,0.20)]"
          >
            {/* 4장 모두 2000x1000(2:1) 원본 그대로 — objectFit/고정박스 없음 →
                크롭 원천 불가, 동일 비율이라 칸 높이 자동 일치. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy"
              src={l.img}
              alt={l.alt}
              style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16 }}
            />
          </Link>
        ))}
      </div>

    </section>
  );
}
