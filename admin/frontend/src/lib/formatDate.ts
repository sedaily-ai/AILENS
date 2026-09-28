/** 서버가 주는 ISO 타임스탬프(prompt_versions.created_at 등)를 한국 시간
 *  (KST, UTC+9)로 "YYYY-MM-DD HH:mm" 포맷해서 보여준다 — 2026-09-26,
 *  사용자 지적: "지금 한국 시간 기준 맞나요??" — 실제로는 아니었다.
 *
 *  이전엔 `iso.slice(0,16).replace("T"," ")`처럼 ISO 문자열 앞부분만
 *  그대로 잘라 보여줬다(PromptVersionReference.tsx/VersionSwitcher.tsx
 *  둘 다 같은 방식으로 중복 구현돼 있었음). 백엔드(RDS Postgres 세션
 *  타임존 = UTC)가 내려주는 created_at이 UTC 시각이라, 이 방식은 "UTC
 *  시각을 한국 시간인 것처럼" 그대로 보여주는 버그였다 — 실측으로 확인
 *  (사용자가 방금 막 저장한 버전의 "표시된 시각"이 실제 한국 시각보다
 *  9시간 이전으로 나옴).
 *
 *  new Date(iso)로 파싱해 브라우저 로컬 타임존으로 변환하는 방식도 안
 *  쓴다 — 이 admin 콘솔은 서울경제 팀 전용이라 "보는 사람의 브라우저
 *  타임존"이 아니라 항상 한국 시간으로 고정해서 보여주는 게 맞다(예:
 *  해외 출장 중인 팀원이 봐도 "한국 기준 몇 시에 저장됐는지"가 궁금한
 *  것이지 자기 현지 시간이 궁금한 게 아님). UTC epoch에 9시간을 더한
 *  뒤 UTC getter로 읽어내는 방식이라 뷰어의 로컬 타임존과 무관하게
 *  항상 같은 결과가 나온다.
 *
 *  offset이 없는(naive) ISO 문자열도 방어한다 — psycopg2가 세션 타임존에
 *  따라 offset 없는 문자열을 줄 수도 있어서, 이미 offset/Z가 있으면
 *  그대로 두고 없으면 UTC로 명시한다("Z"를 붙임). */
export function formatKstDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const hasOffset = /[Zz]|[+-]\d\d:\d\d$/.test(iso);
  const d = new Date(hasOffset ? iso : `${iso}Z`);
  if (isNaN(d.getTime())) return "";
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const mo = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const da = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${mi}`;
}
