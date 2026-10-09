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

## 결정
- 지면 코너 "시그널 1면"과 대분류 "시그널" 이름 충돌은 코드 수정 없이 보류(이름 정책 결정 필요).
- canonical만으로는 구글이 무시할 수 있어 Search Console의 선언/선택 canonical을 2~4주 관찰.

## 다음
- 배포는 허가 후. 배포 뒤 사이트맵 재제출(사용자), 단건 curl 확인.
- 사이트맵 videos 확장은 목록 API에 video_url이 없어 현재 0건 — 필요하면 API 필드 확인.
