// Single admin API wrapper — 9 backend endpoints + auth + 401 redirect.
// All endpoints documented in /backend/admin/routes/*.py (Admin-1 + 2a + 2d + 3).

import { getToken, clearAuth } from "./auth";
import type {
  LoginResponse,
  DriversResponse,
  PromptListItem,
  PromptDetail,
  PromptLabDoc,
  PromptLabFile,
  PromptLabFileContent,
  ChatThreadSummary,
  ChatThreadDetail,
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
  WebtoonGpuStatus,
  WebtoonImageAssetUrls,
  WebtoonImageAssetKind,
  WebtoonImageAssetPresign,
  WebtoonImageAssetGalleryItem,
  WebtoonStageTranslateResult,
  WebtoonStageImageResult,
  WebtoonStageHistoryItem,
  PromptTestJob,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL;
if (!BASE) {
  // 빌드 시점이면 fail-loud — runtime fetch 가 undefined URL 로 가기 전에 잡음.
  // .env.local 에 NEXT_PUBLIC_ADMIN_API_BASE_URL 설정 필요.
  console.error("NEXT_PUBLIC_ADMIN_API_BASE_URL is not set");
}

// 프롬프트 실험 채팅(PromptChatLab.tsx) 실시간 스트리밍 전용 — HTTP API
// (BASE)와 별개의 API Gateway WebSocket API(routes/chat_ws.py 참고).
export const WS_URL = process.env.NEXT_PUBLIC_ADMIN_WS_URL;

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
  // LLMOps 테스트 실행(2026-08-19, 2026-09-11 작업+폴링으로 전환) — 저장
  // 여부와 무관하게 지금 편집 중인 content를 기사 원문과 함께 그 채널의
  // 실제 프로덕션 모델(Bedrock)에 넘긴다. 레터(Opus 5)는 실측상 API
  // Gateway 30초 벽 안에 동기 응답이 불가능해서(routes/prompts.py 참고)
  // job_id만 즉시 받고 getPromptTestJob으로 폴링한다.
  testPrompt: (category: string, name: string, content: string, article: string) =>
    request<{ job_id: string; status: string }>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/test`,
      { method: "POST", body: JSON.stringify({ content, article }) }
    ),
  getPromptTestJob: (category: string, name: string, jobId: string) =>
    request<PromptTestJob>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/test/${encodeURIComponent(jobId)}`
    ),
  // 프롬프트 실험 챗랩 우측 패널 — 설명/지침/파일 개별 CRUD(2026-09-15).
  // PromptDetail(위 getPrompt/updatePrompt, 발행된 버전 스냅샷)과는 별개
  // 저장소 — 여기는 저장 버튼을 누른 즉시 그 필드 하나만 서버에 반영된다.
  getPromptLabDoc: (category: string, name: string) =>
    request<PromptLabDoc>(
      `/admin/prompt-lab/${encodeURIComponent(category)}/${encodeURIComponent(name)}`
    ),
  updatePromptLabDescription: (category: string, name: string, text: string) =>
    request<{ updated: boolean }>(
      `/admin/prompt-lab/${encodeURIComponent(category)}/${encodeURIComponent(name)}/description`,
      { method: "PUT", body: JSON.stringify({ text }) }
    ),
  updatePromptLabInstructions: (category: string, name: string, text: string) =>
    request<{ updated: boolean }>(
      `/admin/prompt-lab/${encodeURIComponent(category)}/${encodeURIComponent(name)}/instructions`,
      { method: "PUT", body: JSON.stringify({ text }) }
    ),
  createPromptLabFile: (category: string, name: string, fileName: string, content: string) =>
    request<PromptLabFile>(
      `/admin/prompt-lab/${encodeURIComponent(category)}/${encodeURIComponent(name)}/files`,
      { method: "POST", body: JSON.stringify({ name: fileName, content }) }
    ),
  getPromptLabFile: (category: string, name: string, fileId: number) =>
    request<PromptLabFileContent>(
      `/admin/prompt-lab/${encodeURIComponent(category)}/${encodeURIComponent(name)}/files/${fileId}`
    ),
  updatePromptLabFile: (
    category: string,
    name: string,
    fileId: number,
    patch: { name?: string; content?: string }
  ) =>
    request<PromptLabFile>(
      `/admin/prompt-lab/${encodeURIComponent(category)}/${encodeURIComponent(name)}/files/${fileId}`,
      { method: "PUT", body: JSON.stringify(patch) }
    ),
  deletePromptLabFile: (category: string, name: string, fileId: number) =>
    request<{ deleted: boolean }>(
      `/admin/prompt-lab/${encodeURIComponent(category)}/${encodeURIComponent(name)}/files/${fileId}`,
      { method: "DELETE" }
    ),
  publishPromptLab: (category: string, name: string) =>
    request<{ created: boolean; new_version: number; prev_version: number }>(
      `/admin/prompt-lab/${encodeURIComponent(category)}/${encodeURIComponent(name)}/publish`,
      { method: "POST" }
    ),

  // 프롬프트 실험 챗랩 좌측 사이드바 — 대화 스레드/메시지(2026-09-15).
  createChatThread: (category: string, name: string, title = "") =>
    request<ChatThreadSummary>("/admin/chat-threads", {
      method: "POST",
      body: JSON.stringify({ category, name, title }),
    }),
  listChatThreads: (category: string, name: string) =>
    request<{ threads: ChatThreadSummary[] }>(
      `/admin/chat-threads?category=${encodeURIComponent(category)}&name=${encodeURIComponent(name)}`
    ),
  getChatThread: (threadId: number) =>
    request<ChatThreadDetail>(`/admin/chat-threads/${threadId}`),
  appendChatMessage: (threadId: number, role: "user" | "assistant", payload: Record<string, unknown>) =>
    request<{ id: number; created_at: string }>(`/admin/chat-threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ role, payload }),
    }),
  updateChatThreadTitle: (threadId: number, title: string) =>
    request<{ updated: boolean }>(`/admin/chat-threads/${threadId}`, {
      method: "PUT",
      body: JSON.stringify({ title }),
    }),
  deleteChatThread: (threadId: number) =>
    request<{ deleted: boolean }>(`/admin/chat-threads/${threadId}`, { method: "DELETE" }),

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

  // 화풍·인물 참조 이미지(2026-09-16) — presign 받아 브라우저가 S3로 직접
  // PUT(위 presignMedia와 같은 이유). 업로드는 갤러리에 쌓이고, select로
  // 골라야 실제 생성에 쓰이는 정본 키에 반영된다(2026-09-16 후속 — "여러
  // 샘플 중에서 선택" 요청으로 덮어쓰기 방식에서 갤러리 방식으로 변경).
  getWebtoonImageAssets: () =>
    request<WebtoonImageAssetUrls>("/admin/webtoon-lab/image-assets"),
  presignWebtoonImageAsset: (asset: WebtoonImageAssetKind, size: number) =>
    request<WebtoonImageAssetPresign>("/admin/webtoon-lab/image-assets/presign", {
      method: "POST",
      body: JSON.stringify({ asset, content_type: "image/png", size }),
    }),
  getWebtoonImageAssetGallery: (asset: WebtoonImageAssetKind) =>
    request<{ items: WebtoonImageAssetGalleryItem[] }>(
      `/admin/webtoon-lab/image-assets/gallery?asset=${encodeURIComponent(asset)}`
    ),
  selectWebtoonImageAsset: (asset: WebtoonImageAssetKind, key: string) =>
    request<{ selected: boolean }>("/admin/webtoon-lab/image-assets/select", {
      method: "POST",
      body: JSON.stringify({ asset, key }),
    }),

  // GPU 켜기/끄기(2026-09-14) — 프롬프트 챗랩 우측 컷 생성 패널이 WebSocket
  // (routes/chat_ws.py)으로 컷 이미지 생성을 직접 트리거하므로, HTTP 컷 생성은
  // 이 GPU 상태 조회/제어만 남는다.
  getWebtoonGpuStatus: () => request<WebtoonGpuStatus>("/admin/webtoon-lab/gpu/status"),
  startWebtoonGpu: () =>
    request<{ job_id: string; status: string }>("/admin/webtoon-lab/gpu/start", { method: "POST" }),
  stopWebtoonGpu: () =>
    request<{ stopping: boolean }>("/admin/webtoon-lab/gpu/stop", { method: "POST" }),

  // 단계별 생성(2026-09-18) — admin/backend/routes/webtoon_lab.py "단계별
  // 생성" 섹션 참고. character만 GPU(SSM) 왕복이라 job_id/폴링(기존
  // getWebtoonImageJob 재사용), 나머지는 동기 응답.
  stageTranslate: (scene: string, camera: string, cut?: number) =>
    request<WebtoonStageTranslateResult>("/admin/webtoon-lab/stage/translate", {
      method: "POST",
      body: JSON.stringify({ scene, camera, cut }),
    }),
  stageCharacter: (character: "A" | "B", prompt: string, cut?: number) =>
    request<WebtoonStageImageResult>("/admin/webtoon-lab/stage/character", {
      method: "POST",
      body: JSON.stringify({ character, prompt, cut }),
    }),
  stageBackground: (prompt: string, cut?: number) =>
    request<WebtoonStageImageResult>("/admin/webtoon-lab/stage/background", {
      method: "POST",
      body: JSON.stringify({ prompt, cut }),
    }),
  stageComposite: (backgroundKey: string, charAKey: string, charBKey: string, cut?: number) =>
    request<WebtoonStageImageResult>("/admin/webtoon-lab/stage/composite", {
      method: "POST",
      body: JSON.stringify({ background_key: backgroundKey, char_a_key: charAKey, char_b_key: charBKey, cut }),
    }),
  stageStyle: (initKey: string, prompt?: string, cut?: number) =>
    request<WebtoonStageImageResult>("/admin/webtoon-lab/stage/style", {
      method: "POST",
      body: JSON.stringify({ init_key: initKey, prompt, cut }),
    }),
  getStageHistory: (cut?: number) =>
    request<{ items: WebtoonStageHistoryItem[] }>(
      `/admin/webtoon-lab/stage/history${cut !== undefined ? `?cut=${cut}` : ""}`
    ),
};
