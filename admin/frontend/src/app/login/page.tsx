"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, AdminApiError } from "@/lib/adminClient";
import { saveAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

/* AI LENS 마크 — service/frontend/public/ai-lens-mark.svg 그대로 인라인.
   112×112, 조각 4개(파랑/빨강/amber/초록)가 십자 갭을 두고 사분원으로
   맞물리는 지오메트리(docs/design-system/notes/2026-08-25-ai-lens-splash-
   handoff.md §2) — 각 path 좌표는 원본 파일 값을 그대로 옮긴 것이라 임의로
   고치지 않는다. */
function AiLensMark({
  size = 56,
  className,
  animate = false,
}: {
  size?: number;
  className?: string;
  animate?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 112 112"
      role="img"
      aria-label="AI LENS"
      className={[animate ? "ails-animate" : "", className].filter(Boolean).join(" ")}
    >
      <path d="M0 54A54 54 0 0 1 54 0L54 54Z" fill="#4285f4" />
      <path d="M58 0A54 54 0 0 1 112 54L58 54Z" fill="#ea4335" />
      <path d="M112 58A54 54 0 0 1 58 112L58 58Z" fill="#f5a623" />
      <path d="M54 112A54 54 0 0 1 0 58L54 58Z" fill="#4fb27b" />
    </svg>
  );
}

/* 로그인 화면 리디자인 4차(2026-09-27, "직접 감각적으로... 전문 예술가라고
   생각을하고" — novadb 이식/스플래시 색만 입히기를 넘어 전면 재구성 허락):

   지금까지 3차 내내 "흰 카드 + 로고 배지 + 폼"이라는 SaaS 로그인 템플릿
   골격은 그대로 둔 채 장식만 바꿔왔다 — 그게 "짜깁기한 느낌"의 진짜
   원인이었다고 보고, 이번엔 골격 자체를 바꿨다: **신문사 마스트헤드**
   컨셉. 서울경제신문 제품이라는 이 서비스의 정체성 자체에서 가져온
   구조라 "어느 서비스에 붙여도 되는" 템플릿이 아니다.

   - 카드(흰 배경+shadow-md로 뜬 사각형) 자체를 없앴다. 신문 지면이 박스로
     구획을 나누지 않고 룰선(가로줄)과 여백만으로 위계를 만드는 것처럼,
     이 페이지도 배경(--surface-sunken, 은은한 종이 톤)에 룰선 3개(얇은
     상단 룰 → 마크+워드마크 → 굵은 룰+얇은 룰의 2단 룰 = 신문 제호 밑
     전통적 장식 → 날짜줄)로 구조를 만든다. 입력창은 자기 테두리(ui-input)
     만으로 충분히 경계가 있어 카드가 필요 없었다.
   - 날짜줄 — "2026년 9월 27일 일요일" 같은 실제 오늘 날짜 + "서울경제신문"
     바이라인을 신문 데이트라인처럼 양끝 배치했다. 이 서비스가 신문사
     것이라는 사실에서만 나올 수 있는 디테일이라 일부러 넣었다 — 정적
     export라 빌드 시점 날짜가 그대로 굳는 문제가 있어(S3/CloudFront가
     리빌드 전까진 같은 HTML을 계속 서빙) 마운트 후에만 계산해 채운다
     (admin/frontend/CLAUDE.md의 "mount-detection" 예외 패턴과 동일 — 서버/
     첫 클라이언트 렌더는 둘 다 빈 문자열이라 하이드레이션 불일치 없음).
   - "Backoffice"는 워드마크 폰트(font-brand, 900 전용)를 공유하는 대신
     신문 섹션 라벨처럼 별도 트래킹된 대문자 라벨로 뺐다 — 3차까지 쓰던
     "900 전용 폰트에 font-normal 줘서 시스템 폰트로 폴백시키는" 트릭이
     없어도 되게 구조 자체를 바꿨다.
   - 마크 입장 애니메이션(.ails-animate, 3차에서 넣은 "조리개가 닫히듯"
     회전)과 버튼(--accent, 앱 전체와 통일)·비밀번호 autoComplete는
     그대로 유지 — 3차 판단이 여전히 유효한 부분은 안 건드렸다. 배경
     코너 워터마크는 뺐다 — 마스트헤드 자체가 이미 시각적 무게를 갖고
     있어서 추가 장식이 오히려 산만해진다고 판단. */
export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [dateline, setDateline] = useState("");
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    // 정적 export라 빌드 시점 날짜가 HTML에 굳는다 — 마운트 후 클라이언트의
    // 실제 "오늘"로만 채운다(AuthGuard.tsx의 mount-detection 예외와 동일
    // 패턴: 서버/첫 클라이언트 렌더 둘 다 빈 문자열이라 하이드레이션
    // 불일치 없음, admin/frontend/CLAUDE.md 참고).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDateline(
      new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      })
    );
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !password) return;
    setLoading(true);
    try {
      const { token, expires_at } = await adminApi.login(password);
      saveAuth(token, expires_at);
      router.replace("/");
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.status === 423) {
          toast.show("잠금 상태 — 5분 후 재시도", "error");
        } else if (err.status === 401) {
          toast.show("비밀번호가 일치하지 않습니다", "error");
        } else {
          toast.show(`로그인 실패: ${err.message}`, "error");
        }
      } else {
        toast.show("네트워크 오류", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6 pb-24"
      style={{ background: "var(--surface-sunken)" }}
    >
      <div className="ui-enter w-full max-w-xl">
        <div style={{ height: 1, background: "var(--border-hairline)" }} />

        <div className="mt-7 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-3.5">
            <AiLensMark size={56} animate />
            <span
              className="font-brand text-6xl font-black leading-none tracking-tight"
              style={{ color: "#0b0b0b" }}
            >
              LENS
            </span>
          </div>
          <span
            className="mb-1.5 text-sm font-semibold uppercase"
            style={{ color: "#6b7380", letterSpacing: "0.22em" }}
          >
            Backoffice
          </span>
        </div>

        <p className="mt-2 text-sm" style={{ color: "#6b7380" }}>
          오늘의 콘텐츠, 바로 확인하세요
        </p>

        {/* 2단 룰 — 신문 제호 밑 전통적 장식(굵은 선 + 얇은 선)을 그대로. */}
        <div className="mt-4" style={{ height: 2, background: "#0b0b0b" }} />
        <div className="mt-[3px]" style={{ height: 1, background: "#0b0b0b" }} />

        <div
          className="mt-2.5 flex items-baseline justify-between text-[11px] font-medium tabular-nums"
          style={{ color: "#adb2ba", letterSpacing: "0.03em" }}
        >
          <span>{dateline}</span>
          <span>서울경제신문</span>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-3.5">
          <label className="block text-sm" htmlFor="admin-login-password">
            <div className="mb-1.5 font-medium" style={{ color: "var(--text-secondary)" }}>
              비밀번호
            </div>
            <input
              id="admin-login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="ui-input w-full rounded-xl px-3.5 py-2.5 text-sm"
              autoFocus
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading || !password}
            className="ui-btn ui-btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
          >
            {loading ? (
              // 흰 배경용 .ui-spinner(테두리 회색+상단만 accent)는 이 버튼
              // 배경(accent 채움)에서는 거의 안 보인다 — 흰 스피너로 대체.
              <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
              </svg>
            )}
            {loading ? "확인 중…" : "로그인"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs" style={{ color: "var(--text-faint)" }}>
          허가된 관리자만 접속할 수 있습니다
        </p>
      </div>
    </div>
  );
}
