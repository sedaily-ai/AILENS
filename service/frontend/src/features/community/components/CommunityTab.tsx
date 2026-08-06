'use client';

import { useState } from "react";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import { getWeekDays, isSameDay, getMonthDays } from "@/shared/utils/dateUtils";
import { votePost, addComment, fetchComments } from "@/shared/lib/communityApi";
import { useAuth } from "@/features/auth";
import type { CommunityComment, CommunityPost } from "@/shared/types/community";

// 유저 프로필 타입
export interface UserProfile {
  temperature: number;
  title: string;
  titleType: 'crown' | 'star' | 'lightning' | 'heart' | 'book' | 'chart';
  badges: { name: string; type: 'trophy' | 'fire' | 'chat' | 'bulb' | 'target' | 'chart' }[];
  mbti: string;
  avatar: string;
}

interface Props {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  calendarMonth: Date;
  setCalendarMonth: (date: Date) => void;
  showCalendar: boolean;
  setShowCalendar: (show: boolean) => void;
  communityPosts: CommunityPost[];
  setCommunityPosts: React.Dispatch<React.SetStateAction<CommunityPost[]>>;
  userProfiles: Record<string, UserProfile>;
  selectedGroup: MbtiGroupId;
  setSelectedUser: (user: { userName: string; userMbti: string; userAvatar: string }) => void;
  setShowWriteModal: (show: boolean) => void;
  trendingTags: string[];
}

// 온도에 따른 색상
const getTemperatureColor = (temp: number) => {
  if (temp >= 55) return "text-red-500";
  if (temp >= 45) return "text-orange-500";
  if (temp >= 35) return "text-yellow-500";
  return "text-blue-500";
};

