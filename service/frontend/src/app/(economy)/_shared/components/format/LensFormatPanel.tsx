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

// 4개 포맷(레터/웹툰/팟캐스트/영상) 중 하나의 시선 패널.
// 4개 패널은 모두 hidden={!on}(CSS로만 숨김, 언마운트 아님)으로 한 페이지에 동시에 존재한다. SEO 때문이며, page.tsx의 NewsArticle articleBody/mainEntity가 4개 시선 전체를 인용해야 한다.
// 오디오·영상 플레이어도 hidden 여부와 무관하게 항상 렌더한다. 탭 바(FormatPicker)가 4개 형식의 분량을 미리 보여줘야 하므로
// 보이지 않는 패널의 플레이어도 메타데이터(길이)만 읽어 onDuration으로 보고한다(preload="metadata", 재생은 사용자 조작 시 시작).
// 오디오·영상은 실측 재생시간·탐색바·배속을 갖춘 ArticleAudioPlayer/ArticleVideoPlayer를 쓴다.
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
  /** 직전 이동 방향(-1/0/+1) — 인디케이터와 본문 진입 방향(swap-fwd/swap-back)을 맞추는 데만 쓴다. */
  dir: number;
  onPanelTouchStart?: (e: ReactTouchEvent) => void;
  onPanelTouchEnd?: (e: ReactTouchEvent, i: number) => void;
  /** 실측 오디오·영상 길이(초) 보고 — 부모가 FormatPicker의 분량 표기에 쓴다. */
  noteDur: (i: number, sec: number) => void;
}) {
  const p = lensPerspectiveAt(i);
  const on = i === active;
  const format = lensFormatAt(i);
  // 웹툰·팟캐스트·영상은 데모 스크립트 오버라이드(특정 기사 하드코딩)가 있으면 그것을, 없으면 admin이 채운 CMS 불릿을 쓴다.
  const scriptBullets =
    format === 'webtoon' || format === 'podcast' || format === 'video'
      ? articleFormatSample(lens.id, format) ?? l.bullets
      : l.bullets;
  // 팟캐스트 대본 폴백 — CMS 팟캐스트 슬롯(l.bullets)에는 짧은 핵심 요약(3~5줄)만 저장되고 실제 음성 대본 텍스트는 없다.
  // 없는 문장을 지어내지 않기 위해 같은 기사의 가장 긴 완결 산문인 레터 포맷 전체 문단(lenses[0])을 대신 보여준다.
  const letterFullText =
    articleFormatSample(lens.id, 'letter') ??
    ((lens.lenses ?? [])[0]?.paragraphs && (lens.lenses ?? [])[0].paragraphs!.length > 0
      ? (lens.lenses ?? [])[0].paragraphs
      : null);
  const podcastScript =
    format === 'podcast' && letterFullText && letterFullText.length > 0 ? letterFullText : scriptBullets;
  // 플레이어 대본 패널의 문단 — 실제 음성 원고(transcript)가 있으면 그것을 쓰고, 없는 글만 레터/요약 폴백을 쓴다.
  const podcastChapters =
    format === 'podcast' ? (l.transcript ? podcastScriptParagraphs(l.transcript) : podcastScript) : [];
  // 레터 본문 — 데모 오버라이드 → admin이 채운 paragraphs → 불릿 목록(letterParagraphs가 null일 때) 순으로 폴백한다.
  const letterParagraphs =
    format === 'letter'
      ? (articleFormatSample(lens.id, 'letter') ??
         (l.paragraphs && l.paragraphs.length > 0 ? l.paragraphs : null))
      : null;
  // 웹툰 표지 헤드라인 — 오버라이드가 있으면 그 표지 문구를,
  // 없으면 CMS 질문(l.question)을 그대로 쓴다.
  const webtoonHeadline =
    format === 'webtoon' ? ARTICLE_FORMAT_SAMPLES[lens.id]?.webtoonHeadline ?? l.question : l.question;
  // 실제 미디어 보유 여부 — 있으면 정적 목업 대신 실제 콘텐츠를 그린다. 유튜브·네이버TV 판별은 /video 페이지와 같은 resolveVideo를 재사용한다.
  const realWebtoonCuts = format === 'webtoon' && l.images && l.images.length > 0 ? l.images : null;
  const realVideo = format === 'video' && l.video_url ? resolveVideo(l.video_url) : null;
  const realPodcast = format === 'podcast' && l.media_url ? resolveVideo(l.media_url) : null;
  // 유튜브·네이버TV가 아닌 직링크(S3 등의 mp4/mp3). resolveVideo()는 두 플랫폼만 인식해 null을 돌려주므로, URL은 있는데 매칭되지 않을 때만 직접 재생한다.
  const directVideoUrl = format === 'video' && l.video_url && !realVideo ? l.video_url : null;
  const directPodcastUrl = format === 'podcast' && l.media_url && !realPodcast ? l.media_url : null;
  const hasPodcast = Boolean(realPodcast || directPodcastUrl);
  const hasVideo = Boolean(realVideo || directVideoUrl);

  // 준비되지 않은 형식의 안내 — 탭의 "준비 중" 표기를 보완해 대신 무엇이 있는지 알린다. 형식 이름·분량은 탭에 있으므로 반복하지 않는다.
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
      {/* 패널 제목줄은 두지 않는다. 형식 이름·분량은 sticky 탭이 보여 준다. 남은 것은 "준비 중"일 때의 안내 한 줄뿐이다. */}
      {note && <p className="fmt-note">{note}</p>}

      {/* 질문 — 네 형식의 첫 줄 크기를 통일한다. 탭을 옮길 때 크기가 바뀌면 다른 페이지처럼 느껴진다. */}
      {/* 맨 위 제목과 똑같은 문장이 탭 바로 아래에 한 번 더 나와 반복돼 보여서 눈에는 숨긴다(스크린리더·구조는 유지). */}
      {format === 'letter' && l.question && (
        <p className="fmt-lede" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          {displayHeadline(l.question)}
        </p>
      )}

      {/* 레터 본문 — 편집 지면 톤(읽기 폭 620px 상한 + 첫 문단 리드인 + 문단 간격 24px). 문체는 AI LENS 편집장 프롬프트 가이드(-했어요체, 문단당 2~3문장)를 따른다.
          article[data-letter-body]로 감싸는 이유 — SentenceSelectionPopover가 이 안에서만 selection을 인정한다(letters/[id] 페이지와 동일). */}
      {format === 'letter' && letterParagraphs && (
        <article data-letter-body>
          <div className="lread" style={{ ['--lc' as string]: READING_ACCENT } as CSSProperties}>
            {/* 본문 블록 렌더 — parseLetterBlocks가 소제목·목록·인용·구분선을 읽어 풀어 주므로 프롬프트 출력 형식이 바뀌어도 기호가 그대로 노출되지 않는다.
                소제목 id는 오른쪽 구간 목차의 앵커이다. */}
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
            {/* 레터 사인오프 — 얇은 룰 + 형식 색 마크 + 발신인 라벨로 뉴스레터 서명처럼 마무리한다. */}
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

      {/* 불릿에 라벨을 붙여 질문과의 관계를 명시한다. 데모 문단 오버라이드가 없는 기사는 CMS 불릿을 그대로 쓴다. */}
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

      {/* 실제 웹툰 컷 — admin이 WebtoonPanelsEditor로 올린 이미지+캡션이 있으면 목업 캐러셀 대신 실제 컷을 보여 준다.
          컷 이어붙임 렌더와 완주율 계측은 WebtoonCutGallery가 담당한다. */}
      {format === 'webtoon' && realWebtoonCuts && <WebtoonCutGallery cuts={realWebtoonCuts} articleId={lens.id} category={lens.category ?? null} />}

      {/* 대사 전문 — 컷 안 말풍선의 대사를 접어서 한 번 더 보여 준다(소리를 못 듣거나 이미지가 안 뜨는 경우, 인용 목적). hidden으로만 감춰 DOM에는 항상 있다. */}
      {/* 대사 전문 텍스트 — 컷 안 글자는 이미지라 검색엔진·AI·스크린리더가 읽지 못하므로 같은 대사를 텍스트로 DOM에 둔다(시각적으로만 숨김, sr-only). */}
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

      {/* 실제 팟캐스트 미디어 — admin이 YouTube 등 링크를 채운 경우 실제 플레이어를 임베드한다. */}
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

      {/* 직링크 오디오(S3 등의 mp3) — ArticleAudioPlayer는 탐색 가능한 진행바·현재/전체 길이·15초 뒤로·배속을 제공한다. 네이티브 <audio controls>는 브라우저마다 UI가 달라 쓰지 않는다.
          chapters는 실측 타임코드가 없어 seek 불가능한 "읽는 대본"으로만 전달한다. */}
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

      {/* 음성이 없는 기사 — 가짜 재생 버튼·진행바·길이를 두지 않고 실제로 존재하는 것(대본)만 보여 준다. */}
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

      {/* 스크립트 전문 — 접근성(청각장애인) 용도의 텍스트이며 타임스탬프 동기화는 없다. 파이프라인이 채운 값이 있을 때만 표시된다.
          ArticleAudioPlayer의 chapters는 짧은 요약 3~5줄뿐이라 전체 원고는 별도로 둔다. */}
      {/* 재생기가 있으면 그 안의 대본 패널이 이 원고를 보여 주므로 아래에 또 두지 않는다. 음성이 없는 글만 이 단독 대본을 쓴다. */}
      {format === 'podcast' && l.transcript && !directPodcastUrl && (
        <PodcastTranscript text={l.transcript} />
      )}

      {/* 실제 영상 — admin이 YouTube 등 링크를 채운 경우 실제 플레이어를 임베드한다. */}
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

      {/* 직링크 영상(S3 등의 mp4, 예: Remotion 렌더 결과) — ArticleVideoPlayer는 재생/탐색/±5초/반복/배속/북마크/음소거/전체화면을 지원한다.
          자막 버튼은 이 파이프라인이 자막 데이터를 만들지 않아 disabled로 둔다.
          대본 패널은 두지 않는다. 영상은 화면을 보고 있어 같은 정보를 텍스트로 반복할 필요가 없다(접근성용 스크립트 전문은 l.transcript가 있을 때 아래에서 별도 표시). */}
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

      {/* 영상이 없는 기사 — 팟캐스트와 같은 이유로 가짜 플레이어를 두지 않고 실제 대본만 남긴다. */}
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

      {/* 스크립트 전문 — 팟캐스트와 같은 이유(접근성). */}
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
      {/* 형식 이어 보기 — 이전/다음 형식으로 차례대로 넘긴다. */}
      <FormatStepNav index={i} articleId={lens.id} category={lens.category ?? null} webtoonVariant={format === 'webtoon' ? webtoonVariant(realWebtoonCuts) : undefined} />
    </section>
  );
}
