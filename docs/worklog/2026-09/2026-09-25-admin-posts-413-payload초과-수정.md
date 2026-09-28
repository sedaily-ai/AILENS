# GET /admin/posts 413 payload 초과 → Lambda 크래시 수정 (2026-09-25)

## 문제 발견

- 어제 Bedrock 로그 점검 중 별개로 발견해 미해결로 남겨뒀던 이슈 — 오늘 아침 재확인 결과 지난 24시간에도 최소 7회 이상 `LAMBDA_RUNTIME Failed to post handler success response. Http response code: 413. {"errorMessage":"Exceeded maximum allowed payload size (6291556 bytes)"}` 반복 발생, 여전히 살아있는 문제였음

## 문제 정의

- `service/lens-cms-api/admin_posts_repo.py::list_posts()`가 목록 조회인데도 `SELECT *`로 각 글의 `admin_extra.body_inline`을 통째로 담아 `_to_dict()`(상세 조회와 동일 함수)로 응답을 만들고 있었음
- 자동 파이프라인 발행물(`admin_post_id` 있는 글 전부, 277건)은 `body_inline.lenses[]`에 레터·웹툰·팟캐스트·영상 4포맷 전체 콘텐츠(이미지 배열 + 영상/팟캐스트 transcript 전문)를 중복 보유 — `limit` 최대 200건이 이걸 전부 실으면 Lambda 동기 응답 한도(6MB)를 쉽게 초과
- 프론트엔드 조사(서브에이전트 위임) 결과: 목록 화면 6곳(`/posts`, `/webtoon`, `/video`, `/home-player`, `PostForm/WebtoonMode.tsx`) 중 `lenses[]` 원본을 직접 읽는 곳은 0곳 — 전부 `_to_dict()`가 이미 평탄화해 `body_inline` 최상위에 복사해 둔 `images`/`video_url`/`media_url`/`transcript`만 읽음. 다만 `series_title`만 이 평탄화 대상에서 빠져 있어(웹툰 자동완성 기능이 조용히 비게 될 뻔함) 같이 잡아야 했음

## 왜 그렇게 했는지

- `body_inline` 전체를 목록에서 빼는 대신 무거운 `lenses[]`만 제거 — 나머지 필드(category·images·video_url·media_url·transcript)는 6곳 전부가 실제로 읽고 있어 통째로 빼면 크래시/기능 손실이 남
- 저장 경로(`_update_lens_bundle_slice`)를 재확인해 안전함을 코드로 확인: 클라이언트가 보낸 `body_inline.lenses`를 신뢰하지 않고, DB에 저장된 `lenses`를 다시 읽어 그 포맷 슬라이스 하나만 바꾸는 구조 — 목록에서 `lenses`를 빼도 홈플레이어처럼 목록에서 바로 저장하는 화면(`Row.save()`가 `body_inline`을 스프레드)이 데이터를 잃지 않음
- `series_title`은 새로 평탄화 대상에 추가 — 빠뜨리면 자동완성 기능만 조용히 죽는 게 아니라, 이번 수정으로 없던 문제를 새로 만드는 셈이라 같이 처리
- 상세 조회(`get()`)는 `list_posts()`를 거치지 않고 `_to_dict()`를 직접 호출하므로 손대지 않음 — "4가지 시선" 편집기는 여전히 전체 `lenses[]`를 받음

## 어떻게 달라졌는지

| | 이전 | 이후 |
|---|---|---|
| 목록 응답(200건 기준 실측) | 6MB+ (413로 실패) | 255KB |
| `lenses[]` | 목록 응답에 포함 | 목록에서 제거(상세 조회는 유지) |
| `series_title` 평탄화 | 없음(웹툰 자동완성 조용히 비는 빈틈) | `images`/`video_url`/`media_url`/`transcript`와 같이 추가 |
| 저장 시 데이터 유실 위험 | — | 없음(`_update_lens_bundle_slice`가 서버 DB의 `lenses`를 다시 읽어 조립하는 구조 확인) |

- 검증: `service/lens-cms-api/deploy.sh`로 배포(EC2/PM2, 헬스체크 200) 후 실제 서비스에 직접 `list_posts()` 호출 — 200건 payload 255KB, `lenses` 유출 0건, `channel="webtoon"` 조회 시 `series_title`/`images`/`video_url`/`media_url`/`transcript` 전부 정상 포함 확인

## 결정

- `_to_dict()` 자체는 건드리지 않고(상세 조회와 공유) `list_posts()`에서 반환 직전에 `lenses`만 제거하는 후처리로 최소 변경 유지
