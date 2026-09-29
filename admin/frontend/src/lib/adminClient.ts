// Single admin API wrapper — 9 backend endpoints + auth + 401 redirect.
// All endpoints documented in /backend/admin/routes/*.py (Admin-1 + 2a + 2d + 3).

import { getToken, clearAuth } from "./auth";
import type {
  LoginResponse,
  DriversResponse,
  PromptListItem,
  PromptDetail,
  PromptHistoryEntry,
  PromptLabDoc,
  PromptLabFile,
  PromptLabFileContent,
  PromptVersionDetail,
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
  WebtoonLabDefaults,
  PromptTestJob,
  SelectionRunsDayResponse,
  SelectionArticle,
  SelectionVerdict,
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
  // 2026-09-21 — 버전 드롭다운 채우기 전용, content 없이 버전·시각만(가벼움).
  // getPrompt()(active_content까지 통째로, 웹툰 카테고리 10만자+)를 드롭다운
  // 채우려고 부르면 낭비라 별도로 뺐다.
  getPromptHistory: (category: string, name: string) =>
    request<{ history: PromptHistoryEntry[] }>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/history`
    ),
  // 2026-09-24 — 채팅랩 헤더 배지("Claude Opus 5" 등)용. 프론트에 모델명을
  // 하드코딩하지 않고 백엔드 _CATEGORY_BEDROCK["model_label"]을 그대로
  // 찍는다 — 프로덕션 모델이 바뀌면 그 한 줄만 고치면 프론트 재배포 없이
  // 다음 새로고침부터 반영된다(사용자 요청: "지금은 하드코딩된거라 바뀌면
  // 또 바꿔야 하잖아요").
  // 2026-09-24, 두 번째 개편 — "프롬프트 실험 페이지도 캐싱이나 등등..
  // 최적화" 요청. PromptLab이 탭을 계속 마운트한 채로 유지하도록 바뀌면서
  // (PromptLabProvider.tsx), 랩을 닫았다 다시 열 때마다 이 값을 다시
  // 조회하고 있었다(useCurrentModel.ts의 effect가 `enabled`=dialog open
  // 여부에 걸려 있어서) — 거의 안 바뀌는 값인데 재조회가 잦았다. 기존
  // cachedGet(대시보드 getDrivers/getCost용으로 이미 있던 유틸)을 그대로
  // 재사용 — 새 캐싱 메커니즘을 또 만들지 않는다.
  getCurrentModel: (category: string) =>
    cachedGet(`current-model|${category}`, () =>
      request<{ category: string; label: string }>(
        `/admin/prompts/${encodeURIComponent(category)}/current-model`
      )
    ),
  // 2026-09-24, 사용자 요청 — "음성도 모델들 보여지면 좋겠는데... 일레븐랩스...
  // 선택할 수 있도록요": 팟캐스트 탭 우측 "음성 생성" 패널 전용, 실험용
  // ElevenLabs 성우/모델 목록. pipelines/common/elevenlabs_tts.py가 정본.
  // voice_settings_defaults/ranges(2026-09-24 추가, 사용자 요청: "일래븐
  // 랩스쪽은... 파라미터들? 피치나 속도나... 조정하도록... 포함
  // 시켜야 합니다") — pitch는 실존하지 않는 파라미터라 뺐다(직접
  // GET /v1/voices/{id}/settings로 확인, elevenlabs_tts.py 참고).
  // 2026-09-24, 두 번째 개편 — 위 getCurrentModel과 같은 이유. 이 값을
  // 부르는 곳이 4군데(VoicePreviewGenerator/PodcastVoiceSettingsPanel/
  // VideoCardGenerator/VideoRenderSettingsPanel)인데, 탭이 계속 마운트된
  // 채로 유지되니 팟캐스트·영상 탭을 둘 다 열기만 해도 같은 데이터를
  // 최소 2번, ElevenLabs를 카드에서도 고르면 최대 4번까지 반복 요청하고
  // 있었다 — 코드에 박힌 고정 목록이라 세션 중엔 사실상 안 바뀌는데도.
  getElevenLabsOptions: () =>
    cachedGet("elevenlabs-options", () =>
      request<{
        voices: { id: string; label: string; gender: string; sample_url: string }[];
        models: { id: string; label: string; supports_style: boolean; supports_speaker_boost: boolean }[];
        voice_settings_defaults: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean; speed: number };
        voice_settings_ranges: { stability: [number, number]; similarity_boost: [number, number]; style: [number, number]; speed: [number, number] };
      }>("/admin/elevenlabs/options")
    ),
  // 2026-09-21, 사용자 요청 — "버전을 드롭다운 해서... 그걸로 적용해서
  // 출력... AB 테스트 느낌": 과거 버전 하나의 content만 조회. PromptChatLab의
  // 버전 드롭다운이 쓴다 — 지금 초안/발행본은 안 건드리고 일회성으로만 씀.
  // 2026-09-26 — sections도 같이 온다(프롬프트 실험 챗랩이 발행한 버전만,
  // types.ts::PromptLabSections 참고). 테스트 카드마다 "생성 프롬프트 —
  // 사용된 버전" 토글이 같은 버전을 반복 조회할 수 있어(여러 카드가 같은
  // 버전으로 테스트) cachedGet으로 감쌌다 — 발행된 버전은 불변이라 60초
  // TTL 캐시 히트가 항상 최신값과 같다.
  getPromptVersion: (category: string, name: string, version: number) =>
    cachedGet(`prompt-version|${category}|${name}|${version}`, () =>
      request<PromptVersionDetail>(
        `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/versions/${version}`
      )
    ),
  // sections 는 optional — 평문 편집기(/prompts/edit)는 안 보내고, 섹션
  // 편집기(PromptDrawer)만 보낸다. 백엔드는 content 를 그대로 Bedrock 에
  // 넘기므로 content 에는 항상 산문만, 구조는 sections 로 따로 간다.
  // 2026-09-26 — activate 추가(기본 true, 기존 호출부 전부 그대로 즉시
  // 활성화). false로 부르면 새 버전은 남기되 프로덕션 활성값은 안
  // 바뀐다 — 테스트 카드의 "버전 저장"(PromptVersionReference.tsx)이
  // 쓴다. 프로덕션 승격은 activatePromptVersion()이 따로 맡는다.
  updatePrompt: (
    category: string,
    name: string,
    content: string,
    sections?: unknown,
    activate = true
  ) =>
    request<{ ok: boolean; new_version: number; created?: boolean }>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
      {
        method: "POST",
        body: JSON.stringify(sections === undefined ? { content, activate } : { content, sections, activate }),
      }
    ),
  // 2026-09-26 신설 — 이미 있는 버전(테스트 카드가 activate=false로
  // 저장해둔 것 포함)을 프로덕션 활성값으로 승격한다. 새 버전은 안 만듦.
  activatePromptVersion: (category: string, name: string, version: number) =>
    request<{ activated: boolean; version: number }>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/activate`,
      { method: "POST", body: JSON.stringify({ version }) }
    ),
  // 2026-09-26 신설, 사용자 요청 — "버전을 삭제하는 방법도 있어야 할 것
  // 같고". 지금 프로덕션에서 쓰이는(활성) 버전을 삭제하려 하면 400과 함께
  // 사람이 읽을 에러 메시지가 온다(AdminApiError.message로 그대로 잡힘).
  deletePromptVersion: (category: string, name: string, version: number) =>
    request<{ deleted: boolean }>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/versions/${version}`,
      { method: "DELETE" }
    ),
  // 2026-09-26 신설, 사용자 지적 — "버전이름도 수정가능하게 해야합니다":
  // "버전 저장"은 항상 새 버전(번호 증가)을 만드는 동작이라 이미 저장된
  // 버전의 이름만 고치기엔 안 맞는다(새 번호가 매겨져 버림) — 번호·내용은
  // 그대로 두고 그 버전의 이름표만 갈아끼우는 전용 엔드포인트.
  renamePromptVersion: (category: string, name: string, version: number, label: string) =>
    request<{ renamed: boolean; version: number; label: string | null }>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/versions/${version}/label`,
      { method: "PATCH", body: JSON.stringify({ label }) }
    ),
  // 2026-09-26 신설, 사용자 요청 — "프로덕션에 적용한 이력들도 남아야
  // 해요, 몇시 몇분... 날짜에 했는지": 검토 모달에서 "최근 적용 이력"으로
  // 보여준다 — audit_logs에 이미 남고 있던 prompt-activate 기록을 그대로
  // 거른 것뿐이라 새 저장소는 없다.
  getPromptActivationHistory: (category: string, name: string) =>
    request<{ history: { version: number | null; actor: string | null; logged_at: string | null }[] }>(
      `/admin/prompts/${encodeURIComponent(category)}/${encodeURIComponent(name)}/activation-history`
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
  /** 2026-09-26 신설 — 이모지 태그 설정/해제. tag=null은 "태그 없음"이라는
   *  유효한 요청이라(같은 이모지를 다시 누르면 해제하는 토글 UX) 항상
   *  key 자체를 body에 싣는다. */
  setChatThreadTag: (threadId: number, tag: string | null) =>
    request<{ updated: boolean }>(`/admin/chat-threads/${threadId}`, {
      method: "PUT",
      body: JSON.stringify({ tag }),
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
  // 2026-09-26 신설 — "다운로드" 버튼이 실제로 파일을 저장하지 않고 새
  // 탭에 이미지만 열던 문제(버킷 CORS가 GET을 허용 안 해서 fetch()로
  // blob을 못 읽고, <a download>도 크로스오리진이라 대부분 무시됨) 해결용.
  // presigned GET URL 자체에 다운로드 헤더를 실어 받아온다 — 그 URL로
  // 그냥 이동만 하면 브라우저가 다운로드를 강제한다(CORS 불필요).
  getMediaDownloadUrl: (url: string, filename: string) =>
    request<{ download_url: string; expires_in: number }>(
      `/admin/media/download-url?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
    ),

  // 웹툰 발행 모델 기본값(2026-09-25 — STYLE/CHARACTERS 편집·히스토리
  // 갤러리·단계별 생성 화면은 삭제, 발행 모델 선택만 남음. 나머지
  // webtoon-lab 엔드포인트(job/history/image-assets/gpu/stage)는 그
  // 화면들의 전용 호출부라 함께 정리했다).
  getWebtoonImageDefaults: () =>
    request<WebtoonLabDefaults>("/admin/webtoon-lab/defaults"),

  // 영상 랩(2026-09-23) — routes/chat_ws.py의 "render_video" WS kind가 ECS
  // RunTask만 걸고 바로 응답하므로(렌더가 수십 초~수 분 걸려 WS로 못 기다림),
  // VideoRenderGenerator.tsx가 이 라우트를 주기적으로 폴링해 실제 결과를 받는다.
  // progress(같은 날 추가, 사용자 요청 — "진행상황... 퍼센테이지로 볼 수
  // 있거나 하는 UX는 적용할 수 없는건가?? 렌더가 길어서")는 pending 상태일
  // 때만 채워진다.
  pollVideoLab: (jobId: string) =>
    request<{
      status: "pending" | "done" | "error";
      video_url?: string;
      thumb_url?: string | null;
      message?: string;
      progress?:
        | { stage: "tts"; current: number; total: number }
        | { stage: "bundling" }
        | { stage: "rendering"; percent: number; renderedFrames: number; totalFrames: number; encodedFrames: number }
        | null;
    }>(`/admin/video-lab/${encodeURIComponent(jobId)}`),

  // 선정 실험실(2026-09-28) — mustknow_auto "일반" 선정 결과를 날짜별로
  // 모아 채점. 날짜 탭은 실제 회차가 있었던 날짜만(getSelectionDates) —
  // 목업처럼 하드코딩된 날짜 목록을 쓰지 않는다(사용자 지적).
  getSelectionDates: (category = "general") =>
    request<{ dates: string[] }>(
      `/admin/selection-runs/dates?category=${encodeURIComponent(category)}`
    ),
  getSelectionDay: (date: string, category = "general") =>
    request<SelectionRunsDayResponse>(
      `/admin/selection-runs?date=${encodeURIComponent(date)}&category=${encodeURIComponent(category)}`
    ),
  scoreSelectionArticle: (
    articleId: number,
    verdict: SelectionVerdict | null,
    note: string | null
  ) =>
    request<{ article: SelectionArticle }>(
      `/admin/selection-articles/${articleId}/score`,
      { method: "PATCH", body: JSON.stringify({ verdict, note }) }
    ),
};
