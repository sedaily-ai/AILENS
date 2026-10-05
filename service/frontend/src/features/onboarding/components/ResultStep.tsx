'use client';

import Link from 'next/link';
import { lensPerspectiveAt, LENS_ACCENT } from '@/shared/constants/lensPerspectives';
import { buildResultCopy } from '../lib/resultCopy';
import { onboardingPrimaryButtonStyle } from '../lib/onboardingButton';
import { OnboardingHeader } from './OnboardingHeader';

// STEP 5 — 결과 리빌. 이 플로우의 핵심 순간(설정이 아니라 "나를 발견"하는
// 경험으로 만드는 화면) — resultCopy.ts의 공식으로 포맷×관심분야 조합을
// 전부 커버한다.
//
// 배경 그라데이션 제거(2026-09-03, "그라데이션 색상 디자인은 너무
// 촌스럽네요" 피드백) — 뷰포트 전체에 번지는 ellipse radial-gradient
// 대신, 색 신호는 카드 안(아이콘 원·태그)에만 집중시킨다. 카드 자체의
// 그림자도 처음엔 accent색을 섞은 컬러 글로우였는데("여기 아직 글로우가
// 있네요" — 카드 밖으로 은은하게 번져 보이는 것까지 지적) 중립 회색
// 그림자로 바꿨다. 사이트 나머지 페이지들도 배경은 순백이고 accent는
// 카드 안 요소 단위로만 쓴다(LensPreviewSection 등) — 이 화면만 예외였던 것.
export function ResultStep({
  formatIndex,
  interests,
  onContinue,
  onBack,
}: {
  formatIndex: number;
  interests: string[];
  onContinue: () => void;
  onBack?: () => void;
}) {
  const p = lensPerspectiveAt(formatIndex);
  const Icon = p.icon;
  const copy = buildResultCopy(formatIndex, interests);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <OnboardingHeader currentStep={5} onBack={onBack} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 26px', gap: 20, maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          당신의 유형
        </p>

        <div
          style={{
            width: '100%',
            background: '#ffffff',
            borderRadius: 20,
            padding: '32px 26px',
            boxShadow: '0 12px 28px rgba(17,24,39,0.06)',
            border: '1px solid rgba(0,0,0,0.04)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: p.tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={24} color={p.color} strokeWidth={2} />
          </div>

          <h1 style={{ margin: 0, fontFamily: '"Noto Serif KR", serif', fontSize: 22, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#0f172a' }}>
            {copy.headlineLines[0]}
            <br />
            {copy.headlineLines[1]}
          </h1>

          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: '#6b7280' }}>{copy.description}</p>

          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {copy.tags.map((tag, idx) => (
              <span
                key={tag}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: idx === 0 ? p.tint : '#eff6ff',
                  color: idx === 0 ? p.color : LENS_ACCENT,
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <button type="button" onClick={onContinue} style={onboardingPrimaryButtonStyle(p.color)}>
          이 결과 저장하기 →
        </button>
        <p style={{ margin: '-6px 0 0', fontSize: 11.5, color: '#94a3b8' }}>저장 안 해도 오늘은 계속 볼 수 있어요</p>
        {/* MBTI 코너 진입(2026-10-05) — 단순 링크라 features/mbti를 import하지 않는다(feature 간 import 금지). */}
        <Link href="/mbti" style={{ fontSize: 12, color: '#64748b', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          MBTI로도 찾아보기 →
        </Link>
      </div>

      <div style={{ height: 28 }} />
    </div>
  );
}
