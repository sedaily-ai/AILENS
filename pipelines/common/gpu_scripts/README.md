# GPU 인스턴스 배포 스크립트

`ipadapter_infer.py`는 `gpu_ipadapter.py`(pipelines/common/)가 SSM으로
원격 실행하는 실제 추론 코드다 — GPU 인스턴스(`webtoon-ipadapter-gpu`,
`i-02313c8c8285f9d91`, ap-northeast-2) 안의 `/home/ec2-user/`에 이미
배포돼 있다. 이 사본은 기록·재배포용이다(인스턴스를 잃어버렸을 때
처음부터 다시 세팅하는 절차 참고).

## 인스턴스가 이미 있을 때 — 코드만 갱신

```bash
aws s3 cp ipadapter_infer.py s3://sedaily-webtoon-ipadapter-887078546492/ipadapter_infer.py \
  --profile yeonggwang --region ap-northeast-2

aws ssm send-command --profile yeonggwang --region ap-northeast-2 \
  --instance-ids i-02313c8c8285f9d91 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["aws s3 cp s3://sedaily-webtoon-ipadapter-887078546492/ipadapter_infer.py /home/ec2-user/ipadapter_infer.py"]'
```

## 처음부터 다시 세팅할 때(인스턴스를 새로 만든 경우)

1. AMI: `Deep Learning OSS Nvidia Driver AMI GPU PyTorch` (Amazon Linux 2023,
   ap-northeast-2) — NVIDIA 드라이버·PyTorch가 미리 깔려 있어 세팅 시간을
   크게 줄인다.
2. 인스턴스 타입: `g4dn.xlarge`(Tesla T4 16GB) — 배치 작업엔 이 정도면
   충분, `g5.xlarge`는 더 빠르지만 시간당 비용이 거의 2배.
3. IAM: 기존 `sedaily-eng-ec2-role` 재사용(SSM+S3 권한 이미 있음, 새 역할
   불필요).
4. 보안그룹: 인바운드 없음(SSM Session Manager로만 접근, SSH 키 관리
   불필요) — 아웃바운드는 기본 전체 허용으로 충분(HuggingFace Hub·S3
   접근용).
5. 비용 태그 필수(`docs/architecture/비용태깅_규칙.md` 참고):
   `Service=lens · Project=Sedaily-LENS · Workload=webtoon-ipadapter`
6. `--instance-initiated-shutdown-behavior stop`으로 띄운다(terminate
   아님) — stop해야 디스크에 캐시된 pip 패키지·모델 가중치가 남아
   다음 기동이 빠르다.
7. 부팅 후 SSM 온라인 대기 → 아래 패키지 설치:
   ```bash
   source /opt/pytorch/bin/activate
   pip install -q diffusers transformers accelerate safetensors huggingface_hub boto3
   ```
8. 참조 이미지 배치(`pipelines/common/assets/character_ref_A.png`,
   `character_ref_B.png`를 S3 경유로 `/home/ec2-user/refs/`에 올림).
9. 이 디렉터리의 `ipadapter_infer.py`를 `/home/ec2-user/`에 배포.
10. `gpu_ipadapter.py`의 `GPU_INSTANCE_ID` 상수를 새 인스턴스 ID로 갱신.

## 첫 실행 시 주의

첫 호출은 `stable-diffusion-v1-5/stable-diffusion-v1-5` + IP-Adapter
가중치를 HuggingFace Hub에서 받아오느라(수 GB) 20초~1분 정도 더 걸린다
— 이후엔 디스크 캐시(stop해도 남아있음)에서 바로 읽어 빠르다.
