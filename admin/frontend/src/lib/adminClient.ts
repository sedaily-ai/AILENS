// Single admin API wrapper — 9 backend endpoints + auth + 401 redirect.
// All endpoints documented in /backend/admin/routes/*.py (Admin-1 + 2a + 2d + 3).

import { getToken, clearAuth } from "./auth";
import type {
  LoginResponse,
  DriversResponse,
  PromptListItem,
  PromptDetail,
  CostResponse,
  AuditResponse,
  NewsletterStatsResponse,
  CmsPost,
  CmsPostInput,
  AiLetter,
  AiLetterInput,
  PresignResponse,
  Quiz,
  QuizInput,
  WebtoonLabGenerateInput,
  WebtoonLabJob,
  WebtoonLabHistoryItem,
  WebtoonLabDefaults,
  WebtoonStoryboardResult,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL;
if (!BASE) {
  // 빌드 시점이면 fail-loud — runtime fetch 가 undefined URL 로 가기 전에 잡음.
  // .env.local 에 NEXT_PUBLIC_ADMIN_API_BASE_URL 설정 필요.
  console.error("NEXT_PUBLIC_ADMIN_API_BASE_URL is not set");
}

export class AdminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AdminApiError";
  }
}

interface RequestOpts extends RequestInit {
  skipAuth?: boolean;
}

async function request<T>(path: string, options: RequestOpts = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (!options.skipAuth) {
    const token = getToken();
    if (!token) {
      // AuthGuard 가 정상이면 여기 안 옴. 안전망.
      throw new AdminApiError(401, "not authenticated");
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch (err) {
    throw new AdminApiError(0, `network error: ${(err as Error).message}`);
  }

  // 401 토큰 만료 — clearAuth + /login redirect (브라우저 환경 한정).
  if (response.status === 401 && !options.skipAuth) {
    clearAuth();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new AdminApiError(401, "session expired");
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      /* response body wasn't JSON; keep status string */
    }
    throw new AdminApiError(response.status, message);
  }

  // 204 No Content 같은 경우 body 없음.
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// 읽기 전용 GET 엔드포인트(대시보드가 매 방문마다 부르는 getDrivers/getCost/
// getAudit) 캐시 — 2026-08-07, "대시보드 스켈레톤이 매번 뜬다"는 피드백.
// 캐시가 전혀 없어 대시보드를 오갈 때마다 인증된 API 3개를 매번 새로 불러
// 스켈레톤이 반복해서 보였다. 운영 데이터라 TTL은 짧게(60초) — 값을
// 대충 최신으로 유지하면서, 사이드바 오갈 때 정도는 캐시로 즉시 렌더한다.
// sessionStorage 에도 적어 새로고침해도 즉시 뜨고 백그라운드로 갱신한다
// (public 사이트 cmsPostsApi.ts 의 동일 패턴 참고). 쓰기(mutation) 호출은
// 캐시하지 않는다 — 여긴 read-only 3개에만 적용.
const GET_CACHE_TTL_MS = 60 * 1000;
const SESSION_PREFIX = "ailens-admin-cache:";
const getCache = new Map<string, { promise: Promise<unknown>; expiresAt: number }>();

function readSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: T; expiresAt: number };
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown, expiresAt: number) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify({ value, expiresAt }));
  } catch {
    // 용량 초과 등 — 캐시는 최적화일 뿐이라 실패해도 무시.
  }
}

function cachedGet<T>(key: string, run: () => Promise<T>): Promise<T> {
  const memHit = getCache.get(key);
  if (memHit && memHit.expiresAt > Date.now()) return memHit.promise as Promise<T>;

  const expiresAt = Date.now() + GET_CACHE_TTL_MS;
  const store = (p: Promise<T>) => {
    getCache.set(key, { promise: p, expiresAt });
    p.then((v) => writeSession(key, v, expiresAt)).catch(() => getCache.delete(key));
    return p;
  };

  const sessionValue = readSession<T>(key);
  if (sessionValue !== null) {
    store(run()); // 백그라운드 갱신, 현재 호출자에게는 캐시값을 바로 준다.
    return Promise.resolve(sessionValue);
  }
  return store(run());
}

