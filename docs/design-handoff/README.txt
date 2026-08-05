AI LENS (mbti.sedaily.ai) — 디자이너 전달용 소스/스펙 아카이브
아카이빙: 2026-05-17 / 출처: frontend-next (Next.js 16, Tailwind v4)

[목적]
현재 라이브 사이트에 올라간 4 페르소나 캐릭터, 디자인 토큰(색·폰트·레이아웃),
페르소나 보이스 스펙을 디자이너가 바로 쓸 수 있게 모듈별로 모았다.

[폴더 구성 — 모듈별]
  characters/
    images/            실제 사이트에 올라간 리드 캐릭터 PNG 4종 (1024x1024)
    spec_characters.txt 4 캐릭터 정체성·역할·톤·시그니처
  design-system/
    spec_colors.txt    그룹 색/accent + 전역 컬러 토큰 (※ 두 팔레트 공존 주의)
    spec_fonts.txt     폰트 스택·용도·라이선스·다운로드 출처 (폰트 파일 미번들)
    spec_layout.txt    컨테이너·거터·spacing 토큰
  personas/
    spec_persona_group.txt     4 그룹(NT/NF/ST/SF) 라벨·스타일·아이콘·축
    spec_onboarding_voice.txt  온보딩 리드 4인 톤·맥락별 카피
  notes/
    spec_known_issues.txt      디자이너가 반드시 알아야 할 불일치·미완 항목

[가장 먼저 읽을 것]
notes/spec_known_issues.txt — 색 팔레트 2종 공존, 캐릭터 4/12만 실일러스트,
이름 표기 드리프트 등 디자인 의사결정에 직접 영향 주는 항목 정리.

[캐릭터 이미지 파일명 규칙]
{그룹}_{이름}_{대표MBTI}.png  예: NT_민철_intj.png
사이트 원본 경로: frontend-next/public/editors/{intj,infp,istj,esfp}.png
