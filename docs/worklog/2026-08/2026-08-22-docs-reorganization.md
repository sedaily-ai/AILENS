# 2026-08-22 docs/ 재구성 — worklog·history·superpowers 통합, archive 정리

작성: 영광 + Claude Code
관련: `docs/README.md`, `docs/worklog/`, `docs/archive/`

## 배경

"docs 폴더 통합해서 트리 형태로 잘 구조화해달라"는 요청. 기존엔 날짜가
들어간 작업 기록이 `worklog/`(진행형) · `history/`(종결된 프로젝트 단위
기록) · `superpowers/`(기능 설계+계획, plans/specs 하위폴더) 세 곳으로
갈라져 있었다(2026-08-03 `docs/README.md`에 의도적으로 구분해둔 구조였음).
실제로 보니 셋 다 "특정 시점의 작업 기록"이라는 본질은 같은데 폴더만
다른 거라, 찾을 때 헷갈리는 게 실익보다 컸다.

## 한 것

### 1. 세 폴더 통합

- `superpowers/plans/*.md` → `worklog/YYYY-MM/YYYY-MM-DD-주제-plan.md`
  (파일명 접미사로 계획 문서임을 표시)
- `superpowers/specs/*.md` → `worklog/YYYY-MM/YYYY-MM-DD-주제.md`
  (원래도 `-design` 접미사가 파일명에 있던 것들이라 그대로 유지)
- `history/*`(회의록·스프린트 트래킹·챗봇 TODO·v2 phase history·
  2026-05-14 phase 00~05) → 전부 `archive/`로 이동. `history/`가
  README상 "종결된 기록" 정의였는데, `archive/`("낡아서 현행과 안 맞는
  옛 문서")와 사실상 같은 개념이라 별도 폴더를 유지할 이유가 없었다.
  `phase/00~05`는 한 세션(2026-05-14)의 연결된 기록이라 폴더째
  `archive/2026-05-14-phase-history/`로 옮겨서 묶음을 유지.
- 전부 `git mv`로 옮겨서 파일 히스토리 보존.

### 2. 이동하면서 깨진 상대링크 3건 수정

`superpowers/plans` 파일들이 서로를 `[phase0-1](2026-07-27-ailens-cms-
phase0-1.md)` 식으로 상대경로 링크하고 있었는데, `-plan` 접미사를
붙이면서 파일명이 바뀌어 링크가 깨졌다. `2026-07-28-ailens-cms-phase2-
plan.md`, `2026-07-28-ailens-cms-phase3-plan.md` 안의 링크(표시 텍스트
포함) 3곳을 새 파일명에 맞게 고침.

### 3. `docs/archive/`의 기존 미커밋 삭제 발견 및 처리

이 작업을 시작하며 `git status`를 보니 `docs/archive/`(MBTI v2 프롬프트
아카이브, 아키텍처 정본 등 60여 개 파일)가 이미 디스크에서 전부
삭제되어 있는데 커밋은 안 된 상태로 남아있었다 — `docs/prompt-mbti-v2.zip`
이라는 백업 압축파일이 루트에 있는 걸로 봐서 누군가 아카이브를 zip으로
백업하고 원본을 지운 뒤 커밋을 안 한 것으로 보였다. 사용자에게 확인 후
("다른쪽에 또 저장된게 있다") 이 삭제를 그대로 커밋 — zip 백업이
별도로 존재하는 걸 확인하고 진행.

### 4. `docs/README.md` 갱신

폴더 구조 다이어그램·배치 규칙·"정본 문서 빠른 링크" 표를 전부 새
구조에 맞게 고침(`history/v2-phase-history.md` → `archive/v2-phase-
history.md` 등).

## 결정

- `worklog/`가 이제 진행형 작업기록과 완료된 계획/스펙 문서를 전부
  포괄한다 — 진행 여부로 폴더를 나누지 않고, 날짜+주제로만 찾는다.
- `archive/`는 "더 이상 안 쓰는 기능·폐기된 아키텍처를 다루는 문서"
  전용으로 통일 — `history/`가 갖고 있던 "종결된 프로젝트 기록"이라는
  느슨한 정의를 흡수했다.

## 추가 정리 (같은 날 이어서)

"더 깔끔하게 할 수 있나" 질문에 다시 훑어보다가 3가지 더 발견:
`docs/.DS_Store`(맥OS 잡파일, gitignore 확인), `docs/prompt-mbti-v2.zip`
(루트에 붕 떠있던 백업 zip), `architecture/2026-08-07-rendering-strategy-
decision.md`(문서 자체에 "8/8에 뒤집혔고 역사적 기록으로만 남긴다"고
적혀있어 `architecture/`보다 `archive/`가 맞음 — 같은 패턴이 다른 문서에
더 있는지 grep으로 확인했으나 이 파일이 유일했음).

정리 도중 `docs/archive/`가 통째로 다시 사라져서(방금 커밋했는데) 외부
프로세스가 지우는 줄 알고 조사했으나, 사용자가 Finder에서 직접 지운
것이었다("다른쪽에 저장된게 있어서") — 그 삭제도 별도 커밋으로 반영하고,
zip·rendering-decision 문서는 새로 만든 `archive/`에 옮겨 넣었다.
README의 "정본 문서 빠른 링크"에서 이제 없는 `v2-phase-history.md` 링크도
제거.

## 다음

- 없음 — 이번 라운드로 docs/ 정리 완료.
