# 2026-08-25 mustknow-auto 지면특별코너 4탭 임계값 수정 + TWA 다크모드 1차 수정

작성: 문영광 + Claude Code
관련: `pipelines/mustknow_auto/run.py`, `mobile/app/src/main/res/values/styles.xml`,
`mobile/app/src/main/AndroidManifest.xml`, `service/frontend/src/app/layout.tsx`,
`service/frontend/src/app/globals.css`

## 배경

사용자가 앱 실기기에서 검정 배경 화면을 두 번 신고(스플래시 포함 전체가 반전),
같은 날 증권/산업/시그널 지면특별코너 탭에 2026-08-21자 기사만 계속 뜬다고 신고.
둘 다 원인 진단부터 다시 해야 했다.

## 한 것

### mustknow-auto 지면특별코너 4탭 정체
- CloudWatch 로그 확인 — `mustknow-auto` 파이프라인(가동 2026-08-22) 완료 로그가
  8/23 이후 계속 `"증권": 0, "산업": 0, "시그널": 0`으로 찍힘.
- DynamoDB(`sedaily-mbti-cms-posts-dev`) 직접 스캔 — 가동 후 3일간 발행된 249건
  전부 `paper_section` 미부여 확인. 탭에 단 한 건도 배정된 적 없었음.
- `classify.score_articles()`를 오늘자(8/25) 증권/산업/시그널 실제 후보 37건에
  재실행 — 최고점 7.0(1건)뿐, `_TAB_THRESHOLD = 8.0` 이상 0건. 5개 지표
  (파급력/시의성/사실데이터밀도/정책제도변화/이례성) 평균 8.0은 개별 기업·증시
  뉴스 구조상 도달 불가능한 기준이었음(8~10점대 앵커가 "전국민급 파급력" 요구).
- `run.py` 수정: `_TAB_THRESHOLD` 8.0→6.5. 3) 선정 로직을 "임계값 게이트"에서
  "점수 내림차순 정렬 후 상위 N개(캡 4)" 로 변경 — 임계값 미달이어도 그날
  최선의 근사치로 탭 정원을 채우도록(사용자 명시 지침). 조기 seen 확정 로직도
  증권/산업/시그널 카테고리는 건너뛰도록 수정(폴백 후보가 미리 소진되는 버그
  방지).
- Docker 이미지 재빌드+ECR push, `sedaily-lens-mustknow-auto` 태스크 수동
  run-task로 검증 — 첫 실행은 이미 seen 마킹된 후보 때문에 1건만 스코어링,
  99개 조기-seen 처리된 증권/산업/시그널 후보를 DDB에서 직접 언마킹 후 재실행.
  두 번째 실행에서 증권 3건 발행 후 hang(원인 미상, 아마 웹툰/영상 생성 단계) →
  stop-task 후 재실행하니 8/26 자동 스케줄이 증권 4건·산업 4건 추가 발행.

### TWA 검정 화면 1차 수정
- `mobile/app/src/main/res/values/styles.xml` 신규 `AppTheme` —
  `android:windowBackground=@color/backgroundColor`(흰색) — 부트웹랩 기본
  `Theme.Translucent.NoTitleBar`가 windowBackground를 안 정해서 LauncherActivity
  기동~SPLASH_IMAGE_DRAWABLE 사이 짧은 틈에 검정이 비치던 문제.
- 같은 스타일에 `android:forceDarkAllowed=false` 추가 — Android 10+ 자동
  다크 반전이 앱 콘텐츠 전체를 뒤집는 걸 막으려는 시도(→ 8/26 근본 원인
  아니었음이 재확인됨, 별도 worklog 참조).
- `service/frontend`에 `<meta name="color-scheme" content="light">` +
  `globals.css`의 `color-scheme: light` — 크롬 웹 콘텐츠 자동 다크 테마 방지
  (→ 이것도 근본 원인 아니었음, 8/26에 `light only`로 강화했다가 결국
  삼성 인터넷 자체 문제로 결론).
- `mobile/twa-manifest.json` `appVersionCode` 4→5→6, 매 `bubblewrap build`마다
  `styles.xml`/`AndroidManifest.xml`의 `android:theme` 수동 재패치 필요함을
  재확인(`bubblewrap update`가 `app/src/main/res/` 전체를 재생성하며 삭제).

## 결정

- mustknow-auto 탭 선정은 "발행 여부 게이트"가 아니라 "정렬 우선순위"로 역할
  변경 — 절대 품질 기준보다 "탭이 항상 채워져야 한다"는 제품 요구가 우선.
- 8/25 시그널 탭은 파이프라인 hang + 자정 날짜 롤오버로 결국 못 채움 → 8/26
  아침지면으로 나가는 신문 관행에 맞춰 수동 백필로 처리(별도 8/26 worklog).

## 다음

- 8/25 증권/산업/시그널 근사치 폴백이 실제로 매일 안정적으로 탭을 채우는지
  이후 정기 실행(6x/day) 로그로 며칠 더 확인 필요.
- TWA 검정 화면은 이 시점엔 미해결로 판명(8/26 worklog에서 근본 원인 확인).
