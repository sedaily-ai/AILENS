# 정리후보 D — GPU IP-Adapter 경로: 방향은 정해졌는데 코드엔 반영 안 됨

[← 정리후보](README.md)

---

> **결정 기록**(2026-09-18, 참고 — 이미 확정된 방향)
> - "GPU 를 꼭 써야할까요? 인물을 고정할 필요도... 없거든" — GPU 경로
>   폐기 방향 확정, admin 기본 모델을 Stable Image Ultra로 전환
>
> **문제 발견**
> - `pipeline.py`의 `IMAGE_PROVIDER` 기본값은 여전히
>   `"bedrock-style-transfer"`(GPU 경로) — 위 결정 이후에도 실제 발행은
>   안 바뀜
>
> **문제 정의**
> - [정리후보 A](01-모델디스패치중복.md)의 설계가 완성되기 전까지는
>   발행이 계속 옛 경로를 쓴다 — 결정과 실제 동작 사이 간극이 방치돼 있음
> - `pipeline.py`엔 `IMAGE_PROVIDER = "openai"`(GPT 경로) 옵션도 남아
>   있는데 주석 자체가 "휴면"이라고 표시 — OpenAI는 이미 사용 불가로
>   결정됐으므로(2026-09-18) 이것도 죽은 분기
>
> **제안하는 방향**(미확정)
> - [정리후보 A]가 풀리면(발행 파이프라인이 admin 디스패치 재사용) 이
>   항목은 "기본값을 Ultra로 설정"하는 정도로 자연히 같이 해소될 가능성
> - `IMAGE_PROVIDER = "openai"` 분기는 별도 판단 없이 삭제 후보(이미
>   사업적으로 불가 확정)
>
> **왜 그렇게 했는지 / 어떻게 달라졌는지**(2026-09-20, 진행 중)
> - [정리후보 A](01-모델디스패치중복.md) Phase 3에서 `pipeline.py`가
>   `webtoon_image.generate_cut_image_to_file()`을 쓰도록 배선은
>   통합했지만, **`IMAGE_PROVIDER = "bedrock-style-transfer"`는 의도적으로
>   그대로 유지**했다 — 구조 변경(리팩토링)과 모델 전환을 같은 배포에
>   같이 실으면, 무인 스케줄 자동 발행(두 배치가 카나리 분리 불가)에서
>   문제가 터졌을 때 원인이 "구조 때문"인지 "모델 때문"인지 구분이 안
>   된다는 판단
> - 그래서 이 항목의 실제 해소(Ultra로 `IMAGE_PROVIDER` 전환)는 별도
>   Phase 4로 분리했다 — Phase 3(구조 통합) 배포·검증이 먼저 끝나야
>   시작.
>
> **2026-09-20(같은 날, Phase 4 배포)** — `IMAGE_PROVIDER`를
> `"bedrock-sd-ultra"`로 전환, `frontpage_auto`/`mustknow_auto` 둘 다
> 새 이미지(`sedaily-lens-frontpage-auto` task definition revision 47)로
> 배포 완료. QA 정책은 `sageuk`/`no_people_violated` 검사는 유지하되
> (프롬프트가 아니라 결과물 검사라 "프롬프트 외 영향 없음" 원칙과 무관,
> 실제 독자 대상 안전망) `extra_people`(고정 인물 수 초과 재생성)만
> `check_extra_people=False`로 꺼서 "군중을 그려달라"는 사용자 지시와
> 충돌하지 않게 함 — `webtoon_image.py::generate_cut_image()`의
> `check_extra_people` 파라미터로 구현. GPU IP-Adapter(`gpu_ipadapter`)
> 기동 분기는 `IMAGE_PROVIDER == "bedrock-style-transfer"` 조건이 더 이상
> 매칭되지 않아 자연히 안 탐 — GPU EC2 인스턴스·IAM 권한은 1~2주
> 안정화 확인 전까지 삭제하지 않고 유지(롤백 경로). 수동 RunTask로
> 두 배치 다 import/배선 정상 확인(exit code 0) — 일요일이라 실제 발행
> 후보가 없어 컷 생성·QA 로직 자체는 다음 평일 정규 스케줄에서 처음
> 실사용 검증됨. `IMAGE_PROVIDER = "openai"`(GPT 경로) 삭제는 GPU 코드
> 정리(정리후보 G 재검토) 때 같이 처리 예정, 아직 미착수(1~2주 안정화
> 후).
