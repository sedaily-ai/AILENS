"""웹툰 실험 패널(컷 이미지 생성·GPU 제어·참조 이미지·단계별 생성) —
2026-09-20, `routes/webtoon_lab.py`(1035줄 단일 파일) 하나에 몰려있던
걸 기능별로 쪼갰다(사용자 요청: "웹툰 관련한거는... 기능별로 코드
파일들이 있기를 원하는데요"):

  jobs.py       모든 하위 모듈이 공유하는 job 테이블 헬퍼 + 공용 폴링 라우트
  generate.py   컷 이미지 생성(모델 디스패치) + 이미지 실험실 3단계
  gpu.py        GPU(IP-Adapter) 인스턴스 켜기/끄기
  assets.py     인물·화풍 참조 이미지 업로드·갤러리
  stage.py      단계별 생성(장면번역/인물/배경/합성/화풍 독립 호출)

`handler.py`는 각 서브모듈을 직접 import해서 라우트를 등록한다
(`from routes.webtoon import generate as webtoon_generate` 형태) —
이 `__init__.py`는 Lambda 비동기 self-invoke(`_async_webtoon_job`
마커, jobs.self_invoke_async 참고) 하나만 라우팅한다."""
from __future__ import annotations

from routes.webtoon import gpu, stage


def run_async_job(payload: dict) -> None:
    """handler.py가 self-invoke된 별도 invocation에서 직접 호출."""
    kind = payload.get("kind")
    job_id = payload.get("job_id")
    if kind == "gpu_start":
        gpu.run_gpu_start(job_id)
    elif kind == "stage_character":
        stage._run_stage_character(job_id, payload.get("character"), payload.get("prompt"))
