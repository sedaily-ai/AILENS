'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/cmsPostsApi';

// 연재 웹툰 파일럿(2026-08-06) — 이슈를 텍스트 레터가 아니라 컷(이미지+캡션)
// 나열로 보여준다. 그림은 admin에서 GPT 등으로 미리 만들어 올린다.
//
// initialItems는 서버(빌드타임)에서 이미 fetchWebtoons()로 가져온 값 —
// 목록 페이지의 정적 HTML이 빈 스켈레톤만 굽던 문제를 막는다(2026-08-07,
// letters/webtoon 상세 SSG 감사 중 발견 — 홈/목록 페이지 전수 조사).
//
// 디자인 리뉴얼 1~3차(2026-08-11) — 밝은 배경 위 두꺼운 테두리·하드 섀도로
// 시작해서 히어로+지난화 카드 그리드+페이지네이션 구조까지 다듬었다.
//
// 디자인 리뉴얼 4차(2026-08-11, 전면 재설계) — 네이버웹툰(세로 포스터
// 그리드)·독립 스튜디오 포트폴리오(어두운 시네마틱 톤) 두 레퍼런스를 보고
// "웹툰 탭에 들어오면 진짜 만화방에 온 것 같았으면" 이라는 요청. 레퍼런스를
// 그대로 베끼는 대신 우리 표지 이미지(가로 장면 + 하단 캡션 박스, 세로
// 포스터용 키아트 아님)에 맞는 우리만의 "만화방" 톤을 짰다 — 거의 검정에
// 가까운 배경, 네온처럼 은은하게 빛나는 강조색 테두리, 표지가 조명 받은
// 액자처럼 걸려있는 느낌, 은은한 인쇄 망점(halftone) 질감.
//
// "탭도 아예 다른 공간처럼, /games 누르면 분위기 전환되잖아요" 요청으로
// /games(GamesClient.tsx)와 같은 기법을 그대로 가져왔다 — 공용 Header를
// 아예 빼고 좌상단 EXIT 필로 대체, 입장 시 짧은 암전 인트로, 그 아래
// 밝은 SiteFooter가 안 새게 ConditionalFooter.tsx에 경로 추가.
const ACCENTS = ['#fde047', '#5eead4', '#fb7185', '#c4b5fd'];
const PAGE_SIZE = 12;

const BG = '#0b0b0d';
const SURFACE = '#18181b';

