# Phase 3: FSD 구조 전환 작업 기록

## 작업일: 2026-04-05

## 완료된 작업

### 1. 탭 컴포넌트 추출 (FeedPage.tsx → 개별 컴포넌트)

FeedPage.tsx에서 각 탭을 독립 컴포넌트로 분리:

| 탭 | 원본 위치 | 새 위치 | 라인 수 |
|---|---|---|---|
| QuestionTab | FeedPage.tsx | src/components/mbti/tabs/QuestionTab.tsx | ~500줄 |
| NewsFeedTab | FeedPage.tsx | src/components/mbti/tabs/NewsFeedTab.tsx | ~600줄 |
| CommunityTab | FeedPage.tsx | src/components/mbti/tabs/CommunityTab.tsx | ~700줄 |
| ArchiveTab | FeedPage.tsx | src/components/mbti/tabs/ArchiveTab.tsx | ~450줄 |
| DnaTab | FeedPage.tsx | src/components/mbti/tabs/DnaTab.tsx | ~380줄 |

**FeedPage.tsx 라인 수 변화**: ~3,837줄 → 1,858줄 (약 52% 감소)

### 2. FSD 구조로 features 폴더 생성

```
src/features/
├── auth/           (이전 세션에서 완료)
├── news-feed/
│   ├── components/
│   │   └── NewsFeedTab.tsx
│   └── index.ts
├── question/
│   ├── components/
│   │   └── QuestionTab.tsx
│   └── index.ts
├── community/
│   ├── components/
│   │   └── CommunityTab.tsx
│   └── index.ts
├── archive/
│   ├── components/
│   │   └── ArchiveTab.tsx
│   └── index.ts
└── news-dna/
    ├── components/
    │   └── DnaTab.tsx
    └── index.ts
```

### 3. shared 레이어 확장

새로 생성된 파일:
- `src/shared/types/mbti.ts` - MBTI 관련 타입 정의
  - MbtiVersion, MbtiArticle, ArchivedSentence, TextSelection
  - Persona, personaInfo
  - TabType, DnaSubTab, DnaViewMode
- `src/shared/utils/dateUtils.ts` - 날짜 유틸리티
  - formatDateStr, getWeekDays, isSameDay, getMonthDays
- `src/shared/utils/textUtils.ts` - 텍스트 유틸리티
  - cleanMarkdown, getBodyText
- `src/shared/ui/ScrollReveal.tsx` - 스크롤 애니메이션 컴포넌트

### 4. Import 경로 업데이트

FeedPage.tsx의 import를 FSD 경로로 변경:
```typescript
// 변경 전
import { QuestionTab } from "./tabs/QuestionTab";
import { NewsFeedTab } from "./tabs/NewsFeedTab";
...

// 변경 후
import { QuestionTab } from "@/features/question";
import { NewsFeedTab } from "@/features/news-feed";
import { CommunityTab } from "@/features/community";
import { ArchiveTab } from "@/features/archive";
import { DnaTab } from "@/features/news-dna";
```

## 빌드 상태

✅ 빌드 성공 (`npm run build` 통과)

## 남은 작업 (다음 세션)

1. **tabs 폴더 정리**
   - src/components/mbti/tabs/ 폴더의 원본 파일들 삭제
   - (features로 이동 완료된 파일들)

2. **FeedPage.tsx 추가 분리**
   - FeedPage.tsx를 src/pages/ 또는 widgets/로 이동
   - ArticleView 등 나머지 컴포넌트들 분리

3. **entities 레이어 구성**
   - entities/article/ - 기사 도메인 모델
   - entities/user/ - 사용자 도메인 모델
   - entities/post/ - 게시글 도메인 모델

4. **widgets 레이어 구성**
   - Header, BottomNav, AudioPlayer 등

5. **의존성 방향 검증**
   - ESLint boundaries 플러그인으로 FSD 규칙 강제

## 현재 폴더 구조

```
src/
├── app/                    # Next.js 라우팅
├── components/
│   └── mbti/
│       ├── FeedPage.tsx    # 메인 피드 (1,858줄)
│       ├── ArticleView.tsx
│       └── tabs/           # ← 이 폴더 정리 필요
├── features/               # FSD features (완료)
│   ├── auth/
│   ├── news-feed/
│   ├── question/
│   ├── community/
│   ├── archive/
│   └── news-dna/
└── shared/                 # 공통 레이어
    ├── config/
    ├── data/
    ├── hooks/
    ├── types/
    ├── ui/
    └── utils/
```

## 참고사항

- 모든 변경사항은 빌드 성공 확인 후 적용됨
- 테스트 코드가 없으므로 동작 보존에 주의
- 리팩토링 원칙: 구조만 변경, 로직 변경 없음
