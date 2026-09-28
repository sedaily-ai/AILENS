# 영상 랩 Remotion Lambda 마이그레이션 — 127초(원본 대비 3.75배) (2026-09-24)

## 문제 발견

- "근본적으로 해결하세요"라는 명시적 지시 — Fargate vCPU 상향(`2026-09-24-영상랩-렌더속도-3배단축.md`)으로 476초→160초까지 줄였으나, 단일 머신의 코어 수라는 물리적 상한은 그대로 남아있음

## 문제 정의

- Remotion 공식 문서가 "속도·비용·성숙도 종합 최선"으로 권장하는 Remotion Lambda(프레임 구간을 수십 개 Lambda 함수에 병렬 분산)를 실제로 도입하려면: 전용 IAM 역할·정책, 렌더 함수 배포, 컴포지션 "사이트" 번들 S3 배포, TTS 오디오 자산 처리 방식 전면 변경이 필요 — 설정값 하나로 되는 일이 아님
- Remotion Lambda는 사이트를 배포 시점에 한 번 번들해 여러 렌더에 재사용하는 구조라, 기존 `NewsVideo.tsx`가 `staticFile()`로 참조하던 로컬 TTS 오디오 파일(`resolveAudio.ts`가 렌더 직전 `public/audio/`에 써넣던 방식)을 그대로 쓸 수 없음 — 실제로 첫 시도에서 `staticFile() does not support remote URLs`가 아니라 반대로 로컬 상대경로를 절대 URL 없이 넘겨 실패하는 걸 실측으로 확인

## 왜 그렇게 했는지

- 오디오는 TTS 합성 직후 S3(`media/video-lab/audio/{job_id}/`)에 업로드해 절대 URL로 참조하도록 `resolveAudio.ts`에 `upload` 옵션 추가 — `NewsVideo.tsx`는 `audioFile`이 `http`로 시작하면 그대로 `<Audio src>`에 쓰고 아니면 기존처럼 `staticFile()`을 거치는 분기로, 로컬 렌더(render.ts)와 Lambda 렌더(render-lambda.ts) 양쪽을 하나의 컴포지션 코드로 공유
- 새 파이썬 오케스트레이션을 짜는 대신, `render_from_script.py`가 `npm run render` 대신 `npm run render:lambda`만 호출하도록 npm 스크립트 이름만 교체 — Lambda 렌더 결과를 로컬 `work_dir/video.mp4`에 그대로 받아 써서 이후 썸네일 생성·S3 업로드 로직은 무변경으로 재사용
- 새 IAM 사용자+장기 액세스 키 대신, 이미 있는 ECS 태스크 role(`sedaily-lens-frontpage-auto-task-role`)에 Remotion 렌더 함수 호출·S3 접근 권한만 최소 범위(`lambda:InvokeFunction`, S3 Get/Put/List on `remotionlambda-*` 버킷)로 추가 — Remotion 공식 CLI가 요구하는 광범위한 "user" 정책(버킷 생성·삭제·함수 배포 권한 포함)을 런타임에 그대로 주는 대신, 배포 시점(내 개인 IAM)과 런타임 호출(ECS role)의 권한을 분리
- 렌더링을 더 이상 로컬에서 하지 않으므로 video-lab Fargate 태스크를 8 vCPU/16GB → 1 vCPU/2GB로 다시 축소 — 이제 오디오 업로드·폴링·결과 다운로드·썸네일 추출만 하는 얇은 오케스트레이터라 저사양으로 충분
- 새 AWS 리소스(Lambda 함수·S3 버킷)는 이 레포의 비용태깅 규칙(`docs/architecture/비용태깅_규칙.md`)대로 `Service=atlas4` 등 5개 태그를 생성 직후 바로 부여

## 어떻게 달라졌는지

| 단계 | 렌더 시간(동일 입력, 9컷/~1670프레임) |
|---|---|
| 원본(2 vCPU Fargate) | 476초 |
| Fargate 8 vCPU + 동시성 튜닝 | 160초 |
| Remotion Lambda, 함수 메모리 2048MB(기본값) | 162초(튜닝과 동률) |
| Remotion Lambda, 함수 메모리 4096MB | **127초** |

- 실제 프로덕션 경로(ECS RunTask → `render_from_script.py` → npm run render:lambda, admin API가 쓰는 것과 동일한 흐름) 그대로 3회 검증
- 2048MB 함수가 튜닝된 Fargate와 사실상 동률로 나온 원인을 추적하기 전에, Remotion 공식 문서의 "메모리를 올리면 CPU도 비례해 커진다"는 설명대로 4096MB로 재배포해 실측 비교(동일 스크립트, TTS 캐시로 렌더 구간만 분리 측정) — 80초→62초(약 23% 단축)를 직접 확인한 뒤 채택
- 과정에서 실패 1건 재현·수정: `@remotion/lambda-client`가 ECS 태스크 role의 기본 자격증명 체인을 신뢰하지 않고 `AWS_ACCESS_KEY_ID`/`AWS_PROFILE` 등 명시적 환경변수가 없으면 자체 사전 점검에서 먼저 거부함(소스 직접 확인, `checkCredentials()`) — 실제 호출부(`getCredentials()`)는 명시값이 없으면 `credentials: undefined`로 떨어져 AWS SDK 기본 체인(태스크 role 포함)에 맡기므로, `REMOTION_SKIP_AWS_CREDENTIALS_CHECK=true`로 사전 점검만 건너뛰면 정상 동작함을 확인
- `pipelines/video` 패키지에 `@remotion/lambda`·`@aws-sdk/client-s3` 추가, `tsc --noEmit` 클린 확인

## 결정

- 오래된(2048MB) 렌더 함수는 삭제하지 않고 남김 — Lambda는 유휴 비용이 없어 정리 우선순위가 낮음, 필요하면 나중에 수동 삭제
- Remotion Lambda의 런타임 호출 권한은 ECS 태스크 role에 최소 범위(호출+해당 버킷 접근)로만 추가 — 배포·관리 작업(함수 재배포, 사이트 재배포)은 계속 사람이 로컬에서 개인 AWS 자격으로 수행
