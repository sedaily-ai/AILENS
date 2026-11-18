# 말풍선 없는 여러 컷 만평 Implementation Plan

**Goal:** 8컷 만평을 생성하고 설명을 그림 아래 표시한다.
**Architecture:** CMS와 배치가 공유하는 계약에 말풍선 제거와 설명 추출을 둔다. 기사별 만평 연출은 버전별 프롬프트로 관리하며, 합성 진입점은 원본 아래 어두운 자막 띠를 붙이고 실패할 때 기존 `text_caption` 전달 경로로 대체한다.
**Tech Stack:** Python, Pillow, 기존 Next.js CMS·서비스.
**Spec:** `docs/superpowers/specs/2026-11-18-webtoon-editorial-cartoon-design.md`

## Global Constraints

- 8컷과 기존 모델 설정·근거 검증을 유지한다. 새 의존성과 기존 콘텐츠 일괄 재생성은 추가하지 않는다.
- 사용자 승인에 따라 현재 세션에서 직접 구현·검증한다. 후속 PR 생성 요청에 필요한 커밋·push를 수행한다.

## Review Focus

- 옛 dialogue/bubble_1/bubble_2 입력에도 그림을 가리지 않는다.
- 발행 프롬프트의 옛 화풍·대사 지시보다 새 출력 규칙이 우선한다.
- 설명의 빈 값·옛 필드 형식에도 가능한 설명을 보존한다.
- 관리자 생성·재합성에서도 얼굴 인식이나 말풍선 합성이 실행되지 않는다.
- 이전 이미지 재개 시 새 설명 표시를 임의 적용하지 않는다.

### Task 1: 공통 지침·설명·합성

**Files:** `pipelines/common/webtoon_contract.py`, `pipelines/common/webtoon_image_prompt.py`, `pipelines/webtoon/compose_text.py`, 관련 기존 테스트.

- [x] 옛 대사와 모든 합성 옵션을 넣어도 픽셀·크기가 유지되는 검사 추가 후 실패 확인.
- [x] 공통 각본 계약에서 말풍선을 제거하고 `external_caption(cut: dict) -> str`로 새·옛 설명 필드를 추출한다.
- [x] 버전별 v67 프롬프트에서 기사 연관 장면·화풍·미지정 국기 금지를 관리하며, 공통 이미지 지침은 선택 화풍을 존중한다.
- [x] `compose()`는 원본을 보존하고 그림 아래 어두운 자막 띠를 합성한다. 합성 실패 때 외부 설명으로 안전하게 대체한다.

### Task 2: 소비 경로 통합

**Files:** `pipelines/webtoon/pipeline.py`, `admin/backend/routes/webtoon/{script,generate}.py`, `pipelines/common/publishing.py`, `pipelines/scripts/repair_missing_formats.py`.

- [x] 두 정규화 함수가 같은 설명을 반환하고 dialogue를 비우도록 한다.
- [x] 자동 생성·관리자 생성에서 말풍선 설정 조회·얼굴 인식을 제거한다.
- [x] 자동 생성 성공 시 설명 표시 파일을 모든 공급자 경로에 기록한다. 기존 resume 이미지에는 추가하지 않는다.
- [x] 발행·복구 경로에서 공통 설명 추출을 사용한다.
- [x] CMS 컷 미리보기에는 그림 아래 설명을 표시하고 무효한 말풍선 제어를 제거한다.

### Task 3: 검증·배포·기록

- [x] `python3 -m pytest pipelines/common/test_webtoon_contract.py pipelines/common/test_admin_bundle.py pipelines/webtoon/test_compose_text.py pipelines/webtoon/test_pipeline_retry.py admin/backend/tests -q` 및 변경 Python 파일 pyflakes를 실행한다.
- [x] CMS 변경 시 tsc·eslint·build를 실행한다.
- [x] 저장소 배포 절차와 실행 환경을 확인해 가능한 배포를 수행하고 운영 상태를 재조회한다. 불가하면 정확한 제한을 기록한다.
- [x] 설계 상태와 worklog에 실제 검증·배포 결과를 기록한다.

사용자 승인 후 CMS·공개 API·자동 발행 배포 및 재조회 완료. 운영 결과의 장면 품질·자막 요구를 반영해 CMS와 자동 발행을 다시 보완 배포했다. 프롬프트 v65는 유지, v66은 보존, v67 활성화, 이미지 설정 v31 유지. 자동 발행 revision 121. 실제 한 컷은 새 연출을 보였지만 안내판의 가짜 글자 흔적이 남아 시각 검수는 계속 필요하다. 최신 main(dad17632)의 보안 의존성을 반영해 274개 테스트와 프론트엔드 검사를 재실행했다.
