'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { MbtiVersion } from "@/shared/types/mbti";
import { API_URL } from "@/shared/config/api";
import { fetchCommunityPosts, votePost, addComment, createCommunityPost, fetchComments } from "@/shared/lib/communityApi";
import { fetchDailyQuestions, saveQuestionAnswer } from "@/shared/lib/questionApi";
import type { DailyQuestionItem } from "@/features/question";
import { ArticleView } from "./ArticleView";
import { SmartSearchOverlay } from "./SmartSearchOverlay";
import { useAuth } from "@/features/auth";
import { Header } from "@/widgets/Header";
import { mockArticles } from "@/shared/data/mockArticles";
import { BarChart3, BookOpen, Lightbulb, Coffee, Coins, Rocket, Globe, Sparkles, Calendar, Newspaper, Users, Camera, TrendingUp } from "lucide-react";
import { ScrollReveal } from "@/shared/ui/ScrollReveal";
import { ComingSoonNotice } from "@/shared/ui/ComingSoonNotice";

// Feature Tab Components
import { QuestionTab, dailyQuestions } from "@/features/question";
import { NewsFeedTab } from "@/features/news-feed";
import { CommunityTab } from "@/features/community";
import { ArchiveTab } from "@/features/archive";

// 프리페칭 캐시
const prefetchCache = new Map<string, Article>();
// 날짜별 기사 목록 캐시
const articleListCache = new Map<string, Article[]>();

interface Article {
  news_id: string;
  title: string;
  sub_title: string;
  published_at: string;
  category: string;
  provider: string;
  byline: string;
  image_url: string | null;
  content: string;
  original_link: string;
  versions?: Record<string, MbtiVersion>;
}

// ─── v2 → v1 shape 어댑터 (TASK-7) ─────────────────────────────────────
// v2 Feed API 응답 (items[]) 을 기존 컴포넌트들이 기대하는 v1-shape Article로
// 매핑. v1 필드명 일부가 v2에서 rename됐고, 일부 필드는 v2에 없음:
//   provider     ← v2.press
//   original_link ← v2.url
//   content      ← v2.body_preview (200자, ArticleView에서 전체 본문 fetch)
//   image_url    ← v2엔 없음 (Collector v2 미수집). null 두면 ArticleCard가
//                  ImagePlaceholder로 자동 fallback (코드 변경 0).
//   versions     ← v2엔 없음 (Article API 4-parallel fetch가 채움)
//
// sub_title은 v2에서 raw HTML <br/> 포함 가능. 카드는 첫 줄만 보이므로
// 첫 <br/> 이전까지 자름 (XSS 안전, 데모 시각 임팩트 보존).
function adaptV2FeedItem(v2: Record<string, unknown>): Article {
  const subTitleRaw = (v2.sub_title as string | null) || '';
  const subTitleClean = subTitleRaw.split(/<br\s*\/?>/i)[0] || '';
  const bodyPreview = (v2.body_preview as string | null) || '';

  return {
    news_id: v2.news_id as string,
    title: (v2.title as string) || '',
    sub_title: subTitleClean,
    published_at: (v2.published_at as string) || '',
    category: (v2.category as string) || '',
    provider: (v2.press as string) || '',
    byline: (v2.byline as string) || '',
    image_url: (v2.image_url as string) || null,
    content: bodyPreview,
    original_link: (v2.url as string) || '',
    versions: undefined,
  };
}

// v2 Article API의 version 객체를 MbtiVersion shape로 변환.
// v1의 tone 필드가 v2엔 없어서 빈 문자열로 채움. v1 frontend 컴포넌트는 tone을
// 표시 용도로만 쓰며, 빈 문자열이면 단순히 안 보임 (data-driven hide 패턴).
function adaptV2Version(v2Version: Record<string, unknown>): MbtiVersion {
  return {
    title: (v2Version.title as string) || '',
    subtitle: (v2Version.subtitle as string) || '',
    body: (v2Version.body as string) || '',
    key_points: Array.isArray(v2Version.key_points)
      ? (v2Version.key_points as string[])
      : [],
    closing_line: (v2Version.closing_line as string) || '',
    tone: '',
  };
}

interface Props {
  selectedGroup: MbtiGroupId;
  onChangeGroup: () => void;
  onSwitchToStory?: () => void;
  onMbtiChange?: (group: MbtiGroupId) => void;
}

// MBTI 페르소나 정보
const editorAvatars: Record<MbtiGroupId, { name: string; avatar: string }> = {
  NT: { name: '민철', avatar: '/editors/intj.webp' },
  NF: { name: '하은', avatar: '/editors/infp.webp' },
  ST: { name: '준서', avatar: '/editors/istj.webp' },
  SF: { name: '소율', avatar: '/editors/esfp.webp' },
};

const personaInfo: Record<MbtiGroupId, { name: string; style: string; color: string }> = {
  NT: { name: "분석가", style: "데이터와 논리로 본질을 꿰뚫어요", color: "bg-blue-500" },
  NF: { name: "이야기꾼", style: "사람과 감정의 결을 읽어내요", color: "bg-purple-500" },
  ST: { name: "실용가", style: "핵심만 쏙쏙, 바로 써먹을 수 있게", color: "bg-green-500" },
  SF: { name: "친구", style: "편하게 수다 떨듯 알려드려요", color: "bg-orange-500" },
};

// 아카이빙된 문장 타입
interface ArchivedSentence {
  id: string;
  text: string;
  articleId: string;
  articleTitle: string;
  articlePublishedAt?: string; // 기사 발행일
  createdAt: Date; // 저장일
}

function cleanMarkdown(text: string): string {
  return text.replace(/\*\*/g, '');
}

function getBodyText(body: string | string[]): string {
  const text = cleanMarkdown(Array.isArray(body) ? body.join('\n\n') : body);
  const paragraphs = text.split("\n\n").filter(p => p.trim());
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) continue;
    if (trimmed.startsWith('■')) continue;
    if (trimmed.includes('|')) continue;
    if (trimmed.startsWith('---')) continue;
    if (trimmed.length < 20) continue;
    return trimmed.slice(0, 200);
  }
  return "";
}

// 날짜 헬퍼 함수들
const formatDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

const getWeekDays = (baseDate: Date): Date[] => {
  const day = baseDate.getDay();
  const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1); // 월요일 시작
  const monday = new Date(baseDate);
  monday.setDate(diff);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
};

const isSameDay = (d1: Date, d2: Date): boolean => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

const getMonthDays = (year: number, month: number): (Date | null)[] => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = (firstDay.getDay() + 6) % 7; // 월요일 시작

  const days: (Date | null)[] = [];
  for (let i = 0; i < startPadding; i++) days.push(null);
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  return days;
};

