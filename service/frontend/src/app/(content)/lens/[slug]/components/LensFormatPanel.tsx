'use client';

import type { MutableRefObject } from 'react';
import Image from 'next/image';
import { Play, Headphones, Images, Video, ArrowRight } from 'lucide-react';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { AutoPlayVideo } from '@/shared/ui/AutoPlayVideo';
import { TrackedAudio } from '@/shared/ui/TrackedAudio';
import { WebtoonCutGallery } from '@/shared/ui/WebtoonCutGallery';
import {
  LENS_CARD_BORDER,
  LENS_CARD_SHADOW,
  lensFormatAt,
  lensPanelId,
  lensPerspectiveAt,
  lensTabId,
} from '@/shared/constants/lensPerspectives';
import type { CmsLens, CmsLensItem } from '@/shared/lib/api/cmsPostsApi';
import { ARTICLE_FORMAT_SAMPLES, articleFormatSample, articleBridgeSample, mockDuration } from './lensSamples';
import { CardnewsCarousel } from './CardnewsCarousel';

// LensViewClient.tsx에서 추출(2026-08-24, God 파일 분해) — 4개 포맷(레터/
// 웹툰/팟캐스트/영상) 중 하나의 시선 패널 전체. lenses.map()의 콜백 본문을
// 그대로 컴포넌트로 옮긴 것 — 계산 로직·렌더 분기 전부 원본과 동일, 순수
// 이동. 4개 패널이 전부 hidden={!on}(CSS로만 숨김, 실제 언마운트 아님)으로
// 한 페이지에 동시에 존재하는 이유는 SEO 때문(page.tsx의 NewsArticle
// articleBody/mainEntity가 4개 시선 전체를 인용해야 함) — 아래 AutoPlayVideo
// 처리도 이 전제 위에 있다(안 보이는 탭에서 영상이 재생되는 걸 막기 위해
// on일 때만 실제 재생 트리거를 건다).
export function LensFormatPanel({
  lens,
  l,
  i,
  active,
  count,
  photo,
  select,
  tabRefs,
}: {
  lens: CmsLens;
  l: CmsLensItem;
  i: number;
  active: number;
  count: number;
  photo: string | null;
  select: (i: number) => void;
  tabRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
}) {
  const p = lensPerspectiveAt(i);
  const on = i === active;
  const format = lensFormatAt(i);
  // 웹툰·팟캐스트·영상은 완성감 있는 데모 스크립트(딱 한 기사에만
  // 있는 하드코딩 오버라이드)가 있으면 그걸 쓰고, 없는 기사는
  // admin이 실제로 채운 CMS 불릿을 그대로 쓴다(2026-08-19부터
  // LensMode.tsx 4개 포맷 탭이 슬롯마다 다른 내용을 넣을 수 있어
  // 이 폴백이 비로소 의미가 생겼다 — 그 전엔 모든 슬롯이 같은
  // question+bullets를 공유했다).
  const scriptBullets =
    format === 'webtoon' || format === 'podcast' || format === 'video'
      ? articleFormatSample(lens.id, format) ?? l.bullets
      : l.bullets;
  // 레터 본문 — 데모 오버라이드 → 없으면 admin이 채운 실제
  // paragraphs(2026-08-19 신설 필드) → 그것도 없으면 아래
  // 불릿 목록으로 폴백(letterParagraphs가 null인 경우).
  const letterParagraphs =
    format === 'letter'
      ? (articleFormatSample(lens.id, 'letter') ??
         (l.paragraphs && l.paragraphs.length > 0 ? l.paragraphs : null))
      : null;
  // 웹툰 표지 헤드라인 — 오버라이드가 있으면 그 표지 문구를,
  // 없으면 CMS 질문(l.question)을 그대로 쓴다.
  const webtoonHeadline =
    format === 'webtoon' ? ARTICLE_FORMAT_SAMPLES[lens.id]?.webtoonHeadline ?? l.question : l.question;
  // 실제 미디어 보유 여부(2026-08-19, LensMode.tsx 4개 포맷 탭에서
  // 실제로 채운 경우) — 있으면 정적 목업 대신 진짜 콘텐츠를 그린다.
  // 유튜브·네이버TV 판별은 /video 페이지와 같은 유틸(resolveVideo)을
  // 재사용한다.
  const realWebtoonCuts = format === 'webtoon' && l.images && l.images.length > 0 ? l.images : null;
  const realVideo = format === 'video' && l.video_url ? resolveVideo(l.video_url) : null;
  const realPodcast = format === 'podcast' && l.media_url ? resolveVideo(l.media_url) : null;
  // 유튜브·네이버TV가 아닌 직링크(S3 등에 직접 올린 mp4/mp3) —
  // resolveVideo()는 그 두 플랫폼만 인식해 null을 돌려주므로,
  // URL 자체는 있는데 매칭이 안 될 때만 <video>/<audio> 태그로
  // 직접 재생한다(2026-08-20, 실제 샘플 파일 업로드 대응).
  const directVideoUrl = format === 'video' && l.video_url && !realVideo ? l.video_url : null;
  const directPodcastUrl = format === 'podcast' && l.media_url && !realPodcast ? l.media_url : null;
  return (
    <section
      id={lensPanelId(i)}
      role="tabpanel"
      aria-labelledby={lensTabId(i)}
      data-speakable="qa"
      hidden={!on}
      className={on ? 'panel' : undefined}
      style={{
        marginTop: 'clamp(22px, 3.4vw, 30px)',
        // 왼쪽 규칙선(레일)도, 선택 직후 잠깐 배경을 물들이던
        // 클릭 피드백도 뺐다(2026-08-18, "유형 누르면 뜨는 배경색
        // 없애달라"). 위 타일 선택 상태 자체가 이미 색+테두리+
        // 그림자+체크 4중으로 표시되고 있어서, 본문까지 색을
        // 끌고 오지 않아도 "누구의 시선인지"는 위 타일과 "시선
        // {ordinal} · {full}" 텍스트로 충분히 전달된다.
      }}
    >
      {/* 역할 머리 — 압축했다. 52px 일러스트와 액센트 바를 뺀 이유는
          위 선택 타일에 이미 같은 인물이 강조된 채로 있어서 중복이고,
          그만큼 질문(이 화면의 실제 보상)이 아래로 밀렸기 때문이다.
          정체성은 컬러 서수 + 역할명 한 줄로 충분하다. */}
      {/* tagline 은 위 타일로 옮겼다 — 선택 전에 필요한 정보이고,
          여기서 반복하면 질문이 아래로 밀린다. 대신 몇 번째 시선인지
          전체 개수와 함께 보여준다(내가 넷 중 어디에 있는지). */}
      <div className="flex items-center" style={{ gap: 8, marginBottom: 'clamp(14px, 2.2vw, 18px)' }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: p.color, letterSpacing: '-0.01em', wordBreak: 'keep-all' }}>
          시선 {p.ordinal} · {p.full}
        </p>
        <span aria-hidden style={{ width: 1, height: 12, background: 'rgba(17,24,39,0.15)' }} />
        <p style={{ fontSize: 13, color: '#6b7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {i + 1} / {count}
        </p>
      </div>

      {/* 포맷 배지 — 실제 미디어(2026-08-19, LensMode.tsx 4개
          포맷 탭에서 admin이 채운 것)가 있으면 "목업" 문구를
          뺀다. letter는 지금 실제 운영 중인 형태라 배지 없이
          그대로 둔다. */}
      {format !== 'letter' && (
        <p
          className="flex items-center"
          style={{ gap: 6, fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 14 }}
        >
          {format === 'webtoon' && <Images size={13} aria-hidden />}
          {format === 'podcast' && <Headphones size={13} aria-hidden />}
          {format === 'video' && <Video size={13} aria-hidden />}
          {format === 'webtoon' && (realWebtoonCuts ? '웹툰' : '웹툰 형식 목업 · 아직 생성 파이프라인 미연결')}
          {format === 'podcast' && (realPodcast || directPodcastUrl ? '팟캐스트' : '팟캐스트 형식 목업 · 아직 생성 파이프라인 미연결')}
          {format === 'video' && (realVideo || directVideoUrl ? '영상' : '영상 형식 목업 · 아직 생성 파이프라인 미연결')}
        </p>
      )}

      {/* 질문 — 카드 안 시각적 정점(32). 장식 없이 세리프 크기만으로
          끌어올린다. */}
      {format === 'letter' && l.question && (
        <p
          className="lm"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(24px, 3vw, 32px)',
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.45,
            letterSpacing: '-0.03em',
            marginBottom: 'clamp(22px, 3.4vw, 28px)',
            wordBreak: 'keep-all',
          }}
        >
          {l.question}
        </p>
      )}

      {/* 레터 본문 — 데모 오버라이드가 있는 기사는 뉴스레터
          문단으로(2026-08-18, "카드뉴스 거 그대로 가져온거라서"
          지적 — 레터가 카드뉴스와 같은 불릿 목록을 그대로 쓰고
          있던 걸 고침). AI LENS 편집장 프롬프트의 문체 가이드
          (친근한 -했어요체, 문단당 2~3문장)를 따른다. */}
      {format === 'letter' && letterParagraphs && (
        <div className="lm" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {letterParagraphs.map((para, pi) => (
            <p
              key={pi}
              style={{
                fontSize: 'calc(16px * var(--lens-font-scale, 1))',
                lineHeight: 1.8,
                color: '#374151',
                wordBreak: 'keep-all',
              }}
            >
              {para}
            </p>
          ))}
        </div>
      )}

      {/* 불릿에 라벨을 붙여 질문과의 관계를 명시한다 — 앞서는 큰
          질문 다음에 사실이 그냥 나열돼서 둘이 Q&A 한 쌍이라는 게
          드러나지 않았고, 그래서 구획이 끝났는지도 애매했다.
          개수를 함께 보여주면 얼마나 읽어야 하는지도 예측된다.
          데모 문단 오버라이드가 없는 기사(대부분)는 지금처럼
          CMS 불릿을 그대로 쓴다. */}
      {format === 'letter' && !letterParagraphs && l.bullets.length > 0 && (
        <>
          <p
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.06em',
              color: '#6b7280',
              marginBottom: 14,
            }}
          >
            이 질문에 답하는 사실 {l.bullets.length}
          </p>
          <ul className="lm" style={{ display: 'flex', flexDirection: 'column', gap: 14, listStyle: 'none', padding: 0, margin: 0 }}>
            {l.bullets.map((b, bi) => (
              <li key={bi} style={{ display: 'flex', gap: 12, fontSize: 'calc(16px * var(--lens-font-scale, 1))', lineHeight: 1.75, color: '#374151', wordBreak: 'keep-all' }}>
                <span
                  aria-hidden
                  className="flex-shrink-0"
                  style={{ width: 5, height: 5, marginTop: 11, borderRadius: 999, background: p.color }}
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {format === 'letter' && !letterParagraphs && !l.question && l.bullets.length === 0 && (
        <p style={{ fontSize: 14, color: '#6b7280' }}>이 시선은 아직 준비 중이에요.</p>
      )}

      {/* 카드뉴스 목업 — 인스타 카드뉴스처럼 한 번에 한 장만
          크게 보여주고 화살표(또는 스와이프)로 넘긴다
          (2026-08-18, "가로 스크롤 필름스트립은 촌스럽다" 지적
          → /design 캔버스로 방향 스케치 후 승인받고 반영).
          실제 카드뉴스 규격(8컷, 비주얼시스템)은 볼트
          01_카드뉴스_제작템플릿.md 참조 — 여기선 개수·구조
          컨셉만 보여준다. */}
      {/* 실제 웹툰 컷(2026-08-19) — admin이 LensMode.tsx 웹툰
          탭에서 WebtoonPanelsEditor로 올린 이미지+캡션이 있으면
          아래 목업 캐러셀 대신 실제 컷을 순서대로 보여준다. */}
      {/* pipelines/webtoon이 실제로 만드는 컷은 1536x1024(3:2 가로) —
          예전 인스타 카드뉴스(4:5 세로) 전제로 aspect-ratio 4/5 +
          cover를 썼더니 좌우가 크게 잘려서, 말풍선이 화면 가장자리에
          있으면(BUBBLE_RULES가 "상단·측면 배치"를 지시함) 통째로
          잘려 보이는 문제가 있었다(2026-08-20 사용자 리포트). contain
          으로 바꿔 잘림 없이 전체를 보여준다 — 비율이 정확히 3:2면
          레터박스도 안 생긴다. 렌더링은 WebtoonCutGallery로 뺐다 —
          완주율 계측(useCutViewTracking)이 hooks라 .map() 루프
          안에선 못 써서. */}
      {format === 'webtoon' && realWebtoonCuts && (
        <WebtoonCutGallery cuts={realWebtoonCuts} articleId={lens.id} />
      )}

      {/* 카드뉴스형 목업 — 실제 컷이 없을 때만(위 realWebtoonCuts
          분기 참조). 인스타 카드뉴스처럼 한 번에 한 장만 크게
          보여주고 화살표(또는 스와이프)로 넘긴다(2026-08-18,
          "가로 스크롤 필름스트립은 촌스럽다" 지적 → /design
          캔버스로 방향 스케치 후 승인받고 반영). */}
      {format === 'webtoon' && !realWebtoonCuts && (
        <CardnewsCarousel
          photo={photo}
          coverHeadline={webtoonHeadline || ''}
          ordinal={p.ordinal}
          full={p.full}
          color={p.color}
          tint={p.tint}
          Icon={p.icon}
          cards={scriptBullets.map((b) => {
            const parts = b.split(' — ');
            return parts.length === 2
              ? { hook: parts[0], caption: parts[1] }
              : { hook: null, caption: b };
          })}
        />
      )}

      {/* 실제 팟캐스트 미디어(2026-08-19) — admin이 LensMode.tsx
          팟캐스트 탭에서 YouTube 등 링크를 채운 경우 실제 플레이어를
          임베드한다(/video 페이지와 같은 resolveVideo 유틸). */}
      {format === 'podcast' && realPodcast && (
        <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 16, background: '#111827' }}>
          {/* embedUrl에 autoplay=1이 박혀 있어(videoEmbed.ts), 이
              섹션이 실제로 안 보일 때(on=false)도 src를 그대로
              넣으면 숨은 채로 재생된다 — on일 때만 src를 준다
              (2026-08-23, 아래 AutoPlayVideo 주석과 같은 이유). */}
          <iframe
            src={on ? realPodcast.embedUrl : undefined}
            title={l.question || '팟캐스트'}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* 직링크 오디오(2026-08-20) — S3 등에 직접 올린 mp3. 유튜브가
          아니라 iframe 임베드가 안 되므로 네이티브 <audio>로 재생. */}
      {format === 'podcast' && directPodcastUrl && (
        <div style={{ border: LENS_CARD_BORDER, borderRadius: 16, padding: 18, background: '#fff', boxShadow: LENS_CARD_SHADOW }}>
          <p
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 16,
              fontWeight: 700,
              color: '#111827',
              letterSpacing: '-0.01em',
              wordBreak: 'keep-all',
              marginBottom: 12,
            }}
          >
            {l.question || '오늘의 브리핑'}
          </p>
          <TrackedAudio src={directPodcastUrl} articleId={lens.id} />
        </div>
      )}

      {/* 팟캐스트 목업 — 실제 미디어가 없을 때만(위 realPodcast/
          분기 참조). 재생 버튼·진행바는 정적 장식(실제 오디오
          없음). 오늘(2026-08-18) 레터 상세에서 "대부분 오디오가
          없어 빈 회색 카드로 보인다"는 이유로 미니 플레이어를
          뺐던 것과 같은 함정을 피하려고, 여기서도 실제 재생 상태를
          흉내내지 않고 컨셉만 고정 표시한다.
          디자인(2026-08-18 다듬기): tint 채움 카드 → 흰 바탕 +
          공용 그림자·테두리 토큰. 챕터 라벨을 굵은 인라인 텍스트
          대신 알약 배지로 바꿔 목록이 표처럼 정렬되게 했다. */}
      {/* 스크립트 전문(2026-08-23, 사용자 요청 — "청각장애인 분들을
          위해서 본문도 넣어두면 좋을듯", 타임스탬프 동기화 없이
          그냥 텍스트만). 파이프라인이 채워준 값이 있을 때만 뜬다 —
          admin 수동 작성 글이나 목업엔 없어서 자연히 안 보인다. */}
      {format === 'podcast' && l.transcript && (
        <div style={{ border: LENS_CARD_BORDER, borderRadius: 16, padding: 18, background: '#fff', boxShadow: LENS_CARD_SHADOW }}>
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 10 }}>
            스크립트 (본문 텍스트)
          </p>
          <div style={{ fontSize: 15, lineHeight: 1.85, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
            {l.transcript}
          </div>
        </div>
      )}

      {format === 'podcast' && !realPodcast && !directPodcastUrl && (
        <div style={{ border: LENS_CARD_BORDER, borderRadius: 16, padding: 18, background: '#fff', boxShadow: LENS_CARD_SHADOW }}>
          <div className="flex items-center" style={{ gap: 14 }}>
            <span
              aria-hidden
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 46, height: 46, borderRadius: 999, background: p.color, color: '#fff' }}
            >
              <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111827',
                  letterSpacing: '-0.01em',
                  wordBreak: 'keep-all',
                  marginBottom: 4,
                }}
              >
                {l.question || '오늘의 브리핑'}
              </p>
              <p style={{ fontSize: 12.5, color: '#9ca3af' }}>약 {mockDuration(scriptBullets.length)} · AI 음성 브리핑</p>
            </div>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: 'rgba(17,24,39,0.07)', margin: '18px 0 16px', overflow: 'hidden' }}>
            <div style={{ width: '18%', height: '100%', borderRadius: 999, background: p.color }} />
          </div>
          {scriptBullets.length > 0 && (
            <>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 10 }}>
                이 브리핑이 다루는 것 {scriptBullets.length}
              </p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
              {scriptBullets.map((b, bi) => (
                <li key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: '#374151', wordBreak: 'keep-all' }}>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: 800,
                      color: p.color,
                      background: p.tint,
                      borderRadius: 999,
                      padding: '2px 8px',
                      marginTop: 1,
                    }}
                  >
                    챕터 {bi + 1}
                  </span>
                  <span style={{ lineHeight: 1.6 }}>{b}</span>
                </li>
              ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* 실제 영상(2026-08-19) — admin이 LensMode.tsx 영상 탭에서
          YouTube 등 링크를 채운 경우 실제 플레이어를 임베드한다
          (/video 페이지와 같은 resolveVideo 유틸). */}
      {format === 'video' && realVideo && (
        <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 16, background: '#111827' }}>
          {/* on일 때만 src — 팟캐스트 iframe과 같은 이유. */}
          <iframe
            src={on ? realVideo.embedUrl : undefined}
            title={l.question || '영상'}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* 직링크 영상(2026-08-20) — S3 등에 직접 올린 mp4(예: Remotion
          렌더 결과). 유튜브가 아니라 iframe 임베드가 안 되므로
          네이티브 <video>로 재생. */}
      {format === 'video' && directVideoUrl && (
        <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 16, background: '#111827' }}>
          {/* 자동재생(2026-08-23, 사용자 요청 — "누르기 귀찮"),
              단 실제로 이 섹션이 보일 때(on)만 — 4개 포맷 섹션이
              전부 hidden 속성으로만 숨겨진 채 동시에 마운트돼 있어서
              그냥 autoPlay를 쓰면 안 보이는 탭에서도 재생되는 버그가
              났었다(위 AutoPlayVideo 주석 참조). realVideo(유튜브
              등 iframe embed) 쪽은 videoEmbed.ts의 embedUrl에
              이미 autoplay=1이 박혀 있어 그대로 뒀다. */}
          <AutoPlayVideo src={directVideoUrl} active={on} articleId={lens.id} />
        </div>
      )}

      {/* 영상 목업 — 실제 영상이 없을 때만(위 realVideo/
          directVideoUrl 분기 참조). 기사 사진을 썸네일로 재사용,
          재생 버튼 오버레이만 정적으로 얹는다.
          디자인(2026-08-18 다듬기): 플레이어 아래 캡션·타임라인을
          팟캐스트 챕터와 같은 알약 배지 톤으로 맞춰 두 오디오/영상
          포맷이 한 세트로 읽히게 했고, 카드 전체에 공용 그림자를
          둘러 다른 포맷 카드들과 무게감을 맞췄다. */}
      {/* 스크립트 전문(2026-08-23) — 팟캐스트와 같은 이유. */}
      {format === 'video' && l.transcript && (
        <div style={{ border: LENS_CARD_BORDER, borderRadius: 16, padding: 18, background: '#fff', boxShadow: LENS_CARD_SHADOW }}>
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 10 }}>
            스크립트 (본문 텍스트)
          </p>
          <div style={{ fontSize: 15, lineHeight: 1.85, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
            {l.transcript}
          </div>
        </div>
      )}

      {format === 'video' && !realVideo && !directVideoUrl && (
        <div style={{ borderRadius: 16, background: '#fff', boxShadow: LENS_CARD_SHADOW, padding: 14 }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#111827',
            }}
          >
            {photo && (
              <Image src={photo} alt="" fill sizes="640px" style={{ objectFit: 'cover', opacity: 0.65 }} />
            )}
            <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'rgba(17,24,39,0.15)' }} />
            <span
              aria-hidden
              className="flex items-center justify-center"
              style={{
                position: 'absolute',
                inset: 0,
                margin: 'auto',
                width: 58,
                height: 58,
                borderRadius: 999,
                background: '#fff',
                color: p.color,
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              }}
            >
              <Play size={22} fill="currentColor" style={{ marginLeft: 3 }} />
            </span>
            <span
              style={{
                position: 'absolute',
                right: 10,
                bottom: 10,
                fontSize: 11,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: '#fff',
                background: 'rgba(0,0,0,0.6)',
                borderRadius: 4,
                padding: '2px 7px',
              }}
            >
              {mockDuration(scriptBullets.length)}
            </span>
          </div>
          {l.question && (
            <p
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 16,
                fontWeight: 700,
                color: '#111827',
                letterSpacing: '-0.01em',
                margin: '14px 0 10px',
                wordBreak: 'keep-all',
              }}
            >
              {l.question}
            </p>
          )}
          {scriptBullets.length > 0 && (
            <>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 10 }}>
                이 영상이 다루는 것 {scriptBullets.length}
              </p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
              {scriptBullets.map((b, bi) => (
                <li key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: '#374151', wordBreak: 'keep-all' }}>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: 800,
                      fontVariantNumeric: 'tabular-nums',
                      color: p.color,
                      background: p.tint,
                      borderRadius: 999,
                      padding: '2px 8px',
                      marginTop: 1,
                    }}
                  >
                    0:{String((bi + 1) * 12).padStart(2, '0')}
                  </span>
                  <span style={{ lineHeight: 1.6 }}>{b}</span>
                </li>
              ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* 시선 간 연결 — 네 포맷이 따로 떨어져 보인다는 지적
          (2026-08-18, "이 4개의 순서가... 연결점, 스토리텔링이
          자연스러우면 좋겠다" — 전화영어 서비스 레슨 플로우처럼)
          에 따라, 마지막(video)만 빼고 각 포맷 끝에 다음 시선으로
          넘어가는 한 줄을 둔다. 데모 문구가 없는 기사·포맷은
          다음 시선의 role명으로 자동 생성해 어떤 기사에도 동작. */}
      {format !== 'video' && i + 1 < count && (
        <button
          type="button"
          onClick={() => {
            select(i + 1);
            tabRefs.current[i + 1]?.focus();
          }}
          className="flex items-center"
          style={{
            gap: 6,
            marginTop: 20,
            paddingTop: 16,
            width: '100%',
            background: 'none',
            border: 'none',
            borderTop: '1px solid rgba(17,24,39,0.08)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 13.5,
            fontWeight: 700,
            color: lensPerspectiveAt(i + 1).color,
            wordBreak: 'keep-all',
          }}
        >
          <span>{articleBridgeSample(lens.id, format) ?? `다음 시선 — ${lensPerspectiveAt(i + 1).full}`}</span>
          <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </section>
  );
}
