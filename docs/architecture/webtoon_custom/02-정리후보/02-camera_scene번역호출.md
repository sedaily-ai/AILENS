# 정리후보 B — camera/scene → 별도 번역 호출(translate_scene_to_photo_brief)

[← 정리후보](README.md)

---

> **문제 발견**
> - `pipelines/common/webtoon_image.py::translate_scene_to_photo_brief()`가
>   스크립트 생성이 만든 한국어 `camera`/`scene`을, 실제 이미지 생성
>   직전에 **또 한 번** Bedrock(Claude)을 호출해 영어 브리핑+인물구성
>   분류(subjects: A/B/BOTH)로 변환함
>
> **문제 정의**
> - 컷 하나당 Bedrock 호출이 최소 2번(스크립트 생성 때 1번, 이미지
>   생성 직전 번역 때 1번) — 비용·지연이 이중으로 든다
> - subjects 분류(GPU IP-Adapter 라우팅용)가 이 번역 호출에 얹혀 있어서,
>   단순히 호출을 없애면 이 분류를 어디서 할지도 같이 정해야 함(GPU
>   경로를 계속 쓸지 여부와 연결 — [정리후보 D](04-GPU경로결정미반영.md))
>
> **제안하는 방향**(미확정 — 이전 세션 "Phase 2"로 이미 논의됐으나 미착수)
> - 스크립트 생성 단계가 아예 완성된 영어 `image_prompt`를 컷마다 직접
>   만들면 이 번역 호출 자체가 필요 없어진다
> - 다만 GPU 경로(§D)를 계속 쓸 경우 subjects 분류를 대체할 방법이
>   별도로 필요 — GPU 경로 자체의 존폐와 같이 결정할 사안
>
> **왜 그렇게 했는지 / 어떻게 달라졌는지** — 아직 미착수, 결정 후 기록