export const adminApi = {
  // Auth
  login: (password: string) =>
    request<LoginResponse>("/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
      skipAuth: true,
    }),
  changePassword: (oldPwd: string, newPwd: string) =>
    request<{ ok: boolean }>("/admin/password-change", {
      method: "POST",
      body: JSON.stringify({ old: oldPwd, new: newPwd }),
    }),

  // Drivers
  getDrivers: () => cachedGet("drivers", () => request<DriversResponse>("/admin/drivers")),
  updateRule: (
    id: string,
    body: { action: "enable" | "disable" | "set-cron"; cron_preset?: string }
  ) =>
    request<{ ok: boolean; rule: unknown }>(`/admin/drivers/${id}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  toggleFeatureFlag: (name: string, action: "enable" | "disable") =>
    request<{ flag: string; enabled: boolean; updated_at: string }>(
      `/admin/drivers/feature-flag/${encodeURIComponent(name)}`,
      { method: "POST", body: JSON.stringify({ action }) }
    ),
  updateThreshold: (name: string, value: number) =>
    request<{ threshold: string; value: number; updated_at: string }>(
      `/admin/drivers/threshold/${encodeURIComponent(name)}`,
      { method: "POST", body: JSON.stringify({ value }) }
    ),

  // Prompts
  listPrompts: () =>
    request<{ prompts: PromptListItem[] }>("/admin/prompts"),
  getPrompt: (category: string, name: string) =>
    request<PromptDetail>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}`
    ),
  // sections 는 optional — 평문 편집기(/prompts/edit)는 안 보내고, 섹션
  // 편집기(PromptDrawer)만 보낸다. 백엔드는 content 를 그대로 Bedrock 에
  // 넘기므로 content 에는 항상 산문만, 구조는 sections 로 따로 간다.
  updatePrompt: (
    category: string,
    name: string,
    content: string,
    sections?: unknown
  ) =>
    request<{ ok: boolean; new_version: number; created?: boolean }>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
      {
        method: "POST",
        body: JSON.stringify(sections === undefined ? { content } : { content, sections }),
      }
    ),
  // LLMOps 테스트 실행(2026-08-19) — 저장 여부와 무관하게 지금 편집 중인
  // content를 기사 원문과 함께 GPT에 넘겨 실제 산출물을 받는다.
  testPrompt: (category: string, name: string, content: string, article: string) =>
    request<{ output: string }>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/test`,
      { method: "POST", body: JSON.stringify({ content, article }) }
    ),
  // 웹툰 스토리보드 테스트(2026-09-11) — 1·2단계를 체인 호출해 8컷을 한 번에
  // 받는다(routes/prompts.py::handle_storyboard_test 참고).
  storyboardTest: (category: string, name: string, content: string, article: string) =>
    request<WebtoonStoryboardResult>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/storyboard-test`,
      { method: "POST", body: JSON.stringify({ content, article }) }
    ),

  // Cost & Audit
  getCost: () => cachedGet("cost", () => request<CostResponse>("/admin/cost")),
  getAudit: (limit = 50) =>
    cachedGet(`audit|${limit}`, () => request<AuditResponse>(`/admin/audit?limit=${limit}`)),

  // Newsletter
  getNewsletterStats: (days = 7) =>
    request<NewsletterStatsResponse>(`/admin/newsletter/stats?days=${days}`),

  // CMS posts
  listPosts: (params?: { status?: string; channel?: string; limit?: number; date?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.channel) qs.set("channel", params.channel);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.date) qs.set("date", params.date);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ posts: CmsPost[]; count: number }>(`/admin/posts${suffix}`);
  },
  // channel — 2026-09-11, 웹툰/영상/홈플레이어 편집 화면이 자기 채널을
  // 실어 보내면 lens 번들 글(is_lens_bundle)의 body_inline을 그 포맷에
  // 맞는 평평한 모양(images/video_url/media_url 등)으로 받는다.
  getPost: (id: string, channel?: string) =>
    request<{ post: CmsPost }>(
      `/admin/posts/${encodeURIComponent(id)}${channel ? `?channel=${encodeURIComponent(channel)}` : ""}`
    ),
  createPost: (input: CmsPostInput) =>
    request<{ post: CmsPost }>("/admin/posts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  // channel — getPost()와 같은 이유(2026-09-11): 웹툰/영상/홈플레이어
  // 편집기가 자기 채널을 실어 보내면 lens 번들의 그 포맷 슬라이스만
  // 스코프해서 저장한다(안 실으면 lens 번들 저장이 안전장치로 막힌다).
  updatePost: (id: string, input: CmsPostInput, channel?: string) =>
    request<{ post: CmsPost }>(
      `/admin/posts/${encodeURIComponent(id)}${channel ? `?channel=${encodeURIComponent(channel)}` : ""}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      }
    ),
  publishPost: (id: string) =>
    request<{ post: CmsPost }>(`/admin/posts/${encodeURIComponent(id)}/publish`, {
      method: "POST",
    }),
  unpublishPost: (id: string) =>
    request<{ post: CmsPost }>(`/admin/posts/${encodeURIComponent(id)}/unpublish`, {
      method: "POST",
    }),
  deletePost: (id: string) =>
    request<{ ok: boolean }>(`/admin/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // 용어 퀴즈 — posts.* 와 같은 모양(list/get/create/update/publish/unpublish/delete).
  listQuiz: (params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ quiz: Quiz[]; count: number }>(`/admin/quiz${suffix}`);
  },
  getQuiz: (id: string) =>
    request<{ quiz: Quiz }>(`/admin/quiz/${encodeURIComponent(id)}`),
  createQuiz: (input: QuizInput) =>
    request<{ quiz: Quiz }>("/admin/quiz", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateQuiz: (id: string, input: QuizInput) =>
    request<{ quiz: Quiz }>(`/admin/quiz/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  publishQuiz: (id: string) =>
    request<{ quiz: Quiz }>(`/admin/quiz/${encodeURIComponent(id)}/publish`, {
      method: "POST",
    }),
  unpublishQuiz: (id: string) =>
    request<{ quiz: Quiz }>(`/admin/quiz/${encodeURIComponent(id)}/unpublish`, {
      method: "POST",
    }),
  deleteQuiz: (id: string) =>
    request<{ ok: boolean }>(`/admin/quiz/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // AI letters — 생성은 없다. 파이프라인 산출물을 사후 편집·내림만 한다.
  listLetters: (date: string) =>
    request<{ letters: AiLetter[] }>(
      `/admin/letters?date=${encodeURIComponent(date)}`
    ),
  getLetter: (id: string) =>
    request<{ letter: AiLetter }>(`/admin/letters/${encodeURIComponent(id)}`),
  updateLetter: (id: string, input: AiLetterInput) =>
    request<{ letter: AiLetter }>(`/admin/letters/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteLetter: (id: string) =>
    request<{ ok: boolean }>(`/admin/letters/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  // Media — presign 만 받고, 실제 업로드는 브라우저가 S3 로 직접 PUT 한다.
  presignMedia: (filename: string, contentType: string, size: number) =>
    request<PresignResponse>("/admin/media/presign", {
      method: "POST",
      body: JSON.stringify({ filename, content_type: contentType, size }),
    }),

  // 웹툰 이미지 실험(2026-09-05) — job 생성 후 폴링(routes/webtoon_lab.py 참고,
  // API Gateway 30초 타임아웃 때문에 동기 응답이 없다).
  generateWebtoonImage: (input: WebtoonLabGenerateInput) =>
    request<{ job_id: string; status: string }>("/admin/webtoon-lab/generate", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getWebtoonImageJob: (jobId: string) =>
    request<WebtoonLabJob>(`/admin/webtoon-lab/${encodeURIComponent(jobId)}`),
  getWebtoonImageHistory: () =>
    request<{ items: WebtoonLabHistoryItem[] }>("/admin/webtoon-lab/history"),
  getWebtoonImageDefaults: () =>
    request<WebtoonLabDefaults>("/admin/webtoon-lab/defaults"),
};
