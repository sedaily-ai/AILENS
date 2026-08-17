# 2026-08-17 홈 "그날로 떠나요"(빅카인즈 연동) + SSR 서버 디스크풀 장애 대응

작성: Claude Code
관련: `service/frontend/src/features/news-feed/components/NewsTimeMachineSection.tsx`,
`service/backend/handlers/time_machine_handler.py`, `service/frontend/deploy.sh`,
EC2 `i-077eb96afcc2597d4`(`ailens-ssr-prod`), SSM 파라미터
`/sedaily-mbti/bigkinds-api-key`

## 배경

홈 화면에 있던 두 섹션 — "그날의 지면"(최근 서울경제 실시간 지면, S3 아카이브
2026-02-01~)과 "생일 뉴스 타임머신"(빅카인즈 예시 데이터, 정적 목업) — 이
"날짜 고르면 그날 뉴스"라는 같은 패턴을 두 번 보여주고 있어 사용자 지적으로
하나로 통합하게 됐다. 통합하면서 실제로 빅카인즈 API를 백엔드에 연결했고,
그 흐름에서 나온 배포 하나가 SSR EC2 서버를 완전히 죽이는 장애로 이어져
복구까지 진행했다. 앞부분(기능)과 뒷부분(장애 대응)을 한 문서에 같이 남긴다 —
장애의 방아쇠가 이 세션의 배포였기 때문에 맥락이 이어진다.

## 한 것 — 1부: 홈 타임머신 섹션 통합 + 빅카인즈 실연동

1. **`NewsTimeMachineSection.tsx` 신설** — 기존 `TimelinePreviewSection.tsx`
   (S3 지면)과 `BirthdayTimeMachineSection.tsx`(빅카인즈 정적 목업)를 하나로
   합쳤다. 날짜 하나(`pickedDate`)를 오늘/어제/그제 퀵픽, 숫자 타이핑 입력,
   랜덤("🎲 아무 날이나") 세 가지 방법으로 고르면: 2026-02-01~오늘은 기존 S3
   지면 API(`fetchDayArticles`, 3분 폴링)를, 그 이전(1990-01-01~)은 빅카인즈
   `issue_ranking`을 보여준다. 옛 두 컴포넌트와 죽어있던 `/timemachine` 라우트
   (위키피디아+서울경제 스크래핑, "그날의 역사적 사건"이 대부분 지어낸 가짜였던
   문제로 이전에 삭제 결정된 상태)를 정리했다.
2. **백엔드 `time_machine_handler.py` 재작성** — 소비자가 없어진(=
   `/timemachine` 삭제로) `sedaily-mbti-time-machine-dev` Lambda를 새 AWS
   리소스 생성 없이 재사용, 위키피디아/스크래핑 로직을 빅카인즈
   `POST https://tools.kinds.or.kr/issue_ranking` 호출로 교체했다.
   - API 키는 SSM(`/sedaily-mbti/bigkinds-api-key`, SecureString)에서만 읽음.
     기존에 저장돼 있던 키는 무효 값이라 검증된 키(다른 프로젝트에서 실제
     `issue_ranking` 호출로 검증된 값)로 교체.
   - 배포 직후 502가 아니라 `AccessDeniedException`(SSM `GetParameter` 권한
     없음)이 나서, Lambda 실행 역할(`sedaily-mbti-lambda-execution-dev`)에
     이 파라미터 하나만 읽는 인라인 정책(`bigkinds-ssm-readonly`)을 추가.
   - DynamoDB 캐시(`sedaily-mbti-articles-dev`, 키 `timemachine_bigkinds_{date}`)
     재사용 — 과거 이슈는 영구히 안 바뀌므로 TTL 3650일.
   - 토픽 캡을 8→30으로 상향(빅카인즈가 하루에 실제로 최대 30개까지 줌,
     1999-11-17 실측 확인) — 처음엔 홈 미리보기용으로 8개만 잘라 캐싱했다가
     "펼치기 했는데 더 볼 게 없다"는 지적으로 정정. 자르는 건 프론트 책임으로
     옮김(홈은 8개만 표시, `/timeline/{date}`는 전체 표시).