export function CommunityTab({
  selectedDate,
  setSelectedDate,
  calendarMonth,
  setCalendarMonth,
  showCalendar,
  setShowCalendar,
  communityPosts,
  setCommunityPosts,
  userProfiles,
  selectedGroup,
  setSelectedUser,
  setShowWriteModal,
  trendingTags,
}: Props) {
  const { user } = useAuth();
  // 내부 상태
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down' | null>>({});
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [inlineComment, setInlineComment] = useState<Record<string, string>>({});
  const [showAllComments, setShowAllComments] = useState<Set<string>>(new Set());
  const [rankingPeriod, setRankingPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  // 투표 목업 (poll mock UI)
  const [pollVoted, setPollVoted] = useState<string | null>(null);
  const [pollCompareOpen, setPollCompareOpen] = useState(false);

  const editorMeta: Record<MbtiGroupId, { name: string; avatar: string }> = {
    NT: { name: '민철', avatar: '/editors/intj.webp' },
    NF: { name: '하은', avatar: '/editors/infp.webp' },
    ST: { name: '준서', avatar: '/editors/istj.webp' },
    SF: { name: '소율', avatar: '/editors/esfp.webp' },
  };

  const pollData = {
    question: 'AI가 3년 안에 화이트칼라 일자리 30%를 대체할까?',
    source: 'IMF 글로벌 고용 전망 보고서 (2026.04)',
    intro: {
      NT: '구조적으로 봤을 때 이미 변곡점을 지났는데.',
      NF: '읽다 보니... 숫자 뒤에 사람들 이야기가 보여요.',
      ST: '결론부터. IMF 보고서 신뢰도 높음.',
      SF: '헐 여러분 이거 봤어요?? 어떡해요!',
    } as Record<MbtiGroupId, string>,
    options: [
      { id: 'a', text: '이미 체감됨. 30%는 보수적 추정이다', votes: 142 },
      { id: 'b', text: '과장됐다. 보조 역할이지 완전 대체는 아님', votes: 118 },
      { id: 'c', text: '대체가 아니라 직무 재정의. 프레임이 잘못됨', votes: 68 },
      { id: 'd', text: '아직 판단하기 이름. 더 지켜봐야', votes: 24 },
    ],
    totalVotes: 352,
    timeLeft: '17시간 남음',
    compare: {
      NT: { top: 'a', topPct: 46, comment: '변수 3개를 정리하면 답은 명확함.' },
      NF: { top: 'c', topPct: 41, comment: '사람이 하는 일의 의미는... 대체될 수 없잖아요.' },
      ST: { top: 'b', topPct: 39, comment: '자동화율 ≠ 대체율. 팩트 구분해야 됨.' },
      SF: { top: 'a', topPct: 44, comment: '일단 나부터 AI 잘 써야겠다 ㅋㅋ 💪' },
    } as Record<MbtiGroupId, { top: string; topPct: number; comment: string }>,
  };

  const handlePollVote = (optionId: string) => {
    if (pollVoted) return;
    setPollVoted(optionId);
  };

  // 투표 핸들러 — API 연동
  const handleVote = async (postId: string, direction: 'up' | 'down') => {
    const userId = user?.userId || 'anonymous';
    const currentVote = userVotes[postId];

    // Optimistic UI update
    if (currentVote === direction) {
      setUserVotes(prev => ({ ...prev, [postId]: null }));
      setCommunityPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, upvotes: p.upvotes + (direction === 'up' ? -1 : 1) } : p
      ));
    } else {
      setUserVotes(prev => ({ ...prev, [postId]: direction }));
      const delta = direction === 'up'
        ? (currentVote === 'down' ? 2 : 1)
        : (currentVote === 'up' ? -2 : -1);
      setCommunityPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, upvotes: p.upvotes + delta } : p
      ));
    }

    // Fire-and-forget API call
    votePost(postId, userId, direction);
  };

  // 댓글 추가 핸들러 — API 연동
  const handleAddComment = async (postId: string) => {
    const text = inlineComment[postId]?.trim();
    if (!text) return;

    const userId = user?.userId || 'anonymous';
    const userName = user?.name || '나';
    const comment = await addComment(postId, {
      user_id: userId,
      user_name: userName,
      user_mbti: selectedGroup,
      user_avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${userName}&scale=90`,
      text,
    });

    if (comment) {
      setCommunityPosts(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, commentCount: p.commentCount + 1, commentList: [comment, ...p.commentList] };
        }
        return p;
      }));
    }
    setInlineComment(prev => ({ ...prev, [postId]: '' }));
  };

  // 댓글 펼침 시 API에서 로드
  const handleExpandComments = async (postId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });

    // 아직 댓글이 로드되지 않았으면 API에서 가져오기
    const post = communityPosts.find(p => p.id === postId);
    if (post && post.commentList.length === 0 && post.commentCount > 0) {
      const comments = await fetchComments(postId);
      if (comments.length > 0) {
        setCommunityPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, commentList: comments } : p
        ));
      }
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* 상단 고정 주간 네비게이션 */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {/* 월/주 네비게이션 */}
        <div className="flex items-center justify-center gap-4 py-3 px-4">
          <button
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(newDate.getDate() - 7);
              setSelectedDate(newDate);
            }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={() => {
              setCalendarMonth(new Date(selectedDate));
              setShowCalendar(true);
            }}
            className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="text-[16px] font-semibold text-gray-800">
              {selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
            </span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <button
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setDate(newDate.getDate() + 7);
              if (newDate <= new Date()) {
                setSelectedDate(newDate);
              }
            }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* 주간 날짜 탭 */}
        <div className="flex justify-center gap-1 px-4 pb-3">
          {getWeekDays(selectedDate).map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const isFuture = day > new Date();
            const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

            return (
              <button
                key={day.toISOString()}
                onClick={() => !isFuture && setSelectedDate(day)}
                disabled={isFuture}
                className={`flex flex-col items-center px-3 py-2 rounded-xl transition-all duration-200 min-w-[48px] ${
                  isSelected
                    ? "bg-blue-500 text-white"
                    : isToday
                      ? "bg-gray-100 text-gray-900 font-semibold"
                      : isFuture
                        ? "text-gray-300 cursor-not-allowed"
                        : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span className="text-[11px] mb-1">{dayNames[day.getDay()]}</span>
                <span className="text-[16px] font-medium">{day.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="flex gap-10">
          {/* 메인 피드 */}
          <div className="flex-1 max-w-[680px]">
            {/* 인기 태그 */}
            <div className="mb-8 flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${
                  selectedTag === null
                    ? "bg-blue-500 text-white shadow-sm"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50"
                }`}
              >
                전체
              </button>
              {trendingTags.map((tag, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${
                    selectedTag === tag
                      ? "bg-blue-500 text-white shadow-sm"
                      : "bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* 포스트 목록 */}
            <div className="space-y-5">
              {/* 투표 카드 — 일반 포스트와 동일한 카드 스타일 */}
              {selectedTag === null && (() => {
                const editor = editorMeta[selectedGroup];
                const total = pollData.totalVotes + (pollVoted ? 1 : 0);
                const options = pollData.options.map(o => ({
                  ...o,
                  votes: o.votes + (pollVoted === o.id ? 1 : 0),
                }));
                const maxVotes = Math.max(...options.map(o => o.votes));

                return (
                  <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-gray-100/80 transition-all duration-300 ease-out overflow-hidden group">
                    {/* 에디터 프로필 — 일반 포스트와 동일 */}
                    <div className="p-6 pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-50 ring-2 ring-gray-100">
                          <img loading="lazy" src={editor.avatar} alt={editor.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-gray-900">{editor.name}</span>
                            <span className="px-1.5 py-0.5 bg-gradient-to-r from-slate-100 to-gray-100 rounded text-[10px] font-bold text-gray-500 tracking-wide">{selectedGroup}</span>
                          </div>
                          <p className="text-[12px] text-gray-400">{pollData.timeLeft}</p>
                        </div>
                      </div>
                    </div>

                    {/* 에디터 코멘트 */}
                    <div className="px-6 pt-4 pb-2">
                      <p className="text-[15px] text-gray-800 leading-[1.7]">
                        {pollData.intro[selectedGroup]}
                      </p>
                    </div>

                    {/* 투표 본문 — 기사 인용 스타일 */}
                    <div className="mx-6 mt-2 mb-4 p-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 border-l-[3px] border-blue-400 rounded-r-lg">
                      <p className="text-[11px] text-blue-500 font-semibold tracking-wide mb-1.5">POLL</p>
                      <p className="text-[15px] text-gray-900 font-bold leading-snug mb-1">
                        {pollData.question}
                      </p>
                      <p className="text-[11px] text-gray-400">{pollData.source}</p>
                    </div>

                    {/* 선택지 */}
                    <div className="px-6 pb-5 space-y-2">
                      {options.map((option) => {
                        const pct = pollVoted ? Math.round((option.votes / total) * 100) : 0;
                        const isMyVote = pollVoted === option.id;
                        const isTop = pollVoted && option.votes === maxVotes;

                        return (
                          <button
                            key={option.id}
                            onClick={() => handlePollVote(option.id)}
                            disabled={!!pollVoted}
                            className={`relative w-full text-left rounded-xl overflow-hidden transition-all duration-300 ${
                              pollVoted
                                ? 'cursor-default'
                                : 'cursor-pointer hover:border-blue-200 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.15)] active:scale-[0.995]'
                            } ${
                              isMyVote ? 'border-2 border-blue-400' : 'border border-gray-200'
                            }`}
                          >
                            {pollVoted && (
                              <div
                                className={`absolute inset-y-0 left-0 rounded-xl transition-all duration-700 ease-out ${isTop ? 'bg-blue-50' : 'bg-gray-50'}`}
                                style={{ width: `${pct}%` }}
                              />
                            )}
                            <div className="relative flex items-center justify-between px-4 py-3">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                {!pollVoted && (
                                  <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 flex-shrink-0" />
                                )}
                                {pollVoted && isMyVote && (
                                  <div className="w-[18px] h-[18px] rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                                {pollVoted && !isMyVote && (
                                  <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-200 flex-shrink-0" />
                                )}
                                <span className={`text-[14px] leading-snug ${isMyVote ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                  {option.text}
                                </span>
                              </div>
                              {pollVoted && (
                                <span className={`text-[14px] font-bold ml-3 flex-shrink-0 tabular-nums ${isTop ? 'text-blue-600' : 'text-gray-400'}`}>
                                  {pct}%
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* 하단 — 일반 포스트의 반응 바와 동일한 위치 */}
                    <div className="px-6 py-4 border-t border-gray-50 flex items-center gap-2">
                      <span className="text-[13px] text-gray-400">{total.toLocaleString()}명 참여</span>
                      <div className="flex-1" />
                      {pollVoted && (
                        <button
                          onClick={() => setPollCompareOpen(prev => !prev)}
                          className="flex items-center gap-1.5 text-[13px] text-blue-500 hover:text-blue-600 font-medium transition-colors"
                        >
                          다른 에디터는?
                          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${pollCompareOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                      <button className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 transition-all duration-200">
                        <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                      </button>
                    </div>

                    {/* 비교 패널 */}
                    {pollVoted && pollCompareOpen && (
                      <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-5" style={{ animation: 'slideDown 0.2s ease-out' }}>
                        <div className="grid grid-cols-2 gap-3">
                          {(["NT", "NF", "ST", "SF"] as const).map((type) => {
                            const e = editorMeta[type];
                            const cmp = pollData.compare[type];
                            const isCurrent = type === selectedGroup;
                            const topOption = pollData.options.find(o => o.id === cmp.top);

                            return (
                              <div
                                key={type}
                                className={`rounded-xl p-3.5 transition-all duration-200 ${
                                  isCurrent
                                    ? 'bg-white border border-blue-100 shadow-sm'
                                    : 'bg-white/60 border border-gray-100 hover:border-gray-200'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <img loading="lazy" src={e.avatar} alt={e.name} className="w-6 h-6 rounded-full object-cover" />
                                  <span className="text-[12px] font-semibold text-gray-800">{e.name}</span>
                                  {isCurrent && (
                                    <span className="text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">나</span>
                                  )}
                                </div>
                                <div className="flex items-baseline gap-1.5 mb-1.5">
                                  <span className={`text-[18px] font-bold ${isCurrent ? 'text-blue-600' : 'text-gray-700'}`}>
                                    {cmp.topPct}%
                                  </span>
                                  <span className="text-[11px] text-gray-400 leading-tight line-clamp-1">
                                    {topOption?.text}
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-500 leading-relaxed italic line-clamp-2">
                                  &ldquo;{cmp.comment}&rdquo;
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {communityPosts
                .filter(post => selectedTag === null || post.tags.includes(selectedTag))
                .map((post) => (
                  <div
                    key={post.id}
                    className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-gray-100/80 transition-all duration-300 ease-out overflow-hidden group"
                  >
                    {/* 유저 정보 */}
                    <div className="p-6 pb-0">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setSelectedUser({ userName: post.userName, userMbti: post.userMbti, userAvatar: post.userAvatar })}
                          className="w-11 h-11 rounded-full overflow-hidden bg-gray-50 ring-2 ring-gray-100 hover:ring-gray-300 transition-all cursor-pointer"
                        >
                          <img loading="lazy"
                            src={post.userAvatar}
                            alt={post.userName}
                            className="w-full h-full object-cover"
                          />
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedUser({ userName: post.userName, userMbti: post.userMbti, userAvatar: post.userAvatar })}
                              className="text-[14px] font-semibold text-gray-900 hover:text-gray-600 transition-colors cursor-pointer"
                            >
                              {post.userName}
                            </button>
                            <span className="px-1.5 py-0.5 bg-gradient-to-r from-slate-100 to-gray-100 rounded text-[10px] font-bold text-gray-500 tracking-wide">
                              {post.userMbti}
                            </span>
                          </div>
                          <p className="text-[12px] text-gray-400">{post.timeAgo}</p>
                        </div>
                      </div>
                    </div>

                    {/* 아카이빙한 문장 (하이라이트) */}
                    <div className="mx-6 mt-5 p-4 bg-gradient-to-r from-amber-50 to-yellow-50/50 border-l-[3px] border-amber-400 rounded-r-lg">
                      <p className="text-[15px] text-gray-800 leading-[1.75] font-medium">
                        &quot;{post.archivedSentence}&quot;
                      </p>
                      <p className="text-[12px] text-gray-400 mt-3 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        {post.articleTitle}
                      </p>
                    </div>

                    {/* 유저 코멘트 */}
                    <div className="px-6 py-5">
                      <p className="text-[15px] text-gray-800 leading-[1.7]">
                        {post.userComment}
                      </p>
                    </div>

                    {/* 태그 */}
                    <div className="px-6 pb-4 flex flex-wrap gap-2">
                      {post.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-gray-50 rounded-md text-[11px] text-gray-500 font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* 반응 버튼 */}
                    <div className="px-6 py-4 border-t border-gray-50 flex items-center gap-2">
                      {/* 업다운 투표 그룹 */}
                      <div className="flex items-center bg-gray-50 rounded-full overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVote(post.id, 'up');
                          }}
                          className={`flex items-center gap-1 px-3 py-2 transition-all duration-200 ${
                            userVotes[post.id] === 'up'
                              ? 'text-emerald-600 bg-emerald-50'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          <svg className="w-4 h-4" fill={userVotes[post.id] === 'up' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <span className={`px-2 text-[13px] font-semibold min-w-[32px] text-center ${
                          userVotes[post.id] === 'up' ? 'text-emerald-600' :
                          userVotes[post.id] === 'down' ? 'text-rose-500' : 'text-gray-600'
                        }`}>
                          {post.upvotes}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVote(post.id, 'down');
                          }}
                          className={`flex items-center gap-1 px-3 py-2 transition-all duration-200 ${
                            userVotes[post.id] === 'down'
                              ? 'text-rose-500 bg-rose-50'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          <svg className="w-4 h-4" fill={userVotes[post.id] === 'down' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExpandComments(post.id);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all duration-200 ml-1 ${
                          expandedComments.has(post.id) ? 'bg-gray-100' : 'hover:bg-gray-50'
                        }`}
                      >
                        <svg className={`w-4 h-4 ${expandedComments.has(post.id) ? 'text-gray-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <span className={`text-[13px] ${expandedComments.has(post.id) ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>{post.commentCount}</span>
                        <svg className={`w-3 h-3 transition-transform duration-200 ${expandedComments.has(post.id) ? 'rotate-180 text-gray-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <div className="flex-1" />
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 transition-all duration-200"
                      >
                        <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-gray-50 transition-all duration-200"
                      >
                        <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                      </button>
                    </div>

                    {/* 인라인 댓글 섹션 */}
                    {expandedComments.has(post.id) && (
                      <div
                        className="border-t border-gray-100 bg-gray-50/50"
                        onClick={(e) => e.stopPropagation()}
                        style={{ animation: 'slideDown 0.2s ease-out' }}
                      >
                        <style>{`
                          @keyframes slideDown {
                            from { opacity: 0; max-height: 0; }
                            to { opacity: 1; max-height: 500px; }
                          }
                        `}</style>

                        {/* 댓글 입력 */}
                        <div className="px-6 py-4 border-b border-gray-100">
                          <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-amber-50 ring-1 ring-amber-100 flex-shrink-0">
                              <img loading="lazy"
                                src="https://api.dicebear.com/7.x/notionists/svg?seed=me&backgroundColor=fef3c7&scale=90"
                                alt="나"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 flex gap-2">
                              <input
                                type="text"
                                value={inlineComment[post.id] || ''}
                                onChange={(e) => setInlineComment(prev => ({ ...prev, [post.id]: e.target.value }))}
                                placeholder="댓글을 입력하세요..."
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-[14px] focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-transparent"
                              />
                              <button
                                onClick={() => handleAddComment(post.id)}
                                disabled={!inlineComment[post.id]?.trim()}
                                className="px-4 py-2.5 bg-blue-500 text-white rounded-full text-[13px] font-medium hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                              >
                                등록
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 댓글 목록 */}
                        <div className="px-6 py-4 space-y-4">
                          {(showAllComments.has(post.id) ? post.commentList : post.commentList.slice(0, 3)).map((comment, idx) => (
                            <div
                              key={comment.id}
                              className="flex gap-3"
                              style={{ animation: `fadeIn 0.3s ease-out ${idx * 0.05}s both` }}
                            >
                              <button
                                onClick={() => setSelectedUser({ userName: comment.userName, userMbti: comment.userMbti, userAvatar: comment.userAvatar })}
                                className="w-8 h-8 rounded-full overflow-hidden bg-gray-50 ring-1 ring-gray-100 hover:ring-gray-300 flex-shrink-0 transition-all"
                              >
                                <img loading="lazy"
                                  src={comment.userAvatar}
                                  alt={comment.userName}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <button
                                    onClick={() => setSelectedUser({ userName: comment.userName, userMbti: comment.userMbti, userAvatar: comment.userAvatar })}
                                    className="text-[13px] font-medium text-gray-900 hover:text-gray-600 transition-colors"
                                  >
                                    {comment.userName}
                                  </button>
                                  <span className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-bold text-gray-400 tracking-wide">{comment.userMbti}</span>
                                  <span className="text-[11px] text-gray-400">{comment.timeAgo}</span>
                                </div>
                                <p className="text-[14px] text-gray-700 leading-relaxed">{comment.text}</p>
                                <button className="mt-1.5 text-[12px] text-gray-400 flex items-center gap-1 hover:text-gray-600 transition-colors">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
                                  </svg>
                                  {comment.likes}
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* 댓글 더보기 */}
                          {post.commentList.length > 3 && !showAllComments.has(post.id) && (
                            <button
                              onClick={() => setShowAllComments(prev => new Set(prev).add(post.id))}
                              className="w-full py-3 text-[13px] text-gray-500 font-medium hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                            >
                              댓글 {post.commentList.length - 3}개 더보기
                            </button>
                          )}

                          {/* 접기 버튼 */}
                          {showAllComments.has(post.id) && post.commentList.length > 3 && (
                            <button
                              onClick={() => setShowAllComments(prev => {
                                const next = new Set(prev);
                                next.delete(post.id);
                                return next;
                              })}
                              className="w-full py-3 text-[13px] text-gray-500 font-medium hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                            >
                              접기
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* 사이드바 */}
          <div className="hidden lg:block w-[320px] flex-shrink-0">
            <div className="sticky top-20 space-y-5">
              {/* 글쓰기 CTA */}
              <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80">
                <p className="text-[14px] text-gray-600 leading-relaxed mb-4">
                  오늘 읽은 뉴스에서<br />인상 깊은 문장이 있나요?
                </p>
                <button
                  onClick={() => setShowWriteModal(true)}
                  className="w-full py-3.5 bg-blue-500 text-white rounded-xl text-[14px] font-semibold hover:bg-blue-600 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  내 문장 공유하기
                </button>
              </div>

              {/* 인기 글 */}
              <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80">
                <h4 className="text-[13px] font-bold text-gray-500 uppercase tracking-wide mb-5">이번 주 인기</h4>
                <div className="space-y-5">
                  <div className="group cursor-pointer">
                    <p className="text-[14px] text-gray-800 leading-relaxed line-clamp-2 mb-2 group-hover:text-gray-600 transition-colors">&quot;AI 반도체 점유율 32%로 1위를 탈환했다는 것은...&quot;</p>
                    <p className="text-[12px] text-gray-400 font-medium">추천 34</p>
                  </div>
                  <div className="h-px bg-gray-100" />
                  <div className="group cursor-pointer">
                    <p className="text-[14px] text-gray-800 leading-relaxed line-clamp-2 mb-2 group-hover:text-gray-600 transition-colors">&quot;전기차 배터리 가격이 kWh당 100달러 아래로...&quot;</p>
                    <p className="text-[12px] text-gray-400 font-medium">추천 89</p>
                  </div>
                </div>
              </div>

              {/* 공감온도 랭킹 */}
              <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100/80">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[13px] font-bold text-gray-500 uppercase tracking-wide">공감온도 TOP</h4>
                  <div className="flex bg-gray-100 rounded-lg p-0.5">
                    {[
                      { key: 'daily', label: '일' },
                      { key: 'weekly', label: '주' },
                      { key: 'monthly', label: '월' },
                    ].map((period) => (
                      <button
                        key={period.key}
                        onClick={() => setRankingPeriod(period.key as 'daily' | 'weekly' | 'monthly')}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                          rankingPeriod === period.key
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {period.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2.5">
                  {Object.entries(userProfiles)
                    .sort(([,a], [,b]) => b.temperature - a.temperature)
                    .slice(0, 5)
                    .map(([name, profile], idx) => {
                      return (
                        <button
                          key={name}
                          onClick={() => setSelectedUser({ userName: name, userMbti: profile.mbti, userAvatar: profile.avatar })}
                          className="w-full flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-gray-50 transition-colors"
                        >
                          {/* 순위 */}
                          <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${
                            idx === 0 ? 'bg-amber-100 text-amber-600' :
                            idx === 1 ? 'bg-gray-200 text-gray-600' :
                            idx === 2 ? 'bg-orange-100 text-orange-600' :
                            'text-gray-400'
                          }`}>
                            {idx + 1}
                          </span>

                          {/* 아바타 */}
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-50 ring-1 ring-gray-100">
                            <img loading="lazy"
                              src={profile.avatar}
                              alt={name}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* 정보 */}
                          <div className="flex-1 text-left">
                            <span className="text-[13px] font-medium text-gray-900">{name}</span>
                          </div>

                          {/* 온도 */}
                          <span className={`text-[13px] font-bold ${getTemperatureColor(profile.temperature)}`}>
                            {profile.temperature.toFixed(1)}°
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
