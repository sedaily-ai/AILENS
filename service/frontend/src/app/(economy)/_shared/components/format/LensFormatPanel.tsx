'use client';

import { renderInline } from './renderInline';

import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react';
import { displayHeadline, seoHeadline } from '@/shared/lib/content/displayHeadline';
import { chapterId } from './lensChapters';
import { ReadDone } from '@/app/(economy)/_shared/components/article/ReadDone';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { SITE_URL } from '@/shared/constants/site';
import { ArticleShareButtons } from '@/shared/ui/article/ArticleShareButtons';
import { parseLetterBlocks } from './lensBlocks';
import { resolveVideo } from '@/shared/lib/media/videoEmbed';
import { ArticleAudioPlayer } from '@/shared/ui/article/ArticleAudioPlayer';
import { ArticleVideoPlayer } from '@/shared/ui/article/ArticleVideoPlayer';
import { WebtoonCutGallery } from '@/shared/ui/media/WebtoonCutGallery';
import { FormatStepNav } from './FormatStepNav';
import { PodcastTranscript } from '@/app/(economy)/_shared/components/article/PodcastTranscript';
import { podcastScriptParagraphs } from '@/shared/lib/media/podcastScript';
import { webtoonVariant } from '@/shared/lib/tracking/webtoonVariant';

import { SentenceSelectionPopover } from '@/widgets/SentenceSelectionPopover';
import {
  lensFormatAt,
  lensPanelId,
  lensPerspectiveAt,
  lensTabId,
  READING_ACCENT,
} from '@/shared/constants/lensPerspectives';
import type { CmsLens, CmsLensItem } from '@/shared/lib/api/cmsPostsApi';
import { ARTICLE_FORMAT_SAMPLES, articleFormatSample, readMinutes } from './lensSamples';
import { CardnewsCarousel } from './CardnewsCarousel';

