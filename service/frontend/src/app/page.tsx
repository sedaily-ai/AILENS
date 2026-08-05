'use client';

import { useState, useEffect, Suspense } from "react";
import { StoryNewsFeed } from "@/components/story/StoryNewsFeed";
import { FeedPage } from "@/components/mbti/FeedPage";
import { OnboardingPage } from "@/components/mbti/OnboardingPage";
import { BriefingPage } from "@/components/mbti/BriefingPage";
import { groupToDefaultMbti, type MbtiGroupId } from "@/shared/data/mbtiGroups";
import { useMbtiGroup } from "@/shared/hooks/useMbtiGroup";
import { getSavedMbtiGroup } from "@/shared/lib/mbtiGroupStorage";

type ViewMode = "story" | "feed" | "editor-select" | "briefing";

function HomeContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  // 신규/온보딩 미완 사용자도 바로 메인 피드 노출 (기본 그룹 SF).
  // 페르소나 변경은 헤더 우측 '내 시각' 토글 또는 'editor-select' 모드에서 사용자가 직접.
  const [userGroup, setUserGroup] = useMbtiGroup("SF");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Round 5-G: backfill 4-char MBTI for legacy users who only have group.
    const savedGroup = getSavedMbtiGroup();
    if (savedGroup && !localStorage.getItem("mbti-type")) {
      localStorage.setItem("mbti-type", groupToDefaultMbti[savedGroup]);
    }
    setReady(true);
  }, []);

  const handleSwitchToFeed = () => {
    setViewMode("feed");
  };

  const handleSwitchToStory = () => {
    setViewMode("story");
  };

  const handleChangeGroup = () => {
    setViewMode("editor-select");
  };

  const handleSelectGroup = (group: MbtiGroupId) => {
    setUserGroup(group);
    setViewMode("feed");
  };

  const handleStartBriefing = (group: MbtiGroupId) => {
    setUserGroup(group);
    setViewMode("briefing");
  };

  const handleFinishBriefing = () => {
    setViewMode("feed");
  };

  const handleMbtiChange = (group: MbtiGroupId) => {
    setUserGroup(group);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-gray-300 text-sm">잠시만요...</div>
      </div>
    );
  }

  if (viewMode === "briefing") {
    return (
      <BriefingPage
        groupId={userGroup}
        onFinish={handleFinishBriefing}
        onBack={handleChangeGroup}
      />
    );
  }

  if (viewMode === "editor-select") {
    return (
      <OnboardingPage
        onSelectGroup={handleSelectGroup}
        onStartBriefing={handleStartBriefing}
        onBack={handleSwitchToFeed}
      />
    );
  }

  if (viewMode === "story") {
    return (
      <StoryNewsFeed
        onComplete={(preferences) => {
          if (preferences.categories.includes("경제") || preferences.categories.includes("IT_과학")) {
            setUserGroup("NT");
          } else if (preferences.categories.includes("국제") || preferences.categories.includes("정치")) {
            setUserGroup("NF");
          } else if (preferences.categories.includes("산업")) {
            setUserGroup("ST");
          }
          setViewMode("feed");
        }}
        onSwitchToFeed={handleSwitchToFeed}
      />
    );
  }

  return (
    <FeedPage
      selectedGroup={userGroup}
      onChangeGroup={handleChangeGroup}
      onSwitchToStory={handleSwitchToStory}
      onMbtiChange={handleMbtiChange}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/50"></div></div>}>
      <HomeContent />
    </Suspense>
  );
}
