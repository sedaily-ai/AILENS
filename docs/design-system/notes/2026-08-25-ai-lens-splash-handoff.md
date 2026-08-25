# AI LENS — 스플래시 핸드오프

디자이너가 넘긴 핸드오프 원문을 저장소에 편입한 것. 구현은
`service/frontend/src/shared/ui/SplashScreen/` 에 있다.

**Figma 원본** · [AI LENS — Splash](https://www.figma.com/design/1zZLeqJYPfOdj3yc5Q67aW/AI-LENS-%E2%80%94-Splash?node-id=9-11&m=dev)
`Page 1` 첫 번째 줄, `01 Empty` → `08 Handoff` (8프레임 스토리보드)

단일 정지 화면이 아니라 **애니메이션 8키프레임**이다. 각 프레임은 타임라인의 한 순간이고,
`07 Lockup` (node `9:2`) 이 완성 상태다.

---

## 1. 저장소에 편입된 것

핸드오프 원본은 미리보기 HTML·CSS·JSX·SVG 4개 파일이었다. 이 저장소는 Next.js
App Router + FSD 구조라, 미리보기용 단독 HTML 은 넣지 않고 나머지를 프로젝트
관례에 맞춰 옮겼다.

| 핸드오프 파일 | 저장소 위치 |
|---|---|
| `ai-lens-splash.css` | `service/frontend/src/shared/ui/SplashScreen/splash.css` (원본 그대로) |
| `AILensSplash.jsx` | `service/frontend/src/shared/ui/SplashScreen/SplashScreen.tsx` (TS + 프로젝트 관례로 이식) |
| `ai-lens-mark.svg` | `service/frontend/public/ai-lens-mark.svg` |
| `ai-lens-splash.html` | 미편입 — 미리보기 전용 |

CSS 상단 `--ails-*` 변수만 건드리면 색·크기·타이밍 전부 조절된다.

---

## 2. 디자인 토큰

### 색상

| 역할 | HEX | 비고 |
|---|---|---|
| 배경 | `#FFFFFF` | |
| Piece 1 (좌상) | `#4285F4` | Blue |
| Piece 2 (우상) | `#EA4335` | Red |
| Piece 3 (우하) | `#F5A623` | Amber |
| Piece 4 (좌하) | `#4FB27B` | Green |
| Wordmark | `#0B0B0B` | |
| Tagline | `#6B7380` | |
| Publisher | `#ADB2BA` | |

### 타이포 — Noto Sans KR (400 / 500 / 900 필요)

| 요소 | 내용 | 크기 | 웨이트 | 행간 | 자간 |
|---|---|---|---|---|---|
| Wordmark | `AI LENS` | 28px | 900 | 38px | -0.4px |
| Tagline | `같은 이슈, 네 가지 시선` | 13px | 400 | 20px | 0 |
| Publisher | `서울경제신문` | 11px | 500 | 16px | 0.8px |

> 웹폰트가 늦게 뜨면 스플래시에서 폰트가 바뀌는 게 그대로 보인다.
> Noto Sans KR 900/400/500 서브셋을 `<link rel="preload">` 로 먼저 불러야 한다.

⚠️ **현재 미해결** — 이 사이트는 Pretendard(400~800)만 self-host 하고 Noto Sans KR 은
로드하지 않는다(`service/frontend/src/app/layout.tsx`). 그래서 지금은 워드마크 900 이
폴백된다. 폰트를 추가하면 성능 예산에 영향이 있어 별도 결정이 필요하다.

### 마크 지오메트리

- 전체 112 × 112
- 조각 하나 54 × 54, 조각 사이 갭 4px (십자 형태)
- 각 조각의 **바깥쪽 모서리에만** radius 54px → 정사각형이 사분원이 됨
- 그림자(정지 상태): 대각 오프셋 ±1.555px, blur 10px, 각 조각 색상 alpha 0.18

### 레이아웃 (390 × 844 기준)

```
마크 중심        y 362
마크 아래 여백    30px
Wordmark        y 448
Wordmark 아래    6px
Tagline         y 492
Publisher       화면 하단에서 52px (safe-area 포함)
```

마크+Wordmark+Tagline 묶음은 화면 정중앙에서 **13px 위**에 놓인다.
CSS 에서 `.ails__stack { transform: translateY(-13px) }` 로 처리했다.

---

## 3. 타임라인

⚠️ **Figma 에는 시간값이 없다.** 아래 duration/delay 는 프레임 간 델타를 보고
디자이너가 제안한 값이라 **개발자가 조절 가능한 영역**이다. `--ails-t-*` 변수로 다 빠져 있다.

| 시각 | 프레임 | 동작 | duration |
|---|---|---|---|
| 100ms | `02 Piece 1` | 좌상 Blue 진입 | 320ms |
| 220ms | `03 Piece 2` | 우상 Red 진입 | 320ms |
| 340ms | `04 Piece 3` | 우하 Amber 진입 | 320ms |
| 460ms | — | 좌하 Green 진입 | 320ms |
| 780ms | `05 Impact` → `06 Settle` | 마크 전체 112 → 120 → 112 펄스 | 360ms |
| 1000ms | `07 Lockup` | Wordmark 페이드 + 8px 상승 | 400ms |
| 1100ms | | Tagline 페이드 + 8px 상승 | 400ms |
| 1200ms | | Publisher 페이드 + 6px 상승 | 400ms |
| ~1600ms | | 진입 완료 · 홀드 | |
| (앱 준비되면) | `08 Handoff` | 마크 1.30배 확대 + 전체 페이드아웃, 텍스트 6px 추가 상승 | 360ms |

**조각 진입 모션**: 각 조각은 자기 대각선에서 약 82° 틀어진 방향에서 들어온다
(좌상은 위에서, 우상은 오른쪽에서, 우하는 아래에서, 좌하는 왼쪽에서).
그래서 단순히 모이는 게 아니라 **조리개가 닫히듯 회전하며** 맞물린다.
시작 상태는 opacity 0 · scale 0.852 · 그림자 alpha 0.34(더 진하고 넓게).
이 회전감이 이 스플래시의 핵심이라 축소해서 단순 페이드로 바꾸지 말 것.

---

## 4. 연동 방식

진입은 자동 재생, **퇴장은 앱이 제어**한다.

```js
// 앱 부팅이 끝나면
splashEl.classList.add('is-leaving');
setTimeout(() => splashEl.remove(), 360);
```

React 구현(`SplashScreen.tsx`)은 `ready` prop / `onDone` 콜백으로 같은 동작을 한다.

**최소 노출 시간 1600ms**(`minVisibleMs`)를 걸어뒀다. 앱이 그보다 빨리 준비돼도 진입
시퀀스가 중간에 끊기지 않게 하려는 것이고, 반대로 로딩이 더 걸리면 락업 상태로 계속
대기한다. 이 값이 길면 `minVisibleMs` 만 줄이면 된다.

---

## 5. 이미 처리해둔 것

- `prefers-reduced-motion: reduce` → 모션 전부 끄고 `07 Lockup` 상태로 즉시 표시, 페이드로만 퇴장
- `env(safe-area-inset-bottom)` → 노치/홈 인디케이터 기기에서 Publisher 위치 보정
- `role="status"` + `aria-label` → 스크린리더 대응, 마크는 `aria-hidden`
- 마크는 순수 CSS(div 4개)라 이미지 로딩 대기 없이 첫 프레임부터 그려짐

---

## 6. 확인 필요 (디자이너 → 개발)

1. **모바일 전용** — 확인됨(2026-08-25). Figma 는 390×844 모바일 프레임만 있다.
   데스크톱까지 쓰려면 `--ails-mark` 한 줄로 마크 크기를 키우는 게 낫다.
2. **웹인가 앱인가** — 웹. 네이티브 앱이라면 OS 기본 스플래시(정적 이미지)가 먼저 뜨고
   그 위에 이 애니메이션이 얹히는 구조라 배경색을 맞춰 이음새를 없애야 한다.
3. **재방문 시에도 매번 재생할지** — 미결정. 세션당 1회만 보여주는 편이 일반적.

## 7. 아직 안 한 것

이 컴포넌트는 **아직 어디에도 마운트하지 않았다.** 모든 방문자의 첫 진입 경험을
바꾸는 변경이라 아래를 정하고 붙여야 한다.

- 노출 지점(전역 layout vs 특정 라우트)
- 모바일 판별 방식(미디어쿼리로 숨김 vs 모바일에서만 마운트 — 후자가 불필요한 DOM·
  애니메이션을 아예 안 만든다)
- 재생 빈도(§6-3)
- Noto Sans KR 로드 여부(§2)
