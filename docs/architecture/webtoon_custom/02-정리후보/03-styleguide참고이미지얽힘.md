# 정리후보 C — Style Guide 모델: 참고이미지·역할매핑·negative_prompt가 서로 얽힘

[← 정리후보](README.md)

---

> **문제 발견**
> - `_STYLE_AB_ROLE_LINE`/`_STYLE_GUIDE_CONTENT_RULES`/
>   `_STYLE_GUIDE_NEGATIVE_PROMPT`/`_get_style_reference_b64()`
>   (`webtoon_image.py`) 넷이 서로를 전제로 존재함
>
> **문제 정의**
> - 2026-09-20 세션에서 "사용자 프롬프트로만 제어" 원칙을 적용하려
>   했으나, 이 넷이 전부 "참고 이미지가 새어 들어오는 걸 막는 땜질"이라
>   참고 이미지 조건화 자체를 유지하는 한 못 걷어냄 — 걷어내면
>   2026-09-08 R8/R9에서 실측했던 스튜디오 배경·엑스트라 재발 위험
> - `_STYLE_GUIDE_NEGATIVE_PROMPT`는 발행 파이프라인의 Style Transfer
>   단계와도 공유돼 있어 손대면 그쪽에도 영향
>
> **미결 질문**(이전 턴에서 이미 제기, 아직 답 없음)
> - Style Guide를 참고이미지 기반으로 유지할지(그러면 넷 다 그대로 둬야
>   함), 아니면 참고이미지 조건화를 빼서 사실상 Core/Ultra와 중복되는
>   모델을 없앨지 — 사용자 판단 필요
>
> **왜 그렇게 했는지 / 어떻게 달라졌는지** — 아직 미착수, 결정 후 기록
