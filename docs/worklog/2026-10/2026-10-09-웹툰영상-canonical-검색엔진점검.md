# 2026-10-09 웹툰·영상 canonical 통합(C안) + 검색엔진 전수 점검

## 배경
- 웹툰·영상 상세가 기사 본문과 67~93% 겹쳐 색인 신호가 분산. 오디오는 이미 기사로 통합됨.
- 9개 분류 개편 후 남은 구멍이 있는지 전수 점검 요청.

## 한 것
- 웹툰·영상 canonical·og:url·hreflang을 기사(lens) 정본으로 변경, 페이지·이동 경로는 유지. JSON-LD `@id`는 자기 주소, mainEntityOfPage만 기사.
- 사이트맵에서 /webtoon·/video 제거(8,174 → 약 3,300건), 기사 항목에 영상 확장(video_url 있을 때) 추가.
- 기사 JSON-LD에 VideoObject 추가(video_url 있는 글만), 단위 테스트 추가.
- middleware `page/1` 대상에 economy·politics·national 추가, `/signal/page/1` 이중 이동 제거.
- llms.txt를 9개 분류로 재작성, 홈 피드에 경제·정치·사회 섹션 추가.
- 기사 메타·라벨·이웃/관련 기사 비교·RSS·llms-full·news-sitemap의 분류명을 새 이름으로 일원화, 미분류 글의 /news(404) 링크 제거.
- 분류 뒷장(/{slug}/page/N) noindex,follow, 루트 메타 문구 갱신.

## 이어서 한 것 (같은 날 오후)
- 사이트맵 영상 확장 복구: 기사 목록 API가 lenses[].video_url을 비워 내려줘 0건이었음. 영상 채널 목록(fetchAllVideos)을 기사 id(-video 제거)로 연결해 0 → 2,270건. XML 파싱 확인(제목의 & 이스케이프).
- 목록 썸네일 alt에 기사 제목 부여(분류·홈 빈 alt 34 → 10건, 남은 건 아바타·아이콘 등 장식용).
- 기사 description 보강: 요약이 비거나 60자 미만이면 핵심 문장을 이어 붙임(최소 23 → 62자, 최근 60건 중 8건은 요약이 비어 있었음).
- 검색 페이지 정리는 별도 폴더(2026-10-09-검색페이지-정리/)에 비포·애프터와 함께 기록.

## 배포·확인
- 배포 2회(태스크 정의 rev 84, 이후 한 번 더), CloudFront 주요 경로 무효화, 라이브 단건 확인: 사이트맵 3,328건·영상 2,270건, llms.txt에 /signal 없음, /economy/page/1 → /economy 308, /search 200.
- 사용자가 Search Console에 사이트맵 재제출(10/9). 사이트맵 목록의 /llms.txt 항목(형식 오류 표시)은 사용자가 목록에서 삭제, 파일 자체는 유지.
- 점검 결과 URL 구조(/{분류}/{연}/{월}/{일}/{발행일-제목})·canonical 일치·h1 1개·끝 슬래시 308은 양호, 날짜 중복·긴 한글 주소는 기존 색인 때문에 유지.

## 결정
- 지면 코너 "시그널 1면"과 대분류 "시그널" 이름 충돌은 코드 수정 없이 보류(이름 정책 결정 필요).
- canonical만으로는 구글이 무시할 수 있어 Search Console의 선언/선택 canonical을 2~4주 관찰.

## 다음
- 1주 뒤: Search Console 사이트맵 발견 페이지 수(8,005 → 3,300대 기대)·동영상 수 확인.
- 2~4주 뒤: /video·/webtoon URL의 사용자 선언 canonical vs Google 선택 canonical 확인. 구글이 무시하면 308 통합(B안) 재검토.
- 로컬 브랜치 feat/seo-canonical-c push·PR은 지시 대기.

## 방향 전환 (같은 날 저녁): C안 → 308 이동
- 구글 검색에 웹툰 주소와 기사 주소가 함께 노출. 전용 화면(웹툰·영상·오디오)은 두지 않기로 한 방침에 맞춰 /webtoon/{slug}, /video/{slug}도 대응하는 기사가 있으면 기사 주소로 영구 이동(308)으로 변경(오디오 listen과 같은 방식). 기사가 없는 단독 웹툰·영상 글만 기존 페이지로 렌더.
- 로컬 프로덕션 빌드에서 두 주소 모두 기사로 308 확인. llms.txt 문구 갱신.
- 남은 판단: /webtoon/series/{slug}(시리즈 목록)는 그대로 둠 — 회차 링크는 기사로 이동. 시리즈 목록도 없앨지 결정 필요.
- 이전 canonical 변경(C안)은 기사 없는 글의 폴백으로만 남음.

## 사이트 정리 (같은 날 밤): 옛 페이지·코드 제거
방침: 지금 사이트가 최종 틀이며 이전 페이지·코드는 쓰지 않는다. 색인됐을 수 있는 옛 URL은 404 대신 308, 코드·자산은 삭제.

Before → After
- src 파일 362 → 334개(-28), public 7.8MB → 4.3MB, 의존성 3개 제거(react-markdown·remark-gfm·pretendard).
- 삭제: 챗봇 검색(SmartSearch*·shared/lib/chat), 웹툰 시리즈·표지 생성물, 웹툰·영상·오디오·레터 전용 상세 화면(클라이언트·IssueContextSection), 미사용 헬퍼(fetchVideoBySlug·fetchHomePlayerBySlug·mediaMeta·canonicalFromLens 등), 미참조 public 자산.
- 308로 대체: /webtoon·/video·/listen/{slug}, /letters/{id}, /letters/view?id= → 대응 기사(없으면 404), /webtoon/series/** → /lens. 공통 helper redirectToLensArticle.
- noindex·사이트맵 제외: /style(noindex), /login(noindex). 푸터에 /words 링크 추가(고아 방지). news-sitemap은 기사만.
- llms.txt·낡은 분류 주석·HeaderTabKey 정리.
- 근거 데이터: 웹툰·영상 옛 주소 샘플 120건, 최신 레터 1,000건 모두 대응 기사 있음(기사 없는 글 0).

유지·보류
- /news 폴백: 분류 없는 기사 3건(8월, -webtoon/-podcast/-video 접미사 id의 중복 기사)이 있어 라우트 유지. 데이터 정리(삭제/재분류) 후 제거 가능.
- 옛 분류 이름 호환(dataLabels '증시'·'금융·정책'): 재분류 데이터 검증 전이라 유지.
- letterHref 호출처(RSS·홈·TodayLetters)는 308 한 번 경유. 직접 기사 주소로 바꾸면 이동 한 번 줄어듦.