export function WebtoonListClient({ initialItems }: { initialItems: CmsWebtoon[] }) {
  const [items, setItems] = useState<CmsWebtoon[]>(initialItems);
  // 지난 화 페이지네이션(1, 2, 3…) — fetchWebtoons()가 이미 전체를 한 번에
  // 받아오므로(백엔드가 커서 페이지네이션을 안 지원 — cmsPostsApi.ts 주석
  // 참조) 추가 네트워크 요청 없이 화면에 보여주는 페이지만 자른다.
  const [page, setPage] = useState(1);
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchWebtoons().then((rows) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1100);
    return () => clearTimeout(t);
  }, []);

  const [latest, ...rest] = items;
  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRest = rest.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div
      className="min-h-screen"
      style={{
        background: BG,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
    >
      {/* 필름 그레인 — 인쇄된 만화책 종이 질감처럼, 아주 옅게(2026-08-11).
          SVG feTurbulence 노이즈를 fixed 오버레이로, opacity 낮게 얹기만. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          pointerEvents: 'none',
          opacity: 0.05,
          mixBlendMode: 'overlay',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* 좌상단 뒤로가기 — 공용 Header 대체(/games와 동일 기법). */}
      <Link
        href="/"
        aria-label="AI LENS 로 돌아가기"
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.22)',
          borderRadius: 999,
          color: '#fff',
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textDecoration: 'none',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 2px 14px rgba(0,0,0,0.4)',
          transition: 'all 0.18s',
          WebkitTapHighlightColor: 'transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0,0,0,0.68)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.36)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0,0,0,0.5)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)';
        }}
      >
        ◀ AI LENS
      </Link>

      {/* 입구 포스터 — 화면 꽉 채운 풀블리드 배너(2026-08-11, "액자처럼 작게"가
          아니라 "이렇게 크게 꽉차게"라는 피드백으로 컨테이너 밖으로 뺐다).
          미드저니로 만든 흑백 펜화 4컷, 아래쪽은 페이지 배경색으로 자연스럽게
          녹아들게 그라데이션을 얹었다. */}
      <div style={{ position: 'relative', width: '100%', height: 'clamp(280px, 46vh, 460px)', overflow: 'hidden' }}>
        <Image
          src="/webtoon/poster-daily-life.png"
          alt="AI LENS 웹툰 — 서울 사람들의 하루"
          fill
          sizes="100vw"
          priority
          style={{ objectFit: 'cover', objectPosition: 'center 35%' }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(180deg, rgba(11,11,13,0) 22%, rgba(11,11,13,0.55) 65%, ${BG} 100%)`,
          }}
        />
      </div>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '0 clamp(20px, 5vw, 32px) 100px' }}>
        <header style={{ marginTop: 44, marginBottom: 32 }}>
          <span
            className="inline-flex items-center"
            style={{
              gap: 6,
              color: '#fde047',
              border: '1px solid rgba(253,224,71,0.4)',
              background: 'rgba(253,224,71,0.08)',
              boxShadow: '0 0 18px rgba(253,224,71,0.15)',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
              padding: '4px 10px',
              borderRadius: 999,
              marginBottom: 14,
            }}
          >
            ✦ WEBTOON PILOT
          </span>
          <h1
            style={{ color: '#f4f4f5', fontSize: 'clamp(28px, 5.5vw, 38px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}
          >
            이슈를 웹툰으로
          </h1>
          <p style={{ fontSize: 14, color: '#71717a', lineHeight: 1.6 }}>
            요즘 이슈를 컷으로 이어 보여드려요.
          </p>
        </header>

        {items.length === 0 && (
          <div
            style={{
              padding: '80px 20px',
              textAlign: 'center',
              background: SURFACE,
              border: '1px dashed rgba(255,255,255,0.15)',
              borderRadius: 16,
            }}
          >
            <p style={{ fontSize: 14, color: '#71717a' }}>아직 연재된 편이 없어요. 곧 첫 편으로 찾아올게요.</p>
          </div>
        )}

        {/* 최신화 하이라이트 — 액자에 조명을 받은 포스터처럼, 텍스트는 이미지
            아래 그라데이션 위에 얹는다. */}
        {latest && (
          <Link
            href={`/webtoon/${encodeURIComponent(latest.id)}`}
            prefetch
            className="group relative block"
            style={{
              display: 'block',
              marginBottom: 44,
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid rgba(253,224,71,0.35)',
              boxShadow: '0 0 0 1px rgba(253,224,71,0.12), 0 20px 60px rgba(0,0,0,0.55)',
              textDecoration: 'none',
              background: SURFACE,
            }}
          >
            <div className="relative overflow-hidden" style={{ aspectRatio: '16 / 9', background: '#111114' }}>
              {latest.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={latest.cover_image_url}
                  alt={latest.title}
                  className="w-full h-full transition-transform duration-500 group-hover:scale-[1.04]"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full" style={{ fontSize: 13, color: '#71717a' }}>
                  준비 중
                </div>
              )}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(11,11,13,0) 35%, rgba(11,11,13,0.75) 78%, rgba(11,11,13,0.97) 100%)',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: 16,
                  left: 16,
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: '#111827',
                  background: '#fde047',
                  padding: '4px 11px',
                  borderRadius: 999,
                  boxShadow: '0 0 20px rgba(253,224,71,0.55)',
                }}
              >
                ★ 최신화 · {items.length}화
              </span>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'clamp(18px, 3.4vw, 26px)' }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6, fontWeight: 600 }}>
                  {latest.date.replaceAll('-', '.')}
                </p>
                <h2
                  style={{
                    color: '#fff',
                    fontSize: 'clamp(19px, 3.8vw, 24px)',
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                    marginBottom: 8,
                    lineHeight: 1.3,
                    textShadow: '0 2px 16px rgba(0,0,0,0.6)',
                  }}
                >
                  {latest.title}
                </h2>
                {latest.excerpt && (
                  <p style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 14, color: 'rgba(255,255,255,0.75)', maxWidth: 620 }}>
                    {latest.excerpt}
                  </p>
                )}
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fde047' }}>지금 보기 →</span>
              </div>
            </div>
          </Link>
        )}

        {/* 지난 화 — 어두운 진열장 위 카드들, 강조색 테두리가 은은하게 빛난다. */}
        {rest.length > 0 && (
          <>
            <p style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: '#52525b', marginBottom: 12 }}>
              지난 화 {rest.length}편
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 'clamp(18px, 3vw, 28px)' }}>
              {visibleRest.map((w, i) => {
                const restIndex = (currentPage - 1) * PAGE_SIZE + i;
                const epNumber = items.length - (restIndex + 1);
                const accent = ACCENTS[restIndex % ACCENTS.length];
                return (
                  <Link
                    key={w.id}
                    href={`/webtoon/${encodeURIComponent(w.id)}`}
                    prefetch
                    className="group relative"
                    style={{
                      display: 'block',
                      borderRadius: 12,
                      background: SURFACE,
                      border: `1px solid ${accent}4D`,
                      boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 0 22px ${accent}1F`,
                      overflow: 'hidden',
                      textDecoration: 'none',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-3px)';
                      e.currentTarget.style.boxShadow = `0 0 0 1px ${accent}80, 0 0 32px ${accent}40`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.03), 0 0 22px ${accent}1F`;
                    }}
                  >
                    <div className="relative overflow-hidden" style={{ aspectRatio: '4 / 3', background: '#111114' }}>
                      {w.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- 커버 하단에 캡션 박스가 박혀 있어 정사각에 가까운 크롭 시 objectPosition을 위로 둬 캡션 대신 주 피사체가 남게 한다
                        <img
                          loading="lazy"
                          src={w.cover_image_url}
                          alt={w.title}
                          className="w-full h-full transition-transform duration-300 group-hover:scale-[1.06]"
                          style={{ objectFit: 'cover', objectPosition: 'top' }}
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full" style={{ fontSize: 12, color: '#71717a' }}>
                          준비 중
                        </div>
                      )}
                      <span
                        style={{
                          position: 'absolute',
                          top: 10,
                          left: 10,
                          fontSize: 11.5,
                          fontWeight: 800,
                          color: '#111827',
                          background: accent,
                          padding: '3px 9px',
                          borderRadius: 999,
                          boxShadow: `0 0 16px ${accent}90`,
                        }}
                      >
                        {epNumber}화
                      </span>
                    </div>
                    <div style={{ padding: 'clamp(14px, 2.4vw, 18px)' }}>
                      <h3
                        style={{
                          color: '#f4f4f5',
                          fontSize: 'clamp(15px, 2vw, 18px)',
                          fontWeight: 700,
                          lineHeight: 1.35,
                          letterSpacing: '-0.01em',
                          marginBottom: 6,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {w.title}
                      </h3>
                      {w.excerpt && (
                        <p
                          style={{
                            fontSize: 12.5,
                            lineHeight: 1.55,
                            marginBottom: 8,
                            color: '#a1a1aa',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {w.excerpt}
                        </p>
                      )}
                      <p style={{ fontSize: 11.5, color: '#52525b', fontWeight: 600 }}>{w.date.replaceAll('-', '.')}</p>
                    </div>
                  </Link>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center" style={{ gap: 6, marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="이전 페이지"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: SURFACE,
                    fontSize: 13,
                    fontWeight: 700,
                    color: currentPage === 1 ? '#3f3f46' : '#e4e4e7',
                    cursor: currentPage === 1 ? 'default' : 'pointer',
                  }}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((n) => {
                  const active = n === currentPage;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: active ? '1px solid #fde047' : '1px solid rgba(255,255,255,0.12)',
                        background: active ? '#fde047' : SURFACE,
                        fontSize: 13,
                        fontWeight: 700,
                        color: active ? '#111827' : '#e4e4e7',
                        cursor: active ? 'default' : 'pointer',
                        fontVariantNumeric: 'tabular-nums',
                        boxShadow: active ? '0 0 18px rgba(253,224,71,0.5)' : 'none',
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="다음 페이지"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: SURFACE,
                    fontSize: 13,
                    fontWeight: 700,
                    color: currentPage === totalPages ? '#3f3f46' : '#e4e4e7',
                    cursor: currentPage === totalPages ? 'default' : 'pointer',
                  }}
                >
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {intro && <ComicRoomIntro />}
    </div>
  );
}

// 만화방 입장 인트로 — /games의 ArcadeIntro와 같은 기법, 톤만 만화방으로.
function ComicRoomIntro() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'comicRoomFadeOut 1.1s ease-in forwards',
        pointerEvents: 'none',
      }}
    >
      <p
        style={{
          fontSize: 'clamp(24px, 5.5vw, 40px)',
          fontWeight: 900,
          color: '#fde047',
          letterSpacing: '-0.01em',
          margin: '0 0 10px',
          textShadow: '0 0 18px rgba(253,224,71,0.65), 0 0 40px rgba(253,224,71,0.35)',
        }}
      >
        ✦ 만화방
      </p>
      <p style={{ fontSize: 12, color: '#71717a', letterSpacing: '0.2em', margin: 0 }}>AI LENS · WEBTOON</p>
      <style>{`
        @keyframes comicRoomFadeOut {
          0%, 60% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
