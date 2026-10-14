import React from "react";
import { Audio, staticFile } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import type { NewsScript } from "../lib/schema";
import { paperSpot, paperText, toPaperScenes } from "./convert";
import { SceneShell } from "./parts";
import { Board, CutHeadline, EndCardView, NewsFront, PaperBeforeAfter, PhotoScene, StampDoc, StampNumber, Timeline, TornBars } from "./scenes";
import { ensurePaperFonts, type SpotName } from "./theme";
import { TRANSITIONS, type TransitionName } from "./transitions";
import type { PaperScene } from "./types";

// 종이 질감 컴포지션 — 사이트 각본(NewsScript)을 convert.ts로 장면 목록으로 바꿔, 전달받은 템플릿의
// 화면 부품으로 그린다. 컷 길이는 TTS 음성 길이(+쉬는 시간)를 따르고 컷마다 나레이션 음성을 튼다.

const END_CARD_FRAMES = 90;
const END_CARD_TRANSITION: TransitionName = "tear";

const brandTagline = (brand: string) => brand.split("|")[0].trim() || "같은 뉴스, 네 가지 시선";

const hasEndCard = (script: NewsScript) => script.design?.endCard !== false;

/** 전환 구간만큼 앞뒤 장면이 겹치므로 그만큼 뺀 전체 길이. */
export const paperDurationInFrames = (script: NewsScript, fps: number): number => {
  const scenes = toPaperScenes(script, fps);
  const sceneFrames = scenes.reduce((acc, s) => acc + s.frames, 0);
  const overlaps = scenes.slice(1).reduce((acc, s) => acc + TRANSITIONS[s.transitionIn].frames, 0);
  const end = hasEndCard(script) ? END_CARD_FRAMES - TRANSITIONS[END_CARD_TRANSITION].frames : 0;
  return sceneFrames - overlaps + end;
};

const audioSrc = (file: string) => (file.startsWith("http") ? file : staticFile(file));

const SceneView: React.FC<{ scene: PaperScene; spot: SpotName; keyword?: { label: string; asOf: string } }> = ({ scene, spot, keyword }) => {
  const { visual, caption, emphasis, emStyle, line, source, paper } = scene;
  const shell = { paper, spot, keyword, line, source };
  const cap = { caption, emphasis, emStyle };
  switch (visual.type) {
    case "newsFront":
      return (
        <SceneShell {...shell}>
          <NewsFront headline={visual.headline} caption={caption} emphasis={emphasis} icon={visual.icon} numberNote={visual.numberNote} photo={visual.photo} />
        </SceneShell>
      );
    case "stampNumber":
      return (
        <SceneShell {...shell}>
          <StampNumber kicker={visual.kicker} number={visual.number} note={visual.note} tag={visual.tag} photo={visual.photo} />
        </SceneShell>
      );
    case "stampDoc":
      return (
        <SceneShell {...shell}>
          <StampDoc stamp={visual.stamp} docTitle={visual.docTitle} caption={caption} emphasis={emphasis} />
        </SceneShell>
      );
    case "beforeAfter":
      return (
        <SceneShell {...shell}>
          <PaperBeforeAfter before={visual.before} after={visual.after} direction={visual.direction} {...cap} />
        </SceneShell>
      );
    case "board":
      return (
        <SceneShell {...shell}>
          <Board nodes={visual.nodes} {...cap} />
        </SceneShell>
      );
    case "timeline":
      return (
        <SceneShell {...shell}>
          <Timeline nodes={visual.nodes} {...cap} />
        </SceneShell>
      );
    case "headline":
      return (
        <SceneShell {...shell}>
          <CutHeadline {...cap} sub={visual.sub} underline={visual.underline} serif={false} slow={visual.underline} />
        </SceneShell>
      );
    case "bars":
      return (
        <SceneShell {...shell}>
          <TornBars bars={visual.bars} {...cap} />
        </SceneShell>
      );
    case "photo":
      return (
        <SceneShell {...shell}>
          <PhotoScene photo={visual.photo} {...cap} />
        </SceneShell>
      );
  }
};

export const PaperVideo: React.FC<{ script: NewsScript }> = ({ script }) => {
  const fps = 30;
  ensurePaperFonts(paperText(script));
  const scenes = toPaperScenes(script, fps);
  const spot = paperSpot(script);
  const keyword = script.keyword ? { label: script.keyword, asOf: script.asOfDate ?? "" } : undefined;
  return (
    <TransitionSeries>
      {scenes.map((scene, i) => {
        const t = TRANSITIONS[scene.transitionIn];
        return (
          <React.Fragment key={i}>
            {i > 0 && <TransitionSeries.Transition presentation={t.presentation()} timing={linearTiming({ durationInFrames: t.frames })} />}
            <TransitionSeries.Sequence durationInFrames={scene.frames}>
              {scene.audioFile ? <Audio src={audioSrc(scene.audioFile)} /> : null}
              <SceneView scene={scene} spot={spot} keyword={keyword} />
            </TransitionSeries.Sequence>
          </React.Fragment>
        );
      })}
      {hasEndCard(script) && (
        <>
          <TransitionSeries.Transition
            presentation={TRANSITIONS[END_CARD_TRANSITION].presentation()}
            timing={linearTiming({ durationInFrames: TRANSITIONS[END_CARD_TRANSITION].frames })}
          />
          <TransitionSeries.Sequence durationInFrames={END_CARD_FRAMES}>
            <SceneShell paper="black" spot={spot} line="">
              <EndCardView title="AILENS" tagline={brandTagline(script.brand)} source={script.source} />
            </SceneShell>
          </TransitionSeries.Sequence>
        </>
      )}
    </TransitionSeries>
  );
};