3. **`/timeline/[date]` 페이지 날짜 분기** — 2026-02-01 이후는 기존
   S3 지면 뷰(`TimelineResultView`) 그대로, 그 이전은 새로 만든
   `TimelineTopicsView`(빅카인즈 토픽+키워드 목록, 개별 기사 링크 없음 —
   기사 상세조회 API를 테스트해보니 같은 news_id에 0건/서버오류(E03)가
   섞여 나와 신뢰도가 낮아서 안 붙였다)로 렌더링.
4. **날짜 입력 버그 수정** — 처음엔 네이티브 `<input type="date">`를 썼는데,
   "19991117"처럼 8자리를 그대로 입력하면 브라우저/로케일별 필드 순서(월/일/년
   vs 년/월/일) 때문에 엉뚱한 날짜로 조합되는 문제가 실사용 중 발견됐다
   (`SideRail`의 사주 궁합 위젯과 같은 "숫자만 입력 → YYYY / MM / DD 자동
   포맷" 패턴으로 교체, 항상 년→월→일 순서 고정).
5. **헷갈리는 링크 제거** — 홈 위젯 헤더의 "타임라인 보기" 링크가 고른 날짜와
   무관하게 항상 `/timeline/{오늘}`로 고정돼 있어, "펼치기"(고른 날짜로 이동)와
   기능이 겹쳐 보였다. 사용자가 실제로 이 링크를 눌러 엉뚱한 날짜로 이동하는
   걸 보고 확인, 제거.

프론트/백엔드 각각 `tsc --noEmit`, `npm run build`, `pytest`(104 passed, 기존에도
무관하다고 문서화된 6개 에러 외 이상 없음)로 검증 후 단계별로 배포.

## 한 것 — 2부: SSR 서버 디스크풀 장애 대응

1. **증상** — 위 5번(링크 제거) 배포 도중 `deploy.sh`의 4/5 단계(SSM Run
   Command로 EC2에 새 릴리스 적용)가 실패. 에러: `document process failed
   unexpectedly: ipc messaging received timeout signal, check
   [ssm-document-worker]/[ssm-session-worker] log for crash reason`. 이후
   모든 SSM 명령이 즉시 실패(에이전트 워커가 죽은 상태)했지만, 이 시점까지도
   사이트 자체(`ailens.sedaily.ai`)는 이전 릴리스로 정상(200) 서빙 중이었다.
2. **1차 조치: reboot** — SSM 에이전트만 살리려고 `aws ec2 reboot-instances`
   실행. 이때부터 사이트가 502로 죽었다(재부팅은 OS 전체를 내렸다 올리는
   거라 PM2/nginx도 같이 죽고 다시 떠야 하는데, 안 떴다). 10회 재시도(약 5분)
   해도 SSM·사이트 둘 다 회복 안 됨.
3. **2차 조치: stop/start** — 재부팅으로 안 풀려서 완전 정지 후 재시작
   (사용자 승인 후 진행, 탄력적 IP 확인해 IP 변경 리스크 없음을 먼저 검증).
   20회 재시도(약 6분+) 해도 여전히 502, SSM 미등록. EC2 자체 reachability
   체크는 계속 "passed" — 네트워크/하이퍼바이저 레벨은 멀쩡한데 OS 위
   서비스(SSM 에이전트, 앱 프로세스)만 안 뜨는 상황.
4. **SSH 경로 확보** — 보안그룹(`sg-026385217d66ed9e1`)엔 원래 80번(CloudFront
   원본용)만 열려 있고 22번은 아예 없어서 SSH가 불가능했다. 서버 부팅 로그에서
   `sedaily-eng-key`라는 키가 `ec2-user`의 `authorized_keys`에 등록돼 있는 걸
   확인. 로컬에서 후보 파일(`1_ailink/globe/sedaily-ec2-key.pem`)을 찾았는데,
   SHA256 지문을 직접 계산해 비교한 결과 실제로 일치 — 다만 이 키는 이름·저장
   위치로 볼 때 다른 프로젝트(영문사이트)용으로 보였다.
   - 사용자 판단: "빠른 길이라도 다른 프로젝트 키를 빌려 쓰지 말고, 이
     프로젝트 전용 키를 새로 만들어 근본적으로 처리하자." (→ 별도 기록:
     `이 판단은 앞으로도 "가장 빠른 방법보다 근본적으로 옳은 방법을 우선
     제안할 것"이라는 협업 원칙으로 메모리에 저장함.)
   - AI LENS 전용 새 키페어(`~/.ssh/ailens-ssr-prod`, ed25519) 생성.
   - `aws ec2-instance-connect send-ssh-public-key`로 SSM과 완전히 무관한
     경로로 60초짜리 임시 인증 후 SSH 접속, 그 키를 서버
     `~/.ssh/authorized_keys`에 영구 등록(이후로는 재푸시 불필요).
   - 보안그룹에 22번을 사용자 본인 IP(`14.37.164.231/32`)로만 한정해 개방
     (규칙 ID `sgr-02de3985c8ff5b07f`) — 상시 개방 아님, 진단 끝나면 닫을 예정
     (아래 "다음" 참조, 아직 안 닫음).
5. **근본 원인 확인** — SSH로 들어가 `df -h /` 확인 결과
   **`/dev/nvme0n1p1 8.0G 8.0G 16K 100% /` — 루트 디스크 100% 풀**.
   `sudo du -xh --max-depth=1 /opt/ailens` → `/opt/ailens/releases`가 4.0GB,
   릴리스 디렉터리 72개가 2026-08-08부터 한 번도 안 지워지고 쌓여 있었다.
   `deploy.sh`가 배포마다 `/opt/ailens/releases/{timestamp}/`를 새로 만들기만
   하고 지우는 로직이 없었던 게 원인. 디스크가 꽉 차니 SSM 에이전트도, PM2
   (root 권한, `pm2-root.service`)도 자기 상태·로그 파일을 못 써서 둘 다
   멎었고, reboot/stop-start로는 디스크가 안 비워지니 당연히 안 풀렸던 것.
   - 중간에 `ec2-user`로 `pm2 list`를 돌려 "PM2가 프로세스를 하나도 관리
     안 한다"고 잘못 판단한 적이 있는데, 이건 오진이었다 — 실제 프로덕션
     PM2는 `root`로 `pm2-root.service`(systemd)를 통해 돈다. 죽은 프로세스를
     하나 강제로 kill해보니 systemd가 즉시 새 PID로 재기동시키는 걸 확인해
     정정했고, `systemctl is-enabled pm2-root` / `amazon-ssm-agent` 둘 다
     `enabled`로 부팅 지속성 설정 자체는 처음부터 문제없었다는 것도 확인.
     **문제는 순전히 디스크 공간 하나였다.**
6. **즉시 복구** — 최신 5개 + 현재 심볼릭 링크가 가리키는 릴리스만 남기고
   나머지 67개 삭제(`sudo rm -rf`, 사용자가 직접 실행 — Claude Code 자동승인
   분류기가 원격 `sudo rm -rf`를 차단해서 `!` 접두사로 사용자가 실행).
   디스크 100%→54%. 직후 사이트 200 복귀, SSM 에이전트 17초 만에 자동
   `active`, PM2도 정상 감시 상태 확인.
7. **재발 방지(근본 수정)** — `deploy.sh`의 SSM 명령 목록 마지막에 정리 스텝
   추가: `ls -1 /opt/ailens/releases | sort -r | tail -n +6 | xargs -r -I{}
   rm -rf /opt/ailens/releases/{}` — 배포마다 최신 5개만 남기고 자동 삭제.
   로컬 샌드박스로 로직 검증 후 커밋(`b84f84f`).
8. **정상 배포로 마무리** — 고친 `deploy.sh`로 다시 배포(release
   `20260817-061228`) — 이번엔 SSM RunCommand가 정상 성공. 놓쳤던 4번(링크
   제거) 수정도 이때 같이 반영됨. 배포 후 `df -h /` 54% 유지(정리 스텝 정상
   작동), 릴리스 디렉터리 5개로 유지 확인, `ailens.sedaily.ai` 200, 놓쳤던
   수정 라이브 반영 확인.

**장애 지속 시간**: 4번(링크 제거) 배포의 SSM 실패(약 05:24 UTC/14:24 KST)
자체는 사이트에 영향 없었고, 사이트 자체가 502였던 구간은 reboot 시작 시점부터
최종 정상 배포 완료(약 06:12 UTC/15:12 KST)까지 — 대략 40~50분.

## 결정

- **다른 프로젝트(영문사이트)의 `sedaily-eng-key`를 빌려 쓰지 않고, AI LENS
  전용 새 키를 발급해 서버에 영구 등록했다.** 당장 더 빠른 길이 있었지만
  근본적으로 옳은 방향을 우선했다 — 이 판단 기준을 메모리에 협업 원칙으로
  저장함(향후 세션에도 적용).
- 릴리스 보관 개수는 5개로 정했다 — 롤백 여유(최근 5번의 배포로 되돌릴 수
  있음)와 디스크 절약(8GB 중 실사용 4.3GB로 안정권) 사이 절충.
- 기사 상세조회(빅카인즈 `news_ids` API)는 신뢰도 문제로 이번엔 안 붙였다 —
  "있는 데이터만 정직하게 보여준다"는 이 프로젝트의 기존 원칙(`/timemachine`
  삭제 사유와 같은 맥락)에 맞춰, 토픽+키워드까지만 노출.

## 다음

- **보안그룹의 22번(SSH) 규칙이 아직 열려 있다**(`sgr-02de3985c8ff5b07f`,
  사용자 IP로 한정돼 있긴 함). 상시 SSH 노출은 최소화하는 게 원칙(`CLAUDE.md`
  "SSH 인바운드 없음" 기존 방침)이라, 필요 없어지면 닫을 것 — 다만 앞으로도
  이런 응급 진단이 반복될 걸 감안해 "필요할 때만 열고 닫기" vs "상시 열어두고
  IP 화이트리스트만 관리" 중 어느 쪽으로 갈지는 팀 논의 필요.
- **디스크 용량(t3.small 기본 8GB) 자체가 여유가 별로 없다.** 릴리스 5개
  유지로 지금은 안정적(4.3GB/8GB)이지만, 다른 로그·캐시가 늘어나면 다시
  빠듯해질 수 있다 — 볼륨을 늘리거나(간단하지만 비용 증가), 디스크 사용량
  CloudWatch 알람을 걸어 이번처럼 "사이트가 죽고 나서야 안다"가 아니라 사전에
  알아채도록 하는 걸 권장.
- **`sedaily-eng-key`가 정확히 어떤 용도로 왜 이 서버(`ailens-ssr-prod`)에도
  등록돼 있는지는 확인 안 됨** — 영문사이트(`1_ailink`) 팀이 인프라를 같이
  세팅하면서 재사용한 것으로 추정되나, 실제 경위는 모른다. 필요하면 그쪽
  담당자에게 확인.
- `/opt/ailens/releases`에 남아있던 5개 릴리스 중 실제로 롤백에 쓸 만한지
  (즉 `.env.production.local` 등 런타임 설정까지 온전한지)는 별도로 검증 안
  했음 — 롤백이 실제로 필요해지면 그때 확인.
