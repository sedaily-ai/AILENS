import { LENS_ACCENT } from '@/shared/constants/lensPerspectives';

/** 글 상세(LensViewClient) 전용 CSS. 2026-10-12 컴포넌트에서 분리(내용 불변). */
export const LENS_VIEW_CSS = `
        /* 2026-10-01 상세 재설계(영문 사이트 구조) — 사이드바를 걷고 단일 읽기 컬럼(720px)으로.
           ≥1100px에서는 도구(글자 크기·공유·인쇄)가 컬럼 왼쪽 고정 레일로 나가고, 그보다
           좁으면 기존처럼 본문 위 가로 줄(.tools-inline)로 남는다. */
        .lw { max-width: 720px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 28px); }
        .art-main { position: relative; }
        .rail-host { display: none; z-index: 40; }
        .rail-host[hidden] { display: none !important; }
        @media (min-width: 1100px) {
          .tools-inline { display: none !important; }
          .rail-host { display: block; position: absolute; top: 0; bottom: 0; left: calc(50% - 360px - 120px); width: 76px; }
          .rail { position: sticky; top: 110px; display: flex; flex-direction: column; align-items: center; gap: 22px; }
        }
        .rail-btn { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 64px; padding: 6px 0;
          border: none; background: none; cursor: pointer; color: #374151; }
        .rail-btn:hover:not(:disabled):not([aria-disabled='true']) { color: #111827; }
        .rail-btn:disabled, .rail-btn[aria-disabled='true'] { opacity: .35; cursor: default; }
        .rail-btn:focus-visible { outline: 2px solid #111827; outline-offset: 2px; border-radius: 6px; }
        .rail-ico { display: flex; align-items: center; justify-content: center; height: 24px; }
        .rail-ico .sk { transition: transform .25s cubic-bezier(.2,0,0,1); }
        .rail-btn:hover:not(:disabled) .sk { transform: rotate(-6deg) translateY(-1px); }
        @media (prefers-reduced-motion: reduce) { .rail-ico .sk { transition: none; } .rail-btn:hover:not(:disabled) .sk { transform: none; } }
        .rail-cap { font-size: 12px; color: #6b7280; white-space: nowrap; }
        .badge { display: inline-block; margin-left: 8px; padding: 2px 9px; border-radius: 999px;
          font-size: 11.5px; font-weight: 700; color: ${LENS_ACCENT}; background: ${LENS_ACCENT}14; vertical-align: 1px; }
        /* "30초 핵심" 요약 카드(2026-10-01 재디자인) — 굵은 윗선·베이지 박스·■ 마커·"AI 요약" 문구를 걷어내고
           Toss식 부드러운 라운드 카드로. 테두리 없이 면(연한 회색)과 여백으로만 구분하고, 번호는 작은 원형 배지.
           AI 고지는 바이라인·하단 AiDisclaimer가 이미 맡으므로 요약 안엔 "AI 요약" 표기를 두지 않는다. */
        .sum { margin-top: 12px; padding: clamp(24px, 3.4vw, 34px) clamp(22px, 3.6vw, 36px) clamp(26px, 3.6vw, 36px);
          background: #f6f7f9; border-radius: 26px 22px 28px 20px / 22px 27px 20px 26px; }
        .sum-head { display: flex; align-items: center; gap: 9px; margin-bottom: 4px; }
        /* 제목 아래 한 줄 — 본문과 같은 "~요" 말투로 친근하게, 회색 작은 글씨라 과하지 않게(2026-10-01). */
        .sum-sub { margin: 0 0 22px 31px; font-size: 14px; line-height: 1.5; color: #6b7280; letter-spacing: -0.01em; }
        .sum-ico { flex-shrink: 0; color: var(--sum-accent); }
        .sum-title { margin: 0; font-size: 16px; font-weight: 800; letter-spacing: -0.015em; color: #111827; }
        .sum-list { display: flex; flex-direction: column; gap: 18px; list-style: none; padding: 0; margin: 0; }
        .sum-item { display: flex; align-items: flex-start; gap: 14px; word-break: keep-all; }
        .sum-n { flex-shrink: 0; display: grid; place-items: center; width: 26px; height: 26px; margin-top: 1px; border-radius: 52% 48% 55% 45% / 48% 54% 46% 52%;
          background: #fff; color: color-mix(in srgb, var(--sum-accent) 62%, #1f2a44); font-size: 12px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums;
          box-shadow: 0 1px 3px rgba(17,24,39,0.10); }
        .sum-t { font-size: calc(17px * var(--lens-font-scale, 1)); line-height: 1.7; letter-spacing: -0.01em; color: #1f2937; }
        .eyebrow { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; color: #6b7280; margin: 0 0 12px; }
        .eyebrow a { color: inherit; text-decoration: none; }
        .eyebrow a:hover { color: #111827; text-decoration: underline; text-underline-offset: 3px; }
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: 1px solid #d1d5db;
          border-radius: 999px; font-size: 12.5px; font-weight: 600; color: #374151; text-decoration: none; background: #fff; }
        .pill:hover { border-color: #9ca3af; color: #111827; }
        .lm { max-width: 100%; }
        /* 스케치 톤(2026-10-01) — 직선 대신 손으로 그은 획, 반듯한 모서리 대신 살짝 불규칙한 모서리, 글자는 단정하게 두고 선과 모서리만 손맛(손글씨 폰트는 유아틱해서 제외). */
        .rule { height: 8px; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='0.26' stroke-width='1.6' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; }
        .back:focus-visible { outline: 2px solid ${LENS_ACCENT}; outline-offset: 2px; }

        /* ── 이 페이지의 공통 문법 3개 ───────────────────────────────────
           1. .ovl  구역 이름표. 크기로 소리치지 않고 자간·굵기로만 구분한다.
           2. .rule 구역 경계. 이게 유일한 구분 장치다(카드·컬러 룰 없음).
           3. .lnk  보조 링크. 위치·크기·밑줄이 전부 같아서 서로 경쟁하지 않는다. */
        .ovl { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; color: #111827; }
        .lnk { display: inline-flex; align-items: center; gap: 6px; min-height: 44px;
          border: none; background: none; cursor: pointer;
          color: #4b5563; font-size: 14px; font-weight: 600; text-decoration: underline;
          text-underline-offset: 3px; text-decoration-color: rgba(17,24,39,0.28); }
        .lnk:hover { color: #111827; text-decoration-color: currentColor; }
        .lnk:focus-visible { outline: 2px solid #111827; outline-offset: 2px; }

        /* padding-bottom 2px = thumb 아래 컬러 룰 두께. 이게 없으면 룰이 바
           밖으로 삐져나와 아래 본문 위에 얹힌다.
           2026-08-24 — 룰을 3 → 2px로 얇혔다(사용자 요청: "스트록이 좀 더
           얇아져야"). 대비는 색 기준이라 두께와 무관(앰버 3.19:1 유지).
           바 높이 = 8(위 패딩) + 60(탭: 8+20+4+20+8) + 2(룰) + 1(경계선) = 71px. */
        /* 형식 선택기(2026-10-01 개편) — 밑줄 탭 → 둥근 회색 트랙 위의 흰색 알약 세그먼트(Toss식).
           테두리 없이 면 + 부드러운 그림자로만 선택을 보여 준다. 선택된 알약이 칸 사이를 미끄러진다.
           바 높이 = 위 패딩 10 + 트랙(4 + 56 + 4) + 아래 패딩 10 = 84px. */
        /* 형식 탭은 더 이상 스크롤을 따라오지 않는다(2026-10-01, 읽는 데 방해) — 제자리에 있는 일반 블록. */
        .fmt-bar { position: static; background: #fff; padding: 10px 0; }
        .fmt-row { position: relative; display: grid; gap: 0; padding: 4px; background: #f2f3f5; border-radius: 16px;
          grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
        .fmt-thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; pointer-events: none; z-index: 0;
          width: calc((100% - 8px) / var(--n)); transform: translateX(calc(var(--ai) * 100%));
          background: #fff; border-radius: 12px;
          box-shadow: 0 1px 2px rgba(17,24,39,0.08), 0 4px 12px -2px rgba(17,24,39,0.10);
          transition: transform .3s cubic-bezier(.22,.85,.2,1); }
        .fmt { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
          min-height: 56px; padding: 8px 4px; border: none; background: none; border-radius: 12px; cursor: pointer; }
        .fmt-name { font-size: 14px; font-weight: 600; color: #6b7280; letter-spacing: -0.01em; white-space: nowrap; transition: color .2s ease; }
        .fmt-amt { display: flex; align-items: center; gap: 4px; font-size: 12.5px; color: #9ca3af; font-variant-numeric: tabular-nums;
          white-space: nowrap; transition: color .2s ease; }
        .fmt-art { display: inline-flex; flex-shrink: 0; color: #9ca3af; transition: color .2s ease; }
        .fmt[aria-selected='true'] .fmt-name { color: #111827; font-weight: 800; }
        .fmt[aria-selected='true'] .fmt-amt { color: #6b7280; }
        .fmt[aria-selected='true'] .fmt-art { color: var(--c); }
        .fmt[aria-selected='false']:hover .fmt-name { color: #111827; }
        .fmt[aria-selected='false']:hover .fmt-art, .fmt[aria-selected='false']:hover .fmt-amt { color: #6b7280; }
        .fmt:focus-visible { outline: 2px solid #111827; outline-offset: -2px; }
        @media (max-width: 359px) {
          .fmt { padding: 8px 2px; }
          .fmt-amt { font-size: 12px; gap: 2px; }
        }
        .fmt-sub { margin: 4px 0 0; font-size: 14px; line-height: 1.5; color: #6b7280; letter-spacing: -0.01em; }

        /* 형식 설명 — 색 면 박스 대신 조용한 한 줄(2026-10-01). 콘텐츠(웹툰 컷·본문)가 먼저 보이게 한다. */
        .fmt-toast { display: flex; align-items: flex-start; gap: 8px;
          margin-top: 10px; padding: 2px 2px; background: none;
          font-size: 14px; line-height: 1.6; color: #6b7280; word-break: keep-all; }
        @media (prefers-reduced-motion: no-preference) {
          .fmt-toast { animation: toast-in .22s ease-out; }
          @keyframes toast-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        }

        .fmt-note { margin-bottom: clamp(16px, 2.4vw, 24px); font-size: 16px; line-height: 1.6;
          color: #6b7280; word-break: keep-all; }

        .fmt-lede { font-family: "Noto Serif KR", serif;
          font-size: clamp(20px, 2.6vw, 24px); font-weight: 700; color: #111827;
          line-height: 1.5; letter-spacing: -0.02em; word-break: keep-all;
          max-width: 720px; margin-bottom: 24px; }

        /* ── 읽기 지면 ──────────────────────────────────────────────────
           2026-08-24 — 620px → 720px(사용자 요청). 카테고리 탭·상단 요약이
           전체 폭(~824px)이라 620px 본문이 좁아 보였는데, 720px(≈한글 44자)로
           올려 폭 차이를 크게 줄이면서도 긴 산문 가독성(스티어링 25~40자
           권장에 근접)을 지킨다. 왼쪽 기준선은 그대로라 위 요소들과 시작선이
           일치하고, 넓어진 줄은 행간 1.85로 받친다. */
        /* 레터 본문(2026-10-01 개편) — 드롭캡·반복 제목·작은 보라색 소제목을 걷고, 읽기 편한 큰 글씨와 넉넉한 여백으로.
           본문 17px / 줄간격 1.95 / 단락 간격 1.5em, 도입 문단은 한 단계 크게. 소제목은 번호 + 세리프 제목 + 연한 질문
           (잡지식 2단)으로 구획 전환이 또렷하게. 테두리 없이 여백과 타이포로만 구분한다. */
        .lread { max-width: 720px; }
        .lread > p, .lread > ul, .lread > ol, .lread > blockquote { font-size: calc(17px * var(--lens-font-scale, 1));
          line-height: 1.8; letter-spacing: -0.005em; color: #191919; word-break: keep-all; overflow-wrap: anywhere; text-align: left; }
        .lread > p { text-wrap: pretty; }
        .lread > * + * { margin-top: 1.4em; }
        .lread > p.lread-lead { font-size: calc(19.5px * var(--lens-font-scale, 1)); line-height: 1.75; font-weight: 500; color: #111827; }
        .lread strong, .sum-t strong { font-weight: 600; color: #111; }
        .lread > ul { list-style: disc outside; padding-left: 1.35em; }
        .lread > ol { list-style: decimal outside; padding-left: 1.5em; }
        .lread > ul li + li, .lread > ol li + li { margin-top: 0.55em; }
        .lread li::marker { color: var(--lc, #6b7280); font-weight: 700; }
        /* 인용 — 형식 색 6% 면 위의 둥근 카드 + 작은 여는 따옴표(테두리 없음). */
        .lread > blockquote { font-family: "Noto Serif KR", serif; font-size: calc(19px * var(--lens-font-scale, 1)); line-height: 1.7;
          font-weight: 600; color: #111827; margin-top: 1.8em; margin-bottom: 0.4em; padding: 18px 22px 20px; border-radius: 20px 16px 22px 15px / 16px 21px 15px 20px;
          background: color-mix(in srgb, var(--lc, #111827) 11%, #fff); }
        .lread > blockquote::before { content: '\\201C'; display: block; font-size: 38px; line-height: 0.7; color: var(--lc, #111827); margin-bottom: 8px; }
        .lread-hr { width: 84px; height: 8px; margin: 2.2em auto 0.6em; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='0.26' stroke-width='1.6' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; font-size: 0; }
        /* 소제목 — 번호 + 세리프 제목 + 연한 질문(2단). 구획 사이는 여백으로만. */
        .lread > .lread-sub { scroll-margin-top: 84px; margin-top: 52px; margin-bottom: 18px; }
        .lread > .lread-sub + * { margin-top: 0; }
        /* 챕터 번호 알약 "02 / 06"(2026-10-01, 에듀테크식 단계감) — 형식 색 8% 면 + 형식 색 글자. 테두리 없음. */
        .lread-sub .ch-no { display: inline-flex; align-items: baseline; gap: 5px; margin-bottom: 12px; padding: 3px 12px 4px; border-radius: 16px 11px 15px 10px / 11px 16px 10px 15px;
          font-size: 12px; font-weight: 800; letter-spacing: 0.04em; line-height: 1.2; color: color-mix(in srgb, var(--lc, #111827) 62%, #1f2a44); font-variant-numeric: tabular-nums;
          background: color-mix(in srgb, var(--lc, #111827) 15%, #fff); }
        .lread-sub .ch-no i { font-style: normal; font-weight: 600; opacity: 0.55; }
        .lread-sub .ch-t, .lread-sub .ch-q { text-wrap: balance; }
        .lread-sub .ch-t { display: block; font-family: "Noto Serif KR", serif; font-size: calc(25px * var(--lens-font-scale, 1));
          font-weight: 700; line-height: 1.35; letter-spacing: -0.02em; color: #111827; word-break: keep-all; }
        /* 질문 — "이 구간이 답할 질문"을 연한 면 위에 두어 독자가 읽기 전에 목적을 잡게 한다. */
        .lread-sub .ch-q { display: block; width: fit-content; max-width: 100%; margin-top: 12px; padding: 8px 15px; border-radius: 15px 12px 16px 11px / 12px 16px 11px 15px;
          background: #f4f5f7; font-size: calc(15.5px * var(--lens-font-scale, 1)); line-height: 1.5; font-weight: 500; color: #4b5563; word-break: keep-all; }
        /* 새 레터 틀(2026-10-06) — 배지 소제목·1분 요약·특별 칸. 이모지로 시작하는 라벨 + 질문 소제목 글만 이 모양이고, 옛 글은 위 규칙 그대로다. */
        .lread-sub[data-badge] .ch-no { display: none; }
        .lread-sub[data-badge] .ch-t { display: inline-block; margin-bottom: 10px; padding: 4px 11px; border-radius: 12px; font-family: inherit; font-size: 12.5px; font-weight: 700; letter-spacing: 0.01em;
          line-height: 1.3; color: color-mix(in srgb, var(--lc, #111827) 70%, #1f2a44); background: color-mix(in srgb, var(--lc, #111827) 12%, #fff); }
        .lread-sub[data-badge] .ch-q { margin-top: 0; padding: 0; border-radius: 0; background: none; font-family: "Noto Serif KR", serif; font-size: calc(22px * var(--lens-font-scale, 1));
          font-weight: 700; line-height: 1.4; letter-spacing: -0.02em; color: #111827; }
        .lread > .lread-summary { margin: 0 0 30px; padding: 17px 20px 16px; border-radius: 14px; background: #f3f4f6; }
        .lread-summary p { margin: 0 0 7px; font-size: calc(15px * var(--lens-font-scale, 1)); line-height: 1.65; color: #1f2937; }
        .lread-summary p.lread-summary-hint { margin: 11px 0 0; font-size: 12.5px; color: #9ca3af; }
        .lread-box-title { margin-bottom: 9px; font-size: 13px; font-weight: 700; color: #4b5563; }
        .lread > .lread-box { margin: 34px 0 0; padding: 18px 20px 17px; border-radius: 14px; background: #f9fafb; }
        .lread-box p { margin: 0 0 10px; }
        .lread-box p:last-child { margin-bottom: 0; }
        .lread > .lread-box-takeaway { background: #eff6ff; }
        .lread-box-takeaway .lread-box-title { color: #1d4ed8; }
        .lread > .lread-box-vote { background: #fff; box-shadow: 0 0 0 1px #e5e7eb inset; }
        .lread-box-vote .lread-box-title { color: #374151; }
        .lread-box-vote p { margin-bottom: 7px; font-size: calc(15px * var(--lens-font-scale, 1)); }
        .lread > .lread-more { margin: 18px 0 0; border: 1px solid #fde7b0; border-radius: 10px; background: #fffbeb; overflow: hidden; }
        .lread-more summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 52px; padding: 14px 16px; list-style: none; cursor: pointer; font-size: 14px; font-weight: 700; color: #92400e; }
        .lread-more summary::-webkit-details-marker { display: none; }
        .lread-more summary::marker { content: ''; }
        .lread-more summary span { min-width: 0; overflow-wrap: anywhere; }
        .lread-more summary svg { flex-shrink: 0; }
        .lread-more summary:hover { background: #fef3c7; }
        .lread-more summary:focus-visible { outline: 2px solid #92400e; outline-offset: -3px; }
        .lread-more[open] > summary { border-bottom: 1px solid #fde7b0; }
        .lread-more[open] > summary svg { transform: rotate(180deg); }
        .lread-more-content { padding: 16px; }
        .lread-more-content > * { margin: 0 0 10px; }
        .lread-more-content > :last-child { margin-bottom: 0; }
        .lread-more-content ul { list-style: disc; padding-left: 1.35em; }
        .lread-more-content ol { list-style: decimal; padding-left: 1.5em; }
        .lread-more-content li + li { margin-top: 6px; }
        .lread-more-content blockquote { border-left: 2px solid #fde7b0; padding-left: 12px; }
        .lread-more-content { font-size: calc(15px * var(--lens-font-scale, 1)); line-height: 1.7; }
        /* 새 레터 틀 v2 — 샘플 HTML과 같은 크기·간격(본문 15.5px / 줄간격 1.75 / 문단 간격 12px / 칸 간격 28px / 소제목 19px 산세리프). */
        .lread[data-tpl="v2"] > p, .lread[data-tpl="v2"] > ul, .lread[data-tpl="v2"] > ol, .lread[data-tpl="v2"] > blockquote { font-size: calc(15.5px * var(--lens-font-scale, 1)); line-height: 1.75; letter-spacing: 0; }
        .lread[data-tpl="v2"] > p.lread-lead { font-size: calc(15.5px * var(--lens-font-scale, 1)); line-height: 1.75; font-weight: 400; color: #1f2937; }
        .lread[data-tpl="v2"] > * + * { margin-top: 12px; }
        .lread[data-tpl="v2"] > .lread-sub { margin-top: 30px; margin-bottom: 12px; }
        .lread[data-tpl="v2"] > .lread-sub + * { margin-top: 0; }
        .lread[data-tpl="v2"] .lread-sub[data-badge] .ch-t { margin-bottom: 9px; padding: 3px 9px; font-size: 12px; border-radius: 10px; }
        .lread[data-tpl="v2"] .lread-sub[data-badge] .ch-q { font-family: inherit; font-size: calc(19px * var(--lens-font-scale, 1)); line-height: 1.45; letter-spacing: -0.01em; }
        .lread[data-tpl="v2"] .lread-sub[data-badge="0"] .ch-t { color: #4338ca; background: #eef2ff; }
        .lread[data-tpl="v2"] .lread-sub[data-badge="1"] .ch-t { color: #c2410c; background: #fff7ed; }
        .lread[data-tpl="v2"] .lread-sub[data-badge="2"] .ch-t { color: #047857; background: #ecfdf5; }
        .lread[data-tpl="v2"] .lread-sub[data-badge="3"] .ch-t { color: #b91c1c; background: #fef2f2; }
        .lread[data-tpl="v2"] > .lread-summary { margin: 0 0 24px; padding: 16px 18px; }
        .lread[data-tpl="v2"] .lread-summary p { font-size: calc(14.5px * var(--lens-font-scale, 1)); line-height: 1.7; }
        .lread[data-tpl="v2"] > .lread-box { margin-top: 26px; padding: 16px 18px; }
        .lread[data-tpl="v2"] .lread-box p { font-size: calc(14.5px * var(--lens-font-scale, 1)); line-height: 1.7; margin-bottom: 8px; }
        .lread[data-tpl="v2"] .lread-box-takeaway p { font-size: calc(15.5px * var(--lens-font-scale, 1)); }
        .lread[data-tpl="v2"] .lread-box-vote p { font-size: calc(14.5px * var(--lens-font-scale, 1)); margin-bottom: 6px; }
        .lread[data-tpl="v2"] .lread-more p { font-size: calc(14.5px * var(--lens-font-scale, 1)); line-height: 1.7; }
        /* 좌우 비교(갈리는 전망) — 초록/빨강 두 칸, 좁은 화면에선 위아래로 쌓인다. */
        .lread > .lread-compare { margin-top: 12px; }
        .lread-compare > p { margin: 0 0 12px; }
        .lread-compare-cols { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 14px; }
        .lread-compare-col { flex: 1 1 240px; min-width: 0; padding: 14px 16px; border-radius: 10px; }
        .lread-compare-col p { margin: 0 0 7px; font-size: calc(14.5px * var(--lens-font-scale, 1)); line-height: 1.7; }
        .lread-compare-col p:last-child { margin-bottom: 0; }
        .lread-compare-a { background: #f0fdf4; } .lread-compare-a .lread-box-title { color: #15803d; }
        .lread-compare-b { background: #fef2f2; } .lread-compare-b .lread-box-title { color: #b91c1c; }
        /* 편지 마무리 — 따뜻한 한 줄 + 발신인. 위쪽 룰 없이 여백만. */
        .lread-sign { margin-top: 24px; text-align: center; }
        .lread-thanks { margin: 0 0 14px; font-size: calc(17px * var(--lens-font-scale, 1)); line-height: 1.7; color: #374151; font-weight: 500; }
        .lread-from { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 0; }
        .lread-sign-mark { flex-shrink: 0; width: 30px; height: 7px; border-radius: 0; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='1' stroke-width='2.6' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 700 8' preserveAspectRatio='none'%3E%3Cpath d='M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6' fill='none' stroke='%23111827' stroke-opacity='1' stroke-width='2.6' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") center / 100% 100% no-repeat; }
        .lread-sign-name { font-size: 13px; font-weight: 800; letter-spacing: 0.06em; color: #6b7280; }

        .hang { display: flex; flex-direction: column; gap: 20px;
          list-style: none; padding: 0; margin: 0; }
        .hang > li { display: flex; align-items: baseline; gap: 14px; word-break: keep-all;
          font-size: calc(16px * var(--lens-font-scale, 1)); line-height: 1.8; color: #374151; }
        .hang-n { flex-shrink: 0; width: 22px; font-size: 14px; font-weight: 800;
          color: #6b7280; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }

        .fmt-arrow { display: flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; flex-shrink: 0; border-radius: 999px;
          border: 1px solid #949494; background: #fff; cursor: pointer; }
        .fmt-arrow:disabled { cursor: default; opacity: .4; }
        .fmt-arrow:focus-visible { outline: 2px solid #111827; outline-offset: 2px; }

        /* 고정 제목 바(57px) + 여유. 형식 바는 더 이상 고정되지 않는다. */
        .lens-panel { scroll-margin-top: 84px; }

        @media (prefers-reduced-motion: no-preference) {
          .panel[data-dir='1'] { animation: swap-fwd .24s cubic-bezier(.22,.85,.2,1); }
          .panel[data-dir='-1'] { animation: swap-back .24s cubic-bezier(.22,.85,.2,1); }
          .panel[data-dir='0'] { animation: swap-in .22s ease-out; }
          @keyframes swap-fwd { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
          @keyframes swap-back { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: none; } }
          @keyframes swap-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
        }
        @media (prefers-reduced-motion: reduce) {
          .fmt-name, .fmt-amt, .lnk { transition: none; }
          .fmt-thumb { transition: none; }
        }
      `;
