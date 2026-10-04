// 비로그인 시 상단 CTA 배너 — 메인 페이지 톤(white bg + gray-200 border +
// blue primary CTA). ArchiveTab.tsx(893줄)가 너무 길어서 다른 독립
// 서브컴포넌트들과 함께 분리했다(2026-08-18).
import Link from 'next/link';

export function ArchiveLoginCta() {
  return (
    <div className="max-w-[640px] mx-auto px-5 pt-6">
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-7 sm:px-8 sm:py-8">
        <p className="text-[10.5px] font-bold tracking-[0.22em] text-blue-600 uppercase">
          My Drawer
        </p>
        <h3
          className="mt-2 text-[20px] sm:text-[22px] font-bold text-gray-900 tracking-tight leading-snug"
          style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}
        >
          관심 있는 문장을
          <br />
          레터를 읽다가 서랍에 담아두세요
        </h3>
        <p className="mt-3 text-[13.5px] text-gray-500 leading-relaxed">
          담아둔 문장과 결이 닿는 뉴스 기사를 추천해드려요.
          <br />
          기기를 바꿔도 같은 서랍이 따라옵니다.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center justify-center px-5 py-2.5 text-[13.5px] font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          로그인 / 가입하기
          <span aria-hidden className="ml-1.5">→</span>
        </Link>
        <p className="mt-5 text-[11.5px] text-gray-400 leading-relaxed">
          비로그인 상태에선 페이지 구조만 미리 보여드려요 · 문장 저장은 로그인 후
        </p>
      </div>
    </div>
  );
}
