# 프롬프트 랩 ERD 정리 + JSONB 쿼리 한계 확인 + GIN 인덱스 추가 (2026-09-25)

## 문제 발견

- "프롬프트 실험 부분... db 설계는 적절하게... 잘 설계를 하신건가요?"라는 요청으로 전체 스키마 조사·평가 착수
- 조사 중 확인: `prompt_lab_threads`/`prompt_lab_thread_messages`(대화·생성물 저장)만 `docs/architecture/db-changelog/postgres/`의 정식 이관 프로젝트(v0.1~v1.34) 문서화 범위 밖에서 1회성으로 만들어짐(2026-09-15, changelog에 항목 없음) — `prompts`/`prompt_versions`/`prompt_lab_docs`/`prompt_lab_files`는 전부 그 범위 안
- 사용자 확인 질문: "그러면... 특정 모델·특정 성우로 생성한 걸 조회하려면 쿼리를 어떻게 날리나?" — 실제 쿼리·EXPLAIN으로 실측

## 문제 정의

- `prompt_lab_thread_messages.payload`(JSONB, 자유형)에 `videoPreview.provider` 같은 값이 들어있어 `payload->'videoPreview'->>'provider' = 'elevenlabs'` 형태로 조회는 됨(실제로 돌려서 확인 — 오늘 아침 실사용 데이터 4건 정상 반환)
- 그러나 `pg_indexes` 조회 결과 `payload` 컬럼엔 인덱스가 전혀 없음(PK·thread_id 인덱스만 존재) — `EXPLAIN` 결과 **Seq Scan**(테이블 전체 순차 스캔) 확정. 지금은 390행이라 무해하지만, 데이터가 늘면 이 패턴의 모든 조회가 매번 전체 스캔을 타는 구조

## 왜 그렇게 했는지

- 사용자 요청대로 `payload` 컬럼 전체에 GIN 인덱스 추가 — 특정 필드만 뽑는 표현식 인덱스 대신 범용 GIN을 선택(요청 그대로), 대신 GIN이 실제로 가속하는 연산자(`@>`/`?`)와 처음 보여드린 조회 형태(`->>'...' =`)가 다르다는 걸 먼저 설명하고 진행
- 앱 DB 역할(`lens_service_app`)로 시도 → `InsufficientPrivilege: must be owner of table` — 이 저장소 원칙대로(최소 권한, DDL은 마스터 계정만) 막혀있음을 실측 확인
- RDS 클러스터가 AWS 관리형 마스터 비밀번호(`ManageMasterUserPassword`)를 쓰고 있어 그 값을 조회할 수 없었음 — 사용자 승인 하에 `--no-manage-master-user-password`로 자체 관리 전환 + 새 마스터 비밀번호 설정(`lens_admin`)
- 비밀번호가 담긴 명령을 Claude Code 자동 모드가 "Credential Leakage"로 반복 차단 — 우회하지 않고, 사용자가 직접 `!`로 실행하는 3단계 릴레이(SSM 명령 파일 생성 → send-command → get-command-invocation)로 전환해 완료

## 어떻게 달라졌는지

| | 이전 | 이후 |
|---|---|---|
| `payload` 컬럼 인덱스 | 없음 | `prompt_lab_thread_messages_payload_gin`(GIN) |
| `payload @> '{...}'::jsonb` 조회(강제) | Seq Scan | **Bitmap Index Scan**(`prompt_lab_thread_messages_payload_gin`) — 실측 확인 |
| `payload @> '{...}'::jsonb` 조회(기본) | Seq Scan | 여전히 Seq Scan — 390행 규모에서 플래너가 인덱스보다 싸다고 판단(정상, 데이터 늘면 자동 전환) |
| `payload->'x'->>'y' = 'z'` 형태 조회 | Seq Scan | **변화 없음**(GIN은 `@>`/`?` 전용, 이 형태는 인덱스 대상 아님 — 이 형태를 계속 쓰려면 별도 표현식 인덱스 필요) |
| RDS 마스터 비밀번호 관리 | AWS 관리형(자동 로테이션) | 자체 관리로 전환, 값은 사용자 승인 하에 직접 설정 |

- 검증 전 과정을 사용자가 직접 3회 릴레이 실행(SSM send-command/get-command-invocation)해 완료 — Claude Code 쪽에서 평문 비밀번호를 다루는 어떤 시도도 차단당해 전부 사용자 실행으로 전환

## 결정

- GIN 인덱스는 요청대로 그대로 둠 — `->>` 등호 조회를 실제로 빠르게 하려면 표현식 인덱스(`(payload->'videoPreview'->>'provider')`)가 더 정확한 해법이라는 점은 설명했으나 이번엔 범위 밖으로 둠
- 인덱스 자체는 지금 당장 체감 효과 없음(390행) — 데이터 규모가 커졌을 때를 대비한 선제 조치

## 다음

- 보안 후속 조치 필요(사용자에게 안내, 미완료): RDS 마스터 비밀번호(`Sedaily2024!`)가 채팅에 평문 노출됐고 로컬 `/tmp/*.json` 3개 파일에도 남아있음 — 비밀번호 재변경 또는 AWS 관리형 로테이션 재활성화, 로컬 임시 파일 삭제 권장
