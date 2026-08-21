'use client';

import { createPortal } from 'react-dom';
import { LENS_PERSPECTIVES } from '@/shared/constants/lensPerspectives';
import { LensGuideAnimation } from './LensGuideAnimation';

/**
 * "지면 특별 코너"(구 "오늘의 이슈, 4가지 시선") 첫 방문자용 가이드
 * (2026-08-21, 사용자 요청 — "처음 온 사람들이 이 4가지 시선을 어떻게
 * 봐야하고 왜 그렇게 봐야하고 각 유형은 어떤 내용을 담고있는지 알려주는
 * 용도"). 처음엔 정적 4장 카드로만 시작했는데(제작 부담이 큰 SVG 단계별
 * 애니메이션 대신 제안, 승인), 사용자가 스크린샷 보고 "실제 흐름을
 * 단계로... 동영상처럼 실제 사용자 행동하는게 흐름 넘어가는게 보이도록"
 * 재요청 — 커서가 스스로 탭→행을 클릭하고 내용이 펼쳐지는 3단계 루프
 * 애니메이션(LensGuideAnimation.tsx)을 위에 추가했다. 역할 분담: 애니메이션은
 * "어떻게 조작하는지", 아래 정적 리스트는 "각 형식에 뭐가 담기는지" —
 * 텍스트로 이미 잘 전달되던 내용까지 애니메이션에 욱여넣지 않았다.
 * VideoLightbox.tsx와 같은 관례(createPortal + fixed inset-0 —
 * FeedPage.tsx의 tab-fade-in transform이 만드는 containing-block 버그를
 * 피한다, 그 파일 상단 주석 참조).
 */
export function LensFormatGuide({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50"
      style={{ padding: 'clamp(16px, 4vw, 40px)', zIndex: 200 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '86vh',
          overflowY: 'auto',
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(17,24,39,0.28)',
        }}
      >
        <div style={{ padding: 'clamp(22px, 4vw, 32px) clamp(20px, 4vw, 32px) clamp(24px, 4vw, 32px)' }}>
          <div className="flex items-start justify-between" style={{ marginBottom: 6 }}>
            <div>
              <p
                className="text-gray-400"
                style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}
              >
                가이드
              </p>
              <h2
                className="text-gray-900"
                style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(19px, 3.6vw, 22px)', fontWeight: 700, letterSpacing: '-0.01em' }}
              >
                같은 뉴스, 네 가지 형식
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex-shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
            매일 같은 이슈 하나를 레터·웹툰·팟캐스트·영상, 네 가지 형식으로 만들어요.
          </p>

          <LensGuideAnimation />

          <div className="space-y-3">
            {LENS_PERSPECTIVES.map((p) => (
              <div
                key={p.short}
                className="flex items-start"
                style={{
                  gap: 14,
                  padding: '14px 16px',
                  borderRadius: 14,
                  background: p.tint,
                }}
              >
                <span
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 44, height: 44, borderRadius: '50%', background: '#fff', overflow: 'hidden' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- public 정적 라인아트, LensViewClient.tsx와 동일 패턴 */}
                  <img
                    src={p.illustration}
                    alt=""
                    width={44}
                    height={44}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', mixBlendMode: 'multiply' }}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline" style={{ gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: p.color, letterSpacing: '0.02em' }}>{p.ordinal}</span>
                    <span className="text-gray-900" style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>
                      {p.short}
                    </span>
                    <span style={{ fontSize: 12, color: p.color, fontWeight: 600, wordBreak: 'keep-all' }}>{p.tagline}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5, wordBreak: 'keep-all' }}>{p.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
