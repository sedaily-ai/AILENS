'use client';

import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { CmsVideo, CmsWebtoon, CmsLens } from "@/shared/lib/cmsPostsApi";
import type { ArchiveItem } from "@/shared/lib/archiveItems";
import type { Term } from "../lib/wordsTerms";
import type { TodayLetterCardLike } from "@/shared/lib/todayLettersApi";
import { WebtoonPreviewSection } from "./WebtoonPreviewSection";
import { WordsPreviewSection } from "./WordsPreviewSection";
import { HomeHeroCarousel } from "./HomeHeroCarousel";
import { VideoPreviewSection } from "./VideoPreviewSection";
import { LensPreviewSection } from "./LensPreviewSection";
import { NewsTimeMachineSection } from "./NewsTimeMachineSection";
import { LatestGridSection } from "./LatestGridSection";
import { CategoryFeatureSection } from "./CategoryFeatureSection";
import { HomeSideBar } from "./HomeSideBar";
import { ECON_CATEGORIES } from "@/shared/constants/econCategories";

// 카테고리 2개씩 짝지어 한 줄(2/3+1/3)로 배치(2026-08-17, 본지 en.sedaily.com
// 참고 — 로컬 경로 1_ailink/globe/dev/frontend/src/components/home/HeroSection.tsx
// 의 Markets+Property, Politics+Society, Culture+International 페어링과 동일
// 원칙). 순서는 ECON_CATEGORIES 정의 순서(증시/부동산/산업/금융·정책/국제/재테크)를
// 그대로 2개씩 묶는다.
const CATEGORY_PAIRS: readonly [string, string][] = [
  ['markets', 'property'],
  ['industry', 'finance'],
  ['international', 'investing'],
];

