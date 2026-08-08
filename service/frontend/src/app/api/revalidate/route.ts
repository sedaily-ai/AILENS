import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';

// admin이 글을 발행/수정/삭제하면 이 webhook을 호출한다(2026-08-08). 채널별로
// 정밀하게 무효화하지 않고, 콘텐츠 fetch가 쓸 수 있는 태그 4개를 전부 깬다 —
// 이 규모에서 과다 무효화 비용은 무시할 수준이고, "어느 채널이 바뀐 건지 admin
// 쪽에서 정확히 실어보내야 한다"는 결합도를 없애는 게 더 안전하다고 판단
// (cmsPostsApi.ts의 CmsChannel과 1:1 — today_letters는 today-letters API가
// 영구 죽은 경로라 제외, service/frontend/CLAUDE.md 무관 — CLAUDE.md 참조).
//
// SSE 실시간 push(broadcast)는 2026-08-09 제거 — "이미 열려있는 탭에 서버가
// 능동적으로 push"하는 요구가 실제로는 없었고(요청-응답 기반 최신성으로 충분),
// revalidateTag() + 짧은 TTL(5초, cmsPostsApi.ts 참조) 조합만으로 재검증
// 목표를 충족한다고 판단했다. 이 라우트는 여전히 admin webhook의 대상이다 —
// revalidateTag() 무효화 자체는 그대로 필요.
const TAGS = ['posts:letters', 'posts:webtoon', 'posts:trend_card', 'posts:video'] as const;

function isAuthorized(request: Request): boolean {
  const provided = request.headers.get('x-revalidate-secret') ?? '';
  const expected = process.env.REVALIDATE_SECRET ?? '';
  if (!expected) return false; // 시크릿 미설정이면 항상 거부(fail-closed).
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  for (const tag of TAGS) {
    // Next 16부터 revalidateTag 는 2번째 인자(cache-life profile)가 필수다.
    // 'max' — Next의 deprecation 안내 메시지가 "이전 단일 인자 호출과 동일한
    // 동작"의 대체값으로 명시한 값(즉시·완전 무효화).
    revalidateTag(tag, 'max');
  }

  return Response.json({ ok: true, tags: TAGS });
}