export function FeedPage({ selectedGroup, onMbtiChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // URL에서 초기 탭 상태 읽기
  const getInitialTab = useCallback(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['question', 'feed', 'community', 'archive', 'dna'].includes(tabParam)) {
      return tabParam as "question" | "feed" | "community" | "archive" | "dna";
    }
    return "feed";
  }, [searchParams]);

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewArticle, setViewArticle] = useState<Article | null>(null);

  // 날짜 관련 상태
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // 질문 관련 상태
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [showQuestions, setShowQuestions] = useState(true);
  const [aiQuestions, setAiQuestions] = useState<DailyQuestionItem[]>([]);

  // 아카이빙 관련 상태 - 목업 데이터
  const [archivedSentences, setArchivedSentences] = useState<ArchivedSentence[]>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 86400000);
    const threeDaysAgo = new Date(today.getTime() - 3 * 86400000);

    return [
      // 오늘 저장한 문장들
      {
        id: 'mock-1',
        text: '인공지능이 인간의 창의성을 대체하는 것이 아니라, 인간의 창의성을 증폭시키는 도구로 활용될 때 가장 큰 가치를 발휘한다.',
        articleId: 'article-001',
        articleTitle: 'AI 시대, 인간 창의성의 새로운 가능성',
        articlePublishedAt: today.toISOString(),
        createdAt: new Date(today.getTime() + 10 * 3600000), // 오늘 오전 10시
      },
      {
        id: 'mock-2',
        text: '주식시장에서 가장 위험한 말은 "이번엔 다르다"이다. 역사는 반복되지 않지만, 운율은 맞춘다.',
        articleId: 'article-002',
        articleTitle: '2024년 글로벌 증시 전망과 투자 전략',
        articlePublishedAt: today.toISOString(),
        createdAt: new Date(today.getTime() + 14 * 3600000), // 오늘 오후 2시
      },
      // 어제 저장한 문장들
      {
        id: 'mock-3',
        text: '반도체 산업의 핵심은 더 이상 칩의 크기가 아니라, 에너지 효율성과 특화된 아키텍처에 있다.',
        articleId: 'article-003',
        articleTitle: '차세대 반도체 전쟁, 승자는 누구인가',
        articlePublishedAt: yesterday.toISOString(),
        createdAt: new Date(yesterday.getTime() + 9 * 3600000), // 어제 오전 9시
      },
      {
        id: 'mock-4',
        text: '스타트업의 성공은 아이디어가 아니라 실행력에서 결정된다. 좋은 아이디어는 넘쳐나지만, 끝까지 실행하는 팀은 드물다.',
        articleId: 'article-004',
        articleTitle: '유니콘 기업의 공통점: 실행력의 비밀',
        articlePublishedAt: yesterday.toISOString(),
        createdAt: new Date(yesterday.getTime() + 16 * 3600000), // 어제 오후 4시
      },
      {
        id: 'mock-5',
        text: '기후 변화 대응은 선택이 아닌 필수가 되었고, ESG는 기업의 생존 전략으로 자리잡았다.',
        articleId: 'article-005',
        articleTitle: 'ESG 경영, 지속가능한 성장의 열쇠',
        articlePublishedAt: yesterday.toISOString(),
        createdAt: new Date(yesterday.getTime() + 11 * 3600000), // 어제 오전 11시
      },
      // 2일 전
      {
        id: 'mock-6',
        text: '금리 인상 사이클의 끝이 보이기 시작했다. 이제 투자자들은 피벗 이후의 시장을 준비해야 한다.',
        articleId: 'article-006',
        articleTitle: '중앙은행의 피벗, 시장은 어떻게 반응할까',
        articlePublishedAt: twoDaysAgo.toISOString(),
        createdAt: new Date(twoDaysAgo.getTime() + 13 * 3600000),
      },
      // 3일 전
      {
        id: 'mock-7',
        text: '원격 근무가 일상이 된 시대, 기업 문화는 물리적 공간이 아닌 공유된 가치와 신뢰로 구축된다.',
        articleId: 'article-007',
        articleTitle: '하이브리드 워크 시대의 조직 문화',
        articlePublishedAt: threeDaysAgo.toISOString(),
        createdAt: new Date(threeDaysAgo.getTime() + 15 * 3600000),
      },
      {
        id: 'mock-8',
        text: '데이터는 21세기의 석유라고 불리지만, 정제되지 않은 데이터는 그저 소음에 불과하다.',
        articleId: 'article-008',
        articleTitle: '빅데이터 시대, 진짜 가치는 어디에',
        articlePublishedAt: threeDaysAgo.toISOString(),
        createdAt: new Date(threeDaysAgo.getTime() + 10 * 3600000),
      },
    ];
  });
  const [showArchive, setShowArchive] = useState(false);

  // 탭 상태 - URL에서 초기값 읽기
  const [activeTab, setActiveTabState] = useState<"question" | "feed" | "community" | "archive" | "dna">(getInitialTab);

  // 탭 변경 함수 - URL도 함께 업데이트 (replaceState로 히스토리에 안 쌓임)
  const setActiveTab = useCallback((tab: "question" | "feed" | "community" | "archive" | "dna") => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    window.history.replaceState(
      { ...window.history.state, tab },
      "",
      `${pathname}?${params.toString()}${window.location.hash}`
    );
  }, [pathname, searchParams]);
  const [dnaViewMode, setDnaViewMode] = useState<"radar" | "chart">("radar");
  const [dnaSubTab, setDnaSubTab] = useState<"analysis" | "birthday">("analysis");
  const [birthdayInput, setBirthdayInput] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("user_birthday") : null) || "");

  // 펼친 기사 상태
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

  // 내 서랍 날짜 필터
  const [archiveDate, setArchiveDate] = useState<Date>(new Date()); // 오늘부터 시작
  const [showArchiveCalendar, setShowArchiveCalendar] = useState(false);
  const [archiveCalendarMonth, setArchiveCalendarMonth] = useState<Date>(new Date());

  // 선택된 문장 상태 (아카이빙용)
  const [selectedSentence, setSelectedSentence] = useState<{
    text: string;
    articleId: string;
    articleTitle: string;
  } | null>(null);

  // 저장 완료 토스트
  const [showSaveToast, setShowSaveToast] = useState(false);

  // 토스트 표시 함수
  const showToast = () => {
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 2500);
  };

  // 텍스트 선택 상태 (플로팅 버튼용)
  const [textSelection, setTextSelection] = useState<{
    text: string;
    articleId: string;
    articleTitle: string;
    articlePublishedAt?: string;
    position: { x: number; y: number };
  } | null>(null);

  // 텍스트 선택 감지
  const handleTextSelect = (articleId: string, articleTitle: string, articlePublishedAt?: string) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 5) {
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();

      if (rect) {
        setTextSelection({
          text: selectedText,
          articleId,
          articleTitle,
          articlePublishedAt,
          position: {
            x: rect.left + rect.width / 2,
            y: rect.top - 10
          }
        });
      }
    }
  };

  // 선택 해제 감지
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.toString().trim().length === 0) {
        // 약간의 딜레이를 주어 버튼 클릭이 가능하도록
        setTimeout(() => {
          const currentSelection = window.getSelection();
          if (!currentSelection || currentSelection.toString().trim().length === 0) {
            setTextSelection(null);
          }
        }, 200);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  // 커뮤니티 관련 상태
  const [selectedPost, setSelectedPost] = useState<typeof communityPosts[0] | null>(null);
  const [showWriteModal, setShowWriteModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [selectedArchiveForPost, setSelectedArchiveForPost] = useState<ArchivedSentence | null>(null);
  const [postComment, setPostComment] = useState("");
  // 인라인 댓글 펼침 상태
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [showAllComments, setShowAllComments] = useState<Set<string>>(new Set());
  const [inlineComment, setInlineComment] = useState<{ [key: string]: string }>({});
  // 투표 상태: 'up' | 'down' | null
  const [userVotes, setUserVotes] = useState<{ [postId: string]: 'up' | 'down' | null }>({});
  // 유저 프로필 모달
  const [selectedUser, setSelectedUser] = useState<{ userName: string; userMbti: string; userAvatar: string } | null>(null);
  // 랭킹 기간 필터
  const [rankingPeriod, setRankingPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  // 오디오 플레이어 상태 — real podcast API
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [currentPlayingArticle, setCurrentPlayingArticle] = useState<{
    title: string;
    category: string;
    podcastId?: string;
  } | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [hasUnlockedAudio, setHasUnlockedAudio] = useState(false);
  const [podcastLoading, setPodcastLoading] = useState(false);
  const [podcastError, setPodcastError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const FREE_PREVIEW_SECONDS = 60;

  // Audio element event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setAudioCurrentTime(audio.currentTime);
      const dur = audio.duration || 1;
      setAudioProgress((audio.currentTime / dur) * 100);

      // Paywall: stop at 1 minute for non-subscribers
      if (!hasUnlockedAudio && audio.currentTime >= FREE_PREVIEW_SECONDS) {
        audio.pause();
        setIsPlaying(false);
        setShowPaywall(true);
      }
    };

    const onLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setAudioProgress(100);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [hasUnlockedAudio]);

  // Start audio briefing — check for existing podcast, generate if needed
  const startAudioBriefing = async () => {
    const firstArticle = articles[0];
    if (!firstArticle) return;

    setCurrentPlayingArticle({
      title: firstArticle.title,
      category: firstArticle.category,
    });
    setShowAudioPlayer(true);
    setPodcastLoading(true);
    setPodcastError(null);

    try {
      const { getArticlePodcast, generatePodcast, waitForPodcast } = await import('@/shared/lib/podcastApi');

      // 1. Check if podcast already exists
      let podcast = await getArticlePodcast(firstArticle.news_id, selectedGroup);

      if (podcast?.audio_url) {
        // Existing podcast — play immediately
        loadAndPlay(podcast.audio_url, podcast.podcast_id);
        return;
      }

      if (podcast && !podcast.audio_url) {
        // Podcast exists but no presigned URL — fetch full details
        const { getPodcast } = await import('@/shared/lib/podcastApi');
        const full = await getPodcast(podcast.podcast_id);
        if (full?.audio_url) {
          loadAndPlay(full.audio_url, full.podcast_id);
          return;
        }
      }

      // 2. No podcast — generate one
      const generated = await generatePodcast(firstArticle.news_id, selectedGroup);
      setCurrentPlayingArticle(prev => prev ? { ...prev, podcastId: generated.podcast_id } : null);

      // 3. Poll until ready
      const ready = await waitForPodcast(generated.podcast_id);
      loadAndPlay(ready.audio_url!, ready.podcast_id);

    } catch (err) {
      const msg = err instanceof Error ? err.message : '오디오 생성에 실패했습니다';
      setPodcastError(msg);
      setPodcastLoading(false);
    }
  };

  const loadAndPlay = (audioUrl: string, podcastId: string) => {
    setPodcastLoading(false);
    setCurrentPlayingArticle(prev => prev ? { ...prev, podcastId } : null);

    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const seekAudio = (progressPercent: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;

    const maxProgress = hasUnlockedAudio ? 100 : (FREE_PREVIEW_SECONDS / audio.duration) * 100;
    const clamped = Math.min(Math.max(0, progressPercent), maxProgress);
    audio.currentTime = (clamped / 100) * audio.duration;
    setAudioProgress(clamped);

    if (!hasUnlockedAudio && audio.currentTime >= FREE_PREVIEW_SECONDS) {
      audio.pause();
      setIsPlaying(false);
      setShowPaywall(true);
    }
  };

  const skipAudio = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = audio.currentTime + seconds;
    const maxTime = hasUnlockedAudio ? audio.duration : FREE_PREVIEW_SECONDS;
    audio.currentTime = Math.min(Math.max(0, newTime), maxTime);

    if (!hasUnlockedAudio && audio.currentTime >= FREE_PREVIEW_SECONDS) {
      audio.pause();
      setIsPlaying(false);
      setShowPaywall(true);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // 유저 프로필 데이터 (온도, 칭호, MBTI, 아바타)
  const userProfiles: { [key: string]: { temperature: number; title: string; titleType: 'crown' | 'star' | 'lightning' | 'heart' | 'book' | 'chart'; badges: { name: string; type: 'trophy' | 'fire' | 'chat' | 'bulb' | 'target' | 'chart' }[]; mbti: string; avatar: string } } = {
    "서연": { temperature: 48.5, title: "분석의 여왕", titleType: "crown", badges: [{ name: "추천왕", type: "trophy" }, { name: "데이터러버", type: "chart" }], mbti: "INTJ", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=analyst&backgroundColor=e8f4f8&scale=90" },
    "하은": { temperature: 52.3, title: "스토리텔러", titleType: "star", badges: [{ name: "수다쟁이", type: "chat" }, { name: "트렌드세터", type: "target" }], mbti: "ENFP", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=storyteller&backgroundColor=faf5ff&scale=90" },
    "지우": { temperature: 44.8, title: "실용주의자", titleType: "lightning", badges: [{ name: "아이디어뱅크", type: "bulb" }], mbti: "ISTP", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=practical&backgroundColor=f0fdf4&scale=90" },
    "민준": { temperature: 56.2, title: "친화력甲", titleType: "heart", badges: [{ name: "공감왕", type: "trophy" }], mbti: "ESFJ", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=friend&backgroundColor=fff7ed&scale=90" },
    "도윤": { temperature: 41.2, title: "전략가", titleType: "chart", badges: [{ name: "인사이트", type: "bulb" }], mbti: "ENTJ", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=leader&backgroundColor=fef3c7&scale=90" },
    "수아": { temperature: 49.7, title: "문장수집가", titleType: "book", badges: [{ name: "필사러", type: "chat" }], mbti: "INFJ", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=dreamer&backgroundColor=e0e7ff&scale=90" },
    "예준": { temperature: 38.5, title: "지식탐구자", titleType: "book", badges: [{ name: "논리왕", type: "trophy" }], mbti: "INTP", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=thinker&backgroundColor=f3e8ff&scale=90" },
    "시우": { temperature: 58.9, title: "액션히어로", titleType: "lightning", badges: [{ name: "속도왕", type: "fire" }], mbti: "ESTP", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=action&backgroundColor=fce7f3&scale=90" },
    "지아": { temperature: 47.3, title: "감성러버", titleType: "heart", badges: [{ name: "힐링메이커", type: "target" }], mbti: "ISFP", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=artist&backgroundColor=ccfbf1&scale=90" },
    "현우": { temperature: 43.1, title: "원칙주의자", titleType: "chart", badges: [{ name: "팩트체커", type: "target" }], mbti: "ESTJ", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=exec&backgroundColor=fee2e2&scale=90" },
    "유나": { temperature: 54.6, title: "응원단장", titleType: "star", badges: [{ name: "에너자이저", type: "fire" }], mbti: "ENFJ", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=mentor&backgroundColor=dbeafe&scale=90" },
    "준서": { temperature: 42.0, title: "신뢰의 아이콘", titleType: "heart", badges: [{ name: "약속지킴이", type: "trophy" }], mbti: "ISTJ", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=steady&backgroundColor=fef9c3&scale=90" },
    "채원": { temperature: 61.2, title: "분위기메이커", titleType: "star", badges: [{ name: "파티플래너", type: "target" }], mbti: "ESFP", avatar: "https://api.dicebear.com/7.x/notionists/svg?seed=performer&backgroundColor=d1fae5&scale=90" },
  };

  // 타이틀 아이콘 SVG
  const TitleIcon = ({ type, className = "w-4 h-4" }: { type: string; className?: string }) => {
    const icons: { [key: string]: React.ReactElement } = {
      crown: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l2.5 5 5.5.5-4 4 1 5.5-5-3-5 3 1-5.5-4-4 5.5-.5L12 3z" /></svg>,
      star: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>,
      lightning: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>,
      heart: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>,
      book: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>,
      chart: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
    };
    return icons[type] || icons.star;
  };

  // 뱃지 아이콘 SVG
  const BadgeIcon = ({ type, className = "w-3 h-3" }: { type: string; className?: string }) => {
    const icons: { [key: string]: React.ReactElement } = {
      trophy: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" /></svg>,
      fire: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" /></svg>,
      chat: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>,
      bulb: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>,
      target: <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" /></svg>,
    };
    return icons[type] || icons.trophy;
  };

  // 온도에 따른 색상
  const getTemperatureColor = (temp: number) => {
    if (temp >= 55) return "text-red-500";
    if (temp >= 45) return "text-orange-500";
    if (temp >= 35) return "text-yellow-500";
    return "text-blue-500";
  };

  const getTemperatureBarColor = (temp: number) => {
    if (temp >= 55) return "from-red-400 to-orange-400";
    if (temp >= 45) return "from-orange-400 to-yellow-400";
    if (temp >= 35) return "from-yellow-400 to-green-400";
    return "from-blue-400 to-cyan-400";
  };

  // 커뮤니티 목업 데이터 - 아카이빙 문장 + 코멘트 형태
  const mockCommunityPosts: {
    id: string; userName: string; userMbti: string; userAvatar: string;
    timeAgo: string; archivedSentence: string; userComment: string;
    articleTitle: string; tags: string[]; upvotes: number;
    commentCount: number; commentList: { id: string; userName: string; userMbti: string; userAvatar: string; text: string; timeAgo: string; likes: number }[];
  }[] = [
    {
      id: "mock-1",
      userName: "서연",
      userMbti: "INTJ",
      userAvatar: userProfiles["서연"].avatar,
      timeAgo: "2시간 전",
      archivedSentence: "삼성전자가 HBM3E 12단을 엔비디아 차세대 GPU에 단독 공급하기로 했다.",
      userComment: "드디어 HBM 점유율 역전 신호. SK하이닉스가 선점한 HBM 시장이 흔들리는 변곡점이라고 봐요. 단독 공급은 협상력에서 큰 차이를 만듭니다.",
      articleTitle: "삼성전자, 엔비디아 차세대 GPU에 HBM3E 12단 단독 공급",
      tags: ["반도체", "AI", "빅테크"],
      upvotes: 124,
      commentCount: 3,
      commentList: [
        { id: "c1-1", userName: "도윤", userMbti: "ENTJ", userAvatar: userProfiles["도윤"].avatar, text: "단독 공급이 진짜면 게임체인저죠. 다만 수율 안정화가 관건.", timeAgo: "1시간 전", likes: 12 },
        { id: "c1-2", userName: "예준", userMbti: "INTP", userAvatar: userProfiles["예준"].avatar, text: "수율 데이터 공개 전엔 신중하게 봐야 함. 루머일 가능성도.", timeAgo: "45분 전", likes: 8 },
        { id: "c1-3", userName: "현우", userMbti: "ESTJ", userAvatar: userProfiles["현우"].avatar, text: "실적 발표 시 확인 가능. 일단 시장은 반응 중.", timeAgo: "30분 전", likes: 5 },
      ],
    },
    {
      id: "mock-2",
      userName: "하은",
      userMbti: "ENFP",
      userAvatar: userProfiles["하은"].avatar,
      timeAgo: "3시간 전",
      archivedSentence: "금리 인하 시점이 늦춰질수록 부동산 시장의 양극화는 더 깊어진다.",
      userComment: "이 문장에 진짜 공감해요. 강남이랑 지방 격차가 점점 벌어지는데 금리만 탓하긴 어려운 거 같아요. 결국 사람들이 모이는 곳에 돈이 모이는 구조.",
      articleTitle: "美 연준 금리 동결 기조 장기화…국내 부동산 양극화 심화",
      tags: ["금리", "부동산"],
      upvotes: 89,
      commentCount: 2,
      commentList: [
        { id: "c2-1", userName: "지아", userMbti: "ISFP", userAvatar: userProfiles["지아"].avatar, text: "지방 살이라 더 체감돼요... 진짜 답답합니다.", timeAgo: "2시간 전", likes: 15 },
        { id: "c2-2", userName: "민준", userMbti: "ESFJ", userAvatar: userProfiles["민준"].avatar, text: "주변에서도 비슷한 이야기 많이 들어요. 정책이 좀 풀리길.", timeAgo: "1시간 전", likes: 7 },
      ],
    },
    {
      id: "mock-3",
      userName: "수아",
      userMbti: "INFJ",
      userAvatar: userProfiles["수아"].avatar,
      timeAgo: "5시간 전",
      archivedSentence: "전기차 캐즘은 단순한 수요 둔화가 아니라 소비자 신뢰의 위기다.",
      userComment: "캐즘이라는 표현이 와닿네요. 충전 인프라, 배터리 화재, 중고차 잔존가치... 신뢰가 무너지면 가격으로도 회복이 어렵죠.",
      articleTitle: "전기차 수요 둔화 장기화…완성차 업계, '캐즘' 돌파 전략 고심",
      tags: ["전기차", "투자"],
      upvotes: 67,
      commentCount: 4,
      commentList: [
        { id: "c3-1", userName: "지우", userMbti: "ISTP", userAvatar: userProfiles["지우"].avatar, text: "현실적으로 가격이 답이긴 한데, 중국차 대비 경쟁력이 애매.", timeAgo: "4시간 전", likes: 20 },
        { id: "c3-2", userName: "시우", userMbti: "ESTP", userAvatar: userProfiles["시우"].avatar, text: "그래도 일단 사봐야 안다. 타보면 좋음 ㅋㅋ", timeAgo: "3시간 전", likes: 9 },
        { id: "c3-3", userName: "유나", userMbti: "ENFJ", userAvatar: userProfiles["유나"].avatar, text: "결국 인프라가 받쳐줘야 신뢰가 생기죠. 정부 차원 투자 필요.", timeAgo: "2시간 전", likes: 11 },
        { id: "c3-4", userName: "준서", userMbti: "ISTJ", userAvatar: userProfiles["준서"].avatar, text: "데이터 보면 캐즘은 명확. 다만 회복 시점이 문제.", timeAgo: "1시간 전", likes: 6 },
      ],
    },
    {
      id: "mock-4",
      userName: "도윤",
      userMbti: "ENTJ",
      userAvatar: userProfiles["도윤"].avatar,
      timeAgo: "7시간 전",
      archivedSentence: "AI 인프라 투자가 거품이라는 우려에도 빅테크의 자본지출은 멈추지 않는다.",
      userComment: "거품 논쟁은 항상 있었음. 닷컴 버블도 결국 살아남는 기업이 인터넷 시대를 정의했듯, AI도 같은 패턴 갈 거라 봅니다. 베팅 사이즈가 다를 뿐.",
      articleTitle: "MS·구글·메타 AI 인프라 투자 확대…거품 우려에도 베팅 가속",
      tags: ["AI", "빅테크", "투자"],
      upvotes: 156,
      commentCount: 5,
      commentList: [
        { id: "c4-1", userName: "예준", userMbti: "INTP", userAvatar: userProfiles["예준"].avatar, text: "ROI가 명확히 나오기 전엔 신중하게. 닷컴 때도 살아남은 기업은 소수.", timeAgo: "5시간 전", likes: 22 },
        { id: "c4-2", userName: "서연", userMbti: "INTJ", userAvatar: userProfiles["서연"].avatar, text: "현금흐름 보면 빅테크는 버틸 수 있음. 스타트업 거품이 위험.", timeAgo: "4시간 전", likes: 18 },
        { id: "c4-3", userName: "채원", userMbti: "ESFP", userAvatar: userProfiles["채원"].avatar, text: "오 이거 재밌네요. 그래서 어디 사면 돼요? ㅋㅋ", timeAgo: "3시간 전", likes: 4 },
      ],
    },
    {
      id: "mock-5",
      userName: "민준",
      userMbti: "ESFJ",
      userAvatar: userProfiles["민준"].avatar,
      timeAgo: "12시간 전",
      archivedSentence: "투자는 결국 시간과 인내, 그리고 분산이라는 세 가지 원칙으로 수렴한다.",
      userComment: "복잡한 분석보다 이 세 가지 지키는 게 더 어려운 것 같아요. 특히 분산. 다들 한 종목에 몰빵하고 싶어하잖아요.",
      articleTitle: "장기투자 원칙 재조명…변동성 시대의 자산 배분 전략",
      tags: ["투자"],
      upvotes: 78,
      commentCount: 2,
      commentList: [
        { id: "c5-1", userName: "준서", userMbti: "ISTJ", userAvatar: userProfiles["준서"].avatar, text: "맞아요. 분산이 제일 어렵죠. 자기 확신이 강할수록 더.", timeAgo: "10시간 전", likes: 14 },
        { id: "c5-2", userName: "지아", userMbti: "ISFP", userAvatar: userProfiles["지아"].avatar, text: "조금씩 적립식으로 가는 게 마음 편하긴 해요.", timeAgo: "8시간 전", likes: 6 },
      ],
    },
    {
      id: "mock-6",
      userName: "시우",
      userMbti: "ESTP",
      userAvatar: userProfiles["시우"].avatar,
      timeAgo: "1일 전",
      archivedSentence: "엔비디아 시가총액이 3조 달러를 돌파하며 애플을 제쳤다.",
      userComment: "솔직히 이거 보고 놀랐음. 1년 전만 해도 상상 못 했는데. AI 사이클이 진짜인지, 이 가격이 적정인지는 모르겠지만 모멘텀은 확실.",
      articleTitle: "엔비디아 시총 3조 달러 돌파…애플 제치고 글로벌 2위",
      tags: ["AI", "반도체", "빅테크"],
      upvotes: 201,
      commentCount: 3,
      commentList: [
        { id: "c6-1", userName: "하은", userMbti: "ENFP", userAvatar: userProfiles["하은"].avatar, text: "와 이게 진짜로 일어났네요... 시대가 바뀌는 게 느껴져요.", timeAgo: "20시간 전", likes: 25 },
        { id: "c6-2", userName: "현우", userMbti: "ESTJ", userAvatar: userProfiles["현우"].avatar, text: "PER 보면 부담스러운 건 사실. 다만 성장률이 받쳐주면 정당화 가능.", timeAgo: "18시간 전", likes: 13 },
        { id: "c6-3", userName: "도윤", userMbti: "ENTJ", userAvatar: userProfiles["도윤"].avatar, text: "다음 타깃은 5조. 가능할 거라 봅니다.", timeAgo: "12시간 전", likes: 9 },
      ],
    },
  ];

  const [communityPosts, setCommunityPosts] = useState<{
    id: string; userName: string; userMbti: string; userAvatar: string;
    timeAgo: string; archivedSentence: string; userComment: string;
    articleTitle: string; tags: string[]; upvotes: number;
    commentCount: number; commentList: { id: string; userName: string; userMbti: string; userAvatar: string; text: string; timeAgo: string; likes: number }[];
  }[]>(mockCommunityPosts);

  // 인기 태그
  const trendingTags = ["반도체", "금리", "전기차", "AI", "부동산", "빅테크", "투자"];

  // 커뮤니티 포스트 로드 (서버 결과 비어있으면 mock 유지)
  useEffect(() => {
    const dateStr = formatDateStr(selectedDate);
    fetchCommunityPosts(dateStr).then(posts => {
      if (posts && posts.length > 0) setCommunityPosts(posts);
    });
  }, [selectedDate]);

  // AI 질문 로드
  useEffect(() => {
    const dateStr = formatDateStr(selectedDate);
    fetchDailyQuestions(dateStr).then(qs => setAiQuestions(qs));
  }, [selectedDate]);

  // 프리페칭
  const prefetchingRef = useRef<Set<string>>(new Set());

  // Prefetch — Round 4: 1 fetch with ?include_all_mbti=true (4-parallel
  // fallback retained). ArticleView가 진입 시 같은 패턴으로 4 MBTI를
  // 받아오지만, hover/scroll로 미리 받아두면 카드 클릭 직후 첫 표시
  // latency를 더 줄일 수 있음. 4 entries 모두 있어야 캐시 저장 (부분
  // 실패면 ArticleView 진입 시 다시 시도).
  const prefetchArticle = useCallback((article: Article) => {
    const id = article.news_id;
    if (id.startsWith('mock-')) return;
    if (prefetchCache.has(id) || prefetchingRef.current.has(id)) return;
    if (article.versions && Object.keys(article.versions).length === 4) return;

    prefetchingRef.current.add(id);
    const groups = ['NT', 'NF', 'ST', 'SF'] as const;
    // Use NT as the primary mbti for the single-fetch path. The choice
    // doesn't affect what we cache (we only read all_versions in Path A);
    // it just satisfies the required ?mbti param.
    const primaryGroup = groups[0];

    fetch(
      `${API_URL}/api/v2/article/${id}?mbti=${primaryGroup}&include_all_mbti=true`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // Path A: full all_versions present.
        if (
          data &&
          data.all_versions &&
          typeof data.all_versions === 'object' &&
          groups.every((g) => data.all_versions[g])
        ) {
          const versions: Record<string, MbtiVersion> = {};
          groups.forEach((g) => {
            versions[g] = adaptV2Version(
              data.all_versions[g] as Record<string, unknown>
            );
          });
          prefetchCache.set(id, { ...article, versions });
          return;
        }
        // Path B: fallback to 4-parallel.
        return Promise.all(
          groups.map((g) =>
            fetch(`${API_URL}/api/v2/article/${id}?mbti=${g}`).then((r) =>
              r.ok ? r.json() : null
            )
          )
        ).then((results) => {
          const versions: Record<string, MbtiVersion> = {};
          let allOk = true;
          results.forEach((r, i) => {
            if (r && r.version) {
              versions[groups[i]] = adaptV2Version(r.version as Record<string, unknown>);
            } else {
              allOk = false;
            }
          });
          if (allOk) {
            // Article shape 그대로 보존 (openArticle이 setViewArticle(cached ||
            // article) 흐름이라 Article로 저장돼야 함). versions만 채워넣고
            // 나머지 필드는 카드의 기존 article 그대로.
            prefetchCache.set(id, { ...article, versions });
          }
        });
      })
      .catch(() => {
        // silent — ArticleView will retry on actual click
      })
      .finally(() => prefetchingRef.current.delete(id));
  }, []);

  const openArticle = useCallback((article: Article) => {
    const cachedArticle = prefetchCache.get(article.news_id);
    setViewArticle(cachedArticle || article);
    // 현재 URL 파라미터 유지하면서 기사 해시 추가
    const currentUrl = new URL(window.location.href);
    currentUrl.hash = `article-${article.news_id}`;
    window.history.pushState({ articleId: article.news_id, tab: activeTab }, "", currentUrl.toString());
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // 기사 보기 상태 처리
      if (viewArticle && !event.state?.articleId) {
        setViewArticle(null);
      }
      // URL에서 탭 상태 복원
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['question', 'feed', 'community', 'archive', 'dna'].includes(tabParam)) {
        setActiveTabState(tabParam as typeof activeTab);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [viewArticle]);

  // /editors 등 다른 라우트에서 ?tab=... 로 진입했을 때 초기 반영
  // (useState 초기값이 prerender 시점의 빈 searchParams를 캡처할 수 있어 별도 동기화 필요)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['question', 'feed', 'community', 'archive', 'dna'].includes(tabParam)) {
      setActiveTabState(tabParam as typeof activeTab);
    }
  }, [searchParams]);

  const handleCloseArticle = useCallback(() => {
    if (viewArticle) window.history.back();
  }, [viewArticle]);

  // 기사 로드 (TASK-7) — v2 단일 endpoint /api/v2/feed.
  // 3-tier fallback (v1 articles/s3-articles/search)은 제거. v2 백엔드는
  // Selector + Transform이 자동 fire 중이라 안정적이고, 빈 응답은 "오늘
  // 선정된 기사 없음" empty state로 graceful 처리.
  // selectedDate는 NewsFeedTab가 hide된 지금 의미가 없으므로 since 파라미터로
  // 매핑하지 않고 기본값(서버: 오늘 KST - 7일)에 맡김. selectedDate 의존성은
  // 유지해서 향후 picker 부활 시 재연결 쉬움.
  useEffect(() => {
    const dateStr = formatDateStr(selectedDate);
    const mbtiKey = (typeof window !== "undefined" ? localStorage.getItem("mbti-type") : null) || selectedGroup;
    const cacheKey = `${dateStr}|${mbtiKey}|${user?.userId ?? "anon"}`;
    const cached = articleListCache.get(cacheKey);
    if (cached) {
      setArticles(cached);
      setLoading(false);
      return;
    }

    async function fetchArticles() {
      try {
        setLoading(true);
        // Round 5-E wire-up: include user_id when the user is logged in so
        // the backend can route to the personalized path. Frontend currently
        // sends the 2-char MBTI group only — the lazy profile-create on the
        // backend requires the 4-char form (INTJ/ENFP/...) which a separate
        // round will collect via an MBTI quiz. Until then, all calls land
        // on the cold path (Phase 2.5 selection feed unchanged), but
        // user_interactions still accumulates from ArticleView so the
        // Consolidation Lambda has data ready when profiles arrive.
        // Round 5-G: prefer the 4-char MBTI from localStorage when present —
        // backend's _extract_full_mbti recognizes it and triggers the lazy
        // profile-create / EWMA path. Fall back to the 2-char selectedGroup
        // for users whose localStorage hasn't been migrated yet (the
        // backfill in app/page.tsx covers them on next mount, but the
        // first feed call after R5-G deploy may still fire with group only).
        const mbtiParam = (typeof window !== "undefined"
          ? localStorage.getItem("mbti-type")
          : null) || selectedGroup;
        const userIdParam = user?.userId
          ? `&user_id=${encodeURIComponent(user.userId)}`
          : "";
        const url = `${API_URL}/api/v2/feed?mbti=${mbtiParam}&limit=30${userIdParam}`;
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`v2 feed returned ${res.status} — falling back to mock`);
          const fallback = mockArticles as unknown as Article[];
          articleListCache.set(cacheKey, fallback);
          setArticles(fallback);
          return;
        }
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        let mapped: Article[];
        if (items.length === 0) {
          console.info('v2 feed returned 0 items — using mock for UI preview');
          mapped = mockArticles as unknown as Article[];
        } else {
          mapped = items.map(adaptV2FeedItem);
        }
        articleListCache.set(cacheKey, mapped);
        setArticles(mapped);
      } catch (err) {
        console.warn('v2 feed fetch failed — falling back to mock', err);
        setArticles(mockArticles as unknown as Article[]);
      } finally {
        setLoading(false);
      }
    }
    fetchArticles();
  }, [selectedDate, selectedGroup, user?.userId]);

  // 질문 답변 선택
  const activeQuestionsList = aiQuestions.length > 0 ? aiQuestions : dailyQuestions;

  const handleSelectAnswer = (questionId: string, optionId: string, mbti?: MbtiGroupId) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionId }));

    // MBTI 변경이 있으면 적용
    if (mbti && onMbtiChange) {
      onMbtiChange(mbti);
      localStorage.setItem("mbti-group", mbti);
    }

    // 답변 서버 저장 (fire-and-forget)
    if (user?.userId && mbti) {
      saveQuestionAnswer({ user_id: user.userId, question_id: questionId, option_id: optionId, mbti });
    }

    // 다음 질문으로 또는 피드로
    if (currentQuestionIndex < activeQuestionsList.length - 1) {
      setTimeout(() => setCurrentQuestionIndex(prev => prev + 1), 300);
    } else {
      setTimeout(() => {
        setShowQuestions(false);
        setActiveTab("feed");
      }, 500);
    }
  };

  // 문장 아카이빙 — logged-in: server API, anonymous: local state
  const archiveSentence = async (text: string, articleId: string, articleTitle: string, articlePublishedAt?: string) => {
    const newSentence: ArchivedSentence = {
      id: `${articleId}-${Date.now()}`,
      text,
      articleId,
      articleTitle,
      articlePublishedAt,
      createdAt: new Date(),
    };

    // Optimistic: add to local state immediately
    setArchivedSentences(prev => [newSentence, ...prev]);

    // If logged in, also save to server
    if (user?.userId) {
      try {
        const { saveArchiveSentence } = await import('@/shared/lib/archiveApi');
        const result = await saveArchiveSentence({
          user_id: user.userId,
          text,
          article_id: articleId,
          article_title: articleTitle,
          article_published_at: articlePublishedAt,
        });
        // Replace local ID with server ID
        setArchivedSentences(prev =>
          prev.map(s => s.id === newSentence.id
            ? { ...s, id: result.sentence.id, createdAt: new Date(result.sentence.created_at) }
            : s
          )
        );
      } catch (err) {
        console.warn('Server archive save failed (local save kept):', err);
      }
    }
  };

  const currentQuestion = activeQuestionsList[Math.min(currentQuestionIndex, activeQuestionsList.length - 1)];
  const persona = personaInfo[selectedGroup];

  // 뉴스 DNA 데이터 (예시)
  const newsDNA = {
    economy: 75,
    tech: 60,
    world: 40,
    society: 30,
    culture: 20,
    politics: 45,
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Header - 1단 통합 */}
      <Header
        onLogo={() => setActiveTab("feed")}
        onSearch={() => setShowSearch(true)}
        tabs={[
          // 레터 = 홈(/) 이라 늘 여기서 시작함 — 별도로 하이라이트하면 마치
          // "지금 이 화면이 다른 곳과 구분되는 특정 탭"처럼 보여서 항상 비활성 표기.
          // 클릭 동작(같은 화면 재확인)은 그대로 둠.
          { key: "feed", label: "레터", active: false, onClick: () => setActiveTab("feed") },
          { key: "editors", label: "에디터", href: "/editors" },
          { key: "fortune", label: "사주", href: "/fortune" },
          { key: "timeline", label: "타임라인", href: "/timemachine" },
          { key: "games", label: "게임", href: "/games" },
          { key: "community", label: "커뮤니티", active: activeTab === "community", onClick: () => setActiveTab("community") },
          { key: "archive", label: "내 서랍", active: activeTab === "archive", onClick: () => setActiveTab("archive") },
        ]}
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} selectedGroup={selectedGroup} />

      {/* 메인 콘텐츠 */}
      <style>{`
        @keyframes tabFadeIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .tab-fade-in { animation: tabFadeIn 0.25s ease-out both; }
      `}</style>
      <main className="flex-1">
        <div key={activeTab} className="tab-fade-in">
        {/* 질문 모드 - QuestionTab 컴포넌트 */}
        {activeTab === "question" && (
          <QuestionTab
            currentQuestionIndex={currentQuestionIndex}
            selectedAnswers={selectedAnswers}
            onSelectAnswer={handleSelectAnswer}
            onSkip={() => {
              setActiveTab("feed");
            }}
            selectedGroup={selectedGroup}
          />
        )}

        {/* 피드 모드 - NewsFeedTab 컴포넌트 */}
        {activeTab === "feed" && (
          <NewsFeedTab
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            showCalendar={showCalendar}
            setShowCalendar={setShowCalendar}
            articles={articles}
            loading={loading}
            selectedGroup={selectedGroup}
            onMbtiChange={onMbtiChange}
            onArticleClick={openArticle}
          />
        )}

        {/* 커뮤니티 모드 - CommunityTab 컴포넌트 */}
        {activeTab === "community" && (
          <CommunityTab
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            showCalendar={showCalendar}
            setShowCalendar={setShowCalendar}
            communityPosts={communityPosts}
            setCommunityPosts={setCommunityPosts}
            userProfiles={userProfiles}
            selectedGroup={selectedGroup}
            setSelectedUser={setSelectedUser}
            setShowWriteModal={setShowWriteModal}
            trendingTags={trendingTags}
          />
        )}

        {/* 아카이브 모드 - 내 서랍 */}
        {activeTab === "archive" && (
          <ArchiveTab
            archiveDate={archiveDate}
            setArchiveDate={setArchiveDate}
            archivedSentences={archivedSentences}
            setArchivedSentences={setArchivedSentences}
            setActiveTab={setActiveTab}
            setExpandedArticles={setExpandedArticles}
            articles={articles}
            showToast={showToast}
            setShowCalendar={setShowCalendar}
          />
        )}

        {/* DNA 모드 - Coming Soon */}
        {activeTab === "dna" && (
          <ComingSoonNotice
            feature="dna"
            title="나의 DNA는 곧 만나요"
            description={"읽은 기사로 나만의 관심사 지도를 그려드릴게요.\n출시 소식을 가장 먼저 보내드릴게요."}
          />
        )}
        </div>

      </main>

      {/* 캘린더 팝업 — 최상위 렌더링 */}
      {showCalendar && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30 animate-[fadeIn_0.15s_ease-out]"
          onClick={() => setShowCalendar(false)}
        >
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes calendarIn {
              0% { opacity: 0; transform: scale(0.95) translateY(8px); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-[340px] animate-[calendarIn_0.25s_cubic-bezier(0.16,1,0.3,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                className="p-2 hover:bg-gray-50 rounded-full transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-[16px] font-bold text-gray-900">
                {calendarMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
              </span>
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                className="p-2 hover:bg-gray-50 rounded-full transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* 날짜 직접 입력 */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="YYYY.MM.DD"
                defaultValue={`${selectedDate.getFullYear()}.${String(selectedDate.getMonth() + 1).padStart(2, '0')}.${String(selectedDate.getDate()).padStart(2, '0')}`}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const val = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
                  if (val.length !== 8) return;
                  const d = new Date(`${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`);
                  if (!isNaN(d.getTime()) && d <= new Date()) {
                    if (activeTab === 'archive') setArchiveDate(d);
                    else setSelectedDate(d);
                    setCalendarMonth(d);
                    setShowCalendar(false);
                  }
                }}
                className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-[14px] text-center text-gray-700 tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
              />
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => (
                <div key={d} className={`text-center text-[11px] font-medium py-2 ${
                  i === 5 ? 'text-blue-400' : i === 6 ? 'text-rose-400' : 'text-gray-400'
                }`}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {getMonthDays(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((day, idx) => {
                if (!day) return <div key={idx} />;
                const currentDate = activeTab === 'archive' ? archiveDate : selectedDate;
                const isSelected = isSameDay(day, currentDate);
                const isToday = isSameDay(day, new Date());
                const isFuture = day > new Date();
                const dow = day.getDay();

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (!isFuture) {
                        if (activeTab === 'archive') setArchiveDate(day);
                        else setSelectedDate(day);
                        setShowCalendar(false);
                      }
                    }}
                    disabled={isFuture}
                    className={`aspect-square flex items-center justify-center rounded-full text-[14px] transition-all duration-150 ${
                      isSelected
                        ? "bg-blue-500 text-white font-bold shadow-sm"
                        : isToday
                          ? "ring-2 ring-blue-200 text-blue-600 font-semibold"
                          : isFuture
                            ? "text-gray-200 cursor-not-allowed"
                            : dow === 0
                              ? "text-rose-400 hover:bg-rose-50"
                              : dow === 6
                                ? "text-blue-400 hover:bg-blue-50"
                                : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            {!isSameDay(activeTab === 'archive' ? archiveDate : selectedDate, new Date()) && (
              <button
                onClick={() => {
                  if (activeTab === 'archive') setArchiveDate(new Date());
                  else setSelectedDate(new Date());
                  setShowCalendar(false);
                }}
                className="w-full mt-5 py-3 text-[14px] font-medium text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
              >
                오늘로 이동
              </button>
            )}
          </div>
        </div>
      )}

      {/* Article View */}
      {viewArticle && (
        <ArticleView
          article={viewArticle}
          currentGroup={selectedGroup}
          onClose={handleCloseArticle}
          onChangeGroup={() => {}}
          onArchiveSentence={archiveSentence}
        />
      )}

      {/* 유저 프로필 모달 */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-white w-full max-w-[480px] rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'modalIn 0.25s ease-out' }}
          >
            <style>{`
              @keyframes modalIn {
                from { opacity: 0; transform: scale(0.95) translateY(10px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
            `}</style>

            {/* 프로필 헤더 */}
            {(() => {
              const profile = userProfiles[selectedUser.userName] || { level: 1, exp: 0, temperature: 36.5, title: "뉴비", titleType: "star", badges: [] };
              return (
                <div className="relative bg-gradient-to-br from-slate-50 to-gray-100 p-6 pb-4">
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 hover:bg-white shadow-sm transition-all"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-5">
                    {/* 아바타 */}
                    <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-white shadow-lg flex-shrink-0">
                      <img src={selectedUser.userAvatar} alt={selectedUser.userName} className="w-full h-full object-cover" />
                    </div>

                    {/* 유저 정보 */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[20px] font-bold text-gray-900">{selectedUser.userName}</h3>
                        <span className="px-2 py-0.5 bg-white rounded text-[11px] font-bold text-gray-500 shadow-sm">
                          {selectedUser.userMbti}
                        </span>
                      </div>

                      {/* 칭호 */}
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="text-gray-400">
                          <TitleIcon type={profile.titleType} className="w-4 h-4" />
                        </span>
                        <span className="text-[13px] font-medium text-gray-600">{profile.title}</span>
                      </div>

                      {/* 온도 */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400">공감온도</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-gradient-to-r ${getTemperatureBarColor(profile.temperature)} rounded-full transition-all`}
                            style={{ width: `${Math.min(profile.temperature, 100)}%` }}
                          />
                        </div>
                        <span className={`text-[14px] font-bold ${getTemperatureColor(profile.temperature)}`}>
                          {profile.temperature.toFixed(1)}°
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">받은 추천이 많을수록 상승</p>
                    </div>
                  </div>

                  {/* 뱃지 */}
                  {profile.badges.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200/50">
                      {profile.badges.map((badge, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-full text-[11px] text-gray-600 shadow-sm">
                          <BadgeIcon type={badge.type} className="w-3 h-3 text-gray-400" />
                          {badge.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 활동 통계 */}
            <div className="grid grid-cols-3 border-b border-gray-100 bg-white">
              {(() => {
                const userPosts = communityPosts.filter(p => p.userName === selectedUser.userName);
                const userComments = communityPosts.flatMap(p => p.commentList).filter(c => c.userName === selectedUser.userName);
                const totalLikes = userPosts.reduce((sum, p) => sum + p.upvotes, 0);
                return (
                  <>
                    <div className="py-4 text-center border-r border-gray-100">
                      <p className="text-[18px] font-bold text-gray-900">{userPosts.length}</p>
                      <p className="text-[11px] text-gray-400">작성 글</p>
                    </div>
                    <div className="py-4 text-center border-r border-gray-100">
                      <p className="text-[18px] font-bold text-gray-900">{userComments.length}</p>
                      <p className="text-[11px] text-gray-400">댓글</p>
                    </div>
                    <div className="py-4 text-center">
                      <p className="text-[18px] font-bold text-gray-900">{totalLikes}</p>
                      <p className="text-[11px] text-gray-400">받은 추천</p>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* 활동 내역 */}
            <div className="max-h-[320px] overflow-y-auto">
              {/* 작성한 글 */}
              {communityPosts.filter(p => p.userName === selectedUser.userName).length > 0 && (
                <div className="p-5 border-b border-gray-100">
                  <h4 className="text-[13px] font-bold text-gray-500 uppercase tracking-wide mb-4">작성한 글</h4>
                  <div className="space-y-3">
                    {communityPosts.filter(p => p.userName === selectedUser.userName).map(post => (
                      <div key={post.id} className="p-4 bg-gray-50 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-gray-100 hover:shadow-[0_2px_6px_rgba(0,0,0,0.05)] transition-all cursor-pointer">
                        <p className="text-[14px] text-gray-800 leading-relaxed line-clamp-2 mb-2">
                          "{post.archivedSentence}"
                        </p>
                        <div className="flex items-center gap-3 text-[12px] text-gray-400">
                          <span>{post.timeAgo}</span>
                          <span>추천 {post.upvotes}</span>
                          <span>댓글 {post.commentCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 작성한 댓글 */}
              {(() => {
                const userComments = communityPosts.flatMap(p =>
                  p.commentList.filter(c => c.userName === selectedUser.userName).map(c => ({
                    ...c,
                    postSentence: p.archivedSentence
                  }))
                );
                if (userComments.length === 0) return null;
                return (
                  <div className="p-5">
                    <h4 className="text-[13px] font-bold text-gray-500 uppercase tracking-wide mb-4">작성한 댓글</h4>
                    <div className="space-y-3">
                      {userComments.slice(0, 5).map(comment => (
                        <div key={comment.id} className="p-4 bg-gray-50 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                          <p className="text-[14px] text-gray-800 leading-relaxed mb-2">{comment.text}</p>
                          <p className="text-[12px] text-gray-400 line-clamp-1">
                            "{comment.postSentence.slice(0, 40)}..." 글에 댓글
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* 활동 없음 */}
              {communityPosts.filter(p => p.userName === selectedUser.userName).length === 0 &&
               communityPosts.flatMap(p => p.commentList).filter(c => c.userName === selectedUser.userName).length === 0 && (
                <div className="p-10 text-center">
                  <p className="text-gray-400">아직 활동 내역이 없어요</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 커뮤니티 글 상세보기 모달 */}
      {selectedPost && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-[600px] max-h-[90vh] rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-[16px] font-bold text-gray-900">글 상세</h3>
              <button
                onClick={() => setSelectedPost(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto">
              {/* 원글 */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-50 ring-2 ring-gray-100">
                    <img
                      src={selectedPost.userAvatar}
                      alt={selectedPost.userName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-medium text-gray-900">{selectedPost.userName}</p>
                      <span className="px-1.5 py-0.5 bg-gradient-to-r from-slate-100 to-gray-100 rounded text-[10px] font-bold text-gray-500 tracking-wide">
                        {selectedPost.userMbti}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-400">{selectedPost.timeAgo}</p>
                  </div>
                </div>

                <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg mb-4">
                  <p className="text-[15px] text-gray-800">"{selectedPost.archivedSentence}"</p>
                  <p className="text-[12px] text-gray-400 mt-2">{selectedPost.articleTitle}</p>
                </div>

                <p className="text-[15px] text-gray-900 mb-4">{selectedPost.userComment}</p>

                <div className="flex items-center gap-4 text-[13px] text-gray-500">
                  <span>추천 {selectedPost.upvotes}</span>
                  <span>댓글 {selectedPost.commentCount}</span>
                </div>
              </div>

              {/* 댓글 목록 */}
              <div className="p-5">
                <h4 className="text-[14px] font-bold text-gray-900 mb-4">댓글 {selectedPost.commentList.length}개</h4>
                <div className="space-y-4">
                  {selectedPost.commentList.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-50 ring-1 ring-gray-100 flex-shrink-0">
                        <img
                          src={comment.userAvatar}
                          alt={comment.userName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[13px] font-medium text-gray-900">{comment.userName}</span>
                          <span className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-bold text-gray-400 tracking-wide">{comment.userMbti}</span>
                          <span className="text-[11px] text-gray-400">{comment.timeAgo}</span>
                        </div>
                        <p className="text-[14px] text-gray-700 leading-relaxed">{comment.text}</p>
                        <button className="mt-2 text-[12px] text-gray-400 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
                          </svg>
                          {comment.likes}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 댓글 입력 */}
            <div className="p-4 border-t border-gray-100 bg-white">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-amber-50 ring-1 ring-amber-100 flex-shrink-0">
                  <img
                    src="https://api.dicebear.com/7.x/notionists/svg?seed=me&backgroundColor=fef3c7&scale=90"
                    alt="나"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="댓글을 입력하세요"
                    className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-[14px] focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                  <button
                    onClick={() => {
                      if (newComment.trim()) {
                        // 댓글 추가 로직
                        const updatedPosts = communityPosts.map(p => {
                          if (p.id === selectedPost.id) {
                            return {
                              ...p,
                              commentCount: p.commentCount + 1,
                              commentList: [
                                { id: `c${Date.now()}`, userName: "나", userMbti: selectedGroup, userAvatar: `https://api.dicebear.com/7.x/notionists/svg?seed=me&backgroundColor=fef3c7&scale=90`, text: newComment, timeAgo: "방금 전", likes: 0 },
                                ...p.commentList
                              ]
                            };
                          }
                          return p;
                        });
                        setCommunityPosts(updatedPosts);
                        const updated = updatedPosts.find(p => p.id === selectedPost.id);
                        if (updated) setSelectedPost(updated);
                        setNewComment("");
                      }
                    }}
                    className="px-4 py-2.5 bg-blue-500 text-white rounded-full text-[14px] font-medium hover:bg-blue-600 transition-colors"
                  >
                    등록
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 텍스트 선택 시 하단 고정 저장바 */}
      {textSelection && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200]"
          style={{ animation: 'slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateX(-50%) translateY(20px); }
              to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
          `}</style>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 max-w-[90vw] w-[400px]">
            {/* 선택된 텍스트 미리보기 */}
            <p className="text-[14px] text-gray-600 line-clamp-2 mb-3 leading-relaxed">
              "{textSelection.text.length > 80 ? textSelection.text.slice(0, 80) + '...' : textSelection.text}"
            </p>

            {/* 버튼 영역 */}
            <div className="flex gap-2">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTextSelection(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl text-[14px] font-medium hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  archiveSentence(
                    textSelection.text,
                    textSelection.articleId,
                    textSelection.articleTitle,
                    textSelection.articlePublishedAt
                  );
                  setTextSelection(null);
                  window.getSelection()?.removeAllRanges();
                  showToast();
                }}
                className="flex-1 py-3 bg-blue-500 text-white rounded-xl text-[14px] font-medium hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 문장 아카이빙 - 미니멀 팝업 (기존 방식 유지) */}
      {selectedSentence && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setSelectedSentence(null)}
        >
          {/* 배경 오버레이 */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            style={{ animation: 'fadeIn 0.2s ease-out' }}
          />

          {/* 카드 */}
          <div
            className="relative w-full max-w-[420px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: 'scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes scaleIn {
                from { opacity: 0; transform: scale(0.95) translateY(10px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
            `}</style>

            {/* 닫기 버튼 */}
            <button
              onClick={() => setSelectedSentence(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors z-10"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 콘텐츠 */}
            <div className="p-6 pt-12">
              {/* 선택된 문장 */}
              <div className="relative mb-5">
                <div className="absolute -left-2 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-300 rounded-full" />
                <p className="text-[16px] text-gray-800 leading-[1.8] pl-4 font-medium">
                  {selectedSentence.text}
                </p>
              </div>

              {/* 출처 */}
              <p className="text-[13px] text-gray-400 mb-6 pl-4">
                — {selectedSentence.articleTitle}
              </p>
            </div>

            {/* 저장 버튼 */}
            <div className="px-6 pb-6">
              <button
                onClick={() => {
                  archiveSentence(
                    selectedSentence.text,
                    selectedSentence.articleId,
                    selectedSentence.articleTitle
                  );
                  setSelectedSentence(null);
                  showToast();
                }}
                className="w-full py-4 bg-blue-500 text-white rounded-xl text-[15px] font-medium hover:bg-blue-600 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                내 서랍에 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 저장 완료 토스트 */}
      {showSaveToast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] px-5 py-3 bg-blue-500 text-white rounded-full shadow-lg flex items-center gap-2"
          style={{ animation: 'toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          <style>{`
            @keyframes toastIn {
              from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
              to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
            }
          `}</style>
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[14px] font-medium">내 서랍에 저장했어요</span>
        </div>
      )}

      {/* 글쓰기 모달 */}
      {showWriteModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-[600px] max-h-[90vh] rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <button
                onClick={() => {
                  setShowWriteModal(false);
                  setSelectedArchiveForPost(null);
                  setPostComment("");
                }}
                className="text-[14px] text-gray-500"
              >
                취소
              </button>
              <h3 className="text-[16px] font-bold text-gray-900">새 글 작성</h3>
              <button
                onClick={async () => {
                  if (selectedArchiveForPost && postComment.trim()) {
                    const userId = user?.userId || 'anonymous';
                    const newPost = await createCommunityPost({
                      user_id: userId,
                      user_name: user?.name || persona.name,
                      user_mbti: selectedGroup,
                      user_avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${persona.name}&backgroundColor=fef3c7&scale=90`,
                      archived_sentence: selectedArchiveForPost.text,
                      user_comment: postComment,
                      article_id: selectedArchiveForPost.articleId || '',
                      article_title: selectedArchiveForPost.articleTitle,
                      tags: [],
                    });
                    if (newPost) {
                      setCommunityPosts(prev => [newPost, ...prev]);
                    }
                    setShowWriteModal(false);
                    setSelectedArchiveForPost(null);
                    setPostComment("");
                  }
                }}
                disabled={!selectedArchiveForPost || !postComment.trim()}
                className={`text-[14px] font-medium ${
                  selectedArchiveForPost && postComment.trim()
                    ? "text-blue-600"
                    : "text-gray-300"
                }`}
              >
                게시
              </button>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* 내 아카이브에서 선택 */}
              <div className="mb-6">
                <h4 className="text-[14px] font-bold text-gray-900 mb-3">내 서랍에서 문장 선택</h4>
                {archivedSentences.length === 0 ? (
                  <div className="p-6 bg-gray-50 rounded-xl text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <p className="text-[14px] text-gray-500">저장한 문장이 없어요</p>
                    <p className="text-[13px] text-gray-400 mt-1">뉴스를 읽고 문장을 저장해보세요</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {archivedSentences.map((sentence) => (
                      <button
                        key={sentence.id}
                        onClick={() => setSelectedArchiveForPost(sentence)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                          selectedArchiveForPost?.id === sentence.id
                            ? "border-gray-900 bg-gray-50 shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                            : "border-gray-100/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-gray-300 hover:shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
                        }`}
                      >
                        <p className="text-[14px] text-gray-800 line-clamp-2">"{sentence.text}"</p>
                        <p className="text-[12px] text-gray-400 mt-1">{sentence.articleTitle}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 선택된 문장 미리보기 */}
              {selectedArchiveForPost && (
                <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
                  <p className="text-[15px] text-gray-800">"{selectedArchiveForPost.text}"</p>
                  <p className="text-[12px] text-gray-400 mt-2">{selectedArchiveForPost.articleTitle}</p>
                </div>
              )}

              {/* 코멘트 입력 */}
              <div>
                <h4 className="text-[14px] font-bold text-gray-900 mb-3">내 생각 덧붙이기</h4>
                <textarea
                  value={postComment}
                  onChange={(e) => setPostComment(e.target.value)}
                  placeholder="이 문장에 대한 내 생각을 적어보세요"
                  rows={4}
                  className="w-full p-4 bg-gray-50 rounded-xl text-[15px] resize-none shadow-[0_1px_3px_rgba(0,0,0,0.03)_inset] focus:outline-none focus:ring-2 focus:ring-gray-300 focus:shadow-[0_2px_8px_rgba(0,0,0,0.04)_inset]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden HTML5 audio element */}
      <audio ref={audioRef} preload="none" />

      {/* 하단 오디오 플레이어 */}
      {showAudioPlayer && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
          {/* 프로그레스 바 */}
          <div
            className="absolute top-0 left-0 right-0 h-3 -mt-1.5 cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = ((e.clientX - rect.left) / rect.width) * 100;
              seekAudio(pct);
            }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[3px] bg-gray-200 group-hover:h-[5px] transition-all">
              <div
                className="h-full bg-blue-500 relative"
                style={{ width: `${audioProgress}%` }}
              >
                {/* 드래그 핸들 */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" />
              </div>
            </div>
          </div>

          <div className="max-w-[600px] mx-auto px-4 py-2.5">
            <div className="flex items-center gap-3">
              {/* 페르소나 아바타 */}
              <div className="relative flex-shrink-0">
                <div className="w-11 h-11 rounded-xl overflow-hidden">
                  <img
                    src={
                      selectedGroup === 'NT' ? '/editors/intj.webp' :
                      selectedGroup === 'NF' ? '/editors/infp.webp' :
                      selectedGroup === 'ST' ? '/editors/istj.webp' : '/editors/esfp.webp'
                    }
                    alt="AI 에디터"
                    className="w-full h-full object-cover"
                  />
                </div>
                {isPlaying && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <div className="flex items-end gap-[1.5px] h-2">
                      <span className="w-[2px] bg-white rounded-full animate-[soundbar1_0.4s_ease-in-out_infinite]" />
                      <span className="w-[2px] bg-white rounded-full animate-[soundbar2_0.4s_ease-in-out_infinite_0.1s]" />
                      <span className="w-[2px] bg-white rounded-full animate-[soundbar3_0.4s_ease-in-out_infinite_0.2s]" />
                    </div>
                  </div>
                )}
                {podcastLoading && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                    <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* 재생 정보 */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900 truncate leading-tight">
                  {podcastLoading ? '오디오 생성 중...' :
                   podcastError ? '오디오 생성 실패' :
                   currentPlayingArticle?.title || '오늘의 뉴스 브리핑'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {podcastError ? (
                    <button
                      onClick={startAudioBriefing}
                      className="text-[11px] text-blue-500 font-medium"
                    >
                      다시 시도
                    </button>
                  ) : (
                    <>
                      <span className="text-[11px] text-gray-400 tabular-nums">
                        {formatTime(audioCurrentTime)}
                        <span className="mx-0.5">/</span>
                        {hasUnlockedAudio ? formatTime(audioDuration) : formatTime(Math.min(audioDuration, FREE_PREVIEW_SECONDS))}
                      </span>
                      {!hasUnlockedAudio && audioDuration > 0 && (
                        <span className="text-[10px] font-medium text-amber-600">미리듣기</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 컨트롤 */}
              <div className="flex items-center">
                <button
                  onClick={() => skipAudio(-5)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors relative"
                  title="5초 뒤로"
                  disabled={podcastLoading}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.5 8V4L7 9l5.5 5v-4c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4.5c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                  </svg>
                  <span className="absolute text-[8px] font-bold" style={{ top: '52%', left: '50%', transform: 'translate(-50%, -50%)' }}>5</span>
                </button>

                <button
                  onClick={togglePlayPause}
                  disabled={podcastLoading}
                  className={`w-10 h-10 flex items-center justify-center rounded-full text-white transition-all active:scale-95 mx-1 ${
                    podcastLoading ? 'bg-gray-300' : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {podcastLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => skipAudio(5)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors relative"
                  title="5초 앞으로"
                  disabled={podcastLoading}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.5 8V4l5.5 5-5.5 5v-4c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
                  </svg>
                  <span className="absolute text-[8px] font-bold" style={{ top: '52%', left: '50%', transform: 'translate(-50%, -50%)' }}>5</span>
                </button>

                <button
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.pause();
                      audioRef.current.src = '';
                    }
                    setShowAudioPlayer(false);
                    setIsPlaying(false);
                    setAudioProgress(0);
                    setAudioCurrentTime(0);
                    setPodcastLoading(false);
                    setPodcastError(null);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-all ml-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <style>{`
            @keyframes soundbar1 {
              0%, 100% { height: 30%; }
              50% { height: 100%; }
            }
            @keyframes soundbar2 {
              0%, 100% { height: 60%; }
              50% { height: 30%; }
            }
            @keyframes soundbar3 {
              0%, 100% { height: 45%; }
              50% { height: 90%; }
            }
          `}</style>
        </div>
      )}

      {/* 구독/결제 페이월 모달 */}
      {showPaywall && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPaywall(false)}>
          <div
            className="w-full sm:max-w-[420px] bg-white sm:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden animate-[slideUp_0.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 상단 그래픽 */}
            <div className="relative h-32 bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center overflow-hidden">
              {/* 배경 패턴 */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-4 left-8 w-16 h-16 border-2 border-white rounded-full" />
                <div className="absolute bottom-2 right-12 w-24 h-24 border-2 border-white rounded-full" />
                <div className="absolute top-8 right-4 w-8 h-8 bg-white/30 rounded-full" />
              </div>

              {/* 아이콘 */}
              <div className="relative flex items-center gap-3">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                </div>
                <div className="text-white">
                  <p className="text-[13px] font-medium opacity-90">1분 미리듣기 완료</p>
                  <p className="text-[20px] font-bold">전체 듣기 잠금해제</p>
                </div>
              </div>

              {/* 닫기 버튼 */}
              <button
                onClick={() => setShowPaywall(false)}
                className="absolute top-4 right-4 w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/30 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 콘텐츠 */}
            <div className="p-6">
              {/* 혜택 리스트 */}
              <div className="space-y-3 mb-6">
                {[
                  { icon: "headphones", text: "AI 페르소나 음성 브리핑 무제한" },
                  { icon: "articles", text: "모든 MBTI 스타일 기사 열람" },
                  { icon: "archive", text: "문장 아카이빙 무제한 저장" },
                  { icon: "community", text: "커뮤니티 프리미엄 배지" },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      {item.icon === "headphones" && (
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424" />
                        </svg>
                      )}
                      {item.icon === "articles" && (
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                      )}
                      {item.icon === "archive" && (
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                        </svg>
                      )}
                      {item.icon === "community" && (
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                      )}
                    </div>
                    <span className="text-[14px] text-gray-700">{item.text}</span>
                  </div>
                ))}
              </div>

              {/* 가격 옵션 */}
              <div className="space-y-3 mb-6">
                {/* 월간 구독 */}
                <button className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-gray-300 transition-all text-left group">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900">월간 구독</p>
                      <p className="text-[13px] text-gray-500">매월 자동 결제</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[18px] font-bold text-gray-900">4,900원</p>
                      <p className="text-[12px] text-gray-400">/월</p>
                    </div>
                  </div>
                </button>

                {/* 연간 구독 - 추천 */}
                <button className="w-full p-4 border-2 border-amber-400 bg-amber-50/50 rounded-xl hover:bg-amber-50 transition-all text-left relative overflow-hidden">
                  {/* 추천 배지 */}
                  <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                    2개월 무료
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900">연간 구독</p>
                      <p className="text-[13px] text-amber-600 font-medium">17% 할인</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] text-gray-400 line-through">58,800원</p>
                      <p className="text-[18px] font-bold text-amber-600">49,000원</p>
                      <p className="text-[12px] text-gray-400">/년</p>
                    </div>
                  </div>
                </button>
              </div>

              {/* CTA 버튼 — 구독 페이지 제거됨, 모달만 닫음 */}
              <button
                onClick={() => setShowPaywall(false)}
                className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-orange-200 active:scale-[0.98]"
              >
                확인
              </button>

              {/* 하단 안내 */}
              <p className="text-center text-[12px] text-gray-400 mt-4">
                언제든 취소 가능 · 7일 무료 체험
              </p>
            </div>
          </div>

          {/* 슬라이드 업 애니메이션 */}
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}

    </div>
  );
}