// LensViewClient.tsx에서 추출(2026-08-24, God 파일 분해) — 4개 포맷(레터/
// 웹툰/팟캐스트/영상) 중 하나의 시선 패널 전체. lenses.map()의 콜백 본문을
// 그대로 컴포넌트로 옮긴 것 — 계산 로직·렌더 분기 전부 원본과 동일, 순수
// 이동. 4개 패널이 전부 hidden={!on}(CSS로만 숨김, 실제 언마운트 아님)으로
// 한 페이지에 동시에 존재하는 이유는 SEO 때문(page.tsx의 NewsArticle
// articleBody/mainEntity가 4개 시선 전체를 인용해야 함) — 오디오·영상
// 플레이어가 hidden 여부와 무관하게 항상 렌더되는 이유도 같다: 탭 바
// (FormatPicker)가 "이 기사를 이 형식으로 보면 얼마나 되는지"를 4개
// 전부 미리 보여줘야 해서, 안 보이는 패널의 플레이어도 메타데이터(길이)만
// 조용히 읽어와 onDuration으로 보고한다(preload="metadata", 실제 재생은
// 사용자가 눌러야 시작됨).
//
// 2026-08-24(웹툰 릴론치 PR #10 반영) — 네이티브 <audio>/<video> 대신 실측
// 재생시간·탐색바·배속을 갖춘 ArticleAudioPlayer/ArticleVideoPlayer로 교체.
// "다음 시선" 버튼은 걷어냈다(2026-08-21, 사용자 요청 — "다 지워줘". 형식
// 탭이 sticky로 항상 떠 있고 이미 진행 인디케이터를 보여주므로 본문 끝마다
// 같은 안내를 반복할 필요가 없다는 판단, 게다가 항상 다음 인덱스 하나만
// 가리켜서 탭을 건너뛰어 온 사용자에겐 안내가 틀렸었다).
export function LensFormatPanel({
  lens,
  l,
  i,
  active,
  photo,
  dir,
  onPanelTouchStart,
  onPanelTouchEnd,
  noteDur,
}: {
  lens: CmsLens;
  l: CmsLensItem;
  i: number;
  active: number;
  photo: string | null;
  /** 방금 어느 방향으로 이동했는지(-1/0/+1) — 인디케이터 이동 방향과
   *  본문 진입 방향(swap-fwd/swap-back)을 맞추는 데만 쓴다. */
  dir: number;
  onPanelTouchStart?: (e: ReactTouchEvent) => void;
  onPanelTouchEnd?: (e: ReactTouchEvent, i: number) => void;
  /** 실측 오디오·영상 길이(초) 보고 — 부모가 FormatPicker의 분량 표기에 쓴다. */
  noteDur: (i: number, sec: number) => void;
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
  // 팟캐스트 대본 전문 — CMS의 팟캐스트 슬롯(l.bullets)엔 짧은 핵심 요약
  // 3~5줄만 저장된다(admin LensMode.tsx에서 이 필드 라벨 자체가 "챕터").
  // 실제 음성으로 녹음된 8~12분 전체 원고는 텍스트로 저장되지 않는다 —
  // 오디오 파일(media_url)만 있고 그걸 만든 대본 텍스트는 시스템에 없다.
  // 없는 문장을 새로 지어내면 "원문에 없는 것은 만들지 않는다" 원칙에
  // 걸리므로, 같은 기사에 이미 있는 가장 긴 완결된 산문 — 레터 포맷의
  // 전체 문단(lenses[0], 보통 6~7개 문단)을 대신 보여준다. 지어낸 글이
  // 아니라 같은 기사의 실제 CMS 데이터다.
  const letterFullText =
    articleFormatSample(lens.id, 'letter') ??
    ((lens.lenses ?? [])[0]?.paragraphs && (lens.lenses ?? [])[0].paragraphs!.length > 0
      ? (lens.lenses ?? [])[0].paragraphs
      : null);
  const podcastScript =
    format === 'podcast' && letterFullText && letterFullText.length > 0 ? letterFullText : scriptBullets;
  // 플레이어 대본 패널의 문단 — 실제로 음성으로 읽는 원고(transcript)가 있으면 그것을 쓴다(2026-10-03).
  // 예전엔 레터 본문을 대신 보여 줘서 "듣는 내용과 대본이 다르다"는 문제가 있었다. 원고가 없는 글만 예전 폴백(레터/요약)을 쓴다.
  const podcastChapters =
    format === 'podcast' ? (l.transcript ? podcastScriptParagraphs(l.transcript) : podcastScript) : [];
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
  // URL 자체는 있는데 매칭이 안 될 때만 실제 플레이어로 직접 재생한다
  // (2026-08-20, 실제 샘플 파일 업로드 대응).
  const directVideoUrl = format === 'video' && l.video_url && !realVideo ? l.video_url : null;
  const directPodcastUrl = format === 'podcast' && l.media_url && !realPodcast ? l.media_url : null;
  const hasPodcast = Boolean(realPodcast || directPodcastUrl);
  const hasVideo = Boolean(realVideo || directVideoUrl);

  // 준비 안 된 형식의 안내 — 탭의 "준비 중"이 고르기 전에 알리고,
  // 이 줄이 그래서 대신 뭐가 있는지 말한다. 형식 이름·분량을 다시
  // 쓰지 않는다(탭에 이미 있다).
  const note =
    format === 'webtoon' && !realWebtoonCuts
      ? '웹툰 컷은 아직 준비 중이에요. 아래는 컷에 들어갈 대사예요.'
      : format === 'podcast' && !hasPodcast
        ? '음성 파일은 아직 준비 중이에요. 아래는 브리핑에 들어갈 대본이에요.'
        : format === 'video' && !hasVideo
          ? '영상은 아직 준비 중이에요. 아래는 영상에 들어갈 대본이에요.'
          : null;

  return (
    <section
      key={i}
      id={lensPanelId(i)}
      role="tabpanel"
      aria-labelledby={lensTabId(i)}
      data-speakable="qa"
      hidden={!on}
      className={on ? 'lens-panel panel' : 'lens-panel'}
      data-dir={on ? dir : undefined}
      onTouchStart={onPanelTouchStart}
      onTouchEnd={(e) => onPanelTouchEnd?.(e, i)}
      style={{ marginTop: 'clamp(24px, 3.4vw, 32px)' }}
    >
      {/* 패널 제목줄(형식 이름 + 분량)은 걷어냈다 — 그 정보가 탭 안으로
          올라갔고, 탭은 sticky라 항상 화면에 있다. 같은 말을 두 번 하지
          않는다. 남은 건 "준비 중"일 때의 안내 한 줄뿐이다. */}
      {note && <p className="fmt-note">{note}</p>}

      {/* 질문 — 카드 안 시각적 정점. 네 형식의 첫 줄 무게를 하나로 맞춘다 —
          탭을 옮길 때마다 첫 줄 크기가 뛰면 "같은 대상의 다른 표면"이
          아니라 "다른 페이지"로 느껴진다. */}
      {/* 맨 위 제목과 똑같은 문장이 탭 바로 아래에 한 번 더 나와 반복돼 보여서 눈에는 숨긴다(스크린리더·구조는 유지). */}
      {format === 'letter' && l.question && (
        <p className="fmt-lede" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          {displayHeadline(l.question)}
        </p>
      )}

      {/* 레터 본문 — 편집 지면 톤(읽기 폭 620px 상한 + 첫 문단 리드인 +
          문단 간격 24px). AI LENS 편집장 프롬프트의 문체 가이드(친근한
          -했어요체, 문단당 2~3문장)를 따른다.
          article[data-letter-body]로 감싸는 이유 — SentenceSelectionPopover가
          이 안에서만 selection을 인정한다(letters/[id] 페이지와 동일 관례).
          2026-08-24, 사용자 지적: 이 lens 페이지엔 이 컴포넌트 자체가 안
          붙어있어서 문장을 긁어도 서랍에 담는 버튼이 안 떴다. */}
      {format === 'letter' && letterParagraphs && (
        <article data-letter-body>
          <div className="lread" style={{ ['--lc' as string]: READING_ACCENT } as CSSProperties}>
            {/* 본문 블록 렌더(2026-10-01) — parseLetterBlocks가 소제목·목록·인용·구분선을 읽어 풀어 주므로 프롬프트
                출력 형식이 달라져도 기호가 그대로 새지 않는다. 소제목 id는 오른쪽 구간 목차의 앵커. */}
            {(() => {
              const blocks = parseLetterBlocks(letterParagraphs, { headline: lens.headline });
              const chTotal = blocks.filter((x) => x.type === 'sub').length;
              return blocks.map((b, bi) => {
              const kw = l.keywords ?? [];
              switch (b.type) {
                case 'lead':
                  return (
                    <p key={bi} className="lread-lead">
                      {renderInline(b.text, kw)}
                    </p>
                  );
                case 'sub':
                  return (
                    <h3 key={bi} id={chapterId(b.no)} className="lread-sub">
                      <span className="ch-no">
                        {String(b.no + 1).padStart(2, '0')}
                        <i>/ {String(chTotal).padStart(2, '0')}</i>
                      </span>
                      <span className="ch-t">{renderInline(b.head, kw)}</span>
                      {b.question && <span className="ch-q">{renderInline(b.question, kw)}</span>}
                    </h3>
                  );
                case 'ul':
                  return (
                    <ul key={bi}>
                      {b.items.map((it, ii) => (
                        <li key={ii}>{renderInline(it, kw, { numbers: true })}</li>
                      ))}
                    </ul>
                  );
                case 'ol':
                  return (
                    <ol key={bi}>
                      {b.items.map((it, ii) => (
                        <li key={ii}>{renderInline(it, kw, { numbers: true })}</li>
                      ))}
                    </ol>
                  );
                case 'quote':
                  return <blockquote key={bi}>{renderInline(b.text, kw)}</blockquote>;
                case 'hr':
                  return (
                    <div key={bi} className="lread-hr" aria-hidden>
                      ···
                    </div>
                  );
                default:
                  return <p key={bi}>{renderInline(b.text, kw, { numbers: true })}</p>;
              }
              });
            })()}
            {/* 레터 사인오프 — 편지 형식의 마무리(2026-08-24, 사용자 요청:
                "레터 형식에 맞게 디자인 요소 추가"). 앞선 ■ 하나는 "기사 끝"
                신호일 뿐 편지 느낌을 주지 못했다. 얇은 룰 + 형식 색 마크 +
                발신인 라벨로 뉴스레터 서명처럼 닫는다. */}
            <ReadDone minutes={readMinutes(letterParagraphs.join('').length)} />
            <div className="lread-sign">
              <p className="lread-thanks">끝까지 읽어주셔서 고마워요.</p>
              <p className="lread-from">
                <span className="lread-sign-mark" style={{ background: READING_ACCENT }} aria-hidden />
                <span className="lread-sign-name">AI LENS 편집팀</span>
              </p>
              <div className="lread-share">
                <span className="lread-share-label">친구에게 공유하기</span>
                <ArticleShareButtons title={seoHeadline(lens.headline)} url={`${SITE_URL}${lensPath(lens)}`} />
              </div>
            </div>
          </div>
          {on && <SentenceSelectionPopover letter={{ id: lens.id, headline: lens.headline, publishedAt: lens.date }} glossary={l.keywords} />}
        </article>
      )}

      {/* 불릿에 라벨을 붙여 질문과의 관계를 명시한다 — 데모 문단
          오버라이드가 없는 기사(대부분)는 지금처럼 CMS 불릿을 그대로 쓴다. */}
      {format === 'letter' && !letterParagraphs && l.bullets.length > 0 && (
        <article data-letter-body>
          <p className="ovl" style={{ marginBottom: 16 }}>
            이 질문에 답하는 사실 {l.bullets.length}
          </p>
          <ol className="hang lread">
            {l.bullets.map((b, bi) => (
              <li key={bi}>
                <span aria-hidden className="hang-n">
                  {String(bi + 1).padStart(2, '0')}
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ol>
          {on && <SentenceSelectionPopover letter={{ id: lens.id, headline: lens.headline, publishedAt: lens.date }} glossary={l.keywords} />}
        </article>
      )}

      {/* 빈 상태 — "왜 비었는지 + 무엇을 하면 되는지"를 쓴다. */}
      {format === 'letter' && !letterParagraphs && !l.question && l.bullets.length === 0 && (
        <div style={{ fontSize: 16, lineHeight: 1.7, color: '#374151', wordBreak: 'keep-all' }}>
          <p>이 기사의 레터는 아직 만들지 않았어요.</p>
          <p style={{ marginTop: 8, color: '#6b7280' }}>
            위에서 다른 형식을 골라보거나, 아래 원문 기사에서 전체 내용을 확인할 수 있어요.
          </p>
        </div>
      )}

      {/* 실제 웹툰 컷(2026-08-19) — admin이 LensMode.tsx 웹툰 탭에서
          WebtoonPanelsEditor로 올린 이미지+캡션이 있으면 아래 목업 캐러셀
          대신 실제 컷을 순서대로 보여준다. 컷을 이어 붙인 한 줄기로
          렌더하는 것과 완주율 계측은 WebtoonCutGallery가 담당한다. */}
      {format === 'webtoon' && realWebtoonCuts && <WebtoonCutGallery cuts={realWebtoonCuts} articleId={lens.id} category={lens.category ?? null} />}

      {/* 대사 전문 — 컷 안 말풍선에 이미 있는 대사를 여기서 한 번 더
          접어서 보여준다(소리를 못 듣거나 이미지가 안 뜨거나, 인용하려는
          경우). hidden으로만 감춰서 DOM에는 항상 있다. */}
      {/* 대사 전문(2026-10-01) — 화면에서는 버튼·목록을 없앴다(독자에겐 군더더기). 컷 안 글자는 이미지라 검색엔진·AI·스크린리더가
          읽지 못하므로, 같은 대사를 텍스트로 DOM에 그대로 둔다(시각적으로만 숨김 = 접근성 표준 sr-only, 이미지 안 글과 동일한 내용). */}
      {format === 'webtoon' && realWebtoonCuts && realWebtoonCuts.some((c) => c.caption) && (
        <div className="sr-only">
          <h3>웹툰 대사 전문</h3>
          <ol>
            {realWebtoonCuts.map((cut, ci) => (
              <li key={ci}>{cut.caption || '(대사 없음)'}</li>
            ))}
          </ol>
        </div>
      )}

      {/* 카드뉴스형 목업 — 실제 컷이 없을 때만. */}
      {format === 'webtoon' && !realWebtoonCuts && (
        <CardnewsCarousel
          photo={photo}
          coverHeadline={webtoonHeadline || ''}
          formatName={p.short}
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

      {/* 실제 팟캐스트 미디어(2026-08-19) — admin이 YouTube 등 링크를
          채운 경우 실제 플레이어를 임베드한다. */}
      {format === 'podcast' && realPodcast && (
        <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 16, background: '#111827' }}>
          <iframe
            src={realPodcast.embedUrl}
            title={displayHeadline(l.question) || '팟캐스트'}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* 직링크 오디오(2026-08-20) — S3 등에 직접 올린 mp3.
          ArticleAudioPlayer(2026-08-21 재설계 — 네이티브 <audio controls>는
          브라우저마다 생김새가 달라 "여기만 남의 UI"로 보였다): 탐색 가능한
          진행바, 현재/전체 길이, 15초 뒤로, 배속. chapters는 실측 타임코드가
          없어 seek 불가능한 "읽는 대본"으로만 전달한다. */}
      {format === 'podcast' && directPodcastUrl && (
        <ArticleAudioPlayer
          src={directPodcastUrl}
          accent={READING_ACCENT}
          label={p.short}
          kicker="귀로 듣는 브리핑"
          title={displayHeadline(l.question) || '오늘의 브리핑'}
          coverImage={photo}
          byline={lens.source_url ? '서울경제 원문 기사' : null}
          bylineHref={lens.source_url}
          chapters={podcastChapters.length > 0 ? podcastChapters.map((text) => ({ text })) : undefined}
          onDuration={(sec) => noteDur(i, sec)}
        />
      )}

      {/* 음성이 아직 없는 기사 — 가짜 재생 버튼·가짜 진행바·가짜 길이를
          걷어내고, 실제로 존재하는 것(대본)만 밝혀 보여준다. */}
      {format === 'podcast' && !hasPodcast && (
        <div>
          {l.question && <p className="fmt-lede">{displayHeadline(l.question)}</p>}
          {scriptBullets.length > 0 && (
            <ol className="hang lread">
              {scriptBullets.map((b, bi) => (
                <li key={bi}>
                  <span aria-hidden className="hang-n">
                    {String(bi + 1).padStart(2, '0')}
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* 스크립트 전문(2026-08-23, 사용자 요청 — "청각장애인 분들을 위해서
          본문도 넣어두면 좋을듯", 타임스탬프 동기화 없이 그냥 텍스트만).
          파이프라인이 채워준 값이 있을 때만 뜬다 — admin 수동 작성 글이나
          목업엔 없어서 자연히 안 보인다. ArticleAudioPlayer의 chapters는
          짧은 요약 3~5줄뿐이라, 전체 원고가 필요한 접근성 용도로는
          별도로 둔다. */}
      {/* 재생기가 있으면 그 안의 대본 패널이 이 원고를 보여 주므로(2026-10-03) 아래에 또 두지 않는다. 음성이 없는 글만 이 단독 대본을 쓴다. */}
      {format === 'podcast' && l.transcript && !directPodcastUrl && (
        <PodcastTranscript text={l.transcript} />
      )}

      {/* 실제 영상(2026-08-19) — admin이 YouTube 등 링크를 채운 경우 실제
          플레이어를 임베드한다. */}
      {format === 'video' && realVideo && (
        <div>
          {l.question && <p className="fmt-lede">{displayHeadline(l.question)}</p>}
          <div className="aspect-video relative overflow-hidden" style={{ borderRadius: 14, background: '#111827' }}>
            <iframe
              src={realVideo.embedUrl}
              title={displayHeadline(l.question) || '영상'}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* 직링크 영상(2026-08-20) — S3 등에 직접 올린 mp4(예: Remotion 렌더
          결과). ArticleVideoPlayer(2026-08-21 재설계): 재생/탐색/±5초/반복/
          배속/북마크/음소거/전체화면 전부 실제로 동작한다. 자막 버튼만
          disabled로 남겼다 — 이 파이프라인은 자막 데이터를 만들지 않는다.
          대본 패널은 넣지 않는다(2026-08-21, "대본 기능은 빼줘" 요청) —
          영상은 이미 화면을 보고 있는 상태라 같은 정보를 텍스트로 한 번
          더 보여줄 필요가 없다는 판단(단, 접근성용 스크립트 전문은
          l.transcript가 있을 때 아래에서 별도로 보여준다). */}
      {format === 'video' && directVideoUrl && (
        <ArticleVideoPlayer
          src={directVideoUrl}
          poster={l.thumbnail_url}
          accent={p.color}
          label={p.short}
          kicker="15초 영상 브리핑"
          title={displayHeadline(l.question) || '오늘의 영상'}
          byline={lens.source_url ? '서울경제 원문 기사' : null}
          bylineHref={lens.source_url}
          onDuration={(sec) => noteDur(i, sec)}
          chapters={l.transcript ? podcastScriptParagraphs(l.transcript).map((text) => ({ text })) : undefined}
        />
      )}

      {/* 영상이 아직 없는 기사 — 팟캐스트와 같은 이유로 가짜 플레이어를
          걷어냈다. 남긴 것: 실제로 있는 대본. */}
      {format === 'video' && !hasVideo && (
        <div>
          {l.question && <p className="fmt-lede">{displayHeadline(l.question)}</p>}
          {scriptBullets.length > 0 && (
            <ol className="hang lread">
              {scriptBullets.map((b, bi) => (
                <li key={bi}>
                  <span aria-hidden className="hang-n">
                    {String(bi + 1).padStart(2, '0')}
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* 스크립트 전문(2026-08-23) — 팟캐스트와 같은 이유(접근성). */}
      {format === 'video' && l.transcript && !directVideoUrl && (
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(17,24,39,0.1)' }}>
          <p className="ovl" style={{ marginBottom: 16 }}>
            스크립트 (본문 텍스트)
          </p>
          <div className="lread" style={{ whiteSpace: 'pre-wrap' }}>
            {l.transcript}
          </div>
        </div>
      )}
      {/* 형식 이어 보기 — 이전/다음 형식으로 차례대로 넘긴다(웹툰 끝의 "레터로 더 자세히 읽기"를 모든 형식 공통 이전·다음 이동으로 확장, 2026-10-03). */}
      <FormatStepNav index={i} articleId={lens.id} category={lens.category ?? null} webtoonVariant={format === 'webtoon' ? webtoonVariant(realWebtoonCuts) : undefined} />
    </section>
  );
}
