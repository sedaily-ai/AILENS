'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// 상단 공지 배너 — "우리도 뉴닉/캐릿처럼 상단에 돌아가는 배너 하나 있으면
// 어떨까" 요청(2026-08-06). 참고한 사례(빙글 등)는 "실제 할인/이벤트" 배너라
// 지금 AI LENS엔 안 맞아 — 대신 오늘 새로 생긴 기능(웹툰 파일럿·단어장 퀴즈)
// 발견을 돕는 공지로 채웠다. 몇 초마다 문구가 바뀌는 단일 줄 배너("깔끔하고
// 트렌디한" 쪽으로 — 캐릿처럼 옆으로 흐르는 마퀴는 클래식한 느낌이라 배제).
// 닫으면 localStorage에 기억해 다음 방문엔 안 보인다. 버전을 올리면(v2, v3…)
// 새 공지를 다시 보여줄 수 있다.
const DISMISS_KEY = 'ailens_announce_dismissed_v1';
const ROTATE_MS = 3800;

interface Announcement {
  emoji: string;
  text: string;
  href: string;
}

const ANNOUNCEMENTS: Announcement[] = [
  { emoji: '📖', text: '용어 해설 퀴즈가 새로 생겼어요, 오늘의 문제 풀어보기', href: '/words' },
  { emoji: '🗞️', text: '나는 신문을 이렇게 읽어요 — 독자들의 스타일 구경하기', href: '/style' },
  { emoji: '✉️', text: '매일 아침, 놓치기 아까운 이슈 모아보기', href: '/lens' },
];

export function AnnouncementBar() {
  const pathname = usePathname() ?? '';
  const [dismissed, setDismissed] = useState(true); // 기본 숨김 — localStorage 확인 전 깜빡임 방지
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) !== '1') {
      // localStorage는 SSR에서 못 읽는다 — 기본값 true(숨김)로 그리고
      // 마운트 후 effect에서 실제로 보여줄지 정하는 게 의도된 동작
      // (깜빡임 방지, 2026-08-23 set-state-in-effect 확인).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % ANNOUNCEMENTS.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [dismissed]);

  // /start(온보딩)는 완전 몰입형 단일 목적 플로우 — 다른 페이지로 새는
  // 링크(웹툰/단어장/스타일/아카이브)를 보여주면 흐름이 끊기고, 이 배너의
  // 높이만큼 문서가 뷰포트를 넘겨 스크롤이 생긴다(2026-09-03, 사용자
  // 요청 — "스크롤 안하도록 하고 싶은데 깔끔하게"). ConditionalFooter.tsx의
  // /start 처리와 같은 이유.
  if (pathname === '/start' || pathname.startsWith('/start/')) return null;
  if (dismissed) return null;

  const current = ANNOUNCEMENTS[index];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: '#111827',
        color: '#fff',
        padding: '9px 44px 9px 16px',
        fontSize: 13,
        fontWeight: 600,
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes annFade {
          0% { opacity: 0; transform: translateY(3px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .ann-msg { animation: annFade 0.35s ease both; }
      `}</style>

      <a
        key={index}
        href={current.href}
        className="ann-msg flex items-center hover:opacity-85"
        style={{ gap: 8, color: '#fff', textDecoration: 'none', minWidth: 0 }}
      >
        <span aria-hidden>{current.emoji}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current.text}</span>
        <span aria-hidden style={{ opacity: 0.7 }}>
          ›
        </span>
      </a>

      <button
        type="button"
        aria-label="공지 닫기"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1');
          setDismissed(true);
        }}
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 0,
          color: '#9ca3af',
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 4,
        }}
      >
        ✕
      </button>
    </div>
  );
}