function CategoryPairRow({
  pair,
  archiveItems,
  first,
}: {
  pair: readonly [string, string];
  archiveItems: ArchiveItem[];
  first: boolean;
}) {
  const [wideSlug, narrowSlug] = pair;
  const wideCfg = ECON_CATEGORIES.find((c) => c.slug === wideSlug)!;
  const narrowCfg = ECON_CATEGORIES.find((c) => c.slug === narrowSlug)!;
  const wideItems = archiveItems.filter((it) => it.category === wideCfg.label);
  const narrowItems = archiveItems.filter((it) => it.category === narrowCfg.label);
  if (wideItems.length === 0 && narrowItems.length === 0) return null;
  // 행 사이 구분선을 2px 검정에서 1px 연회색으로 낮췄다(2026-08-17, 사용자
  // 피드백: "하단에 선도 좀 어색하지 않나요, 검정색 선이요" — 본지의 굵은
  // "지면 구분선"을 그대로 따라했는데, 우리 페이지 나머지 구분선(카테고리
  // 섹션 내부 리스트, 최신 뉴스 등)은 전부 옅은 회색이라 이 진한 검정선만
  // 튀었다).
  return (
    <div style={{ borderTop: first ? 'none' : '1px solid #e5e7eb', paddingTop: first ? 0 : 32 }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8" style={{ marginTop: 32, marginBottom: 32 }}>
        <CategoryFeatureSection config={wideCfg} items={wideItems} span="wide" />
        <CategoryFeatureSection config={narrowCfg} items={narrowItems} span="narrow" />
      </div>
    </div>
  );
}

interface Props {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  calendarMonth: Date;
  setCalendarMonth: (date: Date) => void;
  showCalendar: boolean;
  setShowCalendar: (show: boolean) => void;
  selectedGroup: MbtiGroupId;
  onMbtiChange?: (group: MbtiGroupId) => void;
  // 빌드타임(app/page.tsx) 서버 프리페치 값 — 각 섹션에 그대로 하향 전달
  // (2026-08-07, 홈 SSG 감사). 없으면 각 섹션이 기존처럼 클라이언트에서 로드.
  initialWebtoons?: CmsWebtoon[];
  initialVideos?: CmsVideo[];
  initialWordTerms?: Term[];
  initialLensPosts?: CmsLens[];
  // "최신 뉴스" 그리드 + 카테고리 레일이 공유하는 letters 원본(2026-08-17,
  // 홈 구조 개편) — 한 번만 fetch해서 최신순 슬라이스와 카테고리별 필터
  // 양쪽에 다 쓴다(app/page.tsx 참조).
  initialArchiveItems?: ArchiveItem[];
  // "요즘 가장 많이 읽힌 글"(HomeSideBar → HotLettersRail) 서버 프리페치.
  initialHotLetters?: TodayLetterCardLike[];
}

export function NewsFeedTab({
  initialWebtoons,
  initialVideos,
  initialWordTerms,
  initialLensPosts,
  initialArchiveItems,
  initialHotLetters,
}: Props) {
  const archiveItems = initialArchiveItems ?? [];

  return (
    <div className="min-h-screen bg-white">
      {/* Noto Serif KR 로딩은 layout.tsx <head>의 <link> 하나로 통합했다
          (2026-08-06 폰트 감사 — 이 컴포넌트를 포함해 3곳이 각자 렌더 블로킹
          @import를 중복 실행하고 있었음). */}
      <style>{`
        .editorial-title {
          font-family: 'Noto Serif KR', serif;
        }
      `}</style>

      {/* 우측 사이드바 재도입(2026-08-17) — "우측 사이드 치우시죠"로 뺐던 걸
          "넓은 화면에서 오른쪽 여백이 아깝다"는 재검토로 다시 붙였다.
          처음엔 SideRail.tsx 전체(사주 궁합 미니앱 포함) 대신 "요즘 가장
          많이 읽힌 글"만 뽑았다(사용자 확인: "인기글만") — 사주 위젯이
          토스 블루라 색 체계와 부딪히고 캐러셀 사주 배너와 겹친다는 이유.
          그런데 "사주도 넣긴 넣어주세요, 톤앤매너 맞춰주시고 세련되고
          트렌디하게"라는 재요청으로 사주 궁합도 다시 넣었다 — 다만 토스
          블루(#3182F6)는 이 서비스의 violet(검색 아이콘·국제 카테고리
          accent와 같은 "AI" 신호)로 전부 재색칠(SajuMiniRail.tsx). 인기글
          (HotLettersRail.tsx) + 사주(SajuMiniRail.tsx)를 HomeSideBar.tsx가
          하나의 sticky 컨테이너로 묶는다.
          maxWidth를 1000→1320으로 넓히고 CSS Grid 2열(본문 1fr + 사이드바
          280px)로 바꿨다 — lg 미만에서는 사이드바가 아예 안 뜬다(HomeSideBar
          의 className="hidden lg:block").
          웹툰 섹션은 처음엔 뷰포트 끝까지 번지는 진짜 full-bleed였는데,
          그러려면 그리드 두 칼럼을 가로질러야 했고(gridColumn:'1 / -1') 그
          과정에서 grid-template-rows를 명시 안 해 사이드바의 gridRow:'1/-1'
          이 첫 행 하나로 접히면서 본문과 겹치는 버그가 났었다(2026-08-17,
          "지금 이렇게 나오는건뭐지?"). 그런데 사이드바가 생긴 뒤로 다시
          보니 뷰포트 끝까지 번지는 배경 자체가 "사이드바 존재를 무시하고
          화면을 가로지르는" 것처럼 어색해 보인다는 재피드백("모서리까지
          색깔 칠하지 마시죠... 밸런스 맞춰주시죠")으로 웹툰을 다시 컨테이너
          안 둥근 카드로 되돌렸다(WebtoonPreviewSection.tsx 참조) — 그 덕에
          웹툰도 다른 섹션들과 똑같이 본문 칼럼(gridColumn:1) 안에 그냥
          두면 되고, 행을 나눠 관리할 필요도, 사이드바를 gridRow로 억지로
          이어붙일 필요도 없어졌다 — 사이드바는 그냥 gridColumn:2 하나로 본문
          칼럼 전체 높이만큼 자연스럽게 늘어난다(그리드 기본 동작). */}
      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
          <div style={{ gridColumn: 1 }}>
            {/* 홈 히어로 배너(2026-08-06) — "신문 읽는 스타일" 이벤트 단일 배너였다가
                "점박이(캐러셀 도트) 있어야 배너답다, 웹툰·사주도 같이 소개하자"는
                피드백으로 3슬라이드 캐러셀(HomeHeroCarousel.tsx)로 확장. */}
            <HomeHeroCarousel />

            {/* "최신 뉴스" 히어로 자리+그리드+전체보기(2026-08-17, 배너 바로
                아래 — 사용자가 스크린샷으로 히어로 위치를 정확히 짚어 확인).
                히어로 자리는 오늘의 "4가지 시선" 이슈로 고정(heroSlot에
                <LensPreviewSection/>을 그대로 넘김 — 카드로 축약하지 않고
                원래 디자인 그대로, 삭제·병합 아님). 별도 섹션으로 또 나열
                하면 같은 이슈가 두 번 보이는 중복이라 여기 히어로 자리
                하나로 합쳤다. 시선 발행이 없는 날은 heroSlot이 undefined가
                되어 예전처럼 최신 글이 히어로가 된다.
                예전엔 형식 기준으로 "이슈 톡톡"(FollowingFeed)과 "인사이트"
                (ColumnPreviewSection) 두 섹션이 따로 있었는데, 상단 탭을
                형식(브리핑/인사이트)에서 주제(증시/부동산/...) 기준으로 갈아
                엎은 김에 홈도 맞췄다. */}
            <LatestGridSection
              items={archiveItems}
              heroSlot={initialLensPosts?.length ? <LensPreviewSection initialItems={initialLensPosts} /> : undefined}
            />

            {/* 카테고리 섹션(2026-08-17, 본지 en.sedaily.com 스타일 참고 — 사용자
                확인: "본지형식대로 해보시죠"). 한때 카테고리 레일(그리드형)로
                만들었다가 "레일 헤더와 카드 태그가 완전히 같은 단어라 순수
                중복"이라는 지적으로 뺐었는데, 본지 스타일은 그 문제가 없다 —
                카드마다 카테고리 태그를 다시 안 붙이고(헤더 하나로 충분하다고
                봄) 큰 히어로+작은 리스트 조합으로 "신문 지면"처럼 배치한다
                (CategoryFeatureSection.tsx 참조). 2개씩 짝지어 2/3+1/3 한 줄에
                배치, 얇은 가로선으로 구분 — 콘텐츠 없는 카테고리는 자동으로
                숨는다.
                첫 번째 짝(증시+부동산)만 여기서 먼저 그리고, 타임머신 섹션을
                그 바로 아래 끼워 넣은 뒤 나머지 짝(산업+금융정책, 국제+재테크)을
                잇는다(2026-08-17, 사용자 확인: "타임라인 이거 산업 부분 위쪽에
                끼어 넣어주시죠"). */}
            <CategoryPairRow pair={CATEGORY_PAIRS[0]} archiveItems={archiveItems} first />

            {/* 타임머신이 메인 훅(2026-08-17, 사용자 확인: "메인은 타임라인
                뉴스보다도 생일 뉴스, 타임머신 타고 날아가는 게 메인"). 원래
                "그날의 지면"(TimelinePreviewSection)과 "생일 뉴스 타임머신"
                (BirthdayTimeMachineSection)이 따로 있었는데 "통합해야죠, 두
                개 다 있으면 안 됩니다"(같은 날) 피드백으로 하나로 합쳤다 —
                최근 날짜는 실시간 S3 지면, 그 이전은 빅카인즈 예시.
                NewsTimeMachineSection.tsx 상단 주석 참조.
                위치: 카테고리 섹션 첫 짝(증시+부동산) 바로 아래, 산업 짝 바로
                위(2026-08-17, 사용자 확인). */}
            <NewsTimeMachineSection />

            <CategoryPairRow pair={CATEGORY_PAIRS[1]} archiveItems={archiveItems} first={false} />

            {/* 웹툰 파일럿(2026-08-06) — 처음엔 상단 슬림 배너였는데 "실제
                콘텐츠처럼 안 보인다"는 피드백으로 카드형으로 교체
                (WebtoonPreviewSection.tsx). 위치: 국제+재테크 짝(카테고리
                마지막 줄) 바로 위(2026-08-17, 사용자 확인: "웹툰 부분은...
                국제.. 재테크 바로 위쪽으로"). */}
            <WebtoonPreviewSection initialItems={initialWebtoons} />

            <CategoryPairRow pair={CATEGORY_PAIRS[2]} archiveItems={archiveItems} first={false} />

            {/* 섹션 재정렬(2026-08-06) — "단어 퀴즈는 문제 하나뿐이라 자리를
                많이 안 차지하니 가볍게 매일 훑는 습관을 만들고 싶다"는 피드백. */}
            <WordsPreviewSection initialTerms={initialWordTerms} />

            {/* 영상 콘텐츠(2026-08-06) — admin이 YouTube 링크를 CMS에 붙여넣으면
                뜬다(VideoPreviewSection.tsx). 실제 영상이 없으면 섹션 자체를
                숨긴다 — 목업으로 안 채운다. */}
            <VideoPreviewSection initialVideos={initialVideos} />
          </div>

          <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />
        </div>
      </div>

      {/* 뉴스레터 구독 섹션 삭제(2026-08-06 피드백) — onboarding 페이지엔
          NewsletterCTA가 그대로 남아있어 컴포넌트 자체는 안 지웠다. */}

      {/* 하단 여백 */}
      <div className="h-32" />
    </div>
  );
}
